package bindings

import (
	"context"
	"sync"

	"github.com/din4e/cuddlegecko/internal/service"
)

var (
	mu sync.RWMutex

	currentUserID uint
)

// Package-level binding instances for Wails Bind in main.go.
// Initialized with empty structs so Wails can generate bindings at compile time.
// Services are injected via InitBindings at runtime.
var (
	Auth        = &AuthBinding{}
	Captcha     = &CaptchaBinding{}
	Contact     = &ContactBinding{}
	Tag         = &TagBinding{}
	Interaction = &InteractionBinding{}
	Reminder    = &ReminderBinding{}
	Graph       = &GraphBinding{}
	Export      = &ExportBinding{}
	Event       = &EventBinding{}
	Transaction = &TransactionBinding{}
	AI          = &AIBinding{}
	Desktop     = &DesktopBinding{}
)

func InitBindings(
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
	contactRepo service.ContactRepository,
	tagRepo service.TagRepository,
	interactionRepo service.InteractionRepository,
	reminderRepo service.ReminderRepository,
	relationRepo service.RelationRepository,
) {
	Auth = &AuthBinding{svc: authSvc}
	Captcha = &CaptchaBinding{svc: captchaSvc}
	Contact = &ContactBinding{svc: contactSvc}
	Tag = &TagBinding{svc: tagSvc}
	Interaction = &InteractionBinding{svc: interactionSvc}
	Reminder = &ReminderBinding{svc: reminderSvc}
	Graph = &GraphBinding{svc: relationSvc}
	Export = &ExportBinding{
		contactRepo:     contactRepo,
		tagRepo:         tagRepo,
		interactionRepo: interactionRepo,
		reminderRepo:    reminderRepo,
		relationRepo:    relationRepo,
	}
	Event = &EventBinding{svc: eventSvc}
	Transaction = &TransactionBinding{svc: transactionSvc}
	AI = &AIBinding{svc: aiSvc}
}

func SetCurrentUserID(id uint) {
	mu.Lock()
	defer mu.Unlock()
	currentUserID = id
}

func GetCurrentUserID() uint {
	mu.RLock()
	defer mu.RUnlock()
	return currentUserID
}

func Ctx() context.Context {
	return context.Background()
}
