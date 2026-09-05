package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrUserNotFound       = errors.New("user not found")
	ErrUserExists         = errors.New("username already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid or revoked refresh token")
)

type UserRepository interface {
	CreateUser(ctx context.Context, user *model.User) error
	GetUserByUsername(ctx context.Context, username string) (*model.User, error)
	GetUserByID(ctx context.Context, id uint) (*model.User, error)
	CreateRefreshToken(ctx context.Context, token *model.RefreshToken) error
	DeleteExpiredRefreshTokens(ctx context.Context, userID uint) error
	GetRefreshToken(ctx context.Context, token string) (*model.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, token string) error
	RevokeAllUserRefreshTokens(ctx context.Context, userID uint) error
}

type AuthResult struct {
	User         *model.User
	AccessToken  string
	RefreshToken string
}

type AuthService struct {
	repo      UserRepository
	jwtCfg    *config.JWTConfig
	wsSvc     *WorkspaceService
	// sessionSettings, when wired (WithAuthSessionSettings), overrides the
	// configured access-token TTL per user (the 设置页 "登录有效期" knob).
	sessionSettings UserSettingStore
}

func NewAuthService(repo UserRepository, jwtCfg *config.JWTConfig, wsSvc *WorkspaceService, opts ...AuthServiceOption) *AuthService {
	s := &AuthService{repo: repo, jwtCfg: jwtCfg, wsSvc: wsSvc}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// AuthServiceOption customizes an AuthService at construction time.
type AuthServiceOption func(*AuthService)

// WithAuthSessionSettings lets the user's stored session setting override the
// access-token lifetime at issue time (login and refresh).
func WithAuthSessionSettings(store UserSettingStore) AuthServiceOption {
	return func(s *AuthService) { s.sessionSettings = store }
}

// sessionTTLSettingKey is the per-user UserSetting name carrying the web
// session (access token) lifetime: JSON {"ttl_hours":n}; 0 = never expires.
const sessionTTLSettingKey = "session"

type sessionTTLSetting struct {
	TTLHours int `json:"ttl_hours"`
}

// maxSessionTTLHours caps the per-user session lifetime (1 year).
const maxSessionTTLHours = 24 * 365

// SessionTTL returns the access-token lifetime currently in effect for the
// user: their stored setting when present, else the server config. 0 means
// tokens never expire.
func (s *AuthService) SessionTTL(ctx context.Context, userID uint) (time.Duration, error) {
	ttl := s.jwtCfg.AccessTTL
	if s.sessionSettings != nil {
		val, found, err := s.sessionSettings.Get(ctx, userID, sessionTTLSettingKey)
		if err != nil {
			return 0, err
		}
		if found {
			var stored sessionTTLSetting
			if json.Unmarshal([]byte(val), &stored) == nil && stored.TTLHours >= 0 {
				ttl = time.Duration(stored.TTLHours) * time.Hour
			}
		}
	}
	return ttl, nil
}

// SetSessionTTL stores the user's preferred web session lifetime in hours
// (0 = never expires). Takes effect on the next token issue (login/refresh —
// the settings page triggers a refresh so it applies immediately).
func (s *AuthService) SetSessionTTL(ctx context.Context, userID uint, hours int) error {
	if s.sessionSettings == nil {
		return errors.New("session settings not available")
	}
	if hours < 0 || hours > maxSessionTTLHours {
		return fmt.Errorf("ttl_hours must be between 0 and %d", maxSessionTTLHours)
	}
	b, err := json.Marshal(sessionTTLSetting{TTLHours: hours})
	if err != nil {
		return err
	}
	return s.sessionSettings.Set(ctx, userID, sessionTTLSettingKey, string(b))
}

func (s *AuthService) Register(ctx context.Context, username, email, password string) (*AuthResult, error) {
	existing, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		// err is ErrRecordNotFound — user doesn't exist, proceed
	} else if existing != nil {
		return nil, ErrUserExists
	}

	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}

	user := &model.User{Username: username, Email: email, PasswordHash: hash}
	if err := s.repo.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	// Create default workspace for new user
	if s.wsSvc != nil {
		if _, wsErr := s.wsSvc.CreateDefaultWorkspace(ctx, user.ID); wsErr != nil {
			// Log but don't fail registration
			_ = wsErr
		}
	}

	return s.generateTokens(ctx, user)
}

func (s *AuthService) Login(ctx context.Context, username, password string) (*AuthResult, error) {
	user, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if err := CheckPassword(password, user.PasswordHash); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.generateTokens(ctx, user)
}

// refreshReplayGrace is how long after a rotation a re-presented (already
// revoked) token counts as a benign concurrent-refresh race: parallel requests
// or multiple tabs can hit /auth/refresh with the same cookie seconds apart,
// and killing the whole family there logs a perfectly legitimate user out.
// Past the window an old revoked token coming back to life means it was
// copied — then the family dies.
const refreshReplayGrace = 30 * time.Second

func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*AuthResult, error) {
	tokenHash := HashRefreshToken(refreshToken)
	rt, err := s.repo.GetRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, ErrInvalidToken
	}

	if time.Now().After(rt.ExpiresAt) {
		return nil, ErrInvalidToken
	}

	if rt.Revoked {
		// Re-presenting a rotated token. Within the grace window the rotation
		// winner already minted the successor — reject and let the client retry
		// with the rotated cookie. Rows revoked before revoked_at existed have
		// no timestamp: assume benign (availability first).
		if rt.RevokedAt != nil && time.Since(*rt.RevokedAt) > refreshReplayGrace {
			_ = s.repo.RevokeAllUserRefreshTokens(ctx, rt.UserID)
		}
		return nil, ErrInvalidToken
	}

	if err := s.repo.RevokeRefreshToken(ctx, tokenHash); err != nil {
		if errors.Is(err, repository.ErrReplayedToken) {
			// Lost the rotation race by microseconds — same benign case above.
			return nil, ErrInvalidToken
		}
		return nil, err
	}

	user, err := s.repo.GetUserByID(ctx, rt.UserID)
	if err != nil {
		return nil, err
	}

	return s.generateTokens(ctx, user)
}

// Logout revokes the whole refresh-token family of the presented token and
// clears the cookie. Unknown/expired tokens are a no-op (idempotent logout).
func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	rt, err := s.repo.GetRefreshToken(ctx, HashRefreshToken(refreshToken))
	if err != nil {
		return nil
	}
	return s.repo.RevokeAllUserRefreshTokens(ctx, rt.UserID)
}

// RefreshTTL exposes the configured refresh-token lifetime (cookie Max-Age).
func (s *AuthService) RefreshTTL() time.Duration { return s.jwtCfg.RefreshTTL }

func (s *AuthService) GetCurrentUser(ctx context.Context, userID uint) (*model.User, error) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func (s *AuthService) generateTokens(ctx context.Context, user *model.User) (*AuthResult, error) {
	accessToken, err := s.generateAccessToken(ctx, user)
	if err != nil {
		return nil, err
	}

	refreshTokenStr := GenerateRefreshToken()
	// Only the SHA-256 of the refresh token is stored: a leaked DB file
	// (e.g. the SQLite data dir) then contains no usable session tokens.
	rt := &model.RefreshToken{
		UserID:    user.ID,
		Token:     HashRefreshToken(refreshTokenStr),
		ExpiresAt: time.Now().Add(s.jwtCfg.RefreshTTL),
	}

	if err := s.repo.CreateRefreshToken(ctx, rt); err != nil {
		return nil, err
	}
	// Best-effort: rotation mints a row every refresh, so long-lived sessions
	// accumulate dead rows unless the expired ones are swept here.
	_ = s.repo.DeleteExpiredRefreshTokens(ctx, user.ID)

	return &AuthResult{
		User:         user,
		AccessToken:  accessToken,
		RefreshToken: refreshTokenStr,
	}, nil
}

func (s *AuthService) generateAccessToken(ctx context.Context, user *model.User) (string, error) {
	claims := jwt.MapClaims{"user_id": user.ID}
	// ttl <= 0 (the default "never expires") omits exp — the token stays valid
	// until logout/secret rotation.
	if ttl, err := s.SessionTTL(ctx, user.ID); err == nil && ttl > 0 {
		claims["exp"] = time.Now().Add(ttl).Unix()
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtCfg.Secret))
}

// HashRefreshToken derives the stored/looked-up form of a refresh token.
func HashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func GenerateRefreshToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func CheckPassword(password, hash string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
