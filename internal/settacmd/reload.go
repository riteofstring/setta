package settacmd

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
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
	root, err := deps.resolveCheckoutRoot(cwd)
	if err != nil {
		return err
	}

	poller, err := deps.newPoller(root, deps.pollInterval)
	if err != nil {
		return err
	}
	defer func() {
		_ = poller.Close()
	}()

	currentBinary, err := deps.buildServerBinary(root)
	if err != nil {
		return err
	}
	defer func() {
		_ = deps.cleanupBinary(currentBinary)
	}()

	currentProcess, err := deps.startBinary(currentBinary, args, stdin, stdout, stderr)
	if err != nil {
		return err
	}

	restartArgs := buildReloadRestartArgs(args)
	signalCtx, stopSignals := deps.notifyContext(context.Background(), os.Interrupt)
	defer stopSignals()

	for {
		select {
		case <-signalCtx.Done():
			_ = currentProcess.Stop(deps.stopTimeout)
			return nil
		case err := <-currentProcess.Done():
			return normalizeReloadProcessExit(err)
		case err := <-poller.Errs():
			_ = currentProcess.Stop(deps.stopTimeout)
			return err
		case _, ok := <-poller.Events():
			if !ok {
				_ = currentProcess.Stop(deps.stopTimeout)
				return fmt.Errorf("reload watcher closed")
			}

			nextBinary, err := deps.buildServerBinary(root)
			if err != nil {
				if stderr != nil {
					_, _ = fmt.Fprintf(stderr, "Setta reload build failed; keeping current server running: %v\n", err)
				}
				continue
			}

			if stderr != nil {
				_, _ = fmt.Fprintln(stderr, "Source change detected; restarting Setta server...")
			}
			if err := currentProcess.Stop(deps.stopTimeout); err != nil {
				_ = deps.cleanupBinary(nextBinary)
				return err
			}

			nextProcess, err := deps.startBinary(nextBinary, restartArgs, stdin, stdout, stderr)
			if err != nil {
				_ = deps.cleanupBinary(nextBinary)
				return err
			}

			previousBinary := currentBinary
			currentBinary = nextBinary
			currentProcess = nextProcess
			_ = deps.cleanupBinary(previousBinary)
		}
	}
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
	appendPathState := func(rel string, info fs.FileInfo) {
		_, _ = hasher.Write([]byte(rel))
		_, _ = hasher.Write([]byte{0})
		_, _ = hasher.Write([]byte(strconv.FormatInt(info.Size(), 10)))
		_, _ = hasher.Write([]byte{0})
		_, _ = hasher.Write([]byte(strconv.FormatInt(info.ModTime().UnixNano(), 10)))
		_, _ = hasher.Write([]byte{0})
	}

	for _, rel := range reloadSourceFiles {
		absolute := filepath.Join(root, filepath.FromSlash(rel))
		info, err := os.Stat(absolute)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return "", fmt.Errorf("stat reload source file %s: %w", rel, err)
		}
		if info.IsDir() {
			continue
		}
		appendPathState(rel, info)
	}

	for _, rel := range reloadSourceDirectories {
		absolute := filepath.Join(root, filepath.FromSlash(rel))
		if _, err := os.Stat(absolute); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return "", fmt.Errorf("stat reload source directory %s: %w", rel, err)
		}
		if err := filepath.WalkDir(absolute, func(path string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if d.IsDir() {
				return nil
			}
			if filepath.Ext(d.Name()) != ".go" {
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
			appendPathState(filepath.ToSlash(relative), info)
			return nil
		}); err != nil {
			return "", fmt.Errorf("walk reload source directory %s: %w", rel, err)
		}
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
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
