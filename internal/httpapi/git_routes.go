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

var gitRouteErrorDescriptors = map[gitread.ErrorKind]routeErrorDescriptor{
	gitread.ErrorInvalidRequest: {
		status: http.StatusBadRequest,
		code:   "invalid_request",
	},
	gitread.ErrorInvalidRevision: {
		status: http.StatusBadRequest,
		code:   "invalid_revision",
	},
	gitread.ErrorInvalidCommit: {
		status: http.StatusBadRequest,
		code:   "invalid_commit_hash",
	},
	gitread.ErrorNotFound: {
		status: http.StatusNotFound,
		code:   "git_not_found",
	},
	gitread.ErrorNotGitRepo: {
		status: http.StatusBadRequest,
		code:   "git_repo_required",
	},
	gitread.ErrorPathNotFile: {
		status: http.StatusBadRequest,
		code:   "path_not_file",
	},
	gitread.ErrorPathForbidden: {
		status: http.StatusForbidden,
		code:   "path_forbidden",
	},
	gitread.ErrorPathNotFound: {
		status: http.StatusNotFound,
		code:   "path_not_found",
	},
	gitread.ErrorTimedOut: {
		status: http.StatusGatewayTimeout,
		code:   "git_timeout",
	},
	gitread.ErrorCommandFailed: {
		status: http.StatusInternalServerError,
		code:   "git_command_failed",
	},
}

func RegisterGitRoutes(router chi.Router, deps GitRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Git == nil && !openAPIDocumentOnlyFromRouter(router) {
		return fmt.Errorf("git service is required in ide mode")
	}

	ideRouter := router.With(RequireIDEMode(deps.ModePolicy))
	registerOpenAPIPostNoRequest[gitread.StatusResponse](
		ideRouter,
		"getGitStatus",
		RouteGetGitStatus,
		getGitStatusHandler(deps),
		withOpenAPITags("Git"),
		withOpenAPISummary("Get the current git status for the workspace repository."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[gitread.DiffRequest, gitread.DiffResponse](
		ideRouter,
		"getGitDiff",
		RouteGetGitDiff,
		getGitDiffHandler(deps),
		withOpenAPITags("Git"),
		withOpenAPISummary("Get a git diff for a single file."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[gitread.LogRequest, gitread.LogResponse](
		ideRouter,
		"getGitLog",
		RouteGetGitLog,
		getGitLogHandler(deps),
		withOpenAPITags("Git"),
		withOpenAPISummary("Get paginated git history for the workspace repository."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[gitread.CommitDetailsRequest, gitread.CommitDetailsResponse](
		ideRouter,
		"getGitCommitDetails",
		RouteGetGitCommitDetails,
		getGitCommitDetailsHandler(deps),
		withOpenAPITags("Git"),
		withOpenAPISummary("Get the metadata and changed files for a commit."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[gitread.CommitFileDiffRequest, gitread.CommitFileDiffResponse](
		ideRouter,
		"getGitCommitFileDiff",
		RouteGetGitCommitFileDiff,
		getGitCommitFileDiffHandler(deps),
		withOpenAPITags("Git"),
		withOpenAPISummary("Get the diff for a single file within a commit."),
		withOpenAPIModeRequirement("ide"),
	)
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
	if !errors.As(err, &gitErr) {
		writeInternalRouteError(w, r)
		return
	}
	descriptor, ok := gitRouteErrorDescriptors[gitErr.Kind]
	if !ok {
		writeInternalRouteError(w, r)
		return
	}
	writeMappedRouteError(w, r, descriptor, gitErr.Message)
}
