package master

import (
	"errors"
	"fmt"
	"path/filepath"
)

type MasterReplyKind string
type PresentationResourceBindingKind string

const (
	MasterReplyKindClarification MasterReplyKind = "clarification"
	MasterReplyKindAnswer        MasterReplyKind = "answer"

	PresentationResourceBindingKindFolder PresentationResourceBindingKind = "folder"
)

type PresentationFolderResourceBinding struct {
	RootPath string `json:"rootPath"`
}

type PresentationResourceBinding struct {
	Folder *PresentationFolderResourceBinding `json:"folder"`
	Kind   PresentationResourceBindingKind    `json:"kind"`
}

// ConversationPresentationTarget is trusted application state captured when a
// master decision is validated. The model never authors workspace or
// presentation metadata beyond the conversation id selected by its decision.
type ConversationPresentationTarget struct {
	ConversationID   string                        `json:"conversationId"`
	ResourceScope    RouteResourceScope            `json:"resourceScope"`
	ResourceBindings []PresentationResourceBinding `json:"resourceBindings"`
	Title            string                        `json:"title"`
}

type MasterSendToAgentRouteCommand struct {
	Target        ConversationPresentationTarget `json:"target"`
	TurnID        string                         `json:"turnId"`
	AuthoredInput string                         `json:"authoredInput"`
}

type MasterQueueAgentTurnRouteCommand struct {
	Target        ConversationPresentationTarget `json:"target"`
	TurnID        string                         `json:"turnId"`
	AuthoredInput string                         `json:"authoredInput"`
}

type MasterSteerActiveTurnRouteCommand struct {
	Target        ConversationPresentationTarget `json:"target"`
	TargetTurnID  string                         `json:"targetTurnId"`
	AuthoredInput string                         `json:"authoredInput"`
}

type MasterAskNarratorRouteCommand struct {
	Target    ConversationPresentationTarget `json:"target"`
	RequestID string                         `json:"requestId"`
	Question  string                         `json:"question"`
}

type MasterFocusConversationRouteCommand struct {
	Target ConversationPresentationTarget `json:"target"`
}

type MasterCreateConversationRouteCommand struct {
	Target                ConversationPresentationTarget `json:"target"`
	InitialInputID        string                         `json:"initialInputId"`
	InitialInput          string                         `json:"initialInput"`
	InitialInputModality  MasterInputModality            `json:"initialInputModality"`
	InitialInputSubmitted string                         `json:"initialInputSubmittedAt"`
}

type MasterCreateSideConversationRouteCommand struct {
	Target             ConversationPresentationTarget `json:"target"`
	SideConversationID string                         `json:"sideConversationId"`
	TurnID             string                         `json:"turnId"`
	Input              string                         `json:"input"`
}

type MasterForkConversationRouteCommand struct {
	ParentConversationID string                         `json:"parentConversationId"`
	Target               ConversationPresentationTarget `json:"target"`
	ForkedAtTurnID       string                         `json:"forkedAtTurnId"`
	TurnID               string                         `json:"turnId"`
	Input                string                         `json:"input"`
}

type MasterClarifyRouteCommand struct {
	Question           string   `json:"question"`
	CandidateTargetIDs []string `json:"candidateTargetIds"`
}

type MasterAnswerGlobalRouteCommand struct {
	Text string `json:"text"`
}

// RouteCommand is the trusted, replayable effect persisted atomically with a
// model-authored RouteDecision. Stable Setta ids and renderer targets are added
// only after the decision has passed its bounded authority checks.
type RouteCommand struct {
	Kind                   RouteDecisionKind                         `json:"kind"`
	SendToAgent            *MasterSendToAgentRouteCommand            `json:"sendToAgent"`
	QueueAgentTurn         *MasterQueueAgentTurnRouteCommand         `json:"queueAgentTurn"`
	SteerActiveTurn        *MasterSteerActiveTurnRouteCommand        `json:"steerActiveTurn"`
	AskNarrator            *MasterAskNarratorRouteCommand            `json:"askNarrator"`
	FocusConversation      *MasterFocusConversationRouteCommand      `json:"focusConversation"`
	CreateConversation     *MasterCreateConversationRouteCommand     `json:"createConversation"`
	CreateSideConversation *MasterCreateSideConversationRouteCommand `json:"createSideConversation"`
	ForkConversation       *MasterForkConversationRouteCommand       `json:"forkConversation"`
	Clarify                *MasterClarifyRouteCommand                `json:"clarify"`
	AnswerGlobal           *MasterAnswerGlobalRouteCommand           `json:"answerGlobal"`
}

func (target ConversationPresentationTarget) Validate() error {
	if err := validateRouteReference("master presentation conversation id", target.ConversationID); err != nil {
		return err
	}
	if err := target.ResourceScope.Validate(); err != nil {
		return err
	}
	if err := validatePresentationResourceBindings(target.ResourceBindings); err != nil {
		return err
	}
	return validateRouteText("master presentation conversation title", target.Title, MaxRouteConversationTitle)
}

func validatePresentationResourceBindings(bindings []PresentationResourceBinding) error {
	if bindings == nil {
		return errors.New("master presentation resource bindings must be an array")
	}
	for index, binding := range bindings {
		if err := validatePresentationResourceBinding(binding); err != nil {
			return fmt.Errorf("master presentation resource binding %d: %w", index, err)
		}
	}
	return nil
}

func validatePresentationResourceBinding(binding PresentationResourceBinding) error {
	switch binding.Kind {
	case PresentationResourceBindingKindFolder:
		if binding.Folder == nil {
			return errors.New("folder binding requires a folder payload")
		}
		if binding.Folder.RootPath == "" {
			return errors.New("folder binding requires a root path")
		}
		if !filepath.IsAbs(binding.Folder.RootPath) {
			return fmt.Errorf("folder binding root path must be absolute: %s", binding.Folder.RootPath)
		}
		return nil
	default:
		return fmt.Errorf("unsupported resource binding kind %q", binding.Kind)
	}
}

func (command RouteCommand) Validate() error {
	if command.payloadCount() != 1 {
		return errors.New("master route command requires exactly one payload")
	}
	return command.validatePayload()
}

func (command RouteCommand) validatePayload() error {
	switch command.Kind {
	case RouteDecisionKindSendToAgent:
		return validateMasterSendToAgentCommand(command.SendToAgent)
	case RouteDecisionKindQueueAgentTurn:
		return validateMasterQueueAgentTurnCommand(command.QueueAgentTurn)
	case RouteDecisionKindSteerActiveTurn:
		return validateMasterSteerActiveTurnCommand(command.SteerActiveTurn)
	case RouteDecisionKindAskNarrator:
		return validateMasterAskNarratorCommand(command.AskNarrator)
	case RouteDecisionKindFocusConversation:
		return validateMasterFocusConversationCommand(command.FocusConversation)
	case RouteDecisionKindCreateConversation:
		return validateMasterCreateConversationCommand(command.CreateConversation)
	case RouteDecisionKindCreateSideConversation:
		return validateMasterSideCommand(command.CreateSideConversation)
	case RouteDecisionKindForkConversation:
		return validateMasterForkCommand(command.ForkConversation)
	case RouteDecisionKindClarify:
		return validateMasterClarifyCommand(command.Clarify)
	case RouteDecisionKindAnswerGlobal:
		return validateMasterAnswerGlobalCommand(command.AnswerGlobal)
	default:
		return fmt.Errorf("unsupported master route command kind %q", command.Kind)
	}
}

func (command RouteCommand) ValidateDecision(decision RouteDecision) error {
	if err := command.Validate(); err != nil {
		return err
	}
	if err := decision.Validate(); err != nil {
		return err
	}
	if command.Kind != decision.Kind {
		return fmt.Errorf("master route command kind %q does not match decision %q", command.Kind, decision.Kind)
	}
	return command.validateDecisionPayload(decision)
}

func (command RouteCommand) validateDecisionPayload(decision RouteDecision) error {
	switch decision.Kind {
	case RouteDecisionKindSendToAgent:
		return validateMasterCommandConversationInput(command.SendToAgent.Target, command.SendToAgent.AuthoredInput, decision.SendToAgent.ConversationID, decision.SendToAgent.AuthoredInput)
	case RouteDecisionKindQueueAgentTurn:
		return validateMasterCommandConversationInput(command.QueueAgentTurn.Target, command.QueueAgentTurn.AuthoredInput, decision.QueueAgentTurn.ConversationID, decision.QueueAgentTurn.AuthoredInput)
	case RouteDecisionKindSteerActiveTurn:
		return validateMasterCommandConversationInput(command.SteerActiveTurn.Target, command.SteerActiveTurn.AuthoredInput, decision.SteerActiveTurn.ConversationID, decision.SteerActiveTurn.AuthoredInput)
	case RouteDecisionKindAskNarrator:
		return validateMasterAskNarratorDecision(command.AskNarrator, decision.AskNarrator)
	case RouteDecisionKindFocusConversation:
		return validateMasterFocusConversationDecision(command.FocusConversation, decision.FocusConversation)
	case RouteDecisionKindCreateConversation:
		return validateMasterCreateConversationDecision(command.CreateConversation, decision.CreateConversation)
	case RouteDecisionKindCreateSideConversation:
		return validateMasterCreateSideDecision(command.CreateSideConversation, decision.CreateSideConversation)
	case RouteDecisionKindForkConversation:
		return validateMasterForkDecision(command.ForkConversation, decision.ForkConversation)
	case RouteDecisionKindClarify:
		return equalMasterRouteValue(command.Clarify.Question, decision.Clarify.Question, "master clarification command does not match its decision")
	case RouteDecisionKindAnswerGlobal:
		return equalMasterRouteValue(command.AnswerGlobal.Text, decision.AnswerGlobal.Text, "master answer command does not match its decision")
	}
	return nil
}

func validateMasterSendToAgentCommand(command *MasterSendToAgentRouteCommand) error {
	if command == nil {
		return errors.New("send-to-agent command requires sendToAgent")
	}
	return validateMasterTurnCommand(command.Target, command.TurnID, command.AuthoredInput)
}

func validateMasterQueueAgentTurnCommand(command *MasterQueueAgentTurnRouteCommand) error {
	if command == nil {
		return errors.New("queue-agent-turn command requires queueAgentTurn")
	}
	return validateMasterTurnCommand(command.Target, command.TurnID, command.AuthoredInput)
}

func validateMasterSteerActiveTurnCommand(command *MasterSteerActiveTurnRouteCommand) error {
	if command == nil {
		return errors.New("steer-active-turn command requires steerActiveTurn")
	}
	if err := command.Target.Validate(); err != nil {
		return err
	}
	if err := validateRouteReference("master route command target turn id", command.TargetTurnID); err != nil {
		return err
	}
	return validateRouteText("master route command authored input", command.AuthoredInput, MaxRouteAuthoredInputBytes)
}

func validateMasterAskNarratorCommand(command *MasterAskNarratorRouteCommand) error {
	if command == nil {
		return errors.New("ask-narrator command requires askNarrator")
	}
	if err := command.Target.Validate(); err != nil {
		return err
	}
	if err := validateRouteReference("master route command narrator request id", command.RequestID); err != nil {
		return err
	}
	return validateRouteText("master route command narrator question", command.Question, MaxRouteQuestionBytes)
}

func validateMasterFocusConversationCommand(command *MasterFocusConversationRouteCommand) error {
	if command == nil {
		return errors.New("focus-conversation command requires focusConversation")
	}
	return command.Target.Validate()
}

func validateMasterCreateConversationCommand(command *MasterCreateConversationRouteCommand) error {
	if command == nil {
		return errors.New("create-conversation command requires createConversation")
	}
	if err := command.Target.Validate(); err != nil {
		return err
	}
	if err := validateRouteReference("master route command initial input id", command.InitialInputID); err != nil {
		return err
	}
	if err := validateMasterCommandInputModality(command.InitialInputModality); err != nil {
		return err
	}
	submittedAt, err := normalizeTimestamp("master route command initial input submittedAt", command.InitialInputSubmitted)
	if err != nil || submittedAt != command.InitialInputSubmitted {
		return errors.New("master route command initial input submittedAt must be normalized")
	}
	return validateRouteText("master route command initial input", command.InitialInput, MaxRouteAuthoredInputBytes)
}

func validateMasterClarifyCommand(command *MasterClarifyRouteCommand) error {
	if command == nil {
		return errors.New("clarify command requires clarify")
	}
	if err := validateRouteText("master route command clarification", command.Question, MaxRouteQuestionBytes); err != nil {
		return err
	}
	return validateBoundedRouteConversationTargetIDs(
		"clarification candidate target",
		command.CandidateTargetIDs,
		MaxRouteConversationTargets,
	)
}

func validateMasterAnswerGlobalCommand(command *MasterAnswerGlobalRouteCommand) error {
	if command == nil {
		return errors.New("answer-global command requires answerGlobal")
	}
	return validateRouteText("master route command global answer", command.Text, MaxRouteAnswerBytes)
}

func validateMasterAskNarratorDecision(command *MasterAskNarratorRouteCommand, decision *MasterAskNarratorRouteDecision) error {
	if command.Target.ConversationID != decision.ConversationID || command.Question != decision.Question {
		return errors.New("master ask-narrator command does not match its decision")
	}
	return nil
}

func validateMasterFocusConversationDecision(command *MasterFocusConversationRouteCommand, decision *MasterFocusConversationRouteDecision) error {
	return equalMasterRouteValue(command.Target.ConversationID, decision.ConversationID, "master focus-conversation command does not match its decision")
}

func validateMasterCreateConversationDecision(command *MasterCreateConversationRouteCommand, decision *MasterCreateConversationRouteDecision) error {
	if !command.Target.ResourceScope.Equal(decision.ResourceScope) ||
		command.Target.Title != decision.ProposedTitle ||
		command.InitialInput != decision.InitialInput {
		return errors.New("master create-conversation command does not match its decision")
	}
	return nil
}

func validateMasterCreateSideDecision(command *MasterCreateSideConversationRouteCommand, decision *MasterCreateSideConversationRouteDecision) error {
	if command.Target.ConversationID != decision.ParentConversationID || command.Input != decision.Input {
		return errors.New("master create-side-conversation command does not match its decision")
	}
	return nil
}

func validateMasterForkDecision(command *MasterForkConversationRouteCommand, decision *MasterForkConversationRouteDecision) error {
	if command.ParentConversationID != decision.ParentConversationID || command.ForkedAtTurnID != decision.ForkedAtTurnID || command.Input != decision.Input {
		return errors.New("master fork-conversation command does not match its decision")
	}
	return nil
}

func equalMasterRouteValue(left string, right string, message string) error {
	if left != right {
		return errors.New(message)
	}
	return nil
}

func validateMasterTurnCommand(target ConversationPresentationTarget, turnID string, input string) error {
	if err := target.Validate(); err != nil {
		return err
	}
	if err := validateRouteReference("master route command turn id", turnID); err != nil {
		return err
	}
	return validateRouteText("master route command authored input", input, MaxRouteAuthoredInputBytes)
}

func validateMasterCommandInputModality(modality MasterInputModality) error {
	switch modality {
	case MasterInputModalityText, MasterInputModalityVoice:
		return nil
	default:
		return fmt.Errorf("unsupported master route command input modality %q", modality)
	}
}

func validateMasterSideCommand(command *MasterCreateSideConversationRouteCommand) error {
	if command == nil {
		return errors.New("create-side-conversation command requires createSideConversation")
	}
	if err := command.Target.Validate(); err != nil {
		return err
	}
	for label, value := range map[string]string{
		"side conversation id": command.SideConversationID,
		"side turn id":         command.TurnID,
	} {
		if err := validateRouteReference("master route command "+label, value); err != nil {
			return err
		}
	}
	return validateRouteText("master route command side input", command.Input, MaxRouteAuthoredInputBytes)
}

func validateMasterForkCommand(command *MasterForkConversationRouteCommand) error {
	if command == nil {
		return errors.New("fork-conversation command requires forkConversation")
	}
	if err := command.Target.Validate(); err != nil {
		return err
	}
	for label, value := range map[string]string{
		"parent conversation id": command.ParentConversationID,
		"fork turn id":           command.ForkedAtTurnID,
		"child turn id":          command.TurnID,
	} {
		if err := validateRouteReference("master route command "+label, value); err != nil {
			return err
		}
	}
	if command.ParentConversationID == command.Target.ConversationID {
		return errors.New("master fork command child conversation must differ from parent")
	}
	return validateRouteText("master route command fork input", command.Input, MaxRouteAuthoredInputBytes)
}

func validateMasterCommandConversationInput(target ConversationPresentationTarget, commandInput string, conversationID string, decisionInput string) error {
	if target.ConversationID != conversationID || commandInput != decisionInput {
		return errors.New("master conversation command does not match its decision")
	}
	return nil
}

func (command RouteCommand) payloadCount() int {
	count := 0
	for _, present := range []bool{
		command.SendToAgent != nil,
		command.QueueAgentTurn != nil,
		command.SteerActiveTurn != nil,
		command.AskNarrator != nil,
		command.FocusConversation != nil,
		command.CreateConversation != nil,
		command.CreateSideConversation != nil,
		command.ForkConversation != nil,
		command.Clarify != nil,
		command.AnswerGlobal != nil,
	} {
		if present {
			count++
		}
	}
	return count
}
