package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/chatattachments"
	"setta/internal/deployments"
	"setta/internal/modes"
)

const (
	RouteGetAttachmentDownloadURL  = "/getAttachmentDownloadUrl"
	RouteGetAttachmentDownloadURLs = "/getAttachmentDownloadUrls"
	RouteAttachmentDownload        = "/attachments/{token}"
)

type AttachmentRouteDependencies struct {
	ModePolicy    modes.Policy
	ShareSessions modes.ShareSessionStore
	Deployment    *deployments.Runtime
	Service       *chatattachments.Service
}

type AttachmentRootRouteDependencies struct {
	ModePolicy    modes.Policy
	ShareSessions modes.ShareSessionStore
	Deployment    *deployments.Runtime
	Service       *chatattachments.Service
}

func RegisterAttachmentRootRoutes(router chi.Router, deps AttachmentRootRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.Service == nil {
		return errors.New("attachment service is required")
	}
	if deps.ModePolicy.IsDeployment() {
		if deps.ShareSessions == nil {
			return fmt.Errorf("share session store is required in deployment mode")
		}
		registerOpenAPIOperationAtPaths[openAPINoBody, openAPIBinaryPayload](
			router.With(RequireShareSession(modes.Resolver{
				Policy: deps.ModePolicy,
				Store:  deps.ShareSessions,
			})),
			http.MethodGet,
			"downloadAttachment",
			RouteAPIPrefix+RouteAttachmentDownload,
			RouteAttachmentDownload,
			attachmentDownloadHandler(deps),
			withOpenAPITags("Attachment"),
			withOpenAPISummary("Download a chat attachment by signed token."),
			withOpenAPIModeRequirement("not-launcher"),
			withOpenAPIPathParams[AttachmentDownloadRouteParams](),
			withOpenAPIResponseContentType("application/octet-stream"),
		)
		return nil
	}
	registerOpenAPIOperationAtPaths[openAPINoBody, openAPIBinaryPayload](
		router,
		http.MethodGet,
		"downloadAttachment",
		RouteAPIPrefix+RouteAttachmentDownload,
		RouteAttachmentDownload,
		attachmentDownloadHandler(deps),
		withOpenAPITags("Attachment"),
		withOpenAPISummary("Download a chat attachment by signed token."),
		withOpenAPIModeRequirement("not-launcher"),
		withOpenAPIPathParams[AttachmentDownloadRouteParams](),
		withOpenAPIResponseContentType("application/octet-stream"),
	)
	return nil
}

type GetAttachmentDownloadURLRequest struct {
	ArtifactID      string  `json:"artifactId"`
	ProjectConfigID *string `json:"projectConfigId"`
}

type GetAttachmentDownloadURLResponse struct {
	URL       string `json:"url"`
	ExpiresAt int64  `json:"expiresAt"`
}

type GetAttachmentDownloadURLsRequest struct {
	ArtifactIDs     []string `json:"artifactIds"`
	ProjectConfigID *string  `json:"projectConfigId"`
}

type AttachmentDownloadRouteParams struct {
	Token string `json:"token"`
}

type AttachmentDownloadURLEntry struct {
	ArtifactID string `json:"artifactId"`
	URL        string `json:"url"`
	ExpiresAt  int64  `json:"expiresAt"`
}

func RegisterAttachmentRoutes(router chi.Router, deps AttachmentRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsLauncher() {
		return nil
	}
	if deps.Service == nil {
		return fmt.Errorf("attachment service is required")
	}
	if deps.ModePolicy.IsDeployment() {
		if deps.ShareSessions == nil {
			return fmt.Errorf("share session store is required in deployment mode")
		}
		if deps.Deployment == nil {
			return fmt.Errorf("deployment runtime is required in deployment mode")
		}
		guard := RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.ShareSessions,
		})
		registerOpenAPIPost[GetAttachmentDownloadURLRequest, GetAttachmentDownloadURLResponse](
			router.With(guard),
			"getAttachmentDownloadUrl",
			RouteGetAttachmentDownloadURL,
			getAttachmentDownloadURLHandler(deps),
			withOpenAPITags("Attachment"),
			withOpenAPISummary("Build a signed download URL for a single chat attachment."),
			withOpenAPIModeRequirement("not-launcher"),
		)
		registerOpenAPIPost[GetAttachmentDownloadURLsRequest, []AttachmentDownloadURLEntry](
			router.With(guard),
			"getAttachmentDownloadUrls",
			RouteGetAttachmentDownloadURLs,
			getAttachmentDownloadURLsHandler(deps),
			withOpenAPITags("Attachment"),
			withOpenAPISummary("Build signed download URLs for a batch of chat attachments."),
			withOpenAPIModeRequirement("not-launcher"),
		)
		return nil
	}
	guard := modeRequirementMiddleware(deps.ModePolicy, deps.ModePolicy.RequireNotLauncher)
	registerOpenAPIPost[GetAttachmentDownloadURLRequest, GetAttachmentDownloadURLResponse](
		router.With(guard),
		"getAttachmentDownloadUrl",
		RouteGetAttachmentDownloadURL,
		getAttachmentDownloadURLHandler(deps),
		withOpenAPITags("Attachment"),
		withOpenAPISummary("Build a signed download URL for a single chat attachment."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetAttachmentDownloadURLsRequest, []AttachmentDownloadURLEntry](
		router.With(guard),
		"getAttachmentDownloadUrls",
		RouteGetAttachmentDownloadURLs,
		getAttachmentDownloadURLsHandler(deps),
		withOpenAPITags("Attachment"),
		withOpenAPISummary("Build signed download URLs for a batch of chat attachments."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	return nil
}

func attachmentDownloadHandler(deps AttachmentRootRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAttachmentDownloadsAllowed(w, r, deps.Deployment) {
			return
		}
		shareSessionID := attachmentShareSessionID(r)
		token := chi.URLParam(r, "token")
		result, err := deps.Service.DownloadForShareSession(token, shareSessionID)
		if err != nil {
			writeAttachmentDownloadError(w, r, err)
			return
		}
		w.Header().Set("Content-Type", result.MediaType)
		w.Header().Set("Content-Disposition", chatattachments.BuildContentDisposition(result.Filename))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(result.Content)
	}
}

func getAttachmentDownloadURLHandler(deps AttachmentRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAttachmentDownloadsAllowed(w, r, deps.Deployment) {
			return
		}
		payload, err := decodeJSONBody[GetAttachmentDownloadURLRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		entry, err := deps.Service.BuildDownloadURL(
			payload.ArtifactID,
			stringValueOrEmpty(payload.ProjectConfigID),
			attachmentShareSessionID(r),
			func(token string, shareSessionID string) string {
				return buildAttachmentDownloadURL(r, token, shareSessionID)
			},
		)
		if err != nil {
			writeAttachmentDownloadError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, GetAttachmentDownloadURLResponse{
			URL:       entry.URL,
			ExpiresAt: entry.ExpiresAt,
		})
	}
}

func getAttachmentDownloadURLsHandler(deps AttachmentRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAttachmentDownloadsAllowed(w, r, deps.Deployment) {
			return
		}
		payload, err := decodeJSONBody[GetAttachmentDownloadURLsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		entries, err := deps.Service.BuildDownloadURLs(
			payload.ArtifactIDs,
			stringValueOrEmpty(payload.ProjectConfigID),
			attachmentShareSessionID(r),
			func(token string, shareSessionID string) string {
				return buildAttachmentDownloadURL(r, token, shareSessionID)
			},
		)
		if err != nil {
			writeAttachmentDownloadError(w, r, err)
			return
		}
		response := make([]AttachmentDownloadURLEntry, 0, len(entries))
		for _, entry := range entries {
			response = append(response, AttachmentDownloadURLEntry{
				ArtifactID: entry.ArtifactID,
				URL:        entry.URL,
				ExpiresAt:  entry.ExpiresAt,
			})
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func attachmentShareSessionID(r *http.Request) string {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		return ""
	}
	return strings.TrimSpace(requestInfo.ShareSessionID)
}

func ensureAttachmentDownloadsAllowed(w http.ResponseWriter, r *http.Request, deployment *deployments.Runtime) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	if deployment == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !deployment.Policy().AllowFileDownloads {
		writeError(w, r, http.StatusForbidden, "attachment_download_forbidden", "Deployment policy disallows file downloads.")
		return false
	}
	return true
}

func buildAttachmentDownloadURL(r *http.Request, token string, shareSessionID string) string {
	downloadURL := requestOrigin(r) + RouteAPIPrefix + strings.TrimSpace(RouteAttachmentDownload)
	if strings.TrimSpace(shareSessionID) == "" {
		return strings.ReplaceAll(downloadURL, "{token}", url.PathEscape(token))
	}
	parsed, err := url.Parse(strings.ReplaceAll(downloadURL, "{token}", url.PathEscape(token)))
	if err != nil {
		return ""
	}
	query := parsed.Query()
	query.Set(modes.ShareSessionQueryName, strings.TrimSpace(shareSessionID))
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func stringValueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func writeAttachmentDownloadError(w http.ResponseWriter, r *http.Request, err error) {
	var projectConfigErr *chatattachments.ProjectConfigNotFoundError
	switch {
	case errors.Is(err, chatattachments.ErrAttachmentTokenUnavailable):
		writeError(w, r, http.StatusInternalServerError, "attachment_token_unavailable", "Attachment token secret unavailable.")
	case errors.Is(err, chatattachments.ErrInvalidAttachmentToken):
		writeError(w, r, http.StatusForbidden, "invalid_attachment_token", "Invalid or expired attachment token.")
	case errors.Is(err, chatattachments.ErrAttachmentSessionMismatch):
		writeError(w, r, http.StatusForbidden, "attachment_session_mismatch", "Attachment token session mismatch.")
	case errors.Is(err, chatattachments.ErrAttachmentPathIsDirectory):
		writeError(w, r, http.StatusBadRequest, "attachment_path_is_directory", "Attachment path is a directory.")
	case errors.Is(err, chatattachments.ErrAttachmentNotFound):
		writeError(w, r, http.StatusNotFound, "attachment_not_found", "Attachment not found.")
	case errors.Is(err, chatattachments.ErrAttachmentDownloadURLMissing):
		writeError(w, r, http.StatusInternalServerError, "attachment_download_url_unavailable", "Attachment download URL origin is unavailable.")
	case errors.As(err, &projectConfigErr):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", projectConfigErr.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
