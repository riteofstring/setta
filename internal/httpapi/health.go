package httpapi

import (
	"encoding/json"
	"net/http"
)

const BackendName = "setta-backend"

type BackendMetadata struct {
	Name    string
	Version string
}

type HealthResponse struct {
	OK      bool   `json:"ok"`
	Name    string `json:"name"`
	Version string `json:"version"`
}

func NewHandler(metadata BackendMetadata) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(response http.ResponseWriter, request *http.Request) {
		writeJSON(response, HealthResponse{
			OK:      true,
			Name:    metadata.Name,
			Version: metadata.Version,
		})
	})
	return mux
}

func writeJSON(response http.ResponseWriter, payload any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(response).Encode(payload)
}
