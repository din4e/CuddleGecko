package config

import (
	"os"
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	// Ensure no env overrides leak from other tests
	os.Clearenv()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// Server defaults
	if cfg.Server.Port != 8080 {
		t.Errorf("Server.Port = %d, want 8080", cfg.Server.Port)
	}
	if cfg.Server.Mode != "debug" {
		t.Errorf("Server.Mode = %q, want %q", cfg.Server.Mode, "debug")
	}

	// Database defaults
	if cfg.Database.Driver != "sqlite" {
		t.Errorf("Database.Driver = %q, want %q", cfg.Database.Driver, "sqlite")
	}
	if cfg.Database.SQLitePath != "./data/cuddlegecko.db" {
		t.Errorf("Database.SQLitePath = %q, want %q", cfg.Database.SQLitePath, "./data/cuddlegecko.db")
	}
	if cfg.Database.MySQLDSN != "" {
		t.Errorf("Database.MySQLDSN = %q, want empty string", cfg.Database.MySQLDSN)
	}

	// JWT defaults
	if cfg.JWT.Secret != "change-me-in-production" {
		t.Errorf("JWT.Secret = %q, want %q", cfg.JWT.Secret, "change-me-in-production")
	}
	if cfg.JWT.AccessTTL != 15*time.Minute {
		t.Errorf("JWT.AccessTTL = %v, want %v", cfg.JWT.AccessTTL, 15*time.Minute)
	}
	if cfg.JWT.RefreshTTL != 168*time.Hour {
		t.Errorf("JWT.RefreshTTL = %v, want %v", cfg.JWT.RefreshTTL, 168*time.Hour)
	}

	// Log defaults
	if cfg.Log.Level != "info" {
		t.Errorf("Log.Level = %q, want %q", cfg.Log.Level, "info")
	}
	if cfg.Log.Format != "json" {
		t.Errorf("Log.Format = %q, want %q", cfg.Log.Format, "json")
	}
}

func TestLoadEnvOverride(t *testing.T) {
	os.Clearenv()

	// Set environment variable overrides
	os.Setenv("CG_SERVER_PORT", "3000")
	os.Setenv("CG_DATABASE_DRIVER", "mysql")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// Verify overrides take effect
	if cfg.Server.Port != 3000 {
		t.Errorf("Server.Port = %d, want 3000 (env override)", cfg.Server.Port)
	}
	if cfg.Database.Driver != "mysql" {
		t.Errorf("Database.Driver = %q, want %q (env override)", cfg.Database.Driver, "mysql")
	}

	// Verify non-overridden values still have defaults
	if cfg.Server.Mode != "debug" {
		t.Errorf("Server.Mode = %q, want %q (default)", cfg.Server.Mode, "debug")
	}
	if cfg.JWT.AccessTTL != 15*time.Minute {
		t.Errorf("JWT.AccessTTL = %v, want %v (default)", cfg.JWT.AccessTTL, 15*time.Minute)
	}
}
