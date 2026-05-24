package wsapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/realtime"
	"setta/internal/terminals"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
)

func serveTerminalConnection(
	ctx context.Context,
	r *http.Request,
	conn *websocket.Conn,
	info ConnectionInfo,
	deps RouteDependencies,
) error {
	if err := deps.Transport.ModePolicy.RequireNotLauncher(); err != nil {
		return mapModesError(err)
	}
	if err := requireTerminalRouteAccess(info.Modes, deps.Deployment); err != nil {
		return err
	}

	projectID, sectionID, err := parseTerminalRouteParams(r)
	if err != nil {
		return err
	}

	routeCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	terminalID, err := ensureTerminalRouteSession(projectID, sectionID, info.Modes, deps)
	if err != nil {
		return err
	}

	attachment, err := deps.Terminals.Attach(terminalID)
	if err != nil {
		return err
	}
	defer attachment.Close()

	if err := sendTerminalBootstrapFrames(routeCtx, conn, attachment); err != nil {
		return err
	}

	return runTerminalRouteLoop(routeCtx, conn, terminalID, info.Modes, deps, attachment)
}

func parseTerminalRouteParams(r *http.Request) (string, string, error) {
	projectID := strings.TrimSpace(chi.URLParam(r, "projectID"))
	if projectID == "" {
		return "", "", &CloseError{Code: CloseCodeBadRequest, Reason: "Missing project id."}
	}
	sectionID := strings.TrimSpace(chi.URLParam(r, "sectionID"))
	if sectionID == "" {
		return "", "", &CloseError{Code: CloseCodeBadRequest, Reason: "Missing section id."}
	}
	return projectID, sectionID, nil
}

func ensureTerminalRouteSession(
	projectID string,
	sectionID string,
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
) (string, error) {
	terminalID := terminals.BuildTerminalID(sectionID, requestInfo.ShareSessionID)
	allowInput := !requestInfo.Policy.IsDeployment()
	if sessionInfo, ok := deps.Terminals.Session(terminalID); ok {
		if sessionInfo.AllowInput != allowInput {
			return "", fmt.Errorf("terminal session %q input policy mismatch", terminalID)
		}
		return terminalID, nil
	}
	if _, _, err := deps.Terminals.Open(terminals.OpenOptions{
		ID:             terminalID,
		ProjectID:      projectID,
		ShareSessionID: requestInfo.ShareSessionID,
		AllowInput:     allowInput,
	}); err != nil {
		return "", err
	}
	return terminalID, nil
}

func sendTerminalBootstrapFrames(ctx context.Context, conn *websocket.Conn, attachment *terminals.Attachment) error {
	if err := writeTerminalFrame(ctx, conn, []byte(TerminalReadyMessage)); err != nil {
		return classifyTerminalWriteError(err)
	}
	if err := writeTerminalFrame(ctx, conn, attachment.History); err != nil {
		return classifyTerminalWriteError(err)
	}
	return nil
}

func runTerminalRouteLoop(
	routeCtx context.Context,
	conn *websocket.Conn,
	terminalID string,
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
	attachment *terminals.Attachment,
) error {
	incoming := startTerminalInboundLoop(routeCtx, conn)
	for {
		select {
		case <-routeCtx.Done():
			return nil
		case message, ok := <-incoming:
			if !ok {
				return nil
			}
			done, err := handleTerminalInboundMessage(routeCtx, conn, terminalID, requestInfo, deps, message)
			if done {
				return err
			}
			if err != nil {
				return err
			}
		case output, ok := <-attachment.Output:
			if err := forwardTerminalOutput(routeCtx, conn, output, ok); err != nil {
				return err
			}
		}
	}
}

func handleTerminalInboundMessage(
	routeCtx context.Context,
	conn *websocket.Conn,
	terminalID string,
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
	message terminalInboundMessage,
) (bool, error) {
	if message.Err != nil {
		if websocket.CloseStatus(message.Err) != -1 || errors.Is(message.Err, context.Canceled) {
			return true, nil
		}
		return true, message.Err
	}
	if err := touchShareSession(requestInfo, deps.Transport.ShareSessions); err != nil {
		return true, mapModesError(err)
	}

	resize, isControl, err := decodeTerminalControlMessage(message.Payload)
	if err != nil {
		return true, closeTerminalRouteConnection(conn, CloseCodeBadRequest, err.Error())
	}
	if isControl {
		return false, deps.Terminals.Resize(terminalID, resize.Cols, resize.Rows)
	}

	if err := deps.Terminals.Write(terminalID, message.Payload); err != nil {
		switch {
		case errors.Is(err, terminals.ErrInputDisabled):
			return false, nil
		case errors.Is(err, terminals.ErrUnknownSession):
			return true, &CloseError{Code: websocket.StatusNormalClosure, Reason: "Terminal session ended."}
		default:
			return true, err
		}
	}
	return false, nil
}

func forwardTerminalOutput(
	ctx context.Context,
	conn *websocket.Conn,
	output []byte,
	ok bool,
) error {
	if !ok {
		return &CloseError{Code: websocket.StatusNormalClosure, Reason: "Terminal session ended."}
	}
	if err := writeTerminalFrame(ctx, conn, output); err != nil {
		return classifyTerminalWriteError(err)
	}
	return nil
}

func requireTerminalRouteAccess(info modes.RequestInfo, deployment *deployments.Runtime) error {
	if !info.Policy.IsDeployment() {
		return nil
	}
	if deployment == nil {
		return fmt.Errorf("deployment runtime is required for terminal websocket routes")
	}
	if deployment.Policy().AllowRun {
		return nil
	}
	return &CloseError{
		Code: CloseCodeForbidden,
	}
}

func decodeListenerMessage(payload []byte) (listenerInboundMessage, error) {
	var envelope listenerEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return listenerInboundMessage{}, err
	}

	switch envelope.MessageType {
	case realtime.MessageTypeListenerInit:
		var content realtime.ListenerInitContent
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return listenerInboundMessage{}, err
		}
		return listenerInboundMessage{
			MessageType: envelope.MessageType,
			Init:        &content,
		}, nil
	case realtime.MessageTypeListenerRegister:
		var content realtime.ListenerRegisterContent
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return listenerInboundMessage{}, err
		}
		return listenerInboundMessage{
			MessageType: envelope.MessageType,
			Register:    &content,
		}, nil
	case realtime.MessageTypeListenerFrontendEmit:
		var content realtime.ListenerFrontendEmitContent
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return listenerInboundMessage{}, err
		}
		return listenerInboundMessage{
			MessageType:  envelope.MessageType,
			FrontendEmit: &content,
		}, nil
	case realtime.MessageTypeListenerRouterCall:
		var content realtime.ListenerRouterEndpointCallContent
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return listenerInboundMessage{}, err
		}
		return listenerInboundMessage{
			MessageType: envelope.MessageType,
			RouterCall:  &content,
		}, nil
	default:
		return listenerInboundMessage{
			MessageType: envelope.MessageType,
		}, nil
	}
}

func decodeTerminalControlMessage(payload []byte) (terminalResizeMessage, bool, error) {
	var message terminalResizeMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		return terminalResizeMessage{}, false, nil
	}

	message.MessageType = strings.TrimSpace(message.MessageType)
	if message.MessageType == "" {
		return terminalResizeMessage{}, false, nil
	}
	if message.MessageType != TerminalMessageTypeResize {
		return terminalResizeMessage{}, true, fmt.Errorf("unsupported terminal message type")
	}
	if message.Rows < 1 || message.Cols < 1 {
		return terminalResizeMessage{}, true, fmt.Errorf("invalid terminal resize payload")
	}

	return message, true, nil
}

func invalidWebsocketMessageError() error {
	return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
}

func unsupportedWebsocketMessageError() error {
	return &CloseError{Code: CloseCodeBadRequest, Reason: "Unsupported websocket message type."}
}

func listenerTemporaryIDMessage(err error) (string, bool) {
	var temporaryIDError *listenerTemporaryIDError
	if !errors.As(err, &temporaryIDError) {
		return "", false
	}
	return temporaryIDError.Error(), true
}
