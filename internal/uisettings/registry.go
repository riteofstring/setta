package uisettings

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

type Registry struct {
	entriesByID map[string]RuntimeEntry
}

func New(entries []RuntimeEntry) (*Registry, error) {
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
	return &Registry{entriesByID: entriesByID}, nil
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
		return nil, newSettingError(ErrorCodeSettingNotFound, "UI setting %q was not found.", strings.TrimSpace(settingID))
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
		return MutationResult{}, newSettingError(ErrorCodeSettingNotFound, "UI setting %q was not found.", strings.TrimSpace(settingID))
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

func scoreEntry(entry Entry, normalizedQuery string, tokens []string) int {
	score := 0
	settingID := strings.ToLower(entry.SettingID)
	title := strings.ToLower(entry.Title)
	description := strings.ToLower(entry.Description)

	if normalizedQuery == settingID {
		score += 180
	}
	if strings.Contains(title, normalizedQuery) {
		score += 120
	}
	if strings.Contains(description, normalizedQuery) {
		score += 30
	}
	for _, synonym := range entry.Synonyms {
		normalizedSynonym := strings.ToLower(synonym)
		if normalizedQuery == normalizedSynonym {
			score += 90
		} else if strings.Contains(normalizedSynonym, normalizedQuery) {
			score += 35
		}
	}

	for _, token := range tokens {
		if strings.Contains(settingID, token) {
			score += 40
		}
		if strings.Contains(title, token) {
			score += 28
		}
		if strings.Contains(description, token) {
			score += 14
		}
		for _, synonym := range entry.Synonyms {
			if strings.Contains(strings.ToLower(synonym), token) {
				score += 18
			}
		}
	}
	return score
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
