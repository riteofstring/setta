package conversation

import (
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"

	"setta/internal/conversation/artifactdoc"
)

type ConversationStatus string
type TurnDelivery string
type TurnStatus string

// ArtifactDocumentLanguage names the composition language a stored artifact
// document is written in. The model never chooses it; the backend attaches the
// only supported value after the document compiles.
type ArtifactDocumentLanguage string

// ArtifactCatalogID names the component catalog a stored artifact document was
// compiled against, so the renderer can select the catalog by exact identity.
type ArtifactCatalogID string

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

	ArtifactDocumentLanguageOpenUI ArtifactDocumentLanguage = ArtifactDocumentLanguage(artifactdoc.DocumentLanguageOpenUI)
	ArtifactCatalogSettaV1         ArtifactCatalogID        = ArtifactCatalogID(artifactdoc.CatalogSettaV1)
)

type TopicConversation struct {
	ID                     string             `json:"id"`
	WorkspaceID            *string            `json:"workspaceId"`
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

// ArtifactDocument is the single composable payload every artifact carries.
// Setta stores the source exactly as the compiler accepted it, so the renderer
// parses the same bytes the backend validated.
type ArtifactDocument struct {
	Language  ArtifactDocumentLanguage `json:"language"`
	CatalogID ArtifactCatalogID        `json:"catalogId"`
	Source    string                   `json:"source"`
}

type Artifact struct {
	ID                 string  `json:"id"`
	ConversationID     string  `json:"conversationId"`
	TurnID             *string `json:"turnId"`
	TrajectorySequence *int    `json:"trajectorySequence"`
	Title              string  `json:"title"`
	// Kind names the form of the document — Story, Report, Protocol — and is
	// shown above its title. It is the model's own word, displayed verbatim:
	// nothing in Setta branches on it, so it needs no closed set.
	Kind string `json:"kind"`
	// Summary is one line saying what this artifact is, in the author's own
	// words. It is the standfirst under the title and the line on the rail
	// card, and it exists because neither can be taken from the document: an
	// opening sentence is the start of the thing, not a claim about it.
	Summary   string           `json:"summary"`
	CreatedAt string           `json:"createdAt"`
	Document  ArtifactDocument `json:"document"`
}

type ArtifactMetadata struct {
	ID                 string  `json:"id"`
	ConversationID     string  `json:"conversationId"`
	TurnID             *string `json:"turnId"`
	TrajectorySequence *int    `json:"trajectorySequence"`
	Title              string  `json:"title"`
	Kind               string  `json:"kind"`
	Summary            string  `json:"summary"`
	CreatedAt          string  `json:"createdAt"`
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
	if conversation.WorkspaceID != nil {
		if err := validateIdentifier("conversation workspace id", *conversation.WorkspaceID); err != nil {
			return err
		}
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

// cloneIntPointer copies an optional integer so a snapshot never shares a
// pointer with the record it was projected from.
func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func (artifact Artifact) Metadata() ArtifactMetadata {
	return ArtifactMetadata{
		ID:                 artifact.ID,
		ConversationID:     artifact.ConversationID,
		TurnID:             cloneStringPointer(artifact.TurnID),
		TrajectorySequence: cloneIntPointer(artifact.TrajectorySequence),
		Title:              artifact.Title,
		Kind:               artifact.Kind,
		Summary:            artifact.Summary,
		CreatedAt:          artifact.CreatedAt,
	}
}

func (artifact Artifact) Validate() error {
	if err := artifact.Metadata().Validate(); err != nil {
		return err
	}
	return artifact.Document.Validate()
}

// Validate compiles the stored document against the only supported language and
// catalog. Compilation is the acceptance authority, so an artifact that cannot
// be rendered can never be written or read back.
func (document ArtifactDocument) Validate() error {
	if document.Language != ArtifactDocumentLanguageOpenUI {
		return fmt.Errorf("artifact document language %q is not supported", document.Language)
	}
	if document.CatalogID != ArtifactCatalogSettaV1 {
		return fmt.Errorf("artifact document catalog %q is not supported", document.CatalogID)
	}
	_, err := artifactdoc.Compile(artifactdoc.SettaCatalogV1(), document.Source)
	return err
}

func (artifact ArtifactMetadata) Validate() error {
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
	if err := validateRequiredArtifactText("artifact title", artifact.Title); err != nil {
		return err
	}
	// Kind and summary are as required as the title. They are what the rail card
	// and the document header say an artifact is, so an artifact that reaches
	// durable state without them is one the app cannot describe to the user.
	if err := validateRequiredArtifactText("artifact kind", artifact.Kind); err != nil {
		return err
	}
	if err := validateRequiredArtifactText("artifact summary", artifact.Summary); err != nil {
		return err
	}
	if _, err := validateTimestamp("artifact createdAt", artifact.CreatedAt); err != nil {
		return err
	}
	return nil
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

func equalOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
