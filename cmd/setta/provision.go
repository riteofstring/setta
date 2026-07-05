package main

import (
	"errors"
	"fmt"
)

func runProvision(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta provision requires a subcommand")}
	}
	switch args[0] {
	case "render-cloudinit":
		return runProvisionRenderCloudInit(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown setta provision subcommand %q", args[0])}
	}
}
