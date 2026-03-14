package settacmd

import (
	"context"
	"flag"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"setta/internal/config"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

const exportDBFileMode = 0o644

type exportDBFlags struct {
	readable             bool
	readableWithVariants bool
	outputPath           string
}

func runExportDB(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("export-db", flag.ContinueOnError)
	flags.SetOutput(stderr)

	var parsed exportDBFlags
	flags.BoolVar(&parsed.readable, "readable", false, "Export in human-readable format.")
	flags.BoolVar(&parsed.readableWithVariants, "readable-with-variants", false, "Export in readable format with variants.")
	flags.StringVar(&parsed.outputPath, "output", "", "Output path for readable export.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return &ExitError{Code: 2, Err: fmt.Errorf("export-db does not accept positional arguments")}
	}

	commandCfg, err := resolveExportDBCommandConfig(global, cwd, envLookup)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}

	store, err := projectstate.NewStore(filepath.Join(commandCfg.Paths.SettaFilesRoot, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		return err
	}
	document, err := store.Load(context.Background())
	if err != nil {
		return err
	}

	payload, err := document.BuildReadableProjectExport(projectstate.ReadableExportOptions{
		IncludeVariants: resolveExportDBIncludeVariants(parsed),
		WorkspaceRoot:   commandCfg.Paths.WorkspaceRoot,
		SettaFilesRoot:  commandCfg.Paths.SettaFilesRoot,
	})
	if err != nil {
		return err
	}

	yamlPayload, err := yaml.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal readable export yaml: %w", err)
	}
	if len(yamlPayload) == 0 || yamlPayload[len(yamlPayload)-1] != '\n' {
		yamlPayload = append(yamlPayload, '\n')
	}

	outputPath, err := resolveExportDBOutputPath(strings.TrimSpace(parsed.outputPath), commandCfg.Paths.SettaFilesRoot, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	if err := statefs.AtomicWriteFile(outputPath, yamlPayload, exportDBFileMode); err != nil {
		return fmt.Errorf("write readable export: %w", err)
	}
	_, err = fmt.Fprintf(stdout, "Wrote readable export to %s\n", outputPath)
	return err
}

func resolveExportDBIncludeVariants(parsed exportDBFlags) bool {
	if !parsed.readable && !parsed.readableWithVariants {
		return true
	}
	return parsed.readableWithVariants
}

func resolveExportDBOutputPath(raw string, settaFilesRoot string, cwd string) (string, error) {
	if raw == "" {
		return statefs.NormalizePath(filepath.Join(settaFilesRoot, "project.readable.yaml"), "")
	}
	return statefs.NormalizePath(raw, cwd)
}

func resolveExportDBCommandConfig(global globalFlags, cwd string, envLookup func(string) (string, bool)) (config.Config, error) {
	return config.Load(config.LoadOptions{
		CWD:       cwd,
		EnvLookup: envLookup,
		CLI: config.CLIOptions{
			WorkspaceRoot:      strings.TrimSpace(global.workspaceRoot),
			SettaHome:          strings.TrimSpace(global.settaHome),
			ProfileLookupHome:  strings.TrimSpace(global.profileLookupHome),
			SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
			SettaFilesLocation: strings.TrimSpace(global.settaFilesLocation),
			RuntimeRoot:        strings.TrimSpace(global.runtimeRoot),
			Profile:            strings.TrimSpace(global.profile),
		},
	})
}
