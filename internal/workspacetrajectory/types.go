package workspacetrajectory

import "encoding/json"

const (
	SchemaVersion = 1

	DefaultRuntimeLimit = 48
	MaxRuntimeLimit     = 160

	DefaultSpriteTTLMS       = 12_000
	FailedSpriteTTLMS        = 60_000
	ApprovalSpriteTTLMS      = 120_000
	MaxSnapshotPayloadBytes  = 96 * 1024
	MaxDeltaPayloadBytes     = 32 * 1024
	MaxSpriteTitleBytes      = 96
	MaxSpriteSubtitleBytes   = 160
	MaxSpriteResultBytes     = 240
	MaxSpriteErrorBytes      = 240
	MaxFileRefDisplayBytes   = 160
	MaxCommandDisplayBytes   = 240
	MaxToolDisplayBytes      = 160
	MaxTimelineSummaryBytes  = 240
	MaxChangedAreaCount      = 8
	RuntimeEventTypeChanged  = "workspace_trajectory_runtime.changed"
	defaultRuntimeStreamID   = "workspace_trajectory_runtime"
	defaultRuntimeBufferSize = 256
)

type WorkspaceTrajectorySpriteKind string
type WorkspaceTrajectorySpriteStatus string
type WorkspaceTrajectorySpriteSeverity string
type WorkspaceTrajectoryFileOperation string
type WorkspaceTrajectoryChangeArea string
type WorkspaceTrajectorySourceKind string

const (
	SpriteKindFileRead         WorkspaceTrajectorySpriteKind = "file_read"
	SpriteKindFileWrite        WorkspaceTrajectorySpriteKind = "file_write"
	SpriteKindDiff             WorkspaceTrajectorySpriteKind = "diff"
	SpriteKindCommand          WorkspaceTrajectorySpriteKind = "command"
	SpriteKindTest             WorkspaceTrajectorySpriteKind = "test"
	SpriteKindToolCall         WorkspaceTrajectorySpriteKind = "tool_call"
	SpriteKindReasoningSummary WorkspaceTrajectorySpriteKind = "reasoning_summary"
	SpriteKindPlanUpdate       WorkspaceTrajectorySpriteKind = "plan_update"
	SpriteKindAssistantMessage WorkspaceTrajectorySpriteKind = "assistant_message"
	SpriteKindApproval         WorkspaceTrajectorySpriteKind = "approval"
	SpriteKindCartographer     WorkspaceTrajectorySpriteKind = "cartographer_status"
	SpriteKindWorkflowStatus   WorkspaceTrajectorySpriteKind = "workflow_status"

	SpriteStatusPending          WorkspaceTrajectorySpriteStatus = "pending"
	SpriteStatusRunning          WorkspaceTrajectorySpriteStatus = "running"
	SpriteStatusCompleted        WorkspaceTrajectorySpriteStatus = "completed"
	SpriteStatusFailed           WorkspaceTrajectorySpriteStatus = "failed"
	SpriteStatusCancelled        WorkspaceTrajectorySpriteStatus = "cancelled"
	SpriteStatusApprovalRequired WorkspaceTrajectorySpriteStatus = "approval_required"
	SpriteStatusUnknown          WorkspaceTrajectorySpriteStatus = "unknown"

	SpriteSeverityInfo     WorkspaceTrajectorySpriteSeverity = "info"
	SpriteSeveritySuccess  WorkspaceTrajectorySpriteSeverity = "success"
	SpriteSeverityWarning  WorkspaceTrajectorySpriteSeverity = "warning"
	SpriteSeverityError    WorkspaceTrajectorySpriteSeverity = "error"
	SpriteSeverityBlocking WorkspaceTrajectorySpriteSeverity = "blocking"

	FileOperationRead    WorkspaceTrajectoryFileOperation = "read"
	FileOperationWrite   WorkspaceTrajectoryFileOperation = "write"
	FileOperationCreate  WorkspaceTrajectoryFileOperation = "create"
	FileOperationDelete  WorkspaceTrajectoryFileOperation = "delete"
	FileOperationRename  WorkspaceTrajectoryFileOperation = "rename"
	FileOperationDiff    WorkspaceTrajectoryFileOperation = "diff"
	FileOperationUnknown WorkspaceTrajectoryFileOperation = "unknown"

	ChangeAreaRunItems     WorkspaceTrajectoryChangeArea = "run_items"
	ChangeAreaAssistant    WorkspaceTrajectoryChangeArea = "assistant"
	ChangeAreaApprovals    WorkspaceTrajectoryChangeArea = "approvals"
	ChangeAreaWorkflow     WorkspaceTrajectoryChangeArea = "workflow"
	ChangeAreaCartographer WorkspaceTrajectoryChangeArea = "cartographer"

	SourceKindChatRun           WorkspaceTrajectorySourceKind = "chat_run"
	SourceKindChatMessage       WorkspaceTrajectorySourceKind = "chat_message"
	SourceKindRunItem           WorkspaceTrajectorySourceKind = "run_item"
	SourceKindRunItemOutput     WorkspaceTrajectorySourceKind = "run_item_output"
	SourceKindWorkflowExecution WorkspaceTrajectorySourceKind = "workflow_execution"
	SourceKindWorkflowEvent     WorkspaceTrajectorySourceKind = "workflow_event"
	SourceKindWorkflowNode      WorkspaceTrajectorySourceKind = "workflow_node"
	SourceKindWorkflowNodeRun   WorkspaceTrajectorySourceKind = "workflow_node_execution"
	SourceKindCartographerRun   WorkspaceTrajectorySourceKind = "cartographer_run"
	SourceKindCartographerWin   WorkspaceTrajectorySourceKind = "cartographer_window"
	SourceKindCartographerPatch WorkspaceTrajectorySourceKind = "cartographer_patch"
)

var (
	spriteKindValues = []WorkspaceTrajectorySpriteKind{
		SpriteKindFileRead,
		SpriteKindFileWrite,
		SpriteKindDiff,
		SpriteKindCommand,
		SpriteKindTest,
		SpriteKindToolCall,
		SpriteKindReasoningSummary,
		SpriteKindPlanUpdate,
		SpriteKindAssistantMessage,
		SpriteKindApproval,
		SpriteKindCartographer,
		SpriteKindWorkflowStatus,
	}
	spriteStatusValues = []WorkspaceTrajectorySpriteStatus{
		SpriteStatusPending,
		SpriteStatusRunning,
		SpriteStatusCompleted,
		SpriteStatusFailed,
		SpriteStatusCancelled,
		SpriteStatusApprovalRequired,
		SpriteStatusUnknown,
	}
	spriteSeverityValues = []WorkspaceTrajectorySpriteSeverity{
		SpriteSeverityInfo,
		SpriteSeveritySuccess,
		SpriteSeverityWarning,
		SpriteSeverityError,
		SpriteSeverityBlocking,
	}
	fileOperationValues = []WorkspaceTrajectoryFileOperation{
		FileOperationRead,
		FileOperationWrite,
		FileOperationCreate,
		FileOperationDelete,
		FileOperationRename,
		FileOperationDiff,
		FileOperationUnknown,
	}
	changeAreaValues = []WorkspaceTrajectoryChangeArea{
		ChangeAreaRunItems,
		ChangeAreaAssistant,
		ChangeAreaApprovals,
		ChangeAreaWorkflow,
		ChangeAreaCartographer,
	}
	sourceKindValues = []WorkspaceTrajectorySourceKind{
		SourceKindChatRun,
		SourceKindChatMessage,
		SourceKindRunItem,
		SourceKindRunItemOutput,
		SourceKindWorkflowExecution,
		SourceKindWorkflowEvent,
		SourceKindWorkflowNode,
		SourceKindWorkflowNodeRun,
		SourceKindCartographerRun,
		SourceKindCartographerWin,
		SourceKindCartographerPatch,
	}
)

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "WorkspaceTrajectorySpriteKind", Values: stringValues(spriteKindValues)},
		{Name: "WorkspaceTrajectorySpriteStatus", Values: stringValues(spriteStatusValues)},
		{Name: "WorkspaceTrajectorySpriteSeverity", Values: stringValues(spriteSeverityValues)},
		{Name: "WorkspaceTrajectoryFileOperation", Values: stringValues(fileOperationValues)},
		{Name: "WorkspaceTrajectoryChangeArea", Values: stringValues(changeAreaValues)},
		{Name: "WorkspaceTrajectorySourceKind", Values: stringValues(sourceKindValues)},
	}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

type RuntimeFilter struct {
	WorkspaceID         string `json:"workspaceId"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	ChatRunID           string `json:"chatRunId"`
	Limit               int    `json:"limit"`
}

type WorkspaceTrajectoryRuntimeSnapshot struct {
	SchemaVersion         int                                        `json:"schemaVersion"`
	WorkspaceID           string                                     `json:"workspaceId"`
	WorkflowExecutionID   string                                     `json:"workflowExecutionId"`
	ChatRunID             string                                     `json:"chatRunId"`
	Revision              int                                        `json:"revision"`
	GeneratedAt           string                                     `json:"generatedAt"`
	Limits                WorkspaceTrajectoryRuntimeLimits           `json:"limits"`
	PayloadBudget         WorkspaceTrajectoryRuntimePayloadBudget    `json:"payloadBudget"`
	ActiveWorkflowNodeIDs []string                                   `json:"activeWorkflowNodeIds"`
	ActiveRunItemIDs      []string                                   `json:"activeRunItemIds"`
	Sprites               []WorkspaceTrajectorySprite                `json:"sprites"`
	Timeline              []WorkspaceTrajectoryTimelineItem          `json:"timeline"`
	AggregateByWorkflow   []WorkspaceTrajectoryWorkflowNodeAggregate `json:"aggregateByWorkflowNode"`
	Removals              WorkspaceTrajectoryRuntimeRemovals         `json:"removals"`
	DetailRefs            []WorkspaceTrajectoryDetailRef             `json:"detailRefs"`
}

type WorkspaceTrajectoryRuntimeDelta struct {
	SchemaVersion    int                                        `json:"schemaVersion"`
	WorkspaceID      string                                     `json:"workspaceId"`
	FromRevision     int                                        `json:"fromRevision"`
	ToRevision       int                                        `json:"toRevision"`
	GeneratedAt      string                                     `json:"generatedAt"`
	PayloadBudget    WorkspaceTrajectoryRuntimePayloadBudget    `json:"payloadBudget"`
	ChangedAreas     []WorkspaceTrajectoryChangeArea            `json:"changedAreas"`
	SpriteUpdates    []WorkspaceTrajectorySprite                `json:"spriteUpdates"`
	TimelineUpdates  []WorkspaceTrajectoryTimelineItem          `json:"timelineUpdates"`
	AggregateUpdates []WorkspaceTrajectoryWorkflowNodeAggregate `json:"aggregateUpdates"`
	Removals         WorkspaceTrajectoryRuntimeRemovals         `json:"removals"`
	DetailRefs       []WorkspaceTrajectoryDetailRef             `json:"detailRefs"`
}

type WorkspaceTrajectoryRuntimeEvent struct {
	SchemaVersion    int                              `json:"schemaVersion"`
	StreamID         string                           `json:"streamId"`
	Sequence         int                              `json:"sequence"`
	EventID          string                           `json:"eventId"`
	Type             string                           `json:"type"`
	WorkspaceID      string                           `json:"workspaceId"`
	Revision         int                              `json:"revision"`
	Delta            *WorkspaceTrajectoryRuntimeDelta `json:"delta"`
	SnapshotRequired bool                             `json:"snapshotRequired"`
	OccurredAt       string                           `json:"occurredAt"`
}

type WorkspaceTrajectoryRuntimeLimits struct {
	MaxSprites              int `json:"maxSprites"`
	MaxTimelineItems        int `json:"maxTimelineItems"`
	MaxAggregates           int `json:"maxAggregates"`
	MaxDetailRefs           int `json:"maxDetailRefs"`
	MaxSourceRefsPerSprite  int `json:"maxSourceRefsPerSprite"`
	MaxFileRefsPerSprite    int `json:"maxFileRefsPerSprite"`
	MaxChangedAreas         int `json:"maxChangedAreas"`
	MaxSpriteTitleBytes     int `json:"maxSpriteTitleBytes"`
	MaxSpriteSubtitleBytes  int `json:"maxSpriteSubtitleBytes"`
	MaxSpriteResultBytes    int `json:"maxSpriteResultBytes"`
	MaxSpriteErrorBytes     int `json:"maxSpriteErrorBytes"`
	MaxSnapshotPayloadBytes int `json:"maxSnapshotPayloadBytes"`
	MaxDeltaPayloadBytes    int `json:"maxDeltaPayloadBytes"`
}

type WorkspaceTrajectoryRuntimePayloadBudget struct {
	ByteSize             int `json:"byteSize"`
	MaxByteSize          int `json:"maxByteSize"`
	TruncatedStringCount int `json:"truncatedStringCount"`
	OmittedSpriteCount   int `json:"omittedSpriteCount"`
}

type WorkspaceTrajectoryRuntimeRemovals struct {
	SpriteIDs    []string `json:"spriteIds"`
	TimelineIDs  []string `json:"timelineIds"`
	AggregateIDs []string `json:"aggregateIds"`
	DetailRefIDs []string `json:"detailRefIds"`
}

type WorkspaceTrajectorySprite struct {
	SchemaVersion           int                               `json:"schemaVersion"`
	ID                      string                            `json:"id"`
	Kind                    WorkspaceTrajectorySpriteKind     `json:"kind"`
	Status                  WorkspaceTrajectorySpriteStatus   `json:"status"`
	Severity                WorkspaceTrajectorySpriteSeverity `json:"severity"`
	WorkspaceID             string                            `json:"workspaceId"`
	WorkflowExecutionID     string                            `json:"workflowExecutionId"`
	WorkflowNodeID          string                            `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                            `json:"workflowNodeExecutionId"`
	ChatConversationID      string                            `json:"chatConversationId"`
	ChatRunID               string                            `json:"chatRunId"`
	ChatMessageID           string                            `json:"chatMessageId"`
	RunItemID               string                            `json:"runItemId"`
	ProviderItemID          string                            `json:"providerItemId"`
	CartographerRunID       string                            `json:"cartographerRunId"`
	CartographerWindowID    string                            `json:"cartographerWindowId"`
	CartographerPatchID     string                            `json:"cartographerPatchId"`
	Title                   string                            `json:"title"`
	Subtitle                string                            `json:"subtitle"`
	SourceRefs              []WorkspaceTrajectorySourceRef    `json:"sourceRefs"`
	FileRefs                []WorkspaceTrajectoryFileRef      `json:"fileRefs"`
	Command                 WorkspaceTrajectoryCommand        `json:"command"`
	Tool                    WorkspaceTrajectoryTool           `json:"tool"`
	DiffStats               WorkspaceTrajectoryDiffStats      `json:"diffStats"`
	ResultSummary           string                            `json:"resultSummary"`
	ErrorSummary            string                            `json:"errorSummary"`
	CreatedAt               string                            `json:"createdAt"`
	UpdatedAt               string                            `json:"updatedAt"`
	ExpiresAt               string                            `json:"expiresAt"`
	TTLMS                   int                               `json:"ttlMs"`
}

type WorkspaceTrajectorySourceRef struct {
	Kind WorkspaceTrajectorySourceKind `json:"kind"`
	ID   string                        `json:"id"`
}

type WorkspaceTrajectoryFileRef struct {
	Path         string                           `json:"path"`
	DisplayPath  string                           `json:"displayPath"`
	Operation    WorkspaceTrajectoryFileOperation `json:"operation"`
	RangeStart   int                              `json:"rangeStart"`
	RangeEnd     int                              `json:"rangeEnd"`
	Additions    int                              `json:"additions"`
	Deletions    int                              `json:"deletions"`
	ChangedFiles int                              `json:"changedFiles"`
	ContentHash  string                           `json:"contentHash"`
}

type WorkspaceTrajectoryCommand struct {
	Command    string `json:"command"`
	Cwd        string `json:"cwd"`
	ExitCode   int    `json:"exitCode"`
	DurationMS int    `json:"durationMs"`
}

type WorkspaceTrajectoryTool struct {
	ServerName string `json:"serverName"`
	ToolName   string `json:"toolName"`
	Namespace  string `json:"namespace"`
	RequestID  string `json:"requestId"`
}

type WorkspaceTrajectoryDiffStats struct {
	Summary      string `json:"summary"`
	ChangedFiles int    `json:"changedFiles"`
	Additions    int    `json:"additions"`
	Deletions    int    `json:"deletions"`
	Structured   bool   `json:"structured"`
}

type WorkspaceTrajectoryTimelineItem struct {
	SchemaVersion           int                               `json:"schemaVersion"`
	ID                      string                            `json:"id"`
	SpriteID                string                            `json:"spriteId"`
	Kind                    WorkspaceTrajectorySpriteKind     `json:"kind"`
	Status                  WorkspaceTrajectorySpriteStatus   `json:"status"`
	Severity                WorkspaceTrajectorySpriteSeverity `json:"severity"`
	WorkspaceID             string                            `json:"workspaceId"`
	WorkflowExecutionID     string                            `json:"workflowExecutionId"`
	WorkflowNodeID          string                            `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                            `json:"workflowNodeExecutionId"`
	ChatRunID               string                            `json:"chatRunId"`
	RunItemID               string                            `json:"runItemId"`
	Summary                 string                            `json:"summary"`
	OccurredAt              string                            `json:"occurredAt"`
	SourceRefs              []WorkspaceTrajectorySourceRef    `json:"sourceRefs"`
}

type WorkspaceTrajectoryWorkflowNodeAggregate struct {
	ID                      string                               `json:"id"`
	WorkspaceID             string                               `json:"workspaceId"`
	WorkflowExecutionID     string                               `json:"workflowExecutionId"`
	WorkflowNodeID          string                               `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                               `json:"workflowNodeExecutionId"`
	ActiveCount             int                                  `json:"activeCount"`
	RecentCount             int                                  `json:"recentCount"`
	FailedCount             int                                  `json:"failedCount"`
	ApprovalCount           int                                  `json:"approvalCount"`
	HighestSeverity         WorkspaceTrajectorySpriteSeverity    `json:"highestSeverity"`
	KindCounts              []WorkspaceTrajectorySpriteKindCount `json:"kindCounts"`
	UpdatedAt               string                               `json:"updatedAt"`
}

type WorkspaceTrajectorySpriteKindCount struct {
	Kind  WorkspaceTrajectorySpriteKind `json:"kind"`
	Count int                           `json:"count"`
}

type WorkspaceTrajectoryDetailRef struct {
	ID         string                        `json:"id"`
	SourceKind WorkspaceTrajectorySourceKind `json:"sourceKind"`
	SourceID   string                        `json:"sourceId"`
	SpriteID   string                        `json:"spriteId"`
	Summary    string                        `json:"summary"`
}

func EmptyRuntimeRemovals() WorkspaceTrajectoryRuntimeRemovals {
	return WorkspaceTrajectoryRuntimeRemovals{
		SpriteIDs:    []string{},
		TimelineIDs:  []string{},
		AggregateIDs: []string{},
		DetailRefIDs: []string{},
	}
}

func EmptyRuntimeDelta(workspaceID string, fromRevision int, toRevision int, generatedAt string) WorkspaceTrajectoryRuntimeDelta {
	return WorkspaceTrajectoryRuntimeDelta{
		SchemaVersion:    SchemaVersion,
		WorkspaceID:      workspaceID,
		FromRevision:     fromRevision,
		ToRevision:       toRevision,
		GeneratedAt:      generatedAt,
		ChangedAreas:     []WorkspaceTrajectoryChangeArea{},
		SpriteUpdates:    []WorkspaceTrajectorySprite{},
		TimelineUpdates:  []WorkspaceTrajectoryTimelineItem{},
		AggregateUpdates: []WorkspaceTrajectoryWorkflowNodeAggregate{},
		Removals:         EmptyRuntimeRemovals(),
		DetailRefs:       []WorkspaceTrajectoryDetailRef{},
	}
}

func (snapshot WorkspaceTrajectoryRuntimeSnapshot) MarshalJSON() ([]byte, error) {
	type snapshotAlias WorkspaceTrajectoryRuntimeSnapshot
	snapshot.ActiveWorkflowNodeIDs = nonNilStrings(snapshot.ActiveWorkflowNodeIDs)
	snapshot.ActiveRunItemIDs = nonNilStrings(snapshot.ActiveRunItemIDs)
	snapshot.Sprites = nonNilSprites(snapshot.Sprites)
	snapshot.Timeline = nonNilTimelineItems(snapshot.Timeline)
	snapshot.AggregateByWorkflow = nonNilAggregates(snapshot.AggregateByWorkflow)
	snapshot.Removals = nonNilRemovals(snapshot.Removals)
	snapshot.DetailRefs = nonNilDetailRefs(snapshot.DetailRefs)
	return json.Marshal(snapshotAlias(snapshot))
}

func (delta WorkspaceTrajectoryRuntimeDelta) MarshalJSON() ([]byte, error) {
	type deltaAlias WorkspaceTrajectoryRuntimeDelta
	if delta.ChangedAreas == nil {
		delta.ChangedAreas = []WorkspaceTrajectoryChangeArea{}
	}
	delta.SpriteUpdates = nonNilSprites(delta.SpriteUpdates)
	delta.TimelineUpdates = nonNilTimelineItems(delta.TimelineUpdates)
	delta.AggregateUpdates = nonNilAggregates(delta.AggregateUpdates)
	delta.Removals = nonNilRemovals(delta.Removals)
	delta.DetailRefs = nonNilDetailRefs(delta.DetailRefs)
	return json.Marshal(deltaAlias(delta))
}

func (sprite WorkspaceTrajectorySprite) MarshalJSON() ([]byte, error) {
	type spriteAlias WorkspaceTrajectorySprite
	sprite.SourceRefs = nonNilSourceRefs(sprite.SourceRefs)
	sprite.FileRefs = nonNilFileRefs(sprite.FileRefs)
	return json.Marshal(spriteAlias(sprite))
}

func (item WorkspaceTrajectoryTimelineItem) MarshalJSON() ([]byte, error) {
	type itemAlias WorkspaceTrajectoryTimelineItem
	item.SourceRefs = nonNilSourceRefs(item.SourceRefs)
	return json.Marshal(itemAlias(item))
}

func (aggregate WorkspaceTrajectoryWorkflowNodeAggregate) MarshalJSON() ([]byte, error) {
	type aggregateAlias WorkspaceTrajectoryWorkflowNodeAggregate
	if aggregate.KindCounts == nil {
		aggregate.KindCounts = []WorkspaceTrajectorySpriteKindCount{}
	}
	return json.Marshal(aggregateAlias(aggregate))
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func nonNilSourceRefs(values []WorkspaceTrajectorySourceRef) []WorkspaceTrajectorySourceRef {
	if values == nil {
		return []WorkspaceTrajectorySourceRef{}
	}
	return values
}

func nonNilFileRefs(values []WorkspaceTrajectoryFileRef) []WorkspaceTrajectoryFileRef {
	if values == nil {
		return []WorkspaceTrajectoryFileRef{}
	}
	return values
}

func nonNilSprites(values []WorkspaceTrajectorySprite) []WorkspaceTrajectorySprite {
	if values == nil {
		return []WorkspaceTrajectorySprite{}
	}
	return values
}

func nonNilTimelineItems(values []WorkspaceTrajectoryTimelineItem) []WorkspaceTrajectoryTimelineItem {
	if values == nil {
		return []WorkspaceTrajectoryTimelineItem{}
	}
	return values
}

func nonNilAggregates(values []WorkspaceTrajectoryWorkflowNodeAggregate) []WorkspaceTrajectoryWorkflowNodeAggregate {
	if values == nil {
		return []WorkspaceTrajectoryWorkflowNodeAggregate{}
	}
	return values
}

func nonNilDetailRefs(values []WorkspaceTrajectoryDetailRef) []WorkspaceTrajectoryDetailRef {
	if values == nil {
		return []WorkspaceTrajectoryDetailRef{}
	}
	return values
}

func nonNilRemovals(removals WorkspaceTrajectoryRuntimeRemovals) WorkspaceTrajectoryRuntimeRemovals {
	removals.SpriteIDs = nonNilStrings(removals.SpriteIDs)
	removals.TimelineIDs = nonNilStrings(removals.TimelineIDs)
	removals.AggregateIDs = nonNilStrings(removals.AggregateIDs)
	removals.DetailRefIDs = nonNilStrings(removals.DetailRefIDs)
	return removals
}
