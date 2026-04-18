package bindings

import (
	"context"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type AuthBinding struct {
	svc     *service.AuthService
	captcha *service.CaptchaService
}

func (b *AuthBinding) Register(username, email, password, captchaID, captchaAnswer string) (*AuthResult, error) {
	ctx := context.Background()
	if b.captcha.Enabled() && captchaID != "" {
		if !b.captcha.Verify(captchaID, captchaAnswer) {
			return nil, ErrInvalidCaptcha
		}
	}

	result, err := b.svc.Register(ctx, username, email, password)
	if err != nil {
		return nil, err
	}

	SetCurrentUserID(result.User.ID)
	return &AuthResult{
		User:         result.User,
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
	}, nil
}

func (b *AuthBinding) Login(username, password, captchaID, captchaAnswer string) (*AuthResult, error) {
	ctx := context.Background()
	if b.captcha.Enabled() && captchaID != "" {
		if !b.captcha.Verify(captchaID, captchaAnswer) {
			return nil, ErrInvalidCaptcha
		}
	}

	result, err := b.svc.Login(ctx, username, password)
	if err != nil {
		return nil, err
	}

	SetCurrentUserID(result.User.ID)
	return &AuthResult{
		User:         result.User,
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
	}, nil
}

func (b *AuthBinding) Refresh(refreshToken string) (*AuthResult, error) {
	ctx := context.Background()
	result, err := b.svc.Refresh(ctx, refreshToken)
	if err != nil {
		return nil, err
	}

	SetCurrentUserID(result.User.ID)
	return &AuthResult{
		User:         result.User,
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
	}, nil
}

func (b *AuthBinding) Me() (*model.User, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return nil, ErrNotAuthenticated
	}
	user, err := b.svc.GetCurrentUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	SetCurrentUserID(user.ID)
	return user, nil
}
