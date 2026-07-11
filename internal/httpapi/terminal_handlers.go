package httpapi

import (
	"net/http"

	"setta/internal/terminal"
)

func (handler handler) createTerminal(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload CreateTerminalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Create(
		request.Context(),
		payload.WorkspaceID,
		payload.PaneID,
		payload.ProfileID,
		payload.CWD,
		payload.Cols,
		payload.Rows,
	)
	if err != nil {
		writeTerminalError(response, "create_terminal_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, TerminalSessionResponse{Session: terminalSessionSummary(session)})
}

func (handler handler) attachTerminal(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload AttachTerminalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Attach(request.Context(), payload.WorkspaceID, payload.PaneID)
	if err != nil {
		writeTerminalError(response, "attach_terminal_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, TerminalSessionResponse{Session: terminalSessionSummary(session)})
}

func (handler handler) resizeTerminal(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload ResizeTerminalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Resize(request.Context(), payload.SessionID, payload.Cols, payload.Rows)
	if err != nil {
		writeTerminalError(response, "resize_terminal_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, TerminalSessionResponse{Session: terminalSessionSummary(session)})
}

func (handler handler) closeTerminal(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload CloseTerminalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.Close(request.Context(), payload.SessionID, payload.Confirmed)
	if err != nil {
		writeTerminalError(response, "close_terminal_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, closeTerminalResponse(result))
}

func (handler handler) listTerminalProfiles(response http.ResponseWriter, _ *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	profiles, err := service.ListProfiles()
	if err != nil {
		writeTerminalError(response, "list_terminal_profiles_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func (handler handler) createTerminalProfile(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload CreateTerminalProfileRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	profiles, err := service.CreateProfile(payload.Profile)
	if err != nil {
		writeTerminalError(response, "create_terminal_profile_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func (handler handler) updateTerminalProfile(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload UpdateTerminalProfileRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	profiles, err := service.UpdateProfile(payload.ID, payload.Profile)
	if err != nil {
		writeTerminalError(response, "update_terminal_profile_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func (handler handler) deleteTerminalProfile(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload DeleteTerminalProfileRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	profiles, err := service.DeleteProfile(payload.ID)
	if err != nil {
		writeTerminalError(response, "delete_terminal_profile_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func (handler handler) selectDefaultTerminalProfile(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload SelectDefaultTerminalProfileRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	profiles, err := service.SetDefaultProfile(payload.ID)
	if err != nil {
		writeTerminalError(response, "select_default_terminal_profile_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func terminalSessionSummary(summary terminal.SessionSummary) TerminalSessionSummary {
	return TerminalSessionSummary{
		ID:          summary.ID,
		WorkspaceID: summary.WorkspaceID,
		PaneID:      summary.PaneID,
		ProfileID:   summary.ProfileID,
		CWD:         summary.CWD,
		Cols:        summary.Cols,
		Rows:        summary.Rows,
		Status:      summary.Status,
		CreatedAt:   summary.CreatedAt,
		UpdatedAt:   summary.UpdatedAt,
		ExitCode:    summary.ExitCode,
		Message:     summary.Message,
	}
}

func closeTerminalResponse(result terminal.TerminalCloseResult) CloseTerminalResponse {
	var session *TerminalSessionSummary
	if result.Session != nil {
		summary := terminalSessionSummary(*result.Session)
		session = &summary
	}
	return CloseTerminalResponse{
		Kind:       result.Kind,
		Session:    session,
		Assessment: result.Assessment,
	}
}
