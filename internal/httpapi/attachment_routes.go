package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/chatattachments"
)

const RouteAttachmentDownload = "/api/attachments/{token}"

type AttachmentRootRouteDependencies struct {
	Service *chatattachments.Service
}

func RegisterAttachmentRootRoutes(router chi.Router, deps AttachmentRootRouteDependencies) error {
	if deps.Service == nil {
		return errors.New("attachment service is required")
	}
	router.Get(RouteAttachmentDownload, func(w http.ResponseWriter, r *http.Request) {
		token := chi.URLParam(r, "token")
		result, err := deps.Service.Download(token)
		if err != nil {
			writeAttachmentDownloadError(w, r, err)
			return
		}
		w.Header().Set("Content-Type", result.MediaType)
		w.Header().Set("Content-Disposition", chatattachments.BuildContentDisposition(result.Filename))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(result.Content)
	})
	return nil
}

func writeAttachmentDownloadError(w http.ResponseWriter, r *http.Request, err error) {
	var projectConfigErr *chatattachments.ProjectConfigNotFoundError
	switch {
	case errors.Is(err, chatattachments.ErrAttachmentTokenUnavailable):
		writeError(w, r, http.StatusInternalServerError, "attachment_token_unavailable", "Attachment token secret unavailable.")
	case errors.Is(err, chatattachments.ErrInvalidAttachmentToken):
		writeError(w, r, http.StatusForbidden, "invalid_attachment_token", "Invalid or expired attachment token.")
	case errors.Is(err, chatattachments.ErrAttachmentPathIsDirectory):
		writeError(w, r, http.StatusBadRequest, "attachment_path_is_directory", "Attachment path is a directory.")
	case errors.Is(err, chatattachments.ErrAttachmentNotFound):
		writeError(w, r, http.StatusNotFound, "attachment_not_found", "Attachment not found.")
	case errors.As(err, &projectConfigErr):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", projectConfigErr.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
