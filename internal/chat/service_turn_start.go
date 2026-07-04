package chat

import "fmt"

func (service *Service) ensureCanStartTurnLocked(workspaceID string, conversationID string, key string) error {
	if _, ok := service.active[key]; ok {
		return fmt.Errorf("conversation already has an active turn: %s", conversationID)
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return err
	}
	if run, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs); err != nil {
		return err
	} else if ok {
		return fmt.Errorf("conversation already has an active run: %s", run.ID)
	}
	if state, err := service.queuedStateFromRunsLocked(workspaceID, conversationID, runs); err != nil {
		return err
	} else if len(state.Runs) > 0 {
		return fmt.Errorf("conversation has queued messages: %s", conversationID)
	}
	return nil
}
