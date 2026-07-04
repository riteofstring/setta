package chat

import (
	"context"
	"fmt"

	"setta/internal/semanticcontext"
	"setta/internal/workspace"
)

type postCommitHarnessTurnStart struct {
	Workspace        workspace.WorkspaceSummary
	Conversation     Conversation
	Run              Run
	AssistantMessage ChatMessage
	SemanticContext  *semanticcontext.Delivery
	Publish          func() error
	DeliveryInput    func() (ChatInput, error)
	Launch           func(context.Context, TurnRequest) error
}

func (service *Service) ensureCanStartTurnLocked(workspaceID string, conversationID string, key string) error {
	if service.shuttingDown {
		return fmt.Errorf("chat service is shutting down")
	}
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

func (service *Service) startPostCommitHarnessTurnLocked(start postCommitHarnessTurnStart) error {
	if service.postCommitTurnStartInterceptor != nil {
		start = service.postCommitTurnStartInterceptor(start)
	}
	workspaceID := start.Workspace.ID
	conversationID := start.Conversation.ID
	runID := start.Run.ID
	ctx, cancel := context.WithCancel(context.Background())
	key := activeKey(workspaceID, conversationID)
	service.activateTurnLocked(workspaceID, conversationID, activeTurn{
		assistantMessage: start.AssistantMessage,
		cancel:           cancel,
	}, start.Run)
	ingest, err := service.newTranscriptIngestLocked(workspaceID, start.Run)
	if err != nil {
		return service.abortPostCommitHarnessTurnStartLocked(workspaceID, conversationID, runID, cancel, err)
	}
	active := service.active[key]
	active.transcript = ingest
	service.active[key] = active
	if start.Publish != nil {
		if err := start.Publish(); err != nil {
			return service.abortPostCommitHarnessTurnStartLocked(workspaceID, conversationID, runID, cancel, err)
		}
	}
	if start.DeliveryInput == nil {
		return service.abortPostCommitHarnessTurnStartLocked(workspaceID, conversationID, runID, cancel, fmt.Errorf("turn delivery input builder is required"))
	}
	deliveryInput, err := start.DeliveryInput()
	if err != nil {
		return service.abortPostCommitHarnessTurnStartLocked(workspaceID, conversationID, runID, cancel, err)
	}
	request := TurnRequest{
		Workspace:       start.Workspace,
		Conversation:    start.Conversation,
		Run:             start.Run,
		Input:           deliveryInput,
		SemanticContext: start.SemanticContext,
		ThreadRef:       latestHarnessRef(start.Conversation, HarnessCodex),
	}
	launch := start.Launch
	if launch == nil {
		launch = service.launchHarnessTurnLocked
	}
	if err := launch(ctx, request); err != nil {
		return service.abortPostCommitHarnessTurnStartLocked(workspaceID, conversationID, runID, cancel, err)
	}
	return nil
}

func (service *Service) abortPostCommitHarnessTurnStartLocked(workspaceID string, conversationID string, runID string, cancel context.CancelFunc, startErr error) error {
	cancel()
	if failErr := service.failTurnLocked(workspaceID, conversationID, runID, startErr.Error()); failErr != nil {
		return failErr
	}
	return startErr
}
