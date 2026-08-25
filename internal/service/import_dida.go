package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

// TodoImportResult reports the outcome of an external-platform todo import.
type TodoImportResult struct {
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
}

// externalTodo is the normalized shape every platform parser produces. Field
// semantics follow model.Todo; TagNames are resolved to tags on import.
type externalTodo struct {
	Title       string
	Description string
	Status      string // pending / done / abandoned
	Priority    string // low / normal / high
	StartTime   *time.Time
	DueTime     *time.Time
	CompletedAt *time.Time
	CreatedAt   *time.Time
	SortOrder   int
	TagNames    []string
	ExternalID  string // platform-stable id, used to link parent/child
	ParentExtID string
}

// todoImporter parses a full CSV export from an external platform into
// normalized todos. Rows whose parent was skipped must still be returned
// (they import as top-level tasks).
type todoImporter func(csvString string) ([]externalTodo, int, error)

// todoImporters registers the supported import platforms. Add new platforms
// (TickTick variants, Todoist, Microsoft To Do …) by registering a parser here.
var todoImporters = map[string]todoImporter{
	"dida": parseDidaCSV,
}

// ImportTodosFromPlatform imports a CSV backup from an external platform
// ("dida" = 滴答清单). Tags are created on demand; the platform's list name and
// tag column both become tags. Parent/child links are restored via the
// platform's own task ids after all rows exist.
func (s *ExportService) ImportTodosFromPlatform(ctx context.Context, userID, workspaceID uint, platform, csvString string) (*TodoImportResult, error) {
	importer, ok := todoImporters[strings.ToLower(strings.TrimSpace(platform))]
	if !ok {
		return nil, fmt.Errorf("unsupported platform %q", platform)
	}
	todos, skipped, err := importer(csvString)
	if err != nil {
		return nil, err
	}

	// Resolve/create tags by name once, up front.
	tagNameToID := make(map[string]uint)
	if len(todos) > 0 {
		// Full tag set: matches the repo's deliberate maxPageSize cap so no
		// existing tag is missed (duplicates would be created otherwise).
		tags, _, err := s.tagRepo.List(ctx, workspaceID, 1, 100000)
		if err != nil {
			return nil, fmt.Errorf("list tags: %w", err)
		}
		for _, t := range tags {
			tagNameToID[t.Name] = t.ID
		}
		for _, et := range todos {
			for _, name := range et.TagNames {
				if _, ok := tagNameToID[name]; ok {
					continue
				}
				tag := &model.Tag{UserID: userID, WorkspaceID: workspaceID, Name: name}
				if err := s.tagRepo.Create(ctx, tag); err != nil {
					return nil, fmt.Errorf("create tag %q: %w", name, err)
				}
				tagNameToID[name] = tag.ID
			}
		}
	}

	imported := 0
	extIDToID := make(map[string]uint, len(todos))
	for _, et := range todos {
		if et.Title == "" {
			skipped++
			continue
		}
		status := et.Status
		if status == "" {
			status = "pending"
		}
		priority := et.Priority
		if priority == "" {
			priority = "normal"
		}
		todo := &model.Todo{
			UserID:      userID,
			WorkspaceID: workspaceID,
			Title:       et.Title,
			Description: et.Description,
			Status:      status,
			Priority:    priority,
			StartTime:   et.StartTime,
			DueTime:     et.DueTime,
			CompletedAt: et.CompletedAt,
			SortOrder:   et.SortOrder,
		}
		if err := s.todoRepo.Create(ctx, todo); err != nil {
			return nil, fmt.Errorf("import %q: %w", et.Title, err)
		}
		// created_at is auto-set by GORM; restore the platform's original date.
		if et.CreatedAt != nil {
			_ = s.todoRepo.UpdateCreatedAt(ctx, todo.ID, *et.CreatedAt)
		}
		if et.ExternalID != "" {
			extIDToID[et.ExternalID] = todo.ID
		}
		tagIDs := make([]uint, 0, len(et.TagNames))
		for _, name := range et.TagNames {
			if id, ok := tagNameToID[name]; ok {
				tagIDs = append(tagIDs, id)
			}
		}
		if len(tagIDs) > 0 {
			tags := make([]model.Tag, 0, len(tagIDs))
			for _, id := range tagIDs {
				tags = append(tags, model.Tag{ID: id})
			}
			_ = s.todoRepo.ReplaceTags(ctx, todo.ID, tags)
		}
		imported++
	}

	// Second pass: link children to parents now that all IDs exist. Children
	// whose parent row was absent or skipped (e.g. empty title) stay top-level.
	for _, et := range todos {
		if et.ParentExtID == "" || et.ExternalID == "" {
			continue
		}
		childID, ok := extIDToID[et.ExternalID]
		if !ok {
			continue
		}
		if parentID, ok := extIDToID[et.ParentExtID]; ok {
			if err := s.todoRepo.SetParent(ctx, workspaceID, childID, &parentID); err != nil {
				return nil, fmt.Errorf("link parent for %q: %w", et.Title, err)
			}
		}
	}

	s.notifyImported(ctx, workspaceID)
	return &TodoImportResult{Imported: imported, Skipped: skipped}, nil
}

// didaParseTime parses the timezone-suffixed timestamps TickTick/Dida emits
// ("2026-05-05T16:00:00+0000").
func didaParseTime(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{"2006-01-02T15:04:05-0700", "2006-01-02T15:04:05Z0700", time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

// parseDidaCSV parses a 滴答清单 (TickTick) CSV backup. The file starts with
// meta lines ("Date:", "Version:", "Status:") before the real header row.
// Status: 0 → pending, 2 → done, -1 → abandoned. Priority: 5 → high,
// 3 → normal, else → low. List name and Tags column both become tag names.
func parseDidaCSV(csvString string) ([]externalTodo, int, error) {
	r := csv.NewReader(strings.NewReader(csvString))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	rows, err := r.ReadAll()
	if err != nil {
		return nil, 0, fmt.Errorf("parse csv: %w", err)
	}
	header := -1
	for i, row := range rows {
		if len(row) > 1 && row[0] == "Folder Name" {
			header = i
			break
		}
	}
	if header < 0 {
		return nil, 0, fmt.Errorf("dida header row not found")
	}
	col := make(map[string]int, len(rows[header]))
	for i, h := range rows[header] {
		col[strings.TrimSpace(h)] = i
	}
	field := func(row []string, name string) string {
		i, ok := col[name]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}
	mapPriority := func(p string) string {
		switch p {
		case "5":
			return "high"
		case "3":
			return "normal"
		default:
			return "low"
		}
	}

	var out []externalTodo
	skipped := 0
	for _, rec := range rows[header+1:] {
		if len(rec) < 5 || field(rec, "Title") == "" {
			continue
		}
		status := field(rec, "Status")
		et := externalTodo{
			Title:       field(rec, "Title"),
			Description: field(rec, "Content"),
			Priority:    mapPriority(field(rec, "Priority")),
			StartTime:   didaParseTime(field(rec, "Start Date")),
			DueTime:     didaParseTime(field(rec, "Due Date")),
			CreatedAt:   didaParseTime(field(rec, "Created Time")),
			ExternalID:  field(rec, "taskId"),
			ParentExtID: field(rec, "parentId"),
		}
		switch status {
		case "2":
			et.Status = "done"
			et.CompletedAt = didaParseTime(field(rec, "Completed Time"))
		case "-1":
			et.Status = "abandoned"
		default:
			et.Status = "pending"
		}
		if v, err := strconv.ParseInt(field(rec, "Order"), 10, 64); err == nil {
			et.SortOrder = int(v)
		}
		names := strings.Split(field(rec, "Tags"), ",")
		if ln := field(rec, "List Name"); ln != "" {
			names = append(names, ln)
		}
		for _, n := range names {
			if n = strings.TrimSpace(n); n != "" {
				et.TagNames = append(et.TagNames, n)
			}
		}
		out = append(out, et)
	}
	return out, skipped, nil
}
