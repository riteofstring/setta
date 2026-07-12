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
