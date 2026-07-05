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
	case "detect":
		return runProvisionDetect(args[1:], deps)
	case "render-link":
		return runProvisionRenderLink(args[1:], deps)
	case "render-cloudinit":
		return runProvisionRenderCloudInit(args[1:], deps)
	case "resolve":
		return runProvisionResolve(args[1:], deps)
	case "shapes":
		return runProvisionShapes(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown setta provision subcommand %q", args[0])}
	}
}
