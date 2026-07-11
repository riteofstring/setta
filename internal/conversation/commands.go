package conversation

import "fmt"

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
	switch response.Decision {
	case TrajectoryApprovalDecisionApproved,
		TrajectoryApprovalDecisionDenied,
		TrajectoryApprovalDecisionCancelled,
		TrajectoryApprovalDecisionAnswered:
	case TrajectoryApprovalDecisionApprovedForSession:
		return fmt.Errorf("conversation approvals do not support session-wide decisions")
	default:
		return fmt.Errorf("unsupported conversation approval decision %q", response.Decision)
	}
	if response.Answers == nil {
		return fmt.Errorf("conversation approval answers must be an array")
	}
	seen := map[string]bool{}
	for _, answer := range response.Answers {
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

func DefaultAgentRoleProfile() RoleProfile {
	modelID := "gpt-5.6-sol"
	return RoleProfile{
		Role:            RoleAgent,
		Provider:        ProviderCodex,
		ModelSelection:  ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID},
		ReasoningEffort: ReasoningEffortHigh,
		PermissionProfile: PermissionProfile{
			ApprovalPolicy:            ApprovalPolicyOnRequest,
			ProviderPermissionProfile: ":workspace",
			ToolAccess:                ToolAccessPolicy{Mode: ToolAccessAll, AllowedTools: []string{}},
			WorkspaceMutation:         true,
			Approvals:                 true,
		},
		ContextBudget: ContextBudget{
			MaxInputBytes:        256 * 1024,
			MaxInputTokens:       64 * 1024,
			ReservedOutputTokens: 8 * 1024,
		},
	}
}
