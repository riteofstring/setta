package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

const BackendPluginAPIVersion = 1

var (
	ErrWorkerLauncherHostRequired        = errors.New("plugins: worker launcher host is required")
	ErrWorkerHandshakeInvalid            = errors.New("plugins: worker handshake is invalid")
	ErrWorkerHandshakeAPIVersionMismatch = errors.New("plugins: backend plugin API version mismatch")
	requiredWorkerHandshakeMethods       = map[string]struct{}{
		"plugin.initialize":                    {},
		"plugin.register":                      {},
		"plugin.shutdown":                      {},
		"plugin.invoke_codegen_target":         {},
		"host.register_mcp_tool":               {},
		"host.register_language_server":        {},
		"host.register_external_agent_adapter": {},
		"host.register_codegen_target":         {},
		"host.read_project_state":              {},
		"host.emit_listener_dependency_event":  {},
	}
)

type BackendWorkerSpec struct {
	CommandPrefix         []string
	PluginID              string
	PluginVersion         string
	PluginRoot            string
	Entrypoint            string
	ServerMode            string
	RequestedCapabilities []string
	EffectiveCapabilities []string
	Environment           []string
	WorkingDirectory      string
	NextRequestID         int64
}

type WorkerLauncherOptions struct {
	Host *WorkerHost
}

type WorkerLauncher struct {
	host *WorkerHost
}

type WorkerHandshake struct {
	PluginID                string   `json:"pluginId"`
	PluginVersion           string   `json:"pluginVersion"`
	BackendPluginAPIVersion int      `json:"backendPluginApiVersion"`
	SupportedRPCMethods     []string `json:"supportedRpcMethods"`
}

type StartedWorkerSession struct {
	Session   *WorkerSession
	Handshake WorkerHandshake
}

func NewWorkerLauncher(options WorkerLauncherOptions) (*WorkerLauncher, error) {
	if options.Host == nil {
		return nil, ErrWorkerLauncherHostRequired
	}
	return &WorkerLauncher{
		host: options.Host,
	}, nil
}

func (l *WorkerLauncher) Start(ctx context.Context, spec BackendWorkerSpec) (*StartedWorkerSession, error) {
	if l == nil || l.host == nil {
		return nil, ErrWorkerLauncherHostRequired
	}

	session, err := StartWorkerSession(spec.sessionOptions(l.host))
	if err != nil {
		return nil, err
	}

	initializeResult, err := session.Initialize(ctx)
	if err != nil {
		return nil, workerLauncherCloseOnError(session, err)
	}

	handshake, err := decodeWorkerHandshake(initializeResult, spec)
	if err != nil {
		return nil, workerLauncherCloseOnError(session, err)
	}

	return &StartedWorkerSession{
		Session:   session,
		Handshake: handshake,
	}, nil
}

func (l *WorkerLauncher) StartAndRegister(ctx context.Context, spec BackendWorkerSpec) (*StartedWorkerSession, error) {
	started, err := l.Start(ctx, spec)
	if err != nil {
		return nil, err
	}

	if _, err := started.Session.Register(ctx); err != nil {
		return nil, workerLauncherCloseOnError(started.Session, err)
	}
	return started, nil
}

func (s *StartedWorkerSession) Close() error {
	if s == nil || s.Session == nil {
		return nil
	}
	return s.Session.Close()
}

func (spec BackendWorkerSpec) sessionOptions(host *WorkerHost) WorkerSessionOptions {
	return WorkerSessionOptions{
		CommandPrefix:         append([]string(nil), spec.CommandPrefix...),
		PluginID:              spec.PluginID,
		PluginVersion:         spec.PluginVersion,
		PluginRoot:            spec.PluginRoot,
		Entrypoint:            spec.Entrypoint,
		EffectiveCapabilities: append([]string(nil), spec.EffectiveCapabilities...),
		Environment:           append([]string(nil), spec.Environment...),
		WorkingDirectory:      spec.WorkingDirectory,
		Host:                  host,
		NextRequestID:         spec.NextRequestID,
	}
}

func decodeWorkerHandshake(payload json.RawMessage, spec BackendWorkerSpec) (WorkerHandshake, error) {
	var handshake WorkerHandshake
	if err := json.Unmarshal(payload, &handshake); err != nil {
		return WorkerHandshake{}, fmt.Errorf("%w: decode backend worker handshake for %s: %v", ErrWorkerHandshakeInvalid, strings.TrimSpace(spec.PluginID), err)
	}

	pluginID := strings.TrimSpace(spec.PluginID)
	if handshake.PluginID != pluginID {
		return WorkerHandshake{}, fmt.Errorf("%w: backend handshake plugin id mismatch for %s: %q", ErrWorkerHandshakeInvalid, pluginID, handshake.PluginID)
	}
	if handshake.PluginVersion != strings.TrimSpace(spec.PluginVersion) {
		return WorkerHandshake{}, fmt.Errorf("%w: backend handshake plugin version mismatch for %s: %q", ErrWorkerHandshakeInvalid, pluginID, handshake.PluginVersion)
	}
	if handshake.BackendPluginAPIVersion != BackendPluginAPIVersion {
		return WorkerHandshake{}, fmt.Errorf("%w: backend API version mismatch for %s: %d", ErrWorkerHandshakeAPIVersionMismatch, pluginID, handshake.BackendPluginAPIVersion)
	}
	if len(handshake.SupportedRPCMethods) == 0 {
		return WorkerHandshake{}, fmt.Errorf("%w: backend handshake methods payload is invalid for %s", ErrWorkerHandshakeInvalid, pluginID)
	}

	methods := make(map[string]struct{}, len(handshake.SupportedRPCMethods))
	for _, method := range handshake.SupportedRPCMethods {
		method = strings.TrimSpace(method)
		if method == "" {
			continue
		}
		methods[method] = struct{}{}
	}

	missingMethods := make([]string, 0, len(requiredWorkerHandshakeMethods))
	for method := range requiredWorkerHandshakeMethods {
		if _, ok := methods[method]; ok {
			continue
		}
		missingMethods = append(missingMethods, method)
	}
	if len(missingMethods) > 0 {
		sort.Strings(missingMethods)
		return WorkerHandshake{}, fmt.Errorf(
			"%w: backend handshake missing required methods for %s: %s",
			ErrWorkerHandshakeInvalid,
			pluginID,
			strings.Join(missingMethods, ", "),
		)
	}

	return handshake, nil
}

func workerLauncherCloseOnError(session *WorkerSession, err error) error {
	if session == nil {
		return err
	}
	if closeErr := session.Close(); closeErr != nil {
		return errors.Join(err, closeErr)
	}
	return err
}
