package httpapi

import (
	"net/http"

	"setta/internal/master"
)

const masterInputRequestBodyLimitBytes int64 = master.MaxInputTextBytes*6 + 64*1024

type SubmitMasterInputRequest struct {
	Input master.MasterInput `json:"input"`
}

func (handler handler) readRecentMasterInputs(response http.ResponseWriter, request *http.Request) {
	service := requireMasterInputService(response, handler.masterInputService)
	if service == nil {
		return
	}
	history, err := service.ListRecentInputs(request.Context())
	if err != nil {
		writeMasterInputHistoryError(response, err)
		return
	}
	if err := history.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_master_input_history", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, history)
}

func (handler handler) submitMasterInput(response http.ResponseWriter, request *http.Request) {
	service := requireMasterInputService(response, handler.masterInputService)
	if service == nil {
		return
	}
	var payload SubmitMasterInputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	accepted, err := service.SubmitInput(request.Context(), payload.Input)
	if err != nil {
		writeMasterInputError(response, err)
		return
	}
	if err := accepted.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_master_input_receipt", err.Error())
		return
	}
	writeJSON(response, http.StatusAccepted, accepted)
}
