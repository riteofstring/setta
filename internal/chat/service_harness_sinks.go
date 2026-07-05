package chat

func (service *Service) attachBackgroundTerminalSink(harness Harness) {
	// Harnesses that run background terminals on a long-lived provider connection
	// (Codex) receive the conversation-scoped sink that late unified-exec output
	// and completion update after the starting turn has finished.
	if attacher, ok := harness.(backgroundTerminalSinkAttacher); ok {
		attacher.SetBackgroundTerminalSink(service.backgroundTerminalSink())
	}
}

func (service *Service) attachConnectionDiagnosticSink(harness Harness) {
	if attacher, ok := harness.(connectionDiagnosticSinkAttacher); ok {
		attacher.SetConnectionDiagnosticSink(service.connectionDiagnosticSink())
	}
}
