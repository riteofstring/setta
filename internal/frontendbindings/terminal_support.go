package frontendbindings

type InterruptTerminalProcessesRequestInput struct {
	ProjectID string `json:"projectId"`
}

type InterruptTerminalProcessesResponse struct {
	InterruptedSessionCount int `json:"interruptedSessionCount"`
}

type RunCodeRequestInput struct {
	ProjectConfigID          string                       `json:"projectConfigId"`
	SectionID                *string                      `json:"sectionId"`
	TerminalSectionID        *string                      `json:"terminalSectionId,omitempty"`
	CLIID                    *string                      `json:"cliId,omitempty"`
	RunSnapshotMode          *string                      `json:"runSnapshotMode,omitempty"`
	DrawSnapshotsBySectionID *map[string]BinaryContentRef `json:"drawSnapshotsBySectionId,omitempty"`
	SectionVariantOverrides  *map[string]string           `json:"sectionVariantOverrides,omitempty"`
	ParamOverrides           *map[string]string           `json:"paramOverrides,omitempty"`
}
