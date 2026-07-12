package conversation

import (
	"errors"
	"fmt"
)

type BranchDecisionKind string
type BranchDecisionSource string

const (
	BranchDecisionKindCreateSideConversation BranchDecisionKind = "create_side_conversation"
	BranchDecisionKindForkConversation       BranchDecisionKind = "fork_conversation"

	BranchDecisionSourceExplicit           BranchDecisionSource = "explicit"
	BranchDecisionSourceConversationRouter BranchDecisionSource = "conversation_router"
	BranchDecisionSourceMaster             BranchDecisionSource = "master"
)

// CreateSideConversationBranchDecision is deliberately empty. The model-owned
// decision selects an operation but cannot name a provider thread, pane, or
// renderer command. The trusted execution scope supplies the parent and pane.
type CreateSideConversationBranchDecision struct{}

// ForkConversationBranchDecision contains only Setta-owned fork inputs. The
// executor resolves every provider reference from the durable parent state.
type ForkConversationBranchDecision struct {
	ForkedAtTurnID string `json:"forkedAtTurnId"`
	ProposedTitle  string `json:"proposedTitle"`
}

// BranchDecision is the restricted payload shared by explicit controls and
// AI-authored routing. Exactly one branch must match Kind.
type BranchDecision struct {
	Kind                   BranchDecisionKind                    `json:"kind"`
	CreateSideConversation *CreateSideConversationBranchDecision `json:"createSideConversation"`
	ForkConversation       *ForkConversationBranchDecision       `json:"forkConversation"`
}

// BranchDecisionExecutionScope is trusted application context and is never
// part of the model decision schema. A side pane is supplied only after the
// pane coordinator or originating local control has resolved it.
type BranchDecisionExecutionScope struct {
	ParentConversationID string
	ParentPaneID         *string
	SideConversationID   *string
	ChildConversationID  *string
	Source               BranchDecisionSource
}

func (decision BranchDecision) Validate() error {
	switch decision.Kind {
	case BranchDecisionKindCreateSideConversation:
		if decision.CreateSideConversation == nil || decision.ForkConversation != nil {
			return errors.New("create-side branch decision requires only createSideConversation")
		}
		return nil
	case BranchDecisionKindForkConversation:
		if decision.ForkConversation == nil || decision.CreateSideConversation != nil {
			return errors.New("fork branch decision requires only forkConversation")
		}
		if err := validateIdentifier("fork decision source turn id", decision.ForkConversation.ForkedAtTurnID); err != nil {
			return err
		}
		return validateTopicTitle(decision.ForkConversation.ProposedTitle)
	default:
		return fmt.Errorf("unsupported branch decision kind %q", decision.Kind)
	}
}

func (scope BranchDecisionExecutionScope) Validate(decision BranchDecision) error {
	if err := decision.Validate(); err != nil {
		return err
	}
	if err := validateIdentifier("branch decision parent conversation id", scope.ParentConversationID); err != nil {
		return err
	}
	if !validBranchDecisionSource(scope.Source) {
		return fmt.Errorf("unsupported branch decision source %q", scope.Source)
	}
	switch decision.Kind {
	case BranchDecisionKindCreateSideConversation:
		return scope.validateCreateSideConversation()
	case BranchDecisionKindForkConversation:
		return scope.validateForkConversation()
	default:
		return fmt.Errorf("unsupported branch decision kind %q", decision.Kind)
	}
}

func (scope BranchDecisionExecutionScope) validateCreateSideConversation() error {
	if scope.ParentPaneID == nil {
		return errors.New("create-side branch decision requires a resolved parent pane")
	}
	if scope.ChildConversationID != nil {
		return errors.New("create-side branch decision must not contain a child conversation id")
	}
	if err := validateIdentifier("branch decision parent pane id", *scope.ParentPaneID); err != nil {
		return err
	}
	if scope.SideConversationID == nil {
		return nil
	}
	return validateIdentifier("branch decision side conversation id", *scope.SideConversationID)
}

func (scope BranchDecisionExecutionScope) validateForkConversation() error {
	if scope.ParentPaneID != nil || scope.SideConversationID != nil {
		return errors.New("fork branch decision must not contain side-conversation scope")
	}
	if scope.ChildConversationID == nil {
		return nil
	}
	return validateIdentifier("branch decision child conversation id", *scope.ChildConversationID)
}

func validBranchDecisionSource(source BranchDecisionSource) bool {
	switch source {
	case BranchDecisionSourceExplicit,
		BranchDecisionSourceConversationRouter,
		BranchDecisionSourceMaster:
		return true
	default:
		return false
	}
}
