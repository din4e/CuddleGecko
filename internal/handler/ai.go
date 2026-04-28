package handler

import (
	"fmt"
	"io"
	"strconv"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type AIHandler struct {
	svc *service.AIService
}

func NewAIHandler(svc *service.AIService) *AIHandler {
	return &AIHandler{svc: svc}
}

// --- Providers ---

func (h *AIHandler) ListProviders(c *gin.Context) {
	userID := middleware.GetUserID(c)
	providers, err := h.svc.ListProviders(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, "failed to list providers")
		return
	}
	response.OK(c, providers)
}

type saveProviderRequest struct {
	ProviderType string `json:"provider_type" binding:"required"`
	APIKey       string `json:"api_key" binding:"required"`
	Model        string `json:"model"`
	BaseURL      string `json:"base_url"`
}

func (h *AIHandler) SaveProvider(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req saveProviderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	provider, err := h.svc.SaveProvider(c.Request.Context(), userID, req.ProviderType, req.APIKey, req.Model, req.BaseURL)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	response.OK(c, provider)
}

func (h *AIHandler) ActivateProvider(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid provider id")
		return
	}

	if err := h.svc.ActivateProvider(c.Request.Context(), userID, uint(id)); err != nil {
		if err == service.ErrProviderNotFound {
			response.NotFound(c, "provider not found")
			return
		}
		response.InternalError(c, "failed to activate provider")
		return
	}
	response.OK(c, nil)
}

func (h *AIHandler) TestConnection(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid provider id")
		return
	}

	if err := h.svc.TestConnection(c.Request.Context(), userID, uint(id)); err != nil {
		response.OK(c, gin.H{"success": false, "error": err.Error()})
		return
	}
	response.OK(c, gin.H{"success": true})
}

// --- Conversations ---

func (h *AIHandler) ListConversations(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	conversations, total, err := h.svc.ListConversations(c.Request.Context(), userID, page, pageSize)
	if err != nil {
		response.InternalError(c, "failed to list conversations")
		return
	}
	response.OKPaginated(c, conversations, total, page, pageSize)
}

type createConversationRequest struct {
	Title string `json:"title"`
}

func (h *AIHandler) CreateConversation(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req createConversationRequest
	c.ShouldBindJSON(&req)

	conv, err := h.svc.CreateConversation(c.Request.Context(), userID, req.Title)
	if err != nil {
		response.InternalError(c, "failed to create conversation")
		return
	}
	response.Created(c, conv)
}

func (h *AIHandler) GetMessages(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid conversation id")
		return
	}

	messages, err := h.svc.GetMessages(c.Request.Context(), userID, uint(id))
	if err != nil {
		if err == service.ErrConversationNotFound {
			response.NotFound(c, "conversation not found")
			return
		}
		response.InternalError(c, "failed to get messages")
		return
	}
	response.OK(c, messages)
}

func (h *AIHandler) DeleteConversation(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid conversation id")
		return
	}

	if err := h.svc.DeleteConversation(c.Request.Context(), userID, uint(id)); err != nil {
		if err == service.ErrConversationNotFound {
			response.NotFound(c, "conversation not found")
			return
		}
		response.InternalError(c, "failed to delete conversation")
		return
	}
	response.OK(c, nil)
}

// --- Chat (SSE streaming) ---

type chatRequest struct {
	ConversationID uint   `json:"conversation_id" binding:"required"`
	Message        string `json:"message" binding:"required"`
}

func (h *AIHandler) StreamChat(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	var req chatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	stream, err := h.svc.StreamChat(c.Request.Context(), userID, workspaceID, req.ConversationID, req.Message)
	if err != nil {
		if err == service.ErrNoActiveProvider {
			response.BadRequest(c, err.Error())
			return
		}
		if err == service.ErrConversationNotFound {
			response.NotFound(c, "conversation not found")
			return
		}
		response.InternalError(c, "failed to start chat")
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	c.Stream(func(w io.Writer) bool {
		select {
		case chunk, ok := <-stream:
			if !ok || chunk.Done {
				fmt.Fprintf(w, "data: [DONE]\n\n")
				c.Writer.Flush()
				return false
			}
			if chunk.Error != nil {
				fmt.Fprintf(w, "data: {\"error\":\"%s\"}\n\n", chunk.Error.Error())
				c.Writer.Flush()
				return false
			}
			fmt.Fprintf(w, "data: %s\n\n", chunk.Content)
			c.Writer.Flush()
			return true
		case <-c.Request.Context().Done():
			return false
		}
	})
}

// --- Synchronous chat (for desktop) ---

func (h *AIHandler) Chat(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	var req chatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	resp, err := h.svc.Chat(c.Request.Context(), userID, workspaceID, req.ConversationID, req.Message)
	if err != nil {
		if err == service.ErrNoActiveProvider {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to chat")
		return
	}
	response.OK(c, gin.H{"content": resp})
}

// --- Analysis ---

func (h *AIHandler) AnalyzeRelationship(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	contactID, err := strconv.ParseUint(c.Param("contactId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	result, err := h.svc.AnalyzeRelationship(c.Request.Context(), userID, workspaceID, uint(contactID))
	if err != nil {
		if err == service.ErrNoActiveProvider {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to analyze relationship")
		return
	}
	response.OK(c, gin.H{"analysis": result})
}

func (h *AIHandler) AnalyzeEvent(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	eventID, err := strconv.ParseUint(c.Param("eventId"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid event id")
		return
	}

	result, err := h.svc.AnalyzeEvent(c.Request.Context(), userID, workspaceID, uint(eventID))
	if err != nil {
		if err == service.ErrNoActiveProvider {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to analyze event")
		return
	}
	response.OK(c, gin.H{"analysis": result})
}

// --- Comprehensive Analysis ---

type analyzeComprehensiveRequest struct {
	Type       string `json:"type" binding:"required"`
	ContactIDs []uint `json:"contact_ids"`
	EventIDs   []uint `json:"event_ids"`
	Question   string `json:"question"`
}

func (h *AIHandler) AnalyzeComprehensive(c *gin.Context) {
	userID := middleware.GetUserID(c)
	workspaceID := middleware.GetWorkspaceID(c)
	var req analyzeComprehensiveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	result, err := h.svc.AnalyzeComprehensive(c.Request.Context(), userID, workspaceID, service.AnalyzeRequest{
		Type:       req.Type,
		ContactIDs: req.ContactIDs,
		EventIDs:   req.EventIDs,
		Question:   req.Question,
	})
	if err != nil {
		if err == service.ErrNoActiveProvider {
			response.BadRequest(c, err.Error())
			return
		}
		response.InternalError(c, "failed to analyze")
		return
	}
	response.OK(c, gin.H{"analysis": result})
}

// --- Presets (public within auth) ---

func (h *AIHandler) ListPresets(c *gin.Context) {
	response.OK(c, service.ProviderPresets)
}
