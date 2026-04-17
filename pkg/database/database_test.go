package database

import (
	"testing"

	"github.com/din4e/cuddlegecko/pkg/config"
)

func TestInitSQLite(t *testing.T) {
	cfg := &config.DatabaseConfig{
		Driver:     "sqlite",
		SQLitePath: t.TempDir() + "/test.db",
	}
	db, err := Init(cfg)
	if err != nil {
		t.Fatalf("Init() error = %v", err)
	}
	if db == nil {
		t.Fatal("Init() returned nil db")
	}
	sqlDB, _ := db.DB()
	sqlDB.Close()
}

func TestInitUnsupportedDriver(t *testing.T) {
	cfg := &config.DatabaseConfig{Driver: "postgres"}
	_, err := Init(cfg)
	if err == nil {
		t.Fatal("expected error for unsupported driver")
	}
}
