package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const provisionProbeTimeout = 10 * time.Second

type provisionDetectOptions struct {
	JSON bool
}

type provisionDetectResult struct {
	OK        bool                         `json:"ok"`
	Providers []provisionProviderDetection `json:"providers"`
}

type provisionProviderDetection struct {
	Provider       string   `json:"provider"`
	DisplayName    string   `json:"displayName"`
	Status         string   `json:"status"`
	CLIBinary      string   `json:"cliBinary,omitempty"`
	CLIPath        string   `json:"cliPath,omitempty"`
	CLIVersion     string   `json:"cliVersion,omitempty"`
	ProbeArgv      []string `json:"probeArgv,omitempty"`
	Error          string   `json:"error,omitempty"`
	ProviderOutput string   `json:"providerOutput,omitempty"`
}

func runProvisionDetect(args []string, deps cliDeps) error {
	options, err := provisionDetectOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	_ = options
	catalog, err := loadProvisionCatalog()
	if err != nil {
		return err
	}
	detections := make([]provisionProviderDetection, 0, len(catalog.Providers))
	for _, provider := range catalog.Providers {
		detections = append(detections, detectProvisionProvider(context.Background(), provider, deps))
	}
	return encodeProvisionJSON(deps, provisionDetectResult{OK: true, Providers: detections}, "detect JSON")
}

func provisionDetectOptionsFromArgs(args []string, deps cliDeps) (provisionDetectOptions, error) {
	options := provisionDetectOptions{}
	flagSet := newFlagSet("setta provision detect", deps.stderr)
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	if err := flagSet.Parse(args); err != nil {
		return provisionDetectOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return provisionDetectOptions{}, usageError{err: errors.New("setta provision detect does not accept positional arguments")}
	}
	if !options.JSON {
		return provisionDetectOptions{}, usageError{err: errors.New("setta provision detect requires --json")}
	}
	return options, nil
}

func detectProvisionProvider(ctx context.Context, provider provisionCatalogProvider, deps cliDeps) provisionProviderDetection {
	detection := provisionProviderDetection{
		Provider:    provider.ID,
		DisplayName: provider.DisplayName,
	}
	if provider.CLI == nil {
		detection.Status = "manual_only"
		return detection
	}
	detection.CLIBinary = provider.CLI.Binary
	path, err := deps.lookPath(provider.CLI.Binary)
	if err != nil {
		detection.Status = "not_found"
		detection.Error = fmt.Sprintf("%s CLI not found in PATH", provider.CLI.Binary)
		return detection
	}
	detection.CLIPath = path
	detection.CLIVersion = detectProviderCLIVersion(ctx, provider.CLI, deps)
	if len(provider.CLI.AuthProbeArgs) == 0 {
		detection.Status = "installed"
		return detection
	}
	output, err := runProviderProbe(ctx, deps, provider.CLI.Binary, provider.CLI.AuthProbeArgs)
	detection.ProbeArgv = append([]string{provider.CLI.Binary}, provider.CLI.AuthProbeArgs...)
	if err != nil {
		detection.Status = "not_authenticated"
		detection.Error = fmt.Sprintf("%s auth probe failed: %v", provider.CLI.Binary, err)
		detection.ProviderOutput = trimCommandOutput(output)
		return detection
	}
	detection.Status = "authenticated"
	return detection
}

func detectProviderCLIVersion(ctx context.Context, cli *provisionCatalogCLI, deps cliDeps) string {
	if len(cli.VersionArgs) == 0 {
		return ""
	}
	output, err := runProviderProbe(ctx, deps, cli.Binary, cli.VersionArgs)
	if err != nil {
		return ""
	}
	return firstNonEmptyLine(output)
}

func runProviderProbe(ctx context.Context, deps cliDeps, name string, args []string) ([]byte, error) {
	probeCtx, cancel := context.WithTimeout(ctx, provisionProbeTimeout)
	defer cancel()
	return deps.commandRunner(probeCtx, name, args...)
}

func firstNonEmptyLine(output []byte) string {
	for _, line := range strings.Split(string(output), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func isCommandNotFound(err error) bool {
	var execError *exec.Error
	return errors.As(err, &execError) && errors.Is(execError.Err, exec.ErrNotFound)
}

func encodeProvisionJSON(deps cliDeps, value any, label string) error {
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		return fmt.Errorf("encode %s: %w", label, err)
	}
	return nil
}
