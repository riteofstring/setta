package narration

import (
	"context"
	"errors"
)

type conversationRouteQueue struct {
	notified bool
	running  bool
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
			if err != nil || !processed {
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

// RecoverConversationInputs re-admits only durable accepted route work after
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
