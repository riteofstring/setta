package chat

import "encoding/json"

type RunItemDetails struct {
	Kind                    RunItemDetailsKind                     `json:"kind"`
	CommandExecution        *RunItemCommandExecutionDetails        `json:"commandExecution"`
	MCPToolCall             *RunItemMCPToolCallDetails             `json:"mcpToolCall"`
	DynamicToolCall         *RunItemDynamicToolCallDetails         `json:"dynamicToolCall"`
	FileChange              *RunItemFileChangeDetails              `json:"fileChange"`
	Diff                    *RunItemDiffDetails                    `json:"diff"`
	Approval                *RunItemApprovalDetails                `json:"approval"`
	ProviderStreamLifecycle *RunItemProviderStreamLifecycleDetails `json:"providerStreamLifecycle"`
}

type RunActivityDetailsProjection struct {
	Summary                 string                                 `json:"summary"`
	Command                 string                                 `json:"command"`
	Cwd                     string                                 `json:"cwd"`
	ExitCode                int                                    `json:"exitCode"`
	DurationMs              int                                    `json:"durationMs"`
	FilePaths               []string                               `json:"filePaths"`
	PatchStatus             string                                 `json:"patchStatus"`
	ServerName              string                                 `json:"serverName"`
	ToolName                string                                 `json:"toolName"`
	Progress                string                                 `json:"progress"`
	Result                  string                                 `json:"result"`
	Error                   string                                 `json:"error"`
	NoticeKind              string                                 `json:"noticeKind"`
	NoticeMessage           string                                 `json:"noticeMessage"`
	Namespace               string                                 `json:"namespace"`
	ProcessID               string                                 `json:"processId"`
	RequestID               string                                 `json:"requestId"`
	ReviewID                string                                 `json:"reviewId"`
	Details                 json.RawMessage                        `json:"details"`
	CommandExecution        *RunItemCommandExecutionDetails        `json:"commandExecution"`
	MCPToolCall             *RunItemMCPToolCallDetails             `json:"mcpToolCall"`
	DynamicToolCall         *RunItemDynamicToolCallDetails         `json:"dynamicToolCall"`
	FileChange              *RunItemFileChangeDetails              `json:"fileChange"`
	Diff                    *RunItemDiffDetails                    `json:"diff"`
	Approval                *RunItemApprovalDetails                `json:"approval"`
	ProviderStreamLifecycle *RunItemProviderStreamLifecycleDetails `json:"providerStreamLifecycle"`
}

type RunItemCommandExecutionDetails struct {
	Command    string                `json:"command"`
	Cwd        string                `json:"cwd"`
	ExitCode   int                   `json:"exitCode"`
	DurationMs int                   `json:"durationMs"`
	ProcessID  string                `json:"processId"`
	Source     *RunItemCommandSource `json:"source"`
	Result     string                `json:"result"`
	Error      string                `json:"error"`
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

type RunItemDynamicToolCallDetails struct {
	Namespace     string                    `json:"namespace"`
	ToolName      string                    `json:"toolName"`
	DisplayTitle  string                    `json:"displayTitle"`
	Description   string                    `json:"description"`
	Category      string                    `json:"category"`
	DurationMs    int                       `json:"durationMs"`
	Arguments     json.RawMessage           `json:"arguments"`
	ResultSummary string                    `json:"resultSummary"`
	Result        *RunItemDynamicToolResult `json:"result"`
	Error         string                    `json:"error"`
}

type RunItemDynamicToolResult struct {
	ContentItems []RunItemDynamicToolContentItem `json:"contentItems"`
	Success      *bool                           `json:"success"`
}

type RunItemDynamicToolContentItem struct {
	Type     string `json:"type"`
	Text     string `json:"text"`
	ImageURL string `json:"imageUrl"`
}

func runItemDynamicToolSuccess(value bool) *bool {
	return &value
}

func approvalKindPtr(value ApprovalKind) *ApprovalKind {
	return &value
}

func approvalStatusPtr(value ApprovalStatus) *ApprovalStatus {
	return &value
}

type RunItemFileChangeDetails struct {
	PatchStatus string                  `json:"patchStatus"`
	Paths       []RunItemFileChangePath `json:"paths"`
	Additions   int                     `json:"additions"`
	Deletions   int                     `json:"deletions"`
}

type RunItemFileChangePath struct {
	Path           string                      `json:"path"`
	Operation      *RunItemFileChangeOperation `json:"operation"`
	MovePath       string                      `json:"movePath"`
	Additions      int                         `json:"additions"`
	Deletions      int                         `json:"deletions"`
	Patch          string                      `json:"patch"`
	PatchTruncated bool                        `json:"patchTruncated"`
}

type RunItemDiffDetails struct {
	Summary        string            `json:"summary"`
	Paths          []RunItemDiffPath `json:"paths"`
	Additions      int               `json:"additions"`
	Deletions      int               `json:"deletions"`
	Patch          string            `json:"patch"`
	PatchTruncated bool              `json:"patchTruncated"`
}

type RunItemDiffPath struct {
	Path      string                      `json:"path"`
	Operation *RunItemFileChangeOperation `json:"operation"`
	MovePath  string                      `json:"movePath"`
	Additions int                         `json:"additions"`
	Deletions int                         `json:"deletions"`
}

type RunItemApprovalDetails struct {
	ApprovalID        string                  `json:"approvalId"`
	ApprovalKind      *ApprovalKind           `json:"approvalKind"`
	ApprovalStatus    *ApprovalStatus         `json:"approvalStatus"`
	ProviderRequestID string                  `json:"providerRequestId"`
	ReviewID          string                  `json:"reviewId"`
	ReviewStatus      string                  `json:"reviewStatus"`
	ActionType        string                  `json:"actionType"`
	Title             string                  `json:"title"`
	Body              string                  `json:"body"`
	Command           string                  `json:"command"`
	Cwd               string                  `json:"cwd"`
	FilePath          string                  `json:"filePath"`
	Permission        string                  `json:"permission"`
	Question          string                  `json:"question"`
	Options           []string                `json:"options"`
	Questions         []ApprovalQuestion      `json:"questions"`
	StructuredInput   *StructuredInputRequest `json:"structuredInput"`
	Review            json.RawMessage         `json:"review"`
	Action            json.RawMessage         `json:"action"`
}

type RunItemProviderStreamLifecycleDetails struct {
	Message           string            `json:"message"`
	AdditionalDetails string            `json:"additionalDetails"`
	CodexErrorKind    string            `json:"codexErrorKind"`
	CodexErrorInfo    json.RawMessage   `json:"codexErrorInfo"`
	WillRetry         bool              `json:"willRetry"`
	StreamFailure     bool              `json:"streamFailure"`
	LivenessStatus    RunLivenessStatus `json:"livenessStatus"`
	LivenessReason    RunLivenessReason `json:"livenessReason"`
	ProviderThreadID  string            `json:"providerThreadId"`
	ProviderTurnID    string            `json:"providerTurnId"`
}

func NewRunItemMCPToolCallDetails(details RunItemMCPToolCallDetails) *RunItemDetails {
	return &RunItemDetails{
		Kind:                    RunItemDetailsKindMCPToolCall,
		CommandExecution:        nil,
		MCPToolCall:             &details,
		DynamicToolCall:         nil,
		FileChange:              nil,
		Diff:                    nil,
		Approval:                nil,
		ProviderStreamLifecycle: nil,
	}
}

func NewRunItemCommandExecutionDetails(details RunItemCommandExecutionDetails) *RunItemDetails {
	return &RunItemDetails{
		Kind:                    RunItemDetailsKindCommandExecution,
		CommandExecution:        &details,
		MCPToolCall:             nil,
		DynamicToolCall:         nil,
		FileChange:              nil,
		Diff:                    nil,
		Approval:                nil,
		ProviderStreamLifecycle: nil,
	}
}

func NewRunItemDynamicToolCallDetails(details RunItemDynamicToolCallDetails) *RunItemDetails {
	return &RunItemDetails{
		Kind:                    RunItemDetailsKindDynamicToolCall,
		CommandExecution:        nil,
		MCPToolCall:             nil,
		DynamicToolCall:         &details,
		FileChange:              nil,
		Diff:                    nil,
		Approval:                nil,
		ProviderStreamLifecycle: nil,
	}
}

func NewRunItemFileChangeDetails(details RunItemFileChangeDetails) *RunItemDetails {
	return &RunItemDetails{
		Kind:                    RunItemDetailsKindFileChange,
		CommandExecution:        nil,
		MCPToolCall:             nil,
		DynamicToolCall:         nil,
		FileChange:              &details,
		Diff:                    nil,
		Approval:                nil,
		ProviderStreamLifecycle: nil,
	}
}

func NewRunItemDiffDetails(details RunItemDiffDetails) *RunItemDetails {
	return &RunItemDetails{
		Kind:                    RunItemDetailsKindDiff,
		CommandExecution:        nil,
		MCPToolCall:             nil,
		DynamicToolCall:         nil,
		FileChange:              nil,
		Diff:                    &details,
		Approval:                nil,
		ProviderStreamLifecycle: nil,
	}
}

func NewRunItemApprovalDetails(details RunItemApprovalDetails) *RunItemDetails {
	return &RunItemDetails{
		Kind:                    RunItemDetailsKindApproval,
		CommandExecution:        nil,
		MCPToolCall:             nil,
		DynamicToolCall:         nil,
		FileChange:              nil,
		Diff:                    nil,
		Approval:                &details,
		ProviderStreamLifecycle: nil,
	}
}

func NewRunItemProviderStreamLifecycleDetails(details RunItemProviderStreamLifecycleDetails) *RunItemDetails {
	return &RunItemDetails{
		Kind:                    RunItemDetailsKindProviderStreamLifecycle,
		CommandExecution:        nil,
		MCPToolCall:             nil,
		DynamicToolCall:         nil,
		FileChange:              nil,
		Diff:                    nil,
		Approval:                nil,
		ProviderStreamLifecycle: &details,
	}
}

func (item RunItem) CommandExecutionDetails() (*RunItemCommandExecutionDetails, bool) {
	if item.Type != RunItemTypeCommandExecution ||
		item.Details == nil ||
		item.Details.Kind != RunItemDetailsKindCommandExecution ||
		item.Details.CommandExecution == nil {
		return nil, false
	}
	return item.Details.CommandExecution, true
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

func (item RunItem) DynamicToolCallDetails() (*RunItemDynamicToolCallDetails, bool) {
	if item.Type != RunItemTypeDynamicToolCall ||
		item.Details == nil ||
		item.Details.Kind != RunItemDetailsKindDynamicToolCall ||
		item.Details.DynamicToolCall == nil {
		return nil, false
	}
	return item.Details.DynamicToolCall, true
}

func (item RunItem) FileChangeDetails() (*RunItemFileChangeDetails, bool) {
	if item.Type != RunItemTypeFileChange ||
		item.Details == nil ||
		item.Details.Kind != RunItemDetailsKindFileChange ||
		item.Details.FileChange == nil {
		return nil, false
	}
	return item.Details.FileChange, true
}

func (item RunItem) DiffDetails() (*RunItemDiffDetails, bool) {
	if item.Type != RunItemTypeDiff ||
		item.Details == nil ||
		item.Details.Kind != RunItemDetailsKindDiff ||
		item.Details.Diff == nil {
		return nil, false
	}
	return item.Details.Diff, true
}

func (item RunItem) ApprovalDetails() (*RunItemApprovalDetails, bool) {
	if item.Type != RunItemTypeApprovalRequest &&
		item.Type != RunItemTypeApprovalReview {
		return nil, false
	}
	if item.Details == nil ||
		item.Details.Kind != RunItemDetailsKindApproval ||
		item.Details.Approval == nil {
		return nil, false
	}
	return item.Details.Approval, true
}

func (item RunItem) ProviderStreamLifecycleDetails() (*RunItemProviderStreamLifecycleDetails, bool) {
	if item.Type != RunItemTypeProviderStreamLifecycle ||
		item.Details == nil ||
		item.Details.Kind != RunItemDetailsKindProviderStreamLifecycle ||
		item.Details.ProviderStreamLifecycle == nil {
		return nil, false
	}
	return item.Details.ProviderStreamLifecycle, true
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

func (result RunItemDynamicToolResult) MarshalJSON() ([]byte, error) {
	type resultAlias RunItemDynamicToolResult
	if result.ContentItems == nil {
		result.ContentItems = []RunItemDynamicToolContentItem{}
	}
	return json.Marshal(resultAlias(result))
}

func (details RunItemApprovalDetails) MarshalJSON() ([]byte, error) {
	type detailsAlias RunItemApprovalDetails
	if details.Options == nil {
		details.Options = []string{}
	}
	if details.Questions == nil {
		details.Questions = []ApprovalQuestion{}
	}
	return json.Marshal(detailsAlias(details))
}

func (details RunItemFileChangeDetails) MarshalJSON() ([]byte, error) {
	type detailsAlias RunItemFileChangeDetails
	if details.Paths == nil {
		details.Paths = []RunItemFileChangePath{}
	}
	return json.Marshal(detailsAlias(details))
}

func (details RunItemDiffDetails) MarshalJSON() ([]byte, error) {
	type detailsAlias RunItemDiffDetails
	if details.Paths == nil {
		details.Paths = []RunItemDiffPath{}
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
