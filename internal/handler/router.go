package handler

import (
	"time"

	"github.com/din4e/cuddlegecko/internal/mcp"
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
	Todo        *TodoHandler
	TodoList    *TodoListHandler
	TodoItem    *TodoItemHandler
	Habit       *HabitHandler
	Transaction *TransactionHandler
	AI          *AIHandler
	Workspace   *WorkspaceHandler
	Export      *ExportHandler
	UserSetting *UserSettingHandler
	avatarDir   string
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
	todoSvc *service.TodoService,
	todoListSvc *service.TodoListService,
	todoItemSvc *service.TodoItemService,
	transactionSvc *service.TransactionService,
	aiSvc *service.AIService,
	workspaceSvc *service.WorkspaceService,
	exportSvc *service.ExportService,
	uploadDir string,
	aiCfg config.AIConfig,
	userSettingSvc *service.UserSettingService,
	habitSvc *service.HabitService,
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
		Todo:        NewTodoHandler(todoSvc),
		TodoList:    NewTodoListHandler(todoListSvc),
		TodoItem:    NewTodoItemHandler(todoItemSvc),
		Habit:       NewHabitHandler(habitSvc),
		Transaction: NewTransactionHandler(transactionSvc),
		AI:          NewAIHandler(aiSvc, aiCfg),
		Workspace:   NewWorkspaceHandler(workspaceSvc),
		Export:      NewExportHandler(exportSvc),
		avatarDir:   uploadDir,
		UserSetting: NewUserSettingHandler(userSettingSvc),
	}
}

func RegisterRoutes(r *gin.Engine, h *Handlers, cfg *config.Config, workspaceSvc *service.WorkspaceService, mcpServer *mcp.MCPServer) {
	r.Use(middleware.CORS(&cfg.CORS, cfg.Server.Mode))

	// Serve uploaded avatar images with path traversal protection
	avatars := r.Group("/avatars")
	avatars.Use(middleware.StaticPathCheck())
	avatars.Static("/", h.avatarDir)

	api := r.Group("/api")
	{
		api.GET("/captcha", h.Captcha.Get)

		auth := api.Group("/auth")
		auth.Use(middleware.NewIPRateLimiter(10, time.Minute).Middleware())
		{
			auth.POST("/register", h.Auth.Register)
			auth.POST("/login", h.Auth.Login)
			auth.POST("/refresh", h.Auth.Refresh)
		}

		protected := api.Group("")
		protected.Use(middleware.JWTAuth(&cfg.JWT))
		{
			protected.GET("/auth/me", h.Auth.Me)

			// Captcha configuration (global, not workspace-scoped)
			protected.GET("/settings/captcha", h.Captcha.GetConfig)
			protected.PUT("/settings/captcha", h.Captcha.UpdateConfig)
			protected.GET("/settings/nav", h.UserSetting.GetNav)
			protected.PUT("/settings/nav", h.UserSetting.UpdateNav)
			protected.GET("/settings/dashboard", h.UserSetting.GetDashboard)
			protected.PUT("/settings/dashboard", h.UserSetting.UpdateDashboard)

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
		wsProtected.Use(middleware.JWTAuth(&cfg.JWT))
		wsProtected.Use(middleware.WorkspaceAuth(workspaceSvc))
		{
			wsProtected.POST("/upload/avatar", h.Upload.UploadAvatar)

			// MCP endpoint
			wsProtected.POST("/mcp", mcpServer.HandlePost)

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

			wsProtected.GET("/todos", h.Todo.List)
			wsProtected.POST("/todos", h.Todo.Create)
			wsProtected.PUT("/todos/:id", h.Todo.Update)
			wsProtected.PATCH("/todos/:id/toggle", h.Todo.ToggleStatus)
			wsProtected.POST("/todos/:id/sync-event", h.Todo.SyncToEvent)
			wsProtected.DELETE("/todos/:id", h.Todo.Delete)
			wsProtected.GET("/todos/:id/items", h.TodoItem.ListByTodo)
			wsProtected.POST("/todos/:id/items", h.TodoItem.Create)
			wsProtected.PUT("/todos/:id/items/:iid", h.TodoItem.Update)
			wsProtected.PATCH("/todos/:id/items/:iid/toggle", h.TodoItem.Toggle)
			wsProtected.DELETE("/todos/:id/items/:iid", h.TodoItem.Delete)
			wsProtected.GET("/todos/:id/tags", h.Todo.GetTags)
			wsProtected.PUT("/todos/:id/tags", h.Todo.ReplaceTags)

			wsProtected.GET("/todo-lists", h.TodoList.List)
			wsProtected.POST("/todo-lists", h.TodoList.Create)
			wsProtected.PUT("/todo-lists/:id", h.TodoList.Update)
			wsProtected.DELETE("/todo-lists/:id", h.TodoList.Delete)

			wsProtected.GET("/habits", h.Habit.List)
			wsProtected.POST("/habits", h.Habit.Create)
			wsProtected.PUT("/habits/:id", h.Habit.Update)
			wsProtected.DELETE("/habits/:id", h.Habit.Delete)
			wsProtected.POST("/habits/:id/checkin", h.Habit.CheckIn)

			wsProtected.GET("/transactions", h.Transaction.List)
			wsProtected.GET("/transactions/summary", h.Transaction.Summary)
			wsProtected.POST("/transactions", h.Transaction.Create)
			wsProtected.PUT("/transactions/:id", h.Transaction.Update)
			wsProtected.DELETE("/transactions/:id", h.Transaction.Delete)

			ai := wsProtected.Group("/ai")
			{
				ai.GET("/presets", h.AI.ListPresets)
				ai.GET("/env-status", h.AI.EnvProviderStatus)
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

			wsProtected.POST("/export", h.Export.Export)
			wsProtected.POST("/import", h.Export.Import)
		}
	}
}
