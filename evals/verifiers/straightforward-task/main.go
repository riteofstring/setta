package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"time"

	"setta/internal/evalharness"
	evalverifier "setta/internal/evalharness/verifier"
	"setta/internal/jsonio"
)

const (
	maximumCommandOutputBytes = 16 * 1024
	maximumResponseBodyBytes  = 4 * 1024
	commandTimeout            = 2 * time.Minute
	serverStartTimeout        = 15 * time.Second
	serverStopTimeout         = 5 * time.Second
)

var snapshotOptions = evalverifier.SnapshotOptions{
	IgnoredDirectoryNames: []string{".git", "dist", "node_modules"},
}

func main() {
	baseline := flag.String("baseline", "", "read-only baseline fixture directory")
	workspace := flag.String("workspace", "", "final workspace directory")
	flag.Parse()
	if flag.NArg() != 0 {
		fatal(fmt.Errorf("unexpected positional arguments: %s", strings.Join(flag.Args(), " ")))
	}
	if strings.TrimSpace(*baseline) == "" || strings.TrimSpace(*workspace) == "" {
		fatal(errors.New("--baseline and --workspace are required"))
	}
	result, err := verifyStraightforwardTask(context.Background(), *baseline, *workspace)
	if err != nil {
		fatal(err)
	}
	if err := evalverifier.WriteResult(os.Stdout, result); err != nil {
		fatal(err)
	}
}

func verifyStraightforwardTask(
	ctx context.Context,
	baselineRoot string,
	workspaceRoot string,
) (evalverifier.Result, error) {
	baselineRoot, workspaceRoot, err := validateRoots(baselineRoot, workspaceRoot)
	if err != nil {
		return evalverifier.Result{}, err
	}
	if err := requireVerifierCommands("node", "pnpm"); err != nil {
		return evalverifier.Result{}, err
	}
	baseline, err := evalverifier.ReadWorkspace(baselineRoot, snapshotOptions)
	if err != nil {
		return evalverifier.Result{}, fmt.Errorf("read trusted verifier baseline: %w", err)
	}
	workspace, err := evalverifier.ReadWorkspace(workspaceRoot, snapshotOptions)
	if err != nil {
		checks := []evalverifier.Check{
			{
				ID:     "workspace_snapshot",
				Passed: false,
				Detail: evalverifier.BoundedDetail(err.Error()),
			},
		}
		return evalverifier.NewResult(
			evalharness.ScenarioVerifierStraightforward,
			checks,
			[]string{},
		), nil
	}
	changedFiles := evalverifier.ChangedFiles(baseline, workspace)
	checks := []evalverifier.Check{
		checkRelatedChanges(changedFiles),
		checkDocumentation(workspaceRoot),
	}

	buildCheck, err := runCommandCheck(
		ctx,
		workspaceRoot,
		"build",
		"pnpm run build",
		"pnpm",
		"run",
		"build",
	)
	if err != nil {
		return evalverifier.Result{}, err
	}
	checks = append(checks, buildCheck)

	if !buildCheck.Passed {
		checks = append(
			checks,
			skippedRouteCheck("root_route"),
			skippedRouteCheck("health_route"),
			skippedTestCheck(),
		)
		return evalverifier.NewResult(
			evalharness.ScenarioVerifierStraightforward,
			checks,
			changedFiles,
		), nil
	}
	server, err := startFixtureServer(ctx, workspaceRoot)
	if err != nil {
		detail := evalverifier.BoundedDetail(fmt.Sprintf("Start built service: %v", err))
		checks = append(checks,
			evalverifier.Check{ID: "root_route", Passed: false, Detail: detail},
			evalverifier.Check{ID: "health_route", Passed: false, Detail: detail},
		)
	} else {
		checks = append(checks,
			checkJSONRoute(ctx, server.port, "root_route", "/", map[string]any{
				"service": "setta-eval-fixture",
			}),
			checkJSONRoute(ctx, server.port, "health_route", "/health", map[string]any{
				"ok": true,
			}),
		)
		if err := server.stop(); err != nil {
			return evalverifier.Result{}, err
		}
	}
	testCheck, err := runCommandCheck(
		ctx,
		workspaceRoot,
		"tests",
		"pnpm test",
		"pnpm",
		"test",
	)
	if err != nil {
		return evalverifier.Result{}, err
	}
	checks = append(checks, testCheck)
	return evalverifier.NewResult(
		evalharness.ScenarioVerifierStraightforward,
		checks,
		changedFiles,
	), nil
}

func validateRoots(baselineRoot string, workspaceRoot string) (string, string, error) {
	baselineRoot, err := filepath.Abs(baselineRoot)
	if err != nil {
		return "", "", fmt.Errorf("resolve baseline root: %w", err)
	}
	workspaceRoot, err = filepath.Abs(workspaceRoot)
	if err != nil {
		return "", "", fmt.Errorf("resolve workspace root: %w", err)
	}
	baselineRoot, err = filepath.EvalSymlinks(baselineRoot)
	if err != nil {
		return "", "", fmt.Errorf("resolve baseline root links: %w", err)
	}
	workspaceRoot, err = filepath.EvalSymlinks(workspaceRoot)
	if err != nil {
		return "", "", fmt.Errorf("resolve workspace root links: %w", err)
	}
	if baselineRoot == workspaceRoot {
		return "", "", errors.New("baseline and workspace roots must be different")
	}
	return baselineRoot, workspaceRoot, nil
}

func requireVerifierCommands(names ...string) error {
	for _, name := range names {
		if _, err := exec.LookPath(name); err != nil {
			return fmt.Errorf("verifier command %s is unavailable: %w", name, err)
		}
	}
	return nil
}

func checkRelatedChanges(changedFiles []string) evalverifier.Check {
	required := map[string]bool{
		"README.md":           false,
		"src/server.ts":       false,
		"test/server.test.ts": false,
	}
	unrelated := make([]string, 0, len(changedFiles))
	for _, path := range changedFiles {
		if _, ok := required[path]; ok {
			required[path] = true
			continue
		}
		unrelated = append(unrelated, path)
	}
	missing := make([]string, 0, len(required))
	for _, path := range []string{"README.md", "src/server.ts", "test/server.test.ts"} {
		if !required[path] {
			missing = append(missing, path)
		}
	}
	if len(unrelated) > 0 || len(missing) > 0 {
		details := make([]string, 0, 2)
		if len(unrelated) > 0 {
			details = append(details, "unrelated workspace changes: "+strings.Join(unrelated, ", "))
		}
		if len(missing) > 0 {
			details = append(details, "required task files unchanged: "+strings.Join(missing, ", "))
		}
		return evalverifier.Check{
			ID:     "related_changes_only",
			Passed: false,
			Detail: evalverifier.BoundedDetail(strings.Join(details, "; ")),
		}
	}
	return evalverifier.Check{
		ID:     "related_changes_only",
		Passed: true,
		Detail: "The final workspace changes exactly the endpoint source, its automated test, and README.md.",
	}
}

func checkDocumentation(workspaceRoot string) evalverifier.Check {
	content, err := os.ReadFile(filepath.Join(workspaceRoot, "README.md"))
	if err != nil {
		return evalverifier.Check{
			ID:     "health_documented",
			Passed: false,
			Detail: evalverifier.BoundedDetail(fmt.Sprintf("Read README.md: %v", err)),
		}
	}
	if !strings.Contains(string(content), "GET /health") {
		return evalverifier.Check{
			ID:     "health_documented",
			Passed: false,
			Detail: "README.md does not document GET /health.",
		}
	}
	return evalverifier.Check{
		ID:     "health_documented",
		Passed: true,
		Detail: "README.md documents GET /health.",
	}
}

func runCommandCheck(
	ctx context.Context,
	workspaceRoot string,
	checkID string,
	label string,
	name string,
	args ...string,
) (evalverifier.Check, error) {
	commandContext, cancel := context.WithTimeout(ctx, commandTimeout)
	defer cancel()
	command := exec.CommandContext(commandContext, name, args...)
	command.Dir = workspaceRoot
	command.Env = verifierEnvironment()
	output := newBoundedBuffer(maximumCommandOutputBytes)
	command.Stdout = output
	command.Stderr = output
	err := command.Run()
	if ctx.Err() != nil {
		return evalverifier.Check{}, fmt.Errorf("verifier context ended while running %s: %w", label, ctx.Err())
	}
	if errors.Is(err, exec.ErrNotFound) {
		return evalverifier.Check{}, fmt.Errorf("verifier command %s is unavailable: %w", name, err)
	}
	if errors.Is(commandContext.Err(), context.DeadlineExceeded) {
		return evalverifier.Check{
			ID:     checkID,
			Passed: false,
			Detail: fmt.Sprintf("%s exceeded %s.", label, commandTimeout),
		}, nil
	}
	if err != nil {
		detail := fmt.Sprintf("%s failed: %v", label, err)
		if diagnostic := output.String(); diagnostic != "" {
			detail += ": " + diagnostic
		}
		return evalverifier.Check{
			ID:     checkID,
			Passed: false,
			Detail: evalverifier.BoundedDetail(detail),
		}, nil
	}
	return evalverifier.Check{
		ID:     checkID,
		Passed: true,
		Detail: label + " completed successfully.",
	}, nil
}

func skippedRouteCheck(checkID string) evalverifier.Check {
	return evalverifier.Check{
		ID:     checkID,
		Passed: false,
		Detail: "The route was not checked because the fixture build failed.",
	}
}

func skippedTestCheck() evalverifier.Check {
	return evalverifier.Check{
		ID:     "tests",
		Passed: false,
		Detail: "The tests were not run because the fixture build failed.",
	}
}

type fixtureServer struct {
	port    int
	command *exec.Cmd
	cancel  context.CancelFunc
	wait    <-chan error
}

type fixtureServerEvent struct {
	Event string `json:"event"`
	Port  int    `json:"port"`
}

func startFixtureServer(ctx context.Context, workspaceRoot string) (*fixtureServer, error) {
	serverContext, cancel := context.WithCancel(ctx)
	command := exec.CommandContext(serverContext, "node", "dist/server.js")
	command.Dir = workspaceRoot
	command.Env = append(verifierEnvironment(), "PORT=0")
	stdout, err := command.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("open built service stdout: %w", err)
	}
	diagnostic := newBoundedBuffer(maximumCommandOutputBytes)
	command.Stderr = diagnostic
	if err := command.Start(); err != nil {
		cancel()
		if errors.Is(err, exec.ErrNotFound) {
			return nil, fmt.Errorf("verifier command node is unavailable: %w", err)
		}
		return nil, fmt.Errorf("start built service: %w", err)
	}
	ready := make(chan serverReadiness, 1)
	go readServerReadiness(stdout, ready)
	wait := make(chan error, 1)
	go func() {
		wait <- command.Wait()
	}()
	startContext, stopWaiting := context.WithTimeout(ctx, serverStartTimeout)
	defer stopWaiting()
	select {
	case readiness := <-ready:
		if readiness.err != nil {
			return nil, errors.Join(
				readiness.err,
				stopFixtureProcess(cancel, command.Process, wait),
			)
		}
		return &fixtureServer{
			port:    readiness.port,
			command: command,
			cancel:  cancel,
			wait:    wait,
		}, nil
	case err := <-wait:
		cancel()
		return nil, fmt.Errorf(
			"built service exited before readiness: %v: %s",
			err,
			evalverifier.BoundedDetail(diagnostic.String()),
		)
	case <-startContext.Done():
		return nil, errors.Join(
			fmt.Errorf("built service did not become ready within %s", serverStartTimeout),
			stopFixtureProcess(cancel, command.Process, wait),
		)
	}
}

type serverReadiness struct {
	port int
	err  error
}

func readServerReadiness(reader io.Reader, ready chan<- serverReadiness) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 1024), maximumCommandOutputBytes)
	found := false
	for scanner.Scan() {
		if found {
			continue
		}
		var event fixtureServerEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil || event.Event != "listening" {
			continue
		}
		if event.Port < 1 || event.Port > 65_535 {
			ready <- serverReadiness{err: fmt.Errorf("built service reported invalid port %d", event.Port)}
			found = true
			continue
		}
		ready <- serverReadiness{port: event.Port}
		found = true
	}
	if found {
		return
	}
	if err := scanner.Err(); err != nil {
		ready <- serverReadiness{err: fmt.Errorf("read built service readiness: %w", err)}
		return
	}
	ready <- serverReadiness{err: errors.New("built service closed stdout before readiness")}
}

func (server *fixtureServer) stop() error {
	return stopFixtureProcess(server.cancel, server.command.Process, server.wait)
}

func stopFixtureProcess(cancel context.CancelFunc, process *os.Process, wait <-chan error) error {
	cancel()
	var killErr error
	if process != nil {
		if err := process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
			killErr = fmt.Errorf("stop built service: %w", err)
		}
	}
	select {
	case <-wait:
		return killErr
	case <-time.After(serverStopTimeout):
		return errors.Join(
			killErr,
			fmt.Errorf("built service did not stop within %s", serverStopTimeout),
		)
	}
}

func checkJSONRoute(
	ctx context.Context,
	port int,
	checkID string,
	path string,
	expected map[string]any,
) evalverifier.Check {
	requestContext, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(
		requestContext,
		http.MethodGet,
		fmt.Sprintf("http://127.0.0.1:%d%s", port, path),
		nil,
	)
	if err != nil {
		return failedRouteCheck(checkID, path, err)
	}
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{
		Transport: transport,
		Timeout:   10 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return failedRouteCheck(checkID, path, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return failedRouteCheck(checkID, path, fmt.Errorf("status is %d, want 200", response.StatusCode))
	}
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return failedRouteCheck(
			checkID,
			path,
			fmt.Errorf("content type is %q, want application/json", response.Header.Get("Content-Type")),
		)
	}
	limitedBody := io.LimitReader(response.Body, maximumResponseBodyBytes+1)
	body, err := io.ReadAll(limitedBody)
	if err != nil {
		return failedRouteCheck(checkID, path, fmt.Errorf("read response: %w", err))
	}
	if len(body) > maximumResponseBodyBytes {
		return failedRouteCheck(checkID, path, errors.New("response body exceeds 4096 bytes"))
	}
	var actual map[string]any
	if err := jsonio.DecodeSingle(strings.NewReader(string(body)), &actual); err != nil {
		return failedRouteCheck(checkID, path, fmt.Errorf("decode JSON response: %w", err))
	}
	if !reflect.DeepEqual(actual, expected) {
		return failedRouteCheck(checkID, path, fmt.Errorf("JSON body is %#v, want %#v", actual, expected))
	}
	return evalverifier.Check{
		ID:     checkID,
		Passed: true,
		Detail: fmt.Sprintf("GET %s returned status 200, JSON content type, and the exact expected body.", path),
	}
}

func failedRouteCheck(checkID string, path string, err error) evalverifier.Check {
	return evalverifier.Check{
		ID:     checkID,
		Passed: false,
		Detail: evalverifier.BoundedDetail(fmt.Sprintf("GET %s failed verification: %v", path, err)),
	}
}

func verifierEnvironment() []string {
	return []string{
		"CI=1",
		"HOME=/tmp",
		"LANG=C.UTF-8",
		"NO_COLOR=1",
		"PATH=" + os.Getenv("PATH"),
		"TMPDIR=/tmp",
	}
}

type boundedBuffer struct {
	mutex     sync.Mutex
	content   []byte
	maximum   int
	truncated bool
}

func newBoundedBuffer(maximum int) *boundedBuffer {
	return &boundedBuffer{maximum: maximum}
}

func (buffer *boundedBuffer) Write(value []byte) (int, error) {
	buffer.mutex.Lock()
	defer buffer.mutex.Unlock()
	written := len(value)
	remaining := buffer.maximum - len(buffer.content)
	if remaining <= 0 {
		buffer.truncated = true
		return written, nil
	}
	if len(value) > remaining {
		buffer.content = append(buffer.content, value[:remaining]...)
		buffer.truncated = true
		return written, nil
	}
	buffer.content = append(buffer.content, value...)
	return written, nil
}

func (buffer *boundedBuffer) String() string {
	buffer.mutex.Lock()
	defer buffer.mutex.Unlock()
	value := strings.TrimSpace(string(buffer.content))
	if buffer.truncated {
		value += "…"
	}
	return value
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
