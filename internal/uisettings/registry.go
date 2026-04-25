package uisettings

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strings"
)

type Registry struct {
	entriesByID            map[string]RuntimeEntry
	knownPluginIDs         map[string]struct{}
	knownPluginSettingIDs  map[string]struct{}
	invalidPluginSettings  map[string]SettingError
	unavailableSettings    map[string]SettingError
	pluginStatusByPluginID map[string]pluginRegistryStatus
}

func New(entries []RuntimeEntry) (*Registry, error) {
	return newRegistry(entries, registryPluginMetadata{})
}

type registryPluginMetadata struct {
	knownPluginIDs         map[string]struct{}
	knownPluginSettingIDs  map[string]struct{}
	invalidPluginSettings  map[string]SettingError
	unavailableSettings    map[string]SettingError
	pluginStatusByPluginID map[string]pluginRegistryStatus
}

type pluginRegistryStatus struct {
	ObservedStates        []string
	RuntimeEntryAvailable bool
	SupportsUISettings    bool
}

func (s pluginRegistryStatus) Operational() bool {
	for _, state := range s.ObservedStates {
		switch strings.TrimSpace(state) {
		case "active", "pending_restart":
			return true
		}
	}
	return false
}

func newRegistry(entries []RuntimeEntry, metadata registryPluginMetadata) (*Registry, error) {
	entriesByID := make(map[string]RuntimeEntry, len(entries))
	for _, entry := range entries {
		settingID, err := normalizeSettingID(entry.Metadata.SettingID)
		if err != nil {
			return nil, err
		}
		if _, exists := entriesByID[settingID]; exists {
			return nil, fmt.Errorf("duplicate UI setting id %q", settingID)
		}
		entry.Metadata.SettingID = settingID
		entriesByID[settingID] = entry
	}
	return &Registry{
		entriesByID:            entriesByID,
		knownPluginIDs:         cloneStringSet(metadata.knownPluginIDs),
		knownPluginSettingIDs:  cloneStringSet(metadata.knownPluginSettingIDs),
		invalidPluginSettings:  cloneSettingErrorMap(metadata.invalidPluginSettings),
		unavailableSettings:    cloneSettingErrorMap(metadata.unavailableSettings),
		pluginStatusByPluginID: clonePluginRegistryStatusMap(metadata.pluginStatusByPluginID),
	}, nil
}

func (r *Registry) Get(settingID string) (RuntimeEntry, bool, error) {
	if r == nil {
		return RuntimeEntry{}, false, nil
	}
	normalized, err := normalizeSettingID(settingID)
	if err != nil {
		return RuntimeEntry{}, false, err
	}
	entry, ok := r.entriesByID[normalized]
	return entry, ok, nil
}

func (r *Registry) ListEntries(sourceFilter SourceFilter) []Entry {
	if r == nil {
		return nil
	}

	entries := make([]Entry, 0, len(r.entriesByID))
	filter := normalizeSourceFilter(sourceFilter)
	for _, entry := range r.entriesByID {
		if filter != SourceFilterAll && entry.Metadata.Source != Source(filter) {
			continue
		}
		entries = append(entries, cloneEntry(entry.Metadata))
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].SettingID < entries[j].SettingID
	})
	return entries
}

func (r *Registry) Search(query string, limit int, sourceFilter SourceFilter) ([]Entry, error) {
	normalizedQuery := strings.ToLower(strings.TrimSpace(query))
	if normalizedQuery == "" {
		return nil, fmt.Errorf("query must not be empty")
	}

	tokens := strings.Fields(normalizedQuery)
	entries := r.ListEntries(sourceFilter)
	scored := make([]struct {
		score int
		entry Entry
	}, 0, len(entries))
	for _, entry := range entries {
		score := scoreEntry(entry, normalizedQuery, tokens)
		if score <= 0 {
			continue
		}
		scored = append(scored, struct {
			score int
			entry Entry
		}{score: score, entry: entry})
	}
	sort.Slice(scored, func(i, j int) bool {
		if scored[i].score == scored[j].score {
			return scored[i].entry.SettingID < scored[j].entry.SettingID
		}
		return scored[i].score > scored[j].score
	})
	if limit <= 0 || limit > len(scored) {
		limit = len(scored)
	}
	results := make([]Entry, 0, limit)
	for _, item := range scored[:limit] {
		results = append(results, item.entry)
	}
	return results, nil
}

func (r *Registry) ReadValue(ctx context.Context, projectID string, settingID string) (any, error) {
	entry, ok, err := r.Get(settingID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, r.MissingSettingError(settingID)
	}
	if entry.ReadValue == nil {
		return nil, newSettingError(ErrorCodeSettingNotFound, "UI setting %q does not expose a readable value.", entry.Metadata.SettingID)
	}

	value, err := entry.ReadValue(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if err := ValidateValue(entry.Metadata.ValueSchema, value); err != nil {
		return nil, err
	}
	return cloneJSONValue(value), nil
}

func (r *Registry) WriteValue(ctx context.Context, projectID string, settingID string, value any, expectedOldValue any) (MutationResult, error) {
	entry, ok, err := r.Get(settingID)
	if err != nil {
		return MutationResult{}, err
	}
	if !ok {
		return MutationResult{}, r.MissingSettingError(settingID)
	}
	if entry.Metadata.Mutability != MutabilityWritable || entry.WriteValue == nil {
		return MutationResult{}, newSettingError(ErrorCodeSettingReadOnly, "UI setting %q is read-only.", entry.Metadata.SettingID)
	}

	result, err := entry.WriteValue(ctx, projectID, value, expectedOldValue)
	if err != nil {
		return MutationResult{}, err
	}
	if err := ValidateValue(entry.Metadata.ValueSchema, result.NewValue); err != nil {
		return MutationResult{}, err
	}
	if err := ValidateValue(entry.Metadata.ValueSchema, result.NormalizedValue); err != nil {
		return MutationResult{}, err
	}
	result.OldValue = cloneJSONValue(result.OldValue)
	result.NewValue = cloneJSONValue(result.NewValue)
	result.NormalizedValue = cloneJSONValue(result.NormalizedValue)
	return result, nil
}

func normalizeSettingID(settingID string) (string, error) {
	normalized := strings.TrimSpace(settingID)
	if normalized == "" {
		return "", fmt.Errorf("settingId must not be empty")
	}
	return normalized, nil
}

func (r *Registry) HasKnownPlugin(pluginID string) bool {
	if r == nil {
		return false
	}
	_, ok := r.knownPluginIDs[strings.TrimSpace(pluginID)]
	return ok
}

func (r *Registry) HasKnownPluginSetting(pluginID string, localSettingID string) bool {
	if r == nil {
		return false
	}
	_, ok := r.knownPluginSettingIDs[pluginSettingKey(pluginID, localSettingID)]
	return ok
}

func (r *Registry) MissingSettingError(settingID string) error {
	normalizedSettingID, err := normalizeSettingID(settingID)
	if err != nil {
		return newUnknownSettingIDError(settingID)
	}
	if r == nil {
		return newUnknownSettingIDError(normalizedSettingID)
	}
	if settingErr, ok := r.unavailableSettings[normalizedSettingID]; ok {
		return newSettingError(settingErr.Code, "%s", settingErr.Message)
	}

	pluginID, _, ok := parsePluginSettingID(normalizedSettingID)
	if !ok || !r.HasKnownPlugin(pluginID) {
		return newUnknownSettingIDError(normalizedSettingID)
	}
	if err := r.missingPluginStatusError(pluginID); err != nil {
		return err
	}
	if settingErr, ok := r.invalidPluginSettings[normalizedSettingID]; ok {
		return newSettingError(settingErr.Code, "%s", settingErr.Message)
	}
	return newUnknownSettingIDError(normalizedSettingID)
}

func (r *Registry) missingPluginStatusError(pluginID string) error {
	status, ok := r.pluginStatusByPluginID[pluginID]
	if !ok {
		return nil
	}
	if err := status.requireOperationalState(pluginID); err != nil {
		return err
	}
	if err := status.requireRuntimeEntry(pluginID); err != nil {
		return err
	}
	if err := status.requireUISettingsCapability(pluginID); err != nil {
		return err
	}
	return nil
}

func scoreEntry(entry Entry, normalizedQuery string, tokens []string) int {
	searchable := buildSearchableEntry(entry)
	score := searchable.queryScore(normalizedQuery)
	for _, token := range tokens {
		score += searchable.tokenScore(token)
	}
	return score
}

type searchableEntry struct {
	settingID   string
	title       string
	description string
	synonyms    []string
}

func buildSearchableEntry(entry Entry) searchableEntry {
	synonyms := make([]string, 0, len(entry.Synonyms))
	for _, synonym := range entry.Synonyms {
		synonyms = append(synonyms, strings.ToLower(synonym))
	}
	return searchableEntry{
		settingID:   strings.ToLower(entry.SettingID),
		title:       strings.ToLower(entry.Title),
		description: strings.ToLower(entry.Description),
		synonyms:    synonyms,
	}
}

func (e searchableEntry) queryScore(query string) int {
	score := 0
	score += weightedExactMatch(e.settingID, query, 180)
	score += weightedContains(e.title, query, 120)
	score += weightedContains(e.description, query, 30)
	for _, synonym := range e.synonyms {
		if synonym == query {
			score += 90
			continue
		}
		score += weightedContains(synonym, query, 35)
	}
	return score
}

func (e searchableEntry) tokenScore(token string) int {
	score := 0
	score += weightedContains(e.settingID, token, 40)
	score += weightedContains(e.title, token, 28)
	score += weightedContains(e.description, token, 14)
	for _, synonym := range e.synonyms {
		score += weightedContains(synonym, token, 18)
	}
	return score
}

func weightedExactMatch(haystack string, needle string, weight int) int {
	if haystack == needle {
		return weight
	}
	return 0
}

func weightedContains(haystack string, needle string, weight int) int {
	if strings.Contains(haystack, needle) {
		return weight
	}
	return 0
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case nil, bool, string, float64, float32, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return typed
	}

	encoded, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var cloned any
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return value
	}
	return cloned
}

func cloneStringSet(values map[string]struct{}) map[string]struct{} {
	if len(values) == 0 {
		return map[string]struct{}{}
	}
	cloned := make(map[string]struct{}, len(values))
	for key := range values {
		cloned[key] = struct{}{}
	}
	return cloned
}

func clonePluginRegistryStatusMap(values map[string]pluginRegistryStatus) map[string]pluginRegistryStatus {
	if len(values) == 0 {
		return map[string]pluginRegistryStatus{}
	}
	cloned := make(map[string]pluginRegistryStatus, len(values))
	for key, value := range values {
		cloned[key] = pluginRegistryStatus{
			ObservedStates:        append([]string(nil), value.ObservedStates...),
			RuntimeEntryAvailable: value.RuntimeEntryAvailable,
			SupportsUISettings:    value.SupportsUISettings,
		}
	}
	return cloned
}

func cloneSettingErrorMap(values map[string]SettingError) map[string]SettingError {
	if len(values) == 0 {
		return map[string]SettingError{}
	}
	cloned := make(map[string]SettingError, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func (s pluginRegistryStatus) requireOperationalState(pluginID string) error {
	if s.Operational() {
		return nil
	}
	return newPluginUnavailableStateError(pluginID, describeObservedPluginStates(s.ObservedStates))
}

func (s pluginRegistryStatus) requireRuntimeEntry(pluginID string) error {
	if s.RuntimeEntryAvailable {
		return nil
	}
	return newPluginRuntimeEntryMissingError(pluginID, describeObservedPluginStates(s.ObservedStates))
}

func (s pluginRegistryStatus) requireUISettingsCapability(pluginID string) error {
	if s.SupportsUISettings {
		return nil
	}
	return newPluginUISettingsCapabilityError(pluginID)
}

func describeObservedPluginStates(states []string) string {
	trimmed := make([]string, 0, len(states))
	for _, state := range states {
		state = strings.TrimSpace(state)
		if state == "" {
			continue
		}
		trimmed = append(trimmed, state)
	}
	sort.Strings(trimmed)
	trimmed = slices.Compact(trimmed)
	if len(trimmed) == 0 {
		return ""
	}
	if len(trimmed) == 1 {
		return trimmed[0]
	}
	return strings.Join(trimmed, ",")
}

func newUnknownSettingIDError(settingID string) error {
	return newSettingError(ErrorCodeSettingNotFound, "Unknown setting id: %s", strings.TrimSpace(settingID))
}

func newPluginUnavailableStateError(pluginID string, observedState string) error {
	if observedState == "" {
		return newSettingError(ErrorCodePluginUnavailable, "Plugin %s is unavailable.", pluginID)
	}
	return newSettingError(
		ErrorCodePluginUnavailable,
		"Plugin %s is unavailable (state=%s).",
		pluginID,
		observedState,
	)
}

func newPluginRuntimeEntryMissingError(pluginID string, observedState string) error {
	if observedState == "" {
		observedState = "unknown"
	}
	return newSettingError(
		ErrorCodePluginUnavailable,
		"Plugin %s is unavailable (state=%s, runtime entry missing).",
		pluginID,
		observedState,
	)
}

func newPluginUISettingsCapabilityError(pluginID string) error {
	return newSettingError(
		ErrorCodePluginUnavailable,
		"Plugin %s is unavailable for UI setting access (registerPane or registerUISettings capability not effective).",
		pluginID,
	)
}
