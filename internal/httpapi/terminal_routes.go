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

type TerminalRouteDependencies struct {
	ModePolicy modes.Policy
	Terminals  *terminals.Service
}

type DeleteTerminalsRequest struct {
	SectionIDs []string `json:"sectionIds"`
}

func RegisterTerminalRoutes(router chi.Router, deps TerminalRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.Terminals == nil {
		return fmt.Errorf("terminal service is required")
	}

	router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(RouteDeleteTerminals, deleteTerminalsHandler(deps.Terminals))
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
