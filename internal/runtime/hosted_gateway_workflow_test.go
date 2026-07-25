package runtime

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/controlplane"
	"setta/internal/conversation"
	"setta/internal/httpapi"
	"setta/internal/runtimeprovider"
)

func TestCandidateBGatewayConversationRestartAndReplay(t *testing.T) {
	installRuntimeMasterCodexFixture(t)
	config := testConfig(t)
	config.Version = "hosted-gateway-workflow"
	var runtimeLogs bytes.Buffer
	config.Stderr = &runtimeLogs
	runtimeServer, runtimeReady := startRuntimeTestServer(t, config)
	dialer := &hostedRuntimeDialer{}
	dialer.SetAddress(runtimeServer.Addr())
	controlDirectory := t.TempDir()
	secretDirectory := t.TempDir()
	gateway, store, secrets, client, grant := startHostedGateway(
		t,
		controlDirectory,
		secretDirectory,
		dialer,
		runtimeReady.BootstrapToken,
	)

	baseURL := "http://" + gateway.Addr().String()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](
		t,
		client,
		baseURL,
		"/workspaces/open",
		httpapi.OpenWorkspaceRequest{RootPath: t.TempDir()},
		http.StatusOK,
	)
	created := postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/create",
		httpapi.CreateTopicConversationRequest{
			WorkspaceID: opened.Workspace.ID,
			Title:       "Hosted gateway topic",
		},
		http.StatusOK,
	)
	firstStream := openHostedConversationStream(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		"",
	)
	firstEvent := readHostedConversationEvent(t, firstStream.reader)
	_ = firstStream.body.Close()

	sourcePaneID := "hosted-gateway-pane"
	accepted := postRuntimeJSON[conversation.AcceptedConversationInput](
		t,
		client,
		baseURL,
		"/conversations/inputs/submit",
		httpapi.SubmitConversationInputRequest{Input: conversation.ConversationInput{
			ID:             "hosted-gateway-turn",
			ConversationID: created.Conversation.ID,
			SourcePaneID:   &sourcePaneID,
			Text:           "complete hosted gateway turn",
			Modality:       conversation.ConversationInputModalityText,
			SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		}},
		http.StatusAccepted,
	)
	routed := postRuntimeJSON[conversation.ConversationInputRoutingState](
		t,
		client,
		baseURL,
		"/conversations/inputs/state/wait",
		httpapi.ReadConversationInputRoutingStateRequest{
			WorkspaceID:    opened.Workspace.ID,
			ConversationID: created.Conversation.ID,
			InputID:        accepted.Input.ID,
		},
		http.StatusOK,
	)
	if routed.Input.Status != conversation.ConversationInputStatusDispatched {
		managerState, managerErr := runtimeServer.codexManager.State()
		t.Fatalf(
			"hosted conversation route = %+v\ncodex manager=%s err=%v\nruntime logs:\n%s",
			routed,
			managerState,
			managerErr,
			runtimeLogs.String(),
		)
	}
	completed := waitForRuntimeLiveTopicTurns(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		1,
	)
	if completed.Turns.Turns[0].Status != conversation.TurnStatusCompleted {
		t.Fatalf("hosted gateway turn status = %s", completed.Turns.Turns[0].Status)
	}

	shutdownHostedGateway(t, gateway, store)
	shutdownServer(t, runtimeServer)
	runtimeServer, runtimeReady = startRuntimeTestServer(t, config)
	defer shutdownServer(t, runtimeServer)
	dialer.SetAddress(runtimeServer.Addr())
	if err := secrets.WriteSecret(t.Context(), "hosted_runtime", []byte(runtimeReady.BootstrapToken)); err != nil {
		t.Fatal(err)
	}
	gateway, store, _, client, replayedGrant := restartHostedGateway(
		t,
		controlDirectory,
		secretDirectory,
		dialer,
		grant.Token,
	)
	defer shutdownHostedGateway(t, gateway, store)
	if replayedGrant != grant.Token {
		t.Fatal("hosted client credential changed across restart")
	}
	baseURL = "http://" + gateway.Addr().String()
	replayedStream := openHostedConversationStream(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		firstEvent.EventID,
	)
	defer replayedStream.body.Close()
	replayed := readHostedConversationEvent(t, replayedStream.reader)
	if replayed.Sequence <= firstEvent.Sequence {
		t.Fatalf("replayed conversation sequence = %d, want > %d", replayed.Sequence, firstEvent.Sequence)
	}
	snapshot := postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/snapshot/read",
		httpapi.ReadConversationSnapshotRequest{
			WorkspaceID:    opened.Workspace.ID,
			ConversationID: created.Conversation.ID,
		},
		http.StatusOK,
	)
	if len(snapshot.Turns.Turns) != 1 ||
		snapshot.Turns.Turns[0].Status != conversation.TurnStatusCompleted {
		t.Fatalf("restarted hosted snapshot = %+v", snapshot.Turns.Turns)
	}
}

type hostedRuntimeDialer struct {
	mu      sync.RWMutex
	address string
}

func (dialer *hostedRuntimeDialer) SetAddress(address string) {
	dialer.mu.Lock()
	defer dialer.mu.Unlock()
	dialer.address = address
}

func (dialer *hostedRuntimeDialer) DialPrivateRuntime(
	ctx context.Context,
	_ string,
	_ string,
	_ string,
) (net.Conn, error) {
	dialer.mu.RLock()
	address := dialer.address
	dialer.mu.RUnlock()
	return (&net.Dialer{}).DialContext(ctx, "tcp", address)
}

type hostedConversationStream struct {
	body   interface{ Close() error }
	reader *bufio.Reader
}

func startHostedGateway(
	t *testing.T,
	controlDirectory string,
	secretDirectory string,
	dialer *hostedRuntimeDialer,
	runtimeCredential string,
) (*controlplane.Server, *controlplane.Store, *controlplane.FileSecretStore, *http.Client, controlplane.CreatedDeviceGrant) {
	t.Helper()
	store, secrets := openHostedGatewayState(t, controlDirectory, secretDirectory)
	if err := secrets.WriteSecret(t.Context(), "hosted_runtime", []byte(runtimeCredential)); err != nil {
		t.Fatal(err)
	}
	identity, err := runtimeprovider.NewManagedIdentity("hosted-gateway-user")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpsertUser(t.Context(), "hosted-gateway-user"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AssignRuntime(t.Context(), controlplane.AssignRuntimeRequest{
		IdempotencyKey:      "hosted-gateway-assignment",
		UserID:              "hosted-gateway-user",
		RuntimeName:         identity.Name,
		Lifecycle:           controlplane.RuntimeLifecycleReady,
		AccessState:         controlplane.RuntimeAccessEnabled,
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: "hosted_runtime",
	}); err != nil {
		t.Fatal(err)
	}
	grant, err := store.CreateDeviceGrant(t.Context(), controlplane.CreateDeviceGrantRequest{
		UserID:      "hosted-gateway-user",
		RuntimeName: identity.Name,
		DisplayName: "Hosted gateway phone",
		GrantTTL:    time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	gateway := startHostedControlPlaneServer(t, store, secrets, dialer)
	return gateway, store, secrets, authenticatedRuntimeTestClient(grant.Token, 10*time.Second), grant
}

func restartHostedGateway(
	t *testing.T,
	controlDirectory string,
	secretDirectory string,
	dialer *hostedRuntimeDialer,
	clientCredential string,
) (*controlplane.Server, *controlplane.Store, *controlplane.FileSecretStore, *http.Client, string) {
	t.Helper()
	store, secrets := openHostedGatewayState(t, controlDirectory, secretDirectory)
	gateway := startHostedControlPlaneServer(t, store, secrets, dialer)
	return gateway, store, secrets, authenticatedRuntimeTestClient(clientCredential, 10*time.Second), clientCredential
}

func openHostedGatewayState(
	t *testing.T,
	controlDirectory string,
	secretDirectory string,
) (*controlplane.Store, *controlplane.FileSecretStore) {
	t.Helper()
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: controlDirectory})
	if err != nil {
		t.Fatal(err)
	}
	secrets, err := controlplane.OpenFileSecretStore(secretDirectory)
	if err != nil {
		_ = store.Close()
		t.Fatal(err)
	}
	return store, secrets
}

func startHostedControlPlaneServer(
	t *testing.T,
	store *controlplane.Store,
	secrets *controlplane.FileSecretStore,
	dialer *hostedRuntimeDialer,
) *controlplane.Server {
	t.Helper()
	observer, err := controlplane.NewJSONLinesObserver(&bytes.Buffer{})
	if err != nil {
		t.Fatal(err)
	}
	gateway, err := controlplane.StartServer(controlplane.ServerConfig{
		Authorizer:            store,
		Dialer:                dialer,
		ListenAddress:         "127.0.0.1:0",
		MaxConcurrentRequests: 8,
		MaxRequestBytes:       1 << 20,
		Observer:              observer,
		Routes:                store,
		RuntimeTarget:         "127.0.0.1:7345",
		Secrets:               secrets,
	})
	if err != nil {
		t.Fatal(err)
	}
	return gateway
}

func shutdownHostedGateway(t *testing.T, gateway *controlplane.Server, store *controlplane.Store) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := gateway.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	if err := gateway.Wait(); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
}

func openHostedConversationStream(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	conversationID string,
	cursor string,
) hostedConversationStream {
	t.Helper()
	url := fmt.Sprintf(
		"%s/conversations/events?workspaceId=%s&conversationId=%s",
		baseURL,
		workspaceID,
		conversationID,
	)
	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cursor != "" {
		request.Header.Set("Last-Event-ID", cursor)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK ||
		!strings.HasPrefix(response.Header.Get("Content-Type"), "text/event-stream") {
		_ = response.Body.Close()
		t.Fatalf("hosted conversation stream = %d %q", response.StatusCode, response.Header.Get("Content-Type"))
	}
	return hostedConversationStream{body: response.Body, reader: bufio.NewReader(response.Body)}
}

type hostedConversationEventEnvelope struct {
	SchemaVersion  int             `json:"schemaVersion"`
	Sequence       int             `json:"sequence"`
	EventID        string          `json:"eventId"`
	WorkspaceID    string          `json:"workspaceId"`
	ConversationID string          `json:"conversationId"`
	Payload        json.RawMessage `json:"payload"`
}

func readHostedConversationEvent(t *testing.T, reader *bufio.Reader) hostedConversationEventEnvelope {
	t.Helper()
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var event hostedConversationEventEnvelope
		if err := json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data: "))), &event); err != nil {
			t.Fatal(err)
		}
		if event.SchemaVersion <= 0 || event.Sequence <= 0 || event.EventID == "" ||
			event.WorkspaceID == "" || event.ConversationID == "" || len(event.Payload) == 0 {
			t.Fatalf("invalid hosted conversation event: %+v", event)
		}
		return event
	}
}
