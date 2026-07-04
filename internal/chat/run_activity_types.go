package chat

import "encoding/json"

type RunItemDetails struct {
	Kind        RunItemDetailsKind         `json:"kind"`
	MCPToolCall *RunItemMCPToolCallDetails `json:"mcpToolCall"`
}

type RunActivityDetailsProjection struct {
	Summary       string                     `json:"summary"`
	Command       string                     `json:"command"`
	Cwd           string                     `json:"cwd"`
	ExitCode      int                        `json:"exitCode"`
	DurationMs    int                        `json:"durationMs"`
	FilePaths     []string                   `json:"filePaths"`
	PatchStatus   string                     `json:"patchStatus"`
	ServerName    string                     `json:"serverName"`
	ToolName      string                     `json:"toolName"`
	Progress      string                     `json:"progress"`
	Result        string                     `json:"result"`
	Error         string                     `json:"error"`
	NoticeKind    string                     `json:"noticeKind"`
	NoticeMessage string                     `json:"noticeMessage"`
	DiffSummary   string                     `json:"diffSummary"`
	Namespace     string                     `json:"namespace"`
	ProcessID     string                     `json:"processId"`
	RequestID     string                     `json:"requestId"`
	ReviewID      string                     `json:"reviewId"`
	Details       json.RawMessage            `json:"details"`
	MCPToolCall   *RunItemMCPToolCallDetails `json:"mcpToolCall"`
}

type RunItemMCPToolCallDetails struct {
	ServerName        string                `json:"serverName"`
	ToolName          string                `json:"toolName"`
	DisplayTitle      string                `json:"displayTitle"`
	Progress          string                `json:"progress"`
	DurationMs        int                   `json:"durationMs"`
	Arguments         json.RawMessage       `json:"arguments"`
	AppContext        json.RawMessage       `json:"appContext"`
	PluginID          string                `json:"pluginId"`
	MCPAppResourceURI string                `json:"mcpAppResourceUri"`
	ResultSummary     string                `json:"resultSummary"`
	Result            *RunItemMCPToolResult `json:"result"`
	Error             string                `json:"error"`
}

type RunItemMCPToolResult struct {
	Content           []json.RawMessage `json:"content"`
	StructuredContent json.RawMessage   `json:"structuredContent"`
	Meta              json.RawMessage   `json:"_meta"`
}

func NewRunItemMCPToolCallDetails(details RunItemMCPToolCallDetails) *RunItemDetails {
	return &RunItemDetails{
		Kind:        RunItemDetailsKindMCPToolCall,
		MCPToolCall: &details,
	}
}

func (item RunItem) MCPToolCallDetails() (*RunItemMCPToolCallDetails, bool) {
	if item.Type != RunItemTypeMCPToolCall ||
		item.Details == nil ||
		item.Details.Kind != RunItemDetailsKindMCPToolCall ||
		item.Details.MCPToolCall == nil {
		return nil, false
	}
	return item.Details.MCPToolCall, true
}

type RunActivityPage struct {
	RunID    string                        `json:"runId"`
	Items    []RunItem                     `json:"items"`
	Output   []RunItemOutput               `json:"output"`
	Activity []ActivityItemBlockProjection `json:"activity"`
}

func (details RunActivityDetailsProjection) MarshalJSON() ([]byte, error) {
	type detailsAlias RunActivityDetailsProjection
	if details.FilePaths == nil {
		details.FilePaths = []string{}
	}
	return json.Marshal(detailsAlias(details))
}

func (page RunActivityPage) MarshalJSON() ([]byte, error) {
	type pageAlias RunActivityPage
	if page.Items == nil {
		page.Items = []RunItem{}
	}
	if page.Output == nil {
		page.Output = []RunItemOutput{}
	}
	if page.Activity == nil {
		page.Activity = []ActivityItemBlockProjection{}
	}
	return json.Marshal(pageAlias(page))
}
