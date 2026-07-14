package service

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrHabitNotFound = errors.New("habit not found")

const habitDateFormat = "2006-01-02"

type HabitRepository interface {
	Create(ctx context.Context, h *model.Habit) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Habit, error)
	List(ctx context.Context, workspaceID uint, includeArchived bool) ([]model.Habit, error)
	Update(ctx context.Context, h *model.Habit) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

type HabitLogRepository interface {
	Toggle(ctx context.Context, userID, workspaceID, habitID uint, date string) (bool, error)
	ListAllByWorkspace(ctx context.Context, workspaceID uint) ([]model.HabitLog, error)
	DeleteByHabit(ctx context.Context, workspaceID, habitID uint) error
}

type HabitService struct {
	repo    HabitRepository
	logRepo HabitLogRepository
}

func NewHabitService(repo HabitRepository, logRepo HabitLogRepository) *HabitService {
	return &HabitService{repo: repo, logRepo: logRepo}
}

func (s *HabitService) Create(ctx context.Context, userID, workspaceID uint, h *model.Habit) (*model.Habit, error) {
	h.UserID = userID
	h.WorkspaceID = workspaceID
	h.ID = 0
	if h.Frequency == "" {
		h.Frequency = "daily"
	}
	if err := s.repo.Create(ctx, h); err != nil {
		return nil, err
	}
	return h, nil
}

func (s *HabitService) List(ctx context.Context, userID, workspaceID uint, includeArchived bool) ([]model.Habit, error) {
	habits, err := s.repo.List(ctx, workspaceID, includeArchived)
	if err != nil {
		return nil, err
	}
	ptrs := make([]*model.Habit, len(habits))
	for i := range habits {
		ptrs[i] = &habits[i]
	}
	s.enrich(ctx, workspaceID, ptrs)
	return habits, nil
}

func (s *HabitService) GetByID(ctx context.Context, userID, workspaceID, id uint) (*model.Habit, error) {
	h, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrHabitNotFound
	}
	s.enrich(ctx, workspaceID, []*model.Habit{h})
	return h, nil
}

func (s *HabitService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Habit) (*model.Habit, error) {
	h, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrHabitNotFound
	}
	if updates.Name != "" {
		h.Name = updates.Name
	}
	h.Color = updates.Color
	h.Emoji = updates.Emoji
	if updates.Frequency != "" {
		h.Frequency = updates.Frequency
	}
	h.Archived = updates.Archived
	if updates.SortOrder != 0 || h.SortOrder == 0 {
		h.SortOrder = updates.SortOrder
	}
	if err := s.repo.Update(ctx, h); err != nil {
		return nil, err
	}
	return h, nil
}

func (s *HabitService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.repo.Delete(ctx, workspaceID, id); err != nil {
		return err
	}
	_ = s.logRepo.DeleteByHabit(ctx, workspaceID, id)
	return nil
}

// Toggle checks in / un-checks a habit for a date (defaults to today).
func (s *HabitService) Toggle(ctx context.Context, userID, workspaceID, id uint, date string) (bool, error) {
	if _, err := s.repo.GetByID(ctx, workspaceID, id); err != nil {
		return false, ErrHabitNotFound
	}
	if date == "" {
		date = time.Now().Format(habitDateFormat)
	}
	return s.logRepo.Toggle(ctx, userID, workspaceID, id, date)
}

// enrich fills the virtual stats fields for a batch of habits from one query.
func (s *HabitService) enrich(ctx context.Context, workspaceID uint, habits []*model.Habit) {
	if len(habits) == 0 {
		return
	}
	logs, err := s.logRepo.ListAllByWorkspace(ctx, workspaceID)
	if err != nil {
		return
	}
	byHabit := make(map[uint][]string)
	for _, l := range logs {
		byHabit[l.HabitID] = append(byHabit[l.HabitID], l.Date)
	}
	today := time.Now()
	todayStr := today.Format(habitDateFormat)
	windowStart := today.AddDate(0, 0, -34) // last 35 days for the heatmap

	for _, h := range habits {
		dates := uniqueSorted(byHabit[h.ID])
		set := make(map[string]bool, len(dates))
		for _, d := range dates {
			set[d] = true
		}

		// current streak (allow counting up to yesterday if today not done)
		cursor := today
		if !set[cursor.Format(habitDateFormat)] {
			cursor = cursor.AddDate(0, 0, -1)
		}
		streak := 0
		for set[cursor.Format(habitDateFormat)] {
			streak++
			cursor = cursor.AddDate(0, 0, -1)
		}

		// longest run
		best := 0
		run := 0
		var prev time.Time
		for _, d := range dates {
			t, err := time.Parse(habitDateFormat, d)
			if err != nil {
				continue
			}
			if run == 0 || (!prev.IsZero() && t.Equal(prev.AddDate(0, 0, 1))) {
				run++
			} else {
				run = 1
			}
			if run > best {
				best = run
			}
			prev = t
		}

		// 30-day completion rate (denominator capped by habit age)
		denom := 30
		age := int(today.Sub(h.CreatedAt.Truncate(24*time.Hour)).Hours() / 24)
		if age+1 < denom {
			denom = age + 1
		}
		if denom < 1 {
			denom = 1
		}
		done := 0
		start30 := today.AddDate(0, 0, -29)
		for _, d := range dates {
			t, err := time.Parse(habitDateFormat, d)
			if err != nil {
				continue
			}
			if !t.Before(start30) && !t.After(today) {
				done++
			}
		}

		// recent window for heatmap
		recent := []string{}
		for _, d := range dates {
			t, err := time.Parse(habitDateFormat, d)
			if err != nil {
				continue
			}
			if !t.Before(windowStart) {
				recent = append(recent, d)
			}
		}

		h.TodayDone = set[todayStr]
		h.Streak = streak
		h.Best = best
		rate := float64(done) / float64(denom)
		if rate > 1 {
			rate = 1
		}
		h.Rate30 = rate
		h.Recent = recent
	}
}

func uniqueSorted(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}
