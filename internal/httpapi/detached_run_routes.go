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
	"setta/internal/runs"
)

const RouteRunDetached = "/runDetached"
const RouteGetRunStatus = "/getRunStatus"
const RouteCancelRun = "/cancelRun"

type DetachedRunRouteDependencies struct {
	ModePolicy modes.Policy
	Planner    *runs.Planner
	Runs       *detachedruns.Manager
}

type RunDetachedRequest struct {
	ProjectID               string               `json:"projectConfigId"`
	EntrySectionID          string               `json:"entrySectionId"`
	RunSnapshotMode         runs.RunSnapshotMode `json:"runSnapshotMode"`
	SectionVariantOverrides map[string]string    `json:"sectionVariantOverrides"`
	ParamOverrides          map[string]string    `json:"paramOverrides"`
	Tags                    map[string]string    `json:"tags"`
}

type RunDetachedResponse struct {
	RunID  string              `json:"runId"`
	Status detachedruns.Status `json:"status"`
}

type GetRunStatusRequest struct {
	RunID string `json:"runId"`
}

type CancelRunRequest struct {
	RunID string `json:"runId"`
}

func RegisterDetachedRunRoutes(router chi.Router, deps DetachedRunRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.Planner == nil {
		return fmt.Errorf("detached run planner is required")
	}
	if deps.Runs == nil {
		return fmt.Errorf("detached run manager is required")
	}

	guard := modeRequirementMiddleware(deps.ModePolicy, deps.ModePolicy.RequireNotLauncher)
	router.With(guard).Post(RouteRunDetached, runDetachedHandler(deps))
	router.With(guard).Post(RouteGetRunStatus, getRunStatusHandler(deps))
	router.With(guard).Post(RouteCancelRun, cancelRunHandler(deps))
	return nil
}

func runDetachedHandler(deps DetachedRunRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ModePolicy.IsDeployment() {
			writeError(w, r, http.StatusBadRequest, "detached_runs_unsupported", "Detached runs are not supported in deployment mode.")
			return
		}

		payload, err := decodeStrictJSONBody[RunDetachedRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if payload.RunSnapshotMode == runs.RunSnapshotModeNever {
			writeError(w, r, http.StatusBadRequest, "invalid_run_detached_request", "Detached runs always snapshot; runSnapshotMode=never is not supported.")
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

		writeJSON(w, http.StatusOK, RunDetachedResponse{
			RunID:  run.RunID,
			Status: run.Status,
		})
	}
}

func getRunStatusHandler(deps DetachedRunRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
			if errors.Is(err, detachedruns.ErrRunNotFound) {
				writeError(w, r, http.StatusNotFound, "detached_run_not_found", "Detached run not found.")
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, run)
	}
}

func cancelRunHandler(deps DetachedRunRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
			if errors.Is(err, detachedruns.ErrRunNotFound) {
				writeError(w, r, http.StatusNotFound, "detached_run_not_found", "Detached run not found.")
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, run)
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
		writeError(w, r, http.StatusBadRequest, "invalid_run_detached_request", err.Error())
		return true
	default:
		return false
	}
}
