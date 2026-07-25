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
// every call and its receipt is captured as it happens, including the ones that
// failed, because a call the Director made and Setta refused is exactly what the
// Director needs to see to ask a useful question instead of claiming success.
//
// A failed handler is not an error the turn aborts on. Setta hands the specific
// reason back to the Director as the call's own result and lets the same turn
// continue, which is what keeps recovery inside the Director conversation rather
// than in a second router beside it.

type recordedDirectorToolCall struct {
	tool      string
	arguments json.RawMessage
	// receipt is the encoded form the Director received, kept verbatim so the
	// durable conversation replays what the Director was actually told.
	receipt   json.RawMessage
	reported  SettaToolReceipt
	succeeded bool
}

type persistDirectorToolCall func(
	context.Context,
	recordedDirectorToolCall,
	bool,
) error

type directorToolRecorder struct {
	recorded []recordedDirectorToolCall
	persist  persistDirectorToolCall
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
		receipt, err := tool.Handler(ctx, arguments)
		if err != nil {
			// A cancelled turn is the app going away, not a tool the Director
			// should be told to try differently.
			if ctxErr := ctx.Err(); ctxErr != nil {
				return SettaToolReceipt{}, ctxErr
			}
			return recorder.refuse(ctx, tool.Name, arguments, err)
		}
		receipt.Tool = tool.Name
		return receipt, recorder.append(ctx, tool.Name, arguments, receipt, true)
	}
}

// refuse turns a handler failure into the receipt the Director receives. The
// message is the app's own specific reason, so the Director can call the right
// tool or ask the user a real question instead of reporting an internal fault.
func (recorder *directorToolRecorder) refuse(
	ctx context.Context,
	tool string,
	arguments json.RawMessage,
	cause error,
) (SettaToolReceipt, error) {
	receipt := SettaToolReceipt{
		Tool:    tool,
		Summary: directorToolRefusal(cause),
	}
	if err := recorder.append(ctx, tool, arguments, receipt, false); err != nil {
		return SettaToolReceipt{}, err
	}
	return receipt, nil
}

func directorToolRefusal(cause error) string {
	if errors.Is(cause, ErrDirectorIntentRejected) {
		return fmt.Sprintf("Setta refused this call: %s", cause)
	}
	return fmt.Sprintf("Setta could not complete this call: %s", cause)
}

func (recorder *directorToolRecorder) append(
	ctx context.Context,
	tool string,
	arguments json.RawMessage,
	receipt SettaToolReceipt,
	succeeded bool,
) error {
	encoded, err := json.Marshal(receipt)
	if err != nil {
		return fmt.Errorf("encode setta tool receipt %s: %w", tool, err)
	}
	recorded := recordedDirectorToolCall{
		tool:      tool,
		arguments: normalizedDirectorToolArguments(arguments),
		receipt:   encoded,
		reported:  receipt,
		succeeded: succeeded,
	}
	if recorder.persist != nil {
		if err := recorder.persist(ctx, recorded, len(recorder.recorded) == 0); err != nil {
			return err
		}
	}
	recorder.recorded = append(recorder.recorded, recorded)
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

// normalizedDirectorToolArguments keeps a durable row valid when a provider
// calls a no-argument tool with nothing at all.
func normalizedDirectorToolArguments(arguments json.RawMessage) json.RawMessage {
	if len(arguments) == 0 || !json.Valid(arguments) {
		return json.RawMessage("{}")
	}
	return arguments
}
