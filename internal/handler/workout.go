package handler

import (
	"strconv"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type WorkoutHandler struct {
	svc *service.WorkoutService
}

func NewWorkoutHandler(svc *service.WorkoutService) *WorkoutHandler {
	return &WorkoutHandler{svc: svc}
}

// --- Workout request types ---

type createWorkoutRequest struct {
	Name        string   `json:"name" binding:"required"`
	Type        string   `json:"type"`
	Status      string   `json:"status"`
	Intensity   string   `json:"intensity"`
	ScheduledAt string   `json:"scheduled_at"`
	DurationMin *int     `json:"duration_min"`
	Calories    *float64 `json:"calories"`
	Color       string   `json:"color"`
	Location    string   `json:"location"`
	Notes       string   `json:"notes"`
}

type updateWorkoutRequest struct {
	Name             string   `json:"name"`
	Type             string   `json:"type"`
	Status           string   `json:"status"`
	Intensity        string   `json:"intensity"`
	ScheduledAt      string   `json:"scheduled_at"`
	ClearScheduledAt bool     `json:"clear_scheduled_at"`
	DurationMin      *int     `json:"duration_min"`
	ClearDurationMin bool     `json:"clear_duration_min"`
	Calories         *float64 `json:"calories"`
	ClearCalories    bool     `json:"clear_calories"`
	Color            string   `json:"color"`
	Location         string   `json:"location"`
	Notes            string   `json:"notes"`
}

type reorderWorkoutRequest struct {
	AfterID *uint `json:"after_id"`
}

// --- Exercise request types ---

type exerciseRequest struct {
	Name        string   `json:"name" binding:"required"`
	Category    string   `json:"category"`
	Sets        *int     `json:"sets"`
	Reps        *int     `json:"reps"`
	Weight      *float64 `json:"weight"`
	Distance    *float64 `json:"distance"`
	DurationSec *int     `json:"duration_sec"`
	RestSec     *int     `json:"rest_sec"`
	Notes       string   `json:"notes"`
}

func (r exerciseRequest) toModel(workoutID, id uint) *model.WorkoutExercise {
	return &model.WorkoutExercise{
		ID:          id,
		WorkoutID:   workoutID,
		Name:        r.Name,
		Category:    r.Category,
		Sets:        r.Sets,
		Reps:        r.Reps,
		Weight:      r.Weight,
		Distance:    r.Distance,
		DurationSec: r.DurationSec,
		RestSec:     r.RestSec,
		Notes:       r.Notes,
	}
}

// --- Body metric request types ---

type bodyMetricRequest struct {
	RecordedAt string   `json:"recorded_at"`
	Weight     *float64 `json:"weight"`
	Height     *float64 `json:"height"`
	BodyFat    *float64 `json:"body_fat"`
	MuscleMass *float64 `json:"muscle_mass"`
	RestingHR  *int     `json:"resting_hr"`
	Systolic   *int     `json:"systolic"`
	Diastolic  *int     `json:"diastolic"`
	SleepHours *float64 `json:"sleep_hours"`
	Steps      *int     `json:"steps"`
	Energy     *int     `json:"energy"`
	Mood       *int     `json:"mood"`
	Notes      string   `json:"notes"`
}

func (r bodyMetricRequest) toModel(id uint) (*model.BodyMetric, error) {
	m := &model.BodyMetric{
		ID:          id,
		Weight:      r.Weight,
		Height:      r.Height,
		BodyFat:     r.BodyFat,
		MuscleMass:  r.MuscleMass,
		RestingHR:   r.RestingHR,
		Systolic:    r.Systolic,
		Diastolic:   r.Diastolic,
		SleepHours:  r.SleepHours,
		Steps:       r.Steps,
		Energy:      r.Energy,
		Mood:        r.Mood,
		Notes:       r.Notes,
	}
	if r.RecordedAt != "" {
		t, err := time.Parse(time.RFC3339, r.RecordedAt)
		if err != nil {
			return nil, errInvalidTime
		}
		m.RecordedAt = t
	}
	return m, nil
}

// errInvalidTime is a sentinel so metric handlers can return a 400 for a bad
// timestamp without duplicating the parse/error plumbing.
var errInvalidTime = &invalidTimeError{}

type invalidTimeError struct{}

func (invalidTimeError) Error() string { return "invalid time format" }

// --- ID parsers ---

func (h *WorkoutHandler) parseWorkoutID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid workout id")
		return 0, false
	}
	return uint(id), true
}

func (h *WorkoutHandler) parseExerciseID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("exerciseId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid exercise id")
		return 0, false
	}
	return uint(id), true
}

func (h *WorkoutHandler) parseBodyMetricID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid body metric id")
		return 0, false
	}
	return uint(id), true
}

// --- Workout endpoints ---

func (h *WorkoutHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))

	q := model.WorkoutListQuery{
		Status:   c.Query("status"),
		Type:     c.Query("type"),
		Search:   c.Query("q"),
		Sort:     c.DefaultQuery("sort", model.WorkoutSortScheduled),
		Order:    c.DefaultQuery("order", "asc"),
		Page:     page,
		PageSize: pageSize,
	}
	if t, ok := parseRFC3339Query(c, "date_after"); !ok {
		response.BadRequest(c, "invalid date_after format")
		return
	} else {
		q.DateAfter = t
	}
	if t, ok := parseRFC3339Query(c, "date_before"); !ok {
		response.BadRequest(c, "invalid date_before format")
		return
	} else {
		q.DateBefore = t
	}

	workouts, total, err := h.svc.List(c.Request.Context(), userID, workspaceID, q)
	if err != nil {
		response.InternalError(c, "failed to list workouts")
		return
	}
	response.OKPaginated(c, workouts, total, q.Page, q.PageSize)
}

func (h *WorkoutHandler) Stats(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	stats, err := h.svc.Stats(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to compute workout stats")
		return
	}
	response.OK(c, stats)
}

func (h *WorkoutHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req createWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	w := &model.Workout{
		Name:       req.Name,
		Type:       req.Type,
		Status:     req.Status,
		Intensity:  req.Intensity,
		DurationMin: req.DurationMin,
		Calories:   req.Calories,
		Color:      req.Color,
		Location:   req.Location,
		Notes:      req.Notes,
	}
	if req.ScheduledAt != "" {
		t, err := time.Parse(time.RFC3339, req.ScheduledAt)
		if err != nil {
			response.BadRequest(c, "invalid scheduled_at format")
			return
		}
		w.ScheduledAt = &t
	}

	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, w)
	if err != nil {
		response.InternalError(c, "failed to create workout")
		return
	}
	response.Created(c, result)
}

func (h *WorkoutHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}

	var req updateWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	updates := &model.Workout{
		Name:       req.Name,
		Type:       req.Type,
		Status:     req.Status,
		Intensity:  req.Intensity,
		DurationMin: req.DurationMin,
		Calories:   req.Calories,
		Color:      req.Color,
		Location:   req.Location,
		Notes:      req.Notes,
	}
	clear := service.WorkoutClear{
		ScheduledAt: req.ClearScheduledAt,
		DurationMin: req.ClearDurationMin,
		Calories:    req.ClearCalories,
	}
	if req.ScheduledAt != "" {
		t, err := time.Parse(time.RFC3339, req.ScheduledAt)
		if err != nil {
			response.BadRequest(c, "invalid scheduled_at format")
			return
		}
		updates.ScheduledAt = &t
	}

	result, err := h.svc.Update(c.Request.Context(), userID, workspaceID, id, updates, clear)
	if err != nil {
		if err == service.ErrWorkoutNotFound {
			response.NotFound(c, "workout not found")
			return
		}
		response.InternalError(c, "failed to update workout")
		return
	}
	response.OK(c, result)
}

func (h *WorkoutHandler) ToggleStatus(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}

	result, err := h.svc.ToggleStatus(c.Request.Context(), userID, workspaceID, id)
	if err != nil {
		if err == service.ErrWorkoutNotFound {
			response.NotFound(c, "workout not found")
			return
		}
		response.InternalError(c, "failed to toggle workout")
		return
	}
	response.OK(c, result)
}

func (h *WorkoutHandler) Reorder(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}

	var req reorderWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.Reorder(c.Request.Context(), userID, workspaceID, id, req.AfterID); err != nil {
		if err == service.ErrWorkoutNotFound {
			response.NotFound(c, "workout not found")
			return
		}
		response.InternalError(c, "failed to reorder workout")
		return
	}
	response.OK(c, nil)
}

func (h *WorkoutHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, workspaceID, id); err != nil {
		response.NotFound(c, "workout not found")
		return
	}
	response.OK(c, nil)
}

// --- Exercise endpoints ---

func (h *WorkoutHandler) ListExercises(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}

	items, err := h.svc.ListExercises(c.Request.Context(), userID, workspaceID, workoutID)
	if err != nil {
		if err == service.ErrWorkoutNotFound {
			response.NotFound(c, "workout not found")
			return
		}
		response.InternalError(c, "failed to list exercises")
		return
	}
	response.OK(c, items)
}

func (h *WorkoutHandler) CreateExercise(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}

	var req exerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	ex, err := h.svc.CreateExercise(c.Request.Context(), userID, workspaceID, workoutID, req.toModel(workoutID, 0))
	if err != nil {
		switch err {
		case service.ErrWorkoutNotFound:
			response.NotFound(c, "workout not found")
		case service.ErrExerciseEmpty:
			response.BadRequest(c, "exercise name is required")
		default:
			response.InternalError(c, "failed to create exercise")
		}
		return
	}
	response.Created(c, ex)
}

func (h *WorkoutHandler) UpdateExercise(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}
	exerciseID, ok := h.parseExerciseID(c)
	if !ok {
		return
	}

	var req exerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	ex, err := h.svc.UpdateExercise(c.Request.Context(), userID, workspaceID, workoutID, exerciseID, req.toModel(workoutID, exerciseID))
	if err != nil {
		switch err {
		case service.ErrWorkoutNotFound:
			response.NotFound(c, "workout not found")
		case service.ErrExerciseNotFound:
			response.NotFound(c, "exercise not found")
		case service.ErrExerciseEmpty:
			response.BadRequest(c, "exercise name is required")
		default:
			response.InternalError(c, "failed to update exercise")
		}
		return
	}
	response.OK(c, ex)
}

func (h *WorkoutHandler) ToggleExercise(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}
	exerciseID, ok := h.parseExerciseID(c)
	if !ok {
		return
	}

	ex, err := h.svc.ToggleExercise(c.Request.Context(), userID, workspaceID, workoutID, exerciseID)
	if err != nil {
		switch err {
		case service.ErrWorkoutNotFound:
			response.NotFound(c, "workout not found")
		case service.ErrExerciseNotFound:
			response.NotFound(c, "exercise not found")
		default:
			response.InternalError(c, "failed to toggle exercise")
		}
		return
	}
	response.OK(c, ex)
}

func (h *WorkoutHandler) ReorderExercise(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}
	exerciseID, ok := h.parseExerciseID(c)
	if !ok {
		return
	}

	var req reorderWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.ReorderExercise(c.Request.Context(), userID, workspaceID, workoutID, exerciseID, req.AfterID); err != nil {
		switch err {
		case service.ErrWorkoutNotFound:
			response.NotFound(c, "workout not found")
		case service.ErrExerciseNotFound:
			response.NotFound(c, "exercise not found")
		default:
			response.InternalError(c, "failed to reorder exercise")
		}
		return
	}
	response.OK(c, nil)
}

func (h *WorkoutHandler) DeleteExercise(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseWorkoutID(c)
	if !ok {
		return
	}
	exerciseID, ok := h.parseExerciseID(c)
	if !ok {
		return
	}

	if err := h.svc.DeleteExercise(c.Request.Context(), userID, workspaceID, workoutID, exerciseID); err != nil {
		switch err {
		case service.ErrWorkoutNotFound:
			response.NotFound(c, "workout not found")
		case service.ErrExerciseNotFound:
			response.NotFound(c, "exercise not found")
		default:
			response.InternalError(c, "failed to delete exercise")
		}
		return
	}
	response.OK(c, nil)
}

// --- Body metric endpoints ---

func (h *WorkoutHandler) History(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "12"))

	buckets, err := h.svc.History(c.Request.Context(), userID, workspaceID, c.DefaultQuery("bucket", "week"), limit)
	if err != nil {
		response.InternalError(c, "failed to compute workout history")
		return
	}
	response.OK(c, buckets)
}

func (h *WorkoutHandler) ListMetrics(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "100"))

	q := model.BodyMetricListQuery{Page: page, PageSize: pageSize}
	if t, ok := parseRFC3339Query(c, "date_after"); !ok {
		response.BadRequest(c, "invalid date_after format")
		return
	} else {
		q.DateAfter = t
	}
	if t, ok := parseRFC3339Query(c, "date_before"); !ok {
		response.BadRequest(c, "invalid date_before format")
		return
	} else {
		q.DateBefore = t
	}

	metrics, total, err := h.svc.ListMetrics(c.Request.Context(), userID, workspaceID, q)
	if err != nil {
		response.InternalError(c, "failed to list body metrics")
		return
	}
	response.OKPaginated(c, metrics, total, q.Page, q.PageSize)
}

func (h *WorkoutHandler) BodySummary(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	summary, err := h.svc.BodySummary(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to compute body summary")
		return
	}
	response.OK(c, summary)
}

func (h *WorkoutHandler) CreateMetric(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req bodyMetricRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	m, err := req.toModel(0)
	if err != nil {
		response.BadRequest(c, "invalid recorded_at format")
		return
	}

	result, err := h.svc.CreateMetric(c.Request.Context(), userID, workspaceID, m)
	if err != nil {
		response.InternalError(c, "failed to create body metric")
		return
	}
	response.Created(c, result)
}

func (h *WorkoutHandler) UpdateMetric(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseBodyMetricID(c)
	if !ok {
		return
	}

	var req bodyMetricRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	m, err := req.toModel(id)
	if err != nil {
		response.BadRequest(c, "invalid recorded_at format")
		return
	}

	result, err := h.svc.UpdateMetric(c.Request.Context(), userID, workspaceID, id, m)
	if err != nil {
		if err == service.ErrBodyMetricNotFound {
			response.NotFound(c, "body metric not found")
			return
		}
		response.InternalError(c, "failed to update body metric")
		return
	}
	response.OK(c, result)
}

func (h *WorkoutHandler) DeleteMetric(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseBodyMetricID(c)
	if !ok {
		return
	}

	if err := h.svc.DeleteMetric(c.Request.Context(), userID, workspaceID, id); err != nil {
		response.NotFound(c, "body metric not found")
		return
	}
	response.OK(c, nil)
}

// parseRFC3339Query parses an optional RFC3339 query parameter. Returns
// (nil, true) when absent/empty, (value, true) when parsed, (nil, false) on a
// malformed value.
func parseRFC3339Query(c *gin.Context, key string) (*time.Time, bool) {
	raw := c.Query(key)
	if raw == "" {
		return nil, true
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, false
	}
	return &t, true
}
