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

type InterruptTerminalProcessesRequest struct {
	ProjectID string `json:"projectId"`
}

type InterruptTerminalProcessesResponse struct {
	InterruptedSessionCount int `json:"interruptedSessionCount"`
}

type RunCodeRequest struct {
	ProjectID                string                              `json:"projectConfigId"`
	SectionID                string                              `json:"sectionId,omitempty"`
	TerminalSectionID        string                              `json:"terminalSectionId,omitempty"`
	CLIID                    string                              `json:"cliId,omitempty"`
	RunSnapshotMode          runs.RunSnapshotMode                `json:"runSnapshotMode,omitempty" ts_type:"RunSnapshotMode | null"`
	DrawSnapshotsBySectionID map[string]binarypayload.ContentRef `json:"drawSnapshotsBySectionId,omitempty"`
	SectionVariantOverrides  map[string]string                   `json:"sectionVariantOverrides,omitempty"`
	ParamOverrides           map[string]string                   `json:"paramOverrides,omitempty"`
}

func RegisterTerminalRoutes(router chi.Router, deps TerminalRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	documentOnly := openAPIDocumentOnlyFromRouter(router)
	if deps.Terminals == nil && !documentOnly {
		return fmt.Errorf("terminal service is required")
	}
	if deps.RunCode == nil && !documentOnly {
		return fmt.Errorf("run-code service is required")
	}

	if deps.ModePolicy.IsDeployment() {
		if deps.ShareSessions == nil && !documentOnly {
			return fmt.Errorf("share session store is required in deployment mode")
		}
		if deps.Deployment == nil && !documentOnly {
			return fmt.Errorf("deployment runtime is required in deployment mode")
		}
		shareResolver := modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.ShareSessions,
		}
		shareGuard := RequireShareSession(shareResolver)
		registerOpenAPIPost[DeleteTerminalsRequest, openAPIJSONNull](
			router.With(shareGuard),
			"deleteTerminals",
			RouteDeleteTerminals,
			deleteTerminalsHandler(deps.Terminals, deps.Deployment),
			withOpenAPITags("Terminal"),
			withOpenAPISummary("Delete terminal sessions for the requested terminal sections."),
			withOpenAPIModeRequirement("not-launcher"),
		)
		registerOpenAPIPost[InterruptTerminalProcessesRequest, InterruptTerminalProcessesResponse](
			router.With(shareGuard),
			"interruptTerminalProcesses",
			RouteInterruptTerminalProcesses,
			interruptTerminalProcessesHandler(deps.Terminals, deps.Deployment),
			withOpenAPITags("Terminal"),
			withOpenAPISummary("Interrupt running terminal processes for a project."),
			withOpenAPIModeRequirement("not-launcher"),
		)
		registerOpenAPIPost[RunCodeRequest, openAPIJSONNull](
			router,
			"runCode",
			RouteRunCode,
			runCodeHandler(deps.RunCode, &shareResolver),
			withOpenAPITags("Terminal"),
			withOpenAPISummary("Run code for the requested section or generated entrypoint."),
			withOpenAPIModeRequirement("not-launcher"),
		)
		return nil
	}
	ideGuard := RequireFullIDERuntime(deps.ModePolicy)
	registerOpenAPIPost[DeleteTerminalsRequest, openAPIJSONNull](
		router.With(ideGuard),
		"deleteTerminals",
		RouteDeleteTerminals,
		deleteTerminalsHandler(deps.Terminals, nil),
		withOpenAPITags("Terminal"),
		withOpenAPISummary("Delete terminal sessions for the requested terminal sections."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[InterruptTerminalProcessesRequest, InterruptTerminalProcessesResponse](
		router.With(ideGuard),
		"interruptTerminalProcesses",
		RouteInterruptTerminalProcesses,
		interruptTerminalProcessesHandler(deps.Terminals, nil),
		withOpenAPITags("Terminal"),
		withOpenAPISummary("Interrupt running terminal processes for a project."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[RunCodeRequest, openAPIJSONNull](
		router.With(ideGuard),
		"runCode",
		RouteRunCode,
		runCodeHandler(deps.RunCode, nil),
		withOpenAPITags("Terminal"),
		withOpenAPISummary("Run code for the requested section or generated entrypoint."),
		withOpenAPIModeRequirement("not-launcher"),
	)
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

func runCodeHandler(runCodeService *runs.Service, shareResolver *modes.Resolver) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[RunCodeRequest](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		requestInfo, err := resolveRunCodeRequestInfo(r, shareResolver)
		if err != nil {
			if writeRunCodeShareSessionError(w, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		r = withModesRequestInfo(r, requestInfo)

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
				writeDetail(w, http.StatusForbidden, runCodePolicyDetail(err))
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
				writeDetail(w, http.StatusBadRequest, normalizeRunRequestDetail(err))
			default:
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}

func resolveRunCodeRequestInfo(r *http.Request, shareResolver *modes.Resolver) (modes.RequestInfo, error) {
	if shareResolver != nil {
		return shareResolver.ResolveRequest(r)
	}
	return modes.RequireRequestInfo(r)
}

func writeRunCodeShareSessionError(w http.ResponseWriter, err error) bool {
	var missingShareSession *modes.MissingShareSessionError
	if errors.As(err, &missingShareSession) {
		writeDetail(w, http.StatusBadRequest, missingShareSession.Error())
		return true
	}

	var unknownShareSession *modes.UnknownShareSessionError
	if errors.As(err, &unknownShareSession) {
		writeDetail(w, http.StatusNotFound, unknownShareSession.Error())
		return true
	}

	return false
}

func runCodePolicyDetail(err error) string {
	switch {
	case errors.Is(err, runs.ErrDeploymentRunDenied):
		return "Deployment policy disallows run and terminal access."
	case errors.Is(err, runs.ErrDeploymentVariantDenied):
		return "Deployment policy disallows variant changes."
	case errors.Is(err, runs.ErrDeploymentSingleRunOnly):
		return "Deployment policy allows only one run per session."
	case errors.Is(err, runs.ErrParamOverridesDenied):
		return "Deployment policy disallows parameter changes."
	case errors.Is(err, runs.ErrCodeParamOverridesDenied):
		return "Deployment mode disallows CodeParam edits."
	default:
		return normalizeRunRequestDetail(err)
	}
}

func normalizeRunRequestDetail(err error) string {
	detail := strings.TrimSpace(err.Error())
	detail = strings.TrimPrefix(detail, "runs: ")

	switch {
	case errors.Is(err, projectstate.ErrSectionNotFound):
		if sectionID := extractLastQuotedValue(detail); sectionID != "" {
			return fmt.Sprintf("Unknown section id: %s", sectionID)
		}
	case errors.Is(err, projectstate.ErrSectionVariantNotFound):
		if variantID := extractLastQuotedValue(detail); variantID != "" {
			return fmt.Sprintf("Unknown variant id: %s", variantID)
		}
	case errors.Is(err, projectstate.ErrSectionVariantMembership):
		sectionID := extractTaggedValue(detail, "section")
		variantID := extractTaggedValue(detail, "variant")
		if sectionID != "" && variantID != "" {
			return fmt.Sprintf("Variant %s is not part of section %s", variantID, sectionID)
		}
	case errors.Is(err, projectstate.ErrCodeSectionRequired):
		if sectionID := extractLastQuotedValue(detail); sectionID != "" {
			return fmt.Sprintf("Missing code section for run: %s", sectionID)
		}
	}

	if suffix, ok := strings.CutPrefix(detail, "invalid param override key: "); ok {
		return "Invalid param override key: " + strings.ReplaceAll(suffix, `"`, `'`)
	}

	return detail
}

func extractLastQuotedValue(detail string) string {
	end := strings.LastIndex(detail, `"`)
	if end <= 0 {
		return ""
	}
	start := strings.LastIndex(detail[:end], `"`)
	if start < 0 || start+1 >= end {
		return ""
	}
	return detail[start+1 : end]
}

func extractTaggedValue(detail string, tag string) string {
	prefix := tag + `="`
	start := strings.Index(detail, prefix)
	if start < 0 {
		return ""
	}
	remainder := detail[start+len(prefix):]
	end := strings.Index(remainder, `"`)
	if end < 0 {
		return ""
	}
	return remainder[:end]
}
