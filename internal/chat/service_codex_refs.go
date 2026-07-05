package chat

func (service *Service) linkThread(workspaceID string, conversationID string, runID string, threadID string, sessionID string, turnID string, settings *ChatCodexEffectiveSettings) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return err
	}
	now := timestamp(service.now())
	upsertHarnessRef(&conversation.HarnessRefs, HarnessThreadRef{
		Harness:        HarnessCodex,
		ThreadID:       threadID,
		SessionID:      sessionID,
		LastTurnID:     turnID,
		Status:         HarnessRefLinked,
		CreatedAt:      now,
		LastResumedAt:  now,
		UnavailableMsg: "",
	})
	if settings != nil {
		conversation.CodexEffectiveSettings = settings
	}
	conversation.UpdatedAt = now
	if err := service.store.SaveConversation(conversation); err != nil {
		return err
	}
	if err := service.traceLocked(workspaceID, runID, "codex_thread_ref_linked", "Codex thread reference linked"); err != nil {
		return err
	}
	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	var liveness RunLiveness
	livenessUpdated := false
	if ok && active.runID == runID {
		active.threadID = threadID
		active.turnID = turnID
		service.active[key] = active
		liveness, livenessUpdated, err = service.markRunLivenessAttachedLocked(workspaceID, conversationID, runID, threadID, turnID, now)
		if err != nil {
			return err
		}
	}
	if livenessUpdated {
		if _, err := service.events.Publish(NewRunLivenessUpdatedEvent(liveness)); err != nil {
			return err
		}
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
}

func (service *Service) updateCodexEffectiveSettings(workspaceID string, conversationID string, runID string, settings ChatCodexEffectiveSettings) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return err
	}
	now := timestamp(service.now())
	conversation.CodexEffectiveSettings = &settings
	conversation.UpdatedAt = now
	if err := service.store.SaveConversation(conversation); err != nil {
		return err
	}
	if err := service.traceLocked(workspaceID, runID, "codex_effective_settings_updated", "Codex effective settings updated"); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
}
