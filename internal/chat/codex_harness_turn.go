package chat

func (harness *CodexHarness) applyNotificationTurnID(runID string, threadID string, activeTurnID string, result codexNotificationResult, sink TurnSink) (string, error) {
	if result.TurnID == "" || result.TurnID == activeTurnID {
		return activeTurnID, nil
	}
	harness.updateActiveTurn(runID, threadID, result.TurnID)
	if err := sink.ThreadLinked(threadID, "", result.TurnID, nil); err != nil {
		return "", err
	}
	return result.TurnID, nil
}
