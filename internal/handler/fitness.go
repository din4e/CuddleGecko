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

type FitnessHandler struct {
	svc *service.FitnessService
}

func NewFitnessHandler(svc *service.FitnessService) *FitnessHandler {
	return &FitnessHandler{svc: svc}
}

func (h *FitnessHandler) parseUintParam(c *gin.Context, name, what string) (uint, bool) {
	id, err := strconv.ParseUint(c.Param(name), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid "+what+" id")
		return 0, false
	}
	return uint(id), true
}

// --- Exercise library ---

type exerciseLibraryRequest struct {
	Name         string   `json:"name" binding:"required"`
	Category     string   `json:"category"`
	MuscleGroups []string `json:"muscle_groups"`
	Equipment    string   `json:"equipment"`
	Notes        string   `json:"notes"`
}

func (h *FitnessHandler) ListLibrary(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	items, err := h.svc.ListLibrary(c.Request.Context(), userID, workspaceID, c.Query("q"))
	if err != nil {
		response.InternalError(c, "failed to list exercise library")
		return
	}
	response.OK(c, items)
}

func (h *FitnessHandler) CreateLibraryItem(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	var req exerciseLibraryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	item := &model.ExerciseLibraryItem{
		Name: req.Name, Category: req.Category, MuscleGroups: req.MuscleGroups,
		Equipment: req.Equipment, Notes: req.Notes,
	}
	result, err := h.svc.CreateLibraryItem(c.Request.Context(), userID, workspaceID, item)
	if err != nil {
		h.mapLibraryError(c, err, "create")
		return
	}
	response.Created(c, result)
}

func (h *FitnessHandler) UpdateLibraryItem(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseUintParam(c, "id", "exercise library")
	if !ok {
		return
	}
	var req exerciseLibraryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	item := &model.ExerciseLibraryItem{
		Name: req.Name, Category: req.Category, MuscleGroups: req.MuscleGroups,
		Equipment: req.Equipment, Notes: req.Notes,
	}
	result, err := h.svc.UpdateLibraryItem(c.Request.Context(), userID, workspaceID, id, item)
	if err != nil {
		h.mapLibraryError(c, err, "update")
		return
	}
	response.OK(c, result)
}

func (h *FitnessHandler) mapLibraryError(c *gin.Context, err error, action string) {
	switch err {
	case service.ErrLibraryItemNotFound:
		response.NotFound(c, "exercise library item not found")
	case service.ErrLibraryItemEmpty:
		response.BadRequest(c, "exercise name is required")
	case service.ErrLibraryDuplicate:
		response.BadRequest(c, "exercise name already exists")
	default:
		response.InternalError(c, "failed to "+action+" exercise library item")
	}
}

func (h *FitnessHandler) DeleteLibraryItem(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseUintParam(c, "id", "exercise library")
	if !ok {
		return
	}
	if err := h.svc.DeleteLibraryItem(c.Request.Context(), userID, workspaceID, id); err != nil {
		if err == service.ErrLibraryItemNotFound {
			response.NotFound(c, "exercise library item not found")
			return
		}
		response.InternalError(c, "failed to delete exercise library item")
		return
	}
	response.OK(c, nil)
}

// --- Workout templates ---

type templateItemRequest struct {
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

type workoutTemplateRequest struct {
	Name  string               `json:"name" binding:"required"`
	Type  string               `json:"type"`
	Notes string               `json:"notes"`
	Items []templateItemRequest `json:"items"`
}

func (r workoutTemplateRequest) toModel(id uint) *model.WorkoutTemplate {
	t := &model.WorkoutTemplate{ID: id, Name: r.Name, Type: r.Type, Notes: r.Notes}
	for _, it := range r.Items {
		t.Items = append(t.Items, model.WorkoutTemplateItem{
			Name: it.Name, Category: it.Category, Sets: it.Sets, Reps: it.Reps,
			Weight: it.Weight, Distance: it.Distance, DurationSec: it.DurationSec,
			RestSec: it.RestSec, Notes: it.Notes,
		})
	}
	return t
}

func (h *FitnessHandler) ListTemplates(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	templates, err := h.svc.ListTemplates(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to list workout templates")
		return
	}
	response.OK(c, templates)
}

func (h *FitnessHandler) CreateTemplate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	var req workoutTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	result, err := h.svc.CreateTemplate(c.Request.Context(), userID, workspaceID, req.toModel(0))
	if err != nil {
		if err == service.ErrTemplateEmpty {
			response.BadRequest(c, "template name is required")
			return
		}
		response.InternalError(c, "failed to create workout template")
		return
	}
	response.Created(c, result)
}

func (h *FitnessHandler) UpdateTemplate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseUintParam(c, "id", "template")
	if !ok {
		return
	}
	var req workoutTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	result, err := h.svc.UpdateTemplate(c.Request.Context(), userID, workspaceID, id, req.toModel(id))
	if err != nil {
		switch err {
		case service.ErrTemplateNotFound:
			response.NotFound(c, "workout template not found")
		case service.ErrTemplateEmpty:
			response.BadRequest(c, "template name is required")
		default:
			response.InternalError(c, "failed to update workout template")
		}
		return
	}
	response.OK(c, result)
}

func (h *FitnessHandler) DeleteTemplate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseUintParam(c, "id", "template")
	if !ok {
		return
	}
	if err := h.svc.DeleteTemplate(c.Request.Context(), userID, workspaceID, id); err != nil {
		if err == service.ErrTemplateNotFound {
			response.NotFound(c, "workout template not found")
			return
		}
		response.InternalError(c, "failed to delete workout template")
		return
	}
	response.OK(c, nil)
}

type instantiateTemplateRequest struct {
	ScheduledAt string `json:"scheduled_at"`
}

func (h *FitnessHandler) InstantiateTemplate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseUintParam(c, "id", "template")
	if !ok {
		return
	}
	var req instantiateTemplateRequest
	var scheduledAt *time.Time
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if req.ScheduledAt != "" {
		t, err := time.Parse(time.RFC3339, req.ScheduledAt)
		if err != nil {
			response.BadRequest(c, "invalid scheduled_at format")
			return
		}
		scheduledAt = &t
	}
	result, err := h.svc.InstantiateTemplate(c.Request.Context(), userID, workspaceID, id, scheduledAt)
	if err != nil {
		if err == service.ErrTemplateNotFound {
			response.NotFound(c, "workout template not found")
			return
		}
		response.InternalError(c, "failed to instantiate workout template")
		return
	}
	response.Created(c, result)
}

// --- Set logs / PRs ---

type setLogRequest struct {
	SetIndex    *int     `json:"set_index"`
	Reps        *int     `json:"reps"`
	Weight      *float64 `json:"weight"`
	Distance    *float64 `json:"distance"`
	DurationSec *int     `json:"duration_sec"`
	Done        bool     `json:"done"`
	Notes       string   `json:"notes"`
}

func (r setLogRequest) toModel(id, workoutID, exerciseID uint) *model.WorkoutSetLog {
	log := &model.WorkoutSetLog{
		ID: id, WorkoutID: workoutID, ExerciseID: exerciseID,
		Reps: r.Reps, Weight: r.Weight, Distance: r.Distance,
		DurationSec: r.DurationSec, Done: r.Done, Notes: r.Notes,
	}
	if r.SetIndex != nil {
		log.SetIndex = *r.SetIndex
	}
	return log
}

func (h *FitnessHandler) ListSetLogs(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseUintParam(c, "id", "workout")
	if !ok {
		return
	}
	exerciseID, ok := h.parseUintParam(c, "exerciseId", "exercise")
	if !ok {
		return
	}
	logs, err := h.svc.ListSetLogs(c.Request.Context(), userID, workspaceID, workoutID, exerciseID)
	if err != nil {
		h.mapSetLogError(c, err, "list")
		return
	}
	response.OK(c, logs)
}

func (h *FitnessHandler) CreateSetLog(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseUintParam(c, "id", "workout")
	if !ok {
		return
	}
	exerciseID, ok := h.parseUintParam(c, "exerciseId", "exercise")
	if !ok {
		return
	}
	var req setLogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	log, err := h.svc.CreateSetLog(c.Request.Context(), userID, workspaceID, workoutID, exerciseID, req.toModel(0, workoutID, exerciseID))
	if err != nil {
		h.mapSetLogError(c, err, "create")
		return
	}
	response.Created(c, log)
}

func (h *FitnessHandler) UpdateSetLog(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseUintParam(c, "id", "workout")
	if !ok {
		return
	}
	exerciseID, ok := h.parseUintParam(c, "exerciseId", "exercise")
	if !ok {
		return
	}
	setID, ok := h.parseUintParam(c, "setId", "set")
	if !ok {
		return
	}
	var req setLogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	log, err := h.svc.UpdateSetLog(c.Request.Context(), userID, workspaceID, workoutID, exerciseID, setID, req.toModel(setID, workoutID, exerciseID))
	if err != nil {
		h.mapSetLogError(c, err, "update")
		return
	}
	response.OK(c, log)
}

func (h *FitnessHandler) DeleteSetLog(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	workoutID, ok := h.parseUintParam(c, "id", "workout")
	if !ok {
		return
	}
	exerciseID, ok := h.parseUintParam(c, "exerciseId", "exercise")
	if !ok {
		return
	}
	setID, ok := h.parseUintParam(c, "setId", "set")
	if !ok {
		return
	}
	if err := h.svc.DeleteSetLog(c.Request.Context(), userID, workspaceID, workoutID, exerciseID, setID); err != nil {
		h.mapSetLogError(c, err, "delete")
		return
	}
	response.OK(c, nil)
}

func (h *FitnessHandler) mapSetLogError(c *gin.Context, err error, action string) {
	switch err {
	case service.ErrWorkoutNotFound:
		response.NotFound(c, "workout not found")
	case service.ErrExerciseNotFound:
		response.NotFound(c, "exercise not found")
	case service.ErrSetLogNotFound:
		response.NotFound(c, "set log not found")
	default:
		response.InternalError(c, "failed to "+action+" set log")
	}
}

func (h *FitnessHandler) PRs(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	prs, err := h.svc.PRs(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to compute PRs")
		return
	}
	response.OK(c, prs)
}

// --- Goals ---

type fitnessGoalRequest struct {
	Type        string   `json:"type" binding:"required"`
	TargetValue float64  `json:"target_value" binding:"required"`
	Deadline    string   `json:"deadline"`
	Status      string   `json:"status"`
	Notes       string   `json:"notes"`
}

func (r fitnessGoalRequest) toModel(id uint) (*model.FitnessGoal, error) {
	g := &model.FitnessGoal{
		ID: id, Type: r.Type, TargetValue: r.TargetValue,
		Status: r.Status, Notes: r.Notes,
	}
	if r.Deadline != "" {
		t, err := time.Parse(time.RFC3339, r.Deadline)
		if err != nil {
			return nil, errInvalidTime
		}
		g.Deadline = &t
	}
	return g, nil
}

func (h *FitnessHandler) ListGoals(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	goals, err := h.svc.ListGoals(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to list fitness goals")
		return
	}
	response.OK(c, goals)
}

func (h *FitnessHandler) CreateGoal(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	var req fitnessGoalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	g, err := req.toModel(0)
	if err != nil {
		response.BadRequest(c, "invalid deadline format")
		return
	}
	result, err := h.svc.CreateGoal(c.Request.Context(), userID, workspaceID, g)
	if err != nil {
		h.mapGoalError(c, err, "create")
		return
	}
	response.Created(c, result)
}

func (h *FitnessHandler) UpdateGoal(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseUintParam(c, "id", "goal")
	if !ok {
		return
	}
	var req fitnessGoalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	g, err := req.toModel(id)
	if err != nil {
		response.BadRequest(c, "invalid deadline format")
		return
	}
	result, err := h.svc.UpdateGoal(c.Request.Context(), userID, workspaceID, id, g)
	if err != nil {
		h.mapGoalError(c, err, "update")
		return
	}
	response.OK(c, result)
}

func (h *FitnessHandler) DeleteGoal(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, ok := h.parseUintParam(c, "id", "goal")
	if !ok {
		return
	}
	if err := h.svc.DeleteGoal(c.Request.Context(), userID, workspaceID, id); err != nil {
		h.mapGoalError(c, err, "delete")
		return
	}
	response.OK(c, nil)
}

func (h *FitnessHandler) mapGoalError(c *gin.Context, err error, action string) {
	switch err {
	case service.ErrGoalNotFound:
		response.NotFound(c, "fitness goal not found")
	case service.ErrGoalInvalid:
		response.BadRequest(c, "invalid fitness goal")
	default:
		response.InternalError(c, "failed to "+action+" fitness goal")
	}
}
