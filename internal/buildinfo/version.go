package buildinfo

import (
	"runtime/debug"
	"strings"
)

// Version returns the build version when available, falling back to "dev"
// for local builds without module version metadata.
func Version() string {
	buildInfo, ok := debug.ReadBuildInfo()
	if ok {
		version := strings.TrimSpace(buildInfo.Main.Version)
		if version != "" && version != "(devel)" {
			return version
		}
	}
	return "dev"
}
