package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"setta/internal/codexapp"
)

var codexGoalCancelDrainTimeout = 2 * time.Second

func (operation *codexGoalOperation) Cancel(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	session, threadID, turnID, finished := operation.cancelSnapshot()
	if finished {
		return nil
	}
	if session == nil {
		return ErrTurnNotStarted
	}
	if err := operation.pauseProviderGoal(ctx, session, threadID); err != nil {
		return err
	}
	if turnID != "" {
		if err := operation.interruptPhysicalTurn(ctx, session, threadID, turnID); err != nil {
			return err
		}
		return nil
	}
	operation.finish(TurnCompletion{Outcome: TurnOutcomeCancelled}, nil)
	return nil
}

func (operation *codexGoalOperation) CancelDrainTimeout() time.Duration {
	return codexGoalCancelDrainTimeout
}

func (operation *codexGoalOperation) cancelSnapshot() (*codexapp.Session, string, string, bool) {
	operation.mu.Lock()
	defer operation.mu.Unlock()
	return operation.session, operation.threadID, operation.currentTurnID, operation.state == codexGoalOperationFinished
}

func (operation *codexGoalOperation) pauseProviderGoal(ctx context.Context, session *codexapp.Session, threadID string) error {
	status := codexapp.ThreadGoalStatusPaused
	_, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Status:   &status,
		ThreadID: threadID,
	})
	if err != nil {
		return fmt.Errorf("pause codex goal operation thread %s: %w", threadID, err)
	}
	return nil
}

func (operation *codexGoalOperation) interruptPhysicalTurn(ctx context.Context, session *codexapp.Session, threadID string, turnID string) error {
	_, err := session.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
		ThreadID: threadID,
		TurnID:   turnID,
	})
	if err != nil {
		activeTurnID, ok, parseErr := codexActiveTurnIDFromRPCErrorData(err)
		if parseErr != nil {
			return parseErr
		}
		if ok && activeTurnID != turnID {
			if err := operation.adoptProviderActiveTurn(session, activeTurnID); err != nil {
				return fmt.Errorf("adopt codex goal operation active turn %s after stale turn %s: %w", activeTurnID, turnID, err)
			}
			_, retryErr := session.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
				ThreadID: threadID,
				TurnID:   activeTurnID,
			})
			if retryErr == nil {
				return nil
			}
			return fmt.Errorf("interrupt codex goal operation active turn %s after stale turn %s: %w", activeTurnID, turnID, retryErr)
		}
		return fmt.Errorf("interrupt codex goal operation turn %s: %w", turnID, err)
	}
	return nil
}

func (operation *codexGoalOperation) adoptProviderActiveTurn(session *codexapp.Session, turnID string) error {
	if session == nil {
		return fmt.Errorf("codex goal operation session is required to adopt active turn %s", turnID)
	}
	operation.mu.Lock()
	if operation.state == codexGoalOperationFinished {
		err := operation.finishedErrorLocked()
		operation.mu.Unlock()
		return err
	}
	if operation.logicalTurnID == "" {
		operation.logicalTurnID = turnID
	}
	operation.currentTurnID = turnID
	operation.pendingDone = false
	operation.pendingCompletion = TurnCompletion{}
	runID := operation.runID
	threadID := operation.threadID
	logicalTurnID := operation.logicalTurnID
	operation.mu.Unlock()

	operation.harness.updateActiveGoalTurn(runID, threadID, logicalTurnID, turnID)
	return session.OwnTurn(threadID, turnID)
}

func codexActiveTurnIDFromRPCErrorData(err error) (string, bool, error) {
	var rpcErr *codexapp.RPCError
	if !errors.As(err, &rpcErr) || len(rpcErr.Data) == 0 {
		return "", false, nil
	}
	var data map[string]any
	if decodeErr := json.Unmarshal(rpcErr.Data, &data); decodeErr != nil {
		return "", false, fmt.Errorf("decode codex rpc error data: %w", decodeErr)
	}
	for _, field := range []string{"activeTurnId", "activeTurnID"} {
		raw, ok := data[field]
		if !ok {
			continue
		}
		turnID, ok := raw.(string)
		if !ok || turnID == "" {
			return "", false, fmt.Errorf("codex rpc error data.%s must be a non-empty string", field)
		}
		return turnID, true, nil
	}
	return "", false, nil
}
