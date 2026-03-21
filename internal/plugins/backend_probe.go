package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os/exec"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"
	"unicode"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

const (
	backendProbeArg           = "--setta-plugin-backend-probe"
	backendProbeSchemaVersion = 1
	backendProbeBuildRootName = "plugin_backend_probe_builds"
)

var backendProbeTimeout = 5 * time.Second

type backendProbeResponse struct {
	SchemaVersion     int                                `json:"schemaVersion"`
	CodegenTargets    []PluginRegisteredCodegenTarget    `json:"codegenTargets"`
	LanguageServers   []PluginRegisteredLanguageServer   `json:"languageServers"`
	UISettingsRaw     []map[string]any                   `json:"uiSettings"`
	Routes            []PluginRegisteredBackendRoute     `json:"routes"`
	StaticDirs        []PluginRegisteredStaticDir        `json:"staticDirs"`
	ListenerEndpoints []PluginRegisteredListenerEndpoint `json:"listenerEndpoints"`

	UISettings []PluginRegisteredUISetting `json:"-"`
}

func backendProbeRequired(capabilities []string) bool {
	for _, capability := range capabilities {
		switch capability {
		case "registerCodegenTarget", "registerLanguageServer", "registerPane", "registerRouter", "registerStaticDir", "registerListenerEndpoint":
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
	ctx, cancel := context.WithTimeout(context.Background(), backendProbeTimeout)
	defer cancel()

	command := exec.CommandContext(ctx, executablePath, backendProbeArg)
	command.Dir = pluginRoot
	output, err := command.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return backendProbeResponse{}, newServiceError(
				ServiceErrorCodeBackendRuntimeInvalid,
				"Go backend runtime probe timed out for plugin %s",
				manifest.ID,
			)
		}
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
	if probe.LanguageServers == nil {
		probe.LanguageServers = []PluginRegisteredLanguageServer{}
	}
	if probe.UISettingsRaw == nil {
		probe.UISettingsRaw = []map[string]any{}
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

	languageServers := map[string]struct{}{}
	for index, registration := range probe.LanguageServers {
		normalized, err := normalizeBackendLanguageServerRegistration(pluginRoot, pluginID, registration)
		if err != nil {
			return backendProbeResponse{}, fmt.Errorf("language server %d: %w", index, err)
		}
		probe.LanguageServers[index] = normalized
		if _, exists := languageServers[normalized.Language]; exists {
			return backendProbeResponse{}, fmt.Errorf("duplicate language server language %s", normalized.Language)
		}
		languageServers[normalized.Language] = struct{}{}
	}
	slices.SortFunc(probe.LanguageServers, func(left PluginRegisteredLanguageServer, right PluginRegisteredLanguageServer) int {
		if left.Language < right.Language {
			return -1
		}
		if left.Language > right.Language {
			return 1
		}
		if left.Name < right.Name {
			return -1
		}
		if left.Name > right.Name {
			return 1
		}
		return 0
	})

	normalizedUISettings := make([]PluginRegisteredUISetting, 0, len(probe.UISettingsRaw))
	seenUISettingIDs := map[string]struct{}{}
	for index, raw := range probe.UISettingsRaw {
		normalized, err := normalizeBackendUISettingRegistration(pluginID, raw)
		if err != nil {
			return backendProbeResponse{}, fmt.Errorf("ui setting %d: %w", index, err)
		}
		if _, exists := seenUISettingIDs[normalized.LocalSettingID]; exists {
			return backendProbeResponse{}, fmt.Errorf("duplicate ui setting id %s", normalized.LocalSettingID)
		}
		seenUISettingIDs[normalized.LocalSettingID] = struct{}{}
		normalizedUISettings = append(normalizedUISettings, normalized)
	}
	slices.SortFunc(normalizedUISettings, func(left PluginRegisteredUISetting, right PluginRegisteredUISetting) int {
		if left.LocalSettingID < right.LocalSettingID {
			return -1
		}
		if left.LocalSettingID > right.LocalSettingID {
			return 1
		}
		return 0
	})
	probe.UISettings = normalizedUISettings

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

func normalizeBackendLanguageServerRegistration(pluginRoot string, pluginID string, registration PluginRegisteredLanguageServer) (PluginRegisteredLanguageServer, error) {
	name := strings.TrimSpace(registration.Name)
	if name == "" {
		return PluginRegisteredLanguageServer{}, fmt.Errorf("name is required")
	}

	language := strings.ToLower(strings.TrimSpace(registration.Language))
	if language == "" {
		return PluginRegisteredLanguageServer{}, fmt.Errorf("language is required")
	}
	if language == string(projectstate.CodeLanguagePython) {
		return PluginRegisteredLanguageServer{}, fmt.Errorf("language servers cannot target python")
	}

	command := strings.TrimSpace(registration.Command)
	if command == "" {
		return PluginRegisteredLanguageServer{}, fmt.Errorf("command is required")
	}
	if strings.HasPrefix(command, "./") || strings.HasPrefix(command, "../") {
		resolved, err := statefs.ResolveWithinRoot(pluginRoot, filepath.FromSlash(command), "plugin language server command")
		if err != nil {
			return PluginRegisteredLanguageServer{}, err
		}
		command = resolved
	}

	args := make([]string, 0, len(registration.Args))
	for _, rawArg := range registration.Args {
		arg := strings.TrimSpace(rawArg)
		if arg == "" {
			return PluginRegisteredLanguageServer{}, fmt.Errorf("args must be non-empty")
		}
		args = append(args, arg)
	}

	settingsKey := cloneOptionalString(registration.SettingsKey)
	if settingsKey != nil {
		trimmed := strings.TrimSpace(*settingsKey)
		if trimmed == "" {
			settingsKey = nil
		} else {
			settingsKey = &trimmed
		}
	}

	return PluginRegisteredLanguageServer{
		PluginID:    strings.TrimSpace(pluginID),
		Name:        name,
		Language:    language,
		Command:     command,
		Args:        append([]string(nil), args...),
		SettingsKey: cloneOptionalString(settingsKey),
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

func normalizeBackendUISettingRegistration(pluginID string, raw map[string]any) (PluginRegisteredUISetting, error) {
	if raw == nil {
		return PluginRegisteredUISetting{}, fmt.Errorf("registration must be an object")
	}

	allowedKeys := map[string]struct{}{
		"id":             {},
		"title":          {},
		"description":    {},
		"paneId":         {},
		"revealKey":      {},
		"synonyms":       {},
		"mutability":     {},
		"valueSchema":    {},
		"readHandlerId":  {},
		"writeHandlerId": {},
	}
	for key := range raw {
		if _, ok := allowedKeys[key]; ok {
			continue
		}
		return PluginRegisteredUISetting{}, fmt.Errorf("unsupported key %q", key)
	}

	localSettingID, err := backendProbeRequiredString(raw["id"], "id")
	if err != nil {
		return PluginRegisteredUISetting{}, err
	}
	if strings.Contains(localSettingID, "::") {
		return PluginRegisteredUISetting{}, fmt.Errorf("id must not contain '::'")
	}
	title, err := backendProbeRequiredString(raw["title"], "title")
	if err != nil {
		return PluginRegisteredUISetting{}, err
	}
	description, err := backendProbeRequiredString(raw["description"], "description")
	if err != nil {
		return PluginRegisteredUISetting{}, err
	}
	paneID, err := backendProbeRequiredString(raw["paneId"], "paneId")
	if err != nil {
		return PluginRegisteredUISetting{}, err
	}
	revealKey, err := backendProbeRequiredString(raw["revealKey"], "revealKey")
	if err != nil {
		return PluginRegisteredUISetting{}, err
	}
	synonyms, err := backendProbeStringArray(raw["synonyms"], "synonyms")
	if err != nil {
		return PluginRegisteredUISetting{}, err
	}

	mutability := "writable"
	if rawMutability, ok := raw["mutability"]; ok && rawMutability != nil {
		mutability, err = backendProbeRequiredString(rawMutability, "mutability")
		if err != nil {
			return PluginRegisteredUISetting{}, err
		}
	}
	if mutability != "readOnly" && mutability != "writable" {
		return PluginRegisteredUISetting{}, fmt.Errorf("mutability must be readOnly or writable")
	}

	rawValueSchema, ok := raw["valueSchema"]
	if !ok {
		return PluginRegisteredUISetting{}, fmt.Errorf("valueSchema is required")
	}
	valueSchema, ok := rawValueSchema.(map[string]any)
	if !ok {
		return PluginRegisteredUISetting{}, fmt.Errorf("valueSchema must be an object")
	}

	readHandlerID, err := backendProbeRequiredString(raw["readHandlerId"], "readHandlerId")
	if err != nil {
		return PluginRegisteredUISetting{}, err
	}

	var writeHandlerID *string
	if rawWriteHandlerID, ok := raw["writeHandlerId"]; ok && rawWriteHandlerID != nil {
		normalizedWriteHandlerID, err := backendProbeRequiredString(rawWriteHandlerID, "writeHandlerId")
		if err != nil {
			return PluginRegisteredUISetting{}, err
		}
		writeHandlerID = &normalizedWriteHandlerID
	}
	if mutability == "readOnly" && writeHandlerID != nil {
		return PluginRegisteredUISetting{}, fmt.Errorf("writeHandlerId must be omitted when mutability=readOnly")
	}
	if mutability == "writable" && writeHandlerID == nil {
		return PluginRegisteredUISetting{}, fmt.Errorf("writeHandlerId is required when mutability=writable")
	}

	return PluginRegisteredUISetting{
		LocalSettingID: localSettingID,
		PluginID:       strings.TrimSpace(pluginID),
		Title:          title,
		Description:    description,
		Synonyms:       synonyms,
		PaneID:         paneID,
		RevealKey:      revealKey,
		Mutability:     mutability,
		ValueSchema:    cloneStringAnyMap(valueSchema),
		ReadHandlerID:  readHandlerID,
		WriteHandlerID: cloneOptionalString(writeHandlerID),
	}, nil
}

func backendProbeRequiredString(raw any, fieldName string) (string, error) {
	value, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%s must be a non-empty string", fieldName)
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("%s must be a non-empty string", fieldName)
	}
	return trimmed, nil
}

func backendProbeStringArray(raw any, fieldName string) ([]string, error) {
	if raw == nil {
		return []string{}, nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%s must be a string array", fieldName)
	}
	values := make([]string, 0, len(items))
	for _, item := range items {
		value, err := backendProbeRequiredString(item, fieldName)
		if err != nil {
			return nil, fmt.Errorf("%s must be a string array", fieldName)
		}
		values = append(values, value)
	}
	return values, nil
}

func normalizeBackendRegistrationPath(raw string, label string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("%s is required", label)
	}
	if !strings.HasPrefix(trimmed, "/") {
		return "", fmt.Errorf("%s must start with /", label)
	}
	segments := strings.Split(trimmed, "/")
	for index := 1; index < len(segments); index++ {
		segment := segments[index]
		if segment == "" {
			if index == len(segments)-1 {
				continue
			}
			return "", fmt.Errorf("%s must not contain empty path segments", label)
		}
		decodedSegment, err := url.PathUnescape(segment)
		if err != nil {
			return "", fmt.Errorf("%s contains invalid escape sequence", label)
		}
		if decodedSegment == "." || decodedSegment == ".." {
			return "", fmt.Errorf("%s must not contain traversal segments", label)
		}
		if strings.ContainsAny(decodedSegment, `/\`) {
			return "", fmt.Errorf("%s must not contain escaped path separators", label)
		}
		if strings.IndexFunc(decodedSegment, unicode.IsSpace) >= 0 {
			return "", fmt.Errorf("%s must not contain whitespace", label)
		}
	}
	normalized := path.Clean(trimmed)
	if !strings.HasPrefix(normalized, "/") {
		normalized = "/" + normalized
	}
	return normalized, nil
}
