package conversation

// AgentTurnRecoveryTarget identifies one durable primary turn that was still
// running when the previous Setta process stopped. Provider references are
// required so startup can reconcile the exact turn without replaying input.
type AgentTurnRecoveryTarget struct {
	WorkspaceID      string
	ConversationID   string
	TurnID           string
	ProviderThreadID string
	ProviderTurnID   string
}

// unlinkedAgentTurnRecoveryTarget identifies accepted primary work whose
// provider turn identity never reached durable state. Startup cannot safely
// replay this input because the provider may have accepted it before Setta
// stopped.
type unlinkedAgentTurnRecoveryTarget struct {
	WorkspaceID    string
	ConversationID string
	TurnID         string
}

// agentQueueRecoveryTarget identifies a conversation with durable queued work
// and no running primary turn. The in-process promotion signal may have been
// lost between a terminal commit and process exit.
type agentQueueRecoveryTarget struct {
	WorkspaceID    string
	ConversationID string
}

func (target AgentTurnRecoveryTarget) Validate() error {
	if err := validateIdentifier("agent recovery workspace id", target.WorkspaceID); err != nil {
		return err
	}
	if err := validateIdentifier("agent recovery conversation id", target.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("agent recovery turn id", target.TurnID); err != nil {
		return err
	}
	if err := validateIdentifier("agent recovery provider thread id", target.ProviderThreadID); err != nil {
		return err
	}
	if err := validateIdentifier("agent recovery provider turn id", target.ProviderTurnID); err != nil {
		return err
	}
	return nil
}

func (target unlinkedAgentTurnRecoveryTarget) validate() error {
	if err := validateIdentifier("unlinked agent recovery workspace id", target.WorkspaceID); err != nil {
		return err
	}
	if err := validateIdentifier("unlinked agent recovery conversation id", target.ConversationID); err != nil {
		return err
	}
	return validateIdentifier("unlinked agent recovery turn id", target.TurnID)
}

func (target agentQueueRecoveryTarget) validate() error {
	if err := validateIdentifier("agent queue recovery workspace id", target.WorkspaceID); err != nil {
		return err
	}
	return validateIdentifier("agent queue recovery conversation id", target.ConversationID)
}
