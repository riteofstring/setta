package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	binarypayload "setta/internal/binary"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/runs"
	"setta/internal/terminals"
)

const RouteDeleteTerminals = "/deleteTerminals"
const RouteInterruptTerminalProcesses = "/interruptTerminalProcesses"
const RouteRunCode = "/runCode"

type TerminalRouteDependencies struct {
	ModePolicy modes.Policy
	Terminals  *terminals.Service
	RunCode    *runs.Service
}

type DeleteTerminalsRequest struct {
	SectionIDs []string `json:"sectionIds"`
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

	router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(RouteDeleteTerminals, deleteTerminalsHandler(deps.Terminals))
	router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(RouteInterruptTerminalProcesses, interruptTerminalProcessesHandler(deps.Terminals))
	router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(RouteRunCode, runCodeHandler(deps.RunCode))
	return nil
}

func deleteTerminalsHandler(terminalService *terminals.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

func interruptTerminalProcessesHandler(terminalService *terminals.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
		if len(payload.ParamOverrides) > 0 {
			writeError(w, r, http.StatusBadRequest, "unsupported_run_code_overrides", "Run code parameter overrides are not supported on the Go HTTP route yet.")
			return
		}

		if _, err := runCodeService.RunCode(r.Context(), runs.RunCodeRequest{
			ProjectID:                payload.ProjectID,
			SectionID:                payload.SectionID,
			TerminalSectionID:        payload.TerminalSectionID,
			RunSnapshotMode:          payload.RunSnapshotMode,
			DrawSnapshotsBySectionID: payload.DrawSnapshotsBySectionID,
			SectionVariantOverrides:  payload.SectionVariantOverrides,
			ShareSessionID:           requestInfo.ShareSessionID,
		}); err != nil {
			switch {
			case errors.Is(err, runs.ErrRunTargetRequired),
				errors.Is(err, runs.ErrRunTargetNotRunnable),
				errors.Is(err, runs.ErrRunSnapshotModeInvalid),
				errors.Is(err, runs.ErrCodeBindingRequired),
				errors.Is(err, runs.ErrInvalidParamOverrideKey),
				errors.Is(err, runs.ErrParamOverridesUnsupported),
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
