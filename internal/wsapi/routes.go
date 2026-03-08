package wsapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/terminals"
)

const (
	RouteFrontend          = "/ws/frontend"
	RouteListenerByID      = "/ws/listeners/{listenerID}"
	RouteTerminalBySection = "/ws/terminals/{projectID}/{sectionID}"
	listenerProjectIDQuery = "projectId"
)

const (
	FrontendMessageTypeCurrentAddressUpdate = "CurrentAddressUpdate"
	TerminalReadyMessage                    = "SETTA_TERMINAL_READY"
	TerminalMessageTypeResize               = "terminalResize"
)

type RouteDependencies struct {
	Transport              Dependencies
	WebsocketHub           *realtime.WebsocketHub
	UISettingRevealResults *realtime.UISettingRevealResultHub
	ListenerBroadcaster    *realtime.ListenerBroadcaster
	ListenerProducer       *realtime.ListenerProducer
	Terminals              *terminals.Service
	FrontendIDSource       func() (string, error)
}

type frontendEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

type listenerEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

type frontendCurrentAddressUpdate struct {
	MessageType string `json:"messageType"`
	Content     string `json:"content"`
}

type frontendRealtimeUIChangeContent struct {
	ProjectID     string          `json:"projectConfigId"`
	DependencyKey json.RawMessage `json:"dependencyKey"`
	Value         json.RawMessage `json:"value"`
}

type frontendRealtimeDependencyEventContent struct {
	ProjectID       string                                 `json:"projectConfigId"`
	DependencyEvent frontendRealtimeDependencyEventPayload `json:"dependencyEvent"`
}

type frontendRealtimeDependencyEventPayload struct {
	DependencyKey json.RawMessage `json:"dependencyKey"`
	Payload       json.RawMessage `json:"payload"`
	TimestampMS   int64           `json:"timestampMs"`
}

type frontendInboundMessage struct {
	MessageType             string
	CurrentAddress          *frontendCurrentAddressUpdate
	UISettingRevealResult   *realtime.UISettingRevealResultContent
	RealtimeUIChange        *frontendRealtimeUIChangeContent
	RealtimeDependencyEvent *frontendRealtimeDependencyEventContent
	BinaryPayload           []byte
}

type terminalResizeMessage struct {
	MessageType string `json:"messageType"`
	Rows        int    `json:"rows"`
	Cols        int    `json:"cols"`
}

type terminalInboundMessage struct {
	Payload []byte
	Err     error
}

func RegisterRoutes(router chi.Router, deps RouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.WebsocketHub == nil {
		return fmt.Errorf("websocket hub is required")
	}
	if deps.ListenerBroadcaster == nil {
		return fmt.Errorf("listener broadcaster is required")
	}
	if deps.ListenerProducer == nil {
		return fmt.Errorf("listener producer is required")
	}
	if deps.Terminals == nil {
		return fmt.Errorf("terminal service is required")
	}
	if deps.FrontendIDSource == nil {
		deps.FrontendIDSource = generateFrontendConnectionID
	}

	router.Get(RouteFrontend, AuthenticatedRequestHandler(deps.Transport, func(ctx context.Context, r *http.Request, conn *websocket.Conn, info ConnectionInfo) error {
		return serveFrontendConnection(ctx, r, conn, info, deps)
	}))
	router.Get(RouteListenerByID, AuthenticatedRequestHandler(deps.Transport, func(ctx context.Context, r *http.Request, conn *websocket.Conn, info ConnectionInfo) error {
		return serveListenerConnection(ctx, r, conn, info, deps)
	}))
	router.Get(RouteTerminalBySection, AuthenticatedRequestHandler(deps.Transport, func(ctx context.Context, r *http.Request, conn *websocket.Conn, info ConnectionInfo) error {
		return serveTerminalConnection(ctx, r, conn, info, deps)
	}))
	return nil
}

func serveFrontendConnection(
	ctx context.Context,
	r *http.Request,
	conn *websocket.Conn,
	info ConnectionInfo,
	deps RouteDependencies,
) error {
	if err := deps.Transport.ModePolicy.RequireNotLauncher(); err != nil {
		return mapModesError(err)
	}

	connectionID, err := deps.FrontendIDSource()
	if err != nil {
		return err
	}
	broadcastConnections := !info.Modes.Policy.IsDeployment()

	connection, err := deps.WebsocketHub.Connect(ctx, conn, realtime.ConnectParams{
		ID:                   connectionID,
		Type:                 realtime.ConnectionTypeFrontend,
		ShareSessionID:       info.Modes.ShareSessionID,
		BroadcastConnections: broadcastConnections,
	})
	if err != nil {
		return err
	}
	defer deps.WebsocketHub.Disconnect(context.Background(), connection.ID, broadcastConnections)
	defer func() {
		if deps.UISettingRevealResults != nil {
			deps.UISettingRevealResults.CancelRequestsForWebsocketID(connection.ID)
		}
	}()

	if err := deps.WebsocketHub.SendFrontendIdentity(ctx, connection.ID); err != nil {
		return err
	}

	for {
		messageType, payload, err := conn.Read(ctx)
		if err != nil {
			if websocket.CloseStatus(err) != -1 || errors.Is(err, context.Canceled) {
				return nil
			}
			return err
		}
		if err := touchShareSession(info.Modes, deps.Transport.ShareSessions); err != nil {
			return mapModesError(err)
		}

		message, err := decodeFrontendMessage(messageType, payload)
		if err != nil {
			return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
		}
		switch message.MessageType {
		case FrontendMessageTypeCurrentAddressUpdate:
			if message.CurrentAddress == nil {
				return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
			}
			if err := deps.WebsocketHub.UpdateCurrentAddress(ctx, connection.ID, message.CurrentAddress.Content, broadcastConnections); err != nil {
				return err
			}
		case realtime.MessageTypeUISettingRevealResult:
			if message.UISettingRevealResult == nil {
				return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
			}
			if deps.UISettingRevealResults != nil {
				deps.UISettingRevealResults.Resolve(*message.UISettingRevealResult, connection.ID)
			}
		case realtime.MessageTypeRealtimeUIChange:
			if message.RealtimeUIChange == nil {
				return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
			}
			if _, _, err := deps.ListenerProducer.EmitUIChange(ctx, realtime.EmitUIChangeParams{
				ProjectID:      message.RealtimeUIChange.ProjectID,
				ShareSessionID: info.Modes.ShareSessionID,
				DependencyKey:  message.RealtimeUIChange.DependencyKey,
				Value:          message.RealtimeUIChange.Value,
				BinaryPayload:  message.BinaryPayload,
			}); err != nil {
				return mapListenerProducerError(err)
			}
		case realtime.MessageTypeRealtimeDependencyEvent:
			if message.RealtimeDependencyEvent == nil {
				return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
			}
			if _, _, err := deps.ListenerProducer.EmitDependencyEvent(ctx, realtime.EmitDependencyEventParams{
				ProjectID:      message.RealtimeDependencyEvent.ProjectID,
				ShareSessionID: info.Modes.ShareSessionID,
				DependencyKey:  message.RealtimeDependencyEvent.DependencyEvent.DependencyKey,
				Payload:        message.RealtimeDependencyEvent.DependencyEvent.Payload,
				TimestampMS:    message.RealtimeDependencyEvent.DependencyEvent.TimestampMS,
				BinaryPayload:  message.BinaryPayload,
			}); err != nil {
				return mapListenerProducerError(err)
			}
		default:
			return &CloseError{Code: CloseCodeBadRequest, Reason: "Unsupported websocket message type."}
		}
	}
}

func decodeFrontendMessage(messageType websocket.MessageType, payload []byte) (frontendInboundMessage, error) {
	switch messageType {
	case websocket.MessageText:
		return decodeFrontendTextMessage(payload)
	case websocket.MessageBinary:
		return decodeFrontendBinaryMessage(payload)
	default:
		return frontendInboundMessage{}, fmt.Errorf("unsupported websocket message type")
	}
}

func decodeFrontendTextMessage(payload []byte) (frontendInboundMessage, error) {
	var envelope frontendEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return frontendInboundMessage{}, err
	}
	return parseFrontendEnvelope(envelope, nil)
}

func decodeFrontendBinaryMessage(payload []byte) (frontendInboundMessage, error) {
	header, binaryPayload, err := realtime.DecodeBinaryFrame(payload)
	if err != nil {
		return frontendInboundMessage{}, err
	}

	var envelope frontendEnvelope
	if err := json.Unmarshal(header, &envelope); err != nil {
		return frontendInboundMessage{}, err
	}
	return parseFrontendEnvelope(envelope, binaryPayload)
}

func parseFrontendEnvelope(envelope frontendEnvelope, binaryPayload []byte) (frontendInboundMessage, error) {
	switch envelope.MessageType {
	case FrontendMessageTypeCurrentAddressUpdate:
		if binaryPayload != nil {
			return frontendInboundMessage{}, fmt.Errorf("current address updates do not support binary payloads")
		}

		var content string
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return frontendInboundMessage{}, err
		}
		return frontendInboundMessage{
			MessageType: FrontendMessageTypeCurrentAddressUpdate,
			CurrentAddress: &frontendCurrentAddressUpdate{
				MessageType: envelope.MessageType,
				Content:     content,
			},
		}, nil
	case realtime.MessageTypeUISettingRevealResult:
		if binaryPayload != nil {
			return frontendInboundMessage{}, fmt.Errorf("UI setting reveal results do not support binary payloads")
		}

		var content realtime.UISettingRevealResultContent
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return frontendInboundMessage{}, err
		}
		return frontendInboundMessage{
			MessageType:           realtime.MessageTypeUISettingRevealResult,
			UISettingRevealResult: &content,
		}, nil
	case realtime.MessageTypeRealtimeUIChange:
		var content frontendRealtimeUIChangeContent
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return frontendInboundMessage{}, err
		}
		if binaryPayload != nil {
			isBinary, err := realtime.DependencyValueIsBinary(content.Value)
			if err != nil {
				return frontendInboundMessage{}, err
			}
			if !isBinary {
				return frontendInboundMessage{}, fmt.Errorf("binary realtime UI change requires Binary value")
			}
		}
		return frontendInboundMessage{
			MessageType:      realtime.MessageTypeRealtimeUIChange,
			RealtimeUIChange: &content,
			BinaryPayload:    cloneBinaryPayload(binaryPayload),
		}, nil
	case realtime.MessageTypeRealtimeDependencyEvent:
		var content frontendRealtimeDependencyEventContent
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return frontendInboundMessage{}, err
		}
		if binaryPayload != nil {
			isBinary, err := realtime.DependencyValueIsBinary(content.DependencyEvent.Payload)
			if err != nil {
				return frontendInboundMessage{}, err
			}
			if !isBinary {
				return frontendInboundMessage{}, fmt.Errorf("binary dependency event requires Binary payload")
			}
		}
		return frontendInboundMessage{
			MessageType:             realtime.MessageTypeRealtimeDependencyEvent,
			RealtimeDependencyEvent: &content,
			BinaryPayload:           cloneBinaryPayload(binaryPayload),
		}, nil
	default:
		return frontendInboundMessage{
			MessageType: envelope.MessageType,
		}, nil
	}
}

func cloneBinaryPayload(payload []byte) []byte {
	if payload == nil {
		return nil
	}

	cloned := make([]byte, len(payload))
	copy(cloned, payload)
	return cloned
}

func mapListenerProducerError(err error) error {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, realtime.ErrDependencyKeyTypeRequired),
		errors.Is(err, realtime.ErrDependencyKeySectionIDRequired),
		errors.Is(err, realtime.ErrDependencyKeyCodeObjIDRequired),
		errors.Is(err, realtime.ErrUnsupportedDependencyKeyType),
		errors.Is(err, realtime.ErrDependencyValueTypeRequired):
		return &CloseError{Code: CloseCodeBadRequest, Reason: err.Error()}
	case errors.Is(err, projectstate.ErrProjectNotFound),
		errors.Is(err, deployments.ErrUnknownSession):
		return &CloseError{Code: CloseCodeNotFound, Reason: err.Error()}
	case errors.Is(err, projectstate.ErrSessionIDRequired):
		return &CloseError{Code: CloseCodeBadRequest, Reason: err.Error()}
	default:
		return err
	}
}

func serveListenerConnection(
	ctx context.Context,
	r *http.Request,
	conn *websocket.Conn,
	info ConnectionInfo,
	deps RouteDependencies,
) error {
	if err := deps.Transport.ModePolicy.RequireNotLauncher(); err != nil {
		return mapModesError(err)
	}

	listenerID := strings.TrimSpace(chi.URLParam(r, "listenerID"))
	if listenerID == "" {
		return &CloseError{Code: CloseCodeBadRequest, Reason: "Missing listener id."}
	}
	projectID := strings.TrimSpace(r.URL.Query().Get(listenerProjectIDQuery))
	if projectID == "" {
		return &CloseError{Code: CloseCodeBadRequest, Reason: "Missing project id."}
	}

	connection, err := deps.WebsocketHub.Connect(ctx, conn, realtime.ConnectParams{
		ID:             listenerID,
		Type:           realtime.ConnectionTypeListener,
		ShareSessionID: info.Modes.ShareSessionID,
	})
	if err != nil {
		return err
	}
	defer deps.WebsocketHub.Disconnect(context.Background(), connection.ID, false)
	defer deps.ListenerBroadcaster.RemoveConnection(connection.ID)

	if err := deps.ListenerBroadcaster.Registry().RecordBootstrap(realtime.ListenerBootstrap{
		ConnectionID:   connection.ID,
		ProjectID:      projectID,
		ShareSessionID: info.Modes.ShareSessionID,
	}); err != nil {
		return err
	}

	for {
		_, payload, err := conn.Read(ctx)
		if err != nil {
			if websocket.CloseStatus(err) != -1 || errors.Is(err, context.Canceled) {
				return nil
			}
			return err
		}
		if err := touchShareSession(info.Modes, deps.Transport.ShareSessions); err != nil {
			return mapModesError(err)
		}

		message, err := decodeListenerMessage(payload)
		if err != nil {
			return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
		}
		switch message.MessageType {
		case realtime.MessageTypeListenerRegister:
			if err := handleListenerRegister(ctx, connection.ID, projectID, info.Modes.ShareSessionID, message.Content, deps); err != nil {
				return err
			}
		default:
			return &CloseError{Code: CloseCodeBadRequest, Reason: "Unsupported websocket message type."}
		}
	}
}

func serveTerminalConnection(
	ctx context.Context,
	r *http.Request,
	conn *websocket.Conn,
	info ConnectionInfo,
	deps RouteDependencies,
) error {
	if err := deps.Transport.ModePolicy.RequireFullIDE(); err != nil {
		return mapModesError(err)
	}

	projectID := strings.TrimSpace(chi.URLParam(r, "projectID"))
	if projectID == "" {
		return &CloseError{Code: CloseCodeBadRequest, Reason: "Missing project id."}
	}
	sectionID := strings.TrimSpace(chi.URLParam(r, "sectionID"))
	if sectionID == "" {
		return &CloseError{Code: CloseCodeBadRequest, Reason: "Missing section id."}
	}

	routeCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	terminalID := terminals.BuildTerminalID(sectionID, info.Modes.ShareSessionID)
	if _, ok := deps.Terminals.Session(terminalID); !ok {
		if _, _, err := deps.Terminals.Open(terminals.OpenOptions{
			ID:             terminalID,
			ProjectID:      projectID,
			ShareSessionID: info.Modes.ShareSessionID,
			AllowInput:     true,
		}); err != nil {
			return err
		}
	}

	attachment, err := deps.Terminals.Attach(terminalID)
	if err != nil {
		return err
	}
	defer attachment.Close()

	if err := writeTerminalFrame(routeCtx, conn, []byte(TerminalReadyMessage)); err != nil {
		return classifyTerminalWriteError(err)
	}
	if err := writeTerminalFrame(routeCtx, conn, attachment.History); err != nil {
		return classifyTerminalWriteError(err)
	}

	incoming := startTerminalInboundLoop(routeCtx, conn)
	for {
		select {
		case <-routeCtx.Done():
			return nil
		case message, ok := <-incoming:
			if !ok {
				return nil
			}
			if message.Err != nil {
				if websocket.CloseStatus(message.Err) != -1 || errors.Is(message.Err, context.Canceled) {
					return nil
				}
				return message.Err
			}

			resize, isControl, err := decodeTerminalControlMessage(message.Payload)
			if err != nil {
				return &CloseError{Code: CloseCodeBadRequest, Reason: err.Error()}
			}
			if isControl {
				if err := deps.Terminals.Resize(terminalID, resize.Cols, resize.Rows); err != nil {
					return err
				}
				continue
			}

			if err := deps.Terminals.Write(terminalID, message.Payload); err != nil {
				if errors.Is(err, terminals.ErrInputDisabled) {
					return &CloseError{Code: CloseCodeForbidden, Reason: err.Error()}
				}
				if errors.Is(err, terminals.ErrUnknownSession) {
					return &CloseError{Code: websocket.StatusNormalClosure, Reason: "Terminal session ended."}
				}
				return err
			}
		case output, ok := <-attachment.Output:
			if !ok {
				return &CloseError{Code: websocket.StatusNormalClosure, Reason: "Terminal session ended."}
			}
			if err := writeTerminalFrame(routeCtx, conn, output); err != nil {
				return classifyTerminalWriteError(err)
			}
		}
	}
}

func decodeListenerMessage(payload []byte) (realtime.ListenerRegisterMessage, error) {
	var envelope listenerEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return realtime.ListenerRegisterMessage{}, err
	}

	switch envelope.MessageType {
	case realtime.MessageTypeListenerRegister:
		var content realtime.ListenerRegisterContent
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return realtime.ListenerRegisterMessage{}, err
		}
		return realtime.ListenerRegisterMessage{
			MessageType: envelope.MessageType,
			Content:     content,
		}, nil
	default:
		return realtime.ListenerRegisterMessage{
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

func handleListenerRegister(
	ctx context.Context,
	connectionID string,
	projectID string,
	shareSessionID string,
	content realtime.ListenerRegisterContent,
	deps RouteDependencies,
) error {
	callbacks := make(map[string]realtime.ListenerCallback, len(content.Callbacks))
	ackStatuses := make(map[string]realtime.ListenerRegisterAckStatus, len(content.Callbacks))
	for callbackID, callback := range content.Callbacks {
		callbacks[callbackID] = realtime.ListenerCallback{
			Dependencies:   append([]string(nil), callback.Dependencies...),
			DependencyMode: callback.DependencyMode,
		}
		ackStatuses[callbackID] = realtime.ListenerRegisterAckStatus{Status: "accepted"}
	}

	if err := deps.ListenerBroadcaster.Registry().UpsertRegistration(connectionID, "", callbacks, ""); err != nil {
		return &CloseError{Code: CloseCodeBadRequest, Reason: err.Error()}
	}

	_, err := deps.WebsocketHub.SendJSON(
		ctx,
		realtime.NewListenerRegisterAckMessage(realtime.ListenerRegisterAckContent{
			ProjectID:      projectID,
			ShareSessionID: shareSessionID,
			Callbacks:      ackStatuses,
		}),
		connectionID,
	)
	return err
}

func touchShareSession(info modes.RequestInfo, store modes.ShareSessionStore) error {
	if !info.Policy.IsDeployment() {
		return nil
	}
	shareSessionID := strings.TrimSpace(info.ShareSessionID)
	if shareSessionID == "" {
		return &modes.MissingShareSessionError{}
	}
	if store == nil || !store.HasSession(shareSessionID) {
		return &modes.UnknownShareSessionError{SessionID: shareSessionID}
	}
	return store.TouchSession(shareSessionID)
}

func writeTerminalFrame(ctx context.Context, conn *websocket.Conn, payload []byte) error {
	if len(payload) == 0 {
		return nil
	}
	return conn.Write(ctx, websocket.MessageText, payload)
}

func startTerminalInboundLoop(ctx context.Context, conn *websocket.Conn) <-chan terminalInboundMessage {
	ch := make(chan terminalInboundMessage, 1)
	go func() {
		defer close(ch)
		for {
			_, payload, err := conn.Read(ctx)
			if err != nil {
				select {
				case ch <- terminalInboundMessage{Err: err}:
				case <-ctx.Done():
				}
				return
			}

			cloned := append([]byte(nil), payload...)
			select {
			case ch <- terminalInboundMessage{Payload: cloned}:
			case <-ctx.Done():
				return
			}
		}
	}()
	return ch
}

func classifyTerminalWriteError(err error) error {
	if websocket.CloseStatus(err) != -1 || errors.Is(err, context.Canceled) {
		return nil
	}
	return err
}

func generateFrontendConnectionID() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate frontend connection id: %w", err)
	}
	return "frontend-" + hex.EncodeToString(buf), nil
}
