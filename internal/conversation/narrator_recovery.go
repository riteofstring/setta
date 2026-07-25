package conversation

import (
	"fmt"
)

// NarratorInvocationStartedCommit records that one live narrator invocation
// crossed the durable boundary before the provider call begins. It does not
// advance projection or checkpoint cursors.
type NarratorInvocationStartedCommit struct {
	ConversationID   string
	Expected         NarratorStateExpectation
	CommittedEventID string
	StartedAt        string
}

func (request NarratorInvocationStartedCommit) Validate() error {
	if err := validateIdentifier("narrator invocation start conversation id", request.ConversationID); err != nil {
		return err
	}
	if err := validateNarratorExpectedVersion(request.Expected, request.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator invocation start committed event id", request.CommittedEventID); err != nil {
		return err
	}
	expectedAt, err := validateTimestamp("narrator invocation start expected updatedAt", request.Expected.UpdatedAt)
	if err != nil {
		return err
	}
	startedAt, err := validateTimestamp("narrator invocation startedAt", request.StartedAt)
	if err != nil {
		return err
	}
	if !startedAt.After(expectedAt) {
		return fmt.Errorf("narrator invocation startedAt must advance beyond expected updatedAt")
	}
	return nil
}

// NarratorTerminalRecoveryTarget is one interrupted live terminal narrator
// projection that was marked running before a crash and has not committed its
// final summary.
type NarratorTerminalRecoveryTarget struct {
	WorkspaceID      string
	ConversationID   string
	TurnID           string
	TerminalSequence int
}

func (target NarratorTerminalRecoveryTarget) Validate() error {
	if err := validateIdentifier("narrator recovery workspace id", target.WorkspaceID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator recovery conversation id", target.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator recovery turn id", target.TurnID); err != nil {
		return err
	}
	if target.TerminalSequence <= 0 {
		return fmt.Errorf("narrator recovery terminal sequence must be positive")
	}
	return nil
}
