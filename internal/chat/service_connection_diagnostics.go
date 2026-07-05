package chat

type connectionDiagnosticSinkAttacher interface {
	SetConnectionDiagnosticSink(ConnectionDiagnosticSink)
}

type serviceConnectionDiagnosticSink struct {
	service *Service
}

func (service *Service) connectionDiagnosticSink() ConnectionDiagnosticSink {
	return serviceConnectionDiagnosticSink{service: service}
}

func (sink serviceConnectionDiagnosticSink) ProviderConnectionDiagnostic(workspaceID string, code string, message string, context map[string]string, resyncRequired bool, severity DiagnosticSeverity) error {
	return sink.service.recordProviderDiagnostic(workspaceID, "", "", code, message, context, resyncRequired, severity)
}
