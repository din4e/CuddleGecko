package handler

import (
	"errors"
	"strconv"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type ContactHandler struct {
	svc *service.ContactService
}

func NewContactHandler(svc *service.ContactService) *ContactHandler {
	return &ContactHandler{svc: svc}
}

type createContactRequest struct {
	Name               string     `json:"name" binding:"required"`
	Nickname           string     `json:"nickname"`
	AvatarEmoji        string     `json:"avatar_emoji"`
	AvatarURL          string     `json:"avatar_url"`
	Phone              []string   `json:"phones"`
	Email              []string   `json:"emails"`
	Birthday           *string    `json:"birthday"` // date-only or RFC3339; Gin's *time.Time rejects "YYYY-MM-DD"
	BirthdayCalendar   string     `json:"birthday_calendar" binding:"omitempty,oneof=solar lunar"`
	Notes              string     `json:"notes"`
	RelationshipLabels []string   `json:"relationship_labels"`
}

type updateContactRequest struct {
	Name               string     `json:"name"`
	Nickname           string     `json:"nickname"`
	AvatarEmoji        string     `json:"avatar_emoji"`
	AvatarURL          string     `json:"avatar_url"`
	Phone              []string   `json:"phones"`
	Email              []string   `json:"emails"`
	Birthday           *string    `json:"birthday"`
	BirthdayCalendar   string     `json:"birthday_calendar" binding:"omitempty,oneof=solar lunar"`
	Notes              string     `json:"notes"`
	RelationshipLabels []string   `json:"relationship_labels"`
}

// parseBirthdayPtr accepts date-only ("1995-03-15", what <input type="date">
// produces) and RFC3339 strings; nil and empty mean "no birthday".
func parseBirthdayPtr(s *string) (*time.Time, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	t, err := parseFlexibleTime(*s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

type replaceTagsRequest struct {
	TagIDs []uint `json:"tag_ids" binding:"required"`
}

func (h *ContactHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	page, pageSize := parsePagination(c, 20)
	search := c.Query("search")

	var tagIDs []uint
	for _, idStr := range c.QueryArray("tag_ids") {
		if id, err := strconv.ParseUint(idStr, 10, 32); err == nil {
			tagIDs = append(tagIDs, uint(id))
		}
	}

	contacts, total, err := h.svc.List(c.Request.Context(), userID, workspaceID, page, pageSize, search, tagIDs)
	if err != nil {
		response.InternalError(c, "failed to list contacts")
		return
	}

	response.OKPaginated(c, contacts, total, page, pageSize)
}

func (h *ContactHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	var req createContactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	birthday, err := parseBirthdayPtr(req.Birthday)
	if err != nil {
		response.BadRequest(c, "invalid birthday: "+err.Error())
		return
	}

	contact := &model.Contact{
		Name:               req.Name,
		Nickname:           req.Nickname,
		AvatarEmoji:        req.AvatarEmoji,
		AvatarURL:          req.AvatarURL,
		Phone:              req.Phone,
		Email:              req.Email,
		Birthday:           birthday,
		BirthdayCalendar:   req.BirthdayCalendar,
		Notes:              req.Notes,
		RelationshipLabels: req.RelationshipLabels,
	}

	result, err := h.svc.Create(c.Request.Context(), userID, workspaceID, contact)
	if err != nil {
		response.InternalError(c, "failed to create contact")
		return
	}

	response.Created(c, result)
}

func (h *ContactHandler) GetByID(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	contact, err := h.svc.GetByID(c.Request.Context(), userID, workspaceID, uint(id))
	if err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, contact)
}

func (h *ContactHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req updateContactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	birthday, err := parseBirthdayPtr(req.Birthday)
	if err != nil {
		response.BadRequest(c, "invalid birthday: "+err.Error())
		return
	}

	contact := &model.Contact{
		Name:               req.Name,
		Nickname:           req.Nickname,
		AvatarEmoji:        req.AvatarEmoji,
		AvatarURL:          req.AvatarURL,
		Phone:              req.Phone,
		Email:              req.Email,
		Birthday:           birthday,
		BirthdayCalendar:   req.BirthdayCalendar,
		Notes:              req.Notes,
		RelationshipLabels: req.RelationshipLabels,
	}

	result, err := h.svc.Update(c.Request.Context(), userID, workspaceID, uint(id), contact)
	if err != nil {
		if err == service.ErrContactNotFound {
			response.NotFound(c, "contact not found")
			return
		}
		response.InternalError(c, "failed to update contact")
		return
	}

	response.OK(c, result)
}

func (h *ContactHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, workspaceID, uint(id)); err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, nil)
}

// Birthdays lists upcoming birthdays (lunar birthdays converted to their
// Gregorian date) within ?days= (default 30, clamped to 1..365).
func (h *ContactHandler) Birthdays(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	days, err := strconv.Atoi(c.DefaultQuery("days", "30"))
	if err != nil || days < 1 || days > 365 {
		days = 30
	}

	occurrences, err := h.svc.UpcomingBirthdays(c.Request.Context(), userID, workspaceID, days, time.Now())
	if err != nil {
		response.InternalError(c, "failed to list birthdays")
		return
	}

	response.OK(c, occurrences)
}

// CreateBirthdayReminder schedules a reminder at 09:00 on the contact's next
// birthday (lunar-aware).
func (h *ContactHandler) CreateBirthdayReminder(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	reminder, err := h.svc.CreateBirthdayReminder(c.Request.Context(), userID, workspaceID, uint(id), time.Now())
	if err != nil {
		if err == service.ErrContactNotFound {
			response.NotFound(c, "contact not found")
			return
		}
		if errors.Is(err, service.ErrBirthdayReminderExists) || errors.Is(err, service.ErrContactBirthdayMissing) {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to create birthday reminder")
		return
	}

	response.Created(c, reminder)
}

func (h *ContactHandler) GetTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	tags, err := h.svc.GetTags(c.Request.Context(), userID, workspaceID, uint(id))
	if err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, tags)
}

func (h *ContactHandler) ReplaceTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req replaceTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.ReplaceTags(c.Request.Context(), userID, workspaceID, uint(id), req.TagIDs); err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, nil)
}
