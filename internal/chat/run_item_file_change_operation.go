package chat

type RunItemFileChangeOperation string

const (
	RunItemFileChangeOperationAdd    RunItemFileChangeOperation = "add"
	RunItemFileChangeOperationDelete RunItemFileChangeOperation = "delete"
	RunItemFileChangeOperationUpdate RunItemFileChangeOperation = "update"
)

var runItemFileChangeOperationValues = []RunItemFileChangeOperation{
	RunItemFileChangeOperationAdd,
	RunItemFileChangeOperationDelete,
	RunItemFileChangeOperationUpdate,
}
