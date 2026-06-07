package chat

import (
	"context"
	"encoding/json"
	"fmt"
)

func runScriptedStructuredHarnessTask(ctx context.Context, request HarnessTaskRequest) (HarnessTaskResult, error) {
	if err := ctx.Err(); err != nil {
		return HarnessTaskResult{}, err
	}
	if request.ConversationTurn != nil {
		return HarnessTaskResult{}, fmt.Errorf("%w: conversation turn cannot be run as structured task", ErrUnsupportedHarnessTask)
	}
	if request.StructuredTask == nil {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured task is required", ErrUnsupportedHarnessTask)
	}
	if request.Surface != HarnessSurfaceSemanticCartographer {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured surface %s", ErrUnsupportedHarnessTask, request.Surface)
	}
	if request.TurnMode != HarnessTurnStructuredTask {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured turn mode %s", ErrUnsupportedHarnessTask, request.TurnMode)
	}
	if request.OutputContract.Kind != HarnessOutputStrictJSON {
		return HarnessTaskResult{}, fmt.Errorf("%w: structured output contract %s", ErrUnsupportedHarnessTask, request.OutputContract.Kind)
	}
	output, err := json.Marshal(map[string]any{
		"patches": []map[string]any{{
			"id":         "cartographer_patch_scripted",
			"summary":    "Scripted cartographer patch envelope",
			"confidence": 100,
			"operations": []any{},
			"evidence":   []any{},
		}},
	})
	if err != nil {
		return HarnessTaskResult{}, err
	}
	return HarnessTaskResult{
		Completion:       TurnCompletion{Outcome: TurnOutcomeCompleted},
		StructuredOutput: json.RawMessage(output),
		Audit: HarnessAuditMetadata{
			HarnessKind: request.HarnessKind,
			Model:       request.StructuredTask.Model,
			RequestID:   "scripted-cartographer-request",
			ResponseID:  "scripted-cartographer-response",
			ThreadRef:   request.ThreadRef,
		},
	}, nil
}
