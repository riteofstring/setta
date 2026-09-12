//go:build !windows

package terminal

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

const terminalGuardianWorkerInvocation = "--setta-terminal-guardian-worker"
const terminalGuardianSetsidChildInvocation = "--setta-terminal-guardian-setsid-child"
const terminalGuardianSetsidWorkerInvocation = "--setta-terminal-guardian-setsid-worker"

func init() {
	resolveTerminalGuardianInvocation = testTerminalGuardianInvocation
}

func TestTerminalGuardianProcess(t *testing.T) {
	arguments := terminalGuardianTestArguments(os.Args)
	if len(arguments) == 0 || arguments[0] != terminalGuardianInvocation {
		return
	}
	handled, err := RunPrivatePTYGuardian(arguments)
	if !handled {
		t.Fatal("terminal guardian helper invocation was not recognized")
	}
	if err != nil {
		t.Fatalf("run terminal guardian helper: %v", err)
	}
}

func TestTerminalGuardianWorkerProcess(t *testing.T) {
	arguments := terminalGuardianTestArguments(os.Args)
	if len(arguments) == 0 || (arguments[0] != terminalGuardianWorkerInvocation && arguments[0] != terminalGuardianSetsidWorkerInvocation) {
		return
	}
	if len(arguments) != 4 {
		t.Fatalf("terminal guardian worker arguments = %#v", arguments)
	}
	shell := arguments[3]
	command := []string{
		shell,
		"-c",
		`trap '' TERM
(trap '' TERM; while :; do sleep 1; done) &
background=$!
printf '%s %s\n' "$$" "$background" > "$1"
while :; do sleep 1; done`,
		"terminal-guardian-worker",
		arguments[2],
	}
	if arguments[0] == terminalGuardianSetsidWorkerInvocation {
		executable, err := os.Executable()
		if err != nil {
			t.Fatalf("resolve test executable: %v", err)
		}
		marker := arguments[2] + ".setsid"
		command = []string{
			shell,
			"-c",
			`trap '' TERM
"$2" -test.run=^TestTerminalGuardianSetsidChildProcess$ -- ` + terminalGuardianSetsidChildInvocation + ` "$3" &
background=$!
while [ ! -s "$3" ]; do sleep 0.01; done
printf '%s %s\n' "$$" "$background" > "$1"
while :; do sleep 1; done`,
			"terminal-guardian-setsid-worker",
			arguments[2],
			executable,
			marker,
		}
	}
	pty, err := openPTY(command, t.TempDir(), os.Environ(), 80, 24)
	if err != nil {
		t.Fatalf("open terminal PTY: %v", err)
	}
	if err := os.WriteFile(arguments[1], []byte(strconv.Itoa(os.Getpid())), 0o600); err != nil {
		_ = pty.Close()
		t.Fatalf("write worker PID: %v", err)
	}

	for {
		time.Sleep(time.Hour)
	}
}

func TestTerminalGuardianSetsidChildProcess(t *testing.T) {
	arguments := terminalGuardianTestArguments(os.Args)
	if len(arguments) == 0 || arguments[0] != terminalGuardianSetsidChildInvocation {
		return
	}
	if len(arguments) != 2 {
		t.Fatalf("terminal guardian setsid child arguments = %#v", arguments)
	}
	if _, err := unix.Setsid(); err != nil {
		if writeErr := os.WriteFile(arguments[1], []byte("blocked"), 0o600); writeErr != nil {
			t.Fatalf("write blocked setsid marker: %v", writeErr)
		}
		return
	}
	if err := os.WriteFile(arguments[1], []byte(strconv.Itoa(os.Getpid())), 0o600); err != nil {
		t.Fatalf("write setsid child PID: %v", err)
	}
	signal.Ignore(syscall.SIGTERM)
	for {
		time.Sleep(time.Hour)
	}
}

func testTerminalGuardianInvocation(shell []string) ([]string, error) {
	arguments, err := terminalGuardianArguments(shell)
	if err != nil {
		return nil, err
	}
	executable, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve test executable: %w", err)
	}
	invocation := []string{executable, "-test.run=^TestTerminalGuardianProcess$", "--"}
	return append(invocation, arguments...), nil
}

func terminalGuardianTestArguments(arguments []string) []string {
	for index, argument := range arguments {
		if argument == "--" {
			return append([]string(nil), arguments[index+1:]...)
		}
	}
	return nil
}

func TestTerminalGuardianTestArgumentsIgnoreOrdinaryTestFlags(t *testing.T) {
	arguments := terminalGuardianTestArguments([]string{"terminal.test", "-test.run=Test"})
	if arguments != nil {
		t.Fatalf("ordinary test arguments = %#v, want nil", arguments)
	}
	arguments = terminalGuardianTestArguments([]string{"terminal.test", "-test.run=Test", "--", terminalGuardianInvocation, "--", "/bin/sh"})
	if got := strings.Join(arguments, "|"); got != terminalGuardianInvocation+"|--|/bin/sh" {
		t.Fatalf("guardian test arguments = %q", got)
	}
}

func TestTerminalGuardianInvocationRequiresPrivateBoundary(t *testing.T) {
	for _, test := range []struct {
		name    string
		input   []string
		handled bool
		wantErr bool
		want    string
	}{
		{name: "unrelated", input: []string{"schema"}},
		{name: "missing boundary", input: []string{terminalGuardianInvocation, "/bin/sh"}, handled: true, wantErr: true},
		{name: "empty shell", input: []string{terminalGuardianInvocation, "--"}, handled: true, wantErr: true},
		{name: "nul shell", input: []string{terminalGuardianInvocation, "--", "/bin/sh\x00"}, handled: true, wantErr: true},
		{name: "valid", input: []string{terminalGuardianInvocation, "--", "/bin/sh", "-i"}, handled: true, want: "/bin/sh|-i"},
	} {
		t.Run(test.name, func(t *testing.T) {
			shell, handled, err := parseTerminalGuardianInvocation(test.input)
			if handled != test.handled {
				t.Fatalf("handled = %t, want %t", handled, test.handled)
			}
			if (err != nil) != test.wantErr {
				t.Fatalf("error = %v, want error %t", err, test.wantErr)
			}
			if got := strings.Join(shell, "|"); got != test.want {
				t.Fatalf("shell = %q, want %q", got, test.want)
			}
		})
	}
}

func TestTerminalGuardianPassesCWDAndEnvironmentWithoutMetadata(t *testing.T) {
	lifetimeReader, lifetimeWriter, err := os.Pipe()
	if err != nil {
		t.Fatalf("create lifetime pipe: %v", err)
	}
	t.Cleanup(func() {
		_ = lifetimeReader.Close()
		_ = lifetimeWriter.Close()
	})
	directory := filepath.Join(t.TempDir(), "terminal-工作目录")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatalf("create working directory: %v", err)
	}
	secret := "SETTA_GUARDIAN_TEST_SECRET=not-in-argv"
	shell := []string{"/bin/sh", "-c", "printf ignored", "terminal-雪"}
	command, err := newTerminalGuardianCommand(shell, directory, []string{"PATH=/bin", secret}, lifetimeReader)
	if err != nil {
		t.Fatalf("create guardian command: %v", err)
	}
	if command.Dir != directory {
		t.Fatalf("guardian directory = %q, want %q", command.Dir, directory)
	}
	if got := strings.Join(command.Env, "|"); got != "PATH=/bin|"+secret {
		t.Fatalf("guardian environment = %q", got)
	}
	metadata := strings.Join(command.Args, "\x00")
	for _, forbidden := range []string{directory, secret} {
		if strings.Contains(metadata, forbidden) {
			t.Fatalf("guardian metadata exposes %q: %q", forbidden, metadata)
		}
	}
	if !strings.Contains(metadata, "terminal-雪") {
		t.Fatalf("guardian metadata did not preserve non-ASCII shell argv: %q", metadata)
	}
}

func TestTerminalGuardianPreservesCWDEnvironmentAndNonASCIIArgument(t *testing.T) {
	shell := terminalGuardianShell(t)
	directory := filepath.Join(t.TempDir(), "terminal-工作目录")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatalf("create working directory: %v", err)
	}
	secret := "secret-环境"
	environment := terminalGuardianEnvironment("SETTA_GUARDIAN_TEST_SECRET", secret)
	pty, err := openPTY([]string{
		shell,
		"-c",
		`printf '__setta_guardian_context__%s|%s|%s\n' "$PWD" "$SETTA_GUARDIAN_TEST_SECRET" "$1"`,
		"terminal-guardian-context",
		"argument-雪",
	}, directory, environment, 80, 24)
	if err != nil {
		t.Fatalf("open terminal PTY: %v", err)
	}
	output, waitErr := readTerminalPTY(t, pty)
	if waitErr != nil {
		t.Fatalf("wait for terminal guardian: %v; output = %q", waitErr, output)
	}
	for _, value := range []string{directory, secret, "argument-雪"} {
		if !strings.Contains(output, value) {
			t.Fatalf("terminal output = %q, want %q", output, value)
		}
	}
}

func TestTerminalGuardianReapsBackgroundProcessAfterShellExit(t *testing.T) {
	shell := terminalGuardianShell(t)
	directory := t.TempDir()
	childPIDPath := filepath.Join(directory, "background.pid")
	pty, err := openPTY([]string{
		shell,
		"-c",
		`sleep 30 & child=$!; printf '%s\n' "$child" > "$1"; exit 0`,
		"terminal-guardian-background",
		childPIDPath,
	}, directory, os.Environ(), 80, 24)
	if err != nil {
		t.Fatalf("open terminal PTY: %v", err)
	}
	childPID := terminalGuardianPIDFile(t, childPIDPath, 1)[0]
	output, waitErr := readTerminalPTY(t, pty)
	if waitErr != nil {
		t.Fatalf("wait for terminal guardian: %v; output = %q", waitErr, output)
	}
	waitForTerminalProcessGone(t, childPID)
}

func TestTerminalGuardianReapsSetsidBackgroundProcessAfterShellExit(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Linux subreaper containment is required for setsid descendants")
	}
	shell := terminalGuardianShell(t)
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	directory := t.TempDir()
	childPIDPath := filepath.Join(directory, "setsid-background.pid")
	pty, err := openPTY([]string{
		shell,
		"-c",
		`"$1" -test.run=^TestTerminalGuardianSetsidChildProcess$ -- ` + terminalGuardianSetsidChildInvocation + ` "$2" & while [ ! -s "$2" ]; do sleep 0.01; done; exit 0`,
		"terminal-guardian-setsid-background",
		executable,
		childPIDPath,
	}, directory, os.Environ(), 80, 24)
	if err != nil {
		t.Fatalf("open terminal PTY: %v", err)
	}
	childPID := terminalGuardianPIDFile(t, childPIDPath, 1)[0]
	output, waitErr := readTerminalPTY(t, pty)
	if waitErr != nil {
		t.Fatalf("wait for terminal guardian: %v; output = %q", waitErr, output)
	}
	waitForTerminalProcessGone(t, childPID)
}

func TestTerminalGuardianDarwinBlocksSetsid(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("Darwin Seatbelt containment is required")
	}
	shell := terminalGuardianShell(t)
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	directory := t.TempDir()
	marker := filepath.Join(directory, "setsid-blocked")
	pty, err := openPTY([]string{
		shell,
		"-c",
		`exec "$1" -test.run=^TestTerminalGuardianSetsidChildProcess$ -- ` + terminalGuardianSetsidChildInvocation + ` "$2"`,
		"terminal-guardian-setsid-probe",
		executable,
		marker,
	}, directory, os.Environ(), 80, 24)
	if err != nil {
		t.Fatalf("open terminal PTY: %v", err)
	}
	output, waitErr := readTerminalPTY(t, pty)
	if waitErr != nil {
		t.Fatalf("wait for terminal guardian: %v; output = %q", waitErr, output)
	}
	contents, err := os.ReadFile(marker)
	if err != nil {
		t.Fatalf("read setsid marker: %v", err)
	}
	if string(contents) != "blocked" {
		t.Fatalf("Darwin terminal child escaped its guardian session: %q", contents)
	}
}

func TestTerminalGuardianReapsTERMIgnoringSessionAfterWorkerDeath(t *testing.T) {
	shell := terminalGuardianShell(t)
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	directory := t.TempDir()
	workerPIDPath := filepath.Join(directory, "worker.pid")
	shellPIDPath := filepath.Join(directory, "shell.pid")
	worker := exec.Command(
		executable,
		"-test.run=^TestTerminalGuardianWorkerProcess$",
		"--",
		terminalGuardianWorkerInvocation,
		workerPIDPath,
		shellPIDPath,
		shell,
	)
	if err := worker.Start(); err != nil {
		t.Fatalf("start terminal guardian worker: %v", err)
	}
	workerWaited := false
	t.Cleanup(func() {
		if workerWaited || worker.Process == nil {
			return
		}
		_ = worker.Process.Kill()
		_ = worker.Wait()
	})
	workerPID := terminalGuardianPIDFile(t, workerPIDPath, 1)[0]
	if worker.Process == nil || workerPID != worker.Process.Pid {
		t.Fatalf("worker PID = %d, command PID = %v", workerPID, worker.Process)
	}
	terminalPIDs := terminalGuardianPIDFile(t, shellPIDPath, 2)
	if err := worker.Process.Kill(); err != nil {
		t.Fatalf("kill terminal guardian worker: %v", err)
	}
	if err := worker.Wait(); err == nil {
		t.Fatal("worker Wait() error = nil after SIGKILL")
	}
	workerWaited = true
	for _, pid := range terminalPIDs {
		waitForTerminalProcessGone(t, pid)
	}
}

func TestTerminalGuardianReapsTERMIgnoringSetsidChildAfterWorkerDeath(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Linux subreaper containment is required for setsid descendants")
	}
	shell := terminalGuardianShell(t)
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	directory := t.TempDir()
	workerPIDPath := filepath.Join(directory, "setsid-worker.pid")
	shellPIDPath := filepath.Join(directory, "setsid-shell.pid")
	worker := exec.Command(
		executable,
		"-test.run=^TestTerminalGuardianWorkerProcess$",
		"--",
		terminalGuardianSetsidWorkerInvocation,
		workerPIDPath,
		shellPIDPath,
		shell,
	)
	if err := worker.Start(); err != nil {
		t.Fatalf("start terminal guardian setsid worker: %v", err)
	}
	workerWaited := false
	t.Cleanup(func() {
		if workerWaited || worker.Process == nil {
			return
		}
		_ = worker.Process.Kill()
		_ = worker.Wait()
	})
	terminalPIDs := terminalGuardianPIDFile(t, shellPIDPath, 2)
	shellSessionID, err := unix.Getsid(terminalPIDs[0])
	if err != nil {
		t.Fatalf("resolve terminal shell session: %v", err)
	}
	childSessionID, err := unix.Getsid(terminalPIDs[1])
	if err != nil {
		t.Fatalf("resolve terminal setsid child session: %v", err)
	}
	if childSessionID == shellSessionID {
		t.Fatal("terminal test child did not leave the guardian session")
	}
	if err := worker.Process.Kill(); err != nil {
		t.Fatalf("kill terminal guardian setsid worker: %v", err)
	}
	if err := worker.Wait(); err == nil {
		t.Fatal("worker Wait() error = nil after SIGKILL")
	}
	workerWaited = true
	for _, pid := range terminalPIDs {
		waitForTerminalProcessGone(t, pid)
	}
}

func TestUnixPTYCloseAndWaitAreConcurrentAndIdempotent(t *testing.T) {
	shell := terminalGuardianShell(t)
	pty, err := openPTY([]string{
		shell,
		"-c",
		`trap '' TERM; while :; do sleep 1; done`,
	}, t.TempDir(), os.Environ(), 80, 24)
	if err != nil {
		t.Fatalf("open terminal PTY: %v", err)
	}
	readerDone := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, pty)
		close(readerDone)
	}()
	errorsByCall := make(chan error, 16)
	var calls sync.WaitGroup
	for range 8 {
		calls.Go(func() { errorsByCall <- pty.Close() })
		calls.Go(func() { errorsByCall <- pty.Wait() })
	}
	done := make(chan struct{})
	go func() {
		calls.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("concurrent Close and Wait did not finish")
	}
	close(errorsByCall)
	for err := range errorsByCall {
		if err != nil {
			t.Fatalf("concurrent Close or Wait error: %v", err)
		}
	}
	select {
	case <-readerDone:
	case <-time.After(time.Second):
		t.Fatal("terminal PTY reader did not finish")
	}
}

func TestUnixPTYCloseRetainsLifetimePipeFailure(t *testing.T) {
	lifetimeReader, lifetimeWriter, err := os.Pipe()
	if err != nil {
		t.Fatalf("create lifetime pipe: %v", err)
	}
	t.Cleanup(func() { _ = lifetimeReader.Close() })
	if err := lifetimeWriter.Close(); err != nil {
		t.Fatalf("close lifetime pipe: %v", err)
	}
	pty := &unixPTY{lifetimeWriter: lifetimeWriter}
	first := pty.Close()
	second := pty.Close()
	if !errors.Is(first, os.ErrClosed) || !errors.Is(second, os.ErrClosed) {
		t.Fatalf("idempotent lifetime pipe errors = %v and %v, want %v", first, second, os.ErrClosed)
	}
}

func TestCleanupTerminalSessionOrdersPartialSnapshotsAndFinalKill(t *testing.T) {
	partialSnapshot := errors.New("partial snapshot")
	termFailure := errors.New("TERM failure")
	membersCalls := 0
	var signals []string
	var sleeps int
	operations := terminalSessionOperations{
		members: func(int) ([]int, error) {
			membersCalls++
			switch membersCalls {
			case 1:
				return []int{42, 9, 99}, partialSnapshot
			case 2:
				return []int{42, 9, 99}, nil
			case 3:
				return []int{42}, nil
			default:
				return nil, nil
			}
		},
		verify: func(pid int, sessionID int) (bool, error) {
			return sessionID == 77 && pid != 99, nil
		},
		signal: func(pid int, _ int, signal syscall.Signal) error {
			signals = append(signals, fmt.Sprintf("%s:%d", signal, pid))
			if pid == 9 && signal == syscall.SIGTERM {
				return termFailure
			}
			return nil
		},
		sleep: func(time.Duration) { sleeps++ },
	}
	err := cleanupTerminalSession(77, 99, operations)
	if !errors.Is(err, partialSnapshot) || !errors.Is(err, termFailure) {
		t.Fatalf("cleanup error = %v, want partial snapshot and TERM failure", err)
	}
	if got, want := strings.Join(signals, "|"), "terminated:9|terminated:42|killed:9|killed:42|killed:42"; got != want {
		t.Fatalf("signal order = %q, want %q", got, want)
	}
	if sleeps != 3 {
		t.Fatalf("cleanup sleeps = %d, want 3", sleeps)
	}
}

func TestCleanupTerminalSessionReportsFinalSurvivors(t *testing.T) {
	operations := terminalSessionOperations{
		members: func(int) ([]int, error) { return []int{12}, nil },
		verify:  func(int, int) (bool, error) { return true, nil },
		signal:  func(int, int, syscall.Signal) error { return nil },
	}
	err := cleanupTerminalSession(7, 99, operations)
	if err == nil || !strings.Contains(err.Error(), "survivors after final SIGKILL") {
		t.Fatalf("cleanup error = %v, want final survivor report", err)
	}
}

func TestTerminalSessionMemberMatchesRevalidatesTheLiveSession(t *testing.T) {
	sessionID, err := unix.Getsid(0)
	if err != nil {
		t.Fatalf("resolve current session: %v", err)
	}
	matches, err := terminalSessionMemberMatches(os.Getpid(), sessionID)
	if err != nil || !matches {
		t.Fatalf("current process session match = %t error %v", matches, err)
	}
	matches, err = terminalSessionMemberMatches(os.Getpid(), sessionID+1)
	if err != nil || matches {
		t.Fatalf("mismatched live session = %t error %v", matches, err)
	}
}

func TestServiceStopAndWaitReturnsTerminalWaitFailure(t *testing.T) {
	waitFailure := errors.New("guardian cleanup failed")
	session := &session{
		pty:       terminalWaitFailurePTY{waitErr: waitFailure},
		done:      make(chan struct{}),
		history:   historyBuffer{limit: defaultHistoryLimit},
		artifacts: make(map[string]struct{}),
	}
	service := &Service{}
	go service.waitLoop(session)
	shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := service.stopAndWait(shutdownContext, session); !errors.Is(err, waitFailure) {
		t.Fatalf("stop and wait error = %v, want %v", err, waitFailure)
	}
}

func terminalGuardianShell(t *testing.T) string {
	t.Helper()
	shell, err := exec.LookPath("sh")
	if err != nil {
		t.Skip("POSIX shell is unavailable")
	}
	return shell
}

func terminalGuardianEnvironment(name string, value string) []string {
	prefix := name + "="
	environment := make([]string, 0, len(os.Environ())+1)
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(entry, prefix) {
			environment = append(environment, entry)
		}
	}
	return append(environment, prefix+value)
}

func readTerminalPTY(t *testing.T, pty ptySession) (string, error) {
	t.Helper()
	output := make(chan []byte, 1)
	go func() {
		contents, _ := io.ReadAll(pty)
		output <- contents
	}()
	waitErr := waitForTerminalPTY(t, pty)
	select {
	case contents := <-output:
		return string(contents), waitErr
	case <-time.After(5 * time.Second):
		t.Fatal("terminal PTY reader did not finish")
		return "", nil
	}
}

func waitForTerminalPTY(t *testing.T, pty ptySession) error {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- pty.Wait() }()
	select {
	case err := <-done:
		return err
	case <-time.After(5 * time.Second):
		_ = pty.Close()
		if session, ok := pty.(*unixPTY); ok && session.file != nil {
			_ = session.file.Close()
		}
		return errors.New("terminal guardian did not exit")
	}
}

func terminalGuardianPIDFile(t *testing.T, path string, count int) []int {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		contents, err := os.ReadFile(path)
		if err == nil {
			fields := strings.Fields(string(contents))
			if len(fields) == count {
				pids := make([]int, count)
				valid := true
				for index, field := range fields {
					pid, parseErr := strconv.Atoi(field)
					if parseErr != nil || pid < 1 {
						valid = false
						break
					}
					pids[index] = pid
				}
				if valid {
					return pids
				}
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("read terminal PID file %q: %v", path, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("terminal PID file %q was not ready", path)
	return nil
}

func waitForTerminalProcessGone(t *testing.T, pid int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		err := syscall.Kill(pid, 0)
		if errors.Is(err, syscall.ESRCH) {
			return
		}
		if err != nil {
			t.Fatalf("probe terminal process %d: %v", pid, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("terminal process %d remained alive", pid)
}

type terminalWaitFailurePTY struct {
	waitErr error
}

func (terminalWaitFailurePTY) Read([]byte) (int, error)       { return 0, io.EOF }
func (terminalWaitFailurePTY) Write(data []byte) (int, error) { return len(data), nil }
func (terminalWaitFailurePTY) Resize(int, int) error          { return nil }
func (terminalWaitFailurePTY) Close() error                   { return nil }
func (pty terminalWaitFailurePTY) Wait() error                { return pty.waitErr }
