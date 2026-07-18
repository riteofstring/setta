package chat

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

type PostCommitTurnStartFailurePoint string

const (
	PostCommitTurnStartFailurePublish       PostCommitTurnStartFailurePoint = "publish"
	PostCommitTurnStartFailureDeliveryInput PostCommitTurnStartFailurePoint = "delivery_input"
	PostCommitTurnStartFailureLaunch        PostCommitTurnStartFailurePoint = "launch"
)

func WithPostCommitTurnStartFailure(point PostCommitTurnStartFailurePoint, failAttempt int, failure error) (Option, error) {
	if err := validatePostCommitTurnStartFailurePoint(point); err != nil {
		return nil, err
	}
	if failAttempt <= 0 {
		return nil, fmt.Errorf("post-commit turn start failure attempt must be positive: %d", failAttempt)
	}
	if failure == nil {
		return nil, errors.New("post-commit turn start failure error is required")
	}
	interceptor := postCommitTurnStartFailureInterceptor(point, failAttempt, failure)
	return func(service *Service) {
		previous := service.postCommitTurnStartInterceptor
		service.postCommitTurnStartInterceptor = func(start postCommitHarnessTurnStart) postCommitHarnessTurnStart {
			if previous != nil {
				start = previous(start)
			}
			return interceptor(start)
		}
	}, nil
}

func validatePostCommitTurnStartFailurePoint(point PostCommitTurnStartFailurePoint) error {
	switch point {
	case PostCommitTurnStartFailurePublish, PostCommitTurnStartFailureDeliveryInput, PostCommitTurnStartFailureLaunch:
		return nil
	default:
		return fmt.Errorf("unsupported post-commit turn start failure point: %s", point)
	}
}

func postCommitTurnStartFailureInterceptor(point PostCommitTurnStartFailurePoint, failAttempt int, failure error) func(postCommitHarnessTurnStart) postCommitHarnessTurnStart {
	var mu sync.Mutex
	attempts := 0
	return func(start postCommitHarnessTurnStart) postCommitHarnessTurnStart {
		mu.Lock()
		attempts++
		shouldFail := attempts == failAttempt
		mu.Unlock()
		if !shouldFail {
			return start
		}
		switch point {
		case PostCommitTurnStartFailurePublish:
			publish := start.Publish
			start.Publish = func() error {
				if publish != nil {
					if err := publish(); err != nil {
						return err
					}
				}
				return failure
			}
		case PostCommitTurnStartFailureDeliveryInput:
			start.DeliveryInput = func() (ChatInput, error) {
				return ChatInput{}, failure
			}
		case PostCommitTurnStartFailureLaunch:
			start.Launch = func(context.Context, TurnRequest) error {
				return failure
			}
		}
		return start
	}
}
