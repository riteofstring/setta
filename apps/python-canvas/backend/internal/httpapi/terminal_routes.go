package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/runner"
	"github.com/setta/python-canvas/backend/internal/terminal"
)

var ErrTerminalRuntimeRequired = errors.New("httpapi: terminal runtime is required")

type HandlerOptions struct {
	Terminal terminal.Runtime

	Runner runner.Runtime

	RuntimeSession contracts.RuntimeSessionIdentityV2

	AppOrigin string

	Lifecycle context.Context
}

type terminalRoutes struct {
	runtime        terminal.Runtime
	allowedOrigins map[string]struct{}
	lifecycle      context.Context
}

type openTerminalPayload struct {
	ProjectID *string `json:"projectId"`
	Columns   *int    `json:"columns"`
	Rows      *int    `json:"rows"`
}

type runTerminalPayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
	Columns          *int    `json:"columns"`
	Rows             *int    `json:"rows"`
}

type closeTerminalPayload struct {
	ProjectID *string `json:"projectId"`
}

type terminalTicketPayload struct {
	ProjectID *string `json:"projectId"`
}

func (payload openTerminalPayload) contract() (contracts.OpenTerminalRequestV2, bool) {
	if payload.ProjectID == nil || payload.Columns == nil || payload.Rows == nil {
		return contracts.OpenTerminalRequestV2{}, false
	}
	return contracts.OpenTerminalRequestV2{
		ProjectID: *payload.ProjectID,
		Columns:   *payload.Columns,
		Rows:      *payload.Rows,
	}, true
}

func (payload runTerminalPayload) contract() (contracts.RunTerminalRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Columns == nil || payload.Rows == nil {
		return contracts.RunTerminalRequestV2{}, false
	}
	return contracts.RunTerminalRequestV2{
		ProjectID:        *payload.ProjectID,
		ExpectedRevision: *payload.ExpectedRevision,
		Columns:          *payload.Columns,
		Rows:             *payload.Rows,
	}, true
}

func (payload closeTerminalPayload) contract() (contracts.CloseTerminalRequestV2, bool) {
	if payload.ProjectID == nil {
		return contracts.CloseTerminalRequestV2{}, false
	}
	return contracts.CloseTerminalRequestV2{ProjectID: *payload.ProjectID}, true
}

func (payload terminalTicketPayload) contract() (contracts.TerminalTicketRequestV2, bool) {
	if payload.ProjectID == nil {
		return contracts.TerminalTicketRequestV2{}, false
	}
	return contracts.TerminalTicketRequestV2{ProjectID: *payload.ProjectID}, true
}

func newTerminalRoutes(options HandlerOptions) (*terminalRoutes, error) {
	if options.Terminal == nil {
		return nil, ErrTerminalRuntimeRequired
	}
	appOrigin, ok := normalizeOrigin(options.AppOrigin)
	if !ok {
		if strings.TrimSpace(options.AppOrigin) == "" {
			return nil, errors.New("httpapi: terminal app origin is required")
		}
		return nil, fmt.Errorf("httpapi: invalid terminal app origin %q", options.AppOrigin)
	}
	lifecycle := options.Lifecycle
	if lifecycle == nil {
		lifecycle = context.Background()
	}
	return &terminalRoutes{
		runtime:        options.Terminal,
		allowedOrigins: terminalAllowedOrigins(appOrigin),
		lifecycle:      lifecycle,
	}, nil
}

func (routes *terminalRoutes) dispatch(response http.ResponseWriter, request *http.Request, service ProjectService) bool {
	switch {
	case isExactPath(request, contracts.ProjectTerminalPathV2):
		routes.handleOpen(response, request, service)
	case isExactPath(request, contracts.ProjectTerminalRunPathV2):
		routes.handleRun(response, request, service)
	case isExactPath(request, contracts.ProjectTerminalClosePathV2):
		routes.handleClose(response, request, service)
	case isExactPath(request, contracts.ProjectTerminalTicketPathV2):
		routes.handleTicket(response, request, service)
	case isTerminalStreamPath(request):
		routes.handleStream(response, request)
	default:
		return false
	}
	return true
}

func (routes *terminalRoutes) handleOpen(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload openTerminalPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Terminal open request is invalid.")
		return
	}
	if !requireTerminalProject(response, service, body.ProjectID) {
		return
	}
	session, created, err := routes.runtime.Open(body.Columns, body.Rows)
	if err != nil {
		writeTerminalServiceError(response, err)
		return
	}
	writeTerminalSession(response, session, created)
}

func (routes *terminalRoutes) handleRun(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload runTerminalPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Terminal run request is invalid.")
		return
	}
	program, err := service.CaptureGeneratedProgram(request.Context(), body.ProjectID, body.ExpectedRevision)
	if err != nil {
		writeTerminalRunError(response, service, err, body.ExpectedRevision)
		return
	}
	session, created, err := routes.runtime.Run(request.Context(), program.Code, body.Columns, body.Rows)
	if err != nil {
		writeTerminalServiceError(response, err)
		return
	}
	writeTerminalSession(response, session, created)
}

func (routes *terminalRoutes) handleClose(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload closeTerminalPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Terminal close request is invalid.")
		return
	}
	if !requireTerminalProject(response, service, body.ProjectID) {
		return
	}
	if err := routes.runtime.Delete(request.Context()); err != nil {
		writeTerminalServiceError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (routes *terminalRoutes) handleTicket(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload terminalTicketPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Terminal ticket request is invalid.")
		return
	}
	if !requireTerminalProject(response, service, body.ProjectID) {
		return
	}
	ticket, err := routes.runtime.IssueTicket()
	if err != nil {
		writeTerminalServiceError(response, err)
		return
	}
	result := contracts.TerminalTicketV2{Ticket: ticket}
	if err := result.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeTerminalFailedV2, "Unable to issue a terminal attachment ticket.")
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (routes *terminalRoutes) handleStream(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		response.Header().Set("Allow", http.MethodGet)
		writeError(response, http.StatusMethodNotAllowed, contracts.APIErrorCodeMethodNotAllowedV2, "Method is not allowed.")
		return
	}
	ticket, ok := terminalTicketFromQuery(request.URL)
	if !ok {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Terminal stream request is invalid.")
		return
	}
	if !routes.allowsOrigin(request.Header.Get("Origin")) {
		writeError(response, http.StatusForbidden, contracts.APIErrorCodeInvalidRequestV2, "Terminal stream origin is not allowed.")
		return
	}
	connection, err := websocket.Accept(response, request, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	attachment, err := routes.runtime.Attach(ticket)
	if err != nil {
		_ = connection.Close(websocket.StatusPolicyViolation, "Terminal attachment is unavailable.")
		return
	}
	defer attachment.Close()
	defer connection.Close(websocket.StatusNormalClosure, "")

	streamContext, cancel := context.WithCancel(routes.lifecycle)
	if err := wsjson.Write(streamContext, connection, contracts.TerminalStreamReadyV2{Type: contracts.TerminalStreamReadyTypeV2}); err != nil {
		cancel()
		return
	}
	if len(attachment.History) != 0 {
		if err := connection.Write(streamContext, websocket.MessageBinary, attachment.History); err != nil {
			cancel()
			return
		}
	}
	writerDone := make(chan struct{})
	go routes.forwardOutput(streamContext, connection, attachment.Output, writerDone)
	routes.readStreamInput(streamContext, connection)
	cancel()
	<-writerDone
}

func (routes *terminalRoutes) forwardOutput(ctx context.Context, connection *websocket.Conn, output <-chan []byte, done chan<- struct{}) {
	defer close(done)
	for {
		select {
		case <-ctx.Done():
			return
		case chunk, open := <-output:
			if !open {
				_ = connection.Close(websocket.StatusNormalClosure, "")
				return
			}
			if err := connection.Write(ctx, websocket.MessageBinary, chunk); err != nil {
				_ = connection.Close(websocket.StatusNormalClosure, "")
				return
			}
		}
	}
}

func (routes *terminalRoutes) readStreamInput(ctx context.Context, connection *websocket.Conn) {
	for {
		messageType, data, err := connection.Read(ctx)
		if err != nil {
			return
		}
		switch messageType {
		case websocket.MessageBinary:
			if len(data) == 0 || !utf8.Valid(data) || routes.runtime.Write(data) != nil {
				_ = connection.Close(websocket.StatusUnsupportedData, "Terminal input is invalid.")
				return
			}
		case websocket.MessageText:
			resize, valid := decodeTerminalResize(data)
			if !valid || routes.runtime.Resize(resize.Columns, resize.Rows) != nil {
				_ = connection.Close(websocket.StatusUnsupportedData, "Terminal control message is invalid.")
				return
			}
		default:
			_ = connection.Close(websocket.StatusUnsupportedData, "Terminal frame is invalid.")
			return
		}
	}
}

func decodeTerminalResize(data []byte) (contracts.TerminalStreamResizeV2, bool) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var resize contracts.TerminalStreamResizeV2
	if err := decoder.Decode(&resize); err != nil {
		return contracts.TerminalStreamResizeV2{}, false
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return contracts.TerminalStreamResizeV2{}, false
	}
	return resize, resize.Validate() == nil
}

func requireTerminalProject(response http.ResponseWriter, service ProjectService, projectID string) bool {
	snapshot := service.Snapshot()
	if snapshot.Project.ID == projectID {
		return true
	}
	writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV2, "The requested project resource does not exist.")
	return false
}

func writeTerminalSession(response http.ResponseWriter, session terminal.Session, created bool) {
	result := contracts.TerminalSessionV2{Created: created, Columns: session.Columns, Rows: session.Rows}
	if err := result.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeTerminalFailedV2, "Unable to publish terminal state.")
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func writeTerminalRunError(response http.ResponseWriter, service ProjectService, err error, expectedRevision int) {
	switch {
	case errors.Is(err, aggregate.ErrRevisionConflict):
		writeRevisionConflict(response, expectedRevision, service.Snapshot().Project.Revision)
	case errors.Is(err, aggregate.ErrProjectNotFound):
		writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV2, "The requested project resource does not exist.")
	default:
		writeTerminalServiceError(response, err)
	}
}

func writeTerminalServiceError(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, terminal.ErrSessionNotFound):
		writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV2, "The terminal is not open.")
	case errors.Is(err, terminal.ErrClosed), errors.Is(err, terminal.ErrSessionExited), errors.Is(err, terminal.ErrAttachmentActive), errors.Is(err, terminal.ErrInvalidTicket), errors.Is(err, terminal.ErrPythonUnavailable):
		writeError(response, http.StatusServiceUnavailable, contracts.APIErrorCodeTerminalUnavailableV2, "The terminal is unavailable. Try again.")
	case errors.Is(err, terminal.ErrInvalidSize):
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Terminal dimensions are invalid.")
	default:
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeTerminalFailedV2, "Unable to complete the terminal request.")
	}
}

func isTerminalStreamPath(request *http.Request) bool {
	return request.URL.Path == contracts.ProjectTerminalStreamPathV2 && request.URL.RawPath == "" && request.URL.EscapedPath() == contracts.ProjectTerminalStreamPathV2
}

func terminalTicketFromQuery(requestURL *url.URL) (string, bool) {
	values := requestURL.Query()
	if len(values) != 1 || len(values["ticket"]) != 1 || strings.TrimSpace(values.Get("ticket")) == "" {
		return "", false
	}
	return values.Get("ticket"), true
}

func (routes *terminalRoutes) allowsOrigin(value string) bool {
	normalized, ok := normalizeOrigin(value)
	if !ok {
		return false
	}
	_, allowed := routes.allowedOrigins[normalized]
	return allowed
}

func terminalAllowedOrigins(appOrigin string) map[string]struct{} {
	allowed := map[string]struct{}{appOrigin: {}}
	parsed, err := url.Parse(appOrigin)
	if err != nil || parsed.Hostname() != "127.0.0.1" || parsed.Port() == "" {
		return allowed
	}

	allowed[parsed.Scheme+"://localhost:"+parsed.Port()] = struct{}{}
	return allowed
}

func normalizeOrigin(value string) (string, bool) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.User != nil || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", false
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", false
	}
	if !isLoopbackHostname(strings.ToLower(parsed.Hostname())) {
		return "", false
	}
	return scheme + "://" + strings.ToLower(parsed.Host), true
}

func isLoopbackHostname(hostname string) bool {
	if hostname == "localhost" {
		return true
	}
	address := net.ParseIP(hostname)
	return address != nil && address.IsLoopback()
}
