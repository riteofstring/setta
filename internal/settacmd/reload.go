package settacmd

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultReloadPollInterval = 500 * time.Millisecond
	defaultReloadStopTimeout  = 5 * time.Second
)

var (
	errReloadSourceCheckoutRequired = errors.New("--reload requires a source checkout rooted at the Setta repository")

	reloadSourceDirectories = []string{
		"cmd",
		"internal",
	}
	reloadSourceFiles = []string{
		"go.mod",
		"go.sum",
		"scripts/go.sh",
		"scripts/go_version.txt",
	}
)

type reloadPoller interface {
	Events() <-chan struct{}
	Errs() <-chan error
	Close() error
}

type reloadProcess interface {
	Done() <-chan error
	Stop(time.Duration) error
}

type reloadLoopDependencies struct {
	resolveCheckoutRoot func(string) (string, error)
	newPoller           func(string, time.Duration) (reloadPoller, error)
	buildServerBinary   func(string) (string, error)
	startBinary         func(string, []string, io.Reader, io.Writer, io.Writer) (reloadProcess, error)
	cleanupBinary       func(string) error
	notifyContext       func(context.Context, ...os.Signal) (context.Context, context.CancelFunc)
	pollInterval        time.Duration
	stopTimeout         time.Duration
}

type reloadLoopRuntime struct {
	deps           reloadLoopDependencies
	poller         reloadPoller
	root           string
	stdin          io.Reader
	stdout         io.Writer
	stderr         io.Writer
	restartArgs    []string
	currentBinary  string
	currentProcess reloadProcess
}

func defaultReloadLoopDependencies() reloadLoopDependencies {
	return reloadLoopDependencies{
		resolveCheckoutRoot: resolveReloadSourceCheckoutRoot,
		newPoller:           newReloadSourcePoller,
		buildServerBinary:   buildReloadServerBinary,
		startBinary:         startReloadServerBinary,
		cleanupBinary:       cleanupReloadServerBinary,
		notifyContext:       signal.NotifyContext,
		pollInterval:        defaultReloadPollInterval,
		stopTimeout:         defaultReloadStopTimeout,
	}
}

func runDefaultStartReloadLoop(cwd string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
	return runReloadLoopWithDeps(cwd, args, stdin, stdout, stderr, defaultReloadLoopDependencies())
}

func runReloadLoopWithDeps(cwd string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer, deps reloadLoopDependencies) error {
	loop, err := newReloadLoopRuntime(cwd, args, stdin, stdout, stderr, deps)
	if err != nil {
		return err
	}
	defer func() {
		_ = loop.Close()
	}()
	signalCtx, stopSignals := deps.notifyContext(context.Background(), os.Interrupt)
	defer stopSignals()

	for {
		select {
		case <-signalCtx.Done():
			loop.stopCurrentProcessQuietly()
			return nil
		case err := <-loop.currentProcess.Done():
			return normalizeReloadProcessExit(err)
		case err := <-loop.poller.Errs():
			loop.stopCurrentProcessQuietly()
			return err
		case _, ok := <-loop.poller.Events():
			if !ok {
				loop.stopCurrentProcessQuietly()
				return fmt.Errorf("reload watcher closed")
			}
			if err := loop.handleSourceChange(); err != nil {
				return err
			}
		}
	}
}

func newReloadLoopRuntime(cwd string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer, deps reloadLoopDependencies) (*reloadLoopRuntime, error) {
	root, err := deps.resolveCheckoutRoot(cwd)
	if err != nil {
		return nil, err
	}

	poller, err := deps.newPoller(root, deps.pollInterval)
	if err != nil {
		return nil, err
	}

	loop := &reloadLoopRuntime{
		deps:        deps,
		poller:      poller,
		root:        root,
		stdin:       stdin,
		stdout:      stdout,
		stderr:      stderr,
		restartArgs: buildReloadRestartArgs(args),
	}
	if err := loop.startProcess(args); err != nil {
		_ = poller.Close()
		return nil, err
	}
	return loop, nil
}

func (loop *reloadLoopRuntime) Close() error {
	if loop == nil {
		return nil
	}
	if loop.poller != nil {
		_ = loop.poller.Close()
	}
	return loop.deps.cleanupBinary(loop.currentBinary)
}

func (loop *reloadLoopRuntime) handleSourceChange() error {
	nextBinary, err := loop.deps.buildServerBinary(loop.root)
	if err != nil {
		loop.writeBuildFailure(err)
		return nil
	}
	return loop.restartProcess(nextBinary)
}

func (loop *reloadLoopRuntime) restartProcess(nextBinary string) error {
	loop.writeRestartNotice()
	if err := loop.stopCurrentProcess(); err != nil {
		_ = loop.deps.cleanupBinary(nextBinary)
		return err
	}

	nextProcess, err := loop.deps.startBinary(nextBinary, loop.restartArgs, loop.stdin, loop.stdout, loop.stderr)
	if err != nil {
		_ = loop.deps.cleanupBinary(nextBinary)
		return err
	}

	previousBinary := loop.currentBinary
	loop.currentBinary = nextBinary
	loop.currentProcess = nextProcess
	_ = loop.deps.cleanupBinary(previousBinary)
	return nil
}

func (loop *reloadLoopRuntime) startProcess(args []string) error {
	binaryPath, err := loop.deps.buildServerBinary(loop.root)
	if err != nil {
		return err
	}
	process, err := loop.deps.startBinary(binaryPath, args, loop.stdin, loop.stdout, loop.stderr)
	if err != nil {
		_ = loop.deps.cleanupBinary(binaryPath)
		return err
	}
	loop.currentBinary = binaryPath
	loop.currentProcess = process
	return nil
}

func (loop *reloadLoopRuntime) stopCurrentProcess() error {
	if loop == nil {
		return nil
	}
	return loop.currentProcess.Stop(loop.deps.stopTimeout)
}

func (loop *reloadLoopRuntime) stopCurrentProcessQuietly() {
	_ = loop.stopCurrentProcess()
}

func (loop *reloadLoopRuntime) writeBuildFailure(err error) {
	if loop == nil || loop.stderr == nil {
		return
	}
	_, _ = fmt.Fprintf(loop.stderr, "Setta reload build failed; keeping current server running: %v\n", err)
}

func (loop *reloadLoopRuntime) writeRestartNotice() {
	if loop == nil || loop.stderr == nil {
		return
	}
	_, _ = fmt.Fprintln(loop.stderr, "Source change detected; restarting Setta server...")
}

func resolveReloadSourceCheckoutRoot(start string) (string, error) {
	if strings.TrimSpace(start) == "" {
		return "", errReloadSourceCheckoutRequired
	}
	current, err := filepath.Abs(start)
	if err != nil {
		return "", fmt.Errorf("resolve reload working directory: %w", err)
	}

	for {
		if reloadSourceCheckoutRoot(current) {
			return current, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return "", errReloadSourceCheckoutRequired
}

func reloadSourceCheckoutRoot(root string) bool {
	for _, rel := range []string{
		"go.mod",
		"scripts/go.sh",
		"cmd/setta/main.go",
		"cmd/setta-server/main.go",
	} {
		info, err := os.Stat(filepath.Join(root, filepath.FromSlash(rel)))
		if err != nil || info.IsDir() {
			return false
		}
	}
	return true
}

func buildReloadRestartArgs(args []string) []string {
	next := append([]string(nil), args...)
	for _, arg := range next {
		if strings.TrimSpace(arg) == "--no-open" {
			return next
		}
	}
	return append(next, "--no-open")
}

type reloadSourcePoller struct {
	events chan struct{}
	errs   chan error
	done   chan struct{}
	wg     sync.WaitGroup
}

func newReloadSourcePoller(root string, interval time.Duration) (reloadPoller, error) {
	if interval <= 0 {
		interval = defaultReloadPollInterval
	}
	initialSignature, err := computeReloadSourceSignature(root)
	if err != nil {
		return nil, err
	}

	poller := &reloadSourcePoller{
		events: make(chan struct{}, 1),
		errs:   make(chan error, 1),
		done:   make(chan struct{}),
	}
	poller.wg.Add(1)
	go func() {
		defer poller.wg.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		lastSignature := initialSignature
		for {
			select {
			case <-ticker.C:
				nextSignature, err := computeReloadSourceSignature(root)
				if err != nil {
					select {
					case poller.errs <- err:
					default:
					}
					return
				}
				if nextSignature == lastSignature {
					continue
				}
				lastSignature = nextSignature
				select {
				case poller.events <- struct{}{}:
				default:
				}
			case <-poller.done:
				return
			}
		}
	}()
	return poller, nil
}

func (p *reloadSourcePoller) Events() <-chan struct{} {
	return p.events
}

func (p *reloadSourcePoller) Errs() <-chan error {
	return p.errs
}

func (p *reloadSourcePoller) Close() error {
	if p == nil {
		return nil
	}
	close(p.done)
	p.wg.Wait()
	return nil
}

func computeReloadSourceSignature(root string) (string, error) {
	hasher := sha256.New()
	for _, rel := range reloadSourceFiles {
		if err := appendReloadSourceFileSignature(hasher, root, rel); err != nil {
			return "", err
		}
	}

	for _, rel := range reloadSourceDirectories {
		if err := appendReloadSourceDirectorySignature(hasher, root, rel); err != nil {
			return "", err
		}
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
}

func appendReloadSourceFileSignature(hasher hash.Hash, root string, rel string) error {
	absolute := filepath.Join(root, filepath.FromSlash(rel))
	info, err := os.Stat(absolute)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat reload source file %s: %w", rel, err)
	}
	if info.IsDir() {
		return nil
	}
	appendReloadPathState(hasher, rel, info)
	return nil
}

func appendReloadSourceDirectorySignature(hasher hash.Hash, root string, rel string) error {
	absolute := filepath.Join(root, filepath.FromSlash(rel))
	if _, err := os.Stat(absolute); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat reload source directory %s: %w", rel, err)
	}
	if err := filepath.WalkDir(absolute, func(path string, d fs.DirEntry, walkErr error) error {
		return appendReloadWalkEntry(hasher, root, path, d, walkErr)
	}); err != nil {
		return fmt.Errorf("walk reload source directory %s: %w", rel, err)
	}
	return nil
}

func appendReloadWalkEntry(hasher hash.Hash, root string, path string, d fs.DirEntry, walkErr error) error {
	if walkErr != nil {
		return walkErr
	}
	if d.IsDir() || filepath.Ext(d.Name()) != ".go" {
		return nil
	}
	info, err := d.Info()
	if err != nil {
		return err
	}
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return err
	}
	appendReloadPathState(hasher, filepath.ToSlash(relative), info)
	return nil
}

func appendReloadPathState(hasher hash.Hash, rel string, info fs.FileInfo) {
	_, _ = hasher.Write([]byte(rel))
	_, _ = hasher.Write([]byte{0})
	_, _ = hasher.Write([]byte(strconv.FormatInt(info.Size(), 10)))
	_, _ = hasher.Write([]byte{0})
	_, _ = hasher.Write([]byte(strconv.FormatInt(info.ModTime().UnixNano(), 10)))
	_, _ = hasher.Write([]byte{0})
}

func buildReloadServerBinary(root string) (string, error) {
	tempDir, err := os.MkdirTemp("", "setta-server-reload-*")
	if err != nil {
		return "", fmt.Errorf("create reload temp directory: %w", err)
	}
	binaryName := "setta-server"
	if runtime.GOOS == "windows" {
		binaryName += ".exe"
	}
	outputPath := filepath.Join(tempDir, binaryName)
	command := exec.Command(filepath.Join(root, "scripts", "go.sh"), "build", "-o", outputPath, "./cmd/setta-server")
	command.Dir = root
	var combined bytes.Buffer
	command.Stdout = &combined
	command.Stderr = &combined
	if err := command.Run(); err != nil {
		_ = os.RemoveAll(tempDir)
		output := strings.TrimSpace(combined.String())
		if output == "" {
			return "", fmt.Errorf("build reloadable setta-server: %w", err)
		}
		return "", fmt.Errorf("build reloadable setta-server: %w\n%s", err, output)
	}
	return outputPath, nil
}

func cleanupReloadServerBinary(path string) error {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return nil
	}
	return os.RemoveAll(filepath.Dir(trimmed))
}

type execReloadProcess struct {
	wait chan error
	cmd  *exec.Cmd
}

func startReloadServerBinary(binaryPath string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) (reloadProcess, error) {
	command := exec.Command(binaryPath, args...)
	command.Stdin = stdin
	command.Stdout = stdout
	command.Stderr = stderr
	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start reloadable setta-server: %w", err)
	}

	process := &execReloadProcess{
		wait: make(chan error, 1),
		cmd:  command,
	}
	go func() {
		process.wait <- command.Wait()
		close(process.wait)
	}()
	return process, nil
}

func (p *execReloadProcess) Done() <-chan error {
	return p.wait
}

func (p *execReloadProcess) Stop(timeout time.Duration) error {
	if p == nil || p.cmd == nil || p.cmd.Process == nil {
		return nil
	}
	if timeout <= 0 {
		timeout = defaultReloadStopTimeout
	}
	_ = p.cmd.Process.Signal(os.Interrupt)
	select {
	case <-p.wait:
		return nil
	case <-time.After(timeout):
		_ = p.cmd.Process.Kill()
		<-p.wait
		return nil
	}
}

func normalizeReloadProcessExit(err error) error {
	if err == nil {
		return nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return &ExitError{Code: exitErr.ExitCode(), Silent: true}
	}
	return fmt.Errorf("reloadable setta-server exited: %w", err)
}
