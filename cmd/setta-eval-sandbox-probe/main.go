package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"setta/internal/evalharness"
)

func main() {
	var config evalharness.Phase0SandboxProbeConfig
	var timeout time.Duration
	flag.StringVar(&config.RepoRoot, "repo-root", ".", "Setta repository root")
	flag.StringVar(
		&config.CodexLinuxBundle,
		"codex-linux-bundle",
		"",
		"local aarch64-unknown-linux-musl Codex standalone bundle",
	)
	flag.StringVar(&config.Model, "model", "gpt-5.4-mini", "exact model for the two benign turns")
	flag.StringVar(&config.DockerCommand, "docker", "docker", "Docker CLI path")
	flag.StringVar(&config.CodexCommand, "codex", "codex", "host Codex CLI path")
	flag.DurationVar(&timeout, "timeout", 10*time.Minute, "overall probe timeout")
	flag.Parse()

	signalContext, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()
	ctx, cancel := context.WithTimeout(signalContext, timeout)
	defer cancel()
	evidence, err := evalharness.RunPhase0SandboxProbe(ctx, config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Phase 0 sandbox probe did not pass: %v\n", err)
		os.Exit(1)
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(evidence); err != nil {
		fmt.Fprintf(os.Stderr, "encode Phase 0 evidence: %v\n", err)
		os.Exit(1)
	}
}
