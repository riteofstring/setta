package wsapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/artifacts"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/listenersnapshot"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
	"setta/internal/shareartifacts"
	"setta/internal/terminals"

	"github.com/coder/websocket"
)

type routeBuiltInListenerEndpointCall struct {
	endpointName   string
	payload        map[string]any
	hasAuth        bool
	sessionID      string
	shareSessionID string
}

type routeBuiltInListenerEndpointInvoker struct {
	calls  []routeBuiltInListenerEndpointCall
	invoke func(ConnectionInfo, string, map[string]any) (any, bool, error)
}

func (s *routeBuiltInListenerEndpointInvoker) InvokeBuiltInListenerEndpoint(
	_ context.Context,
	info ConnectionInfo,
	endpointName string,
	payload map[string]any,
) (any, bool, error) {
	if s == nil {
		return nil, false, nil
	}
	s.calls = append(s.calls, routeBuiltInListenerEndpointCall{
		endpointName:   endpointName,
		payload:        cloneRouteListenerPayload(payload),
		hasAuth:        info.HasAuth,
		sessionID:      info.Auth.SessionID,
		shareSessionID: info.Modes.ShareSessionID,
	})
	if s.invoke == nil {
		return nil, false, nil
	}
	return s.invoke(info, endpointName, payload)
}

func withTerminalPath(projectID string, sectionID string) dialOption {
	return func(path string) string {
		path = strings.Replace(path, "{projectID}", projectID, 1)
		path = strings.Replace(path, "{sectionID}", sectionID, 1)
		return path
	}
}

func dialRouteConnection(t *testing.T, serverURL string, path string, headers http.Header, options ...dialOption) *websocket.Conn {
	t.Helper()

	for _, option := range options {
		path = option(path)
	}
	conn, _, err := websocket.Dial(context.Background(), websocketURL(serverURL, path), &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial route websocket: %v", err)
	}
	return conn
}

func newRouteProjectRuntime(t *testing.T, projectID string) *projectstate.Runtime {
	t.Helper()

	return newRouteProjectRuntimeWithDocument(t, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: projectID,
		Projects: map[string]projectstate.Project{
			projectID: {
				ID:   projectID,
				Name: strings.ToUpper(projectID),
			},
		},
	})
}

func newRouteProjectRuntimeWithDocument(t *testing.T, document projectstate.Document) *projectstate.Runtime {
	t.Helper()

	runtime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open route project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close route project runtime: %v", err)
		}
	})
	return runtime
}

func newRouteTemporaryIDs(t *testing.T) *mcpx.TemporaryIDStore {
	t.Helper()

	store, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(t.TempDir()))
	if err != nil {
		t.Fatalf("open temporary id store: %v", err)
	}
	return store
}

func createRouteTopLevelSection(
	t *testing.T,
	runtime *projectstate.Runtime,
	projectID string,
	implType string,
	name string,
) string {
	t.Helper()

	input := projectstate.CreateTopLevelSectionInput{
		ImplType: implType,
	}
	if strings.TrimSpace(name) != "" {
		input.Name = &name
	}
	_, result, err := runtime.CreateTopLevelSection(
		context.Background(),
		projectID,
		input,
		projectstate.StructuralMutationSettings{},
	)
	if err != nil {
		t.Fatalf("create top-level section %q for project %q: %v", implType, projectID, err)
	}
	return result.SectionID
}

func routeListenerDependencyName(
	t *testing.T,
	document projectstate.Document,
	projectID string,
	sectionID string,
	codeObjID string,
) string {
	t.Helper()

	project, err := document.ProjectByID(projectID)
	if err != nil {
		t.Fatalf("project %q for dependency lookup: %v", projectID, err)
	}
	exported, err := project.ListenerDependencyExport()
	if err != nil {
		t.Fatalf("listener dependency export for project %q: %v", projectID, err)
	}
	graph, err := codegen.BuildPythonDependencyGraph(exported, codegen.PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build listener dependency graph for project %q: %v", projectID, err)
	}

	var key codegen.PythonDependencyKey
	if strings.TrimSpace(codeObjID) == "" {
		key = codegen.PythonSectionDependencyKey(sectionID)
	} else {
		key = codegen.PythonCodeObjectDependencyKey(sectionID, codeObjID)
	}
	node, ok := graph.Node(key)
	if !ok {
		t.Fatalf("dependency node not found for section=%q codeObj=%q", sectionID, codeObjID)
	}
	return node.Base().FullPathName
}

func routeProjectStatePayload(
	t *testing.T,
	document projectstate.Document,
	projectID string,
) listenersnapshot.ListenerSnapshotPayload {
	t.Helper()

	snapshot, err := listenersnapshot.BuildListenerSnapshotPayload(document, projectID)
	if err != nil {
		t.Fatalf("build route listener snapshot payload: %v", err)
	}
	return snapshot
}

func newRouteArtifactService(t *testing.T) (*artifacts.Service, string) {
	t.Helper()

	service, artifactsRoot, _ := newRouteArtifactServiceWithStore(t)
	return service, artifactsRoot
}

func newRouteArtifactServiceWithStore(t *testing.T) (*artifacts.Service, string, *binarypayload.Store) {
	t.Helper()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(root, "setta_files")
	artifactsRoot := filepath.Join(settaFilesRoot, "artifacts")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir route workspace root: %v", err)
	}
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir route artifacts root: %v", err)
	}
	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		t.Fatalf("new route binary store: %v", err)
	}
	service, err := artifacts.NewService(artifacts.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		ArtifactsRoot:  artifactsRoot,
		BinaryStore:    binaryStore,
	})
	if err != nil {
		t.Fatalf("new route artifact service: %v", err)
	}
	return service, artifactsRoot, binaryStore
}

func newRouteShareArtifactService(
	t *testing.T,
	deploymentRuntime *deployments.Runtime,
	hub *realtime.WebsocketHub,
) (*shareartifacts.Service, string) {
	t.Helper()

	binaryStore, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new route share binary store: %v", err)
	}
	service, err := shareartifacts.NewService(shareartifacts.ServiceOptions{
		Deployment:   deploymentRuntime,
		BinaryStore:  binaryStore,
		WebsocketHub: hub,
	})
	if err != nil {
		t.Fatalf("new route share artifact service: %v", err)
	}
	return service, deploymentRuntime.Paths().ArtifactsRoot
}

func newRouteDeploymentRuntime(t *testing.T, mode config.Mode) *deployments.Runtime {
	t.Helper()

	policy := deployments.DefaultPolicy()
	if mode == config.ModeApp {
		policy = deployments.DefaultAppPolicy()
	}
	return newRouteDeploymentRuntimeWithPolicyAndNow(t, mode, policy, func() time.Time {
		return time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	})
}

func newRouteDeploymentRuntimeWithPolicy(t *testing.T, mode config.Mode, policy deployments.Policy) *deployments.Runtime {
	t.Helper()

	return newRouteDeploymentRuntimeWithPolicyAndNow(t, mode, policy, func() time.Time {
		return time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	})
}

func newRouteDeploymentRuntimeWithPolicyAndNow(t *testing.T, mode config.Mode, policy deployments.Policy, now func() time.Time) *deployments.Runtime {
	t.Helper()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-a",
		Projects: map[string]projectstate.Project{
			"project-a": {
				ID:   "project-a",
				Name: "Project A",
				ProjectChatWindowing: func() *projectstate.ProjectChatWindowingState {
					defaultWindowing := projectstate.DefaultProjectChatWindowingState()
					return &defaultWindowing
				}(),
			},
		},
	}
	normalizedDocument, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize route deployment document: %v", err)
	}
	writeRouteDeploymentJSON(t, filepath.Join(root, projectstate.MainFileName), normalizedDocument)

	deploymentType := "share"
	if mode == config.ModeApp {
		deploymentType = "app"
	}
	writeRouteDeploymentJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo",
		"deploymentType":         deploymentType,
		"defaultProjectConfigId": "project-a",
		"deploymentVersion":      "v1",
	})
	writeRouteDeploymentJSON(t, filepath.Join(root, "policy.json"), policy)

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now:            now,
		IDGenerator: func() string {
			return "generated-share"
		},
	})
	if err != nil {
		t.Fatalf("open route deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close route deployment runtime: %v", err)
		}
	})
	return deploymentRuntime
}

func writeRouteDeploymentJSON(t *testing.T, path string, value any) {
	t.Helper()

	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		t.Fatalf("mkdir route deployment parent: %v", err)
	}

	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("marshal route deployment json: %v", err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write route deployment json: %v", err)
	}
}

func authHeaderForCookie(t *testing.T, authService *auth.Service) http.Header {
	t.Helper()

	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := authService.CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	return http.Header{
		"Cookie": []string{cookieName + "=" + token},
	}
}

func readNextMessages(t *testing.T, conn *websocket.Conn, count int) []routeMessageEnvelope {
	t.Helper()

	messages := make([]routeMessageEnvelope, 0, count)
	for range count {
		messages = append(messages, readNextMessage(t, conn))
	}
	return messages
}

func readNextMessage(t *testing.T, conn *websocket.Conn) routeMessageEnvelope {
	t.Helper()

	_, payload := readNextFrame(t, conn)

	var message routeMessageEnvelope
	if err := json.Unmarshal(payload, &message); err != nil {
		t.Fatalf("decode websocket message: %v", err)
	}
	return message
}

func readNextFrame(t *testing.T, conn *websocket.Conn) (websocket.MessageType, []byte) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	messageType, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read websocket message: %v", err)
	}
	return messageType, payload
}

func readUntilMessageType(t *testing.T, conn *websocket.Conn, messageType string, maxReads int) routeMessageEnvelope {
	t.Helper()

	for range maxReads {
		message := readNextMessage(t, conn)
		if message.MessageType == messageType {
			return message
		}
	}
	t.Fatalf("did not receive message type %q within %d reads", messageType, maxReads)
	return routeMessageEnvelope{}
}

func assertNoRouteEnvelopeOfType(t *testing.T, conn *websocket.Conn, messageType string, timeout time.Duration) {
	t.Helper()

	readCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	for {
		_, payload, err := conn.Read(readCtx)
		if errors.Is(err, context.DeadlineExceeded) {
			return
		}
		if err != nil {
			t.Fatalf("read websocket frame while waiting for no %q messages: %v", messageType, err)
		}

		var message routeMessageEnvelope
		if err := json.Unmarshal(payload, &message); err != nil {
			t.Fatalf("decode websocket frame while waiting for no %q messages: %v", messageType, err)
		}
		if message.MessageType == messageType {
			t.Fatalf("expected no message type %q within %v, got %#v", messageType, timeout, message)
		}
	}
}

func readNextRawFrame(t *testing.T, conn *websocket.Conn) string {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read websocket frame: %v", err)
	}
	return string(payload)
}

func readUntilCloseStatus(t *testing.T, conn *websocket.Conn, want websocket.StatusCode) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for {
		ctx, cancel := context.WithDeadline(context.Background(), deadline)
		_, _, err := conn.Read(ctx)
		cancel()
		if err == nil {
			continue
		}
		if status := websocket.CloseStatus(err); status == want {
			return
		}
		if errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("expected close code %d before timeout", want)
		}
		t.Fatalf("expected close code %d, got %d (err=%v)", want, websocket.CloseStatus(err), err)
	}
}

func readUntilRawFrameContains(t *testing.T, conn *websocket.Conn, needle string, maxReads int) string {
	t.Helper()

	buffer := bytes.NewBuffer(nil)
	for range maxReads {
		frame := readNextRawFrame(t, conn)
		buffer.WriteString(frame)
		if strings.Contains(buffer.String(), needle) {
			return buffer.String()
		}
	}

	t.Fatalf("did not receive terminal output containing %q within %d reads; collected output: %q", needle, maxReads, buffer.String())
	return ""
}

func requireMessageType(t *testing.T, messages []routeMessageEnvelope, messageType string) routeMessageEnvelope {
	t.Helper()

	for _, message := range messages {
		if message.MessageType == messageType {
			return message
		}
	}
	t.Fatalf("missing message type %q in %#v", messageType, messages)
	return routeMessageEnvelope{}
}

func decodeFrontendIdentityToken(t *testing.T, raw json.RawMessage) string {
	t.Helper()

	var content realtime.FrontendIdentityContent
	if err := json.Unmarshal(raw, &content); err != nil {
		t.Fatalf("decode frontend identity content: %v", err)
	}
	if strings.TrimSpace(content.FrontendAffinityToken) == "" {
		t.Fatal("expected frontend affinity token")
	}
	return content.FrontendAffinityToken
}

func decodeConnections(t *testing.T, raw json.RawMessage) []realtime.Connection {
	t.Helper()

	var connections []realtime.Connection
	if err := json.Unmarshal(raw, &connections); err != nil {
		t.Fatalf("decode connections payload: %v", err)
	}
	return connections
}

func waitForCondition(t *testing.T, check func() bool) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition did not become true before timeout")
}

func newRouteTerminalService(t *testing.T) *terminals.Service {
	t.Helper()

	service, err := terminals.New(terminals.Options{
		Logger: observability.NewLogger(0, io.Discard),
	})
	if err != nil {
		t.Fatalf("new terminal service: %v", err)
	}

	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := service.Close(shutdownCtx); err != nil {
			t.Fatalf("close terminal service: %v", err)
		}
	})

	return service
}

func openRouteTerminalForTest(t *testing.T, service *terminals.Service, options terminals.OpenOptions) {
	t.Helper()

	if _, created, err := service.Open(options); err != nil {
		t.Fatalf("open route terminal %q: %v", options.ID, err)
	} else if !created {
		t.Fatalf("expected terminal %q to be created", options.ID)
	}
}

func seedRouteTerminalHistory(t *testing.T, service *terminals.Service, terminalID string, needle string) {
	t.Helper()

	attachment, err := service.Attach(terminalID)
	if err != nil {
		t.Fatalf("attach route terminal %q: %v", terminalID, err)
	}
	defer attachment.Close()

	if len(attachment.History) > 0 && strings.Contains(string(attachment.History), needle) {
		return
	}

	_ = readUntilAttachmentContains(t, attachment, needle)
}

func readUntilAttachmentContains(t *testing.T, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := bytes.NewBuffer(nil)
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				t.Fatalf("attachment closed before %q appeared; collected output: %q", needle, buffer.String())
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, buffer.String())
		}
	}
}

func quietCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func readyQuietCatCommand(t *testing.T, initialLine string) []string {
	t.Helper()

	shell := requireCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; printf '" + initialLine + "\\n'; cat"}
}

func resizeProbeCommand(t *testing.T) []string {
	t.Helper()

	shell := requireCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; printf 'ready\\n'; while IFS= read -r line; do if [ \"$line\" = size ]; then stty size; fi; done"}
}

func requireCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func skipIfPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}

func assertListenerRegisterAck(t *testing.T, message routeMessageEnvelope, projectID string, shareSessionID string) {
	t.Helper()

	assertListenerRegisterAckCallbacks(t, message, projectID, shareSessionID, map[string]string{
		"cb-a": "accepted",
	})
}

func assertListenerRegisterAckCallbacks(t *testing.T, message routeMessageEnvelope, projectID string, shareSessionID string, expectedStatuses map[string]string) {
	t.Helper()

	if message.MessageType != string(realtime.MessageTypeListenerRegisterAck) {
		t.Fatalf("expected listener register ack, got %q", message.MessageType)
	}

	var content realtime.ListenerRegisterAckContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener register ack: %v", err)
	}
	if content.ProjectConfigID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectConfigID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if len(content.Callbacks) != len(expectedStatuses) {
		t.Fatalf("expected %d callback acks, got %d", len(expectedStatuses), len(content.Callbacks))
	}
	for callbackID, expectedStatus := range expectedStatuses {
		callback, ok := content.Callbacks[callbackID]
		if !ok {
			t.Fatalf("expected callback ack %q, got %#v", callbackID, content.Callbacks)
		}
		if callback.Status != expectedStatus {
			t.Fatalf("expected callback %q status %q, got %q", callbackID, expectedStatus, callback.Status)
		}
	}
}

func assertRouteListenerCoverageSnapshot(
	t *testing.T,
	message routeMessageEnvelope,
	projectID string,
	hasRealtimeWildcard bool,
	dependencies []realtime.ListenerCoverageDependency,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeListenerCoverageSnapshot {
		t.Fatalf("expected listener coverage snapshot, got %q", message.MessageType)
	}

	var content realtime.ListenerCoverageSnapshot
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener coverage snapshot: %v", err)
	}
	if content.ProjectID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectID)
	}
	if content.HasRealtimeWildcard != hasRealtimeWildcard {
		t.Fatalf("expected realtime wildcard %t, got %#v", hasRealtimeWildcard, content)
	}
	if len(content.Dependencies) != len(dependencies) {
		t.Fatalf("expected %d coverage dependencies, got %#v", len(dependencies), content.Dependencies)
	}
	for index, expected := range dependencies {
		if content.Dependencies[index] != expected {
			t.Fatalf("expected coverage dependency %#v at index %d, got %#v", expected, index, content.Dependencies[index])
		}
	}
}

func assertRouteListenerForceRefresh(
	t *testing.T,
	message routeMessageEnvelope,
	projectID string,
	shareSessionID string,
	expectedSnapshot listenersnapshot.ListenerSnapshotPayload,
) {
	t.Helper()

	if message.MessageType != string(realtime.MessageTypeListenerForceRefresh) {
		t.Fatalf("expected listener force refresh, got %q", message.MessageType)
	}

	content := decodeRouteListenerForceRefreshContent(t, message)
	if content.Snapshot.ProjectConfigID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.Snapshot.ProjectConfigID)
	}
	actualShareSessionID := ""
	if content.Snapshot.ShareSessionID != nil {
		actualShareSessionID = *content.Snapshot.ShareSessionID
	}
	if actualShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, actualShareSessionID)
	}
	if shareSessionID == "" {
		expectedSnapshot.ShareSessionID = nil
	} else {
		shareSessionIDCopy := shareSessionID
		expectedSnapshot.ShareSessionID = &shareSessionIDCopy
	}
	expectedSnapshot = normalizeRouteListenerSnapshot(expectedSnapshot)
	if canonicalJSONValue(t, content.Snapshot) != canonicalJSONValue(t, expectedSnapshot) {
		t.Fatalf("expected snapshot %s, got %s", canonicalJSONValue(t, expectedSnapshot), canonicalJSONValue(t, content.Snapshot))
	}
}

func decodeRouteListenerForceRefreshContent(
	t *testing.T,
	message routeMessageEnvelope,
) realtime.ListenerForceRefreshContent {
	t.Helper()

	var content realtime.ListenerForceRefreshContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener force refresh: %v", err)
	}
	return content
}

func decodeRouteListenerRealtimeContent(
	t *testing.T,
	message routeMessageEnvelope,
) realtime.ListenerRealtimeEventContent {
	t.Helper()

	var content realtime.ListenerRealtimeEventContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener realtime event: %v", err)
	}
	return content
}

func assertRouteListenerError(
	t *testing.T,
	message routeMessageEnvelope,
	expectedError string,
	expectedDetailsSubset map[string]any,
) {
	t.Helper()

	if message.MessageType != string(realtime.MessageTypeListenerError) {
		t.Fatalf("expected listener error, got %q", message.MessageType)
	}

	var content realtime.ListenerErrorContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener error: %v", err)
	}
	if content.Error != expectedError {
		t.Fatalf("expected error %q, got %q", expectedError, content.Error)
	}
	for key, expectedValue := range expectedDetailsSubset {
		actualValue, ok := content.Details[key]
		if !ok {
			t.Fatalf("expected listener error details to include %q", key)
		}
		if canonicalValueJSON(t, actualValue) != canonicalValueJSON(t, expectedValue) {
			t.Fatalf("expected detail %q=%#v, got %#v", key, expectedValue, actualValue)
		}
	}
}

func assertRouteListenerErrorMissingDetailKey(
	t *testing.T,
	message routeMessageEnvelope,
	detailKey string,
) {
	t.Helper()

	if message.MessageType != string(realtime.MessageTypeListenerError) {
		t.Fatalf("expected listener error, got %q", message.MessageType)
	}

	var content realtime.ListenerErrorContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener error: %v", err)
	}
	if _, ok := content.Details[detailKey]; ok {
		t.Fatalf("expected listener error details to omit %q, got %#v", detailKey, content.Details)
	}
}

func assertRouteProjectStateUpdate(t *testing.T, message routeMessageEnvelope, projectID string) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeUpdateFrontendProjectState {
		t.Fatalf("expected project state update, got %q", message.MessageType)
	}

	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode project state update: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != projectID {
		t.Fatalf("expected project state update for %q, got %q", projectID, content.ProjectState.ProjectConfig.ID)
	}
}

func assertRouteArtifactUpdate(
	t *testing.T,
	message routeMessageEnvelope,
	updateType string,
	artifactID string,
	artifactType string,
) {
	t.Helper()

	if message.MessageType != realtime.MessageTypeUpdateArtifacts {
		t.Fatalf("expected update artifacts message, got %q", message.MessageType)
	}

	var content realtime.UpdateArtifactsContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode update artifacts content: %v", err)
	}
	if content.UpdateType != updateType {
		t.Fatalf("expected update type %q, got %q", updateType, content.UpdateType)
	}
	if len(content.Artifacts) != 1 {
		t.Fatalf("expected 1 artifact update, got %#v", content.Artifacts)
	}
	artifact, ok := content.Artifacts[0].(map[string]any)
	if !ok {
		t.Fatalf("expected artifact object, got %#v", content.Artifacts[0])
	}
	if artifact["id"] != artifactID {
		t.Fatalf("expected artifact id %q, got %#v", artifactID, artifact["id"])
	}
	if artifact["type"] != artifactType {
		t.Fatalf("expected artifact type %q, got %#v", artifactType, artifact["type"])
	}
}

func assertRouteListenerRealtimeEvent(
	t *testing.T,
	message routeMessageEnvelope,
	projectID string,
	shareSessionID string,
	sequence uint64,
	expectedDependency string,
	expectedValue string,
) {
	t.Helper()

	if message.MessageType != string(realtime.MessageTypeListenerRealtimeEvent) {
		t.Fatalf("expected listener realtime event, got %q", message.MessageType)
	}

	var content struct {
		ProjectConfigID string `json:"projectConfigId"`
		ShareSessionID  string `json:"shareSessionId,omitempty"`
		Deltas          []struct {
			Dependency json.RawMessage `json:"dependency"`
			Value      json.RawMessage `json:"value"`
		} `json:"deltas"`
		Sequence uint64 `json:"sequence"`
	}
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener realtime event: %v", err)
	}
	if content.ProjectConfigID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectConfigID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if content.Sequence != sequence {
		t.Fatalf("expected sequence %d, got %d", sequence, content.Sequence)
	}
	if len(content.Deltas) != 1 {
		t.Fatalf("expected 1 delta, got %d", len(content.Deltas))
	}
	assertStructuredDependencyKeyPayload(t, content.Deltas[0].Dependency, expectedDependency, "delta dependency")
	if compactJSON(t, content.Deltas[0].Value) != compactJSONString(t, expectedValue) {
		t.Fatalf("expected delta value %s, got %s", expectedValue, string(content.Deltas[0].Value))
	}
}

func assertRouteListenerDependencyEvent(
	t *testing.T,
	message routeMessageEnvelope,
	projectID string,
	shareSessionID string,
	sequence uint64,
	expectedDependency string,
	expectedPayload string,
) {
	t.Helper()

	if message.MessageType != string(realtime.MessageTypeListenerDependencyEvent) {
		t.Fatalf("expected listener dependency event, got %q", message.MessageType)
	}

	var content struct {
		ProjectConfigID  string `json:"projectConfigId"`
		ShareSessionID   string `json:"shareSessionId,omitempty"`
		DependencyEvents []struct {
			DependencyKey json.RawMessage `json:"dependencyKey"`
			Payload       json.RawMessage `json:"payload,omitempty"`
			TimestampMS   int64           `json:"timestampMs"`
		} `json:"dependencyEvents"`
		Sequence uint64 `json:"sequence"`
	}
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener dependency event: %v", err)
	}
	if content.ProjectConfigID != projectID {
		t.Fatalf("expected project id %q, got %q", projectID, content.ProjectConfigID)
	}
	if content.ShareSessionID != shareSessionID {
		t.Fatalf("expected share session id %q, got %q", shareSessionID, content.ShareSessionID)
	}
	if content.Sequence != sequence {
		t.Fatalf("expected sequence %d, got %d", sequence, content.Sequence)
	}
	if len(content.DependencyEvents) != 1 {
		t.Fatalf("expected 1 dependency event, got %d", len(content.DependencyEvents))
	}
	assertStructuredDependencyKeyPayload(t, content.DependencyEvents[0].DependencyKey, expectedDependency, "dependency event key")
	if canonicalJSON(t, content.DependencyEvents[0].Payload) != canonicalJSONString(t, expectedPayload) {
		t.Fatalf("expected dependency payload %s, got %s", expectedPayload, string(content.DependencyEvents[0].Payload))
	}
}

func assertStructuredDependencyKeyPayload(
	t *testing.T,
	raw json.RawMessage,
	expectedCanonical string,
	label string,
) {
	t.Helper()

	trimmed := strings.TrimSpace(string(raw))
	if strings.HasPrefix(trimmed, "\"") {
		t.Fatalf("expected %s to be a structured dependency key object, got %s", label, trimmed)
	}

	canonical, err := realtime.CanonicalDependencyKey(raw)
	if err != nil {
		t.Fatalf("decode %s dependency key: %v", label, err)
	}
	if canonical != expectedCanonical {
		t.Fatalf("expected %s canonical key %q, got %q", label, expectedCanonical, canonical)
	}
}

func assertListenerRouterEndpointResult(
	t *testing.T,
	message routeMessageEnvelope,
	expected realtime.ListenerRouterEndpointResultContent,
	expectedDetails map[string]any,
) {
	t.Helper()

	if message.MessageType != string(realtime.MessageTypeListenerRouterResult) {
		t.Fatalf("expected listener router endpoint result, got %q", message.MessageType)
	}

	var content realtime.ListenerRouterEndpointResultContent
	if err := json.Unmarshal(message.Content, &content); err != nil {
		t.Fatalf("decode listener router endpoint result: %v", err)
	}
	if content.ProjectConfigID != expected.ProjectConfigID {
		t.Fatalf("expected project config id %q, got %q", expected.ProjectConfigID, content.ProjectConfigID)
	}
	if content.CallID != expected.CallID {
		t.Fatalf("expected call id %q, got %q", expected.CallID, content.CallID)
	}
	if content.OK != expected.OK {
		t.Fatalf("expected ok=%t, got %t", expected.OK, content.OK)
	}
	if content.Error != expected.Error {
		t.Fatalf("expected error %q, got %q", expected.Error, content.Error)
	}
	if expectedDetails == nil {
		expectedDetails = map[string]any{}
	}
	if content.Details == nil {
		content.Details = map[string]any{}
	}
	if canonicalValueJSON(t, content.Result) != canonicalValueJSON(t, expected.Result) {
		t.Fatalf("expected result %#v, got %#v", expected.Result, content.Result)
	}
	if canonicalValueJSON(t, content.Details) != canonicalValueJSON(t, expectedDetails) {
		t.Fatalf("expected details %#v, got %#v", expectedDetails, content.Details)
	}
}

func canonicalValueJSON(t *testing.T, value any) string {
	t.Helper()

	if value == nil {
		return "null"
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json value %#v: %v", value, err)
	}
	return canonicalJSON(t, encoded)
}

func cloneRouteListenerPayload(values map[string]any) map[string]any {
	if values == nil {
		return nil
	}

	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func canonicalJSONString(t *testing.T, value string) string {
	t.Helper()
	return canonicalJSON(t, []byte(value))
}

func compactJSONString(t *testing.T, value string) string {
	t.Helper()
	return canonicalJSONString(t, value)
}

func canonicalJSON(t *testing.T, value []byte) string {
	t.Helper()

	var decoded any
	if err := json.Unmarshal(value, &decoded); err != nil {
		t.Fatalf("decode json %q: %v", string(value), err)
	}
	encoded, err := json.Marshal(decoded)
	if err != nil {
		t.Fatalf("re-encode json %q: %v", string(value), err)
	}
	return string(encoded)
}

func canonicalJSONValue(t *testing.T, value any) string {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json value %#v: %v", value, err)
	}
	return canonicalJSON(t, encoded)
}

func normalizeRouteListenerSnapshot(
	snapshot listenersnapshot.ListenerSnapshotPayload,
) listenersnapshot.ListenerSnapshotPayload {
	if snapshot.DependencyCatalog.Entries == nil {
		snapshot.DependencyCatalog.Entries = []pythonsdkcontracts.ListenerDependencyCatalogEntry{}
	}
	if snapshot.DependencyValues.Entries == nil {
		snapshot.DependencyValues.Entries = []pythonsdkcontracts.ListenerRenderedDependencyValue{}
	}
	return snapshot
}

func compactJSON(t *testing.T, value []byte) string {
	t.Helper()
	return canonicalJSON(t, value)
}
