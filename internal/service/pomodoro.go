package service

import (
	"context"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

type PomodoroRepository interface {
	Create(ctx context.Context, p *model.PomodoroSession) error
	List(ctx context.Context, workspaceID uint, from, to time.Time) ([]model.PomodoroSession, error)
	Summary(ctx context.Context, workspaceID uint) (model.PomodoroSummary, error)
}

type PomodoroService struct {
	repo     PomodoroRepository
	notifier ChangeNotifier
}

func NewPomodoroService(repo PomodoroRepository, notifier ...ChangeNotifier) *PomodoroService {
	return &PomodoroService{repo: repo, notifier: firstNotifier(notifier)}
}

func (s *PomodoroService) Create(ctx context.Context, userID, workspaceID uint, p *model.PomodoroSession) (*model.PomodoroSession, error) {
	p.UserID = userID
	p.WorkspaceID = workspaceID
	p.ID = 0
	if p.Kind == "" {
		p.Kind = "focus"
	}
	if p.DurationSeconds <= 0 {
		p.DurationSeconds = 25 * 60
	}
	if p.StartedAt.IsZero() {
		p.StartedAt = time.Now().Add(-time.Duration(p.DurationSeconds) * time.Second)
	}
	if p.EndedAt.IsZero() {
		p.EndedAt = time.Now()
	}
	if err := s.repo.Create(ctx, p); err != nil {
		return nil, err
	}
	notifyChange(ctx, s.notifier, workspaceID, ResourcePomodoro, ChangeCreated, p.ID, p)
	return p, nil
}

func (s *PomodoroService) List(ctx context.Context, userID, workspaceID uint, from, to time.Time) ([]model.PomodoroSession, error) {
	return s.repo.List(ctx, workspaceID, from, to)
}

func (s *PomodoroService) Summary(ctx context.Context, userID, workspaceID uint) (model.PomodoroSummary, error) {
	return s.repo.Summary(ctx, workspaceID)
}
