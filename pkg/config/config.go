// Package config provides configuration loading for CuddleGecko
// using Viper with YAML files, environment variable overrides,
// and sensible defaults.
package config

import (
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all application configuration.
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Log      LogConfig
	Captcha  CaptchaConfig
}

// CaptchaConfig holds image captcha settings.
type CaptchaConfig struct {
	Enabled bool
	Length  int
}

// ServerConfig holds HTTP server settings.
type ServerConfig struct {
	Port int
	Mode string
}

// DatabaseConfig holds database connection settings.
type DatabaseConfig struct {
	Driver     string
	SQLitePath string
	MySQLDSN   string
}

// JWTConfig holds JWT authentication settings.
type JWTConfig struct {
	Secret     string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
}

// LogConfig holds logging settings.
type LogConfig struct {
	Level  string
	Format string
}

// Load reads configuration from config.yaml (if present), environment
// variables (prefixed with CG_), and built-in defaults. A missing config
// file is not an error — defaults will be used.
func Load() (*Config, error) {
	v := viper.New()

	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath(".")
	v.AddConfigPath("./config")

	// Environment variable overrides
	v.SetEnvPrefix("CG")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Defaults
	v.SetDefault("server.port", 8080)
	v.SetDefault("server.mode", "debug")

	v.SetDefault("database.driver", "sqlite")
	v.SetDefault("database.sqlite_path", "./data/cuddlegecko.db")
	v.SetDefault("database.mysql_dsn", "")

	v.SetDefault("jwt.secret", "change-me-in-production")
	v.SetDefault("jwt.access_ttl", "15m")
	v.SetDefault("jwt.refresh_ttl", "168h")

	v.SetDefault("log.level", "info")
	v.SetDefault("log.format", "json")

	v.SetDefault("captcha.enabled", true)
	v.SetDefault("captcha.length", 4)

	// Read config file; not found is acceptable
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, err
		}
	}

	// Parse JWT TTL duration strings
	accessTTL, err := time.ParseDuration(v.GetString("jwt.access_ttl"))
	if err != nil {
		return nil, err
	}

	refreshTTL, err := time.ParseDuration(v.GetString("jwt.refresh_ttl"))
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		Server: ServerConfig{
			Port: v.GetInt("server.port"),
			Mode: v.GetString("server.mode"),
		},
		Database: DatabaseConfig{
			Driver:     v.GetString("database.driver"),
			SQLitePath: v.GetString("database.sqlite_path"),
			MySQLDSN:   v.GetString("database.mysql_dsn"),
		},
		JWT: JWTConfig{
			Secret:     v.GetString("jwt.secret"),
			AccessTTL:  accessTTL,
			RefreshTTL: refreshTTL,
		},
		Log: LogConfig{
			Level:  v.GetString("log.level"),
			Format: v.GetString("log.format"),
		},
		Captcha: CaptchaConfig{
			Enabled: v.GetBool("captcha.enabled"),
			Length:  v.GetInt("captcha.length"),
		},
	}

	return cfg, nil
}
