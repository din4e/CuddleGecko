// Package version holds the application version.
//
// Override at build/release time via ldflags, e.g.:
//
//	go build -ldflags "-X github.com/din4e/cuddlegecko/internal/version.Version=v1.2.3"
//
// The release workflow passes the Git tag here so the running app reports
// (and self-update compares against) the real released version.
package version

// Version is the current application version. Without ldflags it defaults to a
// dev sentinel; releases override it with the Git tag (e.g. "v1.2.3").
var Version = "0.1.0-dev"
