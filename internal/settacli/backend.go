package settacli

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/backendconn"
)

type backendStartOutput struct {
	SchemaVersion int    `json:"schemaVersion"`
	Addr          string `json:"addr"`
	Token         string `json:"token"`
	AppDataDir    string `json:"appDataDir"`
	PID           int    `json:"pid"`
	Version       string `json:"version"`
}

type backendReadyEvent struct {
	Event string `json:"event"`
	Addr  string `json:"addr"`
}

func backendStartSpec() CommandSpec {
	return CommandSpec{
		Path:             []string{"backend", "start"},
		Summary:          "Start a Setta backend with explicit app data.",
		Usage:            "setta backend start --app-data-dir DIR --json",
		Mutates:          true,
		OutputSchemaName: "BackendStart",
		RequiredFlags:    []string{"--app-data-dir"},
		Examples:         []string{"setta backend start --app-data-dir \"$APP_DATA_DIR\" --json"},
		handler:          handleBackendStart,
	}
}

func backendConnectionSpec() CommandSpec {
	return CommandSpec{
		Path:             []string{"backend", "connection"},
		Summary:          "Print the resolved backend connection metadata.",
		Usage:            "setta backend connection --json",
		OutputSchemaName: "BackendConnection",
		OptionalFlags:    []string{"--show-token"},
		Examples:         []string{"setta backend connection --json"},
		handler:          handleBackendConnection,
	}
}

func handleBackendStart(context *Context, args []string) error {
	flags := newFlagSet("backend start")
	appDataDir := flags.String("app-data-dir", "", "directory for persisted Setta app state")
	host := flags.String("host", "127.0.0.1", "loopback host")
	port := flags.Int("port", 0, "port")
	version := flags.String("version", defaultString(context.Getenv("SETTA_BACKEND_VERSION"), "dev"), "backend version")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("backend start does not accept positional arguments")
	}
	if *appDataDir == "" {
		return invalidError("backend start requires --app-data-dir")
	}

	token, err := backendconn.GenerateToken()
	if err != nil {
		return err
	}
	command, commandArgs, commandDir, err := backendCommand(context, *appDataDir, *host, *port, *version, token)
	if err != nil {
		return err
	}
	process := exec.Command(command, commandArgs...)
	process.Dir = commandDir
	process.Env = os.Environ()
	stdout, err := process.StdoutPipe()
	if err != nil {
		return fmt.Errorf("open backend stdout: %w", err)
	}
	if context.Globals.Quiet {
		process.Stderr = io.Discard
	} else {
		process.Stderr = context.Stderr
	}
	if err := process.Start(); err != nil {
		return fmt.Errorf("start backend command %s: %w", command, err)
	}

	ready, err := waitForBackendReady(stdout, context.Globals.Timeout)
	if err != nil {
		_ = process.Process.Kill()
		return err
	}
	go func() {
		_ = process.Wait()
	}()
	output := backendStartOutput{
		SchemaVersion: schemaVersion,
		Addr:          backendHTTPAddr(ready.Addr),
		Token:         token,
		AppDataDir:    *appDataDir,
		PID:           process.Process.Pid,
		Version:       *version,
	}
	if context.Globals.JSON {
		return writeJSON(context.Stdout, output)
	}
	_, err = fmt.Fprintf(context.Stdout, "%s\n", output.Addr)
	return err
}

func handleBackendConnection(context *Context, args []string) error {
	flags := newFlagSet("backend connection")
	showToken := flags.Bool("show-token", false, "include backend token in output")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("backend connection does not accept positional arguments")
	}
	connection, err := context.resolveBackendConnection(true)
	if err != nil {
		return backendUnavailableError(err.Error())
	}
	if !*showToken {
		connection.Token = ""
	}
	return context.writeCommandData([]string{"backend", "connection"}, connection)
}

func backendCommand(context *Context, appDataDir string, host string, port int, version string, token string) (string, []string, string, error) {
	args := []string{
		"--app-data-dir", appDataDir,
		"--auth-token", token,
		"--host", host,
		"--port", fmt.Sprintf("%d", port),
		"--version", version,
	}
	if command := context.Getenv("SETTA_BACKEND_COMMAND"); command != "" {
		return command, args, "", nil
	}
	executable, err := os.Executable()
	if err == nil {
		sibling := filepath.Join(filepath.Dir(executable), "setta-backend")
		if existsExecutable(sibling) {
			return sibling, args, "", nil
		}
	}
	if repoRoot := findRepoRoot(); repoRoot != "" {
		return filepath.Join(repoRoot, "scripts", "go.sh"), append([]string{"run", "./cmd/setta-backend"}, args...), repoRoot, nil
	}
	return "", nil, "", errors.New("setta-backend executable was not found; set SETTA_BACKEND_COMMAND")
}

func waitForBackendReady(reader io.Reader, timeout time.Duration) (backendReadyEvent, error) {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	type result struct {
		ready backendReadyEvent
		err   error
	}
	results := make(chan result, 1)
	go func() {
		line, err := bufio.NewReader(reader).ReadString('\n')
		if err != nil {
			results <- result{err: fmt.Errorf("read backend ready event: %w", err)}
			return
		}
		var ready backendReadyEvent
		if err := json.Unmarshal([]byte(line), &ready); err != nil {
			results <- result{err: fmt.Errorf("decode backend ready event: %w", err)}
			return
		}
		if ready.Event != "ready" || ready.Addr == "" {
			results <- result{err: fmt.Errorf("unexpected backend ready event: %s", strings.TrimSpace(line))}
			return
		}
		results <- result{ready: ready}
	}()
	select {
	case result := <-results:
		return result.ready, result.err
	case <-time.After(timeout):
		return backendReadyEvent{}, fmt.Errorf("backend did not become ready within %s", timeout)
	}
}

func backendHTTPAddr(addr string) string {
	if strings.HasPrefix(addr, "http://") || strings.HasPrefix(addr, "https://") {
		return addr
	}
	return "http://" + addr
}

func existsExecutable(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return info.Mode()&0o111 != 0
}

func existsDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func findRepoRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		if existsExecutable(filepath.Join(dir, "scripts", "go.sh")) && existsDir(filepath.Join(dir, "cmd", "setta-backend")) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}
