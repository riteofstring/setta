package httpapi

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/prompttemplates"
)

const RouteGetPromptTemplates = "/getPromptTemplates"

type PromptTemplateRouteDependencies struct {
	ModePolicy modes.Policy
	Templates  *prompttemplates.Store
}

func RegisterPromptTemplateRoutes(router chi.Router, deps PromptTemplateRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Templates == nil {
		return fmt.Errorf("prompt template store is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetPromptTemplates, getPromptTemplatesHandler(deps.Templates))
	return nil
}

func getPromptTemplatesHandler(store *prompttemplates.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		templates, err := store.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, templates)
	}
}
