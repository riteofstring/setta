package conversation

type TrajectoryEventKind string
type TrajectoryActor string
type PlanStepStatus string
type TrajectoryActivityKind string
type FileChangeKind string
type FileChangeOutcome string
type TrajectoryApprovalKind string
type TrajectoryApprovalDecision string
type SubagentStatus string
type AgentLivenessStatus string
type AgentLivenessReason string
type ProviderLifecycleStatus string
type TurnInterruptionReason string

const (
	TrajectoryEventUserInputAccepted             TrajectoryEventKind = "user_input_accepted"
	TrajectoryEventTurnQueued                    TrajectoryEventKind = "turn_queued"
	TrajectoryEventTurnPromoted                  TrajectoryEventKind = "turn_promoted"
	TrajectoryEventTurnStarted                   TrajectoryEventKind = "turn_started"
	TrajectoryEventTurnSteered                   TrajectoryEventKind = "turn_steered"
	TrajectoryEventTurnInterrupted               TrajectoryEventKind = "turn_interrupted"
	TrajectoryEventTurnCompleted                 TrajectoryEventKind = "turn_completed"
	TrajectoryEventTurnFailed                    TrajectoryEventKind = "turn_failed"
	TrajectoryEventAgentPublicTextDelta          TrajectoryEventKind = "agent_public_text_delta"
	TrajectoryEventAgentMessageCompleted         TrajectoryEventKind = "agent_message_completed"
	TrajectoryEventPublicReasoningSummaryUpdated TrajectoryEventKind = "public_reasoning_summary_updated"
	TrajectoryEventPlanChanged                   TrajectoryEventKind = "plan_changed"
	TrajectoryEventActivityStarted               TrajectoryEventKind = "activity_started"
	TrajectoryEventActivityProgressed            TrajectoryEventKind = "activity_progressed"
	TrajectoryEventActivityCompleted             TrajectoryEventKind = "activity_completed"
	TrajectoryEventActivityFailed                TrajectoryEventKind = "activity_failed"
	TrajectoryEventFileChangeProposed            TrajectoryEventKind = "file_change_proposed"
	TrajectoryEventFileChangeCompleted           TrajectoryEventKind = "file_change_completed"
	TrajectoryEventApprovalRequested             TrajectoryEventKind = "approval_requested"
	TrajectoryEventApprovalResolved              TrajectoryEventKind = "approval_resolved"
	TrajectoryEventSubagentStarted               TrajectoryEventKind = "subagent_started"
	TrajectoryEventSubagentUpdated               TrajectoryEventKind = "subagent_updated"
	TrajectoryEventSubagentCompleted             TrajectoryEventKind = "subagent_completed"
	TrajectoryEventArtifactEmitted               TrajectoryEventKind = "artifact_emitted"
	TrajectoryEventAgentLivenessChanged          TrajectoryEventKind = "agent_liveness_changed"
	TrajectoryEventProviderLifecycleChanged      TrajectoryEventKind = "provider_lifecycle_changed"
	TrajectoryEventModelRerouted                 TrajectoryEventKind = "model_rerouted"

	TrajectoryActorUser     TrajectoryActor = "user"
	TrajectoryActorAgent    TrajectoryActor = "agent"
	TrajectoryActorProvider TrajectoryActor = "provider"
	TrajectoryActorSystem   TrajectoryActor = "system"
	TrajectoryActorMaster   TrajectoryActor = "master"

	PlanStepStatusPending    PlanStepStatus = "pending"
	PlanStepStatusInProgress PlanStepStatus = "in_progress"
	PlanStepStatusCompleted  PlanStepStatus = "completed"

	TrajectoryActivityCommand         TrajectoryActivityKind = "command"
	TrajectoryActivityMCPTool         TrajectoryActivityKind = "mcp_tool"
	TrajectoryActivityDynamicTool     TrajectoryActivityKind = "dynamic_tool"
	TrajectoryActivityWebSearch       TrajectoryActivityKind = "web_search"
	TrajectoryActivityImageView       TrajectoryActivityKind = "image_view"
	TrajectoryActivityImageGeneration TrajectoryActivityKind = "image_generation"
	TrajectoryActivitySleep           TrajectoryActivityKind = "sleep"
	TrajectoryActivityHook            TrajectoryActivityKind = "hook"
	TrajectoryActivityFileChange      TrajectoryActivityKind = "file_change"
	TrajectoryActivitySubagent        TrajectoryActivityKind = "subagent"
	TrajectoryActivityOther           TrajectoryActivityKind = "other"

	FileChangeAdd    FileChangeKind = "add"
	FileChangeDelete FileChangeKind = "delete"
	FileChangeUpdate FileChangeKind = "update"

	FileChangeOutcomeCompleted FileChangeOutcome = "completed"
	FileChangeOutcomeFailed    FileChangeOutcome = "failed"
	FileChangeOutcomeDeclined  FileChangeOutcome = "declined"

	TrajectoryApprovalKindCommand         TrajectoryApprovalKind = "command"
	TrajectoryApprovalKindFileChange      TrajectoryApprovalKind = "file_change"
	TrajectoryApprovalKindPermission      TrajectoryApprovalKind = "permission"
	TrajectoryApprovalKindStructuredInput TrajectoryApprovalKind = "structured_input"
	TrajectoryApprovalKindUserInput       TrajectoryApprovalKind = "user_input"
	TrajectoryApprovalKindMCPElicitation  TrajectoryApprovalKind = "mcp_elicitation"

	TrajectoryApprovalDecisionApproved           TrajectoryApprovalDecision = "approved"
	TrajectoryApprovalDecisionApprovedForSession TrajectoryApprovalDecision = "approved_for_session"
	TrajectoryApprovalDecisionDenied             TrajectoryApprovalDecision = "denied"
	TrajectoryApprovalDecisionCancelled          TrajectoryApprovalDecision = "cancelled"
	TrajectoryApprovalDecisionAnswered           TrajectoryApprovalDecision = "answered"

	SubagentStatusPendingInit SubagentStatus = "pending_init"
	SubagentStatusRunning     SubagentStatus = "running"
	SubagentStatusInterrupted SubagentStatus = "interrupted"
	SubagentStatusCompleted   SubagentStatus = "completed"
	SubagentStatusErrored     SubagentStatus = "errored"
	SubagentStatusShutdown    SubagentStatus = "shutdown"
	SubagentStatusNotFound    SubagentStatus = "not_found"

	AgentLivenessAttached    AgentLivenessStatus = "attached"
	AgentLivenessReconciling AgentLivenessStatus = "reconciling"
	AgentLivenessLost        AgentLivenessStatus = "lost"
	AgentLivenessTerminal    AgentLivenessStatus = "terminal"

	AgentLivenessReasonProviderRefPending  AgentLivenessReason = "provider_ref_pending"
	AgentLivenessReasonProviderTurnLinked  AgentLivenessReason = "provider_turn_linked"
	AgentLivenessReasonProviderInactive    AgentLivenessReason = "provider_inactive"
	AgentLivenessReasonAttachmentMissing   AgentLivenessReason = "attachment_missing"
	AgentLivenessReasonTurnTerminal        AgentLivenessReason = "turn_terminal"
	AgentLivenessReasonWakeRecheck         AgentLivenessReason = "wake_recheck"
	AgentLivenessReasonSnapshotLoad        AgentLivenessReason = "snapshot_load"
	AgentLivenessReasonStreamResync        AgentLivenessReason = "stream_resync"
	AgentLivenessReasonUserRetry           AgentLivenessReason = "user_retry"
	AgentLivenessReasonProviderRestarted   AgentLivenessReason = "provider_restarted"
	AgentLivenessReasonProviderUnavailable AgentLivenessReason = "provider_unavailable"
	AgentLivenessReasonTurnNotFound        AgentLivenessReason = "turn_not_found"

	ProviderLifecycleStarting    ProviderLifecycleStatus = "starting"
	ProviderLifecycleReady       ProviderLifecycleStatus = "ready"
	ProviderLifecycleRestarting  ProviderLifecycleStatus = "restarting"
	ProviderLifecycleUnavailable ProviderLifecycleStatus = "unavailable"
	ProviderLifecycleClosed      ProviderLifecycleStatus = "closed"

	TurnInterruptionUserRequested       TurnInterruptionReason = "user_requested"
	TurnInterruptionProviderInterrupted TurnInterruptionReason = "provider_interrupted"
	TurnInterruptionRuntimeShutdown     TurnInterruptionReason = "runtime_shutdown"
	TurnInterruptionReconciliation      TurnInterruptionReason = "reconciliation"
)

var trajectoryEventKinds = []TrajectoryEventKind{
	TrajectoryEventUserInputAccepted,
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
	TrajectoryEventProviderLifecycleChanged,
	TrajectoryEventModelRerouted,
}

func TrajectoryEventKinds() []TrajectoryEventKind {
	result := make([]TrajectoryEventKind, len(trajectoryEventKinds))
	copy(result, trajectoryEventKinds)
	return result
}

var trajectoryActivityKinds = []TrajectoryActivityKind{
	TrajectoryActivityCommand,
	TrajectoryActivityMCPTool,
	TrajectoryActivityDynamicTool,
	TrajectoryActivityWebSearch,
	TrajectoryActivityImageView,
	TrajectoryActivityImageGeneration,
	TrajectoryActivitySleep,
	TrajectoryActivityHook,
	TrajectoryActivityFileChange,
	TrajectoryActivitySubagent,
	TrajectoryActivityOther,
}

// TrajectoryActivityKinds is the authoritative activity catalog. Consumers that
// map activities onto their own vocabulary iterate it so a new activity kind
// fails their coverage checks instead of falling through to a generic case.
func TrajectoryActivityKinds() []TrajectoryActivityKind {
	result := make([]TrajectoryActivityKind, len(trajectoryActivityKinds))
	copy(result, trajectoryActivityKinds)
	return result
}

var agentLivenessStatuses = []AgentLivenessStatus{
	AgentLivenessAttached,
	AgentLivenessReconciling,
	AgentLivenessLost,
	AgentLivenessTerminal,
}

// AgentLivenessStatuses is the authoritative agent liveness catalog.
func AgentLivenessStatuses() []AgentLivenessStatus {
	result := make([]AgentLivenessStatus, len(agentLivenessStatuses))
	copy(result, agentLivenessStatuses)
	return result
}

var providerLifecycleStatuses = []ProviderLifecycleStatus{
	ProviderLifecycleStarting,
	ProviderLifecycleReady,
	ProviderLifecycleRestarting,
	ProviderLifecycleUnavailable,
	ProviderLifecycleClosed,
}

// ProviderLifecycleStatuses is the authoritative provider lifecycle catalog.
func ProviderLifecycleStatuses() []ProviderLifecycleStatus {
	result := make([]ProviderLifecycleStatus, len(providerLifecycleStatuses))
	copy(result, providerLifecycleStatuses)
	return result
}

var planStepStatuses = []PlanStepStatus{
	PlanStepStatusPending,
	PlanStepStatusInProgress,
	PlanStepStatusCompleted,
}

// PlanStepStatuses is the authoritative plan step status catalog.
func PlanStepStatuses() []PlanStepStatus {
	result := make([]PlanStepStatus, len(planStepStatuses))
	copy(result, planStepStatuses)
	return result
}

type PlanStep struct {
	Text   string         `json:"text"`
	Status PlanStepStatus `json:"status"`
}

type TrajectoryContentReference struct {
	URI       string `json:"uri"`
	MediaType string `json:"mediaType"`
	ByteSize  int    `json:"byteSize"`
	Truncated bool   `json:"truncated"`
	Summary   string `json:"summary"`
}

type TrajectoryActivity struct {
	ID        string                 `json:"id"`
	Kind      TrajectoryActivityKind `json:"kind"`
	Title     string                 `json:"title"`
	Command   *string                `json:"command"`
	CWD       *string                `json:"cwd"`
	Server    *string                `json:"server"`
	Tool      *string                `json:"tool"`
	Namespace *string                `json:"namespace"`
	ProcessID *string                `json:"processId"`
}

type FileChange struct {
	Path     string         `json:"path"`
	Kind     FileChangeKind `json:"kind"`
	MovePath *string        `json:"movePath"`
	Diff     string         `json:"diff"`
}

type TrajectoryApprovalQuestion struct {
	ID          string   `json:"id"`
	Header      string   `json:"header"`
	Question    string   `json:"question"`
	Options     []string `json:"options"`
	AllowsOther bool     `json:"allowsOther"`
	Secret      bool     `json:"secret"`
}

type TrajectoryApprovalRequest struct {
	ID                         string                       `json:"id"`
	ProviderItemID             string                       `json:"providerItemId"`
	Kind                       TrajectoryApprovalKind       `json:"kind"`
	Title                      string                       `json:"title"`
	Body                       string                       `json:"body"`
	Command                    *string                      `json:"command"`
	CWD                        *string                      `json:"cwd"`
	FilePaths                  []string                     `json:"filePaths"`
	RequestedPermissionProfile *string                      `json:"requestedPermissionProfile"`
	Questions                  []TrajectoryApprovalQuestion `json:"questions"`
	RequestedAt                string                       `json:"requestedAt"`
}

type TrajectoryApprovalResolution struct {
	ApprovalID      string                       `json:"approvalId"`
	Decision        TrajectoryApprovalDecision   `json:"decision"`
	Response        string                       `json:"response"`
	Answers         []ConversationApprovalAnswer `json:"answers"`
	SecretsRedacted bool                         `json:"secretsRedacted"`
	ResolvedAt      string                       `json:"resolvedAt"`
}

type Subagent struct {
	ID               string           `json:"id"`
	ProviderThreadID string           `json:"providerThreadId"`
	Status           SubagentStatus   `json:"status"`
	ModelID          *string          `json:"modelId"`
	ReasoningEffort  *ReasoningEffort `json:"reasoningEffort"`
	Message          *string          `json:"message"`
}

type AgentLiveness struct {
	Status              AgentLivenessStatus `json:"status"`
	Reason              AgentLivenessReason `json:"reason"`
	Retryable           bool                `json:"retryable"`
	Cancellable         bool                `json:"cancellable"`
	Steerable           bool                `json:"steerable"`
	LastProviderEventAt *string             `json:"lastProviderEventAt"`
	LastReconciledAt    *string             `json:"lastReconciledAt"`
	Message             string              `json:"message"`
}

type ProviderLifecycle struct {
	Provider Provider                `json:"provider"`
	Status   ProviderLifecycleStatus `json:"status"`
	Message  string                  `json:"message"`
}

type TrajectoryUserInputAccepted struct {
	Input    AuthoredInput `json:"input"`
	Delivery TurnDelivery  `json:"delivery"`
}

type TrajectoryTurnQueued struct {
	QueueOrdinal int `json:"queueOrdinal"`
}

type TrajectoryTurnPromoted struct {
	FormerQueueOrdinal int `json:"formerQueueOrdinal"`
}

type TrajectoryTurnStarted struct {
	Invocation ResolvedInvocation `json:"invocation"`
}

type TrajectoryTurnSteered struct {
	Input AuthoredInput `json:"input"`
}

type TrajectoryTurnInterrupted struct {
	Reason TurnInterruptionReason `json:"reason"`
}

type TrajectoryTurnCompleted struct{}

type TrajectoryTurnFailed struct {
	Failure Failure `json:"failure"`
}

type TrajectoryAgentPublicTextDelta struct {
	ProviderItemID string `json:"providerItemId"`
	Delta          string `json:"delta"`
}

type TrajectoryAgentMessageCompleted struct {
	ProviderItemID string `json:"providerItemId"`
	Text           string `json:"text"`
}

type TrajectoryPublicReasoningSummaryUpdated struct {
	ProviderItemID string   `json:"providerItemId"`
	Summary        []string `json:"summary"`
}

type TrajectoryPlanChanged struct {
	Explanation *string    `json:"explanation"`
	Steps       []PlanStep `json:"steps"`
}

type TrajectoryActivityStarted struct {
	Activity TrajectoryActivity `json:"activity"`
}

type TrajectoryActivityProgressed struct {
	ActivityID string                      `json:"activityId"`
	Progress   string                      `json:"progress"`
	Output     *TrajectoryContentReference `json:"output"`
}

type TrajectoryActivityCompleted struct {
	Activity   TrajectoryActivity          `json:"activity"`
	Summary    string                      `json:"summary"`
	Output     *TrajectoryContentReference `json:"output"`
	DurationMs *int                        `json:"durationMs"`
	ExitCode   *int                        `json:"exitCode"`
}

type TrajectoryActivityFailed struct {
	Activity TrajectoryActivity          `json:"activity"`
	Failure  Failure                     `json:"failure"`
	Output   *TrajectoryContentReference `json:"output"`
}

type TrajectoryFileChangeProposed struct {
	ProviderItemID string       `json:"providerItemId"`
	Changes        []FileChange `json:"changes"`
}

type TrajectoryFileChangeCompleted struct {
	ProviderItemID string            `json:"providerItemId"`
	Changes        []FileChange      `json:"changes"`
	Outcome        FileChangeOutcome `json:"outcome"`
	Failure        *Failure          `json:"failure"`
}

type TrajectoryApprovalRequested struct {
	Approval TrajectoryApprovalRequest `json:"approval"`
}

type TrajectoryApprovalResolved struct {
	Resolution TrajectoryApprovalResolution `json:"resolution"`
}

type TrajectorySubagentStarted struct {
	Subagent Subagent `json:"subagent"`
}

type TrajectorySubagentUpdated struct {
	Subagent Subagent `json:"subagent"`
}

type TrajectorySubagentCompleted struct {
	Subagent Subagent `json:"subagent"`
}

type TrajectoryArtifactEmitted struct {
	ArtifactID string `json:"artifactId"`
}

type TrajectoryAgentLivenessChanged struct {
	Liveness AgentLiveness `json:"liveness"`
}

type TrajectoryProviderLifecycleChanged struct {
	Lifecycle ProviderLifecycle `json:"lifecycle"`
}

type TrajectoryModelRerouted struct {
	Reroute InvocationModelReroute `json:"reroute"`
}

type TrajectoryEvent struct {
	ID                            string                                   `json:"id"`
	ConversationID                string                                   `json:"conversationId"`
	TurnID                        *string                                  `json:"turnId"`
	Sequence                      int                                      `json:"sequence"`
	EmittedAt                     string                                   `json:"emittedAt"`
	Kind                          TrajectoryEventKind                      `json:"kind"`
	Actor                         TrajectoryActor                          `json:"actor"`
	ProviderEventID               *string                                  `json:"providerEventId"`
	ProviderThreadID              *string                                  `json:"providerThreadId"`
	ProviderTurnID                *string                                  `json:"providerTurnId"`
	UserInputAccepted             *TrajectoryUserInputAccepted             `json:"userInputAccepted"`
	TurnQueued                    *TrajectoryTurnQueued                    `json:"turnQueued"`
	TurnPromoted                  *TrajectoryTurnPromoted                  `json:"turnPromoted"`
	TurnStarted                   *TrajectoryTurnStarted                   `json:"turnStarted"`
	TurnSteered                   *TrajectoryTurnSteered                   `json:"turnSteered"`
	TurnInterrupted               *TrajectoryTurnInterrupted               `json:"turnInterrupted"`
	TurnCompleted                 *TrajectoryTurnCompleted                 `json:"turnCompleted"`
	TurnFailed                    *TrajectoryTurnFailed                    `json:"turnFailed"`
	AgentPublicTextDelta          *TrajectoryAgentPublicTextDelta          `json:"agentPublicTextDelta"`
	AgentMessageCompleted         *TrajectoryAgentMessageCompleted         `json:"agentMessageCompleted"`
	PublicReasoningSummaryUpdated *TrajectoryPublicReasoningSummaryUpdated `json:"publicReasoningSummaryUpdated"`
	PlanChanged                   *TrajectoryPlanChanged                   `json:"planChanged"`
	ActivityStarted               *TrajectoryActivityStarted               `json:"activityStarted"`
	ActivityProgressed            *TrajectoryActivityProgressed            `json:"activityProgressed"`
	ActivityCompleted             *TrajectoryActivityCompleted             `json:"activityCompleted"`
	ActivityFailed                *TrajectoryActivityFailed                `json:"activityFailed"`
	FileChangeProposed            *TrajectoryFileChangeProposed            `json:"fileChangeProposed"`
	FileChangeCompleted           *TrajectoryFileChangeCompleted           `json:"fileChangeCompleted"`
	ApprovalRequested             *TrajectoryApprovalRequested             `json:"approvalRequested"`
	ApprovalResolved              *TrajectoryApprovalResolved              `json:"approvalResolved"`
	SubagentStarted               *TrajectorySubagentStarted               `json:"subagentStarted"`
	SubagentUpdated               *TrajectorySubagentUpdated               `json:"subagentUpdated"`
	SubagentCompleted             *TrajectorySubagentCompleted             `json:"subagentCompleted"`
	ArtifactEmitted               *TrajectoryArtifactEmitted               `json:"artifactEmitted"`
	AgentLivenessChanged          *TrajectoryAgentLivenessChanged          `json:"agentLivenessChanged"`
	ProviderLifecycleChanged      *TrajectoryProviderLifecycleChanged      `json:"providerLifecycleChanged"`
	ModelRerouted                 *TrajectoryModelRerouted                 `json:"modelRerouted"`
}
