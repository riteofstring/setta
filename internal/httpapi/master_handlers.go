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

type CancelMasterInputRequest struct {
	InputID string `json:"inputId"`
}

func (handler handler) readActiveMasterShellInteraction(response http.ResponseWriter, request *http.Request) {
	service := requireMasterInputService(response, handler.masterInputService)
	if service == nil {
		return
	}
	interaction, err := service.ReadActiveShellInteraction(request.Context())
	if err != nil {
		writeMasterShellInteractionError(response, err)
		return
	}
	if err := interaction.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_master_shell_interaction", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, interaction)
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

func (handler handler) cancelMasterInput(response http.ResponseWriter, request *http.Request) {
	service := requireMasterInputService(response, handler.masterInputService)
	if service == nil {
		return
	}
	var payload CancelMasterInputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.CancelInput(request.Context(), payload.InputID)
	if err != nil {
		writeMasterInputStateError(response, err)
		return
	}
	if err := state.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_master_input_cancellation", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) readMasterInputRoutingState(response http.ResponseWriter, request *http.Request) {
	service := requireMasterInputService(response, handler.masterInputService)
	if service == nil {
		return
	}
	var payload ReadMasterInputRoutingStateRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.ReadInputState(request.Context(), payload.InputID)
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

func (handler handler) waitMasterShellInteraction(response http.ResponseWriter, request *http.Request) {
	service := requireMasterInputService(response, handler.masterInputService)
	if service == nil {
		return
	}
	var payload ReadMasterInputRoutingStateRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.WaitShellInteraction(request.Context(), payload.InputID)
	if err != nil {
		writeMasterInputStateError(response, err)
		return
	}
	if err := state.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_master_shell_interaction", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) waitMasterPresentationIntent(response http.ResponseWriter, request *http.Request) {
	service := requireMasterInputService(response, handler.masterInputService)
	if service == nil {
		return
	}
	var payload ReadMasterInputRoutingStateRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	intent, err := service.WaitPresentationIntent(request.Context(), payload.InputID)
	if err != nil {
		writeMasterInputStateError(response, err)
		return
	}
	if err := intent.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_master_presentation_intent", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, intent)
}

func (handler handler) resolveMasterPresentationIntent(response http.ResponseWriter, request *http.Request) {
	service := requireMasterInputService(response, handler.masterInputService)
	if service == nil {
		return
	}
	var payload master.PresentationResolutionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	resolution, err := service.ResolvePresentationIntent(request.Context(), payload)
	if err != nil {
		writeMasterInputStateError(response, err)
		return
	}
	if err := resolution.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_master_presentation_resolution", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, resolution)
}
