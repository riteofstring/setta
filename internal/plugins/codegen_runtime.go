package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
)

const defaultCodegenTargetFileName = "setta_gen.txt"

var (
	ErrCodegenRuntimeTargetIDRequired      = errors.New("plugins: codegen target id is required")
	ErrCodegenRuntimeTargetNotFound        = errors.New("plugins: codegen target is not registered")
	ErrCodegenRuntimeProjectStateRequired  = errors.New("plugins: codegen project state payload must be an object")
	ErrCodegenRuntimeTargetOptionsRequired = errors.New("plugins: codegen target options payload must be an object")
	ErrCodegenTargetRegistrationConflict   = errors.New("plugins: duplicate codegen target registration")
	ErrCodegenGenerationPayloadInvalid     = errors.New("plugins: codegen generation payload is invalid")
)

type BackendCodegenTargetRegistrar interface {
	RegisterCodegenTarget(ctx context.Context, target RegisteredCodegenTarget) error
}

type RegisteredCodegenTarget struct {
	TargetID        string
	PluginID        string
	Language        string
	Name            string
	DefaultFileName string
	HandlerID       string
}

type GeneratedCodegenFile struct {
	RelativePath string
	Content      string
}

type CodegenTargetRegistry struct {
	mu            sync.Mutex
	registrations []RegisteredCodegenTarget
	byID          map[string]RegisteredCodegenTarget
}

type CodegenRuntimeStartOptions struct {
	WorkerSpec BackendWorkerSpec
}

type CodegenRuntime struct {
	session       *StartedWorkerSession
	registrations *CodegenTargetRegistry
	handshake     WorkerHandshake
}

func NewCodegenTargetRegistry() *CodegenTargetRegistry {
	return &CodegenTargetRegistry{
		byID: make(map[string]RegisteredCodegenTarget),
	}
}

func (r *CodegenTargetRegistry) RegisterCodegenTarget(_ context.Context, target RegisteredCodegenTarget) error {
	if r == nil {
		return ErrWorkerHostCodegenTargetRegistrarNeeded
	}

	targetID := strings.TrimSpace(target.TargetID)
	if targetID == "" {
		return ErrWorkerHostCodegenTargetIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.byID[targetID]; exists {
		return fmt.Errorf("%w: %s", ErrCodegenTargetRegistrationConflict, targetID)
	}

	cloned := target
	r.byID[targetID] = cloned
	r.registrations = append(r.registrations, cloned)
	return nil
}

func (r *CodegenTargetRegistry) Registrations() []RegisteredCodegenTarget {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	registrations := make([]RegisteredCodegenTarget, len(r.registrations))
	copy(registrations, r.registrations)
	return registrations
}

func (r *CodegenTargetRegistry) Lookup(targetID string) (RegisteredCodegenTarget, bool) {
	if r == nil {
		return RegisteredCodegenTarget{}, false
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	target, ok := r.byID[strings.TrimSpace(targetID)]
	return target, ok
}

func StartCodegenRuntime(ctx context.Context, options CodegenRuntimeStartOptions) (*CodegenRuntime, error) {
	registry := NewCodegenTargetRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		CodegenTargetRegistrar: registry,
	})
	if err != nil {
		return nil, err
	}

	launcher, err := NewWorkerLauncher(WorkerLauncherOptions{Host: host})
	if err != nil {
		return nil, err
	}

	started, err := launcher.StartAndRegister(ctx, options.WorkerSpec)
	if err != nil {
		return nil, err
	}

	return &CodegenRuntime{
		session:       started,
		registrations: registry,
		handshake:     started.Handshake,
	}, nil
}

func (r *CodegenRuntime) Handshake() WorkerHandshake {
	if r == nil {
		return WorkerHandshake{}
	}
	return r.handshake
}

func (r *CodegenRuntime) Registrations() []RegisteredCodegenTarget {
	if r == nil {
		return nil
	}
	return r.registrations.Registrations()
}

func (r *CodegenRuntime) Generate(
	ctx context.Context,
	targetID string,
	projectState map[string]any,
	targetOptions map[string]any,
) ([]GeneratedCodegenFile, error) {
	if strings.TrimSpace(targetID) == "" {
		return nil, ErrCodegenRuntimeTargetIDRequired
	}
	if projectState == nil {
		return nil, ErrCodegenRuntimeProjectStateRequired
	}
	if targetOptions == nil {
		return nil, ErrCodegenRuntimeTargetOptionsRequired
	}
	if r == nil || r.session == nil || r.registrations == nil {
		return nil, ErrWorkerSessionClosed
	}

	registration, ok := r.registrations.Lookup(targetID)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrCodegenRuntimeTargetNotFound, strings.TrimSpace(targetID))
	}

	result, err := r.session.Session.Call(ctx, "plugin.invoke_codegen_target", map[string]any{
		"handlerId":     registration.HandlerID,
		"projectState":  projectState,
		"targetOptions": targetOptions,
	})
	if err != nil {
		return nil, err
	}

	return normalizeCodegenGenerationPayload(registration, result)
}

func (r *CodegenRuntime) Close() error {
	if r == nil || r.session == nil {
		return nil
	}
	return r.session.Close()
}

func normalizeCodegenGenerationPayload(
	registration RegisteredCodegenTarget,
	payload json.RawMessage,
) ([]GeneratedCodegenFile, error) {
	var decoded any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("%w: decode codegen generation payload for %s: %v", ErrCodegenGenerationPayloadInvalid, registration.TargetID, err)
	}

	objectPayload, ok := decoded.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%w: plugin codegen target returned a non-object payload for %s", ErrCodegenGenerationPayloadInvalid, registration.TargetID)
	}

	rawFiles, ok := objectPayload["files"]
	if !ok {
		return nil, fmt.Errorf("%w: plugin codegen target result must include files array for %s", ErrCodegenGenerationPayloadInvalid, registration.TargetID)
	}

	fileEntries, ok := rawFiles.([]any)
	if !ok {
		return nil, fmt.Errorf("%w: plugin codegen target result must include files array for %s", ErrCodegenGenerationPayloadInvalid, registration.TargetID)
	}

	normalizedFiles := make([]GeneratedCodegenFile, 0, len(fileEntries))
	seenRelativePaths := make(map[string]struct{}, len(fileEntries))
	for index, rawFile := range fileEntries {
		filePayload, ok := rawFile.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%w: plugin codegen file entry must be an object for %s (index=%d)", ErrCodegenGenerationPayloadInvalid, registration.TargetID, index)
		}

		relativePath := registration.DefaultFileName
		if rawRelativePath, exists := filePayload["relativePath"]; exists {
			if rawRelativePath != nil {
				stringRelativePath, ok := rawRelativePath.(string)
				if !ok {
					return nil, fmt.Errorf("%w: plugin codegen file relativePath must be a string for %s (index=%d)", ErrCodegenGenerationPayloadInvalid, registration.TargetID, index)
				}
				if strings.TrimSpace(stringRelativePath) != "" {
					relativePath = strings.TrimSpace(stringRelativePath)
				}
			}
		}

		canonicalRelativePath, err := normalizeGeneratedCodegenRelativePath(registration.TargetID, relativePath)
		if err != nil {
			return nil, err
		}
		if _, exists := seenRelativePaths[canonicalRelativePath]; exists {
			return nil, fmt.Errorf("%w: plugin codegen file relativePath is duplicated for %s (path=%s)", ErrCodegenGenerationPayloadInvalid, registration.TargetID, canonicalRelativePath)
		}
		seenRelativePaths[canonicalRelativePath] = struct{}{}

		content, ok := filePayload["content"].(string)
		if !ok {
			return nil, fmt.Errorf("%w: plugin codegen file content must be a string for %s (index=%d)", ErrCodegenGenerationPayloadInvalid, registration.TargetID, index)
		}

		normalizedFiles = append(normalizedFiles, GeneratedCodegenFile{
			RelativePath: canonicalRelativePath,
			Content:      content,
		})
	}

	if len(normalizedFiles) == 0 {
		return nil, fmt.Errorf("%w: plugin codegen target must generate at least one file for %s", ErrCodegenGenerationPayloadInvalid, registration.TargetID)
	}

	return normalizedFiles, nil
}

func normalizeGeneratedCodegenRelativePath(targetID string, relativePath string) (string, error) {
	normalizedRelativePath := strings.ReplaceAll(strings.TrimSpace(relativePath), "\\", "/")
	if normalizedRelativePath == "" {
		return "", fmt.Errorf("%w: plugin codegen file relativePath cannot be empty for %s", ErrCodegenGenerationPayloadInvalid, targetID)
	}
	if strings.HasPrefix(normalizedRelativePath, "/") || hasWindowsDrivePrefix(normalizedRelativePath) {
		return "", fmt.Errorf("%w: plugin codegen file relativePath cannot be absolute for %s (path=%s)", ErrCodegenGenerationPayloadInvalid, targetID, relativePath)
	}

	parts := strings.Split(normalizedRelativePath, "/")
	canonicalParts := make([]string, 0, len(parts))
	for _, part := range parts {
		switch part {
		case "", ".":
			continue
		case "..":
			return "", fmt.Errorf("%w: plugin codegen file relativePath cannot escape target root for %s (path=%s)", ErrCodegenGenerationPayloadInvalid, targetID, relativePath)
		default:
			canonicalParts = append(canonicalParts, part)
		}
	}
	if len(canonicalParts) == 0 {
		return "", fmt.Errorf("%w: plugin codegen file relativePath cannot be empty for %s", ErrCodegenGenerationPayloadInvalid, targetID)
	}

	return strings.Join(canonicalParts, "/"), nil
}

func hasWindowsDrivePrefix(path string) bool {
	if len(path) < 2 {
		return false
	}
	first := path[0]
	return ((first >= 'a' && first <= 'z') || (first >= 'A' && first <= 'Z')) && path[1] == ':'
}
