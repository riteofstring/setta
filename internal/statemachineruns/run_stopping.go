package statemachineruns

import (
	"errors"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/externalagents"
)

func (r *Runtime) stopRunningChildRuns(parentRun agentruns.Run) ([]string, error) {
	activeChildRunIDs := outputStringList(parentRun, outputKeyActiveChildRunIDs)
	stoppedRunIDs := make([]string, 0, len(activeChildRunIDs))
	for _, childRunID := range activeChildRunIDs {
		stoppedRunID, err := r.stopActiveChildRun(childRunID)
		if err != nil {
			return nil, err
		}
		stoppedRunIDs = append(stoppedRunIDs, stoppedRunID)
	}
	return stoppedRunIDs, nil
}

func (r *Runtime) stopActiveChildRun(childRunID string) (string, error) {
	childRun, err := r.runs.Load(childRunID)
	if err != nil {
		if errors.Is(err, agentruns.ErrRunNotFound) {
			return childRunID, nil
		}
		return "", err
	}
	if _, err := r.stopRunWithConfiguredStopper(childRun, true); err != nil {
		return "", err
	}
	return childRun.ID, nil
}

func (r *Runtime) stopChatIfRunning(chatID string, projectConfigID string) *agentruns.Run {
	latest, err := r.latestRunningChatRun(chatID, projectConfigID)
	if err != nil || latest == nil {
		return nil
	}
	stopped, err := r.stopRunWithConfiguredStopper(*latest, false)
	if err != nil {
		return nil
	}
	return stopped
}

func (r *Runtime) latestRunningChatRun(chatID string, projectConfigID string) (*agentruns.Run, error) {
	runs, err := r.runs.ListByMetadata(agentruns.RunFilter{
		ChatID:          stringPointer(chatID),
		ProjectConfigID: stringPointer(projectConfigID),
	})
	if err != nil {
		return nil, err
	}
	latestIndex := -1
	for index := range runs {
		if runs[index].Status != agentruns.RunStatusRunning {
			continue
		}
		if latestIndex == -1 || runSortsAfter(runs[index], runs[latestIndex]) {
			latestIndex = index
		}
	}
	if latestIndex == -1 {
		return nil, nil
	}
	latest := runs[latestIndex]
	return &latest, nil
}

func (r *Runtime) stopRunWithConfiguredStopper(run agentruns.Run, ignoreMissing bool) (*agentruns.Run, error) {
	if run.Status != agentruns.RunStatusRunning {
		return nil, nil
	}
	stopper := r.runStopper(run)
	if stopper == nil {
		return nil, nil
	}
	stopped, err := stopper.StopRun(run.ID)
	if err != nil {
		if ignoreMissing && errors.Is(err, agentruns.ErrRunNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &stopped, nil
}

func (r *Runtime) runStopper(run agentruns.Run) RunStopper {
	switch runInputString(run, "runType") {
	case externalagents.RunTypeExternalAgent:
		return r.externalRuns
	default:
		return r.managedRuns
	}
}

func runSortsAfter(left agentruns.Run, right agentruns.Run) bool {
	leftUpdated := runLastUpdated(left)
	rightUpdated := runLastUpdated(right)
	if !leftUpdated.Equal(rightUpdated) {
		return leftUpdated.After(rightUpdated)
	}
	return strings.Compare(left.ID, right.ID) > 0
}

func (r *Runtime) clearOwnedChatBindings(run agentruns.Run, projectConfigID string, shareSessionID *string) error {
	projectRuntime, err := r.projectRuntime(shareSessionID)
	if err != nil {
		return err
	}
	for sectionID, ownedChatID := range ownedChatBindings(&run) {
		currentChatID, err := projectRuntime.ChatSectionChatID(projectConfigID, sectionID)
		if err != nil {
			return err
		}
		if currentChatID == nil || strings.TrimSpace(*currentChatID) != ownedChatID {
			continue
		}
		if _, err := projectRuntime.SetChatSectionChatID(r.baseContext, projectConfigID, sectionID, nil); err != nil {
			return err
		}
	}
	return nil
}
