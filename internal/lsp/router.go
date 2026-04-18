package lsp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"slices"
	"strings"
	"sync"
)

var (
	ErrLanguageServerNotConfigured = errors.New("lsp: language server is not configured")
	ErrDuplicateLanguageServer     = errors.New("lsp: duplicate language server")
)

type LanguageServerSpec struct {
	PluginID    string
	Name        string
	LanguageID  string
	Command     string
	Args        []string
	Settings    map[string]any
	SettingsKey *string
}

type RouterOptions struct {
	WorkspaceRoot   string
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

	mu       sync.Mutex
	specs    map[string]LanguageServerSpec
	services map[string]*Service
}

func NewRouter(options RouterOptions) (*Router, error) {
	environ := options.Environ
	if environ == nil {
		environ = os.Environ
	}

	specs, err := normalizeAdditionalLanguageServerSpecs(options.AdditionalSpecs)
	if err != nil {
		return nil, err
	}

	return &Router{
		workspaceRoot: strings.TrimSpace(options.WorkspaceRoot),
		environment:   append([]string(nil), environ()...),
		workingDir:    strings.TrimSpace(options.WorkingDir),
		settings:      options.Settings,
		specs:         cloneLanguageServerSpecMap(specs),
		services:      map[string]*Service{},
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
	currentSpecs := cloneLanguageServerSpecMap(r.specs)
	r.mu.Unlock()

	nextSpecs, err := normalizeAdditionalLanguageServerSpecs(specs)
	if err != nil {
		return err
	}

	r.mu.Lock()
	servicesToClose := make([]*Service, 0)
	for languageID, service := range r.services {
		currentSpec, currentExists := currentSpecs[languageID]
		if !currentExists {
			continue
		}
		nextSpec, nextExists := nextSpecs[languageID]
		if nextExists && languageServerSpecsEqual(currentSpec, nextSpec) {
			continue
		}
		servicesToClose = append(servicesToClose, service)
		delete(r.services, languageID)
	}
	r.specs = cloneLanguageServerSpecMap(nextSpecs)
	r.mu.Unlock()

	var joined error
	for _, service := range servicesToClose {
		joined = errors.Join(joined, service.Close(ctx))
	}
	return joined
}

func normalizeLanguageServerSpec(spec LanguageServerSpec) (LanguageServerSpec, error) {
	normalized := LanguageServerSpec{
		PluginID:    strings.TrimSpace(spec.PluginID),
		Name:        strings.TrimSpace(spec.Name),
		LanguageID:  normalizeLanguageID(spec.LanguageID),
		Command:     strings.TrimSpace(spec.Command),
		Args:        append([]string(nil), spec.Args...),
		Settings:    cloneLanguageServerSettingsMap(spec.Settings),
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

func normalizeAdditionalLanguageServerSpecs(specs []LanguageServerSpec) (map[string]LanguageServerSpec, error) {
	normalizedSpecs := map[string]LanguageServerSpec{}
	for _, spec := range specs {
		normalized, err := normalizeLanguageServerSpec(spec)
		if err != nil {
			return nil, err
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
		PluginID:    strings.TrimSpace(spec.PluginID),
		Name:        strings.TrimSpace(spec.Name),
		LanguageID:  normalizeLanguageID(spec.LanguageID),
		Command:     strings.TrimSpace(spec.Command),
		Args:        append([]string(nil), spec.Args...),
		Settings:    cloneLanguageServerSettingsMap(spec.Settings),
		SettingsKey: cloneOptionalString(spec.SettingsKey),
	}
}

func languageServerSpecsEqual(left LanguageServerSpec, right LanguageServerSpec) bool {
	if left.PluginID != right.PluginID ||
		left.Name != right.Name ||
		left.LanguageID != right.LanguageID ||
		left.Command != right.Command {
		return false
	}
	if !slices.Equal(left.Args, right.Args) {
		return false
	}
	if !reflect.DeepEqual(
		cloneLanguageServerSettingsMap(left.Settings),
		cloneLanguageServerSettingsMap(right.Settings),
	) {
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

	desiredByLanguage := r.documentsByLanguage(desired)
	for _, languageID := range r.syncDocumentLanguages(desiredByLanguage) {
		if err := r.syncLanguageDocuments(ctx, languageID, desiredByLanguage[languageID]); err != nil {
			return err
		}
	}
	return nil
}

func (r *Router) RefreshDocuments(ctx context.Context, documents map[string]SyncedDocument) error {
	if r == nil || len(documents) == 0 {
		return nil
	}

	documentsByLanguage := r.documentsByLanguage(documents)
	for _, languageID := range sortedLanguageIDs(documentsByLanguage) {
		if err := r.refreshLanguageDocuments(ctx, languageID, documentsByLanguage[languageID]); err != nil {
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

func (r *Router) documentsByLanguage(documents map[string]SyncedDocument) map[string]map[string]SyncedDocument {
	grouped := map[string]map[string]SyncedDocument{}
	for path, document := range documents {
		languageID, ok := r.configuredLanguageID(document.LanguageID)
		if !ok {
			continue
		}
		document.LanguageID = languageID
		if grouped[languageID] == nil {
			grouped[languageID] = map[string]SyncedDocument{}
		}
		grouped[languageID][path] = document
	}
	return grouped
}

func (r *Router) configuredLanguageID(languageID string) (string, bool) {
	normalized := normalizeLanguageID(languageID)
	if normalized == "" || !r.hasLanguage(normalized) {
		return "", false
	}
	return normalized, true
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

func (r *Router) syncDocumentLanguages(documentsByLanguage map[string]map[string]SyncedDocument) []string {
	languages := r.serviceLanguages()
	for languageID := range documentsByLanguage {
		if !slices.Contains(languages, languageID) {
			languages = append(languages, languageID)
		}
	}
	slices.Sort(languages)
	return languages
}

func sortedLanguageIDs(documentsByLanguage map[string]map[string]SyncedDocument) []string {
	languages := make([]string, 0, len(documentsByLanguage))
	for languageID := range documentsByLanguage {
		languages = append(languages, languageID)
	}
	slices.Sort(languages)
	return languages
}

func (r *Router) syncLanguageDocuments(ctx context.Context, languageID string, documents map[string]SyncedDocument) error {
	service, ok, err := r.serviceForLanguage(languageID)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	if documents == nil {
		documents = map[string]SyncedDocument{}
	}
	return service.SyncDocuments(ctx, documents)
}

func (r *Router) refreshLanguageDocuments(ctx context.Context, languageID string, documents map[string]SyncedDocument) error {
	service, ok, err := r.serviceForLanguage(languageID)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	return service.RefreshDocuments(ctx, documents)
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
		Settings:      sessionLanguageServerSettings(spec, r.settings),
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

func sessionLanguageServerSettings(spec LanguageServerSpec, settings func() map[string]any) map[string]any {
	if spec.Settings != nil {
		return cloneLanguageServerSettingsMap(spec.Settings)
	}
	return resolveLanguageServerSettings(loadRouterSettings(settings), spec.SettingsKey)
}

func resolveLanguageServerSettings(settings map[string]any, settingsKey *string) map[string]any {
	if len(settings) == 0 {
		return nil
	}
	if settingsKey == nil {
		return cloneLanguageServerSettingsMap(settings)
	}

	segments := parseLanguageServerSettingsKey(*settingsKey)
	if len(segments) == 0 {
		return nil
	}

	currentMap := resolveLanguageServerSettingsBranch(settings, segments)
	if currentMap == nil {
		return nil
	}

	return wrapLanguageServerSettingsBranch(segments, currentMap)
}

func parseLanguageServerSettingsKey(key string) []string {
	segments := strings.Split(strings.TrimSpace(key), ".")
	filtered := make([]string, 0, len(segments))
	for _, segment := range segments {
		trimmed := strings.TrimSpace(segment)
		if trimmed == "" {
			continue
		}
		filtered = append(filtered, trimmed)
	}
	return filtered
}

func resolveLanguageServerSettingsBranch(settings map[string]any, segments []string) map[string]any {
	current := settings
	for index, segment := range segments {
		value, ok := current[segment]
		if !ok {
			return nil
		}
		if index == len(segments)-1 {
			currentMap, ok := value.(map[string]any)
			if !ok {
				return nil
			}
			return currentMap
		}
		next, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		current = next
	}
	return nil
}

func wrapLanguageServerSettingsBranch(segments []string, settings map[string]any) map[string]any {
	wrapped := cloneLanguageServerSettingsMap(settings)
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
