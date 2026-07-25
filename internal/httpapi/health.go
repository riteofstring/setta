package httpapi

import "net/http"

const BackendName = "setta-backend"

type BackendMetadata struct {
	Name    string
	Version string
}

type RuntimeMetadata struct {
	ID          string
	DisplayName string
}

type BackendHealth struct {
	OK              bool   `json:"ok"`
	Name            string `json:"name"`
	Version         string `json:"version"`
	ProtocolVersion int    `json:"protocolVersion"`
}

func (handler handler) health(response http.ResponseWriter, request *http.Request) {
	writeJSON(response, http.StatusOK, BackendHealth{
		OK:              true,
		Name:            handler.metadata.Name,
		Version:         handler.metadata.Version,
		ProtocolVersion: ProtocolVersion,
	})
}
