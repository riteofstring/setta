package chat

type turnSink struct {
	service        *Service
	workspaceID    string
	conversationID string
	runID          string
}

func (sink turnSink) AssistantTextDelta(providerItemID string, text string) error {
	return sink.service.appendAssistantDelta(sink.workspaceID, sink.conversationID, sink.runID, providerItemID, text)
}

func (sink turnSink) ApprovalRequested(approval ApprovalRequest) error {
	return sink.service.requestApproval(sink.workspaceID, sink.conversationID, sink.runID, approval)
}

func (sink turnSink) ApprovalResolved(approvalID string, approved bool, response string) error {
	return sink.service.resolveApproval(sink.workspaceID, sink.conversationID, sink.runID, approvalID, approved, response)
}

func (sink turnSink) ProviderDiagnostic(code string, message string, context map[string]string, resyncRequired bool, severity DiagnosticSeverity) error {
	return sink.service.recordProviderDiagnostic(sink.workspaceID, sink.conversationID, sink.runID, code, message, context, resyncRequired, severity)
}

func (sink turnSink) GoalUpdated(goal *ChatGoalState) error {
	return sink.service.updateGoalState(sink.workspaceID, sink.conversationID, sink.runID, goal)
}

func (sink turnSink) RunItemOutputDelta(providerItemID string, stream string, text string) error {
	return sink.service.appendRunItemOutput(sink.workspaceID, sink.conversationID, sink.runID, providerItemID, stream, text)
}

func (sink turnSink) RunItemUpsert(item RunItem) error {
	return sink.service.upsertRunItem(sink.workspaceID, sink.conversationID, sink.runID, item)
}

func (sink turnSink) CodexEffectiveSettingsUpdated(settings ChatCodexEffectiveSettings) error {
	return sink.service.updateCodexEffectiveSettings(sink.workspaceID, sink.conversationID, sink.runID, settings)
}

func (sink turnSink) ThreadLinked(threadID string, sessionID string, turnID string, settings *ChatCodexEffectiveSettings) error {
	return sink.service.linkThread(sink.workspaceID, sink.conversationID, sink.runID, threadID, sessionID, turnID, settings)
}

func (sink turnSink) UserMessageCommitted(text string) error {
	return sink.service.markPendingSteeringCommitted(sink.workspaceID, sink.conversationID, sink.runID, text)
}

func (sink turnSink) Trace(eventType string, message string) error {
	return sink.service.trace(sink.workspaceID, sink.runID, eventType, message)
}
