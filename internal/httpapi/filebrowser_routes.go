package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/filebrowser"
	"setta/internal/modes"
)

const deploymentFileAccessRestrictionDetail = "Deployment mode file access is restricted to the deployment artifacts/json_sources/code paths."

const (
	RouteCreateFile                = "/createFile"
	RouteCheckIfFileExists         = "/checkIfFileExists"
	RouteCheckWorkspaceInitialized = "/checkWorkspaceInitialized"
	RouteGetFileBrowserRoot        = "/getFileBrowserRoot"
	RouteGetWorkspacePythonSignal  = "/getWorkspacePythonSignal"
	RouteGetFolderContents         = "/getFolderContents"
	RouteGetFileBrowserDownloadURL = "/getFileBrowserDownloadUrls"
	RouteGetFileBrowserFileContent = "/getFileBrowserFileContent"
	RouteGetFileBrowserFileStat    = "/getFileBrowserFileStat"
	RouteWriteFileBrowserContent   = "/writeFileBrowserFileContent"
	RouteTransferFileBrowserEntry  = "/transferFileBrowserEntry"
	RouteFileBrowserDownload       = "/fileBrowser/{token}"
)

var deploymentFileBrowserAllowedSubfolders = []string{"artifacts", "json_sources", "code"}

type fileBrowserRouteErrorResponse struct {
	status int
	code   string
}

var fileBrowserRouteErrorsByKind = map[filebrowser.ErrorKind]fileBrowserRouteErrorResponse{
	filebrowser.ErrorInvalidRequest:       {status: http.StatusBadRequest, code: "invalid_request"},
	filebrowser.ErrorPathForbidden:        {status: http.StatusForbidden, code: "path_forbidden"},
	filebrowser.ErrorPathNotFound:         {status: http.StatusNotFound, code: "path_not_found"},
	filebrowser.ErrorPathNotFile:          {status: http.StatusBadRequest, code: "path_not_file"},
	filebrowser.ErrorPathNotDirectory:     {status: http.StatusBadRequest, code: "path_not_directory"},
	filebrowser.ErrorConflict:             {status: http.StatusConflict, code: "file_conflict"},
	filebrowser.ErrorTooLarge:             {status: http.StatusRequestEntityTooLarge, code: "file_too_large"},
	filebrowser.ErrorBinaryPayloadInvalid: {status: http.StatusBadRequest, code: "invalid_binary_content_payload"},
	filebrowser.ErrorTokenUnavailable:     {status: http.StatusInternalServerError, code: "file_browser_token_unavailable"},
	filebrowser.ErrorInvalidDownloadToken: {status: http.StatusForbidden, code: "invalid_file_browser_token"},
}

type FileBrowserRouteDependencies struct {
	ModePolicy     modes.Policy
	DeploymentRoot string
	Browser        FileBrowserService
}

type FileBrowserService interface {
	Root(ctx context.Context) filebrowser.RootResponse
	CreateFile(ctx context.Context, rawPath string) error
	CheckIfFileExists(ctx context.Context, rawPath string) (bool, error)
	CheckWorkspaceInitialized(ctx context.Context, request filebrowser.CheckWorkspaceInitializedRequest) (bool, error)
	ListFolder(ctx context.Context, request filebrowser.ListFolderRequest) (filebrowser.ListFolderResponse, error)
	WorkspacePythonSignal(ctx context.Context, rawPath string) (filebrowser.WorkspacePythonSignalResponse, error)
	BuildDownloadURLs(ctx context.Context, request filebrowser.FileBrowserDownloadURLRequest, buildURL func(token string) string) ([]filebrowser.FileBrowserDownloadURLEntry, error)
	ReadFileContent(ctx context.Context, request filebrowser.FileContentRequest) (filebrowser.FileContentResponse, error)
	StatFile(ctx context.Context, rawPath string) (filebrowser.FileStatResponse, error)
	WriteFileContent(ctx context.Context, request filebrowser.WriteFileContentRequest) (filebrowser.WriteFileContentResponse, error)
	Transfer(ctx context.Context, request filebrowser.TransferRequest) (filebrowser.TransferResponse, error)
	Download(ctx context.Context, token string) (filebrowser.DownloadResult, error)
}

type CheckIfFileExistsRequest struct {
	Filepath string `json:"filepath"`
}

type CreateFileRequest struct {
	Filepath string `json:"filepath"`
}

type CheckWorkspaceInitializedRequest struct {
	FolderPath                string `json:"folderPath"`
	AllowOutsideWorkspaceRoot *bool  `json:"allowOutsideWorkspaceRoot,omitempty"`
}

func (r CheckWorkspaceInitializedRequest) toServiceRequest() filebrowser.CheckWorkspaceInitializedRequest {
	return filebrowser.CheckWorkspaceInitializedRequest{
		FolderPath:                r.FolderPath,
		AllowOutsideWorkspaceRoot: r.AllowOutsideWorkspaceRoot != nil && *r.AllowOutsideWorkspaceRoot,
	}
}

type MissingFolderBehavior string

const (
	MissingFolderBehaviorError MissingFolderBehavior = "error"
	MissingFolderBehaviorEmpty MissingFolderBehavior = "empty"
)

type GetFolderContentsRequest struct {
	BaseFolderPath            *string                `json:"baseFolderPath,omitempty"`
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

func (r GetFolderContentsRequest) toServiceRequest() filebrowser.ListFolderRequest {
	var ignorePatterns []string
	if r.IgnorePatterns != nil {
		ignorePatterns = *r.IgnorePatterns
	}
	baseFolderPath := ""
	if r.BaseFolderPath != nil {
		baseFolderPath = *r.BaseFolderPath
	}
	return filebrowser.ListFolderRequest{
		BaseFolderPath:            baseFolderPath,
		FolderPath:                r.FolderPath,
		AllowOutsideWorkspaceRoot: r.AllowOutsideWorkspaceRoot != nil && *r.AllowOutsideWorkspaceRoot,
		IncludeMtime:              r.IncludeMtime != nil && *r.IncludeMtime,
		IncludeSize:               r.IncludeSize != nil && *r.IncludeSize,
		IncludeHidden:             r.IncludeHidden != nil && *r.IncludeHidden,
		IncludeSettaInitialized:   r.IncludeSettaInitialized != nil && *r.IncludeSettaInitialized,
		IgnorePatterns:            ignorePatterns,
		MaxEntries:                r.MaxEntries,
		MissingFolderBehavior:     missingFolderBehaviorOrEmpty(r.MissingFolderBehavior),
	}
}

type GetFileBrowserDownloadURLsRequest struct {
	Paths []string `json:"paths"`
}

type GetWorkspacePythonSignalRequest struct {
	FolderPath string `json:"folderPath"`
}

func (r GetFileBrowserDownloadURLsRequest) toServiceRequest() filebrowser.FileBrowserDownloadURLRequest {
	return filebrowser.FileBrowserDownloadURLRequest{Paths: r.Paths}
}

type FileBrowserDownloadRouteParams struct {
	Token string `json:"token"`
}

type GetFileBrowserFileContentRequest struct {
	Path     string `json:"path"`
	MaxBytes *int64 `json:"maxBytes,omitempty"`
}

func (r GetFileBrowserFileContentRequest) toServiceRequest() filebrowser.FileContentRequest {
	return filebrowser.FileContentRequest{
		Path:     r.Path,
		MaxBytes: r.MaxBytes,
	}
}

type GetFileBrowserFileStatRequest struct {
	Path string `json:"path"`
}

type WriteFileBrowserFileContentRequest struct {
	Path            string `json:"path"`
	ContentID       string `json:"contentId"`
	ExpectedMtimeNs *int64 `json:"expectedMtimeNs,omitempty"`
}

func (r WriteFileBrowserFileContentRequest) toServiceRequest() filebrowser.WriteFileContentRequest {
	return filebrowser.WriteFileContentRequest{
		Path:            r.Path,
		ContentID:       r.ContentID,
		ExpectedMtimeNs: r.ExpectedMtimeNs,
	}
}

type TransferFileBrowserEntryRequest struct {
	SourcePath            string                        `json:"sourcePath"`
	DestinationFolderPath string                        `json:"destinationFolderPath"`
	Operation             filebrowser.TransferOperation `json:"operation"`
}

func (r TransferFileBrowserEntryRequest) toServiceRequest() filebrowser.TransferRequest {
	return filebrowser.TransferRequest{
		SourcePath:            r.SourcePath,
		DestinationFolderPath: r.DestinationFolderPath,
		Operation:             r.Operation,
	}
}

func missingFolderBehaviorOrEmpty(value *MissingFolderBehavior) string {
	if value == nil {
		return ""
	}
	return string(*value)
}

func RegisterFileBrowserRoutes(router chi.Router, deps FileBrowserRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Browser == nil && !openAPIDocumentOnlyFromRouter(router) {
		return fmt.Errorf("file browser service is required in ide mode")
	}

	guard := modeRequirementMiddleware(deps.ModePolicy, deps.ModePolicy.RequireNotLauncher)
	ideRouter := router.With(RequireIDEMode(deps.ModePolicy))
	sharedRouter := router.With(guard)
	registerOpenAPIPost[CreateFileRequest, openAPIJSONNull](
		ideRouter,
		"createFile",
		RouteCreateFile,
		createFileHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Create an empty file inside the workspace root."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[CheckIfFileExistsRequest, bool](
		sharedRouter,
		"checkIfFileExists",
		RouteCheckIfFileExists,
		checkIfFileExistsHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Check whether a file exists and is accessible from the current runtime."),
		withOpenAPIModeRequirement("not-launcher"),
		withOpenAPIAppSubsystemFrontendSDK(),
	)
	registerOpenAPIPost[CheckWorkspaceInitializedRequest, bool](
		sharedRouter,
		"checkWorkspaceInitialized",
		RouteCheckWorkspaceInitialized,
		checkWorkspaceInitializedHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Check whether a folder is initialized for Setta workspace usage."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPostNoRequest[filebrowser.RootResponse](
		sharedRouter,
		"getFileBrowserRoot",
		RouteGetFileBrowserRoot,
		getFileBrowserRootHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Get the root path and ignore patterns for the file browser."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetWorkspacePythonSignalRequest, filebrowser.WorkspacePythonSignalResponse](
		sharedRouter,
		"getWorkspacePythonSignal",
		RouteGetWorkspacePythonSignal,
		getWorkspacePythonSignalHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Detect whether a workspace folder contains Python project signals."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetFolderContentsRequest, filebrowser.ListFolderResponse](
		sharedRouter,
		"getFolderContents",
		RouteGetFolderContents,
		getFolderContentsHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("List the visible contents of a folder in the file browser."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetFileBrowserDownloadURLsRequest, []filebrowser.FileBrowserDownloadURLEntry](
		sharedRouter,
		"getFileBrowserDownloadUrls",
		RouteGetFileBrowserDownloadURL,
		getFileBrowserDownloadURLsHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Build signed backend download URLs for file browser entries."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetFileBrowserFileContentRequest, filebrowser.FileContentResponse](
		sharedRouter,
		"getFileBrowserFileContent",
		RouteGetFileBrowserFileContent,
		getFileBrowserFileContentHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Read file browser content into the runtime binary store."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetFileBrowserFileStatRequest, filebrowser.FileStatResponse](
		sharedRouter,
		"getFileBrowserFileStat",
		RouteGetFileBrowserFileStat,
		getFileBrowserFileStatHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Read file browser stat metadata for a path."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[WriteFileBrowserFileContentRequest, filebrowser.WriteFileContentResponse](
		sharedRouter,
		"writeFileBrowserFileContent",
		RouteWriteFileBrowserContent,
		writeFileBrowserFileContentHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Write binary-store content to a file browser path."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[TransferFileBrowserEntryRequest, filebrowser.TransferResponse](
		sharedRouter,
		"transferFileBrowserEntry",
		RouteTransferFileBrowserEntry,
		transferFileBrowserEntryHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Copy or move a file browser entry into another folder."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIGet[openAPIBinaryPayload](
		sharedRouter,
		"downloadFileBrowserEntry",
		RouteFileBrowserDownload,
		fileBrowserDownloadHandler(deps),
		withOpenAPITags("File Browser"),
		withOpenAPISummary("Download a file browser entry by signed token."),
		withOpenAPIModeRequirement("not-launcher"),
		withOpenAPIPathParams[FileBrowserDownloadRouteParams](),
		withOpenAPIResponseContentType("application/octet-stream"),
	)
	return nil
}

func checkIfFileExistsHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ModePolicy.IsDeployment() {
			payload, err := decodeJSONBody[CheckIfFileExistsRequest](r)
			if err != nil {
				writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
				return
			}

			exists, status, detail, err := checkIfDeploymentFileExists(payload.Filepath, deps.DeploymentRoot)
			if err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
			if status != 0 {
				writeDetail(w, status, detail)
				return
			}
			writeJSON(w, http.StatusOK, exists)
			return
		}

		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[CheckIfFileExistsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		exists, err := deps.Browser.CheckIfFileExists(r.Context(), payload.Filepath)
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, exists)
	}
}

func createFileHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Browser == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[CreateFileRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		if err := deps.Browser.CreateFile(r.Context(), payload.Filepath); err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func checkWorkspaceInitializedHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[CheckWorkspaceInitializedRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		initialized, err := deps.Browser.CheckWorkspaceInitialized(r.Context(), payload.toServiceRequest())
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, initialized)
	}
}

func getFileBrowserRootHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		if _, err := decodeJSONBody[struct{}](r); err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		writeJSON(w, http.StatusOK, deps.Browser.Root(r.Context()))
	}
}

func getFolderContentsHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[GetFolderContentsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		items, err := deps.Browser.ListFolder(r.Context(), payload.toServiceRequest())
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, items)
	}
}

func getWorkspacePythonSignalHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[GetWorkspacePythonSignalRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Browser.WorkspacePythonSignal(r.Context(), payload.FolderPath)
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func getFileBrowserDownloadURLsHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[GetFileBrowserDownloadURLsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		entries, err := deps.Browser.BuildDownloadURLs(r.Context(), payload.toServiceRequest(), func(token string) string {
			return buildAbsoluteAPIRouteURL(r, RouteFileBrowserDownload, map[string]string{
				"token": token,
			})
		})
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, entries)
	}
}

func getFileBrowserFileContentHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[GetFileBrowserFileContentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Browser.ReadFileContent(r.Context(), payload.toServiceRequest())
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func getFileBrowserFileStatHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[GetFileBrowserFileStatRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Browser.StatFile(r.Context(), payload.Path)
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func writeFileBrowserFileContentHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[WriteFileBrowserFileContentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Browser.WriteFileContent(r.Context(), payload.toServiceRequest())
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func transferFileBrowserEntryHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[TransferFileBrowserEntryRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Browser.Transfer(r.Context(), payload.toServiceRequest())
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func fileBrowserDownloadHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}

		result, err := deps.Browser.Download(r.Context(), chi.URLParam(r, "token"))
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		w.Header().Set("Content-Type", result.MediaType)
		http.ServeFile(w, r, result.Path)
	}
}

func ensureFileBrowsingAllowed(w http.ResponseWriter, r *http.Request) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if requestInfo.Policy.IsDeployment() {
		writeError(w, r, http.StatusForbidden, "mode_forbidden", "File browsing is disabled in deployment mode.")
		return false
	}
	return true
}

func checkIfDeploymentFileExists(rawPath string, deploymentRoot string) (bool, int, string, error) {
	resolvedPath, status, detail, err := resolveDeploymentCheckPath(rawPath, deploymentRoot)
	if err != nil || status != 0 {
		return false, status, detail, err
	}

	if _, statErr := os.Stat(resolvedPath); statErr != nil {
		if errors.Is(statErr, os.ErrNotExist) {
			return false, 0, "", nil
		}
		return false, 0, "", nil
	}
	return true, 0, "", nil
}

func resolveDeploymentCheckPath(rawPath string, deploymentRoot string) (string, int, string, error) {
	resolvedDeploymentRoot, status, detail, err := resolveDeploymentRootPath(deploymentRoot)
	if err != nil || status != 0 {
		return "", status, detail, err
	}

	resolvedCandidate, err := resolveDeploymentCandidatePath(rawPath, resolvedDeploymentRoot)
	if err != nil {
		return "", 0, "", err
	}
	allowed, err := deploymentPathAllowed(resolvedCandidate, resolvedDeploymentRoot)
	if err != nil {
		return "", 0, "", err
	}
	if allowed {
		return resolvedCandidate, 0, "", nil
	}

	return "", http.StatusForbidden, deploymentFileAccessRestrictionDetail, nil
}

func resolveDeploymentRootPath(deploymentRoot string) (string, int, string, error) {
	trimmedRoot := strings.TrimSpace(deploymentRoot)
	if trimmedRoot == "" {
		return "", http.StatusBadRequest, "Deployment root is not configured.", nil
	}

	resolvedDeploymentRoot, err := filepath.Abs(trimmedRoot)
	if err != nil {
		return "", 0, "", err
	}
	if strings.TrimSpace(resolvedDeploymentRoot) == "" {
		return "", http.StatusBadRequest, "Deployment root is not configured.", nil
	}
	return resolvedDeploymentRoot, 0, "", nil
}

func resolveDeploymentCandidatePath(rawPath string, resolvedDeploymentRoot string) (string, error) {
	trimmedPath := strings.TrimSpace(rawPath)
	if trimmedPath == "" {
		return filepath.Clean(resolvedDeploymentRoot), nil
	}

	if filepath.IsAbs(trimmedPath) {
		return filepath.Abs(trimmedPath)
	}
	return filepath.Abs(filepath.Join(resolvedDeploymentRoot, trimmedPath))
}

func deploymentPathAllowed(resolvedCandidate string, resolvedDeploymentRoot string) (bool, error) {
	for _, subfolder := range deploymentFileBrowserAllowedSubfolders {
		withinRoot, err := pathWithinRoot(filepath.Join(resolvedDeploymentRoot, subfolder), resolvedCandidate)
		if err != nil {
			return false, err
		}
		if withinRoot {
			return true, nil
		}
	}
	return false, nil
}

func pathWithinRoot(root string, candidate string) (bool, error) {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false, err
	}
	return relative == "." || !pathEscapesRoot(relative), nil
}

func pathEscapesRoot(relative string) bool {
	return relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func writeFileBrowserRouteError(w http.ResponseWriter, r *http.Request, err error) {
	var routeErr *filebrowser.Error
	if !errors.As(err, &routeErr) {
		writeFileBrowserInternalError(w, r)
		return
	}
	response, ok := fileBrowserRouteErrorsByKind[routeErr.Kind]
	if !ok {
		writeFileBrowserInternalError(w, r)
		return
	}
	writeError(w, r, response.status, response.code, routeErr.Message)
}

func writeFileBrowserInternalError(w http.ResponseWriter, r *http.Request) {
	writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
}

func buildAbsoluteAPIRouteURL(r *http.Request, route string, pathParams map[string]string) string {
	resolvedPath := strings.TrimSpace(route)
	for key, value := range pathParams {
		resolvedPath = strings.ReplaceAll(resolvedPath, "{"+key+"}", url.PathEscape(value))
	}
	return requestOrigin(r) + apiPrefix + resolvedPath
}
