package externalagents

import (
	"encoding/json"
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
	if _, ok := r.activeRuns[trimmedRunID]; !ok {
		return ErrRunNotActive
	}
	if _, ok := r.mcpStatuses[trimmedRunID]; !ok {
		r.mcpStatuses[trimmedRunID] = map[string]mcpx.ServerRuntimeStatus{}
	}
	for _, status := range statuses {
		serverID := strings.TrimSpace(status.ServerID)
		if serverID == "" {
			continue
		}
		nextStatus := cloneMCPStatus(status)
		nextStatus.ServerID = serverID
		if strings.TrimSpace(nextStatus.Source) == "" {
			nextStatus.Source = externalMCPStatusSource
		}
		existing, ok := r.mcpStatuses[trimmedRunID][serverID]
		if ok && existing.State != mcpx.RuntimeStateUnknown && nextStatus.State == mcpx.RuntimeStateUnknown {
			continue
		}
		r.mcpStatuses[trimmedRunID][serverID] = nextStatus
	}
	return nil
}

func (r *Runtime) ExternalRuntimeStatuses(chatID *string, engineConfigID *string) ([]mcpx.ServerRuntimeStatus, error) {
	if r == nil || r.runs == nil {
		return nil, ErrRuntimeRunStoreRequired
	}
	trimmedChatID := strings.TrimSpace(derefOptionalString(chatID))
	trimmedEngineID := strings.TrimSpace(derefOptionalString(engineConfigID))
	if trimmedChatID == "" || trimmedEngineID == "" {
		return []mcpx.ServerRuntimeStatus{}, nil
	}
	runs, err := r.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeExternalAgent),
		ChatID:  &trimmedChatID,
	})
	if err != nil {
		return nil, err
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		return []mcpx.ServerRuntimeStatus{}, nil
	}
	if resolveRunInputString(latestRun, "engineConfigId") != trimmedEngineID {
		return []mcpx.ServerRuntimeStatus{}, nil
	}
	if statuses := r.MCPStatusesForRun(latestRun.ID); len(statuses) > 0 {
		return statuses, nil
	}
	return loadExternalMCPStatusSnapshot(latestRun.Outputs), nil
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
	if len(payload) == 0 {
		return []mcpx.ServerRuntimeStatus{}
	}
	now := time.Now().UTC()
	if timeNow != nil {
		now = timeNow().UTC()
	}
	rawServers, ok := payload["servers"].([]any)
	if !ok {
		return []mcpx.ServerRuntimeStatus{}
	}
	statuses := make([]mcpx.ServerRuntimeStatus, 0, len(rawServers))
	for _, rawServer := range rawServers {
		server, ok := rawServer.(map[string]any)
		if !ok {
			continue
		}
		serverID := strings.TrimSpace(stringValue(server["serverId"]))
		if serverID == "" {
			serverID = strings.TrimSpace(stringValue(server["id"]))
		}
		if serverID == "" {
			continue
		}
		state := resolveCodexMCPRuntimeState(server)
		status := mcpx.ServerRuntimeStatus{
			ServerID:            serverID,
			Source:              externalMCPStatusSource,
			Transport:           resolveExternalTransport(server),
			Endpoint:            resolveExternalEndpoint(server),
			State:               state,
			ConsecutiveFailures: 0,
			ToolCount:           resolveExternalToolCount(server),
		}
		status.LastAttemptAt = cloneTimePtr(&now)
		if state == mcpx.RuntimeStateConnected {
			status.LastConnectedAt = cloneTimePtr(&now)
		}
		if state == mcpx.RuntimeStateError || state == mcpx.RuntimeStateRetrying {
			status.LastFailureAt = cloneTimePtr(&now)
			status.ConsecutiveFailures = 1
		}
		if lastError := resolveExternalLastError(server); lastError != nil {
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

func resolveCodexMCPRuntimeState(server map[string]any) mcpx.RuntimeState {
	if boolValue(server["connected"]) {
		return mcpx.RuntimeStateConnected
	}
	switch strings.ToLower(strings.TrimSpace(stringValue(server["state"]))) {
	case "connected":
		return mcpx.RuntimeStateConnected
	case "connecting":
		return mcpx.RuntimeStateConnecting
	case "retrying":
		return mcpx.RuntimeStateRetrying
	case "error", "failed":
		return mcpx.RuntimeStateError
	case "disabled":
		return mcpx.RuntimeStateDisabled
	}
	switch strings.ToLower(strings.TrimSpace(stringValue(server["status"]))) {
	case "connected":
		return mcpx.RuntimeStateConnected
	case "connecting":
		return mcpx.RuntimeStateConnecting
	case "retrying":
		return mcpx.RuntimeStateRetrying
	case "error", "failed":
		return mcpx.RuntimeStateError
	case "disabled":
		return mcpx.RuntimeStateDisabled
	}
	if resolveExternalLastError(server) != nil {
		return mcpx.RuntimeStateError
	}
	return mcpx.RuntimeStateUnknown
}

func resolveExternalTransport(server map[string]any) mcpx.Transport {
	switch strings.ToLower(strings.TrimSpace(stringValue(server["transport"]))) {
	case "sse":
		return mcpx.TransportSSE
	case "streamable_http", "streamable-http", "streamablehttp":
		return mcpx.TransportStreamableHTTP
	case "stdio":
		return mcpx.TransportStdio
	default:
		return mcpx.Transport(strings.TrimSpace(stringValue(server["transport"])))
	}
}

func resolveExternalEndpoint(server map[string]any) string {
	if endpoint := strings.TrimSpace(stringValue(server["endpoint"])); endpoint != "" {
		return endpoint
	}
	if url := strings.TrimSpace(stringValue(server["url"])); url != "" {
		return url
	}
	command := strings.TrimSpace(stringValue(server["command"]))
	args, ok := server["args"].([]any)
	if command == "" || !ok || len(args) == 0 {
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

func resolveExternalToolCount(server map[string]any) int {
	switch value := server["toolCount"].(type) {
	case int:
		return value
	case float64:
		return int(value)
	}
	if tools, ok := server["tools"].([]any); ok {
		return len(tools)
	}
	return 0
}

func resolveExternalLastError(server map[string]any) *string {
	if message := strings.TrimSpace(stringValue(server["error"])); message != "" {
		return stringPtr(message)
	}
	if rawError, ok := mapValue(server["error"]); ok {
		if message := strings.TrimSpace(stringValue(rawError["message"])); message != "" {
			return stringPtr(message)
		}
	}
	if message := strings.TrimSpace(stringValue(server["message"])); message != "" {
		return stringPtr(message)
	}
	return nil
}
