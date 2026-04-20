package desktop

import (
	"context"
	"os"
	"path/filepath"

	"github.com/din4e/cuddlegecko/desktop/bindings"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/database"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails application struct. Its public methods are bound to the frontend.
type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	cfg, err := config.Load()
	if err != nil {
		panic("Failed to load config: " + err.Error())
	}

	// Use OS user data dir for SQLite in desktop mode
	if cfg.Database.Driver == "sqlite" {
		dataDir, err := os.UserConfigDir()
		if err != nil {
			dataDir = "."
		}
		dataDir = filepath.Join(dataDir, "CuddleGecko")
		os.MkdirAll(dataDir, 0755)
		cfg.Database.SQLitePath = filepath.Join(dataDir, "cuddlegecko.db")
	}

	db, err := database.Init(&cfg.Database)
	if err != nil {
		panic("Failed to init database: " + err.Error())
	}

	// Repositories
	userRepo := repository.NewUserRepo(db)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	eventRepo := repository.NewEventRepo(db)
	transactionRepo := repository.NewTransactionRepo(db)
	aiRepo := repository.NewAIRepo(db)

	// Services
	authSvc := service.NewAuthService(userRepo, &cfg.JWT)
	captchaSvc := service.NewCaptchaService(cfg.Captcha)
	contactSvc := service.NewContactService(contactRepo)
	tagSvc := service.NewTagService(tagRepo)
	interactionSvc := service.NewInteractionService(interactionRepo)
	reminderSvc := service.NewReminderService(reminderRepo)
	relationSvc := service.NewRelationService(relationRepo, contactRepo)
	eventSvc := service.NewEventService(eventRepo)
	transactionSvc := service.NewTransactionService(transactionRepo)
	aiSvc := service.NewAIService(aiRepo, contactRepo, eventRepo, interactionRepo, transactionRepo, relationRepo)

	// Bindings
	bindings.InitBindings(
		authSvc, captchaSvc, contactSvc, tagSvc,
		interactionSvc, reminderSvc, relationSvc,
		eventSvc, transactionSvc, aiSvc,
		contactRepo, tagRepo, interactionRepo,
		reminderRepo, relationRepo,
	)

	// Restore window state after a short delay (let Wails finish init)
	go a.restoreWindowState()
}

func (a *App) shutdown(_ context.Context) {
	a.saveWindowState()
}

func (a *App) saveWindowState() {
	if a.ctx == nil {
		return
	}
	x, y := runtime.WindowGetPosition(a.ctx)
	w, h := runtime.WindowGetSize(a.ctx)
	maximised := runtime.WindowIsMaximised(a.ctx)

	state := &windowState{
		X: x, Y: y, Width: w, Height: h, Maximised: maximised,
	}
	_ = state.save()
}

func (a *App) restoreWindowState() {
	if a.ctx == nil {
		return
	}
	state, err := loadWindowState()
	if err != nil {
		return
	}
	runtime.WindowSetPosition(a.ctx, state.X, state.Y)
	runtime.WindowSetSize(a.ctx, state.Width, state.Height)
	if state.Maximised {
		runtime.WindowMaximise(a.ctx)
	}
}
