package desktop

import (
	"embed"
	"log"

	"github.com/din4e/cuddlegecko/desktop/bindings"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

func Run(assets embed.FS) {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:      "CuddleGecko",
		Width:      1024,
		Height:     768,
		MinWidth:   800,
		MinHeight:  600,
		Frameless:  true,
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Menu:       buildMenu(app),
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
			bindings.Event,
			bindings.Transaction,
			bindings.AI,
			bindings.Desktop,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
