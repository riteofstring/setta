package conversation

import (
	"fmt"
	"strings"
)

func providerLifecycleReasonRequiresTurn(reason ProviderLifecycleReason) bool {
	switch reason {
	case ProviderLifecycleReasonTurnRetrying, ProviderLifecycleReasonTurnFailed:
		return true
	default:
		return false
	}
}

func validProviderLifecycleReason(reason ProviderLifecycleReason) bool {
	for _, candidate := range providerLifecycleReasons {
		if candidate == reason {
			return true
		}
	}
	return false
}

func (validation TrajectoryValidation) Validate() error {
	if err := validateIdentifier("validation id", validation.ID); err != nil {
		return err
	}
	if !validTrajectoryValidationKind(validation.Kind) {
		return fmt.Errorf("unsupported validation kind %q", validation.Kind)
	}
	if !validTrajectoryValidationStatus(validation.Status) {
		return fmt.Errorf("unsupported validation status %q", validation.Status)
	}
	if validation.Risk != nil && !validTrajectoryValidationRisk(*validation.Risk) {
		return fmt.Errorf("unsupported validation risk %q", *validation.Risk)
	}
	if validation.Kind == TrajectoryValidationModelVerification && validation.Risk != nil {
		return fmt.Errorf("model verification must not carry Guardian risk")
	}
	if err := validateOptionalIdentifier("validation subject", validation.Subject); err != nil {
		return err
	}
	// A validation with no summary cannot tell the user what was checked, and
	// the provider always reports enough to say so.
	if strings.TrimSpace(validation.Summary) == "" {
		return fmt.Errorf("validation %s requires a summary", validation.ID)
	}
	if strings.TrimSpace(validation.Summary) != validation.Summary {
		return fmt.Errorf("validation %s summary must not have surrounding whitespace", validation.ID)
	}
	return nil
}

func validTrajectoryValidationKind(kind TrajectoryValidationKind) bool {
	for _, candidate := range trajectoryValidationKinds {
		if candidate == kind {
			return true
		}
	}
	return false
}

func validTrajectoryValidationStatus(status TrajectoryValidationStatus) bool {
	for _, candidate := range trajectoryValidationStatuses {
		if candidate == status {
			return true
		}
	}
	return false
}

func validTrajectoryValidationRisk(risk TrajectoryValidationRisk) bool {
	for _, candidate := range trajectoryValidationRisks {
		if candidate == risk {
			return true
		}
	}
	return false
}

func trajectoryKindRequiresTurn(kind TrajectoryEventKind) bool {
	switch kind {
	case TrajectoryEventProviderLifecycleChanged:
		return false
	case TrajectoryEventUserInputAccepted,
		TrajectoryEventTurnQueued,
		TrajectoryEventTurnPromoted,
		TrajectoryEventTurnStarted,
		TrajectoryEventTurnSteered,
		TrajectoryEventTurnInterrupted,
		TrajectoryEventTurnCompleted,
		TrajectoryEventTurnFailed,
		TrajectoryEventAgentPublicTextDelta,
		TrajectoryEventAgentMessageCompleted,
		TrajectoryEventPublicReasoningSummaryUpdated,
		TrajectoryEventPlanChanged,
		TrajectoryEventActivityStarted,
		TrajectoryEventActivityProgressed,
		TrajectoryEventActivityCompleted,
		TrajectoryEventActivityFailed,
		TrajectoryEventFileChangeProposed,
		TrajectoryEventFileChangeCompleted,
		TrajectoryEventApprovalRequested,
		TrajectoryEventApprovalResolved,
		TrajectoryEventSubagentStarted,
		TrajectoryEventSubagentUpdated,
		TrajectoryEventSubagentCompleted,
		TrajectoryEventArtifactEmitted,
		TrajectoryEventAgentLivenessChanged,
		TrajectoryEventValidationRecorded,
		TrajectoryEventModelRerouted:
		return true
	default:
		return false
	}
}

func validTrajectoryActor(actor TrajectoryActor) bool {
	switch actor {
	case TrajectoryActorUser, TrajectoryActorAgent, TrajectoryActorProvider, TrajectoryActorSystem:
		return true
	default:
		return false
	}
}

func validTurnInterruptionReason(reason TurnInterruptionReason) bool {
	switch reason {
	case TurnInterruptionUserRequested,
		TurnInterruptionProviderInterrupted,
		TurnInterruptionRuntimeShutdown,
		TurnInterruptionReconciliation:
		return true
	default:
		return false
	}
}

func validAgentLivenessReason(reason AgentLivenessReason) bool {
	switch reason {
	case AgentLivenessReasonProviderRefPending,
		AgentLivenessReasonProviderTurnLinked,
		AgentLivenessReasonProviderInactive,
		AgentLivenessReasonAttachmentMissing,
		AgentLivenessReasonTurnTerminal,
		AgentLivenessReasonWakeRecheck,
		AgentLivenessReasonSnapshotLoad,
		AgentLivenessReasonStreamResync,
		AgentLivenessReasonUserRetry,
		AgentLivenessReasonProviderRestarted,
		AgentLivenessReasonProviderUnavailable,
		AgentLivenessReasonTurnNotFound:
		return true
	default:
		return false
	}
}

func subagentStatusTerminal(status SubagentStatus) bool {
	switch status {
	case SubagentStatusInterrupted,
		SubagentStatusCompleted,
		SubagentStatusErrored,
		SubagentStatusShutdown,
		SubagentStatusNotFound:
		return true
	default:
		return false
	}
}
