package projectstate

import (
	"context"
	"errors"
	"fmt"
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

func (d *Document) CreateStateMachineEdge(
	projectID string,
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if _, err := project.CreateStateMachineEdge(edge, templates); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) CreateStateMachineEdge(
	ctx context.Context,
	projectID string,
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.CreateStateMachineEdge(projectID, edge, templates); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) CreateStateMachineEdge(
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) (StateMachineEdge, error) {
	if p == nil {
		return StateMachineEdge{}, ErrProjectNotFound
	}
	normalized, err := normalizeStateMachineEdgeForCreate(edge)
	if err != nil {
		return StateMachineEdge{}, err
	}
	for _, existing := range p.StateMachineEdges {
		if existing.ID == normalized.ID {
			return StateMachineEdge{}, fmt.Errorf("%w: %q", ErrStateMachineEdgeDuplicateID, normalized.ID)
		}
	}
	mergeReplacements, err := p.stateMachineGroupMergeReplacements(normalized)
	if err != nil {
		return StateMachineEdge{}, err
	}
	nextEdges := make([]StateMachineEdge, 0, len(p.StateMachineEdges)+1)
	for _, existing := range p.StateMachineEdges {
		if replacement, ok := mergeReplacements[existing.MachineGroupID]; ok {
			existing = existing.Clone()
			existing.MachineGroupID = replacement
		}
		nextEdges = append(nextEdges, existing)
	}
	nextEdges = append(nextEdges, normalized)
	if err := p.validateStateMachineEdges(
		nextEdges,
		p.stateMachineGroupMergeOverrides(mergeReplacements),
		templates,
	); err != nil {
		return StateMachineEdge{}, err
	}
	if err := p.applyStateMachineGroupMerge(mergeReplacements); err != nil {
		return StateMachineEdge{}, err
	}
	p.StateMachineEdges = append(p.StateMachineEdges, normalized)
	return normalized, nil
}

func (d *Document) UpdateStateMachineEdge(
	projectID string,
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.UpdateStateMachineEdge(edge, templates); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) UpdateStateMachineEdge(
	ctx context.Context,
	projectID string,
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.UpdateStateMachineEdge(projectID, edge, templates); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) UpdateStateMachineEdge(
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	normalized, err := normalizeStateMachineEdgeForUpdate(edge)
	if err != nil {
		return err
	}
	for index, existing := range p.StateMachineEdges {
		if existing.ID != normalized.ID {
			continue
		}
		nextEdges := append([]StateMachineEdge(nil), p.StateMachineEdges...)
		nextEdges[index] = normalized
		if err := p.validateStateMachineEdges(nextEdges, nil, templates); err != nil {
			return err
		}
		p.StateMachineEdges[index] = normalized
		return nil
	}
	return fmt.Errorf("%w: %q", ErrStateMachineEdgeNotFound, normalized.ID)
}

func (d *Document) DeleteStateMachineEdges(projectID string, edgeIDs []string) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.DeleteStateMachineEdges(edgeIDs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) DeleteStateMachineEdges(
	ctx context.Context,
	projectID string,
	edgeIDs []string,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.DeleteStateMachineEdges(projectID, edgeIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) DeleteStateMachineEdges(edgeIDs []string) error {
	if p == nil {
		return ErrProjectNotFound
	}
	normalizedIDs := dedupeTrimmedIDs(edgeIDs)
	known := make(map[string]struct{}, len(p.StateMachineEdges))
	for _, edge := range p.StateMachineEdges {
		known[edge.ID] = struct{}{}
	}
	for _, edgeID := range normalizedIDs {
		if _, ok := known[edgeID]; ok {
			continue
		}
		return fmt.Errorf("%w: %q", ErrStateMachineEdgeNotFound, edgeID)
	}
	removed := make(map[string]struct{}, len(normalizedIDs))
	for _, edgeID := range normalizedIDs {
		removed[edgeID] = struct{}{}
	}
	remaining := make([]StateMachineEdge, 0, len(p.StateMachineEdges))
	for _, edge := range p.StateMachineEdges {
		if _, ok := removed[edge.ID]; ok {
			continue
		}
		remaining = append(remaining, edge)
	}
	p.StateMachineEdges = remaining
	return nil
}

func (d *Document) SetStateMachineEdges(
	projectID string,
	edges []StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetStateMachineEdges(edges, templates); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetStateMachineEdges(
	ctx context.Context,
	projectID string,
	edges []StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetStateMachineEdges(projectID, edges, templates); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetStateMachineEdges(
	edges []StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	normalized := make([]StateMachineEdge, 0, len(edges))
	seen := make(map[string]struct{}, len(edges))
	for _, edge := range edges {
		next, err := normalizeStateMachineEdgeForUpdate(edge)
		if err != nil {
			return err
		}
		if _, ok := seen[next.ID]; ok {
			return fmt.Errorf("%w: %q", ErrStateMachineEdgeDuplicateID, next.ID)
		}
		seen[next.ID] = struct{}{}
		normalized = append(normalized, next)
	}
	if err := p.validateStateMachineEdges(normalized, nil, templates); err != nil {
		return err
	}
	p.StateMachineEdges = normalized
	return nil
}

func (d *Document) SetStateMachineSectionSettings(
	projectID string,
	sectionID string,
	settings StateMachineSectionSettings,
) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetStateMachineSectionSettings(sectionID, settings); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetStateMachineSectionSettings(
	ctx context.Context,
	projectID string,
	sectionID string,
	settings StateMachineSectionSettings,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetStateMachineSectionSettings(projectID, sectionID, settings); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetStateMachineSectionSettings(
	sectionID string,
	settings StateMachineSectionSettings,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	section, _, _, sectionType, err := p.resolveStateMachineSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	if err := validateStateMachineMachineGroupID(settings.MachineGroupID, "State machine section "+section.ID); err != nil {
		return err
	}
	if err := p.validateStateMachineSectionSettingsMachineGroup(section.ID, settings.MachineGroupID); err != nil {
		return err
	}
	if err := p.applyStateMachineSectionSharedSettings(section.ID, settings); err != nil {
		return err
	}
	return p.applyStateMachineSectionGateSettings(section.ID, sectionType, settings.GateType)
}

func (p *Project) validateStateMachineSectionSettingsMachineGroup(
	sectionID string,
	machineGroupID string,
) error {
	return p.validateStateMachineEdges(
		p.StateMachineEdges,
		map[string]string{sectionID: machineGroupID},
		nil,
	)
}

func (p *Project) applyStateMachineSectionSharedSettings(
	sectionID string,
	settings StateMachineSectionSettings,
) error {
	if err := p.setCurrentSectionField(sectionID, "machineGroupId", settings.MachineGroupID); err != nil {
		return err
	}
	return p.setCurrentSectionField(sectionID, "label", settings.Label)
}

func (p *Project) applyStateMachineSectionGateSettings(
	sectionID string,
	sectionType string,
	gateType *StateMachineGateType,
) error {
	if !strings.EqualFold(sectionType, "StateMachineGate") {
		if gateType != nil {
			return fmt.Errorf("%w: only gate sections accept a gate type", ErrStateMachineGateTypeInvalid)
		}
		return nil
	}
	if gateType == nil {
		return fmt.Errorf("%w: gate sections require a gate type", ErrStateMachineGateTypeInvalid)
	}
	normalized, err := normalizeStateMachineGateType(*gateType)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(sectionID, "gateType", string(normalized))
}

func normalizeStateMachineEdgeForCreate(edge StateMachineEdge) (StateMachineEdge, error) {
	normalized := edge.Clone()
	if strings.TrimSpace(normalized.ID) == "" {
		id, err := newProjectStateID()
		if err != nil {
			return StateMachineEdge{}, err
		}
		normalized.ID = id
	}
	return normalizeStateMachineEdgeForUpdate(normalized)
}

func normalizeStateMachineEdgeForUpdate(edge StateMachineEdge) (StateMachineEdge, error) {
	normalized, err := edge.Normalized()
	if err != nil {
		return StateMachineEdge{}, err
	}
	if strings.TrimSpace(normalized.ID) == "" {
		return StateMachineEdge{}, ErrEdgeIDRequired
	}
	if strings.TrimSpace(normalized.SourceSectionID) == "" {
		return StateMachineEdge{}, ErrSectionIDRequired
	}
	if strings.TrimSpace(normalized.TargetSectionID) == "" {
		return StateMachineEdge{}, ErrSectionIDRequired
	}
	if strings.TrimSpace(normalized.SourcePortID) == "" {
		return StateMachineEdge{}, ErrCodeObjIDRequired
	}
	if strings.TrimSpace(normalized.TargetPortID) == "" {
		return StateMachineEdge{}, ErrCodeObjIDRequired
	}
	return normalized, nil
}

func normalizeStateMachineGateType(gateType StateMachineGateType) (StateMachineGateType, error) {
	trimmed := StateMachineGateType(strings.TrimSpace(string(gateType)))
	switch trimmed {
	case StateMachineGateTypeAND, StateMachineGateTypeOR, StateMachineGateTypeXOR:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrStateMachineGateTypeInvalid, strings.TrimSpace(string(gateType)))
	}
}

func (p *Project) resolveStateMachineSectionMutationState(
	sectionID string,
) (Section, SectionVariant, map[string]any, string, error) {
	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return Section{}, SectionVariant{}, nil, "", err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, nil, "", err
	}
	sectionType := payloadStringField(payload, "type")
	if sectionType == "" {
		sectionType = fallbackSectionType(impl)
	}
	switch sectionType {
	case "StateMachineStart", "StateMachineGate", "StateMachineEnd":
		return section, variant, payload, sectionType, nil
	default:
		return Section{}, SectionVariant{}, nil, "", fmt.Errorf("%w: %q", ErrStateMachineSectionRequired, section.ID)
	}
}

func (p *Project) validateStateMachineEdges(
	edges []StateMachineEdge,
	machineGroupOverrides map[string]string,
	templates StateMachinePromptTemplateLookup,
) error {
	for _, edge := range edges {
		if err := p.validateStateMachineEdge(edge, machineGroupOverrides, templates); err != nil {
			return err
		}
	}
	return nil
}

func resolveStateMachineSectionType(payload map[string]any, impl SectionImpl) string {
	sectionType := payloadStringField(payload, "type")
	if sectionType != "" {
		return sectionType
	}
	return fallbackSectionType(impl)
}

func (p *Project) resolveStateMachineEdgeEndpoint(sectionID string) (stateMachineEdgeEndpoint, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return stateMachineEdgeEndpoint{}, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return stateMachineEdgeEndpoint{}, err
	}
	return stateMachineEdgeEndpoint{
		sectionID:   section.ID,
		sectionType: resolveStateMachineSectionType(payload, impl),
		payload:     payload,
	}, nil
}

func (p *Project) validateStateMachineEdge(
	edge StateMachineEdge,
	machineGroupOverrides map[string]string,
	templates StateMachinePromptTemplateLookup,
) error {
	if err := validateStateMachineMachineGroupID(edge.MachineGroupID, "State machine edge "+edge.ID); err != nil {
		return err
	}
	sourceEndpoint, err := p.resolveStateMachineEdgeEndpoint(edge.SourceSectionID)
	if err != nil {
		return err
	}
	targetEndpoint, err := p.resolveStateMachineEdgeEndpoint(edge.TargetSectionID)
	if err != nil {
		return err
	}
	if err := validateStateMachineEdgeSectionTypes(edge, sourceEndpoint.sectionType, targetEndpoint.sectionType); err != nil {
		return err
	}
	if err := p.validateStateMachineEdgeRules(edge, sourceEndpoint.sectionType, targetEndpoint.sectionType, templates); err != nil {
		return err
	}
	return p.validateStateMachineEdgeMachineGroups(edge, sourceEndpoint, targetEndpoint, machineGroupOverrides)
}

func validateStateMachineEdgeSectionTypes(edge StateMachineEdge, sourceType string, targetType string) error {
	if !isAllowedStateMachineSourceType(sourceType) {
		return stateMachineEdgeInvalidf("State machine edge %s has unsupported source type %s.", edge.ID, sourceType)
	}
	if !isAllowedStateMachineTargetType(targetType) {
		return stateMachineEdgeInvalidf("State machine edge %s has unsupported target type %s.", edge.ID, targetType)
	}
	if edge.SourceSectionID == edge.TargetSectionID && !strings.EqualFold(sourceType, "Chat") {
		return stateMachineEdgeInvalidf("State machine edge %s only supports self-loops on Chat sections.", edge.ID)
	}
	return nil
}

func (p *Project) validateStateMachineEdgeRules(
	edge StateMachineEdge,
	sourceType string,
	targetType string,
	templates StateMachinePromptTemplateLookup,
) error {
	if err := validateStateMachineEdgePortIDs(edge); err != nil {
		return err
	}
	if err := validateStateMachineSourceActivationCountCondition(edge.ID, edge.SourceActivationCountCondition); err != nil {
		return err
	}
	if err := validateStateMachineSourceFilter(edge.ID, sourceType, edge.SourceFilter); err != nil {
		return err
	}
	return p.validateStateMachineTargetAction(edge.ID, targetType, edge.TargetAction, templates)
}

func (p *Project) validateStateMachineEdgeMachineGroups(
	edge StateMachineEdge,
	sourceEndpoint stateMachineEdgeEndpoint,
	targetEndpoint stateMachineEdgeEndpoint,
	machineGroupOverrides map[string]string,
) error {
	sourceMachineGroupID := p.resolveStateMachineSectionMachineGroupID(
		sourceEndpoint.sectionID,
		sourceEndpoint.sectionType,
		sourceEndpoint.payload,
		machineGroupOverrides,
		edge.MachineGroupID,
	)
	if sourceMachineGroupID != edge.MachineGroupID {
		return stateMachineEdgeInvalidf("State machine edge %s machine group does not match the source section.", edge.ID)
	}

	targetMachineGroupID := p.resolveStateMachineSectionMachineGroupID(
		targetEndpoint.sectionID,
		targetEndpoint.sectionType,
		targetEndpoint.payload,
		machineGroupOverrides,
		edge.MachineGroupID,
	)
	if targetMachineGroupID != edge.MachineGroupID {
		return stateMachineEdgeInvalidf("State machine edge %s machine group does not match the target section.", edge.ID)
	}
	return nil
}

func (p *Project) validateStateMachineTargetAction(
	edgeID string,
	targetType string,
	targetAction *StateMachineTargetAction,
	templates StateMachinePromptTemplateLookup,
) error {
	if !strings.EqualFold(targetType, "Chat") {
		if targetAction != nil {
			return stateMachineEdgeInvalidf("State machine edge %s only allows target actions on Chat targets.", edgeID)
		}
		return nil
	}
	if targetAction == nil {
		return stateMachineEdgeInvalidf("State machine edge %s requires a target action for Chat targets.", edgeID)
	}
	if targetAction.PermissionMode != nil {
		if _, err := normalizeChatPermissionMode(ChatPermissionMode(*targetAction.PermissionMode)); err != nil {
			return stateMachineEdgeInvalidf("State machine edge %s has unsupported permission mode %s.", edgeID, *targetAction.PermissionMode)
		}
	}
	switch targetAction.Type {
	case StateMachineTargetActionTypeSendPrompt:
		return p.validateStateMachineSendPromptAction(edgeID, targetAction, templates)
	case StateMachineTargetActionTypeResetThread:
		return validateStateMachineResetThreadAction(edgeID, targetAction)
	default:
		return stateMachineEdgeInvalidf("State machine edge %s has unsupported target action type %s.", edgeID, targetAction.Type)
	}
}

func (p *Project) validateStateMachineSendPromptAction(
	edgeID string,
	targetAction *StateMachineTargetAction,
	templates StateMachinePromptTemplateLookup,
) error {
	sourceKind, err := resolveStateMachineSendPromptSource(edgeID, targetAction)
	if err != nil {
		return err
	}
	switch sourceKind {
	case StateMachinePromptSourceTypePromptTemplate:
		return validateStateMachinePromptTemplateAction(edgeID, targetAction, templates)
	case StateMachinePromptSourceTypePromptSection:
		return p.validateStateMachinePromptSectionAction(edgeID, targetAction, templates)
	default:
		return nil
	}
}

func resolveStateMachineSendPromptSource(
	edgeID string,
	targetAction *StateMachineTargetAction,
) (StateMachinePromptSourceType, error) {
	sourceKinds := make([]StateMachinePromptSourceType, 0, 3)
	if targetAction.PromptTemplateID != nil {
		sourceKinds = append(sourceKinds, StateMachinePromptSourceTypePromptTemplate)
	}
	if targetAction.PromptSectionID != nil {
		sourceKinds = append(sourceKinds, StateMachinePromptSourceTypePromptSection)
	}
	if targetAction.InlinePrompt != nil && strings.TrimSpace(*targetAction.InlinePrompt) != "" {
		sourceKinds = append(sourceKinds, StateMachinePromptSourceTypeInline)
	}
	if len(sourceKinds) != 1 {
		return "", stateMachineEdgeInvalidf(
			"State machine edge %s send_prompt actions require exactly one of promptTemplateId, promptSectionId, or inlinePrompt.",
			edgeID,
		)
	}
	return sourceKinds[0], nil
}

func validateStateMachinePromptTemplateAction(
	edgeID string,
	targetAction *StateMachineTargetAction,
	templates StateMachinePromptTemplateLookup,
) error {
	if templates == nil {
		return stateMachineEdgeInvalidf("State machine edge %s promptTemplateId validation requires prompt templates.", edgeID)
	}
	template, err := templates.Get(*targetAction.PromptTemplateID)
	if err != nil {
		return stateMachineEdgeInvalidf("Prompt template %s not found for state machine edge %s.", *targetAction.PromptTemplateID, edgeID)
	}
	result := renderPromptSection(template.Template, targetAction.PromptInputs, template.Format)
	return validateStateMachineRenderedPrompt(
		edgeID,
		fmt.Sprintf("prompt template %s", template.ID),
		result.RenderedText,
		result.RenderError,
	)
}

func (p *Project) validateStateMachinePromptSectionAction(
	edgeID string,
	targetAction *StateMachineTargetAction,
	templates StateMachinePromptTemplateLookup,
) error {
	_, _, promptPayload, err := p.resolveTypedSectionMutationState(*targetAction.PromptSectionID, "Prompt", ErrPromptSectionRequired)
	if err != nil {
		return err
	}
	promptFormat, err := normalizePromptFormat(prompttemplates.Format(payloadStringField(promptPayload, "format")))
	if err != nil {
		return err
	}
	promptTemplate := payloadRawStringField(promptPayload, "template")
	if promptTemplateID := payloadRawStringField(promptPayload, "promptTemplateId"); promptTemplateID != "" && templates != nil {
		template, templateErr := templates.Get(promptTemplateID)
		if templateErr != nil {
			return stateMachineEdgeInvalidf("Prompt template %s not found for state machine edge %s.", promptTemplateID, edgeID)
		}
		promptTemplate = template.Template
		promptFormat = template.Format
	}
	result := renderPromptSection(promptTemplate, targetAction.PromptInputs, promptFormat)
	return validateStateMachineRenderedPrompt(
		edgeID,
		fmt.Sprintf("prompt section %s", *targetAction.PromptSectionID),
		result.RenderedText,
		result.RenderError,
	)
}

func validateStateMachineRenderedPrompt(
	edgeID string,
	sourceDescription string,
	renderedText string,
	renderError *string,
) error {
	if renderError != nil {
		return stateMachineEdgeInvalidf(
			"State machine edge %s %s failed to render: %s",
			edgeID,
			sourceDescription,
			*renderError,
		)
	}
	if strings.TrimSpace(renderedText) == "" {
		return stateMachineEdgeInvalidf("State machine edge %s %s rendered an empty prompt.", edgeID, sourceDescription)
	}
	return nil
}

func validateStateMachineResetThreadAction(edgeID string, targetAction *StateMachineTargetAction) error {
	hasInlinePrompt := targetAction.InlinePrompt != nil && strings.TrimSpace(*targetAction.InlinePrompt) != ""
	if targetAction.PromptTemplateID != nil ||
		targetAction.PromptSectionID != nil ||
		hasInlinePrompt ||
		len(targetAction.PromptInputs) != 0 {
		return stateMachineEdgeInvalidf("State machine edge %s reset_thread actions cannot include prompt content or prompt inputs.", edgeID)
	}
	return nil
}

func validateStateMachineMachineGroupID(machineGroupID string, context string) error {
	if strings.TrimSpace(machineGroupID) == "" {
		return stateMachineEdgeInvalidf("%s machine group must not be empty.", context)
	}
	if machineGroupID != strings.TrimSpace(machineGroupID) {
		return stateMachineEdgeInvalidf("%s machine group must not start or end with whitespace.", context)
	}
	return nil
}

func validateStateMachineEdgePortIDs(edge StateMachineEdge) error {
	if edge.SourcePortID != StateMachineEdgeSourcePortID {
		return stateMachineEdgeInvalidf("State machine edge %s source port must be %s.", edge.ID, StateMachineEdgeSourcePortID)
	}
	if edge.TargetPortID != StateMachineEdgeTargetPortID {
		return stateMachineEdgeInvalidf("State machine edge %s target port must be %s.", edge.ID, StateMachineEdgeTargetPortID)
	}
	return nil
}

func validateStateMachineSourceFilter(
	edgeID string,
	sourceType string,
	sourceFilter *StateMachineSourceFilter,
) error {
	if !strings.EqualFold(sourceType, "Chat") {
		if sourceFilter != nil {
			return stateMachineEdgeInvalidf("State machine edge %s only allows source filters on Chat sources.", edgeID)
		}
		return nil
	}
	if sourceFilter == nil {
		return nil
	}
	if sourceFilter.Type == StateMachineSourceFilterTypeSignal {
		return validateStateMachineSignalSourceFilter(edgeID, sourceFilter)
	}
	return validateStateMachineNonSignalSourceFilter(edgeID, sourceFilter)
}

func validateStateMachineSignalSourceFilter(
	edgeID string,
	sourceFilter *StateMachineSourceFilter,
) error {
	if err := validateStateMachineRequiredTrimmedValue(
		edgeID,
		sourceFilter.SignalName,
		"State machine edge %s signal filters require a signalName.",
		"State machine edge %s signalName must not start or end with whitespace.",
	); err != nil {
		return err
	}
	if sourceFilter.PayloadField == nil && sourceFilter.Equals == nil {
		return nil
	}
	if sourceFilter.PayloadField == nil || sourceFilter.Equals == nil {
		return stateMachineEdgeInvalidf("State machine edge %s signal filters require payloadField and equals together.", edgeID)
	}
	if err := validateStateMachineRequiredTrimmedValue(
		edgeID,
		sourceFilter.PayloadField,
		"State machine edge %s signal payloadField must not be empty.",
		"State machine edge %s signal payloadField must not start or end with whitespace.",
	); err != nil {
		return err
	}
	return validateStateMachineRequiredTrimmedValue(
		edgeID,
		sourceFilter.Equals,
		"State machine edge %s signal equals value must not be empty.",
		"",
	)
}

func validateStateMachineNonSignalSourceFilter(
	edgeID string,
	sourceFilter *StateMachineSourceFilter,
) error {
	if sourceFilter.SignalName != nil {
		return stateMachineEdgeInvalidf("State machine edge %s non-signal source filters cannot set signalName.", edgeID)
	}
	if sourceFilter.PayloadField != nil {
		return stateMachineEdgeInvalidf("State machine edge %s non-signal source filters cannot set payloadField.", edgeID)
	}
	if sourceFilter.Equals != nil {
		return stateMachineEdgeInvalidf("State machine edge %s non-signal source filters cannot set equals.", edgeID)
	}
	return nil
}

func validateStateMachineRequiredTrimmedValue(
	edgeID string,
	value *string,
	emptyFormat string,
	whitespaceFormat string,
) error {
	if value == nil || strings.TrimSpace(*value) == "" {
		return stateMachineEdgeInvalidf(emptyFormat, edgeID)
	}
	if whitespaceFormat != "" && *value != strings.TrimSpace(*value) {
		return stateMachineEdgeInvalidf(whitespaceFormat, edgeID)
	}
	return nil
}

func validateStateMachineSourceActivationCountCondition(
	edgeID string,
	condition *StateMachineSourceActivationCountCondition,
) error {
	if condition == nil {
		return nil
	}
	if condition.Value < 0 {
		return stateMachineEdgeInvalidf(
			"State machine edge %s source activation count conditions require a non-negative value.",
			edgeID,
		)
	}
	return nil
}

func (p *Project) resolveStateMachineSectionMachineGroupID(
	sectionID string,
	sectionType string,
	payload map[string]any,
	machineGroupOverrides map[string]string,
	fallbackMachineGroupID string,
) string {
	switch sectionType {
	case "StateMachineStart", "StateMachineGate", "StateMachineEnd":
		if machineGroupOverrides != nil {
			if override, ok := machineGroupOverrides[sectionID]; ok {
				return override
			}
		}
		return payloadStringField(payload, "machineGroupId")
	default:
		return fallbackMachineGroupID
	}
}

func isAllowedStateMachineSourceType(sectionType string) bool {
	switch sectionType {
	case "Chat", "StateMachineStart", "StateMachineGate":
		return true
	default:
		return false
	}
}

func isAllowedStateMachineTargetType(sectionType string) bool {
	switch sectionType {
	case "Chat", "StateMachineGate", "StateMachineEnd":
		return true
	default:
		return false
	}
}

func (p *Project) uniqueConnectedStateMachineGroupID(sectionID string) *string {
	groupIDs := make(map[string]struct{})
	for _, edge := range p.StateMachineEdges {
		if edge.SourceSectionID == sectionID || edge.TargetSectionID == sectionID {
			groupIDs[edge.MachineGroupID] = struct{}{}
		}
	}
	if len(groupIDs) != 1 {
		return nil
	}
	for groupID := range groupIDs {
		return &groupID
	}
	return nil
}

func (p *Project) resolveExistingMachineGroupIDForStateMachineEndpoint(
	sectionID string,
	sectionType string,
	payload map[string]any,
) *string {
	switch sectionType {
	case "StateMachineStart", "StateMachineGate", "StateMachineEnd":
		groupID := payloadStringField(payload, "machineGroupId")
		return &groupID
	default:
		return p.uniqueConnectedStateMachineGroupID(sectionID)
	}
}

func (p *Project) stateMachineGroupMergeReplacements(edge StateMachineEdge) (map[string]string, error) {
	sourceEndpoint, err := p.resolveStateMachineEdgeEndpoint(edge.SourceSectionID)
	if err != nil {
		return nil, err
	}
	targetEndpoint, err := p.resolveStateMachineEdgeEndpoint(edge.TargetSectionID)
	if err != nil {
		return nil, err
	}
	sourceMachineGroupID := p.resolveExistingMachineGroupIDForStateMachineEndpoint(
		sourceEndpoint.sectionID,
		sourceEndpoint.sectionType,
		sourceEndpoint.payload,
	)
	targetMachineGroupID := p.resolveExistingMachineGroupIDForStateMachineEndpoint(
		targetEndpoint.sectionID,
		targetEndpoint.sectionType,
		targetEndpoint.payload,
	)

	existingMachineGroupIDs := make(map[string]struct{}, 2)
	if sourceMachineGroupID != nil {
		existingMachineGroupIDs[*sourceMachineGroupID] = struct{}{}
	}
	if targetMachineGroupID != nil {
		existingMachineGroupIDs[*targetMachineGroupID] = struct{}{}
	}
	if len(existingMachineGroupIDs) <= 1 {
		return map[string]string{}, nil
	}
	if _, ok := existingMachineGroupIDs[edge.MachineGroupID]; !ok {
		return nil, stateMachineEdgeInvalidf(
			"State machine edge %s machine group must match one of the connected machine groups.",
			edge.ID,
		)
	}
	replacements := make(map[string]string, len(existingMachineGroupIDs)-1)
	for machineGroupID := range existingMachineGroupIDs {
		if machineGroupID == edge.MachineGroupID {
			continue
		}
		replacements[machineGroupID] = edge.MachineGroupID
	}
	return replacements, nil
}

func (p *Project) stateMachineGroupMergeOverrides(
	mergeReplacements map[string]string,
) map[string]string {
	if len(mergeReplacements) == 0 {
		return map[string]string{}
	}
	overrides := map[string]string{}
	for sectionID := range p.Sections {
		section, variant, impl, err := p.ResolveSection(sectionID)
		if err != nil {
			continue
		}
		payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
		if err != nil {
			continue
		}
		sectionType := payloadStringField(payload, "type")
		if sectionType == "" {
			sectionType = fallbackSectionType(impl)
		}
		switch sectionType {
		case "StateMachineStart", "StateMachineGate", "StateMachineEnd":
			if replacement, ok := mergeReplacements[payloadStringField(payload, "machineGroupId")]; ok {
				overrides[sectionID] = replacement
			}
		}
	}
	return overrides
}

func (p *Project) applyStateMachineGroupMerge(mergeReplacements map[string]string) error {
	if len(mergeReplacements) == 0 {
		return nil
	}
	for sectionID, machineGroupID := range p.stateMachineGroupMergeOverrides(mergeReplacements) {
		if err := p.setCurrentSectionField(sectionID, "machineGroupId", machineGroupID); err != nil {
			return err
		}
	}
	for index, edge := range p.StateMachineEdges {
		if replacement, ok := mergeReplacements[edge.MachineGroupID]; ok {
			edge.MachineGroupID = replacement
			p.StateMachineEdges[index] = edge
		}
	}
	return nil
}

func stateMachineEdgeInvalidf(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrStateMachineEdgeInvalid, fmt.Sprintf(format, args...))
}
