package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/tools"
)

type workerHostEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

// The host should reject empty configurations instead of silently accepting a no-op boundary.
func TestNewWorkerHostRequiresService(t *testing.T) {
	t.Parallel()

	host, err := NewWorkerHost(WorkerHostOptions{})
	if host != nil {
		t.Fatal("expected nil host")
	}
	if !errors.Is(err, ErrWorkerHostServiceRequired) {
		t.Fatalf("expected service-required error, got %v", err)
	}
}

// Router registration should normalize plugin mount prefixes and preserve route metadata for later proxying.
func TestWorkerHostRegisterRouterNormalizesRegistration(t *testing.T) {
	t.Parallel()

	registry := NewBackendRouterRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		RouterRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	needsRawBody := false
	err = host.RegisterRouter(context.Background(), WorkerContext{
		PluginID:              "fixture-plugin",
		EffectiveCapabilities: []string{CapabilityRegisterRouter},
	}, RegisterRouterRequest{
		Prefix: stringPointer("/payload"),
		Routes: []workerBackendRouteDescriptor{
			{
				RouteID:      "route_1",
				Path:         "echo",
				Methods:      []string{"get", "POST", "GET"},
				NeedsRawBody: &needsRawBody,
			},
		},
	})
	if err != nil {
		t.Fatalf("register router: %v", err)
	}

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 router registration, got %d", len(registrations))
	}
	registration := registrations[0]
	if registration.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin, got %q", registration.PluginID)
	}
	if registration.Prefix != "payload" {
		t.Fatalf("expected normalized payload prefix, got %q", registration.Prefix)
	}
	if len(registration.Routes) != 1 {
		t.Fatalf("expected 1 registered route, got %d", len(registration.Routes))
	}
	route := registration.Routes[0]
	if route.RouteID != "route_1" {
		t.Fatalf("expected route_1 id, got %q", route.RouteID)
	}
	if route.Path != "/echo" {
		t.Fatalf("expected normalized route path /echo, got %q", route.Path)
	}
	if len(route.Methods) != 2 || route.Methods[0] != http.MethodGet || route.Methods[1] != http.MethodPost {
		t.Fatalf("unexpected route methods %#v", route.Methods)
	}
	if route.NeedsRawBody {
		t.Fatalf("expected explicit false needsRawBody, got true")
	}
}

// Router registration should reject capability-free workers before mutating the registry.
func TestWorkerHostRegisterRouterRequiresCapability(t *testing.T) {
	t.Parallel()

	registry := NewBackendRouterRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		RouterRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterRouter(context.Background(), WorkerContext{
		PluginID: "fixture-plugin",
	}, RegisterRouterRequest{
		Routes: []workerBackendRouteDescriptor{
			{
				RouteID: "route_1",
				Path:    "/echo",
				Methods: []string{http.MethodGet},
			},
		},
	})
	if !errors.Is(err, ErrWorkerHostCapabilityDenied) {
		t.Fatalf("expected capability-denied error, got %v", err)
	}
}

// Listener-endpoint registration should normalize endpoint names and require a route owned by the same plugin.
func TestWorkerHostRegisterListenerEndpointNormalizesRegistration(t *testing.T) {
	t.Parallel()

	routers := NewBackendRouterRegistry()
	if err := routers.RegisterRouter(context.Background(), RegisteredBackendRouter{
		PluginID: "fixture-plugin",
		Routes: []RegisteredBackendRoute{
			{
				RouteID: "route_1",
				Path:    "/listener",
				Methods: []string{http.MethodPost},
			},
		},
	}); err != nil {
		t.Fatalf("register router fixture: %v", err)
	}

	registry := NewBackendListenerEndpointRegistry(routers)
	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerEndpointRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterListenerEndpoint(context.Background(), WorkerContext{
		PluginID:              "fixture-plugin",
		EffectiveCapabilities: []string{CapabilityRegisterListenerEndpoint},
	}, RegisterListenerEndpointRequest{
		EndpointName: " fixture_listener ",
		RouteID:      " route_1 ",
	})
	if err != nil {
		t.Fatalf("register listener endpoint: %v", err)
	}

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 listener endpoint registration, got %#v", registrations)
	}
	if registrations[0].PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin, got %q", registrations[0].PluginID)
	}
	if registrations[0].EndpointName != "fixture_listener" {
		t.Fatalf("expected trimmed endpoint name, got %q", registrations[0].EndpointName)
	}
	if registrations[0].RouteID != "route_1" {
		t.Fatalf("expected trimmed route id, got %q", registrations[0].RouteID)
	}
}

// Listener-endpoint registration should require the explicit worker capability before mutating runtime state.
func TestWorkerHostRegisterListenerEndpointRequiresCapability(t *testing.T) {
	t.Parallel()

	routers := NewBackendRouterRegistry()
	if err := routers.RegisterRouter(context.Background(), RegisteredBackendRouter{
		PluginID: "fixture-plugin",
		Routes: []RegisteredBackendRoute{
			{
				RouteID: "route_1",
				Path:    "/listener",
				Methods: []string{http.MethodPost},
			},
		},
	}); err != nil {
		t.Fatalf("register router fixture: %v", err)
	}

	registry := NewBackendListenerEndpointRegistry(routers)
	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerEndpointRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterListenerEndpoint(context.Background(), WorkerContext{
		PluginID: "fixture-plugin",
	}, RegisterListenerEndpointRequest{
		EndpointName: "fixture_listener",
		RouteID:      "route_1",
	})
	if !errors.Is(err, ErrWorkerHostCapabilityDenied) {
		t.Fatalf("expected capability-denied error, got %v", err)
	}
}

// Static-dir registration should resolve plugin-root-relative directories and normalize the published URL prefix.
func TestWorkerHostRegisterStaticDirNormalizesRegistration(t *testing.T) {
	t.Parallel()

	pluginRoot := t.TempDir()
	staticRoot := filepath.Join(pluginRoot, "backend", "static")
	if err := os.MkdirAll(staticRoot, 0o755); err != nil {
		t.Fatalf("mkdir static root: %v", err)
	}

	registry := NewBackendStaticDirRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		StaticDirRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterStaticDir(context.Background(), WorkerContext{
		PluginID:              "fixture-plugin",
		PluginRoot:            pluginRoot,
		EffectiveCapabilities: []string{CapabilityRegisterStaticDir},
	}, RegisterStaticDirRequest{
		URLPrefix: "/assets",
		Path:      "backend/static",
	})
	if err != nil {
		t.Fatalf("register static dir: %v", err)
	}

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 static-dir registration, got %#v", registrations)
	}
	registration := registrations[0]
	if registration.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin, got %q", registration.PluginID)
	}
	if registration.URLPrefix != "assets" {
		t.Fatalf("expected normalized assets prefix, got %q", registration.URLPrefix)
	}
	if registration.SourceDir != staticRoot {
		t.Fatalf("expected resolved static root %q, got %q", staticRoot, registration.SourceDir)
	}
}

// Static-dir registration should require the explicit worker capability before mutating runtime state.
func TestWorkerHostRegisterStaticDirRequiresCapability(t *testing.T) {
	t.Parallel()

	pluginRoot := t.TempDir()
	staticRoot := filepath.Join(pluginRoot, "backend", "static")
	if err := os.MkdirAll(staticRoot, 0o755); err != nil {
		t.Fatalf("mkdir static root: %v", err)
	}

	registry := NewBackendStaticDirRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		StaticDirRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterStaticDir(context.Background(), WorkerContext{
		PluginID:   "fixture-plugin",
		PluginRoot: pluginRoot,
	}, RegisterStaticDirRequest{
		URLPrefix: "assets",
		Path:      staticRoot,
	})
	if !errors.Is(err, ErrWorkerHostCapabilityDenied) {
		t.Fatalf("expected capability-denied error, got %v", err)
	}
}

// MCP tool registration should require the explicit worker capability before mutating runtime state.
func TestWorkerHostRegisterMCPToolRequiresCapability(t *testing.T) {
	t.Parallel()

	registry := NewMCPToolRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		MCPToolRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterMCPTool(context.Background(), WorkerContext{
		PluginID: "fixture-plugin",
	}, RegisterMCPToolRequest{
		Tool: &workerMCPToolRegistrationPayload{
			Name:        "fixture_tool",
			Description: "fixture",
			InputSchema: map[string]any{
				"type": "object",
			},
			Metadata: &workerMCPToolMetadataDescriptor{
				Kind:       "discoverable",
				AccessType: "read",
			},
		},
	})
	if !errors.Is(err, ErrWorkerHostCapabilityDenied) {
		t.Fatalf("expected capability-denied error, got %v", err)
	}
}

// MCP tool registration should preserve schema and normalized metadata for later server registration.
func TestWorkerHostRegisterMCPToolNormalizesRegistration(t *testing.T) {
	t.Parallel()

	registry := NewMCPToolRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		MCPToolRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterMCPTool(context.Background(), WorkerContext{
		PluginID:              "fixture-plugin",
		EffectiveCapabilities: []string{CapabilityRegisterMCPTools},
	}, RegisterMCPToolRequest{
		Tool: &workerMCPToolRegistrationPayload{
			Name:        "fixture_tool",
			Description: "Fixture tool.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"value": map[string]any{
						"type": "string",
					},
				},
				"required": []any{"value"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
			Metadata: &workerMCPToolMetadataDescriptor{
				Kind:       "discoverable",
				AccessType: "read",
				IDPathsByType: map[string][]string{
					"section": {"sectionId"},
				},
				ResultIDPathsByType: map[string][]string{
					"codeObj": {"result.codeObjId"},
				},
				SearchTags:     []string{"fixture", "tool"},
				SearchCategory: "project",
			},
		},
	})
	if err != nil {
		t.Fatalf("register mcp tool: %v", err)
	}

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 registered mcp tool, got %#v", registrations)
	}
	registration := registrations[0]
	if registration.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin, got %q", registration.PluginID)
	}
	if registration.Name != "fixture_tool" {
		t.Fatalf("expected fixture_tool name, got %q", registration.Name)
	}
	if registration.Description != "Fixture tool." {
		t.Fatalf("expected Fixture tool. description, got %q", registration.Description)
	}
	if !reflect.DeepEqual(registration.InputSchema["required"], []any{"value"}) {
		t.Fatalf("expected required field value, got %#v", registration.InputSchema["required"])
	}
	if registration.Metadata.Kind != tools.KindDiscoverable {
		t.Fatalf("expected discoverable kind, got %#v", registration.Metadata.Kind)
	}
	if registration.Metadata.AccessType != tools.AccessTypeRead {
		t.Fatalf("expected read access type, got %#v", registration.Metadata.AccessType)
	}
	if got := registration.Metadata.IDPathsByType[tools.IDTypeSection]; !reflect.DeepEqual(got, []string{"sectionId"}) {
		t.Fatalf("expected section id paths, got %#v", got)
	}
	if got := registration.Metadata.ResultIDPathsByType[tools.IDTypeCodeObject]; !reflect.DeepEqual(got, []string{"result.codeObjId"}) {
		t.Fatalf("expected result codeObj paths, got %#v", got)
	}
	if len(registration.Metadata.SearchTags) < 2 || registration.Metadata.SearchTags[0] != "fixture" || registration.Metadata.SearchTags[1] != "tool" {
		t.Fatalf("expected explicit search tags prefix, got %#v", registration.Metadata.SearchTags)
	}
	if registration.Metadata.SearchCategory != "project" {
		t.Fatalf("expected project search category, got %q", registration.Metadata.SearchCategory)
	}
}

// Project-state reads should return summary payloads from the live runtime when the worker capability is enabled.
func TestWorkerHostReadProjectStateReturnsSummary(t *testing.T) {
	t.Parallel()

	projectRuntime := newWorkerHostTestProjectRuntime(t, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-a",
		Projects: map[string]projectstate.Project{
			"project-a": {
				ID:   "project-a",
				Name: "Project A",
			},
		},
	})
	reader, err := NewRuntimeProjectStateReader(RuntimeProjectStateReaderOptions{
		ProjectState: projectRuntime,
	})
	if err != nil {
		t.Fatalf("new project state reader: %v", err)
	}

	host, err := NewWorkerHost(WorkerHostOptions{
		ProjectStateReader: reader,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	result, err := host.ReadProjectState(context.Background(), WorkerContext{
		PluginID:              "fixture-plugin",
		EffectiveCapabilities: []string{CapabilityReadProjectState},
	}, ReadProjectStateRequest{
		ProjectID: "project-a",
		View:      ProjectStateViewSummary,
	})
	if err != nil {
		t.Fatalf("read project state: %v", err)
	}
	if result.View != ProjectStateViewSummary {
		t.Fatalf("expected summary view, got %q", result.View)
	}

	encoded, err := json.Marshal(result.ProjectState)
	if err != nil {
		t.Fatalf("marshal project state summary: %v", err)
	}

	var payload struct {
		ProjectConfig struct {
			ID string `json:"id"`
		} `json:"projectConfig"`
	}
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatalf("decode project state summary: %v", err)
	}
	if payload.ProjectConfig.ID != "project-a" {
		t.Fatalf("expected project-a summary id, got %#v", payload.ProjectConfig.ID)
	}
}

// Host requests without the emitListenerEvents capability should fail before delivery.
func TestWorkerHostEmitListenerDependencyEventsRequiresCapability(t *testing.T) {
	t.Parallel()

	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{}),
		}),
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.EmitListenerDependencyEvents(context.Background(), WorkerContext{}, EmitListenerDependencyEventsRequest{
		ProjectID: "project-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: json.RawMessage(`{"type":"Section","sectionId":"section-action"}`),
				Payload:       json.RawMessage(`{"type":"Literal","payload":"clicked"}`),
				TimestampMS:   123,
			},
		},
	})
	if !errors.Is(err, ErrWorkerHostCapabilityDenied) {
		t.Fatalf("expected capability error, got %v", err)
	}
}

// Deployment-mode worker traffic should require an explicit share session id.
func TestWorkerHostEmitListenerDependencyEventsRequiresShareSessionInDeployment(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newWorkerHostTestDeploymentRuntime(t, &now)
	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{}),
			Deployment:  deploymentRuntime,
		}),
		Deployment: deploymentRuntime,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.EmitListenerDependencyEvents(context.Background(), WorkerContext{
		EffectiveCapabilities: []string{CapabilityEmitListenerEvents},
	}, EmitListenerDependencyEventsRequest{
		ProjectID: "project-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: json.RawMessage(`{"type":"Section","sectionId":"section-action"}`),
				Payload:       json.RawMessage(`{"type":"Literal","payload":"clicked"}`),
				TimestampMS:   123,
			},
		},
	})
	if !errors.Is(err, ErrWorkerHostShareSessionRequired) {
		t.Fatalf("expected share-session-required error, got %v", err)
	}
}

// Successful deployment-mode worker events should touch the session and deliver one batched listener message.
func TestWorkerHostEmitListenerDependencyEventsTouchesSessionAndDeliversBatch(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newWorkerHostTestDeploymentRuntime(t, &now)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}
	before, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected deployment session")
	}
	now = now.Add(2 * time.Minute)

	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	host, err := NewWorkerHost(WorkerHostOptions{
		ListenerProducer: realtime.NewListenerProducer(realtime.ListenerProducerOptions{
			Broadcaster: broadcaster,
			Deployment:  deploymentRuntime,
		}),
		Deployment: deploymentRuntime,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	server := newWorkerHostWebsocketServer(t, hub)
	defer server.Close()

	listener := connectWorkerHostListener(t, server.URL, hub, "listener-a", "share-a")
	defer listener.CloseNow()
	recordWorkerHostBootstrapAndRegistration(t, broadcaster, "listener-a", "project-a", "share-a", map[string]realtime.ListenerCallback{
		"cb-a": {
			Dependencies:   []string{"section-action", "section-second"},
			DependencyMode: realtime.ListenerDependencyModeRealtimeOnly,
		},
	})

	err = host.EmitListenerDependencyEvents(context.Background(), WorkerContext{
		EffectiveCapabilities: []string{CapabilityEmitListenerEvents},
	}, EmitListenerDependencyEventsRequest{
		ProjectID:      "project-a",
		ShareSessionID: "share-a",
		DependencyEvents: []ListenerDependencyEvent{
			{
				DependencyKey: json.RawMessage(`{"type":"Section","sectionId":"section-action"}`),
				Payload:       json.RawMessage(`{"type":"Literal","payload":"clicked"}`),
				TimestampMS:   123,
			},
			{
				DependencyKey: json.RawMessage(`{"type":"Section","sectionId":"section-second"}`),
				Payload:       json.RawMessage(`{"type":"Literal","payload":"second"}`),
				TimestampMS:   124,
			},
		},
	})
	if err != nil {
		t.Fatalf("emit listener dependency events: %v", err)
	}

	after, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected deployment session after emit")
	}
	if !after.LastSeenAt.After(before.LastSeenAt) {
		t.Fatalf("expected worker host emit to advance last-seen time from %v to after %v", before.LastSeenAt, after.LastSeenAt)
	}

	envelope := readWorkerHostEnvelope(t, listener)
	if envelope.MessageType != realtime.MessageTypeListenerDependencyEvent {
		t.Fatalf("expected listener dependency event, got %q", envelope.MessageType)
	}

	var content realtime.ListenerDependencyEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener dependency event content: %v", err)
	}
	if content.ProjectID != "project-a" {
		t.Fatalf("expected project-a content, got %q", content.ProjectID)
	}
	if content.ShareSessionID != "share-a" {
		t.Fatalf("expected share-a content, got %q", content.ShareSessionID)
	}
	if content.Sequence != 1 {
		t.Fatalf("expected sequence 1, got %d", content.Sequence)
	}
	if len(content.DependencyEvents) != 2 {
		t.Fatalf("expected 2 dependency events, got %d", len(content.DependencyEvents))
	}
	if content.DependencyEvents[0].DependencyKey != "section-action" {
		t.Fatalf("expected first dependency key section-action, got %q", content.DependencyEvents[0].DependencyKey)
	}
	if content.DependencyEvents[1].DependencyKey != "section-second" {
		t.Fatalf("expected second dependency key section-second, got %q", content.DependencyEvents[1].DependencyKey)
	}
	if string(content.DependencyEvents[0].Payload) != `{"type":"Literal","payload":"clicked"}` {
		t.Fatalf("expected first payload to round-trip, got %s", string(content.DependencyEvents[0].Payload))
	}
	if string(content.DependencyEvents[1].Payload) != `{"type":"Literal","payload":"second"}` {
		t.Fatalf("expected second payload to round-trip, got %s", string(content.DependencyEvents[1].Payload))
	}
}

// Codegen target registration should require the explicit worker capability before mutating runtime state.
func TestWorkerHostRegisterCodegenTargetRequiresCapability(t *testing.T) {
	t.Parallel()

	registry := NewCodegenTargetRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		CodegenTargetRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterCodegenTarget(context.Background(), WorkerContext{
		PluginID: "fixture-plugin",
	}, RegisterCodegenTargetRequest{
		Target: &workerCodegenTargetRegistrationPayload{
			ID:        "typescript",
			Name:      "TypeScript",
			Language:  "typescript",
			HandlerID: "typescript",
		},
	})
	if !errors.Is(err, ErrWorkerHostCapabilityDenied) {
		t.Fatalf("expected capability-denied error, got %v", err)
	}
}

// Registration should compose the final target id and default file name before storing the target for later generation.
func TestWorkerHostRegisterCodegenTargetNormalizesRegistration(t *testing.T) {
	t.Parallel()

	registry := NewCodegenTargetRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		CodegenTargetRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterCodegenTarget(context.Background(), WorkerContext{
		PluginID:              "fixture-plugin",
		EffectiveCapabilities: []string{CapabilityRegisterCodegenTarget},
	}, RegisterCodegenTargetRequest{
		Target: &workerCodegenTargetRegistrationPayload{
			ID:        "typescript",
			Name:      "TypeScript",
			Language:  "typescript",
			HandlerID: "handler-ts",
		},
	})
	if err != nil {
		t.Fatalf("register codegen target: %v", err)
	}

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 registration, got %d", len(registrations))
	}
	registration := registrations[0]
	if registration.TargetID != "fixture-plugin:typescript" {
		t.Fatalf("expected composed target id, got %q", registration.TargetID)
	}
	if registration.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin, got %q", registration.PluginID)
	}
	if registration.Language != "typescript" {
		t.Fatalf("expected typescript language, got %q", registration.Language)
	}
	if registration.Name != "TypeScript" {
		t.Fatalf("expected TypeScript name, got %q", registration.Name)
	}
	if registration.DefaultFileName != defaultCodegenTargetFileName {
		t.Fatalf("expected default file name %q, got %q", defaultCodegenTargetFileName, registration.DefaultFileName)
	}
	if registration.HandlerID != "handler-ts" {
		t.Fatalf("expected handler-ts, got %q", registration.HandlerID)
	}
}

// Language-server registration should resolve plugin-relative launch commands and retain args/settings metadata.
func TestWorkerHostRegisterLanguageServerNormalizesRegistration(t *testing.T) {
	t.Parallel()

	pluginRoot := t.TempDir()
	commandPath := filepath.Join(pluginRoot, "backend", "fixture-language-server.sh")
	if err := os.MkdirAll(filepath.Dir(commandPath), 0o755); err != nil {
		t.Fatalf("mkdir language-server fixture dir: %v", err)
	}
	if err := os.WriteFile(commandPath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write language-server fixture command: %v", err)
	}

	registry := NewLanguageServerRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		LanguageServerRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterLanguageServer(context.Background(), WorkerContext{
		PluginID:              "fixture-plugin",
		PluginRoot:            pluginRoot,
		EffectiveCapabilities: []string{CapabilityRegisterLanguageServer},
	}, RegisterLanguageServerRequest{
		Provider: &workerLanguageServerRegistrationPayload{
			Language:    "typescript",
			Command:     "./backend/fixture-language-server.sh",
			Args:        []string{"--stdio"},
			SettingsKey: stringPointer("typescriptLanguageServer"),
		},
	})
	if err != nil {
		t.Fatalf("register language server: %v", err)
	}

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 language server registration, got %d", len(registrations))
	}
	registration := registrations[0]
	if registration.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin, got %q", registration.PluginID)
	}
	if registration.Name != "fixture-plugin:typescript" {
		t.Fatalf("expected fixture-plugin:typescript, got %q", registration.Name)
	}
	if registration.Language != "typescript" {
		t.Fatalf("expected typescript language, got %q", registration.Language)
	}
	if registration.Command != commandPath {
		t.Fatalf("expected resolved language-server command %q, got %q", commandPath, registration.Command)
	}
	if len(registration.Args) != 1 || registration.Args[0] != "--stdio" {
		t.Fatalf("unexpected language-server args %#v", registration.Args)
	}
	if registration.SettingsKey == nil || *registration.SettingsKey != "typescriptLanguageServer" {
		t.Fatalf("unexpected language-server settings key %#v", registration.SettingsKey)
	}
}

// External-agent registration should resolve plugin-relative launch commands and normalize run-mode/env metadata.
func TestWorkerHostRegisterExternalAgentAdapterNormalizesRegistration(t *testing.T) {
	t.Parallel()

	pluginRoot := t.TempDir()
	commandPath := filepath.Join(pluginRoot, "backend", "fixture-external-agent.sh")
	if err := os.MkdirAll(filepath.Dir(commandPath), 0o755); err != nil {
		t.Fatalf("mkdir external-agent fixture dir: %v", err)
	}
	if err := os.WriteFile(commandPath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write external-agent fixture command: %v", err)
	}

	registry := NewExternalAgentAdapterRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		ExternalAgentAdapterRegistrar: registry,
	})
	if err != nil {
		t.Fatalf("new worker host: %v", err)
	}

	err = host.RegisterExternalAgentAdapter(context.Background(), WorkerContext{
		PluginID:              "fixture-plugin",
		PluginRoot:            pluginRoot,
		EffectiveCapabilities: []string{CapabilityRegisterExternalAgentAdapter},
	}, RegisterExternalAgentAdapterRequest{
		Adapter: &workerExternalAgentAdapterRegistrationPayload{
			ID:              "fixture-agent",
			Name:            "Fixture External Agent",
			RunModes:        []string{"server", "sdk", "sdk"},
			Command:         "./backend/fixture-external-agent.sh",
			Args:            []string{"--stdio"},
			EnvVarWhitelist: []string{"B_TOKEN", "A_TOKEN", "A_TOKEN", ""},
			DefaultModel:    stringPointer("fixture-model"),
		},
	})
	if err != nil {
		t.Fatalf("register external agent adapter: %v", err)
	}

	registrations := registry.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 external-agent registration, got %d", len(registrations))
	}
	registration := registrations[0]
	if registration.AdapterID != "fixture-plugin:fixture-agent" {
		t.Fatalf("expected namespaced adapter id, got %q", registration.AdapterID)
	}
	if registration.PluginID != "fixture-plugin" {
		t.Fatalf("expected fixture-plugin, got %q", registration.PluginID)
	}
	if registration.Name != "Fixture External Agent" {
		t.Fatalf("expected fixture external agent name, got %q", registration.Name)
	}
	if registration.Command != commandPath {
		t.Fatalf("expected resolved external-agent command %q, got %q", commandPath, registration.Command)
	}
	if len(registration.RunModes) != 2 || registration.RunModes[0] != "sdk" || registration.RunModes[1] != "server" {
		t.Fatalf("unexpected external-agent run modes %#v", registration.RunModes)
	}
	if len(registration.Args) != 1 || registration.Args[0] != "--stdio" {
		t.Fatalf("unexpected external-agent args %#v", registration.Args)
	}
	if len(registration.EnvVarWhitelist) != 2 || registration.EnvVarWhitelist[0] != "A_TOKEN" || registration.EnvVarWhitelist[1] != "B_TOKEN" {
		t.Fatalf("unexpected external-agent env whitelist %#v", registration.EnvVarWhitelist)
	}
	if registration.DefaultModel == nil || *registration.DefaultModel != "fixture-model" {
		t.Fatalf("unexpected external-agent default model %#v", registration.DefaultModel)
	}
}

func newWorkerHostTestDeploymentRuntime(t *testing.T, now *time.Time) *deployments.Runtime {
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
			},
		},
	}
	writeWorkerHostJSON(t, filepath.Join(root, projectstate.MainFileName), document)
	writeWorkerHostJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-a",
		"deploymentVersion":      "v1",
	})
	writeWorkerHostJSON(t, filepath.Join(root, "policy.json"), map[string]any{})

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return now.UTC()
		},
	})
	if err != nil {
		t.Fatalf("open worker-host deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close worker-host deployment runtime: %v", err)
		}
	})
	return deploymentRuntime
}

func newWorkerHostTestProjectRuntime(t *testing.T, document projectstate.Document) *projectstate.Runtime {
	t.Helper()

	root := t.TempDir()
	writeWorkerHostJSON(t, filepath.Join(root, projectstate.MainFileName), document)

	store, err := projectstate.NewStore(filepath.Join(root, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new worker-host project store: %v", err)
	}
	projectRuntime, err := projectstate.OpenRuntime(context.Background(), store)
	if err != nil {
		t.Fatalf("open worker-host project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close worker-host project runtime: %v", err)
		}
	})
	return projectRuntime
}

func writeWorkerHostJSON(t *testing.T, path string, value any) {
	t.Helper()

	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		t.Fatalf("mkdir worker-host parent: %v", err)
	}

	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("marshal worker-host json: %v", err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write worker-host json: %v", err)
	}
}

func newWorkerHostWebsocketServer(t *testing.T, hub *realtime.WebsocketHub) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()

		params := workerHostConnectParamsFromRequest(r)
		connection, err := hub.Connect(r.Context(), conn, params)
		if err != nil {
			_ = conn.Close(websocket.StatusInternalError, err.Error())
			return
		}
		defer hub.Disconnect(context.Background(), connection.ID, false)

		for {
			if _, _, err := conn.Read(context.Background()); err != nil {
				return
			}
		}
	})
	return httptest.NewServer(mux)
}

func workerHostConnectParamsFromRequest(r *http.Request) realtime.ConnectParams {
	query := r.URL.Query()
	return realtime.ConnectParams{
		ID:                   query.Get("id"),
		Type:                 realtime.ConnectionType(query.Get("type")),
		ShareSessionID:       query.Get("session"),
		BroadcastConnections: query.Get("broadcast") != "false",
	}
}

func connectWorkerHostListener(t *testing.T, serverURL string, hub *realtime.WebsocketHub, connectionID string, shareSessionID string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + "/ws"
	values := url.Values{}
	values.Set("id", connectionID)
	values.Set("type", string(realtime.ConnectionTypeListener))
	values.Set("session", shareSessionID)
	values.Set("broadcast", "false")
	wsURL += "?" + values.Encode()

	conn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("dial worker-host listener: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, ok := hub.Connection(connectionID); ok {
			return conn
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for worker-host listener %q", connectionID)
	return nil
}

func recordWorkerHostBootstrapAndRegistration(
	t *testing.T,
	broadcaster *realtime.ListenerBroadcaster,
	connectionID string,
	projectID string,
	shareSessionID string,
	callbacks map[string]realtime.ListenerCallback,
) {
	t.Helper()

	if err := broadcaster.Registry().RecordBootstrap(realtime.ListenerBootstrap{
		ConnectionID:   connectionID,
		ProjectID:      projectID,
		ShareSessionID: shareSessionID,
	}); err != nil {
		t.Fatalf("record worker-host bootstrap: %v", err)
	}
	if err := broadcaster.Registry().UpsertRegistration(connectionID, projectID, callbacks, shareSessionID); err != nil {
		t.Fatalf("record worker-host registration: %v", err)
	}
}

func readWorkerHostEnvelope(t *testing.T, conn *websocket.Conn) workerHostEnvelope {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read worker-host websocket message: %v", err)
	}

	var envelope workerHostEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode worker-host websocket envelope: %v", err)
	}
	return envelope
}
