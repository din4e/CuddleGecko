package bindings

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

type DesktopBinding struct{}

func (b *DesktopBinding) Version() string {
	return "0.1.0"
}

func (b *DesktopBinding) Platform() string {
	return runtime.GOOS
}

func (b *DesktopBinding) Arch() string {
	return runtime.GOARCH
}

func (b *DesktopBinding) DataDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "CuddleGecko")
}

func (b *DesktopBinding) DatabasePath() string {
	return filepath.Join(b.DataDir(), "cuddlegecko.db")
}

func (b *DesktopBinding) OpenDataDir() error {
	dir := b.DataDir()
	os.MkdirAll(dir, 0755)
	switch runtime.GOOS {
	case "windows":
		return exec.Command("explorer", dir).Start()
	case "darwin":
		return exec.Command("open", dir).Start()
	default:
		return exec.Command("xdg-open", dir).Start()
	}
}
