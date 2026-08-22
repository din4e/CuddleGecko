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
	Workout     *WorkoutHandler
	Fitness     *FitnessHandler
	Habit       *HabitHandler
	Pomodoro    *PomodoroHandler
	Transaction *TransactionHandler
	AI          *AIHandler
	Workspace   *WorkspaceHandler
	Export      *ExportHandler
	UserSetting *UserSettingHandler
	Version     *VersionHandler
	WS          *WSHandler
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
	workoutSvc *service.WorkoutService,
	fitnessSvc *service.FitnessService,
	transactionSvc *service.TransactionService,
	aiSvc *service.AIService,
	workspaceSvc *service.WorkspaceService,
	exportSvc *service.ExportService,
	uploadDir string,
	aiCfg config.AIConfig,
	userSettingSvc *service.UserSettingService,
	habitSvc *service.HabitService,
	pomodoroSvc *service.PomodoroService,
) *Handlers {
	return &Handlers{
		Auth:        NewAuthHandler(authSvc, captchaSvc),
		Captcha:     NewCaptchaHandler(captchaSvc),
		Version:     NewVersionHandler(),
		Contact:     NewContactHandler(contactSvc),
		Tag:         NewTagHandler(tagSvc),
		Interaction: NewInteractionHandler(interactionSvc),
		Reminder:    NewReminderHandler(reminderSvc),
		Graph:       NewGraphHandler(relationSvc),
		Upload:      NewUploadHandler(uploadDir),
		Event:       NewEventHandler(eventSvc),
		Todo:        NewTodoHandler(todoSvc),
		Workout:     NewWorkoutHandler(workoutSvc),
		Fitness:     NewFitnessHandler(fitnessSvc),
		Habit:       NewHabitHandler(habitSvc),
		Pomodoro:    NewPomodoroHandler(pomodoroSvc),
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
		// /captcha renders a PNG per request, so throttle it to bound CPU use.
		api.GET("/captcha", middleware.NewIPRateLimiter(30, time.Minute).Middleware(), h.Captcha.Get)

		// Build version + liveness probe. Public (version isn't a secret);
		// doubles as the docker/monitor healthcheck target.
		api.GET("/version", h.Version.Get)

		// WebSocket upgrade for real-time multi-device todo sync. Registered in
		// the bare group (not behind JWTAuth/WorkspaceAuth) because browsers
		// cannot set headers on the WS handshake — the handler authenticates
		// from the query string instead.
		if h.WS != nil {
			api.GET("/ws", h.WS.Connect)
		}

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
			wsProtected.GET("/todos/stats", h.Todo.Stats)
			wsProtected.GET("/todos/trash", h.Todo.ListTrash)
			wsProtected.POST("/todos", h.Todo.Create)
			wsProtected.POST("/todos/bulk", h.Todo.BulkAction)
			wsProtected.PUT("/todos/:id", h.Todo.Update)
			wsProtected.PATCH("/todos/:id/toggle", h.Todo.ToggleStatus)
			wsProtected.PATCH("/todos/:id/pin", h.Todo.TogglePin)
			wsProtected.PATCH("/todos/:id/reorder", h.Todo.Reorder)
			wsProtected.PATCH("/todos/:id/move", h.Todo.Move)
			wsProtected.POST("/todos/:id/sync-event", h.Todo.SyncToEvent)
			wsProtected.POST("/todos/:id/duplicate", h.Todo.Duplicate)
			wsProtected.POST("/todos/:id/pomodoro", h.Todo.IncrementPomodoro)
			wsProtected.POST("/todos/:id/restore", h.Todo.Restore)
			wsProtected.DELETE("/todos/:id", h.Todo.Delete)
			wsProtected.GET("/habits", h.Habit.List)
			wsProtected.POST("/habits", h.Habit.Create)
			wsProtected.PUT("/habits/:id", h.Habit.Update)
			wsProtected.DELETE("/habits/:id", h.Habit.Delete)
			wsProtected.POST("/habits/:id/checkin", h.Habit.CheckIn)

			wsProtected.GET("/pomodoros", h.Pomodoro.List)
			wsProtected.GET("/pomodoros/summary", h.Pomodoro.Summary)
			wsProtected.POST("/pomodoros", h.Pomodoro.Create)

			// Checklist (subtask) operations on a todo
			wsProtected.GET("/todos/:id/items", h.Todo.ListItems)
			wsProtected.POST("/todos/:id/items", h.Todo.CreateItem)
			wsProtected.PUT("/todos/:id/items/:itemId", h.Todo.UpdateItem)
			wsProtected.PATCH("/todos/:id/items/:itemId/toggle", h.Todo.ToggleItem)
			wsProtected.PATCH("/todos/:id/items/:itemId/reorder", h.Todo.ReorderItem)
			wsProtected.POST("/todos/:id/items/:itemId/promote", h.Todo.PromoteItem)
			wsProtected.DELETE("/todos/:id/items/:itemId", h.Todo.DeleteItem)

			// Tag associations on a todo
			wsProtected.GET("/todos/:id/tags", h.Todo.GetTags)
			wsProtected.PUT("/todos/:id/tags", h.Todo.ReplaceTags)

			// Workouts (training plans) + their exercise checklists
			wsProtected.GET("/workouts", h.Workout.List)
			wsProtected.GET("/workouts/stats", h.Workout.Stats)
			wsProtected.POST("/workouts", h.Workout.Create)
			wsProtected.PUT("/workouts/:id", h.Workout.Update)
			wsProtected.PATCH("/workouts/:id/toggle", h.Workout.ToggleStatus)
			wsProtected.PATCH("/workouts/:id/reorder", h.Workout.Reorder)
			wsProtected.DELETE("/workouts/:id", h.Workout.Delete)
			wsProtected.GET("/workouts/:id/exercises", h.Workout.ListExercises)
			wsProtected.POST("/workouts/:id/exercises", h.Workout.CreateExercise)
			wsProtected.PUT("/workouts/:id/exercises/:exerciseId", h.Workout.UpdateExercise)
			wsProtected.PATCH("/workouts/:id/exercises/:exerciseId/toggle", h.Workout.ToggleExercise)
			wsProtected.PATCH("/workouts/:id/exercises/:exerciseId/reorder", h.Workout.ReorderExercise)
			wsProtected.DELETE("/workouts/:id/exercises/:exerciseId", h.Workout.DeleteExercise)

			// Body / health records
			wsProtected.GET("/body-metrics", h.Workout.ListMetrics)
			wsProtected.GET("/body-metrics/summary", h.Workout.BodySummary)
			wsProtected.POST("/body-metrics", h.Workout.CreateMetric)
			wsProtected.PUT("/body-metrics/:id", h.Workout.UpdateMetric)
			wsProtected.DELETE("/body-metrics/:id", h.Workout.DeleteMetric)

			// Fitness extras: per-set logs, PRs, exercise library, templates, goals
			wsProtected.GET("/workouts/history", h.Workout.History)
			wsProtected.GET("/workouts/prs", h.Fitness.PRs)
			wsProtected.GET("/workouts/:id/exercises/:exerciseId/sets", h.Fitness.ListSetLogs)
			wsProtected.POST("/workouts/:id/exercises/:exerciseId/sets", h.Fitness.CreateSetLog)
			wsProtected.PUT("/workouts/:id/exercises/:exerciseId/sets/:setId", h.Fitness.UpdateSetLog)
			wsProtected.DELETE("/workouts/:id/exercises/:exerciseId/sets/:setId", h.Fitness.DeleteSetLog)

			wsProtected.GET("/exercise-library", h.Fitness.ListLibrary)
			wsProtected.POST("/exercise-library", h.Fitness.CreateLibraryItem)
			wsProtected.PUT("/exercise-library/:id", h.Fitness.UpdateLibraryItem)
			wsProtected.DELETE("/exercise-library/:id", h.Fitness.DeleteLibraryItem)

			wsProtected.GET("/workout-templates", h.Fitness.ListTemplates)
			wsProtected.POST("/workout-templates", h.Fitness.CreateTemplate)
			wsProtected.PUT("/workout-templates/:id", h.Fitness.UpdateTemplate)
			wsProtected.DELETE("/workout-templates/:id", h.Fitness.DeleteTemplate)
			wsProtected.POST("/workout-templates/:id/instantiate", h.Fitness.InstantiateTemplate)

			wsProtected.GET("/fitness-goals", h.Fitness.ListGoals)
			wsProtected.POST("/fitness-goals", h.Fitness.CreateGoal)
			wsProtected.PUT("/fitness-goals/:id", h.Fitness.UpdateGoal)
			wsProtected.DELETE("/fitness-goals/:id", h.Fitness.DeleteGoal)

			wsProtected.GET("/transactions", h.Transaction.List)
			wsProtected.GET("/transactions/summary", h.Transaction.Summary)
			wsProtected.GET("/transactions/monthly", h.Transaction.Monthly)
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
			}

			// LLM-calling routes hit an external, paid API per request, so they're
			// rate-limited per IP — bounded above the legit interactive rate to
			// cap cost/abuse while a normal chat session is unaffected.
			aiLLM := wsProtected.Group("/ai")
			aiLLM.Use(middleware.NewIPRateLimiter(20, time.Minute).Middleware())
			{
				aiLLM.POST("/chat", h.AI.StreamChat)
				aiLLM.POST("/chat/sync", h.AI.Chat)
				aiLLM.POST("/analyze/relationship/:contactId", h.AI.AnalyzeRelationship)
				aiLLM.POST("/analyze/event/:eventId", h.AI.AnalyzeEvent)
				aiLLM.POST("/analyze", h.AI.AnalyzeComprehensive)
			}

			wsProtected.POST("/export", h.Export.Export)
			wsProtected.POST("/export/todos", h.Export.ExportTodosCSV)
			wsProtected.POST("/export/contacts", h.Export.ExportContactsCSV)
			wsProtected.POST("/export/transactions", h.Export.ExportTransactionsCSV)
			wsProtected.POST("/export/events", h.Export.ExportEventsCSV)
			wsProtected.POST("/import", h.Export.Import)
			wsProtected.POST("/import/todos", h.Export.ImportTodosCSV)
			wsProtected.POST("/import/contacts", h.Export.ImportContactsCSV)
			wsProtected.POST("/import/transactions", h.Export.ImportTransactionsCSV)
		}
	}
}
