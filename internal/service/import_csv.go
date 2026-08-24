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

// Per-module CSV imports with header-name mapping and dedup: each module skips
// rows whose dedup key already exists in the workspace (or earlier in the same
// file) and counts them in ImportStats.Skipped.

// csvTable is a parsed CSV: rows plus a header-name → column-index map
// (case-insensitive, trimmed).
type csvTable struct {
	rows  [][]string
	col   map[string]int
	field func(row []string, name string) string
}

func parseCSVTable(csvString string) (*csvTable, error) {
	r := csv.NewReader(strings.NewReader(csvString))
	r.FieldsPerRecord = -1 // tolerate ragged rows
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("parse csv: %w", err)
	}
	if len(rows) == 0 {
		return nil, nil
	}
	col := make(map[string]int, len(rows[0]))
	for i, h := range rows[0] {
		col[strings.TrimSpace(strings.ToLower(h))] = i
	}
	t := &csvTable{rows: rows, col: col}
	t.field = func(row []string, name string) string {
		i, ok := col[name]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}
	return t, nil
}

func csvTime(s string) *time.Time {
	if s == "" {
		return nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return &t
	}
	return nil
}

func csvIntPtr(s string) *int {
	if s == "" {
		return nil
	}
	if v, err := strconv.Atoi(s); err == nil {
		return &v
	}
	return nil
}

func csvFloatPtr(s string) *float64 {
	if s == "" {
		return nil
	}
	if v, err := strconv.ParseFloat(s, 64); err == nil {
		return &v
	}
	return nil
}

func csvBool(s string, def bool) bool {
	if s == "" {
		return def
	}
	if b, err := strconv.ParseBool(s); err == nil {
		return b
	}
	return def
}

// contactNameToID maps lowercased contact name → id for name-referencing rows.
func (s *ExportService) contactNameToID(ctx context.Context, workspaceID uint) (map[string]uint, error) {
	contacts, _, err := s.contactRepo.List(ctx, workspaceID, 1, 100000, "", nil)
	if err != nil {
		return nil, err
	}
	m := make(map[string]uint, len(contacts))
	for _, c := range contacts {
		m[strings.ToLower(c.Name)] = c.ID
	}
	return m, nil
}

func (s *ExportService) ImportTagsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	existing, _, err := s.tagRepo.List(ctx, workspaceID, 1, 100000)
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, tg := range existing {
		seen[strings.ToLower(tg.Name)] = true
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		name := t.field(row, "name")
		if name == "" || seen[strings.ToLower(name)] {
			stats.Skipped++
			continue
		}
		if err := s.tagRepo.Create(ctx, &model.Tag{UserID: userID, WorkspaceID: workspaceID, Name: name, Color: t.field(row, "color")}); err != nil {
			stats.Skipped++
			continue
		}
		seen[strings.ToLower(name)] = true
		stats.Imported++
	}
	return stats, nil
}

func (s *ExportService) ImportInteractionsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	nameToID, err := s.contactNameToID(ctx, workspaceID)
	if err != nil {
		return ImportStats{}, err
	}
	existing, err := s.interactionRepo.ListByWorkspace(ctx, workspaceID)
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, i := range existing {
		seen[strings.ToLower(i.Title)+"|"+i.OccurredAt.Format(time.RFC3339)] = true
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		contactID, ok := nameToID[strings.ToLower(t.field(row, "contact"))]
		title := t.field(row, "title")
		occurred := csvTime(t.field(row, "occurred_at"))
		if !ok || title == "" {
			stats.Skipped++
			continue
		}
		at := time.Now()
		if occurred != nil {
			at = *occurred
		}
		key := strings.ToLower(title) + "|" + at.Format(time.RFC3339)
		if seen[key] {
			stats.Skipped++
			continue
		}
		i := &model.Interaction{
			UserID: userID, WorkspaceID: workspaceID, ContactID: contactID,
			Type: model.InteractionType(t.field(row, "type")), Title: title,
			Content: t.field(row, "content"), OccurredAt: at,
		}
		if err := s.interactionRepo.Create(ctx, i); err != nil {
			stats.Skipped++
			continue
		}
		seen[key] = true
		stats.Imported++
	}
	return stats, nil
}

func (s *ExportService) ImportRelationsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	nameToID, err := s.contactNameToID(ctx, workspaceID)
	if err != nil {
		return ImportStats{}, err
	}
	existing, err := s.relationRepo.GetAllByWorkspace(ctx, workspaceID)
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, r := range existing {
		seen[relationKey(r.ContactIDA, r.ContactIDB, r.RelationType)] = true
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		a, okA := nameToID[strings.ToLower(t.field(row, "contact_a"))]
		b, okB := nameToID[strings.ToLower(t.field(row, "contact_b"))]
		relType := t.field(row, "relation_type")
		if !okA || !okB || relType == "" {
			stats.Skipped++
			continue
		}
		key := relationKey(a, b, relType)
		if seen[key] {
			stats.Skipped++
			continue
		}
		r := &model.ContactRelation{
			UserID: userID, WorkspaceID: workspaceID,
			ContactIDA: a, ContactIDB: b, RelationType: relType,
		}
		if err := s.relationRepo.Create(ctx, r); err != nil {
			stats.Skipped++
			continue
		}
		seen[key] = true
		stats.Imported++
	}
	return stats, nil
}

func relationKey(a, b uint, relType string) string {
	lo, hi := a, b
	if lo > hi {
		lo, hi = hi, lo
	}
	return fmt.Sprintf("%d-%d-%s", lo, hi, relType)
}

func (s *ExportService) ImportRemindersCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	nameToID, err := s.contactNameToID(ctx, workspaceID)
	if err != nil {
		return ImportStats{}, err
	}
	existing, _, err := s.reminderRepo.List(ctx, workspaceID, "", nil, 1, 100000)
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, r := range existing {
		seen[strings.ToLower(r.Title)+"|"+r.RemindAt.Format(time.RFC3339)] = true
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		title := t.field(row, "title")
		remind := csvTime(t.field(row, "remind_at"))
		if title == "" || remind == nil {
			stats.Skipped++
			continue
		}
		key := strings.ToLower(title) + "|" + remind.Format(time.RFC3339)
		if seen[key] {
			stats.Skipped++
			continue
		}
		r := &model.Reminder{
			UserID: userID, WorkspaceID: workspaceID,
			Title: title, Description: t.field(row, "description"),
			RemindAt: *remind, Status: model.ReminderStatus(t.field(row, "status")),
		}
		if r.Status == "" {
			r.Status = model.ReminderPending
		}
		if cid, ok := nameToID[strings.ToLower(t.field(row, "contact"))]; ok {
			r.ContactID = cid
		}
		if err := s.reminderRepo.Create(ctx, r); err != nil {
			stats.Skipped++
			continue
		}
		seen[key] = true
		stats.Imported++
	}
	return stats, nil
}

func (s *ExportService) ImportEventsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	if s.eventRepo == nil {
		return ImportStats{}, fmt.Errorf("event import not available")
	}
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	nameToID, err := s.contactNameToID(ctx, workspaceID)
	if err != nil {
		return ImportStats{}, err
	}
	existing, _, err := s.eventRepo.List(ctx, workspaceID, 1, 100000, nil, nil, "")
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, ev := range existing {
		seen[strings.ToLower(ev.Title)+"|"+ev.StartTime.Format(time.RFC3339)] = true
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		title := t.field(row, "title")
		start := csvTime(t.field(row, "start_time"))
		if title == "" || start == nil {
			stats.Skipped++
			continue
		}
		key := strings.ToLower(title) + "|" + start.Format(time.RFC3339)
		if seen[key] {
			stats.Skipped++
			continue
		}
		ev := &model.Event{
			UserID: userID, WorkspaceID: workspaceID,
			Title: title, Description: t.field(row, "description"),
			StartTime: *start, EndTime: csvTime(t.field(row, "end_time")),
			Location: t.field(row, "location"), Color: t.field(row, "color"),
		}
		for _, n := range splitSemi(t.field(row, "contacts")) {
			if cid, ok := nameToID[strings.ToLower(n)]; ok {
				ev.ContactIDs = append(ev.ContactIDs, cid)
			}
		}
		if err := s.eventRepo.Create(ctx, ev); err != nil {
			stats.Skipped++
			continue
		}
		seen[key] = true
		stats.Imported++
	}
	return stats, nil
}

func (s *ExportService) ImportWorkoutsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	if s.workoutRepo == nil {
		return ImportStats{}, fmt.Errorf("workout import not available")
	}
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	existing, _, err := s.workoutRepo.List(ctx, workspaceID, model.WorkoutListQuery{Page: 1, PageSize: 100000})
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, w := range existing {
		key := strings.ToLower(w.Name) + "|" + timeToStr(w.ScheduledAt)
		seen[key] = true
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		name := t.field(row, "name")
		if name == "" {
			stats.Skipped++
			continue
		}
		scheduled := csvTime(t.field(row, "scheduled_at"))
		key := strings.ToLower(name) + "|" + timeToStr(scheduled)
		if seen[key] {
			stats.Skipped++
			continue
		}
		wType := t.field(row, "type")
		if wType == "" {
			wType = "other"
		}
		status := t.field(row, "status")
		if status == "" {
			status = model.WorkoutStatusPlanned
		}
		w := &model.Workout{
			UserID: userID, WorkspaceID: workspaceID,
			Name: name, Type: wType, Status: status, Intensity: t.field(row, "intensity"),
			ScheduledAt: scheduled, DurationMin: csvIntPtr(t.field(row, "duration_min")),
			Calories: csvFloatPtr(t.field(row, "calories")), Color: t.field(row, "color"),
			Location: t.field(row, "location"), Notes: t.field(row, "notes"),
			CompletedAt: csvTime(t.field(row, "completed_at")),
		}
		var exercises []model.WorkoutExercise
		for i, cell := range splitSemi(t.field(row, "exercises")) {
			if ex := parseExerciseCell(cell); ex != nil {
				ex.SortOrder = i
				exercises = append(exercises, *ex)
			}
		}
		if err := s.workoutRepo.CreateWithExercises(ctx, w, exercises); err != nil {
			stats.Skipped++
			continue
		}
		seen[key] = true
		stats.Imported++
	}
	return stats, nil
}

// parseExerciseCell parses "name|category|sets|reps|weight|distance|duration_sec|rest_sec|done".
func parseExerciseCell(cell string) *model.WorkoutExercise {
	parts := strings.Split(cell, "|")
	if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
		return nil
	}
	get := func(i int) string {
		if i < len(parts) {
			return strings.TrimSpace(parts[i])
		}
		return ""
	}
	done := false
	if len(parts) >= 9 {
		done = csvBool(get(8), false)
	}
	return &model.WorkoutExercise{
		Name:        get(0),
		Category:    get(1),
		Sets:        csvIntPtr(get(2)),
		Reps:        csvIntPtr(get(3)),
		Weight:      csvFloatPtr(get(4)),
		Distance:    csvFloatPtr(get(5)),
		DurationSec: csvIntPtr(get(6)),
		RestSec:     csvIntPtr(get(7)),
		Done:        done,
	}
}

func (s *ExportService) ImportBodyMetricsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	if s.bodyMetricRepo == nil {
		return ImportStats{}, fmt.Errorf("body metric import not available")
	}
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	existing, _, err := s.bodyMetricRepo.List(ctx, workspaceID, model.BodyMetricListQuery{Page: 1, PageSize: 100000})
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, m := range existing {
		seen[m.RecordedAt.Format(time.RFC3339)] = true
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		recorded := csvTime(t.field(row, "recorded_at"))
		if recorded == nil || seen[recorded.Format(time.RFC3339)] {
			stats.Skipped++
			continue
		}
		m := &model.BodyMetric{
			UserID: userID, WorkspaceID: workspaceID, RecordedAt: *recorded,
			Weight: csvFloatPtr(t.field(row, "weight")),
			Height: csvFloatPtr(t.field(row, "height")),
			BodyFat: csvFloatPtr(t.field(row, "body_fat")),
			MuscleMass: csvFloatPtr(t.field(row, "muscle_mass")),
			RestingHR: csvIntPtr(t.field(row, "resting_hr")),
			Systolic: csvIntPtr(t.field(row, "systolic")),
			Diastolic: csvIntPtr(t.field(row, "diastolic")),
			SleepHours: csvFloatPtr(t.field(row, "sleep_hours")),
			Steps: csvIntPtr(t.field(row, "steps")),
			Energy: csvIntPtr(t.field(row, "energy")),
			Mood: csvIntPtr(t.field(row, "mood")),
			Notes: t.field(row, "notes"),
		}
		if err := s.bodyMetricRepo.Create(ctx, m); err != nil {
			stats.Skipped++
			continue
		}
		seen[recorded.Format(time.RFC3339)] = true
		stats.Imported++
	}
	return stats, nil
}

func (s *ExportService) ImportHabitsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	if s.habitRepo == nil {
		return ImportStats{}, fmt.Errorf("habit import not available")
	}
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	existing, err := s.habitRepo.List(ctx, workspaceID, true)
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, h := range existing {
		seen[strings.ToLower(h.Name)] = true
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		name := t.field(row, "name")
		if name == "" || seen[strings.ToLower(name)] {
			stats.Skipped++
			continue
		}
		freq := t.field(row, "frequency")
		if freq == "" {
			freq = "daily"
		}
		h := &model.Habit{
			UserID: userID, WorkspaceID: workspaceID,
			Name: name, Color: t.field(row, "color"), Emoji: t.field(row, "emoji"),
			Frequency: freq, Archived: csvBool(t.field(row, "archived"), false),
		}
		if err := s.habitRepo.Create(ctx, h); err != nil {
			stats.Skipped++
			continue
		}
		seen[strings.ToLower(name)] = true
		if s.habitLogRepo != nil {
			for _, d := range splitSemi(t.field(row, "checkin_dates")) {
				if len(d) == 10 { // 2006-01-02
					_, _ = s.habitLogRepo.Toggle(ctx, userID, workspaceID, h.ID, d)
				}
			}
		}
		stats.Imported++
	}
	return stats, nil
}

func (s *ExportService) ImportPomodorosCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	if s.pomodoroRepo == nil {
		return ImportStats{}, fmt.Errorf("pomodoro import not available")
	}
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	existing, err := s.pomodoroRepo.List(ctx, workspaceID, time.Time{}, time.Now().Add(24*time.Hour))
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, p := range existing {
		seen[pomodoroKey(p)] = true
	}
	todoIDByTitle := make(map[string]uint)
	if todos, _, terr := s.todoRepo.List(ctx, workspaceID, model.TodoListQuery{Page: 1, PageSize: 100000}); terr == nil {
		for _, td := range todos {
			todoIDByTitle[strings.ToLower(td.Title)] = td.ID
		}
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		started := csvTime(t.field(row, "started_at"))
		if started == nil {
			stats.Skipped++
			continue
		}
		kind := t.field(row, "kind")
		if kind != "break" {
			kind = "focus"
		}
		duration := 25 * 60
		if v := csvIntPtr(t.field(row, "duration_seconds")); v != nil && *v > 0 {
			duration = *v
		}
		ended := csvTime(t.field(row, "ended_at"))
		end := started.Add(time.Duration(duration) * time.Second)
		if ended != nil {
			end = *ended
		}
		p := model.PomodoroSession{
			UserID: userID, WorkspaceID: workspaceID,
			DurationSeconds: duration, Kind: kind,
			Completed: csvBool(t.field(row, "completed"), true),
			StartedAt: *started, EndedAt: end,
		}
		if key := pomodoroKey(p); seen[key] {
			stats.Skipped++
			continue
		}
		if title := t.field(row, "todo_title"); title != "" {
			if id, ok := todoIDByTitle[strings.ToLower(title)]; ok {
				p.TodoID = &id
			}
		}
		if err := s.pomodoroRepo.Create(ctx, &p); err != nil {
			stats.Skipped++
			continue
		}
		seen[pomodoroKey(p)] = true
		stats.Imported++
	}
	return stats, nil
}

func pomodoroKey(p model.PomodoroSession) string {
	return fmt.Sprintf("%s-%d-%s", p.Kind, p.DurationSeconds, p.StartedAt.Format(time.RFC3339))
}

func (s *ExportService) ImportFitnessCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	if s.exLibRepo == nil {
		return ImportStats{}, fmt.Errorf("fitness import not available")
	}
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		name := t.field(row, "name")
		if name == "" {
			stats.Skipped++
			continue
		}
		// Library names are unique per workspace (NameExists is the authoritative
		// check — soft-deleted rows also block the unique index).
		if exists, err := s.exLibRepo.NameExists(ctx, workspaceID, name, 0); err == nil && exists {
			stats.Skipped++
			continue
		}
		item := &model.ExerciseLibraryItem{
			UserID: userID, WorkspaceID: workspaceID,
			Name: name, Category: t.field(row, "category"),
			MuscleGroups: splitSemi(t.field(row, "muscle_groups")),
			Equipment: t.field(row, "equipment"), Notes: t.field(row, "notes"),
		}
		if err := s.exLibRepo.Create(ctx, item); err != nil {
			stats.Skipped++
			continue
		}
		stats.Imported++
	}
	return stats, nil
}
