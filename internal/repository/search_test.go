package repository

import (
	"context"
	"strings"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newSearchTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(
		&model.Contact{}, &model.Interaction{}, &model.Reminder{}, &model.Event{},
		&model.Todo{}, &model.TodoItem{}, &model.Workout{}, &model.WorkoutExercise{},
		&model.Transaction{}, &model.Habit{}, &model.Tag{}, &model.BodyMetric{},
		&model.Whiteboard{}, &model.WhiteboardNode{},
	))
	return db
}

// Seed one matching row for every searchable entity type in workspace 1, plus
// cross-workspace (2) and soft-deleted twins that must NOT surface.
func seedSearchFixtures(t *testing.T, db *gorm.DB, needle string) {
	t.Helper()
	mk := func(v any) {
		require.NoError(t, db.Create(v).Error)
	}

	mk(&model.Contact{UserID: 1, WorkspaceID: 1, Name: "Ada", Nickname: "小艾", Notes: "备注: " + needle, Phone: []string{"13800000000"}})
	mk(&model.Contact{UserID: 2, WorkspaceID: 2, Name: "Other WS", Notes: needle})
	mk(&model.Interaction{UserID: 1, WorkspaceID: 1, ContactID: 1, Type: model.InteractionMeeting, Title: "Kickoff", Content: "聊了 " + needle, OccurredAt: db.NowFunc()})
	mk(&model.Reminder{UserID: 1, WorkspaceID: 1, ContactID: 1, Title: "回访", Description: needle + " 之后", RemindAt: db.NowFunc()})
	mk(&model.Event{UserID: 1, WorkspaceID: 1, Title: "Trip", Location: needle, StartTime: db.NowFunc()})
	mk(&model.Todo{UserID: 1, WorkspaceID: 1, Title: "Plan " + needle})
	mk(&model.Todo{UserID: 1, WorkspaceID: 1, Title: "Hidden"})
	mk(&model.TodoItem{TodoID: 2, Content: "subtask about " + needle})
	mk(&model.Workout{UserID: 1, WorkspaceID: 1, Name: "Leg day", Notes: "focus on " + needle})
	mk(&model.Workout{UserID: 1, WorkspaceID: 1, Name: "Arm day"})
	mk(&model.WorkoutExercise{WorkoutID: 2, Name: "Curl " + needle})
	mk(&model.Transaction{UserID: 1, WorkspaceID: 1, Title: "Lunch", Amount: 30, Type: "expense", Notes: needle, Date: db.NowFunc()})
	mk(&model.Habit{UserID: 1, WorkspaceID: 1, Name: "Read " + needle})
	mk(&model.Tag{UserID: 1, WorkspaceID: 1, Name: needle + "-tag"})
	mk(&model.BodyMetric{UserID: 1, WorkspaceID: 1, Notes: needle, RecordedAt: db.NowFunc()})
	mk(&model.Whiteboard{UserID: 1, WorkspaceID: 1, Name: "Ideas"})
	mk(&model.WhiteboardNode{WhiteboardID: 1, Label: "card " + needle})

	// Soft-deleted twin: trash must not leak into global search.
	deleted := &model.Todo{UserID: 1, WorkspaceID: 1, Title: "deleted " + needle}
	mk(deleted)
	require.NoError(t, db.Delete(deleted).Error)
}

func TestSearchRepo_AllEntityTypes(t *testing.T) {
	db := newSearchTestDB(t)
	seedSearchFixtures(t, db, "needle")
	repo := NewSearchRepo(db)
	ctx := context.Background()

	hits, err := repo.Search(ctx, 1, "needle", nil, 10)
	require.NoError(t, err)

	byType := map[string][]model.SearchHit{}
	for _, h := range hits {
		byType[h.Type] = append(byType[h.Type], h)
	}

	// Every entity type that owns a text field matched. Types with child-table
	// sources (todo subtasks, workout exercises, whiteboard nodes) can carry
	// one direct + one child hit.
	for _, typ := range []string{
		model.SearchTypeContact, model.SearchTypeInteraction, model.SearchTypeReminder,
		model.SearchTypeEvent, model.SearchTypeTransaction, model.SearchTypeHabit,
		model.SearchTypeTag, model.SearchTypeBodyMetric, model.SearchTypeWhiteboard,
	} {
		require.Len(t, byType[typ], 1, "type %s hits: %+v", typ, byType[typ])
	}
	require.Len(t, byType[model.SearchTypeTodo], 2, "direct + subtask todo hits")
	require.Len(t, byType[model.SearchTypeWorkout], 2, "direct + exercise workout hits")

	// No hit may carry an empty title — child-table hits carry the parent's.
	for _, h := range hits {
		assert.NotEmpty(t, h.Title, "type %s hit has empty title: %+v", h.Type, h)
	}

	// Snippets are rune-safe windows around the match.
	contact := byType[model.SearchTypeContact][0]
	assert.Contains(t, contact.Snippet, "needle")
	assert.Contains(t, contact.MatchedFields, "notes")

	// Child-table matches report their own matched field and the parent title.
	var viaExercise, directWorkout *model.SearchHit
	for i, h := range byType[model.SearchTypeWorkout] {
		if len(h.MatchedFields) == 1 && h.MatchedFields[0] == "exercises" {
			viaExercise = &byType[model.SearchTypeWorkout][i]
		} else {
			directWorkout = &byType[model.SearchTypeWorkout][i]
		}
	}
	require.NotNil(t, viaExercise, "exercise-matched workout hit missing: %+v", byType[model.SearchTypeWorkout])
	require.NotNil(t, directWorkout, "direct workout hit missing")
	assert.Equal(t, "Arm day", viaExercise.Title)
	assert.Contains(t, viaExercise.Snippet, "needle")
	assert.Equal(t, "Leg day", directWorkout.Title)

	// No hits from workspace 2 or the soft-deleted row.
	for _, h := range hits {
		assert.NotEqual(t, "Other WS", h.Title, "cross-workspace leak")
		assert.NotEqual(t, "deleted needle", h.Title, "soft-deleted row leaked")
	}

	// Sorted newest-first overall.
	for i := 1; i < len(hits); i++ {
		assert.False(t, hits[i].UpdatedAt.After(hits[i-1].UpdatedAt), "hits not sorted by updated_at desc")
	}
}

func TestSearchRepo_TypeFilterAndCaseFold(t *testing.T) {
	db := newSearchTestDB(t)
	seedSearchFixtures(t, db, "Needle")
	repo := NewSearchRepo(db)
	ctx := context.Background()

	// The repo receives the service-lowercased query; case must not matter.
	hits, err := repo.Search(ctx, 1, "needle", []string{model.SearchTypeContact}, 10)
	require.NoError(t, err)
	require.Len(t, hits, 1)
	assert.Equal(t, model.SearchTypeContact, hits[0].Type)
	assert.Equal(t, "Ada", hits[0].Title)
	assert.Equal(t, "小艾", hits[0].Subtitle)

	// CJK substring matching.
	hits, err = repo.Search(ctx, 1, "小艾", []string{model.SearchTypeContact}, 10)
	require.NoError(t, err)
	require.Len(t, hits, 1)
	assert.Contains(t, hits[0].MatchedFields, "nickname")
}

func TestSearchRepo_PerTypeLimit(t *testing.T) {
	db := newSearchTestDB(t)
	for i := 0; i < 5; i++ {
		require.NoError(t, db.Create(&model.Tag{UserID: 1, WorkspaceID: 1, Name: "lim-tag-" + string(rune('a'+i))}).Error)
	}
	repo := NewSearchRepo(db)

	hits, err := repo.Search(context.Background(), 1, "lim-tag", []string{model.SearchTypeTag}, 3)
	require.NoError(t, err)
	assert.Len(t, hits, 3, "per-type limit must cap hits")
}

func TestSearchRepo_SnippetTruncatesLongText(t *testing.T) {
	db := newSearchTestDB(t)
	long := strings.Repeat("前", 200) + "needle" + strings.Repeat("后", 200)
	require.NoError(t, db.Create(&model.Contact{UserID: 1, WorkspaceID: 1, Name: "Long", Notes: long}).Error)
	repo := NewSearchRepo(db)

	hits, err := repo.Search(context.Background(), 1, "needle", []string{model.SearchTypeContact}, 10)
	require.NoError(t, err)
	require.Len(t, hits, 1)
	snippet := []rune(hits[0].Snippet)
	assert.Less(t, len(snippet), 150, "snippet must be a window, not the whole note")
	assert.Contains(t, hits[0].Snippet, "…")
}
