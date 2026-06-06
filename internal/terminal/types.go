package terminal

const (
	SchemaVersion      = 1
	DefaultProfileID   = "default"
	DefaultTerm        = "xterm-256color"
	DefaultColorTerm   = "truecolor"
	DefaultTermProgram = "setta"
)

type SessionStatus string

const (
	SessionStatusStarting SessionStatus = "starting"
	SessionStatusRunning  SessionStatus = "running"
	SessionStatusExited   SessionStatus = "exited"
	SessionStatusClosed   SessionStatus = "closed"
	SessionStatusError    SessionStatus = "error"
)

type CloseMode string

const (
	CloseModeTerminate CloseMode = "terminate"
	CloseModeKill      CloseMode = "kill"
)

type TerminalEventType string

const (
	TerminalEventOutput  TerminalEventType = "terminal.output"
	TerminalEventStarted TerminalEventType = "terminal.started"
	TerminalEventExited  TerminalEventType = "terminal.exited"
	TerminalEventClosed  TerminalEventType = "terminal.closed"
	TerminalEventError   TerminalEventType = "terminal.error"
)

type SessionSummary struct {
	ID          string        `json:"id"`
	WorkspaceID string        `json:"workspaceId"`
	PaneID      string        `json:"paneId"`
	ProfileID   string        `json:"profileId"`
	CWD         string        `json:"cwd"`
	Cols        int           `json:"cols"`
	Rows        int           `json:"rows"`
	Status      SessionStatus `json:"status"`
	CreatedAt   string        `json:"createdAt"`
	UpdatedAt   string        `json:"updatedAt"`
	ExitCode    int           `json:"exitCode"`
	Message     string        `json:"message"`
}

type TerminalEvent struct {
	SchemaVersion int                  `json:"schemaVersion"`
	StreamID      string               `json:"streamId"`
	Sequence      int                  `json:"sequence"`
	EventID       string               `json:"eventId"`
	Type          TerminalEventType    `json:"type"`
	EmittedAt     string               `json:"emittedAt"`
	WorkspaceID   string               `json:"workspaceId"`
	PaneID        string               `json:"paneId"`
	SessionID     string               `json:"sessionId"`
	Payload       TerminalEventPayload `json:"payload"`
}

type TerminalEventPayload struct {
	DataBase64 string        `json:"dataBase64"`
	ByteCount  int           `json:"byteCount"`
	Status     SessionStatus `json:"status"`
	CWD        string        `json:"cwd"`
	Cols       int           `json:"cols"`
	Rows       int           `json:"rows"`
	ExitCode   int           `json:"exitCode"`
	Message    string        `json:"message"`
}

type EventCursor struct {
	StreamID string
	Sequence int
}

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{
			Name: "SessionStatus",
			Values: []string{
				string(SessionStatusStarting),
				string(SessionStatusRunning),
				string(SessionStatusExited),
				string(SessionStatusClosed),
				string(SessionStatusError),
			},
		},
		{
			Name: "CloseMode",
			Values: []string{
				string(CloseModeTerminate),
				string(CloseModeKill),
			},
		},
		{
			Name: "TerminalEventType",
			Values: []string{
				string(TerminalEventOutput),
				string(TerminalEventStarted),
				string(TerminalEventExited),
				string(TerminalEventClosed),
				string(TerminalEventError),
			},
		},
	}
}
