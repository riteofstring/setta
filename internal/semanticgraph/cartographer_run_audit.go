package semanticgraph

import (
	"context"
	"time"
)

func (service *Service) applyCartographerRunSettingsSnapshot(ctx context.Context, run *CartographerRun, force bool) error {
	if !force && cartographerRunSettingsSnapshotComplete(*run) {
		return nil
	}
	record, err := service.store.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		return err
	}
	profile := cartographerTaskProfileForTrigger(run.TriggerKind)
	config := semanticCartographerSettingsTaskConfig(record.Settings, profile)
	run.SettingsHash = record.SettingsHash
	run.TaskProfile = profile
	run.RequestedModelSelection = config.ModelSelection
	run.RequestedModel = config.ModelID
	run.RequestedReasoningEffort = config.ReasoningEffort
	return nil
}

func cartographerRunSettingsSnapshotComplete(run CartographerRun) bool {
	if run.SettingsHash == "" || run.TaskProfile == "" || run.RequestedModelSelection == "" || run.RequestedReasoningEffort == "" {
		return false
	}
	if run.RequestedModelSelection == SemanticCartographerModelSelectionExplicit && run.RequestedModel == "" {
		return false
	}
	return true
}

func semanticCartographerSettingsTaskConfig(settings SemanticCartographerSettings, profile CartographerTaskProfile) SemanticCartographerTaskConfig {
	if profile == CartographerTaskProfileFinalSynthesis {
		return settings.FinalSynthesisTaskConfig
	}
	return settings.LiveTaskConfig
}

func cartographerTaskProfileForTrigger(trigger CartographerRunTriggerKind) CartographerTaskProfile {
	switch trigger {
	case CartographerTriggerWorkflowWindow:
		return CartographerTaskProfileLiveWindow
	case CartographerTriggerWorkflowDone:
		return CartographerTaskProfileFinalSynthesis
	case CartographerTriggerExplicitRetry:
		return CartographerTaskProfileRetry
	case CartographerTriggerExplicitReview:
		return CartographerTaskProfileReview
	default:
		return CartographerTaskProfileManual
	}
}

func cartographerInputBundleCloseReason(bundle CartographerInputBundle) CartographerWindowCloseReason {
	for index := len(bundle.NewEvents) - 1; index >= 0; index-- {
		reason := bundle.NewEvents[index].CloseReason
		if reason != "" && reason != CartographerCloseNone {
			return reason
		}
	}
	return CartographerCloseNone
}

func cartographerDurationMillis(start string, end string) int {
	if start == "" || end == "" {
		return 0
	}
	startedAt, err := time.Parse(time.RFC3339Nano, start)
	if err != nil {
		return 0
	}
	endedAt, err := time.Parse(time.RFC3339Nano, end)
	if err != nil {
		return 0
	}
	duration := endedAt.Sub(startedAt)
	if duration < 0 {
		return 0
	}
	return int(duration / time.Millisecond)
}

func elapsedMillis(start time.Time) int {
	elapsed := time.Since(start)
	if elapsed < 0 {
		return 0
	}
	return int(elapsed / time.Millisecond)
}

func boolToSQLiteInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func sqliteIntToBool(value int) bool {
	return value != 0
}
