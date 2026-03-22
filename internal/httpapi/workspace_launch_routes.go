package httpapi

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/frontendorigins"
	"setta/internal/modes"
	"setta/internal/workspacelaunch"
)

const RouteCreateWorkspaceLaunchIntent = "/createWorkspaceLaunchIntent"
const RouteLaunch = "/launch"

type WorkspaceLaunchRouteDependencies struct {
	ModePolicy modes.Policy
	Auth       *auth.Service
	Intents    *workspacelaunch.IntentService
	Launch     *workspacelaunch.LocalLaunchService
}

type workspaceLaunchErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type createWorkspaceLaunchIntentRequest struct {
	LaunchRequest workspacelaunch.Request `json:"launchRequest"`
	ReturnURL     string                  `json:"returnUrl"`
}

type createWorkspaceLaunchIntentResponse struct {
	Ok                bool                         `json:"ok"`
	LaunchIntentToken *string                      `json:"launchIntentToken"`
	RequestedAt       *int64                       `json:"requestedAt"`
	Error             *workspaceLaunchErrorPayload `json:"error"`
}

type launchResponse struct {
	Ok                   bool                         `json:"ok"`
	BootstrapURLFragment *string                      `json:"bootstrapUrlFragment"`
	ReturnURL            *string                      `json:"returnUrl"`
	WorkspaceRoot        *string                      `json:"workspaceRoot"`
	SettaFilesLocation   *string                      `json:"settaFilesLocation"`
	SettaFilesRoot       *string                      `json:"settaFilesRoot"`
	RuntimeRoot          *string                      `json:"runtimeRoot"`
	SettaHome            *string                      `json:"settaHome"`
	Profile              *string                      `json:"profile"`
	SessionID            *string                      `json:"sessionId"`
	StartedNew           *bool                        `json:"startedNew"`
	Session              *launchSessionInfoResponse   `json:"session"`
	RemoteCmdResolved    *string                      `json:"remoteCmdResolved"`
	Error                *workspaceLaunchErrorPayload `json:"error"`
}

type launchSessionInfoResponse struct {
	ID                     string `json:"id"`
	WorkspacePath          string `json:"workspacePath"`
	WorkspacePathCanonical string `json:"workspacePathCanonical"`
	Host                   string `json:"host"`
	Port                   int    `json:"port"`
	PID                    int    `json:"pid"`
	StartedAt              string `json:"startedAt"`
}

func RegisterWorkspaceLaunchRoutes(router chi.Router, deps WorkspaceLaunchRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsDeployment() {
		return nil
	}
	if deps.Auth == nil {
		return fmt.Errorf("auth service is required")
	}
	if deps.Intents == nil {
		return fmt.Errorf("workspace launch intent service is required")
	}
	if deps.Launch == nil {
		return fmt.Errorf("workspace local launch service is required")
	}

	router.Post(RouteCreateWorkspaceLaunchIntent, createWorkspaceLaunchIntentHandler(deps.Auth, deps.Intents))
	router.Post(RouteLaunch, launchWorkspaceHandler(deps.Auth, deps.Launch))
	return nil
}

func createWorkspaceLaunchIntentHandler(authService *auth.Service, intentService *workspacelaunch.IntentService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[createWorkspaceLaunchIntentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		currentSession, ok := authService.CurrentSession()
		if !ok {
			writeJSON(w, http.StatusOK, createWorkspaceLaunchIntentResponse{
				Ok: false,
				Error: &workspaceLaunchErrorPayload{
					Code:    "Unauthorized",
					Message: "Missing session.",
				},
			})
			return
		}

		result, err := intentService.CreateIntent(workspacelaunch.CreateIntentInput{
			Request:        payload.LaunchRequest,
			ReturnURL:      payload.ReturnURL,
			RequestOrigin:  frontendorigins.ResolveRequestOrigin(r, true),
			CurrentSession: currentSession,
		})
		if err != nil {
			intentErr, ok := err.(*workspacelaunch.IntentError)
			if !ok {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
			writeJSON(w, http.StatusOK, createWorkspaceLaunchIntentResponse{
				Ok: false,
				Error: &workspaceLaunchErrorPayload{
					Code:    intentErr.Code,
					Message: intentErr.Message,
				},
			})
			return
		}

		writeJSON(w, http.StatusOK, createWorkspaceLaunchIntentResponse{
			Ok:                true,
			LaunchIntentToken: &result.LaunchIntentToken,
			RequestedAt:       &result.RequestedAt,
			Error:             nil,
		})
	}
}

func launchWorkspaceHandler(authService *auth.Service, launchService *workspacelaunch.LocalLaunchService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[workspacelaunch.Request](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		currentSession, ok := authService.CurrentSession()
		if !ok {
			returnURL := frontendorigins.ResolveRequestOrigin(r, true)
			writeJSON(w, http.StatusOK, launchResponse{
				Ok:        false,
				ReturnURL: stringPointer(workspacelaunchBuildSafeLaunchReturnURL(returnURL)),
				Error: &workspaceLaunchErrorPayload{
					Code:    "Unauthorized",
					Message: "Missing session.",
				},
			})
			return
		}

		result, err := launchService.Launch(workspacelaunch.LocalLaunchInput{
			Request:        payload,
			RequestOrigin:  frontendorigins.ResolveRequestOrigin(r, true),
			CurrentSession: currentSession,
		})
		if err != nil {
			launchErr, ok := err.(*workspacelaunch.LaunchError)
			if !ok {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
			writeJSON(w, http.StatusOK, launchResponse{
				Ok:        false,
				ReturnURL: stringPointer(launchErr.ReturnURL),
				Error: &workspaceLaunchErrorPayload{
					Code:    launchErr.Code,
					Message: launchErr.Message,
				},
			})
			return
		}

		writeJSON(w, http.StatusOK, launchResponse{
			Ok:                   true,
			BootstrapURLFragment: stringPointer(result.BootstrapURLFragment),
			ReturnURL:            stringPointer(result.ReturnURL),
			WorkspaceRoot:        stringPointer(result.WorkspaceRoot),
			SettaFilesLocation:   launchSettaFilesLocationPointer(result),
			SettaFilesRoot:       stringPointer(result.SettaFilesRoot),
			RuntimeRoot:          stringPointer(result.RuntimeRoot),
			SettaHome:            stringPointer(result.SettaHome),
			Profile:              result.Profile,
			SessionID:            stringPointer(result.SessionID),
			StartedNew:           boolPointer(result.StartedNew),
			Session: &launchSessionInfoResponse{
				ID:                     result.Session.ID,
				WorkspacePath:          result.Session.WorkspacePath,
				WorkspacePathCanonical: result.Session.WorkspacePathCanonical,
				Host:                   result.Session.Host,
				Port:                   result.Session.Port,
				PID:                    result.Session.PID,
				StartedAt:              result.Session.StartedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
			},
			RemoteCmdResolved: result.RemoteCmdResolved,
			Error:             nil,
		})
	}
}

func launchSettaFilesLocationPointer(result workspacelaunch.LocalLaunchResult) *string {
	if result.UsesExplicitSettaFiles {
		return nil
	}
	return stringPointer(result.SettaFilesLocation)
}

func workspacelaunchBuildSafeLaunchReturnURL(requestOrigin string) string {
	normalizedRequestOrigin := frontendorigins.NormalizeOrigin(requestOrigin)
	if normalizedRequestOrigin == "" {
		return "/home"
	}
	return normalizedRequestOrigin + "/home"
}
