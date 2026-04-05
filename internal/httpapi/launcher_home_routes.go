package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/launcher"
	"setta/internal/modes"
)

const RouteGetLauncherRecentWorkspaces = "/launcherRecentWorkspaces"
const RouteAddLauncherRecentWorkspace = "/addLauncherRecentWorkspace"
const RouteRemoveLauncherRecentWorkspace = "/removeLauncherRecentWorkspace"
const RoutePinLauncherRecentWorkspace = "/pinLauncherRecentWorkspace"
const RouteGetLauncherFilesystemRoots = "/launcherFilesystemRoots"
const RouteListLauncherDirectory = "/listLauncherDirectory"
const RouteOpenLauncherWorkspace = "/openLauncherWorkspace"

type LauncherHomeRouteDependencies struct {
	ModePolicy       modes.Policy
	Auth             *auth.Service
	DefaultSettaHome string
	Home             *launcher.HomeService
	OpenWorkspace    *launcher.OpenWorkspaceService
}

type LauncherHomeErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type LauncherRecentWorkspacesResponse struct {
	Ok         bool                            `json:"ok"`
	Workspaces []launcher.RecentWorkspaceEntry `json:"workspaces"`
	Error      *LauncherHomeErrorPayload       `json:"error"`
}

type GetLauncherRecentWorkspacesRequest struct {
	SettaHome *string `json:"setta_home,omitempty"`
}

type LauncherRecentWorkspaceRequest struct {
	SettaHome     *string `json:"settaHome"`
	WorkspaceRoot string  `json:"workspaceRoot"`
	Pinned        *bool   `json:"pinned"`
}

type PinLauncherRecentWorkspaceRequest struct {
	SettaHome     *string `json:"settaHome"`
	WorkspaceRoot string  `json:"workspaceRoot"`
	Pinned        bool    `json:"pinned"`
}

type LauncherFilesystemRootsResponse struct {
	Ok    bool     `json:"ok"`
	Roots []string `json:"roots"`
}

type LauncherListDirectoryRequest struct {
	Path     *string `json:"path"`
	Cursor   *string `json:"cursor"`
	PageSize *int    `json:"pageSize"`
}

type LauncherListDirectoryResponse struct {
	Ok          bool                      `json:"ok"`
	CurrentPath *string                   `json:"currentPath"`
	ParentPath  *string                   `json:"parentPath"`
	Entries     []launcher.DirectoryEntry `json:"entries"`
	NextCursor  *string                   `json:"nextCursor"`
	HasMore     bool                      `json:"hasMore"`
	Truncated   bool                      `json:"truncated"`
	Error       *LauncherHomeErrorPayload `json:"error"`
}

type LauncherOpenWorkspaceRequest struct {
	WorkspaceRoot              string                `json:"workspaceRoot"`
	SettaHome                  *string               `json:"settaHome"`
	Profile                    *string               `json:"profile"`
	SettaFilesRoot             *string               `json:"settaFilesRoot"`
	SettaFilesLocation         *config.FilesLocation `json:"settaFilesLocation"`
	RuntimeRoot                *string               `json:"runtimeRoot"`
	CreateIfMissing            bool                  `json:"createIfMissing"`
	settaFilesLocationProvided bool
}

type LauncherOpenWorkspaceResponse struct {
	Ok                   bool                          `json:"ok"`
	BootstrapURLFragment *string                       `json:"bootstrapUrlFragment"`
	WorkspaceRoot        *string                       `json:"workspaceRoot"`
	SettaFilesLocation   *config.ResolvedFilesLocation `json:"settaFilesLocation"`
	SettaFilesRoot       *string                       `json:"settaFilesRoot"`
	RuntimeRoot          *string                       `json:"runtimeRoot"`
	SettaHome            *string                       `json:"settaHome"`
	Profile              *string                       `json:"profile"`
	SessionID            *string                       `json:"sessionId"`
	StartedNew           *bool                         `json:"startedNew"`
	Error                *LauncherHomeErrorPayload     `json:"error"`
}

func (r *LauncherOpenWorkspaceRequest) UnmarshalJSON(data []byte) error {
	type payload struct {
		WorkspaceRoot      string                `json:"workspaceRoot"`
		SettaHome          *string               `json:"settaHome"`
		Profile            *string               `json:"profile"`
		SettaFilesRoot     *string               `json:"settaFilesRoot"`
		SettaFilesLocation *config.FilesLocation `json:"settaFilesLocation"`
		RuntimeRoot        *string               `json:"runtimeRoot"`
		CreateIfMissing    bool                  `json:"createIfMissing"`
	}

	var decoded payload
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	r.WorkspaceRoot = decoded.WorkspaceRoot
	r.SettaHome = decoded.SettaHome
	r.Profile = decoded.Profile
	r.SettaFilesRoot = decoded.SettaFilesRoot
	r.SettaFilesLocation = decoded.SettaFilesLocation
	r.RuntimeRoot = decoded.RuntimeRoot
	r.CreateIfMissing = decoded.CreateIfMissing
	_, r.settaFilesLocationProvided = raw["settaFilesLocation"]
	return nil
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
	if deps.OpenWorkspace == nil {
		return fmt.Errorf("launcher open-workspace service is required in launcher mode")
	}
	if strings.TrimSpace(deps.DefaultSettaHome) == "" {
		return fmt.Errorf("default setta home is required in launcher mode")
	}

	registerOpenAPIGet[LauncherRecentWorkspacesResponse](
		router,
		"getLauncherRecentWorkspaces",
		RouteGetLauncherRecentWorkspaces,
		getLauncherRecentWorkspacesHandler(deps.DefaultSettaHome, deps.Home),
		withOpenAPITags("Launcher"),
		withOpenAPISummary("List recent launcher workspaces for the selected Setta home scope."),
		withOpenAPIModeRequirement("launcher"),
		withOpenAPIQuery[GetLauncherRecentWorkspacesRequest](),
	)
	registerOpenAPIPost[LauncherRecentWorkspaceRequest, LauncherRecentWorkspacesResponse](
		router,
		"addLauncherRecentWorkspace",
		RouteAddLauncherRecentWorkspace,
		addLauncherRecentWorkspaceHandler(deps.DefaultSettaHome, deps.Home),
		withOpenAPITags("Launcher"),
		withOpenAPISummary("Add a workspace to the launcher recent-workspaces list."),
		withOpenAPIModeRequirement("launcher"),
	)
	registerOpenAPIPost[LauncherRecentWorkspaceRequest, LauncherRecentWorkspacesResponse](
		router,
		"removeLauncherRecentWorkspace",
		RouteRemoveLauncherRecentWorkspace,
		removeLauncherRecentWorkspaceHandler(deps.DefaultSettaHome, deps.Home),
		withOpenAPITags("Launcher"),
		withOpenAPISummary("Remove a workspace from the launcher recent-workspaces list."),
		withOpenAPIModeRequirement("launcher"),
	)
	registerOpenAPIPost[PinLauncherRecentWorkspaceRequest, LauncherRecentWorkspacesResponse](
		router,
		"pinLauncherRecentWorkspace",
		RoutePinLauncherRecentWorkspace,
		pinLauncherRecentWorkspaceHandler(deps.DefaultSettaHome, deps.Home),
		withOpenAPITags("Launcher"),
		withOpenAPISummary("Pin or unpin a workspace in the launcher recent-workspaces list."),
		withOpenAPIModeRequirement("launcher"),
	)
	registerOpenAPIGet[LauncherFilesystemRootsResponse](
		router,
		"getLauncherFilesystemRoots",
		RouteGetLauncherFilesystemRoots,
		getLauncherFilesystemRootsHandler(deps.Home),
		withOpenAPITags("Launcher"),
		withOpenAPISummary("List filesystem roots that the launcher can browse."),
		withOpenAPIModeRequirement("launcher"),
	)
	registerOpenAPIPost[LauncherListDirectoryRequest, LauncherListDirectoryResponse](
		router,
		"listLauncherDirectory",
		RouteListLauncherDirectory,
		listLauncherDirectoryHandler(deps.Home),
		withOpenAPITags("Launcher"),
		withOpenAPISummary("List a launcher-visible directory page with pagination metadata."),
		withOpenAPIModeRequirement("launcher"),
	)
	registerOpenAPIPost[LauncherOpenWorkspaceRequest, LauncherOpenWorkspaceResponse](
		router,
		"openLauncherWorkspace",
		RouteOpenLauncherWorkspace,
		openLauncherWorkspaceHandler(deps.Auth, deps.OpenWorkspace),
		withOpenAPITags("Launcher"),
		withOpenAPISummary("Open or reconnect to a launcher-selected workspace."),
		withOpenAPIModeRequirement("launcher"),
	)
	return nil
}

func getLauncherRecentWorkspacesHandler(defaultSettaHome string, home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		request := GetLauncherRecentWorkspacesRequest{
			SettaHome: launcherStringPointer(r.URL.Query().Get("setta_home")),
		}
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, launcherStringOrEmpty(request.SettaHome))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		workspaces, err := home.LoadRecentWorkspaces(settaHome)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherRecentWorkspacesErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, LauncherRecentWorkspacesResponse{
			Ok:         true,
			Workspaces: launcherRecentWorkspacePayloads(workspaces),
			Error:      nil,
		})
	}
}

func addLauncherRecentWorkspaceHandler(defaultSettaHome string, home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[LauncherRecentWorkspaceRequest](r)
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
		writeJSON(w, http.StatusOK, LauncherRecentWorkspacesResponse{
			Ok:         true,
			Workspaces: launcherRecentWorkspacePayloads(workspaces),
			Error:      nil,
		})
	}
}

func removeLauncherRecentWorkspaceHandler(defaultSettaHome string, home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[LauncherRecentWorkspaceRequest](r)
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
		writeJSON(w, http.StatusOK, LauncherRecentWorkspacesResponse{
			Ok:         true,
			Workspaces: launcherRecentWorkspacePayloads(workspaces),
			Error:      nil,
		})
	}
}

func pinLauncherRecentWorkspaceHandler(defaultSettaHome string, home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PinLauncherRecentWorkspaceRequest](r)
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
		writeJSON(w, http.StatusOK, LauncherRecentWorkspacesResponse{
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
		writeJSON(w, http.StatusOK, LauncherFilesystemRootsResponse{
			Ok:    true,
			Roots: roots,
		})
	}
}

func listLauncherDirectoryHandler(home *launcher.HomeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[LauncherListDirectoryRequest](r)
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
		writeJSON(w, http.StatusOK, LauncherListDirectoryResponse{
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

func openLauncherWorkspaceHandler(authService *auth.Service, openWorkspace *launcher.OpenWorkspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[LauncherOpenWorkspaceRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		var currentSession *auth.CurrentSession
		if authService != nil {
			currentSession, _ = authService.CurrentSession()
		}

		result, err := openWorkspace.OpenWorkspace(launcher.OpenWorkspaceInput{
			WorkspaceRoot:              payload.WorkspaceRoot,
			SettaHome:                  launcherStringOrEmpty(payload.SettaHome),
			Profile:                    launcherStringOrEmpty(payload.Profile),
			SettaFilesRoot:             launcherStringOrEmpty(payload.SettaFilesRoot),
			SettaFilesLocation:         launcherFilesLocationStringPointer(payload.SettaFilesLocation),
			SettaFilesLocationProvided: payload.settaFilesLocationProvided,
			RuntimeRoot:                launcherStringOrEmpty(payload.RuntimeRoot),
			CreateIfMissing:            payload.CreateIfMissing,
			RequestOrigin:              frontendorigins.ResolveRequestOrigin(r, true),
			CurrentSession:             currentSession,
		})
		if err != nil {
			writeJSON(w, http.StatusOK, launcherOpenWorkspaceErrorResponse(err))
			return
		}

		writeJSON(w, http.StatusOK, LauncherOpenWorkspaceResponse{
			Ok:                   true,
			BootstrapURLFragment: launcherStringPointer(result.BootstrapURLFragment),
			WorkspaceRoot:        launcherStringPointer(result.WorkspaceRoot),
			SettaFilesLocation:   launcherResolvedFilesLocationPointer(result.SettaFilesLocation),
			SettaFilesRoot:       launcherStringPointer(result.SettaFilesRoot),
			RuntimeRoot:          launcherStringPointer(result.RuntimeRoot),
			SettaHome:            launcherStringPointer(result.SettaHome),
			Profile:              result.Profile,
			SessionID:            launcherStringPointer(result.SessionID),
			StartedNew:           launcherBoolPointer(result.StartedNew),
			Error:                nil,
		})
	}
}

func launcherRecentWorkspacePayloads(entries []launcher.RecentWorkspaceEntry) []launcher.RecentWorkspaceEntry {
	payloads := make([]launcher.RecentWorkspaceEntry, 0, len(entries))
	for _, entry := range entries {
		payloads = append(payloads, entry)
	}
	return payloads
}

func launcherDirectoryEntryPayloads(entries []launcher.DirectoryEntry) []launcher.DirectoryEntry {
	payloads := make([]launcher.DirectoryEntry, 0, len(entries))
	for _, entry := range entries {
		payloads = append(payloads, entry)
	}
	return payloads
}

func launcherRecentWorkspacesErrorResponse(err error) LauncherRecentWorkspacesResponse {
	code, message := launcherErrorPayload(err)
	return LauncherRecentWorkspacesResponse{
		Ok:         false,
		Workspaces: []launcher.RecentWorkspaceEntry{},
		Error: &LauncherHomeErrorPayload{
			Code:    code,
			Message: message,
		},
	}
}

func launcherListDirectoryErrorResponse(err error) LauncherListDirectoryResponse {
	code, message := launcherErrorPayload(err)
	return LauncherListDirectoryResponse{
		Ok:          false,
		CurrentPath: nil,
		ParentPath:  nil,
		Entries:     []launcher.DirectoryEntry{},
		NextCursor:  nil,
		HasMore:     false,
		Truncated:   false,
		Error: &LauncherHomeErrorPayload{
			Code:    code,
			Message: message,
		},
	}
}

func launcherOpenWorkspaceErrorResponse(err error) LauncherOpenWorkspaceResponse {
	code, message := launcherErrorPayload(err)
	return LauncherOpenWorkspaceResponse{
		Ok:                   false,
		BootstrapURLFragment: nil,
		WorkspaceRoot:        nil,
		SettaFilesLocation:   nil,
		SettaFilesRoot:       nil,
		RuntimeRoot:          nil,
		SettaHome:            nil,
		Profile:              nil,
		SessionID:            nil,
		StartedNew:           nil,
		Error: &LauncherHomeErrorPayload{
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
	var openWorkspaceErr *launcher.OpenWorkspaceError
	if errors.As(err, &openWorkspaceErr) {
		return openWorkspaceErr.Code, openWorkspaceErr.Message
	}
	return "InternalError", "Internal Server Error"
}

func launcherStringOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func launcherStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func launcherBoolPointer(value bool) *bool {
	result := value
	return &result
}

func launcherFilesLocationStringPointer(value *config.FilesLocation) *string {
	if value == nil {
		return nil
	}
	stringValue := string(*value)
	return &stringValue
}

func launcherResolvedFilesLocationPointer(value string) *config.ResolvedFilesLocation {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	resolved := config.ResolvedFilesLocation(trimmed)
	return &resolved
}
