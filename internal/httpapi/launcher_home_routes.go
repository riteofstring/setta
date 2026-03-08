package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/launcher"
	"setta/internal/modes"
)

const RouteGetLauncherRecentWorkspaces = "/launcherRecentWorkspaces"
const RouteAddLauncherRecentWorkspace = "/addLauncherRecentWorkspace"
const RouteRemoveLauncherRecentWorkspace = "/removeLauncherRecentWorkspace"
const RoutePinLauncherRecentWorkspace = "/pinLauncherRecentWorkspace"
const RouteGetLauncherFilesystemRoots = "/launcherFilesystemRoots"
const RouteListLauncherDirectory = "/listLauncherDirectory"

type LauncherHomeRouteDependencies struct {
	ModePolicy       modes.Policy
	DefaultSettaHome string
	Home             *launcher.HomeService
}

type launcherHomeErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type launcherRecentWorkspacePayload struct {
	WorkspaceRoot string `json:"workspaceRoot"`
	Pinned        bool   `json:"pinned"`
	LastUsedAt    int64  `json:"lastUsedAt"`
}

type launcherRecentWorkspacesResponse struct {
	Ok         bool                             `json:"ok"`
	Workspaces []launcherRecentWorkspacePayload `json:"workspaces"`
	Error      *launcherHomeErrorPayload        `json:"error"`
}

type launcherRecentWorkspaceRequest struct {
	SettaHome     *string `json:"settaHome"`
	WorkspaceRoot string  `json:"workspaceRoot"`
	Pinned        *bool   `json:"pinned"`
}

type pinLauncherRecentWorkspaceRequest struct {
	SettaHome     *string `json:"settaHome"`
	WorkspaceRoot string  `json:"workspaceRoot"`
	Pinned        bool    `json:"pinned"`
}

type launcherFilesystemRootsResponse struct {
	Ok    bool     `json:"ok"`
	Roots []string `json:"roots"`
}

type launcherDirectoryEntryPayload struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	IsDirectory bool   `json:"isDirectory"`
	IsSymlink   bool   `json:"isSymlink"`
}

type launcherListDirectoryRequest struct {
	Path     *string `json:"path"`
	Cursor   *string `json:"cursor"`
	PageSize *int    `json:"pageSize"`
}

type launcherListDirectoryResponse struct {
	Ok          bool                            `json:"ok"`
	CurrentPath *string                         `json:"currentPath"`
	ParentPath  *string                         `json:"parentPath"`
	Entries     []launcherDirectoryEntryPayload `json:"entries"`
	NextCursor  *string                         `json:"nextCursor"`
	HasMore     bool                            `json:"hasMore"`
	Truncated   bool                            `json:"truncated"`
	Error       *launcherHomeErrorPayload       `json:"error"`
}

func RegisterLauncherHomeRoutes(router chi.Router, deps LauncherHomeRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if !deps.ModePolicy.IsLauncher() {
		return nil
	}
	if deps.Home == nil {
		return fmt.Errorf("launcher home service is required in launcher mode")
	}
	if strings.TrimSpace(deps.DefaultSettaHome) == "" {
		return fmt.Errorf("default setta home is required in launcher mode")
	}

	router.Get(RouteGetLauncherRecentWorkspaces, getLauncherRecentWorkspacesHandler(deps.DefaultSettaHome, deps.Home))
	router.Post(RouteAddLauncherRecentWorkspace, addLauncherRecentWorkspaceHandler(deps.DefaultSettaHome, deps.Home))
	router.Post(RouteRemoveLauncherRecentWorkspace, removeLauncherRecentWorkspaceHandler(deps.DefaultSettaHome, deps.Home))
	router.Post(RoutePinLauncherRecentWorkspace, pinLauncherRecentWorkspaceHandler(deps.DefaultSettaHome, deps.Home))
	router.Get(RouteGetLauncherFilesystemRoots, getLauncherFilesystemRootsHandler(deps.Home))
	router.Post(RouteListLauncherDirectory, listLauncherDirectoryHandler(deps.Home))
	return nil
}

func getLauncherRecentWorkspacesHandler(defaultSettaHome string, home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, r.URL.Query().Get("setta_home"))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		workspaces, err := home.LoadRecentWorkspaces(settaHome)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherRecentWorkspacesErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherRecentWorkspacesResponse{
			Ok:         true,
			Workspaces: launcherRecentWorkspacePayloads(workspaces),
			Error:      nil,
		})
	}
}

func addLauncherRecentWorkspaceHandler(defaultSettaHome string, home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[launcherRecentWorkspaceRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, launcherStringOrEmpty(payload.SettaHome))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		workspaces, err := home.AddRecentWorkspace(settaHome, payload.WorkspaceRoot, payload.Pinned)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherRecentWorkspacesErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherRecentWorkspacesResponse{
			Ok:         true,
			Workspaces: launcherRecentWorkspacePayloads(workspaces),
			Error:      nil,
		})
	}
}

func removeLauncherRecentWorkspaceHandler(defaultSettaHome string, home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[launcherRecentWorkspaceRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, launcherStringOrEmpty(payload.SettaHome))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		workspaces, err := home.RemoveRecentWorkspace(settaHome, payload.WorkspaceRoot)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherRecentWorkspacesErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherRecentWorkspacesResponse{
			Ok:         true,
			Workspaces: launcherRecentWorkspacePayloads(workspaces),
			Error:      nil,
		})
	}
}

func pinLauncherRecentWorkspaceHandler(defaultSettaHome string, home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[pinLauncherRecentWorkspaceRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, launcherStringOrEmpty(payload.SettaHome))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		workspaces, err := home.SetRecentWorkspacePinned(settaHome, payload.WorkspaceRoot, payload.Pinned)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherRecentWorkspacesErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherRecentWorkspacesResponse{
			Ok:         true,
			Workspaces: launcherRecentWorkspacePayloads(workspaces),
			Error:      nil,
		})
	}
}

func getLauncherFilesystemRootsHandler(home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roots, err := home.AllowedRoots()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, launcherFilesystemRootsResponse{
			Ok:    true,
			Roots: roots,
		})
	}
}

func listLauncherDirectoryHandler(home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[launcherListDirectoryRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		listing, err := home.ListDirectory(launcher.ListDirectoryInput{
			Path:     payload.Path,
			Cursor:   payload.Cursor,
			PageSize: payload.PageSize,
		})
		if err != nil {
			writeJSON(w, http.StatusOK, launcherListDirectoryErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherListDirectoryResponse{
			Ok:          true,
			CurrentPath: listing.CurrentPath,
			ParentPath:  listing.ParentPath,
			Entries:     launcherDirectoryEntryPayloads(listing.Entries),
			NextCursor:  listing.NextCursor,
			HasMore:     listing.HasMore,
			Truncated:   listing.Truncated,
			Error:       nil,
		})
	}
}

func launcherRecentWorkspacePayloads(entries []launcher.RecentWorkspaceEntry) []launcherRecentWorkspacePayload {
	payloads := make([]launcherRecentWorkspacePayload, 0, len(entries))
	for _, entry := range entries {
		payloads = append(payloads, launcherRecentWorkspacePayload{
			WorkspaceRoot: entry.WorkspaceRoot,
			Pinned:        entry.Pinned,
			LastUsedAt:    entry.LastUsedAt,
		})
	}
	return payloads
}

func launcherDirectoryEntryPayloads(entries []launcher.DirectoryEntry) []launcherDirectoryEntryPayload {
	payloads := make([]launcherDirectoryEntryPayload, 0, len(entries))
	for _, entry := range entries {
		payloads = append(payloads, launcherDirectoryEntryPayload{
			Name:        entry.Name,
			Path:        entry.Path,
			IsDirectory: entry.IsDirectory,
			IsSymlink:   entry.IsSymlink,
		})
	}
	return payloads
}

func launcherRecentWorkspacesErrorResponse(err error) launcherRecentWorkspacesResponse {
	code, message := launcherErrorPayload(err)
	return launcherRecentWorkspacesResponse{
		Ok:         false,
		Workspaces: []launcherRecentWorkspacePayload{},
		Error: &launcherHomeErrorPayload{
			Code:    code,
			Message: message,
		},
	}
}

func launcherListDirectoryErrorResponse(err error) launcherListDirectoryResponse {
	code, message := launcherErrorPayload(err)
	return launcherListDirectoryResponse{
		Ok:          false,
		CurrentPath: nil,
		ParentPath:  nil,
		Entries:     []launcherDirectoryEntryPayload{},
		NextCursor:  nil,
		HasMore:     false,
		Truncated:   false,
		Error: &launcherHomeErrorPayload{
			Code:    code,
			Message: message,
		},
	}
}

func launcherErrorPayload(err error) (string, string) {
	var homeErr *launcher.HomeError
	if errors.As(err, &homeErr) {
		return homeErr.Code, homeErr.Message
	}
	return "InternalError", "Internal Server Error"
}

func launcherStringOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
