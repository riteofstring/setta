package conversation

import "time"

type OutcomeTimingKind string

const (
	OutcomeTimingCancellation      OutcomeTimingKind = "cancellation"
	OutcomeTimingApproval          OutcomeTimingKind = "approval"
	OutcomeTimingArtifactAvailable OutcomeTimingKind = "artifact_availability"
)

type OutcomeTiming struct {
	Kind        OutcomeTimingKind
	StartedAt   time.Time
	CompletedAt time.Time
	Duration    time.Duration
}

type OutcomeTimingObserver interface {
	ObserveConversationOutcomeTiming(OutcomeTiming)
}

func (service *Service) observeOutcomeTiming(kind OutcomeTimingKind, startedAt time.Time) {
	if service.outcomeTiming == nil {
		return
	}
	completedAt := service.now().UTC()
	service.outcomeTiming.ObserveConversationOutcomeTiming(OutcomeTiming{
		Kind:        kind,
		StartedAt:   startedAt,
		CompletedAt: completedAt,
		Duration:    completedAt.Sub(startedAt),
	})
}
