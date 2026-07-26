package runtime

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/controlplane"
	"setta/internal/conversation"
	"setta/internal/director"
	"setta/internal/httpapi"
	"setta/internal/runtimeprovider"
)

// The hosted gateway follows Setta's current product contracts. Work is
// dispatched through the Director, so this workflow intentionally does not
// restore the removed Setta 3 conversation-input router just to drive a test.
// It proves that the gateway carries current Director and conversation state,
// preserves durable state across both process boundaries, replays the event
// stream from a cursor, and does not put user data into gateway measurements.
func TestHostedGatewayCurrentContractsSurviveRuntimeAndGatewayRestart(t *testing.T) {
	config := testConfig(t)
	config.Version = "hosted-gateway-current-contracts"
	runtimeServer, runtimeReady := startRuntimeTestServer(t, config)

	dialer := &hostedRuntimeDialer{}
	dialer.SetAddress(runtimeServer.Addr())
	controlDirectory := t.TempDir()
	secretDirectory := t.TempDir()
	gateway, store, secrets, client, grant, initialMeasurements := startHostedGateway(
		t,
		controlDirectory,
		secretDirectory,
		dialer,
		runtimeReady.BootstrapToken,
	)

	baseURL := "http://" + gateway.Addr().String()
	initialDirector := getRuntimeJSON[director.DirectorSnapshot](
		t,
		client,
		baseURL,
		"/director/snapshot",
	)
	if initialDirector.EventCursor.StreamID == "" {
		t.Fatal("hosted Director snapshot has an empty event stream")
	}
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](
		t,
		client,
		baseURL,
		"/workspaces/open",
		httpapi.OpenWorkspaceRequest{RootPath: t.TempDir()},
		http.StatusOK,
	)
	workspaceID := opened.Workspace.ID
	created := postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/create",
		httpapi.CreateTopicConversationRequest{
			WorkspaceID: &workspaceID,
			Title:       "Hosted gateway current contracts",
		},
		http.StatusOK,
	)
	stream := openHostedConversationStream(
		t,
		client,
		baseURL,
		workspaceID,
		created.Conversation.ID,
		"",
	)
	firstEvent := readHostedConversationEvent(t, stream.reader)
	if err := stream.body.Close(); err != nil {
		t.Fatal(err)
	}

	shutdownHostedGateway(t, gateway, store)
	requireHostedGatewayMeasurement(t, initialMeasurements, "ReadDirectorSnapshot", false)
	requireHostedGatewayMeasurement(t, initialMeasurements, "OpenWorkspace", false)
	requireHostedGatewayMeasurement(t, initialMeasurements, "CreateTopicConversation", false)
	requireHostedGatewayMeasurement(t, initialMeasurements, "ConversationEventStream", false)
	requireHostedGatewayMeasurementsExclude(
		t,
		initialMeasurements,
		workspaceID,
		created.Conversation.ID,
		created.Conversation.Title,
	)
	shutdownServer(t, runtimeServer)

	runtimeServer, runtimeReady = startRuntimeTestServer(t, config)
	defer shutdownServer(t, runtimeServer)
	dialer.SetAddress(runtimeServer.Addr())
	if err := secrets.WriteSecret(
		t.Context(),
		hostedRuntimeSecretReference,
		[]byte(runtimeReady.BootstrapToken),
	); err != nil {
		t.Fatal(err)
	}
	var restartedMeasurements *bytes.Buffer
	gateway, store, _, client, restartedMeasurements = restartHostedGateway(
		t,
		controlDirectory,
		secretDirectory,
		dialer,
		grant.Token,
	)
	defer shutdownHostedGateway(t, gateway, store)
	baseURL = "http://" + gateway.Addr().String()

	restarted := postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/snapshot/read",
		httpapi.ReadConversationSnapshotRequest{
			WorkspaceID:    &workspaceID,
			ConversationID: created.Conversation.ID,
		},
		http.StatusOK,
	)
	if restarted.Conversation.ID != created.Conversation.ID ||
		restarted.Conversation.WorkspaceID == nil ||
		*restarted.Conversation.WorkspaceID != workspaceID ||
		restarted.Conversation.ArchivedAt != nil {
		t.Fatalf("restarted hosted conversation = %+v", restarted.Conversation)
	}
	archived := postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/archive",
		httpapi.ArchiveTopicConversationRequest{
			WorkspaceID:    workspaceID,
			ConversationID: created.Conversation.ID,
		},
		http.StatusOK,
	)
	if archived.Conversation.ArchivedAt == nil {
		t.Fatalf("hosted archived conversation = %+v", archived.Conversation)
	}
	replayedStream := openHostedConversationStream(
		t,
		client,
		baseURL,
		workspaceID,
		created.Conversation.ID,
		firstEvent.EventID,
	)
	replayed := readHostedConversationEvent(t, replayedStream.reader)
	if err := replayedStream.body.Close(); err != nil {
		t.Fatal(err)
	}
	if replayed.Sequence <= firstEvent.Sequence {
		t.Fatalf(
			"replayed hosted event sequence = %d, want > %d",
			replayed.Sequence,
			firstEvent.Sequence,
		)
	}
	restartedDirector := getRuntimeJSON[director.DirectorSnapshot](
		t,
		client,
		baseURL,
		"/director/snapshot",
	)
	if !strings.HasPrefix(
		restartedDirector.EventCursor.StreamID,
		director.DirectorEventStreamPrefix,
	) {
		t.Fatalf(
			"restarted Director stream = %q, want prefix %q",
			restartedDirector.EventCursor.StreamID,
			director.DirectorEventStreamPrefix,
		)
	}

	shutdownHostedGateway(t, gateway, store)
	gateway = nil
	store = nil
	requireHostedGatewayMeasurement(t, restartedMeasurements, "ReadConversationSnapshot", false)
	requireHostedGatewayMeasurement(t, restartedMeasurements, "ArchiveTopicConversation", false)
	requireHostedGatewayMeasurement(t, restartedMeasurements, "ConversationEventStream", true)
	requireHostedGatewayMeasurement(t, restartedMeasurements, "ReadDirectorSnapshot", false)
	requireHostedGatewayMeasurementsExclude(
		t,
		restartedMeasurements,
		workspaceID,
		created.Conversation.ID,
		created.Conversation.Title,
		firstEvent.EventID,
		replayed.EventID,
	)
}

const hostedRuntimeSecretReference = "hosted_runtime"

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
) (
	*controlplane.Server,
	*controlplane.Store,
	*controlplane.FileSecretStore,
	*http.Client,
	controlplane.CreatedDeviceGrant,
	*bytes.Buffer,
) {
	t.Helper()
	store, secrets := openHostedGatewayState(t, controlDirectory, secretDirectory)
	if err := secrets.WriteSecret(
		t.Context(),
		hostedRuntimeSecretReference,
		[]byte(runtimeCredential),
	); err != nil {
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
		HealthState:         controlplane.RuntimeHealthHealthy,
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: hostedRuntimeSecretReference,
		DesiredRelease:      "hosted-test-release",
		ObservedRelease:     "hosted-test-release",
		Resources: runtimeprovider.RuntimeResources{
			CPUCoreMillionths: 1_000_000,
			MemoryBytes:       512_000_000,
			StorageBytes:      10_000_000_000,
		},
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
	measurements := &bytes.Buffer{}
	gateway := startHostedControlPlaneServer(t, store, secrets, dialer, measurements)
	return gateway, store, secrets, authenticatedRuntimeTestClient(grant.Token, 10*time.Second), grant, measurements
}

func restartHostedGateway(
	t *testing.T,
	controlDirectory string,
	secretDirectory string,
	dialer *hostedRuntimeDialer,
	clientCredential string,
) (*controlplane.Server, *controlplane.Store, *controlplane.FileSecretStore, *http.Client, *bytes.Buffer) {
	t.Helper()
	store, secrets := openHostedGatewayState(t, controlDirectory, secretDirectory)
	measurements := &bytes.Buffer{}
	gateway := startHostedControlPlaneServer(t, store, secrets, dialer, measurements)
	return gateway, store, secrets, authenticatedRuntimeTestClient(clientCredential, 10*time.Second), measurements
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
	measurements *bytes.Buffer,
) *controlplane.Server {
	t.Helper()
	observer, err := controlplane.NewJSONLinesObserver(measurements)
	if err != nil {
		t.Fatal(err)
	}
	gateway, err := controlplane.StartServer(controlplane.ServerConfig{
		Attachments:           store,
		Authorizer:            store,
		Dialer:                dialer,
		ListenAddress:         "127.0.0.1:0",
		MaxConcurrentRequests: 8,
		MaxRequestBytes:       1 << 20,
		Observer:              observer,
		ReportingObserver:     observer,
		ReportingStore:        store,
		Routes:                store,
		RuntimeTarget:         "127.0.0.1:7345",
		Secrets:               secrets,
	})
	if err != nil {
		t.Fatal(err)
	}
	return gateway
}

func requireHostedGatewayMeasurement(
	t *testing.T,
	encoded *bytes.Buffer,
	operation string,
	resumeRequested bool,
) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(encoded.Bytes()))
	for decoder.More() {
		var measurement controlplane.GatewayMeasurement
		if err := decoder.Decode(&measurement); err != nil {
			t.Fatal(err)
		}
		if measurement.Operation != operation ||
			measurement.ResumeRequested != resumeRequested {
			continue
		}
		if !measurement.FirstResponseObserved ||
			measurement.FirstResponseMilliseconds < 0 ||
			measurement.DurationMilliseconds < measurement.FirstResponseMilliseconds {
			t.Fatalf("hosted gateway measurement = %+v", measurement)
		}
		return
	}
	t.Fatalf(
		"missing hosted gateway measurement operation=%q resume=%t in %s",
		operation,
		resumeRequested,
		encoded.String(),
	)
}

func requireHostedGatewayMeasurementsExclude(
	t *testing.T,
	encoded *bytes.Buffer,
	forbidden ...string,
) {
	t.Helper()
	observations := encoded.String()
	for _, value := range forbidden {
		if value != "" && strings.Contains(observations, value) {
			t.Fatalf("hosted gateway measurements contain private value %q: %s", value, observations)
		}
	}
}

func shutdownHostedGateway(t *testing.T, gateway *controlplane.Server, store *controlplane.Store) {
	t.Helper()
	if gateway == nil || store == nil {
		return
	}
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
	query := url.Values{}
	query.Set("workspaceId", workspaceID)
	query.Set("conversationId", conversationID)
	request, err := http.NewRequest(
		http.MethodGet,
		fmt.Sprintf("%s/conversations/events?%s", baseURL, query.Encode()),
		nil,
	)
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
		t.Fatalf(
			"hosted conversation stream = %d %q",
			response.StatusCode,
			response.Header.Get("Content-Type"),
		)
	}
	return hostedConversationStream{body: response.Body, reader: bufio.NewReader(response.Body)}
}

type hostedConversationEventEnvelope struct {
	SchemaVersion  int             `json:"schemaVersion"`
	Sequence       int             `json:"sequence"`
	EventID        string          `json:"eventId"`
	WorkspaceID    *string         `json:"workspaceId"`
	ConversationID string          `json:"conversationId"`
	Payload        json.RawMessage `json:"payload"`
}

func readHostedConversationEvent(
	t *testing.T,
	reader *bufio.Reader,
) hostedConversationEventEnvelope {
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
		if err := json.Unmarshal(
			[]byte(strings.TrimSpace(strings.TrimPrefix(line, "data: "))),
			&event,
		); err != nil {
			t.Fatal(err)
		}
		if event.SchemaVersion <= 0 ||
			event.Sequence <= 0 ||
			event.EventID == "" ||
			event.WorkspaceID == nil ||
			*event.WorkspaceID == "" ||
			event.ConversationID == "" ||
			len(event.Payload) == 0 {
			t.Fatalf("invalid hosted conversation event: %+v", event)
		}
		return event
	}
}
