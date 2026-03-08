package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/filebrowser"
	"setta/internal/modes"
)

const (
	RouteCheckIfFileExists         = "/checkIfFileExists"
	RouteCheckWorkspaceInitialized = "/checkWorkspaceInitialized"
	RouteGetFileBrowserRoot        = "/getFileBrowserRoot"
	RouteGetFolderContents         = "/getFolderContents"
	RouteGetFileBrowserDownloadURL = "/getFileBrowserDownloadUrls"
	RouteGetFileBrowserFileContent = "/getFileBrowserFileContent"
	RouteGetFileBrowserFileStat    = "/getFileBrowserFileStat"
	RouteWriteFileBrowserContent   = "/writeFileBrowserFileContent"
	RouteTransferFileBrowserEntry  = "/transferFileBrowserEntry"
	RouteFileBrowserDownload       = "/fileBrowser/{token}"
)

type FileBrowserRouteDependencies struct {
	ModePolicy modes.Policy
	Browser    FileBrowserService
}

type FileBrowserService interface {
	Root(ctx context.Context) filebrowser.RootResponse
	CheckIfFileExists(ctx context.Context, rawPath string) (bool, error)
	CheckWorkspaceInitialized(ctx context.Context, request filebrowser.CheckWorkspaceInitializedRequest) (bool, error)
	ListFolder(ctx context.Context, request filebrowser.ListFolderRequest) ([]filebrowser.FolderContentItem, error)
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

type GetFileBrowserFileStatRequest struct {
	Path string `json:"path"`
}

func RegisterFileBrowserRoutes(router chi.Router, deps FileBrowserRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Browser == nil {
		return fmt.Errorf("file browser service is required in ide mode")
	}

	guard := modeRequirementMiddleware(deps.ModePolicy, deps.ModePolicy.RequireNotLauncher)
	router.With(guard).Post(RouteCheckIfFileExists, checkIfFileExistsHandler(deps))
	router.With(guard).Post(RouteCheckWorkspaceInitialized, checkWorkspaceInitializedHandler(deps))
	router.With(guard).Post(RouteGetFileBrowserRoot, getFileBrowserRootHandler(deps))
	router.With(guard).Post(RouteGetFolderContents, getFolderContentsHandler(deps))
	router.With(guard).Post(RouteGetFileBrowserDownloadURL, getFileBrowserDownloadURLsHandler(deps))
	router.With(guard).Post(RouteGetFileBrowserFileContent, getFileBrowserFileContentHandler(deps))
	router.With(guard).Post(RouteGetFileBrowserFileStat, getFileBrowserFileStatHandler(deps))
	router.With(guard).Post(RouteWriteFileBrowserContent, writeFileBrowserFileContentHandler(deps))
	router.With(guard).Post(RouteTransferFileBrowserEntry, transferFileBrowserEntryHandler(deps))
	router.With(guard).Get(RouteFileBrowserDownload, fileBrowserDownloadHandler(deps))
	return nil
}

func checkIfFileExistsHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

func checkWorkspaceInitializedHandler(deps FileBrowserRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureFileBrowsingAllowed(w, r) || deps.Browser == nil {
			if deps.Browser == nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		payload, err := decodeJSONBody[filebrowser.CheckWorkspaceInitializedRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		initialized, err := deps.Browser.CheckWorkspaceInitialized(r.Context(), payload)
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
		payload, err := decodeJSONBody[filebrowser.ListFolderRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		items, err := deps.Browser.ListFolder(r.Context(), payload)
		if err != nil {
			writeFileBrowserRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, items)
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
		payload, err := decodeJSONBody[filebrowser.FileBrowserDownloadURLRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		entries, err := deps.Browser.BuildDownloadURLs(r.Context(), payload, func(token string) string {
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
		payload, err := decodeJSONBody[filebrowser.FileContentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Browser.ReadFileContent(r.Context(), payload)
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
		payload, err := decodeJSONBody[filebrowser.WriteFileContentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Browser.WriteFileContent(r.Context(), payload)
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
		payload, err := decodeJSONBody[filebrowser.TransferRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := deps.Browser.Transfer(r.Context(), payload)
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

func writeFileBrowserRouteError(w http.ResponseWriter, r *http.Request, err error) {
	var routeErr *filebrowser.Error
	if !errors.As(err, &routeErr) {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return
	}

	switch routeErr.Kind {
	case filebrowser.ErrorInvalidRequest:
		writeError(w, r, http.StatusBadRequest, "invalid_request", routeErr.Message)
	case filebrowser.ErrorPathForbidden:
		writeError(w, r, http.StatusForbidden, "path_forbidden", routeErr.Message)
	case filebrowser.ErrorPathNotFound:
		writeError(w, r, http.StatusNotFound, "path_not_found", routeErr.Message)
	case filebrowser.ErrorPathNotFile:
		writeError(w, r, http.StatusBadRequest, "path_not_file", routeErr.Message)
	case filebrowser.ErrorPathNotDirectory:
		writeError(w, r, http.StatusBadRequest, "path_not_directory", routeErr.Message)
	case filebrowser.ErrorConflict:
		writeError(w, r, http.StatusConflict, "file_conflict", routeErr.Message)
	case filebrowser.ErrorTooLarge:
		writeError(w, r, http.StatusRequestEntityTooLarge, "file_too_large", routeErr.Message)
	case filebrowser.ErrorBinaryPayloadInvalid:
		writeError(w, r, http.StatusBadRequest, "invalid_binary_content_payload", routeErr.Message)
	case filebrowser.ErrorTokenUnavailable:
		writeError(w, r, http.StatusInternalServerError, "file_browser_token_unavailable", routeErr.Message)
	case filebrowser.ErrorInvalidDownloadToken:
		writeError(w, r, http.StatusForbidden, "invalid_file_browser_token", routeErr.Message)
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func buildAbsoluteAPIRouteURL(r *http.Request, route string, pathParams map[string]string) string {
	resolvedPath := strings.TrimSpace(route)
	for key, value := range pathParams {
		resolvedPath = strings.ReplaceAll(resolvedPath, "{"+key+"}", url.PathEscape(value))
	}
	return requestOrigin(r) + apiPrefix + resolvedPath
}
