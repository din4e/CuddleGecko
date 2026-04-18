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
}

func NewHandlers(
	authSvc *service.AuthService,
	captchaSvc *service.CaptchaService,
	contactSvc *service.ContactService,
	tagSvc *service.TagService,
	interactionSvc *service.InteractionService,
	reminderSvc *service.ReminderService,
	relationSvc *service.RelationService,
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
	}
}

func RegisterRoutes(r *gin.Engine, h *Handlers, jwtCfg *config.JWTConfig) {
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

			protected.POST("/upload/avatar", h.Upload.UploadAvatar)

			contacts := protected.Group("/contacts")
			{
				contacts.GET("", h.Contact.List)
				contacts.POST("", h.Contact.Create)
				contacts.GET("/:id", h.Contact.GetByID)
				contacts.PUT("/:id", h.Contact.Update)
				contacts.DELETE("/:id", h.Contact.Delete)
				contacts.GET("/:id/tags", h.Contact.GetTags)
				contacts.PUT("/:id/tags", h.Contact.ReplaceTags)
				contacts.GET("/:id/interactions", h.Interaction.ListByContact)
				contacts.POST("/:id/interactions", h.Interaction.Create)
				contacts.POST("/:id/reminders", h.Reminder.Create)
				contacts.GET("/:id/relations", h.Graph.GetRelations)
				contacts.POST("/:id/relations", h.Graph.CreateRelation)
			}

			protected.GET("/tags", h.Tag.List)
			protected.POST("/tags", h.Tag.Create)
			protected.PUT("/tags/:id", h.Tag.Update)
			protected.DELETE("/tags/:id", h.Tag.Delete)

			protected.PUT("/interactions/:id", h.Interaction.Update)
			protected.DELETE("/interactions/:id", h.Interaction.Delete)

			protected.GET("/reminders", h.Reminder.List)
			protected.PUT("/reminders/:id", h.Reminder.Update)
			protected.DELETE("/reminders/:id", h.Reminder.Delete)

			protected.DELETE("/relations/:id", h.Graph.DeleteRelation)

			protected.GET("/graph", h.Graph.GetGraph)
		}
	}
}
