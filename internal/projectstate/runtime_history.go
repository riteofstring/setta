package projectstate

import (
	"bytes"
	"context"
	"encoding/json"
	"reflect"
	"sort"
	"strings"
)

type runtimeHistoryMode int

const (
	runtimeHistoryModeAppend runtimeHistoryMode = iota
	runtimeHistoryModeReplaceCurrent
)

func cloneRuntimeState(state runtimeState) runtimeState {
	cloned := runtimeState{
		current:      state.current.Clone(),
		revision:     state.revision,
		historyIndex: state.historyIndex,
	}
	if len(state.history) == 0 {
		return cloned
	}
	cloned.history = make([]Document, len(state.history))
	for index, document := range state.history {
		cloned.history[index] = document.Clone()
	}
	return cloned
}

func applyRuntimeMutationState(state *runtimeState, normalized Document, historyMode runtimeHistoryMode) bool {
	if state == nil {
		return false
	}
	if documentsEqualForRuntimeState(state.current, normalized) {
		return false
	}
	state.current = normalized.Clone()
	state.revision++
	switch historyMode {
	case runtimeHistoryModeReplaceCurrent:
		replaceRuntimeHistoryState(state, state.current)
	default:
		recordRuntimeHistoryState(state, state.current)
	}
	return true
}

func recordRuntimeHistoryState(state *runtimeState, document Document) {
	if state == nil {
		return
	}

	cloned := document.Clone()
	if len(state.history) == 0 {
		state.history = []Document{cloned}
		state.historyIndex = 0
		return
	}
	if state.historyIndex < 0 {
		state.historyIndex = 0
	}
	if state.historyIndex >= len(state.history) {
		state.historyIndex = len(state.history) - 1
	}

	if documentsEqualForRuntimeState(state.history[state.historyIndex], cloned) {
		return
	}

	state.history = append(state.history[:state.historyIndex+1], cloned)
	if len(state.history) > defaultRuntimeHistorySize {
		excess := len(state.history) - defaultRuntimeHistorySize
		state.history = state.history[excess:]
	}
	state.historyIndex = len(state.history) - 1
}

func replaceRuntimeHistoryState(state *runtimeState, document Document) {
	if state == nil {
		return
	}

	cloned := document.Clone()
	if len(state.history) == 0 {
		state.history = []Document{cloned}
		state.historyIndex = 0
		return
	}
	if state.historyIndex < 0 {
		state.historyIndex = 0
	}
	if state.historyIndex >= len(state.history) {
		state.historyIndex = len(state.history) - 1
	}

	state.history[state.historyIndex] = cloned
}

func documentsEqualForRuntimeState(left Document, right Document) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	if leftErr == nil && rightErr == nil {
		return bytes.Equal(leftJSON, rightJSON)
	}
	return reflect.DeepEqual(left, right)
}

type projectHistoryEntry struct {
	historyIndex int
	project      Project
}

func projectsEqualForRuntimeHistory(left Project, right Project) bool {
	sanitizedLeft := left.Clone()
	sanitizedRight := right.Clone()
	sanitizedLeft.passwordSecrets = nil
	sanitizedRight.passwordSecrets = nil

	leftJSON, leftErr := json.Marshal(sanitizedLeft)
	rightJSON, rightErr := json.Marshal(sanitizedRight)
	if leftErr == nil && rightErr == nil {
		return bytes.Equal(leftJSON, rightJSON)
	}
	return reflect.DeepEqual(sanitizedLeft, sanitizedRight)
}

func projectHistoryEntries(state *runtimeState, projectID string) ([]projectHistoryEntry, error) {
	if state == nil {
		return nil, ErrRuntimeClosed
	}

	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return nil, ErrProjectIDRequired
	}

	entries := make([]projectHistoryEntry, 0, len(state.history))
	for historyIndex, document := range state.history {
		project, ok := document.Projects[trimmedProjectID]
		if !ok {
			continue
		}
		if len(entries) > 0 && projectsEqualForRuntimeHistory(entries[len(entries)-1].project, project) {
			continue
		}
		entries = append(entries, projectHistoryEntry{
			historyIndex: historyIndex,
			project:      project.Clone(),
		})
	}
	if len(entries) == 0 {
		return nil, ErrProjectNotFound
	}
	return entries, nil
}

func currentProjectHistoryEntryPosition(entries []projectHistoryEntry, currentHistoryIndex int) int {
	if len(entries) == 0 {
		return -1
	}
	return sort.Search(len(entries), func(index int) bool {
		return entries[index].historyIndex > currentHistoryIndex
	}) - 1
}

func moveRuntimeStateToProjectHistoryEntry(state *runtimeState, entries []projectHistoryEntry, targetPosition int) bool {
	if state == nil || len(entries) == 0 {
		return false
	}
	if targetPosition < 0 {
		targetPosition = 0
	}
	if targetPosition >= len(entries) {
		targetPosition = len(entries) - 1
	}

	targetHistoryIndex := entries[targetPosition].historyIndex
	if targetHistoryIndex == state.historyIndex {
		return false
	}

	state.historyIndex = targetHistoryIndex
	state.current = state.history[state.historyIndex].Clone()
	state.revision++
	return true
}

func (r *Runtime) UndoAndSave(ctx context.Context, projectID string, steps int) (Snapshot, error) {
	return r.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			entries, err := projectHistoryEntries(state, projectID)
			if err != nil {
				return snapshotFromState(*state), err
			}
			if steps > 0 {
				targetPosition := 0
				currentPosition := currentProjectHistoryEntryPosition(entries, state.historyIndex)
				if currentPosition >= 0 {
					targetPosition = currentPosition - steps
				}
				moveRuntimeStateToProjectHistoryEntry(state, entries, targetPosition)
			}
			snapshot := snapshotFromState(*state)
			return snapshot, r.persistSnapshot(ctx, snapshot)
		},
	})
}

func (r *Runtime) RedoAndSave(ctx context.Context, projectID string, steps int) (Snapshot, error) {
	return r.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			entries, err := projectHistoryEntries(state, projectID)
			if err != nil {
				return snapshotFromState(*state), err
			}
			if steps > 0 {
				targetPosition := len(entries) - 1
				currentPosition := currentProjectHistoryEntryPosition(entries, state.historyIndex)
				if currentPosition < 0 {
					targetPosition = steps - 1
				} else {
					targetPosition = currentPosition + steps
				}
				moveRuntimeStateToProjectHistoryEntry(state, entries, targetPosition)
			}
			snapshot := snapshotFromState(*state)
			return snapshot, r.persistSnapshot(ctx, snapshot)
		},
	})
}
