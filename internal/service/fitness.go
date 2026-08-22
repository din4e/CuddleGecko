package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

var (
	ErrLibraryItemNotFound = errors.New("exercise library item not found")
	ErrLibraryItemEmpty    = errors.New("exercise library name is empty")
	ErrLibraryDuplicate    = errors.New("exercise library name already exists")
	ErrTemplateNotFound    = errors.New("workout template not found")
	ErrTemplateEmpty       = errors.New("workout template name is empty")
	ErrSetLogNotFound      = errors.New("set log not found")
	ErrGoalNotFound        = errors.New("fitness goal not found")
	ErrGoalInvalid         = errors.New("invalid fitness goal")
)

// ExerciseLibraryRepository handles reusable movement definitions.
type ExerciseLibraryRepository interface {
	List(ctx context.Context, workspaceID uint, search string) ([]model.ExerciseLibraryItem, error)
	GetByID(ctx context.Context, workspaceID, id uint) (*model.ExerciseLibraryItem, error)
	NameExists(ctx context.Context, workspaceID uint, name string, excludeID uint) (bool, error)
	Create(ctx context.Context, item *model.ExerciseLibraryItem) error
	Update(ctx context.Context, item *model.ExerciseLibraryItem) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

// WorkoutTemplateRepository handles reusable routines.
type WorkoutTemplateRepository interface {
	List(ctx context.Context, workspaceID uint) ([]model.WorkoutTemplate, error)
	GetByID(ctx context.Context, workspaceID, id uint) (*model.WorkoutTemplate, error)
	Create(ctx context.Context, t *model.WorkoutTemplate) error
	Update(ctx context.Context, t *model.WorkoutTemplate) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

// WorkoutSetLogRepository handles per-set training logs.
type WorkoutSetLogRepository interface {
	ListByExercise(ctx context.Context, workoutID, exerciseID uint) ([]model.WorkoutSetLog, error)
	GetByID(ctx context.Context, workoutID, exerciseID, id uint) (*model.WorkoutSetLog, error)
	Create(ctx context.Context, log *model.WorkoutSetLog) error
	Update(ctx context.Context, log *model.WorkoutSetLog) error
	Delete(ctx context.Context, workoutID, exerciseID, id uint) error
	PRs(ctx context.Context, workspaceID uint) ([]model.ExercisePR, error)
}

// FitnessGoalRepository handles fitness goals.
type FitnessGoalRepository interface {
	List(ctx context.Context, workspaceID uint) ([]model.FitnessGoal, error)
	GetByID(ctx context.Context, workspaceID, id uint) (*model.FitnessGoal, error)
	Create(ctx context.Context, g *model.FitnessGoal) error
	Update(ctx context.Context, g *model.FitnessGoal) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

// FitnessService covers the extended fitness features: exercise library,
// workout templates, per-set logs / PRs and goals.
type FitnessService struct {
	libRepo    ExerciseLibraryRepository
	tplRepo    WorkoutTemplateRepository
	setRepo    WorkoutSetLogRepository
	goalRepo   FitnessGoalRepository
	workoutSvc *WorkoutService
	workoutRepo WorkoutRepository
	exRepo     WorkoutExerciseRepository
	bodyRepo   BodyMetricRepository
}

func NewFitnessService(
	libRepo ExerciseLibraryRepository,
	tplRepo WorkoutTemplateRepository,
	setRepo WorkoutSetLogRepository,
	goalRepo FitnessGoalRepository,
	workoutSvc *WorkoutService,
) *FitnessService {
	return &FitnessService{
		libRepo:    libRepo,
		tplRepo:    tplRepo,
		setRepo:    setRepo,
		goalRepo:   goalRepo,
		workoutSvc: workoutSvc,
		workoutRepo: workoutSvc.repo,
		exRepo:     workoutSvc.exRepo,
		bodyRepo:   workoutSvc.bodyRepo,
	}
}

// --- Exercise library ---

func (s *FitnessService) ListLibrary(ctx context.Context, userID, workspaceID uint, search string) ([]model.ExerciseLibraryItem, error) {
	return s.libRepo.List(ctx, workspaceID, strings.TrimSpace(search))
}

func (s *FitnessService) CreateLibraryItem(ctx context.Context, userID, workspaceID uint, item *model.ExerciseLibraryItem) (*model.ExerciseLibraryItem, error) {
	item.UserID = userID
	item.WorkspaceID = workspaceID
	item.Name = strings.TrimSpace(item.Name)
	if item.Name == "" {
		return nil, ErrLibraryItemEmpty
	}
	if dup, err := s.libRepo.NameExists(ctx, workspaceID, item.Name, 0); err != nil {
		return nil, err
	} else if dup {
		return nil, ErrLibraryDuplicate
	}
	if err := s.libRepo.Create(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *FitnessService) UpdateLibraryItem(ctx context.Context, userID, workspaceID, id uint, item *model.ExerciseLibraryItem) (*model.ExerciseLibraryItem, error) {
	existing, err := s.libRepo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrLibraryItemNotFound
	}
	item.Name = strings.TrimSpace(item.Name)
	if item.Name == "" {
		return nil, ErrLibraryItemEmpty
	}
	if dup, err := s.libRepo.NameExists(ctx, workspaceID, item.Name, id); err != nil {
		return nil, err
	} else if dup {
		return nil, ErrLibraryDuplicate
	}
	item.ID = existing.ID
	item.UserID = existing.UserID
	item.WorkspaceID = existing.WorkspaceID
	if err := s.libRepo.Update(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *FitnessService) DeleteLibraryItem(ctx context.Context, userID, workspaceID, id uint) error {
	err := s.libRepo.Delete(ctx, workspaceID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrLibraryItemNotFound
	}
	return err
}

// --- Workout templates ---

func (s *FitnessService) ListTemplates(ctx context.Context, userID, workspaceID uint) ([]model.WorkoutTemplate, error) {
	return s.tplRepo.List(ctx, workspaceID)
}

func (s *FitnessService) GetTemplate(ctx context.Context, userID, workspaceID, id uint) (*model.WorkoutTemplate, error) {
	t, err := s.tplRepo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTemplateNotFound
	}
	return t, nil
}

func (s *FitnessService) validateTemplate(ctx context.Context, workspaceID uint, t *model.WorkoutTemplate) error {
	t.Name = strings.TrimSpace(t.Name)
	if t.Name == "" {
		return ErrTemplateEmpty
	}
	if t.Type == "" {
		t.Type = "other"
	}
	return nil
}

func (s *FitnessService) CreateTemplate(ctx context.Context, userID, workspaceID uint, t *model.WorkoutTemplate) (*model.WorkoutTemplate, error) {
	if err := s.validateTemplate(ctx, workspaceID, t); err != nil {
		return nil, err
	}
	t.UserID = userID
	t.WorkspaceID = workspaceID
	if err := s.tplRepo.Create(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *FitnessService) UpdateTemplate(ctx context.Context, userID, workspaceID, id uint, t *model.WorkoutTemplate) (*model.WorkoutTemplate, error) {
	existing, err := s.tplRepo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTemplateNotFound
	}
	if err := s.validateTemplate(ctx, workspaceID, t); err != nil {
		return nil, err
	}
	t.ID = existing.ID
	t.UserID = existing.UserID
	t.WorkspaceID = existing.WorkspaceID
	if err := s.tplRepo.Update(ctx, t); err != nil {
		return nil, err
	}
	return s.tplRepo.GetByID(ctx, workspaceID, id)
}

func (s *FitnessService) DeleteTemplate(ctx context.Context, userID, workspaceID, id uint) error {
	err := s.tplRepo.Delete(ctx, workspaceID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrTemplateNotFound
	}
	return err
}

// Instantiate creates a planned workout from a template (with its exercises)
// in a single transaction.
func (s *FitnessService) InstantiateTemplate(ctx context.Context, userID, workspaceID, id uint, scheduledAt *time.Time) (*model.Workout, error) {
	tpl, err := s.tplRepo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrTemplateNotFound
	}

	w := &model.Workout{
		UserID:      userID,
		WorkspaceID: workspaceID,
		Name:        tpl.Name,
		Type:        tpl.Type,
		Status:      model.WorkoutStatusPlanned,
		Notes:       tpl.Notes,
		ScheduledAt: scheduledAt,
	}
	exercises := make([]model.WorkoutExercise, 0, len(tpl.Items))
	for _, it := range tpl.Items {
		exercises = append(exercises, model.WorkoutExercise{
			Name:        it.Name,
			Category:    it.Category,
			Sets:        it.Sets,
			Reps:        it.Reps,
			Weight:      it.Weight,
			Distance:    it.Distance,
			DurationSec: it.DurationSec,
			RestSec:     it.RestSec,
			Notes:       it.Notes,
		})
	}
	if err := s.workoutRepo.CreateWithExercises(ctx, w, exercises); err != nil {
		return nil, err
	}
	return w, nil
}

// --- Set logs / PRs ---

func (s *FitnessService) ListSetLogs(ctx context.Context, userID, workspaceID, workoutID, exerciseID uint) ([]model.WorkoutSetLog, error) {
	if err := s.workoutSvc.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return nil, err
	}
	if _, err := s.exRepo.GetExercise(ctx, workoutID, exerciseID); err != nil {
		return nil, ErrExerciseNotFound
	}
	return s.setRepo.ListByExercise(ctx, workoutID, exerciseID)
}

func (s *FitnessService) CreateSetLog(ctx context.Context, userID, workspaceID, workoutID, exerciseID uint, log *model.WorkoutSetLog) (*model.WorkoutSetLog, error) {
	if err := s.workoutSvc.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return nil, err
	}
	if _, err := s.exRepo.GetExercise(ctx, workoutID, exerciseID); err != nil {
		return nil, ErrExerciseNotFound
	}
	log.ID = 0
	log.WorkoutID = workoutID
	log.ExerciseID = exerciseID
	if err := s.setRepo.Create(ctx, log); err != nil {
		return nil, err
	}
	return log, nil
}

func (s *FitnessService) UpdateSetLog(ctx context.Context, userID, workspaceID, workoutID, exerciseID, id uint, log *model.WorkoutSetLog) (*model.WorkoutSetLog, error) {
	if err := s.workoutSvc.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return nil, err
	}
	existing, err := s.setRepo.GetByID(ctx, workoutID, exerciseID, id)
	if err != nil {
		return nil, ErrSetLogNotFound
	}
	log.ID = existing.ID
	log.WorkoutID = workoutID
	log.ExerciseID = exerciseID
	if log.SetIndex == 0 {
		log.SetIndex = existing.SetIndex
	}
	if err := s.setRepo.Update(ctx, log); err != nil {
		return nil, err
	}
	return log, nil
}

func (s *FitnessService) DeleteSetLog(ctx context.Context, userID, workspaceID, workoutID, exerciseID, id uint) error {
	if err := s.workoutSvc.ensureWorkoutOwned(ctx, workspaceID, workoutID); err != nil {
		return err
	}
	err := s.setRepo.Delete(ctx, workoutID, exerciseID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrSetLogNotFound
	}
	return err
}

func (s *FitnessService) PRs(ctx context.Context, userID, workspaceID uint) ([]model.ExercisePR, error) {
	return s.setRepo.PRs(ctx, workspaceID)
}

// --- Goals ---

func (s *FitnessService) validateGoal(g *model.FitnessGoal) error {
	switch g.Type {
	case model.FitnessGoalWeeklyWorkouts, model.FitnessGoalWeightTarget:
	default:
		return ErrGoalInvalid
	}
	if g.TargetValue <= 0 {
		return ErrGoalInvalid
	}
	if g.Status == "" {
		g.Status = "active"
	}
	return nil
}

func (s *FitnessService) ListGoals(ctx context.Context, userID, workspaceID uint) ([]model.FitnessGoalWithProgress, error) {
	goals, err := s.goalRepo.List(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	out := make([]model.FitnessGoalWithProgress, 0, len(goals))
	for _, g := range goals {
		out = append(out, model.FitnessGoalWithProgress{FitnessGoal: g})
	}
	if err := s.fillGoalProgress(ctx, workspaceID, out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *FitnessService) CreateGoal(ctx context.Context, userID, workspaceID uint, g *model.FitnessGoal) (*model.FitnessGoalWithProgress, error) {
	if err := s.validateGoal(g); err != nil {
		return nil, err
	}
	g.UserID = userID
	g.WorkspaceID = workspaceID
	if err := s.goalRepo.Create(ctx, g); err != nil {
		return nil, err
	}
	out := []model.FitnessGoalWithProgress{{FitnessGoal: *g}}
	if err := s.fillGoalProgress(ctx, workspaceID, out); err != nil {
		return nil, err
	}
	return &out[0], nil
}

func (s *FitnessService) UpdateGoal(ctx context.Context, userID, workspaceID, id uint, g *model.FitnessGoal) (*model.FitnessGoalWithProgress, error) {
	existing, err := s.goalRepo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrGoalNotFound
	}
	if err := s.validateGoal(g); err != nil {
		return nil, err
	}
	g.ID = existing.ID
	g.UserID = existing.UserID
	g.WorkspaceID = existing.WorkspaceID
	if err := s.goalRepo.Update(ctx, g); err != nil {
		return nil, err
	}
	updated, err := s.goalRepo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, err
	}
	out := []model.FitnessGoalWithProgress{{FitnessGoal: *updated}}
	if err := s.fillGoalProgress(ctx, workspaceID, out); err != nil {
		return nil, err
	}
	return &out[0], nil
}

func (s *FitnessService) DeleteGoal(ctx context.Context, userID, workspaceID, id uint) error {
	err := s.goalRepo.Delete(ctx, workspaceID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrGoalNotFound
	}
	return err
}

// fillGoalProgress computes each goal's current value: weekly_workouts uses
// this week's completed count from the stats aggregate; weight_target uses the
// latest recorded weight.
func (s *FitnessService) fillGoalProgress(ctx context.Context, workspaceID uint, goals []model.FitnessGoalWithProgress) error {
	var stats *model.WorkoutStats
	var body *model.BodyMetricSummary
	for i := range goals {
		switch goals[i].Type {
		case model.FitnessGoalWeeklyWorkouts:
			if stats == nil {
				st, err := s.workoutRepo.Stats(ctx, workspaceID)
				if err != nil {
					return err
				}
				stats = &st
			}
			v := float64(stats.ThisWeek)
			goals[i].CurrentValue = &v
		case model.FitnessGoalWeightTarget:
			if body == nil {
				b, err := s.bodyRepo.Summary(ctx, workspaceID)
				if err != nil {
					return err
				}
				body = &b
			}
			if body.LatestWeight != nil {
				w := *body.LatestWeight
				goals[i].CurrentValue = &w
			}
		}
	}
	return nil
}
