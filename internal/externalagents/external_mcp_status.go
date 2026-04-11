package externalagents

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sort"
	"strings"
	"time"

	"setta/internal/agentruns"
	"setta/internal/mcpx"
)

const (
	externalMCPStatusSnapshotKey = "externalMcpServerRuntimeStatuses"
	externalMCPStatusSource      = "external_runtime"
)

func (r *Runtime) UpsertMCPStatuses(runID string, statuses []mcpx.ServerRuntimeStatus) error {
	if r == nil || r.runs == nil {
		return ErrRuntimeRunStoreRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return ErrRunIDRequired
	}
	if len(statuses) == 0 {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	statusMap, err := r.ensureActiveRunMCPStatusesLocked(trimmedRunID)
	if err != nil {
		return err
	}
	for _, status := range statuses {
		serverID, nextStatus, ok := normalizeExternalRuntimeStatus(status)
		if !ok {
			continue
		}
		if existing, ok := statusMap[serverID]; ok && shouldSkipExternalRuntimeStatusUpdate(existing, nextStatus) {
			continue
		}
		statusMap[serverID] = nextStatus
	}
	return nil
}

func (r *Runtime) ensureActiveRunMCPStatusesLocked(runID string) (map[string]mcpx.ServerRuntimeStatus, error) {
	if _, ok := r.activeRuns[runID]; !ok {
		return nil, ErrRunNotActive
	}
	if _, ok := r.mcpStatuses[runID]; !ok {
		r.mcpStatuses[runID] = map[string]mcpx.ServerRuntimeStatus{}
	}
	return r.mcpStatuses[runID], nil
}

func normalizeExternalRuntimeStatus(status mcpx.ServerRuntimeStatus) (string, mcpx.ServerRuntimeStatus, bool) {
	serverID := strings.TrimSpace(status.ServerID)
	if serverID == "" {
		return "", mcpx.ServerRuntimeStatus{}, false
	}
	nextStatus := cloneMCPStatus(status)
	nextStatus.ServerID = serverID
	if strings.TrimSpace(nextStatus.Source) == "" {
		nextStatus.Source = externalMCPStatusSource
	}
	return serverID, nextStatus, true
}

func shouldSkipExternalRuntimeStatusUpdate(existing mcpx.ServerRuntimeStatus, next mcpx.ServerRuntimeStatus) bool {
	return existing.State != mcpx.RuntimeStateUnknown && next.State == mcpx.RuntimeStateUnknown
}

func (r *Runtime) ExternalRuntimeStatuses(chatID *string, engineConfigID *string) ([]mcpx.ServerRuntimeStatus, error) {
	if r == nil || r.runs == nil {
		return nil, ErrRuntimeRunStoreRequired
	}
	trimmedChatID := strings.TrimSpace(derefOptionalString(chatID))
	trimmedEngineID := strings.TrimSpace(derefOptionalString(engineConfigID))
	if trimmedEngineID == "" {
		r.logExternalMCPStatusLookup(trimmedChatID, trimmedEngineID, "", "missing_engine_config_id", []mcpx.ServerRuntimeStatus{}, 0)
		return []mcpx.ServerRuntimeStatus{}, nil
	}
	runs, err := r.runs.ListByMetadata(buildExternalRuntimeRunFilter(trimmedChatID))
	if err != nil {
		return nil, err
	}
	latestRun, ok := selectLatestExternalRuntimeRunForEngine(runs, trimmedEngineID)
	if !ok {
		r.logExternalMCPStatusLookup(trimmedChatID, trimmedEngineID, "", "no_matching_run", []mcpx.ServerRuntimeStatus{}, len(runs))
		return []mcpx.ServerRuntimeStatus{}, nil
	}
	if statuses := r.MCPStatusesForRun(latestRun.ID); len(statuses) > 0 {
		r.logExternalMCPStatusLookup(trimmedChatID, trimmedEngineID, latestRun.ID, "live_runtime", statuses, len(runs))
		return statuses, nil
	}
	statuses := loadExternalMCPStatusSnapshot(latestRun.Outputs)
	r.logExternalMCPStatusLookup(trimmedChatID, trimmedEngineID, latestRun.ID, "persisted_snapshot", statuses, len(runs))
	return statuses, nil
}

func buildExternalRuntimeRunFilter(chatID string) agentruns.RunFilter {
	filter := agentruns.RunFilter{
		RunType: stringPtr(RunTypeExternalAgent),
	}
	if chatID != "" {
		filter.ChatID = &chatID
	}
	return filter
}

func selectLatestExternalRuntimeRunForEngine(runs []agentruns.Run, engineConfigID string) (agentruns.Run, bool) {
	if len(runs) == 0 || strings.TrimSpace(engineConfigID) == "" {
		return agentruns.Run{}, false
	}
	matchingRuns := make([]agentruns.Run, 0, len(runs))
	for _, run := range runs {
		if resolveRunInputString(run, "engineConfigId") != engineConfigID {
			continue
		}
		matchingRuns = append(matchingRuns, run)
	}
	return selectLatestRun(matchingRuns)
}

func (r *Runtime) MCPStatusesForRun(runID string) []mcpx.ServerRuntimeStatus {
	if r == nil {
		return []mcpx.ServerRuntimeStatus{}
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return []mcpx.ServerRuntimeStatus{}
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	statusMap := r.mcpStatuses[trimmedRunID]
	if len(statusMap) == 0 {
		return []mcpx.ServerRuntimeStatus{}
	}
	serverIDs := make([]string, 0, len(statusMap))
	for serverID := range statusMap {
		serverIDs = append(serverIDs, serverID)
	}
	sort.Strings(serverIDs)
	statuses := make([]mcpx.ServerRuntimeStatus, 0, len(serverIDs))
	for _, serverID := range serverIDs {
		statuses = append(statuses, cloneMCPStatus(statusMap[serverID]))
	}
	return statuses
}

func (r *Runtime) attachMCPStatusSnapshot(run *agentruns.Run) {
	if r == nil || run == nil {
		return
	}
	statuses := r.MCPStatusesForRun(run.ID)
	if len(statuses) == 0 {
		return
	}
	encoded, err := encodeExternalMCPStatusSnapshot(statuses)
	if err != nil {
		return
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs[externalMCPStatusSnapshotKey] = encoded
}

func encodeExternalMCPStatusSnapshot(statuses []mcpx.ServerRuntimeStatus) ([]any, error) {
	if len(statuses) == 0 {
		return []any{}, nil
	}
	payload, err := json.Marshal(statuses)
	if err != nil {
		return nil, err
	}
	decoded := []any{}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}

func loadExternalMCPStatusSnapshot(outputs map[string]any) []mcpx.ServerRuntimeStatus {
	if len(outputs) == 0 {
		return []mcpx.ServerRuntimeStatus{}
	}
	rawSnapshot, ok := outputs[externalMCPStatusSnapshotKey].([]any)
	if !ok || len(rawSnapshot) == 0 {
		return []mcpx.ServerRuntimeStatus{}
	}
	statuses := make([]mcpx.ServerRuntimeStatus, 0, len(rawSnapshot))
	for _, rawEntry := range rawSnapshot {
		entryPayload, err := json.Marshal(rawEntry)
		if err != nil {
			continue
		}
		var status mcpx.ServerRuntimeStatus
		if err := json.Unmarshal(entryPayload, &status); err != nil {
			continue
		}
		if strings.TrimSpace(status.ServerID) == "" {
			continue
		}
		statuses = append(statuses, cloneMCPStatus(status))
	}
	sort.Slice(statuses, func(i int, j int) bool {
		return statuses[i].ServerID < statuses[j].ServerID
	})
	return statuses
}

func cloneMCPStatus(status mcpx.ServerRuntimeStatus) mcpx.ServerRuntimeStatus {
	cloned := status
	cloned.LastAttemptAt = cloneTimePtr(status.LastAttemptAt)
	cloned.LastConnectedAt = cloneTimePtr(status.LastConnectedAt)
	cloned.LastFailureAt = cloneTimePtr(status.LastFailureAt)
	cloned.LastError = cloneOptionalString(status.LastError)
	cloned.MissingEnvVar = cloneOptionalString(status.MissingEnvVar)
	return cloned
}

func cloneTimePtr(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	cloned := value.UTC()
	return &cloned
}

func buildCodexMCPStatuses(payload map[string]any, timeNow func() time.Time) []mcpx.ServerRuntimeStatus {
	return buildExternalMCPStatusesFromPayload(payload, true, timeNow)
}

func buildClaudeMCPStatuses(payload any, timeNow func() time.Time) []mcpx.ServerRuntimeStatus {
	return buildExternalMCPStatusesFromPayload(payload, false, timeNow)
}

func buildUnknownClaudeMCPStatuses(configPath string) []mcpx.ServerRuntimeStatus {
	trimmedPath := strings.TrimSpace(configPath)
	if trimmedPath == "" {
		return []mcpx.ServerRuntimeStatus{}
	}
	content, err := os.ReadFile(trimmedPath)
	if err != nil || len(strings.TrimSpace(string(content))) == 0 {
		return []mcpx.ServerRuntimeStatus{}
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		return []mcpx.ServerRuntimeStatus{}
	}
	rawServers, ok := payload["mcpServers"].(map[string]any)
	if !ok || len(rawServers) == 0 {
		return []mcpx.ServerRuntimeStatus{}
	}
	serverIDs := make([]string, 0, len(rawServers))
	for serverID := range rawServers {
		if strings.TrimSpace(serverID) == "" {
			continue
		}
		serverIDs = append(serverIDs, serverID)
	}
	sort.Strings(serverIDs)
	statuses := make([]mcpx.ServerRuntimeStatus, 0, len(serverIDs))
	for _, serverID := range serverIDs {
		entry, _ := rawServers[serverID].(map[string]any)
		if entry == nil {
			entry = map[string]any{}
		}
		statuses = append(statuses, mcpx.ServerRuntimeStatus{
			ServerID:  serverID,
			Source:    externalMCPStatusSource,
			Transport: resolveExternalTransport(entry),
			Endpoint:  resolveExternalEndpoint(entry),
			State:     mcpx.RuntimeStateUnknown,
			ToolCount: resolveExternalToolCount(entry),
		})
	}
	return statuses
}

func buildUnknownCodexMCPStatuses(configPath string) []mcpx.ServerRuntimeStatus {
	trimmedPath := strings.TrimSpace(configPath)
	if trimmedPath == "" {
		return []mcpx.ServerRuntimeStatus{}
	}
	payload, err := loadCodexConfigPayload(trimmedPath)
	if err != nil {
		return []mcpx.ServerRuntimeStatus{}
	}
	rawServers := ensureAnyMapFromValue(payload["mcp_servers"])
	if len(rawServers) == 0 {
		return []mcpx.ServerRuntimeStatus{}
	}
	serverIDs := make([]string, 0, len(rawServers))
	for serverID := range rawServers {
		if strings.TrimSpace(serverID) == "" {
			continue
		}
		serverIDs = append(serverIDs, serverID)
	}
	sort.Strings(serverIDs)
	statuses := make([]mcpx.ServerRuntimeStatus, 0, len(serverIDs))
	for _, serverID := range serverIDs {
		entry := ensureAnyMapFromValue(rawServers[serverID])
		statuses = append(statuses, mcpx.ServerRuntimeStatus{
			ServerID:  serverID,
			Source:    externalMCPStatusSource,
			Transport: resolveExternalTransport(entry),
			Endpoint:  resolveExternalEndpoint(entry),
			State:     mcpx.RuntimeStateUnknown,
			ToolCount: resolveExternalToolCount(entry),
		})
	}
	return statuses
}

func buildExternalMCPStatusesFromPayload(payload any, allowGenericServerContainers bool, timeNow func() time.Time) []mcpx.ServerRuntimeStatus {
	rows := extractExternalStatusPayloads(payload, allowGenericServerContainers)
	if len(rows) == 0 {
		return []mcpx.ServerRuntimeStatus{}
	}
	now := time.Now().UTC()
	if timeNow != nil {
		now = timeNow().UTC()
	}
	statuses := make([]mcpx.ServerRuntimeStatus, 0, len(rows))
	for _, row := range rows {
		serverID := resolveExternalServerID(row, true)
		if serverID == "" {
			continue
		}
		state := resolveExternalRuntimeState(row)
		status := mcpx.ServerRuntimeStatus{
			ServerID:  serverID,
			Source:    externalMCPStatusSource,
			Transport: resolveExternalTransport(row),
			Endpoint:  resolveExternalEndpoint(row),
			State:     state,
			ToolCount: resolveExternalToolCount(row),
		}
		status.LastAttemptAt = cloneTimePtr(&now)
		if state == mcpx.RuntimeStateConnected {
			status.LastConnectedAt = cloneTimePtr(&now)
		}
		if state == mcpx.RuntimeStateError || state == mcpx.RuntimeStateRetrying {
			status.LastFailureAt = cloneTimePtr(&now)
			status.ConsecutiveFailures = 1
		}
		if lastError := resolveExternalLastError(row); lastError != nil {
			status.LastError = lastError
			if status.State == mcpx.RuntimeStateUnknown {
				status.State = mcpx.RuntimeStateError
				status.LastFailureAt = cloneTimePtr(&now)
				status.ConsecutiveFailures = 1
			}
		}
		statuses = append(statuses, status)
	}
	sort.Slice(statuses, func(i int, j int) bool {
		return statuses[i].ServerID < statuses[j].ServerID
	})
	return statuses
}

func resolveExternalTransport(server map[string]any) mcpx.Transport {
	for _, key := range []string{"transport", "type", "protocol"} {
		value := strings.ToLower(strings.TrimSpace(stringValue(server[key])))
		switch value {
		case "sse":
			return mcpx.TransportSSE
		case "streamable_http", "streamable-http", "streamablehttp":
			return mcpx.TransportStreamableHTTP
		case "stdio":
			return mcpx.TransportStdio
		case "":
			continue
		default:
			return mcpx.Transport(value)
		}
	}
	return mcpx.Transport("")
}

func resolveExternalEndpoint(server map[string]any) string {
	for _, key := range []string{"url", "endpoint", "address", "command"} {
		if value := strings.TrimSpace(stringValue(server[key])); value != "" {
			if key != "command" {
				return value
			}
			command := value
			args, ok := server["args"].([]any)
			if !ok || len(args) == 0 {
				return command
			}
			parts := []string{command}
			for _, rawArg := range args {
				arg := strings.TrimSpace(stringValue(rawArg))
				if arg != "" {
					parts = append(parts, arg)
				}
			}
			return strings.Join(parts, " ")
		}
	}
	return ""
}

func resolveExternalToolCount(server map[string]any) int {
	for _, key := range []string{"toolCount", "tool_count"} {
		switch value := server[key].(type) {
		case int:
			return value
		case float64:
			return int(value)
		case string:
			trimmed := strings.TrimSpace(value)
			if trimmed == "" {
				continue
			}
			parsed := 0
			if _, err := fmt.Sscanf(trimmed, "%d", &parsed); err == nil {
				return parsed
			}
		}
	}
	if tools, ok := server["tools"].([]any); ok {
		return len(tools)
	}
	for _, key := range []string{"enabled_tools", "enabledTools"} {
		switch value := server[key].(type) {
		case []any:
			return len(value)
		case []string:
			return len(value)
		}
	}
	return 0
}

func (r *Runtime) logExternalMCPStatusLookup(chatID string, engineConfigID string, runID string, source string, statuses []mcpx.ServerRuntimeStatus, candidateRunCount int) {
	if r == nil || r.logger == nil {
		return
	}
	r.logger.Debug(
		"resolved external MCP runtime status",
		slog.String("trace_event", "external_mcp_runtime_status_resolved"),
		slog.String("chat_id", chatID),
		slog.String("engine_config_id", engineConfigID),
		slog.String("selected_run_id", runID),
		slog.String("status_source", source),
		slog.Int("candidate_run_count", candidateRunCount),
		slog.Any("status_summary", summarizeMCPStatuses(statuses)),
	)
}

func summarizeMCPStatuses(statuses []mcpx.ServerRuntimeStatus) []map[string]any {
	if len(statuses) == 0 {
		return []map[string]any{}
	}
	summary := make([]map[string]any, 0, len(statuses))
	for _, status := range statuses {
		entry := map[string]any{
			"serverId":  status.ServerID,
			"source":    status.Source,
			"transport": status.Transport,
			"state":     status.State,
			"toolCount": status.ToolCount,
			"endpoint":  status.Endpoint,
		}
		if status.LastError != nil && strings.TrimSpace(*status.LastError) != "" {
			entry["lastError"] = strings.TrimSpace(*status.LastError)
		}
		if status.MissingEnvVar != nil && strings.TrimSpace(*status.MissingEnvVar) != "" {
			entry["missingEnvVar"] = strings.TrimSpace(*status.MissingEnvVar)
		}
		summary = append(summary, entry)
	}
	return summary
}

func resolveExternalLastError(server map[string]any) *string {
	for _, key := range []string{"lastError", "error"} {
		if message := extractExternalErrorMessage(server[key]); message != "" {
			return stringPtr(message)
		}
	}
	return nil
}

func extractExternalErrorMessage(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case map[string]any:
		for _, key := range []string{"message", "error", "lastError", "detail"} {
			if message := strings.TrimSpace(stringValue(typed[key])); message != "" {
				return message
			}
		}
		for _, nested := range typed {
			if message := extractExternalErrorMessage(nested); message != "" {
				return message
			}
		}
	}
	return ""
}

func extractExternalStatusPayloads(payload any, allowGenericServerContainers bool) []map[string]any {
	_, isTopLevelList := payload.([]any)
	return extractExternalStatusPayloadsFromContainer(payload, isTopLevelList, allowGenericServerContainers)
}

func extractExternalStatusPayloadsFromContainer(payload any, isMCPContainer bool, allowGenericServerContainers bool) []map[string]any {
	switch typed := payload.(type) {
	case map[string]any:
		return extractExternalStatusPayloadsFromMap(typed, isMCPContainer, allowGenericServerContainers)
	case []any:
		return extractExternalStatusPayloadsFromList(typed, isMCPContainer)
	default:
		return []map[string]any{}
	}
}

func extractExternalStatusPayloadsFromMap(payload map[string]any, isMCPContainer bool, allowGenericServerContainers bool) []map[string]any {
	if nested := extractNestedExternalStatusPayloads(payload, isMCPContainer, allowGenericServerContainers); len(nested) > 0 {
		return nested
	}
	if normalized, ok := normalizeExternalStatusRow(payload, isMCPContainer); ok {
		return []map[string]any{normalized}
	}
	if !isMCPContainer {
		return []map[string]any{}
	}
	return extractExternalStatusRowsFromServerMap(payload)
}

func extractNestedExternalStatusPayloads(payload map[string]any, isMCPContainer bool, allowGenericServerContainers bool) []map[string]any {
	for _, key := range []string{"result", "message", "event", "stream_event", "data"} {
		nestedPayloads := extractExternalStatusPayloadsFromContainer(payload[key], isMCPContainer, allowGenericServerContainers)
		if len(nestedPayloads) > 0 {
			return nestedPayloads
		}
	}
	if nested := payload["mcp_servers"]; nested != nil {
		return extractExternalStatusPayloadsFromContainer(nested, true, allowGenericServerContainers)
	}
	if allowGenericServerContainers {
		if nested := payload["servers"]; nested != nil {
			return extractExternalStatusPayloadsFromContainer(nested, true, allowGenericServerContainers)
		}
	}
	return nil
}

func extractExternalStatusPayloadsFromList(payload []any, isMCPContainer bool) []map[string]any {
	rows := make([]map[string]any, 0, len(payload))
	for _, rawRow := range payload {
		row, ok := rawRow.(map[string]any)
		if !ok {
			continue
		}
		if normalized, ok := normalizeExternalStatusRow(row, isMCPContainer); ok {
			rows = append(rows, normalized)
		}
	}
	return rows
}

func extractExternalStatusRowsFromServerMap(payload map[string]any) []map[string]any {
	rows := make([]map[string]any, 0, len(payload))
	for serverID, rawRow := range payload {
		normalized, ok := normalizeExternalNamedStatusRow(serverID, rawRow)
		if !ok {
			continue
		}
		rows = append(rows, normalized)
	}
	return rows
}

func normalizeExternalStatusRow(row map[string]any, isMCPContainer bool) (map[string]any, bool) {
	normalized := cloneAnyMap(row)
	if isMCPContainer {
		ensureExternalServerID(normalized, "")
	}
	if !looksLikeExternalStatusEntry(normalized, isMCPContainer) {
		return nil, false
	}
	if resolveExternalServerID(normalized, true) == "" {
		return nil, false
	}
	return normalized, true
}

func normalizeExternalNamedStatusRow(serverID string, rawRow any) (map[string]any, bool) {
	row, ok := rawRow.(map[string]any)
	if !ok || strings.TrimSpace(serverID) == "" {
		return nil, false
	}
	normalized := cloneAnyMap(row)
	ensureExternalServerID(normalized, serverID)
	if !looksLikeExternalStatusEntry(normalized, true) {
		return nil, false
	}
	return normalized, true
}

func ensureExternalServerID(row map[string]any, fallback string) {
	if strings.TrimSpace(stringValue(row["serverId"])) != "" {
		return
	}
	if serverID := resolveExternalServerID(row, true); serverID != "" {
		row["serverId"] = serverID
		return
	}
	if strings.TrimSpace(fallback) != "" {
		row["serverId"] = fallback
	}
}

func looksLikeExternalStatusEntry(row map[string]any, isMCPContainer bool) bool {
	statusKeys := []string{
		"status",
		"state",
		"connected",
		"enabled",
		"transport",
		"type",
		"protocol",
		"url",
		"command",
		"endpoint",
		"error",
		"lastError",
		"toolCount",
		"tool_count",
		"tools",
		"missingEnvVar",
		"missing_env_var",
	}
	hasStatusKey := false
	for _, key := range statusKeys {
		if _, ok := row[key]; ok {
			hasStatusKey = true
			break
		}
	}
	return hasStatusKey && resolveExternalServerID(row, isMCPContainer) != ""
}

func resolveExternalServerID(row map[string]any, allowFallback bool) string {
	for _, key := range []string{"serverId", "server", "server_name"} {
		if value := strings.TrimSpace(stringValue(row[key])); value != "" {
			return value
		}
	}
	if allowFallback {
		for _, key := range []string{"id", "name"} {
			if value := strings.TrimSpace(stringValue(row[key])); value != "" {
				return value
			}
		}
	}
	return ""
}

func resolveExternalRuntimeState(server map[string]any) mcpx.RuntimeState {
	if enabled, ok := server["enabled"].(bool); ok && !enabled {
		return mcpx.RuntimeStateDisabled
	}
	if connected, ok := server["connected"].(bool); ok && connected {
		return mcpx.RuntimeStateConnected
	}
	if state, ok := resolveExternalStatusStateValue(server); ok {
		return state
	}
	if connected, ok := server["connected"].(bool); ok && !connected {
		if resolveExternalLastError(server) != nil {
			return mcpx.RuntimeStateError
		}
		return mcpx.RuntimeStateUnknown
	}
	return mcpx.RuntimeStateUnknown
}

func resolveExternalStatusStateValue(server map[string]any) (mcpx.RuntimeState, bool) {
	for _, key := range []string{"state", "status"} {
		switch normalized := strings.ToLower(strings.TrimSpace(stringValue(server[key]))); normalized {
		case "connected", "ready", "ok", "online", "active":
			return mcpx.RuntimeStateConnected, true
		case "connecting", "initializing", "starting", "loading":
			return mcpx.RuntimeStateConnecting, true
		case "retrying", "reconnecting", "backoff":
			return mcpx.RuntimeStateRetrying, true
		case "error", "failed", "failure", "disconnected", "unavailable", "offline":
			return mcpx.RuntimeStateError, true
		case "disabled":
			return mcpx.RuntimeStateDisabled, true
		case "":
			continue
		}
	}
	return mcpx.RuntimeStateUnknown, false
}

func resolveCodexMCPRuntimeState(server map[string]any) mcpx.RuntimeState {
	return resolveExternalRuntimeState(server)
}
