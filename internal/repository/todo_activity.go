package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

// TodoActivityRepo persists the per-todo audit log (who changed what, when).
type TodoActivityRepo struct {
	db *gorm.DB
}

func NewTodoActivityRepo(db *gorm.DB) *TodoActivityRepo {
	return &TodoActivityRepo{db: db}
}

// CreateBatch appends activity lines in one INSERT. Callers are expected to
// have already verified the todo belongs to the workspace.
func (r *TodoActivityRepo) CreateBatch(ctx context.Context, activities []model.TodoActivity) error {
	if len(activities) == 0 {
		return nil
	}
	if err := r.db.WithContext(ctx).Create(&activities).Error; err != nil {
		return fmt.Errorf("create todo activities: %w", err)
	}
	return nil
}

// List returns a todo's activity lines, newest first.
func (r *TodoActivityRepo) List(ctx context.Context, todoID uint, limit int) ([]model.TodoActivity, error) {
	if limit <= 0 || limit > maxPageSize {
		limit = maxPageSize
	}
	var activities []model.TodoActivity
	if err := r.db.WithContext(ctx).
		Where("todo_id = ?", todoID).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&activities).Error; err != nil {
		return nil, fmt.Errorf("list todo activities: %w", err)
	}
	return activities, nil
}

// TodoCommentRepo persists markdown notes attached to a todo.
type TodoCommentRepo struct {
	db *gorm.DB
}

func NewTodoCommentRepo(db *gorm.DB) *TodoCommentRepo {
	return &TodoCommentRepo{db: db}
}

func (r *TodoCommentRepo) Create(ctx context.Context, comment *model.TodoComment) error {
	if err := r.db.WithContext(ctx).Create(comment).Error; err != nil {
		return fmt.Errorf("create todo comment: %w", err)
	}
	return nil
}

func (r *TodoCommentRepo) GetByID(ctx context.Context, todoID, id uint) (*model.TodoComment, error) {
	var comment model.TodoComment
	if err := r.db.WithContext(ctx).Where("id = ? AND todo_id = ?", id, todoID).First(&comment).Error; err != nil {
		return nil, err
	}
	return &comment, nil
}

// List returns a todo's comments, oldest first (chat-style reading order).
func (r *TodoCommentRepo) List(ctx context.Context, todoID uint) ([]model.TodoComment, error) {
	var comments []model.TodoComment
	if err := r.db.WithContext(ctx).
		Where("todo_id = ?", todoID).
		Order("created_at ASC, id ASC").
		Find(&comments).Error; err != nil {
		return nil, fmt.Errorf("list todo comments: %w", err)
	}
	return comments, nil
}

// Update edits the content only — ownership and todo scoping stay untouched.
func (r *TodoCommentRepo) Update(ctx context.Context, comment *model.TodoComment) error {
	if err := r.db.WithContext(ctx).Model(&model.TodoComment{ID: comment.ID}).
		Update("content", comment.Content).Error; err != nil {
		return fmt.Errorf("update todo comment: %w", err)
	}
	return nil
}

func (r *TodoCommentRepo) Delete(ctx context.Context, id uint) error {
	if err := r.db.WithContext(ctx).Delete(&model.TodoComment{}, id).Error; err != nil {
		return fmt.Errorf("delete todo comment: %w", err)
	}
	return nil
}
