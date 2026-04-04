package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/statemachineruns"
)

const RouteStartStateMachineRun = "/startStateMachineRun"
const RouteStopStateMachineRun = "/stopStateMachineRun"
const RouteResetStateMachine = "/resetStateMachine"
const RouteGetStateMachineRun = "/getStateMachineRun"

type StateMachineRunRouteDependencies struct {
	ModePolicy    modes.Policy
	ShareSessions modes.ShareSessionStore
	Runtime       *statemachineruns.Runtime
}

type StartStateMachineRunRequest struct {
	ProjectConfigID string  `json:"projectConfigId"`
	MachineGroupID  string  `json:"machineGroupId"`
	StartSectionID  *string `json:"startSectionId,omitempty"`
}

type StopStateMachineRunRequest struct {
	ProjectConfigID string `json:"projectConfigId"`
	MachineGroupID  string `json:"machineGroupId"`
}

type ResetStateMachineRequest struct {
	ProjectConfigID string `json:"projectConfigId"`
	MachineGroupID  string `json:"machineGroupId"`
}

type GetStateMachineRunRequest struct {
	ProjectConfigID string `json:"projectConfigId"`
	MachineGroupID  string `json:"machineGroupId"`
}

type StateMachineRunControlResponse struct {
	AlreadyStopped bool    `json:"alreadyStopped"`
	StoppedRunID   *string `json:"stoppedRunId,omitempty"`
}

func RegisterStateMachineRunRoutes(router chi.Router, deps StateMachineRunRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsLauncher() {
		return nil
	}
	if deps.ModePolicy.IsDeployment() && deps.ShareSessions == nil {
		return fmt.Errorf("share session store is required in deployment mode")
	}
	if deps.ModePolicy.IsIDE() && deps.Runtime == nil {
		return fmt.Errorf("state machine runtime is required in ide mode")
	}

	ideGuard := RequireIDEMode(deps.ModePolicy)
	router.With(ideGuard).Post(RouteStartStateMachineRun, startStateMachineRunHandler(deps.Runtime))
	router.With(ideGuard).Post(RouteStopStateMachineRun, stopStateMachineRunHandler(deps.Runtime))
	router.With(ideGuard).Post(RouteResetStateMachine, resetStateMachineHandler(deps.Runtime))

	if deps.ModePolicy.IsDeployment() {
		if deps.Runtime == nil {
			return nil
		}
		router.With(RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.ShareSessions,
		})).Post(RouteGetStateMachineRun, getStateMachineRunHandler(deps.Runtime))
	} else {
		router.With(ideGuard).Post(RouteGetStateMachineRun, getStateMachineRunHandler(deps.Runtime))
	}

	return nil
}

func startStateMachineRunHandler(runtime *statemachineruns.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if runtime == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if runtime.Disabled() {
			writeError(w, r, http.StatusServiceUnavailable, "state_machine_run_unavailable", "State machine runs are not available.")
			return
		}

		payload, err := decodeStrictJSONBody[StartStateMachineRunRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		machineGroupID := strings.TrimSpace(payload.MachineGroupID)
		if machineGroupID == "" {
			writeError(w, r, http.StatusBadRequest, "machine_group_id_required", "Machine group id is required.")
			return
		}

		shareSessionID, ok := stateMachineRunShareSessionID(w, r)
		if !ok {
			return
		}
		run, err := runtime.StartRun(projectConfigID, machineGroupID, normalizeOptionalBodyString(payload.StartSectionID), shareSessionID)
		if err != nil {
			if writeStateMachineRunError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, run)
	}
}

func stopStateMachineRunHandler(runtime *statemachineruns.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if runtime == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if runtime.Disabled() {
			writeError(w, r, http.StatusServiceUnavailable, "state_machine_run_unavailable", "State machine runs are not available.")
			return
		}

		payload, err := decodeStrictJSONBody[StopStateMachineRunRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		machineGroupID := strings.TrimSpace(payload.MachineGroupID)
		if machineGroupID == "" {
			writeError(w, r, http.StatusBadRequest, "machine_group_id_required", "Machine group id is required.")
			return
		}

		shareSessionID, ok := stateMachineRunShareSessionID(w, r)
		if !ok {
			return
		}
		run, err := runtime.StopRun(projectConfigID, machineGroupID, shareSessionID)
		if err != nil {
			if writeStateMachineRunError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if run == nil {
			writeJSON(w, http.StatusOK, StateMachineRunControlResponse{AlreadyStopped: true})
			return
		}
		writeJSON(w, http.StatusOK, StateMachineRunControlResponse{
			AlreadyStopped: false,
			StoppedRunID:   stringPointer(run.ID),
		})
	}
}

func resetStateMachineHandler(runtime *statemachineruns.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if runtime == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if runtime.Disabled() {
			writeError(w, r, http.StatusServiceUnavailable, "state_machine_run_unavailable", "State machine runs are not available.")
			return
		}

		payload, err := decodeStrictJSONBody[ResetStateMachineRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		machineGroupID := strings.TrimSpace(payload.MachineGroupID)
		if machineGroupID == "" {
			writeError(w, r, http.StatusBadRequest, "machine_group_id_required", "Machine group id is required.")
			return
		}

		shareSessionID, ok := stateMachineRunShareSessionID(w, r)
		if !ok {
			return
		}
		run, err := runtime.ResetMachine(projectConfigID, machineGroupID, shareSessionID)
		if err != nil {
			if writeStateMachineRunError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if run == nil {
			writeJSON(w, http.StatusOK, StateMachineRunControlResponse{AlreadyStopped: true})
			return
		}
		writeJSON(w, http.StatusOK, StateMachineRunControlResponse{
			AlreadyStopped: false,
			StoppedRunID:   stringPointer(run.ID),
		})
	}
}

func getStateMachineRunHandler(runtime *statemachineruns.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if runtime == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if runtime.Disabled() {
			writeError(w, r, http.StatusServiceUnavailable, "state_machine_run_unavailable", "State machine runs are not available.")
			return
		}

		payload, err := decodeStrictJSONBody[GetStateMachineRunRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		machineGroupID := strings.TrimSpace(payload.MachineGroupID)
		if machineGroupID == "" {
			writeError(w, r, http.StatusBadRequest, "machine_group_id_required", "Machine group id is required.")
			return
		}

		shareSessionID, ok := stateMachineRunShareSessionID(w, r)
		if !ok {
			return
		}
		run, err := runtime.GetLatestRun(projectConfigID, machineGroupID, shareSessionID)
		if err != nil {
			if writeStateMachineRunError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if run == nil {
			writeError(w, r, http.StatusNotFound, "state_machine_run_not_found", "State machine run not found.")
			return
		}
		writeJSON(w, http.StatusOK, run)
	}
}

func stateMachineRunShareSessionID(w http.ResponseWriter, r *http.Request) (*string, bool) {
	requestInfo, err := modes.RequireRequestInfo(r)
	if err != nil {
		if writeModesError(w, r, err) {
			return nil, false
		}
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return nil, false
	}
	if trimmedShareSessionID := strings.TrimSpace(requestInfo.ShareSessionID); trimmedShareSessionID != "" {
		return &trimmedShareSessionID, true
	}
	return nil, true
}

func writeStateMachineRunError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case errors.Is(err, statemachineruns.ErrRuntimeUnavailable):
		writeError(w, r, http.StatusServiceUnavailable, "state_machine_run_unavailable", "State machine runs are not available.")
	case errors.Is(err, statemachineruns.ErrInvalidStateMachineInput):
		writeError(w, r, http.StatusBadRequest, "state_machine_run_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, agentruns.ErrRunNotFound):
		writeError(w, r, http.StatusNotFound, "state_machine_run_not_found", "State machine run not found.")
	case errors.Is(err, externalagents.ErrChatEngineMismatch), errors.Is(err, managedchat.ErrChatEngineMismatch):
		writeError(w, r, http.StatusConflict, "chat_engine_mismatch", err.Error())
	case errors.Is(err, externalagents.ErrChatProjectConfigMismatch), errors.Is(err, managedchat.ErrChatProjectConfigMismatch):
		writeError(w, r, http.StatusConflict, "chat_project_config_mismatch", err.Error())
	default:
		return false
	}
	return true
}

func normalizeOptionalBodyString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmedValue := strings.TrimSpace(*value)
	if trimmedValue == "" {
		return nil
	}
	return &trimmedValue
}
