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
	evalharness.EvaluationConfig,
) (evalharness.EvaluationOutput, error)

type repeatedStringFlag []string

func (values *repeatedStringFlag) String() string {
	return fmt.Sprintf("%v", []string(*values))
}

func (values *repeatedStringFlag) Set(value string) error {
	if value == "" {
		return errors.New("scenario id is required")
	}
	*values = append(*values, value)
	return nil
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, evalharness.RunEvaluation))
}

func run(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
	runner evaluationRunner,
) int {
	config, help, err := evaluationConfigFromArgs(args, stdout, stderr)
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
	writeEvaluationOutput(stdout, output)
	if !evaluationOutputPassed(output) {
		fmt.Fprintln(stderr, "Setta live evaluation did not pass ability, user control, and communication; inspect the result artifacts.")
		return 1
	}
	return 0
}

func evaluationConfigFromArgs(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) (evalharness.EvaluationConfig, bool, error) {
	var config evalharness.EvaluationConfig
	var scenarios repeatedStringFlag
	flags := flag.NewFlagSet("setta-eval", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.Usage = func() {
		writeEvaluationUsage(flags.Output())
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
	flags.Var(&scenarios, "scenario", "scenario id to run (repeat for an ordered subset; default: all)")
	flags.StringVar(
		&config.CandidatePath,
		"candidate",
		"",
		"candidate role configuration JSON (relative paths resolve from the repository root)",
	)
	if err := flags.Parse(args); err != nil {
		return evalharness.EvaluationConfig{}, errors.Is(err, flag.ErrHelp), err
	}
	if flags.NArg() != 0 {
		return evalharness.EvaluationConfig{}, false, fmt.Errorf("setta-eval does not accept positional arguments")
	}
	if stdout == nil {
		return evalharness.EvaluationConfig{}, false, errors.New("setta-eval stdout is required")
	}
	config.ScenarioIDs = append([]string{}, scenarios...)
	return config, false, nil
}

func writeEvaluationUsage(output io.Writer) {
	fmt.Fprintln(output, "Usage: setta-eval [options]")
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Run all five live evaluations, or a selected subset, through the production Setta boundary.")
	fmt.Fprintln(output, "Execution remains gated until the Phase 0 PASS report and resolution are committed.")
	fmt.Fprintln(output, "The exact checked-in ARM64 toolchain image must already be installed locally; the runner never pulls it.")
}

func writeEvaluationOutput(output io.Writer, result evalharness.EvaluationOutput) {
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

func evaluationOutputPassed(output evalharness.EvaluationOutput) bool {
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
