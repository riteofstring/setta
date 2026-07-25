package director

import (
	"bytes"
	"encoding/json"
	"fmt"

	"setta/internal/jsonio"
)

// Decoding model output back into a typed decision.
//
// Decoding is strict and rejects unknown fields, so a provider that adds a
// property to a branch fails here rather than producing a decision with a
// field nothing validated. Every failure is a typed DecisionRejection, because
// the recovery policy routes on the reason.

type decisionWireEnvelope struct {
	Decision json.RawMessage `json:"decision"`
}

type decisionWireHeader struct {
	Kind DirectorDecisionKind `json:"kind"`
}

type decisionWireText struct {
	Kind DirectorDecisionKind `json:"kind"`
	Text string               `json:"text"`
}

type decisionWireQuestion struct {
	Kind     DirectorDecisionKind `json:"kind"`
	Question string               `json:"question"`
}

type decisionWireWorkstream struct {
	Kind         DirectorDecisionKind `json:"kind"`
	WorkstreamID string               `json:"workstreamId"`
}

type decisionWireWorkstreamInput struct {
	Kind          DirectorDecisionKind `json:"kind"`
	WorkstreamID  string               `json:"workstreamId"`
	AuthoredInput string               `json:"authoredInput"`
}

type decisionWireRecover struct {
	Kind           DirectorDecisionKind `json:"kind"`
	WorkstreamID   string               `json:"workstreamId"`
	FailureEventID string               `json:"failureEventId"`
}

type decisionWireCreate struct {
	Kind          DirectorDecisionKind `json:"kind"`
	Origin        json.RawMessage      `json:"origin"`
	InitialInput  string               `json:"initialInput"`
	ProposedTitle string               `json:"proposedTitle"`
}

type decisionWireOriginHeader struct {
	Kind WorkstreamCreationOriginKind `json:"kind"`
}

type decisionWireRootPayload struct {
	ResourceScope DecisionResourceScope `json:"resourceScope"`
}

type decisionWireRootOrigin struct {
	Kind WorkstreamCreationOriginKind `json:"kind"`
	Root decisionWireRootPayload      `json:"root"`
}

type decisionWireChildOrigin struct {
	Kind  WorkstreamCreationOriginKind `json:"kind"`
	Child ChildWorkstreamOrigin        `json:"child"`
}

type decisionWireForkOrigin struct {
	Kind WorkstreamCreationOriginKind `json:"kind"`
	Fork ForkWorkstreamOrigin         `json:"fork"`
}

// DecodeDecisionOutput decodes one provider response and validates it against
// the same trusted context that produced its schema.
func DecodeDecisionOutput(raw json.RawMessage, context DirectorDecisionContext) (DirectorDecision, error) {
	var envelope decisionWireEnvelope
	if err := decodeDecisionWire(raw, &envelope); err != nil {
		return DirectorDecision{}, err
	}
	var header decisionWireHeader
	if err := json.Unmarshal(envelope.Decision, &header); err != nil {
		return DirectorDecision{}, newDecisionRejection(
			DecisionRejectedMalformedOutput,
			fmt.Sprintf("decode director decision kind: %v", err),
		)
	}
	if !isDirectorDecisionKind(header.Kind) {
		return DirectorDecision{}, newDecisionRejection(
			DecisionRejectedUnknownKind,
			fmt.Sprintf("unknown director decision kind %q", header.Kind),
		)
	}
	if !context.allowsKind(header.Kind) {
		return DirectorDecision{}, newDecisionRejection(
			DecisionRejectedUnauthorizedKind,
			fmt.Sprintf("decision kind %q is not allowed by the supplied context", header.Kind),
		)
	}
	decision, err := decodeDecisionPayload(envelope.Decision, header.Kind)
	if err != nil {
		return DirectorDecision{}, err
	}
	if err := ValidateDecisionAuthority(context, decision); err != nil {
		return DirectorDecision{}, err
	}
	return decision, nil
}

func decodeDecisionPayload(raw json.RawMessage, kind DirectorDecisionKind) (DirectorDecision, error) {
	switch kind {
	case DirectorDecisionAnswerDirectly:
		return decodeAnswerDecision(raw)
	case DirectorDecisionAskClarification:
		return decodeClarificationDecision(raw)
	case DirectorDecisionSelectWorkstream:
		return decodeSelectDecision(raw)
	case DirectorDecisionSendToWorkstream, DirectorDecisionQueueBehindRun, DirectorDecisionSteerRun:
		return decodeWorkstreamWorkDecision(raw, kind)
	case DirectorDecisionRecoverPath:
		return decodeRecoverDecision(raw)
	case DirectorDecisionCreateWorkstream:
		return decodeCreateDecision(raw)
	default:
		return DirectorDecision{}, newDecisionRejection(
			DecisionRejectedUnknownKind,
			fmt.Sprintf("unknown director decision kind %q", kind),
		)
	}
}

func decodeAnswerDecision(raw json.RawMessage) (DirectorDecision, error) {
	var wire decisionWireText
	if err := decodeDecisionWire(raw, &wire); err != nil {
		return DirectorDecision{}, err
	}
	return DirectorDecision{
		Kind:           DirectorDecisionAnswerDirectly,
		AnswerDirectly: &AnswerDirectlyDecision{Text: wire.Text},
	}, nil
}

func decodeClarificationDecision(raw json.RawMessage) (DirectorDecision, error) {
	var wire decisionWireQuestion
	if err := decodeDecisionWire(raw, &wire); err != nil {
		return DirectorDecision{}, err
	}
	return DirectorDecision{
		Kind:             DirectorDecisionAskClarification,
		AskClarification: &AskClarificationDecision{Question: wire.Question},
	}, nil
}

func decodeSelectDecision(raw json.RawMessage) (DirectorDecision, error) {
	var wire decisionWireWorkstream
	if err := decodeDecisionWire(raw, &wire); err != nil {
		return DirectorDecision{}, err
	}
	return DirectorDecision{
		Kind:             DirectorDecisionSelectWorkstream,
		SelectWorkstream: &SelectWorkstreamDecision{WorkstreamID: wire.WorkstreamID},
	}, nil
}

func decodeWorkstreamWorkDecision(raw json.RawMessage, kind DirectorDecisionKind) (DirectorDecision, error) {
	var wire decisionWireWorkstreamInput
	if err := decodeDecisionWire(raw, &wire); err != nil {
		return DirectorDecision{}, err
	}
	switch kind {
	case DirectorDecisionSendToWorkstream:
		return DirectorDecision{Kind: kind, SendToWorkstream: &SendToWorkstreamDecision{
			WorkstreamID: wire.WorkstreamID, AuthoredInput: wire.AuthoredInput,
		}}, nil
	case DirectorDecisionQueueBehindRun:
		return DirectorDecision{Kind: kind, QueueBehindRun: &QueueBehindRunDecision{
			WorkstreamID: wire.WorkstreamID, AuthoredInput: wire.AuthoredInput,
		}}, nil
	case DirectorDecisionSteerRun:
		return DirectorDecision{Kind: kind, SteerRun: &SteerRunDecision{
			WorkstreamID: wire.WorkstreamID, AuthoredInput: wire.AuthoredInput,
		}}, nil
	default:
		return DirectorDecision{}, newDecisionRejection(
			DecisionRejectedUnknownKind,
			fmt.Sprintf("director decision %q does not carry authored input", kind),
		)
	}
}

func decodeRecoverDecision(raw json.RawMessage) (DirectorDecision, error) {
	var wire decisionWireRecover
	if err := decodeDecisionWire(raw, &wire); err != nil {
		return DirectorDecision{}, err
	}
	return DirectorDecision{Kind: DirectorDecisionRecoverPath, RecoverPath: &RecoverPathDecision{
		WorkstreamID: wire.WorkstreamID, FailureEventID: wire.FailureEventID,
	}}, nil
}

func decodeCreateDecision(raw json.RawMessage) (DirectorDecision, error) {
	var wire decisionWireCreate
	if err := decodeDecisionWire(raw, &wire); err != nil {
		return DirectorDecision{}, err
	}
	origin, err := decodeCreationOrigin(wire.Origin)
	if err != nil {
		return DirectorDecision{}, err
	}
	return DirectorDecision{Kind: DirectorDecisionCreateWorkstream, CreateWorkstream: &CreateWorkstreamDecision{
		Origin: origin, InitialInput: wire.InitialInput, ProposedTitle: wire.ProposedTitle,
	}}, nil
}

func decodeCreationOrigin(raw json.RawMessage) (WorkstreamCreationOrigin, error) {
	var header decisionWireOriginHeader
	if err := json.Unmarshal(raw, &header); err != nil {
		return WorkstreamCreationOrigin{}, newDecisionRejection(
			DecisionRejectedMalformedOutput,
			fmt.Sprintf("decode workstream creation origin kind: %v", err),
		)
	}
	if !isWorkstreamCreationOriginKind(header.Kind) {
		return WorkstreamCreationOrigin{}, newDecisionRejection(
			DecisionRejectedInvalidPayload,
			fmt.Sprintf("unknown workstream creation origin %q", header.Kind),
		)
	}
	return decodeCreationOriginPayload(raw, header.Kind)
}

func decodeCreationOriginPayload(
	raw json.RawMessage,
	kind WorkstreamCreationOriginKind,
) (WorkstreamCreationOrigin, error) {
	switch kind {
	case WorkstreamCreationRoot:
		var wire decisionWireRootOrigin
		if err := decodeDecisionWire(raw, &wire); err != nil {
			return WorkstreamCreationOrigin{}, err
		}
		return WorkstreamCreationOrigin{
			Kind: kind,
			Root: &RootWorkstreamOrigin{ResourceScope: wire.Root.ResourceScope},
		}, nil
	case WorkstreamCreationChild:
		var wire decisionWireChildOrigin
		if err := decodeDecisionWire(raw, &wire); err != nil {
			return WorkstreamCreationOrigin{}, err
		}
		child := wire.Child
		return WorkstreamCreationOrigin{Kind: kind, Child: &child}, nil
	case WorkstreamCreationFork:
		var wire decisionWireForkOrigin
		if err := decodeDecisionWire(raw, &wire); err != nil {
			return WorkstreamCreationOrigin{}, err
		}
		fork := wire.Fork
		return WorkstreamCreationOrigin{Kind: kind, Fork: &fork}, nil
	default:
		return WorkstreamCreationOrigin{}, newDecisionRejection(
			DecisionRejectedInvalidPayload,
			fmt.Sprintf("unknown workstream creation origin %q", kind),
		)
	}
}

func decodeDecisionWire(raw json.RawMessage, target any) error {
	if err := jsonio.DecodeSingle(bytes.NewReader(raw), target); err != nil {
		return newDecisionRejection(
			DecisionRejectedMalformedOutput,
			fmt.Sprintf("decode director decision output: %v", err),
		)
	}
	return nil
}
