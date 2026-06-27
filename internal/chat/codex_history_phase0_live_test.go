package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	osexec "os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"setta/internal/codexaccount"
	"setta/internal/codexapp"
)

const (
	phase0LiveGateEnv     = "SETTA_CODEX_HISTORY_PHASE0_LIVE"
	phase0LiveTurnTimeout = 3 * time.Minute
)

func TestCodexHistoryPhase0LiveProviderValidation(t *testing.T) {
	if os.Getenv(phase0LiveGateEnv) != "1" {
		t.Skipf("%s=1 is required for live Phase 0 Codex history validation", phase0LiveGateEnv)
	}
	unsetCodexHistoryPhase0LiveEnv(t, "OPENAI_API_KEY")
	runtime := resolveCodexHistoryPhase0LiveRuntime(t)
	t.Logf("phase0 live Codex runtime: selection=%s invocation=%s command=%s resolved_command=%s version=%q reference_repo=%s reference_commit=%s session_source_arg_supported=%t explicit_session_source=%t app_server_args=%q",
		runtime.selection,
		runtime.invocation,
		runtime.command,
		runtime.resolvedCommand,
		runtime.version,
		runtime.referenceRepo,
		runtime.referenceCommit,
		runtime.supportsSessionSourceArg,
		runtime.explicitSessionSource,
		runtime.appServerArgs,
	)
	fixture := newCodexHistoryPhase0LiveFixture(t)
	blockers := []string{}
	manager := newCodexHistoryPhase0LiveManager(fixture.codexHome, runtime)
	defer shutdownCodexHistoryPhase0Manager(t, manager)
	requireCodexHistoryPhase0LiveChatGPTAuth(t, manager)

	ctx, cancel := context.WithTimeout(context.Background(), phase0LiveTurnTimeout)
	defer cancel()
	session, err := manager.NewSession(ctx)
	if err != nil {
		t.Fatalf("new live phase0 session: %v", err)
	}
	defer session.Close()
	session.AcceptUnscopedNotifications()
	session.AcceptUnscopedRequests()

	threadID := startCodexHistoryPhase0LiveThread(t, ctx, session, fixture.workspaceRoot)
	commandTurn := runCodexHistoryPhase0LiveTurn(t, ctx, session, threadID, codexHistoryPhase0LiveCommandPrompt())
	if !commandTurn.hasCommandActivity() {
		t.Fatalf("live phase0 turn methods = %v, want command/tool/approval activity and not only assistant output", commandTurn.methodCounts)
	}
	secondTurn := runCodexHistoryPhase0LiveTurn(t, ctx, session, threadID, "Reply exactly: setta-phase0-live-second")
	t.Logf("phase0 live command turn methods=%v started_items=%v completed_items=%v process_output_ids=%v approvals=%v",
		commandTurn.methodCounts,
		codexHistoryPhase0LiveItemSummaries(commandTurn.startedItems),
		codexHistoryPhase0LiveItemSummaries(commandTurn.completedItems),
		sortedStringKeys(commandTurn.processOutputIDs),
		codexHistoryPhase0LiveApprovalRequestIDs(commandTurn.approvalRequests),
	)

	session.Close()
	if err := manager.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown live Codex writer app-server: %v", err)
	}
	historyManager := newCodexHistoryPhase0LiveManager(fixture.codexHome, runtime)
	defer shutdownCodexHistoryPhase0Manager(t, historyManager)
	requireCodexHistoryPhase0LiveChatGPTAuth(t, historyManager)
	historyCtx, historyCancel := context.WithTimeout(context.Background(), phase0LiveTurnTimeout)
	defer historyCancel()

	readSnapshot := requireCodexHistoryPhase0LiveRead(t, historyCtx, historyManager, threadID, []string{commandTurn.turnID, secondTurn.turnID})
	turnsListSnapshot := requireCodexHistoryPhase0LiveTurnsList(t, historyCtx, historyManager, threadID, []string{commandTurn.turnID, secondTurn.turnID})
	if ok, reason, diagnostics, listedThreadSource := requireCodexHistoryPhase0LiveThreadList(t, historyCtx, historyManager, fixture.workspaceRoot, threadID); !ok {
		blockers = append(blockers, fmt.Sprintf("%s; diagnostics=%v", reason, diagnostics))
	} else {
		t.Logf("phase0 live observed provider threadSource from thread/list: %q", listedThreadSource)
	}
	requireCodexHistoryPhase0LiveTurnAndItemObservations(t, "thread/read", commandTurn, readSnapshot)
	requireCodexHistoryPhase0LiveTurnAndItemObservations(t, "thread/turns/list", commandTurn, turnsListSnapshot)
	requireCodexHistoryPhase0LiveOverlayKeyMetadata(t, commandTurn)
	latency := measureCodexHistoryPhase0LiveLatency(t, historyCtx, historyManager, fixture.workspaceRoot, threadID)
	t.Logf("phase0 live Codex latency: thread/list 50=%s first transcript page 1=%s older transcript page 1=%s", latency.threadList, latency.firstTranscriptPage, latency.olderTranscriptPage)
	t.Logf("phase0 live observed provider limitations for Setta overlay: %s", strings.Join(codexHistoryPhase0LiveOverlayGaps(commandTurn, readSnapshot), "; "))
	if len(blockers) > 0 {
		t.Fatalf("phase0 live Codex validation blockers: %s", strings.Join(blockers, " | "))
	}
}

type codexHistoryPhase0LiveFixture struct {
	appDataDir    string
	codexHome     string
	workspaceRoot string
}

type codexHistoryPhase0LiveRuntime struct {
	command                  string
	appServerArgs            []string
	explicitSessionSource    bool
	invocation               string
	referenceCommit          string
	referenceRepo            string
	resolvedCommand          string
	selection                string
	supportsSessionSourceArg bool
	version                  string
}

func resolveCodexHistoryPhase0LiveRuntime(t *testing.T) codexHistoryPhase0LiveRuntime {
	t.Helper()
	command := strings.TrimSpace(os.Getenv("SETTA_CODEX_BIN"))
	if command == "" {
		t.Fatal("SETTA_CODEX_BIN must point at the managed/reference-compatible Codex app-server runtime for Phase 0 live validation; refusing arbitrary PATH Codex")
	}
	selection := "SETTA_CODEX_BIN"
	if !filepath.IsAbs(command) {
		path, err := osexec.LookPath(command)
		if err != nil {
			t.Fatalf("resolve SETTA_CODEX_BIN %q: %v", command, err)
		}
		command = path
	}
	if info, err := os.Stat(command); err != nil {
		t.Fatalf("stat SETTA_CODEX_BIN %s: %v", command, err)
	} else if info.IsDir() {
		t.Fatalf("SETTA_CODEX_BIN %s is a directory, want executable file", command)
	}
	resolvedCommand := command
	if resolved, err := filepath.EvalSymlinks(command); err == nil {
		resolvedCommand = resolved
	}
	version := runCodexHistoryPhase0RuntimeCommand(t, command, "--version")
	invocation, help := detectCodexHistoryPhase0AppServerInvocation(t, command)
	supportsSessionSource := strings.Contains(help, "--session-source")
	if !supportsSessionSource {
		t.Fatalf("live Codex runtime %s (%s) does not support explicit --session-source app-server; Phase 0 requires a managed/reference-compatible app-server runtime", command, strings.TrimSpace(version))
	}
	appServerArgs := codexHistoryPhase0AppServerArgs(invocation, supportsSessionSource)
	referenceRepo, referenceCommit := codexHistoryPhase0RuntimeGitSource(t, command)
	return codexHistoryPhase0LiveRuntime{
		command:                  command,
		appServerArgs:            appServerArgs,
		explicitSessionSource:    supportsSessionSource,
		invocation:               invocation,
		referenceCommit:          referenceCommit,
		referenceRepo:            referenceRepo,
		resolvedCommand:          resolvedCommand,
		selection:                selection,
		supportsSessionSourceArg: supportsSessionSource,
		version:                  strings.TrimSpace(version),
	}
}

func detectCodexHistoryPhase0AppServerInvocation(t *testing.T, command string) (string, string) {
	t.Helper()
	if help, ok := tryCodexHistoryPhase0RuntimeCommand(command, "app-server", "--help"); ok && strings.Contains(help, "--listen") {
		return "codex-cli-subcommand", help
	}
	if help, ok := tryCodexHistoryPhase0RuntimeCommand(command, "--help"); ok && strings.Contains(help, "--listen") {
		return "direct-app-server", help
	}
	t.Fatalf("live Codex runtime %s does not expose an app-server --listen interface", command)
	return "", ""
}

func codexHistoryPhase0AppServerArgs(invocation string, supportsSessionSource bool) []string {
	args := []string{}
	if invocation == "codex-cli-subcommand" {
		args = append(args, "app-server")
	}
	args = append(args, "--listen", "stdio://")
	if supportsSessionSource {
		args = append(args, "--session-source", "app-server")
	}
	return args
}

func runCodexHistoryPhase0RuntimeCommand(t *testing.T, command string, args ...string) string {
	t.Helper()
	text, ok := tryCodexHistoryPhase0RuntimeCommand(command, args...)
	if !ok {
		t.Fatalf("run live Codex runtime command %s %s failed; output=%s", command, strings.Join(args, " "), text)
	}
	if text == "" {
		t.Fatalf("live Codex runtime command %s %s returned empty output", command, strings.Join(args, " "))
	}
	return text
}

func tryCodexHistoryPhase0RuntimeCommand(command string, args ...string) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	output, err := osexec.CommandContext(ctx, command, args...).CombinedOutput()
	text := strings.TrimSpace(string(output))
	if err != nil {
		return text, false
	}
	return text, true
}

func codexHistoryPhase0RuntimeGitSource(t *testing.T, command string) (string, string) {
	t.Helper()
	repo := codexHistoryPhase0FindGitRoot(filepath.Dir(command))
	if repo == "" {
		return "", ""
	}
	output, err := osexec.Command("git", "-C", repo, "rev-parse", "HEAD").CombinedOutput()
	if err != nil {
		t.Fatalf("resolve live Codex runtime git commit for %s: %v; output=%s", repo, err, strings.TrimSpace(string(output)))
	}
	return repo, strings.TrimSpace(string(output))
}

func codexHistoryPhase0FindGitRoot(start string) string {
	dir := start
	for {
		if info, err := os.Stat(filepath.Join(dir, ".git")); err == nil && info.IsDir() {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func newCodexHistoryPhase0LiveFixture(t *testing.T) codexHistoryPhase0LiveFixture {
	t.Helper()
	appDataDir := filepath.Join(t.TempDir(), "setta-app-data")
	t.Setenv("SETTA_APP_DATA_DIR", appDataDir)
	codexHome := filepath.Join(t.TempDir(), "codex-home")
	if err := os.MkdirAll(codexHome, 0o700); err != nil {
		t.Fatalf("create temp CODEX_HOME: %v", err)
	}
	seedCodexHistoryPhase0LiveHome(t, codexHistoryPhase0SourceHome(t), codexHome)
	return codexHistoryPhase0LiveFixture{
		appDataDir:    appDataDir,
		codexHome:     codexHome,
		workspaceRoot: t.TempDir(),
	}
}

func codexHistoryPhase0SourceHome(t *testing.T) string {
	t.Helper()
	if value := os.Getenv("CODEX_HOME"); value != "" {
		return value
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("resolve user home for Codex auth seed: %v", err)
	}
	return filepath.Join(home, ".codex")
}

func seedCodexHistoryPhase0LiveHome(t *testing.T, sourceHome string, codexHome string) {
	t.Helper()
	copiedAuth := false
	for _, name := range []string{"auth.json", "config.toml", "installation_id"} {
		sourcePath := filepath.Join(sourceHome, name)
		if _, err := os.Stat(sourcePath); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			t.Fatalf("stat Codex seed file %s: %v", name, err)
		}
		copyCodexHistoryPhase0LiveFile(t, sourcePath, filepath.Join(codexHome, name))
		copiedAuth = copiedAuth || name == "auth.json"
	}
	if !copiedAuth {
		t.Skipf("Codex ChatGPT auth seed is unavailable: %s/auth.json was not found", sourceHome)
	}
}

func copyCodexHistoryPhase0LiveFile(t *testing.T, sourcePath string, destinationPath string) {
	t.Helper()
	source, err := os.Open(sourcePath)
	if err != nil {
		t.Fatalf("open Codex seed file %s: %v", filepath.Base(sourcePath), err)
	}
	defer source.Close()
	info, err := source.Stat()
	if err != nil {
		t.Fatalf("stat Codex seed file %s: %v", filepath.Base(sourcePath), err)
	}
	destination, err := os.OpenFile(destinationPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, info.Mode().Perm())
	if err != nil {
		t.Fatalf("create Codex temp seed file %s: %v", filepath.Base(destinationPath), err)
	}
	if _, err := io.Copy(destination, source); err != nil {
		_ = destination.Close()
		t.Fatalf("copy Codex seed file %s: %v", filepath.Base(sourcePath), err)
	}
	if err := destination.Close(); err != nil {
		t.Fatalf("close Codex temp seed file %s: %v", filepath.Base(destinationPath), err)
	}
}

func newCodexHistoryPhase0LiveManager(codexHome string, runtime codexHistoryPhase0LiveRuntime) *codexapp.Manager {
	return codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: runtime.command,
			Args:    runtime.appServerArgs,
			Env:     []string{"CODEX_HOME=" + codexHome},
		},
		InitializeParams: CodexInitializeParams(CodexHarnessConfig{}),
	})
}

func requireCodexHistoryPhase0LiveChatGPTAuth(t *testing.T, manager *codexapp.Manager) {
	t.Helper()
	service, err := codexaccount.NewService(manager, nil)
	if err != nil {
		t.Fatalf("create live Codex account service: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	state, err := service.Read(ctx)
	if err != nil {
		t.Fatalf("read live Codex account from temp CODEX_HOME: %v", err)
	}
	if state.Status == codexaccount.AccountStatusUnavailable {
		t.Skipf("Codex ChatGPT auth is unavailable in temp CODEX_HOME: %s", state.Diagnostic)
	}
	if state.Account == nil {
		t.Skip("Codex ChatGPT auth is not signed in for temp CODEX_HOME")
	}
	switch state.Account.Type {
	case codexaccount.AccountTypeChatGPT, codexaccount.AccountTypeChatGPTAuthTokens:
		return
	case codexaccount.AccountTypeAPIKey:
		t.Skip("Codex is signed in with API-key auth; ChatGPT auth is required")
	default:
		t.Skipf("Codex account type %s is not supported for live tests", state.Account.Type)
	}
}

func startCodexHistoryPhase0LiveThread(t *testing.T, ctx context.Context, session *codexapp.Session, workspaceRoot string) string {
	t.Helper()
	source := codexThreadSourceSettaUser
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadStart, map[string]any{
		"approvalPolicy":        "untrusted",
		"approvalsReviewer":     "user",
		"cwd":                   workspaceRoot,
		"developerInstructions": "For this validation, run the user's requested shell command before answering. Keep final answers terse.",
		"runtimeWorkspaceRoots": []string{workspaceRoot},
		"sandbox":               "workspace-write",
		"serviceName":           "setta",
		"threadSource":          source,
	})
	if err != nil {
		t.Fatalf("live thread/start: %v", err)
	}
	response, err := codexapp.DecodeThreadStartResponse(raw)
	if err != nil {
		t.Fatalf("decode live thread/start: %v", err)
	}
	if response.Thread.ID == "" {
		t.Fatal("live thread/start returned empty thread id")
	}
	if response.Thread.ThreadSource != nil && *response.Thread.ThreadSource != source {
		t.Logf("live thread/start returned threadSource %q after Setta sent %q", *response.Thread.ThreadSource, source)
	}
	if response.Thread.ThreadSource == nil {
		t.Log("live thread/start returned no threadSource")
	}
	if err := session.OwnThread(response.Thread.ID); err != nil {
		t.Fatalf("own live phase0 thread: %v", err)
	}
	return response.Thread.ID
}

func codexHistoryPhase0LiveCommandPrompt() string {
	return "Run exactly this shell command in the workspace and then reply with the observed output: printf 'setta-phase0-live-command\\n'"
}

type codexHistoryPhase0LiveTurnCapture struct {
	approvalRequests     []codexHistoryPhase0LiveApproval
	commandOutputItemIDs map[string]int
	completedItems       map[string]codexHistoryPhase0LiveItem
	methodCounts         map[string]int
	processOutputIDs     map[string]int
	startedItems         map[string]codexHistoryPhase0LiveItem
	threadID             string
	turnID               string
	turnStartedID        string
}

type codexHistoryPhase0LiveApproval struct {
	itemID    string
	method    string
	requestID string
}

type codexHistoryPhase0LiveItem struct {
	id     string
	status string
	typ    string
	raw    map[string]any
}

func newCodexHistoryPhase0LiveTurnCapture(threadID string, turnID string) codexHistoryPhase0LiveTurnCapture {
	return codexHistoryPhase0LiveTurnCapture{
		commandOutputItemIDs: map[string]int{},
		completedItems:       map[string]codexHistoryPhase0LiveItem{},
		methodCounts:         map[string]int{},
		processOutputIDs:     map[string]int{},
		startedItems:         map[string]codexHistoryPhase0LiveItem{},
		threadID:             threadID,
		turnID:               turnID,
	}
}

func (capture codexHistoryPhase0LiveTurnCapture) hasCommandActivity() bool {
	return len(capture.commandOutputItemIDs) > 0 || len(capture.approvalRequests) > 0 ||
		capture.hasItemType("commandExecution") || capture.hasItemType("command_execution")
}

func (capture codexHistoryPhase0LiveTurnCapture) hasItemType(values ...string) bool {
	want := map[string]struct{}{}
	for _, value := range values {
		want[value] = struct{}{}
	}
	for _, item := range capture.startedItems {
		if _, ok := want[item.typ]; ok {
			return true
		}
	}
	for _, item := range capture.completedItems {
		if _, ok := want[item.typ]; ok {
			return true
		}
	}
	return false
}

func runCodexHistoryPhase0LiveTurn(t *testing.T, ctx context.Context, session *codexapp.Session, threadID string, prompt string) codexHistoryPhase0LiveTurnCapture {
	t.Helper()
	raw, err := session.Call(ctx, codexapp.CodexMethodTurnStart, map[string]any{
		"approvalPolicy": "untrusted",
		"input": []map[string]any{{
			"text": prompt,
			"type": "text",
		}},
		"threadId": threadID,
	})
	if err != nil {
		t.Fatalf("live turn/start: %v", err)
	}
	started, err := codexapp.DecodeTurnStartResponse(raw)
	if err != nil {
		t.Fatalf("decode live turn/start: %v", err)
	}
	if started.Turn.ID == "" {
		t.Fatal("live turn/start returned empty turn id")
	}
	if err := session.OwnTurn(threadID, started.Turn.ID); err != nil {
		t.Fatalf("own live phase0 turn: %v", err)
	}
	capture := newCodexHistoryPhase0LiveTurnCapture(threadID, started.Turn.ID)
	return collectCodexHistoryPhase0LiveTurn(t, ctx, session, capture)
}

func collectCodexHistoryPhase0LiveTurn(t *testing.T, ctx context.Context, session *codexapp.Session, capture codexHistoryPhase0LiveTurnCapture) codexHistoryPhase0LiveTurnCapture {
	t.Helper()
	for {
		select {
		case <-ctx.Done():
			t.Fatalf("timed out waiting for live Codex phase0 turn %s: %v", capture.turnID, ctx.Err())
		case event, ok := <-session.Events():
			if !ok {
				t.Fatalf("live Codex session closed before turn %s completed", capture.turnID)
			}
			done := handleCodexHistoryPhase0LiveEvent(t, event, &capture)
			if done {
				return capture
			}
		}
	}
}

func handleCodexHistoryPhase0LiveEvent(t *testing.T, event codexapp.Event, capture *codexHistoryPhase0LiveTurnCapture) bool {
	t.Helper()
	if event.Kind == codexapp.EventLifecycle {
		t.Fatalf("live Codex app-server exited during phase0 turn: %v", event.Err)
	}
	if event.Kind != codexapp.EventNotification && event.Kind != codexapp.EventRequest {
		return false
	}
	capture.methodCounts[event.Message.Method]++
	if event.Kind == codexapp.EventRequest {
		handleCodexHistoryPhase0LiveRequest(t, event.Message, capture)
		return false
	}
	return handleCodexHistoryPhase0LiveNotification(t, event.Message, capture)
}

func handleCodexHistoryPhase0LiveRequest(t *testing.T, message codexapp.Message, capture *codexHistoryPhase0LiveTurnCapture) {
	t.Helper()
	requestID := fmt.Sprint(message.ID)
	switch message.Method {
	case codexapp.CodexServerRequestItemCommandExecutionRequestApproval,
		codexapp.CodexServerRequestItemFileChangeRequestApproval:
		itemID := phase0LiveStringFromRaw(t, message.Params, "itemId", message.Method)
		capture.approvalRequests = append(capture.approvalRequests, codexHistoryPhase0LiveApproval{
			itemID:    itemID,
			method:    message.Method,
			requestID: requestID,
		})
		if err := message.RespondResult(map[string]any{"decision": "accept"}); err != nil {
			t.Fatalf("respond to live approval request %s: %v", message.Method, err)
		}
	default:
		_ = message.RespondError(-32601, "phase0 live validation does not handle "+message.Method)
		t.Fatalf("unexpected live Codex server request %s with params %s", message.Method, string(message.Params))
	}
}

func handleCodexHistoryPhase0LiveNotification(t *testing.T, message codexapp.Message, capture *codexHistoryPhase0LiveTurnCapture) bool {
	t.Helper()
	switch message.Method {
	case codexapp.CodexNotificationTurnStarted:
		handleCodexHistoryPhase0LiveTurnStarted(t, message, capture)
	case codexapp.CodexNotificationItemStarted:
		handleCodexHistoryPhase0LiveItemStarted(t, message, capture)
	case codexapp.CodexNotificationItemCompleted:
		handleCodexHistoryPhase0LiveItemCompleted(t, message, capture)
	case codexapp.CodexNotificationItemCommandExecutionOutputDelta:
		handleCodexHistoryPhase0LiveCommandOutput(t, message, capture)
	case codexapp.CodexNotificationCommandExecOutputDelta:
		handleCodexHistoryPhase0LiveProcessOutput(t, message, capture)
	case codexapp.CodexNotificationTurnCompleted:
		return handleCodexHistoryPhase0LiveTurnCompleted(t, message, capture)
	case codexapp.CodexNotificationError:
		t.Fatalf("live Codex error notification: %s", string(message.Params))
	}
	return false
}

func handleCodexHistoryPhase0LiveTurnStarted(t *testing.T, message codexapp.Message, capture *codexHistoryPhase0LiveTurnCapture) {
	t.Helper()
	params, err := codexapp.DecodeTurnStartedNotification(message.Params)
	if err != nil {
		t.Fatalf("decode live turn/started: %v", err)
	}
	if params.ThreadID == capture.threadID && params.Turn.ID == capture.turnID {
		capture.turnStartedID = params.Turn.ID
	}
}

func handleCodexHistoryPhase0LiveItemStarted(t *testing.T, message codexapp.Message, capture *codexHistoryPhase0LiveTurnCapture) {
	t.Helper()
	params, err := codexapp.DecodeItemStartedNotification(message.Params)
	if err != nil {
		t.Fatalf("decode live item/started: %v", err)
	}
	if params.ThreadID == capture.threadID && params.TurnID == capture.turnID {
		item := codexHistoryPhase0LiveItemFromRaw(t, params.Item, "live item/started")
		capture.startedItems[item.id] = item
	}
}

func handleCodexHistoryPhase0LiveItemCompleted(t *testing.T, message codexapp.Message, capture *codexHistoryPhase0LiveTurnCapture) {
	t.Helper()
	params, err := codexapp.DecodeItemCompletedNotification(message.Params)
	if err != nil {
		t.Fatalf("decode live item/completed: %v", err)
	}
	if params.ThreadID == capture.threadID && params.TurnID == capture.turnID {
		item := codexHistoryPhase0LiveItemFromRaw(t, params.Item, "live item/completed")
		capture.completedItems[item.id] = item
	}
}

func handleCodexHistoryPhase0LiveCommandOutput(t *testing.T, message codexapp.Message, capture *codexHistoryPhase0LiveTurnCapture) {
	t.Helper()
	params, err := codexapp.DecodeCommandExecutionOutputDeltaNotification(message.Params)
	if err != nil {
		t.Fatalf("decode live command output delta: %v", err)
	}
	if params.ThreadID == capture.threadID && params.TurnID == capture.turnID && params.ItemId != "" {
		capture.commandOutputItemIDs[params.ItemId]++
	}
}

func handleCodexHistoryPhase0LiveProcessOutput(t *testing.T, message codexapp.Message, capture *codexHistoryPhase0LiveTurnCapture) {
	t.Helper()
	params, err := codexapp.DecodeCommandExecOutputDeltaNotification(message.Params)
	if err != nil {
		t.Fatalf("decode live command exec output delta: %v", err)
	}
	capture.processOutputIDs[params.ProcessId]++
}

func handleCodexHistoryPhase0LiveTurnCompleted(t *testing.T, message codexapp.Message, capture *codexHistoryPhase0LiveTurnCapture) bool {
	t.Helper()
	params, err := codexapp.DecodeTurnCompletedNotification(message.Params)
	if err != nil {
		t.Fatalf("decode live turn/completed: %v", err)
	}
	if params.ThreadID != capture.threadID || params.Turn.ID != capture.turnID {
		return false
	}
	if params.Turn.Status != codexapp.TurnStatusCompleted {
		t.Fatalf("live turn %s status = %s, want completed", capture.turnID, params.Turn.Status)
	}
	return true
}

func phase0LiveStringFromRaw(t *testing.T, raw json.RawMessage, field string, label string) string {
	t.Helper()
	var object map[string]any
	if err := json.Unmarshal(raw, &object); err != nil {
		t.Fatalf("decode %s: %v", label, err)
	}
	value, _ := object[field].(string)
	return value
}

func codexHistoryPhase0LiveItemFromRaw(t *testing.T, raw json.RawMessage, label string) codexHistoryPhase0LiveItem {
	t.Helper()
	var object map[string]any
	if err := json.Unmarshal(raw, &object); err != nil {
		t.Fatalf("decode %s item: %v", label, err)
	}
	id, _ := object["id"].(string)
	if id == "" {
		t.Fatalf("%s item has no id: %s", label, string(raw))
	}
	return codexHistoryPhase0LiveItem{
		id:     id,
		status: phase0LiveFirstNonEmptyString(object["status"], object["state"]),
		typ:    phase0LiveFirstNonEmptyString(object["type"], object["kind"]),
		raw:    object,
	}
}

func requireCodexHistoryPhase0LiveRead(t *testing.T, ctx context.Context, manager *codexapp.Manager, threadID string, turnIDs []string) codexHistoryPhase0LiveSnapshot {
	t.Helper()
	var snapshot codexHistoryPhase0LiveSnapshot
	deadline := time.Now().Add(10 * time.Second)
	for {
		raw, err := manager.Call(ctx, codexMethodThreadRead, map[string]any{
			"includeTurns": true,
			"threadId":     threadID,
		})
		if err == nil {
			page := phase0DecodeObject(t, raw, "live thread/read response")
			thread := phase0ObjectField(t, page, "thread", "live thread/read response")
			snapshot = codexHistoryPhase0LiveSnapshotFromThread(t, thread)
			allTurnsPresent := true
			for _, turnID := range turnIDs {
				if _, ok := snapshot.turnIDs[turnID]; !ok {
					allTurnsPresent = false
					break
				}
			}
			if allTurnsPresent {
				break
			}
		}
		if time.Now().After(deadline) {
			t.Fatalf("live thread/read did not include completed turns %v before deadline; last snapshot turns=%v", turnIDs, sortedStructKeys(snapshot.turnIDs))
		}
		time.Sleep(250 * time.Millisecond)
	}
	return snapshot
}

func requireCodexHistoryPhase0LiveTurnsList(t *testing.T, ctx context.Context, manager *codexapp.Manager, threadID string, turnIDs []string) codexHistoryPhase0LiveSnapshot {
	t.Helper()
	page := phase0LiveCallObject(t, ctx, manager, codexMethodThreadTurnsList, map[string]any{
		"itemsView": "full",
		"limit":     10,
		"threadId":  threadID,
	})
	turns := phase0ObjectArray(t, page, "data", "live thread/turns/list response")
	snapshot := codexHistoryPhase0LiveSnapshotFromTurns(t, turns)
	for _, turnID := range turnIDs {
		if _, ok := snapshot.turnIDs[turnID]; !ok {
			t.Fatalf("live thread/turns/list turn ids = %v, want %s", sortedStructKeys(snapshot.turnIDs), turnID)
		}
	}
	return snapshot
}

func requireCodexHistoryPhase0LiveThreadList(t *testing.T, ctx context.Context, manager *codexapp.Manager, workspaceRoot string, threadID string) (bool, string, map[string][]string, string) {
	t.Helper()
	page := phase0LiveCallObject(t, ctx, manager, codexMethodThreadList, map[string]any{
		"cwd":         workspaceRoot,
		"limit":       50,
		"sourceKinds": []string{"appServer"},
	})
	threads := phase0ObjectArray(t, page, "data", "live thread/list response")
	if thread := phase0LiveFindThread(threads, threadID); thread != nil {
		return true, "", nil, stringFieldValue(thread["threadSource"])
	}
	diagnostics := codexHistoryPhase0LiveListDiagnostics(t, ctx, manager, workspaceRoot)
	diagnostics["filtered"] = phase0LiveThreadSummaries(threads)
	return false, fmt.Sprintf("thread/list exact cwd + sourceKinds [appServer] did not return thread %s", threadID), diagnostics, ""
}

type codexHistoryPhase0LiveSnapshot struct {
	items        map[string]codexHistoryPhase0LiveItem
	threadSource string
	turnIDs      map[string]struct{}
}

func codexHistoryPhase0LiveSnapshotFromThread(t *testing.T, thread map[string]any) codexHistoryPhase0LiveSnapshot {
	t.Helper()
	snapshot := codexHistoryPhase0LiveSnapshot{
		items:        map[string]codexHistoryPhase0LiveItem{},
		threadSource: stringFieldValue(thread["threadSource"]),
		turnIDs:      map[string]struct{}{},
	}
	for _, turn := range phase0ObjectArray(t, thread, "turns", "live thread") {
		turnID := phase0StringField(t, turn, "id", "live thread turn")
		snapshot.turnIDs[turnID] = struct{}{}
		for _, item := range phase0ObjectArray(t, turn, "items", "live thread turn") {
			persisted := codexHistoryPhase0LiveItemFromObject(t, item, "live persisted item")
			snapshot.items[persisted.id] = persisted
		}
	}
	return snapshot
}

func phase0LiveFindThread(threads []map[string]any, threadID string) map[string]any {
	for _, thread := range threads {
		if thread["id"] == threadID {
			return thread
		}
	}
	return nil
}

func codexHistoryPhase0LiveListDiagnostics(t *testing.T, ctx context.Context, manager *codexapp.Manager, workspaceRoot string) map[string][]string {
	t.Helper()
	queries := map[string]map[string]any{
		"noFilters":        {"limit": 10, "sourceKinds": []string{}},
		"appServerOnly":    {"limit": 10, "sourceKinds": []string{"appServer"}},
		"cwdOnly":          {"cwd": workspaceRoot, "limit": 10, "sourceKinds": []string{}},
		"cwdStateDBOnly":   {"cwd": workspaceRoot, "limit": 10, "sourceKinds": []string{"appServer"}, "useStateDbOnly": true},
		"defaultSourceCWD": {"cwd": workspaceRoot, "limit": 10},
	}
	diagnostics := map[string][]string{}
	for label, params := range queries {
		raw, err := manager.Call(ctx, codexMethodThreadList, params)
		if err != nil {
			diagnostics[label] = []string{"error: " + err.Error()}
			continue
		}
		page := phase0DecodeObject(t, raw, "live thread/list diagnostics "+label)
		diagnostics[label] = phase0LiveThreadSummaries(phase0ObjectArray(t, page, "data", "live thread/list diagnostics "+label))
	}
	return diagnostics
}

func phase0LiveThreadSummaries(threads []map[string]any) []string {
	summaries := make([]string, 0, len(threads))
	for _, thread := range threads {
		summaries = append(summaries, fmt.Sprintf("id=%s source=%s threadSource=%s cwd=%s",
			stringFieldValue(thread["id"]),
			phase0LiveJSONSummary(thread["source"]),
			stringFieldValue(thread["threadSource"]),
			phase0LiveJSONSummary(thread["cwd"]),
		))
	}
	sort.Strings(summaries)
	return summaries
}

func phase0LiveJSONSummary(value any) string {
	if value == nil {
		return ""
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("%v", value)
	}
	text := string(raw)
	if len(text) > 160 {
		return text[:160] + "..."
	}
	return text
}

func codexHistoryPhase0LiveSnapshotFromTurns(t *testing.T, turns []map[string]any) codexHistoryPhase0LiveSnapshot {
	t.Helper()
	snapshot := codexHistoryPhase0LiveSnapshot{
		items:   map[string]codexHistoryPhase0LiveItem{},
		turnIDs: map[string]struct{}{},
	}
	for _, turn := range turns {
		turnID := phase0StringField(t, turn, "id", "live turns page turn")
		snapshot.turnIDs[turnID] = struct{}{}
		for _, item := range phase0ObjectArray(t, turn, "items", "live turns page turn") {
			persisted := codexHistoryPhase0LiveItemFromObject(t, item, "live turns page persisted item")
			snapshot.items[persisted.id] = persisted
		}
	}
	return snapshot
}

func codexHistoryPhase0LiveItemFromObject(t *testing.T, object map[string]any, label string) codexHistoryPhase0LiveItem {
	t.Helper()
	id, _ := object["id"].(string)
	if id == "" {
		t.Fatalf("%s has no id: %+v", label, object)
	}
	return codexHistoryPhase0LiveItem{
		id:     id,
		status: phase0LiveFirstNonEmptyString(object["status"], object["state"]),
		typ:    phase0LiveFirstNonEmptyString(object["type"], object["kind"]),
		raw:    object,
	}
}

func requireCodexHistoryPhase0LiveTurnAndItemObservations(t *testing.T, label string, capture codexHistoryPhase0LiveTurnCapture, snapshot codexHistoryPhase0LiveSnapshot) {
	t.Helper()
	if _, ok := snapshot.turnIDs[capture.turnID]; !ok {
		t.Fatalf("live turn id %s was absent from persisted %s history", capture.turnID, label)
	}
	if capture.turnStartedID != "" && capture.turnStartedID != capture.turnID {
		t.Fatalf("live turn/started id = %s, want turn/start id %s", capture.turnStartedID, capture.turnID)
	}
	for _, approval := range capture.approvalRequests {
		if approval.itemID == "" {
			continue
		}
		_, _ = snapshot.items[approval.itemID]
	}
	startedReconciled, startedMissing := codexHistoryPhase0LiveReconciledItemIDs(capture.startedItems, snapshot)
	completedReconciled, completedMissing := codexHistoryPhase0LiveReconciledItemIDs(capture.completedItems, snapshot)
	t.Logf("phase0 live ID observations %s: turn=%s started_reconciled=%v started_missing=%v completed_reconciled=%v completed_missing=%v command_output_items=%v approval_request_ids=%v",
		label,
		capture.turnID,
		startedReconciled,
		startedMissing,
		completedReconciled,
		completedMissing,
		sortedStringKeys(capture.commandOutputItemIDs),
		codexHistoryPhase0LiveApprovalRequestIDs(capture.approvalRequests),
	)
}

func requireCodexHistoryPhase0LiveOverlayKeyMetadata(t *testing.T, capture codexHistoryPhase0LiveTurnCapture) {
	t.Helper()
	if capture.threadID == "" || capture.turnID == "" {
		t.Fatalf("live overlay key base is incomplete: thread=%q turn=%q", capture.threadID, capture.turnID)
	}
	keys := codexHistoryPhase0LiveOverlayKeys(capture)
	if len(keys) == 0 {
		t.Fatalf("live command/tool/approval activity exposed no turn-scoped provider/request key for overlay; methods=%v", capture.methodCounts)
	}
	t.Logf("phase0 live Setta overlay keys: %v", keys)
}

func codexHistoryPhase0LiveOverlayKeys(capture codexHistoryPhase0LiveTurnCapture) []string {
	keys := []string{}
	add := func(kind string, id string) {
		if id == "" {
			return
		}
		keys = append(keys, fmt.Sprintf("%s:%s:%s:%s", capture.threadID, capture.turnID, kind, id))
	}
	for _, item := range capture.startedItems {
		if item.typ == "commandExecution" || item.typ == "command_execution" {
			add("command", item.id)
		}
	}
	for _, item := range capture.completedItems {
		if item.typ == "commandExecution" || item.typ == "command_execution" {
			add("command", item.id)
		}
	}
	for itemID := range capture.commandOutputItemIDs {
		add("commandOutput", itemID)
	}
	for processID := range capture.processOutputIDs {
		add("processOutput", processID)
	}
	for _, approval := range capture.approvalRequests {
		add("approvalRequest", approval.requestID)
		add("approvalItem", approval.itemID)
	}
	return uniqueSortedStrings(keys)
}

func codexHistoryPhase0LiveReconciledItemIDs(items map[string]codexHistoryPhase0LiveItem, snapshot codexHistoryPhase0LiveSnapshot) ([]string, []string) {
	reconciled := []string{}
	missing := []string{}
	for itemID := range items {
		if _, ok := snapshot.items[itemID]; ok {
			reconciled = append(reconciled, itemID)
			continue
		}
		missing = append(missing, itemID)
	}
	sort.Strings(reconciled)
	sort.Strings(missing)
	return reconciled, missing
}

func codexHistoryPhase0LiveApprovalRequestIDs(approvals []codexHistoryPhase0LiveApproval) []string {
	ids := make([]string, 0, len(approvals))
	for _, approval := range approvals {
		ids = append(ids, approval.requestID)
	}
	sort.Strings(ids)
	return ids
}

func codexHistoryPhase0LiveItemSummaries(items map[string]codexHistoryPhase0LiveItem) []string {
	summaries := make([]string, 0, len(items))
	for _, item := range items {
		summaries = append(summaries, fmt.Sprintf("%s:%s:%s", item.id, item.typ, item.status))
	}
	sort.Strings(summaries)
	return summaries
}

type codexHistoryPhase0LiveLatency struct {
	firstTranscriptPage time.Duration
	olderTranscriptPage time.Duration
	threadList          time.Duration
}

func measureCodexHistoryPhase0LiveLatency(t *testing.T, ctx context.Context, manager *codexapp.Manager, workspaceRoot string, threadID string) codexHistoryPhase0LiveLatency {
	t.Helper()
	threadListDuration, listPage := phase0LiveTimedCallObject(t, ctx, manager, codexMethodThreadList, map[string]any{
		"cwd":         workspaceRoot,
		"limit":       50,
		"sourceKinds": []string{"appServer"},
	})
	if len(phase0ObjectArray(t, listPage, "data", "live latency thread/list response")) == 0 {
		t.Log("live thread/list exact cwd + appServer returned no threads for latency measurement")
	}
	firstPageDuration, firstPage := phase0LiveTimedCallObject(t, ctx, manager, codexMethodThreadTurnsList, map[string]any{
		"itemsView": "full",
		"limit":     1,
		"threadId":  threadID,
	})
	firstTurns := phase0ObjectArray(t, firstPage, "data", "live first transcript page")
	if len(firstTurns) != 1 {
		t.Fatalf("live first transcript page size = %d, want 1", len(firstTurns))
	}
	firstSnapshot := codexHistoryPhase0LiveSnapshotFromTurns(t, firstTurns)
	nextCursor := phase0LiveOptionalString(firstPage, "nextCursor")
	if nextCursor == "" {
		t.Fatalf("live first transcript page has no nextCursor; turns=%v", sortedStructKeys(firstSnapshot.turnIDs))
	}
	olderPageDuration, olderPage := phase0LiveTimedCallObject(t, ctx, manager, codexMethodThreadTurnsList, map[string]any{
		"cursor":    nextCursor,
		"itemsView": "full",
		"limit":     1,
		"threadId":  threadID,
	})
	olderTurns := phase0ObjectArray(t, olderPage, "data", "live older transcript page")
	if len(olderTurns) != 1 {
		t.Fatalf("live older transcript page size = %d, want 1", len(olderTurns))
	}
	return codexHistoryPhase0LiveLatency{
		firstTranscriptPage: firstPageDuration,
		olderTranscriptPage: olderPageDuration,
		threadList:          threadListDuration,
	}
}

func phase0LiveCallObject(t *testing.T, ctx context.Context, manager *codexapp.Manager, method string, params any) map[string]any {
	t.Helper()
	raw, err := manager.Call(ctx, method, params)
	if err != nil {
		t.Fatalf("live %s: %v", method, err)
	}
	return phase0DecodeObject(t, raw, "live "+method+" response")
}

func phase0LiveTimedCallObject(t *testing.T, ctx context.Context, manager *codexapp.Manager, method string, params any) (time.Duration, map[string]any) {
	t.Helper()
	startedAt := time.Now()
	response := phase0LiveCallObject(t, ctx, manager, method, params)
	return time.Since(startedAt), response
}

func phase0LiveOptionalString(object map[string]any, field string) string {
	value, _ := object[field].(string)
	return value
}

func codexHistoryPhase0LiveOverlayGaps(capture codexHistoryPhase0LiveTurnCapture, snapshot codexHistoryPhase0LiveSnapshot) []string {
	gaps := []string{}
	for processID := range capture.processOutputIDs {
		gaps = append(gaps, "process-scoped command/exec output processId "+processID+" is not a persisted ThreadItem id")
	}
	for _, approval := range capture.approvalRequests {
		item := snapshot.items[approval.itemID]
		if item.id == "" {
			gaps = append(gaps, fmt.Sprintf("%s item id %s is absent from persisted history", approval.method, approval.itemID))
			continue
		}
		if !rawObjectContainsString(item.raw, approval.requestID) {
			gaps = append(gaps, fmt.Sprintf("%s request id %s is absent from persisted item %s", approval.method, approval.requestID, approval.itemID))
		}
	}
	for itemID := range capture.commandOutputItemIDs {
		item := snapshot.items[itemID]
		if !rawObjectHasAnyField(item.raw, "output", "outputText", "aggregatedOutput") {
			gaps = append(gaps, "incremental command output text for item "+itemID+" is absent as a named persisted field")
		}
	}
	if len(capture.approvalRequests) == 0 {
		gaps = append(gaps, "no approval request was emitted by this live command turn")
	}
	if len(gaps) == 0 {
		gaps = append(gaps, "none observed for the live command turn")
	}
	sort.Strings(gaps)
	return gaps
}

func rawObjectContainsString(object map[string]any, needle string) bool {
	if needle == "" {
		return false
	}
	raw, err := json.Marshal(object)
	if err != nil {
		return false
	}
	return strings.Contains(string(raw), needle)
}

func rawObjectHasAnyField(object map[string]any, fields ...string) bool {
	for _, field := range fields {
		if object[field] != nil {
			return true
		}
	}
	return false
}

func sortedStringKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func uniqueSortedStrings(values []string) []string {
	seen := map[string]struct{}{}
	for _, value := range values {
		if value != "" {
			seen[value] = struct{}{}
		}
	}
	return sortedStructKeys(seen)
}

func sortedStructKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func phase0LiveFirstNonEmptyString(values ...any) string {
	for _, value := range values {
		text, _ := value.(string)
		if text != "" {
			return text
		}
	}
	return ""
}

func stringFieldValue(value any) string {
	text, _ := value.(string)
	return text
}

func unsetCodexHistoryPhase0LiveEnv(t *testing.T, names ...string) {
	t.Helper()
	for _, name := range names {
		value, ok := os.LookupEnv(name)
		if err := os.Unsetenv(name); err != nil {
			t.Fatalf("unset %s: %v", name, err)
		}
		t.Cleanup(func() {
			if ok {
				if err := os.Setenv(name, value); err != nil {
					t.Fatalf("restore %s: %v", name, err)
				}
				return
			}
			if err := os.Unsetenv(name); err != nil {
				t.Fatalf("restore unset %s: %v", name, err)
			}
		})
	}
}
