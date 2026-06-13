package semanticgraph

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"setta/internal/chat"
	"setta/internal/workspace"
)

type CartographerPatchEnvelopeSchema json.RawMessage

type CartographerHarnessTask struct {
	ID           string
	Workspace    workspace.WorkspaceSummary
	InputBundle  CartographerInputBundle
	OutputSchema CartographerPatchEnvelopeSchema
	Model        string
}

type CartographerHarnessResult struct {
	PatchEnvelope json.RawMessage
	Audit         chat.HarnessAuditMetadata
}

type CartographerHarness struct {
	runner      chat.HarnessTaskRunner
	harnessKind chat.HarnessKind
}

func NewCartographerHarness(runner chat.HarnessTaskRunner, harnessKind chat.HarnessKind) (*CartographerHarness, error) {
	if runner == nil {
		return nil, errors.New("cartographer harness task runner is required")
	}
	if harnessKind == "" {
		return nil, errors.New("cartographer harness kind is required")
	}
	return &CartographerHarness{runner: runner, harnessKind: harnessKind}, nil
}

func (harness *CartographerHarness) Run(ctx context.Context, task CartographerHarnessTask) (CartographerHarnessResult, error) {
	if err := validateCartographerHarnessTask(ctx, task); err != nil {
		return CartographerHarnessResult{}, err
	}
	inputJSON, err := json.Marshal(task.InputBundle)
	if err != nil {
		return CartographerHarnessResult{}, fmt.Errorf("encode cartographer input bundle: %w", err)
	}
	outputSchema := json.RawMessage(task.OutputSchema)
	if len(outputSchema) == 0 {
		outputSchema = DefaultCartographerPatchEnvelopeSchema()
	}
	result, err := harness.runner.RunTask(ctx, chat.HarnessTaskRequest{
		Surface:     chat.HarnessSurfaceSemanticCartographer,
		HarnessKind: harness.harnessKind,
		TurnMode:    chat.HarnessTurnStructuredTask,
		OutputContract: chat.HarnessOutputContract{
			Kind:       chat.HarnessOutputStrictJSON,
			JSONSchema: outputSchema,
		},
		CapabilityPolicy: chat.HarnessCapabilityPolicy{
			AllowedTools:      []string{},
			WorkspaceMutation: false,
			Approvals:         false,
			Streaming:         false,
		},
		StructuredTask: &chat.HarnessStructuredTask{
			ID:        task.ID,
			Workspace: task.Workspace,
			Prompt:    "Return a strict JSON semantic cartographer patch envelope for the provided Setta trajectory input.",
			Input:     inputJSON,
			Model:     task.Model,
		},
		Metadata: map[string]string{
			"setta.surface": "semantic_cartographer",
		},
	})
	if err != nil {
		return CartographerHarnessResult{}, err
	}
	if result.Completion.Outcome != chat.TurnOutcomeCompleted {
		return CartographerHarnessResult{}, fmt.Errorf("cartographer harness task finished with outcome %s: %s", result.Completion.Outcome, result.Completion.ErrorMessage)
	}
	if err := ValidateCartographerPatchEnvelopeShape(result.StructuredOutput); err != nil {
		return CartographerHarnessResult{}, err
	}
	return CartographerHarnessResult{PatchEnvelope: result.StructuredOutput, Audit: result.Audit}, nil
}

func DefaultCartographerPatchEnvelopeSchema() json.RawMessage {
	return json.RawMessage(`{
  "type": "object",
  "additionalProperties": false,
  "required": ["patches"],
  "properties": {
    "patches": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "patchId",
          "operation",
          "workspaceId",
          "sourceRefs",
          "causationId",
          "correlationId",
          "confidence",
          "publicSummary",
          "evidenceRefs",
          "modelInfo",
          "reviewRequired",
          "payload"
        ],
        "properties": {
          "patchId": {"type": "string"},
          "operation": {"type": "string"},
          "workspaceId": {"type": "string"},
          "sourceRefs": {"type": "object"},
          "causationId": {"type": "string"},
          "correlationId": {"type": "string"},
          "confidence": {"type": "number", "minimum": 0, "maximum": 1},
          "publicSummary": {"type": "string"},
          "evidenceRefs": {"type": "array", "items": {"type": "object"}},
          "modelInfo": {"type": "object"},
          "reviewRequired": {"type": "boolean"},
          "payload": {"type": "object"}
        }
      }
    }
  }
}`)
}

func ValidateCartographerPatchEnvelopeShape(raw json.RawMessage) error {
	_, err := DecodeCartographerPatchEnvelope(raw)
	return err
}

func DecodeCartographerPatchEnvelope(raw json.RawMessage) (CartographerPatchEnvelope, error) {
	if len(raw) == 0 {
		return CartographerPatchEnvelope{}, errors.New("cartographer patch envelope is required")
	}
	var envelope CartographerPatchEnvelope
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&envelope); err != nil {
		return CartographerPatchEnvelope{}, fmt.Errorf("decode cartographer patch envelope: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return CartographerPatchEnvelope{}, errors.New("decode cartographer patch envelope: trailing JSON value")
		}
		return CartographerPatchEnvelope{}, fmt.Errorf("decode cartographer patch envelope trailing JSON: %w", err)
	}
	if envelope.Patches == nil {
		return CartographerPatchEnvelope{}, errors.New("cartographer patch envelope patches array is required")
	}
	for index := range envelope.Patches {
		normalizeCartographerPatch(&envelope.Patches[index])
		if envelope.Patches[index].ID == "" {
			return CartographerPatchEnvelope{}, fmt.Errorf("cartographer patch envelope patches[%d] patchId is required", index)
		}
	}
	return envelope, nil
}

func validateCartographerHarnessTask(ctx context.Context, task CartographerHarnessTask) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("cartographer task id", task.ID, "workspace id", task.Workspace.ID); err != nil {
		return err
	}
	if err := validateCartographerInputBundle(task.InputBundle, "cartographer harness input bundle"); err != nil {
		return err
	}
	if task.InputBundle.WorkspaceID != "" && task.InputBundle.WorkspaceID != task.Workspace.ID {
		return fmt.Errorf("cartographer input bundle workspaceId = %s, want %s", task.InputBundle.WorkspaceID, task.Workspace.ID)
	}
	if len(task.OutputSchema) > 0 {
		var schema any
		if err := json.Unmarshal([]byte(task.OutputSchema), &schema); err != nil {
			return fmt.Errorf("cartographer output schema must be valid JSON: %w", err)
		}
	}
	return nil
}
