package workspacesession

import (
	"errors"
	"fmt"
	"sort"
	"time"

	"setta/internal/appstate"
	"setta/internal/workspace"
)

type WorkspaceSession struct {
	SelectedWorkspaceID                  string                       `json:"selectedWorkspaceId"`
	SelectedConversationIDsByWorkspaceID map[string]string            `json:"-"`
	ActiveWorkspaces                     []workspace.WorkspaceSummary `json:"activeWorkspaces"`
	RecentWorkspaces                     []workspace.WorkspaceSummary `json:"recentWorkspaces"`
}

func FromAppState(state appstate.State) (WorkspaceSession, error) {
	recentByID := map[string]workspace.WorkspaceSummary{}
	for _, summary := range state.RecentWorkspaces {
		recentByID[summary.ID] = summary
	}

	activeWorkspaces := make([]workspace.WorkspaceSummary, 0, len(state.ActiveWorkspaceIDs))
	for _, id := range state.ActiveWorkspaceIDs {
		summary, ok := recentByID[id]
		if !ok {
			return WorkspaceSession{}, fmt.Errorf("active workspace id %s has no recent workspace metadata", id)
		}
		activeWorkspaces = append(activeWorkspaces, summary)
	}

	session := WorkspaceSession{
		SelectedWorkspaceID:                  state.SelectedWorkspaceID,
		SelectedConversationIDsByWorkspaceID: cloneSelectedConversationIDs(state.SelectedConversationIDsByWorkspaceID),
		ActiveWorkspaces:                     activeWorkspaces,
		RecentWorkspaces:                     cloneSummaries(state.RecentWorkspaces),
	}
	if err := sortRecent(session.RecentWorkspaces); err != nil {
		return WorkspaceSession{}, err
	}
	return session, nil
}

func (session WorkspaceSession) Clone() WorkspaceSession {
	return WorkspaceSession{
		SelectedWorkspaceID:                  session.SelectedWorkspaceID,
		SelectedConversationIDsByWorkspaceID: cloneSelectedConversationIDs(session.SelectedConversationIDsByWorkspaceID),
		ActiveWorkspaces:                     cloneSummaries(session.ActiveWorkspaces),
		RecentWorkspaces:                     cloneSummaries(session.RecentWorkspaces),
	}
}

func (session WorkspaceSession) AppState() appstate.State {
	activeIDs := make([]string, 0, len(session.ActiveWorkspaces))
	for _, summary := range session.ActiveWorkspaces {
		activeIDs = append(activeIDs, summary.ID)
	}
	return appstate.State{
		SchemaVersion:                        appstate.SchemaVersion,
		SelectedWorkspaceID:                  session.SelectedWorkspaceID,
		SelectedConversationIDsByWorkspaceID: cloneSelectedConversationIDs(session.SelectedConversationIDsByWorkspaceID),
		ActiveWorkspaceIDs:                   activeIDs,
		RecentWorkspaces:                     cloneSummaries(session.RecentWorkspaces),
	}
}

func (session *WorkspaceSession) Open(summary workspace.WorkspaceSummary) error {
	if err := validateSummary(summary); err != nil {
		return err
	}

	if index := activeIndex(session.ActiveWorkspaces, summary.ID); index >= 0 {
		session.ActiveWorkspaces[index] = summary
	} else {
		session.ActiveWorkspaces = append(session.ActiveWorkspaces, summary)
	}
	session.SelectedWorkspaceID = summary.ID
	upsertRecent(&session.RecentWorkspaces, summary)
	return sortRecent(session.RecentWorkspaces)
}

func (session *WorkspaceSession) Select(id string) error {
	if id == "" {
		return errors.New("workspace id is required")
	}
	if activeIndex(session.ActiveWorkspaces, id) < 0 {
		return fmt.Errorf("workspace is not active: %s", id)
	}
	session.SelectedWorkspaceID = id
	return nil
}

func (session WorkspaceSession) Workspace(id string) (workspace.WorkspaceSummary, error) {
	if id == "" {
		return workspace.WorkspaceSummary{}, errors.New("workspace id is required")
	}
	if index := activeIndex(session.ActiveWorkspaces, id); index >= 0 {
		return session.ActiveWorkspaces[index], nil
	}
	for _, summary := range session.RecentWorkspaces {
		if summary.ID == id {
			return summary, nil
		}
	}
	return workspace.WorkspaceSummary{}, fmt.Errorf("workspace not found: %s", id)
}

func (session *WorkspaceSession) Close(id string) error {
	if id == "" {
		return errors.New("workspace id is required")
	}
	index := activeIndex(session.ActiveWorkspaces, id)
	if index < 0 {
		return fmt.Errorf("workspace is not active: %s", id)
	}

	session.ActiveWorkspaces = append(session.ActiveWorkspaces[:index], session.ActiveWorkspaces[index+1:]...)
	if session.SelectedWorkspaceID != id {
		return nil
	}
	switch {
	case len(session.ActiveWorkspaces) == 0:
		session.SelectedWorkspaceID = ""
	case index < len(session.ActiveWorkspaces):
		session.SelectedWorkspaceID = session.ActiveWorkspaces[index].ID
	default:
		session.SelectedWorkspaceID = session.ActiveWorkspaces[index-1].ID
	}
	return nil
}

func (session *WorkspaceSession) Reorder(ids []string) error {
	if len(ids) != len(session.ActiveWorkspaces) {
		return fmt.Errorf("workspace reorder ids length %d does not match active workspace count %d", len(ids), len(session.ActiveWorkspaces))
	}

	activeByID := map[string]workspace.WorkspaceSummary{}
	for _, summary := range session.ActiveWorkspaces {
		activeByID[summary.ID] = summary
	}

	seen := map[string]bool{}
	next := make([]workspace.WorkspaceSummary, 0, len(ids))
	for _, id := range ids {
		if id == "" {
			return errors.New("workspace reorder id is required")
		}
		if seen[id] {
			return fmt.Errorf("workspace reorder contains duplicate id: %s", id)
		}
		summary, ok := activeByID[id]
		if !ok {
			return fmt.Errorf("workspace reorder contains inactive id: %s", id)
		}
		seen[id] = true
		next = append(next, summary)
	}

	session.ActiveWorkspaces = next
	return nil
}

func (session *WorkspaceSession) RemoveRecent(id string) error {
	if id == "" {
		return errors.New("workspace id is required")
	}
	if activeIndex(session.ActiveWorkspaces, id) >= 0 {
		return fmt.Errorf("workspace is active and cannot be removed from recent workspaces: %s", id)
	}
	for index, summary := range session.RecentWorkspaces {
		if summary.ID == id {
			session.RecentWorkspaces = append(session.RecentWorkspaces[:index], session.RecentWorkspaces[index+1:]...)
			delete(session.SelectedConversationIDsByWorkspaceID, id)
			return nil
		}
	}
	return fmt.Errorf("recent workspace not found: %s", id)
}

func (session *WorkspaceSession) SetSelectedConversation(workspaceID string, conversationID string) error {
	if workspaceID == "" {
		return errors.New("workspace id is required")
	}
	if conversationID == "" {
		return errors.New("conversation id is required")
	}
	if _, err := session.Workspace(workspaceID); err != nil {
		return err
	}
	if session.SelectedConversationIDsByWorkspaceID == nil {
		session.SelectedConversationIDsByWorkspaceID = map[string]string{}
	}
	session.SelectedConversationIDsByWorkspaceID[workspaceID] = conversationID
	return nil
}

func (session WorkspaceSession) SelectedConversationIDs() map[string]string {
	return cloneSelectedConversationIDs(session.SelectedConversationIDsByWorkspaceID)
}

func validateSummary(summary workspace.WorkspaceSummary) error {
	if summary.ID == "" {
		return errors.New("workspace id is required")
	}
	if summary.RootPath == "" {
		return fmt.Errorf("workspace rootPath is required for %s", summary.ID)
	}
	if summary.DisplayName == "" {
		return fmt.Errorf("workspace displayName is required for %s", summary.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, summary.LastOpenedAt); err != nil {
		return fmt.Errorf("workspace lastOpenedAt must be RFC3339 for %s: %w", summary.ID, err)
	}
	return nil
}

func upsertRecent(recents *[]workspace.WorkspaceSummary, summary workspace.WorkspaceSummary) {
	for index, recent := range *recents {
		if recent.ID == summary.ID {
			(*recents)[index] = summary
			return
		}
	}
	*recents = append(*recents, summary)
}

func sortRecent(recents []workspace.WorkspaceSummary) error {
	openedAt := map[string]time.Time{}
	for _, summary := range recents {
		parsed, err := time.Parse(time.RFC3339Nano, summary.LastOpenedAt)
		if err != nil {
			return fmt.Errorf("workspace lastOpenedAt must be RFC3339 for %s: %w", summary.ID, err)
		}
		openedAt[summary.ID] = parsed
	}
	sort.SliceStable(recents, func(left int, right int) bool {
		return openedAt[recents[left].ID].After(openedAt[recents[right].ID])
	})
	return nil
}

func activeIndex(active []workspace.WorkspaceSummary, id string) int {
	for index, summary := range active {
		if summary.ID == id {
			return index
		}
	}
	return -1
}

func cloneSummaries(summaries []workspace.WorkspaceSummary) []workspace.WorkspaceSummary {
	if summaries == nil {
		return []workspace.WorkspaceSummary{}
	}
	return append([]workspace.WorkspaceSummary{}, summaries...)
}

func cloneSelectedConversationIDs(values map[string]string) map[string]string {
	if values == nil {
		return map[string]string{}
	}
	clone := make(map[string]string, len(values))
	for workspaceID, conversationID := range values {
		clone[workspaceID] = conversationID
	}
	return clone
}
