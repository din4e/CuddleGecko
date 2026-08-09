package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

type ExportData struct {
	Version    string        `json:"version"`
	ExportedAt time.Time     `json:"exported_at"`
	Data       ExportPayload `json:"data"`
}

type ExportPayload struct {
	Contacts     []model.Contact        `json:"contacts"`
	Tags         []model.Tag            `json:"tags"`
	Interactions []model.Interaction    `json:"interactions"`
	Reminders    []model.Reminder       `json:"reminders"`
	Relations    []model.ContactRelation `json:"relations"`
	Todos        []todoExport           `json:"todos"`
	Transactions []model.Transaction    `json:"transactions"`
	Events       []model.Event          `json:"events"`
	Workouts     []workoutExport        `json:"workouts"`
	BodyMetrics  []model.BodyMetric     `json:"body_metrics"`
}

// todoExport captures a todo's portable state for export/import. Tags travel as
// names (re-associated on import); contacts are remapped via the contact ID map.
type todoExport struct {
	ID             uint         `json:"id"`
	ParentID       *uint        `json:"parent_id"`
	SortOrder      int          `json:"sort_order"`
	Title          string       `json:"title"`
	Description    string       `json:"description"`
	Status         string       `json:"status"`
	Priority       string       `json:"priority"`
	DueTime        *time.Time   `json:"due_time"`
	StartTime      *time.Time   `json:"start_time"`
	Amount         *float64     `json:"amount"`
	AmountType     string       `json:"amount_type"`
	ContactIDs     []uint       `json:"contact_ids"`
	Color          string       `json:"color"`
	Repeat         string       `json:"repeat"`
	RepeatInterval int          `json:"repeat_interval"`
	Pinned         bool         `json:"pinned"`
	CompletedAt    *time.Time   `json:"completed_at"`
	TagNames       []string     `json:"tag_names"`
	Items          []itemExport `json:"items"`
}

type itemExport struct {
	Content   string `json:"content"`
	Done      bool   `json:"done"`
	SortOrder int    `json:"sort_order"`
}

// workoutExport captures a workout's portable state for export/import. Exercises
// travel inline and are re-attached to the freshly-created workout on import.
type workoutExport struct {
	ID          uint           `json:"id"`
	Name        string         `json:"name"`
	Type        string         `json:"type"`
	Status      string         `json:"status"`
	Intensity   string         `json:"intensity"`
	ScheduledAt *time.Time     `json:"scheduled_at"`
	DurationMin *int           `json:"duration_min"`
	Calories    *float64       `json:"calories"`
	Color       string         `json:"color"`
	Location    string         `json:"location"`
	Notes       string         `json:"notes"`
	SortOrder   int            `json:"sort_order"`
	CompletedAt *time.Time     `json:"completed_at"`
	Exercises   []exerciseExport `json:"exercises"`
}

type exerciseExport struct {
	Name        string   `json:"name"`
	Category    string   `json:"category"`
	Sets        *int     `json:"sets"`
	Reps        *int     `json:"reps"`
	Weight      *float64 `json:"weight"`
	Distance    *float64 `json:"distance"`
	DurationSec *int     `json:"duration_sec"`
	RestSec     *int     `json:"rest_sec"`
	Done        bool     `json:"done"`
	SortOrder   int      `json:"sort_order"`
	Notes       string   `json:"notes"`
}

type ExportService struct {
	contactRepo     ContactRepository
	tagRepo         TagRepository
	interactionRepo InteractionRepository
	reminderRepo    ReminderRepository
	relationRepo    RelationRepository
	todoRepo        TodoRepository
	todoItemRepo    TodoItemRepository
	txRepo          TransactionRepository
	eventRepo       EventRepository
	workoutRepo     WorkoutRepository
	workoutExRepo   WorkoutExerciseRepository
	bodyMetricRepo  BodyMetricRepository
	notifier        TodoChangeNotifier
}

// ExportServiceOption configures an ExportService at construction.
type ExportServiceOption func(*ExportService)

// WithExportNotifier wires a realtime notifier so imports fan out to other
// connected clients in the same workspace (multi-device sync of imports).
func WithExportNotifier(n TodoChangeNotifier) ExportServiceOption {
	return func(s *ExportService) {
		if n != nil {
			s.notifier = n
		}
	}
}

// WithTransactionRepo wires transaction access so transactions are included in
// the JSON export/import round-trip and a transactions CSV export is available.
// Optional for backward compatibility (tests omit it).
func WithTransactionRepo(r TransactionRepository) ExportServiceOption {
	return func(s *ExportService) {
		if r != nil {
			s.txRepo = r
		}
	}
}

// WithEventRepo wires event access so calendar events are included in the JSON
// export/import round-trip and an events CSV export is available. Optional.
func WithEventRepo(r EventRepository) ExportServiceOption {
	return func(s *ExportService) {
		if r != nil {
			s.eventRepo = r
		}
	}
}

// WithWorkoutRepos wires workout/exercise/body-metric access so fitness data is
// included in the JSON export/import round-trip. Optional for backward
// compatibility (tests omit it).
func WithWorkoutRepos(workoutRepo WorkoutRepository, exRepo WorkoutExerciseRepository, bodyRepo BodyMetricRepository) ExportServiceOption {
	return func(s *ExportService) {
		if workoutRepo != nil {
			s.workoutRepo = workoutRepo
		}
		if exRepo != nil {
			s.workoutExRepo = exRepo
		}
		if bodyRepo != nil {
			s.bodyMetricRepo = bodyRepo
		}
	}
}

func NewExportService(
	contactRepo ContactRepository,
	tagRepo TagRepository,
	interactionRepo InteractionRepository,
	reminderRepo ReminderRepository,
	relationRepo RelationRepository,
	todoRepo TodoRepository,
	todoItemRepo TodoItemRepository,
	opts ...ExportServiceOption,
) *ExportService {
	s := &ExportService{
		contactRepo:     contactRepo,
		tagRepo:         tagRepo,
		interactionRepo: interactionRepo,
		reminderRepo:    reminderRepo,
		relationRepo:    relationRepo,
		todoRepo:        todoRepo,
		todoItemRepo:    todoItemRepo,
		notifier:        noopTodoNotifier{},
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// notifyImported fans out a workspace-wide refresh so other devices see the
// imported todos (the import path creates rows directly, bypassing the todo
// service's per-mutation notifications).
func (s *ExportService) notifyImported(ctx context.Context, workspaceID uint) {
	if s.notifier != nil {
		s.notifier.NotifyTodoChange(ctx, workspaceID, 0, TodoBulk)
	}
}

func (s *ExportService) ExportJSON(ctx context.Context, workspaceID uint) (string, error) {
	contacts, _, err := s.contactRepo.List(ctx, workspaceID, 1, 10000, "", nil)
	if err != nil {
		return "", fmt.Errorf("export contacts: %w", err)
	}

	tags, _, err := s.tagRepo.List(ctx, workspaceID, 1, 10000)
	if err != nil {
		return "", fmt.Errorf("export tags: %w", err)
	}

	relations, err := s.relationRepo.GetAllByWorkspace(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("export relations: %w", err)
	}

	var allInteractions []model.Interaction
	for _, c := range contacts {
		ints, _, err := s.interactionRepo.ListByContact(ctx, workspaceID, c.ID, 1, 10000)
		if err != nil {
			return "", fmt.Errorf("export interactions: %w", err)
		}
		allInteractions = append(allInteractions, ints...)
	}

	reminders, _, err := s.reminderRepo.List(ctx, workspaceID, "", 1, 10000)
	if err != nil {
		return "", fmt.Errorf("export reminders: %w", err)
	}

	todos, _, err := s.todoRepo.List(ctx, workspaceID, model.TodoListQuery{Page: 1, PageSize: 100000})
	if err != nil {
		return "", fmt.Errorf("export todos: %w", err)
	}
	todoExports := make([]todoExport, 0, len(todos))
	for _, td := range todos {
		items, err := s.todoItemRepo.ListItems(ctx, td.ID)
		if err != nil {
			return "", fmt.Errorf("export todo items: %w", err)
		}
		itemsOut := make([]itemExport, 0, len(items))
		for _, it := range items {
			itemsOut = append(itemsOut, itemExport{Content: it.Content, Done: it.Done, SortOrder: it.SortOrder})
		}
		tagNames := make([]string, 0, len(td.Tags))
		for _, tg := range td.Tags {
			tagNames = append(tagNames, tg.Name)
		}
		todoExports = append(todoExports, todoExport{
			ID: td.ID, ParentID: td.ParentID, SortOrder: td.SortOrder,
			Title: td.Title, Description: td.Description, Status: td.Status, Priority: td.Priority,
			DueTime: td.DueTime, StartTime: td.StartTime, Amount: td.Amount, AmountType: td.AmountType,
			ContactIDs: td.ContactIDs, Color: td.Color, Repeat: td.Repeat, RepeatInterval: td.RepeatInterval,
			Pinned: td.Pinned, CompletedAt: td.CompletedAt, TagNames: tagNames, Items: itemsOut,
		})
	}

	// Transactions are part of the workspace backup (finance data). Optional —
	// only included when a transaction repo is wired in.
	var transactions []model.Transaction
	if s.txRepo != nil {
		transactions, _, err = s.txRepo.List(ctx, workspaceID, 1, 100000, nil, nil)
		if err != nil {
			return "", fmt.Errorf("export transactions: %w", err)
		}
	}

	// Events (calendar) are part of the workspace backup too. Optional.
	var events []model.Event
	if s.eventRepo != nil {
		events, _, err = s.eventRepo.List(ctx, workspaceID, 1, 100000, nil, nil)
		if err != nil {
			return "", fmt.Errorf("export events: %w", err)
		}
	}

	// Workouts + their exercises (fitness data). Optional.
	var workoutExports []workoutExport
	if s.workoutRepo != nil {
		workouts, _, werr := s.workoutRepo.List(ctx, workspaceID, model.WorkoutListQuery{Page: 1, PageSize: 100000})
		if werr != nil {
			return "", fmt.Errorf("export workouts: %w", werr)
		}
		workoutExports = make([]workoutExport, 0, len(workouts))
		for _, w := range workouts {
			exOut := make([]exerciseExport, 0)
			if s.workoutExRepo != nil {
				exs, eerr := s.workoutExRepo.ListExercises(ctx, w.ID)
				if eerr != nil {
					return "", fmt.Errorf("export exercises: %w", eerr)
				}
				for _, e := range exs {
					exOut = append(exOut, exerciseExport{
						Name: e.Name, Category: e.Category, Sets: e.Sets, Reps: e.Reps,
						Weight: e.Weight, Distance: e.Distance, DurationSec: e.DurationSec,
						RestSec: e.RestSec, Done: e.Done, SortOrder: e.SortOrder, Notes: e.Notes,
					})
				}
			}
			workoutExports = append(workoutExports, workoutExport{
				ID: w.ID, Name: w.Name, Type: w.Type, Status: w.Status, Intensity: w.Intensity,
				ScheduledAt: w.ScheduledAt, DurationMin: w.DurationMin, Calories: w.Calories,
				Color: w.Color, Location: w.Location, Notes: w.Notes, SortOrder: w.SortOrder,
				CompletedAt: w.CompletedAt, Exercises: exOut,
			})
		}
	}

	// Body / health records. Optional.
	var bodyMetrics []model.BodyMetric
	if s.bodyMetricRepo != nil {
		bodyMetrics, _, err = s.bodyMetricRepo.List(ctx, workspaceID, 1, 100000)
		if err != nil {
			return "", fmt.Errorf("export body metrics: %w", err)
		}
	}

	data := ExportData{
		Version:    "1.0",
		ExportedAt: time.Now(),
		Data: ExportPayload{
			Contacts:     contacts,
			Tags:         tags,
			Interactions: allInteractions,
			Reminders:    reminders,
			Relations:    relations,
			Todos:        todoExports,
			Transactions: transactions,
			Events:       events,
			Workouts:     workoutExports,
			BodyMetrics:  bodyMetrics,
		},
	}

	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal export: %w", err)
	}
	return string(bytes), nil
}

func (s *ExportService) ImportJSON(ctx context.Context, userID, workspaceID uint, jsonData string) error {
	var data ExportData
	if err := json.Unmarshal([]byte(jsonData), &data); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	if data.Version == "" {
		return fmt.Errorf("missing version field")
	}

	// Tags first (contacts may reference them)
	rawTags, _ := json.Marshal(data.Data.Tags)
	var tags []struct {
		ID    uint   `json:"id"`
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.Unmarshal(rawTags, &tags); err != nil {
		return err
	}
	for _, t := range tags {
		newTag := &model.Tag{UserID: userID, WorkspaceID: workspaceID, Name: t.Name, Color: t.Color}
		if err := s.tagRepo.Create(ctx, newTag); err != nil {
			continue
		}
	}

	// Contacts
	rawContacts, _ := json.Marshal(data.Data.Contacts)
	var contacts []struct {
		ID                 uint     `json:"id"`
		Name               string   `json:"name"`
		Nickname           string   `json:"nickname"`
		AvatarURL          string   `json:"avatar_url"`
		Phone              []string `json:"phones"`
		Email              []string `json:"emails"`
		Birthday           string   `json:"birthday"`
		Notes              string   `json:"notes"`
		RelationshipLabels []string `json:"relationship_labels"`
		Tags               []struct {
			Name string `json:"name"`
		} `json:"tags"`
	}
	if err := json.Unmarshal(rawContacts, &contacts); err != nil {
		return err
	}
	contactIDMap := make(map[uint]uint)
	// Build tag name → id so contact tag associations survive the round-trip.
	ctWsTags, _, _ := s.tagRepo.List(ctx, workspaceID, 1, 100000)
	contactTagNameToID := make(map[string]uint)
	for _, tg := range ctWsTags {
		contactTagNameToID[tg.Name] = tg.ID
	}
	for _, c := range contacts {
		var birthday *time.Time
		if c.Birthday != "" {
			t, err := time.Parse(time.RFC3339, c.Birthday)
			if err == nil {
				birthday = &t
			}
		}
		newContact := &model.Contact{
			UserID:             userID,
			WorkspaceID:        workspaceID,
			Name:               c.Name,
			Nickname:           c.Nickname,
			AvatarURL:          c.AvatarURL,
			Phone:              c.Phone,
			Email:              c.Email,
			Birthday:           birthday,
			Notes:              c.Notes,
			RelationshipLabels: c.RelationshipLabels,
		}
		if err := s.contactRepo.Create(ctx, newContact); err != nil {
			continue
		}
		contactIDMap[c.ID] = newContact.ID
		// Restore contact tag associations (by name → freshly-created tag id).
		if len(c.Tags) > 0 {
			assoc := make([]model.Tag, 0, len(c.Tags))
			for _, tg := range c.Tags {
				if id, ok := contactTagNameToID[tg.Name]; ok {
					assoc = append(assoc, model.Tag{ID: id})
				}
			}
			if len(assoc) > 0 {
				_ = s.contactRepo.ReplaceTags(ctx, newContact.ID, assoc)
			}
		}
	}

	// Interactions
	rawInteractions, _ := json.Marshal(data.Data.Interactions)
	var interactions []struct {
		ContactID  uint   `json:"contact_id"`
		Type       string `json:"type"`
		Title      string `json:"title"`
		Content    string `json:"content"`
		OccurredAt string `json:"occurred_at"`
	}
	if err := json.Unmarshal(rawInteractions, &interactions); err != nil {
		return err
	}
	for _, i := range interactions {
		newContactID, ok := contactIDMap[i.ContactID]
		if !ok {
			continue
		}
		occurredAt, _ := time.Parse(time.RFC3339, i.OccurredAt)
		newInt := &model.Interaction{
			UserID:      userID,
			WorkspaceID: workspaceID,
			ContactID:   newContactID,
			Type:        model.InteractionType(i.Type),
			Title:       i.Title,
			Content:     i.Content,
			OccurredAt:  occurredAt,
		}
		if err := s.interactionRepo.Create(ctx, newInt); err != nil {
			continue
		}
	}

	// Reminders
	rawReminders, _ := json.Marshal(data.Data.Reminders)
	var reminders []struct {
		ContactID   uint   `json:"contact_id"`
		Title       string `json:"title"`
		Description string `json:"description"`
		RemindAt    string `json:"remind_at"`
		Status      string `json:"status"`
	}
	if err := json.Unmarshal(rawReminders, &reminders); err != nil {
		return err
	}
	for _, r := range reminders {
		newContactID, ok := contactIDMap[r.ContactID]
		if !ok {
			continue
		}
		remindAt, _ := time.Parse(time.RFC3339, r.RemindAt)
		newRem := &model.Reminder{
			UserID:      userID,
			WorkspaceID: workspaceID,
			ContactID:   newContactID,
			Title:       r.Title,
			Description: r.Description,
			RemindAt:    remindAt,
			Status:      model.ReminderStatus(r.Status),
		}
		if err := s.reminderRepo.Create(ctx, newRem); err != nil {
			continue
		}
	}

	// Relations
	rawRelations, _ := json.Marshal(data.Data.Relations)
	var relations []struct {
		ContactIDA   uint   `json:"contact_id_a"`
		ContactIDB   uint   `json:"contact_id_b"`
		RelationType string `json:"relation_type"`
	}
	if err := json.Unmarshal(rawRelations, &relations); err != nil {
		return err
	}
	for _, r := range relations {
		newA, okA := contactIDMap[r.ContactIDA]
		newB, okB := contactIDMap[r.ContactIDB]
		if !okA || !okB {
			continue
		}
		newRel := &model.ContactRelation{
			UserID:       userID,
			WorkspaceID:  workspaceID,
			ContactIDA:   newA,
			ContactIDB:   newB,
			RelationType: r.RelationType,
		}
		if err := s.relationRepo.Create(ctx, newRel); err != nil {
			continue
		}
	}

	// Transactions (contact IDs remapped; finance data restored). Skipped when no
	// transaction repo is wired (e.g. legacy tests).
	if s.txRepo != nil {
		for _, tx := range data.Data.Transactions {
			remappedContacts := make([]uint, 0, len(tx.ContactIDs))
			for _, cid := range tx.ContactIDs {
				if nc, ok := contactIDMap[cid]; ok {
					remappedContacts = append(remappedContacts, nc)
				}
			}
			newTx := &model.Transaction{
				UserID:      userID,
				WorkspaceID: workspaceID,
				Title:       tx.Title,
				Amount:      tx.Amount,
				Type:        tx.Type,
				Category:    tx.Category,
				ContactIDs:  remappedContacts,
				Date:        tx.Date,
				Notes:       tx.Notes,
			}
			if err := s.txRepo.Create(ctx, newTx); err != nil {
				continue
			}
		}
	}

	// Events (calendar) — contact IDs remapped. Skipped when no event repo.
	if s.eventRepo != nil {
		for _, ev := range data.Data.Events {
			remappedContacts := make([]uint, 0, len(ev.ContactIDs))
			for _, cid := range ev.ContactIDs {
				if nc, ok := contactIDMap[cid]; ok {
					remappedContacts = append(remappedContacts, nc)
				}
			}
			newEv := &model.Event{
				UserID:      userID,
				WorkspaceID: workspaceID,
				Title:       ev.Title,
				Description: ev.Description,
				StartTime:   ev.StartTime,
				EndTime:     ev.EndTime,
				Location:    ev.Location,
				ContactIDs:  remappedContacts,
				Color:       ev.Color,
			}
			if err := s.eventRepo.Create(ctx, newEv); err != nil {
				continue
			}
		}
	}

	// Todos (checklist items + tag re-association by name; contact IDs remapped)
	rawTodos, _ := json.Marshal(data.Data.Todos)
	var todos []todoExport
	if err := json.Unmarshal(rawTodos, &todos); err != nil {
		return err
	}
	wsTags, _, _ := s.tagRepo.List(ctx, workspaceID, 1, 100000)
	tagNameToID := make(map[string]uint)
	for _, tg := range wsTags {
		tagNameToID[tg.Name] = tg.ID
	}
	// Create parents before children (topo order) so parent_id can be remapped
	// from the source id to the freshly-created id; otherwise a child created
	// before its parent would dangle.
	ordered := topoSortTodos(todos)
	oldToNew := make(map[uint]uint, len(todos))
	for _, te := range ordered {
		remappedContacts := make([]uint, 0, len(te.ContactIDs))
		for _, cid := range te.ContactIDs {
			if nc, ok := contactIDMap[cid]; ok {
				remappedContacts = append(remappedContacts, nc)
			}
		}
		status := te.Status
		if status == "" {
			status = "pending"
		}
		priority := te.Priority
		if priority == "" {
			priority = "normal"
		}
		newTodo := &model.Todo{
			UserID:      userID,
			WorkspaceID: workspaceID,
			Title:       te.Title,
			Description: te.Description,
			Status:      status,
			Priority:    priority,
			DueTime:     te.DueTime,
			StartTime:   te.StartTime,
			Amount:      te.Amount,
			AmountType:  te.AmountType,
			ContactIDs:  remappedContacts,
			Color:       te.Color,
			Repeat:      te.Repeat,
			RepeatInterval: te.RepeatInterval,
			Pinned:      te.Pinned,
			CompletedAt: te.CompletedAt,
			ParentID:   remapParent(te.ParentID, oldToNew),
			SortOrder:  te.SortOrder,
		}
		if err := s.todoRepo.Create(ctx, newTodo); err != nil {
			continue
		}
		oldToNew[te.ID] = newTodo.ID
		for _, ie := range te.Items {
			_ = s.todoItemRepo.CreateItem(ctx, &model.TodoItem{
				TodoID: newTodo.ID, Content: ie.Content, Done: ie.Done, SortOrder: ie.SortOrder,
			})
		}
		tagIDs := make([]uint, 0, len(te.TagNames))
		for _, name := range te.TagNames {
			if id, ok := tagNameToID[name]; ok {
				tagIDs = append(tagIDs, id)
			}
		}
		if len(tagIDs) > 0 {
			tags := make([]model.Tag, 0, len(tagIDs))
			for _, id := range tagIDs {
				tags = append(tags, model.Tag{ID: id})
			}
			_ = s.todoRepo.ReplaceTags(ctx, newTodo.ID, tags)
		}
	}

	// Workouts + their exercises (fitness data). Exercises are re-attached to the
	// freshly-created workout via an old→new id map. Skipped without repos.
	if s.workoutRepo != nil {
		workoutOldToNew := make(map[uint]uint, len(data.Data.Workouts))
		for _, we := range data.Data.Workouts {
			status := we.Status
			if status == "" {
				status = model.WorkoutStatusPlanned
			}
			wType := we.Type
			if wType == "" {
				wType = "other"
			}
			newW := &model.Workout{
				UserID:      userID,
				WorkspaceID: workspaceID,
				Name:        we.Name,
				Type:        wType,
				Status:      status,
				Intensity:   we.Intensity,
				ScheduledAt: we.ScheduledAt,
				DurationMin: we.DurationMin,
				Calories:    we.Calories,
				Color:       we.Color,
				Location:    we.Location,
				Notes:       we.Notes,
				SortOrder:   we.SortOrder,
				CompletedAt: we.CompletedAt,
			}
			if err := s.workoutRepo.Create(ctx, newW); err != nil {
				continue
			}
			workoutOldToNew[we.ID] = newW.ID
			if s.workoutExRepo != nil {
				for _, ee := range we.Exercises {
					_ = s.workoutExRepo.CreateExercise(ctx, &model.WorkoutExercise{
						WorkoutID: newW.ID, Name: ee.Name, Category: ee.Category, Sets: ee.Sets,
						Reps: ee.Reps, Weight: ee.Weight, Distance: ee.Distance, DurationSec: ee.DurationSec,
						RestSec: ee.RestSec, Done: ee.Done, SortOrder: ee.SortOrder, Notes: ee.Notes,
					})
				}
			}
		}
	}

	// Body / health records (no FK to remap). Skipped without a repo.
	if s.bodyMetricRepo != nil {
		for _, m := range data.Data.BodyMetrics {
			newM := &model.BodyMetric{
				UserID:      userID,
				WorkspaceID: workspaceID,
				RecordedAt:  m.RecordedAt,
				Weight:      m.Weight,
				Height:      m.Height,
				BodyFat:     m.BodyFat,
				MuscleMass:  m.MuscleMass,
				RestingHR:   m.RestingHR,
				Systolic:    m.Systolic,
				Diastolic:   m.Diastolic,
				SleepHours:  m.SleepHours,
				Steps:       m.Steps,
				Energy:      m.Energy,
				Mood:        m.Mood,
				Notes:       m.Notes,
			}
			if newM.RecordedAt.IsZero() {
				newM.RecordedAt = time.Now()
			}
			_ = s.bodyMetricRepo.Create(ctx, newM)
		}
	}

	s.notifyImported(ctx, workspaceID)
	return nil
}

// topoSortTodos orders exported todos so every parent appears before its
// children (roots first, then descendants depth-first), letting import remap
// parent_id from the source id to the new id at create time. Exported trees are
// acyclic, but any node not reachable from a root (malformed input) is appended
// at the end so nothing is dropped.
func topoSortTodos(todos []todoExport) []todoExport {
	if len(todos) == 0 {
		return todos
	}
	present := make(map[uint]bool, len(todos))
	for _, te := range todos {
		present[te.ID] = true
	}
	children := make(map[uint][]todoExport)
	var roots []todoExport
	for _, te := range todos {
		if te.ParentID != nil && present[*te.ParentID] {
			children[*te.ParentID] = append(children[*te.ParentID], te)
		} else {
			roots = append(roots, te)
		}
	}
	out := make([]todoExport, 0, len(todos))
	var walk func(te todoExport)
	walk = func(te todoExport) {
		out = append(out, te)
		for _, c := range children[te.ID] {
			walk(c)
		}
	}
	for _, r := range roots {
		walk(r)
	}
	// Defensive: append anything not reached (cyclic / malformed).
	reached := make(map[uint]bool, len(out))
	for _, te := range out {
		reached[te.ID] = true
	}
	for _, te := range todos {
		if !reached[te.ID] {
			out = append(out, te)
		}
	}
	return out
}

// remapParent translates a source parent_id into the freshly-imported id, or
// nil if the parent wasn't imported (so the child becomes a root instead of
// holding a dangling reference).
func remapParent(pid *uint, oldToNew map[uint]uint) *uint {
	if pid == nil {
		return nil
	}
	if np, ok := oldToNew[*pid]; ok {
		return &np
	}
	return nil
}

// ExportTodosCSV renders the workspace's todos as a flat CSV (spreadsheet-friendly)
// — one row per todo, tags joined by "; ". Nil parent_id → empty (root).
func (s *ExportService) ExportTodosCSV(ctx context.Context, workspaceID uint) (string, error) {
	todos, _, err := s.todoRepo.List(ctx, workspaceID, model.TodoListQuery{Page: 1, PageSize: 100000})
	if err != nil {
		return "", fmt.Errorf("export todos csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{
		"id", "title", "description", "status", "priority", "due_time", "start_time",
		"parent_id", "sort_order", "amount", "amount_type", "color", "repeat",
		"repeat_interval", "pinned", "completed_at", "tags", "item_done", "item_total", "created_at",
	})
	for _, t := range todos {
		tagNames := make([]string, 0, len(t.Tags))
		for _, tg := range t.Tags {
			tagNames = append(tagNames, tg.Name)
		}
		_ = w.Write([]string{
			strconv.FormatUint(uint64(t.ID), 10),
			t.Title,
			t.Description,
			t.Status,
			t.Priority,
			timeToStr(t.DueTime),
			timeToStr(t.StartTime),
			uintPtrToStr(t.ParentID),
			strconv.Itoa(t.SortOrder),
			floatPtrToStr(t.Amount),
			t.AmountType,
			t.Color,
			t.Repeat,
			strconv.Itoa(t.RepeatInterval),
			strconv.FormatBool(t.Pinned),
			timeToStr(t.CompletedAt),
			strings.Join(tagNames, "; "),
			strconv.Itoa(t.ItemDone),
			strconv.Itoa(t.ItemTotal),
			t.CreatedAt.Format(time.RFC3339),
		})
	}
	w.Flush()
	return buf.String(), nil
}

func timeToStr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(time.RFC3339)
}

func uintPtrToStr(u *uint) string {
	if u == nil {
		return ""
	}
	return strconv.FormatUint(uint64(*u), 10)
}

func floatPtrToStr(f *float64) string {
	if f == nil {
		return ""
	}
	return strconv.FormatFloat(*f, 'f', 2, 64)
}

// ExportContactsCSV renders the workspace's contacts as a CSV (spreadsheet-
// friendly) — one row per contact, multi-value fields (emails/phones/tags) joined
// by "; ". Handy for mail-merge or migrating to another tool.
func (s *ExportService) ExportContactsCSV(ctx context.Context, workspaceID uint) (string, error) {
	contacts, _, err := s.contactRepo.List(ctx, workspaceID, 1, 10000, "", nil)
	if err != nil {
		return "", fmt.Errorf("export contacts csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"id", "name", "nickname", "emails", "phones", "birthday", "notes", "relationships", "tags"})
	for _, c := range contacts {
		tagNames := make([]string, 0, len(c.Tags))
		for _, tg := range c.Tags {
			tagNames = append(tagNames, tg.Name)
		}
		_ = w.Write([]string{
			strconv.FormatUint(uint64(c.ID), 10),
			c.Name,
			c.Nickname,
			strings.Join(c.Email, "; "),
			strings.Join(c.Phone, "; "),
			timeToStr(c.Birthday),
			c.Notes,
			strings.Join(c.RelationshipLabels, "; "),
			strings.Join(tagNames, "; "),
		})
	}
	w.Flush()
	return buf.String(), nil
}

// ExportTransactionsCSV renders the workspace's transactions as a CSV
// (spreadsheet-friendly for accounting). Requires a transaction repo.
func (s *ExportService) ExportTransactionsCSV(ctx context.Context, workspaceID uint) (string, error) {
	if s.txRepo == nil {
		return "", fmt.Errorf("transaction export not available")
	}
	txs, _, err := s.txRepo.List(ctx, workspaceID, 1, 100000, nil, nil)
	if err != nil {
		return "", fmt.Errorf("export transactions csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"id", "date", "title", "type", "amount", "category", "notes", "contact_ids"})
	for _, tx := range txs {
		ids := make([]string, 0, len(tx.ContactIDs))
		for _, id := range tx.ContactIDs {
			ids = append(ids, strconv.FormatUint(uint64(id), 10))
		}
		_ = w.Write([]string{
			strconv.FormatUint(uint64(tx.ID), 10),
			tx.Date.Format(time.RFC3339),
			tx.Title,
			tx.Type,
			strconv.FormatFloat(tx.Amount, 'f', 2, 64),
			tx.Category,
			tx.Notes,
			strings.Join(ids, "; "),
		})
	}
	w.Flush()
	return buf.String(), nil
}

// ExportEventsCSV renders the workspace's calendar events as a CSV. Requires an
// event repo.
func (s *ExportService) ExportEventsCSV(ctx context.Context, workspaceID uint) (string, error) {
	if s.eventRepo == nil {
		return "", fmt.Errorf("event export not available")
	}
	events, _, err := s.eventRepo.List(ctx, workspaceID, 1, 100000, nil, nil)
	if err != nil {
		return "", fmt.Errorf("export events csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"id", "title", "description", "start_time", "end_time", "location", "color", "contact_ids"})
	for _, ev := range events {
		ids := make([]string, 0, len(ev.ContactIDs))
		for _, id := range ev.ContactIDs {
			ids = append(ids, strconv.FormatUint(uint64(id), 10))
		}
		_ = w.Write([]string{
			strconv.FormatUint(uint64(ev.ID), 10),
			ev.Title,
			ev.Description,
			ev.StartTime.Format(time.RFC3339),
			timeToStr(ev.EndTime),
			ev.Location,
			ev.Color,
			strings.Join(ids, "; "),
		})
	}
	w.Flush()
	return buf.String(), nil
}

// ImportTransactionsCSV creates a transaction per CSV row (title + amount
// required; type validated income/expense; date defaults to now; contact_ids
// split on ";"). Requires a transaction repo.
func (s *ExportService) ImportTransactionsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (int, error) {
	if s.txRepo == nil {
		return 0, fmt.Errorf("transaction import not available")
	}
	r := csv.NewReader(strings.NewReader(csvString))
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return 0, fmt.Errorf("parse csv: %w", err)
	}
	if len(rows) == 0 {
		return 0, nil
	}
	col := make(map[string]int, len(rows[0]))
	for i, h := range rows[0] {
		col[strings.TrimSpace(strings.ToLower(h))] = i
	}
	field := func(row []string, name string) string {
		i, ok := col[name]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}
	imported := 0
	for _, row := range rows[1:] {
		title := field(row, "title")
		amountStr := field(row, "amount")
		if title == "" || amountStr == "" {
			continue
		}
		amount, perr := strconv.ParseFloat(amountStr, 64)
		if perr != nil {
			continue
		}
		txType := field(row, "type")
		if txType != "income" && txType != "expense" {
			txType = "expense"
		}
		tx := &model.Transaction{
			UserID:      userID,
			WorkspaceID: workspaceID,
			Title:       title,
			Amount:      amount,
			Type:        txType,
			Category:    field(row, "category"),
			Notes:       field(row, "notes"),
		}
		if d := field(row, "date"); d != "" {
			if t, err := time.Parse(time.RFC3339, d); err == nil {
				tx.Date = t
			} else {
				tx.Date = time.Now()
			}
		} else {
			tx.Date = time.Now()
		}
		if cids := field(row, "contact_ids"); cids != "" {
			for _, s := range splitSemi(cids) {
				if id, err := strconv.ParseUint(s, 10, 64); err == nil {
					tx.ContactIDs = append(tx.ContactIDs, uint(id))
				}
			}
		}
		if err := s.txRepo.Create(ctx, tx); err != nil {
			return imported, fmt.Errorf("import transaction %q: %w", title, err)
		}
		imported++
	}
	return imported, nil
}

// ImportContactsCSV creates a contact per CSV row (columns matched by header
// name, case-insensitive). Multi-value fields (emails/phones/relationships) are
// split on ";". Tags are not associated on CSV import (add them in the UI).
func (s *ExportService) ImportContactsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (int, error) {
	r := csv.NewReader(strings.NewReader(csvString))
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return 0, fmt.Errorf("parse csv: %w", err)
	}
	if len(rows) == 0 {
		return 0, nil
	}
	col := make(map[string]int, len(rows[0]))
	for i, h := range rows[0] {
		col[strings.TrimSpace(strings.ToLower(h))] = i
	}
	field := func(row []string, name string) string {
		i, ok := col[name]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}
	imported := 0
	for _, row := range rows[1:] {
		name := field(row, "name")
		if name == "" {
			continue
		}
		c := &model.Contact{UserID: userID, WorkspaceID: workspaceID, Name: name}
		if n := field(row, "nickname"); n != "" {
			c.Nickname = n
		}
		if e := field(row, "emails"); e != "" {
			c.Email = splitSemi(e)
		}
		if p := field(row, "phones"); p != "" {
			c.Phone = splitSemi(p)
		}
		if rel := field(row, "relationships"); rel != "" {
			c.RelationshipLabels = splitSemi(rel)
		}
		if n := field(row, "notes"); n != "" {
			c.Notes = n
		}
		if b := field(row, "birthday"); b != "" {
			if t, err := time.Parse(time.RFC3339, b); err == nil {
				c.Birthday = &t
			}
		}
		if err := s.contactRepo.Create(ctx, c); err != nil {
			return imported, fmt.Errorf("import contact %q: %w", name, err)
		}
		imported++
	}
	return imported, nil
}

// splitSemi splits a "; "-joined cell into trimmed non-empty values.
func splitSemi(s string) []string {
	out := []string{}
	for _, p := range strings.Split(s, ";") {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// ImportTodosCSV creates a flat todo per CSV row (columns matched by header
// name, case-insensitive). parent_id is ignored on import — CSV is a flat
// spreadsheet format; nesting round-trips through the JSON export/import.
func (s *ExportService) ImportTodosCSV(ctx context.Context, userID, workspaceID uint, csvString string) (int, error) {
	r := csv.NewReader(strings.NewReader(csvString))
	r.FieldsPerRecord = -1 // tolerate ragged rows
	rows, err := r.ReadAll()
	if err != nil {
		return 0, fmt.Errorf("parse csv: %w", err)
	}
	if len(rows) == 0 {
		return 0, nil
	}
	col := make(map[string]int, len(rows[0]))
	for i, h := range rows[0] {
		col[strings.TrimSpace(strings.ToLower(h))] = i
	}
	field := func(row []string, name string) string {
		i, ok := col[name]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}
	imported := 0
	for _, row := range rows[1:] {
		title := field(row, "title")
		if title == "" {
			continue // skip blank rows
		}
		todo := &model.Todo{
			UserID:      userID,
			WorkspaceID: workspaceID,
			Title:       title,
			Status:      "pending",
			Priority:    "normal",
		}
		if d := field(row, "description"); d != "" {
			todo.Description = d
		}
		if st := field(row, "status"); st == "pending" || st == "done" {
			todo.Status = st
		}
		if pr := field(row, "priority"); pr == "low" || pr == "normal" || pr == "high" {
			todo.Priority = pr
		}
		if due := field(row, "due_time"); due != "" {
			if t, err := time.Parse(time.RFC3339, due); err == nil {
				todo.DueTime = &t
			}
		}
		if c := field(row, "color"); c != "" {
			todo.Color = c
		}
		if err := s.todoRepo.Create(ctx, todo); err != nil {
			return imported, fmt.Errorf("import csv row %q: %w", title, err)
		}
		imported++
	}
	s.notifyImported(ctx, workspaceID)
	return imported, nil
}
