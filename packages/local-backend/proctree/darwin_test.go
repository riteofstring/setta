//go:build darwin

package proctree

import (
	"os/exec"
	"strings"
	"testing"
)

func TestDarwinCommandPreventsNoninteractiveGroupAndSessionEscape(t *testing.T) {
	if err := ValidateDarwinContainment(); err != nil {
		t.Skipf("macOS containment launcher is unavailable: %v", err)
	}
	interpreter, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 is required")
	}
	command, err := DarwinCommand(interpreter, "-c", `import os
for escape in (lambda: os.setsid(), lambda: os.setpgid(0, 0)):
    try:
        escape()
    except PermissionError:
        pass
    else:
        raise RuntimeError("process escape was allowed")
print("contained")`)
	if err != nil {
		t.Fatalf("DarwinCommand() error = %v", err)
	}
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("contained command error = %v\n%s", err, output)
	}
	if strings.TrimSpace(string(output)) != "contained" {
		t.Fatalf("contained command output = %q", output)
	}
}
