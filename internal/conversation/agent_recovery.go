package conversation

// restartedAgentTurn identifies one primary turn that was still in flight when
// the previous Setta process stopped. It is named by Setta ids alone: the
// carrier it ran on was ephemeral, so there is no provider reference left to
// reconcile it against.
type restartedAgentTurn struct {
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

func (target restartedAgentTurn) validate() error {
	if err := validateIdentifier("restarted agent turn workspace id", target.WorkspaceID); err != nil {
		return err
	}
	if err := validateIdentifier("restarted agent turn conversation id", target.ConversationID); err != nil {
		return err
	}
	return validateIdentifier("restarted agent turn id", target.TurnID)
}

func (target agentQueueRecoveryTarget) validate() error {
	if err := validateIdentifier("agent queue recovery workspace id", target.WorkspaceID); err != nil {
		return err
	}
	return validateIdentifier("agent queue recovery conversation id", target.ConversationID)
}
