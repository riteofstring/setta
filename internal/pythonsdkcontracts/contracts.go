package pythonsdkcontracts

import (
	"encoding/json"
	"reflect"
)

const GeneratedPythonModulePath = "backend/setta/sdk_contracts/generated.py"
const SDKContractVersion = 2

type RunnerSummaryVariant struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type RunnerSummaryParam struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	DisplayName *string `json:"displayName,omitempty"`
}

type RunnerSummarySection struct {
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	DisplayName    *string                `json:"displayName,omitempty"`
	SupportsParams bool                   `json:"supportsParams" py_default:"False"`
	Variants       []RunnerSummaryVariant `json:"variants" py_default:"factory:list"`
	Params         []RunnerSummaryParam   `json:"params" py_default:"factory:list"`
}

type RunnerSummarySnapshot struct {
	ProjectConfigID string                 `json:"projectConfigId"`
	Sections        []RunnerSummarySection `json:"sections" py_default:"factory:list"`
}

type ListenerDependencyCatalogEntry struct {
	DependencyKey              string   `json:"dependencyKey" py_type:"BaseDependencyKeyUnion" py_import:"from setta.types.generated.go_shared_types import BaseDependencyKeyUnion"`
	Name                       string   `json:"name"`
	FullPathName               string   `json:"fullPathName"`
	Dependencies               []string `json:"dependencies" py_type:"list[BaseDependencyKeyUnion]" py_import:"from setta.types.generated.go_shared_types import BaseDependencyKeyUnion" py_default:"factory:list"`
	IncludeInCodegen           bool     `json:"includeInCodegen" py_default:"True"`
	SectionType                *string  `json:"sectionType,omitempty"`
	CodeObjType                *string  `json:"codeObjType,omitempty"`
	PassingStyle               *string  `json:"passingStyle,omitempty"`
	ControlCodeObjID           *string  `json:"controlCodeObjId,omitempty"`
	ControlCodeObjType         *string  `json:"controlCodeObjType,omitempty"`
	SectionRepresentation      *string  `json:"sectionRepresentation,omitempty"`
	ControlValueRepresentation *string  `json:"controlValueRepresentation,omitempty"`
	ValueRepresentation        *string  `json:"valueRepresentation,omitempty"`
}

type ListenerDependencyCatalog struct {
	Entries []ListenerDependencyCatalogEntry `json:"entries" py_default:"factory:list"`
}

type ListenerRenderedDependencyValue struct {
	DependencyKey string `json:"dependencyKey" py_type:"BaseDependencyKeyUnion" py_import:"from setta.types.generated.go_shared_types import BaseDependencyKeyUnion"`
	RenderedValue string `json:"renderedValue"`
}

type ListenerRenderedDependencyValues struct {
	Entries []ListenerRenderedDependencyValue `json:"entries" py_default:"factory:list"`
}

type ListenerSnapshot struct {
	ProjectConfigID   string                           `json:"projectConfigId"`
	ShareSessionID    *string                          `json:"shareSessionId,omitempty"`
	DependencyCatalog ListenerDependencyCatalog        `json:"dependencyCatalog"`
	DependencyValues  ListenerRenderedDependencyValues `json:"dependencyValues"`
}

type ListenerForceRefreshEvent struct {
	CallID      *string          `json:"callId,omitempty"`
	Snapshot    ListenerSnapshot `json:"snapshot"`
	Sequence    *uint64          `json:"sequence,omitempty"`
	RefreshKind *string          `json:"refreshKind,omitempty" py_type:"Literal[\"bootstrap\", \"force_refresh\"] | None"`
}

type ListenerInitRequest struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty" py_type:"str | None" py_default:"None"`
	ProjectName     *string `json:"projectName,omitempty"`
	UseTemporaryIDs bool    `json:"useTemporaryIds" py_default:"False"`
}

type ListenerRegisterCallbackSpec struct {
	Dependencies   []string `json:"dependencies" py_type:"list[BaseDependencyKeyUnion]" py_import:"from setta.types.generated.go_shared_types import BaseDependencyKeyUnion" py_default:"factory:list"`
	DependencyMode string   `json:"dependencyMode" py_type:"Literal[\"refresh_only\", \"realtime_only\", \"always\"]"`
	DebounceMS     *int     `json:"debounceMs,omitempty"`
	ThrottleMS     *int     `json:"throttleMs,omitempty"`
	RunOnRefresh   bool     `json:"runOnRefresh" py_default:"False"`
}

type ListenerRegisterRequest struct {
	ProjectConfigID string                                  `json:"projectConfigId"`
	Callbacks       map[string]ListenerRegisterCallbackSpec `json:"callbacks" py_default:"factory:dict"`
}

type ListenerRegisterAckStatus struct {
	Status  string  `json:"status" py_type:"Literal[\"accepted\", \"rejected\"]"`
	Message *string `json:"message,omitempty"`
}

type ListenerRegisterAckEvent struct {
	ProjectConfigID string                               `json:"projectConfigId"`
	ShareSessionID  *string                              `json:"shareSessionId,omitempty"`
	Callbacks       map[string]ListenerRegisterAckStatus `json:"callbacks" py_default:"factory:dict"`
}

type ListenerErrorEvent struct {
	Error   string         `json:"error"`
	Details map[string]any `json:"details,omitempty" py_type:"dict[str, Any]" py_default:"factory:dict"`
}

type ListenerFrontendEmitRequest struct {
	ProjectConfigID  string            `json:"projectConfigId"`
	DependencyValues map[string]any    `json:"dependencyValues,omitempty" py_type:"dict[str, Any]" py_default:"factory:dict"`
	ArtifactUpdates  []json.RawMessage `json:"artifactUpdates,omitempty" py_type:"list[BaseArtifactUnion]" py_import:"from setta.types.generated.go_shared_types import BaseArtifactUnion" py_default:"factory:list"`
}

type ListenerRouterEndpointCall struct {
	ProjectConfigID string         `json:"projectConfigId"`
	CallID          string         `json:"callId"`
	EndpointName    string         `json:"endpointName"`
	Payload         map[string]any `json:"payload" py_type:"dict[str, Any]" py_default:"factory:dict"`
}

type ListenerRouterEndpointResult struct {
	ProjectConfigID string         `json:"projectConfigId"`
	CallID          string         `json:"callId"`
	OK              bool           `json:"ok"`
	Result          any            `json:"result,omitempty" py_type:"Any | None" py_default:"None"`
	Error           *string        `json:"error,omitempty"`
	Details         map[string]any `json:"details,omitempty" py_type:"dict[str, Any]" py_default:"factory:dict"`
}

type ListenerRealtimeDelta struct {
	Dependency string          `json:"dependency" py_type:"BaseDependencyKeyUnion" py_import:"from setta.types.generated.go_shared_types import BaseDependencyKeyUnion"`
	Value      json.RawMessage `json:"value" py_type:"BaseDependencyValueUnion" py_import:"from setta.types.generated.go_shared_types import BaseDependencyValueUnion"`
}

type ListenerRealtimeEvent struct {
	ProjectConfigID  string                            `json:"projectConfigId"`
	ShareSessionID   *string                           `json:"shareSessionId,omitempty"`
	Deltas           []ListenerRealtimeDelta           `json:"deltas" py_default:"factory:list"`
	DependencyValues *ListenerRenderedDependencyValues `json:"dependencyValues,omitempty"`
	Sequence         uint64                            `json:"sequence"`
}

type ListenerDependencyEventEntry struct {
	DependencyKey string          `json:"dependencyKey" py_type:"BaseDependencyKeyUnion" py_import:"from setta.types.generated.go_shared_types import BaseDependencyKeyUnion"`
	Payload       json.RawMessage `json:"payload,omitempty" py_type:"BaseDependencyValueUnion | None" py_import:"from setta.types.generated.go_shared_types import BaseDependencyValueUnion" py_default:"None"`
	TimestampMS   int64           `json:"timestampMs"`
}

type ListenerDependencyEvent struct {
	ProjectConfigID  string                         `json:"projectConfigId"`
	ShareSessionID   *string                        `json:"shareSessionId,omitempty"`
	DependencyEvents []ListenerDependencyEventEntry `json:"dependencyEvents" py_default:"factory:list"`
	Sequence         uint64                         `json:"sequence"`
}

type RunningBackendVersionHandshake struct {
	SDKVersion         string `json:"sdkVersion"`
	CoreVersion        string `json:"coreVersion"`
	SDKContractVersion int    `json:"sdkContractVersion"`
}

type LocalCoreVersionHandshake struct {
	ProtocolVersion    int     `json:"protocolVersion"`
	SDKVersion         *string `json:"sdkVersion,omitempty"`
	CoreVersion        *string `json:"coreVersion,omitempty"`
	SDKContractVersion int     `json:"sdkContractVersion"`
}

type LocalCoreCommandEnvelope struct {
	CallID      string         `json:"callId"`
	CommandName string         `json:"commandName"`
	Payload     map[string]any `json:"payload" py_type:"dict[str, Any]" py_default:"factory:dict"`
}

type LocalCoreResultEnvelope struct {
	CallID  string         `json:"callId"`
	OK      bool           `json:"ok"`
	Result  any            `json:"result,omitempty" py_type:"Any | None" py_default:"None"`
	Error   *string        `json:"error,omitempty"`
	Details map[string]any `json:"details,omitempty" py_type:"dict[str, Any]" py_default:"factory:dict"`
}

type LocalCoreListenerRealtimeDelta struct {
	Dependency          string          `json:"dependency" py_type:"BaseDependencyKeyUnion" py_import:"from setta.types.generated.go_shared_types import BaseDependencyKeyUnion"`
	Value               json.RawMessage `json:"value" py_type:"BaseDependencyValueUnion" py_import:"from setta.types.generated.go_shared_types import BaseDependencyValueUnion"`
	BinaryPayloadBase64 *string         `json:"binaryPayloadBase64,omitempty"`
}

type LocalCoreRenderRealtimeDependencyValuesRequest struct {
	DependencyCatalog       ListenerDependencyCatalog        `json:"dependencyCatalog"`
	CurrentDependencyValues ListenerRenderedDependencyValues `json:"currentDependencyValues"`
	Deltas                  []LocalCoreListenerRealtimeDelta `json:"deltas" py_default:"factory:list"`
}

type LocalCoreRenderRealtimeDependencyValuesResult struct {
	DependencyValues ListenerRenderedDependencyValues `json:"dependencyValues"`
}

func currentContractTypes() []reflect.Type {
	return discoveredContractTypes()
}
