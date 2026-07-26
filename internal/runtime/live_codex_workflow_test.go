package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/conversation/artifactdoc"
	"setta/internal/director"
	"setta/internal/httpapi"
	"setta/internal/workspacesession"
)

// Removing the conversation router removed the only way a test could put work
// into a conversation directly, and with it two live acceptance tests whose
// coverage the Director has not replaced yet:
//
//   - provider-thread restart continuity across a backend restart, plus
//     concurrent topic isolation, mid-turn steering and cancellation;
//   - multi-turn topic work with automatic final narration, and a narrator
//     status reply that leaves the parent turn untouched.
//
// Both are worth rebuilding against Director intents (submit / steer_work /
// cancel_run / ask_conversation). They are not written here because each is a
// multi-minute live run whose assertions need to be designed against the
// Director's own snapshot, not translated from the routed shape.
const (
	// A five-artifact request is several provider turns of work, so the wait is
	// longer than a single-turn live snapshot wait.
	runtimeLiveDirectorSnapshotWaitTimeout  = 8 * time.Minute
	runtimeLiveDirectorSnapshotPollInterval = 2 * time.Second
)

func TestBackendDirectorCommandCenterWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)
	isolation := newLiveCarrierIsolation(t, "director")

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer func() {
		if server != nil {
			shutdownServer(t, server)
		}
	}()

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 3*time.Minute)
	baseURL := "http://" + server.Addr()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](
		t,
		client,
		baseURL,
		"/workspaces/open",
		httpapi.OpenWorkspaceRequest{RootPath: t.TempDir()},
		http.StatusOK,
	)
	created := postRuntimeJSON[director.DirectorReceipt](
		t,
		client,
		baseURL,
		"/director/intents/dispatch",
		httpapi.DispatchDirectorIntentRequest{Intent: director.DirectorIntent{
			Kind: director.DirectorIntentSubmit,
			Submit: &director.DirectorSubmitIntent{
				Text: isolation.prompt(
					"Create a new conversation titled Live Director workstream in the currently open " +
						"workspace, and leave it idle. After it is created, answer exactly " +
						"DIRECTOR_TOOL_HISTORY and no other text.",
				),
				Modality: director.DecisionIntentModalityText,
			},
		}},
		http.StatusOK,
	)
	createdSubmit := requireLiveDirectorReply(t, "live Director receipt", created, "DIRECTOR_TOOL_HISTORY")
	createdWorkstreamID := requireLiveDirectorCreatedWorkstreamID(t, createdSubmit)
	requireLiveDirectorFolderWorkstream(
		t,
		getRuntimeJSON[director.DirectorSnapshot](t, client, baseURL, "/director/snapshot"),
		createdWorkstreamID,
		opened.Workspace.ID,
	)

	firstServer := server
	server = nil
	shutdownServer(t, firstServer)
	server, ready = startRuntimeTestServer(t, config)
	client = authenticatedRuntimeTestClient(ready.BootstrapToken, 3*time.Minute)
	baseURL = "http://" + server.Addr()

	reply := postRuntimeJSON[director.DirectorReceipt](
		t,
		client,
		baseURL,
		"/director/intents/dispatch",
		httpapi.DispatchDirectorIntentRequest{Intent: director.DirectorIntent{
			Kind: director.DirectorIntentSubmit,
			Submit: &director.DirectorSubmitIntent{
				Text: "Without calling a tool, repeat exactly the marker you gave after creating the workstream " +
					"in the previous turn.",
				Modality: director.DecisionIntentModalityText,
			},
		}},
		http.StatusOK,
	)
	replySubmit := requireLiveDirectorReply(
		t,
		"live Director conversation reply",
		reply,
		"DIRECTOR_TOOL_HISTORY",
	)
	if len(replySubmit.ToolCalls) != 0 {
		t.Fatalf("live Director answered from replayed history with tools: %+v", replySubmit.ToolCalls)
	}

	restarted := postRuntimeJSON[director.DirectorReceipt](
		t,
		client,
		baseURL,
		"/director/intents/dispatch",
		httpapi.DispatchDirectorIntentRequest{Intent: director.DirectorIntent{
			Kind: director.DirectorIntentSubmit,
			Submit: &director.DirectorSubmitIntent{
				Text: "Call setta.list_workstreams. After it succeeds, answer exactly " +
					"DIRECTOR_RESTART_TOOLS_OK and no other text.",
				Modality: director.DecisionIntentModalityText,
			},
		}},
		http.StatusOK,
	)
	restartedSubmit := requireLiveDirectorReply(
		t,
		"restarted live Director receipt",
		restarted,
		"DIRECTOR_RESTART_TOOLS_OK",
	)
	if !liveDirectorSucceededAtTool(restartedSubmit, "list_workstreams") {
		t.Fatalf("restarted live Director tool calls = %+v, want a successful list_workstreams", restartedSubmit.ToolCalls)
	}
}

func requireLiveDirectorReply(
	t *testing.T,
	label string,
	receipt director.DirectorReceipt,
	marker string,
) director.DirectorTurnReceipt {
	t.Helper()
	if receipt.Submit != nil &&
		strings.HasSuffix(strings.TrimSpace(receipt.Submit.ReplyText), marker) {
		return *receipt.Submit
	}
	encoded, err := json.MarshalIndent(receipt, "", "  ")
	if err != nil {
		t.Fatalf("encode invalid %s: %v", label, err)
	}
	t.Fatalf("%s = %s, want a reply ending in %s", label, encoded, marker)
	return director.DirectorTurnReceipt{}
}

func requireLiveDirectorCreatedWorkstreamID(
	t *testing.T,
	submit director.DirectorTurnReceipt,
) string {
	t.Helper()
	createdWorkstreamID := ""
	listedWorkspaces := false
	for _, call := range submit.ToolCalls {
		switch call.Tool {
		case "list_workspaces":
			listedWorkspaces = call.Succeeded
		case "create_workstream":
			if call.Succeeded && call.WorkstreamID != nil {
				createdWorkstreamID = *call.WorkstreamID
			}
		}
	}
	if !listedWorkspaces || createdWorkstreamID == "" {
		t.Fatalf("live Director tool calls = %+v, want successful workspace list and create", submit.ToolCalls)
	}
	return createdWorkstreamID
}

func requireLiveDirectorFolderWorkstream(
	t *testing.T,
	snapshot director.DirectorSnapshot,
	workstreamID string,
	workspaceID string,
) {
	t.Helper()
	if snapshot.SelectedWorkstreamID == nil || *snapshot.SelectedWorkstreamID != workstreamID {
		t.Fatalf("live Director selection = %v, want %s", snapshot.SelectedWorkstreamID, workstreamID)
	}
	for index := range snapshot.Workstreams {
		workstream := snapshot.Workstreams[index].Workstream
		if workstream.ID != workstreamID {
			continue
		}
		if workstream.ResourceScope.Kind != director.WorkstreamResourceScopeFolder ||
			workstream.ResourceScope.Folder == nil ||
			workstream.ResourceScope.Folder.WorkspaceID != workspaceID {
			t.Fatalf("live Director created workstream = %+v, want workspace %s", workstream, workspaceID)
		}
		return
	}
	t.Fatalf("live Director snapshot has no workstream %s: %+v", workstreamID, snapshot.Workstreams)
}

func liveDirectorSucceededAtTool(submit director.DirectorTurnReceipt, tool string) bool {
	for _, call := range submit.ToolCalls {
		if call.Tool == tool && call.Succeeded {
			return true
		}
	}
	return false
}

// sendRuntimeLiveDirectorWork is the only way live work starts. The Director
// owns which workstream a request lands in, so the test states the request and
// asserts on what the command center published, never on a conversation the
// test picked itself.
func sendRuntimeLiveDirectorWork(
	t *testing.T,
	client *http.Client,
	baseURL string,
	text string,
) director.DirectorReceipt {
	t.Helper()
	return postRuntimeJSON[director.DirectorReceipt](
		t,
		client,
		baseURL,
		"/director/intents/dispatch",
		httpapi.DispatchDirectorIntentRequest{Intent: director.DirectorIntent{
			Kind: director.DirectorIntentSubmit,
			Submit: &director.DirectorSubmitIntent{
				Text:     text,
				Modality: director.DecisionIntentModalityText,
			},
		}},
		http.StatusOK,
	)
}

func TestBackendTopicConversationArtifactWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)
	isolation := newLiveCarrierIsolation(t, "topicartifact")

	const expectedTableTitle = "Language line counts"

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 8*time.Minute)
	baseURL := "http://" + server.Addr()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	sendRuntimeLiveDirectorWork(
		t,
		client,
		baseURL,
		isolation.prompt(fmt.Sprintf(
			"Using only this supplied dataset: Go=34, TypeScript=21, CSS=8. Create a durable "+
				"user-facing table titled %s with columns language and lines, and one row per "+
				"supplied language. Final prose should only confirm that the table is ready.",
			expectedTableTitle,
		)),
	)
	snapshot := waitForRuntimeLiveDirectorSnapshot(
		t,
		client,
		baseURL,
		"structured table artifact published",
		func(candidate director.DirectorSnapshot) bool {
			return len(runtimeLiveAvailableArtifacts(candidate)) >= 1 && runtimeLiveDirectorIsIdle(candidate)
		},
	)
	metadata := runtimeLiveTableArtifactMetadata(t, snapshot, expectedTableTitle)
	if metadata.WorkspaceID == nil || *metadata.WorkspaceID != opened.Workspace.ID {
		t.Fatalf("live table artifact left the open workspace: %+v", metadata)
	}
	artifact := postRuntimeJSON[conversation.Artifact](
		t,
		client,
		baseURL,
		"/conversations/artifacts/read",
		httpapi.ReadConversationArtifactRequest{
			WorkspaceID:    metadata.WorkspaceID,
			ConversationID: metadata.ConversationID,
			ArtifactID:     metadata.ID,
		},
		http.StatusOK,
	)
	assertRuntimeLiveTableArtifact(t, expectedTableTitle, metadata, artifact)
}

// TestBackendUnboundNativeArtifactsWithLiveCodex replays the recorded failure
// that this plan corrects: with zero open workspaces, the user asked for
// several varied Setta artifacts and got a website workstream waiting for a
// project folder. The assertions stay behavioral — the work must start without
// a folder and publish more than one separately viewable artifact — because the
// number and composition of artifacts is the model's judgment, not a count the
// product enforces.
func TestBackendUnboundNativeArtifactsWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)
	isolation := newLiveCarrierIsolation(t, "unboundartifacts")

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 10*time.Minute)
	baseURL := "http://" + server.Addr()
	session := getRuntimeJSON[workspacesession.WorkspaceSession](t, client, baseURL, "/workspace-session")
	if len(session.ActiveWorkspaces) != 0 || session.SelectedWorkspaceID != "" {
		t.Fatalf("live unbound artifact run started with workspaces: %+v", session)
	}

	postRuntimeJSON[director.DirectorReceipt](
		t,
		client,
		baseURL,
		"/director/intents/dispatch",
		httpapi.DispatchDirectorIntentRequest{Intent: director.DirectorIntent{
			Kind: director.DirectorIntentSubmit,
			Submit: &director.DirectorSubmitIntent{
				Text: isolation.prompt(
					"Hey I want to see the artifact functionality in this app. Can you create 5 " +
						"interesting artifacts for me to look at. Make sure they have variety! " +
						"Mixed content artifacts would be great too!",
				),
				Modality: director.DecisionIntentModalityText,
			},
		}},
		http.StatusOK,
	)
	snapshot := waitForRuntimeLiveDirectorSnapshot(
		t,
		client,
		baseURL,
		"native artifacts published without a workspace",
		func(candidate director.DirectorSnapshot) bool {
			return len(runtimeLiveAvailableArtifacts(candidate)) >= 2 &&
				runtimeLiveDirectorIsIdle(candidate)
		},
	)
	if len(snapshot.UnresolvedResourceRequests) != 0 {
		t.Fatalf("live unbound artifact work opened a folder request: %+v", snapshot.UnresolvedResourceRequests)
	}
	for index := range snapshot.Workstreams {
		workstream := snapshot.Workstreams[index].Workstream
		if workstream.ResourceScope.Kind != director.WorkstreamResourceScopeFolderless {
			t.Fatalf("live unbound artifact workstream bound a folder: %+v", workstream)
		}
	}
	after := getRuntimeJSON[workspacesession.WorkspaceSession](t, client, baseURL, "/workspace-session")
	if len(after.ActiveWorkspaces) != 0 {
		t.Fatalf("live unbound artifact run registered a workspace: %+v", after)
	}
	assertRuntimeLiveSeparateArtifacts(t, client, baseURL, runtimeLiveAvailableArtifacts(snapshot))
}

func runtimeLiveAvailableArtifacts(snapshot director.DirectorSnapshot) []director.WorkstreamArtifact {
	var available []director.WorkstreamArtifact
	for _, artifact := range snapshot.Artifacts {
		if artifact.Status == director.ArtifactStatusAvailable {
			available = append(available, artifact)
		}
	}
	return available
}

func runtimeLiveDirectorIsIdle(snapshot director.DirectorSnapshot) bool {
	for index := range snapshot.Workstreams {
		if snapshot.Workstreams[index].Workstream.ActiveRunID != nil {
			return false
		}
	}
	return len(snapshot.Workstreams) > 0
}

// assertRuntimeLiveSeparateArtifacts reads every published artifact back through
// the folderless artifact-read contract and proves each one is its own OpenUI
// document rather than one gallery the rail happens to list several times.
func assertRuntimeLiveSeparateArtifacts(
	t *testing.T,
	client *http.Client,
	baseURL string,
	artifacts []director.WorkstreamArtifact,
) {
	t.Helper()
	sources := map[string]string{}
	for _, metadata := range artifacts {
		read := postRuntimeJSON[conversation.Artifact](
			t,
			client,
			baseURL,
			"/conversations/artifacts/read",
			httpapi.ReadConversationArtifactRequest{
				WorkspaceID:    metadata.WorkspaceID,
				ConversationID: metadata.ConversationID,
				ArtifactID:     metadata.ID,
			},
			http.StatusOK,
		)
		if read.Document.Language != conversation.ArtifactDocumentLanguageOpenUI ||
			read.Document.CatalogID != conversation.ArtifactCatalogSettaV1 {
			t.Fatalf("live unbound artifact %s document = %+v", metadata.ID, read.Document)
		}
		if _, err := artifactdoc.Compile(artifactdoc.SettaCatalogV1(), read.Document.Source); err != nil {
			t.Fatalf("compile live unbound artifact %s: %v", metadata.ID, err)
		}
		if existing, duplicated := sources[read.Document.Source]; duplicated {
			t.Fatalf("live artifacts %s and %s published the same document", existing, metadata.ID)
		}
		sources[read.Document.Source] = metadata.ID
	}
}

func waitForRuntimeLiveDirectorSnapshot(
	t *testing.T,
	client *http.Client,
	baseURL string,
	description string,
	condition func(director.DirectorSnapshot) bool,
) director.DirectorSnapshot {
	t.Helper()
	deadline := time.Now().Add(runtimeLiveDirectorSnapshotWaitTimeout)
	var last director.DirectorSnapshot
	for time.Now().Before(deadline) {
		last = getRuntimeJSON[director.DirectorSnapshot](t, client, baseURL, "/director/snapshot")
		if condition(last) {
			return last
		}
		time.Sleep(runtimeLiveDirectorSnapshotPollInterval)
	}
	t.Fatalf("timed out waiting for live %s; snapshot=%+v", description, last)
	return director.DirectorSnapshot{}
}

func runtimeLiveTableArtifactMetadata(
	t *testing.T,
	snapshot director.DirectorSnapshot,
	title string,
) director.WorkstreamArtifact {
	t.Helper()
	var matches []director.WorkstreamArtifact
	for _, artifact := range runtimeLiveAvailableArtifacts(snapshot) {
		if artifact.Title == title {
			matches = append(matches, artifact)
		}
	}
	if len(matches) != 1 {
		t.Fatalf("live table artifact count = %d, want 1; artifacts=%+v", len(matches), snapshot.Artifacts)
	}
	return matches[0]
}

func assertRuntimeLiveTableArtifact(
	t *testing.T,
	expectedTitle string,
	metadata director.WorkstreamArtifact,
	artifact conversation.Artifact,
) {
	t.Helper()
	if metadata.ID != artifact.ID ||
		metadata.ConversationID != artifact.ConversationID ||
		metadata.Title != artifact.Title ||
		metadata.Title != expectedTitle ||
		artifact.Document.Language != conversation.ArtifactDocumentLanguageOpenUI ||
		artifact.Document.CatalogID != conversation.ArtifactCatalogSettaV1 {
		t.Fatalf("live table artifact metadata=%+v artifact=%+v", metadata, artifact)
	}
	rows := runtimeLiveArtifactTableRows(t, artifact)
	for _, want := range [][2]string{{"Go", "34"}, {"TypeScript", "21"}, {"CSS", "8"}} {
		if !runtimeLiveArtifactTableContains(rows, want[0], want[1]) {
			t.Fatalf("live table artifact rows = %+v, missing %s=%s in %q", rows, want[0], want[1], artifact.Document.Source)
		}
	}
}

// runtimeLiveArtifactTableRows compiles the stored document the same way the
// backend accepted it and returns the first table's rows, so the live assertion
// reads the model's data rather than its source text.
func runtimeLiveArtifactTableRows(t *testing.T, artifact conversation.Artifact) [][]string {
	t.Helper()
	document, err := artifactdoc.Compile(artifactdoc.SettaCatalogV1(), artifact.Document.Source)
	if err != nil {
		t.Fatalf("compile live artifact document %q: %v", artifact.Document.Source, err)
	}
	table, found := findLiveArtifactNode(document.Root, artifactdoc.ComponentTable)
	if !found {
		t.Fatalf("live artifact document has no table: %q", artifact.Document.Source)
	}
	rawRows, ok := table.Props["rows"].([]any)
	if !ok {
		t.Fatalf("live artifact table rows = %+v", table.Props["rows"])
	}
	rows := make([][]string, 0, len(rawRows))
	for _, rawRow := range rawRows {
		cells, ok := rawRow.([]any)
		if !ok {
			t.Fatalf("live artifact table row = %+v", rawRow)
		}
		row := make([]string, 0, len(cells))
		for _, cell := range cells {
			text, ok := cell.(string)
			if !ok {
				t.Fatalf("live artifact table cell = %+v", cell)
			}
			row = append(row, text)
		}
		rows = append(rows, row)
	}
	return rows
}

func findLiveArtifactNode(node artifactdoc.Node, component artifactdoc.ComponentName) (artifactdoc.Node, bool) {
	if node.Component == component {
		return node, true
	}
	for _, property := range node.Props {
		if found, ok := findLiveArtifactNodeInValue(property, component); ok {
			return found, true
		}
	}
	return artifactdoc.Node{}, false
}

func findLiveArtifactNodeInValue(value any, component artifactdoc.ComponentName) (artifactdoc.Node, bool) {
	switch typed := value.(type) {
	case artifactdoc.Node:
		return findLiveArtifactNode(typed, component)
	case []any:
		for _, item := range typed {
			if found, ok := findLiveArtifactNodeInValue(item, component); ok {
				return found, true
			}
		}
	case map[string]any:
		for _, item := range typed {
			if found, ok := findLiveArtifactNodeInValue(item, component); ok {
				return found, true
			}
		}
	}
	return artifactdoc.Node{}, false
}

func runtimeLiveArtifactTableContains(rows [][]string, language string, lines string) bool {
	for _, row := range rows {
		if len(row) >= 2 && strings.EqualFold(strings.TrimSpace(row[0]), language) &&
			strings.TrimSpace(row[1]) == lines {
			return true
		}
	}
	return false
}

func getRuntimeJSON[T any](t *testing.T, client *http.Client, baseURL string, path string) T {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, baseURL+path, nil)
	if err != nil {
		t.Fatalf("create GET %s: %v", path, err)
	}
	return doRuntimeJSON[T](t, client, request, http.StatusOK)
}

func postRuntimeJSON[T any](t *testing.T, client *http.Client, baseURL string, path string, payload any, wantStatus int) T {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal %s payload: %v", path, err)
	}
	request, err := http.NewRequest(http.MethodPost, baseURL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("create POST %s: %v", path, err)
	}
	request.Header.Set("Content-Type", "application/json")
	return doRuntimeJSON[T](t, client, request, wantStatus)
}

func doRuntimeJSON[T any](t *testing.T, client *http.Client, request *http.Request, wantStatus int) T {
	t.Helper()

	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("%s %s: %v", request.Method, request.URL.Path, err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read %s response: %v", request.URL.Path, err)
	}
	if response.StatusCode != wantStatus {
		t.Fatalf("%s status = %d, want %d, body: %s", request.URL.Path, response.StatusCode, wantStatus, string(body))
	}
	var decoded T
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatalf("decode %s response: %v; body: %s", request.URL.Path, err, string(body))
	}
	return decoded
}

func requireRuntimeLiveCodexChatGPTAuth(t *testing.T) {
	t.Helper()
	if os.Getenv("SETTA_LIVE_CODEX") != "1" {
		t.Skip("set SETTA_LIVE_CODEX=1 to run the ChatGPT-authenticated Codex integration")
	}

	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: "codex",
			Args:    []string{"app-server", "--listen", "stdio://"},
		},
		InitializeParams: map[string]any{
			"clientInfo": map[string]any{
				"name":    "setta-live-test",
				"title":   "Setta Live Test",
				"version": "dev",
			},
		},
	})
	defer func() {
		if err := manager.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown live Codex account manager: %v", err)
		}
	}()
	service, err := codexaccount.NewService(manager)
	if err != nil {
		t.Fatalf("create Codex account service: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	state, err := service.Read(ctx)
	if err != nil {
		t.Fatalf("read Codex account: %v", err)
	}
	if state.Status == codexaccount.AccountStatusUnavailable {
		t.Skipf("Codex ChatGPT auth is unavailable: %s", state.Diagnostic)
	}
	if state.Account == nil {
		t.Skip("Codex ChatGPT auth is not signed in")
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

func unsetRuntimeEnv(t *testing.T, names ...string) {
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
