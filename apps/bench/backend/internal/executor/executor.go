package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/setta/bench/backend/internal/contracts"
)

const (
	maximumStdoutBytes = 1 << 20
	maximumStderrBytes = 1 << 20
	maximumMessages    = 64
	terminationDrain   = 500 * time.Millisecond
)

type ProgressFunc func(float64, string)

type Request struct {
	ProjectRoot     string
	RunID           string
	Case            contracts.CaseV1
	Candidate       contracts.CandidateV1
	OutputDirectory string
	Timeout         time.Duration
	Progress        ProgressFunc
}

type Result struct {
	Status          string
	Output          json.RawMessage
	Observations    []contracts.ObservationV1
	Artifacts       []contracts.CandidateArtifactV1
	Stderr          string
	StderrTruncated bool
	Duration        time.Duration
	Error           *contracts.StructuredErrorV1
}

type capture struct {
	content   []byte
	truncated bool
	err       error
}

type executionProcess struct {
	command *exec.Cmd
	owner   ownedProcess
	stdout  *os.File
	stderr  *os.File
}

type executionOutcome struct {
	waitErr        error
	termination    string
	terminationErr error
	finalizeErr    error
	protocol       protocolCapture
	stderr         capture
}

func Preflight(projectRoot string, candidate contracts.CandidateV1) error {
	if strings.TrimSpace(projectRoot) == "" || !filepath.IsAbs(projectRoot) {
		return errors.New("executor: project root is invalid")
	}
	if err := candidate.Validate(); err != nil {
		return err
	}
	workingDirectory, err := resolveWorkingDirectory(projectRoot, candidate.Command.WorkingDirectory)
	if err != nil {
		return err
	}
	_, err = resolveExecutable(workingDirectory, candidate.Command.Argv[0])
	return err
}

func Execute(parent context.Context, request Request) Result {
	started := time.Now()
	result := Result{Status: "failed", Output: json.RawMessage("null"), Observations: []contracts.ObservationV1{}, Artifacts: []contracts.CandidateArtifactV1{}}
	if err := validateRequest(request); err != nil {
		result.Error = failure("invalid_execution", err)
		return result
	}
	ctx, cancel := context.WithTimeout(normalizeContext(parent), request.Timeout)
	defer cancel()
	process, startFailure := startExecution(request)
	if startFailure != nil {
		result.Error = startFailure
		return result
	}
	outcome := process.wait(ctx, request.Progress)
	result.Stderr = validUTF8(outcome.stderr.content)
	result.StderrTruncated = outcome.stderr.truncated
	result.Duration = time.Since(started)
	return resolveExecution(result, outcome)
}

func startExecution(request Request) (*executionProcess, *contracts.StructuredErrorV1) {
	command, err := prepareCommand(request)
	if err != nil {
		return nil, failure("command_unavailable", err)
	}
	stdout, stdoutWriter, err := os.Pipe()
	if err != nil {
		return nil, failure("command_start_failed", err)
	}
	stderr, stderrWriter, err := os.Pipe()
	if err != nil {
		_ = stdout.Close()
		_ = stdoutWriter.Close()
		return nil, failure("command_start_failed", err)
	}
	command.Stdout = stdoutWriter
	command.Stderr = stderrWriter
	command, owner, err := startOwned(command)
	stdoutWriterCloseErr := stdoutWriter.Close()
	stderrWriterCloseErr := stderrWriter.Close()
	if err != nil {
		_ = stdout.Close()
		_ = stderr.Close()
		return nil, failure("command_start_failed", errors.Join(err, stdoutWriterCloseErr, stderrWriterCloseErr))
	}
	if stdoutWriterCloseErr != nil || stderrWriterCloseErr != nil {
		_ = owner.Terminate()
		_ = command.Wait()
		_ = owner.Finalize()
		_ = stdout.Close()
		_ = stderr.Close()
		return nil, failure("command_start_failed", errors.Join(stdoutWriterCloseErr, stderrWriterCloseErr))
	}
	return &executionProcess{command: command, owner: owner, stdout: stdout, stderr: stderr}, nil
}

func (process *executionProcess) wait(ctx context.Context, progress ProgressFunc) executionOutcome {
	protocolViolation := make(chan error, 1)
	protocolResult := streamMessages(process.stdout, progress, protocolViolation)
	stderrResult := captureStream(process.stderr, maximumStderrBytes, nil)
	waitResult := make(chan error, 1)
	go func() { waitResult <- process.command.Wait() }()
	waitErr, termination, terminationErr := waitForCommand(ctx, process.owner, process.command, waitResult, protocolViolation)
	finalizeErr := process.owner.Finalize()
	if termination != "" {
		_ = process.stdout.Close()
		_ = process.stderr.Close()
	}
	return executionOutcome{
		waitErr: waitErr, termination: termination, terminationErr: terminationErr, finalizeErr: finalizeErr,
		protocol: waitProtocol(protocolResult), stderr: waitCapture(stderrResult),
	}
}

func resolveExecution(result Result, outcome executionOutcome) Result {
	if outcome.finalizeErr != nil {
		result.Error = failure("containment_cleanup_failed", outcome.finalizeErr)
		return result
	}
	if outcome.stderr.err != nil {
		result.Error = failure("output_capture_failed", outcome.stderr.err)
		return result
	}
	if outcome.termination != "" {
		return resolveTermination(result, outcome.termination, outcome.terminationErr)
	}
	if outcome.protocol.err != nil {
		result.Error = protocolFailure(outcome.protocol.err)
		return result
	}
	protocol := outcome.protocol.parsed
	if protocol.failure != nil {
		result.Error = protocol.failure
		return result
	}
	if outcome.waitErr != nil {
		result.Error = failure("candidate_exit", fmt.Errorf("candidate exited unsuccessfully: %w", outcome.waitErr))
		return result
	}
	result.Status = "succeeded"
	result.Output = protocol.result.Output
	result.Observations = protocol.result.Observations
	result.Artifacts = protocol.result.Artifacts
	return result
}

func resolveTermination(result Result, termination string, cause error) Result {
	switch termination {
	case "timed_out":
		result.Status = termination
		result.Error = &contracts.StructuredErrorV1{Code: "execution_timed_out", Message: "The candidate execution exceeded its timeout."}
	case "canceled":
		result.Status = termination
		result.Error = &contracts.StructuredErrorV1{Code: "execution_canceled", Message: "The candidate execution was canceled."}
	case "protocol":
		result.Error = protocolFailure(cause)
	default:
		result.Error = &contracts.StructuredErrorV1{Code: "execution_failed", Message: "The candidate execution could not be terminated safely."}
	}
	return result
}

func protocolFailure(cause error) *contracts.StructuredErrorV1 {
	if errors.Is(cause, errProtocolOutputLimit) {
		return &contracts.StructuredErrorV1{Code: "protocol_output_limit", Message: "The candidate protocol output exceeded its byte limit."}
	}
	return failure("protocol_error", cause)
}

func validateRequest(request Request) error {
	if strings.TrimSpace(request.ProjectRoot) == "" || !filepath.IsAbs(request.ProjectRoot) || !contracts.ValidID(request.RunID) || request.Timeout <= 0 {
		return errors.New("executor: request identity is invalid")
	}
	if err := request.Case.Validate(); err != nil {
		return err
	}
	if err := request.Candidate.Validate(); err != nil {
		return err
	}
	if !filepath.IsAbs(request.OutputDirectory) {
		return errors.New("executor: output directory must be absolute")
	}
	return nil
}

func prepareCommand(request Request) (*exec.Cmd, error) {
	workingDirectory, err := resolveWorkingDirectory(request.ProjectRoot, request.Candidate.Command.WorkingDirectory)
	if err != nil {
		return nil, err
	}
	executable, err := resolveExecutable(workingDirectory, request.Candidate.Command.Argv[0])
	if err != nil {
		return nil, err
	}
	protocolRequest := contracts.CandidateRequestV1{
		ProtocolVersion: contracts.CandidateProtocolVersion, RunID: request.RunID,
		Case:            contracts.CandidateCaseV1{ID: request.Case.ID, Name: request.Case.Name, Input: request.Case.Input, Expected: request.Case.Expected},
		OutputDirectory: request.OutputDirectory,
	}
	if err := protocolRequest.Validate(); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(protocolRequest)
	if err != nil {
		return nil, err
	}
	command := exec.Command(executable, request.Candidate.Command.Argv[1:]...)
	command.Dir = workingDirectory
	command.Env = append(os.Environ(), "SETTA_BENCH_PROTOCOL="+contracts.CandidateProtocolVersion)
	command.Stdin = bytes.NewReader(append(encoded, '\n'))
	return command, nil
}

func resolveWorkingDirectory(root string, relative string) (string, error) {
	canonicalRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", fmt.Errorf("executor: resolve project root: %w", err)
	}
	candidate := filepath.Join(canonicalRoot, filepath.FromSlash(relative))
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		return "", fmt.Errorf("executor: resolve working directory: %w", err)
	}
	relation, err := filepath.Rel(canonicalRoot, resolved)
	if err != nil || filepath.IsAbs(relation) || relation == ".." || strings.HasPrefix(relation, ".."+string(filepath.Separator)) {
		return "", errors.New("executor: working directory escapes the project root")
	}
	entry, err := os.Stat(resolved)
	if err != nil || !entry.IsDir() {
		return "", errors.New("executor: working directory is unavailable")
	}
	return resolved, nil
}

func resolveExecutable(directory string, value string) (string, error) {
	if filepath.IsAbs(value) {
		return requireExecutable(value)
	}
	if strings.ContainsRune(value, filepath.Separator) || filepath.Separator != '/' && strings.ContainsRune(value, '/') {
		return requireExecutable(filepath.Join(directory, filepath.FromSlash(value)))
	}
	resolved, err := exec.LookPath(value)
	if err != nil {
		return "", err
	}
	return requireExecutable(resolved)
}

func requireExecutable(path string) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	entry, err := os.Stat(absolute)
	if err != nil || !entry.Mode().IsRegular() || !platformExecutable(entry.Mode()) {
		return "", errors.New("executor: executable is unavailable, non-regular, or not executable")
	}
	return absolute, nil
}

func waitForCommand(ctx context.Context, owner ownedProcess, command *exec.Cmd, waited <-chan error, protocolViolation <-chan error) (error, string, error) {
	select {
	case err := <-waited:
		return err, "", nil
	case <-ctx.Done():
		terminationErr := owner.Terminate()
		err := boundedWait(command, waited)
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return err, "timed_out", terminationErr
		}
		return err, "canceled", terminationErr
	case protocolErr := <-protocolViolation:
		terminationErr := owner.Terminate()
		return boundedWait(command, waited), "protocol", errors.Join(protocolErr, terminationErr)
	}
}

func boundedWait(command *exec.Cmd, waited <-chan error) error {
	select {
	case err := <-waited:
		return err
	case <-time.After(terminationDrain):
		if command != nil && command.Process != nil {
			_ = command.Process.Kill()
		}
		return <-waited
	}
}

func captureStream(reader io.Reader, maximum int, limit chan<- struct{}) <-chan capture {
	result := make(chan capture, 1)
	go func() {
		var buffer bytes.Buffer
		chunk := make([]byte, 32*1024)
		captured := capture{}
		for {
			count, err := reader.Read(chunk)
			if count > 0 {
				remaining := maximum - buffer.Len()
				if remaining > 0 {
					kept := count
					if kept > remaining {
						kept = remaining
					}
					_, _ = buffer.Write(chunk[:kept])
				}
				if count > remaining {
					captured.truncated = true
					if limit != nil {
						select {
						case limit <- struct{}{}:
						default:
						}
					}
				}
			}
			if err != nil {
				if !errors.Is(err, io.EOF) && !errors.Is(err, os.ErrClosed) {
					captured.err = err
				}
				break
			}
		}
		captured.content = buffer.Bytes()
		result <- captured
	}()
	return result
}

func waitCapture(result <-chan capture) capture {
	select {
	case captured := <-result:
		return captured
	case <-time.After(terminationDrain):
		return capture{err: errors.New("executor: output pipe did not close")}
	}
}

func waitProtocol(result <-chan protocolCapture) protocolCapture {
	select {
	case captured := <-result:
		return captured
	case <-time.After(terminationDrain):
		return protocolCapture{err: errors.New("executor: protocol pipe did not close")}
	}
}

func normalizeContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func failure(code string, err error) *contracts.StructuredErrorV1 {
	message := err.Error()
	if len(message) > 4096 {
		message = message[:4096]
	}
	return &contracts.StructuredErrorV1{Code: code, Message: validUTF8([]byte(message))}
}

func validUTF8(value []byte) string {
	if utf8.Valid(value) {
		return string(value)
	}
	return strings.ToValidUTF8(string(value), "�")
}
