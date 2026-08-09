package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

var (
	ErrWorkoutNotFound  = errors.New("workout not found")
	ErrExerciseNotFound = errors.New("exercise not found")
	ErrExerciseEmpty    = errors.New("exercise name is empty")
	ErrBodyMetricNotFound = errors.New("body metric not found")
)

// WorkoutRepository handles workout persistence.
type WorkoutRepository interface {
	Create(ctx context.Context, w *model.Workout) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Workout, error)
	List(ctx context.Context, workspaceID uint, q model.WorkoutListQuery) ([]model.Workout, int64, error)
	Update(ctx context.Context, w *model.Workout) error
	Delete(ctx context.Context, workspaceID, id uint) error
	Reorder(ctx context.Context, workspaceID, id uint, afterID *uint) error
	Stats(ctx context.Context, workspaceID uint) (model.WorkoutStats, error)
}

// WorkoutExerciseRepository handles the checklist of movements within a workout.
type WorkoutExerciseRepository interface {
	ListExercises(ctx context.Context, workoutID uint) ([]model.WorkoutExercise, error)
	GetExercise(ctx context.Context, workoutID, exerciseID uint) (*model.WorkoutExercise, error)
	CreateExercise(ctx context.Context, ex *model.WorkoutExercise) error
	UpdateExercise(ctx context.Context, workoutID uint, ex *model.WorkoutExercise) error
	SetExerciseDone(ctx context.Context, workoutID, exerciseID uint, done bool) error
	DeleteExercise(ctx context.Context, workoutID, exerciseID uint) error
	ReorderExercise(ctx context.Context, workoutID, exerciseID uint, afterExerciseID *uint) error
}

// BodyMetricRepository handles time-series body / health records.
type BodyMetricRepository interface {
	Create(ctx context.Context, m *model.BodyMetric) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.BodyMetric, error)
	List(ctx context.Context, workspaceID uint, page, pageSize int) ([]model.BodyMetric, int64, error)
	Update(ctx context.Context, m *model.BodyMetric) error
	Delete(ctx context.Context, workspaceID, id uint) error
	Summary(ctx context.Context, workspaceID uint) (model.BodyMetricSummary, error)
}

// WorkoutClear flags which nullable workout fields should be explicitly cleared
// during an update (patch semantics) rather than left untouched.
type WorkoutClear struct {
	ScheduledAt bool
	DurationMin bool
	Calories    bool
}

type WorkoutService struct {
	repo      WorkoutRepository
	exRepo    WorkoutExerciseRepository
	bodyRepo  BodyMetricRepository
}

func NewWorkoutService(repo WorkoutRepository, exRepo WorkoutExerciseRepository, bodyRepo BodyMetricRepository) *WorkoutService {
	return &WorkoutService{repo: repo, exRepo: exRepo, bodyRepo: bodyRepo}
}

// --- Workouts ---

func (s *WorkoutService) Create(ctx context.Context, userID, workspaceID uint, w *model.Workout) (*model.Workout, error) {
	w.UserID = userID
	w.WorkspaceID = workspaceID
	if w.Type == "" {
		w.Type = "other"
	}
	if w.Status == "" {
		w.Status = model.WorkoutStatusPlanned
	}
	if err := s.repo.Create(ctx, w); err != nil {
		return nil, err
	}
	return w, nil
}

func (s *WorkoutService) GetByID(ctx context.Context, userID, workspaceID, id uint) (*model.Workout, error) {
	return s.repo.GetByID(ctx, workspaceID, id)
}

func (s *WorkoutService) List(ctx context.Context, userID, workspaceID uint, q model.WorkoutListQuery) ([]model.Workout, int64, error) {
	return s.repo.List(ctx, workspaceID, q)
}

func (s *WorkoutService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Workout, clear WorkoutClear) (*model.Workout, error) {
	w, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrWorkoutNotFound
	}

	if updates.Name != "" {
		w.Name = updates.Name
	}
	if updates.Type != "" {
		w.Type = updates.Type
	}
	if updates.Status != "" {
		w.Status = updates.Status
		// Keep CompletedAt in sync with the status the caller set directly.
		if updates.Status == model.WorkoutStatusCompleted && w.CompletedAt == nil {
			now := time.Now()
			w.CompletedAt = &now
		} else if updates.Status != model.WorkoutStatusCompleted {
			w.CompletedAt = nil
		}
	}
	w.Intensity = updates.Intensity
	w.Color = updates.Color
	w.Location = updates.Location
	w.Notes = updates.Notes

	if clear.ScheduledAt {
		w.ScheduledAt = nil
	} else if updates.ScheduledAt != nil {
		w.ScheduledAt = updates.ScheduledAt
	}
	if clear.DurationMin {
		w.DurationMin = nil
	} else if updates.DurationMin != nil {
		w.DurationMin = updates.DurationMin
	}
	if clear.Calories {
		w.Calories = nil
	} else if updates.Calories != nil {
		w.Calories = updates.Calories
	}

	if err := s.repo.Update(ctx, w); err != nil {
		return nil, err
	}
	return w, nil
}

// ToggleStatus flips a workout between completed and not-completed, mirroring the
// todo toggle semantics. Completing stamps CompletedAt; un-completing clears it
// and returns the workout to "planned".
func (s *WorkoutService) ToggleStatus(ctx context.Context, userID, workspaceID, id uint) (*model.Workout, error) {
	w, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrWorkoutNotFound
	}

	if w.Status == model.WorkoutStatusCompleted {
		w.Status = model.WorkoutStatusPlanned
		w.CompletedAt = nil
	} else {
		w.Status = model.WorkoutStatusCompleted
		now := time.Now()
		w.CompletedAt = &now
	}

	if err := s.repo.Update(ctx, w); err != nil {
		return nil, err
	}
	return w, nil
}

func (s *WorkoutService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	return s.repo.Delete(ctx, workspaceID, id)
}

func (s *WorkoutService) Reorder(ctx context.Context, userID, workspaceID, id uint, afterID *uint) error {
	if err := s.ensureWorkoutOwned(ctx, workspaceID, id); err != nil {
		return err
	}
	return s.repo.Reorder(ctx, workspaceID, id, afterID)
}

func (s *WorkoutService) Stats(ctx context.Context, userID, workspaceID uint) (model.WorkoutStats, error) {
	return s.repo.Stats(ctx, workspaceID)
}

// --- Exercises ---

// ensureWorkoutOwned returns ErrWorkoutNotFound when the workout does not belong
// to the workspace, so exercise endpoints inherit the same ownership scoping.
func (s *WorkoutService) ensureWorkoutOwned(ctx context.Context, workspaceID, workoutID uint) error {
	if _, err := s.repo.GetByID(ctx, workspaceID, workoutID); err != nil {
		return ErrWorkoutNotFound
	}
	return nil
}

func (s *WorkoutService) ListExercises(ctx context.Context, userID, workspaceID, workoutID uint) ([]model.WorkoutExercise, error) {
	if err := s.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return nil, err
	}
	return s.exRepo.ListExercises(ctx, workoutID)
}

func (s *WorkoutService) CreateExercise(ctx context.Context, userID, workspaceID, workoutID uint, ex *model.WorkoutExercise) (*model.WorkoutExercise, error) {
	if err := s.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return nil, err
	}
	ex.WorkoutID = workoutID
	ex.Name = strings.TrimSpace(ex.Name)
	if ex.Name == "" {
		return nil, ErrExerciseEmpty
	}
	if err := s.exRepo.CreateExercise(ctx, ex); err != nil {
		return nil, err
	}
	return ex, nil
}

// UpdateExercise writes the descriptive fields of an exercise. The caller supplies
// the full intended exercise state; Done is toggled separately.
func (s *WorkoutService) UpdateExercise(ctx context.Context, userID, workspaceID, workoutID, exerciseID uint, ex *model.WorkoutExercise) (*model.WorkoutExercise, error) {
	if err := s.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return nil, err
	}
	existing, err := s.exRepo.GetExercise(ctx, workoutID, exerciseID)
	if err != nil {
		return nil, ErrExerciseNotFound
	}
	ex.Name = strings.TrimSpace(ex.Name)
	if ex.Name == "" {
		return nil, ErrExerciseEmpty
	}
	ex.ID = existing.ID
	ex.WorkoutID = workoutID
	if err := s.exRepo.UpdateExercise(ctx, workoutID, ex); err != nil {
		return nil, err
	}
	return ex, nil
}

func (s *WorkoutService) ToggleExercise(ctx context.Context, userID, workspaceID, workoutID, exerciseID uint) (*model.WorkoutExercise, error) {
	if err := s.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return nil, err
	}
	existing, err := s.exRepo.GetExercise(ctx, workoutID, exerciseID)
	if err != nil {
		return nil, ErrExerciseNotFound
	}
	if err := s.exRepo.SetExerciseDone(ctx, workoutID, exerciseID, !existing.Done); err != nil {
		return nil, err
	}
	existing.Done = !existing.Done
	return existing, nil
}

func (s *WorkoutService) DeleteExercise(ctx context.Context, userID, workspaceID, workoutID, exerciseID uint) error {
	if err := s.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return err
	}
	if _, err := s.exRepo.GetExercise(ctx, workoutID, exerciseID); err != nil {
		return ErrExerciseNotFound
	}
	return s.exRepo.DeleteExercise(ctx, workoutID, exerciseID)
}

func (s *WorkoutService) ReorderExercise(ctx context.Context, userID, workspaceID, workoutID, exerciseID uint, afterID *uint) error {
	if err := s.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return err
	}
	if _, err := s.exRepo.GetExercise(ctx, workoutID, exerciseID); err != nil {
		return ErrExerciseNotFound
	}
	return s.exRepo.ReorderExercise(ctx, workoutID, exerciseID, afterID)
}

// --- Body metrics ---

func (s *WorkoutService) CreateMetric(ctx context.Context, userID, workspaceID uint, m *model.BodyMetric) (*model.BodyMetric, error) {
	m.UserID = userID
	m.WorkspaceID = workspaceID
	if m.RecordedAt.IsZero() {
		m.RecordedAt = time.Now()
	}
	if err := s.bodyRepo.Create(ctx, m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *WorkoutService) ListMetrics(ctx context.Context, userID, workspaceID uint, page, pageSize int) ([]model.BodyMetric, int64, error) {
	return s.bodyRepo.List(ctx, workspaceID, page, pageSize)
}

func (s *WorkoutService) UpdateMetric(ctx context.Context, userID, workspaceID, id uint, m *model.BodyMetric) (*model.BodyMetric, error) {
	if _, err := s.bodyRepo.GetByID(ctx, workspaceID, id); err != nil {
		return nil, ErrBodyMetricNotFound
	}
	m.ID = id
	if m.RecordedAt.IsZero() {
		m.RecordedAt = time.Now()
	}
	if err := s.bodyRepo.Update(ctx, m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *WorkoutService) DeleteMetric(ctx context.Context, userID, workspaceID, id uint) error {
	return s.bodyRepo.Delete(ctx, workspaceID, id)
}

func (s *WorkoutService) BodySummary(ctx context.Context, userID, workspaceID uint) (model.BodyMetricSummary, error) {
	return s.bodyRepo.Summary(ctx, workspaceID)
}
