package conversation

import (
	"fmt"
	"strings"

	"setta/internal/agent"
)

func conversationApproval(
	approval *agent.ApprovalRequest,
	workspaceRoot string,
	requestedAt string,
) (TrajectoryApprovalRequest, error) {
	if approval == nil {
		return TrajectoryApprovalRequest{}, fmt.Errorf("agent approval payload is required")
	}
	body := approval.Body
	if strings.TrimSpace(body) == "" {
		body = approval.Title
	}
	result := TrajectoryApprovalRequest{
		ID:             approval.ID,
		ProviderItemID: approval.ProviderItemID,
		Title:          approval.Title,
		Body:           body,
		FilePaths:      []string{},
		Questions:      []TrajectoryApprovalQuestion{},
		RequestedAt:    requestedAt,
	}
	if err := populateConversationApproval(&result, approval, workspaceRoot); err != nil {
		return TrajectoryApprovalRequest{}, err
	}
	if err := result.Validate(); err != nil {
		return TrajectoryApprovalRequest{}, err
	}
	return result, nil
}

func populateConversationApproval(
	result *TrajectoryApprovalRequest,
	approval *agent.ApprovalRequest,
	workspaceRoot string,
) error {
	switch approval.Kind {
	case agent.ApprovalKindCommand:
		populateCommandApproval(result, approval, workspaceRoot)
	case agent.ApprovalKindFileChange:
		populateFileChangeApproval(result, approval)
	case agent.ApprovalKindPermission:
		result.Kind = TrajectoryApprovalKindPermission
		result.RequestedPermissionProfile = stringPointerValue(approval.PermissionProfile)
	case agent.ApprovalKindUserInput:
		populateStructuredApproval(result, approval)
	case agent.ApprovalKindMCPElicitation:
		result.Kind = TrajectoryApprovalKindMCPElicitation
	default:
		return fmt.Errorf("unsupported agent approval kind %q", approval.Kind)
	}
	return nil
}

func populateCommandApproval(
	result *TrajectoryApprovalRequest,
	approval *agent.ApprovalRequest,
	workspaceRoot string,
) {
	result.Kind = TrajectoryApprovalKindCommand
	result.Command = stringPointerValue(approval.Command)
	cwd := approval.Path
	if strings.TrimSpace(cwd) == "" {
		cwd = workspaceRoot
	}
	result.CWD = &cwd
}

func populateFileChangeApproval(result *TrajectoryApprovalRequest, approval *agent.ApprovalRequest) {
	result.Kind = TrajectoryApprovalKindFileChange
	if strings.TrimSpace(approval.Path) != "" {
		result.FilePaths = []string{approval.Path}
	}
}

func populateStructuredApproval(result *TrajectoryApprovalRequest, approval *agent.ApprovalRequest) {
	result.Kind = TrajectoryApprovalKindStructuredInput
	for _, question := range approval.Questions {
		result.Questions = append(result.Questions, TrajectoryApprovalQuestion{
			ID:       question.ID,
			Header:   question.Header,
			Question: question.Question,
			Options:  append([]string{}, question.Options...),
			// Options help the user answer quickly; they must not turn a public
			// Worker question into a lossy closed enum. Secret questions stay
			// closed when the provider supplied explicit allowed values.
			AllowsOther: !question.Secret || len(question.Options) == 0,
			Secret:      question.Secret,
		})
	}
}

func stringPointerValue(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}
