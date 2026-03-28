package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
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

type WorkspaceLaunchErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type LaunchSettaFilesLocation config.FilesLocation

const (
	LaunchSettaFilesLocationAuto   LaunchSettaFilesLocation = LaunchSettaFilesLocation(config.FilesLocationAuto)
	LaunchSettaFilesLocationLocal  LaunchSettaFilesLocation = LaunchSettaFilesLocation(config.FilesLocationLocal)
	LaunchSettaFilesLocationGlobal LaunchSettaFilesLocation = LaunchSettaFilesLocation(config.FilesLocationGlobal)
)

type LaunchResolvedSettaFilesLocation config.ResolvedFilesLocation

const (
	LaunchResolvedSettaFilesLocationLocal  LaunchResolvedSettaFilesLocation = LaunchResolvedSettaFilesLocation(config.ResolvedFilesLocationLocal)
	LaunchResolvedSettaFilesLocationGlobal LaunchResolvedSettaFilesLocation = LaunchResolvedSettaFilesLocation(config.ResolvedFilesLocationGlobal)
)

type LaunchRequest struct {
	LaunchIntentToken  *string                   `json:"launchIntentToken,omitempty"`
	WorkspaceRoot      *string                   `json:"workspaceRoot,omitempty"`
	Profile            *string                   `json:"profile,omitempty"`
	SettaHome          *string                   `json:"settaHome,omitempty"`
	SettaFilesRoot     *string                   `json:"settaFilesRoot,omitempty"`
	SettaFilesLocation *LaunchSettaFilesLocation `json:"settaFilesLocation,omitempty"`
	RuntimeRoot        *string                   `json:"runtimeRoot,omitempty"`
	SSHTarget          *string                   `json:"sshTarget,omitempty"`
	SSHArgs            *string                   `json:"sshArgs,omitempty"`
	RemoteCmd          *string                   `json:"remoteCmd,omitempty"`
	LocalPort          *int                      `json:"localPort,omitempty"`

	request workspacelaunch.Request
}

func (r *LaunchRequest) UnmarshalJSON(data []byte) error {
	type launchRequestPayload struct {
		LaunchIntentToken  *string                   `json:"launchIntentToken"`
		WorkspaceRoot      *string                   `json:"workspaceRoot"`
		Profile            *string                   `json:"profile"`
		SettaHome          *string                   `json:"settaHome"`
		SettaFilesRoot     *string                   `json:"settaFilesRoot"`
		SettaFilesLocation *LaunchSettaFilesLocation `json:"settaFilesLocation"`
		RuntimeRoot        *string                   `json:"runtimeRoot"`
		SSHTarget          *string                   `json:"sshTarget"`
		SSHArgs            *string                   `json:"sshArgs"`
		RemoteCmd          *string                   `json:"remoteCmd"`
		LocalPort          *int                      `json:"localPort"`
	}

	var decoded launchRequestPayload
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var request workspacelaunch.Request
	if err := json.Unmarshal(data, &request); err != nil {
		return err
	}

	r.LaunchIntentToken = decoded.LaunchIntentToken
	r.WorkspaceRoot = decoded.WorkspaceRoot
	r.Profile = decoded.Profile
	r.SettaHome = decoded.SettaHome
	r.SettaFilesRoot = decoded.SettaFilesRoot
	r.SettaFilesLocation = decoded.SettaFilesLocation
	r.RuntimeRoot = decoded.RuntimeRoot
	r.SSHTarget = decoded.SSHTarget
	r.SSHArgs = decoded.SSHArgs
	r.RemoteCmd = decoded.RemoteCmd
	r.LocalPort = decoded.LocalPort
	r.request = request
	return nil
}

func (r LaunchRequest) toWorkspaceLaunchRequest() workspacelaunch.Request {
	return r.request
}

type CreateWorkspaceLaunchIntentRequest struct {
	LaunchRequest LaunchRequest `json:"launchRequest"`
	ReturnURL     string        `json:"returnUrl"`
}

type CreateWorkspaceLaunchIntentResponse struct {
	Ok                bool                         `json:"ok"`
	LaunchIntentToken *string                      `json:"launchIntentToken"`
	RequestedAt       *int64                       `json:"requestedAt"`
	Error             *WorkspaceLaunchErrorPayload `json:"error"`
}

type LaunchResponse struct {
	Ok                   bool                              `json:"ok"`
	BootstrapURLFragment *string                           `json:"bootstrapUrlFragment"`
	ReturnURL            *string                           `json:"returnUrl"`
	WorkspaceRoot        *string                           `json:"workspaceRoot"`
	SettaFilesLocation   *LaunchResolvedSettaFilesLocation `json:"settaFilesLocation"`
	SettaFilesRoot       *string                           `json:"settaFilesRoot"`
	RuntimeRoot          *string                           `json:"runtimeRoot"`
	SettaHome            *string                           `json:"settaHome"`
	Profile              *string                           `json:"profile"`
	SessionID            *string                           `json:"sessionId"`
	StartedNew           *bool                             `json:"startedNew"`
	Session              *LaunchSessionInfo                `json:"session"`
	RemoteCmdResolved    *string                           `json:"remoteCmdResolved"`
	Error                *WorkspaceLaunchErrorPayload      `json:"error"`
}

type LaunchSessionInfo struct {
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
		payload, err := decodeJSONBody[CreateWorkspaceLaunchIntentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		currentSession, ok := authService.CurrentSession()
		if !ok {
			writeJSON(w, http.StatusOK, CreateWorkspaceLaunchIntentResponse{
				Ok: false,
				Error: &WorkspaceLaunchErrorPayload{
					Code:    "Unauthorized",
					Message: "Missing session.",
				},
			})
			return
		}

		result, err := intentService.CreateIntent(workspacelaunch.CreateIntentInput{
			Request:        payload.LaunchRequest.toWorkspaceLaunchRequest(),
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
			writeJSON(w, http.StatusOK, CreateWorkspaceLaunchIntentResponse{
				Ok: false,
				Error: &WorkspaceLaunchErrorPayload{
					Code:    intentErr.Code,
					Message: intentErr.Message,
				},
			})
			return
		}

		writeJSON(w, http.StatusOK, CreateWorkspaceLaunchIntentResponse{
			Ok:                true,
			LaunchIntentToken: &result.LaunchIntentToken,
			RequestedAt:       &result.RequestedAt,
			Error:             nil,
		})
	}
}

func launchWorkspaceHandler(authService *auth.Service, launchService *workspacelaunch.LocalLaunchService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[LaunchRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		currentSession, ok := authService.CurrentSession()
		if !ok {
			returnURL := frontendorigins.ResolveRequestOrigin(r, true)
			writeJSON(w, http.StatusOK, LaunchResponse{
				Ok:        false,
				ReturnURL: stringPointer(workspacelaunchBuildSafeLaunchReturnURL(returnURL)),
				Error: &WorkspaceLaunchErrorPayload{
					Code:    "Unauthorized",
					Message: "Missing session.",
				},
			})
			return
		}

		result, err := launchService.Launch(workspacelaunch.LocalLaunchInput{
			Request:        payload.toWorkspaceLaunchRequest(),
			RequestOrigin:  frontendorigins.ResolveRequestOrigin(r, true),
			CurrentSession: currentSession,
		})
		if err != nil {
			launchErr, ok := err.(*workspacelaunch.LaunchError)
			if !ok {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
			writeJSON(w, http.StatusOK, LaunchResponse{
				Ok:        false,
				ReturnURL: stringPointer(launchErr.ReturnURL),
				Error: &WorkspaceLaunchErrorPayload{
					Code:    launchErr.Code,
					Message: launchErr.Message,
				},
			})
			return
		}

		writeJSON(w, http.StatusOK, LaunchResponse{
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
			Session: &LaunchSessionInfo{
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

func launchSettaFilesLocationPointer(result workspacelaunch.LocalLaunchResult) *LaunchResolvedSettaFilesLocation {
	if result.UsesExplicitSettaFiles {
		return nil
	}
	location := LaunchResolvedSettaFilesLocation(result.SettaFilesLocation)
	return &location
}

func workspacelaunchBuildSafeLaunchReturnURL(requestOrigin string) string {
	normalizedRequestOrigin := frontendorigins.NormalizeOrigin(requestOrigin)
	if normalizedRequestOrigin == "" {
		return "/home"
	}
	return normalizedRequestOrigin + "/home"
}
