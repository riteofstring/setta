package narration

import (
	"context"
	"errors"
	"time"
)

type conversationRouteQueue struct {
	notified bool
	running  bool
}

// AttachConversationRouteCommandExecutor connects committed local decisions
// to the production command services. Runtime wiring installs it before input
// recovery or intake begins; focused router tests may omit it to inspect only
// the durable decision boundary.
func (service *Service) AttachConversationRouteCommandExecutor(
	executor ConversationRouteCommandExecutor,
) error {
	if service == nil || service.inputRouter == nil {
		return errors.New("conversation router service is required")
	}
	if executor == nil {
		return errors.New("conversation route command executor is required")
	}
	service.lifecycleMu.Lock()
	defer service.lifecycleMu.Unlock()
	if service.closing {
		return errors.New("conversation router service is shutting down")
	}
	if service.inputRouter.executor != nil {
		return errors.New("conversation route command executor is already attached")
	}
	service.inputRouter.executor = executor
	return nil
}

// NotifyConversationInput is the push boundary from durable intake. It only
// schedules work; provider calls run on the narrator service lifecycle rather
// than the HTTP or transcription request context.
func (service *Service) NotifyConversationInput(conversationID string) error {
	if service == nil || service.inputRouter == nil {
		return errors.New("conversation router service is required")
	}
	if err := validateIdentifier("conversation router notification conversation id", conversationID); err != nil {
		return err
	}
	service.lifecycleMu.Lock()
	if service.closing {
		service.lifecycleMu.Unlock()
		return errors.New("conversation router service is shutting down")
	}
	queue := service.routing[conversationID]
	if queue == nil {
		queue = &conversationRouteQueue{}
		service.routing[conversationID] = queue
	}
	queue.notified = true
	if queue.running {
		service.lifecycleMu.Unlock()
		return nil
	}
	queue.running = true
	ctx := service.lifecycleCtx
	service.tasks.Add(1)
	service.lifecycleMu.Unlock()
	go service.runConversationRouteQueue(ctx, conversationID, queue)
	return nil
}

func (service *Service) runConversationRouteQueue(
	ctx context.Context,
	conversationID string,
	queue *conversationRouteQueue,
) {
	defer service.tasks.Done()
	retryAttempt := 0
	for {
		service.lifecycleMu.Lock()
		if service.closing || service.routing[conversationID] != queue {
			delete(service.routing, conversationID)
			service.lifecycleMu.Unlock()
			return
		}
		queue.notified = false
		service.lifecycleMu.Unlock()

		for {
			processed, err := service.inputRouter.ProcessNext(ctx, conversationID)
			if err != nil {
				var committed *committedConversationRouteCommandError
				if !errors.As(err, &committed) {
					break
				}
				if waitErr := service.retryWait(
					ctx,
					conversationRouteCommandRetryDelay(retryAttempt),
				); waitErr != nil {
					break
				}
				retryAttempt++
				continue
			}
			retryAttempt = 0
			if !processed {
				break
			}
		}

		service.lifecycleMu.Lock()
		if service.closing {
			delete(service.routing, conversationID)
			service.lifecycleMu.Unlock()
			return
		}
		if queue.notified {
			service.lifecycleMu.Unlock()
			continue
		}
		delete(service.routing, conversationID)
		service.lifecycleMu.Unlock()
		return
	}
}

// A committed decision remains the authoritative command after a transient
// execution failure. Retrying its stable ids on one cancellable timer keeps
// the in-process path as durable as startup recovery without polling state.
func conversationRouteCommandRetryDelay(attempt int) time.Duration {
	switch attempt {
	case 0:
		return initialRetryDelay
	case 1:
		return secondRetryDelay
	default:
		return finalRetryDelay
	}
}

// RecoverConversationInputs re-admits durable accepted local input work after
// in-flight claims have been reset. It is a bounded startup scan, never a poll.
func (service *Service) RecoverConversationInputs(ctx context.Context) error {
	if service == nil || service.store == nil || service.inputRouter == nil {
		return errors.New("conversation router service is required")
	}
	if ctx == nil {
		return errors.New("conversation router recovery context is required")
	}
	conversationIDs, err := service.store.ListPendingConversationRouteInputs(ctx)
	if err != nil {
		return err
	}
	for _, conversationID := range conversationIDs {
		if err := service.NotifyConversationInput(conversationID); err != nil {
			return err
		}
	}
	return nil
}
