package chat

import (
	"fmt"

	"setta/internal/codexapp"
)

type codexConnectionDiagnostic struct {
	code           string
	message        string
	context        map[string]string
	resyncRequired bool
	severity       DiagnosticSeverity
}

func (harness *CodexHarness) registerConnectionNotificationHandlers() {
	harness.manager.RegisterNotificationHandler(codexapp.CodexNotificationMcpServerStartupStatusUpdated, harness.handleConnectionMCPServerStartupStatusUpdated)
	harness.manager.RegisterNotificationHandler(codexapp.CodexNotificationRemoteControlStatusChanged, harness.handleConnectionRemoteControlStatusChanged)
	harness.manager.RegisterNotificationHandler(codexapp.CodexNotificationWindowsWorldWritableWarning, harness.handleConnectionWindowsWorldWritableWarning)
	harness.manager.RegisterNotificationHandler(codexapp.CodexNotificationWindowsSandboxSetupCompleted, harness.handleConnectionWindowsSandboxSetupCompleted)
}

func (harness *CodexHarness) SetConnectionDiagnosticSink(sink ConnectionDiagnosticSink) {
	harness.connectionDiagnosticMu.Lock()
	defer harness.connectionDiagnosticMu.Unlock()
	harness.connectionDiagnosticSink = sink
}

func (harness *CodexHarness) handleConnectionWindowsWorldWritableWarning(message codexapp.Message) {
	diagnostic, err := codexWindowsWorldWritableWarningDiagnostic(message)
	if err != nil {
		return
	}
	harness.recordConnectionProviderDiagnostic(diagnostic)
}

func (harness *CodexHarness) handleConnectionWindowsSandboxSetupCompleted(message codexapp.Message) {
	diagnostic, ok, _, err := codexWindowsSandboxSetupDiagnostic(message)
	if err != nil || !ok {
		return
	}
	harness.recordConnectionProviderDiagnostic(diagnostic)
}

func (harness *CodexHarness) handleConnectionRemoteControlStatusChanged(message codexapp.Message) {
	if _, err := codexRemoteControlStatusChangedTrace(message); err != nil {
		harness.recordConnectionProviderDiagnostic(codexInvalidConnectionNotificationDiagnostic(message.Method, err))
	}
}

func (harness *CodexHarness) handleConnectionMCPServerStartupStatusUpdated(message codexapp.Message) {
	if _, err := codexMCPServerStartupStatusTrace(message); err != nil {
		harness.recordConnectionProviderDiagnostic(codexInvalidConnectionNotificationDiagnostic(message.Method, err))
	}
}

func codexInvalidConnectionNotificationDiagnostic(method string, err error) codexConnectionDiagnostic {
	return codexConnectionDiagnostic{
		code:           "codex_connection_notification_invalid",
		message:        fmt.Sprintf("Invalid codex app-server notification %s: %v", method, err),
		context:        map[string]string{"method": method},
		resyncRequired: true,
		severity:       DiagnosticSeverityCritical,
	}
}

func (harness *CodexHarness) recordConnectionProviderDiagnostic(diagnostic codexConnectionDiagnostic) {
	sink, workspaceIDs := harness.connectionDiagnosticSnapshot()
	if sink == nil {
		return
	}
	for _, workspaceID := range workspaceIDs {
		_ = sink.ProviderConnectionDiagnostic(workspaceID, diagnostic.code, diagnostic.message, diagnostic.context, diagnostic.resyncRequired, diagnostic.severity)
	}
}

func (harness *CodexHarness) connectionDiagnosticSnapshot() (ConnectionDiagnosticSink, []string) {
	harness.connectionDiagnosticMu.Lock()
	sink := harness.connectionDiagnosticSink
	harness.connectionDiagnosticMu.Unlock()

	harness.mu.Lock()
	defer harness.mu.Unlock()

	workspaceIDs := make([]string, 0, len(harness.active))
	seen := map[string]struct{}{}
	for _, active := range harness.active {
		workspaceID := active.request.Workspace.ID
		if _, ok := seen[workspaceID]; ok {
			continue
		}
		seen[workspaceID] = struct{}{}
		workspaceIDs = append(workspaceIDs, workspaceID)
	}
	if len(workspaceIDs) == 0 {
		workspaceIDs = append(workspaceIDs, "")
	}
	return sink, workspaceIDs
}
