package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/gitread"
	"setta/internal/modes"
)

const (
	RouteGetGitStatus         = "/git/status"
	RouteGetGitDiff           = "/git/diff"
	RouteGetGitLog            = "/git/log"
	RouteGetGitCommitDetails  = "/git/commitDetails"
	RouteGetGitCommitFileDiff = "/git/commitFileDiff"
)

type GitRouteDependencies struct {
	ModePolicy modes.Policy
	Git        GitReadService
}

type GitReadService interface {
	Status(ctx context.Context) (gitread.StatusResponse, error)
	Diff(ctx context.Context, request gitread.DiffRequest) (gitread.DiffResponse, error)
	Log(ctx context.Context, request gitread.LogRequest) (gitread.LogResponse, error)
	CommitDetails(ctx context.Context, request gitread.CommitDetailsRequest) (gitread.CommitDetailsResponse, error)
	CommitFileDiff(ctx context.Context, request gitread.CommitFileDiffRequest) (gitread.CommitFileDiffResponse, error)
}

func RegisterGitRoutes(router chi.Router, deps GitRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Git == nil {
		return fmt.Errorf("git service is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetGitStatus, getGitStatusHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetGitDiff, getGitDiffHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetGitLog, getGitLogHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetGitCommitDetails, getGitCommitDetailsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetGitCommitFileDiff, getGitCommitFileDiffHandler(deps))
	return nil
}

func getGitStatusHandler(deps GitRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, err := decodeJSONBody[struct{}](r); err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Git == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		response, err := deps.Git.Status(r.Context())
		if err != nil {
			writeGitRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func getGitDiffHandler(deps GitRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[gitread.DiffRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Git == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		response, err := deps.Git.Diff(r.Context(), payload)
		if err != nil {
			writeGitRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func getGitLogHandler(deps GitRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[gitread.LogRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Git == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		response, err := deps.Git.Log(r.Context(), payload)
		if err != nil {
			writeGitRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func getGitCommitDetailsHandler(deps GitRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[gitread.CommitDetailsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Git == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		response, err := deps.Git.CommitDetails(r.Context(), payload)
		if err != nil {
			writeGitRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func getGitCommitFileDiffHandler(deps GitRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[gitread.CommitFileDiffRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Git == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		response, err := deps.Git.CommitFileDiff(r.Context(), payload)
		if err != nil {
			writeGitRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func writeGitRouteError(w http.ResponseWriter, r *http.Request, err error) {
	var gitErr *gitread.Error
	if errors.As(err, &gitErr) {
		switch gitErr.Kind {
		case gitread.ErrorInvalidRequest:
			writeError(w, r, http.StatusBadRequest, "invalid_request", gitErr.Message)
			return
		case gitread.ErrorInvalidRevision:
			writeError(w, r, http.StatusBadRequest, "invalid_revision", gitErr.Message)
			return
		case gitread.ErrorInvalidCommit:
			writeError(w, r, http.StatusBadRequest, "invalid_commit_hash", gitErr.Message)
			return
		case gitread.ErrorNotFound:
			writeError(w, r, http.StatusNotFound, "git_not_found", gitErr.Message)
			return
		case gitread.ErrorNotGitRepo:
			writeError(w, r, http.StatusBadRequest, "git_repo_required", gitErr.Message)
			return
		case gitread.ErrorPathNotFile:
			writeError(w, r, http.StatusBadRequest, "path_not_file", gitErr.Message)
			return
		case gitread.ErrorPathForbidden:
			writeError(w, r, http.StatusForbidden, "path_forbidden", gitErr.Message)
			return
		case gitread.ErrorPathNotFound:
			writeError(w, r, http.StatusNotFound, "path_not_found", gitErr.Message)
			return
		case gitread.ErrorTimedOut:
			writeError(w, r, http.StatusGatewayTimeout, "git_timeout", gitErr.Message)
			return
		case gitread.ErrorCommandFailed:
			writeError(w, r, http.StatusInternalServerError, "git_command_failed", gitErr.Message)
			return
		}
	}
	writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
}
