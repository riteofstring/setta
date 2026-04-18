package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/lsp"
	"setta/internal/lspcompletion"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

const (
	RouteRestartLanguageServer                   = "/restartLanguageServer"
	RouteTypeCheck                               = "/typeCheck"
	RouteClearTextFieldCompletion                = "/clearTextFieldCompletion"
	RouteTextFieldCompletion                     = "/textFieldCompletion"
	RouteOutputAccessorCompletion                = "/outputAccessorCompletion"
	RouteCodeAreaCompletion                      = "/codeAreaCompletion"
	RouteGenCodePrefixCompletion                 = "/genCodePrefixCompletion"
	RouteGenCodeSuffixCompletion                 = "/genCodeSuffixCompletion"
	RouteGetLatestLSPDiagnostics                 = "/getLatestLspDiagnostics"
	RouteSetTypeErrorIgnore                      = "/setTypeErrorIgnore"
	RouteSetCodeSectionDiagnosticsMute           = "/setCodeSectionDiagnosticsMute"
	RouteSetCodeSectionDiagnosticCodeSuppression = "/setCodeSectionDiagnosticCodeSuppression"
)

type LSPAdminService interface {
	Restart(context.Context, projectstate.Document) error
	TypeCheckProject(context.Context, projectstate.Document, string) error
}

type LSPRouteDependencies struct {
	ModePolicy   modes.Policy
	ProjectState *projectstate.Runtime
	Diagnostics  *projectstate.LSPDiagnosticsRegistry
	Completions  *lspcompletion.Service
	Admin        LSPAdminService
}

type TypeCheckRequest struct {
	ProjectID string `json:"projectConfigId"`
}

type GetLatestLSPDiagnosticsRequest struct {
	ProjectID string `json:"projectConfigId"`
}

type SetTypeErrorIgnoreRequest struct {
	ProjectID        string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	ParamInfoID      *string `json:"paramInfoId"`
	IgnoreTypeErrors bool    `json:"ignoreTypeErrors"`
}

type SetCodeSectionDiagnosticsMuteRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	Mute      bool   `json:"mute"`
}

type SetCodeSectionDiagnosticCodeSuppressionRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	Code      any    `json:"code"`
	Suppress  bool   `json:"suppress"`
}

type ClearTextFieldCompletionRequest struct {
	ProjectID   string  `json:"projectConfigId"`
	SectionID   string  `json:"sectionId"`
	ParamInfoID *string `json:"paramInfoId"`
}

type TextFieldCompletionRequest struct {
	ProjectID   string  `json:"projectConfigId"`
	SectionID   string  `json:"sectionId"`
	ParamInfoID *string `json:"paramInfoId"`
	FullText    string  `json:"fullText"`
	Position    int     `json:"position"`
}

type OutputAccessorCompletionRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	FullText  string `json:"fullText"`
	Position  int    `json:"position"`
}

type CodeAreaCompletionRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	FullText  string `json:"fullText"`
	Position  int    `json:"position"`
}

type GenCodePrefixCompletionRequest struct {
	ProjectID string `json:"projectConfigId"`
	FullText  string `json:"fullText"`
	Position  int    `json:"position"`
}

type GenCodeSuffixCompletionRequest struct {
	ProjectID string `json:"projectConfigId"`
	FullText  string `json:"fullText"`
	Position  int    `json:"position"`
}

func RegisterLSPRoutes(router chi.Router, deps LSPRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	documentOnly := openAPIDocumentOnlyFromRouter(router)
	if deps.ModePolicy.IsIDE() && !documentOnly {
		if deps.ProjectState == nil {
			return fmt.Errorf("project runtime is required in ide mode")
		}
		if deps.Diagnostics == nil {
			return fmt.Errorf("lsp diagnostics registry is required in ide mode")
		}
		if deps.Completions == nil {
			return fmt.Errorf("lsp completion service is required in ide mode")
		}
		if deps.Admin == nil {
			return fmt.Errorf("lsp admin service is required in ide mode")
		}
	}

	modeRequirement := "not-deployment-and-not-launcher"

	registerOpenAPIPostNoRequest[openAPIJSONNull](
		router,
		"restartLanguageServer",
		RouteRestartLanguageServer,
		withLSPAdminModeGuard(deps.ModePolicy, restartLanguageServerHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Restart the language server against the current project snapshot."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[TypeCheckRequest, openAPIJSONNull](
		router,
		"typeCheck",
		RouteTypeCheck,
		withLSPAdminModeGuard(deps.ModePolicy, typeCheckHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Request a manual type check for a project."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[ClearTextFieldCompletionRequest, openAPIJSONNull](
		router,
		"clearTextFieldCompletion",
		RouteClearTextFieldCompletion,
		withLSPProjectModeGuard(deps.ModePolicy, clearTextFieldCompletionHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Clear pending text-field completion state for a section param."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[TextFieldCompletionRequest, []lspcompletion.CodeMirrorCompletion](
		router,
		"textFieldCompletion",
		RouteTextFieldCompletion,
		withLSPProjectModeGuard(deps.ModePolicy, textFieldCompletionHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Resolve text-field completions for a callable or parameter input."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[OutputAccessorCompletionRequest, []lspcompletion.CodeMirrorCompletion](
		router,
		"outputAccessorCompletion",
		RouteOutputAccessorCompletion,
		withLSPProjectModeGuard(deps.ModePolicy, outputAccessorCompletionHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Resolve output accessor completions for a section."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[CodeAreaCompletionRequest, []lspcompletion.CodeMirrorCompletion](
		router,
		"codeAreaCompletion",
		RouteCodeAreaCompletion,
		withLSPProjectModeGuard(deps.ModePolicy, codeAreaCompletionHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Resolve code area completions for a code section."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[GenCodePrefixCompletionRequest, []lspcompletion.CodeMirrorCompletion](
		router,
		"genCodePrefixCompletion",
		RouteGenCodePrefixCompletion,
		withLSPProjectModeGuard(deps.ModePolicy, genCodePrefixCompletionHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Resolve completions for generated-code prefix text."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[GenCodeSuffixCompletionRequest, []lspcompletion.CodeMirrorCompletion](
		router,
		"genCodeSuffixCompletion",
		RouteGenCodeSuffixCompletion,
		withLSPProjectModeGuard(deps.ModePolicy, genCodeSuffixCompletionHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Resolve completions for generated-code suffix text."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[GetLatestLSPDiagnosticsRequest, projectstate.LSPDiagnosticsPayload](
		router,
		"getLatestLspDiagnostics",
		RouteGetLatestLSPDiagnostics,
		withLSPProjectModeGuard(deps.ModePolicy, getLatestLSPDiagnosticsHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Get the latest language-server diagnostics snapshot for a project."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[SetCodeSectionDiagnosticsMuteRequest, openAPIJSONNull](
		router,
		"setCodeSectionDiagnosticsMute",
		RouteSetCodeSectionDiagnosticsMute,
		withLSPDiagnosticsModeGuard(deps.ModePolicy, setCodeSectionDiagnosticsMuteHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Mute or unmute code-section diagnostics."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	registerOpenAPIPost[SetCodeSectionDiagnosticCodeSuppressionRequest, openAPIJSONNull](
		router,
		"setCodeSectionDiagnosticCodeSuppression",
		RouteSetCodeSectionDiagnosticCodeSuppression,
		withLSPDiagnosticsModeGuard(deps.ModePolicy, setCodeSectionDiagnosticCodeSuppressionHandler(deps)),
		withOpenAPITags("LSP"),
		withOpenAPISummary("Suppress or unsuppress a code diagnostic code for a section."),
		withOpenAPIModeRequirement(modeRequirement),
	)
	return nil
}

func withLSPAdminModeGuard(policy modes.Policy, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := lspAdminModeDetail(policy); blocked {
			writeDetail(w, http.StatusForbidden, detail)
			return
		}
		next(w, r)
	}
}

func withLSPProjectModeGuard(policy modes.Policy, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := lspProjectModeDetail(policy); blocked {
			writeDetail(w, http.StatusForbidden, detail)
			return
		}
		next(w, r)
	}
}

func withLSPDiagnosticsModeGuard(policy modes.Policy, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := lspDiagnosticsModeDetail(policy); blocked {
			writeDetail(w, http.StatusForbidden, detail)
			return
		}
		next(w, r)
	}
}

func lspAdminModeDetail(policy modes.Policy) (string, bool) {
	switch {
	case policy.IsDeployment():
		return "Deployment mode does not allow this endpoint.", true
	case policy.IsLauncher():
		return "Launcher mode does not allow this endpoint.", true
	default:
		return "", false
	}
}

func lspProjectModeDetail(policy modes.Policy) (string, bool) {
	switch {
	case policy.IsDeployment():
		return "Deployment mode disallows language server features.", true
	case policy.IsLauncher():
		return "Launcher mode does not allow this endpoint.", true
	default:
		return "", false
	}
}

func lspDiagnosticsModeDetail(policy modes.Policy) (string, bool) {
	switch {
	case policy.IsDeployment():
		return "Deployment mode disallows diagnostics settings.", true
	case policy.IsLauncher():
		return "Launcher mode does not allow this endpoint.", true
	default:
		return "", false
	}
}

func restartLanguageServerHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ProjectState == nil || deps.Admin == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		snapshot := deps.ProjectState.Snapshot()
		if err := deps.Admin.Restart(r.Context(), snapshot.Document); err != nil {
			if errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
				writeError(
					w,
					r,
					http.StatusConflict,
					"language_server_not_configured",
					"Language server is not configured. Select a plugin and restart after it is available.",
				)
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func typeCheckHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[TypeCheckRequest](r, "projectConfigId")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Admin == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot := deps.ProjectState.Snapshot()
		if err := deps.Admin.TypeCheckProject(r.Context(), snapshot.Document, projectID); err != nil {
			if errors.Is(err, projectstate.ErrProjectNotFound) ||
				errors.Is(err, projectstate.ErrProjectIDRequired) {
				writeJSON(w, http.StatusOK, nil)
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func clearTextFieldCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[ClearTextFieldCompletionRequest](r, "projectConfigId", "sectionId")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.Completions.ClearTextFieldCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			sectionID,
			trimOptionalString(payload.ParamInfoID),
		); err != nil {
			if errors.Is(err, projectstate.ErrSectionNotFound) {
				writeJSON(w, http.StatusOK, nil)
				return
			}
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func textFieldCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[TextFieldCompletionRequest](r, "projectConfigId", "sectionId", "fullText", "position")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.TextFieldCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			sectionID,
			trimOptionalString(payload.ParamInfoID),
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func outputAccessorCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[OutputAccessorCompletionRequest](r, "projectConfigId", "sectionId", "fullText", "position")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.OutputAccessorCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			sectionID,
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func codeAreaCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[CodeAreaCompletionRequest](r, "projectConfigId", "sectionId", "fullText", "position")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.CodeAreaCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			sectionID,
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func genCodePrefixCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[GenCodePrefixCompletionRequest](r, "projectConfigId", "fullText", "position")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.GenCodePrefixCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func genCodeSuffixCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[GenCodeSuffixCompletionRequest](r, "projectConfigId", "fullText", "position")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.GenCodeSuffixCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func getLatestLSPDiagnosticsHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[GetLatestLSPDiagnosticsRequest](r, "projectConfigId")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Diagnostics == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, deps.Diagnostics.Snapshot(projectID))
	}
}

func setCodeSectionDiagnosticsMuteHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[SetCodeSectionDiagnosticsMuteRequest](r, "projectConfigId", "sectionId", "mute")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Diagnostics == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := deps.ProjectState.SetCodeSectionDiagnosticsMute(r.Context(), projectID, sectionID, payload.Mute)
		if err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		project, err := snapshot.Document.ProjectByID(projectID)
		if err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		if err := deps.Diagnostics.ReapplyCodeSectionIgnoreState(project, sectionID); err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeSectionDiagnosticCodeSuppressionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeLSPRequest[SetCodeSectionDiagnosticCodeSuppressionRequest](r, "projectConfigId", "sectionId", "code", "suppress")
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Diagnostics == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := deps.ProjectState.SetCodeSectionDiagnosticCodeSuppression(
			r.Context(),
			projectID,
			sectionID,
			payload.Code,
			payload.Suppress,
		)
		if err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		project, err := snapshot.Document.ProjectByID(projectID)
		if err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		if err := deps.Diagnostics.ReapplyCodeSectionIgnoreState(project, sectionID); err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func trimOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func optionalTrimmedStringPointer(value *string) *string {
	trimmed := trimOptionalString(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func decodeLSPRequest[T any](r *http.Request, requiredFields ...string) (T, error) {
	var payload T
	if r.Body == nil {
		if len(requiredFields) > 0 {
			return payload, fmt.Errorf("%s: Field required", requiredFields[0])
		}
		return payload, nil
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return payload, err
	}
	trimmedBody := bytes.TrimSpace(body)
	if len(trimmedBody) == 0 {
		trimmedBody = []byte("{}")
	}

	if err := json.Unmarshal(trimmedBody, &payload); err != nil {
		return payload, err
	}
	if len(requiredFields) == 0 {
		return payload, nil
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(trimmedBody, &fields); err != nil {
		return payload, err
	}
	for _, field := range requiredFields {
		value, ok := fields[field]
		if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return payload, fmt.Errorf("%s: Field required", field)
		}
	}
	return payload, nil
}

func writeLSPCompletionError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectNotFound),
		errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeLSPDiagnosticsMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectNotFound),
		errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	case errors.Is(err, projectstate.ErrCodeSectionRequired),
		errors.Is(err, projectstate.ErrInvalidCodeSectionDiagnosticCode),
		errors.Is(err, projectstate.ErrInvalidCodeSectionDiagnosticsIgnoreState):
		writeError(w, r, http.StatusBadRequest, "invalid_lsp_diagnostics_request", "Invalid LSP diagnostics request.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeTypeErrorIgnoreMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectNotFound),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrTypeErrorIgnoreUnsupported),
		errors.Is(err, projectstate.ErrInvalidTypeErrorIgnoreState):
		writeError(w, r, http.StatusBadRequest, "invalid_type_error_ignore_request", "Invalid type-error ignore request.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
