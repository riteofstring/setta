package httpapi

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"setta/internal/mcpx"
)

type MCPResolvedRuntimeServer struct {
	ServerID            string            `json:"serverId"`
	Transport           mcpx.Transport    `json:"transport"`
	Endpoint            string            `json:"endpoint"`
	State               mcpx.RuntimeState `json:"state"`
	LastAttemptAt       *time.Time        `json:"lastAttemptAt"`
	LastConnectedAt     *time.Time        `json:"lastConnectedAt"`
	LastFailureAt       *time.Time        `json:"lastFailureAt"`
	ConsecutiveFailures int               `json:"consecutiveFailures"`
	LastError           *string           `json:"lastError"`
	MissingEnvVar       *string           `json:"missingEnvVar"`
	ToolCount           int               `json:"toolCount"`
	QuickInfo           string            `json:"quickInfo"`
}

func resolveMCPRuntimeDisplayServers(
	settaServers []mcpx.ServerRuntimeStatus,
	externalServers []mcpx.ServerRuntimeStatus,
) []MCPResolvedRuntimeServer {
	settaByID := make(map[string]mcpx.ServerRuntimeStatus, len(settaServers))
	for _, status := range settaServers {
		serverID := strings.TrimSpace(status.ServerID)
		if serverID == "" {
			continue
		}
		settaByID[serverID] = status
	}
	externalByID := make(map[string]mcpx.ServerRuntimeStatus, len(externalServers))
	for _, status := range externalServers {
		serverID := strings.TrimSpace(status.ServerID)
		if serverID == "" {
			continue
		}
		externalByID[serverID] = status
	}
	serverIDs := make([]string, 0, len(settaByID)+len(externalByID))
	seen := make(map[string]struct{}, len(settaByID)+len(externalByID))
	for serverID := range settaByID {
		seen[serverID] = struct{}{}
		serverIDs = append(serverIDs, serverID)
	}
	for serverID := range externalByID {
		if _, ok := seen[serverID]; ok {
			continue
		}
		serverIDs = append(serverIDs, serverID)
	}
	sort.Strings(serverIDs)
	resolved := make([]MCPResolvedRuntimeServer, 0, len(serverIDs))
	for _, serverID := range serverIDs {
		settaStatus, hasSetta := settaByID[serverID]
		externalStatus, hasExternal := externalByID[serverID]
		switch {
		case hasSetta && hasExternal:
			resolved = append(
				resolved,
				mergeMCPRuntimeDisplayServer(settaStatus, externalStatus),
			)
		case hasSetta:
			resolved = append(resolved, resolvedMCPRuntimeServerFromStatus(settaStatus))
		case hasExternal:
			resolved = append(resolved, resolvedMCPRuntimeServerFromStatus(externalStatus))
		}
	}
	return resolved
}

func mergeMCPRuntimeDisplayServer(
	settaStatus mcpx.ServerRuntimeStatus,
	externalStatus mcpx.ServerRuntimeStatus,
) MCPResolvedRuntimeServer {
	stateStatus := pickDisplayStateStatus(settaStatus, externalStatus)
	transport := externalStatus.Transport
	if strings.TrimSpace(string(transport)) == "" {
		transport = settaStatus.Transport
	}
	endpoint := strings.TrimSpace(externalStatus.Endpoint)
	if endpoint == "" {
		endpoint = strings.TrimSpace(settaStatus.Endpoint)
	}
	toolCount := externalStatus.ToolCount
	if settaStatus.ToolCount > 0 {
		toolCount = settaStatus.ToolCount
	}
	resolved := MCPResolvedRuntimeServer{
		ServerID:            strings.TrimSpace(stateStatus.ServerID),
		Transport:           transport,
		Endpoint:            endpoint,
		State:               stateStatus.State,
		LastAttemptAt:       cloneResolvedTimePtr(stateStatus.LastAttemptAt),
		LastConnectedAt:     cloneResolvedTimePtr(stateStatus.LastConnectedAt),
		LastFailureAt:       cloneResolvedTimePtr(stateStatus.LastFailureAt),
		ConsecutiveFailures: stateStatus.ConsecutiveFailures,
		LastError:           cloneResolvedStringPtr(stateStatus.LastError),
		MissingEnvVar:       cloneResolvedStringPtr(stateStatus.MissingEnvVar),
		ToolCount:           toolCount,
	}
	resolved.QuickInfo = formatResolvedMCPQuickInfo(resolved)
	return resolved
}

func resolvedMCPRuntimeServerFromStatus(
	status mcpx.ServerRuntimeStatus,
) MCPResolvedRuntimeServer {
	resolved := MCPResolvedRuntimeServer{
		ServerID:            strings.TrimSpace(status.ServerID),
		Transport:           status.Transport,
		Endpoint:            strings.TrimSpace(status.Endpoint),
		State:               status.State,
		LastAttemptAt:       cloneResolvedTimePtr(status.LastAttemptAt),
		LastConnectedAt:     cloneResolvedTimePtr(status.LastConnectedAt),
		LastFailureAt:       cloneResolvedTimePtr(status.LastFailureAt),
		ConsecutiveFailures: status.ConsecutiveFailures,
		LastError:           cloneResolvedStringPtr(status.LastError),
		MissingEnvVar:       cloneResolvedStringPtr(status.MissingEnvVar),
		ToolCount:           status.ToolCount,
	}
	resolved.QuickInfo = formatResolvedMCPQuickInfo(resolved)
	return resolved
}

func pickDisplayStateStatus(
	settaStatus mcpx.ServerRuntimeStatus,
	externalStatus mcpx.ServerRuntimeStatus,
) mcpx.ServerRuntimeStatus {
	if externalStatus.State != mcpx.RuntimeStateUnknown {
		return externalStatus
	}
	return settaStatus
}

func formatResolvedMCPQuickInfo(status MCPResolvedRuntimeServer) string {
	details := make([]string, 0, 3)
	if status.MissingEnvVar != nil && strings.TrimSpace(*status.MissingEnvVar) != "" {
		details = append(details, fmt.Sprintf("missing env var %s", strings.TrimSpace(*status.MissingEnvVar)))
	}
	if status.LastError != nil && strings.TrimSpace(*status.LastError) != "" {
		details = append(details, strings.TrimSpace(*status.LastError))
	}
	details = append(details, fmt.Sprintf("%d tool%s", status.ToolCount, pluralSuffix(status.ToolCount)))
	detailSuffix := strings.Join(details, " | ")
	switch status.State {
	case mcpx.RuntimeStateConnected:
		return fmt.Sprintf("Connected: %s", detailSuffix)
	case mcpx.RuntimeStateConnecting:
		return fmt.Sprintf("Connecting: %s", detailSuffix)
	case mcpx.RuntimeStateRetrying:
		return fmt.Sprintf("Retrying: %s", detailSuffix)
	case mcpx.RuntimeStateError:
		return fmt.Sprintf("Error: %s", detailSuffix)
	case mcpx.RuntimeStateDisabled:
		return fmt.Sprintf("Disabled: %s", detailSuffix)
	default:
		return fmt.Sprintf("Unknown: %s", detailSuffix)
	}
}

func pluralSuffix(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}

func cloneResolvedTimePtr(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	cloned := value.UTC()
	return &cloned
}

func cloneResolvedStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
