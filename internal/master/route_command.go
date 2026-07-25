package master

import (
	"errors"
	"fmt"
	"path/filepath"

	"setta/internal/applayout"
)

type PresentationIntentKind string
type MasterReplyKind string

const (
	MaxPresentationIntentIDBytes = MaxInputIDBytes + 32

	PresentationIntentKindFocusExistingConversationPane PresentationIntentKind = "focus_existing_conversation_pane"
	PresentationIntentKindOpenConversationPane          PresentationIntentKind = "open_conversation_pane"
	PresentationIntentKindOpenSideConversation          PresentationIntentKind = "open_side_conversation_in_parent_pane"
	PresentationIntentKindShowMasterReply               PresentationIntentKind = "show_master_reply"

	MasterReplyKindClarification MasterReplyKind = "clarification"
	MasterReplyKindAnswer        MasterReplyKind = "answer"
)

// ConversationPresentationTarget is trusted application state captured when a
// master decision is validated. The model never authors workspace, pane, or
// presentation metadata beyond the conversation id selected by its decision.
type ConversationPresentationTarget struct {
	ConversationID   string                                      `json:"conversationId"`
	ResourceScope    RouteResourceScope                          `json:"resourceScope"`
	ResourceBindings []applayout.ConversationPaneResourceBinding `json:"resourceBindings"`
	Title            string                                      `json:"title"`
	PreferredPaneID  *string                                     `json:"preferredPaneId"`
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

type FocusExistingConversationPaneIntent struct {
	Target ConversationPresentationTarget `json:"target"`
}

type OpenConversationPaneIntent struct {
	Target ConversationPresentationTarget `json:"target"`
}

type OpenSideConversationInParentPaneIntent struct {
	Target ConversationPresentationTarget `json:"target"`
}

type ShowMasterReplyIntent struct {
	ReplyKind MasterReplyKind `json:"replyKind"`
	Text      string          `json:"text"`
}

// PresentationIntent is renderer-safe typed data derived from one committed
// command. Side creation is presented before execution so the renderer can
// resolve its owning pane; other effects are presented after completion.
type PresentationIntent struct {
	ID                             string                                  `json:"id"`
	InputID                        string                                  `json:"inputId"`
	Source                         MasterInputSource                       `json:"source"`
	OriginatingWorkspaceID         *string                                 `json:"originatingWorkspaceId"`
	OriginatingConversationID      *string                                 `json:"originatingConversationId"`
	OriginatingPaneID              *string                                 `json:"originatingPaneId"`
	OriginatingConversationInputID *string                                 `json:"originatingConversationInputId"`
	Kind                           PresentationIntentKind                  `json:"kind"`
	FocusExistingConversationPane  *FocusExistingConversationPaneIntent    `json:"focusExistingConversationPane"`
	OpenConversationPane           *OpenConversationPaneIntent             `json:"openConversationPane"`
	OpenSideConversation           *OpenSideConversationInParentPaneIntent `json:"openSideConversation"`
	ShowMasterReply                *ShowMasterReplyIntent                  `json:"showMasterReply"`
}

// PresentationResolutionRequest acknowledges the exact pane selected by the
// renderer for a navigation intent. The backend validates the live pane
// binding before accepting it; provider output never supplies this value.
type PresentationResolutionRequest struct {
	IntentID string `json:"intentId"`
	InputID  string `json:"inputId"`
	PaneID   string `json:"paneId"`
}

type PresentationResolution struct {
	IntentID   string `json:"intentId"`
	InputID    string `json:"inputId"`
	PaneID     string `json:"paneId"`
	ResolvedAt string `json:"resolvedAt"`
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
	if err := validateRouteText("master presentation conversation title", target.Title, MaxRouteConversationTitle); err != nil {
		return err
	}
	if target.PreferredPaneID != nil {
		return validateRouteReference("master presentation preferred pane id", *target.PreferredPaneID)
	}
	return nil
}

func validatePresentationResourceBindings(bindings []applayout.ConversationPaneResourceBinding) error {
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

func validatePresentationResourceBinding(binding applayout.ConversationPaneResourceBinding) error {
	switch binding.Kind {
	case applayout.ConversationPaneResourceBindingKindFolder:
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
	if command.Target.PreferredPaneID != nil {
		return errors.New("create-conversation command cannot prefer an existing pane")
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
	if command.Target.PreferredPaneID != nil {
		return errors.New("fork-conversation command cannot prefer an existing child pane")
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

func PresentationIntentForCommand(input MasterInput, command RouteCommand) (PresentationIntent, error) {
	normalized, err := NormalizeInput(input)
	if err != nil {
		return PresentationIntent{}, err
	}
	if !EqualInputs(normalized, input) {
		return PresentationIntent{}, errors.New("master presentation input is not normalized")
	}
	if err := command.Validate(); err != nil {
		return PresentationIntent{}, err
	}
	intent := PresentationIntent{
		ID:                             PresentationIntentID(input.ID),
		InputID:                        input.ID,
		Source:                         input.Source,
		OriginatingWorkspaceID:         cloneString(input.OriginatingWorkspaceID),
		OriginatingConversationID:      cloneString(input.OriginatingConversationID),
		OriginatingPaneID:              cloneString(input.OriginatingPaneID),
		OriginatingConversationInputID: cloneString(input.OriginatingConversationInputID),
	}
	switch command.Kind {
	case RouteDecisionKindCreateSideConversation:
		payload := command.CreateSideConversation
		intent.Kind = PresentationIntentKindOpenSideConversation
		intent.OpenSideConversation = &OpenSideConversationInParentPaneIntent{
			Target: payload.Target,
		}
	case RouteDecisionKindClarify:
		intent.Kind = PresentationIntentKindShowMasterReply
		intent.ShowMasterReply = &ShowMasterReplyIntent{ReplyKind: MasterReplyKindClarification, Text: command.Clarify.Question}
	case RouteDecisionKindAnswerGlobal:
		intent.Kind = PresentationIntentKindShowMasterReply
		intent.ShowMasterReply = &ShowMasterReplyIntent{ReplyKind: MasterReplyKindAnswer, Text: command.AnswerGlobal.Text}
	default:
		target, targetErr := command.presentationTarget()
		if targetErr != nil {
			return PresentationIntent{}, targetErr
		}
		if target.PreferredPaneID != nil {
			intent.Kind = PresentationIntentKindFocusExistingConversationPane
			intent.FocusExistingConversationPane = &FocusExistingConversationPaneIntent{Target: target}
		} else {
			intent.Kind = PresentationIntentKindOpenConversationPane
			intent.OpenConversationPane = &OpenConversationPaneIntent{Target: target}
		}
	}
	if err := intent.Validate(); err != nil {
		return PresentationIntent{}, err
	}
	return intent, nil
}

func (command RouteCommand) presentationTarget() (ConversationPresentationTarget, error) {
	switch command.Kind {
	case RouteDecisionKindSendToAgent:
		return command.SendToAgent.Target, nil
	case RouteDecisionKindQueueAgentTurn:
		return command.QueueAgentTurn.Target, nil
	case RouteDecisionKindSteerActiveTurn:
		return command.SteerActiveTurn.Target, nil
	case RouteDecisionKindAskNarrator:
		return command.AskNarrator.Target, nil
	case RouteDecisionKindFocusConversation:
		return command.FocusConversation.Target, nil
	case RouteDecisionKindCreateConversation:
		return command.CreateConversation.Target, nil
	case RouteDecisionKindForkConversation:
		return command.ForkConversation.Target, nil
	default:
		return ConversationPresentationTarget{}, fmt.Errorf("master route command %s has no conversation presentation target", command.Kind)
	}
}

func (intent PresentationIntent) Validate() error {
	if err := intent.validateIdentity(); err != nil {
		return err
	}
	if err := validatePresentationIntentSource(intent); err != nil {
		return err
	}
	if intent.payloadCount() != 1 {
		return errors.New("master presentation intent requires exactly one payload")
	}
	return intent.validatePayload()
}

func (intent PresentationIntent) validateIdentity() error {
	if err := validateBoundedIdentifier("master presentation intent id", intent.ID, MaxPresentationIntentIDBytes); err != nil {
		return err
	}
	if err := ValidateInputID(intent.InputID); err != nil {
		return err
	}
	if intent.ID != PresentationIntentID(intent.InputID) {
		return errors.New("master presentation intent id does not match its input")
	}
	for label, value := range map[string]*string{
		"originating workspace id":          intent.OriginatingWorkspaceID,
		"originating conversation id":       intent.OriginatingConversationID,
		"originating pane id":               intent.OriginatingPaneID,
		"originating conversation input id": intent.OriginatingConversationInputID,
	} {
		if value != nil {
			if err := validateRouteReference("master presentation "+label, *value); err != nil {
				return err
			}
		}
	}
	return nil
}

func (intent PresentationIntent) validatePayload() error {
	switch intent.Kind {
	case PresentationIntentKindFocusExistingConversationPane:
		return validateFocusExistingConversationPaneIntent(intent.FocusExistingConversationPane)
	case PresentationIntentKindOpenConversationPane:
		return validateOpenConversationPaneIntent(intent.OpenConversationPane)
	case PresentationIntentKindOpenSideConversation:
		return validateOpenSideConversationIntent(intent.OpenSideConversation)
	case PresentationIntentKindShowMasterReply:
		return validateShowMasterReplyIntent(intent.ShowMasterReply)
	default:
		return fmt.Errorf("unsupported master presentation intent kind %q", intent.Kind)
	}
}

func validateFocusExistingConversationPaneIntent(intent *FocusExistingConversationPaneIntent) error {
	if intent == nil || intent.Target.PreferredPaneID == nil {
		return errors.New("focus-existing presentation intent requires a preferred pane")
	}
	return intent.Target.Validate()
}

func validateOpenConversationPaneIntent(intent *OpenConversationPaneIntent) error {
	if intent == nil {
		return errors.New("open-conversation presentation intent requires a target")
	}
	return intent.Target.Validate()
}

func validateOpenSideConversationIntent(intent *OpenSideConversationInParentPaneIntent) error {
	if intent == nil {
		return errors.New("open-side presentation intent requires a parent target")
	}
	return intent.Target.Validate()
}

func validateShowMasterReplyIntent(intent *ShowMasterReplyIntent) error {
	if intent == nil {
		return errors.New("show-master-reply presentation intent requires a reply")
	}
	switch intent.ReplyKind {
	case MasterReplyKindClarification:
		return validateRouteText("master presentation clarification", intent.Text, MaxRouteQuestionBytes)
	case MasterReplyKindAnswer:
		return validateRouteText("master presentation answer", intent.Text, MaxRouteAnswerBytes)
	default:
		return fmt.Errorf("unsupported master reply kind %q", intent.ReplyKind)
	}
}

func (intent PresentationIntent) NavigationTarget() (ConversationPresentationTarget, error) {
	if err := intent.Validate(); err != nil {
		return ConversationPresentationTarget{}, err
	}
	switch intent.Kind {
	case PresentationIntentKindFocusExistingConversationPane:
		return intent.FocusExistingConversationPane.Target, nil
	case PresentationIntentKindOpenConversationPane:
		return intent.OpenConversationPane.Target, nil
	case PresentationIntentKindOpenSideConversation:
		return intent.OpenSideConversation.Target, nil
	case PresentationIntentKindShowMasterReply:
		return ConversationPresentationTarget{}, errors.New("master reply intent has no navigation target")
	default:
		return ConversationPresentationTarget{}, fmt.Errorf("unsupported master presentation intent kind %q", intent.Kind)
	}
}

func (request PresentationResolutionRequest) Validate() error {
	if err := ValidateInputID(request.InputID); err != nil {
		return err
	}
	if request.IntentID != PresentationIntentID(request.InputID) {
		return errors.New("master presentation resolution intent does not match its input")
	}
	return validateRouteReference("master presentation resolution pane id", request.PaneID)
}

func (resolution PresentationResolution) Validate() error {
	request := PresentationResolutionRequest{
		IntentID: resolution.IntentID,
		InputID:  resolution.InputID,
		PaneID:   resolution.PaneID,
	}
	if err := request.Validate(); err != nil {
		return err
	}
	resolvedAt, err := normalizeTimestamp("master presentation resolvedAt", resolution.ResolvedAt)
	if err != nil || resolvedAt != resolution.ResolvedAt {
		return errors.New("master presentation resolvedAt must be normalized")
	}
	return nil
}

func validatePresentationIntentSource(intent PresentationIntent) error {
	switch intent.Source {
	case MasterInputSourceShell:
		if intent.OriginatingWorkspaceID != nil || intent.OriginatingConversationID != nil || intent.OriginatingPaneID != nil || intent.OriginatingConversationInputID != nil {
			return errors.New("shell master presentation intent cannot contain an originating pane")
		}
	case MasterInputSourceConversationEscalation:
		if intent.OriginatingWorkspaceID == nil || intent.OriginatingConversationID == nil || intent.OriginatingConversationInputID == nil {
			return errors.New("conversation master presentation intent requires originating linkage")
		}
	default:
		return fmt.Errorf("unsupported master presentation input source %q", intent.Source)
	}
	return nil
}

func (intent PresentationIntent) payloadCount() int {
	count := 0
	for _, present := range []bool{
		intent.FocusExistingConversationPane != nil,
		intent.OpenConversationPane != nil,
		intent.OpenSideConversation != nil,
		intent.ShowMasterReply != nil,
	} {
		if present {
			count++
		}
	}
	return count
}

func PresentationIntentID(inputID string) string {
	return "master-presentation:" + inputID
}
