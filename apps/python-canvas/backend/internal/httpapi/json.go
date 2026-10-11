package httpapi

import (
	"net/http"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/contracts"
	"github.com/riteofstring/setta/packages/local-backend/httpjson"
)

const maxRequestBodyBytes int64 = 32 * 1024

func decodeJSONBody(response http.ResponseWriter, request *http.Request, destination any) bool {
	return decodeJSONBodyWithLimit(response, request, destination, maxRequestBodyBytes)
}

func decodeJSONBodyWithLimit(response http.ResponseWriter, request *http.Request, destination any, limit int64) bool {
	if !httpjson.HasJSONMediaType(request) {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Request body must be JSON.")
		return false
	}
	if err := httpjson.DecodeRequest(response, request, limit, destination); err != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Request body is invalid.")
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
	_ = httpjson.Write(response, status, value)
}
