package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"setta/internal/artifacts"
	"setta/internal/gitread"
)

func TestWriteGitRouteErrorMapsKnownKinds(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name   string
		err    *gitread.Error
		status int
		code   string
	}{
		{name: "invalid request", err: &gitread.Error{Kind: gitread.ErrorInvalidRequest, Message: "bad request"}, status: http.StatusBadRequest, code: "invalid_request"},
		{name: "invalid revision", err: &gitread.Error{Kind: gitread.ErrorInvalidRevision, Message: "bad revision"}, status: http.StatusBadRequest, code: "invalid_revision"},
		{name: "invalid commit", err: &gitread.Error{Kind: gitread.ErrorInvalidCommit, Message: "bad commit"}, status: http.StatusBadRequest, code: "invalid_commit_hash"},
		{name: "not found", err: &gitread.Error{Kind: gitread.ErrorNotFound, Message: "missing"}, status: http.StatusNotFound, code: "git_not_found"},
		{name: "not repo", err: &gitread.Error{Kind: gitread.ErrorNotGitRepo, Message: "not repo"}, status: http.StatusBadRequest, code: "git_repo_required"},
		{name: "path not file", err: &gitread.Error{Kind: gitread.ErrorPathNotFile, Message: "not file"}, status: http.StatusBadRequest, code: "path_not_file"},
		{name: "path forbidden", err: &gitread.Error{Kind: gitread.ErrorPathForbidden, Message: "forbidden"}, status: http.StatusForbidden, code: "path_forbidden"},
		{name: "path not found", err: &gitread.Error{Kind: gitread.ErrorPathNotFound, Message: "not found"}, status: http.StatusNotFound, code: "path_not_found"},
		{name: "timed out", err: &gitread.Error{Kind: gitread.ErrorTimedOut, Message: "timed out"}, status: http.StatusGatewayTimeout, code: "git_timeout"},
		{name: "command failed", err: &gitread.Error{Kind: gitread.ErrorCommandFailed, Message: "command failed"}, status: http.StatusInternalServerError, code: "git_command_failed"},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitStatus, nil)
			writeGitRouteError(response, request, testCase.err)

			assertRouteErrorResponse(t, response, testCase.status, testCase.code, testCase.err.Message)
		})
	}
}

func TestWriteGitRouteErrorFallsBackToInternalError(t *testing.T) {
	t.Parallel()

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitStatus, nil)
	writeGitRouteError(response, request, errors.New("boom"))

	assertRouteErrorResponse(t, response, http.StatusInternalServerError, "internal_error", "Internal Server Error")
}

func TestWriteArtifactRouteErrorMapsKnownKinds(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name   string
		err    *artifacts.Error
		status int
		code   string
	}{
		{name: "invalid request", err: &artifacts.Error{Kind: artifacts.ErrorInvalidRequest, Message: "bad request"}, status: http.StatusBadRequest, code: "invalid_request"},
		{name: "policy denied", err: &artifacts.Error{Kind: artifacts.ErrorPolicyDenied, Message: "denied"}, status: http.StatusForbidden, code: "artifact_policy_denied"},
		{name: "path forbidden", err: &artifacts.Error{Kind: artifacts.ErrorPathForbidden, Message: "forbidden"}, status: http.StatusForbidden, code: "artifact_path_forbidden"},
		{name: "path not found", err: &artifacts.Error{Kind: artifacts.ErrorPathNotFound, Message: "not found"}, status: http.StatusNotFound, code: "artifact_path_not_found"},
		{name: "path not file", err: &artifacts.Error{Kind: artifacts.ErrorPathNotFile, Message: "not file"}, status: http.StatusBadRequest, code: "artifact_path_not_file"},
		{name: "binary invalid", err: &artifacts.Error{Kind: artifacts.ErrorBinaryPayloadInvalid, Message: "bad binary"}, status: http.StatusBadRequest, code: "invalid_binary_content_id"},
		{name: "binary missing", err: &artifacts.Error{Kind: artifacts.ErrorBinaryPayloadNotFound, Message: "missing binary"}, status: http.StatusNotFound, code: "binary_payload_not_found"},
		{name: "unsupported artifact type", err: &artifacts.Error{Kind: artifacts.ErrorArtifactTypeUnsupported, Message: "unsupported"}, status: http.StatusBadRequest, code: "unsupported_artifact_type"},
		{name: "too large", err: &artifacts.Error{Kind: artifacts.ErrorTooLarge, Message: "too large"}, status: http.StatusRequestEntityTooLarge, code: "artifact_payload_too_large"},
		{name: "mime not allowed", err: &artifacts.Error{Kind: artifacts.ErrorMimeNotAllowed, Message: "bad mime"}, status: http.StatusUnsupportedMediaType, code: "artifact_mime_not_allowed"},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, nil)
			writeArtifactRouteError(response, request, testCase.err)

			assertRouteErrorResponse(t, response, testCase.status, testCase.code, testCase.err.Message)
		})
	}
}

func TestWriteArtifactRouteErrorFallsBackToInternalError(t *testing.T) {
	t.Parallel()

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, nil)
	writeArtifactRouteError(response, request, errors.New("boom"))

	assertRouteErrorResponse(t, response, http.StatusInternalServerError, "internal_error", "Internal Server Error")
}

func assertRouteErrorResponse(
	t *testing.T,
	response *httptest.ResponseRecorder,
	expectedStatus int,
	expectedCode string,
	expectedMessage string,
) {
	t.Helper()

	if response.Code != expectedStatus {
		t.Fatalf("expected status %d, got %d with body %q", expectedStatus, response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode route error payload: %v", err)
	}
	if payload.Error.Code != expectedCode {
		t.Fatalf("expected code %q, got %#v", expectedCode, payload.Error)
	}
	if payload.Error.Message != expectedMessage {
		t.Fatalf("expected message %q, got %#v", expectedMessage, payload.Error)
	}
}
