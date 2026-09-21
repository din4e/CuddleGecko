package repository

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

// SearchRepo implements cross-entity global search. Every query is a
// case-insensitive substring match (LOWER(...) LIKE — the same semantics as
// the per-module `?q=` filters), scoped to one workspace, soft-delete aware,
// and capped per entity type by `limit`.
type SearchRepo struct {
	db *gorm.DB
}

func NewSearchRepo(db *gorm.DB) *SearchRepo {
	return &SearchRepo{db: db}
}

// Search returns hits for the lowercased query `pattern` across the requested
// entity types (empty slice = all types), at most `limit` hits per type,
// merged and sorted by updated_at desc. Child-table matches (todo subtasks,
// workout exercises, whiteboard nodes) are folded into their parent's hit and
// only fill gaps — a parent that matched directly keeps its richer field info.
func (r *SearchRepo) Search(ctx context.Context, workspaceID uint, pattern string, types []string, limit int) ([]model.SearchHit, error) {
	enabled := make(map[string]bool, len(model.AllSearchTypes))
	if len(types) == 0 {
		for _, t := range model.AllSearchTypes {
			enabled[t] = true
		}
	} else {
		for _, t := range types {
			enabled[t] = true
		}
	}

	query := strings.Trim(pattern, "%")
	var hits []model.SearchHit

	add := func(found []model.SearchHit, err error) error {
		if err != nil {
			return err
		}
		hits = append(hits, found...)
		return nil
	}

	if enabled[model.SearchTypeContact] {
		if err := add(r.searchContacts(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeInteraction] {
		if err := add(r.searchInteractions(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeReminder] {
		if err := add(r.searchReminders(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeEvent] {
		if err := add(r.searchEvents(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeTodo] {
		if err := add(r.searchTodos(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeWorkout] {
		if err := add(r.searchWorkouts(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeTransaction] {
		if err := add(r.searchTransactions(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeHabit] {
		if err := add(r.searchHabits(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeTag] {
		if err := add(r.searchTags(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeBodyMetric] {
		if err := add(r.searchBodyMetrics(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}
	if enabled[model.SearchTypeWhiteboard] {
		if err := add(r.searchWhiteboards(ctx, workspaceID, query, limit)); err != nil {
			return nil, err
		}
	}

	// Newest activity first so an edit anywhere in the app surfaces its row.
	sortHitsByUpdatedDesc(hits)
	return hits, nil
}

func sortHitsByUpdatedDesc(hits []model.SearchHit) {
	for i := 1; i < len(hits); i++ {
		for j := i; j > 0 && hits[j].UpdatedAt.After(hits[j-1].UpdatedAt); j-- {
			hits[j], hits[j-1] = hits[j-1], hits[j]
		}
	}
}

func (r *SearchRepo) searchContacts(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Contact
	err := r.db.WithContext(ctx).
		Where(`workspace_id = ? AND (
			LOWER(name) LIKE ? OR LOWER(nickname) LIKE ? OR LOWER(phone) LIKE ?
			OR LOWER(email) LIKE ? OR LOWER(notes) LIKE ? OR LOWER(relationship_labels) LIKE ?)`,
			workspaceID, pat, pat, pat, pat, pat, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search contacts: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	for i := range rows {
		c := &rows[i]
		fields := make([]string, 0, 6)
		if containsFold(c.Name, query) {
			fields = append(fields, "name")
		}
		if containsFold(c.Nickname, query) {
			fields = append(fields, "nickname")
		}
		if sliceContainsFold(c.Phone, query) {
			fields = append(fields, "phone")
		}
		if sliceContainsFold(c.Email, query) {
			fields = append(fields, "email")
		}
		if containsFold(c.Notes, query) {
			fields = append(fields, "notes")
		}
		if sliceContainsFold(c.RelationshipLabels, query) {
			fields = append(fields, "relationship_labels")
		}

		subtitle := c.Nickname
		if subtitle == "" && len(c.Phone) > 0 {
			subtitle = c.Phone[0]
		}
		if subtitle == "" && len(c.Email) > 0 {
			subtitle = c.Email[0]
		}

		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeContact,
			ID:            c.ID,
			Title:         c.Name,
			Subtitle:      subtitle,
			Snippet:       buildSnippet(c.Notes, query),
			MatchedFields: fields,
			UpdatedAt:     c.UpdatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchInteractions(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Interaction
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)",
			workspaceID, pat, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search interactions: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	for i := range rows {
		in := &rows[i]
		fields := make([]string, 0, 2)
		if containsFold(in.Title, query) {
			fields = append(fields, "title")
		}
		if containsFold(in.Content, query) {
			fields = append(fields, "content")
		}
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeInteraction,
			ID:            in.ID,
			Title:         in.Title,
			Snippet:       buildSnippet(in.Content, query),
			MatchedFields: fields,
			ContactID:     in.ContactID,
			UpdatedAt:     in.UpdatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchReminders(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Reminder
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)",
			workspaceID, pat, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search reminders: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	for i := range rows {
		rm := &rows[i]
		fields := make([]string, 0, 2)
		if containsFold(rm.Title, query) {
			fields = append(fields, "title")
		}
		if containsFold(rm.Description, query) {
			fields = append(fields, "description")
		}
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeReminder,
			ID:            rm.ID,
			Title:         rm.Title,
			Snippet:       buildSnippet(rm.Description, query),
			MatchedFields: fields,
			ContactID:     rm.ContactID,
			UpdatedAt:     rm.UpdatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchEvents(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Event
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(location) LIKE ?)",
			workspaceID, pat, pat, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search events: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	for i := range rows {
		ev := &rows[i]
		fields := make([]string, 0, 3)
		if containsFold(ev.Title, query) {
			fields = append(fields, "title")
		}
		if containsFold(ev.Description, query) {
			fields = append(fields, "description")
		}
		if containsFold(ev.Location, query) {
			fields = append(fields, "location")
		}
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeEvent,
			ID:            ev.ID,
			Title:         ev.Title,
			Subtitle:      ev.Location,
			Snippet:       firstSnippet(query, ev.Description, ev.Location),
			MatchedFields: fields,
			UpdatedAt:     ev.UpdatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchTodos(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Todo
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)",
			workspaceID, pat, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search todos: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	seen := make(map[uint]bool, len(rows))
	for i := range rows {
		td := &rows[i]
		seen[td.ID] = true
		fields := make([]string, 0, 2)
		if containsFold(td.Title, query) {
			fields = append(fields, "title")
		}
		if containsFold(td.Description, query) {
			fields = append(fields, "description")
		}
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeTodo,
			ID:            td.ID,
			Title:         td.Title,
			Snippet:       buildSnippet(td.Description, query),
			MatchedFields: fields,
			UpdatedAt:     td.UpdatedAt,
		})
	}

	// Subtask lines belong to their parent todo in results: a content match
	// surfaces the todo (the navigable unit) with the matched line as snippet.
	// Raw join because todo_items has no workspace column of its own.
	type itemRow struct {
		TodoID    uint
		TodoTitle string
		Content   string
		UpdatedAt time.Time
	}
	var items []itemRow
	err = r.db.WithContext(ctx).
		Table("todo_items AS ti").
		Select("ti.todo_id AS todo_id, ti.content AS content, todos.title AS todo_title, todos.updated_at AS updated_at").
		Joins("JOIN todos ON todos.id = ti.todo_id").
		Where("todos.workspace_id = ? AND todos.deleted_at IS NULL AND ti.deleted_at IS NULL AND LOWER(ti.content) LIKE ?",
			workspaceID, pat).
		Order("updated_at DESC").
		Limit(limit).
		Scan(&items).Error
	if err != nil {
		return nil, fmt.Errorf("search todo items: %w", err)
	}
	for _, it := range items {
		if seen[it.TodoID] {
			continue
		}
		seen[it.TodoID] = true
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeTodo,
			ID:            it.TodoID,
			Title:         it.TodoTitle,
			Snippet:       buildSnippet(it.Content, query),
			MatchedFields: []string{"items"},
			UpdatedAt:     it.UpdatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchWorkouts(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Workout
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND (LOWER(name) LIKE ? OR LOWER(location) LIKE ? OR LOWER(notes) LIKE ?)",
			workspaceID, pat, pat, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search workouts: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	seen := make(map[uint]bool, len(rows))
	for i := range rows {
		w := &rows[i]
		seen[w.ID] = true
		fields := make([]string, 0, 3)
		if containsFold(w.Name, query) {
			fields = append(fields, "name")
		}
		if containsFold(w.Location, query) {
			fields = append(fields, "location")
		}
		if containsFold(w.Notes, query) {
			fields = append(fields, "notes")
		}
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeWorkout,
			ID:            w.ID,
			Title:         w.Name,
			Subtitle:      w.Location,
			Snippet:       firstSnippet(query, w.Notes, w.Location),
			MatchedFields: fields,
			UpdatedAt:     w.UpdatedAt,
		})
	}

	type exerciseRow struct {
		WorkoutID   uint
		WorkoutName string
		Name        string
		Notes       string
		UpdatedAt   time.Time
	}
	var exercises []exerciseRow
	err = r.db.WithContext(ctx).
		Table("workout_exercises AS we").
		Select("we.workout_id AS workout_id, we.name AS name, we.notes AS notes, workouts.name AS workout_name, workouts.updated_at AS updated_at").
		Joins("JOIN workouts ON workouts.id = we.workout_id").
		Where("workouts.workspace_id = ? AND workouts.deleted_at IS NULL AND we.deleted_at IS NULL AND (LOWER(we.name) LIKE ? OR LOWER(we.notes) LIKE ?)",
			workspaceID, pat, pat).
		Order("updated_at DESC").
		Limit(limit).
		Scan(&exercises).Error
	if err != nil {
		return nil, fmt.Errorf("search workout exercises: %w", err)
	}
	for _, ex := range exercises {
		if seen[ex.WorkoutID] {
			continue
		}
		seen[ex.WorkoutID] = true
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeWorkout,
			ID:            ex.WorkoutID,
			Title:         ex.WorkoutName,
			Snippet:       firstSnippet(query, ex.Notes, ex.Name),
			MatchedFields: []string{"exercises"},
			UpdatedAt:     ex.UpdatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchTransactions(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Transaction
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND (LOWER(title) LIKE ? OR LOWER(notes) LIKE ? OR LOWER(category) LIKE ?)",
			workspaceID, pat, pat, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search transactions: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	for i := range rows {
		tx := &rows[i]
		fields := make([]string, 0, 3)
		if containsFold(tx.Title, query) {
			fields = append(fields, "title")
		}
		if containsFold(tx.Notes, query) {
			fields = append(fields, "notes")
		}
		if containsFold(tx.Category, query) {
			fields = append(fields, "category")
		}
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeTransaction,
			ID:            tx.ID,
			Title:         tx.Title,
			Subtitle:      tx.Category,
			Snippet:       buildSnippet(tx.Notes, query),
			MatchedFields: fields,
			UpdatedAt:     tx.UpdatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchHabits(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Habit
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND LOWER(name) LIKE ?", workspaceID, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search habits: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	for i := range rows {
		h := &rows[i]
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeHabit,
			ID:            h.ID,
			Title:         h.Name,
			MatchedFields: []string{"name"},
			UpdatedAt:     h.UpdatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchTags(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Tag
	// Tags carry no UpdatedAt — order and report by CreatedAt.
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND LOWER(name) LIKE ?", workspaceID, pat).
		Order("created_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search tags: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	for i := range rows {
		tg := &rows[i]
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeTag,
			ID:            tg.ID,
			Title:         tg.Name,
			MatchedFields: []string{"name"},
			UpdatedAt:     tg.CreatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchBodyMetrics(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.BodyMetric
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND LOWER(notes) LIKE ?", workspaceID, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search body metrics: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	for i := range rows {
		bm := &rows[i]
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeBodyMetric,
			ID:            bm.ID,
			Title:         bm.RecordedAt.Format("2006-01-02 15:04"),
			Snippet:       buildSnippet(bm.Notes, query),
			MatchedFields: []string{"notes"},
			UpdatedAt:     bm.UpdatedAt,
		})
	}
	return hits, nil
}

func (r *SearchRepo) searchWhiteboards(ctx context.Context, workspaceID uint, query string, limit int) ([]model.SearchHit, error) {
	pat := "%" + query + "%"
	var rows []model.Whiteboard
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND LOWER(name) LIKE ?", workspaceID, pat).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("search whiteboards: %w", err)
	}

	hits := make([]model.SearchHit, 0, len(rows))
	seen := make(map[uint]bool, len(rows))
	for i := range rows {
		wb := &rows[i]
		seen[wb.ID] = true
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeWhiteboard,
			ID:            wb.ID,
			Title:         wb.Name,
			MatchedFields: []string{"name"},
			UpdatedAt:     wb.UpdatedAt,
		})
	}

	type nodeRow struct {
		BoardID   uint
		BoardName string
		Label     string
		Note      string
		UpdatedAt time.Time
	}
	var nodes []nodeRow
	err = r.db.WithContext(ctx).
		Table("whiteboard_nodes AS wn").
		Select("wn.whiteboard_id AS board_id, wn.label AS label, wn.note AS note, whiteboards.name AS board_name, whiteboards.updated_at AS updated_at").
		Joins("JOIN whiteboards ON whiteboards.id = wn.whiteboard_id").
		Where("whiteboards.workspace_id = ? AND whiteboards.deleted_at IS NULL AND wn.deleted_at IS NULL AND (LOWER(wn.label) LIKE ? OR LOWER(wn.note) LIKE ?)",
			workspaceID, pat, pat).
		Order("updated_at DESC").
		Limit(limit).
		Scan(&nodes).Error
	if err != nil {
		return nil, fmt.Errorf("search whiteboard nodes: %w", err)
	}
	for _, nd := range nodes {
		if seen[nd.BoardID] {
			continue
		}
		seen[nd.BoardID] = true
		hits = append(hits, model.SearchHit{
			Type:          model.SearchTypeWhiteboard,
			ID:            nd.BoardID,
			Title:         nd.BoardName,
			Snippet:       firstSnippet(query, nd.Note, nd.Label),
			MatchedFields: []string{"nodes"},
			UpdatedAt:     nd.UpdatedAt,
		})
	}
	return hits, nil
}

// snippetRadius is the rune count of context kept on each side of a match.
const snippetRadius = 48

// buildSnippet returns a short window of text around the first query match,
// rune-safe for CJK content. Falls back to the head of the text when the
// Go-side fold can't find the match the SQL LIKE already found (LOWER() and
// unicode.ToLower disagree on rare code points).
func buildSnippet(text, query string) string {
	runes := []rune(text)
	if len(runes) == 0 {
		return ""
	}
	idx := indexFold(runes, []rune(query))
	if idx < 0 {
		if len(runes) <= 2*snippetRadius {
			return string(runes)
		}
		return string(runes[:2*snippetRadius]) + "…"
	}
	start := idx - snippetRadius
	if start < 0 {
		start = 0
	}
	end := idx + len([]rune(query)) + snippetRadius
	if end > len(runes) {
		end = len(runes)
	}
	var b strings.Builder
	if start > 0 {
		b.WriteString("…")
	}
	b.WriteString(string(runes[start:end]))
	if end < len(runes) {
		b.WriteString("…")
	}
	return b.String()
}

// firstSnippet builds a snippet from the first of the given fields that
// actually contains the query (in priority order), so e.g. an event matching
// only on location doesn't show an empty description snippet.
func firstSnippet(query string, fields ...string) string {
	for _, f := range fields {
		if containsFold(f, query) {
			return buildSnippet(f, query)
		}
	}
	return ""
}

// containsFold reports whether s contains query, ignoring case.
func containsFold(s, query string) bool {
	if query == "" {
		return false
	}
	return indexFold([]rune(s), []rune(query)) >= 0
}

func sliceContainsFold(values []string, query string) bool {
	for _, v := range values {
		if containsFold(v, query) {
			return true
		}
	}
	return false
}

// indexFold finds the first case-insensitive occurrence of needle in
// haystack, comparing rune by rune with unicode.ToLower (safer than lowering
// whole strings, whose rune count can change for a few code points).
func indexFold(haystack, needle []rune) int {
	if len(needle) == 0 || len(needle) > len(haystack) {
		return -1
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := range needle {
			if unicode.ToLower(haystack[i+j]) != unicode.ToLower(needle[j]) {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}
