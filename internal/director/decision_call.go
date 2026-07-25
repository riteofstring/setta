package director

import (
	"encoding/json"
	"fmt"
)

// What the Director is actually sent.
//
// The protocol owns this rather than the caller that reaches the provider,
// because the bytes a decision was authorized against are part of the decision
// contract: the trusted context is the model's entire authority, and the schema
// is generated from that same context. The caller behind DecisionCaller owns
// provider identity, credentials, and accounting, and owns nothing about what
// the Director is told.
//
// The context is the top-level object rather than a field inside an envelope,
// because the task directive addresses it by path — a nested context would make
// every path in the frozen directive wrong. The retry diagnostic joins it as one
// sibling field: it is the only thing a second attempt learns about the first,
// and it is a fixed sentence keyed by the typed rejection, so provider text,
// user text, and internal error strings never reach a retry prompt.

// decisionCallPayload is the exact object one decision call carries. Embedding
// the context inlines its fields, so `intent.text` stays `intent.text`.
type decisionCallPayload struct {
	DirectorDecisionContext
	// ValidationDiagnostic is null on a first attempt.
	ValidationDiagnostic *string `json:"validationDiagnostic"`
}

// DecisionCallInput freezes one call into the bytes the provider receives. The
// context is validated again here: the input is the last place the app can prove
// the authority it is about to hand over is authority it materialized.
func DecisionCallInput(call DecisionCall) (json.RawMessage, error) {
	if err := call.Context.Validate(); err != nil {
		return nil, fmt.Errorf("materialize director decision call context: %w", err)
	}
	if len(call.Schema) == 0 {
		return nil, fmt.Errorf("director decision call requires the output schema generated from its context")
	}
	payload := decisionCallPayload{DirectorDecisionContext: call.Context}
	if call.Diagnostic != "" {
		if err := validateTrimmedText("director decision call diagnostic", call.Diagnostic); err != nil {
			return nil, err
		}
		diagnostic := call.Diagnostic
		payload.ValidationDiagnostic = &diagnostic
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode director decision call: %w", err)
	}
	return encoded, nil
}

// DirectorDecisionRole is the sentence the Director decides under, prepended to
// DecisionInstructions by the caller that owns the provider thread. Setta's
// app-global router is the product role; the instructions that follow it are the
// protocol's own rules.
const DirectorDecisionRole = "You are Setta's Director: the app-global router that turns one user request into exactly one typed decision. " +
	"You cannot execute effects. Setta validates your decision and controls every effect it authorizes."

// DecisionThreadInstructions is the whole developer contract one decision turn
// runs under: the product role plus the protocol's rules. It exists so the
// caller that reaches a provider composes nothing about what the Director is
// allowed to decide.
func DecisionThreadInstructions() string {
	return DirectorDecisionRole + "\n\n" + DecisionInstructions()
}
