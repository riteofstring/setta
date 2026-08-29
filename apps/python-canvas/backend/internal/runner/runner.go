// Package runner executes one immutable generated Python program without
// involving the interactive terminal runtime.
package runner

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	DefaultTimeout     = 30 * time.Second
	DefaultOutputLimit = 1 << 20
)

var (
	ErrInterpreterRequired      = errors.New("runner: interpreter is required")
	ErrProjectDirectoryRequired = errors.New("runner: project directory is required")
	ErrInvalidTimeout           = errors.New("runner: timeout must be positive")
	ErrInvalidOutputLimit       = errors.New("runner: output limit must be positive")
)

// TerminationReason reports how the generated program ended. A nonzero Python
// exit remains a completed result, while runner setup failures are errors.
type TerminationReason string

const (
	TerminationExited      TerminationReason = "exited"
	TerminationSignaled    TerminationReason = "signaled"
	TerminationTimedOut    TerminationReason = "timed_out"
	TerminationOutputLimit TerminationReason = "output_limit"
)

// Program is the exact immutable program captured by the coordinator.
type Program struct {
	ProjectID string
	Revision  int
	Code      string
}

// Request supplies an optional per-run execution deadline. A zero value uses
// the service's configured default.
type Request struct {
	Timeout time.Duration
}

// Result carries bounded, independently captured program output. Output is
// normalized to valid UTF-8 at the process boundary so it can cross the JSON
// transport without a lossy encoder-side conversion.
type Result struct {
	ProjectID       string
	Revision        int
	Stdout          string
	Stderr          string
	StdoutTruncated bool
	StderrTruncated bool
	ExitCode        *int
	Termination     TerminationReason
	Elapsed         time.Duration
}

// Runtime is the narrow process boundary injected into HTTP. It deliberately
// accepts only a coordinator-captured program, never a caller-selected command
// or working directory.
type Runtime interface {
	Run(context.Context, Program, Request) (Result, error)
}

// Options contains every process selection owned by the startup boundary.
// Interpreter and ProjectDirectory are required and never inferred from PATH
// or the current working directory.
type Options struct {
	Interpreter      string
	ProjectDirectory string
	Environment      []string
	DefaultTimeout   time.Duration
	OutputLimit      int
}

// Service executes generated Python through one explicit interpreter.
type Service struct {
	interpreter      string
	projectDirectory string
	environment      []string
	defaultTimeout   time.Duration
	outputLimit      int
	removeArtifact   func(artifact) error
}

func New(options Options) (*Service, error) {
	interpreter, err := validateInterpreter(options.Interpreter)
	if err != nil {
		return nil, err
	}
	projectDirectory, err := validateProjectDirectory(options.ProjectDirectory)
	if err != nil {
		return nil, err
	}
	defaultTimeout := options.DefaultTimeout
	if defaultTimeout == 0 {
		defaultTimeout = DefaultTimeout
	}
	if defaultTimeout <= 0 {
		return nil, ErrInvalidTimeout
	}
	outputLimit := options.OutputLimit
	if outputLimit == 0 {
		outputLimit = DefaultOutputLimit
	}
	if outputLimit < 1 {
		return nil, ErrInvalidOutputLimit
	}
	environment := options.Environment
	if environment == nil {
		environment = os.Environ()
	}
	return &Service{
		interpreter:      interpreter,
		projectDirectory: projectDirectory,
		environment:      append([]string(nil), environment...),
		defaultTimeout:   defaultTimeout,
		outputLimit:      outputLimit,
		removeArtifact:   func(value artifact) error { return value.remove() },
	}, nil
}

// Run writes the exact coordinator capture to a private temporary artifact,
// executes it directly, captures both output streams independently, and
// removes the artifact on every return path.
func (service *Service) Run(ctx context.Context, program Program, request Request) (result Result, runErr error) {
	setup, err := service.prepareRun(ctx, program, request)
	if err != nil {
		return Result{}, err
	}
	defer service.cleanupArtifact(setup.artifact, &result, &runErr)
	return service.executeRun(setup, program)
}

// terminationState makes the first runner-enforced reason authoritative. It
// is intentionally independent of process operations so the event loop can
// reject repeated output, timer, and context signals before touching the OS.
type terminationState struct {
	reason TerminationReason
}

func (state *terminationState) enforce(reason TerminationReason) bool {
	if state.reason != "" {
		return false
	}
	state.reason = reason
	return true
}

// stopOwnedProcess always attempts to stop the directly owned process after a
// process-tree request. This guarantees that Run can reach Wait and drain both
// pipes even when an OS-level tree operation itself reports an error.
type ownedProcess interface {
	terminate() error
	finalize() error
}

// commandTerminationOwner is used only by a private guardian that keeps the
// direct process alive while it shuts down and reaps its tree. Killing that
// guardian from the parent before its acknowledgement would discard the
// kernel ownership boundary that contains session-escaping descendants.
type commandTerminationOwner interface {
	ownsCommandTermination() bool
}

func stopOwnedProcess(command *exec.Cmd, owner ownedProcess) error {
	var failures []error
	guardianOwnsCommand := false
	if owner == nil {
		failures = append(failures, errors.New("owned process is unavailable"))
	} else {
		if err := owner.terminate(); err != nil {
			failures = append(failures, err)
		}
		if guardian, ok := owner.(commandTerminationOwner); ok {
			guardianOwnsCommand = guardian.ownsCommandTermination()
		}
	}
	if !guardianOwnsCommand && command != nil && command.Process != nil {
		if err := command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
			failures = append(failures, err)
		}
	}
	if len(failures) == 0 {
		return nil
	}
	return fmt.Errorf("runner: terminate generated Python process tree: %w", errors.Join(failures...))
}

func cleanupStartedCommand(command *exec.Cmd) error {
	if command == nil || command.Process == nil {
		return nil
	}
	var failures []error
	if err := command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		failures = append(failures, err)
	}
	if err := command.Wait(); err != nil {
		var exitError *exec.ExitError
		if !errors.As(err, &exitError) && !errors.Is(err, os.ErrProcessDone) {
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}

func validateInterpreter(value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", ErrInterpreterRequired
	}
	resolved, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("runner: resolve interpreter: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("runner: stat interpreter: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("runner: interpreter %q is not a regular file", resolved)
	}
	return resolved, nil
}

func validateProjectDirectory(value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", ErrProjectDirectoryRequired
	}
	resolved, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("runner: resolve project directory: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("runner: stat project directory: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("runner: project directory %q is not a directory", resolved)
	}
	return resolved, nil
}

func validateProgram(program Program) error {
	if strings.TrimSpace(program.ProjectID) == "" || program.ProjectID != strings.TrimSpace(program.ProjectID) {
		return errors.New("runner: program project ID is invalid")
	}
	if program.Revision < 1 {
		return errors.New("runner: program revision is invalid")
	}
	if !utf8.ValidString(program.Code) {
		return errors.New("runner: program code is not valid UTF-8")
	}
	return nil
}

type artifact struct {
	path         string
	relativePath string
}

func createArtifact(directory string, code string) (created artifact, resultErr error) {
	file, err := os.CreateTemp(directory, ".setta-ai-run-*.py")
	if err != nil {
		return artifact{}, fmt.Errorf("runner: create generated Python artifact: %w", err)
	}
	path := file.Name()
	fileOpen := true
	committed := false
	defer func() {
		if committed {
			return
		}
		var cleanupErr error
		if fileOpen {
			cleanupErr = file.Close()
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			cleanupErr = errors.Join(cleanupErr, err)
		}
		if cleanupErr != nil {
			resultErr = errors.Join(
				resultErr,
				fmt.Errorf("runner: clean up incomplete generated Python artifact: %w", cleanupErr),
			)
		}
	}()
	if err := file.Chmod(0o600); err != nil {
		return artifact{}, fmt.Errorf("runner: protect generated Python artifact: %w", err)
	}
	if _, err := io.WriteString(file, code); err != nil {
		return artifact{}, fmt.Errorf("runner: write generated Python artifact: %w", err)
	}
	if err := file.Sync(); err != nil {
		return artifact{}, fmt.Errorf("runner: sync generated Python artifact: %w", err)
	}
	closeErr := file.Close()
	fileOpen = false
	if closeErr != nil {
		return artifact{}, fmt.Errorf("runner: close generated Python artifact: %w", closeErr)
	}
	committed = true
	return artifact{path: path, relativePath: filepath.Base(path)}, nil
}

func (artifact artifact) remove() error {
	if artifact.path == "" {
		return nil
	}
	if err := os.Chmod(artifact.path, 0o600); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Remove(artifact.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

type outputCapture struct {
	bytes     []byte
	truncated bool
	err       error
}

func captureOutput(reader io.Reader, limit int, reached chan<- struct{}) <-chan outputCapture {
	result := make(chan outputCapture, 1)
	go func() {
		defer close(result)
		var output bytes.Buffer
		buffer := make([]byte, 32*1024)
		truncated := false
		for {
			count, err := reader.Read(buffer)
			if count > 0 {
				remaining := limit - output.Len()
				if remaining > 0 {
					kept := count
					if kept > remaining {
						kept = remaining
					}
					_, _ = output.Write(buffer[:kept])
					if kept != count {
						truncated = true
						signalOutputLimit(reached)
					}
				} else {
					truncated = true
					signalOutputLimit(reached)
				}
			}
			if err != nil {
				if errors.Is(err, io.EOF) {
					result <- outputCapture{bytes: output.Bytes(), truncated: truncated}
				} else {
					result <- outputCapture{bytes: output.Bytes(), truncated: truncated, err: err}
				}
				return
			}
		}
	}()
	return result
}

func signalOutputLimit(reached chan<- struct{}) {
	select {
	case reached <- struct{}{}:
	default:
	}
}

func buildResult(program Program, stdout outputCapture, stderr outputCapture, waitErr error, termination TerminationReason, elapsed time.Duration) (Result, error) {
	result := Result{
		ProjectID:       program.ProjectID,
		Revision:        program.Revision,
		Stdout:          strings.ToValidUTF8(string(stdout.bytes), "\uFFFD"),
		Stderr:          strings.ToValidUTF8(string(stderr.bytes), "\uFFFD"),
		StdoutTruncated: stdout.truncated,
		StderrTruncated: stderr.truncated,
		Termination:     termination,
		Elapsed:         elapsed,
	}
	if result.Termination == "" {
		result.Termination = TerminationExited
	}
	if waitErr != nil {
		var exitError *exec.ExitError
		if !errors.As(waitErr, &exitError) {
			return Result{}, fmt.Errorf("runner: wait for generated Python: %w", waitErr)
		}
	}
	// Runner-enforced terminations are authoritative. In particular, Windows
	// can report a numeric TerminateProcess status after a timeout or output
	// limit, but the public contract deliberately exposes no Python exit code
	// for an interrupted program.
	if result.Termination != TerminationExited {
		return result, nil
	}
	if waitErr == nil {
		zero := 0
		result.ExitCode = &zero
		return result, nil
	}
	if exitError, ok := waitErr.(*exec.ExitError); ok {
		exitCode := exitError.ExitCode()
		if exitCode >= 0 {
			result.ExitCode = &exitCode
			return result, nil
		}
	}
	result.Termination = TerminationSignaled
	return result, nil
}

var _ Runtime = (*Service)(nil)
