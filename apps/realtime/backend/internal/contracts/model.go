package contracts

import "encoding/json"

const (
	ProjectVersion        = 1
	WorkerProtocolVersion = 1
)

type Project struct {
	Version       int                        `json:"version"`
	ID            string                     `json:"id"`
	Revision      uint64                     `json:"revision"`
	Name          string                     `json:"name"`
	Runtime       RuntimeDeclaration         `json:"runtime"`
	Sections      map[string]Section         `json:"sections"`
	Layout        Layout                     `json:"layout"`
	Bindings      []Binding                  `json:"bindings"`
	Configuration map[string]json.RawMessage `json:"configuration"`
}

type RuntimeDeclaration struct {
	Kind       string `json:"kind"`
	Entrypoint string `json:"entrypoint"`
}

type Section struct {
	ID                      string          `json:"id"`
	Kind                    string          `json:"kind"`
	Name                    string          `json:"name"`
	Width                   SizeValue       `json:"width"`
	Height                  SizeValue       `json:"height"`
	OverflowMode            bool            `json:"overflowMode"`
	PositionAndSizeLocked   bool            `json:"positionAndSizeLocked"`
	IsHorizontalOrientation bool            `json:"isHorizontalOrientation"`
	StyleColor              *string         `json:"styleColor"`
	TagColor                *string         `json:"tagColor"`
	Children                []string        `json:"children"`
	Data                    json.RawMessage `json:"data"`
}

type SizeValue struct {
	Auto  bool
	Value float64
}

func (value SizeValue) MarshalJSON() ([]byte, error) {
	if value.Auto {
		return json.Marshal("auto")
	}
	return json.Marshal(value.Value)
}

func (value *SizeValue) UnmarshalJSON(data []byte) error {
	var auto string
	if err := json.Unmarshal(data, &auto); err == nil {
		if auto != "auto" {
			return ErrInvalidSize
		}
		*value = SizeValue{Auto: true}
		return nil
	}
	var number float64
	if err := json.Unmarshal(data, &number); err != nil {
		return ErrInvalidSize
	}
	*value = SizeValue{Value: number}
	return nil
}

type Layout struct {
	TopLevelSections map[string]TopLevelSectionLayout `json:"topLevelSections"`
	Viewport         *Viewport                        `json:"viewport"`
}

type TopLevelSectionLayout struct {
	X      float64  `json:"x"`
	Y      float64  `json:"y"`
	Width  *float64 `json:"width"`
	Height *float64 `json:"height"`
	ZIndex int      `json:"zIndex"`
}

type Viewport struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type Binding struct {
	ID         string                     `json:"id"`
	Trigger    BindingTrigger             `json:"trigger"`
	Handler    string                     `json:"handler"`
	Arguments  map[string]json.RawMessage `json:"arguments"`
	Scheduling SchedulingPolicy           `json:"scheduling"`
	Outputs    map[string]BindingOutput   `json:"outputs"`
}

type BindingTrigger struct {
	SectionID string `json:"sectionId"`
	Event     string `json:"event"`
}

type SchedulingPolicy struct {
	Mode                 string `json:"mode"`
	DebounceMilliseconds uint64 `json:"debounceMilliseconds"`
	ConcurrencyGroup     string `json:"concurrencyGroup"`
	ConcurrencyLimit     int    `json:"concurrencyLimit"`
}

type BindingOutput struct {
	SectionID string `json:"sectionId"`
	Field     string `json:"field"`
}

type InputSectionData struct {
	InputKind string          `json:"inputKind"`
	Value     json.RawMessage `json:"value"`
	Label     string          `json:"label"`
}

type ButtonSectionData struct {
	Label string `json:"label"`
}

type OutputSectionData struct {
	Value json.RawMessage `json:"value"`
}

type StatusSectionData struct {
	Level   string `json:"level"`
	Message string `json:"message"`
}

type DrawingSectionData struct {
	Scene      json.RawMessage `json:"scene"`
	Width      int             `json:"width"`
	Height     int             `json:"height"`
	Background string          `json:"background"`
}

type CodeSectionData struct {
	Source string `json:"source"`
}

type ApplyRequest struct {
	ProjectID        string            `json:"projectId"`
	ExpectedRevision uint64            `json:"expectedRevision"`
	Operations       []json.RawMessage `json:"operations"`
}

type SetNameOperation struct {
	Operation string `json:"op"`
	Name      string `json:"name"`
}

type SetRuntimeOperation struct {
	Operation string             `json:"op"`
	Runtime   RuntimeDeclaration `json:"runtime"`
}

type UpsertSectionOperation struct {
	Operation string                 `json:"op"`
	Section   Section                `json:"section"`
	Layout    *TopLevelSectionLayout `json:"layout"`
}

type DeleteSectionOperation struct {
	Operation string `json:"op"`
	SectionID string `json:"sectionId"`
}

type SetBindingOperation struct {
	Operation string  `json:"op"`
	Binding   Binding `json:"binding"`
}

type DeleteBindingOperation struct {
	Operation string `json:"op"`
	BindingID string `json:"bindingId"`
}

type SetConfigurationOperation struct {
	Operation     string                     `json:"op"`
	Configuration map[string]json.RawMessage `json:"configuration"`
}

type SetViewportOperation struct {
	Operation string    `json:"op"`
	Viewport  *Viewport `json:"viewport"`
}

type ContentReference struct {
	ID           string `json:"id"`
	MediaType    string `json:"mediaType"`
	ByteLength   int64  `json:"byteLength"`
	SHA256       string `json:"sha256"`
	InvocationID string `json:"invocationId"`
}

type InvocationIdentity struct {
	SessionID    string `json:"sessionId"`
	BindingID    string `json:"bindingId"`
	InvocationID string `json:"invocationId"`
	Sequence     uint64 `json:"sequence"`
}

type InitializeParams struct {
	ProtocolVersion int    `json:"protocolVersion"`
	ProjectRoot     string `json:"projectRoot"`
	Entrypoint      string `json:"entrypoint"`
}

type InitializeResult struct {
	ProtocolVersion int              `json:"protocolVersion"`
	RuntimeKind     string           `json:"runtimeKind"`
	Handlers        []string         `json:"handlers"`
	LoadError       *StructuredError `json:"loadError"`
}

type InvokeParams struct {
	Identity  InvocationIdentity         `json:"identity"`
	Handler   string                     `json:"handler"`
	Arguments map[string]json.RawMessage `json:"arguments"`
	Content   []ContentReference         `json:"content"`
}

type InvokeResult struct {
	Outputs map[string]json.RawMessage `json:"outputs"`
	Error   *StructuredError           `json:"error"`
}

type RuntimeUpdate struct {
	Identity  InvocationIdentity         `json:"identity"`
	Progress  *float64                   `json:"progress"`
	Message   string                     `json:"message"`
	Outputs   map[string]json.RawMessage `json:"outputs"`
	Artifacts []WorkerArtifact           `json:"artifacts"`
}

type BrowserRuntimeUpdate struct {
	Identity InvocationIdentity         `json:"identity"`
	Progress *float64                   `json:"progress"`
	Message  string                     `json:"message"`
	Outputs  map[string]json.RawMessage `json:"outputs"`
}

type WorkerArtifact struct {
	Name      string `json:"name"`
	MediaType string `json:"mediaType"`
	Path      string `json:"path"`
}

type StructuredError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type RuntimeEvent struct {
	Type      string          `json:"type"`
	SessionID string          `json:"sessionId"`
	SectionID string          `json:"sectionId"`
	Event     string          `json:"event"`
	Payload   json.RawMessage `json:"payload"`
}

type RuntimeCancelRequest struct {
	Type     string             `json:"type"`
	Identity InvocationIdentity `json:"identity"`
}

type DirectInvokeRequest struct {
	Arguments map[string]json.RawMessage `json:"arguments"`
	Content   []ContentReference         `json:"content"`
}

type RuntimeSourceDocument struct {
	ProjectID  string `json:"projectId"`
	Entrypoint string `json:"entrypoint"`
	Version    string `json:"version"`
	Source     string `json:"source"`
}

type ApplyRuntimeSourceRequest struct {
	ProjectID       string `json:"projectId"`
	Entrypoint      string `json:"entrypoint"`
	ExpectedVersion string `json:"expectedVersion"`
	Source          string `json:"source"`
}

type ApplyRuntimeSourceResult struct {
	Source     RuntimeSourceDocument   `json:"source"`
	Activation RuntimeSourceActivation `json:"activation"`
}

type RuntimeSourceActivation struct {
	State string           `json:"state"`
	Error *StructuredError `json:"error"`
}

type RuntimeEnvelope struct {
	Type       string                `json:"type"`
	Snapshot   *RuntimeSnapshot      `json:"snapshot,omitempty"`
	Invocation *InvocationStatus     `json:"invocation,omitempty"`
	Update     *BrowserRuntimeUpdate `json:"update,omitempty"`
	Log        *RuntimeLog           `json:"log,omitempty"`
	Error      *StructuredError      `json:"error,omitempty"`
}

type RuntimeSnapshot struct {
	SessionID          string                        `json:"sessionId"`
	WorkerState        string                        `json:"workerState"`
	Values             map[string]json.RawMessage    `json:"values"`
	Invocations        map[string]InvocationStatus   `json:"invocations"`
	PublishedByBinding map[string]InvocationIdentity `json:"publishedByBinding"`
}

type InvocationStatus struct {
	Identity InvocationIdentity `json:"identity"`
	State    string             `json:"state"`
	Error    *StructuredError   `json:"error"`
}

type RuntimeLog struct {
	Stream string `json:"stream"`
	Text   string `json:"text"`
}
