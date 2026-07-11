package narration

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/agent"
	"setta/internal/conversation"
)

type CallKind string

const (
	CallKindWorking    CallKind = "working_projection"
	CallKindTerminal   CallKind = "terminal_projection"
	CallKindStatus     CallKind = "status_reply"
	CallKindCheckpoint CallKind = "checkpoint"
)

type ContextRange struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

type ProjectionContext struct {
	ConversationID            string                                  `json:"conversationId"`
	ConversationTitle         string                                  `json:"conversationTitle"`
	TopicDescriptor           string                                  `json:"topicDescriptor"`
	CurrentObjective          string                                  `json:"currentObjective"`
	AcceptedSteering          []string                                `json:"acceptedSteering"`
	HistoricalCheckpoint      string                                  `json:"historicalCheckpoint"`
	CheckpointThroughSequence int                                     `json:"checkpointThroughSequence"`
	ObservedThroughSequence   int                                     `json:"observedThroughSequence"`
	IncludedRange             ContextRange                            `json:"includedRange"`
	Events                    []conversation.TrajectoryEvent          `json:"events"`
	CurrentPlan               *conversation.TrajectoryPlanChanged     `json:"currentPlan"`
	ActiveActivities          []conversation.TrajectoryActivity       `json:"activeActivities"`
	ActiveSubagents           []conversation.Subagent                 `json:"activeSubagents"`
	PendingApproval           *conversation.TrajectoryApprovalRequest `json:"pendingApproval"`
	Artifacts                 []conversation.Artifact                 `json:"artifacts"`
	PriorCurrentFocus         string                                  `json:"priorCurrentFocus"`
	PriorMilestones           []string                                `json:"priorMilestones"`
	RecentFinalSummaries      []string                                `json:"recentFinalSummaries"`
	Trigger                   conversation.NarrationTrigger           `json:"trigger"`
}

type StatusContext struct {
	ConversationID        string                                  `json:"conversationId"`
	ConversationTitle     string                                  `json:"conversationTitle"`
	Question              string                                  `json:"question"`
	CurrentObjective      string                                  `json:"currentObjective"`
	AcceptedSteering      []string                                `json:"acceptedSteering"`
	CurrentPlan           *conversation.TrajectoryPlanChanged     `json:"currentPlan"`
	ActiveActivities      []conversation.TrajectoryActivity       `json:"activeActivities"`
	ActiveSubagents       []conversation.Subagent                 `json:"activeSubagents"`
	PendingApproval       *conversation.TrajectoryApprovalRequest `json:"pendingApproval"`
	Artifacts             []conversation.Artifact                 `json:"artifacts"`
	CurrentFocus          string                                  `json:"currentFocus"`
	LatestEvents          []conversation.TrajectoryEvent          `json:"latestEvents"`
	OmittedRange          *ContextRange                           `json:"omittedRange"`
	RecentSummaries       []string                                `json:"recentSummaries"`
	SourceThroughSequence int                                     `json:"sourceThroughSequence"`
}

type WorkingOutput struct {
	Type                    string   `json:"type"`
	ObservedThroughSequence int      `json:"observedThroughSequence"`
	CurrentFocus            string   `json:"currentFocus"`
	Milestones              []string `json:"milestones"`
	TopicDescriptor         *string  `json:"topicDescriptor"`
}

type TerminalOutput struct {
	Type                    string   `json:"type"`
	ObservedThroughSequence int      `json:"observedThroughSequence"`
	CurrentFocus            string   `json:"currentFocus"`
	Milestones              []string `json:"milestones"`
	FinalSummary            string   `json:"finalSummary"`
	TopicDescriptor         *string  `json:"topicDescriptor"`
}

type StatusOutput struct {
	Type                  string `json:"type"`
	SourceThroughSequence int    `json:"sourceThroughSequence"`
	StatusReply           string `json:"statusReply"`
}

type CheckpointOutput struct {
	CoveredThroughSequence int    `json:"coveredThroughSequence"`
	HistoricalSummary      string `json:"historicalSummary"`
}

type ModelCallRequest struct {
	CallID         string
	ConversationID string
	WorkspaceRoot  string
	Profile        conversation.RoleProfile
	Kind           CallKind
	Prompt         string
	OutputSchema   []byte
}

type ModelCallResult struct {
	Text               string
	ResolvedInvocation agent.ResolvedInvocation
	ProviderThreadID   string
	ProviderTurnID     string
}

type ModelCaller interface {
	Call(context.Context, ModelCallRequest) (ModelCallResult, error)
}

func validateProjectionText(label string, text string, max int) error {
	if strings.TrimSpace(text) == "" || strings.TrimSpace(text) != text {
		return fmt.Errorf("%s must be non-empty and trimmed", label)
	}
	if len(text) > max {
		return fmt.Errorf("%s exceeds %d bytes", label, max)
	}
	return nil
}

func validateMilestones(milestones []string, prior []string) error {
	if milestones == nil {
		return errors.New("narrator milestones must be an array")
	}
	if len(milestones) > 3 {
		return errors.New("narrator projection emits at most three milestones")
	}
	priorSet := map[string]bool{}
	for _, text := range prior {
		priorSet[text] = true
	}
	seen := map[string]bool{}
	for _, text := range milestones {
		if err := validateProjectionText("narrator milestone", text, 240); err != nil {
			return err
		}
		if priorSet[text] || seen[text] {
			return fmt.Errorf("duplicate narrator milestone %q", text)
		}
		seen[text] = true
	}
	return nil
}
