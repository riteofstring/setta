//go:build windows

package detachedruns

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
)

func newShellCommand(command string) (*exec.Cmd, error) {
	candidates := make([]string, 0, 3)
	if comspec := strings.TrimSpace(os.Getenv("COMSPEC")); comspec != "" {
		candidates = append(candidates, comspec)
	}
	candidates = append(candidates, "powershell.exe", "pwsh.exe", "cmd.exe")
	for _, candidate := range candidates {
		path, err := exec.LookPath(candidate)
		if err != nil {
			continue
		}
		base := strings.ToLower(strings.TrimSpace(filepathBase(path)))
		var cmd *exec.Cmd
		switch base {
		case "powershell.exe", "powershell", "pwsh.exe", "pwsh":
			cmd = exec.Command(path, "-NoProfile", "-NonInteractive", "-Command", command)
		default:
			cmd = exec.Command(path, "/c", command)
		}
		cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
		return cmd, nil
	}
	return nil, fmt.Errorf("resolve detached run shell: no supported shell found")
}

func terminateProcess(cmd *exec.Cmd) error {
	return cmd.Process.Kill()
}

func killProcess(cmd *exec.Cmd) error {
	return cmd.Process.Kill()
}

func filepathBase(path string) string {
	lastSlash := strings.LastIndexAny(path, `/\`)
	if lastSlash == -1 {
		return path
	}
	return path[lastSlash+1:]
}
