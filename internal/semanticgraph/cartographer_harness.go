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
	result, err := harness.RunRaw(ctx, task)
	if err != nil {
		return CartographerHarnessResult{}, err
	}
	if err := ValidateCartographerPatchEnvelopeShape(result.PatchEnvelope); err != nil {
		return CartographerHarnessResult{}, err
	}
	return result, nil
}

func (harness *CartographerHarness) RunRaw(ctx context.Context, task CartographerHarnessTask) (CartographerHarnessResult, error) {
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
			Prompt:    ProductionCartographerPrompt(),
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
	return CartographerHarnessResult{PatchEnvelope: result.StructuredOutput, Audit: result.Audit}, nil
}

func ProductionCartographerPrompt() string {
	return `You are Setta's semantic cartographer. Return only a strict JSON semantic graph patch envelope that matches the supplied JSON schema.

Use only ids, source refs, semantic nodes, edges, evidence anchors, activity intervals, steering directives, context packs, and trajectory summaries that are present in the input bundle. Do not invent source refs or evidence.

Emit an empty patches array when no evidence-backed semantic update is warranted. For uncertain, low-confidence, broad, destructive, split, merge, resolution, or high-impact changes, set reviewRequired to true.

When new workflow-agent output states an explicit finding, decision, constraint, or open question that is not already represented in existingNodes, emit the corresponding record_finding, record_decision, record_constraint, or record_open_question patch instead of an empty envelope. For a new finding, put the new node in payload.newNode, leave payload.semanticNodeId empty, use kind "finding", use scope "session" unless the finding is clearly workspace-wide, and cite evidenceRefs from non-empty source refs in the input bundle, such as {"sourceKind":"chat_message","sourceId":sourceRefs.chatMessageId} or {"sourceKind":"workflow_node","sourceId":sourceRefs.workflowNodeId}.

Generate patchId and any new semanticNodeId, edgeId, or activityId values with only letters, numbers, underscores, or hyphens. Do not copy event refs, stream refs, source ids, or other values containing colons or punctuation into generated ids; derive a short safe id instead.

Every patch must include confidence as a JSON number from 0.0 through 1.0, a publicSummary suitable for user inspection, sourceRefs matching the input bundle, causationId, correlationId, modelInfo, and explicit evidenceRefs when evidence is required.

Because the output schema is strict, include every required payload field; set unused string fields to "", unused arrays to [], unused nested objects to null, and unused nullable kind fields to null.

Do not include chain-of-thought, private reasoning, large raw transcripts, complete logs, complete diffs, complete files, markdown fences, prose outside JSON, or best-effort explanations.`
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
          "sourceRefs": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "workflowDefinitionId",
              "workflowExecutionId",
              "workflowNodeId",
              "workflowNodeExecutionId",
              "chatConversationId",
              "chatRunId",
              "chatMessageId",
              "runItemId"
            ],
            "properties": {
              "workflowDefinitionId": {"type": "string"},
              "workflowExecutionId": {"type": "string"},
              "workflowNodeId": {"type": "string"},
              "workflowNodeExecutionId": {"type": "string"},
              "chatConversationId": {"type": "string"},
              "chatRunId": {"type": "string"},
              "chatMessageId": {"type": "string"},
              "runItemId": {"type": "string"}
            }
          },
          "causationId": {"type": "string"},
          "correlationId": {"type": "string"},
          "confidence": {"type": "number", "minimum": 0, "maximum": 1},
          "publicSummary": {"type": "string"},
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["sourceKind", "sourceId", "evidenceAnchorId"],
              "properties": {
                "sourceKind": {"type": "string"},
                "sourceId": {"type": "string"},
                "evidenceAnchorId": {"type": "string"}
              }
            }
          },
          "modelInfo": {
            "type": "object",
            "additionalProperties": false,
            "required": ["provider", "model", "responseId"],
            "properties": {
              "provider": {"type": "string"},
              "model": {"type": "string"},
              "responseId": {"type": "string"}
            }
          },
          "reviewRequired": {"type": "boolean"},
          "payload": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "semanticNodeId",
              "targetEntityId",
              "newNode",
              "summary",
              "edgeId",
              "edgeKind",
              "fromNodeId",
              "toNodeId",
              "label",
              "activityId",
              "activityKind",
              "activitySourceKind",
              "activitySourceId",
              "evidenceAnchorId",
              "sourceNodeId",
              "newNodes",
              "sourceNodeIds",
              "targetNode",
              "resolutionNodeId",
              "evidenceRefs",
              "reassignments"
            ],
            "properties": {
              "semanticNodeId": {"type": "string"},
              "targetEntityId": {"type": "string"},
              "newNode": {
                "type": ["object", "null"],
                "additionalProperties": false,
                "required": ["semanticNodeId", "kind", "label", "summary", "scope", "evidenceRefs"],
                "properties": {
                  "semanticNodeId": {"type": "string"},
                  "kind": {
                    "type": "string",
                    "enum": ["concept", "question", "hypothesis", "finding", "decision", "constraint"]
                  },
                  "label": {"type": "string"},
                  "summary": {"type": "string"},
                  "scope": {
                    "type": "string",
                    "enum": ["session", "workspace"]
                  },
                  "evidenceRefs": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["sourceKind", "sourceId", "evidenceAnchorId"],
                      "properties": {
                        "sourceKind": {"type": "string"},
                        "sourceId": {"type": "string"},
                        "evidenceAnchorId": {"type": "string"}
                      }
                    }
                  }
                }
              },
              "summary": {"type": "string"},
              "edgeId": {"type": "string"},
              "edgeKind": {"type": ["string", "null"]},
              "fromNodeId": {"type": "string"},
              "toNodeId": {"type": "string"},
              "label": {"type": "string"},
              "activityId": {"type": "string"},
              "activityKind": {"type": ["string", "null"]},
              "activitySourceKind": {"type": ["string", "null"]},
              "activitySourceId": {"type": "string"},
              "evidenceAnchorId": {"type": "string"},
              "sourceNodeId": {"type": "string"},
              "newNodes": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["semanticNodeId", "kind", "label", "summary", "scope", "evidenceRefs"],
                  "properties": {
                    "semanticNodeId": {"type": "string"},
                    "kind": {
                      "type": "string",
                      "enum": ["concept", "question", "hypothesis", "finding", "decision", "constraint"]
                    },
                    "label": {"type": "string"},
                    "summary": {"type": "string"},
                    "scope": {
                      "type": "string",
                      "enum": ["session", "workspace"]
                    },
                    "evidenceRefs": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["sourceKind", "sourceId", "evidenceAnchorId"],
                        "properties": {
                          "sourceKind": {"type": "string"},
                          "sourceId": {"type": "string"},
                          "evidenceAnchorId": {"type": "string"}
                        }
                      }
                    }
                  }
                }
              },
              "sourceNodeIds": {"type": "array", "items": {"type": "string"}},
              "targetNode": {
                "type": ["object", "null"],
                "additionalProperties": false,
                "required": ["semanticNodeId", "kind", "label", "summary", "scope", "evidenceRefs"],
                "properties": {
                  "semanticNodeId": {"type": "string"},
                  "kind": {
                    "type": "string",
                    "enum": ["concept", "question", "hypothesis", "finding", "decision", "constraint"]
                  },
                  "label": {"type": "string"},
                  "summary": {"type": "string"},
                  "scope": {
                    "type": "string",
                    "enum": ["session", "workspace"]
                  },
                  "evidenceRefs": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["sourceKind", "sourceId", "evidenceAnchorId"],
                      "properties": {
                        "sourceKind": {"type": "string"},
                        "sourceId": {"type": "string"},
                        "evidenceAnchorId": {"type": "string"}
                      }
                    }
                  }
                }
              },
              "resolutionNodeId": {"type": "string"},
              "evidenceRefs": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["sourceKind", "sourceId", "evidenceAnchorId"],
                  "properties": {
                    "sourceKind": {"type": "string"},
                    "sourceId": {"type": "string"},
                    "evidenceAnchorId": {"type": "string"}
                  }
                }
              },
              "reassignments": {
                "type": "object",
                "additionalProperties": false,
                "required": ["edges", "evidence", "activity", "steering", "layout"],
                "properties": {
                  "edges": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["edgeId", "targetEdgeId", "fromNodeId", "toNodeId"],
                      "properties": {
                        "edgeId": {"type": "string"},
                        "targetEdgeId": {"type": "string"},
                        "fromNodeId": {"type": "string"},
                        "toNodeId": {"type": "string"}
                      }
                    }
                  },
                  "evidence": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["anchorId", "targetNodeId"],
                      "properties": {
                        "anchorId": {"type": "string"},
                        "targetNodeId": {"type": "string"}
                      }
                    }
                  },
                  "activity": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["activityIntervalId", "targetNodeId"],
                      "properties": {
                        "activityIntervalId": {"type": "string"},
                        "targetNodeId": {"type": "string"}
                      }
                    }
                  },
                  "steering": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["directiveId", "targetNodeId"],
                      "properties": {
                        "directiveId": {"type": "string"},
                        "targetNodeId": {"type": "string"}
                      }
                    }
                  },
                  "layout": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["entityId", "targetEntityId"],
                      "properties": {
                        "entityId": {"type": "string"},
                        "targetEntityId": {"type": "string"}
                      }
                    }
                  }
                }
              }
            }
          }
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
