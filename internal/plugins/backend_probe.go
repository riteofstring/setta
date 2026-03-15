package plugins

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"path"
	"path/filepath"
	"slices"
	"strings"
)

const (
	backendProbeArg           = "--setta-plugin-backend-probe"
	backendProbeSchemaVersion = 1
	backendProbeBuildRootName = "plugin_backend_probe_builds"
)

type backendProbeResponse struct {
	SchemaVersion     int                                `json:"schemaVersion"`
	CodegenTargets    []PluginRegisteredCodegenTarget    `json:"codegenTargets"`
	Routes            []PluginRegisteredBackendRoute     `json:"routes"`
	StaticDirs        []PluginRegisteredStaticDir        `json:"staticDirs"`
	ListenerEndpoints []PluginRegisteredListenerEndpoint `json:"listenerEndpoints"`
}

func backendProbeRequired(capabilities []string) bool {
	for _, capability := range capabilities {
		switch capability {
		case "registerCodegenTarget", "registerRouter", "registerStaticDir", "registerListenerEndpoint":
			return true
		}
	}
	return false
}

func probeGoBackendRegistrations(pluginRoot string, manifest PluginManifest, buildRoot string) (backendProbeResponse, error) {
	executablePath, err := BuildGoBackendExecutable(pluginRoot, manifest, buildRoot)
	if err != nil {
		return backendProbeResponse{}, err
	}
	return probeGoBackendExecutable(pluginRoot, manifest, executablePath)
}

func probeGoBackendExecutable(pluginRoot string, manifest PluginManifest, executablePath string) (backendProbeResponse, error) {
	command := exec.Command(executablePath, backendProbeArg)
	command.Dir = pluginRoot
	output, err := command.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return backendProbeResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Go backend runtime probe failed for plugin %s: %s",
			manifest.ID,
			message,
		)
	}

	probe, err := decodeBackendProbeResponse(output)
	if err != nil {
		return backendProbeResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime probe for plugin %s: %s",
			manifest.ID,
			err.Error(),
		)
	}
	probe, err = normalizeBackendProbeResponse(pluginRoot, manifest.ID, probe)
	if err != nil {
		return backendProbeResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid backend runtime probe for plugin %s: %s",
			manifest.ID,
			err.Error(),
		)
	}
	return probe, nil
}

func decodeBackendProbeResponse(output []byte) (backendProbeResponse, error) {
	var probe backendProbeResponse
	decoder := json.NewDecoder(bytes.NewReader(output))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&probe); err != nil {
		return backendProbeResponse{}, err
	}
	if decoder.More() {
		return backendProbeResponse{}, fmt.Errorf("trailing JSON content")
	}
	if probe.SchemaVersion != backendProbeSchemaVersion {
		return backendProbeResponse{}, fmt.Errorf("unsupported schema version %d", probe.SchemaVersion)
	}
	if probe.CodegenTargets == nil {
		probe.CodegenTargets = []PluginRegisteredCodegenTarget{}
	}
	if probe.Routes == nil {
		probe.Routes = []PluginRegisteredBackendRoute{}
	}
	if probe.StaticDirs == nil {
		probe.StaticDirs = []PluginRegisteredStaticDir{}
	}
	if probe.ListenerEndpoints == nil {
		probe.ListenerEndpoints = []PluginRegisteredListenerEndpoint{}
	}
	return probe, nil
}

func normalizeBackendProbeResponse(pluginRoot string, pluginID string, probe backendProbeResponse) (backendProbeResponse, error) {
	targetIDs := map[string]struct{}{}
	targetLanguages := map[string]struct{}{}
	for index, target := range probe.CodegenTargets {
		normalized, err := normalizeBackendCodegenTargetRegistration(pluginID, target)
		if err != nil {
			return backendProbeResponse{}, fmt.Errorf("codegen target %d: %w", index, err)
		}
		probe.CodegenTargets[index] = normalized
		if _, exists := targetIDs[normalized.TargetID]; exists {
			return backendProbeResponse{}, fmt.Errorf("duplicate codegen target id %s", normalized.TargetID)
		}
		targetIDs[normalized.TargetID] = struct{}{}
		if _, exists := targetLanguages[normalized.Language]; exists {
			return backendProbeResponse{}, fmt.Errorf("duplicate codegen target language %s", normalized.Language)
		}
		targetLanguages[normalized.Language] = struct{}{}
	}
	slices.SortFunc(probe.CodegenTargets, func(left PluginRegisteredCodegenTarget, right PluginRegisteredCodegenTarget) int {
		if left.Language < right.Language {
			return -1
		}
		if left.Language > right.Language {
			return 1
		}
		if left.TargetID < right.TargetID {
			return -1
		}
		if left.TargetID > right.TargetID {
			return 1
		}
		return 0
	})

	routeKeys := map[string]struct{}{}
	for index, route := range probe.Routes {
		normalized, err := normalizeBackendRouteRegistration(route)
		if err != nil {
			return backendProbeResponse{}, fmt.Errorf("route %d: %w", index, err)
		}
		probe.Routes[index] = normalized
		for _, method := range normalized.Methods {
			key := method + " " + normalized.Path
			if _, exists := routeKeys[key]; exists {
				return backendProbeResponse{}, fmt.Errorf("duplicate route registration %s", key)
			}
			routeKeys[key] = struct{}{}
		}
	}
	slices.SortFunc(probe.Routes, func(left PluginRegisteredBackendRoute, right PluginRegisteredBackendRoute) int {
		if left.Path < right.Path {
			return -1
		}
		if left.Path > right.Path {
			return 1
		}
		leftMethods := strings.Join(left.Methods, "\x00")
		rightMethods := strings.Join(right.Methods, "\x00")
		if leftMethods < rightMethods {
			return -1
		}
		if leftMethods > rightMethods {
			return 1
		}
		return 0
	})

	staticPrefixes := map[string]struct{}{}
	for index, staticDir := range probe.StaticDirs {
		normalized, err := normalizeBackendStaticDirRegistration(pluginRoot, staticDir)
		if err != nil {
			return backendProbeResponse{}, fmt.Errorf("static dir %d: %w", index, err)
		}
		probe.StaticDirs[index] = normalized
		if _, exists := staticPrefixes[normalized.RoutePrefix]; exists {
			return backendProbeResponse{}, fmt.Errorf("duplicate static dir route prefix %s", normalized.RoutePrefix)
		}
		staticPrefixes[normalized.RoutePrefix] = struct{}{}
	}
	slices.SortFunc(probe.StaticDirs, func(left PluginRegisteredStaticDir, right PluginRegisteredStaticDir) int {
		if left.RoutePrefix < right.RoutePrefix {
			return -1
		}
		if left.RoutePrefix > right.RoutePrefix {
			return 1
		}
		if left.Dir < right.Dir {
			return -1
		}
		if left.Dir > right.Dir {
			return 1
		}
		return 0
	})

	listenerNames := map[string]struct{}{}
	for index, endpoint := range probe.ListenerEndpoints {
		normalized, err := normalizeBackendListenerEndpointRegistration(endpoint)
		if err != nil {
			return backendProbeResponse{}, fmt.Errorf("listener endpoint %d: %w", index, err)
		}
		probe.ListenerEndpoints[index] = normalized
		if _, exists := listenerNames[normalized.Name]; exists {
			return backendProbeResponse{}, fmt.Errorf("duplicate listener endpoint %s", normalized.Name)
		}
		listenerNames[normalized.Name] = struct{}{}
	}
	slices.SortFunc(probe.ListenerEndpoints, func(left PluginRegisteredListenerEndpoint, right PluginRegisteredListenerEndpoint) int {
		if left.Name < right.Name {
			return -1
		}
		if left.Name > right.Name {
			return 1
		}
		return 0
	})

	return probe, nil
}

func normalizeBackendCodegenTargetRegistration(pluginID string, target PluginRegisteredCodegenTarget) (PluginRegisteredCodegenTarget, error) {
	targetID := strings.TrimSpace(target.TargetID)
	if targetID == "" {
		return PluginRegisteredCodegenTarget{}, fmt.Errorf("targetId is required")
	}

	language := strings.TrimSpace(target.Language)
	if language == "" {
		return PluginRegisteredCodegenTarget{}, fmt.Errorf("language is required")
	}

	name := strings.TrimSpace(target.Name)
	if name == "" {
		return PluginRegisteredCodegenTarget{}, fmt.Errorf("name is required")
	}

	defaultFileName := strings.TrimSpace(target.DefaultFileName)
	if defaultFileName == "" {
		return PluginRegisteredCodegenTarget{}, fmt.Errorf("defaultFileName is required")
	}
	if strings.ContainsAny(defaultFileName, `/\`) {
		return PluginRegisteredCodegenTarget{}, fmt.Errorf("defaultFileName must be a file name")
	}
	if defaultFileName == "." || defaultFileName == ".." {
		return PluginRegisteredCodegenTarget{}, fmt.Errorf("defaultFileName must be a file name")
	}

	return PluginRegisteredCodegenTarget{
		TargetID:        targetID,
		PluginID:        strings.TrimSpace(pluginID),
		Language:        language,
		Name:            name,
		DefaultFileName: defaultFileName,
	}, nil
}

func normalizeBackendRouteRegistration(route PluginRegisteredBackendRoute) (PluginRegisteredBackendRoute, error) {
	normalizedPath, err := normalizeBackendRegistrationPath(route.Path, "route path")
	if err != nil {
		return PluginRegisteredBackendRoute{}, err
	}
	if len(route.Methods) == 0 {
		return PluginRegisteredBackendRoute{}, fmt.Errorf("methods are required")
	}
	methods := make([]string, 0, len(route.Methods))
	seenMethods := map[string]struct{}{}
	for _, rawMethod := range route.Methods {
		method := strings.ToUpper(strings.TrimSpace(rawMethod))
		if method == "" {
			return PluginRegisteredBackendRoute{}, fmt.Errorf("methods must be non-empty")
		}
		if _, exists := seenMethods[method]; exists {
			return PluginRegisteredBackendRoute{}, fmt.Errorf("duplicate method %s", method)
		}
		seenMethods[method] = struct{}{}
		methods = append(methods, method)
	}
	slices.Sort(methods)
	return PluginRegisteredBackendRoute{
		Path:    normalizedPath,
		Methods: methods,
	}, nil
}

func normalizeBackendStaticDirRegistration(pluginRoot string, registration PluginRegisteredStaticDir) (PluginRegisteredStaticDir, error) {
	routePrefix, err := normalizeBackendRegistrationPath(registration.RoutePrefix, "routePrefix")
	if err != nil {
		return PluginRegisteredStaticDir{}, err
	}
	trimmedDir := filepath.ToSlash(filepath.Clean(strings.TrimSpace(registration.Dir)))
	if trimmedDir == "." || trimmedDir == "" {
		return PluginRegisteredStaticDir{}, fmt.Errorf("dir is required")
	}
	if _, err := resolveManifestDirectory(pluginRoot, trimmedDir, "plugin backend static dir"); err != nil {
		return PluginRegisteredStaticDir{}, err
	}
	return PluginRegisteredStaticDir{
		RoutePrefix: routePrefix,
		Dir:         trimmedDir,
	}, nil
}

func normalizeBackendListenerEndpointRegistration(endpoint PluginRegisteredListenerEndpoint) (PluginRegisteredListenerEndpoint, error) {
	name := strings.TrimSpace(endpoint.Name)
	if name == "" {
		return PluginRegisteredListenerEndpoint{}, fmt.Errorf("name is required")
	}
	return PluginRegisteredListenerEndpoint{Name: name}, nil
}

func normalizeBackendRegistrationPath(raw string, label string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("%s is required", label)
	}
	if !strings.HasPrefix(trimmed, "/") {
		return "", fmt.Errorf("%s must start with /", label)
	}
	normalized := path.Clean(trimmed)
	if !strings.HasPrefix(normalized, "/") {
		normalized = "/" + normalized
	}
	return normalized, nil
}
