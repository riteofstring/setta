package httpapi

import (
	"encoding/json"
	"io"
	"mime"
	"net/http"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

const maxRequestBodyBytes int64 = 32 * 1024

func decodeJSONBody(response http.ResponseWriter, request *http.Request, destination any) bool {
	return decodeJSONBodyWithLimit(response, request, destination, maxRequestBodyBytes)
}

func decodeJSONBodyWithLimit(response http.ResponseWriter, request *http.Request, destination any, limit int64) bool {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Request body must be JSON.")
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, limit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Request body is invalid.")
		return false
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Request body must contain one JSON value.")
		return false
	}
	return true
}

func writeError(response http.ResponseWriter, status int, code contracts.APIErrorCodeV2, message string) {
	writeJSON(response, status, contracts.ErrorResponseV2{Error: contracts.APIErrorV2{Code: code, Message: message}})
}

func writeRevisionConflict(response http.ResponseWriter, expected int, current int) {
	writeJSON(response, http.StatusConflict, contracts.ErrorResponseV2{Error: contracts.APIErrorV2{
		Code:             contracts.APIErrorCodeRevisionConflictV2,
		Message:          "The project changed before this update could be saved. Reload the latest project and try again.",
		ExpectedRevision: &expected,
		CurrentRevision:  &current,
	}})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}
