package frontendbindings

import "setta/internal/filebrowser"

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

type FileBrowserRootResponse filebrowser.RootResponse

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

type FolderContentItemType filebrowser.FolderContentItemType

const (
	FolderContentItemTypeFolder FolderContentItemType = FolderContentItemType(filebrowser.FolderContentItemTypeFolder)
	FolderContentItemTypeFile   FolderContentItemType = FolderContentItemType(filebrowser.FolderContentItemTypeFile)
)

type FolderContentItem filebrowser.FolderContentItem

type GetFolderContentsResponse []FolderContentItem

type GetFileBrowserDownloadURLsRequestInput struct {
	Paths []string `json:"paths"`
}

type FileBrowserDownloadRouteParams struct {
	Token string `json:"token"`
}

type FileBrowserDownloadURLEntry filebrowser.FileBrowserDownloadURLEntry

type GetFileBrowserDownloadURLsResponse []FileBrowserDownloadURLEntry

type GetFileBrowserFileContentRequestInput struct {
	Path     string `json:"path"`
	MaxBytes *int64 `json:"maxBytes,omitempty"`
}

type FileBrowserFileContentResponse filebrowser.FileContentResponse

type GetFileBrowserFileStatRequestInput struct {
	Path string `json:"path"`
}

type FileBrowserFileStatResponse filebrowser.FileStatResponse

type WriteFileBrowserFileContentRequestInput struct {
	Path            string `json:"path"`
	ContentID       string `json:"contentId"`
	ExpectedMtimeNs *int64 `json:"expectedMtimeNs,omitempty"`
}

type WriteFileBrowserFileContentResponse filebrowser.WriteFileContentResponse

type TransferOperation filebrowser.TransferOperation

const (
	TransferOperationCopy TransferOperation = TransferOperation(filebrowser.TransferOperationCopy)
	TransferOperationMove TransferOperation = TransferOperation(filebrowser.TransferOperationMove)
)

type TransferFileBrowserEntryRequestInput struct {
	SourcePath            string            `json:"sourcePath"`
	DestinationFolderPath string            `json:"destinationFolderPath"`
	Operation             TransferOperation `json:"operation"`
}

type TransferFileBrowserEntryResponse filebrowser.TransferResponse
