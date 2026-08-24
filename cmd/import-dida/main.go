// import-dida imports a TickTick (滴答清单) CSV backup into todos.
//
// Usage:
//   go run ./cmd/import-dida -file tmp/dida/Dida-backup.csv -username tom
//
// Mapping:
//   Status:  0 → pending, 2 → done (Completed Time kept), -1 (abandoned) → skipped
//   Priority: 5 → high, 3 → normal, else → low
//   List Name → a tag on every task from that list
//   Tags column → tags (comma-separated names)
//   Start/Due Date, Created/Completed Time → parsed as-is
//   parentId/taskId → resolved to the new ParentID after all rows exist
package main

import (
	"encoding/csv"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/database"
	"gorm.io/gorm"
)

type didaRow struct {
	listName    string
	title       string
	tags        string
	content     string
	startDate   string
	dueDate     string
	priority    string
	status      string
	createdTime string
	doneTime    string
	order       string
	taskID      string
	parentID    string
}

func parseTime(s string) *time.Time {
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

func main() {
	file := flag.String("file", "tmp/dida/Dida-backup.csv", "path to the Dida/TickTick CSV backup")
	username := flag.String("username", "tom", "target user")
	dryRun := flag.Bool("dry-run", false, "parse and report counts without writing")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	db, err := database.Init(&cfg.Database)
	if err != nil {
		log.Fatalf("init database: %v", err)
	}

	var user model.User
	if err := db.Where("username = ?", *username).First(&user).Error; err != nil {
		log.Fatalf("user %q not found: %v", *username, err)
	}
	var workspace model.Workspace
	if err := db.Where("owner_id = ?", user.ID).Order("created_at ASC").First(&workspace).Error; err != nil {
		log.Fatalf("workspace not found: %v", err)
	}

	f, err := os.Open(*file)
	if err != nil {
		log.Fatalf("open csv: %v", err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	records, err := r.ReadAll()
	if err != nil {
		log.Fatalf("read csv: %v", err)
	}

	// Skip the meta header lines ("Date:", "Version:", "Status:") before the real header row.
	header := -1
	for i, row := range records {
		if len(row) > 1 && row[0] == "Folder Name" {
			header = i
			break
		}
	}
	if header < 0 {
		log.Fatal("header row not found in CSV")
	}
	col := map[string]int{}
	for i, name := range records[header] {
		col[name] = i
	}
	get := func(row []string, name string) string {
		if i, ok := col[name]; ok && i < len(row) {
			return strings.TrimSpace(row[i])
		}
		return ""
	}

	var rows []didaRow
	skipped, badTime := 0, 0
	for _, rec := range records[header+1:] {
		if len(rec) < 5 || get(rec, "Title") == "" {
			continue
		}
		status := get(rec, "Status")
		if status == "-1" { // abandoned
			skipped++
			continue
		}
		rows = append(rows, didaRow{
			listName:    get(rec, "List Name"),
			title:       get(rec, "Title"),
			tags:        get(rec, "Tags"),
			content:     get(rec, "Content"),
			startDate:   get(rec, "Start Date"),
			dueDate:     get(rec, "Due Date"),
			priority:    get(rec, "Priority"),
			status:      status,
			createdTime: get(rec, "Created Time"),
			doneTime:    get(rec, "Completed Time"),
			order:       get(rec, "Order"),
			taskID:      get(rec, "taskId"),
			parentID:    get(rec, "parentId"),
		})
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

	// Pre-create all referenced tags (list names + explicit tags).
	tagNames := map[string]bool{}
	tagByName := map[string]model.Tag{}
	for _, row := range rows {
		for _, n := range strings.Split(row.tags, ",") {
			if n = strings.TrimSpace(n); n != "" {
				tagNames[n] = true
			}
		}
		if row.listName != "" {
			tagNames[row.listName] = true
		}
	}

	var pending, done int
	type created struct {
		row  didaRow
		todo model.Todo
	}
	var all []created

	if *dryRun {
		for _, row := range rows {
			if row.status == "2" {
				done++
			} else {
				pending++
			}
		}
		fmt.Printf("dry run: %d tasks (%d pending, %d done), %d abandoned skipped, %d distinct tags, %d unparseable times\n",
			len(rows), pending, done, skipped, len(tagNames), badTime)
		return
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		for name := range tagNames {
			var tag model.Tag
			if err := tx.Where("user_id = ? AND name = ?", user.ID, name).FirstOrCreate(&tag, model.Tag{UserID: user.ID, Name: name}).Error; err != nil {
				return err
			}
			tagByName[name] = tag
		}
		tagsFor := func(row didaRow) []model.Tag {
			var out []model.Tag
			seen := map[uint]bool{}
			add := func(n string) {
				n = strings.TrimSpace(n)
				if n == "" {
					return
				}
				if t, ok := tagByName[n]; ok && !seen[t.ID] {
					seen[t.ID] = true
					out = append(out, t)
				}
			}
			for _, n := range strings.Split(row.tags, ",") {
				add(n)
			}
			add(row.listName)
			return out
		}

		didaIDToTodo := map[string]uint{}
		for _, row := range rows {
			status := "pending"
			var completedAt *time.Time
			if row.status == "2" {
				status = "done"
				completedAt = parseTime(row.doneTime)
				if completedAt == nil && row.doneTime != "" {
					badTime++
				}
			}
			createdAt := parseTime(row.createdTime)
			sortOrder := 0
			if v, err := strconv.ParseInt(row.order, 10, 64); err == nil {
				sortOrder = int(v)
			}
			if row.status == "2" {
				done++
			} else {
				pending++
			}
			todo := model.Todo{
				UserID:      user.ID,
				WorkspaceID: workspace.ID,
				Title:       row.title,
				Description: row.content,
				Status:      status,
				Priority:    mapPriority(row.priority),
				StartTime:   parseTime(row.startDate),
				DueTime:     parseTime(row.dueDate),
				Tags:        tagsFor(row),
				SortOrder:   sortOrder,
				CompletedAt: completedAt,
			}
			if err := tx.Create(&todo).Error; err != nil {
				return fmt.Errorf("create %q: %w", row.title, err)
			}
			if createdAt != nil {
				if err := tx.Model(&model.Todo{}).Where("id = ?", todo.ID).Update("created_at", *createdAt).Error; err != nil {
					return err
				}
			}
			if row.taskID != "" {
				didaIDToTodo[row.taskID] = todo.ID
			}
			all = append(all, created{row, todo})
		}

		// Second pass: link parent/child now that all IDs exist.
		var linked, orphan int
		for _, c := range all {
			if c.row.parentID == "" {
				continue
			}
			parentTodoID, ok := didaIDToTodo[c.row.parentID]
			if !ok {
				orphan++ // parent was abandoned and skipped
				continue
			}
			if err := tx.Model(&model.Todo{}).Where("id = ?", c.todo.ID).Update("parent_id", parentTodoID).Error; err != nil {
				return err
			}
			linked++
		}
		fmt.Printf("parent links: %d linked, %d orphans (parent skipped as abandoned)\n", linked, orphan)
		return nil
	})
	if err != nil {
		log.Fatalf("import failed (transaction rolled back): %v", err)
	}
	fmt.Printf("imported %d tasks into user %q workspace %q: %d pending, %d done, %d abandoned skipped, %d tags, %d unparseable times\n",
		len(rows), user.Username, workspace.Name, pending, done, skipped, len(tagByName), badTime)
}
