package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/artifacts"
	"setta/internal/modes"
)

const (
	RouteImportFilesToArtifacts               = "/importFilesToArtifacts"
	RouteLoadCachedImageArtifacts             = "/loadCachedImageArtifacts"
	RouteLoadCachedChartData                  = "/loadCachedChartData"
	RouteLoadCachedBrushStrokes               = "/loadCachedBrushStrokes"
	RouteLoadCachedDrawAreaLayerItemTransform = "/loadCachedDrawAreaLayerItemTransform"
	RouteUpdateArtifacts                      = "/updateArtifacts"
	RouteDeleteArtifacts                      = "/deleteArtifacts"
)

type ArtifactRouteDependencies struct {
	ModePolicy modes.Policy
	Artifacts  ArtifactService
}

type ArtifactService interface {
	ImportFiles(ctx context.Context, request artifacts.ImportFilesRequest) ([]artifacts.ImportFilesResponseItem, error)
	LoadCachedImages(ctx context.Context, request artifacts.LoadCachedPathsRequest) ([]*artifacts.ImageArtifact, error)
	LoadCachedChartData(ctx context.Context, request artifacts.LoadCachedPathsRequest) ([]*artifacts.ChartDataArtifact, error)
	LoadCachedBrushStrokes(ctx context.Context, request artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error)
	LoadCachedDrawAreaLayerItemTransforms(ctx context.Context, request artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error)
	Update(ctx context.Context, request artifacts.UpdateRequest) ([]artifacts.ArtifactSaveResult, error)
	Delete(ctx context.Context, request artifacts.DeleteRequest) ([]string, error)
}

func RegisterArtifactRoutes(router chi.Router, deps ArtifactRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Artifacts == nil {
		return fmt.Errorf("artifact service is required in ide mode")
	}
	guard := RequireFullIDERuntime(deps.ModePolicy)
	router.With(guard).Post(RouteImportFilesToArtifacts, importFilesToArtifactsHandler(deps))
	router.With(guard).Post(RouteLoadCachedImageArtifacts, loadCachedImageArtifactsHandler(deps))
	router.With(guard).Post(RouteLoadCachedChartData, loadCachedChartDataHandler(deps))
	router.With(guard).Post(RouteLoadCachedBrushStrokes, loadCachedBrushStrokesHandler(deps))
	router.With(guard).Post(RouteLoadCachedDrawAreaLayerItemTransform, loadCachedDrawAreaLayerItemTransformHandler(deps))
	router.With(guard).Post(RouteUpdateArtifacts, updateArtifactsHandler(deps))
	router.With(guard).Post(RouteDeleteArtifacts, deleteArtifactsHandler(deps))
	return nil
}

func importFilesToArtifactsHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.ImportFilesRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.ImportFiles(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedImageArtifactsHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.LoadCachedImages(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedChartDataHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.LoadCachedChartData(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedBrushStrokesHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.LoadCachedBrushStrokes(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedDrawAreaLayerItemTransformHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.LoadCachedDrawAreaLayerItemTransforms(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func updateArtifactsHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.UpdateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.Update(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func deleteArtifactsHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.DeleteRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.Delete(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func writeArtifactRouteError(w http.ResponseWriter, r *http.Request, err error) {
	var artifactErr *artifacts.Error
	if errors.As(err, &artifactErr) {
		switch artifactErr.Kind {
		case artifacts.ErrorInvalidRequest:
			writeError(w, r, http.StatusBadRequest, "invalid_request", artifactErr.Message)
		case artifacts.ErrorPathForbidden:
			writeError(w, r, http.StatusForbidden, "artifact_path_forbidden", artifactErr.Message)
		case artifacts.ErrorPathNotFound:
			writeError(w, r, http.StatusNotFound, "artifact_path_not_found", artifactErr.Message)
		case artifacts.ErrorPathNotFile:
			writeError(w, r, http.StatusBadRequest, "artifact_path_not_file", artifactErr.Message)
		case artifacts.ErrorBinaryPayloadInvalid:
			writeError(w, r, http.StatusBadRequest, "invalid_binary_content_id", artifactErr.Message)
		case artifacts.ErrorBinaryPayloadNotFound:
			writeError(w, r, http.StatusNotFound, "binary_payload_not_found", artifactErr.Message)
		case artifacts.ErrorArtifactTypeUnsupported:
			writeError(w, r, http.StatusBadRequest, "unsupported_artifact_type", artifactErr.Message)
		case artifacts.ErrorTooLarge:
			writeError(w, r, http.StatusRequestEntityTooLarge, "artifact_payload_too_large", artifactErr.Message)
		case artifacts.ErrorMimeNotAllowed:
			writeError(w, r, http.StatusUnsupportedMediaType, "artifact_mime_not_allowed", artifactErr.Message)
		default:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		}
		return
	}
	writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
}
