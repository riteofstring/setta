package httpapi

import (
	"net/http"

	"setta/internal/master"
)

const masterInputRequestBodyLimitBytes int64 = master.MaxInputTextBytes*6 + 64*1024

type SubmitMasterInputRequest struct {
	Input master.MasterInput `json:"input"`
}

type ReadMasterInputRoutingStateRequest struct {
	InputID string `json:"inputId"`
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

func (handler handler) readMasterInputRoutingState(response http.ResponseWriter, request *http.Request) {
	handler.masterInputRoutingState(response, request, false)
}

func (handler handler) waitMasterInputRoutingState(response http.ResponseWriter, request *http.Request) {
	handler.masterInputRoutingState(response, request, true)
}

func (handler handler) masterInputRoutingState(
	response http.ResponseWriter,
	request *http.Request,
	wait bool,
) {
	service := requireMasterInputService(response, handler.masterInputService)
	if service == nil {
		return
	}
	var payload ReadMasterInputRoutingStateRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	var state master.InputRoutingState
	var err error
	if wait {
		state, err = service.WaitInputState(request.Context(), payload.InputID)
	} else {
		state, err = service.ReadInputState(request.Context(), payload.InputID)
	}
	if err != nil {
		writeMasterInputStateError(response, err)
		return
	}
	if err := state.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_master_input_routing_state", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, state)
}
