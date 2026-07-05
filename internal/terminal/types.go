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

type TerminalCloseSafety string

const (
	TerminalCloseSafetySafe        TerminalCloseSafety = "safe"
	TerminalCloseSafetyDestructive TerminalCloseSafety = "destructive"
	TerminalCloseSafetyUnknown     TerminalCloseSafety = "unknown"
)

type TerminalCloseAssessmentReason string

const (
	TerminalCloseAssessmentNoSession         TerminalCloseAssessmentReason = "no_session"
	TerminalCloseAssessmentAlreadyClosed     TerminalCloseAssessmentReason = "already_closed"
	TerminalCloseAssessmentIdleShell         TerminalCloseAssessmentReason = "idle_shell"
	TerminalCloseAssessmentForegroundProcess TerminalCloseAssessmentReason = "foreground_process"
	TerminalCloseAssessmentBackgroundJobs    TerminalCloseAssessmentReason = "background_jobs"
	TerminalCloseAssessmentInspectionFailed  TerminalCloseAssessmentReason = "inspection_failed"
)

type TerminalCloseResultKind string

const (
	TerminalCloseResultClosed               TerminalCloseResultKind = "closed"
	TerminalCloseResultConfirmationRequired TerminalCloseResultKind = "confirmation_required"
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

type TerminalCloseAssessment struct {
	Safety               TerminalCloseSafety           `json:"safety"`
	Reason               TerminalCloseAssessmentReason `json:"reason"`
	RequiresConfirmation bool                          `json:"requiresConfirmation"`
	Summary              string                        `json:"summary"`
}

type TerminalCloseResult struct {
	Kind       TerminalCloseResultKind `json:"kind"`
	Session    *SessionSummary         `json:"session"`
	Assessment TerminalCloseAssessment `json:"assessment"`
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

type TerminalReadResult struct {
	WorkspaceID  string                   `json:"workspaceId"`
	PaneID       string                   `json:"paneId"`
	SessionID    string                   `json:"sessionId"`
	Session      SessionSummary           `json:"session"`
	Screen       TerminalScreenSnapshot   `json:"screen"`
	RecentOutput TerminalRecentOutputPage `json:"recentOutput"`
}

type TerminalWritePrepareInput struct {
	WorkspaceID     string `json:"workspaceId"`
	PaneID          string `json:"paneId"`
	DeviceSessionID string `json:"deviceSessionId"`
	DataBase64      string `json:"dataBase64"`
	ByteCount       int    `json:"byteCount"`
	SHA256          string `json:"sha256"`
}

type TerminalPreparedWrite struct {
	PreparedWriteID string `json:"preparedWriteId"`
	WorkspaceID     string `json:"workspaceId"`
	PaneID          string `json:"paneId"`
	SessionID       string `json:"sessionId"`
	DeviceSessionID string `json:"deviceSessionId"`
	ByteCount       int    `json:"byteCount"`
	SHA256          string `json:"sha256"`
	Preview         string `json:"preview"`
	CreatedAt       string `json:"createdAt"`
	ExpiresAt       string `json:"expiresAt"`
}

type TerminalWriteCommitInput struct {
	PreparedWriteID string `json:"preparedWriteId"`
	DeviceSessionID string `json:"deviceSessionId"`
	SHA256          string `json:"sha256"`
}

type TerminalWriteCommitResult struct {
	PreparedWriteID  string `json:"preparedWriteId"`
	WorkspaceID      string `json:"workspaceId"`
	PaneID           string `json:"paneId"`
	SessionID        string `json:"sessionId"`
	DeviceSessionID  string `json:"deviceSessionId"`
	ByteCount        int    `json:"byteCount"`
	SHA256           string `json:"sha256"`
	WrittenByteCount int    `json:"writtenByteCount"`
}

type TerminalScreenSnapshot struct {
	Cols                     int                    `json:"cols"`
	Rows                     int                    `json:"rows"`
	Cursor                   TerminalCursorPosition `json:"cursor"`
	Lines                    []string               `json:"lines"`
	ScreenText               string                 `json:"screenText"`
	PendingControlSequence   bool                   `json:"pendingControlSequence"`
	PendingInputByteCount    int                    `json:"pendingInputByteCount"`
	UnsupportedSequenceCount int                    `json:"unsupportedSequenceCount"`
}

type TerminalCursorPosition struct {
	Row    int `json:"row"`
	Column int `json:"column"`
}

type TerminalRecentOutputPage struct {
	ByteCount     int                         `json:"byteCount"`
	Chunks        []TerminalRecentOutputChunk `json:"chunks"`
	DroppedBytes  int                         `json:"droppedBytes"`
	DroppedChunks int                         `json:"droppedChunks"`
	OmittedBytes  int                         `json:"omittedBytes"`
	OmittedChunks int                         `json:"omittedChunks"`
	Text          string                      `json:"text"`
	TextUTF8Valid bool                        `json:"textUtf8Valid"`
	Truncated     bool                        `json:"truncated"`
}

type TerminalRecentOutputChunk struct {
	ByteCount        int    `json:"byteCount"`
	DataBase64       string `json:"dataBase64"`
	EmittedAt        string `json:"emittedAt"`
	EventID          string `json:"eventId"`
	EventOffsetBytes int    `json:"eventOffsetBytes"`
	Sequence         int    `json:"sequence"`
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
			Name: "TerminalCloseAssessmentReason",
			Values: []string{
				string(TerminalCloseAssessmentNoSession),
				string(TerminalCloseAssessmentAlreadyClosed),
				string(TerminalCloseAssessmentIdleShell),
				string(TerminalCloseAssessmentForegroundProcess),
				string(TerminalCloseAssessmentBackgroundJobs),
				string(TerminalCloseAssessmentInspectionFailed),
			},
		},
		{
			Name: "TerminalCloseResultKind",
			Values: []string{
				string(TerminalCloseResultClosed),
				string(TerminalCloseResultConfirmationRequired),
			},
		},
		{
			Name: "TerminalCloseSafety",
			Values: []string{
				string(TerminalCloseSafetySafe),
				string(TerminalCloseSafetyDestructive),
				string(TerminalCloseSafetyUnknown),
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
