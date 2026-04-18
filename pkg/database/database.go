package database

import (
	"fmt"
	"os"
	"path/filepath"

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
		db, err = gorm.Open(mysql.Open(cfg.MySQLDSN), &gorm.Config{})
	default:
		return nil, fmt.Errorf("unsupported database driver: %s", cfg.Driver)
	}

	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if cfg.Driver == "sqlite" {
		db.Exec("PRAGMA journal_mode=WAL")
	}

	if err := db.AutoMigrate(
		&model.User{},
		&model.RefreshToken{},
		&model.Contact{},
		&model.Tag{},
		&model.Interaction{},
		&model.Reminder{},
		&model.ContactRelation{},
		&model.Event{},
		&model.Transaction{},
		&model.AIProvider{},
		&model.AIConversation{},
		&model.AIMessage{},
	); err != nil {
		return nil, fmt.Errorf("auto migrate: %w", err)
	}

	return db, nil
}
