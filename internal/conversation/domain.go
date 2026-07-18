package conversation

import (
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
	"time"
)

type ConversationStatus string
type TurnDelivery string
type TurnStatus string
type ThreadBindingStatus string
type ArtifactKind string

const (
	ConversationStatusIdle               ConversationStatus = "idle"
	ConversationStatusWorking            ConversationStatus = "working"
	ConversationStatusWaitingForApproval ConversationStatus = "waiting_for_approval"
	ConversationStatusFailed             ConversationStatus = "failed"

	TurnDeliveryNormal   TurnDelivery = "normal"
	TurnDeliveryQueued   TurnDelivery = "queued"
	TurnDeliverySteering TurnDelivery = "steering"

	TurnStatusQueued    TurnStatus = "queued"
	TurnStatusRunning   TurnStatus = "running"
	TurnStatusCompleted TurnStatus = "completed"
	TurnStatusCancelled TurnStatus = "cancelled"
	TurnStatusFailed    TurnStatus = "failed"

	ThreadBindingStatusLinked      ThreadBindingStatus = "linked"
	ThreadBindingStatusMissing     ThreadBindingStatus = "missing"
	ThreadBindingStatusUnavailable ThreadBindingStatus = "unavailable"

	ArtifactKindMarkdown ArtifactKind = "markdown"
	ArtifactKindTable    ArtifactKind = "table"
	ArtifactKindBarChart ArtifactKind = "bar_chart"
	ArtifactKindFile     ArtifactKind = "file"
)

type TopicConversation struct {
	ID                     string             `json:"id"`
	WorkspaceID            string             `json:"workspaceId"`
	Title                  string             `json:"title"`
	TopicDescriptor        string             `json:"topicDescriptor"`
	Status                 ConversationStatus `json:"status"`
	CreatedAt              string             `json:"createdAt"`
	UpdatedAt              string             `json:"updatedAt"`
	ArchivedAt             *string            `json:"archivedAt"`
	LastTrajectorySequence int                `json:"lastTrajectorySequence"`
}

type AuthoredInput struct {
	Text string `json:"text"`
}

type ConversationTurn struct {
	ID                   string              `json:"id"`
	ConversationID       string              `json:"conversationId"`
	AuthoredInput        AuthoredInput       `json:"authoredInput"`
	Delivery             TurnDelivery        `json:"delivery"`
	Status               TurnStatus          `json:"status"`
	AcceptedAt           string              `json:"acceptedAt"`
	StartedAt            *string             `json:"startedAt"`
	EndedAt              *string             `json:"endedAt"`
	RequestedRoleProfile RoleProfile         `json:"requestedRoleProfile"`
	ResolvedInvocation   *ResolvedInvocation `json:"resolvedInvocation"`
	ProviderTurnID       *string             `json:"providerTurnId"`
	Error                *Failure            `json:"error"`
}

type QueuedConversationTurn struct {
	TurnID         string `json:"turnId"`
	ConversationID string `json:"conversationId"`
	Ordinal        int    `json:"ordinal"`
	QueuedAt       string `json:"queuedAt"`
}

type AgentThreadBinding struct {
	ConversationID   string              `json:"conversationId"`
	Provider         Provider            `json:"provider"`
	ThreadID         string              `json:"threadId"`
	Status           ThreadBindingStatus `json:"status"`
	CreatedAt        string              `json:"createdAt"`
	LastResumedAt    *string             `json:"lastResumedAt"`
	LastTurnID       *string             `json:"lastTurnId"`
	ProviderMetadata map[string]string   `json:"providerMetadata"`
}

type Artifact struct {
	ID                 string                   `json:"id"`
	ConversationID     string                   `json:"conversationId"`
	TurnID             *string                  `json:"turnId"`
	TrajectorySequence *int                     `json:"trajectorySequence"`
	Kind               ArtifactKind             `json:"kind"`
	Title              string                   `json:"title"`
	CreatedAt          string                   `json:"createdAt"`
	Markdown           *MarkdownArtifactPayload `json:"markdown"`
	Table              *TableArtifactPayload    `json:"table"`
	BarChart           *BarChartArtifactPayload `json:"barChart"`
	File               *FileArtifactPayload     `json:"file"`
}

type MarkdownArtifactPayload struct {
	Markdown string `json:"markdown"`
}

type TableArtifactPayload struct {
	Columns []ArtifactTableColumn `json:"columns"`
	Rows    [][]string            `json:"rows"`
}

type ArtifactTableColumn struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type BarChartArtifactPayload struct {
	Items []BarChartArtifactItem `json:"items"`
}

type BarChartArtifactItem struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
	Unit  *string `json:"unit"`
}

type FileArtifactPayload struct {
	Path        string  `json:"path"`
	Description *string `json:"description"`
}

type Failure struct {
	Code                string `json:"code"`
	Message             string `json:"message"`
	Retryable           bool   `json:"retryable"`
	DiagnosticReference string `json:"diagnosticReference"`
}

func (conversation TopicConversation) Validate() error {
	if err := validateIdentifier("conversation id", conversation.ID); err != nil {
		return err
	}
	if err := validateIdentifier("conversation workspace id", conversation.WorkspaceID); err != nil {
		return err
	}
	if err := validateTrimmedText("conversation title", conversation.Title); err != nil {
		return err
	}
	if !validConversationStatus(conversation.Status) {
		return fmt.Errorf("conversation %s has unsupported status %q", conversation.ID, conversation.Status)
	}
	if conversation.LastTrajectorySequence < 0 {
		return fmt.Errorf("conversation %s last trajectory sequence must be non-negative", conversation.ID)
	}
	return validateConversationTimeline(conversation)
}

func validateConversationTimeline(conversation TopicConversation) error {
	createdAt, err := validateTimestamp("conversation createdAt", conversation.CreatedAt)
	if err != nil {
		return err
	}
	updatedAt, err := validateTimestamp("conversation updatedAt", conversation.UpdatedAt)
	if err != nil {
		return err
	}
	if updatedAt.Before(createdAt) {
		return fmt.Errorf("conversation %s updatedAt precedes createdAt", conversation.ID)
	}
	if conversation.ArchivedAt != nil {
		archivedAt, err := validateTimestampPointer("conversation archivedAt", conversation.ArchivedAt)
		if err != nil {
			return err
		}
		if archivedAt.Before(createdAt) {
			return fmt.Errorf("conversation %s archivedAt precedes createdAt", conversation.ID)
		}
		if conversation.Status == ConversationStatusWorking || conversation.Status == ConversationStatusWaitingForApproval {
			return fmt.Errorf("conversation %s cannot be archived with status %s", conversation.ID, conversation.Status)
		}
	}
	return nil
}

func (input AuthoredInput) Validate() error {
	return validateTrimmedText("authored input text", input.Text)
}

func (turn ConversationTurn) Validate() error {
	if err := validateTurnIdentityAndRequest(turn); err != nil {
		return err
	}
	timeline, err := validateTurnTimeline(turn)
	if err != nil {
		return err
	}
	if err := validateTurnInvocation(turn); err != nil {
		return err
	}
	return validateTurnLifecycle(turn, timeline)
}

func validateTurnIdentityAndRequest(turn ConversationTurn) error {
	if err := validateIdentifier("turn id", turn.ID); err != nil {
		return err
	}
	if err := validateIdentifier("turn conversation id", turn.ConversationID); err != nil {
		return err
	}
	if err := turn.AuthoredInput.Validate(); err != nil {
		return fmt.Errorf("turn %s: %w", turn.ID, err)
	}
	if !validTurnDelivery(turn.Delivery) {
		return fmt.Errorf("turn %s has unsupported delivery %q", turn.ID, turn.Delivery)
	}
	if !validTurnStatus(turn.Status) {
		return fmt.Errorf("turn %s has unsupported status %q", turn.ID, turn.Status)
	}
	if err := turn.RequestedRoleProfile.Validate(); err != nil {
		return fmt.Errorf("turn %s requested role profile: %w", turn.ID, err)
	}
	if turn.RequestedRoleProfile.Role != RoleAgent {
		return fmt.Errorf("turn %s requested role must be %s, got %s", turn.ID, RoleAgent, turn.RequestedRoleProfile.Role)
	}
	return nil
}

type turnTimeline struct {
	hasStarted bool
	hasEnded   bool
}

func validateTurnTimeline(turn ConversationTurn) (turnTimeline, error) {
	acceptedAt, err := validateTimestamp("turn acceptedAt", turn.AcceptedAt)
	if err != nil {
		return turnTimeline{}, err
	}
	startedAt, hasStarted, err := optionalTimestamp("turn startedAt", turn.StartedAt)
	if err != nil {
		return turnTimeline{}, err
	}
	endedAt, hasEnded, err := optionalTimestamp("turn endedAt", turn.EndedAt)
	if err != nil {
		return turnTimeline{}, err
	}
	if hasStarted && startedAt.Before(acceptedAt) {
		return turnTimeline{}, fmt.Errorf("turn %s startedAt precedes acceptedAt", turn.ID)
	}
	if hasEnded && endedAt.Before(acceptedAt) {
		return turnTimeline{}, fmt.Errorf("turn %s endedAt precedes acceptedAt", turn.ID)
	}
	if hasStarted && hasEnded && endedAt.Before(startedAt) {
		return turnTimeline{}, fmt.Errorf("turn %s endedAt precedes startedAt", turn.ID)
	}
	return turnTimeline{hasStarted: hasStarted, hasEnded: hasEnded}, nil
}

func validateTurnInvocation(turn ConversationTurn) error {
	if err := validateResolvedTurnInvocation(turn); err != nil {
		return err
	}
	if err := validateTurnProviderReference(turn); err != nil {
		return err
	}
	return validateTurnFailure(turn)
}

func validateResolvedTurnInvocation(turn ConversationTurn) error {
	if turn.ResolvedInvocation == nil {
		return nil
	}
	if err := turn.ResolvedInvocation.Validate(); err != nil {
		return fmt.Errorf("turn %s resolved invocation: %w", turn.ID, err)
	}
	if turn.ResolvedInvocation.Role != RoleAgent {
		return fmt.Errorf("turn %s resolved invocation role must be %s", turn.ID, RoleAgent)
	}
	if !reflect.DeepEqual(turn.ResolvedInvocation.Requested, turn.RequestedRoleProfile) {
		return fmt.Errorf("turn %s resolved invocation requested profile does not match the accepted turn profile", turn.ID)
	}
	return nil
}

func validateTurnProviderReference(turn ConversationTurn) error {
	if err := validateOptionalIdentifier("turn provider turn id", turn.ProviderTurnID); err != nil {
		return err
	}
	if turn.ResolvedInvocation == nil && turn.ProviderTurnID != nil {
		return fmt.Errorf("turn %s cannot have a provider turn without a resolved invocation", turn.ID)
	}
	if turn.ResolvedInvocation != nil && !equalOptionalString(turn.ProviderTurnID, turn.ResolvedInvocation.ProviderReferences.TurnID) {
		return fmt.Errorf("turn %s provider turn id does not match the resolved invocation", turn.ID)
	}
	return nil
}

func validateTurnFailure(turn ConversationTurn) error {
	if turn.Error != nil {
		if err := turn.Error.Validate(); err != nil {
			return fmt.Errorf("turn %s failure: %w", turn.ID, err)
		}
	}
	return nil
}

func validateTurnLifecycle(turn ConversationTurn, timeline turnTimeline) error {
	switch turn.Status {
	case TurnStatusQueued:
		return validateQueuedTurnLifecycle(turn, timeline)
	case TurnStatusRunning:
		return validateRunningTurnLifecycle(turn, timeline)
	case TurnStatusCompleted:
		return validateCompletedTurnLifecycle(turn, timeline)
	case TurnStatusFailed:
		return validateFailedTurnLifecycle(turn, timeline)
	case TurnStatusCancelled:
		return validateCancelledTurnLifecycle(turn, timeline)
	default:
		return fmt.Errorf("turn %s has unsupported lifecycle status %q", turn.ID, turn.Status)
	}
}

func validateQueuedTurnLifecycle(turn ConversationTurn, timeline turnTimeline) error {
	if timeline.hasStarted || timeline.hasEnded || turn.ResolvedInvocation != nil || turn.ProviderTurnID != nil || turn.Error != nil {
		return fmt.Errorf("queued turn %s contains started or terminal state", turn.ID)
	}
	return nil
}

func validateRunningTurnLifecycle(turn ConversationTurn, timeline turnTimeline) error {
	if !timeline.hasStarted || timeline.hasEnded || turn.ResolvedInvocation == nil || turn.ProviderTurnID == nil || turn.Error != nil {
		return fmt.Errorf("running turn %s must have start, invocation, and provider turn without terminal state", turn.ID)
	}
	if turn.ResolvedInvocation.Outcome != InvocationOutcomeRunning {
		return fmt.Errorf("running turn %s requires a running invocation, got %s", turn.ID, turn.ResolvedInvocation.Outcome)
	}
	return nil
}

func validateCompletedTurnLifecycle(turn ConversationTurn, timeline turnTimeline) error {
	if !timeline.hasStarted || !timeline.hasEnded || turn.ResolvedInvocation == nil || turn.ProviderTurnID == nil || turn.Error != nil {
		return fmt.Errorf("completed turn %s has incomplete or conflicting terminal state", turn.ID)
	}
	if turn.ResolvedInvocation.Outcome != InvocationOutcomeSucceeded {
		return fmt.Errorf("completed turn %s requires a succeeded invocation, got %s", turn.ID, turn.ResolvedInvocation.Outcome)
	}
	return nil
}

func validateFailedTurnLifecycle(turn ConversationTurn, timeline turnTimeline) error {
	if !timeline.hasEnded || turn.Error == nil {
		return fmt.Errorf("failed turn %s must have end time and failure", turn.ID)
	}
	if err := validateOptionalTerminalTurnInvocation(turn, timeline, InvocationOutcomeFailed); err != nil {
		return err
	}
	return nil
}

func validateCancelledTurnLifecycle(turn ConversationTurn, timeline turnTimeline) error {
	if !timeline.hasEnded || turn.Error != nil {
		return fmt.Errorf("cancelled turn %s must have end time and no failure", turn.ID)
	}
	if err := validateOptionalTerminalTurnInvocation(turn, timeline, InvocationOutcomeCancelled); err != nil {
		return err
	}
	return nil
}

func validateOptionalTerminalTurnInvocation(turn ConversationTurn, timeline turnTimeline, expected InvocationOutcome) error {
	if timeline.hasStarted != (turn.ResolvedInvocation != nil) {
		return fmt.Errorf("%s turn %s start and resolved invocation must either both be present or both be absent", turn.Status, turn.ID)
	}
	if turn.ResolvedInvocation != nil && turn.ResolvedInvocation.Outcome != expected {
		return fmt.Errorf("%s turn %s requires a %s invocation, got %s", turn.Status, turn.ID, expected, turn.ResolvedInvocation.Outcome)
	}
	return nil
}

func (queued QueuedConversationTurn) Validate() error {
	if err := validateIdentifier("queued turn id", queued.TurnID); err != nil {
		return err
	}
	if err := validateIdentifier("queued conversation id", queued.ConversationID); err != nil {
		return err
	}
	if queued.Ordinal <= 0 {
		return fmt.Errorf("queued turn %s ordinal must be positive", queued.TurnID)
	}
	_, err := validateTimestamp("queued turn queuedAt", queued.QueuedAt)
	return err
}

func (binding AgentThreadBinding) Validate() error {
	if err := validateIdentifier("thread binding conversation id", binding.ConversationID); err != nil {
		return err
	}
	if binding.Provider != ProviderCodex {
		return fmt.Errorf("thread binding %s has unsupported provider %q", binding.ConversationID, binding.Provider)
	}
	if err := validateIdentifier("thread binding thread id", binding.ThreadID); err != nil {
		return err
	}
	if !validThreadBindingStatus(binding.Status) {
		return fmt.Errorf("thread binding %s has unsupported status %q", binding.ConversationID, binding.Status)
	}
	createdAt, err := validateTimestamp("thread binding createdAt", binding.CreatedAt)
	if err != nil {
		return err
	}
	if binding.LastResumedAt != nil {
		lastResumedAt, err := validateTimestampPointer("thread binding lastResumedAt", binding.LastResumedAt)
		if err != nil {
			return err
		}
		if lastResumedAt.Before(createdAt) {
			return fmt.Errorf("thread binding %s lastResumedAt precedes createdAt", binding.ConversationID)
		}
	}
	if err := validateOptionalIdentifier("thread binding last turn id", binding.LastTurnID); err != nil {
		return err
	}
	return validateStringMap("thread binding provider metadata", binding.ProviderMetadata)
}

func (artifact Artifact) Validate() error {
	if err := validateIdentifier("artifact id", artifact.ID); err != nil {
		return err
	}
	if err := validateIdentifier("artifact conversation id", artifact.ConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("artifact turn id", artifact.TurnID); err != nil {
		return err
	}
	if artifact.TrajectorySequence != nil && *artifact.TrajectorySequence <= 0 {
		return fmt.Errorf("artifact %s trajectory sequence must be positive", artifact.ID)
	}
	if !validArtifactKind(artifact.Kind) {
		return fmt.Errorf("artifact %s has unsupported kind %q", artifact.ID, artifact.Kind)
	}
	if err := validateRequiredArtifactText("artifact title", artifact.Title); err != nil {
		return err
	}
	if _, err := validateTimestamp("artifact createdAt", artifact.CreatedAt); err != nil {
		return err
	}
	if err := validateArtifactBranchCount(artifact); err != nil {
		return err
	}
	return validateArtifactPayload(artifact)
}

func (failure Failure) Validate() error {
	if err := validateIdentifier("failure code", failure.Code); err != nil {
		return err
	}
	return validateTrimmedText("failure message", failure.Message)
}

func validConversationStatus(status ConversationStatus) bool {
	switch status {
	case ConversationStatusIdle, ConversationStatusWorking, ConversationStatusWaitingForApproval, ConversationStatusFailed:
		return true
	default:
		return false
	}
}

func validTurnDelivery(delivery TurnDelivery) bool {
	switch delivery {
	case TurnDeliveryNormal, TurnDeliveryQueued, TurnDeliverySteering:
		return true
	default:
		return false
	}
}

func validTurnStatus(status TurnStatus) bool {
	switch status {
	case TurnStatusQueued, TurnStatusRunning, TurnStatusCompleted, TurnStatusCancelled, TurnStatusFailed:
		return true
	default:
		return false
	}
}

func validThreadBindingStatus(status ThreadBindingStatus) bool {
	switch status {
	case ThreadBindingStatusLinked, ThreadBindingStatusMissing, ThreadBindingStatusUnavailable:
		return true
	default:
		return false
	}
}

func validArtifactKind(kind ArtifactKind) bool {
	switch kind {
	case ArtifactKindMarkdown, ArtifactKindTable, ArtifactKindBarChart, ArtifactKindFile:
		return true
	default:
		return false
	}
}

func validateArtifactBranchCount(artifact Artifact) error {
	populated := 0
	for _, present := range []bool{
		artifact.Markdown != nil,
		artifact.Table != nil,
		artifact.BarChart != nil,
		artifact.File != nil,
	} {
		if present {
			populated++
		}
	}
	if populated != 1 {
		return fmt.Errorf("artifact %s must populate exactly one payload branch, found %d", artifact.ID, populated)
	}
	return nil
}

func validateArtifactPayload(artifact Artifact) error {
	switch artifact.Kind {
	case ArtifactKindMarkdown:
		if artifact.Markdown == nil {
			return fmt.Errorf("artifact %s markdown payload is required", artifact.ID)
		}
		return validateMarkdownArtifactPayload(*artifact.Markdown)
	case ArtifactKindTable:
		if artifact.Table == nil {
			return fmt.Errorf("artifact %s table payload is required", artifact.ID)
		}
		return validateTableArtifactPayload(*artifact.Table)
	case ArtifactKindBarChart:
		if artifact.BarChart == nil {
			return fmt.Errorf("artifact %s bar chart payload is required", artifact.ID)
		}
		return validateBarChartArtifactPayload(*artifact.BarChart)
	case ArtifactKindFile:
		if artifact.File == nil {
			return fmt.Errorf("artifact %s file payload is required", artifact.ID)
		}
		return validateFileArtifactPayload(*artifact.File)
	default:
		return fmt.Errorf("artifact %s has unsupported kind %q", artifact.ID, artifact.Kind)
	}
}

func validateMarkdownArtifactPayload(payload MarkdownArtifactPayload) error {
	if err := validateRequiredArtifactText("markdown artifact markdown", payload.Markdown); err != nil {
		return err
	}
	if len([]byte(payload.Markdown)) > MaxMarkdownArtifactBytes {
		return fmt.Errorf("markdown artifact exceeds %d bytes", MaxMarkdownArtifactBytes)
	}
	return nil
}

func validateTableArtifactPayload(payload TableArtifactPayload) error {
	if len(payload.Columns) == 0 {
		return errors.New("table artifact requires at least one column")
	}
	if len(payload.Columns) > MaxTableArtifactColumns {
		return fmt.Errorf("table artifact has %d columns, cap is %d", len(payload.Columns), MaxTableArtifactColumns)
	}
	if len(payload.Rows) > MaxTableArtifactRows {
		return fmt.Errorf("table artifact has %d rows, cap is %d", len(payload.Rows), MaxTableArtifactRows)
	}
	keys := map[string]struct{}{}
	for index, column := range payload.Columns {
		if err := validateRequiredArtifactText(fmt.Sprintf("table artifact column[%d].key", index), column.Key); err != nil {
			return err
		}
		if err := validateRequiredArtifactText(fmt.Sprintf("table artifact column[%d].label", index), column.Label); err != nil {
			return err
		}
		if _, exists := keys[column.Key]; exists {
			return fmt.Errorf("table artifact duplicate column key %s", column.Key)
		}
		keys[column.Key] = struct{}{}
	}
	for index, row := range payload.Rows {
		if len(row) != len(payload.Columns) {
			return fmt.Errorf("table artifact row[%d] has %d cells, want %d", index, len(row), len(payload.Columns))
		}
	}
	return nil
}

func validateBarChartArtifactPayload(payload BarChartArtifactPayload) error {
	if len(payload.Items) == 0 {
		return errors.New("bar chart artifact requires at least one item")
	}
	if len(payload.Items) > MaxBarChartArtifactItems {
		return fmt.Errorf("bar chart artifact has %d items, cap is %d", len(payload.Items), MaxBarChartArtifactItems)
	}
	for index, item := range payload.Items {
		if err := validateRequiredArtifactText(fmt.Sprintf("bar chart artifact item[%d].label", index), item.Label); err != nil {
			return err
		}
		if math.IsNaN(item.Value) || math.IsInf(item.Value, 0) {
			return fmt.Errorf("bar chart artifact item[%d].value must be finite", index)
		}
		if item.Value < 0 {
			return fmt.Errorf("bar chart artifact item[%d].value must be non-negative", index)
		}
		if err := validateOptionalTrimmedText(fmt.Sprintf("bar chart artifact item[%d].unit", index), item.Unit); err != nil {
			return err
		}
	}
	return nil
}

func validateFileArtifactPayload(payload FileArtifactPayload) error {
	if err := validateRequiredArtifactText("file artifact path", payload.Path); err != nil {
		return err
	}
	return validateOptionalTrimmedText("file artifact description", payload.Description)
}

func validateIdentifier(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	return nil
}

func validateOptionalIdentifier(label string, value *string) error {
	if value == nil {
		return nil
	}
	return validateIdentifier(label, *value)
}

func validateTrimmedText(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	return nil
}

func validateRequiredArtifactText(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	return nil
}

func validateOptionalTrimmedText(label string, value *string) error {
	if value == nil {
		return nil
	}
	if strings.TrimSpace(*value) == "" {
		return fmt.Errorf("%s must not be empty", label)
	}
	if strings.TrimSpace(*value) != *value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	return nil
}

func validateTimestamp(label string, value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, fmt.Errorf("%s is required", label)
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be RFC3339: %w", label, err)
	}
	_, offset := parsed.Zone()
	if offset != 0 || parsed.UTC().Format(time.RFC3339Nano) != value {
		return time.Time{}, fmt.Errorf("%s must be a canonical UTC RFC3339 timestamp", label)
	}
	return parsed, nil
}

func validateTimestampPointer(label string, value *string) (time.Time, error) {
	if value == nil {
		return time.Time{}, errors.New(label + " is required")
	}
	return validateTimestamp(label, *value)
}

func optionalTimestamp(label string, value *string) (time.Time, bool, error) {
	if value == nil {
		return time.Time{}, false, nil
	}
	parsed, err := validateTimestamp(label, *value)
	return parsed, true, err
}

func validateStringMap(label string, values map[string]string) error {
	if values == nil {
		return fmt.Errorf("%s must be an object, not null", label)
	}
	for key := range values {
		if err := validateIdentifier(label+" key", key); err != nil {
			return err
		}
	}
	return nil
}

func equalOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
