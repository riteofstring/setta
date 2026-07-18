package httpapi

import (
	"net/http"

	"setta/internal/codexaccount"
)

func (handler handler) readCodexAccount(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	state, err := service.Read(request.Context())
	if err != nil {
		writeCodexAccountError(response, "read_codex_account_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) refreshCodexAccount(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	var payload codexaccount.RefreshCodexAccountRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.Refresh(request.Context(), payload)
	if err != nil {
		writeCodexAccountError(response, "refresh_codex_account_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) startCodexLogin(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	var payload codexaccount.StartCodexLoginRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.StartLogin(request.Context(), payload)
	if err != nil {
		writeCodexAccountError(response, "start_codex_login_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) cancelCodexLogin(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	var payload codexaccount.CancelCodexLoginRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.CancelLogin(request.Context(), payload)
	if err != nil {
		writeCodexAccountError(response, "cancel_codex_login_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) logoutCodexAccount(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	var payload codexaccount.LogoutCodexAccountRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.Logout(request.Context(), payload)
	if err != nil {
		writeCodexAccountError(response, "logout_codex_account_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}
