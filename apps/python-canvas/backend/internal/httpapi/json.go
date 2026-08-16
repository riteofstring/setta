package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

func writeError(response http.ResponseWriter, status int, code contracts.APIErrorCodeV1, message string) {
	writeJSON(response, status, contracts.ErrorResponseV1{
		Error: contracts.APIErrorV1{
			Code:    code,
			Message: message,
		},
	})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}
