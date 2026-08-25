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

	// v2.0 additions.
	Habits            []habitExport              `json:"habits"`
	Pomodoros         []model.PomodoroSession    `json:"pomodoros"`
	ExerciseLibrary   []model.ExerciseLibraryItem `json:"exercise_library"`
	WorkoutTemplates  []templateExport           `json:"workout_templates"`
	SetLogs           []setLogExport             `json:"set_logs"`
	FitnessGoals      []model.FitnessGoal        `json:"fitness_goals"`
	AIConversations   []aiConversationExport     `json:"ai_conversations"`
}

// habitExport captures a habit plus its check-in dates so the heatmap history
// survives the round-trip (dates travel as YYYY-MM-DD strings).
type habitExport struct {
	ID         uint     `json:"id"`
	Name       string   `json:"name"`
	Color      string   `json:"color"`
	Emoji      string   `json:"emoji"`
	Frequency  string   `json:"frequency"`
	Archived   bool     `json:"archived"`
	SortOrder  int      `json:"sort_order"`
	CheckinDates []string `json:"checkin_dates"`
}

// templateExport captures a workout template with its planned movements inline.
type templateExport struct {
	ID     uint                       `json:"id"`
	Name   string                     `json:"name"`
	Type   string                     `json:"type"`
	Notes  string                     `json:"notes"`
	Items  []model.WorkoutTemplateItem `json:"items"`
}

// setLogExport references its workout/exercise by source id; import remaps both
// via the old→new id maps (identity-seeded with existing rows so module-level
// imports pointing at existing workouts also work).
type setLogExport struct {
	WorkoutID   uint     `json:"workout_id"`
	ExerciseID  uint     `json:"exercise_id"`
	SetIndex    int      `json:"set_index"`
	Reps        *int     `json:"reps"`
	Weight      *float64 `json:"weight"`
	Distance    *float64 `json:"distance"`
	DurationSec *int     `json:"duration_sec"`
	Done        bool     `json:"done"`
	Notes       string   `json:"notes"`
}

// aiConversationExport captures a chat conversation with inline messages
// (user-scoped, included in the account backup for completeness).
type aiConversationExport struct {
	ID       uint                  `json:"id"`
	Title    string                `json:"title"`
	Messages []aiMessageExport     `json:"messages"`
}

type aiMessageExport struct {
	Role    string `json:"role"`
	Content string `json:"content"`
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
	ID          uint     `json:"id"`
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
	habitRepo       HabitRepository
	habitLogRepo    HabitLogRepository
	pomodoroRepo    PomodoroRepository
	exLibRepo       ExerciseLibraryRepository
	tplRepo         WorkoutTemplateRepository
	setLogRepo      WorkoutSetLogRepository
	goalRepo        FitnessGoalRepository
	aiRepo          AIRepository
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

// WithHabitRepos wires habit + habit-log access so habits (with check-in
// history) are included in the JSON export/import round-trip. Optional.
func WithHabitRepos(habitRepo HabitRepository, logRepo HabitLogRepository) ExportServiceOption {
	return func(s *ExportService) {
		if habitRepo != nil {
			s.habitRepo = habitRepo
		}
		if logRepo != nil {
			s.habitLogRepo = logRepo
		}
	}
}

// WithPomodoroRepo wires pomodoro session access. Optional.
func WithPomodoroRepo(r PomodoroRepository) ExportServiceOption {
	return func(s *ExportService) {
		if r != nil {
			s.pomodoroRepo = r
		}
	}
}

// WithFitnessRepos wires the extended fitness features (exercise library,
// templates, set logs, goals) into the JSON export/import round-trip. Optional.
func WithFitnessRepos(libRepo ExerciseLibraryRepository, tplRepo WorkoutTemplateRepository, setLogRepo WorkoutSetLogRepository, goalRepo FitnessGoalRepository) ExportServiceOption {
	return func(s *ExportService) {
		if libRepo != nil {
			s.exLibRepo = libRepo
		}
		if tplRepo != nil {
			s.tplRepo = tplRepo
		}
		if setLogRepo != nil {
			s.setLogRepo = setLogRepo
		}
		if goalRepo != nil {
			s.goalRepo = goalRepo
		}
	}
}

// WithAIRepo wires AI chat history into the JSON export/import round-trip.
// Providers are deliberately excluded (they carry API keys). Optional.
func WithAIRepo(r AIRepository) ExportServiceOption {
	return func(s *ExportService) {
		if r != nil {
			s.aiRepo = r
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

func (s *ExportService) ExportJSON(ctx context.Context, userID, workspaceID uint) (string, error) {
	contacts, _, err := s.contactRepo.List(ctx, workspaceID, 1, 10000, "", nil)
	if err != nil {
		return "", fmt.Errorf("export contacts: %w", err)
	}
	// Hydrate tag associations: the repo List no longer preloads Tags (they
	// live in the polymorphic tagging table), but the export format and the
	// import restore path both read Contact.Tags.
	for i := range contacts {
		cTags, err := s.contactRepo.GetTags(ctx, workspaceID, contacts[i].ID)
		if err != nil {
			return "", fmt.Errorf("export contact tags: %w", err)
		}
		contacts[i].Tags = cTags
	}

	tags, _, err := s.tagRepo.List(ctx, workspaceID, 1, 10000)
	if err != nil {
		return "", fmt.Errorf("export tags: %w", err)
	}

	relations, err := s.relationRepo.GetAllByWorkspace(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("export relations: %w", err)
	}

	// Bulk-fetch all interactions in one query instead of one per contact.
	allInteractions, err := s.interactionRepo.ListByWorkspace(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("export interactions: %w", err)
	}

	reminders, _, err := s.reminderRepo.List(ctx, workspaceID, "", nil, 1, 10000)
	if err != nil {
		return "", fmt.Errorf("export reminders: %w", err)
	}

	todos, _, err := s.todoRepo.List(ctx, workspaceID, model.TodoListQuery{Page: 1, PageSize: 100000})
	if err != nil {
		return "", fmt.Errorf("export todos: %w", err)
	}
	// Bulk-fetch checklist items for all todos in one query, grouped by todo ID.
	todoIDs := make([]uint, 0, len(todos))
	for _, td := range todos {
		todoIDs = append(todoIDs, td.ID)
	}
	allItems, err := s.todoItemRepo.ListItemsByTodoIDs(ctx, todoIDs)
	if err != nil {
		return "", fmt.Errorf("export todo items: %w", err)
	}
	itemsByTodo := make(map[uint][]itemExport, len(todos))
	for _, it := range allItems {
		itemsByTodo[it.TodoID] = append(itemsByTodo[it.TodoID], itemExport{
			Content: it.Content, Done: it.Done, SortOrder: it.SortOrder,
		})
	}

	todoExports := make([]todoExport, 0, len(todos))
	for _, td := range todos {
		tagNames := make([]string, 0, len(td.Tags))
		for _, tg := range td.Tags {
			tagNames = append(tagNames, tg.Name)
		}
		itemsOut := itemsByTodo[td.ID]
		if itemsOut == nil {
			itemsOut = []itemExport{}
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
		transactions, _, err = s.txRepo.List(ctx, workspaceID, 1, 100000, nil, nil, "")
		if err != nil {
			return "", fmt.Errorf("export transactions: %w", err)
		}
	}

	// Events (calendar) are part of the workspace backup too. Optional.
	var events []model.Event
	if s.eventRepo != nil {
		events, _, err = s.eventRepo.List(ctx, workspaceID, 1, 100000, nil, nil, "")
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
		// Bulk-fetch exercises for all workouts in one query, grouped by workout ID.
		var exercisesByWorkout map[uint][]exerciseExport
		if s.workoutExRepo != nil {
			workoutIDs := make([]uint, 0, len(workouts))
			for _, w := range workouts {
				workoutIDs = append(workoutIDs, w.ID)
			}
			allExs, eerr := s.workoutExRepo.ListExercisesByWorkoutIDs(ctx, workoutIDs)
			if eerr != nil {
				return "", fmt.Errorf("export exercises: %w", eerr)
			}
			exercisesByWorkout = make(map[uint][]exerciseExport, len(workouts))
				for _, e := range allExs {
					exercisesByWorkout[e.WorkoutID] = append(exercisesByWorkout[e.WorkoutID], exerciseExport{
						ID: e.ID, Name: e.Name, Category: e.Category, Sets: e.Sets, Reps: e.Reps,
					Weight: e.Weight, Distance: e.Distance, DurationSec: e.DurationSec,
					RestSec: e.RestSec, Done: e.Done, SortOrder: e.SortOrder, Notes: e.Notes,
				})
			}
		}
		workoutExports = make([]workoutExport, 0, len(workouts))
		for _, w := range workouts {
			exOut := exercisesByWorkout[w.ID]
			if exOut == nil {
				exOut = []exerciseExport{}
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
		bodyMetrics, _, err = s.bodyMetricRepo.List(ctx, workspaceID, model.BodyMetricListQuery{Page: 1, PageSize: 100000})
		if err != nil {
			return "", fmt.Errorf("export body metrics: %w", err)
		}
	}

	// Habits + check-in history. Optional.
	var habits []habitExport
	if s.habitRepo != nil {
		hs, herr := s.habitRepo.List(ctx, workspaceID, true)
		if herr != nil {
			return "", fmt.Errorf("export habits: %w", herr)
		}
		logsByHabit := make(map[uint][]string)
		if s.habitLogRepo != nil {
			allLogs, lerr := s.habitLogRepo.ListAllByWorkspace(ctx, workspaceID)
			if lerr != nil {
				return "", fmt.Errorf("export habit logs: %w", lerr)
			}
			for _, l := range allLogs {
				logsByHabit[l.HabitID] = append(logsByHabit[l.HabitID], l.Date)
			}
		}
		habits = make([]habitExport, 0, len(hs))
		for _, h := range hs {
			dates := logsByHabit[h.ID]
			if dates == nil {
				dates = []string{}
			}
			habits = append(habits, habitExport{
				ID: h.ID, Name: h.Name, Color: h.Color, Emoji: h.Emoji,
				Frequency: h.Frequency, Archived: h.Archived, SortOrder: h.SortOrder,
				CheckinDates: dates,
			})
		}
	}

	// Pomodoro sessions. Optional.
	var pomodoros []model.PomodoroSession
	if s.pomodoroRepo != nil {
		pomodoros, err = s.pomodoroRepo.List(ctx, workspaceID, time.Time{}, time.Now().Add(24*time.Hour))
		if err != nil {
			return "", fmt.Errorf("export pomodoros: %w", err)
		}
	}

	// Extended fitness: library, templates (+items), set logs, goals. Optional.
	var exLibrary []model.ExerciseLibraryItem
	if s.exLibRepo != nil {
		exLibrary, err = s.exLibRepo.List(ctx, workspaceID, "")
		if err != nil {
			return "", fmt.Errorf("export exercise library: %w", err)
		}
	}
	var templates []templateExport
	if s.tplRepo != nil {
		tpls, terr := s.tplRepo.List(ctx, workspaceID)
		if terr != nil {
			return "", fmt.Errorf("export workout templates: %w", terr)
		}
		templates = make([]templateExport, 0, len(tpls))
		for _, t := range tpls {
			items := t.Items
			if items == nil {
				items = []model.WorkoutTemplateItem{}
			}
			templates = append(templates, templateExport{ID: t.ID, Name: t.Name, Type: t.Type, Notes: t.Notes, Items: items})
		}
	}
	var setLogs []setLogExport
	if s.setLogRepo != nil && s.workoutRepo != nil {
		ws, _, werr := s.workoutRepo.List(ctx, workspaceID, model.WorkoutListQuery{Page: 1, PageSize: 100000})
		if werr != nil {
			return "", fmt.Errorf("export set logs: %w", werr)
		}
		wIDs := make([]uint, 0, len(ws))
		for _, w := range ws {
			wIDs = append(wIDs, w.ID)
		}
		if s.workoutExRepo != nil {
			exs, eerr := s.workoutExRepo.ListExercisesByWorkoutIDs(ctx, wIDs)
			if eerr != nil {
				return "", fmt.Errorf("export set logs: %w", eerr)
			}
			for _, e := range exs {
				logs, lerr := s.setLogRepo.ListByExercise(ctx, e.WorkoutID, e.ID)
				if lerr != nil {
					return "", fmt.Errorf("export set logs: %w", lerr)
				}
				for _, l := range logs {
					setLogs = append(setLogs, setLogExport{
						WorkoutID: l.WorkoutID, ExerciseID: l.ExerciseID, SetIndex: l.SetIndex,
						Reps: l.Reps, Weight: l.Weight, Distance: l.Distance,
						DurationSec: l.DurationSec, Done: l.Done, Notes: l.Notes,
					})
				}
			}
		}
	}
	var fitnessGoals []model.FitnessGoal
	if s.goalRepo != nil {
		fitnessGoals, err = s.goalRepo.List(ctx, workspaceID)
		if err != nil {
			return "", fmt.Errorf("export fitness goals: %w", err)
		}
	}

	// AI chat history (user-scoped; providers excluded — they hold API keys).
	var aiConversations []aiConversationExport
	if s.aiRepo != nil {
		convs, _, aerr := s.aiRepo.ListConversations(ctx, userID, 1, 100000)
		if aerr != nil {
			return "", fmt.Errorf("export ai conversations: %w", aerr)
		}
		aiConversations = make([]aiConversationExport, 0, len(convs))
		for _, c := range convs {
			msgs, merr := s.aiRepo.ListMessagesByConversation(ctx, c.ID)
			if merr != nil {
				return "", fmt.Errorf("export ai messages: %w", merr)
			}
			msgsOut := make([]aiMessageExport, 0, len(msgs))
			for _, m := range msgs {
				msgsOut = append(msgsOut, aiMessageExport{Role: string(m.Role), Content: m.Content})
			}
			aiConversations = append(aiConversations, aiConversationExport{ID: c.ID, Title: c.Title, Messages: msgsOut})
		}
	}

	data := ExportData{
		Version:    "2.0",
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
			Habits:            habits,
			Pomodoros:         pomodoros,
			ExerciseLibrary:   exLibrary,
			WorkoutTemplates:  templates,
			SetLogs:           setLogs,
			FitnessGoals:      fitnessGoals,
			AIConversations:   aiConversations,
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

	// Existing workspace rows seed identity FK maps so a module-level import
	// (e.g. todos only) referencing existing contacts/todos/workouts keeps those
	// references intact instead of dropping them.
	contactIDMap := make(map[uint]uint)
	if existingContacts, _, err := s.contactRepo.List(ctx, workspaceID, 1, 100000, "", nil); err == nil {
		for _, c := range existingContacts {
			contactIDMap[c.ID] = c.ID
		}
	}
	todoIDMap := make(map[uint]uint)
	if existingTodos, _, err := s.todoRepo.List(ctx, workspaceID, model.TodoListQuery{Page: 1, PageSize: 100000}); err == nil {
		for _, td := range existingTodos {
			todoIDMap[td.ID] = td.ID
		}
	}
	wsTags, _, _ := s.tagRepo.List(ctx, workspaceID, 1, 100000)
	tagNameToID := make(map[string]uint)
	for _, tg := range wsTags {
		tagNameToID[tg.Name] = tg.ID
	}

	// Tags first (contacts may reference them). A tag whose name already exists
	// in the workspace is skipped and the existing id reused (dedup by name).
	for _, t := range data.Data.Tags {
		if _, ok := tagNameToID[t.Name]; ok {
			continue
		}
		newTag := &model.Tag{UserID: userID, WorkspaceID: workspaceID, Name: t.Name, Color: t.Color}
		if err := s.tagRepo.Create(ctx, newTag); err != nil {
			continue
		}
		tagNameToID[t.Name] = newTag.ID
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
	// Tag associations resolve via the shared name→id map (freshly-created tags
	// are registered there above).
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
				if id, ok := tagNameToID[tg.Name]; ok {
					assoc = append(assoc, model.Tag{ID: id, WorkspaceID: newContact.WorkspaceID})
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
	todos := data.Data.Todos
	// Create parents before children (topo order) so parent_id can be remapped
	// from the source id to the freshly-created id; otherwise a child created
	// before its parent would dangle. todoIDMap is identity-seeded with existing
	// todos so links to pre-existing parents survive a partial import.
	ordered := topoSortTodos(todos)
	oldToNew := todoIDMap
	for _, te := range ordered {
		remappedContacts := make([]uint, 0, len(te.ContactIDs))
		for _, cid := range te.ContactIDs {
			if nc, ok := contactIDMap[cid]; ok {
				remappedContacts = append(remappedContacts, nc)
			}
		}
		status := te.Status
		if status != "done" && status != "abandoned" {
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
	// freshly-created workout via an old→new id map. Maps are identity-seeded
	// with existing rows so set logs referencing pre-existing workouts keep
	// working on a partial import. Skipped without repos.
	workoutOldToNew := make(map[uint]uint)
	exOldToNew := make(map[uint]uint)
	if s.workoutRepo != nil {
		if existing, _, err := s.workoutRepo.List(ctx, workspaceID, model.WorkoutListQuery{Page: 1, PageSize: 100000}); err == nil {
			for _, w := range existing {
				workoutOldToNew[w.ID] = w.ID
			}
			if s.workoutExRepo != nil {
				wIDs := make([]uint, 0, len(existing))
				for _, w := range existing {
					wIDs = append(wIDs, w.ID)
				}
				if exs, err := s.workoutExRepo.ListExercisesByWorkoutIDs(ctx, wIDs); err == nil {
					for _, e := range exs {
						exOldToNew[e.ID] = e.ID
					}
				}
			}
		}
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
					newEx := &model.WorkoutExercise{
						WorkoutID: newW.ID, Name: ee.Name, Category: ee.Category, Sets: ee.Sets,
						Reps: ee.Reps, Weight: ee.Weight, Distance: ee.Distance, DurationSec: ee.DurationSec,
						RestSec: ee.RestSec, Done: ee.Done, SortOrder: ee.SortOrder, Notes: ee.Notes,
					}
					if err := s.workoutExRepo.CreateExercise(ctx, newEx); err == nil {
						exOldToNew[ee.ID] = newEx.ID
					}
				}
			}
		}
	}

	// Set logs — remap workout/exercise source ids via the maps above.
	if s.setLogRepo != nil {
		for _, sl := range data.Data.SetLogs {
			newW, okW := workoutOldToNew[sl.WorkoutID]
			newE, okE := exOldToNew[sl.ExerciseID]
			if !okW || !okE {
				continue
			}
			_ = s.setLogRepo.Create(ctx, &model.WorkoutSetLog{
				WorkoutID: newW, ExerciseID: newE, SetIndex: sl.SetIndex,
				Reps: sl.Reps, Weight: sl.Weight, Distance: sl.Distance,
				DurationSec: sl.DurationSec, Done: sl.Done, Notes: sl.Notes,
			})
		}
	}

	// Habits + check-in history (replayed via Toggle per date).
	if s.habitRepo != nil {
		for _, he := range data.Data.Habits {
			newH := &model.Habit{
				UserID: userID, WorkspaceID: workspaceID,
				Name: he.Name, Color: he.Color, Emoji: he.Emoji,
				Frequency: he.Frequency, Archived: he.Archived, SortOrder: he.SortOrder,
			}
			if newH.Frequency == "" {
				newH.Frequency = "daily"
			}
			if err := s.habitRepo.Create(ctx, newH); err != nil {
				continue
			}
			if s.habitLogRepo != nil {
				for _, d := range he.CheckinDates {
					_, _ = s.habitLogRepo.Toggle(ctx, userID, workspaceID, newH.ID, d)
				}
			}
		}
	}

	// Pomodoro sessions — todo_id remapped (nil when the todo wasn't imported
	// and doesn't already exist).
	if s.pomodoroRepo != nil {
		for _, p := range data.Data.Pomodoros {
			newP := p
			newP.ID = 0
			newP.UserID = userID
			newP.WorkspaceID = workspaceID
			if p.TodoID != nil {
				if nt, ok := todoIDMap[*p.TodoID]; ok {
					newP.TodoID = &nt
				} else {
					newP.TodoID = nil
				}
			}
			_ = s.pomodoroRepo.Create(ctx, &newP)
		}
	}

	// Extended fitness: exercise library, templates (+items), goals.
	if s.exLibRepo != nil {
		for _, item := range data.Data.ExerciseLibrary {
			newItem := item
			newItem.ID = 0
			newItem.UserID = userID
			newItem.WorkspaceID = workspaceID
			_ = s.exLibRepo.Create(ctx, &newItem)
		}
	}
	if s.tplRepo != nil {
		for _, te := range data.Data.WorkoutTemplates {
			items := make([]model.WorkoutTemplateItem, 0, len(te.Items))
			for _, it := range te.Items {
				it.ID = 0
				it.TemplateID = 0
				items = append(items, it)
			}
			newT := &model.WorkoutTemplate{
				UserID: userID, WorkspaceID: workspaceID,
				Name: te.Name, Type: te.Type, Notes: te.Notes, Items: items,
			}
			_ = s.tplRepo.Create(ctx, newT)
		}
	}
	if s.goalRepo != nil {
		for _, g := range data.Data.FitnessGoals {
			newG := g
			newG.ID = 0
			newG.UserID = userID
			newG.WorkspaceID = workspaceID
			_ = s.goalRepo.Create(ctx, &newG)
		}
	}

	// AI chat history (user-scoped; conversation + messages).
	if s.aiRepo != nil {
		for _, ce := range data.Data.AIConversations {
			newC := &model.AIConversation{UserID: userID, Title: ce.Title}
			if err := s.aiRepo.CreateConversation(ctx, newC); err != nil {
				continue
			}
			for _, m := range ce.Messages {
				_ = s.aiRepo.CreateMessage(ctx, &model.AIMessage{
					ConversationID: newC.ID, Role: model.AIMessageRole(m.Role), Content: m.Content,
				})
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

// csvSafe neutralizes spreadsheet formula injection: a cell starting with
// =, +, -, @ or a tab/CR would execute as a formula in Excel/WPS when the
// exported file is opened, so prefix it with a single quote (Excel renders
// the quote-invisible and keeps the cell literal).
func csvSafe(s string) string {
	if s == "" {
		return s
	}
	switch s[0] {
	case '-', '+':
		// Numeric cells (amounts, ids) are safe — only neutralize when the
		// rest isn't a plain number.
		if isNumeric(s[1:]) {
			return s
		}
		return "'" + s
	case '=', '@', '\t', '\r':
		return "'" + s
	}
	return s
}

func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	dot := false
	for i := 0; i < len(s); i++ {
		switch {
		case s[i] >= '0' && s[i] <= '9':
		case s[i] == '.' && !dot:
			dot = true
		default:
			return false
		}
	}
	return true
}

// csvWriteRow writes a row with every cell passed through csvSafe.
func csvWriteRow(w *csv.Writer, cells []string) {
	for i, c := range cells {
		cells[i] = csvSafe(c)
	}
	_ = w.Write(cells)
}

func (s *ExportService) ExportTodosCSV(ctx context.Context, workspaceID uint) (string, error) {
	todos, _, err := s.todoRepo.List(ctx, workspaceID, model.TodoListQuery{Page: 1, PageSize: 100000})
	if err != nil {
		return "", fmt.Errorf("export todos csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{
		"id", "title", "description", "status", "priority", "due_time", "start_time",
		"parent_id", "sort_order", "amount", "amount_type", "color", "repeat",
		"repeat_interval", "pinned", "completed_at", "tags", "item_done", "item_total", "created_at",
	})
	for _, t := range todos {
		tagNames := make([]string, 0, len(t.Tags))
		for _, tg := range t.Tags {
			tagNames = append(tagNames, tg.Name)
		}
		csvWriteRow(w, []string{
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
	csvWriteRow(w, []string{"id", "name", "nickname", "emails", "phones", "birthday", "notes", "relationships", "tags"})
	for _, c := range contacts {
		tagNames := make([]string, 0, len(c.Tags))
		for _, tg := range c.Tags {
			tagNames = append(tagNames, tg.Name)
		}
		csvWriteRow(w, []string{
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
	txs, _, err := s.txRepo.List(ctx, workspaceID, 1, 100000, nil, nil, "")
	if err != nil {
		return "", fmt.Errorf("export transactions csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"id", "date", "title", "type", "amount", "category", "notes", "contact_ids"})
	for _, tx := range txs {
		ids := make([]string, 0, len(tx.ContactIDs))
		for _, id := range tx.ContactIDs {
			ids = append(ids, strconv.FormatUint(uint64(id), 10))
		}
		csvWriteRow(w, []string{
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
	events, _, err := s.eventRepo.List(ctx, workspaceID, 1, 100000, nil, nil, "")
	if err != nil {
		return "", fmt.Errorf("export events csv: %w", err)
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	csvWriteRow(w, []string{"id", "title", "description", "start_time", "end_time", "location", "color", "contact_ids"})
	for _, ev := range events {
		ids := make([]string, 0, len(ev.ContactIDs))
		for _, id := range ev.ContactIDs {
			ids = append(ids, strconv.FormatUint(uint64(id), 10))
		}
		csvWriteRow(w, []string{
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
// required; type validated income/expense; date defaults to now; contacts
// referenced by name, "; "-joined). Rows whose date+title+amount already exist
// are skipped and counted. Requires a transaction repo.
func (s *ExportService) ImportTransactionsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	if s.txRepo == nil {
		return ImportStats{}, fmt.Errorf("transaction import not available")
	}
	nameToID, err := s.contactNameToID(ctx, workspaceID)
	if err != nil {
		return ImportStats{}, err
	}
	existing, _, err := s.txRepo.List(ctx, workspaceID, 1, 100000, nil, nil, "")
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, tx := range existing {
		seen[tx.Date.Format(time.RFC3339)+"|"+strings.ToLower(tx.Title)+"|"+strconv.FormatFloat(tx.Amount, 'f', 2, 64)] = true
	}
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		title := t.field(row, "title")
		amountStr := t.field(row, "amount")
		if title == "" || amountStr == "" {
			stats.Skipped++
			continue
		}
		amount, perr := strconv.ParseFloat(amountStr, 64)
		if perr != nil {
			stats.Skipped++
			continue
		}
		txType := t.field(row, "type")
		if txType != "income" && txType != "expense" {
			txType = "expense"
		}
		tx := &model.Transaction{
			UserID:      userID,
			WorkspaceID: workspaceID,
			Title:       title,
			Amount:      amount,
			Type:        txType,
			Category:    t.field(row, "category"),
			Notes:       t.field(row, "notes"),
		}
		if d := csvTime(t.field(row, "date")); d != nil {
			tx.Date = *d
		} else {
			tx.Date = time.Now()
		}
		key := tx.Date.Format(time.RFC3339) + "|" + strings.ToLower(title) + "|" + strconv.FormatFloat(amount, 'f', 2, 64)
		if seen[key] {
			stats.Skipped++
			continue
		}
		if cidField := t.field(row, "contacts"); cidField != "" {
			for _, n := range splitSemi(cidField) {
				if id, ok := nameToID[strings.ToLower(n)]; ok {
					tx.ContactIDs = append(tx.ContactIDs, id)
				}
			}
		}
		if err := s.txRepo.Create(ctx, tx); err != nil {
			stats.Skipped++
			continue
		}
		seen[key] = true
		stats.Imported++
	}
	return stats, nil
}

// ImportContactsCSV creates a contact per CSV row (columns matched by header
// name, case-insensitive). Multi-value fields (emails/phones/relationships) are
// split on ";". Contacts with the same name+email are skipped and counted.
// Tags are not associated on CSV import (add them in the UI).
func (s *ExportService) ImportContactsCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	existing, _, err := s.contactRepo.List(ctx, workspaceID, 1, 100000, "", nil)
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, c := range existing {
		seen[strings.ToLower(c.Name)+"|"+firstNonEmpty(c.Email)] = true
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
		c := &model.Contact{UserID: userID, WorkspaceID: workspaceID, Name: name}
		if n := t.field(row, "nickname"); n != "" {
			c.Nickname = n
		}
		if e := t.field(row, "emails"); e != "" {
			c.Email = splitSemi(e)
		}
		if p := t.field(row, "phones"); p != "" {
			c.Phone = splitSemi(p)
		}
		if rel := t.field(row, "relationships"); rel != "" {
			c.RelationshipLabels = splitSemi(rel)
		}
		if n := t.field(row, "notes"); n != "" {
			c.Notes = n
		}
		c.Birthday = csvTime(t.field(row, "birthday"))
		key := strings.ToLower(name) + "|" + firstNonEmpty(c.Email)
		if seen[key] {
			stats.Skipped++
			continue
		}
		if err := s.contactRepo.Create(ctx, c); err != nil {
			stats.Skipped++
			continue
		}
		seen[key] = true
		stats.Imported++
	}
	return stats, nil
}

func firstNonEmpty(ss []string) string {
	for _, s := range ss {
		if s != "" {
			return strings.ToLower(s)
		}
	}
	return ""
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
// Todos with the same title+due_time are skipped and counted.
func (s *ExportService) ImportTodosCSV(ctx context.Context, userID, workspaceID uint, csvString string) (ImportStats, error) {
	existing, _, err := s.todoRepo.List(ctx, workspaceID, model.TodoListQuery{Page: 1, PageSize: 100000})
	if err != nil {
		return ImportStats{}, err
	}
	seen := make(map[string]bool, len(existing))
	for _, td := range existing {
		seen[strings.ToLower(td.Title)+"|"+timeToStr(td.DueTime)] = true
	}
	t, err := parseCSVTable(csvString)
	if err != nil || t == nil {
		return ImportStats{}, err
	}
	var stats ImportStats
	for _, row := range t.rows[1:] {
		title := t.field(row, "title")
		if title == "" {
			stats.Skipped++ // skip blank rows
			continue
		}
		todo := &model.Todo{
			UserID:      userID,
			WorkspaceID: workspaceID,
			Title:       title,
			Status:      "pending",
			Priority:    "normal",
		}
		if d := t.field(row, "description"); d != "" {
			todo.Description = d
		}
		if st := t.field(row, "status"); st == "pending" || st == "done" {
			todo.Status = st
		}
		if pr := t.field(row, "priority"); pr == "low" || pr == "normal" || pr == "high" {
			todo.Priority = pr
		}
		todo.DueTime = csvTime(t.field(row, "due_time"))
		if c := t.field(row, "color"); c != "" {
			todo.Color = c
		}
		key := strings.ToLower(title) + "|" + timeToStr(todo.DueTime)
		if seen[key] {
			stats.Skipped++
			continue
		}
		if err := s.todoRepo.Create(ctx, todo); err != nil {
			stats.Skipped++
			continue
		}
		seen[key] = true
		stats.Imported++
	}
	s.notifyImported(ctx, workspaceID)
	return stats, nil
}
