package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/terminals"
)

const RouteDeleteTerminals = "/deleteTerminals"
const RouteInterruptTerminalProcesses = "/interruptTerminalProcesses"

type TerminalRouteDependencies struct {
	ModePolicy modes.Policy
	Terminals  *terminals.Service
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

func RegisterTerminalRoutes(router chi.Router, deps TerminalRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.Terminals == nil {
		return fmt.Errorf("terminal service is required")
	}

	router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(RouteDeleteTerminals, deleteTerminalsHandler(deps.Terminals))
	router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(RouteInterruptTerminalProcesses, interruptTerminalProcessesHandler(deps.Terminals))
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
