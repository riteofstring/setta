package conversation

import (
	"fmt"
	"slices"
)

const (
	MaxConversationTitleBytes = 200
	MaxAuthoredInputBytes     = 256 * 1024
)

type ConversationApprovalAnswer struct {
	QuestionID string   `json:"questionId"`
	Answers    []string `json:"answers"`
}

type ConversationApprovalResponse struct {
	ApprovalID string                       `json:"approvalId"`
	Decision   TrajectoryApprovalDecision   `json:"decision"`
	Response   string                       `json:"response"`
	Answers    []ConversationApprovalAnswer `json:"answers"`
}

func (answer ConversationApprovalAnswer) Validate() error {
	if err := validateIdentifier("conversation approval question id", answer.QuestionID); err != nil {
		return err
	}
	if answer.Answers == nil {
		return fmt.Errorf("conversation approval answers must be an array")
	}
	if len(answer.Answers) == 0 {
		return fmt.Errorf("conversation approval answer %s must contain at least one value", answer.QuestionID)
	}
	for _, value := range answer.Answers {
		if err := validateTrimmedText("conversation approval answer", value); err != nil {
			return err
		}
	}
	return nil
}

func (response ConversationApprovalResponse) Validate() error {
	if err := validateIdentifier("conversation approval id", response.ApprovalID); err != nil {
		return err
	}
	return validateConversationApprovalDecisionFields(response)
}

func validateConversationApprovalDecisionFields(response ConversationApprovalResponse) error {
	if err := validateConversationApprovalDecision(response.Decision); err != nil {
		return err
	}
	if err := validateConversationApprovalAnswers(response.Answers); err != nil {
		return err
	}
	return validateConversationApprovalDecisionPayload(response)
}

// conversationApprovalDecisions is what an approval can be answered with here.
// A session-wide approval is deliberately absent: Setta answers one approval at
// a time, so anything offering that choice would be offering something the
// durable write refuses.
var conversationApprovalDecisions = []TrajectoryApprovalDecision{
	TrajectoryApprovalDecisionApproved,
	TrajectoryApprovalDecisionDenied,
	TrajectoryApprovalDecisionCancelled,
	TrajectoryApprovalDecisionAnswered,
}

// ConversationApprovalDecisions returns the answers an approval accepts, so a
// caller that offers the choice offers exactly the ones this package validates.
func ConversationApprovalDecisions() []TrajectoryApprovalDecision {
	return append([]TrajectoryApprovalDecision(nil), conversationApprovalDecisions...)
}

func validateConversationApprovalDecision(decision TrajectoryApprovalDecision) error {
	if slices.Contains(conversationApprovalDecisions, decision) {
		return nil
	}
	if decision == TrajectoryApprovalDecisionApprovedForSession {
		return fmt.Errorf("conversation approvals do not support session-wide decisions")
	}
	return fmt.Errorf("unsupported conversation approval decision %q", decision)
}

func validateConversationApprovalAnswers(answers []ConversationApprovalAnswer) error {
	if answers == nil {
		return fmt.Errorf("conversation approval answers must be an array")
	}
	seen := map[string]bool{}
	for _, answer := range answers {
		if err := answer.Validate(); err != nil {
			return err
		}
		if seen[answer.QuestionID] {
			return fmt.Errorf("conversation approval answer %q is duplicated", answer.QuestionID)
		}
		seen[answer.QuestionID] = true
	}
	return nil
}

func validateConversationApprovalDecisionPayload(response ConversationApprovalResponse) error {
	switch response.Decision {
	case TrajectoryApprovalDecisionAnswered:
		if len(response.Answers) == 0 {
			return fmt.Errorf("answered conversation approval requires structured answers")
		}
		if response.Response != "" {
			return fmt.Errorf("free-form conversation approval responses are not supported")
		}
	case TrajectoryApprovalDecisionApproved,
		TrajectoryApprovalDecisionDenied,
		TrajectoryApprovalDecisionCancelled:
		if len(response.Answers) != 0 {
			return fmt.Errorf("conversation approval decision %s must not include structured answers", response.Decision)
		}
		if response.Response != "" {
			return fmt.Errorf("conversation approval decision %s must not include a response", response.Decision)
		}
	}
	return nil
}
