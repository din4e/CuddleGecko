package bindings

import (
	"context"
	"fmt"

	"github.com/creativeprojects/go-selfupdate"
	"github.com/din4e/cuddlegecko/internal/version"
	goversion "github.com/hashicorp/go-version"
)

// GitHub owner/repo hosting releases consumed by go-selfupdate.
const (
	repoOwner = "din4e"
	repoName  = "CuddleGecko"
)

// UpdaterBinding exposes self-update (check / apply) to the Wails frontend.
type UpdaterBinding struct{}

// UpdateInfo is the result of an update check or apply.
type UpdateInfo struct {
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	HasUpdate bool   `json:"has_update"`
	URL       string `json:"url"` // release page (manual download)
	Notes     string `json:"notes,omitempty"`
}

// Check queries GitHub for the latest release and whether it's newer than current.
func (b *UpdaterBinding) Check() (*UpdateInfo, error) {
	current := version.Version
	info := &UpdateInfo{Current: current}

	latest, found, err := selfupdate.DetectLatest(context.Background(), selfupdate.NewRepositorySlug(repoOwner, repoName))
	if err != nil {
		info.Notes = fmt.Sprintf("check failed: %v", err)
		return info, nil
	}
	if !found {
		info.Notes = "no releases published yet"
		return info, nil
	}
	info.Latest = latest.Version()
	info.URL = latest.URL
	info.HasUpdate = newerThan(info.Latest, current)
	return info, nil
}

// Apply downloads the latest release and replaces the running binary.
// After it succeeds the caller (frontend) must restart the app to run the new version.
func (b *UpdaterBinding) Apply() (*UpdateInfo, error) {
	current := version.Version
	rel, err := selfupdate.UpdateSelf(context.Background(), current, selfupdate.NewRepositorySlug(repoOwner, repoName))
	if err != nil {
		return &UpdateInfo{Current: current, Notes: fmt.Sprintf("update failed: %v", err)}, nil
	}
	return &UpdateInfo{Current: current, Latest: rel.Version(), URL: rel.URL}, nil
}

// newerThan reports whether latest > current using semver, falling back to inequality.
func newerThan(latest, current string) bool {
	if latest == "" {
		return false
	}
	if lat, err := goversion.NewVersion(latest); err == nil {
		if cur, err := goversion.NewVersion(current); err == nil {
			return lat.GreaterThan(cur)
		}
	}
	return latest != current
}
