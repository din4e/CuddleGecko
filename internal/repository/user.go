package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/model"
	"gorm.io/gorm"
)

type UserRepo struct {
	db *gorm.DB
}

// ErrReplayedToken marks a refresh token that was presented after already
// being revoked — the service layer maps it to family-wide invalidation.
var ErrReplayedToken = errors.New("refresh token replayed")

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
		return nil, err
	}
	return &user, nil
}

func (r *UserRepo) GetUserByID(ctx context.Context, id uint) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).First(&user, id).Error; err != nil {
		return nil, err
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

// RevokeRefreshToken atomically flips revoked false→true (compare-and-swap).
// A plain UPDATE ... WHERE token=? let two concurrent requests using the same
// stolen token both pass the earlier Revoked check and each mint fresh pairs.
// RowsAffected==0 means the token was already revoked: a replay (surfaced as
// service.ErrTokenReplayed by the service layer).
func (r *UserRepo) RevokeRefreshToken(ctx context.Context, token string) error {
	res := r.db.WithContext(ctx).Model(&model.RefreshToken{}).
		Where("token = ? AND revoked = ?", token, false).
		Update("revoked", true)
	if res.Error != nil {
		return fmt.Errorf("revoke refresh token: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrReplayedToken
	}
	return nil
}

// RevokeAllUserRefreshTokens invalidates every refresh token for a user —
// token-family revocation on detected replay.
func (r *UserRepo) RevokeAllUserRefreshTokens(ctx context.Context, userID uint) error {
	if err := r.db.WithContext(ctx).Model(&model.RefreshToken{}).
		Where("user_id = ? AND revoked = ?", userID, false).
		Update("revoked", true).Error; err != nil {
		return fmt.Errorf("revoke all refresh tokens: %w", err)
	}
	return nil
}
