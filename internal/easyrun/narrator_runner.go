package easyrun

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode/utf8"

	"setta/internal/chat"
)

const (
	easyRunNarratorSurfaceMetadata = "easy_run_narrator"
	maxNarratorCurrentFocusRunes   = 320
)

var narratorReasoningEffort = chat.ReasoningEffortNone

type narratorRunState struct {
	digest                  *narratorDigestBuffer
	focusDirty              bool
	focusDirtyThrough       int
	inFlight                bool
	inFlightDone            chan struct{}
	lastCallAt              time.Time
	pendingCurrentFocusText string
}

type terminalNarrationResult struct {
	currentFocus string
	err          error
	highlights   []string
	summary      string
}

type workingNarrationResult struct {
	currentFocus string
	err          error
	highlights   []string
}

type narratorTaskInput struct {
	ArtifactCount        int                   `json:"artifactCount"`
	DigestEntries        []narratorDigestEntry `json:"digestEntries"`
	EasyRunID            string                `json:"easyRunId"`
	HighlightCount       int                   `json:"highlightCount"`
	MechanicalSummary    string                `json:"mechanicalSummary"`
	PreviousCurrentFocus string                `json:"previousCurrentFocus"`
	PreviousHighlights   []string              `json:"previousHighlights"`
	RequestText          string                `json:"requestText"`
	Status               chat.RunStatus        `json:"status"`
	Terminal             bool                  `json:"terminal"`
	WorkspaceID          string                `json:"workspaceId"`
}

type narratorTaskOutput struct {
	CurrentFocus string   `json:"currentFocus"`
	Highlights   []string `json:"highlights"`
	Summary      string   `json:"summary"`
}

func newNarratorRunState() *narratorRunState {
	return &narratorRunState{digest: newNarratorDigestBuffer(0, 0)}
}

func (service *Service) narratorStateLocked(easyRunID string) *narratorRunState {
	state := service.narrators[easyRunID]
	if state == nil {
		state = newNarratorRunState()
		service.narrators[easyRunID] = state
	}
	return state
}

func (state *narratorRunState) beginCall(now time.Time) {
	state.inFlight = true
	state.inFlightDone = make(chan struct{})
	state.lastCallAt = now
}

func (state *narratorRunState) finishCall() {
	if !state.inFlight {
		return
	}
	state.inFlight = false
	close(state.inFlightDone)
	state.inFlightDone = nil
}

func (state *narratorRunState) markFocusDirty(through int) {
	state.focusDirty = true
	if through > state.focusDirtyThrough {
		state.focusDirtyThrough = through
	}
}

func (state *narratorRunState) finishFocusProjection(through int) EasyRunFocusStatus {
	if state.focusDirty && through >= state.focusDirtyThrough {
		state.focusDirty = false
	}
	if state.focusDirty {
		return EasyRunFocusStatusUpdating
	}
	return EasyRunFocusStatusCurrent
}

func (state *narratorRunState) failFocusProjection() {
	state.focusDirty = false
	state.pendingCurrentFocusText = ""
}

func (state *narratorRunState) previousCurrentFocusText(persisted string) string {
	if state.pendingCurrentFocusText != "" {
		return state.pendingCurrentFocusText
	}
	return persisted
}

func (service *Service) runWorkingNarrator(ctx context.Context, target workingNarratorProjection) workingNarrationResult {
	request, err := service.workingNarratorTaskRequest(target)
	if err != nil {
		return workingNarrationResult{err: err}
	}
	result, err := service.narrator.RunTask(ctx, request)
	if err != nil {
		return workingNarrationResult{err: err}
	}
	return workingNarrationFromHarnessResult(result)
}

func (service *Service) runTerminalNarrator(ctx context.Context, target terminalChatRunProjection) terminalNarrationResult {
	request, err := service.terminalNarratorTaskRequest(target)
	if err != nil {
		return terminalNarrationResult{err: err}
	}
	result, err := service.narrator.RunTask(ctx, request)
	if err != nil {
		return terminalNarrationResult{err: err}
	}
	return terminalNarrationFromHarnessResult(result)
}

func (service *Service) workingNarratorTaskRequest(target workingNarratorProjection) (chat.HarnessTaskRequest, error) {
	if err := service.validateNarratorReady(target.record.Run); err != nil {
		return chat.HarnessTaskRequest{}, err
	}
	input, err := json.Marshal(narratorInputForWorking(target))
	if err != nil {
		return chat.HarnessTaskRequest{}, fmt.Errorf("encode narrator input: %w", err)
	}
	return service.narratorTaskRequest(target.record.Run.WorkspaceID, input)
}

func (service *Service) terminalNarratorTaskRequest(target terminalChatRunProjection) (chat.HarnessTaskRequest, error) {
	if err := service.validateNarratorReady(target.record.Run); err != nil {
		return chat.HarnessTaskRequest{}, err
	}
	input, err := json.Marshal(narratorInputForTerminal(target))
	if err != nil {
		return chat.HarnessTaskRequest{}, fmt.Errorf("encode narrator input: %w", err)
	}
	return service.narratorTaskRequest(target.record.Run.WorkspaceID, input)
}

func (service *Service) narratorTaskRequest(workspaceID string, input json.RawMessage) (chat.HarnessTaskRequest, error) {
	taskID, err := service.newID("easy_run_narrator_task")
	if err != nil {
		return chat.HarnessTaskRequest{}, fmt.Errorf("create narrator task id: %w", err)
	}
	model, err := service.narratorModel(workspaceID)
	if err != nil {
		return chat.HarnessTaskRequest{}, err
	}
	workspaceSummary, err := service.workspaces.ResolveWorkspace(workspaceID)
	if err != nil {
		return chat.HarnessTaskRequest{}, fmt.Errorf("resolve narrator workspace: %w", err)
	}
	return chat.HarnessTaskRequest{
		Surface:     chat.HarnessSurfaceEasyRunNarrator,
		HarnessKind: service.narratorKind,
		TurnMode:    chat.HarnessTurnStructuredTask,
		OutputContract: chat.HarnessOutputContract{
			Kind:       chat.HarnessOutputStrictJSON,
			JSONSchema: defaultNarratorOutputSchema(),
		},
		CapabilityPolicy: chat.HarnessCapabilityPolicy{
			AllowedTools:      []string{},
			WorkspaceMutation: false,
			Approvals:         false,
			Streaming:         false,
		},
		StructuredTask: &chat.HarnessStructuredTask{
			ID:              taskID,
			Workspace:       workspaceSummary,
			Prompt:          productionNarratorPrompt(),
			Input:           input,
			Model:           model,
			ReasoningEffort: &narratorReasoningEffort,
		},
		Metadata: map[string]string{
			"setta.surface": easyRunNarratorSurfaceMetadata,
		},
	}, nil
}

func (service *Service) validateNarratorReady(run EasyRun) error {
	if run.NarratorStatus == EasyRunNarratorStatusDegraded {
		return errors.New("easy-run narrator already degraded")
	}
	if service.narrator == nil {
		return errors.New("easy-run narrator harness task runner is not configured")
	}
	if service.workspaces == nil {
		return errors.New("easy-run narrator workspace resolver is not configured")
	}
	return nil
}

func workingNarrationFromHarnessResult(result chat.HarnessTaskResult) workingNarrationResult {
	if result.Completion.Outcome != chat.TurnOutcomeCompleted {
		return workingNarrationResult{err: fmt.Errorf("narrator task finished with outcome %s: %s", result.Completion.Outcome, result.Completion.ErrorMessage)}
	}
	output, err := decodeNarratorTaskOutput(result.StructuredOutput)
	if err != nil {
		return workingNarrationResult{err: err}
	}
	if output.Summary != "" {
		return workingNarrationResult{err: errors.New("narrator working summary must be empty")}
	}
	highlights, err := narratorHighlightTexts(output.Highlights)
	if err != nil {
		return workingNarrationResult{err: err}
	}
	return workingNarrationResult{currentFocus: output.CurrentFocus, highlights: highlights}
}

func terminalNarrationFromHarnessResult(result chat.HarnessTaskResult) terminalNarrationResult {
	if result.Completion.Outcome != chat.TurnOutcomeCompleted {
		return terminalNarrationResult{err: fmt.Errorf("narrator task finished with outcome %s: %s", result.Completion.Outcome, result.Completion.ErrorMessage)}
	}
	output, err := decodeNarratorTaskOutput(result.StructuredOutput)
	if err != nil {
		return terminalNarrationResult{err: err}
	}
	highlights, err := narratorHighlightTexts(output.Highlights)
	if err != nil {
		return terminalNarrationResult{err: err}
	}
	summary := strings.TrimSpace(output.Summary)
	if summary == "" {
		return terminalNarrationResult{err: errors.New("narrator terminal summary is required")}
	}
	return terminalNarrationResult{currentFocus: output.CurrentFocus, highlights: highlights, summary: summary}
}

func narratorInputForWorking(target workingNarratorProjection) narratorTaskInput {
	previousHighlights := make([]string, 0, len(target.previousHighlights))
	for _, highlight := range target.previousHighlights {
		previousHighlights = append(previousHighlights, highlight.Text)
	}
	return narratorTaskInput{
		ArtifactCount:        target.record.Run.ArtifactCount,
		DigestEntries:        target.digest,
		EasyRunID:            target.record.Run.ID,
		HighlightCount:       target.record.Run.HighlightCount,
		MechanicalSummary:    "",
		PreviousCurrentFocus: target.previousCurrentFocus,
		PreviousHighlights:   previousHighlights,
		RequestText:          target.record.Run.RequestText,
		Status:               chat.RunStatusRunning,
		Terminal:             false,
		WorkspaceID:          target.record.Run.WorkspaceID,
	}
}

func narratorInputForTerminal(target terminalChatRunProjection) narratorTaskInput {
	previousHighlights := make([]string, 0, len(target.previousHighlights))
	for _, highlight := range target.previousHighlights {
		previousHighlights = append(previousHighlights, highlight.Text)
	}
	return narratorTaskInput{
		ArtifactCount:        target.record.Run.ArtifactCount,
		DigestEntries:        target.digest,
		EasyRunID:            target.record.Run.ID,
		HighlightCount:       target.record.Run.HighlightCount,
		MechanicalSummary:    target.mechanicalSummary,
		PreviousCurrentFocus: target.previousCurrentFocus,
		PreviousHighlights:   previousHighlights,
		RequestText:          target.record.Run.RequestText,
		Status:               target.status,
		Terminal:             true,
		WorkspaceID:          target.record.Run.WorkspaceID,
	}
}

func (service *Service) narratorModel(workspaceID string) (string, error) {
	if service.chat == nil {
		return "", nil
	}
	settings, effectiveSettings, err := service.chat.ResolveEasyRunCodexSettings(workspaceID, chat.ChatCodexSettings{})
	if err != nil {
		return "", fmt.Errorf("resolve narrator codex settings: %w", err)
	}
	if settings.Model != "" {
		return settings.Model, nil
	}
	if effectiveSettings != nil {
		return effectiveSettings.Model, nil
	}
	return "", nil
}

func decodeNarratorTaskOutput(raw json.RawMessage) (narratorTaskOutput, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var output narratorTaskOutput
	if err := decoder.Decode(&output); err != nil {
		return narratorTaskOutput{}, fmt.Errorf("decode narrator output: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return narratorTaskOutput{}, errors.New("narrator output must contain exactly one JSON object")
	}
	if output.Highlights == nil {
		return narratorTaskOutput{}, errors.New("narrator highlights array is required")
	}
	currentFocus, err := narratorCurrentFocusText(output.CurrentFocus)
	if err != nil {
		return narratorTaskOutput{}, err
	}
	output.CurrentFocus = currentFocus
	if len(output.Highlights) > maxEasyHighlightsPerNarratorCall {
		output.Highlights = output.Highlights[:maxEasyHighlightsPerNarratorCall]
	}
	return output, nil
}

func defaultNarratorOutputSchema() json.RawMessage {
	return json.RawMessage(fmt.Sprintf(`{
  "type": "object",
  "additionalProperties": false,
  "required": ["currentFocus", "highlights", "summary"],
  "properties": {
    "currentFocus": {
      "type": "string",
      "minLength": 1,
      "maxLength": %d
    },
    "highlights": {
      "type": "array",
      "items": {"type": "string"},
      "maxItems": 2
    },
    "summary": {"type": "string"}
  }
}`, maxNarratorCurrentFocusRunes))
}

func productionNarratorPrompt() string {
	return `You are Setta's Easy Button narrator. Return only strict JSON matching the supplied schema.

Write for the Easy Button presentation plane, not for an engineering transcript.

Current focus is one concise description of the active objective and every still-applicable constraint. It is not a status update, activity log, quotation, or completion answer. Incorporate every supplied user_steer entry without dropping constraints that it did not supersede. Do not claim that Current focus is the user's exact wording. On ordinary progress, revise it only when the evidence proves that one requested subgoal finished and another requested subgoal became active. If the objective has not materially changed, return previousCurrentFocus exactly. The only exception is a revision-zero previousCurrentFocus longer than the currentFocus schema limit: condense it within the limit without dropping its objective or constraints. Never invent a requirement from assistant output, tool activity, or a guess about user intent. When uncertain, return previousCurrentFocus exactly unless that value exceeds the schema limit.

Highlights are sparse phase changes, not actions. Return an empty highlights array when the new evidence does not show a meaningful phase change. Never quote a user_steer as a highlight or treat the steering event itself as a phase change. Never turn command names, file names, tests, retries, tool calls, approvals, or lifecycle mechanics into highlights by themselves.

For non-terminal requests, summary must be an empty string. For terminal requests, summary must be one or two plain-language sentences that answer what happened or what was produced. Do not mention commands, file paths, tool calls, provider events, transcripts, or agent mechanics. The service will append mechanical duration and artifact-count facts; do not invent them.

Every highlight and terminal summary must work when read aloud verbatim. Use short grammatical phrases or sentences and common spoken wording. Do not include file paths, command names, opaque identifiers, raw status codes, unexplained abbreviations, symbolic duration formats, or visual-only fragments. Voice readiness is not permission to emit more highlights.

Use only the supplied request, previous Current focus, previous highlights, mechanical facts, and digest entries. Do not include chain-of-thought, private reasoning, markdown fences, raw logs, diffs, or prose outside JSON.`
}

func narratorCurrentFocusText(text string) (string, error) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return "", errors.New("narrator current focus is required")
	}
	if text != trimmed {
		return "", errors.New("narrator current focus must not contain leading or trailing whitespace")
	}
	if count := utf8.RuneCountInString(text); count > maxNarratorCurrentFocusRunes {
		return "", fmt.Errorf("narrator current focus has %d characters, maximum is %d", count, maxNarratorCurrentFocusRunes)
	}
	return text, nil
}
