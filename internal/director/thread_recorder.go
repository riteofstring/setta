package director

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// Watching what one Director turn actually did.
//
// Tool calls happen inside the provider turn, so by the time the turn returns
// the app already changed. The recorder is how the turn reports that honestly:
// every call is recorded when it is made and every receipt when it comes back,
// including the ones that failed, because a call the Director made and Setta
// refused is exactly what the Director needs to see to ask a useful question
// instead of claiming success.
//
// Recording the call before running it is what makes a crash mid-handler
// readable: the durable conversation says the Director called something and
// never heard back, which is true, instead of losing the call entirely.
//
// A failed handler is not an error the turn aborts on. Setta hands an expected
// refusal or a sanitized unexpected failure back to the Director as the call's
// own result and lets the same turn continue, which is what keeps recovery
// inside the Director conversation rather than in a second router beside it.

type recordedDirectorToolCall struct {
	tool      string
	reported  SettaToolReceipt
	succeeded bool
}

// directorToolPersistence makes one call durable as it happens.
type directorToolPersistence struct {
	// begin records the call and returns the durable entry id its receipt will
	// answer.
	begin func(ctx context.Context, tool string, arguments json.RawMessage) (string, error)
	// finish records what that call reported back.
	finish func(ctx context.Context, callID string, receipt SettaToolReceipt, succeeded bool) error
}

type directorToolRecorder struct {
	recorded    []recordedDirectorToolCall
	persistence directorToolPersistence
}

// instrument wraps each tool so the turn keeps what its handler was asked to do
// and what it reported back.
func (recorder *directorToolRecorder) instrument(tools []SettaTool) []SettaTool {
	instrumented := make([]SettaTool, 0, len(tools))
	for _, tool := range tools {
		instrumented = append(instrumented, SettaTool{
			Name:        tool.Name,
			Description: tool.Description,
			InputSchema: tool.InputSchema,
			Handler:     recorder.record(tool),
		})
	}
	return instrumented
}

func (recorder *directorToolRecorder) record(tool SettaTool) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		callID, err := recorder.persistence.begin(ctx, tool.Name, normalizedDirectorToolArguments(arguments))
		if err != nil {
			return SettaToolReceipt{}, err
		}
		receipt, err := tool.Handler(ctx, arguments)
		if err != nil {
			// A cancelled turn is the app going away, not a tool the Director
			// should be told to try differently.
			if ctxErr := ctx.Err(); ctxErr != nil {
				return SettaToolReceipt{}, ctxErr
			}
			return recorder.refuse(ctx, callID, tool.Name, err)
		}
		receipt.Tool = tool.Name
		return receipt, recorder.append(ctx, callID, receipt, true)
	}
}

// refuse turns a handler failure into the receipt the Director receives.
// Product-rule rejections name the actionable reason; unexpected implementation
// failures are sanitized before they reach the durable conversation.
func (recorder *directorToolRecorder) refuse(
	ctx context.Context,
	callID string,
	tool string,
	cause error,
) (SettaToolReceipt, error) {
	receipt := SettaToolReceipt{
		Tool:    tool,
		Summary: directorToolRefusal(cause),
	}
	if err := recorder.append(ctx, callID, receipt, false); err != nil {
		return SettaToolReceipt{}, err
	}
	return receipt, nil
}

func directorToolRefusal(cause error) string {
	if errors.Is(cause, ErrDirectorIntentRejected) {
		return fmt.Sprintf("Setta refused this call: %s", cause)
	}
	// An unexpected store, provider, or execution error is not a tool receipt
	// the user can act on. Keep its implementation text out of the durable
	// Director conversation and graph while saying truthfully that the current
	// app state must be checked before another attempt.
	return "Setta could not complete this call. Check Setta's current state before trying again."
}

func (recorder *directorToolRecorder) append(
	ctx context.Context,
	callID string,
	receipt SettaToolReceipt,
	succeeded bool,
) error {
	if err := recorder.persistence.finish(ctx, callID, receipt, succeeded); err != nil {
		return err
	}
	recorder.recorded = append(recorder.recorded, recordedDirectorToolCall{
		tool:      receipt.Tool,
		reported:  receipt,
		succeeded: succeeded,
	})
	return nil
}

// calls reports the turn's tool activity in the order it happened.
func (recorder *directorToolRecorder) calls() []DirectorToolCall {
	calls := make([]DirectorToolCall, 0, len(recorder.recorded))
	for _, recorded := range recorder.recorded {
		calls = append(calls, DirectorToolCall{
			Tool:                 recorded.tool,
			Succeeded:            recorded.succeeded,
			Summary:              recorded.reported.Summary,
			WorkstreamID:         copyOptionalString(recorded.reported.WorkstreamID),
			SelectedWorkstreamID: copyOptionalString(recorded.reported.SelectedWorkstreamID),
		})
	}
	return calls
}

// normalizedDirectorToolArguments keeps a durable entry valid when a provider
// calls a no-argument tool with nothing at all.
func normalizedDirectorToolArguments(arguments json.RawMessage) json.RawMessage {
	if len(arguments) == 0 || !json.Valid(arguments) {
		return json.RawMessage("{}")
	}
	return arguments
}
