package service

import (
	"context"
	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/stretchr/testify/require"
	"strings"
	"testing"
)

func TestTagService_ValidateAndTrim(t *testing.T) {
	_, db := newTodoServiceWithDB(t)
	svc := NewTagService(repository.NewTagRepo(db))
	ctx := context.Background()
	for _, tag := range []model.Tag{
		{Name: "   "}, {Name: strings.Repeat("界", 51)}, {Name: "valid", Color: "red"},
	} {
		_, err := svc.Create(ctx, 1, 1, &tag)
		require.ErrorIs(t, err, ErrInvalidTag)
	}
	tag, err := svc.Create(ctx, 1, 1, &model.Tag{Name: "  项目  ", Color: "#22c55e"})
	require.NoError(t, err)
	require.Equal(t, "项目", tag.Name)
	_, err = svc.Update(ctx, 1, 1, tag.ID, &model.Tag{Name: "   "})
	require.ErrorIs(t, err, ErrInvalidTag)
}

func TestTodoService_PriorityAndTagValidation(t *testing.T) {
	svc, _ := newTodoServiceWithDB(t)
	ctx := context.Background()
	_, err := svc.Create(ctx, 1, 1, &model.Todo{Title: "bad", Priority: "urgent"})
	require.ErrorIs(t, err, ErrInvalidTodo)
	for _, priority := range []string{"", "none", "low", "normal", "high"} {
		todo, err := svc.Create(ctx, 1, 1, &model.Todo{Title: "task", Priority: priority})
		require.NoError(t, err)
		want := priority
		if want == "" {
			want = "none"
		}
		require.Equal(t, want, todo.Priority)
		_, err = svc.Update(ctx, 1, 1, todo.ID, &model.Todo{Priority: "invalid"}, TodoClear{})
		require.ErrorIs(t, err, ErrInvalidTodo)
		updated, err := svc.Update(ctx, 1, 1, todo.ID, &model.Todo{Title: "renamed"}, TodoClear{})
		require.NoError(t, err)
		require.Equal(t, want, updated.Priority)
		require.ErrorIs(t, svc.ReplaceTags(ctx, 1, 1, todo.ID, []uint{999}), ErrInvalidTodo)
	}
}
