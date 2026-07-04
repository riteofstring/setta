package chat

import "encoding/json"

// Background terminal domain model.
//
// A background terminal is a provider process (Codex unified exec) whose
// lifecycle is independent from the chat run that started it: it can keep
// running after the assistant turn completes, fails, or is interrupted. Its
// state is backend-owned and stored under the conversation, separate from a
// run's transcript blocks, so run finalization never coerces it.

type BackgroundTerminalStatus string

const (
	BackgroundTerminalRunning     BackgroundTerminalStatus = "running"
	BackgroundTerminalTerminating BackgroundTerminalStatus = "terminating"
	BackgroundTerminalExited      BackgroundTerminalStatus = "exited"
	BackgroundTerminalLost        BackgroundTerminalStatus = "lost"
)

var backgroundTerminalStatusValues = []BackgroundTerminalStatus{
	BackgroundTerminalRunning,
	BackgroundTerminalTerminating,
	BackgroundTerminalExited,
	BackgroundTerminalLost,
}

// backgroundTerminalLostOnRestartReason explains why a persisted running or
// terminating terminal becomes lost on backend startup: Codex command/exec
// sessions are connection-scoped, so a restart cannot honestly claim the
// provider process is still controllable.
const backgroundTerminalLostOnRestartReason = "backend restarted; provider process handle is no longer attached"

// BackgroundTerminalProcess is the backend-owned record for one background
// terminal. ID is a stable Setta-generated identifier used as the storage key
// and the join key for output; ProcessID is the provider process handle needed
// for write, resize, and terminate operations.
type BackgroundTerminalProcess struct {
	SchemaVersion  int                      `json:"schemaVersion"`
	ID             string                   `json:"id"`
	WorkspaceID    string                   `json:"workspaceId"`
	ConversationID string                   `json:"conversationId"`
	ThreadID       string                   `json:"threadId"`
	StartedRunID   string                   `json:"startedRunId"`
	ProviderItemID string                   `json:"providerItemId"`
	ProcessID      string                   `json:"processId"`
	Source         RunItemCommandSource     `json:"source"`
	Status         BackgroundTerminalStatus `json:"status"`
	Command        string                   `json:"command"`
	Cwd            string                   `json:"cwd"`
	ExitCode       int                      `json:"exitCode"`
	Error          string                   `json:"error"`
	StartedAt      string                   `json:"startedAt"`
	UpdatedAt      string                   `json:"updatedAt"`
	CompletedAt    string                   `json:"completedAt"`
	RecentOutput   []string                 `json:"recentOutput"`
}

func (process BackgroundTerminalProcess) MarshalJSON() ([]byte, error) {
	type processAlias BackgroundTerminalProcess
	if process.RecentOutput == nil {
		process.RecentOutput = []string{}
	}
	return json.Marshal(processAlias(process))
}

// BackgroundTerminalOutput is one persisted output chunk for a background
// terminal. ProcessID is the stable BackgroundTerminalProcess.ID (the join
// key), not the provider process handle; output is paginated by that stable ID
// for the monitor surface.
type BackgroundTerminalOutput struct {
	SchemaVersion int    `json:"schemaVersion"`
	ID            string `json:"id"`
	ProcessID     string `json:"processId"`
	Stream        string `json:"stream"`
	Ordinal       int    `json:"ordinal"`
	Text          string `json:"text"`
	CreatedAt     string `json:"createdAt"`
}

// BackgroundTerminalOutputPage is one window of a terminal's output, ordered by
// ordinal, with a cursor for loading older chunks in the monitor surface.
type BackgroundTerminalOutputPage struct {
	ProcessID   string                     `json:"processId"`
	Output      []BackgroundTerminalOutput `json:"output"`
	HasMore     bool                       `json:"hasMore"`
	NextOrdinal int                        `json:"nextOrdinal"`
}

func (page BackgroundTerminalOutputPage) MarshalJSON() ([]byte, error) {
	type pageAlias BackgroundTerminalOutputPage
	if page.Output == nil {
		page.Output = []BackgroundTerminalOutput{}
	}
	return json.Marshal(pageAlias(page))
}

// BackgroundTerminalListProjection is the backend-owned monitor list projection
// used by the renderer footer and monitor surface.
type BackgroundTerminalListProjection struct {
	Terminals []BackgroundTerminalProcess `json:"terminals"`
}

func (projection BackgroundTerminalListProjection) MarshalJSON() ([]byte, error) {
	type projectionAlias BackgroundTerminalListProjection
	if projection.Terminals == nil {
		projection.Terminals = []BackgroundTerminalProcess{}
	}
	return json.Marshal(projectionAlias(projection))
}

// BackgroundTerminalTerminateRequest is the provider-bound control request for
// one registered background terminal. ProcessID is the stable Setta ID;
// ProviderProcessID is the Codex process handle.
type BackgroundTerminalTerminateRequest struct {
	WorkspaceID       string `json:"workspaceId"`
	ConversationID    string `json:"conversationId"`
	ProcessID         string `json:"processId"`
	ThreadID          string `json:"threadId"`
	ProviderProcessID string `json:"providerProcessId"`
}

type BackgroundTerminalTerminateResult struct {
	Terminated bool `json:"terminated"`
}

func backgroundTerminalStatusIsActive(status BackgroundTerminalStatus) bool {
	return status == BackgroundTerminalRunning || status == BackgroundTerminalTerminating
}

func backgroundTerminalStatusIsTerminal(status BackgroundTerminalStatus) bool {
	return status == BackgroundTerminalExited || status == BackgroundTerminalLost
}
