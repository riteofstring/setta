package semanticgraph

type SemanticNodeUsefulness struct {
	WhyItExists                  string                             `json:"whyItExists"`
	FutureUse                    string                             `json:"futureUse"`
	SourceCoverage               string                             `json:"sourceCoverage"`
	RetrievalUseCount            int                                `json:"retrievalUseCount"`
	LastDeliveredInContextPackAt string                             `json:"lastDeliveredInContextPackAt"`
	LastUserOpenedAt             string                             `json:"lastUserOpenedAt"`
	LastUserPromotedAt           string                             `json:"lastUserPromotedAt"`
	DismissalReason              string                             `json:"dismissalReason"`
	Diagnostics                  []SemanticNodeUsefulnessDiagnostic `json:"diagnostics"`
}

type SemanticNodeUsefulnessDiagnostic struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
}
