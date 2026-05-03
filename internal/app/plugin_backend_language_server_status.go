package app

import (
	"context"
	"strings"

	"setta/internal/lsp"
	"setta/internal/plugins"
	"setta/internal/settingsstate"
)

func (r *pluginBackendRuntimeRefresher) applyAppliedLanguageServerStatus(status *plugins.PluginStatusResponse) {
	if r == nil || status == nil {
		return
	}

	r.mu.Lock()
	appliedByPlugin := appliedLanguageServerStatusesByPlugin(r.appliedLSPSpecs)
	r.mu.Unlock()
	if len(appliedByPlugin) == 0 {
		return
	}

	status.Plugins = appliedLanguageServerStatusEntries(status.Plugins, appliedByPlugin)
}

type appliedLanguageServerStatus struct {
	spec      lsp.LanguageServerSpec
	languages []string
}

func appliedLanguageServerStatusEntries(
	entries []plugins.PluginStatusEntry,
	appliedByPlugin map[string]appliedLanguageServerStatus,
) []plugins.PluginStatusEntry {
	if len(entries) == 0 && len(appliedByPlugin) == 0 {
		return nil
	}

	output := make([]plugins.PluginStatusEntry, 0, len(entries)+len(appliedByPlugin))
	for index := 0; index < len(entries); {
		groupStart := index
		pluginID := entries[index].PluginID
		for index < len(entries) && entries[index].PluginID == pluginID {
			index++
		}
		group := append([]plugins.PluginStatusEntry(nil), entries[groupStart:index]...)
		applied, ok := appliedByPlugin[pluginID]
		if !ok {
			output = append(output, group...)
			continue
		}
		if matchedIndex := matchingAppliedLanguageServerStatusIndex(group, applied); matchedIndex >= 0 {
			group[matchedIndex].AppliedLanguageServerLanguages = append([]string(nil), applied.languages...)
			group = movePluginStatusEntryToFront(group, matchedIndex)
		} else {
			output = append(output, missingAppliedLanguageServerStatusEntry(pluginID, applied.languages))
		}
		output = append(output, group...)
		delete(appliedByPlugin, pluginID)
	}
	return appendMissingAppliedLanguageServerStatuses(output, appliedByPlugin)
}

func matchingAppliedLanguageServerStatusIndex(
	group []plugins.PluginStatusEntry,
	applied appliedLanguageServerStatus,
) int {
	for index := range group {
		if languageServerSpecMatchesStatusEntry(applied.spec, group[index]) {
			return index
		}
	}
	return -1
}

func appendMissingAppliedLanguageServerStatuses(
	output []plugins.PluginStatusEntry,
	appliedByPlugin map[string]appliedLanguageServerStatus,
) []plugins.PluginStatusEntry {
	if len(appliedByPlugin) == 0 {
		return output
	}
	pluginIDs := make([]string, 0, len(appliedByPlugin))
	for pluginID := range appliedByPlugin {
		pluginIDs = append(pluginIDs, pluginID)
	}
	for _, pluginID := range uniqueSortedStrings(pluginIDs) {
		applied := appliedByPlugin[pluginID]
		output = append(output, missingAppliedLanguageServerStatusEntry(pluginID, applied.languages))
	}
	return output
}

func movePluginStatusEntryToFront(entries []plugins.PluginStatusEntry, index int) []plugins.PluginStatusEntry {
	if index <= 0 || index >= len(entries) {
		return entries
	}
	moved := entries[index]
	output := make([]plugins.PluginStatusEntry, 0, len(entries))
	output = append(output, moved)
	output = append(output, entries[:index]...)
	output = append(output, entries[index+1:]...)
	return output
}

func missingAppliedLanguageServerStatusEntry(pluginID string, languages []string) plugins.PluginStatusEntry {
	trimmedPluginID := strings.TrimSpace(pluginID)
	return plugins.PluginStatusEntry{
		PluginID:                       trimmedPluginID,
		Name:                           trimmedPluginID,
		State:                          plugins.PluginRuntimeStateInvalid,
		AppliedLanguageServerLanguages: append([]string(nil), languages...),
		RestartRequired:                true,
		Errors: []plugins.PluginErrorInfo{
			{
				Code:    "applied_language_server_plugin_missing",
				Message: "Plugin is no longer discovered, but its language server remains applied until restart.",
			},
		},
	}
}

func (r *pluginBackendRuntimeRefresher) selectedLanguageServerSpecs(
	snapshot plugins.DiscoverySnapshot,
	includePendingLanguageServerOnly bool,
) ([]lsp.LanguageServerSpec, error) {
	selections, err := r.selectedLanguageServerPlugins()
	if err != nil {
		return nil, err
	}
	return r.languageServerSpecsForSelections(snapshot, selections, includePendingLanguageServerOnly)
}

func (r *pluginBackendRuntimeRefresher) reconcileAppliedPluginLanguageServerRefreshLocked(
	ctx context.Context,
	appliedPluginID string,
	previous []lsp.LanguageServerSpec,
	next []lsp.LanguageServerSpec,
) error {
	if strings.TrimSpace(appliedPluginID) == "" {
		return nil
	}
	if err := r.reconcileProjectDocumentLocked(ctx, previous, next, false); err != nil {
		r.logPluginBackendRuntimeError(
			"rollback plugin backend language servers after config refresh failure",
			r.replaceLSPSpecsLocked(context.Background(), next, previous),
		)
		r.logPluginBackendRuntimeError(
			"rollback plugin backend project reconciliation after config refresh failure",
			r.reconcileProjectDocumentLocked(context.Background(), next, previous, false),
		)
		return err
	}
	return nil
}

func (r *pluginBackendRuntimeRefresher) selectedLanguageServerPlugins() (map[string]*string, error) {
	if r == nil || r.settings == nil {
		return map[string]*string{}, nil
	}
	return settingsstate.LanguageServerSelectedByLanguage(r.settings.Snapshot().Document)
}

func (r *pluginBackendRuntimeRefresher) languageServerSpecsForSelections(
	snapshot plugins.DiscoverySnapshot,
	selections map[string]*string,
	includePendingLanguageServerOnly bool,
) ([]lsp.LanguageServerSpec, error) {
	if includePendingLanguageServerOnly {
		return r.service.LanguageServerSpecsForSnapshot(snapshot, selections)
	}
	return r.service.ActiveLanguageServerSpecsForSnapshot(snapshot, selections)
}
