package handler

import (
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type PomodoroHandler struct {
	svc *service.PomodoroService
}

func NewPomodoroHandler(svc *service.PomodoroService) *PomodoroHandler {
	return &PomodoroHandler{svc: svc}
}

type createPomodoroRequest struct {
	TodoID          *uint  `json:"todo_id"`
	DurationSeconds int    `json:"duration_seconds" binding:"required,min=1"`
	Kind            string `json:"kind"` // focus | break
	Completed       bool   `json:"completed"`
	StartedAt       string `json:"started_at"` // RFC3339
	EndedAt         string `json:"ended_at"`   // RFC3339
}

func (h *PomodoroHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var req createPomodoroRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	p := &model.PomodoroSession{
		TodoID:          req.TodoID,
		DurationSeconds: req.DurationSeconds,
		Kind:            req.Kind,
		Completed:       req.Completed,
	}
	if req.StartedAt != "" {
		if t, err := time.Parse(time.RFC3339, req.StartedAt); err == nil {
			p.StartedAt = t
		}
	}
	if req.EndedAt != "" {
		if t, err := time.Parse(time.RFC3339, req.EndedAt); err == nil {
			p.EndedAt = t
		}
	}

	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, p)
	if err != nil {
		response.InternalError(c, "failed to record pomodoro")
		return
	}
	response.Created(c, result)
}

func (h *PomodoroHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	var from, to time.Time
	if v := c.Query("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			from = t
		}
	}
	if v := c.Query("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			to = t
		}
	}

	sessions, err := h.svc.List(c.Request.Context(), userID, workspaceID, from, to)
	if err != nil {
		response.InternalError(c, "failed to list pomodoros")
		return
	}
	if sessions == nil {
		sessions = []model.PomodoroSession{}
	}
	response.OK(c, sessions)
}

func (h *PomodoroHandler) Summary(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)

	summary, err := h.svc.Summary(c.Request.Context(), userID, workspaceID)
	if err != nil {
		response.InternalError(c, "failed to get pomodoro summary")
		return
	}
	response.OK(c, summary)
}
