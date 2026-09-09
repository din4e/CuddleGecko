package repository

import (
	"context"
	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestTagSearch_WorkspacePaginationAndLiteralWildcards(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTagRepo(db)
	ctx := context.Background()
	for _, tag := range []model.Tag{
		{UserID: 1, WorkspaceID: 1, Name: "Release one"},
		{UserID: 1, WorkspaceID: 1, Name: "Release two"},
		{UserID: 1, WorkspaceID: 2, Name: "Release private"},
		{UserID: 1, WorkspaceID: 1, Name: "100%_done!"},
	} {
		require.NoError(t, db.Create(&tag).Error)
	}
	tags, total, err := repo.List(ctx, 1, 2, 1, " RELEASE ")
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Len(t, tags, 1)
	require.Equal(t, "Release two", tags[0].Name)
	tags, total, err = repo.List(ctx, 1, 1, 50, "%_done!")
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Equal(t, "100%_done!", tags[0].Name)
}

func TestTodoTags_RejectForeignOrMissingTagsWithoutChangingSelection(t *testing.T) {
	db := newTodoTestDB(t)
	repo := NewTodoRepo(db)
	ctx := context.Background()
	todo := mustCreateTodo(t, repo, 1, "task")
	a := model.Tag{UserID: 1, WorkspaceID: 1, Name: "a"}
	b := model.Tag{UserID: 1, WorkspaceID: 1, Name: "b"}
	foreign := model.Tag{UserID: 2, WorkspaceID: 2, Name: "private"}
	for _, tag := range []*model.Tag{&a, &b, &foreign} {
		require.NoError(t, db.Create(tag).Error)
	}
	require.NoError(t, repo.ReplaceTags(ctx, todo.ID, []model.Tag{{ID: a.ID}, {ID: b.ID}, {ID: a.ID}}))
	for _, id := range []uint{foreign.ID, 9999, 0} {
		require.ErrorIs(t, repo.ReplaceTags(ctx, todo.ID, []model.Tag{{ID: id}}), model.ErrInvalidTagIDs)
		tags, err := repo.GetTags(ctx, todo.ID)
		require.NoError(t, err)
		require.Len(t, tags, 2)
	}
	var count int64
	require.NoError(t, db.Model(&model.Tag{}).Count(&count).Error)
	require.EqualValues(t, 3, count, "invalid IDs never create phantom tags")
	require.NoError(t, repo.ReplaceTags(ctx, todo.ID, nil))
	tags, err := repo.GetTags(ctx, todo.ID)
	require.NoError(t, err)
	require.Empty(t, tags)
}

func TestTodoPriority_DefaultAndMigrationPreserveExplicitValues(t *testing.T) {
	db := newTodoTestDB(t)
	explicit := model.Todo{UserID: 1, WorkspaceID: 1, Title: "existing", Priority: "normal"}
	require.NoError(t, db.Create(&explicit).Error)
	require.NoError(t, db.AutoMigrate(&model.Todo{}))
	var loaded model.Todo
	require.NoError(t, db.First(&loaded, explicit.ID).Error)
	require.Equal(t, "normal", loaded.Priority)
	fresh := model.Todo{UserID: 1, WorkspaceID: 1, Title: "default"}
	require.NoError(t, db.Create(&fresh).Error)
	require.Equal(t, "none", fresh.Priority)
	require.NoError(t, db.Exec("INSERT INTO todos (user_id, workspace_id, title) VALUES (1, 1, 'raw default')").Error)
	require.NoError(t, db.Where("title = ?", "raw default").First(&model.Todo{}).Scan(&loaded).Error)
	require.Equal(t, "none", loaded.Priority)
}
