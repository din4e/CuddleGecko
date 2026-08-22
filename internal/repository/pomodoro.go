package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type PomodoroRepo struct {
	db *gorm.DB
}

func NewPomodoroRepo(db *gorm.DB) *PomodoroRepo {
	return &PomodoroRepo{db: db}
}

func (r *PomodoroRepo) Create(ctx context.Context, p *model.PomodoroSession) error {
	if err := r.db.WithContext(ctx).Create(p).Error; err != nil {
		return fmt.Errorf("create pomodoro: %w", err)
	}
	return nil
}

func (r *PomodoroRepo) List(ctx context.Context, workspaceID uint, from, to time.Time) ([]model.PomodoroSession, error) {
	var sessions []model.PomodoroSession
	q := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	if !from.IsZero() {
		q = q.Where("started_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("started_at <= ?", to)
	}
	if err := q.Order("started_at DESC").Limit(500).Find(&sessions).Error; err != nil {
		return nil, fmt.Errorf("list pomodoros: %w", err)
	}
	return sessions, nil
}

// Summary aggregates focus sessions: today's and all-time count + seconds.
func (r *PomodoroRepo) Summary(ctx context.Context, workspaceID uint) (model.PomodoroSummary, error) {
	var s model.PomodoroSummary
	now := time.Now()
	startOfToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	if err := r.db.WithContext(ctx).Model(&model.PomodoroSession{}).
		Where("workspace_id = ? AND kind = ? AND started_at >= ?", workspaceID, "focus", startOfToday).
		Select("COALESCE(COUNT(*),0), COALESCE(SUM(duration_seconds),0)").
		Row().Scan(&s.TodayCount, &s.TodaySeconds); err != nil {
		return s, fmt.Errorf("pomodoro today summary: %w", err)
	}
	if err := r.db.WithContext(ctx).Model(&model.PomodoroSession{}).
		Where("workspace_id = ? AND kind = ?", workspaceID, "focus").
		Select("COALESCE(COUNT(*),0), COALESCE(SUM(duration_seconds),0)").
		Row().Scan(&s.TotalCount, &s.TotalSeconds); err != nil {
		return s, fmt.Errorf("pomodoro total summary: %w", err)
	}
	return s, nil
}
