package settacmd

import (
	"flag"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"setta/internal/config"
)

type pathsFlags struct {
	envOutput   bool
	jsonOutput  bool
	cwdOverride string
}

type pathsPayload struct {
	WorkspaceRoot          string `json:"workspaceRoot"`
	SettaHome              string `json:"settaHome"`
	ProfileLookupHome      string `json:"profileLookupHome"`
	ProfileName            string `json:"profile,omitempty"`
	SettaFilesRoot         string `json:"settaFilesRoot"`
	ActiveSettaFilesMode   string `json:"activeSettaFilesLocation"`
	ResolvedFilesLocation  string `json:"resolvedFilesLocation"`
	UsesExplicitSettaFiles bool   `json:"usesExplicitSettaFiles"`
	RuntimeRoot            string `json:"runtimeRoot"`
	RuntimeWithinSettaRoot bool   `json:"runtimeWithinSettaRoot"`
	AuthCookieName         string `json:"authCookieName,omitempty"`
}

func runPaths(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("paths", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var parsed pathsFlags
	flags.BoolVar(&parsed.envOutput, "env", false, "Emit KEY=value lines for shell/script consumption.")
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON payload.")
	flags.StringVar(&parsed.cwdOverride, "cwd", "", "Resolve paths as if Setta were started from this working directory.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("paths does not accept positional arguments")
	}
	if parsed.envOutput && parsed.jsonOutput {
		return fmt.Errorf("paths accepts at most one output mode flag")
	}

	effectiveCWD := cwd
	if value := strings.TrimSpace(parsed.cwdOverride); value != "" {
		if !filepath.IsAbs(value) {
			value = filepath.Join(cwd, value)
		}
		resolvedCWD, err := filepath.Abs(value)
		if err != nil {
			return fmt.Errorf("resolve --cwd: %w", err)
		}
		effectiveCWD = filepath.Clean(resolvedCWD)
	}

	cfg, err := config.Load(config.LoadOptions{
		CWD:       effectiveCWD,
		EnvLookup: envLookup,
		CLI: config.CLIOptions{
			WorkspaceRoot:      strings.TrimSpace(global.workspaceRoot),
			SettaHome:          strings.TrimSpace(global.settaHome),
			ProfileLookupHome:  strings.TrimSpace(global.profileLookupHome),
			SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
			SettaFilesLocation: strings.TrimSpace(global.settaFilesLocation),
			RuntimeRoot:        strings.TrimSpace(global.runtimeRoot),
			Profile:            strings.TrimSpace(global.profile),
			Host:               strings.TrimSpace(global.host),
			Port:               strings.TrimSpace(global.port),
			LogLevel:           strings.TrimSpace(global.logLevel),
		},
	})
	if err != nil {
		return err
	}

	if parsed.envOutput {
		return writePathsEnv(stdout, cfg.Paths)
	}
	return writeJSONPayload(stdout, buildPathsPayload(cfg.Paths))
}

func buildPathsPayload(paths config.Paths) pathsPayload {
	return pathsPayload{
		WorkspaceRoot:          paths.WorkspaceRoot,
		SettaHome:              paths.SettaHome,
		ProfileLookupHome:      paths.ProfileLookupHome,
		ProfileName:            paths.ProfileName,
		SettaFilesRoot:         paths.SettaFilesRoot,
		ActiveSettaFilesMode:   paths.ActiveSettaFilesLocation(),
		ResolvedFilesLocation:  string(paths.ResolvedFilesLocation),
		UsesExplicitSettaFiles: paths.UsesExplicitSettaFiles,
		RuntimeRoot:            paths.RuntimeRoot,
		RuntimeWithinSettaRoot: runtimeWithinSettaRoot(paths),
		AuthCookieName:         paths.AuthCookieName,
	}
}

func writePathsEnv(writer io.Writer, paths config.Paths) error {
	payload := buildPathsPayload(paths)
	lines := []string{
		"WORKSPACE_ROOT=" + payload.WorkspaceRoot,
		"SETTA_HOME=" + payload.SettaHome,
		"PROFILE_LOOKUP_HOME=" + payload.ProfileLookupHome,
		"PROFILE=" + payload.ProfileName,
		"SETTA_FILES_ROOT=" + payload.SettaFilesRoot,
		"ACTIVE_SETTA_FILES_LOCATION=" + payload.ActiveSettaFilesMode,
		"RESOLVED_SETTA_FILES_LOCATION=" + payload.ResolvedFilesLocation,
		fmt.Sprintf("USES_EXPLICIT_SETTA_FILES=%d", boolToInt(payload.UsesExplicitSettaFiles)),
		"RUNTIME_ROOT=" + payload.RuntimeRoot,
		fmt.Sprintf("RUNTIME_WITHIN_SETTA_ROOT=%d", boolToInt(payload.RuntimeWithinSettaRoot)),
	}
	for _, line := range lines {
		if _, err := fmt.Fprintln(writer, line); err != nil {
			return err
		}
	}
	return nil
}

func runtimeWithinSettaRoot(paths config.Paths) bool {
	rel, err := filepath.Rel(paths.SettaFilesRoot, paths.RuntimeRoot)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
