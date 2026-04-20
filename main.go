package main

import (
	"embed"

	"github.com/din4e/cuddlegecko/desktop"
)

//go:embed all:web/dist
var assets embed.FS

func main() {
	desktop.Run(assets)
}
