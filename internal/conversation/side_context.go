package conversation

import "fmt"

const SideInFlightContextFrameType = "side_in_flight_context_frame"

// SideInFlightContextFrame is the Setta-authoritative public state supplied to
// an ephemeral side thread at its fork boundary. The deliberately narrower
// child records exclude provider ids, private reasoning, raw tool output, and
// mutable parent controls.
type SideInFlightContextFrame struct {
	Type                     string                         `json:"type"`
	SourceTrajectorySequence int                            `json:"sourceTrajectorySequence"`
	CurrentObjective         *SideInFlightObjective         `json:"currentObjective"`
	AcceptedSteering         []NarratorAcceptedSteering     `json:"acceptedSteering"`
	CurrentPlan              *NarratorCurrentPlan           `json:"currentPlan"`
	ActiveActivities         []SideInFlightActivityMetadata `json:"activeActivities"`
	PendingApprovals         []SideInFlightApprovalState    `json:"pendingApprovals"`
	Artifacts                []SideInFlightArtifactMetadata `json:"artifacts"`
}

type SideInFlightObjective struct {
	Input    AuthoredInput `json:"input"`
	Delivery TurnDelivery  `json:"delivery"`
	Status   TurnStatus    `json:"status"`
}

type SideInFlightActivityMetadata struct {
	StartedAtSequence     int                         `json:"startedAtSequence"`
	LastUpdatedAtSequence int                         `json:"lastUpdatedAtSequence"`
	Kind                  TrajectoryActivityKind      `json:"kind"`
	Title                 string                      `json:"title"`
	Command               *string                     `json:"command"`
	CWD                   *string                     `json:"cwd"`
	Server                *string                     `json:"server"`
	Tool                  *string                     `json:"tool"`
	Namespace             *string                     `json:"namespace"`
	LatestProgress        string                      `json:"latestProgress"`
	LatestOutput          *TrajectoryContentReference `json:"latestOutput"`
}

type SideInFlightApprovalState struct {
	RequestedAtSequence        int                            `json:"requestedAtSequence"`
	Kind                       TrajectoryApprovalKind         `json:"kind"`
	Title                      string                         `json:"title"`
	Body                       string                         `json:"body"`
	Command                    *string                        `json:"command"`
	CWD                        *string                        `json:"cwd"`
	FilePaths                  []string                       `json:"filePaths"`
	RequestedPermissionProfile *string                        `json:"requestedPermissionProfile"`
	Questions                  []SideInFlightApprovalQuestion `json:"questions"`
	RequestedAt                string                         `json:"requestedAt"`
}

type SideInFlightApprovalQuestion struct {
	Header      string   `json:"header"`
	Question    string   `json:"question"`
	Options     []string `json:"options"`
	AllowsOther bool     `json:"allowsOther"`
	Secret      bool     `json:"secret"`
}

type SideInFlightArtifactMetadata struct {
	ID                 string `json:"id"`
	TrajectorySequence int    `json:"trajectorySequence"`
	Title              string `json:"title"`
	CreatedAt          string `json:"createdAt"`
}

func (frame SideInFlightContextFrame) Validate() error {
	if frame.Type != SideInFlightContextFrameType {
		return fmt.Errorf("side in-flight context frame has unsupported type %q", frame.Type)
	}
	if frame.SourceTrajectorySequence < 0 {
		return fmt.Errorf("side in-flight context source sequence must be non-negative")
	}
	if err := frame.validateCollections(); err != nil {
		return err
	}
	if frame.CurrentObjective == nil {
		return frame.validateNoObjectiveState()
	}
	if err := frame.CurrentObjective.Validate(); err != nil {
		return err
	}
	if err := frame.validateSteeringAndPlan(); err != nil {
		return err
	}
	return frame.validateTurnState()
}

func (frame SideInFlightContextFrame) validateCollections() error {
	collectionsPresent := []bool{
		frame.AcceptedSteering != nil,
		frame.ActiveActivities != nil,
		frame.PendingApprovals != nil,
		frame.Artifacts != nil,
	}
	for _, present := range collectionsPresent {
		if !present {
			return fmt.Errorf("side in-flight context collections must not be nil")
		}
	}
	return nil
}

func (frame SideInFlightContextFrame) validateNoObjectiveState() error {
	hasTurnState := []bool{
		len(frame.AcceptedSteering) != 0,
		frame.CurrentPlan != nil,
		len(frame.ActiveActivities) != 0,
		len(frame.PendingApprovals) != 0,
		len(frame.Artifacts) != 0,
	}
	for _, present := range hasTurnState {
		if present {
			return fmt.Errorf("side in-flight context without an objective contains turn state")
		}
	}
	return nil
}

func (frame SideInFlightContextFrame) validateTurnState() error {
	for index, activity := range frame.ActiveActivities {
		if err := activity.validate(frame.SourceTrajectorySequence); err != nil {
			return fmt.Errorf("side in-flight activity %d: %w", index, err)
		}
	}
	for index, approval := range frame.PendingApprovals {
		if err := approval.validate(frame.SourceTrajectorySequence); err != nil {
			return fmt.Errorf("side in-flight approval %d: %w", index, err)
		}
	}
	for index, artifact := range frame.Artifacts {
		if err := artifact.validate(frame.SourceTrajectorySequence); err != nil {
			return fmt.Errorf("side in-flight artifact %d: %w", index, err)
		}
	}
	return nil
}

func (objective SideInFlightObjective) Validate() error {
	if err := objective.Input.Validate(); err != nil {
		return err
	}
	if !validTurnDelivery(objective.Delivery) {
		return fmt.Errorf("side in-flight objective has unsupported delivery %q", objective.Delivery)
	}
	if !validTurnStatus(objective.Status) {
		return fmt.Errorf("side in-flight objective has unsupported status %q", objective.Status)
	}
	return nil
}

func (frame SideInFlightContextFrame) validateSteeringAndPlan() error {
	previousSequence := 0
	for _, steering := range frame.AcceptedSteering {
		if steering.Sequence <= previousSequence || steering.Sequence > frame.SourceTrajectorySequence {
			return fmt.Errorf("side in-flight steering sequence %d is out of order or beyond source", steering.Sequence)
		}
		if err := steering.Input.Validate(); err != nil {
			return err
		}
		previousSequence = steering.Sequence
	}
	if frame.CurrentPlan != nil {
		if frame.CurrentPlan.Sequence <= 0 || frame.CurrentPlan.Sequence > frame.SourceTrajectorySequence {
			return fmt.Errorf("side in-flight plan sequence %d is beyond source", frame.CurrentPlan.Sequence)
		}
		if err := frame.CurrentPlan.Plan.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func (activity SideInFlightActivityMetadata) validate(sourceSequence int) error {
	if activity.StartedAtSequence <= 0 ||
		activity.LastUpdatedAtSequence < activity.StartedAtSequence ||
		activity.LastUpdatedAtSequence > sourceSequence {
		return fmt.Errorf("activity has invalid source sequence coverage")
	}
	value := TrajectoryActivity{
		ID:        "side-context-activity",
		Kind:      activity.Kind,
		Title:     activity.Title,
		Command:   activity.Command,
		CWD:       activity.CWD,
		Server:    activity.Server,
		Tool:      activity.Tool,
		Namespace: activity.Namespace,
	}
	if err := value.Validate(); err != nil {
		return err
	}
	if activity.LatestOutput != nil {
		return activity.LatestOutput.Validate()
	}
	return nil
}

func (approval SideInFlightApprovalState) validate(sourceSequence int) error {
	if approval.RequestedAtSequence <= 0 || approval.RequestedAtSequence > sourceSequence {
		return fmt.Errorf("approval has invalid source sequence")
	}
	questions := make([]TrajectoryApprovalQuestion, 0, len(approval.Questions))
	for index, question := range approval.Questions {
		questions = append(questions, TrajectoryApprovalQuestion{
			ID:          fmt.Sprintf("side-context-question-%d", index),
			Header:      question.Header,
			Question:    question.Question,
			Options:     question.Options,
			AllowsOther: question.AllowsOther,
			Secret:      question.Secret,
		})
	}
	return (TrajectoryApprovalRequest{
		ID:                         "side-context-approval",
		ProviderItemID:             "side-context-provider-item",
		Kind:                       approval.Kind,
		Title:                      approval.Title,
		Body:                       approval.Body,
		Command:                    approval.Command,
		CWD:                        approval.CWD,
		FilePaths:                  approval.FilePaths,
		RequestedPermissionProfile: approval.RequestedPermissionProfile,
		Questions:                  questions,
		RequestedAt:                approval.RequestedAt,
	}).Validate()
}

func (artifact SideInFlightArtifactMetadata) validate(sourceSequence int) error {
	if artifact.TrajectorySequence <= 0 || artifact.TrajectorySequence > sourceSequence {
		return fmt.Errorf("artifact %s has invalid source sequence", artifact.ID)
	}
	// The frame carries artifact identity only, so identity is what gets
	// validated here — field by field, rather than by borrowing the full
	// metadata validator, which checks what a published artifact must have
	// rather than what this frame carries. Document acceptance already happened
	// before the artifact was published, and re-compiling stored source per side
	// frame would cost more than it proves.
	if err := validateIdentifier("side in-flight artifact id", artifact.ID); err != nil {
		return err
	}
	if err := validateRequiredArtifactText("side in-flight artifact title", artifact.Title); err != nil {
		return err
	}
	_, err := validateTimestamp("side in-flight artifact createdAt", artifact.CreatedAt)
	return err
}
