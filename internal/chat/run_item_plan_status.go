package chat

type RunItemPlanStepStatus string

const (
	RunItemPlanStepStatusPending    RunItemPlanStepStatus = "pending"
	RunItemPlanStepStatusInProgress RunItemPlanStepStatus = "inProgress"
	RunItemPlanStepStatusCompleted  RunItemPlanStepStatus = "completed"
)

var runItemPlanStepStatusValues = []RunItemPlanStepStatus{
	RunItemPlanStepStatusPending,
	RunItemPlanStepStatusInProgress,
	RunItemPlanStepStatusCompleted,
}
