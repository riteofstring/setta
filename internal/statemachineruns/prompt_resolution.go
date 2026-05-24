package statemachineruns

import (
	"fmt"
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/promptrender"
	"setta/internal/prompttemplates"
)

func (r *Runtime) resolvePromptText(
	projectRuntime *projectstate.Runtime,
	projectConfigID string,
	edge projectstate.StateMachineEdge,
	targetAction projectstate.StateMachineTargetAction,
) (string, error) {
	inlinePrompt := derefOptionalString(targetAction.InlinePrompt)
	if strings.TrimSpace(inlinePrompt) != "" {
		return inlinePrompt, nil
	}
	promptSectionID := strings.TrimSpace(derefOptionalString(targetAction.PromptSectionID))
	if promptSectionID != "" {
		return r.resolvePromptSectionText(projectRuntime, projectConfigID, edge.ID, promptSectionID, targetAction.PromptInputs)
	}
	return r.resolvePromptTemplateText(edge.ID, targetAction.PromptTemplateID, targetAction.PromptInputs)
}

func (r *Runtime) resolvePromptSectionText(
	projectRuntime *projectstate.Runtime,
	projectConfigID string,
	edgeID string,
	promptSectionID string,
	promptInputs map[string]string,
) (string, error) {
	projectSnapshot := projectRuntime.Snapshot()
	project, err := projectSnapshot.Document.ProjectByID(projectConfigID)
	if err != nil {
		return "", err
	}
	section, variant, _, err := project.ResolveSection(promptSectionID)
	if err != nil {
		return "", err
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		return "", err
	}
	format := prompttemplates.Format(strings.TrimSpace(payloadString(payload, "format")))
	if format == "" {
		format = prompttemplates.FormatJinja
	}
	if format != prompttemplates.FormatJinja {
		return "", fmt.Errorf("state machine edge %s prompt section %s format %s is unsupported", edgeID, section.ID, format)
	}
	return renderJinjaPromptSource(
		fmt.Sprintf("state machine edge %s prompt section %s", edgeID, section.ID),
		payloadString(payload, "template"),
		promptInputs,
	)
}

func (r *Runtime) resolvePromptTemplateText(
	edgeID string,
	promptTemplateID *string,
	promptInputs map[string]string,
) (string, error) {
	normalizedPromptTemplateID := strings.TrimSpace(derefOptionalString(promptTemplateID))
	if normalizedPromptTemplateID == "" {
		return "", fmt.Errorf("state machine edge %s send_prompt action is missing prompt content", edgeID)
	}
	if r.templates == nil {
		return "", ErrPromptTemplateStoreRequired
	}
	template, err := r.templates.Get(normalizedPromptTemplateID)
	if err != nil {
		return "", err
	}
	return renderJinjaPromptSource(
		fmt.Sprintf("state machine edge %s prompt template %s", edgeID, template.ID),
		template.Template,
		promptInputs,
	)
}

func renderJinjaPromptSource(
	renderContext string,
	template string,
	promptInputs map[string]string,
) (string, error) {
	result := promptrender.RenderJinja(template, cloneStringMap(promptInputs))
	if result.RenderError != nil {
		return "", fmt.Errorf("%s failed to render: %s", renderContext, *result.RenderError)
	}
	if strings.TrimSpace(result.RenderedText) == "" {
		return "", fmt.Errorf("%s rendered an empty prompt", renderContext)
	}
	return result.RenderedText, nil
}

func (r *Runtime) resolveEngineConfigID(
	edgeID string,
	targetSection graphSection,
	targetAction projectstate.StateMachineTargetAction,
) (string, error) {
	if targetAction.EngineConfigID != nil && strings.TrimSpace(*targetAction.EngineConfigID) != "" {
		return strings.TrimSpace(*targetAction.EngineConfigID), nil
	}
	if targetSection.EngineConfigID != nil && strings.TrimSpace(*targetSection.EngineConfigID) != "" {
		return strings.TrimSpace(*targetSection.EngineConfigID), nil
	}
	return "", fmt.Errorf("chat section %s is missing engineConfigId for state machine edge %s", targetSection.ID, edgeID)
}

func (r *Runtime) ensureSignalDispatchProfileAllowed(
	graph graph,
	targetSection graphSection,
	targetAction projectstate.StateMachineTargetAction,
) error {
	if !r.hasSignalFilteredOutgoingEdges(graph, targetSection.ID) {
		return nil
	}
	agentProfileID := chooseOptionalString(targetAction.AgentProfileID, targetSection.AgentProfileID)
	if agentProfileID == nil {
		return nil
	}
	profile, err := r.profiles.Get(*agentProfileID)
	if err != nil {
		return err
	}
	if workflowSignalToolAllowed(profile) {
		return nil
	}
	return fmt.Errorf(
		"%w: workflow chat section %s requires agent profile %s to allow %s",
		ErrInvalidStateMachineInput,
		targetSection.ID,
		profile.ID,
		workflowSignalToolBaseName,
	)
}

func (r *Runtime) hasSignalFilteredOutgoingEdges(graph graph, sourceSectionID string) bool {
	for _, edge := range r.outgoingEdges(graph, sourceSectionID) {
		if edge.SourceFilter == nil {
			continue
		}
		if edge.SourceFilter.Type == projectstate.StateMachineSourceFilterTypeSignal {
			return true
		}
	}
	return false
}

func workflowSignalToolAllowed(profile agentprofiles.Profile) bool {
	if len(profile.ToolAllowlist) == 0 {
		return true
	}
	requiredToolName := mcpx.NormalizeToolName(mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, workflowSignalToolBaseName))
	serverID, baseName, ok := mcpx.SplitNamespacedToolName(requiredToolName)
	if !ok {
		return false
	}
	for _, entry := range profile.ToolAllowlist {
		normalizedEntry := mcpx.NormalizeToolName(strings.TrimSpace(entry))
		switch normalizedEntry {
		case requiredToolName, baseName, serverID:
			return true
		}
	}
	return false
}
