package sprites

import (
	"context"
	"errors"
	"io"
	"net"
	"slices"
	"strings"
	"testing"
	"time"

	spritessdk "github.com/superfly/sprites-go"

	"setta/internal/runtimeprovider"
)

func TestAdapterCreateConvergesOnOwnedRuntime(t *testing.T) {
	identity := testManagedIdentity(t)
	created := testRuntimeInfo(identity, "running")
	providerFailure := errors.New("ambiguous provider failure")
	findCalls := 0
	createCalls := 0
	adapter := &Adapter{client: &fakeSDKAPI{
		findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
			findCalls++
			if findCalls == 1 {
				return nil, false, nil
			}
			return created, true, nil
		},
		create: func(_ context.Context, _ string, _ []string, resources runtimeprovider.RuntimeResources) error {
			createCalls++
			if resources != testRuntimeResources() {
				t.Fatalf("Create resources = %+v", resources)
			}
			return providerFailure
		},
	}}

	observation, err := adapter.Create(context.Background(), testCreateRequest(identity))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if observation.Name != identity.Name || !slices.Equal(observation.Labels, identity.Labels) {
		t.Fatalf("observation = %#v", observation)
	}
	if createCalls != 1 || findCalls != 2 {
		t.Fatalf("calls = create %d, find %d", createCalls, findCalls)
	}
}

func TestAdapterBaseURLRequiresEncryptedOrLoopbackOrigin(t *testing.T) {
	for _, value := range []string{
		"https://api.sprites.dev",
		"https://sprites.internal:8443",
		"http://127.0.0.1:8080",
		"http://[::1]:8080",
		"http://localhost:8080",
	} {
		if _, err := NewAdapterWithBaseURL("provider-token", value); err != nil {
			t.Fatalf("NewAdapterWithBaseURL(%q): %v", value, err)
		}
	}
	for _, value := range []string{
		"",
		"api.sprites.dev",
		"http://api.sprites.dev",
		"https://user@example.com",
		"https://api.sprites.dev/v1",
		"https://api.sprites.dev?token=value",
	} {
		if _, err := NewAdapterWithBaseURL("provider-token", value); err == nil {
			t.Fatalf("NewAdapterWithBaseURL(%q) succeeded", value)
		}
	}
}

func TestAdapterCreateReusesExistingOwnedRuntime(t *testing.T) {
	identity := testManagedIdentity(t)
	createCalls := 0
	adapter := &Adapter{client: &fakeSDKAPI{
		findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
			return testRuntimeInfo(identity, "warm"), true, nil
		},
		create: func(context.Context, string, []string, runtimeprovider.RuntimeResources) error {
			createCalls++
			return nil
		},
	}}

	observation, err := adapter.Create(context.Background(), testCreateRequest(identity))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if observation.Activity != runtimeprovider.RuntimeActivityWarm {
		t.Fatalf("activity = %q", observation.Activity)
	}
	if createCalls != 0 {
		t.Fatalf("create calls = %d", createCalls)
	}
}

func TestAdapterCreateRejectsExistingRuntimeWithDifferentResources(t *testing.T) {
	identity := testManagedIdentity(t)
	runtime := testRuntimeInfo(identity, "warm")
	runtime.Config.RamMB++
	adapter := &Adapter{client: &fakeSDKAPI{
		findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
			return runtime, true, nil
		},
	}}

	_, err := adapter.Create(context.Background(), testCreateRequest(identity))
	if !errors.Is(err, ErrOwnershipMismatch) {
		t.Fatalf("Create error = %v, want ErrOwnershipMismatch", err)
	}
}

func TestAdapterNeverAdoptsForeignLabels(t *testing.T) {
	identity := testManagedIdentity(t)
	foreign := testRuntimeInfo(identity, "running")
	foreign.Labels = []string{"customer-owned"}

	t.Run("existing", func(t *testing.T) {
		adapter := &Adapter{client: &fakeSDKAPI{
			findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
				return foreign, true, nil
			},
		}}
		_, err := adapter.Create(context.Background(), testCreateRequest(identity))
		if !errors.Is(err, ErrOwnershipMismatch) {
			t.Fatalf("Create error = %v, want ErrOwnershipMismatch", err)
		}
	})

	t.Run("ambiguous create", func(t *testing.T) {
		findCalls := 0
		adapter := &Adapter{client: &fakeSDKAPI{
			findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
				findCalls++
				if findCalls == 1 {
					return nil, false, nil
				}
				return foreign, true, nil
			},
			create: func(context.Context, string, []string, runtimeprovider.RuntimeResources) error {
				return errors.New("ambiguous")
			},
		}}
		_, err := adapter.Create(context.Background(), testCreateRequest(identity))
		if !errors.Is(err, ErrOwnershipMismatch) {
			t.Fatalf("Create error = %v, want ErrOwnershipMismatch", err)
		}
	})
}

func TestAdapterSuspendRequiresExactOwnedRuntime(t *testing.T) {
	identity := testManagedIdentity(t)
	suspendCalls := 0
	adapter := &Adapter{client: &fakeSDKAPI{
		findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
			return testRuntimeInfo(identity, "running"), true, nil
		},
		suspend: func(_ context.Context, name string) error {
			suspendCalls++
			if name != identity.Name {
				t.Fatalf("Suspend name = %q", name)
			}
			return nil
		},
	}}
	if err := adapter.Suspend(context.Background(), identity.Name); err != nil {
		t.Fatal(err)
	}
	if suspendCalls != 1 {
		t.Fatalf("Suspend calls = %d", suspendCalls)
	}
}

func TestAdapterDestroyIsIdempotentAndOwnershipChecked(t *testing.T) {
	identity := testManagedIdentity(t)

	t.Run("missing", func(t *testing.T) {
		destroyCalls := 0
		adapter := &Adapter{client: &fakeSDKAPI{
			findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
				return nil, false, nil
			},
			destroy: func(context.Context, string) error {
				destroyCalls++
				return nil
			},
		}}
		if err := adapter.Destroy(context.Background(), identity.Name); err != nil {
			t.Fatalf("Destroy: %v", err)
		}
		if destroyCalls != 0 {
			t.Fatalf("destroy calls = %d", destroyCalls)
		}
	})

	t.Run("foreign labels", func(t *testing.T) {
		runtime := testRuntimeInfo(identity, "running")
		runtime.Labels = []string{"foreign"}
		adapter := &Adapter{client: &fakeSDKAPI{
			findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
				return runtime, true, nil
			},
		}}
		err := adapter.Destroy(context.Background(), identity.Name)
		if !errors.Is(err, ErrOwnershipMismatch) {
			t.Fatalf("Destroy error = %v, want ErrOwnershipMismatch", err)
		}
	})
}

func TestAdapterConfigureURLMapsOnlyProvenModes(t *testing.T) {
	identity := testManagedIdentity(t)
	var authValues []string
	adapter := &Adapter{client: &fakeSDKAPI{
		findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
			return testRuntimeInfo(identity, "running"), true, nil
		},
		configureURL: func(_ context.Context, _ string, auth string) error {
			authValues = append(authValues, auth)
			return nil
		},
	}}

	if err := adapter.ConfigureURL(context.Background(), identity.Name, runtimeprovider.URLAccessAuthenticated); err != nil {
		t.Fatalf("ConfigureURL authenticated: %v", err)
	}
	if err := adapter.ConfigureURL(context.Background(), identity.Name, runtimeprovider.URLAccessPublic); err != nil {
		t.Fatalf("ConfigureURL public: %v", err)
	}
	if !slices.Equal(authValues, []string{"sprite", "public"}) {
		t.Fatalf("auth values = %v", authValues)
	}
	if err := adapter.ConfigureURL(context.Background(), identity.Name, "private-access"); !errors.Is(err, runtimeprovider.ErrInvalidContract) {
		t.Fatalf("ConfigureURL invalid error = %v", err)
	}
}

func TestAdapterDialsOnlyOwnedRuntimeLoopback(t *testing.T) {
	identity := testManagedIdentity(t)
	clientConnection, serverConnection := net.Pipe()
	t.Cleanup(func() {
		clientConnection.Close()
		serverConnection.Close()
	})

	var gotNetwork string
	var gotName string
	var gotAddress string
	adapter := &Adapter{client: &fakeSDKAPI{
		findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
			return testRuntimeInfo(identity, "running"), true, nil
		},
		proxySocket: func(_ context.Context, network string, name string, address string) (net.Conn, error) {
			gotNetwork = network
			gotName = name
			gotAddress = address
			return clientConnection, nil
		},
	}}

	connection, err := adapter.DialPrivateRuntime(context.Background(), identity.Name, "tcp", "127.0.0.1:8080")
	if err != nil {
		t.Fatalf("DialPrivateRuntime: %v", err)
	}
	if connection != clientConnection {
		t.Fatal("DialPrivateRuntime returned a different connection")
	}
	if gotNetwork != "tcp" || gotName != identity.Name || gotAddress != "127.0.0.1:8080" {
		t.Fatalf("proxy call = (%q, %q, %q)", gotNetwork, gotName, gotAddress)
	}
}

func TestAdapterRejectsUnsafePrivateRuntimeDialBeforeProviderCall(t *testing.T) {
	identity := testManagedIdentity(t)
	providerCalls := 0
	adapter := &Adapter{client: &fakeSDKAPI{
		findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
			providerCalls++
			return testRuntimeInfo(identity, "running"), true, nil
		},
		proxySocket: func(context.Context, string, string, string) (net.Conn, error) {
			providerCalls++
			return nil, errors.New("unexpected proxy call")
		},
	}}

	for _, test := range []struct {
		name    string
		network string
		address string
	}{
		{name: "udp", network: "udp", address: "127.0.0.1:8080"},
		{name: "public host", network: "tcp", address: "example.com:8080"},
		{name: "unspecified host", network: "tcp", address: ":8080"},
		{name: "zero port", network: "tcp", address: "localhost:0"},
		{name: "missing port", network: "tcp", address: "localhost"},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := adapter.DialPrivateRuntime(context.Background(), identity.Name, test.network, test.address)
			if !errors.Is(err, runtimeprovider.ErrInvalidContract) {
				t.Fatalf("DialPrivateRuntime error = %v", err)
			}
		})
	}
	if providerCalls != 0 {
		t.Fatalf("provider calls = %d, want 0", providerCalls)
	}
}

func TestProviderMappingsFailOnUnknownValues(t *testing.T) {
	identity := testManagedIdentity(t)
	runtime := testRuntimeInfo(identity, "new-provider-state")
	if _, err := mapRuntime(runtime); !errors.Is(err, ErrUnexpectedProviderValue) {
		t.Fatalf("mapRuntime error = %v", err)
	}

	service := &spritessdk.ServiceWithState{
		Service: spritessdk.Service{Name: "setta-service", Cmd: "/bin/true"},
		State:   &spritessdk.ServiceState{Status: "new-provider-state"},
	}
	if _, err := mapService(service); !errors.Is(err, ErrUnexpectedProviderValue) {
		t.Fatalf("mapService error = %v", err)
	}
}

func TestServiceIdentityMapsThroughSetprivWrapper(t *testing.T) {
	port := 7345
	spec := runtimeprovider.ServiceSpec{
		Name:      "setta-runtime",
		Path:      "/var/lib/setta/runtime-install/releases/v1/setta",
		Arguments: []string{"serve", "--port", "7345"},
		Needs:     []string{"network"},
		HTTPPort:  &port,
		RunAs: runtimeprovider.ServiceIdentity{
			User:  "root",
			Group: "root",
		},
	}

	request, err := mapServiceSpecToSDK(spec)
	if err != nil {
		t.Fatalf("mapServiceSpecToSDK: %v", err)
	}
	wantArgs := []string{
		"--reuid", "root",
		"--regid", "root",
		"--clear-groups",
		"--",
		spec.Path,
		"serve", "--port", "7345",
	}
	if request.Cmd != spritesServiceIdentityWrapperPath || !slices.Equal(request.Args, wantArgs) {
		t.Fatalf("SDK service request = cmd %q args %v", request.Cmd, request.Args)
	}

	observed, err := mapService(&spritessdk.ServiceWithState{
		Service: spritessdk.Service{
			Name:     spec.Name,
			Cmd:      request.Cmd,
			Args:     request.Args,
			Needs:    request.Needs,
			HTTPPort: request.HTTPPort,
		},
		State: &spritessdk.ServiceState{Status: "running", PID: 77},
	})
	if err != nil {
		t.Fatalf("mapService: %v", err)
	}
	if observed.Spec.Path != spec.Path ||
		!slices.Equal(observed.Spec.Arguments, spec.Arguments) ||
		observed.Spec.RunAs != spec.RunAs {
		t.Fatalf("observed spec = %#v, want %#v", observed.Spec, spec)
	}
}

func TestServiceIdentityWrapperIsNotGuessedFromUnrecognizedSetprivCommand(t *testing.T) {
	service := &spritessdk.ServiceWithState{
		Service: spritessdk.Service{
			Name: "setta-runtime",
			Cmd:  spritesServiceIdentityWrapperPath,
			Args: []string{"--dump"},
		},
		State: &spritessdk.ServiceState{Status: "running"},
	}
	observation, err := mapService(service)
	if err != nil {
		t.Fatalf("mapService: %v", err)
	}
	if !observation.Spec.RunAs.IsZero() || observation.Spec.Path != spritesServiceIdentityWrapperPath {
		t.Fatalf("observation = %#v", observation.Spec)
	}
}

func TestNetworkPolicyMappingIsTypedAndExhaustive(t *testing.T) {
	policy := runtimeprovider.NetworkPolicy{Rules: []runtimeprovider.NetworkRule{
		{Include: "setta-defaults"},
		{Domain: "github.com", Action: runtimeprovider.NetworkRuleAllow},
		{Domain: "*", Action: runtimeprovider.NetworkRuleDeny},
	}}
	sdkPolicy, err := mapNetworkPolicyToSDK(policy)
	if err != nil {
		t.Fatalf("mapNetworkPolicyToSDK: %v", err)
	}
	roundTrip, err := mapNetworkPolicyFromSDK(sdkPolicy)
	if err != nil {
		t.Fatalf("mapNetworkPolicyFromSDK: %v", err)
	}
	if !slices.Equal(roundTrip.Rules, policy.Rules) {
		t.Fatalf("round trip = %#v, want %#v", roundTrip, policy)
	}

	invalid := []runtimeprovider.NetworkRule{
		{},
		{Domain: "github.com", Include: "defaults", Action: runtimeprovider.NetworkRuleAllow},
		{Include: "defaults", Action: runtimeprovider.NetworkRuleAllow},
		{Domain: "github.com", Action: "audit"},
	}
	for _, rule := range invalid {
		_, err := mapNetworkPolicyToSDK(runtimeprovider.NetworkPolicy{Rules: []runtimeprovider.NetworkRule{rule}})
		if !errors.Is(err, runtimeprovider.ErrInvalidContract) {
			t.Fatalf("rule %#v error = %v, want ErrInvalidContract", rule, err)
		}
	}
}

func TestProviderStreamsRequireExplicitCompletion(t *testing.T) {
	tests := map[string]struct {
		events []*spritessdk.StreamMessage
		want   error
	}{
		"complete":  {events: []*spritessdk.StreamMessage{{Type: "info"}, {Type: "complete"}}},
		"early EOF": {events: []*spritessdk.StreamMessage{{Type: "info"}}, want: ErrIncompleteProviderStream},
		"unknown":   {events: []*spritessdk.StreamMessage{{Type: "progress"}}, want: ErrUnexpectedProviderValue},
	}
	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			stream := &fakeCheckpointStream{events: test.events}
			err := consumeCheckpointStream(stream)
			if !errors.Is(err, test.want) {
				t.Fatalf("consumeCheckpointStream error = %v, want %v", err, test.want)
			}
			if !stream.closed {
				t.Fatal("stream was not closed")
			}
		})
	}
}

func TestProviderStreamErrorPreservesResponseDetail(t *testing.T) {
	stream := &fakeCheckpointStream{events: []*spritessdk.StreamMessage{{
		Type:  "error",
		Error: "service supervisor is still restarting",
	}}}
	err := consumeRestoreStream(stream)
	var streamErr *mutationStreamError
	if !errors.As(err, &streamErr) {
		t.Fatalf("consumeRestoreStream error = %T %v", err, err)
	}
	if streamErr.operation != "restore" || streamErr.detail != "service supervisor is still restarting" {
		t.Fatalf("stream error = %#v", streamErr)
	}
	if !stream.closed {
		t.Fatal("stream was not closed")
	}
}

func TestServiceStreamRequiresExplicitCompletion(t *testing.T) {
	stream := &fakeServiceStream{events: []*spritessdk.ServiceLogEvent{
		{Type: "stdout", Data: "ordinary service output"},
		{Type: "stderr", Data: "ordinary service error output"},
		{Type: "started"},
		{Type: "stopping"},
		{Type: "stopped"},
		{Type: "exit"},
		{Type: "complete"},
	}}
	if err := consumeServiceStream(stream); err != nil {
		t.Fatalf("consumeServiceStream: %v", err)
	}
	if !stream.closed {
		t.Fatal("stream was not closed")
	}

	earlyEOF := &fakeServiceStream{events: []*spritessdk.ServiceLogEvent{{Type: "started"}}}
	if err := consumeServiceStream(earlyEOF); !errors.Is(err, ErrIncompleteProviderStream) {
		t.Fatalf("early EOF error = %v", err)
	}

	unknown := &fakeServiceStream{events: []*spritessdk.ServiceLogEvent{{Type: "progress"}}}
	if err := consumeServiceStream(unknown); !errors.Is(err, ErrUnexpectedProviderValue) {
		t.Fatalf("unknown event error = %v", err)
	}
}

func TestServiceStreamErrorPreservesOnlyBoundedErrorEventData(t *testing.T) {
	t.Run("trimmed error detail excludes prior output", func(t *testing.T) {
		stream := &fakeServiceStream{events: []*spritessdk.ServiceLogEvent{
			{Type: "stdout", Data: "stdout must not become error detail"},
			{Type: "stderr", Data: "stderr must not become error detail"},
			{Type: "error", Data: "  service supervisor is still restarting  "},
		}}
		err := consumeServiceStream(stream)
		var streamErr *serviceStreamError
		if !errors.As(err, &streamErr) {
			t.Fatalf("consumeServiceStream error = %T %v", err, err)
		}
		if streamErr.detail != "service supervisor is still restarting" {
			t.Fatalf("stream error detail = %q", streamErr.detail)
		}
		if !stream.closed {
			t.Fatal("stream was not closed")
		}
	})

	t.Run("empty error detail uses content-free fallback", func(t *testing.T) {
		err := consumeServiceStream(&fakeServiceStream{events: []*spritessdk.ServiceLogEvent{{
			Type: "error",
			Data: " \n\t ",
		}}})
		var streamErr *serviceStreamError
		if !errors.As(err, &streamErr) ||
			streamErr.detail != "provider returned an error event without detail" {
			t.Fatalf("consumeServiceStream error = %T %v", err, err)
		}
	})

	t.Run("oversized error detail is truncated", func(t *testing.T) {
		oversized := strings.Repeat("a", maximumServiceStreamErrorDetailBytes) + "tail-must-be-removed"
		err := consumeServiceStream(&fakeServiceStream{events: []*spritessdk.ServiceLogEvent{{
			Type: "error",
			Data: oversized,
		}}})
		var streamErr *serviceStreamError
		if !errors.As(err, &streamErr) {
			t.Fatalf("consumeServiceStream error = %T %v", err, err)
		}
		if streamErr.detail != oversized[:maximumServiceStreamErrorDetailBytes] ||
			len(streamErr.detail) != maximumServiceStreamErrorDetailBytes ||
			streamErr.detail == oversized {
			t.Fatalf("bounded detail length = %d, detail = %q", len(streamErr.detail), streamErr.detail)
		}
	})
}

func TestAdapterEnsureServiceSurfacesStreamDetailThroughOperationError(t *testing.T) {
	identity := testManagedIdentity(t)
	const detail = "service supervisor is still restarting"
	adapter := &Adapter{client: &fakeSDKAPI{
		findRuntime: func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
			return testRuntimeInfo(identity, "running"), true, nil
		},
		ensureService: func(context.Context, string, runtimeprovider.ServiceSpec) (*spritessdk.ServiceWithState, error) {
			return nil, &serviceStreamError{detail: detail}
		},
	}}
	_, err := adapter.EnsureService(context.Background(), identity.Name, runtimeprovider.ServiceSpec{
		Name: "setta-runtime",
		Path: "/var/lib/setta/runtime-install/releases/v1/setta",
		RunAs: runtimeprovider.ServiceIdentity{
			User:  "root",
			Group: "root",
		},
	})
	var operationErr *OperationError
	if !errors.As(err, &operationErr) {
		t.Fatalf("EnsureService error = %T %v", err, err)
	}
	if operationErr.Operation != "ensure service" || operationErr.Detail != detail {
		t.Fatalf("operation error = %#v", operationErr)
	}
}

func TestSingleNewCheckpointRejectsAmbiguousResults(t *testing.T) {
	before := []*spritessdk.Checkpoint{{ID: "one"}}
	created := &spritessdk.Checkpoint{ID: "two"}
	checkpoint, err := singleNewCheckpoint(before, []*spritessdk.Checkpoint{before[0], created})
	if err != nil || checkpoint != created {
		t.Fatalf("singleNewCheckpoint = %#v, %v", checkpoint, err)
	}
	for _, after := range [][]*spritessdk.Checkpoint{
		before,
		{before[0], created, &spritessdk.Checkpoint{ID: "three"}},
	} {
		if _, err := singleNewCheckpoint(before, after); !errors.Is(err, ErrIncompleteProviderStream) {
			t.Fatalf("after %#v error = %v", after, err)
		}
	}
}

func TestOperationErrorPreservesTypedProviderMetadataAndDetail(t *testing.T) {
	providerErr := &spritessdk.APIError{
		StatusCode:        429,
		RetryAfterSeconds: 12,
		ErrorCode:         "temporarily_unavailable",
		Message:           "service supervisor is still restarting",
	}
	err := operationError("create", providerErr)
	var operationErr *OperationError
	if !errors.As(err, &operationErr) {
		t.Fatalf("error = %T %v", err, err)
	}
	if operationErr.StatusCode != 429 || operationErr.RetryAfter != 12 ||
		operationErr.Detail != "temporarily_unavailable: service supervisor is still restarting" {
		t.Fatalf("metadata = %#v", operationErr)
	}
	if operationErr.Error() != "Sprites create failed with HTTP status 429: temporarily_unavailable: service supervisor is still restarting" {
		t.Fatalf("Error = %q", operationErr.Error())
	}
	if !errors.Is(err, providerErr) {
		t.Fatal("provider error is not preserved")
	}
}

func TestOperationErrorDecodesPinnedSDKHTTPResponse(t *testing.T) {
	providerErr := errors.New(`API returned status 409: {"error":"runtime is restarting"}`)
	err := operationError("restore checkpoint", providerErr)
	var operationErr *OperationError
	if !errors.As(err, &operationErr) {
		t.Fatalf("error = %T %v", err, err)
	}
	if operationErr.StatusCode != 409 || operationErr.Detail != `{"error":"runtime is restarting"}` {
		t.Fatalf("metadata = %#v", operationErr)
	}
	if !errors.Is(err, providerErr) {
		t.Fatal("provider error is not preserved")
	}
}

type fakeSDKAPI struct {
	create        func(context.Context, string, []string, runtimeprovider.RuntimeResources) error
	findRuntime   func(context.Context, string) (*spritessdk.SpriteInfo, bool, error)
	exec          func(context.Context, runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error)
	configureURL  func(context.Context, string, string) error
	proxySocket   func(context.Context, string, string, string) (net.Conn, error)
	ensureService func(context.Context, string, runtimeprovider.ServiceSpec) (*spritessdk.ServiceWithState, error)
	findService   func(context.Context, string, string) (*spritessdk.ServiceWithState, bool, error)
	applyPolicy   func(context.Context, string, *spritessdk.NetworkPolicy) error
	inspectPolicy func(context.Context, string) (*spritessdk.NetworkPolicy, error)
	createCP      func(context.Context, string, string) (*spritessdk.Checkpoint, error)
	findCP        func(context.Context, string, string) (*spritessdk.Checkpoint, bool, error)
	restoreCP     func(context.Context, string, string) error
	suspend       func(context.Context, string) error
	destroy       func(context.Context, string) error
	serverVersion func(context.Context, string) (string, error)
	orgSnapshot   func(context.Context) (*sdkOrganizationSnapshot, error)
}

func (client *fakeSDKAPI) Create(
	ctx context.Context,
	name string,
	labels []string,
	resources runtimeprovider.RuntimeResources,
) error {
	if client.create == nil {
		return errors.New("unexpected Create call")
	}
	return client.create(ctx, name, labels, resources)
}

func (client *fakeSDKAPI) FindRuntime(ctx context.Context, name string) (*spritessdk.SpriteInfo, bool, error) {
	if client.findRuntime == nil {
		return nil, false, errors.New("unexpected FindRuntime call")
	}
	return client.findRuntime(ctx, name)
}

func (client *fakeSDKAPI) Exec(
	ctx context.Context,
	request runtimeprovider.ExecRequest,
) (runtimeprovider.ExecResult, error) {
	if client.exec == nil {
		return runtimeprovider.ExecResult{}, errors.New("unexpected Exec call")
	}
	return client.exec(ctx, request)
}

func (client *fakeSDKAPI) ConfigureURL(ctx context.Context, name string, auth string) error {
	if client.configureURL == nil {
		return errors.New("unexpected ConfigureURL call")
	}
	return client.configureURL(ctx, name, auth)
}

func (client *fakeSDKAPI) ProxySocket(
	ctx context.Context,
	network string,
	name string,
	address string,
) (net.Conn, error) {
	if client.proxySocket == nil {
		return nil, errors.New("unexpected ProxySocket call")
	}
	return client.proxySocket(ctx, network, name, address)
}

func (client *fakeSDKAPI) EnsureService(
	ctx context.Context,
	name string,
	spec runtimeprovider.ServiceSpec,
) (*spritessdk.ServiceWithState, error) {
	if client.ensureService == nil {
		return nil, errors.New("unexpected EnsureService call")
	}
	return client.ensureService(ctx, name, spec)
}

func (client *fakeSDKAPI) FindService(
	ctx context.Context,
	runtimeName string,
	serviceName string,
) (*spritessdk.ServiceWithState, bool, error) {
	if client.findService == nil {
		return nil, false, errors.New("unexpected FindService call")
	}
	return client.findService(ctx, runtimeName, serviceName)
}

func (client *fakeSDKAPI) ApplyNetworkPolicy(
	ctx context.Context,
	name string,
	policy *spritessdk.NetworkPolicy,
) error {
	if client.applyPolicy == nil {
		return errors.New("unexpected ApplyNetworkPolicy call")
	}
	return client.applyPolicy(ctx, name, policy)
}

func (client *fakeSDKAPI) InspectNetworkPolicy(
	ctx context.Context,
	name string,
) (*spritessdk.NetworkPolicy, error) {
	if client.inspectPolicy == nil {
		return nil, errors.New("unexpected InspectNetworkPolicy call")
	}
	return client.inspectPolicy(ctx, name)
}

func (client *fakeSDKAPI) CreateCheckpoint(
	ctx context.Context,
	name string,
	comment string,
) (*spritessdk.Checkpoint, error) {
	if client.createCP == nil {
		return nil, errors.New("unexpected CreateCheckpoint call")
	}
	return client.createCP(ctx, name, comment)
}

func (client *fakeSDKAPI) FindCheckpoint(
	ctx context.Context,
	name string,
	checkpointID string,
) (*spritessdk.Checkpoint, bool, error) {
	if client.findCP == nil {
		return nil, false, errors.New("unexpected FindCheckpoint call")
	}
	return client.findCP(ctx, name, checkpointID)
}

func (client *fakeSDKAPI) RestoreCheckpoint(ctx context.Context, name string, checkpointID string) error {
	if client.restoreCP == nil {
		return errors.New("unexpected RestoreCheckpoint call")
	}
	return client.restoreCP(ctx, name, checkpointID)
}

func (client *fakeSDKAPI) Suspend(ctx context.Context, name string) error {
	if client.suspend == nil {
		return errors.New("unexpected Suspend call")
	}
	return client.suspend(ctx, name)
}

func (client *fakeSDKAPI) Destroy(ctx context.Context, name string) error {
	if client.destroy == nil {
		return errors.New("unexpected Destroy call")
	}
	return client.destroy(ctx, name)
}

func (client *fakeSDKAPI) ServerVersion(ctx context.Context, name string) (string, error) {
	if client.serverVersion == nil {
		return "", errors.New("unexpected ServerVersion call")
	}
	return client.serverVersion(ctx, name)
}

func (client *fakeSDKAPI) OrganizationSnapshot(ctx context.Context) (*sdkOrganizationSnapshot, error) {
	if client.orgSnapshot == nil {
		return nil, errors.New("unexpected OrganizationSnapshot call")
	}
	return client.orgSnapshot(ctx)
}

type fakeCheckpointStream struct {
	events []*spritessdk.StreamMessage
	index  int
	closed bool
}

func (stream *fakeCheckpointStream) Next() (*spritessdk.StreamMessage, error) {
	if stream.index >= len(stream.events) {
		return nil, io.EOF
	}
	event := stream.events[stream.index]
	stream.index++
	return event, nil
}

func (stream *fakeCheckpointStream) Close() error {
	stream.closed = true
	return nil
}

type fakeServiceStream struct {
	events []*spritessdk.ServiceLogEvent
	index  int
	closed bool
}

func (stream *fakeServiceStream) Next() (*spritessdk.ServiceLogEvent, error) {
	if stream.index >= len(stream.events) {
		return nil, io.EOF
	}
	event := stream.events[stream.index]
	stream.index++
	return event, nil
}

func (stream *fakeServiceStream) Close() error {
	stream.closed = true
	return nil
}

func testManagedIdentity(t *testing.T) runtimeprovider.ManagedIdentity {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("phase1b-test-owner")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	return identity
}

func testRuntimeInfo(identity runtimeprovider.ManagedIdentity, status string) *spritessdk.SpriteInfo {
	return &spritessdk.SpriteInfo{
		ID:            "provider-id",
		Name:          identity.Name,
		Status:        status,
		Labels:        slices.Clone(identity.Labels),
		Config:        &spritessdk.SpriteConfig{CPUs: 1, RamMB: 512, StorageGB: 10},
		URL:           "https://runtime.example",
		URLSettings:   &spritessdk.URLSettings{Auth: "sprite"},
		PrimaryRegion: "yyz",
		CreatedAt:     time.Date(2026, 7, 13, 18, 0, 0, 0, time.UTC),
		UpdatedAt:     time.Date(2026, 7, 13, 19, 0, 0, 0, time.UTC),
	}
}

func testRuntimeResources() runtimeprovider.RuntimeResources {
	return runtimeprovider.RuntimeResources{
		CPUCoreMillionths: 1_000_000,
		MemoryBytes:       512_000_000,
		StorageBytes:      10_000_000_000,
	}
}

func testCreateRequest(identity runtimeprovider.ManagedIdentity) runtimeprovider.CreateRequest {
	return runtimeprovider.CreateRequest{Identity: identity, Resources: testRuntimeResources()}
}
