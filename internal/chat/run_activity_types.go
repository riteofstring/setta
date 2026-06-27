package chat

import "encoding/json"

type RunActivityDetailsProjection struct {
	Summary       string          `json:"summary"`
	Command       string          `json:"command"`
	Cwd           string          `json:"cwd"`
	ExitCode      int             `json:"exitCode"`
	DurationMs    int             `json:"durationMs"`
	FilePaths     []string        `json:"filePaths"`
	PatchStatus   string          `json:"patchStatus"`
	ServerName    string          `json:"serverName"`
	ToolName      string          `json:"toolName"`
	Progress      string          `json:"progress"`
	Result        string          `json:"result"`
	Error         string          `json:"error"`
	NoticeKind    string          `json:"noticeKind"`
	NoticeMessage string          `json:"noticeMessage"`
	DiffSummary   string          `json:"diffSummary"`
	Namespace     string          `json:"namespace"`
	ProcessID     string          `json:"processId"`
	RequestID     string          `json:"requestId"`
	ReviewID      string          `json:"reviewId"`
	Details       json.RawMessage `json:"details"`
}

type RunActivityRowProjection struct {
	ID              string                       `json:"id"`
	SourceRunItemID string                       `json:"sourceRunItemId"`
	Type            RunItemType                  `json:"type"`
	Title           string                       `json:"title"`
	Status          RunItemStatus                `json:"status"`
	Details         RunActivityDetailsProjection `json:"details"`
	HasDetails      bool                         `json:"hasDetails"`
	HasOutput       bool                         `json:"hasOutput"`
}

type RunActivityGroupProjection struct {
	RunID       string                     `json:"runId"`
	Status      RunStatus                  `json:"status"`
	StatusTitle string                     `json:"statusTitle"`
	Rows        []RunActivityRowProjection `json:"rows"`
}

type RunActivityPage struct {
	RunID    string                      `json:"runId"`
	Items    []RunItem                   `json:"items"`
	Output   []RunItemOutput             `json:"output"`
	Activity *RunActivityGroupProjection `json:"activity"`
}

func (details RunActivityDetailsProjection) MarshalJSON() ([]byte, error) {
	type detailsAlias RunActivityDetailsProjection
	if details.FilePaths == nil {
		details.FilePaths = []string{}
	}
	return json.Marshal(detailsAlias(details))
}

func (group RunActivityGroupProjection) MarshalJSON() ([]byte, error) {
	type groupAlias RunActivityGroupProjection
	if group.Rows == nil {
		group.Rows = []RunActivityRowProjection{}
	}
	return json.Marshal(groupAlias(group))
}

func (page RunActivityPage) MarshalJSON() ([]byte, error) {
	type pageAlias RunActivityPage
	if page.Items == nil {
		page.Items = []RunItem{}
	}
	if page.Output == nil {
		page.Output = []RunItemOutput{}
	}
	return json.Marshal(pageAlias(page))
}
