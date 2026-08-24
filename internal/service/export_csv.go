package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

// This file holds the per-module CSV exporters added for full import/export
// coverage. They follow the established pattern: header-name-driven columns,
// every cell passed through csvSafe, multi-value fields joined by "; ",
// timestamps in RFC3339.

// contactNames returns id→name for all workspace contacts (CSV rows reference
// contacts by name, not id, so files stay meaningful outside the app).
func (s *ExportService) contactNames(ctx context.Context, workspaceID uint) (map[uint]string, error) {
	contacts, _, err := s.contactRepo.List(ctx, workspaceID, 1, 100000, "", nil)
	if err != nil {
		return nil, err
	}
	m := make(map[uint]string, len(contacts))
	for _, c := range contacts {
		m[c.ID] = c.Name
	}
	return m, nil
}

func (s *ExportService) ExportTagsCSV(ctx context.Context, workspaceID uint) (string, error) {
	tags, _, err := s.tagRepo.List(ctx, workspaceID, 1, 100000)
	if err != nil {
		return "", fmt.Errorf("export tags csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"name", "color"})
	for _, t := range tags {
		csvWriteRow(w, []string{t.Name, t.Color})
	}
	w.Flush()
	return buf.String(), nil
}

func (s *ExportService) ExportInteractionsCSV(ctx context.Context, workspaceID uint) (string, error) {
	interactions, err := s.interactionRepo.ListByWorkspace(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("export interactions csv: %w", err)
	}
	names, err := s.contactNames(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("export interactions csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"contact", "type", "title", "content", "occurred_at"})
	for _, i := range interactions {
		csvWriteRow(w, []string{
			names[i.ContactID],
			string(i.Type),
			i.Title,
			i.Content,
			i.OccurredAt.Format(time.RFC3339),
		})
	}
	w.Flush()
	return buf.String(), nil
}

func (s *ExportService) ExportRelationsCSV(ctx context.Context, workspaceID uint) (string, error) {
	relations, err := s.relationRepo.GetAllByWorkspace(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("export relations csv: %w", err)
	}
	names, err := s.contactNames(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("export relations csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"contact_a", "contact_b", "relation_type"})
	for _, r := range relations {
		csvWriteRow(w, []string{names[r.ContactIDA], names[r.ContactIDB], r.RelationType})
	}
	w.Flush()
	return buf.String(), nil
}

func (s *ExportService) ExportRemindersCSV(ctx context.Context, workspaceID uint) (string, error) {
	reminders, _, err := s.reminderRepo.List(ctx, workspaceID, "", nil, 1, 100000)
	if err != nil {
		return "", fmt.Errorf("export reminders csv: %w", err)
	}
	names, err := s.contactNames(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("export reminders csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"title", "description", "remind_at", "status", "contact"})
	for _, r := range reminders {
		contact := ""
		if r.ContactID != 0 {
			contact = names[r.ContactID]
		}
		csvWriteRow(w, []string{r.Title, r.Description, r.RemindAt.Format(time.RFC3339), string(r.Status), contact})
	}
	w.Flush()
	return buf.String(), nil
}

// ExportWorkoutsCSV renders one row per workout with exercises inlined as
// "name|category|sets|reps|weight|distance_sec…" entries joined by "; " — the
// same format ImportWorkoutsCSV parses back.
func (s *ExportService) ExportWorkoutsCSV(ctx context.Context, workspaceID uint) (string, error) {
	if s.workoutRepo == nil {
		return "", fmt.Errorf("workout export not available")
	}
	workouts, _, err := s.workoutRepo.List(ctx, workspaceID, model.WorkoutListQuery{Page: 1, PageSize: 100000})
	if err != nil {
		return "", fmt.Errorf("export workouts csv: %w", err)
	}
	var exercisesByWorkout map[uint][]model.WorkoutExercise
	if s.workoutExRepo != nil {
		wIDs := make([]uint, 0, len(workouts))
		for _, w := range workouts {
			wIDs = append(wIDs, w.ID)
		}
		exs, eerr := s.workoutExRepo.ListExercisesByWorkoutIDs(ctx, wIDs)
		if eerr != nil {
			return "", fmt.Errorf("export workouts csv: %w", eerr)
		}
		exercisesByWorkout = make(map[uint][]model.WorkoutExercise, len(workouts))
		for _, e := range exs {
			exercisesByWorkout[e.WorkoutID] = append(exercisesByWorkout[e.WorkoutID], e)
		}
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"id", "name", "type", "status", "intensity", "scheduled_at", "duration_min", "calories", "color", "location", "notes", "completed_at", "exercises"})
	for _, wk := range workouts {
		exParts := make([]string, 0, len(exercisesByWorkout[wk.ID]))
		for _, e := range exercisesByWorkout[wk.ID] {
			exParts = append(exParts, exerciseCell(&e))
		}
		csvWriteRow(w, []string{
			strconv.FormatUint(uint64(wk.ID), 10),
			wk.Name, wk.Type, wk.Status, wk.Intensity,
			timeToStr(wk.ScheduledAt), intPtrToStr(wk.DurationMin), floatPtrToStr(wk.Calories),
			wk.Color, wk.Location, wk.Notes, timeToStr(wk.CompletedAt),
			strings.Join(exParts, "; "),
		})
	}
	w.Flush()
	return buf.String(), nil
}

// exerciseCell renders one exercise as a pipe-delimited cell
// name|category|sets|reps|weight|distance|duration_sec|rest_sec|done.
func exerciseCell(e *model.WorkoutExercise) string {
	return strings.Join([]string{
		e.Name, e.Category,
		intPtrToStr(e.Sets), intPtrToStr(e.Reps), floatPtrToStr(e.Weight),
		floatPtrToStr(e.Distance), intPtrToStr(e.DurationSec), intPtrToStr(e.RestSec),
		strconv.FormatBool(e.Done),
	}, "|")
}

func intPtrToStr(i *int) string {
	if i == nil {
		return ""
	}
	return strconv.Itoa(*i)
}

func (s *ExportService) ExportBodyMetricsCSV(ctx context.Context, workspaceID uint) (string, error) {
	if s.bodyMetricRepo == nil {
		return "", fmt.Errorf("body metric export not available")
	}
	metrics, _, err := s.bodyMetricRepo.List(ctx, workspaceID, model.BodyMetricListQuery{Page: 1, PageSize: 100000})
	if err != nil {
		return "", fmt.Errorf("export body metrics csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"recorded_at", "weight", "height", "body_fat", "muscle_mass", "resting_hr", "systolic", "diastolic", "sleep_hours", "steps", "energy", "mood", "notes"})
	for _, m := range metrics {
		csvWriteRow(w, []string{
			m.RecordedAt.Format(time.RFC3339),
			floatPtrToStr(m.Weight), floatPtrToStr(m.Height), floatPtrToStr(m.BodyFat), floatPtrToStr(m.MuscleMass),
			intPtrToStr(m.RestingHR), intPtrToStr(m.Systolic), intPtrToStr(m.Diastolic),
			floatPtrToStr(m.SleepHours), intPtrToStr(m.Steps), intPtrToStr(m.Energy), intPtrToStr(m.Mood), m.Notes,
		})
	}
	w.Flush()
	return buf.String(), nil
}

// ExportHabitsCSV renders one row per habit with check-in dates inlined
// ("; "-joined YYYY-MM-DD) so history survives the round-trip.
func (s *ExportService) ExportHabitsCSV(ctx context.Context, workspaceID uint) (string, error) {
	if s.habitRepo == nil {
		return "", fmt.Errorf("habit export not available")
	}
	habits, err := s.habitRepo.List(ctx, workspaceID, true)
	if err != nil {
		return "", fmt.Errorf("export habits csv: %w", err)
	}
	logsByHabit := make(map[uint][]string)
	if s.habitLogRepo != nil {
		logs, lerr := s.habitLogRepo.ListAllByWorkspace(ctx, workspaceID)
		if lerr != nil {
			return "", fmt.Errorf("export habits csv: %w", lerr)
		}
		for _, l := range logs {
			logsByHabit[l.HabitID] = append(logsByHabit[l.HabitID], l.Date)
		}
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"name", "color", "emoji", "frequency", "archived", "sort_order", "checkin_dates"})
	for _, h := range habits {
		csvWriteRow(w, []string{
			h.Name, h.Color, h.Emoji, h.Frequency,
			strconv.FormatBool(h.Archived), strconv.Itoa(h.SortOrder),
			strings.Join(logsByHabit[h.ID], "; "),
		})
	}
	w.Flush()
	return buf.String(), nil
}

func (s *ExportService) ExportPomodorosCSV(ctx context.Context, workspaceID uint) (string, error) {
	if s.pomodoroRepo == nil {
		return "", fmt.Errorf("pomodoro export not available")
	}
	sessions, err := s.pomodoroRepo.List(ctx, workspaceID, time.Time{}, time.Now().Add(24*time.Hour))
	if err != nil {
		return "", fmt.Errorf("export pomodoros csv: %w", err)
	}
	todoTitles := make(map[uint]string)
	if s.todoRepo != nil {
		todos, _, terr := s.todoRepo.List(ctx, workspaceID, model.TodoListQuery{Page: 1, PageSize: 100000})
		if terr == nil {
			for _, t := range todos {
				todoTitles[t.ID] = t.Title
			}
		}
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"kind", "duration_seconds", "completed", "started_at", "ended_at", "todo_title"})
	for _, p := range sessions {
		title := ""
		if p.TodoID != nil {
			title = todoTitles[*p.TodoID]
		}
		csvWriteRow(w, []string{
			p.Kind, strconv.Itoa(p.DurationSeconds), strconv.FormatBool(p.Completed),
			p.StartedAt.Format(time.RFC3339), p.EndedAt.Format(time.RFC3339), title,
		})
	}
	w.Flush()
	return buf.String(), nil
}

// ExportFitnessCSV renders the exercise library (the flat part of the fitness
// module). Templates/goals/set logs are structured — they round-trip through
// the fitness JSON export.
func (s *ExportService) ExportFitnessCSV(ctx context.Context, workspaceID uint) (string, error) {
	if s.exLibRepo == nil {
		return "", fmt.Errorf("fitness export not available")
	}
	items, err := s.exLibRepo.List(ctx, workspaceID, "")
	if err != nil {
		return "", fmt.Errorf("export fitness csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"name", "category", "muscle_groups", "equipment", "notes"})
	for _, it := range items {
		csvWriteRow(w, []string{it.Name, it.Category, strings.Join(it.MuscleGroups, "; "), it.Equipment, it.Notes})
	}
	w.Flush()
	return buf.String(), nil
}
