package runtime

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/conversation"
	"setta/internal/narration"
)

/*
 * The Director's way of asking a conversation what is going on.
 *
 * It resolves nothing itself: the narrator already holds that conversation's
 * context and answers the question that was asked. What this adds is the
 * routing the narrator's own entrypoints require — a folder-bound conversation
 * is asked through its workspace, a folderless one through the folderless
 * path — and reading the answer back out of the snapshot the ask commits.
 */
type directorNarratorPort struct {
	narrator *narration.Service
	store    *conversation.Store
	newID    func(string) (string, error)
}

func newDirectorNarratorPort(
	narrator *narration.Service,
	store *conversation.Store,
) (*directorNarratorPort, error) {
	if narrator == nil || store == nil {
		return nil, fmt.Errorf("director narrator port requires the narrator service and the store")
	}
	return &directorNarratorPort{narrator: narrator, store: store, newID: prefixedRuntimeID}, nil
}

func (port *directorNarratorPort) AskConversationStatus(
	ctx context.Context,
	conversationID string,
	question string,
) (string, error) {
	/*
	 * Which folder the conversation is bound to, read from the conversation
	 * itself. The narrator's two entrypoints differ only in that: a bound
	 * conversation is asked through its workspace and a folderless one through
	 * the folderless path.
	 */
	bound, err := port.store.ReadSnapshotByID(ctx, conversationID)
	if err != nil {
		return "", fmt.Errorf("resolve conversation %s workspace: %w", conversationID, err)
	}
	workspaceID := bound.Conversation.WorkspaceID
	requestID, err := port.newID("narrator_request")
	if err != nil {
		return "", err
	}
	var snapshot conversation.ConversationSnapshot
	if workspaceID == nil || strings.TrimSpace(*workspaceID) == "" {
		snapshot, err = port.narrator.AskRoutedFolderlessStatus(ctx, conversationID, requestID, question)
	} else {
		snapshot, err = port.narrator.AskRoutedStatus(ctx, *workspaceID, conversationID, requestID, question)
	}
	if err != nil {
		return "", fmt.Errorf("ask conversation %s: %w", conversationID, err)
	}
	answer := latestStatusReply(snapshot)
	if answer == "" {
		return "", fmt.Errorf("narrator answered conversation %s without a status reply", conversationID)
	}
	return answer, nil
}

// prefixedRuntimeID names a request so a diagnostic can be traced back to the
// kind of work that made it.
func prefixedRuntimeID(prefix string) (string, error) {
	suffix, err := randomRuntimeID()
	if err != nil {
		return "", err
	}
	return prefix + "_" + suffix, nil
}

// latestStatusReply is the newest answer in the snapshot's narration window.
// The ask commits before it returns, so the reply it produced is the last one
// present rather than something to wait for.
func latestStatusReply(snapshot conversation.ConversationSnapshot) string {
	for index := len(snapshot.Narration.Events) - 1; index >= 0; index-- {
		event := snapshot.Narration.Events[index]
		if event.Kind == conversation.NarrationEventKindStatusReply && event.StatusReply != nil {
			return strings.TrimSpace(event.StatusReply.Text)
		}
	}
	return ""
}
