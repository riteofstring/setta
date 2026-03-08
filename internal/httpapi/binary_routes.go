package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	binarypayload "setta/internal/binary"
	"setta/internal/modes"
)

const RouteBinaryUpload = "/binary/upload"

type BinaryRouteDependencies struct {
	ModePolicy modes.Policy
	Store      *binarypayload.Store
}

func RegisterBinaryRoutes(router chi.Router, deps BinaryRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.Store == nil {
		return fmt.Errorf("binary store is required")
	}

	router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(RouteBinaryUpload, binaryUploadHandler(deps.Store))
	return nil
}

func binaryUploadHandler(store *binarypayload.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, binarypayload.DefaultMaxUploadBytes+1024)
		if err := r.ParseMultipartForm(binarypayload.DefaultMaxUploadBytes + 1024); err != nil {
			if strings.Contains(err.Error(), "request body too large") {
				writeError(w, r, http.StatusRequestEntityTooLarge, "binary_payload_too_large", payloadTooLargeMessage(binarypayload.DefaultMaxUploadBytes))
				return
			}
			writeError(w, r, http.StatusBadRequest, "invalid_multipart", "Invalid multipart form payload.")
			return
		}

		durable, err := parseFormBool(r.FormValue("durable"), true)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_form_value", err.Error())
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "missing_file", "Binary upload file is required.")
			return
		}
		defer file.Close()

		mimeType := header.Header.Get("Content-Type")
		ref, err := store.StoreStream(file, mimeType, durable, binarypayload.DefaultMaxUploadBytes)
		if err != nil {
			var tooLargeErr *binarypayload.PayloadTooLargeError
			if errors.As(err, &tooLargeErr) {
				writeError(w, r, http.StatusRequestEntityTooLarge, "binary_payload_too_large", payloadTooLargeMessage(tooLargeErr.MaxBytes))
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, ref)
	}
}

func parseFormBool(raw string, defaultValue bool) (bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultValue, nil
	}
	switch strings.ToLower(trimmed) {
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off":
		return false, nil
	default:
		return false, fmt.Errorf("Invalid boolean value: %q", raw)
	}
}

func payloadTooLargeMessage(maxBytes int64) string {
	return fmt.Sprintf("Binary payload is too large. Maximum size is %d bytes.", maxBytes)
}
