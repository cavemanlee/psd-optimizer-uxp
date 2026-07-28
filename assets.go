package main

import "embed"

// pluginFiles is the exact, verified UXP plug-in payload embedded in the EXE.
//
//go:embed plugin
var pluginFiles embed.FS
