package main

import (
	"embed"
	"log"

	"github.com/din4e/cuddlegecko/cmd/desktop/bindings"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:web/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "CuddleGecko",
		Width:     1024,
		Height:    768,
		MinWidth:  800,
		MinHeight: 600,
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Bind: []any{
			app,
			bindings.Auth,
			bindings.Captcha,
			bindings.Contact,
			bindings.Tag,
			bindings.Interaction,
			bindings.Reminder,
			bindings.Graph,
			bindings.Export,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
