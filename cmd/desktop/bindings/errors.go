package bindings

import "errors"

var (
	ErrInvalidCaptcha     = errors.New("invalid or expired captcha")
	ErrNotAuthenticated   = errors.New("not authenticated")
	ErrInvalidImportFormat = errors.New("invalid import file format")
)
