package conversation

import (
	"errors"
	"fmt"
)

const (
	MaxConversationRouteDecisionIDBytes = MaxConversationInputIDBytes
	MaxConversationRouteQuestionBytes   = 16 * 1024

	ConversationInputRoutingStartedEventKind   = "conversation.input.routing_started"
	ConversationInputRouteDecidedEventKind     = "conversation.input.route_decided"
	ConversationInputRoutingFailedEventKind    = "conversation.input.routing_failed"
	ConversationInputRoutingRetriedEventKind   = "conversation.input.routing_retried"
	ConversationInputRoutingRecoveredEventKind = "conversation.input.routing_recovered"
	ConversationInputDiscardedEventKind        = "conversation.input.discarded"

	ConversationInputDiscardedFailureCode = "conversation_input_discarded"
)

type ConversationRouteDecisionKind string
type ConversationRouteDecisionAuthority string

const (
	ConversationRouteDecisionKindSendToParent           ConversationRouteDecisionKind = "send_to_parent"
	ConversationRouteDecisionKindQueueParentTurn        ConversationRouteDecisionKind = "queue_parent_turn"
	ConversationRouteDecisionKindSteerParentTurn        ConversationRouteDecisionKind = "steer_parent_turn"
	ConversationRouteDecisionKindAnswerAsNarrator       ConversationRouteDecisionKind = "answer_as_narrator"
	ConversationRouteDecisionKindCreateSideConversation ConversationRouteDecisionKind = "create_side_conversation"
	ConversationRouteDecisionKindForkConversation       ConversationRouteDecisionKind = "fork_conversation"
	ConversationRouteDecisionKindEscalateToMaster       ConversationRouteDecisionKind = "escalate_to_master"
	ConversationRouteDecisionKindClarify                ConversationRouteDecisionKind = "clarify"

	ConversationRouteDecisionAuthorityNarratorModel    ConversationRouteDecisionAuthority = "narrator_model"
	ConversationRouteDecisionAuthorityProductInvariant ConversationRouteDecisionAuthority = "product_invariant"
)

type SendToParentConversationRouteDecision struct {
	AuthoredInput AuthoredInput `json:"authoredInput"`
}

type QueueParentTurnConversationRouteDecision struct {
	AuthoredInput AuthoredInput `json:"authoredInput"`
}

type SteerParentTurnConversationRouteDecision struct {
	AuthoredInput AuthoredInput `json:"authoredInput"`
}

type AnswerAsNarratorConversationRouteDecision struct {
	Question string `json:"question"`
}

type CreateSideConversationRouteDecision struct {
	Input AuthoredInput `json:"input"`
}

type ForkConversationRouteDecision struct {
	ForkedAtTurnID string        `json:"forkedAtTurnId"`
	Input          AuthoredInput `json:"input"`
	ProposedTitle  string        `json:"proposedTitle"`
}

type EscalateToMasterConversationRouteDecision struct {
	Input AuthoredInput `json:"input"`
}

type ClarifyConversationRouteDecision struct {
	Question string `json:"question"`
}

// ConversationRouteDecision is the complete authority an AI-authored local
// routing result may carry. The bound conversation, originating pane, provider
// references, and executable command ids remain trusted application state.
type ConversationRouteDecision struct {
	Kind                   ConversationRouteDecisionKind              `json:"kind"`
	SendToParent           *SendToParentConversationRouteDecision     `json:"sendToParent"`
	QueueParentTurn        *QueueParentTurnConversationRouteDecision  `json:"queueParentTurn"`
	SteerParentTurn        *SteerParentTurnConversationRouteDecision  `json:"steerParentTurn"`
	AnswerAsNarrator       *AnswerAsNarratorConversationRouteDecision `json:"answerAsNarrator"`
	CreateSideConversation *CreateSideConversationRouteDecision       `json:"createSideConversation"`
	ForkConversation       *ForkConversationRouteDecision             `json:"forkConversation"`
	EscalateToMaster       *EscalateToMasterConversationRouteDecision `json:"escalateToMaster"`
	Clarify                *ClarifyConversationRouteDecision          `json:"clarify"`
}

type SendToParentConversationRouteCommand struct {
	TurnID        string        `json:"turnId"`
	AuthoredInput AuthoredInput `json:"authoredInput"`
}

type QueueParentTurnConversationRouteCommand struct {
	TurnID        string        `json:"turnId"`
	AuthoredInput AuthoredInput `json:"authoredInput"`
}

type SteerParentTurnConversationRouteCommand struct {
	TargetTurnID  string        `json:"targetTurnId"`
	AuthoredInput AuthoredInput `json:"authoredInput"`
}

type AnswerAsNarratorConversationRouteCommand struct {
	RequestID string `json:"requestId"`
	Question  string `json:"question"`
}

type CreateSideConversationRouteCommand struct {
	SideConversationID string        `json:"sideConversationId"`
	ParentPaneID       string        `json:"parentPaneId"`
	TurnID             string        `json:"turnId"`
	Input              AuthoredInput `json:"input"`
}

type ForkConversationRouteCommand struct {
	ChildConversationID string        `json:"childConversationId"`
	ForkedAtTurnID      string        `json:"forkedAtTurnId"`
	TurnID              string        `json:"turnId"`
	Input               AuthoredInput `json:"input"`
	ProposedTitle       string        `json:"proposedTitle"`
}

type EscalateToMasterConversationRouteCommand struct {
	MasterInputID string        `json:"masterInputId"`
	Input         AuthoredInput `json:"input"`
}

type ClarifyConversationRouteCommand struct {
	Question string `json:"question"`
}

// ConversationRouteCommand is the trusted, idempotent command recorded with
// a local decision. Persisting both in one transaction means a committed input
// can never have a decision without the exact effect that must be replayed.
type ConversationRouteCommand struct {
	Kind                   ConversationRouteDecisionKind             `json:"kind"`
	SendToParent           *SendToParentConversationRouteCommand     `json:"sendToParent"`
	QueueParentTurn        *QueueParentTurnConversationRouteCommand  `json:"queueParentTurn"`
	SteerParentTurn        *SteerParentTurnConversationRouteCommand  `json:"steerParentTurn"`
	AnswerAsNarrator       *AnswerAsNarratorConversationRouteCommand `json:"answerAsNarrator"`
	CreateSideConversation *CreateSideConversationRouteCommand       `json:"createSideConversation"`
	ForkConversation       *ForkConversationRouteCommand             `json:"forkConversation"`
	EscalateToMaster       *EscalateToMasterConversationRouteCommand `json:"escalateToMaster"`
	Clarify                *ClarifyConversationRouteCommand          `json:"clarify"`
}

type ConversationRouteDecisionCommit struct {
	ID                   string                        `json:"id"`
	ConversationID       string                        `json:"conversationId"`
	InputID              string                        `json:"inputId"`
	ClarificationInputID *string                       `json:"clarificationInputId"`
	RoutingAttempt       int                           `json:"routingAttempt"`
	RouterContext        ConversationRouteContextAudit `json:"routerContext"`
	ResolvedInvocation   ResolvedInvocation            `json:"resolvedInvocation"`
	Decision             ConversationRouteDecision     `json:"decision"`
	ResultingCommand     ConversationRouteCommand      `json:"resultingCommand"`
	DecidedAt            string                        `json:"decidedAt"`
}

type ConversationRouteDecisionRecord struct {
	StreamSequence       int                           `json:"streamSequence"`
	ID                   string                        `json:"id"`
	ConversationID       string                        `json:"conversationId"`
	InputID              string                        `json:"inputId"`
	ClarificationInputID *string                       `json:"clarificationInputId"`
	RoutingAttempt       int                           `json:"routingAttempt"`
	RouterContext        ConversationRouteContextAudit `json:"routerContext"`
	ResolvedInvocation   ResolvedInvocation            `json:"resolvedInvocation"`
	Decision             ConversationRouteDecision     `json:"decision"`
	ResultingCommand     ConversationRouteCommand      `json:"resultingCommand"`
	DecidedAt            string                        `json:"decidedAt"`
}

// ConversationRouteContextAudit records the bounded authority supplied to a
// local AI routing call without retaining a second copy of the model input.
// The decision and resolved invocation remain independently inspectable while
// trajectory ranges and allowed variants prove the call's exact scope.
type ConversationRouteContextAudit struct {
	DecisionAuthority            ConversationRouteDecisionAuthority `json:"decisionAuthority"`
	InputSequence                int                                `json:"inputSequence"`
	ClarificationInputSequence   *int                               `json:"clarificationInputSequence"`
	LatestTrajectorySequence     int                                `json:"latestTrajectorySequence"`
	AvailableTrajectoryRange     *TrajectorySequenceRange           `json:"availableTrajectoryRange"`
	IncludedTrajectoryRange      *TrajectorySequenceRange           `json:"includedTrajectoryRange"`
	PriorNarrationCount          int                                `json:"priorNarrationCount"`
	PriorRouteDecisionCount      int                                `json:"priorRouteDecisionCount"`
	ValidCompletedForkPointCount int                                `json:"validCompletedForkPointCount"`
	AllowedDecisionKinds         []ConversationRouteDecisionKind    `json:"allowedDecisionKinds"`
}

// ConversationInputRoutingWork is the one store-claimed input exchange a
// router may evaluate. A clarification answer remains attached to the original
// input, and the prior clarification is supplied verbatim.
type ConversationInputRoutingWork struct {
	Input              AcceptedConversationInput        `json:"input"`
	ClarificationReply *AcceptedConversationInput       `json:"clarificationReply"`
	PriorClarification *ConversationRouteDecisionRecord `json:"priorClarification"`
	RoutingAttempt     int                              `json:"routingAttempt"`
	RoutingStartedAt   string                           `json:"routingStartedAt"`
}

type ConversationInputRoutingFailure struct {
	ConversationID       string  `json:"conversationId"`
	InputID              string  `json:"inputId"`
	ClarificationInputID *string `json:"clarificationInputId"`
	RoutingAttempt       int     `json:"routingAttempt"`
	Failure              Failure `json:"failure"`
	FailedAt             string  `json:"failedAt"`
}

type ConversationInputRoutingRetry struct {
	ConversationID string `json:"conversationId"`
	InputID        string `json:"inputId"`
	RoutingAttempt int    `json:"routingAttempt"`
	RetriedAt      string `json:"retriedAt"`
}

type ConversationInputRoutingRecovery struct {
	ConversationID string `json:"conversationId"`
	InputID        string `json:"inputId"`
	RoutingAttempt int    `json:"routingAttempt"`
	RecoveredAt    string `json:"recoveredAt"`
}

type ConversationInputDiscard struct {
	ConversationID   string `json:"conversationId"`
	InputID          string `json:"inputId"`
	RequestedInputID string `json:"requestedInputId"`
	DiscardedAt      string `json:"discardedAt"`
}

type ConversationInputState struct {
	Sequence         int                     `json:"sequence"`
	Input            ConversationInput       `json:"input"`
	Status           ConversationInputStatus `json:"status"`
	AcceptedAt       string                  `json:"acceptedAt"`
	RoutingAttempt   int                     `json:"routingAttempt"`
	RoutingStartedAt *string                 `json:"routingStartedAt"`
	Failure          *Failure                `json:"failure"`
}

// ConversationInputRoutingState is the bounded durable read model for one
// input exchange. At most one clarification and one final decision can exist,
// so this response never grows with the conversation trajectory.
type ConversationInputRoutingState struct {
	Input              ConversationInputState            `json:"input"`
	ClarificationReply *ConversationInputState           `json:"clarificationReply"`
	Decisions          []ConversationRouteDecisionRecord `json:"decisions"`
}

func (decision ConversationRouteDecision) Validate() error {
	if decision.payloadCount() != 1 {
		return errors.New("conversation route decision requires exactly one payload")
	}
	return decision.validatePayload()
}

func (decision ConversationRouteDecision) validatePayload() error {
	switch decision.Kind {
	case ConversationRouteDecisionKindSendToParent:
		return validateSendToParentDecision(decision.SendToParent)
	case ConversationRouteDecisionKindQueueParentTurn:
		return validateQueueParentTurnDecision(decision.QueueParentTurn)
	case ConversationRouteDecisionKindSteerParentTurn:
		return validateSteerParentTurnDecision(decision.SteerParentTurn)
	case ConversationRouteDecisionKindAnswerAsNarrator:
		return validateAnswerAsNarratorDecision(decision.AnswerAsNarrator)
	case ConversationRouteDecisionKindCreateSideConversation:
		return validateCreateSideConversationDecision(decision.CreateSideConversation)
	case ConversationRouteDecisionKindForkConversation:
		return validateForkConversationDecision(decision.ForkConversation)
	case ConversationRouteDecisionKindEscalateToMaster:
		return validateEscalateToMasterDecision(decision.EscalateToMaster)
	case ConversationRouteDecisionKindClarify:
		return validateClarifyDecision(decision.Clarify)
	default:
		return fmt.Errorf("unsupported conversation route decision kind %q", decision.Kind)
	}
}

func validateSendToParentDecision(payload *SendToParentConversationRouteDecision) error {
	if payload == nil {
		return errors.New("send-to-parent decision requires sendToParent")
	}
	return validateConversationRouteAuthoredInput(payload.AuthoredInput)
}

func validateQueueParentTurnDecision(payload *QueueParentTurnConversationRouteDecision) error {
	if payload == nil {
		return errors.New("queue-parent decision requires queueParentTurn")
	}
	return validateConversationRouteAuthoredInput(payload.AuthoredInput)
}

func validateSteerParentTurnDecision(payload *SteerParentTurnConversationRouteDecision) error {
	if payload == nil {
		return errors.New("steer-parent decision requires steerParentTurn")
	}
	return validateConversationRouteAuthoredInput(payload.AuthoredInput)
}

func validateAnswerAsNarratorDecision(payload *AnswerAsNarratorConversationRouteDecision) error {
	if payload == nil {
		return errors.New("answer-as-narrator decision requires answerAsNarrator")
	}
	return validateConversationRouteQuestion("narrator route question", payload.Question)
}

func validateCreateSideConversationDecision(payload *CreateSideConversationRouteDecision) error {
	if payload == nil {
		return errors.New("create-side decision requires createSideConversation")
	}
	return validateConversationRouteAuthoredInput(payload.Input)
}

func validateForkConversationDecision(payload *ForkConversationRouteDecision) error {
	if payload == nil {
		return errors.New("fork decision requires forkConversation")
	}
	if err := validateIdentifier("conversation route fork turn id", payload.ForkedAtTurnID); err != nil {
		return err
	}
	if err := validateConversationRouteAuthoredInput(payload.Input); err != nil {
		return err
	}
	return validateTopicTitle(payload.ProposedTitle)
}

func validateEscalateToMasterDecision(payload *EscalateToMasterConversationRouteDecision) error {
	if payload == nil {
		return errors.New("master-escalation decision requires escalateToMaster")
	}
	return validateConversationRouteAuthoredInput(payload.Input)
}

func validateClarifyDecision(payload *ClarifyConversationRouteDecision) error {
	if payload == nil {
		return errors.New("clarify decision requires clarify")
	}
	return validateConversationRouteQuestion("conversation route clarification", payload.Question)
}

func (decision ConversationRouteDecision) payloadCount() int {
	count := 0
	for _, present := range []bool{
		decision.SendToParent != nil,
		decision.QueueParentTurn != nil,
		decision.SteerParentTurn != nil,
		decision.AnswerAsNarrator != nil,
		decision.CreateSideConversation != nil,
		decision.ForkConversation != nil,
		decision.EscalateToMaster != nil,
		decision.Clarify != nil,
	} {
		if present {
			count++
		}
	}
	return count
}

func (command ConversationRouteCommand) Validate() error {
	if command.payloadCount() != 1 {
		return errors.New("conversation route command requires exactly one payload")
	}
	return command.validatePayload()
}

func (command ConversationRouteCommand) validatePayload() error {
	switch command.Kind {
	case ConversationRouteDecisionKindSendToParent:
		return validateSendToParentCommand(command.SendToParent)
	case ConversationRouteDecisionKindQueueParentTurn:
		return validateQueueParentTurnCommand(command.QueueParentTurn)
	case ConversationRouteDecisionKindSteerParentTurn:
		return validateSteerParentTurnCommand(command.SteerParentTurn)
	case ConversationRouteDecisionKindAnswerAsNarrator:
		return validateAnswerAsNarratorCommand(command.AnswerAsNarrator)
	case ConversationRouteDecisionKindCreateSideConversation:
		return validateCreateSideConversationCommand(command.CreateSideConversation)
	case ConversationRouteDecisionKindForkConversation:
		return validateForkConversationCommand(command.ForkConversation)
	case ConversationRouteDecisionKindEscalateToMaster:
		return validateEscalateToMasterCommand(command.EscalateToMaster)
	case ConversationRouteDecisionKindClarify:
		return validateClarifyCommand(command.Clarify)
	default:
		return fmt.Errorf("unsupported conversation route command kind %q", command.Kind)
	}
}

func validateSendToParentCommand(payload *SendToParentConversationRouteCommand) error {
	if payload == nil {
		return errors.New("send-to-parent command requires sendToParent")
	}
	if err := validateIdentifier("conversation route parent turn id", payload.TurnID); err != nil {
		return err
	}
	return validateConversationRouteAuthoredInput(payload.AuthoredInput)
}

func validateQueueParentTurnCommand(payload *QueueParentTurnConversationRouteCommand) error {
	if payload == nil {
		return errors.New("queue-parent command requires queueParentTurn")
	}
	if err := validateIdentifier("conversation route queued turn id", payload.TurnID); err != nil {
		return err
	}
	return validateConversationRouteAuthoredInput(payload.AuthoredInput)
}

func validateSteerParentTurnCommand(payload *SteerParentTurnConversationRouteCommand) error {
	if payload == nil {
		return errors.New("steer-parent command requires steerParentTurn")
	}
	if err := validateIdentifier("conversation route steer target turn id", payload.TargetTurnID); err != nil {
		return err
	}
	return validateConversationRouteAuthoredInput(payload.AuthoredInput)
}

func validateAnswerAsNarratorCommand(payload *AnswerAsNarratorConversationRouteCommand) error {
	if payload == nil {
		return errors.New("answer-as-narrator command requires answerAsNarrator")
	}
	if err := validateIdentifier("conversation route narrator request id", payload.RequestID); err != nil {
		return err
	}
	return validateConversationRouteQuestion("conversation route narrator question", payload.Question)
}

func validateCreateSideConversationCommand(payload *CreateSideConversationRouteCommand) error {
	if payload == nil {
		return errors.New("create-side command requires createSideConversation")
	}
	if err := validateIdentifier("conversation route side conversation id", payload.SideConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("conversation route parent pane id", payload.ParentPaneID); err != nil {
		return err
	}
	if err := validateIdentifier("conversation route side turn id", payload.TurnID); err != nil {
		return err
	}
	return validateConversationRouteAuthoredInput(payload.Input)
}

func validateForkConversationCommand(payload *ForkConversationRouteCommand) error {
	if payload == nil {
		return errors.New("fork command requires forkConversation")
	}
	if err := validateIdentifier("conversation route child conversation id", payload.ChildConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("conversation route fork turn id", payload.ForkedAtTurnID); err != nil {
		return err
	}
	if err := validateIdentifier("conversation route child turn id", payload.TurnID); err != nil {
		return err
	}
	if err := validateConversationRouteAuthoredInput(payload.Input); err != nil {
		return err
	}
	return validateTopicTitle(payload.ProposedTitle)
}

func validateEscalateToMasterCommand(payload *EscalateToMasterConversationRouteCommand) error {
	if payload == nil {
		return errors.New("master-escalation command requires escalateToMaster")
	}
	if err := validateIdentifier("conversation route master input id", payload.MasterInputID); err != nil {
		return err
	}
	return validateConversationRouteAuthoredInput(payload.Input)
}

func validateClarifyCommand(payload *ClarifyConversationRouteCommand) error {
	if payload == nil {
		return errors.New("clarify command requires clarify")
	}
	return validateConversationRouteQuestion("conversation route clarification", payload.Question)
}

func (command ConversationRouteCommand) payloadCount() int {
	count := 0
	for _, present := range []bool{
		command.SendToParent != nil,
		command.QueueParentTurn != nil,
		command.SteerParentTurn != nil,
		command.AnswerAsNarrator != nil,
		command.CreateSideConversation != nil,
		command.ForkConversation != nil,
		command.EscalateToMaster != nil,
		command.Clarify != nil,
	} {
		if present {
			count++
		}
	}
	return count
}

func (commit ConversationRouteDecisionCommit) Validate() error {
	return validateConversationRouteDecisionEnvelope(
		commit.ID,
		commit.ConversationID,
		commit.InputID,
		commit.ClarificationInputID,
		commit.RoutingAttempt,
		commit.RouterContext,
		commit.ResolvedInvocation,
		commit.Decision,
		commit.ResultingCommand,
		commit.DecidedAt,
	)
}

func (record ConversationRouteDecisionRecord) Validate() error {
	if record.StreamSequence <= 0 {
		return errors.New("conversation route decision stream sequence must be positive")
	}
	return validateConversationRouteDecisionEnvelope(
		record.ID,
		record.ConversationID,
		record.InputID,
		record.ClarificationInputID,
		record.RoutingAttempt,
		record.RouterContext,
		record.ResolvedInvocation,
		record.Decision,
		record.ResultingCommand,
		record.DecidedAt,
	)
}

func validateConversationRouteDecisionEnvelope(
	id string,
	conversationID string,
	inputID string,
	clarificationInputID *string,
	routingAttempt int,
	routerContext ConversationRouteContextAudit,
	resolvedInvocation ResolvedInvocation,
	decision ConversationRouteDecision,
	command ConversationRouteCommand,
	decidedAt string,
) error {
	if err := validateConversationRouteDecisionIdentity(id, conversationID, inputID, clarificationInputID); err != nil {
		return err
	}
	if routingAttempt <= 0 {
		return errors.New("conversation route decision routing attempt must be positive")
	}
	if err := validateConversationRouteDecisionAudit(
		clarificationInputID,
		decision.Kind,
		routerContext,
		resolvedInvocation,
	); err != nil {
		return err
	}
	if err := decision.Validate(); err != nil {
		return err
	}
	if err := command.Validate(); err != nil {
		return err
	}
	if err := validateConversationRouteDecisionCommand(decision, command); err != nil {
		return err
	}
	_, err := validateTimestamp("conversation route decision decidedAt", decidedAt)
	return err
}

func validateConversationRouteDecisionIdentity(
	id string,
	conversationID string,
	inputID string,
	clarificationInputID *string,
) error {
	if err := validateConversationRouteDecisionID(id); err != nil {
		return err
	}
	if err := validateConversationInputReference("conversation route decision conversation id", conversationID); err != nil {
		return err
	}
	if err := ValidateConversationInputID(inputID); err != nil {
		return err
	}
	if clarificationInputID == nil {
		return nil
	}
	if err := ValidateConversationInputID(*clarificationInputID); err != nil {
		return err
	}
	if *clarificationInputID == inputID {
		return errors.New("conversation route clarification input cannot be the routed input")
	}
	return nil
}

func validateConversationRouteDecisionCommand(
	decision ConversationRouteDecision,
	command ConversationRouteCommand,
) error {
	if decision.Kind != command.Kind {
		return fmt.Errorf("conversation route command kind %q does not match decision %q", command.Kind, decision.Kind)
	}
	switch decision.Kind {
	case ConversationRouteDecisionKindSendToParent:
		return requireConversationRouteAuthoredInputMatch(decision.SendToParent.AuthoredInput, command.SendToParent.AuthoredInput, "send-to-parent")
	case ConversationRouteDecisionKindQueueParentTurn:
		return requireConversationRouteAuthoredInputMatch(decision.QueueParentTurn.AuthoredInput, command.QueueParentTurn.AuthoredInput, "queue-parent")
	case ConversationRouteDecisionKindSteerParentTurn:
		return requireConversationRouteAuthoredInputMatch(decision.SteerParentTurn.AuthoredInput, command.SteerParentTurn.AuthoredInput, "steer-parent")
	case ConversationRouteDecisionKindAnswerAsNarrator:
		return requireConversationRouteTextMatch(decision.AnswerAsNarrator.Question, command.AnswerAsNarrator.Question, "narrator command changed the decided question")
	case ConversationRouteDecisionKindCreateSideConversation:
		return requireConversationRouteAuthoredInputMatch(decision.CreateSideConversation.Input, command.CreateSideConversation.Input, "side-conversation")
	case ConversationRouteDecisionKindForkConversation:
		return validateForkConversationRouteCommandMatch(decision.ForkConversation, command.ForkConversation)
	case ConversationRouteDecisionKindEscalateToMaster:
		return requireConversationRouteAuthoredInputMatch(decision.EscalateToMaster.Input, command.EscalateToMaster.Input, "master-escalation")
	case ConversationRouteDecisionKindClarify:
		return requireConversationRouteTextMatch(decision.Clarify.Question, command.Clarify.Question, "clarification command changed the decided question")
	default:
		return fmt.Errorf("unsupported conversation route decision kind %q", decision.Kind)
	}
}

func requireConversationRouteAuthoredInputMatch(decided AuthoredInput, commanded AuthoredInput, label string) error {
	if decided != commanded {
		return fmt.Errorf("%s command changed the decided authored input", label)
	}
	return nil
}

func requireConversationRouteTextMatch(decided string, commanded string, message string) error {
	if decided != commanded {
		return errors.New(message)
	}
	return nil
}

func validateForkConversationRouteCommandMatch(
	decision *ForkConversationRouteDecision,
	command *ForkConversationRouteCommand,
) error {
	if decision.ForkedAtTurnID != command.ForkedAtTurnID {
		return errors.New("fork command changed the decided fork point")
	}
	if decision.Input != command.Input {
		return errors.New("fork command changed the decided authored input")
	}
	return requireConversationRouteTextMatch(decision.ProposedTitle, command.ProposedTitle, "fork command changed the decided title")
}

func (work ConversationInputRoutingWork) Validate() error {
	if work.RoutingAttempt <= 0 {
		return errors.New("conversation input routing attempt must be positive")
	}
	if _, err := validateTimestamp("conversation input routing startedAt", work.RoutingStartedAt); err != nil {
		return err
	}
	if work.Input.Input.ReplyToInputID != nil {
		return errors.New("conversation input routing root cannot be a clarification reply")
	}
	if err := work.Input.Validate(); err != nil {
		return err
	}
	if work.ClarificationReply == nil {
		return validateInitialConversationInputRoutingWork(work)
	}
	return validateClarifiedConversationInputRoutingWork(work)
}

func validateInitialConversationInputRoutingWork(work ConversationInputRoutingWork) error {
	if work.Input.Status != ConversationInputStatusRouting {
		return errors.New("initial conversation input routing work must be routing")
	}
	if work.PriorClarification != nil {
		return errors.New("initial conversation input routing work cannot contain a prior clarification")
	}
	return nil
}

func validateClarifiedConversationInputRoutingWork(work ConversationInputRoutingWork) error {
	if work.Input.Status != ConversationInputStatusAwaitingClarification {
		return errors.New("clarified conversation input must remain awaiting clarification while its reply routes")
	}
	if err := work.ClarificationReply.Validate(); err != nil {
		return err
	}
	if err := validateConversationInputRoutingReplyLink(work); err != nil {
		return err
	}
	if work.PriorClarification == nil {
		return errors.New("clarified conversation input routing work requires its prior clarification")
	}
	if err := work.PriorClarification.Validate(); err != nil {
		return err
	}
	return validateConversationInputRoutingPriorClarification(work)
}

func validateConversationInputRoutingReplyLink(work ConversationInputRoutingWork) error {
	if work.ClarificationReply.Status != ConversationInputStatusRouting {
		return errors.New("conversation input clarification reply is not routing")
	}
	if work.ClarificationReply.Input.ReplyToInputID == nil {
		return errors.New("conversation input clarification reply has no routed input")
	}
	if *work.ClarificationReply.Input.ReplyToInputID != work.Input.Input.ID {
		return errors.New("conversation input clarification reply targets another input")
	}
	if work.ClarificationReply.Input.ConversationID != work.Input.Input.ConversationID {
		return errors.New("conversation input clarification reply is not linked to the routed input")
	}
	return nil
}

func validateConversationInputRoutingPriorClarification(work ConversationInputRoutingWork) error {
	if work.PriorClarification.ConversationID != work.Input.Input.ConversationID {
		return errors.New("conversation input routing work contains a clarification from another conversation")
	}
	if work.PriorClarification.InputID != work.Input.Input.ID {
		return errors.New("conversation input routing work contains a clarification for another input")
	}
	if work.PriorClarification.ClarificationInputID != nil {
		return errors.New("conversation input routing work contains a final decision as its prior clarification")
	}
	if work.PriorClarification.Decision.Kind != ConversationRouteDecisionKindClarify {
		return errors.New("conversation input routing work contains an unrelated prior clarification")
	}
	return nil
}

func (state ConversationInputState) Validate() error {
	accepted := AcceptedConversationInput{
		Sequence:   state.Sequence,
		Input:      state.Input,
		Status:     state.Status,
		AcceptedAt: state.AcceptedAt,
	}
	if err := accepted.Validate(); err != nil {
		return err
	}
	if state.RoutingAttempt < 0 {
		return errors.New("conversation input routing attempt must be non-negative")
	}
	return state.validateLifecycleFields()
}

func (state ConversationInputState) validateLifecycleFields() error {
	switch state.Status {
	case ConversationInputStatusAccepted:
		return validateAcceptedConversationInputState(state)
	case ConversationInputStatusRouting:
		return validateRoutingConversationInputState(state)
	case ConversationInputStatusAwaitingClarification, ConversationInputStatusDispatched:
		return validateRoutedConversationInputState(state)
	case ConversationInputStatusFailed:
		return validateFailedConversationInputState(state)
	default:
		return fmt.Errorf("unsupported conversation input status %q", state.Status)
	}
}

func validateAcceptedConversationInputState(state ConversationInputState) error {
	if state.RoutingStartedAt != nil {
		return errors.New("accepted conversation input contains a routing start")
	}
	if state.Failure != nil {
		return errors.New("accepted conversation input contains a failure")
	}
	return nil
}

func validateRoutingConversationInputState(state ConversationInputState) error {
	if state.RoutingAttempt <= 0 {
		return errors.New("routing conversation input has no attempt")
	}
	if state.RoutingStartedAt == nil {
		return errors.New("routing conversation input has no start time")
	}
	if state.Failure != nil {
		return errors.New("routing conversation input contains a failure")
	}
	startedAt, err := validateTimestamp("conversation input routing startedAt", *state.RoutingStartedAt)
	if err != nil {
		return err
	}
	acceptedAt, err := validateTimestamp("conversation input acceptedAt", state.AcceptedAt)
	if err != nil {
		return err
	}
	if startedAt.Before(acceptedAt) {
		return errors.New("conversation input routing cannot start before input acceptance")
	}
	return nil
}

func validateRoutedConversationInputState(state ConversationInputState) error {
	if state.RoutingAttempt <= 0 {
		return errors.New("routed conversation input has no attempt")
	}
	if state.RoutingStartedAt != nil {
		return errors.New("routed conversation input retained its start time")
	}
	if state.Failure != nil {
		return errors.New("routed conversation input contains a failure")
	}
	return nil
}

func validateFailedConversationInputState(state ConversationInputState) error {
	if state.RoutingStartedAt != nil {
		return errors.New("failed conversation input retained its start time")
	}
	if state.Failure == nil {
		return errors.New("failed conversation input has no failure")
	}
	if state.Failure.Retryable && state.RoutingAttempt <= 0 {
		return errors.New("retryable failed conversation input has no attempt")
	}
	if !state.Failure.Retryable && state.Failure.Code != ConversationInputDiscardedFailureCode {
		return errors.New("non-retryable conversation input failure must be an explicit discard")
	}
	return state.Failure.Validate()
}

func (state ConversationInputRoutingState) Validate() error {
	if err := state.Input.Validate(); err != nil {
		return err
	}
	if state.Input.Input.ReplyToInputID != nil {
		return errors.New("conversation input routing state must be rooted at an original input")
	}
	if state.Decisions == nil {
		return errors.New("conversation input routing decisions must be an array")
	}
	if len(state.Decisions) > 2 {
		return errors.New("conversation input routing state exceeds the clarification decision bound")
	}
	if err := validateConversationInputRoutingStateReply(state); err != nil {
		return err
	}
	if err := validateConversationInputRoutingStateDecisions(state); err != nil {
		return err
	}
	return validateConversationInputRoutingStateLifecycle(state)
}

func validateConversationInputRoutingStateReply(state ConversationInputRoutingState) error {
	if state.ClarificationReply == nil {
		return nil
	}
	if err := state.ClarificationReply.Validate(); err != nil {
		return err
	}
	if state.ClarificationReply.Input.ConversationID != state.Input.Input.ConversationID {
		return errors.New("conversation input routing state contains a reply from another conversation")
	}
	if state.ClarificationReply.Input.ReplyToInputID == nil {
		return errors.New("conversation input routing state contains an unlinked clarification reply")
	}
	if *state.ClarificationReply.Input.ReplyToInputID != state.Input.Input.ID {
		return errors.New("conversation input routing state contains a reply for another input")
	}
	return nil
}

func validateConversationInputRoutingStateDecisions(state ConversationInputRoutingState) error {
	for index, decision := range state.Decisions {
		if err := decision.Validate(); err != nil {
			return err
		}
		if err := validateConversationInputRoutingStateDecisionOwner(state, decision); err != nil {
			return err
		}
		if err := validateConversationInputRoutingStateDecisionOrdinal(state, decision, index); err != nil {
			return err
		}
	}
	return nil
}

func validateConversationInputRoutingStateDecisionOwner(
	state ConversationInputRoutingState,
	decision ConversationRouteDecisionRecord,
) error {
	if decision.ConversationID != state.Input.Input.ConversationID {
		return errors.New("conversation input routing state contains a decision from another conversation")
	}
	if decision.InputID != state.Input.Input.ID {
		return errors.New("conversation input routing state contains a decision for another input")
	}
	return nil
}

func validateConversationInputRoutingStateDecisionOrdinal(
	state ConversationInputRoutingState,
	decision ConversationRouteDecisionRecord,
	index int,
) error {
	if index > 0 && decision.StreamSequence <= state.Decisions[index-1].StreamSequence {
		return errors.New("conversation input routing decisions are not in stream order")
	}
	if index == 0 {
		return validateInitialConversationInputRoutingStateDecision(state, decision)
	}
	return validateFinalConversationInputRoutingStateDecision(state, decision)
}

func validateInitialConversationInputRoutingStateDecision(
	state ConversationInputRoutingState,
	decision ConversationRouteDecisionRecord,
) error {
	if decision.ClarificationInputID != nil {
		return errors.New("conversation input routing state initial decision names a clarification reply")
	}
	if decision.RoutingAttempt != state.Input.RoutingAttempt {
		return errors.New("conversation input routing state initial decision has the wrong routing attempt")
	}
	if len(state.Decisions) == 2 && decision.Decision.Kind != ConversationRouteDecisionKindClarify {
		return errors.New("conversation input routing state final decision has no prior clarification")
	}
	return nil
}

func validateFinalConversationInputRoutingStateDecision(
	state ConversationInputRoutingState,
	decision ConversationRouteDecisionRecord,
) error {
	if state.ClarificationReply == nil {
		return errors.New("conversation input routing state final decision has no clarification reply")
	}
	if decision.ClarificationInputID == nil {
		return errors.New("conversation input routing state final decision is not linked to its reply")
	}
	if *decision.ClarificationInputID != state.ClarificationReply.Input.ID {
		return errors.New("conversation input routing state final decision names another reply")
	}
	if decision.RoutingAttempt != state.ClarificationReply.RoutingAttempt {
		return errors.New("conversation input routing state final decision has the wrong routing attempt")
	}
	if decision.Decision.Kind == ConversationRouteDecisionKindClarify {
		return errors.New("conversation input routing state final decision asks another clarification")
	}
	return nil
}
