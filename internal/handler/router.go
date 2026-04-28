package handler

import (
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/gin-gonic/gin"
)

type Handlers struct {
	Auth        *AuthHandler
	Captcha     *CaptchaHandler
	Contact     *ContactHandler
	Tag         *TagHandler
	Interaction *InteractionHandler
	Reminder    *ReminderHandler
	Graph       *GraphHandler
	Upload      *UploadHandler
	Event       *EventHandler
	Transaction *TransactionHandler
	AI          *AIHandler
	Workspace   *WorkspaceHandler
}

func NewHandlers(
	authSvc *service.AuthService,
	captchaSvc *service.CaptchaService,
	contactSvc *service.ContactService,
	tagSvc *service.TagService,
	interactionSvc *service.InteractionService,
	reminderSvc *service.ReminderService,
	relationSvc *service.RelationService,
	eventSvc *service.EventService,
	transactionSvc *service.TransactionService,
	aiSvc *service.AIService,
	workspaceSvc *service.WorkspaceService,
	uploadDir string,
) *Handlers {
	return &Handlers{
		Auth:        NewAuthHandler(authSvc, captchaSvc),
		Captcha:     NewCaptchaHandler(captchaSvc),
		Contact:     NewContactHandler(contactSvc),
		Tag:         NewTagHandler(tagSvc),
		Interaction: NewInteractionHandler(interactionSvc),
		Reminder:    NewReminderHandler(reminderSvc),
		Graph:       NewGraphHandler(relationSvc),
		Upload:      NewUploadHandler(uploadDir),
		Event:       NewEventHandler(eventSvc),
		Transaction: NewTransactionHandler(transactionSvc),
		AI:          NewAIHandler(aiSvc),
		Workspace:   NewWorkspaceHandler(workspaceSvc),
	}
}

func RegisterRoutes(r *gin.Engine, h *Handlers, jwtCfg *config.JWTConfig, workspaceSvc *service.WorkspaceService) {
	r.Use(middleware.CORS())

	// Serve uploaded avatar images
	r.Static("/avatars", "./data/avatars")

	api := r.Group("/api")
	{
		api.GET("/captcha", h.Captcha.Get)

		auth := api.Group("/auth")
		{
			auth.POST("/register", h.Auth.Register)
			auth.POST("/login", h.Auth.Login)
			auth.POST("/refresh", h.Auth.Refresh)
		}

		protected := api.Group("")
		protected.Use(middleware.JWTAuth(jwtCfg))
		{
			protected.GET("/auth/me", h.Auth.Me)

			// Workspace management (no workspace context needed)
			protected.GET("/workspaces", h.Workspace.List)
			protected.POST("/workspaces", h.Workspace.Create)
			protected.PUT("/workspaces/:id", h.Workspace.Update)
			protected.DELETE("/workspaces/:id", h.Workspace.Delete)
			protected.POST("/workspaces/:id/switch", h.Workspace.Switch)
				protected.GET("/workspaces/default", h.Workspace.GetDefault)
		}

		// Workspace-scoped routes
		wsProtected := api.Group("")
		wsProtected.Use(middleware.JWTAuth(jwtCfg))
		wsProtected.Use(middleware.WorkspaceAuth(workspaceSvc))
		{
			wsProtected.POST("/upload/avatar", h.Upload.UploadAvatar)

			buddies := wsProtected.Group("/buddies")
			{
				buddies.GET("", h.Contact.List)
				buddies.POST("", h.Contact.Create)
				buddies.GET("/:id", h.Contact.GetByID)
				buddies.PUT("/:id", h.Contact.Update)
				buddies.DELETE("/:id", h.Contact.Delete)
				buddies.GET("/:id/tags", h.Contact.GetTags)
				buddies.PUT("/:id/tags", h.Contact.ReplaceTags)
				buddies.GET("/:id/interactions", h.Interaction.ListByContact)
				buddies.POST("/:id/interactions", h.Interaction.Create)
				buddies.POST("/:id/reminders", h.Reminder.Create)
				buddies.GET("/:id/relations", h.Graph.GetRelations)
				buddies.POST("/:id/relations", h.Graph.CreateRelation)
			}

			wsProtected.GET("/tags", h.Tag.List)
			wsProtected.POST("/tags", h.Tag.Create)
			wsProtected.PUT("/tags/:id", h.Tag.Update)
			wsProtected.DELETE("/tags/:id", h.Tag.Delete)

			wsProtected.PUT("/interactions/:id", h.Interaction.Update)
			wsProtected.DELETE("/interactions/:id", h.Interaction.Delete)

			wsProtected.GET("/reminders", h.Reminder.List)
			wsProtected.PUT("/reminders/:id", h.Reminder.Update)
			wsProtected.DELETE("/reminders/:id", h.Reminder.Delete)

			wsProtected.DELETE("/relations/:id", h.Graph.DeleteRelation)

			wsProtected.GET("/graph", h.Graph.GetGraph)

			wsProtected.GET("/events", h.Event.List)
			wsProtected.POST("/events", h.Event.Create)
			wsProtected.PUT("/events/:id", h.Event.Update)
			wsProtected.DELETE("/events/:id", h.Event.Delete)

			wsProtected.GET("/transactions", h.Transaction.List)
			wsProtected.GET("/transactions/summary", h.Transaction.Summary)
			wsProtected.POST("/transactions", h.Transaction.Create)
			wsProtected.PUT("/transactions/:id", h.Transaction.Update)
			wsProtected.DELETE("/transactions/:id", h.Transaction.Delete)

			ai := wsProtected.Group("/ai")
			{
				ai.GET("/presets", h.AI.ListPresets)
				ai.GET("/providers", h.AI.ListProviders)
				ai.PUT("/providers", h.AI.SaveProvider)
				ai.POST("/providers/:id/activate", h.AI.ActivateProvider)
				ai.POST("/providers/:id/test", h.AI.TestConnection)
				ai.GET("/conversations", h.AI.ListConversations)
				ai.POST("/conversations", h.AI.CreateConversation)
				ai.GET("/conversations/:id/messages", h.AI.GetMessages)
				ai.DELETE("/conversations/:id", h.AI.DeleteConversation)
				ai.POST("/chat", h.AI.StreamChat)
				ai.POST("/chat/sync", h.AI.Chat)
				ai.POST("/analyze/relationship/:contactId", h.AI.AnalyzeRelationship)
				ai.POST("/analyze/event/:eventId", h.AI.AnalyzeEvent)
				ai.POST("/analyze", h.AI.AnalyzeComprehensive)
			}
		}
	}
}
