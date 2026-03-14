package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	binarypayload "setta/internal/binary"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/runs"
	"setta/internal/terminals"
)

const RouteDeleteTerminals = "/deleteTerminals"
const RouteKillSubprocesses = "/killSubprocesses"
const RouteInterruptTerminalProcesses = "/interruptTerminalProcesses"
const RouteRunCode = "/runCode"

type TerminalRouteDependencies struct {
	ModePolicy    modes.Policy
	ShareSessions modes.ShareSessionStore
	Deployment    *deployments.Runtime
	Terminals     *terminals.Service
	RunCode       *runs.Service
}

type DeleteTerminalsRequest struct {
	SectionIDs []string `json:"sectionIds"`
}

type KillSubprocessesRequest struct {
	ProjectID string `json:"projectConfigId"`
}

type InterruptTerminalProcessesRequest struct {
	ProjectID string `json:"projectId"`
}

type InterruptTerminalProcessesResponse struct {
	InterruptedSessionCount int `json:"interruptedSessionCount"`
}

type RunCodeRequest struct {
	ProjectID                string                              `json:"projectConfigId"`
	SectionID                string                              `json:"sectionId"`
	TerminalSectionID        string                              `json:"terminalSectionId"`
	CLIID                    string                              `json:"cliId"`
	RunSnapshotMode          runs.RunSnapshotMode                `json:"runSnapshotMode"`
	DrawSnapshotsBySectionID map[string]binarypayload.ContentRef `json:"drawSnapshotsBySectionId"`
	SectionVariantOverrides  map[string]string                   `json:"sectionVariantOverrides"`
	ParamOverrides           map[string]string                   `json:"paramOverrides"`
}

func RegisterTerminalRoutes(router chi.Router, deps TerminalRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.Terminals == nil {
		return fmt.Errorf("terminal service is required")
	}
	if deps.RunCode == nil {
		return fmt.Errorf("run-code service is required")
	}

	if deps.ModePolicy.IsDeployment() {
		if deps.ShareSessions == nil {
			return fmt.Errorf("share session store is required in deployment mode")
		}
		if deps.Deployment == nil {
			return fmt.Errorf("deployment runtime is required in deployment mode")
		}
		shareGuard := RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.ShareSessions,
		})
		router.With(shareGuard).Post(RouteDeleteTerminals, deleteTerminalsHandler(deps.Terminals, deps.Deployment))
		router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(RouteKillSubprocesses, killSubprocessesHandler(deps.Terminals))
		router.With(shareGuard).Post(RouteInterruptTerminalProcesses, interruptTerminalProcessesHandler(deps.Terminals, deps.Deployment))
		router.With(shareGuard).Post(RouteRunCode, runCodeHandler(deps.RunCode))
		return nil
	}
	ideGuard := RequireFullIDERuntime(deps.ModePolicy)
	router.With(ideGuard).Post(RouteDeleteTerminals, deleteTerminalsHandler(deps.Terminals, nil))
	router.With(ideGuard).Post(RouteKillSubprocesses, killSubprocessesHandler(deps.Terminals))
	router.With(ideGuard).Post(RouteInterruptTerminalProcesses, interruptTerminalProcessesHandler(deps.Terminals, nil))
	router.With(ideGuard).Post(RouteRunCode, runCodeHandler(deps.RunCode))
	return nil
}

func ensureTerminalRunAccessAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deployment *deployments.Runtime,
) bool {
	if deployment == nil {
		return true
	}

	requestInfo, err := modes.RequireRequestInfo(r)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	if deployment.Policy().AllowRun {
		return true
	}

	writeError(w, r, http.StatusForbidden, "deployment_policy_denied", "Deployment policy disallows run and terminal access.")
	return false
}

func deleteTerminalsHandler(terminalService *terminals.Service, deployment *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureTerminalRunAccessAllowed(w, r, deployment) {
			return
		}
		payload, err := decodeJSONBody[DeleteTerminalsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		requestInfo, ok := modes.RequestInfoFromRequest(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		for _, sectionID := range payload.SectionIDs {
			sectionID = strings.TrimSpace(sectionID)
			if sectionID == "" {
				writeError(w, r, http.StatusBadRequest, "invalid_terminal_section", "Terminal section id is required.")
				return
			}

			terminalID := terminals.BuildTerminalID(sectionID, requestInfo.ShareSessionID)
			if err := terminalService.Delete(r.Context(), terminalID); err != nil {
				if errors.Is(err, terminals.ErrUnknownSession) {
					continue
				}
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
		}

		writeJSON(w, http.StatusOK, nil)
	}
}

func killSubprocessesHandler(terminalService *terminals.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[KillSubprocessesRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		requestInfo, ok := modes.RequestInfoFromRequest(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "invalid_project_id", "Project id is required.")
			return
		}

		// The active frontend still uses the Python-era killSubprocesses route
		// name, but the historical behavior was an interrupt of foreground child
		// processes rather than a hard kill.
		if _, err := terminalService.InterruptProject(projectID, requestInfo.ShareSessionID); err != nil {
			if errors.Is(err, terminals.ErrInterruptUnsupported) {
				writeError(w, r, http.StatusNotImplemented, "terminal_interrupt_unsupported", "Terminal interrupt is not supported on this platform.")
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}

func interruptTerminalProcessesHandler(terminalService *terminals.Service, deployment *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureTerminalRunAccessAllowed(w, r, deployment) {
			return
		}
		payload, err := decodeJSONBody[InterruptTerminalProcessesRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		requestInfo, ok := modes.RequestInfoFromRequest(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "invalid_project_id", "Project id is required.")
			return
		}

		interruptedCount, err := terminalService.InterruptProject(projectID, requestInfo.ShareSessionID)
		if err != nil {
			if errors.Is(err, terminals.ErrInterruptUnsupported) {
				writeError(w, r, http.StatusNotImplemented, "terminal_interrupt_unsupported", "Terminal interrupt is not supported on this platform.")
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, InterruptTerminalProcessesResponse{
			InterruptedSessionCount: interruptedCount,
		})
	}
}

func runCodeHandler(runCodeService *runs.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[RunCodeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		requestInfo, ok := modes.RequestInfoFromRequest(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if strings.TrimSpace(payload.CLIID) != "" {
			writeError(w, r, http.StatusBadRequest, "unsupported_run_code_cli", "Run code CLI output is not supported in Go yet.")
			return
		}

		if _, err := runCodeService.RunCode(r.Context(), runs.RunCodeRequest{
			ProjectID:                payload.ProjectID,
			SectionID:                payload.SectionID,
			TerminalSectionID:        payload.TerminalSectionID,
			RunSnapshotMode:          payload.RunSnapshotMode,
			DrawSnapshotsBySectionID: payload.DrawSnapshotsBySectionID,
			SectionVariantOverrides:  payload.SectionVariantOverrides,
			ParamOverrides:           payload.ParamOverrides,
			ShareSessionID:           requestInfo.ShareSessionID,
		}); err != nil {
			switch {
			case errors.Is(err, runs.ErrDeploymentRunDenied),
				errors.Is(err, runs.ErrDeploymentVariantDenied),
				errors.Is(err, runs.ErrDeploymentSingleRunOnly),
				errors.Is(err, runs.ErrParamOverridesDenied),
				errors.Is(err, runs.ErrCodeParamOverridesDenied):
				writeError(w, r, http.StatusForbidden, "deployment_policy_denied", err.Error())
			case errors.Is(err, deployments.ErrUnknownSession):
				writeError(w, r, http.StatusNotFound, "unknown_share_session", err.Error())
			case errors.Is(err, runs.ErrRunTargetRequired),
				errors.Is(err, runs.ErrRunTargetNotRunnable),
				errors.Is(err, runs.ErrRunSnapshotModeInvalid),
				errors.Is(err, runs.ErrCodeBindingRequired),
				errors.Is(err, runs.ErrGeneratedEntryBindingRequired),
				errors.Is(err, runs.ErrPluginCodegenRunUnsupported),
				errors.Is(err, runs.ErrInvalidParamOverrideKey),
				errors.Is(err, runs.ErrPasswordParamOverrideUnsupported),
				errors.Is(err, runs.ErrDropzoneParamOverrideUnsupported),
				errors.Is(err, binarypayload.ErrContentIDRequired),
				errors.Is(err, binarypayload.ErrInvalidContentID),
				errors.Is(err, binarypayload.ErrPayloadNotFound),
				errors.Is(err, projectstate.ErrProjectIDRequired),
				errors.Is(err, projectstate.ErrProjectNotFound),
				errors.Is(err, projectstate.ErrSectionIDRequired),
				errors.Is(err, projectstate.ErrSectionNotFound),
				errors.Is(err, projectstate.ErrSectionVariantIDRequired),
				errors.Is(err, projectstate.ErrSectionVariantNotFound),
				errors.Is(err, projectstate.ErrSectionActiveVariantNotFound),
				errors.Is(err, projectstate.ErrSectionVariantMembership),
				errors.Is(err, projectstate.ErrCodeSectionRequired),
				errors.Is(err, projectstate.ErrDrawSectionRequired):
				writeError(w, r, http.StatusBadRequest, "invalid_run_code_request", err.Error())
			default:
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}
