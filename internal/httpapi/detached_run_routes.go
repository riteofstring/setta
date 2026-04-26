package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/detachedruns"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/runs"
)

const RouteRunDetached = "/runDetached"
const RouteGetRunStatus = "/getRunStatus"
const RouteCancelRun = "/cancelRun"
const RouteGetRunnerSummary = "/getRunnerSummary"

type DetachedRunRouteDependencies struct {
	ModePolicy   modes.Policy
	Planner      *runs.Planner
	Runs         *detachedruns.Manager
	ProjectState *projectstate.Runtime
}

type RunDetachedRequest struct {
	ProjectID               string               `json:"projectConfigId"`
	EntrySectionID          string               `json:"entrySectionId"`
	RunSnapshotMode         runs.RunSnapshotMode `json:"runSnapshotMode"`
	SectionVariantOverrides map[string]string    `json:"sectionVariantOverrides"`
	ParamOverrides          map[string]string    `json:"paramOverrides"`
	Tags                    map[string]string    `json:"tags"`
}

type GetRunStatusRequest struct {
	RunID string `json:"runId"`
}

type CancelRunRequest struct {
	RunID string `json:"runId"`
}

type GetRunnerSummaryRequest struct {
	ProjectID string `json:"projectConfigId"`
}

func RegisterDetachedRunRoutes(router chi.Router, deps DetachedRunRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	documentOnly := openAPIDocumentOnlyFromRouter(router)
	if deps.Planner == nil && !documentOnly {
		return fmt.Errorf("detached run planner is required")
	}
	if deps.Runs == nil && !documentOnly {
		return fmt.Errorf("detached run manager is required")
	}
	if deps.ModePolicy.IsIDE() && deps.ProjectState == nil && !documentOnly {
		return fmt.Errorf("project state runtime is required in ide mode")
	}

	registerOpenAPIPost[RunDetachedRequest, detachedruns.Run](
		router,
		"runDetached",
		RouteRunDetached,
		runDetachedHandler(deps),
		withOpenAPITags("Detached Runs"),
		withOpenAPISummary("Start a detached run for a project entrypoint."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetRunStatusRequest, detachedruns.Run](
		router,
		"getRunStatus",
		RouteGetRunStatus,
		getRunStatusHandler(deps),
		withOpenAPITags("Detached Runs"),
		withOpenAPISummary("Get the latest detached-run status."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[CancelRunRequest, detachedruns.Run](
		router,
		"cancelRun",
		RouteCancelRun,
		cancelRunHandler(deps),
		withOpenAPITags("Detached Runs"),
		withOpenAPISummary("Cancel a detached run."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetRunnerSummaryRequest, pythonsdkcontracts.RunnerSummarySnapshot](
		router.With(RequireIDEMode(deps.ModePolicy)),
		"getRunnerSummary",
		RouteGetRunnerSummary,
		getRunnerSummaryHandler(deps),
		withOpenAPITags("Detached Runs"),
		withOpenAPISummary("Get the runner summary snapshot for a project."),
		withOpenAPIModeRequirement("ide"),
	)
	return nil
}

func runDetachedHandler(deps DetachedRunRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireDetachedRunRouteAccess(w, r, deps.ModePolicy) {
			return
		}
		if deps.ModePolicy.IsDeployment() {
			writeDetail(w, http.StatusBadRequest, "Detached runs are not supported in deployment mode.")
			return
		}

		payload, err := decodeStrictJSONBody[RunDetachedRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if payload.RunSnapshotMode == runs.RunSnapshotModeNever {
			writeDetail(w, http.StatusBadRequest, "Detached runs always snapshot; runSnapshotMode=never is not supported.")
			return
		}

		plan, err := deps.Planner.Plan(runs.PlanRequest{
			ProjectID:               payload.ProjectID,
			SectionID:               payload.EntrySectionID,
			RunSnapshotMode:         payload.RunSnapshotMode,
			SectionVariantOverrides: payload.SectionVariantOverrides,
			ParamOverrides:          payload.ParamOverrides,
		})
		if err != nil {
			if writeDetachedRunPlanError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		var entrySectionID *string
		if plan.TargetKind == projectstate.RunTargetKindManualCode && strings.TrimSpace(plan.SectionID) != "" {
			entrySectionID = &plan.SectionID
		}

		run, err := deps.Runs.StartRun(detachedruns.Spec{
			Command:         plan.Command,
			SnapshotPath:    plan.EntryPath,
			ProjectConfigID: plan.ProjectID,
			EntrySectionID:  entrySectionID,
			Tags:            payload.Tags,
		})
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, run)
	}
}

func getRunStatusHandler(deps DetachedRunRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireDetachedRunRouteAccess(w, r, deps.ModePolicy) {
			return
		}
		if deps.ModePolicy.IsDeployment() {
			writeError(w, r, http.StatusBadRequest, "detached_runs_unsupported", "Detached runs are not supported in deployment mode.")
			return
		}

		payload, err := decodeStrictJSONBody[GetRunStatusRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		runID := strings.TrimSpace(payload.RunID)
		if runID == "" {
			writeError(w, r, http.StatusBadRequest, "run_id_required", "Run id is required.")
			return
		}

		run, err := deps.Runs.GetStatus(runID)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, run)
	}
}

func cancelRunHandler(deps DetachedRunRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireDetachedRunRouteAccess(w, r, deps.ModePolicy) {
			return
		}
		if deps.ModePolicy.IsDeployment() {
			writeError(w, r, http.StatusBadRequest, "detached_runs_unsupported", "Detached runs are not supported in deployment mode.")
			return
		}

		payload, err := decodeStrictJSONBody[CancelRunRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		runID := strings.TrimSpace(payload.RunID)
		if runID == "" {
			writeError(w, r, http.StatusBadRequest, "run_id_required", "Run id is required.")
			return
		}

		run, err := deps.Runs.CancelRun(runID)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, run)
	}
}

func getRunnerSummaryHandler(deps DetachedRunRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeStrictJSONBody[GetRunnerSummaryRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := deps.ProjectState.RunnerSummarySnapshot(payload.ProjectID)
		if err != nil {
			switch {
			case errors.Is(err, projectstate.ErrProjectIDRequired), errors.Is(err, projectstate.ErrProjectNotFound):
				writeDetail(w, http.StatusBadRequest, normalizeRunRequestDetail(err))
			default:
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}

		writeJSON(w, http.StatusOK, snapshot)
	}
}

func writeDetachedRunPlanError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case errors.Is(err, runs.ErrRunTargetRequired),
		errors.Is(err, runs.ErrRunTargetNotRunnable),
		errors.Is(err, runs.ErrRunSnapshotModeInvalid),
		errors.Is(err, runs.ErrCodeBindingRequired),
		errors.Is(err, runs.ErrGeneratedEntryBindingRequired),
		errors.Is(err, runs.ErrPluginCodegenRunUnsupported),
		errors.Is(err, runs.ErrInvalidParamOverrideKey),
		errors.Is(err, runs.ErrPasswordParamOverrideUnsupported),
		errors.Is(err, runs.ErrDropzoneParamOverrideUnsupported),
		errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectstate.ErrProjectNotFound),
		errors.Is(err, projectstate.ErrSectionIDRequired),
		errors.Is(err, projectstate.ErrSectionNotFound),
		errors.Is(err, projectstate.ErrSectionVariantIDRequired),
		errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionActiveVariantNotFound),
		errors.Is(err, projectstate.ErrSectionVariantMembership),
		errors.Is(err, projectstate.ErrCodeSectionRequired):
		writeDetail(w, http.StatusBadRequest, normalizeRunRequestDetail(err))
		return true
	default:
		return false
	}
}

func requireDetachedRunRouteAccess(w http.ResponseWriter, r *http.Request, policy modes.Policy) bool {
	if err := policy.RequireNotLauncher(); err != nil {
		var violation *modes.Violation
		if errors.As(err, &violation) {
			writeDetail(w, violation.StatusCode, violation.Message)
			return false
		}
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	return true
}
