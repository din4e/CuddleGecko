package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/pkg/config"
	"gorm.io/driver/mysql"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func Init(cfg *config.DatabaseConfig) (*gorm.DB, error) {
	var db *gorm.DB
	var err error

	switch cfg.Driver {
	case "sqlite":
		if err := os.MkdirAll(filepath.Dir(cfg.SQLitePath), 0755); err != nil {
			return nil, fmt.Errorf("create sqlite directory: %w", err)
		}
		db, err = gorm.Open(sqlite.Open(cfg.SQLitePath), &gorm.Config{})
	case "mysql":
		// Retry — MySQL may report healthy via mysqladmin before it fully accepts
		// connections, and `depends_on: service_healthy` in compose doesn't fully
		// cover that gap.
		for attempt := 1; ; attempt++ {
			db, err = gorm.Open(mysql.Open(cfg.MySQLDSN), &gorm.Config{})
			if err == nil {
				break
			}
			if attempt >= 10 {
				return nil, fmt.Errorf("open mysql after %d attempts: %w", attempt, err)
			}
			time.Sleep(time.Second)
		}
	default:
		return nil, fmt.Errorf("unsupported database driver: %s", cfg.Driver)
	}

	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql db: %w", err)
	}
	configurePool(cfg.Driver, sqlDB)

	if cfg.Driver == "sqlite" {
		db.Exec("PRAGMA journal_mode=WAL")
	}

	if err := db.AutoMigrate(
		&model.User{},
		&model.RefreshToken{},
		&model.Workspace{},
		&model.WorkspaceMember{},
		&model.Contact{},
		&model.Tag{},
		&model.Tagging{},
		&model.Interaction{},
		&model.Reminder{},
		&model.ContactRelation{},
		&model.Event{},
		&model.Todo{},
		&model.TodoList{},
		&model.TodoItem{},
		&model.Habit{},
		&model.HabitLog{},
		&model.PomodoroSession{},
		&model.Transaction{},
		&model.AIProvider{},
		&model.AIConversation{},
		&model.AIMessage{},
		&model.Setting{},
		&model.UserSetting{},
	); err != nil {
		return nil, fmt.Errorf("auto migrate: %w", err)
	}

	if err := migrateContactTags(db, cfg.Driver); err != nil {
		return nil, fmt.Errorf("migrate contact tags: %w", err)
	}

	return db, nil
}

// migrateContactTags copies legacy contact_tags rows into the polymorphic
// taggings table (target_type = 'contact'), once. The unique index on taggings
// makes it idempotent. No-op when the legacy table doesn't exist (fresh installs).
func migrateContactTags(db *gorm.DB, driver string) error {
	if !db.Migrator().HasTable("contact_tags") {
		return nil
	}
	stmt := "INSERT OR IGNORE INTO taggings (workspace_id, tag_id, target_type, target_id, created_at) " +
		"SELECT c.workspace_id, ct.tag_id, 'contact', ct.contact_id, CURRENT_TIMESTAMP " +
		"FROM contact_tags ct JOIN contacts c ON c.id = ct.contact_id"
	if driver != "sqlite" {
		stmt = "INSERT IGNORE INTO taggings (workspace_id, tag_id, target_type, target_id, created_at) " +
			"SELECT c.workspace_id, ct.tag_id, 'contact', ct.contact_id, CURRENT_TIMESTAMP " +
			"FROM contact_tags ct JOIN contacts c ON c.id = ct.contact_id"
	}
	return db.Exec(stmt).Error
}

func configurePool(driver string, sqlDB *sql.DB) {
	switch driver {
	case "sqlite":
		// SQLite with WAL still serializes writes; a single connection avoids "database is locked".
		sqlDB.SetMaxOpenConns(1)
		sqlDB.SetMaxIdleConns(1)
		sqlDB.SetConnMaxLifetime(0)
	default:
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(5)
		sqlDB.SetConnMaxLifetime(5 * time.Minute)
	}
}
