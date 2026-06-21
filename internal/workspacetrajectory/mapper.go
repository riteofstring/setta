package workspacetrajectory

import (
	"fmt"
	"sort"
	"time"

	"setta/internal/chat"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
)

type SnapshotInput struct {
	Filter          RuntimeFilter
	Revision        int
	GeneratedAt     string
	ChatActivity    chat.RunActivityPage
	Workflow        *orchestrator.WorkflowExecution
	SemanticRuntime *semanticgraph.SemanticRuntimeSnapshot
}

type workflowBinding struct {
	ExecutionID     string
	NodeID          string
	NodeExecutionID string
}

func BuildSnapshot(input SnapshotInput) WorkspaceTrajectoryRuntimeSnapshot {
	limits := runtimeLimits(input.Filter.Limit)
	workspaceID := input.Filter.WorkspaceID
	generatedAt := input.GeneratedAt
	if generatedAt == "" {
		generatedAt = timestamp(time.Now())
	}
	snapshot := WorkspaceTrajectoryRuntimeSnapshot{
		SchemaVersion:         SchemaVersion,
		WorkspaceID:           workspaceID,
		WorkflowExecutionID:   input.Filter.WorkflowExecutionID,
		ChatRunID:             input.Filter.ChatRunID,
		Revision:              input.Revision,
		GeneratedAt:           generatedAt,
		Limits:                limits,
		ActiveWorkflowNodeIDs: []string{},
		ActiveRunItemIDs:      []string{},
		Sprites:               []WorkspaceTrajectorySprite{},
		Timeline:              []WorkspaceTrajectoryTimelineItem{},
		AggregateByWorkflow:   []WorkspaceTrajectoryWorkflowNodeAggregate{},
		Removals:              EmptyRuntimeRemovals(),
		DetailRefs:            []WorkspaceTrajectoryDetailRef{},
	}
	bindings := map[string]workflowBinding{}
	if input.Workflow != nil {
		snapshot.ActiveWorkflowNodeIDs = activeWorkflowNodeIDs(*input.Workflow)
		for _, sprite := range workflowExecutionSprites(workspaceID, *input.Workflow, generatedAt) {
			appendSpriteProjection(&snapshot.Sprites, &snapshot.Timeline, &snapshot.DetailRefs, sprite)
		}
		bindings = workflowBindingsByRunID(*input.Workflow)
	}
	for _, item := range input.ChatActivity.Items {
		binding := bindings[item.RunID]
		if item.Status == chat.RunItemStatusPending || item.Status == chat.RunItemStatusRunning {
			snapshot.ActiveRunItemIDs = append(snapshot.ActiveRunItemIDs, item.ID)
		}
		sprite, ok := SpriteFromRunItem(item, binding)
		if !ok {
			continue
		}
		appendSpriteProjection(&snapshot.Sprites, &snapshot.Timeline, &snapshot.DetailRefs, sprite)
	}
	if input.SemanticRuntime != nil {
		for _, sprite := range cartographerSpritesFromSemanticRuntime(*input.SemanticRuntime) {
			appendSpriteProjection(&snapshot.Sprites, &snapshot.Timeline, &snapshot.DetailRefs, sprite)
		}
	}
	sortRuntimeSnapshot(&snapshot)
	snapshot.AggregateByWorkflow = aggregateSprites(snapshot.WorkspaceID, snapshot.WorkflowExecutionID, snapshot.Sprites)
	finalizeSnapshot(&snapshot)
	return snapshot
}

func DeltaFromWorkflowEvent(envelope orchestrator.WorkflowEventEnvelope, fromRevision int, toRevision int, generatedAt string) (WorkspaceTrajectoryRuntimeDelta, bool, error) {
	event := envelope.Event
	sprite, ok := SpriteFromWorkflowEvent(event)
	if !ok {
		return WorkspaceTrajectoryRuntimeDelta{}, false, nil
	}
	delta := EmptyRuntimeDelta(event.WorkspaceID, fromRevision, toRevision, generatedAt)
	delta.ChangedAreas = []WorkspaceTrajectoryChangeArea{ChangeAreaWorkflow}
	appendSpriteDelta(&delta, sprite)
	sortRuntimeDelta(&delta)
	finalizeDelta(&delta, runtimeLimits(DefaultRuntimeLimit))
	return delta, true, nil
}

func DeltaFromSemanticGraphChange(event semanticgraph.SemanticGraphChangeEvent, fromRevision int, toRevision int, generatedAt string) (WorkspaceTrajectoryRuntimeDelta, bool, error) {
	if event.SemanticRuntimeDelta == nil {
		return WorkspaceTrajectoryRuntimeDelta{}, false, nil
	}
	delta := EmptyRuntimeDelta(event.WorkspaceID, fromRevision, toRevision, generatedAt)
	delta.ChangedAreas = []WorkspaceTrajectoryChangeArea{ChangeAreaCartographer}
	for _, run := range event.SemanticRuntimeDelta.CartographerRunUpdates {
		appendSpriteDelta(&delta, cartographerRunSprite(event.WorkspaceID, run))
	}
	for _, window := range event.SemanticRuntimeDelta.CartographerWindowUpdates {
		appendSpriteDelta(&delta, cartographerWindowSprite(event.WorkspaceID, window))
	}
	for _, patch := range event.SemanticRuntimeDelta.PatchPreviewUpdates {
		appendSpriteDelta(&delta, cartographerPatchSprite(event.WorkspaceID, patch))
	}
	if len(delta.SpriteUpdates) == 0 {
		return WorkspaceTrajectoryRuntimeDelta{}, false, nil
	}
	sortRuntimeDelta(&delta)
	finalizeDelta(&delta, runtimeLimits(DefaultRuntimeLimit))
	return delta, true, nil
}

func SpriteFromRunItem(item chat.RunItem, binding workflowBinding) (WorkspaceTrajectorySprite, bool) {
	kind, ok := spriteKindFromRunItem(item)
	if !ok {
		return WorkspaceTrajectorySprite{}, false
	}
	status := spriteStatusFromRunItemStatus(item.Status)
	severity := severityForStatus(status, item.Error)
	if item.Type == chat.RunItemTypeCommandExecution && item.Status == chat.RunItemStatusCompleted && item.ExitCode != 0 {
		severity = SpriteSeverityError
	}
	createdAt := firstNonEmpty(item.CreatedAt, item.StartedAt, item.CompletedAt)
	updatedAt := firstNonEmpty(item.CompletedAt, item.StartedAt, item.CreatedAt)
	title := runItemTitle(item, kind)
	subtitle := runItemSubtitle(item, kind)
	sprite := WorkspaceTrajectorySprite{
		SchemaVersion:           SchemaVersion,
		ID:                      "run-item:" + item.ID,
		Kind:                    kind,
		Status:                  status,
		Severity:                severity,
		WorkspaceID:             item.WorkspaceID,
		WorkflowExecutionID:     binding.ExecutionID,
		WorkflowNodeID:          binding.NodeID,
		WorkflowNodeExecutionID: binding.NodeExecutionID,
		ChatConversationID:      item.ConversationID,
		ChatRunID:               item.RunID,
		RunItemID:               item.ID,
		ProviderItemID:          item.ProviderItemID,
		Title:                   title,
		Subtitle:                subtitle,
		SourceRefs:              sourceRefsForRunItem(item),
		FileRefs:                fileRefsForRunItem(item, kind),
		Command: WorkspaceTrajectoryCommand{
			Command:    item.Command,
			Cwd:        item.Cwd,
			ExitCode:   item.ExitCode,
			DurationMS: item.DurationMs,
		},
		Tool: WorkspaceTrajectoryTool{
			ServerName: item.ServerName,
			ToolName:   item.ToolName,
			Namespace:  item.Namespace,
			RequestID:  item.RequestID,
		},
		DiffStats:     diffStatsForRunItem(item),
		ResultSummary: firstNonEmpty(item.Result, item.Progress, item.Summary),
		ErrorSummary:  item.Error,
		CreatedAt:     createdAt,
		UpdatedAt:     updatedAt,
		TTLMS:         ttlForStatus(status),
	}
	if sprite.Kind == SpriteKindFileRead && len(sprite.FileRefs) == 0 {
		return WorkspaceTrajectorySprite{}, false
	}
	sprite.ExpiresAt = expiresAt(updatedAt, sprite.TTLMS)
	return sprite, true
}

func SpriteFromApproval(workspaceID string, conversationID string, approval chat.ApprovalRequest) WorkspaceTrajectorySprite {
	status := SpriteStatusApprovalRequired
	if approval.Status != chat.ApprovalStatusPending {
		status = spriteStatusFromApprovalStatus(approval.Status)
	}
	updatedAt := firstNonEmpty(approval.ResolvedAt, approval.CreatedAt)
	sprite := WorkspaceTrajectorySprite{
		SchemaVersion:      SchemaVersion,
		ID:                 "approval:" + approval.ID,
		Kind:               SpriteKindApproval,
		Status:             status,
		Severity:           severityForStatus(status, ""),
		WorkspaceID:        workspaceID,
		ChatConversationID: conversationID,
		ChatRunID:          approval.RunID,
		RunItemID:          approval.RunItemID,
		ProviderItemID:     approval.ProviderItemID,
		Title:              firstNonEmpty(approval.Title, "Approval requested"),
		Subtitle:           approvalSubtitle(approval),
		SourceRefs:         sourceRefsForApproval(approval),
		FileRefs:           fileRefsForApproval(approval),
		Command:            WorkspaceTrajectoryCommand{Command: approval.Command},
		ResultSummary:      approval.Response,
		CreatedAt:          approval.CreatedAt,
		UpdatedAt:          updatedAt,
		TTLMS:              ttlForStatus(status),
	}
	sprite.ExpiresAt = expiresAt(updatedAt, sprite.TTLMS)
	return sprite
}

func SpriteFromWorkflowEvent(event orchestrator.WorkflowEvent) (WorkspaceTrajectorySprite, bool) {
	if event.ID == "" || event.WorkspaceID == "" {
		return WorkspaceTrajectorySprite{}, false
	}
	status := spriteStatusFromWorkflowEvent(event.Type)
	updatedAt := firstNonEmpty(event.CreatedAt)
	sprite := WorkspaceTrajectorySprite{
		SchemaVersion:           SchemaVersion,
		ID:                      "workflow-event:" + event.ID,
		Kind:                    SpriteKindWorkflowStatus,
		Status:                  status,
		Severity:                severityForStatus(status, workflowErrorFromEvent(event)),
		WorkspaceID:             event.WorkspaceID,
		WorkflowExecutionID:     event.ExecutionID,
		WorkflowNodeID:          event.NodeID,
		WorkflowNodeExecutionID: event.NodeExecutionID,
		Title:                   workflowEventTitle(event),
		Subtitle:                event.Message,
		SourceRefs: []WorkspaceTrajectorySourceRef{
			{Kind: SourceKindWorkflowExecution, ID: event.ExecutionID},
			{Kind: SourceKindWorkflowEvent, ID: event.ID},
		},
		ErrorSummary: workflowErrorFromEvent(event),
		CreatedAt:    updatedAt,
		UpdatedAt:    updatedAt,
		TTLMS:        ttlForStatus(status),
	}
	if event.NodeID != "" {
		sprite.SourceRefs = append(sprite.SourceRefs, WorkspaceTrajectorySourceRef{Kind: SourceKindWorkflowNode, ID: event.NodeID})
	}
	if event.NodeExecutionID != "" {
		sprite.SourceRefs = append(sprite.SourceRefs, WorkspaceTrajectorySourceRef{Kind: SourceKindWorkflowNodeRun, ID: event.NodeExecutionID})
	}
	sprite.ExpiresAt = expiresAt(updatedAt, sprite.TTLMS)
	return sprite, true
}

func workflowExecutionSprites(workspaceID string, execution orchestrator.WorkflowExecution, now string) []WorkspaceTrajectorySprite {
	sprites := []WorkspaceTrajectorySprite{}
	for _, node := range execution.NodeExecutions {
		status := spriteStatusFromWorkflowNodeStatus(node.Status)
		updatedAt := firstNonEmpty(node.CompletedAt, node.StartedAt, node.ScheduledAt, execution.UpdatedAt, now)
		sprite := WorkspaceTrajectorySprite{
			SchemaVersion:           SchemaVersion,
			ID:                      "workflow-node-execution:" + node.ID,
			Kind:                    SpriteKindWorkflowStatus,
			Status:                  status,
			Severity:                severityForStatus(status, node.Error),
			WorkspaceID:             workspaceID,
			WorkflowExecutionID:     execution.ID,
			WorkflowNodeID:          node.NodeID,
			WorkflowNodeExecutionID: node.ID,
			Title:                   "Workflow node " + string(node.Status),
			Subtitle:                node.Error,
			SourceRefs: []WorkspaceTrajectorySourceRef{
				{Kind: SourceKindWorkflowExecution, ID: execution.ID},
				{Kind: SourceKindWorkflowNode, ID: node.NodeID},
				{Kind: SourceKindWorkflowNodeRun, ID: node.ID},
			},
			ErrorSummary: node.Error,
			CreatedAt:    firstNonEmpty(node.ScheduledAt, node.StartedAt, updatedAt),
			UpdatedAt:    updatedAt,
			TTLMS:        ttlForStatus(status),
		}
		sprite.ExpiresAt = expiresAt(updatedAt, sprite.TTLMS)
		sprites = append(sprites, sprite)
	}
	return sprites
}

func cartographerSpritesFromSemanticRuntime(runtime semanticgraph.SemanticRuntimeSnapshot) []WorkspaceTrajectorySprite {
	sprites := []WorkspaceTrajectorySprite{}
	for _, run := range runtime.Cartographer.ActiveRuns {
		sprites = append(sprites, cartographerRunSprite(runtime.WorkspaceID, run))
	}
	for _, window := range runtime.Cartographer.ActiveWindows {
		sprites = append(sprites, cartographerWindowSprite(runtime.WorkspaceID, window))
	}
	for _, patch := range runtime.Patches {
		sprites = append(sprites, cartographerPatchSprite(runtime.WorkspaceID, patch))
	}
	return sprites
}

func cartographerRunSprite(workspaceID string, run semanticgraph.SemanticRuntimeCartographerRun) WorkspaceTrajectorySprite {
	status := spriteStatusFromSemanticStatus(string(run.Status))
	updatedAt := firstNonEmpty(run.UpdatedAt, run.CompletedAt, run.StartedAt, run.CreatedAt)
	sprite := WorkspaceTrajectorySprite{
		SchemaVersion:       SchemaVersion,
		ID:                  "cartographer-run:" + run.ID,
		Kind:                SpriteKindCartographer,
		Status:              status,
		Severity:            severityForStatus(status, ""),
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: run.SourceRefs.WorkflowExecutionID,
		WorkflowNodeID:      run.SourceRefs.WorkflowNodeID,
		ChatRunID:           run.SourceRefs.ChatRunID,
		RunItemID:           run.SourceRefs.RunItemID,
		CartographerRunID:   run.ID,
		Title:               "Cartographer " + string(run.Status),
		Subtitle:            run.PublicSummary,
		SourceRefs:          sourceRefsForCartographerRun(run),
		ResultSummary:       run.PublicSummary,
		CreatedAt:           run.CreatedAt,
		UpdatedAt:           updatedAt,
		TTLMS:               ttlForStatus(status),
	}
	sprite.ExpiresAt = expiresAt(updatedAt, sprite.TTLMS)
	return sprite
}

func cartographerWindowSprite(workspaceID string, window semanticgraph.SemanticRuntimeCartographerWindow) WorkspaceTrajectorySprite {
	status := spriteStatusFromSemanticStatus(string(window.Status))
	updatedAt := firstNonEmpty(window.UpdatedAt, window.ClosedAt, window.OpenedAt)
	sprite := WorkspaceTrajectorySprite{
		SchemaVersion:        SchemaVersion,
		ID:                   "cartographer-window:" + window.ID,
		Kind:                 SpriteKindCartographer,
		Status:               status,
		Severity:             severityForStatus(status, ""),
		WorkspaceID:          workspaceID,
		WorkflowExecutionID:  window.SourceRefs.WorkflowExecutionID,
		WorkflowNodeID:       window.SourceRefs.WorkflowNodeID,
		ChatRunID:            window.SourceRefs.ChatRunID,
		RunItemID:            window.SourceRefs.RunItemID,
		CartographerRunID:    window.RunID,
		CartographerWindowID: window.ID,
		Title:                "Cartographer window " + string(window.Status),
		Subtitle:             window.PublicSummary,
		SourceRefs:           sourceRefsForCartographerWindow(window),
		ResultSummary:        window.PublicSummary,
		CreatedAt:            window.OpenedAt,
		UpdatedAt:            updatedAt,
		TTLMS:                ttlForStatus(status),
	}
	sprite.ExpiresAt = expiresAt(updatedAt, sprite.TTLMS)
	return sprite
}

func cartographerPatchSprite(workspaceID string, patch semanticgraph.SemanticRuntimePatchPreview) WorkspaceTrajectorySprite {
	status := spriteStatusFromSemanticStatus(string(patch.Status))
	updatedAt := firstNonEmpty(patch.UpdatedAt, patch.CreatedAt)
	sprite := WorkspaceTrajectorySprite{
		SchemaVersion:       SchemaVersion,
		ID:                  "cartographer-patch:" + patch.ID,
		Kind:                SpriteKindCartographer,
		Status:              status,
		Severity:            severityForStatus(status, ""),
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: patch.SourceRefs.WorkflowExecutionID,
		WorkflowNodeID:      patch.SourceRefs.WorkflowNodeID,
		ChatRunID:           patch.SourceRefs.ChatRunID,
		RunItemID:           patch.SourceRefs.RunItemID,
		CartographerRunID:   patch.RunID,
		CartographerPatchID: patch.PatchID,
		Title:               "Cartographer patch " + string(patch.Status),
		Subtitle:            patch.PublicSummary,
		SourceRefs:          sourceRefsForCartographerPatch(patch),
		ResultSummary:       patch.PublicSummary,
		CreatedAt:           patch.CreatedAt,
		UpdatedAt:           updatedAt,
		TTLMS:               ttlForStatus(status),
	}
	sprite.ExpiresAt = expiresAt(updatedAt, sprite.TTLMS)
	return sprite
}

func appendSpriteProjection(sprites *[]WorkspaceTrajectorySprite, timeline *[]WorkspaceTrajectoryTimelineItem, detailRefs *[]WorkspaceTrajectoryDetailRef, sprite WorkspaceTrajectorySprite) {
	*sprites = append(*sprites, sprite)
	*timeline = append(*timeline, timelineItemForSprite(sprite))
	*detailRefs = append(*detailRefs, detailRefForSprite(sprite))
}

func appendSpriteDelta(delta *WorkspaceTrajectoryRuntimeDelta, sprite WorkspaceTrajectorySprite) {
	delta.SpriteUpdates = append(delta.SpriteUpdates, sprite)
	delta.TimelineUpdates = append(delta.TimelineUpdates, timelineItemForSprite(sprite))
	delta.DetailRefs = append(delta.DetailRefs, detailRefForSprite(sprite))
}

func timelineItemForSprite(sprite WorkspaceTrajectorySprite) WorkspaceTrajectoryTimelineItem {
	return WorkspaceTrajectoryTimelineItem{
		SchemaVersion:           SchemaVersion,
		ID:                      "timeline:" + sprite.ID,
		SpriteID:                sprite.ID,
		Kind:                    sprite.Kind,
		Status:                  sprite.Status,
		Severity:                sprite.Severity,
		WorkspaceID:             sprite.WorkspaceID,
		WorkflowExecutionID:     sprite.WorkflowExecutionID,
		WorkflowNodeID:          sprite.WorkflowNodeID,
		WorkflowNodeExecutionID: sprite.WorkflowNodeExecutionID,
		ChatRunID:               sprite.ChatRunID,
		RunItemID:               sprite.RunItemID,
		Summary:                 timelineSummary(sprite),
		OccurredAt:              firstNonEmpty(sprite.UpdatedAt, sprite.CreatedAt),
		SourceRefs:              append([]WorkspaceTrajectorySourceRef{}, sprite.SourceRefs...),
	}
}

func detailRefForSprite(sprite WorkspaceTrajectorySprite) WorkspaceTrajectoryDetailRef {
	kind, id := primaryDetailRef(sprite)
	return WorkspaceTrajectoryDetailRef{
		ID:         "detail:" + sprite.ID,
		SourceKind: kind,
		SourceID:   id,
		SpriteID:   sprite.ID,
		Summary:    timelineSummary(sprite),
	}
}

func primaryDetailRef(sprite WorkspaceTrajectorySprite) (WorkspaceTrajectorySourceKind, string) {
	switch {
	case sprite.RunItemID != "":
		return SourceKindRunItem, sprite.RunItemID
	case sprite.ChatMessageID != "":
		return SourceKindChatMessage, sprite.ChatMessageID
	case sprite.CartographerPatchID != "":
		return SourceKindCartographerPatch, sprite.CartographerPatchID
	case sprite.CartographerWindowID != "":
		return SourceKindCartographerWin, sprite.CartographerWindowID
	case sprite.CartographerRunID != "":
		return SourceKindCartographerRun, sprite.CartographerRunID
	case sprite.WorkflowNodeExecutionID != "":
		return SourceKindWorkflowNodeRun, sprite.WorkflowNodeExecutionID
	default:
		return SourceKindWorkflowExecution, sprite.WorkflowExecutionID
	}
}

func spriteKindFromRunItem(item chat.RunItem) (WorkspaceTrajectorySpriteKind, bool) {
	if kind, ok := typedFileReadKind(item); ok {
		return kind, true
	}
	switch item.Type {
	case chat.RunItemTypeCommandExecution:
		return SpriteKindCommand, true
	case chat.RunItemTypeMCPToolCall,
		chat.RunItemTypeDynamicToolCall,
		chat.RunItemTypeCollabAgentToolCall,
		chat.RunItemTypeWebSearch,
		chat.RunItemTypeImageView,
		chat.RunItemTypeImageGeneration,
		chat.RunItemTypeTerminalInteraction,
		chat.RunItemTypeHook,
		chat.RunItemTypeStructuredInput:
		return SpriteKindToolCall, true
	case chat.RunItemTypeReasoning:
		return SpriteKindReasoningSummary, true
	case chat.RunItemTypePlan:
		return SpriteKindPlanUpdate, true
	case chat.RunItemTypeFileChange:
		return SpriteKindFileWrite, true
	case chat.RunItemTypeDiff:
		return SpriteKindDiff, true
	case chat.RunItemTypeApprovalReview:
		return SpriteKindApproval, true
	case chat.RunItemTypeAgentMessage:
		return SpriteKindAssistantMessage, true
	default:
		return "", false
	}
}

func typedFileReadKind(item chat.RunItem) (WorkspaceTrajectorySpriteKind, bool) {
	for _, operation := range item.FileOperations {
		if operation.Operation == chat.RunItemFileOperationRead && operation.Path != "" {
			return SpriteKindFileRead, true
		}
	}
	return "", false
}

func fileRefsForRunItem(item chat.RunItem, kind WorkspaceTrajectorySpriteKind) []WorkspaceTrajectoryFileRef {
	refs := typedFileRefs(item.FileOperations)
	if len(refs) > 0 {
		return refs
	}
	operation := FileOperationUnknown
	switch kind {
	case SpriteKindFileWrite:
		operation = FileOperationWrite
	case SpriteKindDiff:
		operation = FileOperationDiff
	}
	if operation == FileOperationUnknown {
		return []WorkspaceTrajectoryFileRef{}
	}
	refs = make([]WorkspaceTrajectoryFileRef, 0, len(item.FilePaths))
	for _, path := range item.FilePaths {
		if path == "" {
			continue
		}
		refs = append(refs, WorkspaceTrajectoryFileRef{
			Path:         path,
			DisplayPath:  displayPath(path),
			Operation:    operation,
			ChangedFiles: len(item.FilePaths),
		})
	}
	return refs
}

func typedFileRefs(operations []chat.RunItemFileOp) []WorkspaceTrajectoryFileRef {
	refs := []WorkspaceTrajectoryFileRef{}
	for _, operation := range operations {
		if operation.Path == "" {
			continue
		}
		display := operation.DisplayPath
		if display == "" {
			display = displayPath(operation.Path)
		}
		refs = append(refs, WorkspaceTrajectoryFileRef{
			Path:         operation.Path,
			DisplayPath:  display,
			Operation:    trajectoryFileOperation(operation.Operation),
			RangeStart:   operation.RangeStart,
			RangeEnd:     operation.RangeEnd,
			Additions:    operation.Additions,
			Deletions:    operation.Deletions,
			ChangedFiles: operation.ChangedFiles,
			ContentHash:  operation.ContentHash,
		})
	}
	return refs
}

func trajectoryFileOperation(operation chat.RunItemFileOperation) WorkspaceTrajectoryFileOperation {
	switch operation {
	case chat.RunItemFileOperationRead:
		return FileOperationRead
	case chat.RunItemFileOperationWrite:
		return FileOperationWrite
	case chat.RunItemFileOperationCreate:
		return FileOperationCreate
	case chat.RunItemFileOperationDelete:
		return FileOperationDelete
	case chat.RunItemFileOperationRename:
		return FileOperationRename
	case chat.RunItemFileOperationDiff:
		return FileOperationDiff
	default:
		return FileOperationUnknown
	}
}

func fileRefsForApproval(approval chat.ApprovalRequest) []WorkspaceTrajectoryFileRef {
	if approval.FilePath == "" {
		return []WorkspaceTrajectoryFileRef{}
	}
	return []WorkspaceTrajectoryFileRef{{
		Path:        approval.FilePath,
		DisplayPath: displayPath(approval.FilePath),
		Operation:   FileOperationWrite,
	}}
}

func diffStatsForRunItem(item chat.RunItem) WorkspaceTrajectoryDiffStats {
	stats := typedDiffStats(item)
	if stats.Structured || stats.Summary != "" {
		return stats
	}
	if item.Type != chat.RunItemTypeDiff {
		return WorkspaceTrajectoryDiffStats{}
	}
	return WorkspaceTrajectoryDiffStats{
		Summary:      item.DiffSummary,
		ChangedFiles: len(item.FilePaths),
		Structured:   false,
	}
}

func typedDiffStats(item chat.RunItem) WorkspaceTrajectoryDiffStats {
	if item.DiffStats.Structured ||
		item.DiffStats.Summary != "" ||
		item.DiffStats.ChangedFiles > 0 ||
		item.DiffStats.Additions > 0 ||
		item.DiffStats.Deletions > 0 {
		return WorkspaceTrajectoryDiffStats{
			Summary:      item.DiffStats.Summary,
			ChangedFiles: item.DiffStats.ChangedFiles,
			Additions:    item.DiffStats.Additions,
			Deletions:    item.DiffStats.Deletions,
			Structured:   item.DiffStats.Structured,
		}
	}
	return WorkspaceTrajectoryDiffStats{}
}

func runItemTitle(item chat.RunItem, kind WorkspaceTrajectorySpriteKind) string {
	if item.Title != "" {
		return item.Title
	}
	switch kind {
	case SpriteKindCommand:
		return "Command"
	case SpriteKindToolCall:
		return firstNonEmpty(item.ToolName, item.ServerName, "Tool call")
	case SpriteKindReasoningSummary:
		return "Reasoning summary"
	case SpriteKindPlanUpdate:
		return "Plan update"
	case SpriteKindFileWrite:
		return "File change"
	case SpriteKindFileRead:
		return "File read"
	case SpriteKindDiff:
		return "Diff"
	case SpriteKindApproval:
		return "Approval"
	case SpriteKindAssistantMessage:
		return "Assistant message"
	default:
		return string(kind)
	}
}

func runItemSubtitle(item chat.RunItem, kind WorkspaceTrajectorySpriteKind) string {
	switch kind {
	case SpriteKindCommand:
		return item.Command
	case SpriteKindToolCall:
		return firstNonEmpty(item.ToolName, item.ServerName, item.Summary)
	case SpriteKindFileWrite, SpriteKindFileRead:
		if len(item.FileOperations) == 1 {
			return displayPath(item.FileOperations[0].Path)
		}
		if len(item.FileOperations) > 1 {
			return fmt.Sprintf("%d files", len(item.FileOperations))
		}
		if len(item.FilePaths) == 1 {
			return displayPath(item.FilePaths[0])
		}
		if len(item.FilePaths) > 1 {
			return fmt.Sprintf("%d files", len(item.FilePaths))
		}
	case SpriteKindDiff:
		return firstNonEmpty(item.DiffSummary, item.Summary)
	}
	return firstNonEmpty(item.Summary, item.Progress, item.Result)
}

func approvalSubtitle(approval chat.ApprovalRequest) string {
	switch approval.Kind {
	case chat.ApprovalKindCommand:
		return approval.Command
	case chat.ApprovalKindFileChange:
		return approval.FilePath
	case chat.ApprovalKindPermission:
		return approval.Permission
	case chat.ApprovalKindUserInput:
		return approval.Question
	default:
		return approval.Body
	}
}

func sourceRefsForRunItem(item chat.RunItem) []WorkspaceTrajectorySourceRef {
	refs := []WorkspaceTrajectorySourceRef{
		{Kind: SourceKindChatRun, ID: item.RunID},
		{Kind: SourceKindRunItem, ID: item.ID},
	}
	if item.ProviderItemID != "" {
		refs = append(refs, WorkspaceTrajectorySourceRef{Kind: SourceKindRunItem, ID: item.ProviderItemID})
	}
	return refs
}

func sourceRefsForApproval(approval chat.ApprovalRequest) []WorkspaceTrajectorySourceRef {
	refs := []WorkspaceTrajectorySourceRef{{Kind: SourceKindChatRun, ID: approval.RunID}}
	if approval.RunItemID != "" {
		refs = append(refs, WorkspaceTrajectorySourceRef{Kind: SourceKindRunItem, ID: approval.RunItemID})
	}
	return refs
}

func sourceRefsForCartographerRun(run semanticgraph.SemanticRuntimeCartographerRun) []WorkspaceTrajectorySourceRef {
	refs := []WorkspaceTrajectorySourceRef{{Kind: SourceKindCartographerRun, ID: run.ID}}
	return appendSemanticSourceRefs(refs, run.SourceRefs)
}

func sourceRefsForCartographerWindow(window semanticgraph.SemanticRuntimeCartographerWindow) []WorkspaceTrajectorySourceRef {
	refs := []WorkspaceTrajectorySourceRef{{Kind: SourceKindCartographerWin, ID: window.ID}}
	if window.RunID != "" {
		refs = append(refs, WorkspaceTrajectorySourceRef{Kind: SourceKindCartographerRun, ID: window.RunID})
	}
	return appendSemanticSourceRefs(refs, window.SourceRefs)
}

func sourceRefsForCartographerPatch(patch semanticgraph.SemanticRuntimePatchPreview) []WorkspaceTrajectorySourceRef {
	refs := []WorkspaceTrajectorySourceRef{{Kind: SourceKindCartographerPatch, ID: patch.PatchID}}
	if patch.RunID != "" {
		refs = append(refs, WorkspaceTrajectorySourceRef{Kind: SourceKindCartographerRun, ID: patch.RunID})
	}
	return appendSemanticSourceRefs(refs, patch.SourceRefs)
}

func appendSemanticSourceRefs(refs []WorkspaceTrajectorySourceRef, source semanticgraph.SemanticContextSourceRefs) []WorkspaceTrajectorySourceRef {
	if source.WorkflowExecutionID != "" {
		refs = append(refs, WorkspaceTrajectorySourceRef{Kind: SourceKindWorkflowExecution, ID: source.WorkflowExecutionID})
	}
	if source.WorkflowNodeID != "" {
		refs = append(refs, WorkspaceTrajectorySourceRef{Kind: SourceKindWorkflowNode, ID: source.WorkflowNodeID})
	}
	if source.RunItemID != "" {
		refs = append(refs, WorkspaceTrajectorySourceRef{Kind: SourceKindRunItem, ID: source.RunItemID})
	}
	if source.ChatRunID != "" {
		refs = append(refs, WorkspaceTrajectorySourceRef{Kind: SourceKindChatRun, ID: source.ChatRunID})
	}
	if source.ChatMessageID != "" {
		refs = append(refs, WorkspaceTrajectorySourceRef{Kind: SourceKindChatMessage, ID: source.ChatMessageID})
	}
	return refs
}

func assistantMessageSprite(workspaceID string, conversationID string, runID string, messageID string, status chat.MessageStatus, updatedAt string) WorkspaceTrajectorySprite {
	spriteStatus := spriteStatusFromMessageStatus(status)
	sprite := WorkspaceTrajectorySprite{
		SchemaVersion:      SchemaVersion,
		ID:                 "assistant-message:" + messageID,
		Kind:               SpriteKindAssistantMessage,
		Status:             spriteStatus,
		Severity:           severityForStatus(spriteStatus, ""),
		WorkspaceID:        workspaceID,
		ChatConversationID: conversationID,
		ChatRunID:          runID,
		ChatMessageID:      messageID,
		Title:              "Assistant message",
		Subtitle:           "Assistant output updated",
		SourceRefs: []WorkspaceTrajectorySourceRef{
			{Kind: SourceKindChatRun, ID: runID},
			{Kind: SourceKindChatMessage, ID: messageID},
		},
		CreatedAt: updatedAt,
		UpdatedAt: updatedAt,
		TTLMS:     ttlForStatus(spriteStatus),
	}
	sprite.ExpiresAt = expiresAt(updatedAt, sprite.TTLMS)
	return sprite
}

func aggregateSprites(workspaceID string, workflowExecutionID string, sprites []WorkspaceTrajectorySprite) []WorkspaceTrajectoryWorkflowNodeAggregate {
	byID := map[string]*WorkspaceTrajectoryWorkflowNodeAggregate{}
	for _, sprite := range sprites {
		if sprite.WorkflowNodeID == "" && sprite.WorkflowNodeExecutionID == "" {
			continue
		}
		id := aggregateID(sprite)
		aggregate := byID[id]
		if aggregate == nil {
			aggregate = &WorkspaceTrajectoryWorkflowNodeAggregate{
				ID:                      id,
				WorkspaceID:             workspaceID,
				WorkflowExecutionID:     firstNonEmpty(sprite.WorkflowExecutionID, workflowExecutionID),
				WorkflowNodeID:          sprite.WorkflowNodeID,
				WorkflowNodeExecutionID: sprite.WorkflowNodeExecutionID,
				HighestSeverity:         SpriteSeverityInfo,
				KindCounts:              []WorkspaceTrajectorySpriteKindCount{},
				UpdatedAt:               firstNonEmpty(sprite.UpdatedAt, sprite.CreatedAt),
			}
			byID[id] = aggregate
		}
		recordAggregateSprite(aggregate, sprite)
	}
	aggregates := make([]WorkspaceTrajectoryWorkflowNodeAggregate, 0, len(byID))
	for _, aggregate := range byID {
		sort.Slice(aggregate.KindCounts, func(left int, right int) bool {
			return aggregate.KindCounts[left].Kind < aggregate.KindCounts[right].Kind
		})
		aggregates = append(aggregates, *aggregate)
	}
	sort.Slice(aggregates, func(left int, right int) bool {
		if aggregates[left].UpdatedAt != aggregates[right].UpdatedAt {
			return aggregates[left].UpdatedAt > aggregates[right].UpdatedAt
		}
		return aggregates[left].ID < aggregates[right].ID
	})
	return aggregates
}

func recordAggregateSprite(aggregate *WorkspaceTrajectoryWorkflowNodeAggregate, sprite WorkspaceTrajectorySprite) {
	aggregate.RecentCount++
	if sprite.Status == SpriteStatusRunning || sprite.Status == SpriteStatusPending || sprite.Status == SpriteStatusApprovalRequired {
		aggregate.ActiveCount++
	}
	if sprite.Status == SpriteStatusFailed {
		aggregate.FailedCount++
	}
	if sprite.Kind == SpriteKindApproval || sprite.Status == SpriteStatusApprovalRequired {
		aggregate.ApprovalCount++
	}
	if severityRank(sprite.Severity) > severityRank(aggregate.HighestSeverity) {
		aggregate.HighestSeverity = sprite.Severity
	}
	if sprite.UpdatedAt > aggregate.UpdatedAt {
		aggregate.UpdatedAt = sprite.UpdatedAt
	}
	incrementKindCount(&aggregate.KindCounts, sprite.Kind)
}

func incrementKindCount(counts *[]WorkspaceTrajectorySpriteKindCount, kind WorkspaceTrajectorySpriteKind) {
	for index := range *counts {
		if (*counts)[index].Kind == kind {
			(*counts)[index].Count++
			return
		}
	}
	*counts = append(*counts, WorkspaceTrajectorySpriteKindCount{Kind: kind, Count: 1})
}

func activeWorkflowNodeIDs(execution orchestrator.WorkflowExecution) []string {
	activeExecutionIDs := map[string]bool{}
	for _, id := range execution.ActiveNodeExecutionIDs {
		activeExecutionIDs[id] = true
	}
	result := []string{}
	for _, node := range execution.NodeExecutions {
		if activeExecutionIDs[node.ID] || node.Status == orchestrator.NodeExecutionStatusRunning || node.Status == orchestrator.NodeExecutionStatusWaitingApproval {
			result = append(result, node.NodeID)
		}
	}
	return uniqueSortedStrings(result)
}

func workflowBindingsByRunID(execution orchestrator.WorkflowExecution) map[string]workflowBinding {
	result := map[string]workflowBinding{}
	for _, node := range execution.NodeExecutions {
		runID := runnerRefValue(node.RunnerRefs, orchestrator.RunnerRefChatRun)
		if runID == "" {
			continue
		}
		result[runID] = workflowBinding{
			ExecutionID:     execution.ID,
			NodeID:          node.NodeID,
			NodeExecutionID: node.ID,
		}
	}
	return result
}

func runnerRefValue(refs []orchestrator.WorkflowActionRunnerRef, kind string) string {
	for _, ref := range refs {
		if ref.Kind == kind {
			return ref.ID
		}
	}
	return ""
}

func spriteStatusFromRunItemStatus(status chat.RunItemStatus) WorkspaceTrajectorySpriteStatus {
	switch status {
	case chat.RunItemStatusPending:
		return SpriteStatusPending
	case chat.RunItemStatusRunning:
		return SpriteStatusRunning
	case chat.RunItemStatusCompleted:
		return SpriteStatusCompleted
	case chat.RunItemStatusFailed:
		return SpriteStatusFailed
	case chat.RunItemStatusCancelled:
		return SpriteStatusCancelled
	default:
		return SpriteStatusUnknown
	}
}

func spriteStatusFromMessageStatus(status chat.MessageStatus) WorkspaceTrajectorySpriteStatus {
	switch status {
	case chat.MessageStatusPending:
		return SpriteStatusPending
	case chat.MessageStatusStreaming:
		return SpriteStatusRunning
	case chat.MessageStatusComplete:
		return SpriteStatusCompleted
	case chat.MessageStatusCancelled:
		return SpriteStatusCancelled
	case chat.MessageStatusError:
		return SpriteStatusFailed
	default:
		return SpriteStatusUnknown
	}
}

func spriteStatusFromApprovalStatus(status chat.ApprovalStatus) WorkspaceTrajectorySpriteStatus {
	switch status {
	case chat.ApprovalStatusPending:
		return SpriteStatusApprovalRequired
	case chat.ApprovalStatusApproved, chat.ApprovalStatusAnswered:
		return SpriteStatusCompleted
	case chat.ApprovalStatusDenied:
		return SpriteStatusFailed
	case chat.ApprovalStatusCancelled:
		return SpriteStatusCancelled
	default:
		return SpriteStatusUnknown
	}
}

func spriteStatusFromWorkflowNodeStatus(status orchestrator.WorkflowNodeExecutionStatus) WorkspaceTrajectorySpriteStatus {
	switch status {
	case orchestrator.NodeExecutionStatusPending, orchestrator.NodeExecutionStatusReady:
		return SpriteStatusPending
	case orchestrator.NodeExecutionStatusRunning:
		return SpriteStatusRunning
	case orchestrator.NodeExecutionStatusSucceeded:
		return SpriteStatusCompleted
	case orchestrator.NodeExecutionStatusFailed, orchestrator.NodeExecutionStatusRecoveryRequired:
		return SpriteStatusFailed
	case orchestrator.NodeExecutionStatusCancelled:
		return SpriteStatusCancelled
	case orchestrator.NodeExecutionStatusWaitingApproval:
		return SpriteStatusApprovalRequired
	default:
		return SpriteStatusUnknown
	}
}

func spriteStatusFromWorkflowEvent(eventType orchestrator.WorkflowEventType) WorkspaceTrajectorySpriteStatus {
	switch eventType {
	case orchestrator.EventExecutionStarted,
		orchestrator.EventNodeScheduled,
		orchestrator.EventActionStarted,
		orchestrator.EventRunnerAttemptStarted,
		orchestrator.EventRunnerTextDelta,
		orchestrator.EventRunnerToolCallStarted,
		orchestrator.EventRunnerToolCallOutput,
		orchestrator.EventRunnerArtifactReported,
		orchestrator.EventRunnerStructuredOutputReceived:
		return SpriteStatusRunning
	case orchestrator.EventActionApprovalWait, orchestrator.EventRunnerApprovalRequested:
		return SpriteStatusApprovalRequired
	case orchestrator.EventActionCompleted,
		orchestrator.EventGatewayResolved,
		orchestrator.EventLoopAdvanced,
		orchestrator.EventExecutionCompleted,
		orchestrator.EventRunnerApprovalResolved,
		orchestrator.EventRunnerAttemptCompleted:
		return SpriteStatusCompleted
	case orchestrator.EventActionFailed,
		orchestrator.EventExecutionFailed,
		orchestrator.EventRunnerAttemptFailed,
		orchestrator.EventActionRecoveryRequired,
		orchestrator.EventRunnerAttemptRecoveryRequired:
		return SpriteStatusFailed
	case orchestrator.EventActionCancelled,
		orchestrator.EventExecutionStopped,
		orchestrator.EventExecutionCancelled,
		orchestrator.EventRunnerAttemptCancelled:
		return SpriteStatusCancelled
	default:
		return SpriteStatusUnknown
	}
}
