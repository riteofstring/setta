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
	"setta/internal/artifacts"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
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
	Transport               Dependencies
	Deployment              *deployments.Runtime
	ProjectState            *projectstate.Runtime
	Artifacts               ListenerArtifactService
	ShareArtifacts          ListenerShareArtifactService
	WebsocketHub            *realtime.WebsocketHub
	UISettingRevealResults  *realtime.UISettingRevealResultHub
	ListenerBroadcaster     *realtime.ListenerBroadcaster
	BuiltInListenerInvoker  BuiltInListenerEndpointInvoker
	ListenerEndpointInvoker ListenerEndpointInvoker
	ListenerProducer        *realtime.ListenerProducer
	Terminals               *terminals.Service
	FrontendIDSource        func() (string, error)
}

type BuiltInListenerEndpointInvoker interface {
	InvokeBuiltInListenerEndpoint(context.Context, ConnectionInfo, string, map[string]any) (any, bool, error)
}

type ListenerEndpointInvoker interface {
	InvokeListenerEndpoint(context.Context, string, map[string]any) (any, error)
}

type ListenerArtifactService interface {
	ValidateListenerUpdate(artifact artifacts.RawArtifact, scope artifacts.UploadScope) (string, error)
	Update(ctx context.Context, request artifacts.UpdateRequest) ([]artifacts.ArtifactSaveResult, error)
}

type ListenerShareArtifactService interface {
	ValidateListenerUpdate(artifact artifacts.RawArtifact, scope artifacts.UploadScope) (string, error)
	Update(ctx context.Context, sessionID string, request artifacts.UpdateRequest) ([]artifacts.ArtifactSaveResult, error)
}

type frontendEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

type listenerEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

type listenerInboundMessage struct {
	MessageType  string
	Init         *realtime.ListenerInitContent
	Register     *realtime.ListenerRegisterContent
	FrontendEmit *realtime.ListenerFrontendEmitContent
	RouterCall   *realtime.ListenerRouterEndpointCallContent
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

	if projectID != "" {
		if err := deps.ListenerBroadcaster.Registry().RecordBootstrap(realtime.ListenerBootstrap{
			ConnectionID:   connection.ID,
			ProjectID:      projectID,
			ShareSessionID: info.Modes.ShareSessionID,
		}); err != nil {
			return err
		}
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
		case realtime.MessageTypeListenerInit:
			if message.Init == nil {
				return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
			}
			if err := handleListenerInit(ctx, connection.ID, info.Modes, *message.Init, deps); err != nil {
				return err
			}
		case realtime.MessageTypeListenerRegister:
			if message.Register == nil {
				return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
			}
			if err := handleListenerRegister(ctx, connection.ID, *message.Register, deps); err != nil {
				return err
			}
		case realtime.MessageTypeListenerFrontendEmit:
			if message.FrontendEmit == nil {
				return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
			}
			if err := handleListenerFrontendEmit(ctx, connection.ID, info.Modes, *message.FrontendEmit, deps); err != nil {
				return err
			}
		case realtime.MessageTypeListenerRouterCall:
			if message.RouterCall == nil {
				return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
			}
			if err := handleListenerRouterEndpointCall(ctx, info, connection.ID, *message.RouterCall, deps); err != nil {
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
	if err := deps.Transport.ModePolicy.RequireNotLauncher(); err != nil {
		return mapModesError(err)
	}
	if err := requireTerminalRouteAccess(info.Modes, deps.Deployment); err != nil {
		return err
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
	allowInput := !info.Modes.Policy.IsDeployment()
	if sessionInfo, ok := deps.Terminals.Session(terminalID); ok {
		if sessionInfo.AllowInput != allowInput {
			return fmt.Errorf("terminal session %q input policy mismatch", terminalID)
		}
	} else {
		if _, _, err := deps.Terminals.Open(terminals.OpenOptions{
			ID:             terminalID,
			ProjectID:      projectID,
			ShareSessionID: info.Modes.ShareSessionID,
			AllowInput:     allowInput,
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
		Code:   CloseCodeForbidden,
		Reason: "Deployment policy disallows run and terminal access.",
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

func handleListenerRegister(
	ctx context.Context,
	connectionID string,
	content realtime.ListenerRegisterContent,
	deps RouteDependencies,
) error {
	requestedProjectID := strings.TrimSpace(content.ProjectConfigID)
	if requestedProjectID != "" {
		if bootstrap, ok := deps.ListenerBroadcaster.Registry().Bootstrap(connectionID); ok && bootstrap.ProjectID != requestedProjectID {
			return &CloseError{Code: CloseCodeBadRequest, Reason: "project config mismatch"}
		}
	}

	callbacks := make(map[string]realtime.ListenerCallback, len(content.Callbacks))
	ackStatuses := make(map[string]realtime.ListenerRegisterAckStatus, len(content.Callbacks))
	for callbackID, callback := range content.Callbacks {
		callbacks[callbackID] = realtime.ListenerCallback{
			Dependencies:   append([]string(nil), callback.Dependencies...),
			DependencyMode: callback.DependencyMode,
		}
		ackStatuses[callbackID] = realtime.ListenerRegisterAckStatus{Status: "accepted"}
	}

	if err := deps.ListenerBroadcaster.Registry().UpsertRegistration(connectionID, requestedProjectID, callbacks, ""); err != nil {
		return &CloseError{Code: CloseCodeBadRequest, Reason: err.Error()}
	}

	registration, ok := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	if !ok {
		return fmt.Errorf("listener registration was not retained for websocket %s", connectionID)
	}

	_, err := deps.WebsocketHub.SendJSON(
		ctx,
		realtime.NewListenerRegisterAckMessage(realtime.ListenerRegisterAckContent{
			ProjectConfigID: registration.ProjectID,
			ShareSessionID:  registration.ShareSessionID,
			Callbacks:       ackStatuses,
		}),
		connectionID,
	)
	return err
}

func handleListenerInit(
	ctx context.Context,
	connectionID string,
	requestInfo modes.RequestInfo,
	content realtime.ListenerInitContent,
	deps RouteDependencies,
) error {
	if content.UseTemporaryIDs {
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "listener_invalid_id",
			Details: map[string]any{
				"message": "Temporary listener ids are unsupported on the Go listener route.",
			},
		}, deps)
	}

	projectID, projectStatePayload, details, err := resolveListenerBootstrap(
		requestInfo,
		content,
		deps,
	)
	if err != nil {
		if len(details) == 0 {
			details = map[string]any{
				"message": err.Error(),
			}
		}
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error:   "project_state_unavailable",
			Details: details,
		}, deps)
	}

	if err := deps.ListenerBroadcaster.Registry().RecordBootstrap(realtime.ListenerBootstrap{
		ConnectionID:   connectionID,
		ProjectID:      projectID,
		ShareSessionID: requestInfo.ShareSessionID,
	}); err != nil {
		return err
	}

	_, err = deps.ListenerBroadcaster.SendForceRefresh(ctx, realtime.ForceRefreshParams{
		ProjectID:           projectID,
		ShareSessionID:      requestInfo.ShareSessionID,
		ProjectState:        projectStatePayload,
		TargetConnectionIDs: []string{connectionID},
	})
	return err
}

func resolveListenerBootstrap(
	requestInfo modes.RequestInfo,
	content realtime.ListenerInitContent,
	deps RouteDependencies,
) (string, json.RawMessage, map[string]any, error) {
	snapshot, err := listenerBootstrapSnapshot(requestInfo, deps)
	if err != nil {
		return "", nil, map[string]any{"message": err.Error()}, err
	}

	projectID := strings.TrimSpace(content.ProjectConfigID)
	projectName := strings.TrimSpace(content.ProjectName)
	switch {
	case projectID != "":
		// Explicit project config ids stay authoritative when both id and name are sent.
	case projectName != "":
		projectID, err = snapshot.Document.ProjectIDByName(projectName)
		if err != nil {
			return "", nil, map[string]any{
				"projectName": projectName,
				"message":     err.Error(),
			}, err
		}
	default:
		projectID = strings.TrimSpace(snapshot.Document.DefaultProjectID)
		if projectID == "" {
			err := fmt.Errorf("%w: default project id", projectview.ErrProjectConfigIDRequired)
			return "", nil, map[string]any{"message": err.Error()}, err
		}
	}

	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		details := map[string]any{
			"message": err.Error(),
		}
		if projectID != "" {
			details["projectConfigId"] = projectID
		}
		if projectName != "" {
			details["projectName"] = projectName
		}
		return "", nil, details, err
	}

	projectStatePayload, err := json.Marshal(projectStateView)
	if err != nil {
		return "", nil, map[string]any{"message": err.Error()}, err
	}
	return projectID, projectStatePayload, nil, nil
}

func listenerBootstrapSnapshot(
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
) (projectstate.Snapshot, error) {
	if requestInfo.Policy.IsDeployment() {
		if deps.Deployment == nil {
			return projectstate.Snapshot{}, fmt.Errorf("deployment runtime is required")
		}
		return deps.Deployment.SessionSnapshot(requestInfo.ShareSessionID)
	}
	if deps.ProjectState == nil {
		return projectstate.Snapshot{}, fmt.Errorf("project runtime is required")
	}
	return deps.ProjectState.Snapshot(), nil
}

func handleListenerRouterEndpointCall(
	ctx context.Context,
	info ConnectionInfo,
	connectionID string,
	content realtime.ListenerRouterEndpointCallContent,
	deps RouteDependencies,
) error {
	registration, ok := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	if !ok {
		return sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
			ProjectConfigID: strings.TrimSpace(content.ProjectConfigID),
			CallID:          strings.TrimSpace(content.CallID),
			OK:              false,
			Error:           "listener_not_registered",
			Details: map[string]any{
				"websocketId": connectionID,
			},
		}, deps)
	}

	projectID := registration.ProjectID
	receivedProjectID := strings.TrimSpace(content.ProjectConfigID)
	if receivedProjectID != projectID {
		return sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
			ProjectConfigID: projectID,
			CallID:          strings.TrimSpace(content.CallID),
			OK:              false,
			Error:           "project_config_mismatch",
			Details: map[string]any{
				"expectedProjectConfigId": projectID,
				"receivedProjectConfigId": receivedProjectID,
			},
		}, deps)
	}

	endpointName := strings.TrimSpace(content.EndpointName)
	if endpointName == "" {
		return sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
			ProjectConfigID: projectID,
			CallID:          strings.TrimSpace(content.CallID),
			OK:              false,
			Error:           "listener_call_invalid_operation",
			Details: map[string]any{
				"message": "endpointName must be non-empty",
			},
		}, deps)
	}

	payload := cloneListenerPayload(content.Payload)
	if payload == nil {
		payload = map[string]any{}
	}
	if rawProjectID, ok := payload["projectConfigId"]; !ok {
		payload["projectConfigId"] = projectID
	} else if payloadProjectID, ok := rawProjectID.(string); ok && strings.TrimSpace(payloadProjectID) != projectID {
		return sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
			ProjectConfigID: projectID,
			CallID:          strings.TrimSpace(content.CallID),
			OK:              false,
			Error:           "project_config_mismatch",
			Details: map[string]any{
				"expectedProjectConfigId": projectID,
				"receivedProjectConfigId": strings.TrimSpace(payloadProjectID),
			},
		}, deps)
	}

	result, err := invokeListenerEndpoint(ctx, info, endpointName, payload, deps)
	if err != nil {
		return sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
			ProjectConfigID: projectID,
			CallID:          strings.TrimSpace(content.CallID),
			OK:              false,
			Error:           "listener_call_failed",
			Details: map[string]any{
				"message": err.Error(),
			},
		}, deps)
	}

	if err := sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: projectID,
		CallID:          strings.TrimSpace(content.CallID),
		OK:              true,
		Result:          result,
	}, deps); err != nil {
		return err
	}

	if listenerEndpointRequiresForceRefresh(endpointName) {
		if err := sendListenerEndpointForceRefresh(ctx, info.Modes, projectID, endpointName, deps); err != nil {
			_ = sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_refresh_failed",
				Details: map[string]any{
					"endpointName": endpointName,
					"message":      err.Error(),
				},
			}, deps)
		}
	}
	return nil
}

func invokeListenerEndpoint(
	ctx context.Context,
	info ConnectionInfo,
	endpointName string,
	payload map[string]any,
	deps RouteDependencies,
) (any, error) {
	if deps.BuiltInListenerInvoker != nil {
		result, handled, err := deps.BuiltInListenerInvoker.InvokeBuiltInListenerEndpoint(ctx, info, endpointName, payload)
		if err != nil {
			return nil, err
		}
		if handled {
			return result, nil
		}
	}
	if deps.ListenerEndpointInvoker == nil {
		return nil, fmt.Errorf("unknown listener endpoint: %s", endpointName)
	}
	return deps.ListenerEndpointInvoker.InvokeListenerEndpoint(ctx, endpointName, payload)
}

func sendListenerRouterEndpointResult(
	ctx context.Context,
	connectionID string,
	content realtime.ListenerRouterEndpointResultContent,
	deps RouteDependencies,
) error {
	if content.Details == nil {
		content.Details = map[string]any{}
	}
	_, err := deps.WebsocketHub.SendJSON(
		ctx,
		realtime.NewListenerRouterEndpointResultMessage(content),
		connectionID,
	)
	return err
}

func listenerEndpointRequiresForceRefresh(endpointName string) bool {
	switch strings.TrimSpace(endpointName) {
	case "route_set_chat_section_state":
		return true
	default:
		return false
	}
}

func sendListenerEndpointForceRefresh(
	ctx context.Context,
	requestInfo modes.RequestInfo,
	projectID string,
	endpointName string,
	deps RouteDependencies,
) error {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return fmt.Errorf("listener endpoint %s requires a project config id for force refresh", strings.TrimSpace(endpointName))
	}

	snapshot, err := listenerBootstrapSnapshot(requestInfo, deps)
	if err != nil {
		return err
	}

	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return err
	}
	projectStatePayload, err := json.Marshal(projectStateView)
	if err != nil {
		return err
	}

	_, err = deps.ListenerBroadcaster.SendForceRefresh(ctx, realtime.ForceRefreshParams{
		ProjectID:      projectID,
		ShareSessionID: requestInfo.ShareSessionID,
		ProjectState:   projectStatePayload,
	})
	return err
}

func sendListenerError(
	ctx context.Context,
	connectionID string,
	content realtime.ListenerErrorContent,
	deps RouteDependencies,
) error {
	if content.Details == nil {
		content.Details = map[string]any{}
	}
	_, err := deps.WebsocketHub.SendJSON(
		ctx,
		realtime.NewListenerErrorMessage(content),
		connectionID,
	)
	return err
}

func cloneListenerPayload(values map[string]any) map[string]any {
	if values == nil {
		return nil
	}

	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
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
