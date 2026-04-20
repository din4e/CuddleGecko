package desktop

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func buildMenu(app *App) *menu.Menu {
	appMenu := menu.NewMenu()

	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("Export Data", keys.CmdOrCtrl("e"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:export")
	})
	fileMenu.AddText("Import Data", keys.CmdOrCtrl("i"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:import")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Settings", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:settings")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		runtime.Quit(app.ctx)
	})

	editMenu := appMenu.AddSubmenu("Edit")
	editMenu.AddText("Undo", keys.CmdOrCtrl("z"), nil)
	editMenu.AddText("Redo", keys.CmdOrCtrl("shift+z"), nil)
	editMenu.AddSeparator()
	editMenu.AddText("Cut", keys.CmdOrCtrl("x"), nil)
	editMenu.AddText("Copy", keys.CmdOrCtrl("c"), nil)
	editMenu.AddText("Paste", keys.CmdOrCtrl("v"), nil)
	editMenu.AddText("Select All", keys.CmdOrCtrl("a"), nil)

	viewMenu := appMenu.AddSubmenu("View")
	viewMenu.AddText("Toggle Full Screen", keys.Key("F11"), func(_ *menu.CallbackData) {
		runtime.WindowToggleMaximise(app.ctx)
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Zoom In", keys.CmdOrCtrl("+"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:zoom-in")
	})
	viewMenu.AddText("Zoom Out", keys.CmdOrCtrl("-"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:zoom-out")
	})
	viewMenu.AddText("Reset Zoom", keys.CmdOrCtrl("0"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:zoom-reset")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Reload", keys.CmdOrCtrl("r"), func(_ *menu.CallbackData) {
		runtime.WindowReload(app.ctx)
	})

	helpMenu := appMenu.AddSubmenu("Help")
	helpMenu.AddText("About", nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:about")
	})

	return appMenu
}
