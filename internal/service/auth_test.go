package service

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
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

func testJWTConfig() *config.JWTConfig {
	return &config.JWTConfig{
		Secret:     "test-secret",
		AccessTTL:  900000000000,    // 15 minutes
		RefreshTTL: 604800000000000, // 7 days
	}
}

func TestAuthService_Register_Success(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig())

	repo.On("GetUserByUsername", mock.Anything, "alice").Return(nil, gorm.ErrRecordNotFound)
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

	hashed, _ := HashPassword("password123")
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

	hashed, _ := HashPassword("password123")
	repo.On("GetUserByUsername", mock.Anything, "alice").Return(&model.User{
		ID: 1, Username: "alice", PasswordHash: hashed,
	}, nil)

	_, err := svc.Login(context.Background(), "alice", "wrongpassword")
	assert.ErrorIs(t, err, ErrInvalidCredentials)
}

func TestAuthService_Login_UserNotFound(t *testing.T) {
	repo := new(mockUserRepo)
	svc := NewAuthService(repo, testJWTConfig())

	repo.On("GetUserByUsername", mock.Anything, "alice").Return(nil, gorm.ErrRecordNotFound)

	_, err := svc.Login(context.Background(), "alice", "password123")
	assert.ErrorIs(t, err, ErrInvalidCredentials)
}
