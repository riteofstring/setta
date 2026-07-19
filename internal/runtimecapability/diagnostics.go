package runtimecapability

type DiagnosticStatus string

const (
	DiagnosticStatusOK          DiagnosticStatus = "ok"
	DiagnosticStatusFailing     DiagnosticStatus = "failing"
	DiagnosticStatusUnavailable DiagnosticStatus = "unavailable"
	DiagnosticStatusUnknown     DiagnosticStatus = "unknown"
)

var diagnosticStatusValues = []DiagnosticStatus{
	DiagnosticStatusOK,
	DiagnosticStatusFailing,
	DiagnosticStatusUnavailable,
	DiagnosticStatusUnknown,
}

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "DiagnosticStatus", Values: stringValues(diagnosticStatusValues)},
	}
}

type RuntimeDiagnostics struct {
	SettaRelease   SettaReleaseDiagnostic   `json:"settaRelease"`
	Codex          CodexDiagnostic          `json:"codex"`
	WorkloadLease  WorkloadLeaseDiagnostic  `json:"workloadLease"`
	Policy         PolicyDiagnostic         `json:"policy"`
	DiskSpace      DiskSpaceDiagnostic      `json:"diskSpace"`
	ProtectedState ProtectedStateDiagnostic `json:"protectedState"`
}

type SettaReleaseDiagnostic struct {
	Status           DiagnosticStatus `json:"status"`
	RuntimeVersion   string           `json:"runtimeVersion"`
	MetadataPresent  bool             `json:"metadataPresent"`
	MetadataValid    bool             `json:"metadataValid"`
	InstalledVersion string           `json:"installedVersion"`
	ReasonCode       string           `json:"reasonCode"`
}

type CodexDiagnostic struct {
	Status         DiagnosticStatus              `json:"status"`
	Binary         CodexBinaryDiagnostic         `json:"binary"`
	Authentication CodexAuthenticationDiagnostic `json:"authentication"`
}

type CodexBinaryDiagnostic struct {
	Status     DiagnosticStatus `json:"status"`
	Command    string           `json:"command"`
	Present    bool             `json:"present"`
	ReasonCode string           `json:"reasonCode"`
}

type CodexAuthenticationDiagnostic struct {
	Status             DiagnosticStatus `json:"status"`
	AccountStatus      string           `json:"accountStatus"`
	AccountType        string           `json:"accountType"`
	RequiresOpenAIAuth bool             `json:"requiresOpenaiAuth"`
	LoginStatus        string           `json:"loginStatus"`
	ReasonCode         string           `json:"reasonCode"`
}

type WorkloadLeaseDiagnostic struct {
	Status     DiagnosticStatus `json:"status"`
	Configured bool             `json:"configured"`
	LeaseName  string           `json:"leaseName"`
	Active     bool             `json:"active"`
	StartedAt  string           `json:"startedAt"`
	ExpiresAt  string           `json:"expiresAt"`
	ReasonCode string           `json:"reasonCode"`
}

type PolicyDiagnostic struct {
	Status        DiagnosticStatus `json:"status"`
	Configured    bool             `json:"configured"`
	Present       bool             `json:"present"`
	SchemaVersion int              `json:"schemaVersion"`
	RuleCount     int              `json:"ruleCount"`
	ReasonCode    string           `json:"reasonCode"`
}

type DiskSpaceDiagnostic struct {
	Status         DiagnosticStatus `json:"status"`
	AvailableMiB   int              `json:"availableMib"`
	TotalMiB       int              `json:"totalMib"`
	MinimumFreeMiB int              `json:"minimumFreeMib"`
	ReasonCode     string           `json:"reasonCode"`
}

type ProtectedStateDiagnostic struct {
	Status            DiagnosticStatus `json:"status"`
	Present           bool             `json:"present"`
	Directory         bool             `json:"directory"`
	OwnerOnlyWritable bool             `json:"ownerOnlyWritable"`
	ReasonCode        string           `json:"reasonCode"`
}

func RuntimeDiagnosticsUnavailable(reasonCode string) RuntimeDiagnostics {
	return RuntimeDiagnostics{
		SettaRelease: SettaReleaseDiagnostic{
			Status:     DiagnosticStatusUnavailable,
			ReasonCode: reasonCode,
		},
		Codex: CodexDiagnostic{
			Status: DiagnosticStatusUnavailable,
			Binary: CodexBinaryDiagnostic{
				Status:     DiagnosticStatusUnavailable,
				ReasonCode: reasonCode,
			},
			Authentication: CodexAuthenticationDiagnostic{
				Status:     DiagnosticStatusUnavailable,
				ReasonCode: reasonCode,
			},
		},
		WorkloadLease: WorkloadLeaseDiagnostic{
			Status:     DiagnosticStatusUnavailable,
			ReasonCode: reasonCode,
		},
		Policy: PolicyDiagnostic{
			Status:     DiagnosticStatusUnavailable,
			ReasonCode: reasonCode,
		},
		DiskSpace: DiskSpaceDiagnostic{
			Status:     DiagnosticStatusUnavailable,
			ReasonCode: reasonCode,
		},
		ProtectedState: ProtectedStateDiagnostic{
			Status:     DiagnosticStatusUnavailable,
			ReasonCode: reasonCode,
		},
	}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}
