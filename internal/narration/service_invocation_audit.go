package narration

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/conversation"
)

func (service *Service) recordNonCommittedInvocation(
	completion Completion,
	outcome conversation.InvocationAttemptOutcome,
) {
	attempt, err := nonCommittedNarratorAttempt(completion, outcome)
	if err != nil {
		service.recordInvocationAuditError(fmt.Errorf(
			"build %s narrator invocation audit for %s: %w",
			outcome,
			completion.Request.ID,
			err,
		))
		return
	}
	eventID := fmt.Sprintf(
		"conversation-invocation-attempted:%s:%d:%s",
		attempt.ID,
		attempt.Generation,
		attempt.Outcome,
	)
	service.startInvocationAuditTask(func(ctx context.Context) error {
		if err := service.store.RecordInvocationAttempt(ctx, eventID, attempt, attempt.EndedAt); err != nil {
			return fmt.Errorf("record narrator invocation audit %s: %w", attempt.ID, err)
		}
		return nil
	})
}

// Invocation-audit tasks remain admissible while Shutdown closes the mailbox:
// active cancellation completions are emitted during Registry.Shutdown, and
// the store remains available until Service.Shutdown has joined these tasks.
func (service *Service) startInvocationAuditTask(task func(context.Context) error) {
	service.lifecycleMu.Lock()
	service.tasks.Add(1)
	service.lifecycleMu.Unlock()
	go func() {
		defer service.tasks.Done()
		if err := task(context.Background()); err != nil {
			service.recordInvocationAuditError(err)
		}
	}()
}

func (service *Service) recordInvocationAuditError(err error) {
	if err == nil {
		return
	}
	service.lifecycleMu.Lock()
	service.invocationAuditErrors = append(service.invocationAuditErrors, err)
	service.lifecycleMu.Unlock()
}

func (service *Service) invocationAuditError() error {
	service.lifecycleMu.Lock()
	defer service.lifecycleMu.Unlock()
	return errors.Join(service.invocationAuditErrors...)
}
