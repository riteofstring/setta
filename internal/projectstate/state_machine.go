package projectstate

import (
	"errors"
	"strings"

	"setta/internal/prompttemplates"
)

const (
	StateMachineEdgeSourcePortID = "workflow-source"
	StateMachineEdgeTargetPortID = "workflow-target"
)

var (
	ErrStateMachineEdgeInvalid     = errors.New("state machine edge is invalid")
	ErrStateMachineEdgeNotFound    = errors.New("state machine edge was not found in project")
	ErrStateMachineEdgeDuplicateID = errors.New("state machine edge id already exists in project")
	ErrStateMachineSectionRequired = errors.New("section must resolve to a state machine section")
	ErrStateMachineGateTypeInvalid = errors.New("state machine gate type is invalid")

	stateMachineConnectionSourceTypes = []FrontendSectionType{
		FrontendSectionTypeChat,
		FrontendSectionTypeStateMachineStart,
		FrontendSectionTypeStateMachineGate,
	}
	stateMachineConnectionTargetTypes = []FrontendSectionType{
		FrontendSectionTypeChat,
		FrontendSectionTypeStateMachineGate,
		FrontendSectionTypeStateMachineEnd,
	}
	stateMachineSelfLoopSectionTypes = []FrontendSectionType{
		FrontendSectionTypeChat,
	}
)

type StateMachineGateType string

const (
	StateMachineGateTypeAND StateMachineGateType = "AND"
	StateMachineGateTypeOR  StateMachineGateType = "OR"
	StateMachineGateTypeXOR StateMachineGateType = "XOR"
)

type StateMachineTargetActionType string

const (
	StateMachineTargetActionTypeSendPrompt  StateMachineTargetActionType = "send_prompt"
	StateMachineTargetActionTypeResetThread StateMachineTargetActionType = "reset_thread"
)

type StateMachineThreadStrategy string

const (
	StateMachineThreadStrategyContinueCurrentThread StateMachineThreadStrategy = "continue_current_thread"
	StateMachineThreadStrategyNewThreadBeforeSend   StateMachineThreadStrategy = "new_thread_before_send"
)

type StateMachineSourceFilterType string

const (
	StateMachineSourceFilterTypeRunCompleted StateMachineSourceFilterType = "run_completed"
	StateMachineSourceFilterTypeRunFailed    StateMachineSourceFilterType = "run_failed"
	StateMachineSourceFilterTypeSignal       StateMachineSourceFilterType = "signal"
)

type StateMachineCountOperator string

const (
	StateMachineCountOperatorLT  StateMachineCountOperator = "lt"
	StateMachineCountOperatorLTE StateMachineCountOperator = "lte"
	StateMachineCountOperatorEQ  StateMachineCountOperator = "eq"
	StateMachineCountOperatorGTE StateMachineCountOperator = "gte"
	StateMachineCountOperatorGT  StateMachineCountOperator = "gt"
)

type StateMachinePromptSourceType string

const (
	StateMachinePromptSourceTypeInline         StateMachinePromptSourceType = "inline_prompt"
	StateMachinePromptSourceTypePromptTemplate StateMachinePromptSourceType = "prompt_template"
	StateMachinePromptSourceTypePromptSection  StateMachinePromptSourceType = "prompt_section"
)

type StateMachineGateUIState struct {
	ShowDetails bool `json:"showDetails" ts_optional:"true"`
}

type StateMachineSourceFilter struct {
	Type         StateMachineSourceFilterType `json:"type" ts_optional:"true"`
	SignalName   *string                      `json:"signalName,omitempty"`
	PayloadField *string                      `json:"payloadField,omitempty"`
	Equals       *string                      `json:"equals,omitempty"`
}

type StateMachineSourceActivationCountCondition struct {
	Operator StateMachineCountOperator `json:"operator" ts_optional:"true"`
	Value    int                       `json:"value"`
}

type StateMachineTargetAction struct {
	Type             StateMachineTargetActionType `json:"type" ts_optional:"true"`
	PromptTemplateID *string                      `json:"promptTemplateId,omitempty"`
	PromptSectionID  *string                      `json:"promptSectionId,omitempty"`
	InlinePrompt     *string                      `json:"inlinePrompt,omitempty"`
	PromptInputs     map[string]string            `json:"promptInputs,omitempty"`
	ThreadStrategy   StateMachineThreadStrategy   `json:"threadStrategy" ts_optional:"true"`
	StopIfRunning    bool                         `json:"stopIfRunning,omitempty"`
	EngineConfigID   *string                      `json:"engineConfigId,omitempty"`
	AgentProfileID   *string                      `json:"agentProfileId,omitempty"`
	PermissionMode   *string                      `json:"permissionMode,omitempty"`
	SearchEnabled    *bool                        `json:"searchEnabled,omitempty"`
}

type StateMachineEdge struct {
	ID                             string                                      `json:"id"`
	MachineGroupID                 string                                      `json:"machineGroupId"`
	SourceSectionID                string                                      `json:"sourceSectionId"`
	SourcePortID                   string                                      `json:"sourcePortId"`
	TargetSectionID                string                                      `json:"targetSectionId"`
	TargetPortID                   string                                      `json:"targetPortId"`
	SourceFilter                   *StateMachineSourceFilter                   `json:"sourceFilter,omitempty"`
	SourceActivationCountCondition *StateMachineSourceActivationCountCondition `json:"sourceActivationCountCondition,omitempty"`
	TargetAction                   *StateMachineTargetAction                   `json:"targetAction,omitempty"`
	Style                          RawJSON                                     `json:"style,omitempty" ts_type:"Record<string, unknown> | null"`
	Hidden                         bool                                        `json:"hidden,omitempty"`
	ZIndex                         int                                         `json:"zIndex,omitempty"`
	Selected                       bool                                        `json:"selected,omitempty"`
}

type StateMachineSectionSettings struct {
	MachineGroupID string                `json:"machineGroupId"`
	Label          string                `json:"label"`
	GateType       *StateMachineGateType `json:"gateType,omitempty"`
}

type StateMachinePromptTemplateLookup interface {
	Get(templateID string) (prompttemplates.Template, error)
}

type stateMachineEdgeEndpoint struct {
	sectionID   string
	sectionType string
	payload     map[string]any
}

func (s StateMachineGateUIState) Clone() StateMachineGateUIState {
	return s
}

func (f *StateMachineSourceFilter) Clone() *StateMachineSourceFilter {
	if f == nil {
		return nil
	}
	cloned := *f
	cloned.SignalName = cloneStringPointer(f.SignalName)
	cloned.PayloadField = cloneStringPointer(f.PayloadField)
	cloned.Equals = cloneStringPointer(f.Equals)
	return &cloned
}

func (c *StateMachineSourceActivationCountCondition) Clone() *StateMachineSourceActivationCountCondition {
	if c == nil {
		return nil
	}
	cloned := *c
	return &cloned
}

func (a *StateMachineTargetAction) Clone() *StateMachineTargetAction {
	if a == nil {
		return nil
	}
	cloned := *a
	cloned.PromptTemplateID = cloneStringPointer(a.PromptTemplateID)
	cloned.PromptSectionID = cloneStringPointer(a.PromptSectionID)
	cloned.InlinePrompt = cloneStringPointer(a.InlinePrompt)
	cloned.PromptInputs = cloneStateMachinePromptInputs(a.PromptInputs)
	cloned.EngineConfigID = cloneStringPointer(a.EngineConfigID)
	cloned.AgentProfileID = cloneStringPointer(a.AgentProfileID)
	cloned.PermissionMode = cloneStringPointer(a.PermissionMode)
	cloned.SearchEnabled = cloneBoolPointer(a.SearchEnabled)
	return &cloned
}

func (e StateMachineEdge) Clone() StateMachineEdge {
	cloned := e
	cloned.SourceFilter = e.SourceFilter.Clone()
	cloned.SourceActivationCountCondition = e.SourceActivationCountCondition.Clone()
	cloned.TargetAction = e.TargetAction.Clone()
	cloned.Style = cloneRawJSON(e.Style)
	return cloned
}

func (e StateMachineEdge) Normalized() (StateMachineEdge, error) {
	normalized := StateMachineEdge{
		ID:              strings.TrimSpace(e.ID),
		MachineGroupID:  e.MachineGroupID,
		SourceSectionID: strings.TrimSpace(e.SourceSectionID),
		SourcePortID:    strings.TrimSpace(e.SourcePortID),
		TargetSectionID: strings.TrimSpace(e.TargetSectionID),
		TargetPortID:    strings.TrimSpace(e.TargetPortID),
		Hidden:          e.Hidden,
		ZIndex:          e.ZIndex,
		Selected:        e.Selected,
	}

	var err error
	normalized.Style, err = normalizeRawJSON(e.Style, "state machine edge style")
	if err != nil {
		return StateMachineEdge{}, err
	}

	if e.SourceFilter != nil {
		sourceFilter, normalizeErr := normalizeStateMachineSourceFilter(*e.SourceFilter)
		if normalizeErr != nil {
			return StateMachineEdge{}, normalizeErr
		}
		normalized.SourceFilter = &sourceFilter
	}
	if e.SourceActivationCountCondition != nil {
		condition, normalizeErr := normalizeStateMachineSourceActivationCountCondition(*e.SourceActivationCountCondition)
		if normalizeErr != nil {
			return StateMachineEdge{}, normalizeErr
		}
		normalized.SourceActivationCountCondition = &condition
	}
	if e.TargetAction != nil {
		targetAction, normalizeErr := normalizeStateMachineTargetAction(*e.TargetAction)
		if normalizeErr != nil {
			return StateMachineEdge{}, normalizeErr
		}
		normalized.TargetAction = &targetAction
	}

	return normalized, nil
}

func normalizeStateMachineSourceFilter(filter StateMachineSourceFilter) (StateMachineSourceFilter, error) {
	normalized := StateMachineSourceFilter{
		Type:         filter.Type,
		SignalName:   cloneStringPointer(filter.SignalName),
		PayloadField: cloneStringPointer(filter.PayloadField),
		Equals:       cloneStringPointer(filter.Equals),
	}
	if strings.TrimSpace(string(normalized.Type)) == "" {
		normalized.Type = StateMachineSourceFilterTypeRunCompleted
	}
	return normalized, nil
}

func normalizeStateMachineSourceActivationCountCondition(
	condition StateMachineSourceActivationCountCondition,
) (StateMachineSourceActivationCountCondition, error) {
	normalized := condition
	if strings.TrimSpace(string(normalized.Operator)) == "" {
		normalized.Operator = StateMachineCountOperatorEQ
	}
	return normalized, nil
}

func normalizeStateMachineTargetAction(action StateMachineTargetAction) (StateMachineTargetAction, error) {
	normalized := StateMachineTargetAction{
		Type:             action.Type,
		PromptTemplateID: normalizeOptionalTrimmedStringPointer(action.PromptTemplateID),
		PromptSectionID:  normalizeOptionalTrimmedStringPointer(action.PromptSectionID),
		InlinePrompt:     cloneStringPointer(action.InlinePrompt),
		PromptInputs:     cloneStateMachinePromptInputs(action.PromptInputs),
		ThreadStrategy:   action.ThreadStrategy,
		StopIfRunning:    action.StopIfRunning,
		EngineConfigID:   normalizeOptionalTrimmedStringPointer(action.EngineConfigID),
		AgentProfileID:   normalizeOptionalTrimmedStringPointer(action.AgentProfileID),
		PermissionMode:   normalizeOptionalTrimmedStringPointer(action.PermissionMode),
		SearchEnabled:    cloneBoolPointer(action.SearchEnabled),
	}
	if strings.TrimSpace(string(normalized.Type)) == "" {
		normalized.Type = StateMachineTargetActionTypeSendPrompt
	}
	if strings.TrimSpace(string(normalized.ThreadStrategy)) == "" {
		normalized.ThreadStrategy = StateMachineThreadStrategyContinueCurrentThread
	}
	return normalized, nil
}

func cloneStateMachinePromptInputs(input map[string]string) map[string]string {
	if len(input) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func cloneBoolPointer(value *bool) *bool {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func normalizeOptionalTrimmedStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func createdStateMachineStartSectionDefaults(machineGroupID string) map[string]any {
	defaults := createdBaseSectionDefaults("StateMachineStart")
	defaults["size"] = map[string]any{"width": 240.0, "height": 96.0}
	defaults["machineGroupId"] = machineGroupID
	defaults["label"] = "Start"
	defaults["maxIterations"] = nil
	return defaults
}

func createdStateMachineGateSectionDefaults(machineGroupID string) map[string]any {
	defaults := createdBaseSectionDefaults("StateMachineGate")
	defaults["size"] = map[string]any{"width": 240.0, "height": 120.0}
	defaults["machineGroupId"] = machineGroupID
	defaults["gateType"] = string(StateMachineGateTypeAND)
	defaults["label"] = ""
	defaults["ui"] = map[string]any{"showDetails": false}
	return defaults
}

func createdStateMachineEndSectionDefaults(machineGroupID string) map[string]any {
	defaults := createdBaseSectionDefaults("StateMachineEnd")
	defaults["size"] = map[string]any{"width": 240.0, "height": 96.0}
	defaults["machineGroupId"] = machineGroupID
	defaults["label"] = "End"
	return defaults
}
