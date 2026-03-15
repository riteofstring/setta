package frontendbindings

type CreateFileRequestInput struct {
	Filepath string `json:"filepath"`
}

type CheckIfFileExistsRequestInput struct {
	Filepath string `json:"filepath"`
}

type CheckIfFileExistsResponse bool

type CheckWorkspaceInitializedRequestInput struct {
	FolderPath                string `json:"folderPath"`
	AllowOutsideWorkspaceRoot *bool  `json:"allowOutsideWorkspaceRoot,omitempty"`
}

type CheckWorkspaceInitializedResponse bool

type FileBrowserRootResponse struct {
	RootPath       string   `json:"rootPath"`
	PathSeparator  string   `json:"pathSeparator"`
	IgnorePatterns []string `json:"ignorePatterns"`
}

type MissingFolderBehavior string

const (
	MissingFolderBehaviorError MissingFolderBehavior = "error"
	MissingFolderBehaviorEmpty MissingFolderBehavior = "empty"
)

type GetFolderContentsRequestInput struct {
	FolderPath                string                 `json:"folderPath"`
	AllowOutsideWorkspaceRoot *bool                  `json:"allowOutsideWorkspaceRoot,omitempty"`
	IncludeMtime              *bool                  `json:"includeMtime,omitempty"`
	IncludeSize               *bool                  `json:"includeSize,omitempty"`
	IncludeHidden             *bool                  `json:"includeHidden,omitempty"`
	IncludeSettaInitialized   *bool                  `json:"includeSettaInitialized,omitempty"`
	IgnorePatterns            *[]string              `json:"ignorePatterns,omitempty"`
	MaxEntries                *int                   `json:"maxEntries,omitempty"`
	MissingFolderBehavior     *MissingFolderBehavior `json:"missingFolderBehavior,omitempty"`
}

type FolderContentItemType string

const (
	FolderContentItemTypeFolder FolderContentItemType = "folder"
	FolderContentItemTypeFile   FolderContentItemType = "file"
)

type FolderContentItem struct {
	Name               string                `json:"name"`
	Type               FolderContentItemType `json:"type"`
	FullPath           string                `json:"fullPath"`
	Mtime              *float64              `json:"mtime,omitempty"`
	Size               *int64                `json:"size,omitempty"`
	IsSettaInitialized *bool                 `json:"isSettaInitialized,omitempty"`
}

type GetFolderContentsResponse []FolderContentItem

type GetFileBrowserDownloadURLsRequestInput struct {
	Paths []string `json:"paths"`
}

type FileBrowserDownloadRouteParams struct {
	Token string `json:"token"`
}

type FileBrowserDownloadURLEntry struct {
	Path      string `json:"path"`
	URL       string `json:"url"`
	ExpiresAt int64  `json:"expiresAt"`
}

type GetFileBrowserDownloadURLsResponse []FileBrowserDownloadURLEntry

type GetFileBrowserFileContentRequestInput struct {
	Path     string `json:"path"`
	MaxBytes *int64 `json:"maxBytes,omitempty"`
}

type FileBrowserFileContentResponse struct {
	Path      string `json:"path"`
	MimeType  string `json:"mimeType"`
	ContentID string `json:"contentId"`
	MtimeNs   int64  `json:"mtimeNs"`
	Size      int64  `json:"size"`
}

type GetFileBrowserFileStatRequestInput struct {
	Path string `json:"path"`
}

type FileBrowserFileStatResponse struct {
	Path    string `json:"path"`
	MtimeNs int64  `json:"mtimeNs"`
	Size    int64  `json:"size"`
}

type WriteFileBrowserFileContentRequestInput struct {
	Path            string `json:"path"`
	ContentID       string `json:"contentId"`
	ExpectedMtimeNs *int64 `json:"expectedMtimeNs,omitempty"`
}

type WriteFileBrowserFileContentResponse struct {
	Path     string `json:"path"`
	MimeType string `json:"mimeType"`
	MtimeNs  int64  `json:"mtimeNs"`
	Size     int64  `json:"size"`
}

type TransferOperation string

const (
	TransferOperationCopy TransferOperation = "copy"
	TransferOperationMove TransferOperation = "move"
)

type TransferFileBrowserEntryRequestInput struct {
	SourcePath            string            `json:"sourcePath"`
	DestinationFolderPath string            `json:"destinationFolderPath"`
	Operation             TransferOperation `json:"operation"`
}

type TransferFileBrowserEntryResponse struct {
	SourcePath      string            `json:"sourcePath"`
	DestinationPath string            `json:"destinationPath"`
	Operation       TransferOperation `json:"operation"`
}
