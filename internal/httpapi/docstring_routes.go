package httpapi

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/docstringmarkdown"
	"setta/internal/modes"
)

const RouteDocstringToMarkdown = "/docstringToMarkdown"

type DocstringRouteDependencies struct {
	ModePolicy modes.Policy
}

type DocstringToMarkdownRequest struct {
	Docstring string `json:"docstring"`
}

func RegisterDocstringRoutes(router chi.Router, deps DocstringRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}

	registerOpenAPIPost[DocstringToMarkdownRequest, string](
		router.With(RequireIDEMode(deps.ModePolicy)),
		"docstringToMarkdown",
		RouteDocstringToMarkdown,
		docstringToMarkdownHandler(),
		withOpenAPITags("Docstring"),
		withOpenAPISummary("Convert a docstring into Markdown."),
		withOpenAPIModeRequirement("ide"),
	)
	return nil
}

func docstringToMarkdownHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DocstringToMarkdownRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		markdown, err := docstringmarkdown.Convert(payload.Docstring)
		if err != nil {
			if errors.Is(err, docstringmarkdown.ErrUnknownFormat) {
				writeError(w, r, http.StatusBadRequest, "unknown_docstring_format", "Unknown docstring format.")
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, markdown)
	}
}
