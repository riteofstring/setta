package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os/exec"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"
	"unicode"

	"setta/internal/statefs"
)

const (
	backendProbeArg                    = "--setta-plugin-backend-probe"
	backendProbeSchemaVersion          = 1
	backendProbeBuildRootName          = "plugin_backend_probe_builds"
	appSubsystemBackendContractVersion = 1
)

var backendProbeTimeout = 5 * time.Second

var allowedBackendRouteMethods = map[string]struct{}{
	http.MethodDelete: {},
	http.MethodGet:    {},
	http.MethodHead:   {},
	http.MethodPatch:  {},
	http.MethodPost:   {},
	http.MethodPut:    {},
}

var allowedBackendUISettingKeys = map[string]struct{}{
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

type backendProbeResponse struct {
	SchemaVersion       int                                          `json:"schemaVersion"`
	CodegenTargets      []PluginRegisteredCodegenTarget              `json:"codegenTargets"`
	LanguageServers     []PluginRegisteredLanguageServer             `json:"languageServers"`
	UISettingsRaw       []map[string]any                             `json:"uiSettings"`
	Routes              []PluginRegisteredBackendRoute               `json:"routes"`
	StaticDirs          []PluginRegisteredStaticDir                  `json:"staticDirs"`
	ListenerEndpoints   []PluginRegisteredListenerEndpoint           `json:"listenerEndpoints"`
	AppSubsystemBackend *backendProbeAppSubsystemBackendRegistration `json:"appSubsystemBackend,omitempty"`

	UISettings []PluginRegisteredUISetting `json:"-"`
}

type backendProbeAppSubsystemBackendRegistration struct {
	ContractVersion int `json:"contractVersion"`
}

type normalizedBackendUISetting struct {
	localSettingID string
	title          string
	description    string
	synonyms       []string
	paneID         string
	revealKey      string
	mutability     string
	valueSchema    map[string]any
	readHandlerID  string
	writeHandlerID *string
}

type normalizedBackendUISettingRequiredFields struct {
	title       string
	description string
	paneID      string
	revealKey   string
}

func backendProbeRequired(capabilities []string) bool {
	for _, capability := range capabilities {
		switch capability {
		case "registerCodegenTarget",
			"registerLanguageServer",
			"registerPane",
			"registerRouter",
			"registerStaticDir",
			"registerListenerEndpoint",
			"registerAppSubsystemBackend":
			return true
		}
	}
	return false
}

func probeGoBackendRegistrations(pluginRoot string, manifest PluginManifest, buildRoot string) (backendProbeResponse, error) {
	launch, err := ResolvePluginBackendLaunch(pluginRoot, manifest, buildRoot)
	if err != nil {
		return backendProbeResponse{}, err
	}
	return probePluginBackendRegistrations(pluginRoot, manifest, launch)
}

func probePluginBackendRegistrations(pluginRoot string, manifest PluginManifest, launch PluginBackendLaunch) (backendProbeResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), backendProbeTimeout)
	defer cancel()

	args := append(append([]string(nil), launch.Args...), backendProbeArg)
	command := exec.CommandContext(ctx, launch.Command, args...)
	command.Dir = pluginRoot
	if len(launch.Environment) != 0 {
		command.Env = mergePluginBackendCommandEnv(launch.Environment)
	}
	output, err := command.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return backendProbeResponse{}, newServiceError(
				ServiceErrorCodeBackendRuntimeInvalid,
				"Plugin backend runtime probe timed out for plugin %s",
				manifest.ID,
			)
		}
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return backendProbeResponse{}, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Plugin backend runtime probe failed for plugin %s: %s",
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
	var err error
	probe.CodegenTargets, err = normalizeBackendCodegenTargets(pluginID, probe.CodegenTargets)
	if err != nil {
		return backendProbeResponse{}, err
	}
	probe.LanguageServers, err = normalizeBackendLanguageServers(pluginRoot, pluginID, probe.LanguageServers)
	if err != nil {
		return backendProbeResponse{}, err
	}
	probe.UISettings, err = normalizeBackendUISettings(pluginID, probe.UISettingsRaw)
	if err != nil {
		return backendProbeResponse{}, err
	}
	probe.Routes, err = normalizeBackendRoutes(probe.Routes)
	if err != nil {
		return backendProbeResponse{}, err
	}
	probe.StaticDirs, err = normalizeBackendStaticDirs(pluginRoot, probe.StaticDirs)
	if err != nil {
		return backendProbeResponse{}, err
	}
	probe.ListenerEndpoints, err = normalizeBackendListenerEndpoints(probe.ListenerEndpoints)
	if err != nil {
		return backendProbeResponse{}, err
	}
	probe.AppSubsystemBackend, err = normalizeBackendAppSubsystemBackendRegistration(
		probe.AppSubsystemBackend,
	)
	if err != nil {
		return backendProbeResponse{}, err
	}

	return probe, nil
}

func normalizeBackendAppSubsystemBackendRegistration(
	registration *backendProbeAppSubsystemBackendRegistration,
) (*backendProbeAppSubsystemBackendRegistration, error) {
	if registration == nil {
		return nil, nil
	}
	if registration.ContractVersion != appSubsystemBackendContractVersion {
		return nil, fmt.Errorf(
			"appSubsystemBackend: unsupported contract version %d",
			registration.ContractVersion,
		)
	}
	return &backendProbeAppSubsystemBackendRegistration{
		ContractVersion: registration.ContractVersion,
	}, nil
}

func normalizeBackendCodegenTargets(pluginID string, targets []PluginRegisteredCodegenTarget) ([]PluginRegisteredCodegenTarget, error) {
	normalized, err := normalizeBackendProbeRegistrations(targets, "codegen target", func(target PluginRegisteredCodegenTarget) (PluginRegisteredCodegenTarget, error) {
		return normalizeBackendCodegenTargetRegistration(pluginID, target)
	})
	if err != nil {
		return nil, err
	}
	if err := ensureUniqueBackendProbeRegistrationKeys(normalized, func(target PluginRegisteredCodegenTarget) []string {
		return []string{target.TargetID}
	}, func(key string) error {
		return fmt.Errorf("duplicate codegen target id %s", key)
	}); err != nil {
		return nil, err
	}
	if err := ensureUniqueBackendProbeRegistrationKeys(normalized, func(target PluginRegisteredCodegenTarget) []string {
		return []string{target.Language}
	}, func(key string) error {
		return fmt.Errorf("duplicate codegen target language %s", key)
	}); err != nil {
		return nil, err
	}
	slices.SortFunc(normalized, compareBackendCodegenTargets)
	return normalized, nil
}

func normalizeBackendLanguageServers(pluginRoot string, pluginID string, registrations []PluginRegisteredLanguageServer) ([]PluginRegisteredLanguageServer, error) {
	normalized, err := normalizeBackendProbeRegistrations(registrations, "language server", func(registration PluginRegisteredLanguageServer) (PluginRegisteredLanguageServer, error) {
		return normalizeBackendLanguageServerRegistration(pluginRoot, pluginID, registration)
	})
	if err != nil {
		return nil, err
	}
	if err := ensureUniqueBackendProbeRegistrationKeys(normalized, func(registration PluginRegisteredLanguageServer) []string {
		return []string{registration.Language}
	}, func(key string) error {
		return fmt.Errorf("duplicate language server language %s", key)
	}); err != nil {
		return nil, err
	}
	if err := ensureSinglePluginLanguageServerImplementation(normalized); err != nil {
		return nil, err
	}
	slices.SortFunc(normalized, compareBackendLanguageServers)
	return normalized, nil
}

func normalizeBackendUISettings(pluginID string, rawSettings []map[string]any) ([]PluginRegisteredUISetting, error) {
	normalized, err := normalizeBackendProbeRegistrations(rawSettings, "ui setting", func(raw map[string]any) (PluginRegisteredUISetting, error) {
		return normalizeBackendUISettingRegistration(pluginID, raw)
	})
	if err != nil {
		return nil, err
	}
	if err := ensureUniqueBackendProbeRegistrationKeys(normalized, func(setting PluginRegisteredUISetting) []string {
		return []string{setting.LocalSettingID}
	}, func(key string) error {
		return fmt.Errorf("duplicate ui setting id %s", key)
	}); err != nil {
		return nil, err
	}
	slices.SortFunc(normalized, compareBackendUISettings)
	return normalized, nil
}

func normalizeBackendRoutes(routes []PluginRegisteredBackendRoute) ([]PluginRegisteredBackendRoute, error) {
	normalized, err := normalizeBackendProbeRegistrations(routes, "route", normalizeBackendRouteRegistration)
	if err != nil {
		return nil, err
	}
	if err := ensureUniqueBackendProbeRegistrationKeys(normalized, func(route PluginRegisteredBackendRoute) []string {
		keys := make([]string, 0, len(route.Methods))
		for _, method := range route.Methods {
			keys = append(keys, method+" "+route.Path)
		}
		return keys
	}, func(key string) error {
		return fmt.Errorf("duplicate route registration %s", key)
	}); err != nil {
		return nil, err
	}
	slices.SortFunc(normalized, compareBackendRoutes)
	return normalized, nil
}

func normalizeBackendStaticDirs(pluginRoot string, registrations []PluginRegisteredStaticDir) ([]PluginRegisteredStaticDir, error) {
	normalized, err := normalizeBackendProbeRegistrations(registrations, "static dir", func(registration PluginRegisteredStaticDir) (PluginRegisteredStaticDir, error) {
		return normalizeBackendStaticDirRegistration(pluginRoot, registration)
	})
	if err != nil {
		return nil, err
	}
	if err := ensureUniqueBackendProbeRegistrationKeys(normalized, func(registration PluginRegisteredStaticDir) []string {
		return []string{registration.RoutePrefix}
	}, func(key string) error {
		return fmt.Errorf("duplicate static dir route prefix %s", key)
	}); err != nil {
		return nil, err
	}
	slices.SortFunc(normalized, compareBackendStaticDirs)
	return normalized, nil
}

func normalizeBackendListenerEndpoints(endpoints []PluginRegisteredListenerEndpoint) ([]PluginRegisteredListenerEndpoint, error) {
	normalized, err := normalizeBackendProbeRegistrations(endpoints, "listener endpoint", normalizeBackendListenerEndpointRegistration)
	if err != nil {
		return nil, err
	}
	if err := ensureUniqueBackendProbeRegistrationKeys(normalized, func(endpoint PluginRegisteredListenerEndpoint) []string {
		return []string{endpoint.Name}
	}, func(key string) error {
		return fmt.Errorf("duplicate listener endpoint %s", key)
	}); err != nil {
		return nil, err
	}
	slices.SortFunc(normalized, compareBackendListenerEndpoints)
	return normalized, nil
}

func normalizeBackendProbeRegistrations[Input any, Output any](
	items []Input,
	label string,
	normalize func(Input) (Output, error),
) ([]Output, error) {
	normalized := make([]Output, 0, len(items))
	for index, item := range items {
		value, err := normalize(item)
		if err != nil {
			return nil, fmt.Errorf("%s %d: %w", label, index, err)
		}
		normalized = append(normalized, value)
	}
	return normalized, nil
}

func ensureUniqueBackendProbeRegistrationKeys[T any](
	items []T,
	keys func(T) []string,
	duplicateError func(string) error,
) error {
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		for _, key := range keys(item) {
			if _, exists := seen[key]; exists {
				return duplicateError(key)
			}
			seen[key] = struct{}{}
		}
	}
	return nil
}

func compareBackendCodegenTargets(left PluginRegisteredCodegenTarget, right PluginRegisteredCodegenTarget) int {
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
}

func compareBackendLanguageServers(left PluginRegisteredLanguageServer, right PluginRegisteredLanguageServer) int {
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
}

func compareBackendUISettings(left PluginRegisteredUISetting, right PluginRegisteredUISetting) int {
	if left.LocalSettingID < right.LocalSettingID {
		return -1
	}
	if left.LocalSettingID > right.LocalSettingID {
		return 1
	}
	return 0
}

func compareBackendRoutes(left PluginRegisteredBackendRoute, right PluginRegisteredBackendRoute) int {
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
}

func compareBackendStaticDirs(left PluginRegisteredStaticDir, right PluginRegisteredStaticDir) int {
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
}

func compareBackendListenerEndpoints(left PluginRegisteredListenerEndpoint, right PluginRegisteredListenerEndpoint) int {
	if left.Name < right.Name {
		return -1
	}
	if left.Name > right.Name {
		return 1
	}
	return 0
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

	language, err := normalizeBackendLanguageServerLanguage(registration.Language)
	if err != nil {
		return PluginRegisteredLanguageServer{}, err
	}
	command, err := normalizeBackendLanguageServerCommand(pluginRoot, registration.Command)
	if err != nil {
		return PluginRegisteredLanguageServer{}, err
	}
	args, err := normalizeBackendLanguageServerArgs(registration.Args)
	if err != nil {
		return PluginRegisteredLanguageServer{}, err
	}
	settingsKey := normalizeBackendLanguageServerSettingsKey(registration.SettingsKey)
	runtimeSearchPathsKey := normalizeBackendLanguageServerSettingsKey(registration.RuntimeSearchPathsKey)

	return PluginRegisteredLanguageServer{
		PluginID:              strings.TrimSpace(pluginID),
		Name:                  name,
		Language:              language,
		Command:               command,
		Args:                  append([]string(nil), args...),
		SettingsKey:           cloneOptionalString(settingsKey),
		RuntimeSearchPathsKey: cloneOptionalString(runtimeSearchPathsKey),
	}, nil
}

func normalizeBackendLanguageServerLanguage(raw string) (string, error) {
	language := strings.ToLower(strings.TrimSpace(raw))
	if language == "" {
		return "", fmt.Errorf("language is required")
	}
	return language, nil
}

func normalizeBackendLanguageServerCommand(pluginRoot string, raw string) (string, error) {
	command := strings.TrimSpace(raw)
	if command == "" {
		return "", fmt.Errorf("command is required")
	}
	if !backendLanguageServerCommandLooksPathLike(command) {
		return command, nil
	}

	resolvedCommand := command
	if !backendLanguageServerCommandIsAbsolute(command) {
		var err error
		resolvedCommand, err = statefs.ResolveWithinRoot(
			pluginRoot,
			filepath.FromSlash(backendLanguageServerCommandPath(command)),
			"plugin language server command",
		)
		if err != nil {
			return "", err
		}
	}
	if err := validateBackendLanguageServerCommandExecutable(resolvedCommand); err != nil {
		return "", err
	}
	return resolvedCommand, nil
}

func backendLanguageServerCommandLooksPathLike(command string) bool {
	return backendLanguageServerCommandIsAbsolute(command) || strings.ContainsAny(command, `/\`)
}

func backendLanguageServerCommandIsAbsolute(command string) bool {
	normalized := backendLanguageServerCommandPath(command)
	return filepath.IsAbs(command) ||
		path.IsAbs(normalized) ||
		strings.HasPrefix(normalized, "//") ||
		windowsDrivePrefixPattern.MatchString(normalized)
}

func backendLanguageServerCommandPath(command string) string {
	return strings.ReplaceAll(command, `\`, `/`)
}

func validateBackendLanguageServerCommandExecutable(command string) error {
	if _, err := exec.LookPath(command); err != nil {
		return fmt.Errorf("command %q is not executable: %w", command, err)
	}
	return nil
}

func normalizeBackendLanguageServerArgs(rawArgs []string) ([]string, error) {
	args := make([]string, 0, len(rawArgs))
	for _, rawArg := range rawArgs {
		arg := strings.TrimSpace(rawArg)
		if arg == "" {
			return nil, fmt.Errorf("args must be non-empty")
		}
		args = append(args, arg)
	}
	return args, nil
}

func normalizeBackendLanguageServerSettingsKey(raw *string) *string {
	if raw == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func ensureSinglePluginLanguageServerImplementation(registrations []PluginRegisteredLanguageServer) error {
	if len(registrations) <= 1 {
		return nil
	}

	baseline := registrations[0]
	for _, registration := range registrations[1:] {
		if baseline.Command != registration.Command {
			return fmt.Errorf("language servers must share one implementation per plugin")
		}
		if !slices.Equal(baseline.Args, registration.Args) {
			return fmt.Errorf("language servers must share one implementation per plugin")
		}
		if !optionalStringsEqual(baseline.SettingsKey, registration.SettingsKey) {
			return fmt.Errorf("language servers must share one implementation per plugin")
		}
		if !optionalStringsEqual(baseline.RuntimeSearchPathsKey, registration.RuntimeSearchPathsKey) {
			return fmt.Errorf("language servers must share one implementation per plugin")
		}
	}
	return nil
}

func optionalStringsEqual(left *string, right *string) bool {
	switch {
	case left == nil && right == nil:
		return true
	case left == nil || right == nil:
		return false
	default:
		return *left == *right
	}
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
		if _, ok := allowedBackendRouteMethods[method]; !ok {
			return PluginRegisteredBackendRoute{}, fmt.Errorf("unsupported method %s", method)
		}
		if _, exists := seenMethods[method]; exists {
			continue
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
	normalized, err := normalizeBackendUISetting(raw)
	if err != nil {
		return PluginRegisteredUISetting{}, err
	}

	return PluginRegisteredUISetting{
		LocalSettingID: normalized.localSettingID,
		PluginID:       strings.TrimSpace(pluginID),
		Title:          normalized.title,
		Description:    normalized.description,
		Synonyms:       normalized.synonyms,
		PaneID:         normalized.paneID,
		RevealKey:      normalized.revealKey,
		Mutability:     normalized.mutability,
		ValueSchema:    cloneStringAnyMap(normalized.valueSchema),
		ReadHandlerID:  normalized.readHandlerID,
		WriteHandlerID: cloneOptionalString(normalized.writeHandlerID),
	}, nil
}

func normalizeBackendUISetting(raw map[string]any) (normalizedBackendUISetting, error) {
	if raw == nil {
		return normalizedBackendUISetting{}, fmt.Errorf("registration must be an object")
	}
	if err := validateBackendUISettingKeys(raw); err != nil {
		return normalizedBackendUISetting{}, err
	}

	localSettingID, err := normalizeBackendUISettingID(raw)
	if err != nil {
		return normalizedBackendUISetting{}, err
	}
	mutability, err := normalizeBackendUISettingMutability(raw)
	if err != nil {
		return normalizedBackendUISetting{}, err
	}
	valueSchema, err := normalizeBackendUISettingValueSchema(raw)
	if err != nil {
		return normalizedBackendUISetting{}, err
	}
	readHandlerID, writeHandlerID, err := normalizeBackendUISettingHandlers(raw, mutability)
	if err != nil {
		return normalizedBackendUISetting{}, err
	}
	requiredFields, err := normalizeBackendUISettingRequiredFieldsFromRaw(raw)
	if err != nil {
		return normalizedBackendUISetting{}, err
	}

	synonyms, err := backendProbeStringArray(raw["synonyms"], "synonyms")
	if err != nil {
		return normalizedBackendUISetting{}, err
	}

	return normalizedBackendUISetting{
		localSettingID: localSettingID,
		title:          requiredFields.title,
		description:    requiredFields.description,
		synonyms:       synonyms,
		paneID:         requiredFields.paneID,
		revealKey:      requiredFields.revealKey,
		mutability:     mutability,
		valueSchema:    valueSchema,
		readHandlerID:  readHandlerID,
		writeHandlerID: writeHandlerID,
	}, nil
}

func normalizeBackendUISettingRequiredFieldsFromRaw(raw map[string]any) (normalizedBackendUISettingRequiredFields, error) {
	title, err := backendProbeRequiredString(raw["title"], "title")
	if err != nil {
		return normalizedBackendUISettingRequiredFields{}, err
	}
	description, err := backendProbeRequiredString(raw["description"], "description")
	if err != nil {
		return normalizedBackendUISettingRequiredFields{}, err
	}
	paneID, err := backendProbeRequiredString(raw["paneId"], "paneId")
	if err != nil {
		return normalizedBackendUISettingRequiredFields{}, err
	}
	revealKey, err := backendProbeRequiredString(raw["revealKey"], "revealKey")
	if err != nil {
		return normalizedBackendUISettingRequiredFields{}, err
	}
	return normalizedBackendUISettingRequiredFields{
		title:       title,
		description: description,
		paneID:      paneID,
		revealKey:   revealKey,
	}, nil
}

func validateBackendUISettingKeys(raw map[string]any) error {
	for key := range raw {
		if _, ok := allowedBackendUISettingKeys[key]; ok {
			continue
		}
		return fmt.Errorf("unsupported key %q", key)
	}
	return nil
}

func normalizeBackendUISettingID(raw map[string]any) (string, error) {
	localSettingID, err := backendProbeRequiredString(raw["id"], "id")
	if err != nil {
		return "", err
	}
	if strings.Contains(localSettingID, "::") {
		return "", fmt.Errorf("id must not contain '::'")
	}
	return localSettingID, nil
}

func normalizeBackendUISettingMutability(raw map[string]any) (string, error) {
	mutability := "writable"
	if rawMutability, ok := raw["mutability"]; ok && rawMutability != nil {
		normalizedMutability, err := backendProbeRequiredString(rawMutability, "mutability")
		if err != nil {
			return "", err
		}
		mutability = normalizedMutability
	}
	if mutability != "readOnly" && mutability != "writable" {
		return "", fmt.Errorf("mutability must be readOnly or writable")
	}
	return mutability, nil
}

func normalizeBackendUISettingValueSchema(raw map[string]any) (map[string]any, error) {
	rawValueSchema, ok := raw["valueSchema"]
	if !ok {
		return nil, fmt.Errorf("valueSchema is required")
	}
	valueSchema, ok := rawValueSchema.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("valueSchema must be an object")
	}
	return valueSchema, nil
}

func normalizeBackendUISettingHandlers(raw map[string]any, mutability string) (string, *string, error) {
	readHandlerID, err := backendProbeRequiredString(raw["readHandlerId"], "readHandlerId")
	if err != nil {
		return "", nil, err
	}

	var writeHandlerID *string
	if rawWriteHandlerID, ok := raw["writeHandlerId"]; ok && rawWriteHandlerID != nil {
		normalizedWriteHandlerID, err := backendProbeRequiredString(rawWriteHandlerID, "writeHandlerId")
		if err != nil {
			return "", nil, err
		}
		writeHandlerID = &normalizedWriteHandlerID
	}
	if mutability == "readOnly" && writeHandlerID != nil {
		return "", nil, fmt.Errorf("writeHandlerId must be omitted when mutability=readOnly")
	}
	if mutability == "writable" && writeHandlerID == nil {
		return "", nil, fmt.Errorf("writeHandlerId is required when mutability=writable")
	}
	return readHandlerID, writeHandlerID, nil
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
	if err := validateBackendRegistrationPathSegments(strings.Split(trimmed, "/"), label); err != nil {
		return "", err
	}
	normalized := path.Clean(trimmed)
	if !strings.HasPrefix(normalized, "/") {
		normalized = "/" + normalized
	}
	return normalized, nil
}

func validateBackendRegistrationPathSegments(segments []string, label string) error {
	lastIndex := len(segments) - 1
	for index := 1; index < len(segments); index++ {
		if err := validateBackendRegistrationPathSegment(segments[index], index == lastIndex, label); err != nil {
			return err
		}
	}
	return nil
}

func validateBackendRegistrationPathSegment(segment string, isLastSegment bool, label string) error {
	if segment == "" {
		if isLastSegment {
			return nil
		}
		return fmt.Errorf("%s must not contain empty path segments", label)
	}
	decodedSegment, err := url.PathUnescape(segment)
	if err != nil {
		return fmt.Errorf("%s contains invalid escape sequence", label)
	}
	if decodedSegment == "." || decodedSegment == ".." {
		return fmt.Errorf("%s must not contain traversal segments", label)
	}
	if strings.ContainsAny(decodedSegment, `/\`) {
		return fmt.Errorf("%s must not contain escaped path separators", label)
	}
	if strings.IndexFunc(decodedSegment, unicode.IsSpace) >= 0 {
		return fmt.Errorf("%s must not contain whitespace", label)
	}
	return nil
}
