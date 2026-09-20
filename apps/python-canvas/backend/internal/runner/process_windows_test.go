//go:build windows

package runner

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
)

func TestWindowsGuardianPreservesInterpreterAndArtifactArguments(t *testing.T) {
	interpreter := `C:\setta path\π&%!\python.exe`
	artifact := `generated & 你好.py`
	environment := []string{`PATH=C:\Python`, "LANG=en_US.UTF-8"}
	launch, err := prepareProcessLaunch(interpreter, artifact, `C:\project path\α`, environment)
	if err != nil {
		t.Fatalf("prepareProcessLaunch() error = %v", err)
	}
	t.Cleanup(func() {
		if launch.cleanup != nil {
			_ = launch.cleanup()
		}
	})
	want := []string{interpreter, "-I", "-S", "-c", windowsGuardianPrelude, interpreter, artifact}
	if !slices.Equal(launch.command.Args, want) {
		t.Fatalf("guardian argv = %q, want %q", launch.command.Args, want)
	}
	if launch.command.Dir != `C:\project path\α` || !slices.Equal(launch.command.Env, environment) {
		t.Fatalf("guardian command boundary = dir %q env %q", launch.command.Dir, launch.command.Env)
	}
	readIndex := strings.Index(windowsGuardianPrelude, "sys.stdin.buffer.read(1)")
	spawnIndex := strings.Index(windowsGuardianPrelude, "nt.spawnv(nt.P_WAIT")
	if readIndex < 0 || spawnIndex < 0 || readIndex > spawnIndex {
		t.Fatalf("guardian prelude does not wait before launching the artifact child: %q", windowsGuardianPrelude)
	}
	if strings.Contains(windowsGuardianPrelude, "nt.execv") {
		t.Fatalf("guardian prelude overlays the Job-owned root instead of supervising the artifact child: %q", windowsGuardianPrelude)
	}
	if !strings.Contains(windowsGuardianPrelude, "==b'\\x01' or sys.exit(125)") {
		t.Fatalf("guardian prelude accepts EOF or an unexpected release token: %q", windowsGuardianPrelude)
	}
	if !strings.HasPrefix(windowsGuardianPrelude, "import sys,nt;") || strings.Contains(windowsGuardianPrelude, "os.") {
		t.Fatalf("guardian prelude imports project-resolved modules: %q", windowsGuardianPrelude)
	}
	if !strings.Contains(windowsGuardianPrelude, "nt.open('NUL',nt.O_RDONLY)") || !strings.Contains(windowsGuardianPrelude, "nt.dup2(null,0)") {
		t.Fatalf("guardian prelude does not give the artifact child NUL stdin: %q", windowsGuardianPrelude)
	}
}

func TestWindowsGuardianActivationFailureClosesInput(t *testing.T) {
	writeErr := errors.New("guardian release write denied")
	closeErr := errors.New("guardian input close denied")
	input := &fakeWindowsGuardianInput{writeErr: writeErr, closeErr: closeErr}
	release, cleanup := windowsGuardianInput(input)
	if err := release(windowsGuardianReleaseToken); !errors.Is(err, writeErr) || !errors.Is(err, closeErr) {
		t.Fatalf("activate() error = %v, want write and close failures", err)
	}
	if input.writes != 1 || input.closes != 1 || string(input.data) != windowsGuardianReleaseToken {
		t.Fatalf("guardian input lifecycle = writes %d closes %d data %q", input.writes, input.closes, input.data)
	}
	if err := cleanup(); !errors.Is(err, closeErr) {
		t.Fatalf("cleanup() error = %v, want retained close failure", err)
	}
	if input.closes != 1 {
		t.Fatalf("guardian input closed %d times, want one", input.closes)
	}
}

func TestWindowsGuardianRequiresExactReleaseToken(t *testing.T) {
	interpreter, err := findWindowsTestPython()
	if err != nil {
		t.Skipf("Python interpreter is unavailable: %v", err)
	}
	directory := t.TempDir()
	artifact := filepath.Join(directory, "guardian-artifact.py")
	if err := os.WriteFile(artifact, []byte("from pathlib import Path\nPath('guardian-ran').write_text('yes')\n"), 0o600); err != nil {
		t.Fatalf("write guardian artifact: %v", err)
	}
	for _, testCase := range []struct {
		name         string
		token        string
		exitCode     int
		artifactRuns bool
	}{
		{name: "end of file", token: "", exitCode: windowsGuardianFailureCode},
		{name: "wrong token", token: "\x02", exitCode: windowsGuardianFailureCode},
		{name: "exact token", token: windowsGuardianReleaseToken, exitCode: 0, artifactRuns: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			marker := filepath.Join(directory, "guardian-ran")
			if err := os.Remove(marker); err != nil && !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("reset guardian marker: %v", err)
			}
			guardian, err := prepareWindowsGuardianLaunch(interpreter, artifact, directory, os.Environ())
			if err != nil {
				t.Fatalf("prepareWindowsGuardianLaunch() error = %v", err)
			}
			guardian.command.Stdout = io.Discard
			guardian.command.Stderr = io.Discard
			t.Cleanup(func() {
				if guardian.command.ProcessState == nil && guardian.command.Process != nil {
					_ = guardian.command.Process.Kill()
					_ = guardian.command.Wait()
				}
				_ = guardian.cleanup()
			})
			if err := guardian.command.Start(); err != nil {
				t.Fatalf("start guardian: %v", err)
			}
			if err := guardian.release(testCase.token); err != nil {
				t.Fatalf("release guardian: %v", err)
			}
			if err := guardian.command.Wait(); !windowsGuardianExitedWith(err, testCase.exitCode) {
				t.Fatalf("guardian wait error = %v, want exit %d", err, testCase.exitCode)
			}
			_, markerErr := os.Stat(marker)
			if testCase.artifactRuns && markerErr != nil {
				t.Fatalf("guardian did not run artifact: %v", markerErr)
			}
			if !testCase.artifactRuns && !errors.Is(markerErr, os.ErrNotExist) {
				t.Fatalf("guardian ran artifact before exact release: %v", markerErr)
			}
		})
	}
}

func TestWindowsGuardianStaysAliveAsArtifactSupervisor(t *testing.T) {
	interpreter, err := findWindowsTestPython()
	if err != nil {
		t.Skipf("Python interpreter is unavailable: %v", err)
	}
	directory := t.TempDir()
	parentPath := filepath.Join(directory, "artifact-parent")
	artifact := filepath.Join(directory, "guardian-artifact.py")
	contents := "import os\nimport time\nfrom pathlib import Path\nPath('artifact-parent').write_text(str(os.getppid()))\ntime.sleep(0.2)\n"
	if err := os.WriteFile(artifact, []byte(contents), 0o600); err != nil {
		t.Fatalf("write guardian artifact: %v", err)
	}
	guardian, err := prepareWindowsGuardianLaunch(interpreter, artifact, directory, os.Environ())
	if err != nil {
		t.Fatalf("prepareWindowsGuardianLaunch() error = %v", err)
	}
	guardian.command.Stdout = io.Discard
	guardian.command.Stderr = io.Discard
	t.Cleanup(func() {
		if guardian.command.ProcessState == nil && guardian.command.Process != nil {
			_ = guardian.command.Process.Kill()
			_ = guardian.command.Wait()
		}
		_ = guardian.cleanup()
	})
	if err := guardian.command.Start(); err != nil {
		t.Fatalf("start guardian: %v", err)
	}
	guardianPID := guardian.command.Process.Pid
	if err := guardian.release(windowsGuardianReleaseToken); err != nil {
		t.Fatalf("release guardian: %v", err)
	}
	if err := guardian.command.Wait(); err != nil {
		t.Fatalf("wait for guardian: %v", err)
	}
	parentContents, err := os.ReadFile(parentPath)
	if err != nil {
		t.Fatalf("read artifact parent: %v", err)
	}
	parentPID, err := strconv.Atoi(strings.TrimSpace(string(parentContents)))
	if err != nil {
		t.Fatalf("artifact parent PID = %q: %v", parentContents, err)
	}
	if parentPID != guardianPID {
		t.Fatalf("artifact parent PID = %d, want stable guardian PID %d", parentPID, guardianPID)
	}
}

type fakeWindowsGuardianInput struct {
	writes   int
	closes   int
	data     []byte
	writeErr error
	closeErr error
}

func (input *fakeWindowsGuardianInput) Write(data []byte) (int, error) {
	input.writes++
	input.data = append(input.data, data...)
	return len(data), input.writeErr
}

func (input *fakeWindowsGuardianInput) Close() error {
	input.closes++
	return input.closeErr
}

func findWindowsTestPython() (string, error) {
	for _, name := range []string{"python.exe", "python"} {
		if interpreter, err := exec.LookPath(name); err == nil {
			return interpreter, nil
		}
	}
	return "", errors.New("python executable not found")
}

func windowsGuardianExitedWith(err error, exitCode int) bool {
	if exitCode == 0 {
		return err == nil
	}
	var exitError *exec.ExitError
	return errors.As(err, &exitError) && exitError.ExitCode() == exitCode
}
