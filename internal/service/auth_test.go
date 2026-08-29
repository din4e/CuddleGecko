package service

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

type mockUserRepo struct {
	mock.Mock
}

func (m *mockUserRepo) CreateUser(ctx context.Context, user *model.User) error {
	return m.Called(ctx, user).Error(0)
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
	return m.Called(ctx, token).Error(0)
}

func (m *mockUserRepo) DeleteExpiredRefreshTokens(ctx context.Context, userID uint) error {
	return m.Called(ctx, userID).Error(0)
}

func (m *mockUserRepo) GetRefreshToken(ctx context.Context, token string) (*model.RefreshToken, error) {
	args := m.Called(ctx, token)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.RefreshToken), args.Error(1)
}

func (m *mockUserRepo) RevokeRefreshToken(ctx context.Context, token string) error {
	return m.Called(ctx, token).Error(0)
}

func (m *mockUserRepo) RevokeAllUserRefreshTokens(ctx context.Context, userID uint) error {
	return m.Called(ctx, userID).Error(0)
}

func testJWTConfig() *config.JWTConfig {
	return &config.JWTConfig{
		Secret:     "test-secret",
		AccessTTL:  900000000000,    // 15 minutes
		RefreshTTL: 604800000000000, // 7 days
	}
}

func TestAuthService_Register_Success(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	repo.On("GetUserByUsername", mock.Anything, "alice").Return(nil, gorm.ErrRecordNotFound)
	repo.On("CreateUser", mock.Anything, mock.AnythingOfType("*model.User")).Return(nil)
	repo.On("CreateRefreshToken", mock.Anything, mock.AnythingOfType("*model.RefreshToken")).Return(nil)
	repo.On("DeleteExpiredRefreshTokens", mock.Anything, mock.AnythingOfType("uint")).Return(nil)

	result, err := svc.Register(context.Background(), "alice", "alice@example.com", "password123")
	assert.NoError(t, err)
	assert.NotEmpty(t, result.AccessToken)
	assert.NotEmpty(t, result.RefreshToken)
	assert.Equal(t, "alice", result.User.Username)
	repo.AssertExpectations(t)
}

func TestAuthService_Register_DuplicateUsername(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	repo.On("GetUserByUsername", mock.Anything, "alice").Return(&model.User{Username: "alice"}, nil)

	_, err := svc.Register(context.Background(), "alice", "alice2@example.com", "password123")
	assert.ErrorIs(t, err, ErrUserExists)
}

func TestAuthService_Login_Success(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	hashed, _ := HashPassword("password123")
	repo.On("GetUserByUsername", mock.Anything, "alice").Return(&model.User{
		ID: 1, Username: "alice", PasswordHash: hashed,
	}, nil)
	repo.On("CreateRefreshToken", mock.Anything, mock.AnythingOfType("*model.RefreshToken")).Return(nil)
	repo.On("DeleteExpiredRefreshTokens", mock.Anything, mock.AnythingOfType("uint")).Return(nil)

	result, err := svc.Login(context.Background(), "alice", "password123")
	assert.NoError(t, err)
	assert.NotEmpty(t, result.AccessToken)
	assert.NotEmpty(t, result.RefreshToken)
}

func TestAuthService_Login_WrongPassword(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	hashed, _ := HashPassword("password123")
	repo.On("GetUserByUsername", mock.Anything, "alice").Return(&model.User{
		ID: 1, Username: "alice", PasswordHash: hashed,
	}, nil)

	_, err := svc.Login(context.Background(), "alice", "wrongpassword")
	assert.ErrorIs(t, err, ErrInvalidCredentials)
}

func TestAuthService_Login_UserNotFound(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	repo.On("GetUserByUsername", mock.Anything, "alice").Return(nil, gorm.ErrRecordNotFound)

	_, err := svc.Login(context.Background(), "alice", "password123")
	assert.ErrorIs(t, err, ErrInvalidCredentials)
}

func TestAuthService_Refresh_Success_RotatesToken(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	hashed, _ := HashPassword("password123")
	raw := GenerateRefreshToken()
	repo.On("GetRefreshToken", mock.Anything, HashRefreshToken(raw)).Return(&model.RefreshToken{
		UserID: 1, Token: HashRefreshToken(raw), ExpiresAt: time.Now().Add(time.Hour),
	}, nil)
	repo.On("RevokeRefreshToken", mock.Anything, HashRefreshToken(raw)).Return(nil)
	repo.On("GetUserByID", mock.Anything, uint(1)).Return(&model.User{ID: 1, Username: "alice", PasswordHash: hashed}, nil)
	repo.On("CreateRefreshToken", mock.Anything, mock.AnythingOfType("*model.RefreshToken")).Return(nil)
	repo.On("DeleteExpiredRefreshTokens", mock.Anything, uint(1)).Return(nil)

	result, err := svc.Refresh(context.Background(), raw)
	assert.NoError(t, err)
	assert.NotEmpty(t, result.AccessToken)
	assert.NotEqual(t, raw, result.RefreshToken, "refresh token must rotate on use")
}

func TestAuthService_Refresh_UnknownToken(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	repo.On("GetRefreshToken", mock.Anything, mock.Anything).Return(nil, gorm.ErrRecordNotFound)

	_, err := svc.Refresh(context.Background(), "nope")
	assert.ErrorIs(t, err, ErrInvalidToken)
}

func TestAuthService_Refresh_ExpiredToken(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	raw := GenerateRefreshToken()
	repo.On("GetRefreshToken", mock.Anything, HashRefreshToken(raw)).Return(&model.RefreshToken{
		UserID: 1, Token: HashRefreshToken(raw), ExpiresAt: time.Now().Add(-time.Minute),
	}, nil)

	_, err := svc.Refresh(context.Background(), raw)
	assert.ErrorIs(t, err, ErrInvalidToken)
}

// A token re-presented within the grace window is a benign concurrent-refresh
// race (two tabs) — the rotation winner's successor must stay alive.
func TestAuthService_Refresh_ReplayWithinGrace_KeepsFamily(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	raw := GenerateRefreshToken()
	revokedAt := time.Now().Add(-2 * time.Second)
	repo.On("GetRefreshToken", mock.Anything, HashRefreshToken(raw)).Return(&model.RefreshToken{
		UserID: 1, Token: HashRefreshToken(raw), ExpiresAt: time.Now().Add(time.Hour),
		Revoked: true, RevokedAt: &revokedAt,
	}, nil)

	_, err := svc.Refresh(context.Background(), raw)
	assert.ErrorIs(t, err, ErrInvalidToken)
	repo.AssertNotCalled(t, "RevokeAllUserRefreshTokens", mock.Anything, mock.Anything)
}

// Legacy rows revoked before revoked_at existed carry no timestamp — assume a
// benign race (availability first) instead of nuking the family.
func TestAuthService_Refresh_ReplayedLegacyRow_KeepsFamily(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	raw := GenerateRefreshToken()
	repo.On("GetRefreshToken", mock.Anything, HashRefreshToken(raw)).Return(&model.RefreshToken{
		UserID: 1, Token: HashRefreshToken(raw), ExpiresAt: time.Now().Add(time.Hour), Revoked: true,
	}, nil)

	_, err := svc.Refresh(context.Background(), raw)
	assert.ErrorIs(t, err, ErrInvalidToken)
	repo.AssertNotCalled(t, "RevokeAllUserRefreshTokens", mock.Anything, mock.Anything)
}

// An old revoked token resurfacing past the grace window is the theft signal —
// the whole family dies so the stolen lineage is worthless.
func TestAuthService_Refresh_LateReplay_KillsFamily(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	raw := GenerateRefreshToken()
	revokedAt := time.Now().Add(-time.Hour)
	repo.On("GetRefreshToken", mock.Anything, HashRefreshToken(raw)).Return(&model.RefreshToken{
		UserID: 1, Token: HashRefreshToken(raw), ExpiresAt: time.Now().Add(time.Hour),
		Revoked: true, RevokedAt: &revokedAt,
	}, nil)
	repo.On("RevokeAllUserRefreshTokens", mock.Anything, uint(1)).Return(nil)

	_, err := svc.Refresh(context.Background(), raw)
	assert.ErrorIs(t, err, ErrInvalidToken)
	repo.AssertExpectations(t)
}

// Losing the CAS revoke race means another request rotated the token between
// our read and our write — microseconds ago, so by definition benign.
func TestAuthService_Refresh_CASRace_KeepsFamily(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig(), nil)

	raw := GenerateRefreshToken()
	repo.On("GetRefreshToken", mock.Anything, HashRefreshToken(raw)).Return(&model.RefreshToken{
		UserID: 1, Token: HashRefreshToken(raw), ExpiresAt: time.Now().Add(time.Hour),
	}, nil)
	repo.On("RevokeRefreshToken", mock.Anything, HashRefreshToken(raw)).Return(repository.ErrReplayedToken)

	_, err := svc.Refresh(context.Background(), raw)
	assert.ErrorIs(t, err, ErrInvalidToken)
	repo.AssertNotCalled(t, "RevokeAllUserRefreshTokens", mock.Anything, mock.Anything)
}
