package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"setta/internal/evalharness"
)

type evaluationRunner func(
	context.Context,
	evalharness.Phase1EvaluationConfig,
) (evalharness.Phase1EvaluationOutput, error)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, evalharness.RunPhase1Evaluation))
}

func run(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
	runner evaluationRunner,
) int {
	config, help, err := phase1ConfigFromArgs(args, stdout, stderr)
	if help {
		return 0
	}
	if err != nil {
		if !errors.Is(err, flag.ErrHelp) {
			fmt.Fprintf(stderr, "%v\n", err)
		}
		return 2
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	output, err := runner(ctx, config)
	if err != nil {
		fmt.Fprintf(stderr, "run Setta live evaluation: %v\n", err)
		return 1
	}
	writePhase1Output(stdout, output)
	if !phase1OutputPassed(output) {
		fmt.Fprintln(stderr, "Setta live evaluation did not pass ability, user control, and communication; inspect the result artifacts.")
		return 1
	}
	return 0
}

func phase1ConfigFromArgs(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) (evalharness.Phase1EvaluationConfig, bool, error) {
	var config evalharness.Phase1EvaluationConfig
	flags := flag.NewFlagSet("setta-eval", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.Usage = func() {
		writePhase1Usage(flags.Output())
		fmt.Fprintln(flags.Output(), "Options:")
		flags.PrintDefaults()
	}
	flags.StringVar(&config.RepoRoot, "repo-root", "", "Setta repository root (default: current directory)")
	flags.StringVar(&config.RecordingsRoot, "recordings-root", "", "artifact root (default: .recordings/setta-eval)")
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
		return evalharness.Phase1EvaluationConfig{}, errors.Is(err, flag.ErrHelp), err
	}
	if flags.NArg() != 0 {
		return evalharness.Phase1EvaluationConfig{}, false, fmt.Errorf("setta-eval does not accept positional arguments")
	}
	if stdout == nil {
		return evalharness.Phase1EvaluationConfig{}, false, errors.New("setta-eval stdout is required")
	}
	return config, false, nil
}

func writePhase1Usage(output io.Writer) {
	fmt.Fprintln(output, "Usage: setta-eval [options]")
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Run the straightforward-task live evaluation through the production Setta boundary.")
	fmt.Fprintln(output, "Execution remains gated until the Phase 0 PASS report and resolution are committed.")
	fmt.Fprintln(output, "The exact checked-in ARM64 toolchain image must already be installed locally; the runner never pulls it.")
}

func writePhase1Output(output io.Writer, result evalharness.Phase1EvaluationOutput) {
	for _, scenario := range result.Results.Scenarios {
		fmt.Fprintf(
			output,
			"%s: %s (%s)\n",
			scenario.ScenarioID,
			scenario.Classification,
			scenario.ExecutionOutcome,
		)
	}
	fmt.Fprintf(output, "Results: %s\n", result.Artifacts.ResultsJSON)
	fmt.Fprintf(output, "Manifest: %s\n", result.Artifacts.ManifestJSON)
	fmt.Fprintf(output, "Events: %s\n", result.Artifacts.EventsJSONL)
	fmt.Fprintf(output, "Transcript: %s\n", result.Artifacts.TranscriptJSON)
	fmt.Fprintf(output, "Token usage: %s\n", result.Artifacts.TokenUsageJSON)
	fmt.Fprintf(output, "Verifier results: %s\n", result.Artifacts.VerifierResultsJSON)
	fmt.Fprintf(output, "Judge results: %s\n", result.Artifacts.JudgeResultsJSON)
	fmt.Fprintf(output, "Report: %s\n", result.Artifacts.ReportMarkdown)
}

func phase1OutputPassed(output evalharness.Phase1EvaluationOutput) bool {
	if len(output.Results.Scenarios) == 0 {
		return false
	}
	for _, scenario := range output.Results.Scenarios {
		if scenario.Classification != evalharness.ScenarioClassificationPass {
			return false
		}
	}
	if len(output.JudgeResults.Scenarios) != len(output.Results.Scenarios) {
		return false
	}
	for index, scenario := range output.JudgeResults.Scenarios {
		if scenario.ScenarioID != output.Results.Scenarios[index].ScenarioID ||
			!scenario.EvidenceAvailable || scenario.Verdict == nil || !scenario.Verdict.OverallPass {
			return false
		}
	}
	return true
}
