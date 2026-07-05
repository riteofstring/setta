package terminal

const (
	SchemaVersion      = 1
	DefaultProfileID   = "default"
	DefaultTerm        = "xterm-256color"
	DefaultColorTerm   = "truecolor"
	DefaultTermProgram = "setta"
)

type ProfileCWDMode string

const (
	ProfileCWDModeProject ProfileCWDMode = "project"
	ProfileCWDModeHome    ProfileCWDMode = "home"
	ProfileCWDModeCustom  ProfileCWDMode = "custom"
)

type ProfileLaunchMode string

const (
	ProfileLaunchModeShell         ProfileLaunchMode = "shell"
	ProfileLaunchModeCustomCommand ProfileLaunchMode = "custom-command"
)

type ThemeID string

const (
	ThemeSettaDark        ThemeID = "setta-dark"
	ThemeHighContrastDark ThemeID = "high-contrast-dark"
	ThemeSettaLight       ThemeID = "setta-light"
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
	TerminalEventOutput          TerminalEventType = "terminal.output"
	TerminalEventStarted         TerminalEventType = "terminal.started"
	TerminalEventExited          TerminalEventType = "terminal.exited"
	TerminalEventClosed          TerminalEventType = "terminal.closed"
	TerminalEventError           TerminalEventType = "terminal.error"
	TerminalEventBufferTruncated TerminalEventType = "terminal.bufferTruncated"
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

type TerminalProfile struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	LaunchMode    ProfileLaunchMode `json:"launchMode"`
	ShellPath     string            `json:"shellPath"`
	Args          []string          `json:"args"`
	CWDMode       ProfileCWDMode    `json:"cwdMode"`
	CWD           string            `json:"cwd"`
	Env           map[string]string `json:"env"`
	FontFamily    string            `json:"fontFamily"`
	FontSize      int               `json:"fontSize"`
	ThemeID       ThemeID           `json:"themeId"`
	Scrollback    int               `json:"scrollback"`
	SafeAutoStart bool              `json:"safeAutoStart"`
	CreatedAt     string            `json:"createdAt"`
	UpdatedAt     string            `json:"updatedAt"`
}

type TerminalProfileInput struct {
	Name       string            `json:"name"`
	LaunchMode ProfileLaunchMode `json:"launchMode"`
	ShellPath  string            `json:"shellPath"`
	Args       []string          `json:"args"`
	CWDMode    ProfileCWDMode    `json:"cwdMode"`
	CWD        string            `json:"cwd"`
	Env        map[string]string `json:"env"`
	FontFamily string            `json:"fontFamily"`
	FontSize   int               `json:"fontSize"`
	ThemeID    ThemeID           `json:"themeId"`
	Scrollback int               `json:"scrollback"`
}

type TerminalDetectedShell struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Path       string            `json:"path"`
	LaunchMode ProfileLaunchMode `json:"launchMode"`
}

type TerminalProfileList struct {
	DefaultProfileID string                  `json:"defaultProfileId"`
	Profiles         []TerminalProfile       `json:"profiles"`
	DetectedShells   []TerminalDetectedShell `json:"detectedShells"`
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
	DataBase64    string        `json:"dataBase64"`
	ByteCount     int           `json:"byteCount"`
	DroppedBytes  int           `json:"droppedBytes"`
	DroppedChunks int           `json:"droppedChunks"`
	Status        SessionStatus `json:"status"`
	CWD           string        `json:"cwd"`
	Cols          int           `json:"cols"`
	Rows          int           `json:"rows"`
	ExitCode      int           `json:"exitCode"`
	Message       string        `json:"message"`
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
			Name: "ProfileCWDMode",
			Values: []string{
				string(ProfileCWDModeProject),
				string(ProfileCWDModeHome),
				string(ProfileCWDModeCustom),
			},
		},
		{
			Name: "ProfileLaunchMode",
			Values: []string{
				string(ProfileLaunchModeShell),
				string(ProfileLaunchModeCustomCommand),
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
				string(TerminalEventBufferTruncated),
			},
		},
		{
			Name: "ThemeID",
			Values: []string{
				string(ThemeSettaDark),
				string(ThemeHighContrastDark),
				string(ThemeSettaLight),
			},
		},
	}
}
