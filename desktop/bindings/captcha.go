package bindings

import (
	"fmt"
)

type CaptchaBinding struct {
	svc interface {
		Enabled() bool
		Generate() (id string, imageBase64 string, err error)
	}
}

func (b *CaptchaBinding) Get() (*CaptchaResult, error) {
	if b.svc == nil {
		return &CaptchaResult{Enabled: false}, nil
	}
	if !b.svc.Enabled() {
		return &CaptchaResult{Enabled: false}, nil
	}

	id, img, err := b.svc.Generate()
	if err != nil {
		return nil, err
	}

	return &CaptchaResult{
		Enabled: true,
		ID:      id,
		Image:   fmt.Sprintf("data:image/png;base64,%s", img),
	}, nil
}
