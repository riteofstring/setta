package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	"setta/internal/hostedmeasurement"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr, time.Now))
}

func run(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer, now func() time.Time) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "usage: setta-hosted-measurement <dry-run|cleanup> [options]")
		return 2
	}
	switch args[0] {
	case "dry-run":
		return runDryRun(args[1:], stdout, stderr, now)
	case "cleanup":
		return runCleanup(ctx, args[1:], stdout, stderr, now)
	default:
		fmt.Fprintf(stderr, "unknown setta-hosted-measurement command %q\n", args[0])
		return 2
	}
}

func runDryRun(args []string, stdout io.Writer, stderr io.Writer, now func() time.Time) int {
	flagSet := flag.NewFlagSet("setta-hosted-measurement dry-run", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	var manifestPath string
	flagSet.StringVar(&manifestPath, "manifest", "", "absolute path to the private authorization manifest")
	if err := flagSet.Parse(args); err != nil {
		return 2
	}
	if flagSet.NArg() != 0 {
		fmt.Fprintln(stderr, "setta-hosted-measurement dry-run does not accept positional arguments")
		return 2
	}
	if manifestPath == "" {
		fmt.Fprintln(stderr, "--manifest is required")
		return 2
	}
	authorization, err := hostedmeasurement.LoadManifest(manifestPath, now(), hostedmeasurement.ValidateForStart)
	if err != nil {
		fmt.Fprintf(stderr, "validate hosted measurement authorization: %v\n", err)
		return 1
	}
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(hostedmeasurement.BuildPlan(authorization)); err != nil {
		fmt.Fprintf(stderr, "write hosted measurement dry-run: %v\n", err)
		return 1
	}
	return 0
}
