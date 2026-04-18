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

type EventHandler struct {
	svc *service.EventService
}

func NewEventHandler(svc *service.EventService) *EventHandler {
	return &EventHandler{svc: svc}
}

type createEventRequest struct {
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	StartTime   string `json:"start_time" binding:"required"`
	EndTime     string `json:"end_time"`
	Location    string `json:"location"`
	ContactIDs  []uint `json:"contact_ids"`
	Color       string `json:"color"`
}

type updateEventRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	Location    string `json:"location"`
	ContactIDs  []uint `json:"contact_ids"`
	Color       string `json:"color"`
}

func parseEventFromReq(req interface{}) (*model.Event, error) {
	var title, desc, start, end, loc, color string
	var contactIDs []uint

	switch r := req.(type) {
	case *createEventRequest:
		title, desc, start, end, loc, color = r.Title, r.Description, r.StartTime, r.EndTime, r.Location, r.Color
		contactIDs = r.ContactIDs
	case *updateEventRequest:
		title, desc, start, end, loc, color = r.Title, r.Description, r.StartTime, r.EndTime, r.Location, r.Color
		contactIDs = r.ContactIDs
	}

	event := &model.Event{
		Title:       title,
		Description: desc,
		Location:    loc,
		ContactIDs:  contactIDs,
		Color:       color,
	}

	if start != "" {
		t, err := time.Parse(time.RFC3339, start)
		if err != nil {
			return nil, err
		}
		event.StartTime = t
	}

	if end != "" {
		t, err := time.Parse(time.RFC3339, end)
		if err != nil {
			return nil, err
		}
		event.EndTime = &t
	}

	return event, nil
}

func (h *EventHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	var startAfter, endBefore *string
	if v := c.Query("start_after"); v != "" {
		startAfter = &v
	}
	if v := c.Query("end_before"); v != "" {
		endBefore = &v
	}

	events, total, err := h.svc.List(c.Request.Context(), userID, page, pageSize, startAfter, endBefore)
	if err != nil {
		response.InternalError(c, "failed to list events")
		return
	}

	response.OKPaginated(c, events, total, page, pageSize)
}

func (h *EventHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req createEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	event, err := parseEventFromReq(&req)
	if err != nil {
		response.BadRequest(c, "invalid time format")
		return
	}

	result, err := h.svc.Create(c.Request.Context(), userID, event)
	if err != nil {
		response.InternalError(c, "failed to create event")
		return
	}

	response.Created(c, result)
}

func (h *EventHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid event id")
		return
	}

	var req updateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	event, err := parseEventFromReq(&req)
	if err != nil {
		response.BadRequest(c, "invalid time format")
		return
	}

	result, err := h.svc.Update(c.Request.Context(), userID, uint(id), event)
	if err != nil {
		if err == service.ErrEventNotFound {
			response.NotFound(c, "event not found")
			return
		}
		response.InternalError(c, "failed to update event")
		return
	}

	response.OK(c, result)
}

func (h *EventHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid event id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "event not found")
		return
	}

	response.OK(c, nil)
}
