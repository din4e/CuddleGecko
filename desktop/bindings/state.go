package bindings

import (
	"context"
	"sync"

	"github.com/din4e/cuddlegecko/internal/service"
)

var (
	mu sync.RWMutex

	currentUserID     uint
	currentWorkspaceID uint
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
	Workspace   = &WorkspaceBinding{}
	Todo        = &TodoBinding{}
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
	todoSvc *service.TodoService,
	transactionSvc *service.TransactionService,
	aiSvc *service.AIService,
	workspaceSvc *service.WorkspaceService,
	exportSvc *service.ExportService,
) {
	Auth = &AuthBinding{svc: authSvc}
	Captcha = &CaptchaBinding{svc: captchaSvc}
	Contact = &ContactBinding{svc: contactSvc}
	Tag = &TagBinding{svc: tagSvc}
	Interaction = &InteractionBinding{svc: interactionSvc}
	Reminder = &ReminderBinding{svc: reminderSvc}
	Graph = &GraphBinding{svc: relationSvc}
	Export = &ExportBinding{svc: exportSvc}
	Event = &EventBinding{svc: eventSvc}
	Todo = &TodoBinding{svc: todoSvc}
	Transaction = &TransactionBinding{svc: transactionSvc}
	AI = &AIBinding{svc: aiSvc}
	Workspace = &WorkspaceBinding{svc: workspaceSvc}
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

func SetCurrentWorkspaceID(id uint) {
	mu.Lock()
	defer mu.Unlock()
	currentWorkspaceID = id
}

func GetCurrentWorkspaceID() uint {
	mu.RLock()
	defer mu.RUnlock()
	return currentWorkspaceID
}

func Ctx() context.Context {
	return context.Background()
}
