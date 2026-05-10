package projectstate

import (
	"fmt"
	"strings"

	"setta/internal/prompttemplates"
)

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
	if edge.SourceSectionID == edge.TargetSectionID && !isAllowedStateMachineSelfLoopType(sourceType) {
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
	return hasFrontendSectionType(stateMachineConnectionSourceTypes, sectionType)
}

func isAllowedStateMachineTargetType(sectionType string) bool {
	return hasFrontendSectionType(stateMachineConnectionTargetTypes, sectionType)
}

func isAllowedStateMachineSelfLoopType(sectionType string) bool {
	return hasFrontendSectionType(stateMachineSelfLoopSectionTypes, sectionType)
}

func hasFrontendSectionType(types []FrontendSectionType, sectionType string) bool {
	for _, allowedType := range types {
		if strings.EqualFold(string(allowedType), sectionType) {
			return true
		}
	}
	return false
}
