package conversation

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
)

// TestDirectorFolderlessWorkstreamStartsWithoutAFolder proves a folderless
// workstream is created rather than refused. It exists, is selectable, and can
// run any work that does not need the user's files.
func TestDirectorFolderlessWorkstreamStartsWithoutAFolder(t *testing.T) {
	store, service, _, _ := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx := context.Background()

	created, err := service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID: "conversation-director-folderless",
		Title:          "Summarize the release notes",
	})
	if err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}
	if created.Conversation.WorkspaceID != nil || created.Branch != nil {
		t.Fatalf("folderless root workstream = %+v", created.Conversation)
	}
}

// TestDirectorRenamesAndArchivesAFolderlessWorkstream proves both operations
// are addressed by conversation rather than by workspace. Work the user never
// gave a folder still has a name they read and is still work they can finish
// with, so requiring a workspace would leave exactly that work unmanageable.
func TestDirectorRenamesAndArchivesAFolderlessWorkstream(t *testing.T) {
	store, service, _, _ := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx := context.Background()

	created, err := service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID: "conversation-director-folderless",
		Title:          "Untitled",
	})
	if err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}

	renamed, err := service.RenameDirectorWorkstream(
		ctx,
		created.Conversation.ID,
		"Release notes",
	)
	if err != nil {
		t.Fatalf("RenameDirectorWorkstream: %v", err)
	}
	if renamed.Conversation.Title != "Release notes" {
		t.Fatalf("renamed conversation = %+v", renamed.Conversation)
	}
	if renamed.Conversation.UpdatedAt <= created.Conversation.UpdatedAt {
		t.Fatalf("rename did not advance updatedAt: %q", renamed.Conversation.UpdatedAt)
	}

	archived, err := service.ArchiveDirectorWorkstream(ctx, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ArchiveDirectorWorkstream: %v", err)
	}
	if archived.Conversation.ArchivedAt == nil {
		t.Fatalf("archived conversation = %+v", archived.Conversation)
	}
	// Archiving twice is the state the caller asked for, so it settles rather
	// than conflicting.
	if _, err := service.ArchiveDirectorWorkstream(ctx, created.Conversation.ID); err != nil {
		t.Fatalf("archiving an archived workstream: %v", err)
	}
	if _, err := service.RenameDirectorWorkstream(ctx, created.Conversation.ID, "Too late"); err == nil {
		t.Fatal("an archived workstream accepted a rename")
	}
}

// TestDirectorRecoveryRestartsTheFailedTurnsOwnInput proves recovery re-delivers
// the work that failed rather than work the Director re-authored, and that it
// refuses a turn that did not fail.
func TestDirectorRecoveryRestartsTheFailedTurnsOwnInput(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx := context.Background()

	created, err := service.CreateTopicWithOptionalWorkspace(ctx, &workspaceID, "Data import")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	_, err = service.RecoverDirectorTurn(ctx, &workspaceID, created.Conversation.ID, "turn-never-ran", "turn-recovered")
	if err == nil {
		t.Fatal("recovering a missing turn was accepted")
	}

	streamID, err := ConversationStreamID(created.Conversation.ID)
	if err != nil {
		t.Fatalf("ConversationStreamID: %v", err)
	}
	// Keep the manufactured history before the harness clock. Recovery accepts a
	// new turn at the current service time; putting the fixture history in the
	// future would make that new turn the row evicted from the bounded snapshot.
	base := time.Date(2026, 7, 10, 9, 0, 0, 0, time.UTC)
	for index := 0; index <= MaxSnapshotTurns; index++ {
		status := TurnStatusCancelled
		if index == 0 {
			status = TurnStatusFailed
		}
		turn := validConversationTurn(status)
		turn.ID = fmt.Sprintf("turn-recovery-history-%03d", index)
		turn.ConversationID = created.Conversation.ID
		turn.AuthoredInput.Text = fmt.Sprintf("historical work %03d", index)
		acceptedAt := base.Add(time.Duration(index) * time.Second).Format(time.RFC3339Nano)
		endedAt := base.Add(time.Duration(index)*time.Second + time.Millisecond).Format(time.RFC3339Nano)
		turn.AcceptedAt = acceptedAt
		turn.EndedAt = &endedAt
		if status == TurnStatusFailed {
			turn.StartedAt = nil
			turn.ResolvedInvocation = nil
			turn.ProviderTurnID = nil
		}
		eventID := fmt.Sprintf("event-recovery-history-%03d", index)
		if _, err := store.Transact(ctx, "append recovery history", func(transaction *WriteTransaction) error {
			if err := transaction.InsertTurn(turn); err != nil {
				return err
			}
			_, err := transaction.AppendCommittedEvent(CommittedEventDraft{
				ID:       eventID,
				StreamID: streamID,
				Kind:     string(ConversationEventTypeTurnUpdated),
				Payload: ConversationTurnUpdatedEventPayload{
					Type: ConversationEventTypeTurnUpdated,
					Turn: turn,
				},
				CommittedAt: endedAt,
			})
			return err
		}); err != nil {
			t.Fatalf("append recovery history %d: %v", index, err)
		}
	}
	bounded, err := store.ReadSnapshot(ctx, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	if !bounded.Turns.HasEarlier {
		t.Fatal("recovery fixture did not place the failed turn outside the snapshot window")
	}
	for _, turn := range bounded.Turns.Turns {
		if turn.ID == "turn-recovery-history-000" {
			t.Fatal("failed turn unexpectedly remained in the bounded snapshot")
		}
	}
	if _, err := service.RecoverDirectorTurn(
		ctx,
		&workspaceID,
		created.Conversation.ID,
		"turn-recovery-history-000",
		"turn-recovered",
	); err != nil {
		t.Fatalf("RecoverDirectorTurn outside snapshot window: %v", err)
	}
	runtime.waitForStart(t, "historical work 000")
}

// TestDirectorRunsAnUnboundTurnInAPrivateWorkingDirectory proves the whole
// unbound lifecycle: the Director delivers work naming no workspace, the turn
// runs in a private Setta-owned directory that is not the user's folder, the
// queue promotes behind it, and the conversation settles idle. The private
// directory authorizes nothing, so a file reference from that turn is refused
// even though the file is really there.
func TestDirectorRunsAnUnboundTurnInAPrivateWorkingDirectory(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created, err := service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID: "conversation-director-unbound-run",
		Title:          "Five varied artifacts",
	})
	if err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}
	conversationID := created.Conversation.ID

	if _, err := service.SendDirectorTurn(ctx, nil, conversationID, "hold", "turn-unbound-1"); err != nil {
		t.Fatalf("SendDirectorTurn without a workspace: %v", err)
	}
	runtime.waitForStart(t, "hold")
	active := service.activeFor(conversationID)
	if active == nil || active.providerTurnID == "" {
		t.Fatalf("active unbound turn = %+v", active)
	}
	requireUnboundPrivateTurnDirectory(t, service, active, appDataDir, workspaceID)
	requireUnauthorizedPrivateFileReference(t, ctx, service, active)
	requirePrivateExecutionPathRejected(t, ctx, service, active)

	if _, err := service.QueueDirectorTurn(ctx, nil, conversationID, "queued unbound", "turn-unbound-2"); err != nil {
		t.Fatalf("QueueDirectorTurn without a workspace: %v", err)
	}
	if _, err := service.SteerDirectorTurn(
		ctx,
		nil,
		conversationID,
		"finish held work",
		active.turnID,
		"director_decision_unbound",
	); err != nil {
		t.Fatalf("SteerDirectorTurn without a workspace: %v", err)
	}
	runtime.waitForStart(t, "queued unbound")

	settled := awaitSettledUnboundConversation(t, ctx, service, conversationID)
	if len(settled.Artifacts.Artifacts) != 0 {
		t.Fatalf("private generated files became artifacts: %+v", settled.Artifacts.Artifacts)
	}
}

func TestDirectorCommandsRequireTheCurrentOptionalWorkspaceBinding(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx := context.Background()
	conversationID := "conversation-director-scope-proof"
	if _, err := service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID: conversationID,
		Title:          "Scope proof",
	}); err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}

	if _, err := service.SendDirectorTurn(
		ctx,
		&workspaceID,
		conversationID,
		"must not cross into a workspace",
		"turn-wrong-bound-scope",
	); !errors.Is(err, ErrConversationNotFound) {
		t.Fatalf("bound caller addressed unbound conversation: %T %v", err, err)
	}
	if _, err := service.BindFolderResource(ctx, workspaceID, conversationID); err != nil {
		t.Fatalf("BindFolderResource: %v", err)
	}
	if _, err := service.SendDirectorTurn(
		ctx,
		nil,
		conversationID,
		"must not drop the workspace",
		"turn-wrong-unbound-scope",
	); !errors.Is(err, ErrConversationNotFound) {
		t.Fatalf("unbound caller addressed bound conversation: %T %v", err, err)
	}
	privateDirectory := filepath.Join(appDataDir, unboundWorkingDirectoryName, conversationID)
	if _, err := os.Stat(privateDirectory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("rejected scope created private directory %q: %v", privateDirectory, err)
	}
	if requests := runtime.turnRequests(); len(requests) != 0 {
		t.Fatalf("rejected scope reached provider turns: %+v", requests)
	}
}

func TestBindingFolderDuringUnboundRunFreezesTheRunAndRotatesTheNextCarrier(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conversationID := "conversation-bind-during-unbound-run"
	first, privateRoot, firstThreadID := startUnboundScopeRotation(
		t,
		ctx,
		service,
		runtime,
		conversationID,
	)
	second := bindAndPromoteScopeRotation(
		t,
		ctx,
		service,
		runtime,
		workspaceID,
		conversationID,
		first,
	)
	assertScopeRotationCarrier(t, service, runtime, workspaceID, firstThreadID, second)
	finishScopeRotation(t, ctx, service, workspaceID, conversationID, second)
	assertCompletedScopeRotation(t, ctx, service, conversationID, privateRoot, second.turnID)
}

func startUnboundScopeRotation(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	conversationID string,
) (*activeConversationTurn, string, string) {
	t.Helper()
	if _, err := service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID: conversationID,
		Title:          "Bind during work",
	}); err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}
	if _, err := service.SendDirectorTurn(
		ctx,
		nil,
		conversationID,
		"hold",
		"turn-before-folder-binding",
	); err != nil {
		t.Fatalf("SendDirectorTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	first := service.activeFor(conversationID)
	if first == nil {
		t.Fatal("unbound turn was not active")
	}
	privateRoot := first.scope.workingDirectory
	firstThreadID := first.providerThreadID
	return first, privateRoot, firstThreadID
}

func bindAndPromoteScopeRotation(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	conversationID string,
	first *activeConversationTurn,
) *activeConversationTurn {
	t.Helper()
	bound, err := service.BindFolderResource(ctx, workspaceID, conversationID)
	if err != nil {
		t.Fatalf("BindFolderResource while active: %v", err)
	}
	if bound.Conversation.WorkspaceID == nil || *bound.Conversation.WorkspaceID != workspaceID {
		t.Fatalf("bound conversation = %+v", bound.Conversation)
	}
	if _, err := service.QueueDirectorTurn(
		ctx,
		&workspaceID,
		conversationID,
		"hold bound",
		"turn-after-folder-binding",
	); err != nil {
		t.Fatalf("QueueDirectorTurn after binding: %v", err)
	}
	if _, err := service.SteerDirectorTurn(
		ctx,
		&workspaceID,
		conversationID,
		"finish the unbound run",
		first.turnID,
		"director-decision-after-binding",
	); err != nil {
		t.Fatalf("SteerDirectorTurn after binding: %v", err)
	}

	runtime.waitForStart(t, "hold bound")
	second := service.activeFor(conversationID)
	if second == nil {
		t.Fatal("bound queued turn was not active")
	}
	return second
}

func assertScopeRotationCarrier(
	t *testing.T,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	firstThreadID string,
	second *activeConversationTurn,
) {
	t.Helper()
	workspaceSummary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		t.Fatalf("ResolveActiveWorkspace: %v", err)
	}
	if second.scope.workspaceID == nil ||
		*second.scope.workspaceID != workspaceID ||
		second.scope.authorizedRoot != workspaceSummary.RootPath ||
		second.scope.workingDirectory != workspaceSummary.RootPath {
		t.Fatalf("promoted turn scope = %+v", second.scope)
	}
	if second.providerThreadID == firstThreadID {
		t.Fatalf("bound turn reused unbound carrier %s", firstThreadID)
	}
	if unsubscribed := runtime.unsubscribedThreads(); len(unsubscribed) != 1 ||
		unsubscribed[0] != firstThreadID {
		t.Fatalf("scope rotation unsubscribed threads = %v, want %s", unsubscribed, firstThreadID)
	}
}

func finishScopeRotation(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	conversationID string,
	second *activeConversationTurn,
) {
	t.Helper()
	if _, err := service.SteerDirectorTurn(
		ctx,
		&workspaceID,
		conversationID,
		"finish the bound run",
		second.turnID,
		"director-decision-finish-bound",
	); err != nil {
		t.Fatalf("finish bound queued turn: %v", err)
	}
}

func assertCompletedScopeRotation(
	t *testing.T,
	ctx context.Context,
	service *Service,
	conversationID string,
	privateRoot string,
	secondTurnID string,
) {
	t.Helper()
	completed := assertServiceSnapshotByID(t, ctx, service, conversationID, func(snapshot ConversationSnapshot) bool {
		return completedScopeRotation(snapshot)
	})
	if len(completed.Artifacts.Artifacts) != 1 ||
		completed.Artifacts.Artifacts[0].TurnID == nil ||
		*completed.Artifacts.Artifacts[0].TurnID != secondTurnID {
		t.Fatalf("artifacts across scope rotation = %+v", completed.Artifacts.Artifacts)
	}
	if strings.Contains(completed.Artifacts.Artifacts[0].Title, privateRoot) {
		t.Fatalf("private working directory leaked into artifact metadata: %+v", completed.Artifacts.Artifacts[0])
	}
}

func completedScopeRotation(snapshot ConversationSnapshot) bool {
	if len(snapshot.Turns.Turns) != 2 ||
		len(snapshot.Queue) != 0 ||
		snapshot.Conversation.Status != ConversationStatusIdle {
		return false
	}
	for _, turn := range snapshot.Turns.Turns {
		if turn.Status != TurnStatusCompleted {
			return false
		}
	}
	return true
}

func TestDirectorControlsAndRecoversUnboundTurns(t *testing.T) {
	store, service, runtime, _ := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conversationID := "conversation-director-unbound-controls"
	if _, err := service.StartDirectorWorkstream(ctx, DirectorWorkstreamStart{
		ConversationID: conversationID,
		Title:          "Unbound controls",
	}); err != nil {
		t.Fatalf("StartDirectorWorkstream: %v", err)
	}
	if _, err := service.SendDirectorTurn(
		ctx,
		nil,
		conversationID,
		"approval",
		"turn-unbound-approval",
	); err != nil {
		t.Fatalf("SendDirectorTurn approval: %v", err)
	}
	runtime.waitForStart(t, "approval")
	waiting := assertServiceSnapshotByID(t, ctx, service, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWaitingForApproval
	})
	if _, err := service.SubmitDirectorApproval(
		ctx,
		nil,
		conversationID,
		"turn-unbound-approval",
		ConversationApprovalResponse{
			ApprovalID: latestPendingApprovalID(waiting),
			Decision:   TrajectoryApprovalDecisionAnswered,
			Answers: []ConversationApprovalAnswer{{
				QuestionID: "scope",
				Answers:    []string{"focused"},
			}},
		},
	); err != nil {
		t.Fatalf("SubmitDirectorApproval without a workspace: %v", err)
	}
	assertServiceSnapshotByID(t, ctx, service, conversationID, func(snapshot ConversationSnapshot) bool {
		turn, err := findConversationTurn(snapshot, "turn-unbound-approval")
		return err == nil &&
			turn.Status == TurnStatusCompleted &&
			service.activeFor(conversationID) == nil
	})

	if _, err := service.SendDirectorTurn(
		ctx,
		nil,
		conversationID,
		"hold cancel",
		"turn-unbound-cancel",
	); err != nil {
		t.Fatalf("SendDirectorTurn cancellation: %v", err)
	}
	runtime.waitForStart(t, "hold cancel")
	if _, err := service.CancelDirectorTurn(
		ctx,
		nil,
		conversationID,
		"turn-unbound-cancel",
	); err != nil {
		t.Fatalf("CancelDirectorTurn without a workspace: %v", err)
	}
	assertServiceSnapshotByID(t, ctx, service, conversationID, func(snapshot ConversationSnapshot) bool {
		turn, err := findConversationTurn(snapshot, "turn-unbound-cancel")
		return err == nil &&
			turn.Status == TurnStatusCancelled &&
			service.activeFor(conversationID) == nil
	})

	runtime.mu.Lock()
	runtime.runProviderMissing = 1
	runtime.mu.Unlock()
	if _, err := service.SendDirectorTurn(
		ctx,
		nil,
		conversationID,
		"recover unbound",
		"turn-unbound-failed",
	); err != nil {
		t.Fatalf("SendDirectorTurn before recovery: %v", err)
	}
	assertServiceSnapshotByID(t, ctx, service, conversationID, func(snapshot ConversationSnapshot) bool {
		turn, err := findConversationTurn(snapshot, "turn-unbound-failed")
		return err == nil &&
			turn.Status == TurnStatusFailed &&
			service.activeFor(conversationID) == nil
	})
	if _, err := service.RecoverDirectorTurn(
		ctx,
		nil,
		conversationID,
		"turn-unbound-failed",
		"turn-unbound-recovered",
	); err != nil {
		t.Fatalf("RecoverDirectorTurn without a workspace: %v", err)
	}
	runtime.waitForStart(t, "recover unbound")
	recovered := assertServiceSnapshotByID(t, ctx, service, conversationID, func(snapshot ConversationSnapshot) bool {
		turn, err := findConversationTurn(snapshot, "turn-unbound-recovered")
		return err == nil &&
			turn.Status == TurnStatusCompleted &&
			snapshot.Conversation.Status == ConversationStatusIdle
	})
	if len(recovered.Artifacts.Artifacts) != 0 {
		t.Fatalf("unbound lifecycle published private files: %+v", recovered.Artifacts.Artifacts)
	}
}

// requireUnboundPrivateTurnDirectory proves the provider was given a private
// Setta-owned working directory that authorizes nothing and is not the user's
// folder.
func requireUnboundPrivateTurnDirectory(
	t *testing.T,
	service *Service,
	active *activeConversationTurn,
	appDataDir string,
	offeredWorkspaceID string,
) {
	t.Helper()
	if active.scope.workspaceID != nil || active.scope.authorizedRoot != "" {
		t.Fatalf("unbound turn authorized a workspace: %+v", active.scope)
	}
	privateRoot := filepath.Join(appDataDir, unboundWorkingDirectoryName)
	if !strings.HasPrefix(active.request.WorkspaceRoot, privateRoot) {
		t.Fatalf(
			"unbound turn working directory = %q, want a directory under %q",
			active.request.WorkspaceRoot,
			privateRoot,
		)
	}
	offered, err := service.workspaces.ResolveActiveWorkspace(offeredWorkspaceID)
	if err != nil {
		t.Fatalf("ResolveActiveWorkspace: %v", err)
	}
	if strings.HasPrefix(active.request.WorkspaceRoot, offered.RootPath) {
		t.Fatalf("unbound turn ran inside the user's folder %q", offered.RootPath)
	}
}

// requireUnauthorizedPrivateFileReference proves a file the provider really can
// reach in its private working directory is still not an authorized artifact
// file reference.
func requireUnauthorizedPrivateFileReference(
	t *testing.T,
	ctx context.Context,
	service *Service,
	active *activeConversationTurn,
) {
	t.Helper()
	reachable := filepath.Join(active.request.WorkspaceRoot, "notes.md")
	if err := os.WriteFile(reachable, []byte("private scratch"), 0o600); err != nil {
		t.Fatalf("write private working file: %v", err)
	}
	_, emitErr := service.emitArtifactFromTool(
		ctx,
		active.scope,
		active.conversationID,
		active.turnID,
		agent.DynamicToolCall{
			CallID:           "provider-tool-call-unbound-file-reference",
			ConversationID:   active.conversationID,
			TurnID:           active.turnID,
			ProviderThreadID: active.providerThreadID,
			ProviderTurnID:   active.providerTurnID,
			Namespace:        artifactToolNamespace,
			Tool:             artifactToolName,
			Arguments: artifactToolArguments(
				t,
				"Private scratch",
				`root = Document([FileReference("notes.md", "Private scratch")])`,
			),
		},
	)
	var failure *artifactToolFailureError
	if !errors.As(emitErr, &failure) ||
		failure.code != artifactToolFailureInvalidFileReference ||
		!failure.retryable {
		t.Fatalf("private working directory file reference = %v, want a retryable field error", emitErr)
	}
}

func requirePrivateExecutionPathRejected(
	t *testing.T,
	ctx context.Context,
	service *Service,
	active *activeConversationTurn,
) {
	t.Helper()
	privatePath := filepath.Join(active.scope.workingDirectory, "private-output.md")
	_, emitErr := service.emitArtifactFromTool(
		ctx,
		active.scope,
		active.conversationID,
		active.turnID,
		agent.DynamicToolCall{
			CallID:           "provider-tool-call-private-execution-path",
			ConversationID:   active.conversationID,
			TurnID:           active.turnID,
			ProviderThreadID: active.providerThreadID,
			ProviderTurnID:   active.providerTurnID,
			Namespace:        artifactToolNamespace,
			Tool:             artifactToolName,
			Arguments: artifactToolArguments(
				t,
				"Private output at "+privatePath,
				fmt.Sprintf(`root = Document([Text(%q)])`, privatePath),
			),
		},
	)
	var failure *artifactToolFailureError
	if !errors.As(emitErr, &failure) ||
		failure.code != artifactToolFailureInvalidField ||
		!failure.retryable {
		t.Fatalf("private execution path artifact = %v, want a retryable field error", emitErr)
	}
	requireDynamicToolFieldErrors(t, failure.fieldErrors, []string{"title", "source"})
}

func awaitSettledUnboundConversation(
	t *testing.T,
	ctx context.Context,
	service *Service,
	conversationID string,
) ConversationSnapshot {
	t.Helper()
	return assertServiceSnapshotByID(t, ctx, service, conversationID, func(snapshot ConversationSnapshot) bool {
		if len(snapshot.Turns.Turns) == 2 &&
			latestSnapshotTurn(snapshot).Status == TurnStatusCompleted &&
			len(snapshot.Queue) == 0 &&
			snapshot.Conversation.Status == ConversationStatusIdle {
			return true
		}
		return false
	})
}

func assertServiceSnapshotByID(
	t *testing.T,
	ctx context.Context,
	service *Service,
	conversationID string,
	done func(ConversationSnapshot) bool,
) ConversationSnapshot {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		snapshot, err := service.ReadSnapshotByID(ctx, conversationID)
		if err != nil {
			t.Fatalf("ReadSnapshotByID: %v", err)
		}
		if done(snapshot) {
			return snapshot
		}
		if time.Now().After(deadline) {
			t.Fatalf("conversation %s did not reach expected state: %+v", conversationID, snapshot)
		}
		time.Sleep(5 * time.Millisecond)
	}
}
