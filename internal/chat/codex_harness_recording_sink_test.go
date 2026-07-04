package chat

type recordingSink struct {
	approvalCh  chan ApprovalRequest
	diagnostics []recordedProviderDiagnostic
	goals       []*ChatGoalState
	items       []RunItem
	linkCh      chan struct{}
	linkCount   int
	outputs     []recordedOutput
	settings    []ChatCodexEffectiveSettings
	text        string
	threadID    string
	traces      []recordedTrace
	turnErrors  []ProviderTurnError
	turnID      string
}

type codexTurnResult struct {
	completion TurnCompletion
	err        error
}

type recordedOutput struct {
	itemID string
	stream string
	text   string
}

type recordedProviderDiagnostic struct {
	code           string
	context        map[string]string
	message        string
	resyncRequired bool
	severity       DiagnosticSeverity
}

type recordedTrace struct {
	traceType string
	message   string
}

func (sink *recordingSink) AssistantTextDelta(_ string, text string) error {
	sink.text += text
	return nil
}

func (sink *recordingSink) ApprovalRequested(approval ApprovalRequest) error {
	sink.approvalCh <- approval
	return nil
}

func (sink *recordingSink) ApprovalResolved(string, bool, string) error {
	return nil
}

func (sink *recordingSink) ProviderDiagnostic(code string, message string, context map[string]string, resyncRequired bool, severity DiagnosticSeverity) error {
	sink.diagnostics = append(sink.diagnostics, recordedProviderDiagnostic{
		code:           code,
		context:        context,
		message:        message,
		resyncRequired: resyncRequired,
		severity:       severity,
	})
	return nil
}

func (sink *recordingSink) ProviderTurnError(providerError ProviderTurnError) error {
	sink.turnErrors = append(sink.turnErrors, providerError)
	return nil
}

func (sink *recordingSink) GoalUpdated(goal *ChatGoalState) error {
	sink.goals = append(sink.goals, goal)
	return nil
}

func (sink *recordingSink) CodexEffectiveSettingsUpdated(settings ChatCodexEffectiveSettings) error {
	sink.settings = append(sink.settings, settings)
	return nil
}

func (sink *recordingSink) RunItemOutputDelta(itemID string, stream string, text string) error {
	sink.outputs = append(sink.outputs, recordedOutput{itemID: itemID, stream: stream, text: text})
	return nil
}

func (sink *recordingSink) RunItemUpsert(item RunItem) error {
	sink.items = append(sink.items, item)
	return nil
}

func (sink *recordingSink) ThreadLinked(threadID string, _ string, turnID string, settings *ChatCodexEffectiveSettings) error {
	sink.linkCount++
	sink.threadID = threadID
	sink.turnID = turnID
	if settings != nil {
		sink.settings = append(sink.settings, *settings)
	}
	sink.linkCh <- struct{}{}
	return nil
}

func (sink *recordingSink) UserMessageCommitted(string) error {
	return nil
}

func (sink *recordingSink) Trace(traceType string, message string) error {
	sink.traces = append(sink.traces, recordedTrace{traceType: traceType, message: message})
	return nil
}
