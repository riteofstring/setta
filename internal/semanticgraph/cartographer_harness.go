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
	ID              string
	Workspace       workspace.WorkspaceSummary
	InputBundle     CartographerInputBundle
	OutputSchema    CartographerPatchEnvelopeSchema
	Model           string
	ReasoningEffort chat.ReasoningEffort
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
	reasoningEffort := task.ReasoningEffort
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
			ID:              task.ID,
			Workspace:       task.Workspace,
			Prompt:          ProductionCartographerPrompt(),
			Input:           inputJSON,
			Model:           task.Model,
			ReasoningEffort: &reasoningEffort,
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

retrievalResults are advisory candidate context with reasons such as explicit source links, FTS matches, exact path matches, recent activity, pins, and steering. Use them to decide which existing nodes, evidence, activity, or context packs are relevant, but do not treat retrieval text alone as semantic truth. Cite concrete evidence anchors or source refs from the input when proposing patches.

Optimize for useful public work memory, not narration. Prefer specific findings, decisions, constraints, and open questions that would help a user understand this run or help a future run continue the work. Discourage process-only nodes such as "reviewed repository" or "ran tests" unless the process choice is itself a durable decision or constraint.

For every new semantic node, include public whyItExists and futureUse text. whyItExists must state the evidence-backed reason the memory should exist beyond the current transcript. futureUse must state the concrete future work it should influence. Do not use these fields for private reasoning.

Emit an empty patches array when no evidence-backed semantic update is warranted. For uncertain, low-confidence, broad, destructive, split, merge, resolution, or high-impact changes, set reviewRequired to true. Split, merge, mark_resolved, broad update_node_summary, and low-confidence patches must be reviewRequired unless the input gives direct evidence and the change is narrow.

When new workflow-agent output states an explicit finding, decision, constraint, or open question that is not already represented in existingNodes, emit the corresponding record_finding, record_decision, record_constraint, or record_open_question patch instead of an empty envelope. For a new finding, put the new node in payload.newNode, leave payload.semanticNodeId empty, use kind "finding", use scope "session" unless the finding is clearly workspace-wide, and cite evidenceRefs from non-empty source refs in the input bundle, such as {"sourceKind":"chat_message","sourceId":sourceRefs.chatMessageId}, {"sourceKind":"run_item","sourceId":sourceRefs.runItemId}, or {"sourceKind":"workflow_node","sourceId":sourceRefs.workflowNodeId}.

Every automatic node must be inspectable and connected. Cite granular evidence from chat_message, run_item, file_range, diff, test, workflow_node, or a specific log/document anchor. Run-level workflow_execution, chat_run, or prompt evidence is not enough for a new automatic node. A node must have either source-link evidence or a semantic edge to an existing node or another new node in the same envelope.

Use create_edge when two semantic nodes are related by the same evidence or by existing context. Prefer supports, refutes, resolves, constrains, touches, about, or related_to exactly as supported by the schema. Use start_activity when the input shows active exploring, editing, debugging, validating, or blocked work tied to a concrete source; use end_activity for existing active intervals that the input shows are complete. Edge and activity patches need evidenceRefs too.

In workflow_done final synthesis, prioritize the final answer, workflow result/tool outputs, command/test results, file changes, failures, and existing semantic context. Promote the most useful concrete final findings or decisions, attach missed evidence, add relationships between related nodes, and avoid duplicate low-value session notes.

Generate patchId, causationId, correlationId, and any new semanticNodeId, edgeId, or activityId values with only letters, numbers, underscores, or hyphens. causationId and correlationId are generated patch metadata ids; they are not observed event refs. Do not copy event refs, stream refs, source ids, or other values containing colons or punctuation into generated ids; derive a short safe id such as cartographer_cause_final_finding or cartographer_corr_window_summary instead.

Every patch must include confidence as a JSON number from 0.0 through 1.0, a publicSummary suitable for user inspection, sourceRefs matching the input bundle, causationId, correlationId, modelInfo, and explicit evidenceRefs when evidence is required. Use confidence below 0.75 or reviewRequired true when the claim is plausible but not directly stated by the cited evidence.

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
          "patchId": {
            "type": "string",
            "description": "Generated safe id using only letters, numbers, underscores, or hyphens."
          },
          "operation": {
            "type": "string",
            "enum": ["record_finding", "record_decision", "record_constraint", "record_open_question", "update_node_summary", "attach_evidence", "create_edge", "start_activity", "end_activity", "split_node", "merge_nodes", "mark_resolved"]
          },
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
          "causationId": {
            "type": "string",
            "description": "Generated patch causation id using only letters, numbers, underscores, or hyphens. Do not copy observed event ids or stream ids that contain colons."
          },
          "correlationId": {
            "type": "string",
            "description": "Generated patch correlation id using only letters, numbers, underscores, or hyphens. Do not copy observed event ids or stream ids that contain colons."
          },
          "confidence": {"type": "number", "minimum": 0, "maximum": 1},
          "publicSummary": {"type": "string"},
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["sourceKind", "sourceId", "evidenceAnchorId"],
              "properties": {
                "sourceKind": {
                  "type": "string",
                  "enum": ["", "chat_message", "run_item", "file_range", "diff", "test", "workflow_node", "workflow_execution", "chat_run", "prompt", "log", "document"]
                },
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
                "required": ["semanticNodeId", "kind", "label", "summary", "whyItExists", "futureUse", "scope", "evidenceRefs"],
                "properties": {
                  "semanticNodeId": {"type": "string"},
                  "kind": {
                    "type": "string",
                    "enum": ["concept", "question", "hypothesis", "finding", "decision", "constraint"]
                  },
                  "label": {"type": "string"},
                  "summary": {"type": "string"},
                  "whyItExists": {"type": "string"},
                  "futureUse": {"type": "string"},
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
                        "sourceKind": {
                          "type": "string",
                          "enum": ["", "chat_message", "run_item", "file_range", "diff", "test", "workflow_node", "workflow_execution", "chat_run", "prompt", "log", "document"]
                        },
                        "sourceId": {"type": "string"},
                        "evidenceAnchorId": {"type": "string"}
                      }
                    }
                  }
                }
              },
              "summary": {"type": "string"},
              "edgeId": {"type": "string"},
              "edgeKind": {
                "type": ["string", "null"],
                "enum": ["about", "touches", "supports", "refutes", "resolves", "constrains", "related_to", null]
              },
              "fromNodeId": {"type": "string"},
              "toNodeId": {"type": "string"},
              "label": {"type": "string"},
              "activityId": {"type": "string"},
              "activityKind": {
                "type": ["string", "null"],
                "enum": ["exploring", "editing", "debugging", "validating", "blocked", null]
              },
              "activitySourceKind": {
                "type": ["string", "null"],
                "enum": ["workflow_execution", "workflow_node", "chat_run", "chat_message", "run_item", "file_range", "test", "diff", "command", null]
              },
              "activitySourceId": {"type": "string"},
              "evidenceAnchorId": {"type": "string"},
              "sourceNodeId": {"type": "string"},
              "newNodes": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["semanticNodeId", "kind", "label", "summary", "whyItExists", "futureUse", "scope", "evidenceRefs"],
                  "properties": {
                    "semanticNodeId": {"type": "string"},
                    "kind": {
                      "type": "string",
                      "enum": ["concept", "question", "hypothesis", "finding", "decision", "constraint"]
                    },
                    "label": {"type": "string"},
                    "summary": {"type": "string"},
                    "whyItExists": {"type": "string"},
                    "futureUse": {"type": "string"},
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
                          "sourceKind": {
                            "type": "string",
                            "enum": ["", "chat_message", "run_item", "file_range", "diff", "test", "workflow_node", "workflow_execution", "chat_run", "prompt", "log", "document"]
                          },
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
                "required": ["semanticNodeId", "kind", "label", "summary", "whyItExists", "futureUse", "scope", "evidenceRefs"],
                "properties": {
                  "semanticNodeId": {"type": "string"},
                  "kind": {
                    "type": "string",
                    "enum": ["concept", "question", "hypothesis", "finding", "decision", "constraint"]
                  },
                  "label": {"type": "string"},
                  "summary": {"type": "string"},
                  "whyItExists": {"type": "string"},
                  "futureUse": {"type": "string"},
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
                        "sourceKind": {
                          "type": "string",
                          "enum": ["", "chat_message", "run_item", "file_range", "diff", "test", "workflow_node", "workflow_execution", "chat_run", "prompt", "log", "document"]
                        },
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
                    "sourceKind": {
                      "type": "string",
                      "enum": ["", "chat_message", "run_item", "file_range", "diff", "test", "workflow_node", "workflow_execution", "chat_run", "prompt", "log", "document"]
                    },
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
	if !isSemanticCartographerReasoningEffort(task.ReasoningEffort) {
		return fmt.Errorf("cartographer harness task reasoningEffort is unsupported: %s", task.ReasoningEffort)
	}
	if len(task.OutputSchema) > 0 {
		var schema any
		if err := json.Unmarshal([]byte(task.OutputSchema), &schema); err != nil {
			return fmt.Errorf("cartographer output schema must be valid JSON: %w", err)
		}
	}
	return nil
}
