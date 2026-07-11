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

	"setta/internal/chat"
)

const easyRunNarratorSurfaceMetadata = "easy_run_narrator"

var narratorReasoningEffort = chat.ReasoningEffortMinimal

type narratorRunState struct {
	digest     *narratorDigestBuffer
	inFlight   bool
	lastCallAt time.Time
}

type terminalNarrationResult struct {
	err        error
	highlights []string
	summary    string
}

type narratorTaskInput struct {
	ArtifactCount      int                   `json:"artifactCount"`
	DigestEntries      []narratorDigestEntry `json:"digestEntries"`
	EasyRunID          string                `json:"easyRunId"`
	HighlightCount     int                   `json:"highlightCount"`
	MechanicalSummary  string                `json:"mechanicalSummary"`
	PreviousHighlights []string              `json:"previousHighlights"`
	RequestText        string                `json:"requestText"`
	Status             chat.RunStatus        `json:"status"`
	Terminal           bool                  `json:"terminal"`
	WorkspaceID        string                `json:"workspaceId"`
}

type narratorTaskOutput struct {
	Highlights []string `json:"highlights"`
	Summary    string   `json:"summary"`
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

func (service *Service) terminalNarratorTaskRequest(target terminalChatRunProjection) (chat.HarnessTaskRequest, error) {
	if err := service.validateTerminalNarratorReady(target); err != nil {
		return chat.HarnessTaskRequest{}, err
	}
	input, err := json.Marshal(narratorInputForTerminal(target))
	if err != nil {
		return chat.HarnessTaskRequest{}, fmt.Errorf("encode narrator input: %w", err)
	}
	taskID, err := service.newID("easy_run_narrator_task")
	if err != nil {
		return chat.HarnessTaskRequest{}, fmt.Errorf("create narrator task id: %w", err)
	}
	model, err := service.narratorModel(target.record.Run.WorkspaceID)
	if err != nil {
		return chat.HarnessTaskRequest{}, err
	}
	workspaceSummary, err := service.workspaces.ResolveWorkspace(target.record.Run.WorkspaceID)
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

func (service *Service) validateTerminalNarratorReady(target terminalChatRunProjection) error {
	if target.record.Run.NarratorStatus == EasyRunNarratorStatusDegraded {
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
	return terminalNarrationResult{highlights: highlights, summary: summary}
}

func narratorInputForTerminal(target terminalChatRunProjection) narratorTaskInput {
	previousHighlights := make([]string, 0, len(target.previousHighlights))
	for _, highlight := range target.previousHighlights {
		previousHighlights = append(previousHighlights, highlight.Text)
	}
	return narratorTaskInput{
		ArtifactCount:      target.record.Run.ArtifactCount,
		DigestEntries:      target.digest,
		EasyRunID:          target.record.Run.ID,
		HighlightCount:     target.record.Run.HighlightCount,
		MechanicalSummary:  target.mechanicalSummary,
		PreviousHighlights: previousHighlights,
		RequestText:        target.record.Run.RequestText,
		Status:             target.status,
		Terminal:           true,
		WorkspaceID:        target.record.Run.WorkspaceID,
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
	if len(output.Highlights) > maxEasyHighlightsPerNarratorCall {
		output.Highlights = output.Highlights[:maxEasyHighlightsPerNarratorCall]
	}
	return output, nil
}

func defaultNarratorOutputSchema() json.RawMessage {
	return json.RawMessage(`{
  "type": "object",
  "additionalProperties": false,
  "required": ["highlights", "summary"],
  "properties": {
    "highlights": {
      "type": "array",
      "items": {"type": "string"},
      "maxItems": 2
    },
    "summary": {"type": "string"}
  }
}`)
}

func productionNarratorPrompt() string {
	return `You are Setta's Easy Button narrator. Return only strict JSON matching the supplied schema.

Write for the Easy Button presentation plane, not for an engineering transcript. Highlights are sparse phase changes, not actions. Return an empty highlights array when the new evidence does not show a meaningful phase change. Never turn command names, file names, tests, retries, tool calls, approvals, or lifecycle mechanics into highlights by themselves.

For terminal requests, summary must be one or two plain-language sentences that answer what happened or what was produced. Do not mention commands, file paths, tool calls, provider events, transcripts, or agent mechanics. The service will append mechanical duration and artifact-count facts; do not invent them.

Use only the supplied request, previous highlights, mechanical facts, and digest entries. Do not include chain-of-thought, private reasoning, markdown fences, raw logs, diffs, or prose outside JSON.`
}
