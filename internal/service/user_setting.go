package service

import "context"

// UserSettingStore persists per-user key-value settings.
// repository.UserSettingRepo implements it.
type UserSettingStore interface {
	Get(ctx context.Context, userID uint, name string) (value string, found bool, err error)
	Set(ctx context.Context, userID uint, name, value string) error
}

type UserSettingService struct {
	store UserSettingStore
}

func NewUserSettingService(store UserSettingStore) *UserSettingService {
	return &UserSettingService{store: store}
}

func (s *UserSettingService) Get(ctx context.Context, userID uint, name string) (string, bool, error) {
	return s.store.Get(ctx, userID, name)
}

func (s *UserSettingService) Set(ctx context.Context, userID uint, name, value string) error {
	return s.store.Set(ctx, userID, name, value)
}
