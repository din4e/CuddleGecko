package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newExportTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(
		&model.Contact{}, &model.Tag{}, &model.Tagging{}, &model.Interaction{}, &model.Reminder{},
		&model.ContactRelation{}, &model.Todo{}, &model.TodoItem{}, &model.Transaction{}, &model.Event{},
	))
	return db
}

// TestExport_TodoRoundTrip verifies todos (with checklist items, tags, and
// contact links) survive an export → import into a fresh workspace.
func TestExport_TodoRoundTrip(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo)
	ctx := context.Background()

	// Seed workspace 1: a tag, a contact, and a todo with an item + tag + contact link.
	tag := &model.Tag{UserID: 1, WorkspaceID: 1, Name: "work"}
	require.NoError(t, tagRepo.Create(ctx, tag))
	contact := &model.Contact{UserID: 1, WorkspaceID: 1, Name: "Alice"}
	require.NoError(t, contactRepo.Create(ctx, contact))
	todo := &model.Todo{
		UserID: 1, WorkspaceID: 1, Title: "ship", Status: "pending", Priority: "high",
		ContactIDs: []uint{contact.ID}, Color: "#ff0000", Repeat: "daily", RepeatInterval: 2, Pinned: true,
	}
	require.NoError(t, todoRepo.Create(ctx, todo))
	require.NoError(t, todoRepo.ReplaceTags(ctx, todo.ID, []model.Tag{*tag}))
	require.NoError(t, todoRepo.CreateItem(ctx, &model.TodoItem{TodoID: todo.ID, Content: "step1", Done: true}))

	jsonStr, err := svc.ExportJSON(ctx, 1)
	require.NoError(t, err)
	require.NotEmpty(t, jsonStr)

	// Import into a fresh workspace.
	require.NoError(t, svc.ImportJSON(ctx, 2, 2, jsonStr))

	todos, total, err := todoRepo.List(ctx, 2, model.TodoListQuery{Page: 1, PageSize: 100})
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, todos, 1)
	got := todos[0]

	assert.Equal(t, "ship", got.Title)
	assert.Equal(t, "high", got.Priority)
	assert.Equal(t, "#ff0000", got.Color)
	assert.Equal(t, "daily", got.Repeat)
	assert.Equal(t, 2, got.RepeatInterval)
	assert.True(t, got.Pinned)
	require.Len(t, got.Tags, 1)
	assert.Equal(t, "work", got.Tags[0].Name)

	// Contact link remapped to the new contact's id in workspace 2.
	contacts2, _, err := contactRepo.List(ctx, 2, 1, 100, "", nil)
	require.NoError(t, err)
	require.Len(t, contacts2, 1)
	assert.Equal(t, []uint{contacts2[0].ID}, got.ContactIDs)

	// Item imported and counts synced.
	items, err := todoRepo.ListItems(ctx, got.ID)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, "step1", items[0].Content)
	assert.True(t, items[0].Done)
	assert.Equal(t, 1, got.ItemTotal)
	assert.Equal(t, 1, got.ItemDone)
}

// TestExport_TodoNestingRoundTrip verifies the parent/child tree survives
// export → import: parent_ids are remapped from source ids to the new ids, and
// a child is never created before its parent.
func TestExport_TodoNestingRoundTrip(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo)
	ctx := context.Background()

	parent := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "parent", Status: "pending", Priority: "normal"}
	child := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "child", Status: "pending", Priority: "normal"}
	grand := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "grand", Status: "pending", Priority: "normal"}
	require.NoError(t, todoRepo.Create(ctx, parent))
	require.NoError(t, todoRepo.Create(ctx, child))
	require.NoError(t, todoRepo.Create(ctx, grand))
	require.NoError(t, todoRepo.Move(ctx, 1, child.ID, &parent.ID, nil)) // child under parent
	require.NoError(t, todoRepo.Move(ctx, 1, grand.ID, &child.ID, nil))  // grand under child

	jsonStr, err := svc.ExportJSON(ctx, 1)
	require.NoError(t, err)

	require.NoError(t, svc.ImportJSON(ctx, 2, 2, jsonStr))

	todos, _, err := todoRepo.List(ctx, 2, model.TodoListQuery{Page: 1, PageSize: 100})
	require.NoError(t, err)
	require.Len(t, todos, 3)
	byTitle := make(map[string]model.Todo, len(todos))
	for _, td := range todos {
		byTitle[td.Title] = td
	}
	p2 := byTitle["parent"]
	c2 := byTitle["child"]
	g2 := byTitle["grand"]

	assert.Nil(t, p2.ParentID, "imported parent should be a root")
	require.NotNil(t, c2.ParentID)
	assert.Equal(t, p2.ID, *c2.ParentID, "child nested under the imported parent")
	require.NotNil(t, g2.ParentID)
	assert.Equal(t, c2.ID, *g2.ParentID, "grandchild nested under the imported child")
}

// TestExport_TodosCSV verifies the CSV export emits a header row and one row
// per todo, with proper escaping.
func TestExport_TodosCSV(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo)
	ctx := context.Background()

	require.NoError(t, todoRepo.Create(ctx, &model.Todo{
		UserID: 1, WorkspaceID: 1, Title: "ship it", Status: "pending", Priority: "high",
		Description: "desc, with comma",
	}))

	out, err := svc.ExportTodosCSV(ctx, 1)
	require.NoError(t, err)
	require.NotEmpty(t, out)

	lines := strings.Split(strings.TrimSpace(out), "\n")
	require.GreaterOrEqual(t, len(lines), 2, "header + at least one row")
	assert.Contains(t, lines[0], "title", "header has title column")
	assert.Contains(t, lines[0], "priority")
	// A field containing a comma must be quoted by the CSV writer.
	assert.Contains(t, out, `"desc, with comma"`)
	assert.Contains(t, out, "ship it")
}

// TestExport_TodosCSVImport verifies CSV import maps columns by header name and
// creates a flat todo per row (status/priority validated, blank rows skipped).
func TestExport_TodosCSVImport(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo)
	ctx := context.Background()

	csv := "title,description,status,priority\n" +
		"ship it,desc,pending,high\n" +
		",blank skipped,,\n" +
		"second,,done,low\n"
	n, err := svc.ImportTodosCSV(ctx, 5, 9, csv)
	require.NoError(t, err)
	assert.Equal(t, 2, n, "two non-blank rows imported")

	todos, _, err := todoRepo.List(ctx, 9, model.TodoListQuery{Page: 1, PageSize: 100})
	require.NoError(t, err)
	require.Len(t, todos, 2, "blank-title row should be skipped")
	byTitle := make(map[string]model.Todo, len(todos))
	for _, td := range todos {
		byTitle[td.Title] = td
	}
	first := byTitle["ship it"]
	assert.Equal(t, uint(9), first.WorkspaceID)
	assert.Equal(t, "high", first.Priority)
	assert.Equal(t, "desc", first.Description)
	assert.Equal(t, "pending", first.Status)
	assert.Equal(t, "done", byTitle["second"].Status)
}

// TestExport_Import_EmitsNotifier verifies imports fan out a workspace-wide
// refresh so other connected devices see the imported todos.
func TestExport_Import_EmitsNotifier(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)

	n := &captureNotifier{}
	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo, WithExportNotifier(n))
	ctx := context.Background()

	_, err := svc.ImportTodosCSV(ctx, 1, 1, "title,status\nimported,pending\n")
	require.NoError(t, err)
	require.NotEmpty(t, n.events, "CSV import should emit a workspace-wide refresh")
	assert.Equal(t, TodoBulk, n.events[0].kind)
	assert.Equal(t, uint(1), n.events[0].workspaceID)

	n.events = nil
	jsonStr, err := svc.ExportJSON(ctx, 1) // export some data
	require.NoError(t, err)
	require.NoError(t, svc.ImportJSON(ctx, 2, 2, jsonStr))
	require.NotEmpty(t, n.events, "JSON import should also emit a refresh")
}

// TestExport_ContactsCSV verifies contacts CSV export with joined multi-value
// fields and comma quoting.
func TestExport_ContactsCSV(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo)
	ctx := context.Background()

	require.NoError(t, contactRepo.Create(ctx, &model.Contact{
		UserID: 1, WorkspaceID: 1, Name: "Alice", Nickname: "Al",
		Email: []string{"a@x.com", "b@x.com"}, Phone: []string{"123"}, Notes: "note, with comma",
	}))

	out, err := svc.ExportContactsCSV(ctx, 1)
	require.NoError(t, err)
	require.NotEmpty(t, out)
	assert.Contains(t, out, "name", "header present")
	assert.Contains(t, out, "Alice")
	assert.Contains(t, out, "a@x.com; b@x.com", "emails joined")
	assert.Contains(t, out, `"note, with comma"`, "comma field quoted")
}

// TestExport_ContactsCSVImport verifies contacts CSV import: header mapping,
// multi-value split, blank-name skip, workspace scoping.
func TestExport_ContactsCSVImport(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo)
	ctx := context.Background()

	csv := "name,nickname,emails,phones\n" +
		"Bob,Bobby,b@x.com; c@x.com,555-1234\n" +
		",skipme,\n"
	cn, cerr := svc.ImportContactsCSV(ctx, 1, 7, csv)
	require.NoError(t, cerr)
	assert.Equal(t, 1, cn, "one non-blank contact imported")

	contacts, _, err := contactRepo.List(ctx, 7, 1, 100, "", nil)
	require.NoError(t, err)
	require.Len(t, contacts, 1, "blank-name row should be skipped")
	c := contacts[0]
	assert.Equal(t, uint(7), c.WorkspaceID)
	assert.Equal(t, "Bob", c.Name)
	assert.Equal(t, "Bobby", c.Nickname)
	assert.Equal(t, []string{"b@x.com", "c@x.com"}, c.Email)
	assert.Equal(t, []string{"555-1234"}, c.Phone)
}

// TestExport_TransactionsCSV verifies transactions CSV export.
func TestExport_TransactionsCSV(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)
	txRepo := repository.NewTransactionRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo, WithTransactionRepo(txRepo))
	ctx := context.Background()

	require.NoError(t, txRepo.Create(ctx, &model.Transaction{
		UserID: 1, WorkspaceID: 1, Title: "Coffee", Amount: 4.5, Type: "expense", Category: "food", Date: time.Now(),
	}))

	out, err := svc.ExportTransactionsCSV(ctx, 1)
	require.NoError(t, err)
	assert.Contains(t, out, "title")
	assert.Contains(t, out, "Coffee")
	assert.Contains(t, out, "expense")
	assert.Contains(t, out, "4.50")
}

// TestExport_TransactionsJSONRoundTrip verifies transactions are included in
// the JSON export and restored on import (the finance-data-in-backup fix).
func TestExport_TransactionsJSONRoundTrip(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)
	txRepo := repository.NewTransactionRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo, WithTransactionRepo(txRepo))
	ctx := context.Background()

	require.NoError(t, txRepo.Create(ctx, &model.Transaction{
		UserID: 1, WorkspaceID: 1, Title: "Salary", Amount: 1000, Type: "income", Date: time.Now(),
	}))

	jsonStr, err := svc.ExportJSON(ctx, 1)
	require.NoError(t, err)
	require.Contains(t, jsonStr, "Salary", "transactions present in JSON export")

	require.NoError(t, svc.ImportJSON(ctx, 2, 2, jsonStr))
	txs, _, err := txRepo.List(ctx, 2, 1, 100, nil, nil, "")
	require.NoError(t, err)
	require.Len(t, txs, 1)
	assert.Equal(t, "Salary", txs[0].Title)
	assert.Equal(t, "income", txs[0].Type)
}

// TestExport_EventsCSV verifies calendar events CSV export.
func TestExport_EventsCSV(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)
	eventRepo := repository.NewEventRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo, WithEventRepo(eventRepo))
	ctx := context.Background()

	require.NoError(t, eventRepo.Create(ctx, &model.Event{
		UserID: 1, WorkspaceID: 1, Title: "Standup", StartTime: time.Now(), Location: "Zoom",
	}))

	out, err := svc.ExportEventsCSV(ctx, 1)
	require.NoError(t, err)
	assert.Contains(t, out, "title")
	assert.Contains(t, out, "Standup")
	assert.Contains(t, out, "Zoom")
}

// TestExport_EventsJSONRoundTrip verifies events are in the JSON export and
// restored on import (calendar data in backup).
func TestExport_EventsJSONRoundTrip(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)
	eventRepo := repository.NewEventRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo, WithEventRepo(eventRepo))
	ctx := context.Background()

	require.NoError(t, eventRepo.Create(ctx, &model.Event{
		UserID: 1, WorkspaceID: 1, Title: "Dentist", StartTime: time.Now(), Location: "Clinic",
	}))

	jsonStr, err := svc.ExportJSON(ctx, 1)
	require.NoError(t, err)
	require.Contains(t, jsonStr, "Dentist", "events present in JSON export")

	require.NoError(t, svc.ImportJSON(ctx, 2, 2, jsonStr))
	events, _, err := eventRepo.List(ctx, 2, 1, 100, nil, nil, "")
	require.NoError(t, err)
	require.Len(t, events, 1)
	assert.Equal(t, "Dentist", events[0].Title)
	assert.Equal(t, "Clinic", events[0].Location)
}

// TestExport_ContactTagsRoundTrip verifies contact tag associations survive
// export → import (previously dropped — todos restored tags, contacts didn't).
func TestExport_ContactTagsRoundTrip(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo)
	ctx := context.Background()

	tag := &model.Tag{UserID: 1, WorkspaceID: 1, Name: "vip", Color: "#ff0000"}
	require.NoError(t, tagRepo.Create(ctx, tag))
	contact := &model.Contact{UserID: 1, WorkspaceID: 1, Name: "Tagged Buddy"}
	require.NoError(t, contactRepo.Create(ctx, contact))
	require.NoError(t, contactRepo.ReplaceTags(ctx, contact.ID, []model.Tag{*tag}))

	jsonStr, err := svc.ExportJSON(ctx, 1)
	require.NoError(t, err)
	require.NoError(t, svc.ImportJSON(ctx, 2, 2, jsonStr))

	contacts2, _, err := contactRepo.List(ctx, 2, 1, 100, "", nil)
	require.NoError(t, err)
	require.Len(t, contacts2, 1)
	tags, err := contactRepo.GetTags(ctx, 2, contacts2[0].ID)
	require.NoError(t, err)
	require.Len(t, tags, 1, "contact tag association should survive the round-trip")
	assert.Equal(t, "vip", tags[0].Name)
}

// TestExport_TransactionsCSVImport verifies transactions CSV import: title+amount
// required, type validated, blank/bad-amount rows skipped, count returned.
func TestExport_TransactionsCSVImport(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)
	txRepo := repository.NewTransactionRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo, WithTransactionRepo(txRepo))
	ctx := context.Background()

	csv := "title,type,amount,category\n" +
		"Salary,income,12000,工资\n" +
		"Coffee,expense,4.5,餐饮\n" +
		",skip,10,x\n" +
		"badrow,expense,notanumber,x\n"
	n, err := svc.ImportTransactionsCSV(ctx, 1, 1, csv)
	require.NoError(t, err)
	assert.Equal(t, 2, n, "two valid rows (blank-title and bad-amount skipped)")

	txs, _, err := txRepo.List(ctx, 1, 1, 100, nil, nil, "")
	require.NoError(t, err)
	require.Len(t, txs, 2)
	byTitle := make(map[string]model.Transaction, len(txs))
	for _, tx := range txs {
		byTitle[tx.Title] = tx
	}
	assert.Equal(t, "income", byTitle["Salary"].Type)
	assert.InDelta(t, 12000.0, byTitle["Salary"].Amount, 0.001)
	assert.Equal(t, "expense", byTitle["Coffee"].Type)
	assert.InDelta(t, 4.5, byTitle["Coffee"].Amount, 0.001)
}
