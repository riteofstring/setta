package lsp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
	"sync"
)

var (
	ErrLanguageServerNotConfigured = errors.New("lsp: language server is not configured")
	ErrDuplicateLanguageServer     = errors.New("lsp: duplicate language server")
)

type LanguageServerSpec struct {
	Name        string
	LanguageID  string
	Command     string
	Args        []string
	SettingsKey *string
}

type RouterOptions struct {
	WorkspaceRoot   string
	LookupEnv       func(string) (string, bool)
	Environ         func() []string
	WorkingDir      string
	Settings        func() map[string]any
	AdditionalSpecs []LanguageServerSpec
}

type Router struct {
	workspaceRoot string
	environment   []string
	workingDir    string
	settings      func() map[string]any

	mu              sync.Mutex
	baseSpecs       map[string]LanguageServerSpec
	additionalSpecs map[string]LanguageServerSpec
	specs           map[string]LanguageServerSpec
	services        map[string]*Service
}

func NewRouter(options RouterOptions) (*Router, error) {
	lookupEnv := options.LookupEnv
	if lookupEnv == nil {
		lookupEnv = os.LookupEnv
	}
	environ := options.Environ
	if environ == nil {
		environ = os.Environ
	}

	pythonSpec, err := currentProcessPythonSpec(lookupEnv)
	if err != nil {
		return nil, err
	}
	normalizedPythonSpec, err := normalizeLanguageServerSpec(pythonSpec)
	if err != nil {
		return nil, err
	}
	baseSpecs := map[string]LanguageServerSpec{
		normalizedPythonSpec.LanguageID: normalizedPythonSpec,
	}
	additionalSpecs, err := normalizeAdditionalLanguageServerSpecs(baseSpecs, options.AdditionalSpecs)
	if err != nil {
		return nil, err
	}

	return &Router{
		workspaceRoot:   strings.TrimSpace(options.WorkspaceRoot),
		environment:     append([]string(nil), environ()...),
		workingDir:      strings.TrimSpace(options.WorkingDir),
		settings:        options.Settings,
		baseSpecs:       cloneLanguageServerSpecMap(baseSpecs),
		additionalSpecs: cloneLanguageServerSpecMap(additionalSpecs),
		specs:           mergeLanguageServerSpecMaps(baseSpecs, additionalSpecs),
		services:        map[string]*Service{},
	}, nil
}

func (r *Router) ReplaceAdditionalSpecs(ctx context.Context, specs []LanguageServerSpec) error {
	if r == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	baseSpecs := cloneLanguageServerSpecMap(r.baseSpecs)
	currentAdditionalSpecs := cloneLanguageServerSpecMap(r.additionalSpecs)
	r.mu.Unlock()

	nextAdditionalSpecs, err := normalizeAdditionalLanguageServerSpecs(baseSpecs, specs)
	if err != nil {
		return err
	}

	r.mu.Lock()
	servicesToClose := make([]*Service, 0)
	for languageID, service := range r.services {
		currentSpec, currentIsAdditional := currentAdditionalSpecs[languageID]
		if !currentIsAdditional {
			continue
		}
		nextSpec, nextExists := nextAdditionalSpecs[languageID]
		if nextExists && languageServerSpecsEqual(currentSpec, nextSpec) {
			continue
		}
		servicesToClose = append(servicesToClose, service)
		delete(r.services, languageID)
	}
	r.additionalSpecs = cloneLanguageServerSpecMap(nextAdditionalSpecs)
	r.specs = mergeLanguageServerSpecMaps(baseSpecs, nextAdditionalSpecs)
	r.mu.Unlock()

	var joined error
	for _, service := range servicesToClose {
		joined = errors.Join(joined, service.Close(ctx))
	}
	return joined
}

func currentProcessPythonSpec(lookupEnv func(string) (string, bool)) (LanguageServerSpec, error) {
	command, args, err := resolveCurrentProcessCommand(lookupEnv)
	if err != nil {
		return LanguageServerSpec{}, err
	}
	settingsKey := "basedpyright"
	return LanguageServerSpec{
		Name:        "full",
		LanguageID:  "python",
		Command:     command,
		Args:        args,
		SettingsKey: &settingsKey,
	}, nil
}

func normalizeLanguageServerSpec(spec LanguageServerSpec) (LanguageServerSpec, error) {
	normalized := LanguageServerSpec{
		Name:        strings.TrimSpace(spec.Name),
		LanguageID:  normalizeLanguageID(spec.LanguageID),
		Command:     strings.TrimSpace(spec.Command),
		Args:        append([]string(nil), spec.Args...),
		SettingsKey: cloneOptionalString(spec.SettingsKey),
	}
	if normalized.Name == "" {
		normalized.Name = normalized.LanguageID
	}
	if normalized.LanguageID == "" {
		return LanguageServerSpec{}, fmt.Errorf("%w: language id is required", ErrLanguageServerNotConfigured)
	}
	if normalized.Command == "" {
		return LanguageServerSpec{}, fmt.Errorf("lsp: command is required for %s", normalized.LanguageID)
	}
	return normalized, nil
}

func normalizeAdditionalLanguageServerSpecs(baseSpecs map[string]LanguageServerSpec, specs []LanguageServerSpec) (map[string]LanguageServerSpec, error) {
	normalizedSpecs := map[string]LanguageServerSpec{}
	for _, spec := range specs {
		normalized, err := normalizeLanguageServerSpec(spec)
		if err != nil {
			return nil, err
		}
		if _, exists := baseSpecs[normalized.LanguageID]; exists {
			return nil, fmt.Errorf("%w: %s", ErrDuplicateLanguageServer, normalized.LanguageID)
		}
		if _, exists := normalizedSpecs[normalized.LanguageID]; exists {
			return nil, fmt.Errorf("%w: %s", ErrDuplicateLanguageServer, normalized.LanguageID)
		}
		normalizedSpecs[normalized.LanguageID] = normalized
	}
	return normalizedSpecs, nil
}

func normalizeLanguageID(languageID string) string {
	return strings.ToLower(strings.TrimSpace(languageID))
}

func mergeLanguageServerSpecMaps(base map[string]LanguageServerSpec, additional map[string]LanguageServerSpec) map[string]LanguageServerSpec {
	merged := cloneLanguageServerSpecMap(base)
	for languageID, spec := range additional {
		merged[languageID] = cloneLanguageServerSpec(spec)
	}
	return merged
}

func cloneLanguageServerSpecMap(source map[string]LanguageServerSpec) map[string]LanguageServerSpec {
	if len(source) == 0 {
		return map[string]LanguageServerSpec{}
	}
	cloned := make(map[string]LanguageServerSpec, len(source))
	for languageID, spec := range source {
		cloned[languageID] = cloneLanguageServerSpec(spec)
	}
	return cloned
}

func cloneLanguageServerSpec(spec LanguageServerSpec) LanguageServerSpec {
	return LanguageServerSpec{
		Name:        strings.TrimSpace(spec.Name),
		LanguageID:  normalizeLanguageID(spec.LanguageID),
		Command:     strings.TrimSpace(spec.Command),
		Args:        append([]string(nil), spec.Args...),
		SettingsKey: cloneOptionalString(spec.SettingsKey),
	}
}

func languageServerSpecsEqual(left LanguageServerSpec, right LanguageServerSpec) bool {
	if left.Name != right.Name || left.LanguageID != right.LanguageID || left.Command != right.Command {
		return false
	}
	if !slices.Equal(left.Args, right.Args) {
		return false
	}
	switch {
	case left.SettingsKey == nil && right.SettingsKey == nil:
		return true
	case left.SettingsKey == nil || right.SettingsKey == nil:
		return false
	default:
		return *left.SettingsKey == *right.SettingsKey
	}
}

func (r *Router) SyncDocuments(ctx context.Context, desired map[string]SyncedDocument) error {
	if r == nil {
		return nil
	}

	desiredByLanguage := map[string]map[string]SyncedDocument{}
	for path, document := range desired {
		languageID := normalizeLanguageID(document.LanguageID)
		if languageID == "" || !r.hasLanguage(languageID) {
			continue
		}
		document.LanguageID = languageID
		if desiredByLanguage[languageID] == nil {
			desiredByLanguage[languageID] = map[string]SyncedDocument{}
		}
		desiredByLanguage[languageID][path] = document
	}

	languages := r.serviceLanguages()
	for languageID := range desiredByLanguage {
		if !slices.Contains(languages, languageID) {
			languages = append(languages, languageID)
		}
	}
	slices.Sort(languages)

	for _, languageID := range languages {
		service, ok, err := r.serviceForLanguage(languageID)
		if err != nil {
			return err
		}
		if !ok {
			continue
		}
		documents := desiredByLanguage[languageID]
		if documents == nil {
			documents = map[string]SyncedDocument{}
		}
		if err := service.SyncDocuments(ctx, documents); err != nil {
			return err
		}
	}
	return nil
}

func (r *Router) UpsertDocument(ctx context.Context, document SyncedDocument) error {
	if r == nil {
		return nil
	}
	languageID := normalizeLanguageID(document.LanguageID)
	if languageID == "" {
		return fmt.Errorf("lsp: document language id is required")
	}
	service, ok, err := r.serviceForLanguage(languageID)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	document.LanguageID = languageID
	return service.UpsertDocument(ctx, document)
}

func (r *Router) CompleteSnapshot(ctx context.Context, request SnapshotCompletionRequest) (CompletionResult, error) {
	service, ok, err := r.serviceForLanguage(request.LanguageID)
	if err != nil {
		return CompletionResult{}, err
	}
	if !ok {
		return CompletionResult{}, fmt.Errorf("%w: %s", ErrLanguageServerNotConfigured, normalizeLanguageID(request.LanguageID))
	}
	request.LanguageID = normalizeLanguageID(request.LanguageID)
	return service.CompleteSnapshot(ctx, request)
}

func (r *Router) SignatureHelpSnapshot(ctx context.Context, request SnapshotSignatureHelpRequest) (SignatureHelpResult, error) {
	service, ok, err := r.serviceForLanguage(request.LanguageID)
	if err != nil {
		return SignatureHelpResult{}, err
	}
	if !ok {
		return SignatureHelpResult{}, fmt.Errorf("%w: %s", ErrLanguageServerNotConfigured, normalizeLanguageID(request.LanguageID))
	}
	request.LanguageID = normalizeLanguageID(request.LanguageID)
	return service.SignatureHelpSnapshot(ctx, request)
}

func (r *Router) Close(ctx context.Context) error {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	services := make([]*Service, 0, len(r.services))
	for _, service := range r.services {
		services = append(services, service)
	}
	r.services = map[string]*Service{}
	r.mu.Unlock()

	var joined error
	for _, service := range services {
		joined = errors.Join(joined, service.Close(ctx))
	}
	return joined
}

func (r *Router) hasLanguage(languageID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.specs[normalizeLanguageID(languageID)]
	return ok
}

func (r *Router) serviceLanguages() []string {
	r.mu.Lock()
	defer r.mu.Unlock()

	languages := make([]string, 0, len(r.services))
	for languageID := range r.services {
		languages = append(languages, languageID)
	}
	return languages
}

func (r *Router) serviceForLanguage(languageID string) (*Service, bool, error) {
	if r == nil {
		return nil, false, nil
	}

	normalizedLanguageID := normalizeLanguageID(languageID)
	if normalizedLanguageID == "" {
		return nil, false, nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if service, ok := r.services[normalizedLanguageID]; ok {
		return service, true, nil
	}

	spec, ok := r.specs[normalizedLanguageID]
	if !ok {
		return nil, false, nil
	}

	session, err := NewSession(SessionOptions{
		WorkspaceRoot: r.workspaceRoot,
		Command:       spec.Command,
		Args:          append([]string(nil), spec.Args...),
		Environment:   append([]string(nil), r.environment...),
		WorkingDir:    r.workingDir,
		Settings:      resolveLanguageServerSettings(loadRouterSettings(r.settings), spec.SettingsKey),
	})
	if err != nil {
		return nil, false, err
	}
	service := NewService(session)
	r.services[normalizedLanguageID] = service
	return service, true, nil
}

func loadRouterSettings(settings func() map[string]any) map[string]any {
	if settings == nil {
		return nil
	}
	return cloneLanguageServerSettingsMap(settings())
}

func resolveLanguageServerSettings(settings map[string]any, settingsKey *string) map[string]any {
	if len(settings) == 0 {
		return nil
	}
	if settingsKey == nil {
		return cloneLanguageServerSettingsMap(settings)
	}

	key := strings.TrimSpace(*settingsKey)
	if key == "" {
		return nil
	}

	segments := make([]string, 0)
	for _, segment := range strings.Split(key, ".") {
		trimmed := strings.TrimSpace(segment)
		if trimmed != "" {
			segments = append(segments, trimmed)
		}
	}
	if len(segments) == 0 {
		return nil
	}

	var current any = settings
	for _, segment := range segments {
		currentMap, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		next, ok := currentMap[segment]
		if !ok {
			return nil
		}
		current = next
	}

	currentMap, ok := current.(map[string]any)
	if !ok {
		return nil
	}

	wrapped := cloneLanguageServerSettingsMap(currentMap)
	for index := len(segments) - 1; index >= 0; index-- {
		wrapped = map[string]any{segments[index]: wrapped}
	}
	return wrapped
}

func cloneLanguageServerSettingsMap(source map[string]any) map[string]any {
	if source == nil {
		return nil
	}
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneLanguageServerSettingsValue(value)
	}
	return cloned
}

func cloneLanguageServerSettingsValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneLanguageServerSettingsMap(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = cloneLanguageServerSettingsValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := strings.TrimSpace(*value)
	return &cloned
}
