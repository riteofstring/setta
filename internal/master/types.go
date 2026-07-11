package master

import (
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"

	"setta/internal/conversation"
	"setta/internal/conversationindex"
	"setta/internal/workspace"
)

const MasterContractSchemaVersion = 1

type MasterInputModality string
type MasterRouteDecisionType string
type MasterPresentationIntentType string
type MasterEventType string
type MasterSessionStatus string

const (
	InputModalityText  MasterInputModality = "text"
	InputModalityVoice MasterInputModality = "voice"

	RouteDecisionSendToAgent            MasterRouteDecisionType = "send_to_agent"
	RouteDecisionAskNarrator            MasterRouteDecisionType = "ask_narrator"
	RouteDecisionFocusConversation      MasterRouteDecisionType = "focus_conversation"
	RouteDecisionCreateConversation     MasterRouteDecisionType = "create_conversation"
	RouteDecisionCreateSideConversation MasterRouteDecisionType = "create_side_conversation"
	RouteDecisionForkConversation       MasterRouteDecisionType = "fork_conversation"
	RouteDecisionClarify                MasterRouteDecisionType = "clarify"
	RouteDecisionAnswerGlobal           MasterRouteDecisionType = "answer_global"

	PresentationIntentFocusExisting    MasterPresentationIntentType = "focus_existing_conversation_pane"
	PresentationIntentOpenConversation MasterPresentationIntentType = "open_conversation_pane"
	PresentationIntentOpenSide         MasterPresentationIntentType = "open_side_conversation_in_parent_pane"
	PresentationIntentShowReply        MasterPresentationIntentType = "show_master_reply"

	EventTypeSessionUpdated     MasterEventType = "master.session.updated"
	EventTypeRouteCommitted     MasterEventType = "master.route.committed"
	EventTypePresentationIntent MasterEventType = "master.presentation_intent"
	EventTypeReply              MasterEventType = "master.reply"

	SessionStatusReady    MasterSessionStatus = "ready"
	SessionStatusRunning  MasterSessionStatus = "running"
	SessionStatusDegraded MasterSessionStatus = "degraded"
)

type Input struct {
	ID                    string              `json:"id"`
	Text                  string              `json:"text"`
	Modality              MasterInputModality `json:"modality"`
	SubmittedAt           string              `json:"submittedAt"`
	FocusedWorkspaceID    *string             `json:"focusedWorkspaceId"`
	FocusedConversationID *string             `json:"focusedConversationId"`
	FocusedPaneID         *string             `json:"focusedPaneId"`
}

func (input Input) Validate() error {
	if err := validateIdentifier("master input id", input.ID); err != nil {
		return err
	}
	if err := validateText("master input text", input.Text); err != nil {
		return err
	}
	if input.Modality != InputModalityText && input.Modality != InputModalityVoice {
		return fmt.Errorf("unsupported master input modality %q", input.Modality)
	}
	if _, err := time.Parse(time.RFC3339Nano, input.SubmittedAt); err != nil {
		return fmt.Errorf("master input submittedAt must be RFC3339: %w", err)
	}
	for label, value := range map[string]*string{
		"focused workspace id":    input.FocusedWorkspaceID,
		"focused conversation id": input.FocusedConversationID,
		"focused pane id":         input.FocusedPaneID,
	} {
		if value != nil {
			if err := validateIdentifier(label, *value); err != nil {
				return err
			}
		}
	}
	return nil
}

type RouteDecision interface {
	routeDecisionType() MasterRouteDecisionType
}

type SendToAgentDecision struct {
	Type           MasterRouteDecisionType    `json:"type"`
	ConversationID string                     `json:"conversationId"`
	AuthoredInput  conversation.AuthoredInput `json:"authoredInput"`
}

type AskNarratorDecision struct {
	Type           MasterRouteDecisionType `json:"type"`
	ConversationID string                  `json:"conversationId"`
	Question       string                  `json:"question"`
}

type FocusConversationDecision struct {
	Type           MasterRouteDecisionType `json:"type"`
	ConversationID string                  `json:"conversationId"`
}

type CreateConversationDecision struct {
	Type          MasterRouteDecisionType    `json:"type"`
	WorkspaceID   string                     `json:"workspaceId"`
	InitialInput  conversation.AuthoredInput `json:"initialInput"`
	ProposedTitle string                     `json:"proposedTitle"`
}

type CreateSideConversationDecision struct {
	Type                 MasterRouteDecisionType    `json:"type"`
	ParentConversationID string                     `json:"parentConversationId"`
	Input                conversation.AuthoredInput `json:"input"`
}

type ForkConversationDecision struct {
	Type                 MasterRouteDecisionType    `json:"type"`
	ParentConversationID string                     `json:"parentConversationId"`
	ForkedAtTurnID       string                     `json:"forkedAtTurnId"`
	Input                conversation.AuthoredInput `json:"input"`
}

type ClarifyDecision struct {
	Type     MasterRouteDecisionType `json:"type"`
	Question string                  `json:"question"`
}

type AnswerGlobalDecision struct {
	Type MasterRouteDecisionType `json:"type"`
	Text string                  `json:"text"`
}

func (SendToAgentDecision) routeDecisionType() MasterRouteDecisionType {
	return RouteDecisionSendToAgent
}
func (AskNarratorDecision) routeDecisionType() MasterRouteDecisionType {
	return RouteDecisionAskNarrator
}
func (FocusConversationDecision) routeDecisionType() MasterRouteDecisionType {
	return RouteDecisionFocusConversation
}
func (CreateConversationDecision) routeDecisionType() MasterRouteDecisionType {
	return RouteDecisionCreateConversation
}
func (CreateSideConversationDecision) routeDecisionType() MasterRouteDecisionType {
	return RouteDecisionCreateSideConversation
}
func (ForkConversationDecision) routeDecisionType() MasterRouteDecisionType {
	return RouteDecisionForkConversation
}
func (ClarifyDecision) routeDecisionType() MasterRouteDecisionType { return RouteDecisionClarify }
func (AnswerGlobalDecision) routeDecisionType() MasterRouteDecisionType {
	return RouteDecisionAnswerGlobal
}

func ValidateRouteDecision(decision RouteDecision) error {
	if decision == nil {
		return errors.New("master route decision is required")
	}
	switch value := decision.(type) {
	case SendToAgentDecision:
		return validateConversationInput(value.Type, RouteDecisionSendToAgent, value.ConversationID, value.AuthoredInput)
	case AskNarratorDecision:
		if err := validateDecisionIdentity(value.Type, RouteDecisionAskNarrator, value.ConversationID); err != nil {
			return err
		}
		return validateText("narrator question", value.Question)
	case FocusConversationDecision:
		return validateDecisionIdentity(value.Type, RouteDecisionFocusConversation, value.ConversationID)
	case CreateConversationDecision:
		if value.Type != RouteDecisionCreateConversation {
			return invalidDecisionType(value.Type, RouteDecisionCreateConversation)
		}
		if err := validateIdentifier("created conversation workspace id", value.WorkspaceID); err != nil {
			return err
		}
		if err := value.InitialInput.Validate(); err != nil {
			return err
		}
		return validateText("created conversation title", value.ProposedTitle)
	case CreateSideConversationDecision:
		return validateConversationInput(value.Type, RouteDecisionCreateSideConversation, value.ParentConversationID, value.Input)
	case ForkConversationDecision:
		if err := validateConversationInput(value.Type, RouteDecisionForkConversation, value.ParentConversationID, value.Input); err != nil {
			return err
		}
		return validateIdentifier("fork source turn id", value.ForkedAtTurnID)
	case ClarifyDecision:
		if value.Type != RouteDecisionClarify {
			return invalidDecisionType(value.Type, RouteDecisionClarify)
		}
		return validateText("master clarification question", value.Question)
	case AnswerGlobalDecision:
		if value.Type != RouteDecisionAnswerGlobal {
			return invalidDecisionType(value.Type, RouteDecisionAnswerGlobal)
		}
		return validateText("master global answer", value.Text)
	default:
		return fmt.Errorf("unsupported master route decision %T", decision)
	}
}

type CandidateContext struct {
	Workspaces              []workspace.WorkspaceSummary       `json:"workspaces"`
	Candidates              []conversationindex.TopicCandidate `json:"candidates"`
	FocusedWorkspaceID      *string                            `json:"focusedWorkspaceId"`
	FocusedConversationID   *string                            `json:"focusedConversationId"`
	FocusedPaneID           *string                            `json:"focusedPaneId"`
	RecentDecisionSummaries []RecentDecisionSummary            `json:"recentDecisionSummaries"`
}

type RecentDecisionSummary struct {
	InputText    string                  `json:"inputText"`
	DecisionType MasterRouteDecisionType `json:"decisionType"`
	CreatedAt    string                  `json:"createdAt"`
}

type CommandResult struct {
	Action         MasterRouteDecisionType      `json:"action"`
	ConversationID *string                      `json:"conversationId"`
	SideID         *string                      `json:"sideId"`
	NarrationEvent *conversation.NarrationEvent `json:"narrationEvent"`
}

type Interaction struct {
	Sequence           int                                `json:"sequence"`
	ID                 string                             `json:"id"`
	Input              Input                              `json:"input"`
	Candidates         []conversationindex.TopicCandidate `json:"candidates"`
	Decision           RouteDecision                      `json:"decision"`
	Command            *CommandResult                     `json:"command"`
	ResolvedInvocation conversation.ResolvedInvocation    `json:"resolvedInvocation"`
	Outcome            string                             `json:"outcome"`
	Error              *conversation.Failure              `json:"error"`
	CreatedAt          string                             `json:"createdAt"`
}

type Session struct {
	ID                 string                          `json:"id"`
	ProviderThreadID   string                          `json:"providerThreadId"`
	Status             MasterSessionStatus             `json:"status"`
	ResolvedInvocation conversation.ResolvedInvocation `json:"resolvedInvocation"`
	CreatedAt          string                          `json:"createdAt"`
	UpdatedAt          string                          `json:"updatedAt"`
	Degradation        *conversation.Failure           `json:"degradation"`
}

type State struct {
	SchemaVersion int           `json:"schemaVersion"`
	Session       *Session      `json:"session"`
	Interactions  []Interaction `json:"interactions"`
	EventCursor   int           `json:"eventCursor"`
}

type PresentationIntent interface {
	presentationIntentType() MasterPresentationIntentType
}

type FocusExistingPaneIntent struct {
	Type           MasterPresentationIntentType `json:"type"`
	ConversationID string                       `json:"conversationId"`
	PaneID         string                       `json:"paneId"`
}

type OpenConversationPaneIntent struct {
	Type           MasterPresentationIntentType `json:"type"`
	WorkspaceID    string                       `json:"workspaceId"`
	ConversationID string                       `json:"conversationId"`
}

type OpenSideConversationIntent struct {
	Type                 MasterPresentationIntentType `json:"type"`
	ParentConversationID string                       `json:"parentConversationId"`
	ParentPaneID         string                       `json:"parentPaneId"`
	SideID               string                       `json:"sideId"`
}

type ShowMasterReplyIntent struct {
	Type MasterPresentationIntentType `json:"type"`
	Text string                       `json:"text"`
}

func (FocusExistingPaneIntent) presentationIntentType() MasterPresentationIntentType {
	return PresentationIntentFocusExisting
}
func (OpenConversationPaneIntent) presentationIntentType() MasterPresentationIntentType {
	return PresentationIntentOpenConversation
}
func (OpenSideConversationIntent) presentationIntentType() MasterPresentationIntentType {
	return PresentationIntentOpenSide
}
func (ShowMasterReplyIntent) presentationIntentType() MasterPresentationIntentType {
	return PresentationIntentShowReply
}

type Event struct {
	SchemaVersion int          `json:"schemaVersion"`
	StreamID      string       `json:"streamId"`
	Sequence      int          `json:"sequence"`
	EventID       string       `json:"eventId"`
	EmittedAt     string       `json:"emittedAt"`
	Payload       EventPayload `json:"payload"`
}

type EventPayload interface {
	eventType() MasterEventType
}

type SessionUpdatedPayload struct {
	Type    MasterEventType `json:"type"`
	Session Session         `json:"session"`
}

type RouteCommittedPayload struct {
	Type        MasterEventType `json:"type"`
	Interaction Interaction     `json:"interaction"`
}

type PresentationIntentPayload struct {
	Type   MasterEventType    `json:"type"`
	Intent PresentationIntent `json:"intent"`
}

type ReplyPayload struct {
	Type MasterEventType `json:"type"`
	Text string          `json:"text"`
}

func (SessionUpdatedPayload) eventType() MasterEventType     { return EventTypeSessionUpdated }
func (RouteCommittedPayload) eventType() MasterEventType     { return EventTypeRouteCommitted }
func (PresentationIntentPayload) eventType() MasterEventType { return EventTypePresentationIntent }
func (ReplyPayload) eventType() MasterEventType              { return EventTypeReply }

type ContractUnionVariant struct {
	KindValue string
	Name      string
	Type      reflect.Type
}

type ContractUnion struct {
	Discriminator string
	Name          string
	Type          reflect.Type
	Variants      []ContractUnionVariant
}

func ContractUnions() []ContractUnion {
	return []ContractUnion{
		{
			Discriminator: "type", Name: "RouteDecision", Type: reflect.TypeFor[RouteDecision](),
			Variants: []ContractUnionVariant{
				{KindValue: string(RouteDecisionSendToAgent), Name: "SendToAgentDecision", Type: reflect.TypeFor[SendToAgentDecision]()},
				{KindValue: string(RouteDecisionAskNarrator), Name: "AskNarratorDecision", Type: reflect.TypeFor[AskNarratorDecision]()},
				{KindValue: string(RouteDecisionFocusConversation), Name: "FocusConversationDecision", Type: reflect.TypeFor[FocusConversationDecision]()},
				{KindValue: string(RouteDecisionCreateConversation), Name: "CreateConversationDecision", Type: reflect.TypeFor[CreateConversationDecision]()},
				{KindValue: string(RouteDecisionCreateSideConversation), Name: "CreateSideConversationDecision", Type: reflect.TypeFor[CreateSideConversationDecision]()},
				{KindValue: string(RouteDecisionForkConversation), Name: "ForkConversationDecision", Type: reflect.TypeFor[ForkConversationDecision]()},
				{KindValue: string(RouteDecisionClarify), Name: "ClarifyDecision", Type: reflect.TypeFor[ClarifyDecision]()},
				{KindValue: string(RouteDecisionAnswerGlobal), Name: "AnswerGlobalDecision", Type: reflect.TypeFor[AnswerGlobalDecision]()},
			},
		},
		{
			Discriminator: "type", Name: "PresentationIntent", Type: reflect.TypeFor[PresentationIntent](),
			Variants: []ContractUnionVariant{
				{KindValue: string(PresentationIntentFocusExisting), Name: "FocusExistingPaneIntent", Type: reflect.TypeFor[FocusExistingPaneIntent]()},
				{KindValue: string(PresentationIntentOpenConversation), Name: "OpenConversationPaneIntent", Type: reflect.TypeFor[OpenConversationPaneIntent]()},
				{KindValue: string(PresentationIntentOpenSide), Name: "OpenSideConversationIntent", Type: reflect.TypeFor[OpenSideConversationIntent]()},
				{KindValue: string(PresentationIntentShowReply), Name: "ShowMasterReplyIntent", Type: reflect.TypeFor[ShowMasterReplyIntent]()},
			},
		},
		{
			Discriminator: "type", Name: "MasterEventPayload", Type: reflect.TypeFor[EventPayload](),
			Variants: []ContractUnionVariant{
				{KindValue: string(EventTypeSessionUpdated), Name: "SessionUpdatedPayload", Type: reflect.TypeFor[SessionUpdatedPayload]()},
				{KindValue: string(EventTypeRouteCommitted), Name: "RouteCommittedPayload", Type: reflect.TypeFor[RouteCommittedPayload]()},
				{KindValue: string(EventTypePresentationIntent), Name: "PresentationIntentPayload", Type: reflect.TypeFor[PresentationIntentPayload]()},
				{KindValue: string(EventTypeReply), Name: "ReplyPayload", Type: reflect.TypeFor[ReplyPayload]()},
			},
		},
	}
}

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "MasterInputModality", Values: []string{string(InputModalityText), string(InputModalityVoice)}},
		{Name: "MasterRouteDecisionType", Values: []string{
			string(RouteDecisionSendToAgent), string(RouteDecisionAskNarrator), string(RouteDecisionFocusConversation),
			string(RouteDecisionCreateConversation), string(RouteDecisionCreateSideConversation), string(RouteDecisionForkConversation),
			string(RouteDecisionClarify), string(RouteDecisionAnswerGlobal),
		}},
		{Name: "MasterPresentationIntentType", Values: []string{
			string(PresentationIntentFocusExisting), string(PresentationIntentOpenConversation), string(PresentationIntentOpenSide), string(PresentationIntentShowReply),
		}},
		{Name: "MasterEventType", Values: []string{
			string(EventTypeSessionUpdated), string(EventTypeRouteCommitted), string(EventTypePresentationIntent), string(EventTypeReply),
		}},
		{Name: "MasterSessionStatus", Values: []string{string(SessionStatusReady), string(SessionStatusRunning), string(SessionStatusDegraded)}},
	}
}

func validateConversationInput(actual MasterRouteDecisionType, expected MasterRouteDecisionType, conversationID string, input conversation.AuthoredInput) error {
	if err := validateDecisionIdentity(actual, expected, conversationID); err != nil {
		return err
	}
	return input.Validate()
}

func validateDecisionIdentity(actual MasterRouteDecisionType, expected MasterRouteDecisionType, conversationID string) error {
	if actual != expected {
		return invalidDecisionType(actual, expected)
	}
	return validateIdentifier("route conversation id", conversationID)
}

func invalidDecisionType(actual MasterRouteDecisionType, expected MasterRouteDecisionType) error {
	return fmt.Errorf("route decision type %q does not match %q", actual, expected)
}

func validateIdentifier(label string, value string) error {
	if strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must be non-empty and trimmed", label)
	}
	for _, character := range value {
		if character == ':' || character == '_' || character == '-' || character == '.' ||
			character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' {
			continue
		}
		return fmt.Errorf("%s contains unsupported character %q", label, character)
	}
	return nil
}

func validateText(label string, value string) error {
	if strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must be non-empty and trimmed", label)
	}
	return nil
}
