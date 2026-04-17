# CuddleGecko Go Backend MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Go backend API for CuddleGecko — a personal CRM with contacts, interactions, tags, reminders, and network graph visualization.

**Architecture:** Layered architecture (handler → service → repository → model) using Gin, GORM, and JWT auth. Each layer tested independently via interfaces. SQLite for local dev, MySQL for production, both managed by GORM.

**Tech Stack:** Go 1.24, Gin, GORM, SQLite/MySQL, JWT (golang-jwt/v5), bcrypt, Viper, testify

---

## File Structure

| File | Responsibility |
|------|---------------|
| `go.mod` | Module definition and dependencies |
| `config.yaml` | Default application configuration |
| `cmd/server/main.go` | Entry point: load config, init DB, wire routes, start server |
| `pkg/config/config.go` | Viper-based config loading with env var overrides |
| `pkg/database/database.go` | GORM initialization (SQLite/MySQL switch) and auto-migration |
| `pkg/response/response.go` | Unified JSON response helpers |
| `pkg/middleware/auth.go` | JWT authentication middleware |
| `pkg/middleware/cors.go` | CORS middleware |
| `internal/model/user.go` | User domain model |
| `internal/model/refresh_token.go` | Refresh token model |
| `internal/model/contact.go` | Contact domain model with relationship types |
| `internal/model/tag.go` | Tag domain model |
| `internal/model/interaction.go` | Interaction domain model with types |
| `internal/model/reminder.go` | Reminder domain model with statuses |
| `internal/model/relation.go` | Contact relation model (network graph edges) |
| `internal/repository/user.go` | User and refresh token data access |
| `internal/repository/contact.go` | Contact data access with tag association |
| `internal/repository/tag.go` | Tag data access |
| `internal/repository/interaction.go` | Interaction data access |
| `internal/repository/reminder.go` | Reminder data access |
| `internal/repository/relation.go` | Contact relation data access |
| `internal/service/auth.go` | Auth business logic (register, login, refresh) |
| `internal/service/contact.go` | Contact business logic |
| `internal/service/tag.go` | Tag business logic |
| `internal/service/interaction.go` | Interaction business logic |
| `internal/service/reminder.go` | Reminder business logic |
| `internal/service/relation.go` | Relation business logic + graph data |
| `internal/handler/auth.go` | Auth HTTP handlers |
| `internal/handler/contact.go` | Contact HTTP handlers |
| `internal/handler/tag.go` | Tag HTTP handlers |
| `internal/handler/interaction.go` | Interaction HTTP handlers |
| `internal/handler/reminder.go` | Reminder HTTP handlers |
| `internal/handler/graph.go` | Network graph HTTP handler |
| `internal/handler/router.go` | Route registration and dependency wiring |

---

## Task 1: Project Scaffold and Configuration

**Files:**
- Create: `go.mod`
- Create: `config.yaml`
- Create: `pkg/config/config.go`
- Test: `pkg/config/config_test.go`

- [ ] **Step 1: Initialize Go module**

Run:
```bash
go mod init github.com/din4e/cuddlegecko
```

- [ ] **Step 2: Create config.yaml**

```yaml
server:
  port: 8080
  mode: debug

database:
  driver: sqlite
  sqlite_path: ./data/cuddlegecko.db
  mysql_dsn: ""

jwt:
  secret: "change-me-in-production"
  access_ttl: 15m
  refresh_ttl: 168h

log:
  level: info
  format: json
```

- [ ] **Step 3: Write failing test for config loading**

```go
// pkg/config/config_test.go
package config

import (
	"os"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Server.Port != 8080 {
		t.Errorf("expected port 8080, got %d", cfg.Server.Port)
	}
	if cfg.Database.Driver != "sqlite" {
		t.Errorf("expected driver sqlite, got %s", cfg.Database.Driver)
	}
	if cfg.JWT.Secret != "change-me-in-production" {
		t.Errorf("expected default JWT secret")
	}
	if cfg.JWT.AccessTTL.Seconds() != 900 { // 15m
		t.Errorf("expected access TTL 15m, got %v", cfg.JWT.AccessTTL)
	}
}

func TestLoadEnvOverride(t *testing.T) {
	os.Setenv("CG_SERVER_PORT", "3000")
	os.Setenv("CG_DATABASE_DRIVER", "mysql")
	defer os.Unsetenv("CG_SERVER_PORT")
	defer os.Unsetenv("CG_DATABASE_DRIVER")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Server.Port != 3000 {
		t.Errorf("expected port 3000 from env, got %d", cfg.Server.Port)
	}
	if cfg.Database.Driver != "mysql" {
		t.Errorf("expected driver mysql from env, got %s", cfg.Database.Driver)
	}
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `go test ./pkg/config/ -v`
Expected: FAIL — `config` package doesn't exist yet

- [ ] **Step 5: Install Viper dependency**

Run: `go get github.com/spf13/viper`

- [ ] **Step 6: Implement config loading**

```go
// pkg/config/config.go
package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Log      LogConfig
}

type ServerConfig struct {
	Port int
	Mode string
}

type DatabaseConfig struct {
	Driver     string
	SQLitePath string
	MySQLDSN   string
}

type JWTConfig struct {
	Secret     string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
}

type LogConfig struct {
	Level  string
	Format string
}

func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	viper.SetEnvPrefix("CG")
	viper.AutomaticEnv()

	viper.SetDefault("server.port", 8080)
	viper.SetDefault("server.mode", "debug")
	viper.SetDefault("database.driver", "sqlite")
	viper.SetDefault("database.sqlite_path", "./data/cuddlegecko.db")
	viper.SetDefault("database.mysql_dsn", "")
	viper.SetDefault("jwt.secret", "change-me-in-production")
	viper.SetDefault("jwt.access_ttl", "15m")
	viper.SetDefault("jwt.refresh_ttl", "168h")
	viper.SetDefault("log.level", "info")
	viper.SetDefault("log.format", "json")

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("read config: %w", err)
		}
	}

	accessTTL, err := time.ParseDuration(viper.GetString("jwt.access_ttl"))
	if err != nil {
		return nil, fmt.Errorf("parse jwt.access_ttl: %w", err)
	}
	refreshTTL, err := time.ParseDuration(viper.GetString("jwt.refresh_ttl"))
	if err != nil {
		return nil, fmt.Errorf("parse jwt.refresh_ttl: %w", err)
	}

	return &Config{
		Server: ServerConfig{
			Port: viper.GetInt("server.port"),
			Mode: viper.GetString("server.mode"),
		},
		Database: DatabaseConfig{
			Driver:     viper.GetString("database.driver"),
			SQLitePath: viper.GetString("database.sqlite_path"),
			MySQLDSN:   viper.GetString("database.mysql_dsn"),
		},
		JWT: JWTConfig{
			Secret:     viper.GetString("jwt.secret"),
			AccessTTL:  accessTTL,
			RefreshTTL: refreshTTL,
		},
		Log: LogConfig{
			Level:  viper.GetString("log.level"),
			Format: viper.GetString("log.format"),
		},
	}, nil
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `go test ./pkg/config/ -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add go.mod go.sum config.yaml pkg/config/
git commit -m "feat: project scaffold with Viper config loading"
```

---

## Task 2: Database Initialization and Domain Models

**Files:**
- Create: `pkg/database/database.go`
- Create: `internal/model/user.go`
- Create: `internal/model/refresh_token.go`
- Create: `internal/model/contact.go`
- Create: `internal/model/tag.go`
- Create: `internal/model/interaction.go`
- Create: `internal/model/reminder.go`
- Create: `internal/model/relation.go`
- Test: `pkg/database/database_test.go`

- [ ] **Step 1: Install GORM and driver dependencies**

Run:
```bash
go get gorm.io/gorm gorm.io/driver/sqlite gorm.io/driver/mysql
```

- [ ] **Step 2: Write all domain models**

```go
// internal/model/user.go
package model

import "time"

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"uniqueIndex;size:50;not null" json:"username"`
	Email        string    `gorm:"uniqueIndex;size:100;not null" json:"email"`
	PasswordHash string    `gorm:"column:password_hash;size:255;not null" json:"-"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}
```

```go
// internal/model/refresh_token.go
package model

import "time"

type RefreshToken struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"user_id"`
	Token     string    `gorm:"uniqueIndex;size:255;not null" json:"token"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	Revoked   bool      `gorm:"default:false" json:"revoked"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}
```

```go
// internal/model/contact.go
package model

import (
	"time"

	"gorm.io/gorm"
)

type RelationshipType string

const (
	RelationshipFamily    RelationshipType = "family"
	RelationshipFriend    RelationshipType = "friend"
	RelationshipColleague RelationshipType = "colleague"
	RelationshipClient    RelationshipType = "client"
	RelationshipOther     RelationshipType = "other"
)

type Contact struct {
	ID               uint             `gorm:"primaryKey" json:"id"`
	UserID           uint             `gorm:"index;not null" json:"user_id"`
	Name             string           `gorm:"size:100;not null" json:"name"`
	Nickname         string           `gorm:"size:100" json:"nickname"`
	AvatarURL        string           `gorm:"size:500" json:"avatar_url"`
	Phone            string           `gorm:"size:50" json:"phone"`
	Email            string           `gorm:"size:100" json:"email"`
	Birthday         *time.Time       `json:"birthday"`
	Notes            string           `gorm:"type:text" json:"notes"`
	RelationshipType RelationshipType `gorm:"size:20;default:'other'" json:"relationship_type"`
	Tags             []Tag            `gorm:"many2many:contact_tags" json:"tags"`
	CreatedAt        time.Time        `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt        time.Time        `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt        gorm.DeletedAt   `gorm:"index" json:"-"`
}
```

```go
// internal/model/tag.go
package model

import "time"

type Tag struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:idx_user_tag;not null" json:"user_id"`
	Name      string    `gorm:"uniqueIndex:idx_user_tag;size:50;not null" json:"name"`
	Color     string    `gorm:"size:7" json:"color"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}
```

```go
// internal/model/interaction.go
package model

import (
	"time"

	"gorm.io/gorm"
)

type InteractionType string

const (
	InteractionMeeting InteractionType = "meeting"
	InteractionCall    InteractionType = "call"
	InteractionMessage InteractionType = "message"
	InteractionEmail   InteractionType = "email"
	InteractionOther   InteractionType = "other"
)

type Interaction struct {
	ID         uint             `gorm:"primaryKey" json:"id"`
	UserID     uint             `gorm:"index;not null" json:"user_id"`
	ContactID  uint             `gorm:"index;not null" json:"contact_id"`
	Type       InteractionType  `gorm:"size:20;not null" json:"type"`
	Title      string           `gorm:"size:200;not null" json:"title"`
	Content    string           `gorm:"type:text" json:"content"`
	OccurredAt time.Time        `gorm:"not null" json:"occurred_at"`
	CreatedAt  time.Time        `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt  time.Time        `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt  gorm.DeletedAt   `gorm:"index" json:"-"`
}
```

```go
// internal/model/reminder.go
package model

import "time"

type ReminderStatus string

const (
	ReminderPending ReminderStatus = "pending"
	ReminderDone    ReminderStatus = "done"
	ReminderSnoozed ReminderStatus = "snoozed"
)

type Reminder struct {
	ID          uint            `gorm:"primaryKey" json:"id"`
	UserID      uint            `gorm:"index;not null" json:"user_id"`
	ContactID   uint            `gorm:"index;not null" json:"contact_id"`
	Title       string          `gorm:"size:200;not null" json:"title"`
	Description string          `gorm:"type:text" json:"description"`
	RemindAt    time.Time       `gorm:"not null" json:"remind_at"`
	Status      ReminderStatus  `gorm:"size:20;default:'pending'" json:"status"`
	CreatedAt   time.Time       `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time       `gorm:"autoUpdateTime" json:"updated_at"`
}
```

```go
// internal/model/relation.go
package model

import "time"

type ContactRelation struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"user_id"`
	ContactIDA   uint      `gorm:"index;not null" json:"contact_id_a"`
	ContactIDB   uint      `gorm:"index;not null" json:"contact_id_b"`
	RelationType string    `gorm:"size:50" json:"relation_type"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
}
```

- [ ] **Step 3: Write failing test for database init**

```go
// pkg/database/database_test.go
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

	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("db.DB() error = %v", err)
	}
	sqlDB.Close()
}

func TestInitUnsupportedDriver(t *testing.T) {
	cfg := &config.DatabaseConfig{
		Driver: "postgres",
	}

	_, err := Init(cfg)
	if err == nil {
		t.Fatal("expected error for unsupported driver")
	}
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `go test ./pkg/database/ -v`
Expected: FAIL

- [ ] **Step 5: Implement database init**

```go
// pkg/database/database.go
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
	); err != nil {
		return nil, fmt.Errorf("auto migrate: %w", err)
	}

	return db, nil
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `go test ./pkg/database/ -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add pkg/database/ internal/model/ go.mod go.sum
git commit -m "feat: database init with GORM and all domain models"
```

---

## Task 3: Response Helpers

**Files:**
- Create: `pkg/response/response.go`
- Test: `pkg/response/response_test.go`

- [ ] **Step 1: Write failing test**

```go
// pkg/response/response_test.go
package response

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestOK(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	OK(c, gin.H{"id": 1})

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Code != 0 {
		t.Errorf("expected code 0, got %d", resp.Code)
	}
	if resp.Message != "success" {
		t.Errorf("expected message 'success', got '%s'", resp.Message)
	}
}

func TestBadRequest(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	BadRequest(c, "invalid input")

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	var resp Response
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Code != 40000 {
		t.Errorf("expected code 40000, got %d", resp.Code)
	}
}

func TestNotFound(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	NotFound(c, "contact not found")

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}

	var resp Response
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Code != 40400 {
		t.Errorf("expected code 40400, got %d", resp.Code)
	}
	if resp.Message != "contact not found" {
		t.Errorf("expected 'contact not found', got '%s'", resp.Message)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./pkg/response/ -v`
Expected: FAIL

- [ ] **Step 3: Install Gin and implement response helpers**

Run: `go get github.com/gin-gonic/gin`

```go
// pkg/response/response.go
package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Response struct {
	Code    int         `json:"code"`
	Data    interface{} `json:"data"`
	Message string      `json:"message"`
}

type PaginatedData struct {
	Items    interface{} `json:"items"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
}

func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{Code: 0, Data: data, Message: "success"})
}

func OKPaginated(c *gin.Context, items interface{}, total int64, page, pageSize int) {
	OK(c, PaginatedData{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, Response{Code: 0, Data: data, Message: "created"})
}

func BadRequest(c *gin.Context, msg string) {
	c.JSON(http.StatusBadRequest, Response{Code: 40000, Data: nil, Message: msg})
}

func Unauthorized(c *gin.Context, msg string) {
	c.JSON(http.StatusUnauthorized, Response{Code: 40100, Data: nil, Message: msg})
}

func Forbidden(c *gin.Context, msg string) {
	c.JSON(http.StatusForbidden, Response{Code: 40300, Data: nil, Message: msg})
}

func NotFound(c *gin.Context, msg string) {
	c.JSON(http.StatusNotFound, Response{Code: 40400, Data: nil, Message: msg})
}

func InternalError(c *gin.Context, msg string) {
	c.JSON(http.StatusInternalServerError, Response{Code: 50000, Data: nil, Message: msg})
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./pkg/response/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pkg/response/
git commit -m "feat: unified JSON response helpers"
```

---

## Task 4: JWT Auth Middleware

**Files:**
- Create: `pkg/middleware/auth.go`
- Create: `pkg/middleware/cors.go`
- Test: `pkg/middleware/auth_test.go`

- [ ] **Step 1: Install JWT and bcrypt dependencies**

Run:
```bash
go get github.com/golang-jwt/jwt/v5
go get golang.org/x/crypto
```

- [ ] **Step 2: Write failing test for JWT middleware**

```go
// pkg/middleware/auth_test.go
package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func makeToken(secret string, userID uint, ttl time.Duration) string {
	claims := jwt.MapClaims{
		"user_id": float64(userID),
		"exp":     time.Now().Add(ttl).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, _ := token.SignedString([]byte(secret))
	return s
}

func TestJWTAuth_ValidToken(t *testing.T) {
	jwtCfg := &config.JWTConfig{Secret: "test-secret", AccessTTL: 15 * time.Minute}

	r := gin.New()
	r.Use(JWTAuth(jwtCfg))
	r.GET("/test", func(c *gin.Context) {
		uid := GetUserID(c)
		c.JSON(200, gin.H{"user_id": uid})
	})

	token := makeToken("test-secret", 42, 15*time.Minute)
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestJWTAuth_MissingHeader(t *testing.T) {
	jwtCfg := &config.JWTConfig{Secret: "test-secret", AccessTTL: 15 * time.Minute}

	r := gin.New()
	r.Use(JWTAuth(jwtCfg))
	r.GET("/test", func(c *gin.Context) { c.Status(200) })

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestJWTAuth_InvalidToken(t *testing.T) {
	jwtCfg := &config.JWTConfig{Secret: "test-secret", AccessTTL: 15 * time.Minute}

	r := gin.New()
	r.Use(JWTAuth(jwtCfg))
	r.GET("/test", func(c *gin.Context) { c.Status(200) })

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestJWTAuth_ExpiredToken(t *testing.T) {
	jwtCfg := &config.JWTConfig{Secret: "test-secret", AccessTTL: 15 * time.Minute}

	r := gin.New()
	r.Use(JWTAuth(jwtCfg))
	r.GET("/test", func(c *gin.Context) { c.Status(200) })

	token := makeToken("test-secret", 42, -1*time.Hour)
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `go test ./pkg/middleware/ -v`
Expected: FAIL

- [ ] **Step 4: Implement JWT middleware**

```go
// pkg/middleware/auth.go
package middleware

import (
	"strings"

	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func JWTAuth(jwtCfg *config.JWTConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.Unauthorized(c, "missing authorization header")
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			response.Unauthorized(c, "invalid authorization format")
			c.Abort()
			return
		}

		token, err := jwt.Parse(parts[1], func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtCfg.Secret), nil
		})

		if err != nil || !token.Valid {
			response.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			response.Unauthorized(c, "invalid token claims")
			c.Abort()
			return
		}

		userID, ok := claims["user_id"].(float64)
		if !ok {
			response.Unauthorized(c, "invalid user_id in token")
			c.Abort()
			return
		}

		c.Set("user_id", uint(userID))
		c.Next()
	}
}

func GetUserID(c *gin.Context) uint {
	return c.GetUint("user_id")
}
```

```go
// pkg/middleware/cors.go
package middleware

import "github.com/gin-gonic/gin"

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type,Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./pkg/middleware/ -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add pkg/middleware/
git commit -m "feat: JWT auth middleware and CORS"
```

---

## Task 5: Auth System (Repository + Service + Handler)

**Files:**
- Create: `internal/repository/user.go`
- Create: `internal/service/auth.go`
- Create: `internal/handler/auth.go`
- Test: `internal/service/auth_test.go`
- Test: `internal/handler/auth_test.go`

- [ ] **Step 1: Write failing test for auth service**

```go
// internal/service/auth_test.go
package service

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

type mockUserRepo struct {
	mock.Mock
}

func (m *mockUserRepo) CreateUser(ctx context.Context, user *model.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *mockUserRepo) GetUserByUsername(ctx context.Context, username string) (*model.User, error) {
	args := m.Called(ctx, username)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.User), args.Error(1)
}

func (m *mockUserRepo) GetUserByID(ctx context.Context, id uint) (*model.User, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.User), args.Error(1)
}

func (m *mockUserRepo) CreateRefreshToken(ctx context.Context, token *model.RefreshToken) error {
	args := m.Called(ctx, token)
	return args.Error(0)
}

func (m *mockUserRepo) GetRefreshToken(ctx context.Context, token string) (*model.RefreshToken, error) {
	args := m.Called(ctx, token)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.RefreshToken), args.Error(1)
}

func (m *mockUserRepo) RevokeRefreshToken(ctx context.Context, token string) error {
	args := m.Called(ctx, token)
	return args.Error(0)
}

func testJWTConfig() *config.JWTConfig {
	return &config.JWTConfig{
		Secret:     "test-secret",
		AccessTTL:  15 * 60 * 1e9, // 15 minutes in nanoseconds
		RefreshTTL: 168 * 3600 * 1e9,
	}
}

func TestAuthService_Register_Success(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig())

	repo.On("GetUserByUsername", mock.Anything, "alice").Return(nil, ErrUserNotFound)
	repo.On("CreateUser", mock.Anything, mock.AnythingOfType("*model.User")).Return(nil)
	repo.On("CreateRefreshToken", mock.Anything, mock.AnythingOfType("*model.RefreshToken")).Return(nil)

	result, err := svc.Register(context.Background(), "alice", "alice@example.com", "password123")
	assert.NoError(t, err)
	assert.NotEmpty(t, result.AccessToken)
	assert.NotEmpty(t, result.RefreshToken)
	assert.Equal(t, "alice", result.User.Username)
	repo.AssertExpectations(t)
}

func TestAuthService_Register_DuplicateUsername(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig())

	repo.On("GetUserByUsername", mock.Anything, "alice").Return(&model.User{Username: "alice"}, nil)

	_, err := svc.Register(context.Background(), "alice", "alice2@example.com", "password123")
	assert.ErrorIs(t, err, ErrUserExists)
}

func TestAuthService_Login_Success(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig())

	hashed, _ := hashPassword("password123")
	repo.On("GetUserByUsername", mock.Anything, "alice").Return(&model.User{
		ID: 1, Username: "alice", PasswordHash: hashed,
	}, nil)
	repo.On("CreateRefreshToken", mock.Anything, mock.AnythingOfType("*model.RefreshToken")).Return(nil)

	result, err := svc.Login(context.Background(), "alice", "password123")
	assert.NoError(t, err)
	assert.NotEmpty(t, result.AccessToken)
	assert.NotEmpty(t, result.RefreshToken)
}

func TestAuthService_Login_WrongPassword(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig())

	hashed, _ := hashPassword("password123")
	repo.On("GetUserByUsername", mock.Anything, "alice").Return(&model.User{
		ID: 1, Username: "alice", PasswordHash: hashed,
	}, nil)

	_, err := svc.Login(context.Background(), "alice", "wrongpassword")
	assert.ErrorIs(t, err, ErrInvalidCredentials)
}

func TestAuthService_Login_UserNotFound(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig())

	repo.On("GetUserByUsername", mock.Anything, "alice").Return(nil, ErrUserNotFound)

	_, err := svc.Login(context.Background(), "alice", "password123")
	assert.ErrorIs(t, err, ErrInvalidCredentials)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/service/ -v`
Expected: FAIL

- [ ] **Step 3: Install testify, implement user repository**

Run: `go get github.com/stretchr/testify`

```go
// internal/repository/user.go
package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type UserRepo struct {
	db *gorm.DB
}

func NewUserRepo(db *gorm.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) CreateUser(ctx context.Context, user *model.User) error {
	if err := r.db.WithContext(ctx).Create(user).Error; err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

func (r *UserRepo) GetUserByUsername(ctx context.Context, username string) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).Where("username = ?", username).First(&user).Error; err != nil {
		return nil, fmt.Errorf("get user by username: %w", err)
	}
	return &user, nil
}

func (r *UserRepo) GetUserByID(ctx context.Context, id uint) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).First(&user, id).Error; err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &user, nil
}

func (r *UserRepo) CreateRefreshToken(ctx context.Context, token *model.RefreshToken) error {
	if err := r.db.WithContext(ctx).Create(token).Error; err != nil {
		return fmt.Errorf("create refresh token: %w", err)
	}
	return nil
}

func (r *UserRepo) GetRefreshToken(ctx context.Context, token string) (*model.RefreshToken, error) {
	var rt model.RefreshToken
	if err := r.db.WithContext(ctx).Where("token = ?", token).First(&rt).Error; err != nil {
		return nil, fmt.Errorf("get refresh token: %w", err)
	}
	return &rt, nil
}

func (r *UserRepo) RevokeRefreshToken(ctx context.Context, token string) error {
	if err := r.db.WithContext(ctx).Model(&model.RefreshToken{}).Where("token = ?", token).Update("revoked", true).Error; err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Implement auth service**

```go
// internal/service/auth.go
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserNotFound      = errors.New("user not found")
	ErrUserExists        = errors.New("username already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken      = errors.New("invalid or revoked refresh token")
)

type UserRepository interface {
	CreateUser(ctx context.Context, user *model.User) error
	GetUserByUsername(ctx context.Context, username string) (*model.User, error)
	GetUserByID(ctx context.Context, id uint) (*model.User, error)
	CreateRefreshToken(ctx context.Context, token *model.RefreshToken) error
	GetRefreshToken(ctx context.Context, token string) (*model.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, token string) error
}

type AuthResult struct {
	User         *model.User
	AccessToken  string
	RefreshToken string
}

type AuthService struct {
	repo   UserRepository
	jwtCfg *config.JWTConfig
}

func NewAuthService(repo UserRepository, jwtCfg *config.JWTConfig) *AuthService {
	return &AuthService{repo: repo, jwtCfg: jwtCfg}
}

func (s *AuthService) Register(ctx context.Context, username, email, password string) (*AuthResult, error) {
	existing, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil && !errors.Is(err, ErrUserNotFound) {
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserExists
	}

	hash, err := hashPassword(password)
	if err != nil {
		return nil, err
	}

	user := &model.User{
		Username:     username,
		Email:        email,
		PasswordHash: hash,
	}

	if err := s.repo.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	return s.generateTokens(ctx, user)
}

func (s *AuthService) Login(ctx context.Context, username, password string) (*AuthResult, error) {
	user, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if err := checkPassword(password, user.PasswordHash); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.generateTokens(ctx, user)
}

func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*AuthResult, error) {
	rt, err := s.repo.GetRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, ErrInvalidToken
	}

	if rt.Revoked || time.Now().After(rt.ExpiresAt) {
		return nil, ErrInvalidToken
	}

	if err := s.repo.RevokeRefreshToken(ctx, refreshToken); err != nil {
		return nil, err
	}

	user, err := s.repo.GetUserByID(ctx, rt.UserID)
	if err != nil {
		return nil, err
	}

	return s.generateTokens(ctx, user)
}

func (s *AuthService) GetCurrentUser(ctx context.Context, userID uint) (*model.User, error) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func (s *AuthService) generateTokens(ctx context.Context, user *model.User) (*AuthResult, error) {
	accessToken, err := s.generateAccessToken(user)
	if err != nil {
		return nil, err
	}

	refreshTokenStr := generateRefreshToken()
	rt := &model.RefreshToken{
		UserID:    user.ID,
		Token:     refreshTokenStr,
		ExpiresAt: time.Now().Add(s.jwtCfg.RefreshTTL),
	}

	if err := s.repo.CreateRefreshToken(ctx, rt); err != nil {
		return nil, err
	}

	return &AuthResult{
		User:         user,
		AccessToken:  accessToken,
		RefreshToken: refreshTokenStr,
	}, nil
}

func (s *AuthService) generateAccessToken(user *model.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"exp":     time.Now().Add(s.jwtCfg.AccessTTL).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtCfg.Secret))
}

func generateRefreshToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func checkPassword(password, hash string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
```

- [ ] **Step 5: Run service tests to verify they pass**

Run: `go test ./internal/service/ -v`
Expected: PASS

- [ ] **Step 6: Implement auth handler**

```go
// internal/handler/auth.go
package handler

import (
	"net/http"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	svc *service.AuthService
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

type registerRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type authResponse struct {
	User         interface{} `json:"user"`
	AccessToken  string      `json:"access_token"`
	RefreshToken string      `json:"refresh_token"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	result, err := h.svc.Register(c.Request.Context(), req.Username, req.Email, req.Password)
	if err != nil {
		switch err {
		case service.ErrUserExists:
			response.BadRequest(c, "username already exists")
		default:
			response.InternalError(c, "failed to register")
		}
		return
	}

	c.JSON(http.StatusCreated, response.Response{
		Code:    0,
		Data: authResponse{
			User:         result.User,
			AccessToken:  result.AccessToken,
			RefreshToken: result.RefreshToken,
		},
		Message: "created",
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	result, err := h.svc.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		if err == service.ErrInvalidCredentials {
			response.Unauthorized(c, "invalid username or password")
			return
		}
		response.InternalError(c, "login failed")
		return
	}

	response.OK(c, authResponse{
		User:         result.User,
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
	})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	result, err := h.svc.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		response.Unauthorized(c, "invalid or expired refresh token")
		return
	}

	response.OK(c, authResponse{
		User:         result.User,
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)

	user, err := h.svc.GetCurrentUser(c.Request.Context(), userID)
	if err != nil {
		response.NotFound(c, "user not found")
		return
	}

	response.OK(c, user)
}
```

- [ ] **Step 7: Commit**

```bash
git add internal/repository/user.go internal/service/ internal/handler/auth.go go.mod go.sum
git commit -m "feat: auth system with JWT register/login/refresh"
```

---

## Task 6: Contact CRUD (Repository + Service + Handler)

**Files:**
- Create: `internal/repository/contact.go`
- Create: `internal/service/contact.go`
- Create: `internal/handler/contact.go`
- Test: `internal/service/contact_test.go`

- [ ] **Step 1: Write failing test for contact service**

```go
// internal/service/contact_test.go
package service

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

type mockContactRepo struct {
	mock.Mock
}

func (m *mockContactRepo) Create(ctx context.Context, contact *model.Contact) error {
	args := m.Called(ctx, contact)
	return args.Error(0)
}

func (m *mockContactRepo) GetByID(ctx context.Context, userID, id uint) (*model.Contact, error) {
	args := m.Called(ctx, userID, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Contact), args.Error(1)
}

func (m *mockContactRepo) List(ctx context.Context, userID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error) {
	args := m.Called(ctx, userID, page, pageSize, search, tagIDs)
	return args.Get(0).([]model.Contact), args.Get(1).(int64), args.Error(2)
}

func (m *mockContactRepo) Update(ctx context.Context, contact *model.Contact) error {
	args := m.Called(ctx, contact)
	return args.Error(0)
}

func (m *mockContactRepo) Delete(ctx context.Context, userID, id uint) error {
	args := m.Called(ctx, userID, id)
	return args.Error(0)
}

func (m *mockContactRepo) ReplaceTags(ctx context.Context, contactID uint, tagIDs []uint) error {
	args := m.Called(ctx, contactID, tagIDs)
	return args.Error(0)
}

func TestContactService_Create(t *testing.T) {
	repo := new(mockContactRepo)
	svc := NewContactService(repo)

	repo.On("Create", mock.Anything, mock.AnythingOfType("*model.Contact")).Return(nil)

	contact, err := svc.Create(context.Background(), 1, &model.Contact{
		Name:             "Alice",
		RelationshipType: model.RelationshipFriend,
	})
	assert.NoError(t, err)
	assert.Equal(t, "Alice", contact.Name)
	assert.Equal(t, uint(1), contact.UserID)
}

func TestContactService_GetByID(t *testing.T) {
	repo := new(mockContactRepo)
	svc := NewContactService(repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(1)).Return(&model.Contact{
		ID:   1,
		Name: "Alice",
	}, nil)

	contact, err := svc.GetByID(context.Background(), 1, 1)
	assert.NoError(t, err)
	assert.Equal(t, "Alice", contact.Name)
}

func TestContactService_GetByID_NotFound(t *testing.T) {
	repo := new(mockContactRepo)
	svc := NewContactService(repo)

	repo.On("GetByID", mock.Anything, uint(1), uint(999)).Return(nil, ErrContactNotFound)

	_, err := svc.GetByID(context.Background(), 1, 999)
	assert.ErrorIs(t, err, ErrContactNotFound)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/service/ -run TestContact -v`
Expected: FAIL

- [ ] **Step 3: Implement contact repository**

```go
// internal/repository/contact.go
package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type ContactRepo struct {
	db *gorm.DB
}

func NewContactRepo(db *gorm.DB) *ContactRepo {
	return &ContactRepo{db: db}
}

func (r *ContactRepo) Create(ctx context.Context, contact *model.Contact) error {
	if err := r.db.WithContext(ctx).Create(contact).Error; err != nil {
		return fmt.Errorf("create contact: %w", err)
	}
	return nil
}

func (r *ContactRepo) GetByID(ctx context.Context, userID, id uint) (*model.Contact, error) {
	var contact model.Contact
	err := r.db.WithContext(ctx).Preload("Tags").
		Where("id = ? AND user_id = ?", id, userID).
		First(&contact).Error
	if err != nil {
		return nil, fmt.Errorf("get contact: %w", err)
	}
	return &contact, nil
}

func (r *ContactRepo) List(ctx context.Context, userID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error) {
	var contacts []model.Contact
	var total int64

	query := r.db.WithContext(ctx).Where("user_id = ?", userID)

	if search != "" {
		query = query.Where("name LIKE ? OR nickname LIKE ? OR email LIKE ? OR phone LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	if len(tagIDs) > 0 {
		query = query.Joins("JOIN contact_tags ON contact_tags.contact_id = contacts.id").
			Where("contact_tags.tag_id IN ?", tagIDs)
	}

	if err := query.Model(&model.Contact{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count contacts: %w", err)
	}

	offset := (page - 1) * pageSize
	err := query.Preload("Tags").Offset(offset).Limit(pageSize).
		Order("created_at DESC").
		Find(&contacts).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list contacts: %w", err)
	}

	return contacts, total, nil
}

func (r *ContactRepo) Update(ctx context.Context, contact *model.Contact) error {
	if err := r.db.WithContext(ctx).Save(contact).Error; err != nil {
		return fmt.Errorf("update contact: %w", err)
	}
	return nil
}

func (r *ContactRepo) Delete(ctx context.Context, userID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&model.Contact{}).Error; err != nil {
		return fmt.Errorf("delete contact: %w", err)
	}
	return nil
}

func (r *ContactRepo) ReplaceTags(ctx context.Context, contactID uint, tags []model.Tag) error {
	contact := model.Contact{ID: contactID}
	if err := r.db.WithContext(ctx).Model(&contact).Association("Tags").Replace(tags); err != nil {
		return fmt.Errorf("replace contact tags: %w", err)
	}
	return nil
}

func (r *ContactRepo) GetTags(ctx context.Context, contactID uint) ([]model.Tag, error) {
	var tags []model.Tag
	contact := model.Contact{ID: contactID}
	if err := r.db.WithContext(ctx).Model(&contact).Association("Tags").Find(&tags); err != nil {
		return nil, fmt.Errorf("get contact tags: %w", err)
	}
	return tags, nil
}
```

- [ ] **Step 4: Implement contact service**

```go
// internal/service/contact.go
package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrContactNotFound = errors.New("contact not found")

type ContactRepository interface {
	Create(ctx context.Context, contact *model.Contact) error
	GetByID(ctx context.Context, userID, id uint) (*model.Contact, error)
	List(ctx context.Context, userID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error)
	Update(ctx context.Context, contact *model.Contact) error
	Delete(ctx context.Context, userID, id uint) error
	ReplaceTags(ctx context.Context, contactID uint, tags []model.Tag) error
	GetTags(ctx context.Context, contactID uint) ([]model.Tag, error)
}

type ContactService struct {
	repo ContactRepository
}

func NewContactService(repo ContactRepository) *ContactService {
	return &ContactService{repo: repo}
}

func (s *ContactService) Create(ctx context.Context, userID uint, contact *model.Contact) (*model.Contact, error) {
	contact.UserID = userID
	if err := s.repo.Create(ctx, contact); err != nil {
		return nil, err
	}
	return contact, nil
}

func (s *ContactService) GetByID(ctx context.Context, userID, id uint) (*model.Contact, error) {
	contact, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, ErrContactNotFound
	}
	return contact, nil
}

func (s *ContactService) List(ctx context.Context, userID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.List(ctx, userID, page, pageSize, search, tagIDs)
}

func (s *ContactService) Update(ctx context.Context, userID, id uint, updates *model.Contact) (*model.Contact, error) {
	contact, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, ErrContactNotFound
	}

	if updates.Name != "" {
		contact.Name = updates.Name
	}
	contact.Nickname = updates.Nickname
	contact.AvatarURL = updates.AvatarURL
	contact.Phone = updates.Phone
	contact.Email = updates.Email
	contact.Birthday = updates.Birthday
	contact.Notes = updates.Notes
	if updates.RelationshipType != "" {
		contact.RelationshipType = updates.RelationshipType
	}

	if err := s.repo.Update(ctx, contact); err != nil {
		return nil, err
	}
	return contact, nil
}

func (s *ContactService) Delete(ctx context.Context, userID, id uint) error {
	return s.repo.Delete(ctx, userID, id)
}

func (s *ContactService) ReplaceTags(ctx context.Context, userID, contactID uint, tagIDs []uint) error {
	if _, err := s.repo.GetByID(ctx, userID, contactID); err != nil {
		return ErrContactNotFound
	}
	tags := make([]model.Tag, len(tagIDs))
	for i, id := range tagIDs {
		tags[i].ID = id
	}
	return s.repo.ReplaceTags(ctx, contactID, tags)
}

func (s *ContactService) GetTags(ctx context.Context, userID, contactID uint) ([]model.Tag, error) {
	if _, err := s.repo.GetByID(ctx, userID, contactID); err != nil {
		return nil, ErrContactNotFound
	}
	return s.repo.GetTags(ctx, contactID)
}
```

- [ ] **Step 5: Implement contact handler**

```go
// internal/handler/contact.go
package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type ContactHandler struct {
	svc *service.ContactService
}

func NewContactHandler(svc *service.ContactService) *ContactHandler {
	return &ContactHandler{svc: svc}
}

type createContactRequest struct {
	Name             string                `json:"name" binding:"required"`
	Nickname         string                `json:"nickname"`
	AvatarURL        string                `json:"avatar_url"`
	Phone            string                `json:"phone"`
	Email            string                `json:"email"`
	Birthday         *string               `json:"birthday"`
	Notes            string                `json:"notes"`
	RelationshipType model.RelationshipType `json:"relationship_type"`
}

type updateContactRequest struct {
	Name             string                `json:"name"`
	Nickname         string                `json:"nickname"`
	AvatarURL        string                `json:"avatar_url"`
	Phone            string                `json:"phone"`
	Email            string                `json:"email"`
	Birthday         *string               `json:"birthday"`
	Notes            string                `json:"notes"`
	RelationshipType model.RelationshipType `json:"relationship_type"`
}

type replaceTagsRequest struct {
	TagIDs []uint `json:"tag_ids" binding:"required"`
}

func (h *ContactHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	search := c.Query("search")

	var tagIDs []uint
	for _, idStr := range c.QueryArray("tag_ids") {
		if id, err := strconv.ParseUint(idStr, 10, 32); err == nil {
			tagIDs = append(tagIDs, uint(id))
		}
	}

	contacts, total, err := h.svc.List(c.Request.Context(), userID, page, pageSize, search, tagIDs)
	if err != nil {
		response.InternalError(c, "failed to list contacts")
		return
	}

	response.OKPaginated(c, contacts, total, page, pageSize)
}

func (h *ContactHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req createContactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	contact := &model.Contact{
		Name:             req.Name,
		Nickname:         req.Nickname,
		AvatarURL:        req.AvatarURL,
		Phone:            req.Phone,
		Email:            req.Email,
		Notes:            req.Notes,
		RelationshipType: req.RelationshipType,
	}

	result, err := h.svc.Create(c.Request.Context(), userID, contact)
	if err != nil {
		response.InternalError(c, "failed to create contact")
		return
	}

	response.Created(c, result)
}

func (h *ContactHandler) GetByID(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	contact, err := h.svc.GetByID(c.Request.Context(), userID, uint(id))
	if err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, contact)
}

func (h *ContactHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req updateContactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	contact := &model.Contact{
		Name:             req.Name,
		Nickname:         req.Nickname,
		AvatarURL:        req.AvatarURL,
		Phone:            req.Phone,
		Email:            req.Email,
		Birthday:         req.Birthday, // pass through as *string, service handles
		Notes:            req.Notes,
		RelationshipType: req.RelationshipType,
	}

	result, err := h.svc.Update(c.Request.Context(), userID, uint(id), contact)
	if err != nil {
		if err == service.ErrContactNotFound {
			response.NotFound(c, "contact not found")
			return
		}
		response.InternalError(c, "failed to update contact")
		return
	}

	response.OK(c, result)
}

func (h *ContactHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, nil)
}

func (h *ContactHandler) GetTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	tags, err := h.svc.GetTags(c.Request.Context(), userID, uint(id))
	if err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, tags)
}

func (h *ContactHandler) ReplaceTags(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req replaceTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.svc.ReplaceTags(c.Request.Context(), userID, uint(id), req.TagIDs); err != nil {
		response.NotFound(c, "contact not found")
		return
	}

	response.OK(c, nil)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `go test ./internal/service/ -run TestContact -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add internal/repository/contact.go internal/service/contact.go internal/handler/contact.go
git commit -m "feat: contact CRUD with tag association"
```

---

## Task 7: Tag CRUD (Repository + Service + Handler)

**Files:**
- Create: `internal/repository/tag.go`
- Create: `internal/service/tag.go`
- Create: `internal/handler/tag.go`

- [ ] **Step 1: Implement tag repository**

```go
// internal/repository/tag.go
package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type TagRepo struct {
	db *gorm.DB
}

func NewTagRepo(db *gorm.DB) *TagRepo {
	return &TagRepo{db: db}
}

func (r *TagRepo) Create(ctx context.Context, tag *model.Tag) error {
	if err := r.db.WithContext(ctx).Create(tag).Error; err != nil {
		return fmt.Errorf("create tag: %w", err)
	}
	return nil
}

func (r *TagRepo) GetByID(ctx context.Context, userID, id uint) (*model.Tag, error) {
	var tag model.Tag
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&tag).Error; err != nil {
		return nil, fmt.Errorf("get tag: %w", err)
	}
	return &tag, nil
}

func (r *TagRepo) List(ctx context.Context, userID uint) ([]model.Tag, error) {
	var tags []model.Tag
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&tags).Error; err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	return tags, nil
}

func (r *TagRepo) Update(ctx context.Context, tag *model.Tag) error {
	if err := r.db.WithContext(ctx).Save(tag).Error; err != nil {
		return fmt.Errorf("update tag: %w", err)
	}
	return nil
}

func (r *TagRepo) Delete(ctx context.Context, userID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&model.Tag{}).Error; err != nil {
		return fmt.Errorf("delete tag: %w", err)
	}
	return nil
}

func (r *TagRepo) GetByIDs(ctx context.Context, userID uint, ids []uint) ([]model.Tag, error) {
	var tags []model.Tag
	if err := r.db.WithContext(ctx).Where("user_id = ? AND id IN ?", userID, ids).Find(&tags).Error; err != nil {
		return nil, fmt.Errorf("get tags by ids: %w", err)
	}
	return tags, nil
}
```

- [ ] **Step 2: Implement tag service**

```go
// internal/service/tag.go
package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrTagNotFound = errors.New("tag not found")

type TagRepository interface {
	Create(ctx context.Context, tag *model.Tag) error
	GetByID(ctx context.Context, userID, id uint) (*model.Tag, error)
	List(ctx context.Context, userID uint) ([]model.Tag, error)
	Update(ctx context.Context, tag *model.Tag) error
	Delete(ctx context.Context, userID, id uint) error
	GetByIDs(ctx context.Context, userID uint, ids []uint) ([]model.Tag, error)
}

type TagService struct {
	repo TagRepository
}

func NewTagService(repo TagRepository) *TagService {
	return &TagService{repo: repo}
}

func (s *TagService) Create(ctx context.Context, userID uint, tag *model.Tag) (*model.Tag, error) {
	tag.UserID = userID
	if err := s.repo.Create(ctx, tag); err != nil {
		return nil, err
	}
	return tag, nil
}

func (s *TagService) List(ctx context.Context, userID uint) ([]model.Tag, error) {
	return s.repo.List(ctx, userID)
}

func (s *TagService) Update(ctx context.Context, userID, id uint, updates *model.Tag) (*model.Tag, error) {
	tag, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, ErrTagNotFound
	}
	if updates.Name != "" {
		tag.Name = updates.Name
	}
	tag.Color = updates.Color
	if err := s.repo.Update(ctx, tag); err != nil {
		return nil, err
	}
	return tag, nil
}

func (s *TagService) Delete(ctx context.Context, userID, id uint) error {
	return s.repo.Delete(ctx, userID, id)
}
```

- [ ] **Step 3: Implement tag handler**

```go
// internal/handler/tag.go
package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type TagHandler struct {
	svc *service.TagService
}

func NewTagHandler(svc *service.TagService) *TagHandler {
	return &TagHandler{svc: svc}
}

type createTagRequest struct {
	Name  string `json:"name" binding:"required"`
	Color string `json:"color"`
}

type updateTagRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (h *TagHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	tags, err := h.svc.List(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, "failed to list tags")
		return
	}
	response.OK(c, tags)
}

func (h *TagHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req createTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	tag, err := h.svc.Create(c.Request.Context(), userID, &model.Tag{
		Name:  req.Name,
		Color: req.Color,
	})
	if err != nil {
		response.InternalError(c, "failed to create tag")
		return
	}

	response.Created(c, tag)
}

func (h *TagHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid tag id")
		return
	}

	var req updateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	tag, err := h.svc.Update(c.Request.Context(), userID, uint(id), &model.Tag{
		Name:  req.Name,
		Color: req.Color,
	})
	if err != nil {
		response.NotFound(c, "tag not found")
		return
	}

	response.OK(c, tag)
}

func (h *TagHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid tag id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "tag not found")
		return
	}

	response.OK(c, nil)
}
```

- [ ] **Step 4: Run build to verify compilation**

Run: `go build ./...`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add internal/repository/tag.go internal/service/tag.go internal/handler/tag.go
git commit -m "feat: tag CRUD"
```

---

## Task 8: Interaction CRUD (Repository + Service + Handler)

**Files:**
- Create: `internal/repository/interaction.go`
- Create: `internal/service/interaction.go`
- Create: `internal/handler/interaction.go`

- [ ] **Step 1: Implement interaction repository**

```go
// internal/repository/interaction.go
package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type InteractionRepo struct {
	db *gorm.DB
}

func NewInteractionRepo(db *gorm.DB) *InteractionRepo {
	return &InteractionRepo{db: db}
}

func (r *InteractionRepo) Create(ctx context.Context, interaction *model.Interaction) error {
	if err := r.db.WithContext(ctx).Create(interaction).Error; err != nil {
		return fmt.Errorf("create interaction: %w", err)
	}
	return nil
}

func (r *InteractionRepo) GetByID(ctx context.Context, userID, id uint) (*model.Interaction, error) {
	var interaction model.Interaction
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&interaction).Error; err != nil {
		return nil, fmt.Errorf("get interaction: %w", err)
	}
	return &interaction, nil
}

func (r *InteractionRepo) ListByContact(ctx context.Context, userID, contactID uint, page, pageSize int) ([]model.Interaction, int64, error) {
	var interactions []model.Interaction
	var total int64

	query := r.db.WithContext(ctx).Where("user_id = ? AND contact_id = ?", userID, contactID)

	if err := query.Model(&model.Interaction{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count interactions: %w", err)
	}

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).
		Order("occurred_at DESC").
		Find(&interactions).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list interactions: %w", err)
	}

	return interactions, total, nil
}

func (r *InteractionRepo) Update(ctx context.Context, interaction *model.Interaction) error {
	if err := r.db.WithContext(ctx).Save(interaction).Error; err != nil {
		return fmt.Errorf("update interaction: %w", err)
	}
	return nil
}

func (r *InteractionRepo) Delete(ctx context.Context, userID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&model.Interaction{}).Error; err != nil {
		return fmt.Errorf("delete interaction: %w", err)
	}
	return nil
}
```

- [ ] **Step 2: Implement interaction service**

```go
// internal/service/interaction.go
package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrInteractionNotFound = errors.New("interaction not found")

type InteractionRepository interface {
	Create(ctx context.Context, interaction *model.Interaction) error
	GetByID(ctx context.Context, userID, id uint) (*model.Interaction, error)
	ListByContact(ctx context.Context, userID, contactID uint, page, pageSize int) ([]model.Interaction, int64, error)
	Update(ctx context.Context, interaction *model.Interaction) error
	Delete(ctx context.Context, userID, id uint) error
}

type InteractionService struct {
	repo InteractionRepository
}

func NewInteractionService(repo InteractionRepository) *InteractionService {
	return &InteractionService{repo: repo}
}

func (s *InteractionService) Create(ctx context.Context, userID, contactID uint, interaction *model.Interaction) (*model.Interaction, error) {
	interaction.UserID = userID
	interaction.ContactID = contactID
	if err := s.repo.Create(ctx, interaction); err != nil {
		return nil, err
	}
	return interaction, nil
}

func (s *InteractionService) ListByContact(ctx context.Context, userID, contactID uint, page, pageSize int) ([]model.Interaction, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.ListByContact(ctx, userID, contactID, page, pageSize)
}

func (s *InteractionService) Update(ctx context.Context, userID, id uint, updates *model.Interaction) (*model.Interaction, error) {
	interaction, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, ErrInteractionNotFound
	}

	if updates.Title != "" {
		interaction.Title = updates.Title
	}
	if updates.Type != "" {
		interaction.Type = updates.Type
	}
	interaction.Content = updates.Content
	if !updates.OccurredAt.IsZero() {
		interaction.OccurredAt = updates.OccurredAt
	}

	if err := s.repo.Update(ctx, interaction); err != nil {
		return nil, err
	}
	return interaction, nil
}

func (s *InteractionService) Delete(ctx context.Context, userID, id uint) error {
	return s.repo.Delete(ctx, userID, id)
}
```

- [ ] **Step 3: Implement interaction handler**

```go
// internal/handler/interaction.go
package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type InteractionHandler struct {
	svc *service.InteractionService
}

func NewInteractionHandler(svc *service.InteractionService) *InteractionHandler {
	return &InteractionHandler{svc: svc}
}

type createInteractionRequest struct {
	Type       model.InteractionType `json:"type" binding:"required"`
	Title      string                `json:"title" binding:"required"`
	Content    string                `json:"content"`
	OccurredAt string                `json:"occurred_at" binding:"required"`
}

type updateInteractionRequest struct {
	Type       model.InteractionType `json:"type"`
	Title      string                `json:"title"`
	Content    string                `json:"content"`
	OccurredAt string                `json:"occurred_at"`
}

func (h *InteractionHandler) ListByContact(c *gin.Context) {
	userID := middleware.GetUserID(c)
	contactID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	interactions, total, err := h.svc.ListByContact(c.Request.Context(), userID, uint(contactID), page, pageSize)
	if err != nil {
		response.InternalError(c, "failed to list interactions")
		return
	}

	response.OKPaginated(c, interactions, total, page, pageSize)
}

func (h *InteractionHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	contactID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req createInteractionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	interaction := &model.Interaction{
		Type:  req.Type,
		Title: req.Title,
		Content: req.Content,
	}

	result, err := h.svc.Create(c.Request.Context(), userID, uint(contactID), interaction)
	if err != nil {
		response.InternalError(c, "failed to create interaction")
		return
	}

	response.Created(c, result)
}

func (h *InteractionHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid interaction id")
		return
	}

	var req updateInteractionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	interaction := &model.Interaction{
		Type:    req.Type,
		Title:   req.Title,
		Content: req.Content,
	}

	result, err := h.svc.Update(c.Request.Context(), userID, uint(id), interaction)
	if err != nil {
		if err == service.ErrInteractionNotFound {
			response.NotFound(c, "interaction not found")
			return
		}
		response.InternalError(c, "failed to update interaction")
		return
	}

	response.OK(c, result)
}

func (h *InteractionHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid interaction id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "interaction not found")
		return
	}

	response.OK(c, nil)
}
```

- [ ] **Step 4: Run build to verify compilation**

Run: `go build ./...`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add internal/repository/interaction.go internal/service/interaction.go internal/handler/interaction.go
git commit -m "feat: interaction CRUD with timeline"
```

---

## Task 9: Reminder CRUD (Repository + Service + Handler)

**Files:**
- Create: `internal/repository/reminder.go`
- Create: `internal/service/reminder.go`
- Create: `internal/handler/reminder.go`

- [ ] **Step 1: Implement reminder repository**

```go
// internal/repository/reminder.go
package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type ReminderRepo struct {
	db *gorm.DB
}

func NewReminderRepo(db *gorm.DB) *ReminderRepo {
	return &ReminderRepo{db: db}
}

func (r *ReminderRepo) Create(ctx context.Context, reminder *model.Reminder) error {
	if err := r.db.WithContext(ctx).Create(reminder).Error; err != nil {
		return fmt.Errorf("create reminder: %w", err)
	}
	return nil
}

func (r *ReminderRepo) GetByID(ctx context.Context, userID, id uint) (*model.Reminder, error) {
	var reminder model.Reminder
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&reminder).Error; err != nil {
		return nil, fmt.Errorf("get reminder: %w", err)
	}
	return &reminder, nil
}

func (r *ReminderRepo) List(ctx context.Context, userID uint, status model.ReminderStatus) ([]model.Reminder, error) {
	var reminders []model.Reminder
	query := r.db.WithContext(ctx).Where("user_id = ?", userID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if err := query.Order("remind_at ASC").Find(&reminders).Error; err != nil {
		return nil, fmt.Errorf("list reminders: %w", err)
	}
	return reminders, nil
}

func (r *ReminderRepo) Update(ctx context.Context, reminder *model.Reminder) error {
	if err := r.db.WithContext(ctx).Save(reminder).Error; err != nil {
		return fmt.Errorf("update reminder: %w", err)
	}
	return nil
}

func (r *ReminderRepo) Delete(ctx context.Context, userID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&model.Reminder{}).Error; err != nil {
		return fmt.Errorf("delete reminder: %w", err)
	}
	return nil
}
```

- [ ] **Step 2: Implement reminder service**

```go
// internal/service/reminder.go
package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrReminderNotFound = errors.New("reminder not found")

type ReminderRepository interface {
	Create(ctx context.Context, reminder *model.Reminder) error
	GetByID(ctx context.Context, userID, id uint) (*model.Reminder, error)
	List(ctx context.Context, userID uint, status model.ReminderStatus) ([]model.Reminder, error)
	Update(ctx context.Context, reminder *model.Reminder) error
	Delete(ctx context.Context, userID, id uint) error
}

type ReminderService struct {
	repo ReminderRepository
}

func NewReminderService(repo ReminderRepository) *ReminderService {
	return &ReminderService{repo: repo}
}

func (s *ReminderService) Create(ctx context.Context, userID, contactID uint, reminder *model.Reminder) (*model.Reminder, error) {
	reminder.UserID = userID
	reminder.ContactID = contactID
	reminder.Status = model.ReminderPending
	if err := s.repo.Create(ctx, reminder); err != nil {
		return nil, err
	}
	return reminder, nil
}

func (s *ReminderService) List(ctx context.Context, userID uint, status model.ReminderStatus) ([]model.Reminder, error) {
	return s.repo.List(ctx, userID, status)
}

func (s *ReminderService) Update(ctx context.Context, userID, id uint, updates *model.Reminder) (*model.Reminder, error) {
	reminder, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, ErrReminderNotFound
	}

	if updates.Title != "" {
		reminder.Title = updates.Title
	}
	reminder.Description = updates.Description
	if !updates.RemindAt.IsZero() {
		reminder.RemindAt = updates.RemindAt
	}
	if updates.Status != "" {
		reminder.Status = updates.Status
	}

	if err := s.repo.Update(ctx, reminder); err != nil {
		return nil, err
	}
	return reminder, nil
}

func (s *ReminderService) Delete(ctx context.Context, userID, id uint) error {
	return s.repo.Delete(ctx, userID, id)
}
```

- [ ] **Step 3: Implement reminder handler**

```go
// internal/handler/reminder.go
package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type ReminderHandler struct {
	svc *service.ReminderService
}

func NewReminderHandler(svc *service.ReminderService) *ReminderHandler {
	return &ReminderHandler{svc: svc}
}

type createReminderRequest struct {
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	RemindAt    string `json:"remind_at" binding:"required"`
}

type updateReminderRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	RemindAt    string `json:"remind_at"`
	Status      string `json:"status"`
}

func (h *ReminderHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	status := model.ReminderStatus(c.Query("status"))

	reminders, err := h.svc.List(c.Request.Context(), userID, status)
	if err != nil {
		response.InternalError(c, "failed to list reminders")
		return
	}

	response.OK(c, reminders)
}

func (h *ReminderHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	contactID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req createReminderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	reminder := &model.Reminder{
		Title:       req.Title,
		Description: req.Description,
	}

	result, err := h.svc.Create(c.Request.Context(), userID, uint(contactID), reminder)
	if err != nil {
		response.InternalError(c, "failed to create reminder")
		return
	}

	response.Created(c, result)
}

func (h *ReminderHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid reminder id")
		return
	}

	var req updateReminderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	updates := &model.Reminder{
		Title:       req.Title,
		Description: req.Description,
		Status:      model.ReminderStatus(req.Status),
	}

	result, err := h.svc.Update(c.Request.Context(), userID, uint(id), updates)
	if err != nil {
		if err == service.ErrReminderNotFound {
			response.NotFound(c, "reminder not found")
			return
		}
		response.InternalError(c, "failed to update reminder")
		return
	}

	response.OK(c, result)
}

func (h *ReminderHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid reminder id")
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "reminder not found")
		return
	}

	response.OK(c, nil)
}
```

- [ ] **Step 4: Run build to verify compilation**

Run: `go build ./...`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add internal/repository/reminder.go internal/service/reminder.go internal/handler/reminder.go
git commit -m "feat: reminder CRUD with status filtering"
```

---

## Task 10: Contact Relations and Network Graph

**Files:**
- Create: `internal/repository/relation.go`
- Create: `internal/service/relation.go`
- Create: `internal/handler/graph.go`

- [ ] **Step 1: Implement relation repository**

```go
// internal/repository/relation.go
package repository

import (
	"context"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type RelationRepo struct {
	db *gorm.DB
}

func NewRelationRepo(db *gorm.DB) *RelationRepo {
	return &RelationRepo{db: db}
}

func (r *RelationRepo) Create(ctx context.Context, relation *model.ContactRelation) error {
	if err := r.db.WithContext(ctx).Create(relation).Error; err != nil {
		return fmt.Errorf("create relation: %w", err)
	}
	return nil
}

func (r *RelationRepo) GetByID(ctx context.Context, userID, id uint) (*model.ContactRelation, error) {
	var relation model.ContactRelation
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&relation).Error; err != nil {
		return nil, fmt.Errorf("get relation: %w", err)
	}
	return &relation, nil
}

func (r *RelationRepo) ListByContact(ctx context.Context, userID, contactID uint) ([]model.ContactRelation, error) {
	var relations []model.ContactRelation
	if err := r.db.WithContext(ctx).
		Where("user_id = ? AND (contact_id_a = ? OR contact_id_b = ?)", userID, contactID, contactID).
		Find(&relations).Error; err != nil {
		return nil, fmt.Errorf("list relations: %w", err)
	}
	return relations, nil
}

func (r *RelationRepo) Delete(ctx context.Context, userID, id uint) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&model.ContactRelation{}).Error; err != nil {
		return fmt.Errorf("delete relation: %w", err)
	}
	return nil
}

func (r *RelationRepo) GetAllByUser(ctx context.Context, userID uint) ([]model.ContactRelation, error) {
	var relations []model.ContactRelation
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&relations).Error; err != nil {
		return nil, fmt.Errorf("get all relations: %w", err)
	}
	return relations, nil
}
```

- [ ] **Step 2: Implement relation service + graph data**

```go
// internal/service/relation.go
package service

import (
	"context"
	"errors"

	"github.com/din4e/cuddlegecko/internal/model"
)

var ErrRelationNotFound = errors.New("relation not found")

type RelationRepository interface {
	Create(ctx context.Context, relation *model.ContactRelation) error
	GetByID(ctx context.Context, userID, id uint) (*model.ContactRelation, error)
	ListByContact(ctx context.Context, userID, contactID uint) ([]model.ContactRelation, error)
	Delete(ctx context.Context, userID, id uint) error
	GetAllByUser(ctx context.Context, userID uint) ([]model.ContactRelation, error)
}

type GraphNode struct {
	ID               uint   `json:"id"`
	Name             string `json:"name"`
	RelationshipType string `json:"relationship_type"`
	AvatarURL        string `json:"avatar_url"`
}

type GraphEdge struct {
	Source       uint   `json:"source"`
	Target       uint   `json:"target"`
	RelationType string `json:"relation_type"`
}

type GraphData struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

type RelationService struct {
	relationRepo RelationRepository
	contactRepo  ContactRepository
}

func NewRelationService(relationRepo RelationRepository, contactRepo ContactRepository) *RelationService {
	return &RelationService{relationRepo: relationRepo, contactRepo: contactRepo}
}

func (s *RelationService) Create(ctx context.Context, userID, contactIDA uint, relation *model.ContactRelation) (*model.ContactRelation, error) {
	relation.UserID = userID
	relation.ContactIDA = contactIDA
	if err := s.relationRepo.Create(ctx, relation); err != nil {
		return nil, err
	}
	return relation, nil
}

func (s *RelationService) ListByContact(ctx context.Context, userID, contactID uint) ([]model.ContactRelation, error) {
	return s.relationRepo.ListByContact(ctx, userID, contactID)
}

func (s *RelationService) Delete(ctx context.Context, userID, id uint) error {
	return s.relationRepo.Delete(ctx, userID, id)
}

func (s *RelationService) GetGraphData(ctx context.Context, userID uint) (*GraphData, error) {
	contacts, _, err := s.contactRepo.List(ctx, userID, 1, 1000, "", nil)
	if err != nil {
		return nil, err
	}

	relations, err := s.relationRepo.GetAllByUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	nodes := make([]GraphNode, len(contacts))
	for i, c := range contacts {
		nodes[i] = GraphNode{
			ID:               c.ID,
			Name:             c.Name,
			RelationshipType: string(c.RelationshipType),
			AvatarURL:        c.AvatarURL,
		}
	}

	edges := make([]GraphEdge, len(relations))
	for i, r := range relations {
		edges[i] = GraphEdge{
			Source:       r.ContactIDA,
			Target:       r.ContactIDB,
			RelationType: r.RelationType,
		}
	}

	return &GraphData{Nodes: nodes, Edges: edges}, nil
}
```

- [ ] **Step 3: Implement graph handler**

```go
// internal/handler/graph.go
package handler

import (
	"strconv"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/din4e/cuddlegecko/pkg/response"
	"github.com/gin-gonic/gin"
)

type GraphHandler struct {
	relationSvc *service.RelationService
}

func NewGraphHandler(relationSvc *service.RelationService) *GraphHandler {
	return &GraphHandler{relationSvc: relationSvc}
}

type createRelationRequest struct {
	ContactIDB   uint   `json:"contact_id_b" binding:"required"`
	RelationType string `json:"relation_type"`
}

func (h *GraphHandler) GetGraph(c *gin.Context) {
	userID := middleware.GetUserID(c)

	data, err := h.relationSvc.GetGraphData(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, "failed to get graph data")
		return
	}

	response.OK(c, data)
}

func (h *GraphHandler) GetRelations(c *gin.Context) {
	userID := middleware.GetUserID(c)
	contactID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	relations, err := h.relationSvc.ListByContact(c.Request.Context(), userID, uint(contactID))
	if err != nil {
		response.InternalError(c, "failed to list relations")
		return
	}

	response.OK(c, relations)
}

func (h *GraphHandler) CreateRelation(c *gin.Context) {
	userID := middleware.GetUserID(c)
	contactIDA, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid contact id")
		return
	}

	var req createRelationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	relation := &model.ContactRelation{
		ContactIDB:   req.ContactIDB,
		RelationType: req.RelationType,
	}

	result, err := h.relationSvc.Create(c.Request.Context(), userID, uint(contactIDA), relation)
	if err != nil {
		response.InternalError(c, "failed to create relation")
		return
	}

	response.Created(c, result)
}

func (h *GraphHandler) DeleteRelation(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid relation id")
		return
	}

	if err := h.relationSvc.Delete(c.Request.Context(), userID, uint(id)); err != nil {
		response.NotFound(c, "relation not found")
		return
	}

	response.OK(c, nil)
}
```

- [ ] **Step 4: Run build to verify compilation**

Run: `go build ./...`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add internal/repository/relation.go internal/service/relation.go internal/handler/graph.go
git commit -m "feat: contact relations and network graph API"
```

---

## Task 11: Router and Main Entry Point

**Files:**
- Create: `internal/handler/router.go`
- Create: `cmd/server/main.go`

- [ ] **Step 1: Implement router**

```go
// internal/handler/router.go
package handler

import (
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/middleware"
	"github.com/gin-gonic/gin"
)

type Handlers struct {
	Auth        *AuthHandler
	Contact     *ContactHandler
	Tag         *TagHandler
	Interaction *InteractionHandler
	Reminder    *ReminderHandler
	Graph       *GraphHandler
}

func NewHandlers(
	authSvc *service.AuthService,
	contactSvc *service.ContactService,
	tagSvc *service.TagService,
	interactionSvc *service.InteractionService,
	reminderSvc *service.ReminderService,
	relationSvc *service.RelationService,
) *Handlers {
	return &Handlers{
		Auth:        NewAuthHandler(authSvc),
		Contact:     NewContactHandler(contactSvc),
		Tag:         NewTagHandler(tagSvc),
		Interaction: NewInteractionHandler(interactionSvc),
		Reminder:    NewReminderHandler(reminderSvc),
		Graph:       NewGraphHandler(relationSvc),
	}
}

func RegisterRoutes(r *gin.Engine, h *Handlers, jwtCfg *config.JWTConfig) {
	r.Use(middleware.CORS())

	api := r.Group("/api")
	{
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
```

- [ ] **Step 2: Implement main entry point**

```go
// cmd/server/main.go
package main

import (
	"fmt"
	"log"

	"github.com/din4e/cuddlegecko/internal/handler"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/database"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Init(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	// Repositories
	userRepo := repository.NewUserRepo(db)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)

	// Services
	authSvc := service.NewAuthService(userRepo, &cfg.JWT)
	contactSvc := service.NewContactService(contactRepo)
	tagSvc := service.NewTagService(tagRepo)
	interactionSvc := service.NewInteractionService(interactionRepo)
	reminderSvc := service.NewReminderService(reminderRepo)
	relationSvc := service.NewRelationService(relationRepo, contactRepo)

	// Handlers
	handlers := handler.NewHandlers(authSvc, contactSvc, tagSvc, interactionSvc, reminderSvc, relationSvc)

	// Router
	gin.SetMode(cfg.Server.Mode)
	r := gin.Default()
	handler.RegisterRoutes(r, handlers, &cfg.JWT)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("CuddleGecko server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
```

- [ ] **Step 3: Run build to verify full compilation**

Run: `go build ./...`
Expected: no errors

- [ ] **Step 4: Run all tests**

Run: `go test ./... -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add internal/handler/router.go cmd/server/main.go
git commit -m "feat: router and main entry point - wire all handlers"
```

---

## Task 12: Smoke Test

**Files:** None (manual verification)

- [ ] **Step 1: Start the server**

Run: `go run ./cmd/server`
Expected: `CuddleGecko server starting on :8080`

- [ ] **Step 2: Register a user**

Run:
```bash
curl -s -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"password123"}'
```
Expected: JSON with `access_token`, `refresh_token`, and `user` object

- [ ] **Step 3: Create a contact (use token from step 2)**

Run:
```bash
curl -s -X POST http://localhost:8080/api/contacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"name":"Bob","relationship_type":"friend"}'
```
Expected: JSON with created contact

- [ ] **Step 4: List contacts**

Run:
```bash
curl -s http://localhost:8080/api/contacts \
  -H "Authorization: Bearer <TOKEN>"
```
Expected: Paginated list with Bob

- [ ] **Step 5: Get graph data**

Run:
```bash
curl -s http://localhost:8080/api/graph \
  -H "Authorization: Bearer <TOKEN>"
```
Expected: `{"code":0,"data":{"nodes":[...],"edges":[]},"message":"success"}`

- [ ] **Step 6: Stop server and commit final state**

Press Ctrl+C to stop the server.

---

## Self-Review

**Spec coverage check:**
- [x] Users table + User model → Task 2, Task 5
- [x] Refresh tokens → Task 2, Task 5
- [x] Contacts CRUD + soft delete → Task 6
- [x] Tags CRUD + many-to-many → Task 6 (contact tags), Task 7
- [x] Interactions CRUD + timeline → Task 8
- [x] Reminders CRUD + status filter → Task 9
- [x] Contact Relations + graph → Task 10
- [x] Auth register/login/refresh/me → Task 5
- [x] JWT middleware → Task 4
- [x] CORS middleware → Task 4
- [x] Config (Viper + YAML + env) → Task 1
- [x] Database (SQLite/MySQL switch) → Task 2
- [x] Unified response format → Task 3
- [x] All API routes → Task 11
- [x] Main entry point → Task 11

**Placeholder scan:** No TBD, TODO, or "implement later" found.

**Type consistency check:**
- `model.Contact`, `model.Tag`, etc. used consistently across all layers
- `service.ContactRepository` interface matches `repository.ContactRepo` method signatures
- `middleware.GetUserID(c)` returns `uint`, used consistently in all handlers
- `response.OK`, `response.Created`, etc. used in all handlers
- Error sentinel values (`ErrContactNotFound`, etc.) defined in service package, referenced in handlers
