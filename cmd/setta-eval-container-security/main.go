package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"setta/internal/evalharness"
)

type containerSecurityRunner func(
	context.Context,
	evalharness.ContainerSecurityConfig,
) (evalharness.ContainerSecurityOutput, error)

func main() {
	os.Exit(run(
		os.Args[1:],
		os.Stdout,
		os.Stderr,
		evalharness.RunContainerSecurityScan,
	))
}

func run(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
	runner containerSecurityRunner,
) int {
	config, help, err := containerSecurityConfigFromArgs(args, stderr)
	if help {
		return 0
	}
	if err != nil {
		fmt.Fprintf(stderr, "setta-eval-container-security: %v\n", err)
		return 2
	}
	if runner == nil {
		fmt.Fprintln(stderr, "setta-eval-container-security: runner is required")
		return 2
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	output, err := runner(ctx, config)
	if err != nil {
		fmt.Fprintf(stderr, "Setta eval container security failed: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"Container security: status=%s; findings=%d\nReport: %s\nDetails: %s\n",
		strings.ToUpper(output.Report.Status),
		len(output.Report.Findings),
		output.Artifacts.ReportMarkdown,
		output.Artifacts.ReportJSON,
	)
	if !output.Report.Passed() {
		return 1
	}
	return 0
}

func containerSecurityConfigFromArgs(
	args []string,
	stderr io.Writer,
) (evalharness.ContainerSecurityConfig, bool, error) {
	var config evalharness.ContainerSecurityConfig
	flags := flag.NewFlagSet("setta-eval-container-security", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.Usage = func() {
		writeContainerSecurityUsage(flags.Output())
		fmt.Fprintln(flags.Output(), "Options:")
		flags.PrintDefaults()
	}
	flags.StringVar(&config.RepoRoot, "repo-root", "", "Setta repository root (default: current directory)")
	flags.StringVar(
		&config.RecordingsRoot,
		"recordings-root",
		"",
		"artifact root (default: .recordings/setta-container-security)",
	)
	flags.StringVar(
		&config.CodexLinuxBundle,
		"codex-linux-bundle",
		"",
		"local aarch64-unknown-linux-musl Codex standalone bundle",
	)
	flags.StringVar(&config.DockerCommand, "docker", "docker", "Docker CLI path")
	flags.StringVar(&config.CodexCommand, "codex", "codex", "host Codex CLI path")
	flags.StringVar(&config.PNPMCommand, "pnpm", "pnpm", "host pnpm CLI path")
	if err := flags.Parse(args); err != nil {
		return evalharness.ContainerSecurityConfig{}, errors.Is(err, flag.ErrHelp), err
	}
	if flags.NArg() != 0 {
		return evalharness.ContainerSecurityConfig{}, false, errors.New(
			"setta-eval-container-security does not accept positional arguments",
		)
	}
	return config, false, nil
}

func writeContainerSecurityUsage(output io.Writer) {
	fmt.Fprintln(output, "Usage: setta-eval-container-security [options]")
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Build and scan the exact local eval images without giving the scanner Docker-socket or credential access.")
	fmt.Fprintln(output, "The pinned ARM64 toolchain and Trivy images must already be installed; this command never pulls them.")
}
