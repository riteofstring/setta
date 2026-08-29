package runner

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"
)

const terminationDrainTimeout = 250 * time.Millisecond

type runSetup struct {
	context  context.Context
	timeout  time.Duration
	artifact artifact
}

func (service *Service) prepareRun(ctx context.Context, program Program, request Request) (runSetup, error) {
	if service == nil {
		return runSetup{}, errors.New("runner: service is required")
	}
	ctx = normalizedRunContext(ctx)
	if err := ctx.Err(); err != nil {
		return runSetup{}, err
	}
	if err := validateProgram(program); err != nil {
		return runSetup{}, err
	}
	timeout, err := service.runTimeout(request)
	if err != nil {
		return runSetup{}, err
	}
	generatedArtifact, err := createArtifact(service.projectDirectory, program.Code)
	if err != nil {
		return runSetup{}, err
	}
	return runSetup{context: ctx, timeout: timeout, artifact: generatedArtifact}, nil
}

func normalizedRunContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func (service *Service) runTimeout(request Request) (time.Duration, error) {
	timeout := service.defaultTimeout
	if request.Timeout != 0 {
		timeout = request.Timeout
	}
	if timeout <= 0 {
		return 0, ErrInvalidTimeout
	}
	return timeout, nil
}

func (service *Service) cleanupArtifact(generatedArtifact artifact, result *Result, runErr *error) {
	remove := service.removeArtifact
	if remove == nil {
		remove = func(value artifact) error { return value.remove() }
	}
	if err := remove(generatedArtifact); err != nil {
		cleanupErr := fmt.Errorf("runner: remove generated Python artifact: %w", err)
		if *runErr == nil {
			*result = Result{}
			*runErr = cleanupErr
			return
		}
		*runErr = errors.Join(*runErr, cleanupErr)
	}
}

func (service *Service) executeRun(setup runSetup, program Program) (result Result, runErr error) {
	execution, err := service.startExecution(setup.artifact)
	if err != nil {
		return Result{}, err
	}
	defer cleanupExecution(execution.owner, execution.cleanupLaunch, &result, &runErr)
	timer := time.NewTimer(setup.timeout)
	defer timer.Stop()
	monitor := newExecutionMonitor(execution, timer, setup.context)
	stdoutCapture, stderrCapture, waitErr := monitor.wait()
	if err := errors.Join(outputCaptureError(stdoutCapture, stderrCapture), monitor.resultError()); err != nil {
		return Result{}, err
	}
	result, err = buildResult(program, stdoutCapture, stderrCapture, waitErr, monitor.termination.reason, time.Since(execution.started))
	if err != nil {
		return Result{}, err
	}
	return result, nil
}

type startedExecution struct {
	command       *exec.Cmd
	owner         ownedProcess
	cleanupLaunch func() error
	started       time.Time
	pipes         outputPipes
	limitReached  chan struct{}
	stdoutResult  <-chan outputCapture
	stderrResult  <-chan outputCapture
}

type outputPipes struct {
	stdout io.Closer
	stderr io.Closer
}

func (pipes outputPipes) Close() {
	if pipes.stdout != nil {
		_ = pipes.stdout.Close()
	}
	if pipes.stderr != nil {
		_ = pipes.stderr.Close()
	}
}

func (service *Service) startExecution(generatedArtifact artifact) (startedExecution, error) {
	launch, err := prepareProcessLaunch(
		service.interpreter,
		generatedArtifact.relativePath,
		service.projectDirectory,
		service.environment,
	)
	if err != nil {
		return startedExecution{}, err
	}
	command := launch.command
	if command == nil {
		return startedExecution{}, cleanupLaunchError(errors.New("runner: generated Python command is unavailable"), launch)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		return startedExecution{}, cleanupLaunchError(fmt.Errorf("runner: create stdout pipe: %w", err), launch)
	}
	stderr, err := command.StderrPipe()
	if err != nil {
		_ = stdout.Close()
		return startedExecution{}, cleanupLaunchError(fmt.Errorf("runner: create stderr pipe: %w", err), launch)
	}
	pipes := outputPipes{stdout: stdout, stderr: stderr}
	owner, err := startOwnedProcess(launch)
	if err != nil {
		pipes.Close()
		return startedExecution{}, cleanupLaunchError(err, launch)
	}
	if err := launch.activateAfterOwnership(); err != nil {
		pipes.Close()
		return startedExecution{}, cleanupLaunchError(cleanupActivationError(err, command, owner), launch)
	}
	started := time.Now()
	limitReached := make(chan struct{}, 2)
	stdoutResult := captureOutput(stdout, service.outputLimit, limitReached)
	stderrResult := captureOutput(stderr, service.outputLimit, limitReached)
	return startedExecution{
		command:       command,
		owner:         owner,
		cleanupLaunch: launch.cleanup,
		started:       started,
		pipes:         pipes,
		limitReached:  limitReached,
		stdoutResult:  stdoutResult,
		stderrResult:  stderrResult,
	}, nil
}

type processLaunch struct {
	command  *exec.Cmd
	newOwner func(*exec.Cmd) (ownedProcess, error)
	activate func() error
	cleanup  func() error
}

func (launch processLaunch) activateAfterOwnership() error {
	if launch.activate == nil {
		return nil
	}
	return launch.activate()
}

func cleanupLaunchError(cause error, launch processLaunch) error {
	if launch.cleanup == nil {
		return cause
	}
	if err := launch.cleanup(); err != nil {
		return errors.Join(cause, fmt.Errorf("runner: clean up generated Python launch resources: %w", err))
	}
	return cause
}

func cleanupExecution(owner ownedProcess, cleanupLaunch func() error, result *Result, runErr *error) {
	cleanupOwnedProcess(owner, result, runErr)
	if cleanupLaunch != nil {
		if err := cleanupLaunch(); err != nil {
			cleanupResult(result, runErr, fmt.Errorf("runner: clean up generated Python launch resources: %w", err))
		}
	}
}

func cleanupActivationError(cause error, command *exec.Cmd, owner ownedProcess) error {
	var cleanup []error
	if err := stopOwnedProcess(command, owner); err != nil {
		cleanup = append(cleanup, err)
	}
	if err := cleanupStartedCommand(command); err != nil {
		cleanup = append(cleanup, fmt.Errorf("runner: reap generated Python guardian: %w", err))
	}
	if owner != nil {
		if err := owner.finalize(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("runner: finalize generated Python guardian: %w", err))
		}
	}
	return errors.Join(append([]error{fmt.Errorf("runner: release generated Python guardian: %w", cause)}, cleanup...)...)
}

func cleanupOwnedProcess(owner ownedProcess, result *Result, runErr *error) {
	if owner == nil {
		cleanupResult(result, runErr, errors.New("runner: finalize generated Python process tree: owner is unavailable"))
		return
	}
	if err := owner.finalize(); err != nil {
		cleanupResult(result, runErr, fmt.Errorf("runner: finalize generated Python process tree: %w", err))
	}
}

func cleanupResult(result *Result, runErr *error, cleanupErr error) {
	if *runErr == nil {
		*result = Result{}
		*runErr = cleanupErr
		return
	}
	*runErr = errors.Join(*runErr, cleanupErr)
}

func outputCaptureError(stdout outputCapture, stderr outputCapture) error {
	var failures []error
	if stdout.err != nil {
		failures = append(failures, fmt.Errorf("runner: capture stdout: %w", stdout.err))
	}
	if stderr.err != nil {
		failures = append(failures, fmt.Errorf("runner: capture stderr: %w", stderr.err))
	}
	return errors.Join(failures...)
}

type executionMonitor struct {
	command          *exec.Cmd
	owner            ownedProcess
	closeOutputPipes func()
	stdoutResult     <-chan outputCapture
	stderrResult     <-chan outputCapture
	waitResult       <-chan error
	stdout           outputCapture
	stderr           outputCapture
	stdoutForced     bool
	stderrForced     bool
	limitReached     <-chan struct{}
	timeoutDone      <-chan time.Time
	drainDone        <-chan time.Time
	contextDone      <-chan struct{}
	context          context.Context
	timer            *time.Timer
	drainTimer       *time.Timer
	termination      terminationState
	canceled         error
	terminationErr   error
}

func newExecutionMonitor(execution startedExecution, timer *time.Timer, ctx context.Context) *executionMonitor {
	return &executionMonitor{
		command:          execution.command,
		owner:            execution.owner,
		closeOutputPipes: execution.pipes.Close,
		stdoutResult:     execution.stdoutResult,
		stderrResult:     execution.stderrResult,
		limitReached:     execution.limitReached,
		timeoutDone:      timer.C,
		contextDone:      ctx.Done(),
		context:          ctx,
		timer:            timer,
	}
}

func (monitor *executionMonitor) wait() (outputCapture, outputCapture, error) {
	for {
		select {
		case stdout := <-monitor.stdoutResult:
			monitor.acceptStdout(stdout)
		case stderr := <-monitor.stderrResult:
			monitor.acceptStderr(stderr)
		case waitErr := <-monitor.waitResult:
			return monitor.stdout, monitor.stderr, waitErr
		case <-monitor.limitReached:
			monitor.enforceTermination(TerminationOutputLimit)
		case <-monitor.timeoutDone:
			if waitErr, completed := monitor.completedAtDeadline(); completed {
				return monitor.stdout, monitor.stderr, waitErr
			}
			monitor.enforceTermination(TerminationTimedOut)
		case <-monitor.contextDone:
			monitor.canceled = monitor.context.Err()
			monitor.enforceTermination(TerminationSignaled)
		case <-monitor.drainDone:
			monitor.forceClosePendingOutput()
		}
	}
}

func (monitor *executionMonitor) acceptStdout(capture outputCapture) {
	monitor.stdout = normalizeForcedCapture(capture, monitor.stdoutForced)
	monitor.stdoutResult = nil
	monitor.stdoutForced = false
	monitor.enforceCaptureLimit(monitor.stdout)
	monitor.startWait()
}

func (monitor *executionMonitor) acceptStderr(capture outputCapture) {
	monitor.stderr = normalizeForcedCapture(capture, monitor.stderrForced)
	monitor.stderrResult = nil
	monitor.stderrForced = false
	monitor.enforceCaptureLimit(monitor.stderr)
	monitor.startWait()
}

func normalizeForcedCapture(capture outputCapture, forced bool) outputCapture {
	if !forced {
		return capture
	}
	// The runner intentionally closed this stream after the bounded drain grace.
	// Record the incomplete capture without treating that known close as an I/O
	// failure; unsolicited closed-pipe errors still remain observable.
	capture.truncated = true
	if errors.Is(capture.err, os.ErrClosed) || errors.Is(capture.err, io.ErrClosedPipe) {
		capture.err = nil
	}
	return capture
}

func (monitor *executionMonitor) enforceCaptureLimit(capture outputCapture) {
	if capture.truncated {
		monitor.enforceTermination(TerminationOutputLimit)
	}
}

func (monitor *executionMonitor) startWait() {
	if monitor.stdoutResult != nil || monitor.stderrResult != nil || monitor.waitResult != nil {
		return
	}
	monitor.stopDrainDeadline()
	result := make(chan error, 1)
	monitor.waitResult = result
	go func() { result <- monitor.command.Wait() }()
}

func (monitor *executionMonitor) completedAtDeadline() (error, bool) {
	monitor.timeoutDone = nil
	if monitor.waitResult == nil {
		return nil, false
	}
	select {
	case waitErr := <-monitor.waitResult:
		return waitErr, true
	default:
		return nil, false
	}
}

func (monitor *executionMonitor) enforceTermination(reason TerminationReason) {
	if !monitor.termination.enforce(reason) {
		return
	}
	monitor.contextDone = nil
	monitor.timeoutDone = nil
	monitor.limitReached = nil
	monitor.stopTimer()
	if err := stopOwnedProcess(monitor.command, monitor.owner); err != nil && monitor.terminationErr == nil {
		monitor.terminationErr = err
	}
	monitor.startDrainDeadline()
}

func (monitor *executionMonitor) startDrainDeadline() {
	if monitor.stdoutResult == nil && monitor.stderrResult == nil {
		monitor.startWait()
		return
	}
	if monitor.drainTimer != nil {
		return
	}
	monitor.drainTimer = time.NewTimer(terminationDrainTimeout)
	monitor.drainDone = monitor.drainTimer.C
}

func (monitor *executionMonitor) forceClosePendingOutput() {
	monitor.stopDrainDeadline()
	monitor.collectReadyOutput()
	if monitor.stdoutResult == nil && monitor.stderrResult == nil {
		return
	}
	monitor.stdoutForced = monitor.stdoutResult != nil
	monitor.stderrForced = monitor.stderrResult != nil
	monitor.closeOutputPipes()
}

func (monitor *executionMonitor) collectReadyOutput() {
	for monitor.stdoutResult != nil || monitor.stderrResult != nil {
		select {
		case stdout := <-monitor.stdoutResult:
			monitor.acceptStdout(stdout)
		case stderr := <-monitor.stderrResult:
			monitor.acceptStderr(stderr)
		default:
			return
		}
	}
}

func (monitor *executionMonitor) stopTimer() {
	if monitor.timer == nil || monitor.timer.Stop() {
		return
	}
	select {
	case <-monitor.timer.C:
	default:
	}
}

func (monitor *executionMonitor) stopDrainDeadline() {
	if monitor.drainTimer == nil {
		return
	}
	if !monitor.drainTimer.Stop() {
		select {
		case <-monitor.drainTimer.C:
		default:
		}
	}
	monitor.drainTimer = nil
	monitor.drainDone = nil
}

func (monitor *executionMonitor) resultError() error {
	if monitor.canceled == nil {
		return monitor.terminationErr
	}
	if monitor.terminationErr == nil {
		return monitor.canceled
	}
	return errors.Join(monitor.canceled, monitor.terminationErr)
}
