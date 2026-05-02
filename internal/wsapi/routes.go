package wsapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"setta/internal/artifacts"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/terminals"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
)

const (
	RouteFrontend          = "/ws/frontend"
	RouteListenerByID      = "/ws/listeners/{listenerID}"
	RouteTerminalBySection = "/ws/terminals/{projectID}/{sectionID}"
	listenerProjectIDQuery = "projectId"
)

const (
	TerminalReadyMessage      = "SETTA_TERMINAL_READY"
	TerminalMessageTypeResize = "terminalResize"
)

type RouteDependencies struct {
	Transport              Dependencies
	Deployment             *deployments.Runtime
	ProjectState           *projectstate.Runtime
	Artifacts              ListenerArtifactService
	ShareArtifacts         ListenerShareArtifactService
	WebsocketHub           *realtime.WebsocketHub
	UISettingRevealResults *realtime.UISettingRevealResultHub
	ListenerBroadcaster    *realtime.ListenerBroadcaster
	BuiltInListenerInvoker BuiltInListenerEndpointInvoker
	ListenerProducer       *realtime.ListenerProducer
	Terminals              *terminals.Service
	TemporaryIDs           realtime.ListenerTemporaryIDStore
	FrontendIDSource       func() (string, error)
}

type BuiltInListenerEndpointInvoker interface {
	InvokeBuiltInListenerEndpoint(context.Context, ConnectionInfo, string, map[string]any) (any, bool, error)
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
	MessageType realtime.ListenerMessageType `json:"messageType"`
	Content     json.RawMessage              `json:"content"`
}

type listenerInboundMessage struct {
	MessageType  realtime.ListenerMessageType
	Init         *realtime.ListenerInitContent
	Register     *realtime.ListenerRegisterContent
	FrontendEmit *realtime.ListenerFrontendEmitContent
	RouterCall   *realtime.ListenerRouterEndpointCallContent
}

type frontendInboundMessage struct {
	MessageType             FrontendMessageType
	CurrentAddress          *CurrentAddressUpdateMessage
	UISettingRevealResult   *realtime.UISettingRevealResultContent
	RealtimeUIChange        *RealtimeUIChangeContent
	RealtimeDependencyEvent *RealtimeDependencyEventContent
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

type frontendRouteSession struct {
	connectionID         string
	broadcastConnections bool
}

type frontendMessageHandler func(context.Context, frontendRouteSession, modes.RequestInfo, frontendInboundMessage, RouteDependencies) error

type frontendEnvelopeParser func(json.RawMessage, []byte) (frontendInboundMessage, error)

type listenerMessageHandler func(context.Context, string, ConnectionInfo, listenerInboundMessage, RouteDependencies) error

type listenerRouteSession struct {
	connectionID string
}

type listenerRouterCallState struct {
	callID            string
	projectID         string
	responseProjectID string
	endpointName      string
}

var frontendMessageHandlers = map[FrontendMessageType]frontendMessageHandler{
	FrontendMessageTypeCurrentAddressUpdate:    handleFrontendCurrentAddressUpdate,
	FrontendMessageTypeUISettingRevealResult:   handleFrontendUISettingRevealResult,
	FrontendMessageTypeRealtimeUIChange:        handleFrontendRealtimeUIChange,
	FrontendMessageTypeRealtimeDependencyEvent: handleFrontendRealtimeDependencyEvent,
}

var frontendEnvelopeParsers = map[FrontendMessageType]frontendEnvelopeParser{
	FrontendMessageTypeCurrentAddressUpdate:    parseCurrentAddressEnvelope,
	FrontendMessageTypeUISettingRevealResult:   parseUISettingRevealResultEnvelope,
	FrontendMessageTypeRealtimeUIChange:        parseRealtimeUIChangeEnvelope,
	FrontendMessageTypeRealtimeDependencyEvent: parseRealtimeDependencyEventEnvelope,
}

var listenerMessageHandlers = map[realtime.ListenerMessageType]listenerMessageHandler{
	realtime.MessageTypeListenerInit:         handleListenerInitMessage,
	realtime.MessageTypeListenerRegister:     handleListenerRegisterMessage,
	realtime.MessageTypeListenerFrontendEmit: handleListenerFrontendEmitMessage,
	realtime.MessageTypeListenerRouterCall:   handleListenerRouterCallMessage,
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
	_ *http.Request,
	conn *websocket.Conn,
	info ConnectionInfo,
	deps RouteDependencies,
) error {
	if err := deps.Transport.ModePolicy.RequireNotLauncher(); err != nil {
		return mapModesError(err)
	}

	session, cleanup, err := setupFrontendRoute(ctx, conn, info.Modes, deps)
	if err != nil {
		return err
	}
	defer cleanup()

	return runFrontendRouteLoop(ctx, conn, session, info.Modes, deps)
}

func setupFrontendRoute(
	ctx context.Context,
	conn *websocket.Conn,
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
) (frontendRouteSession, func(), error) {
	connectionID, err := deps.FrontendIDSource()
	if err != nil {
		return frontendRouteSession{}, nil, err
	}

	session := frontendRouteSession{
		connectionID:         connectionID,
		broadcastConnections: !requestInfo.Policy.IsDeployment(),
	}
	connection, err := deps.WebsocketHub.Connect(ctx, conn, realtime.ConnectParams{
		ID:                   session.connectionID,
		Type:                 realtime.ConnectionTypeFrontend,
		ShareSessionID:       requestInfo.ShareSessionID,
		BroadcastConnections: session.broadcastConnections,
	})
	if err != nil {
		return frontendRouteSession{}, nil, err
	}

	cleanup := func() {
		deps.WebsocketHub.Disconnect(context.Background(), connection.ID, session.broadcastConnections)
		if deps.UISettingRevealResults != nil {
			deps.UISettingRevealResults.CancelRequestsForWebsocketID(connection.ID)
		}
	}
	if err := ensureFrontendDeploymentListener(requestInfo, deps); err != nil {
		cleanup()
		return frontendRouteSession{}, nil, err
	}
	if err := sendFrontendBootstrapMessages(ctx, requestInfo, session, deps); err != nil {
		cleanup()
		return frontendRouteSession{}, nil, err
	}
	return session, cleanup, nil
}

func ensureFrontendDeploymentListener(requestInfo modes.RequestInfo, deps RouteDependencies) error {
	if !requestInfo.Policy.IsDeployment() || deps.Deployment == nil {
		return nil
	}
	return deps.Deployment.EnsureListenerForSession(
		requestInfo.ShareSessionID,
		deps.Deployment.Manifest().DefaultProjectID,
	)
}

func sendFrontendBootstrapMessages(
	ctx context.Context,
	requestInfo modes.RequestInfo,
	session frontendRouteSession,
	deps RouteDependencies,
) error {
	if err := deps.WebsocketHub.SendFrontendIdentity(ctx, session.connectionID); err != nil {
		return err
	}
	if requestInfo.Policy.IsDeployment() || deps.ProjectState == nil {
		return nil
	}
	return sendFrontendNameValidationErrors(ctx, session.connectionID, deps)
}

func sendFrontendNameValidationErrors(ctx context.Context, connectionID string, deps RouteDependencies) error {
	validationErrors, err := projectstate.CollectAllNameValidationErrors(deps.ProjectState.Snapshot().Document)
	if err != nil {
		return err
	}
	for _, validationError := range validationErrors {
		if _, err := deps.WebsocketHub.SendJSON(
			ctx,
			realtime.NewNameValidationErrorsMessage(validationError),
			connectionID,
		); err != nil {
			return err
		}
	}
	return nil
}

func runFrontendRouteLoop(
	ctx context.Context,
	conn *websocket.Conn,
	session frontendRouteSession,
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
) error {
	for {
		messageType, payload, err := conn.Read(ctx)
		if err != nil {
			if websocket.CloseStatus(err) != -1 || errors.Is(err, context.Canceled) {
				return nil
			}
			return err
		}
		if err := touchShareSession(requestInfo, deps.Transport.ShareSessions); err != nil {
			return mapModesError(err)
		}

		message, err := decodeFrontendMessage(messageType, payload)
		if err != nil {
			return invalidWebsocketMessageError()
		}
		if err := handleFrontendMessage(ctx, session, requestInfo, message, deps); err != nil {
			return err
		}
	}
}

func handleFrontendMessage(
	ctx context.Context,
	session frontendRouteSession,
	requestInfo modes.RequestInfo,
	message frontendInboundMessage,
	deps RouteDependencies,
) error {
	handler, ok := frontendMessageHandlers[message.MessageType]
	if !ok {
		return unsupportedWebsocketMessageError()
	}
	return handler(ctx, session, requestInfo, message, deps)
}

func handleFrontendCurrentAddressUpdate(
	ctx context.Context,
	session frontendRouteSession,
	_ modes.RequestInfo,
	message frontendInboundMessage,
	deps RouteDependencies,
) error {
	if message.CurrentAddress == nil {
		return invalidWebsocketMessageError()
	}
	return deps.WebsocketHub.UpdateCurrentAddress(
		ctx,
		session.connectionID,
		message.CurrentAddress.Content,
		session.broadcastConnections,
	)
}

func handleFrontendUISettingRevealResult(
	_ context.Context,
	session frontendRouteSession,
	_ modes.RequestInfo,
	message frontendInboundMessage,
	deps RouteDependencies,
) error {
	if message.UISettingRevealResult == nil {
		return invalidWebsocketMessageError()
	}
	if deps.UISettingRevealResults != nil {
		deps.UISettingRevealResults.Resolve(*message.UISettingRevealResult, session.connectionID)
	}
	return nil
}

func handleFrontendRealtimeUIChange(
	ctx context.Context,
	_ frontendRouteSession,
	requestInfo modes.RequestInfo,
	message frontendInboundMessage,
	deps RouteDependencies,
) error {
	if message.RealtimeUIChange == nil {
		return invalidWebsocketMessageError()
	}
	if _, _, err := deps.ListenerProducer.EmitUIChange(ctx, realtime.EmitUIChangeParams{
		ProjectID:      message.RealtimeUIChange.ProjectConfigID,
		ShareSessionID: requestInfo.ShareSessionID,
		DependencyKey:  message.RealtimeUIChange.DependencyKey,
		Value:          message.RealtimeUIChange.Value,
		BinaryPayload:  message.BinaryPayload,
	}); err != nil {
		return mapListenerProducerError(err)
	}
	return nil
}

func handleFrontendRealtimeDependencyEvent(
	ctx context.Context,
	_ frontendRouteSession,
	requestInfo modes.RequestInfo,
	message frontendInboundMessage,
	deps RouteDependencies,
) error {
	if message.RealtimeDependencyEvent == nil {
		return invalidWebsocketMessageError()
	}
	if _, _, err := deps.ListenerProducer.EmitDependencyEvent(ctx, realtime.EmitDependencyEventParams{
		ProjectID:      message.RealtimeDependencyEvent.ProjectConfigID,
		ShareSessionID: requestInfo.ShareSessionID,
		DependencyKey:  message.RealtimeDependencyEvent.DependencyEvent.DependencyKey,
		Payload:        message.RealtimeDependencyEvent.DependencyEvent.Payload,
		TimestampMS:    message.RealtimeDependencyEvent.DependencyEvent.TimestampMS,
		BinaryPayload:  message.BinaryPayload,
	}); err != nil {
		return mapListenerProducerError(err)
	}
	return nil
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
	parser, ok := frontendEnvelopeParsers[FrontendMessageType(envelope.MessageType)]
	if !ok {
		return frontendInboundMessage{
			MessageType: FrontendMessageType(envelope.MessageType),
		}, nil
	}
	return parser(envelope.Content, binaryPayload)
}

func cloneBinaryPayload(payload []byte) []byte {
	if payload == nil {
		return nil
	}

	cloned := make([]byte, len(payload))
	copy(cloned, payload)
	return cloned
}

func parseCurrentAddressEnvelope(contentPayload json.RawMessage, binaryPayload []byte) (frontendInboundMessage, error) {
	if err := ensureFrontendMessageHasNoBinaryPayload(binaryPayload, "current address updates"); err != nil {
		return frontendInboundMessage{}, err
	}
	var content string
	if err := json.Unmarshal(contentPayload, &content); err != nil {
		return frontendInboundMessage{}, err
	}
	return frontendInboundMessage{
		MessageType: FrontendMessageTypeCurrentAddressUpdate,
		CurrentAddress: &CurrentAddressUpdateMessage{
			MessageType: FrontendMessageTypeCurrentAddressUpdate,
			Content:     content,
		},
	}, nil
}

func parseUISettingRevealResultEnvelope(contentPayload json.RawMessage, binaryPayload []byte) (frontendInboundMessage, error) {
	if err := ensureFrontendMessageHasNoBinaryPayload(binaryPayload, "UI setting reveal results"); err != nil {
		return frontendInboundMessage{}, err
	}
	var content realtime.UISettingRevealResultContent
	if err := json.Unmarshal(contentPayload, &content); err != nil {
		return frontendInboundMessage{}, err
	}
	return frontendInboundMessage{
		MessageType:           FrontendMessageTypeUISettingRevealResult,
		UISettingRevealResult: &content,
	}, nil
}

func parseRealtimeUIChangeEnvelope(contentPayload json.RawMessage, binaryPayload []byte) (frontendInboundMessage, error) {
	var content RealtimeUIChangeContent
	if err := json.Unmarshal(contentPayload, &content); err != nil {
		return frontendInboundMessage{}, err
	}
	if err := validateFrontendBinaryPayload(content.Value, binaryPayload, "binary realtime UI change requires Binary value"); err != nil {
		return frontendInboundMessage{}, err
	}
	return frontendInboundMessage{
		MessageType:      FrontendMessageTypeRealtimeUIChange,
		RealtimeUIChange: &content,
		BinaryPayload:    cloneBinaryPayload(binaryPayload),
	}, nil
}

func parseRealtimeDependencyEventEnvelope(contentPayload json.RawMessage, binaryPayload []byte) (frontendInboundMessage, error) {
	var content RealtimeDependencyEventContent
	if err := json.Unmarshal(contentPayload, &content); err != nil {
		return frontendInboundMessage{}, err
	}
	if err := validateFrontendBinaryPayload(content.DependencyEvent.Payload, binaryPayload, "binary dependency event requires Binary payload"); err != nil {
		return frontendInboundMessage{}, err
	}
	return frontendInboundMessage{
		MessageType:             FrontendMessageTypeRealtimeDependencyEvent,
		RealtimeDependencyEvent: &content,
		BinaryPayload:           cloneBinaryPayload(binaryPayload),
	}, nil
}

func ensureFrontendMessageHasNoBinaryPayload(binaryPayload []byte, description string) error {
	if binaryPayload != nil {
		return fmt.Errorf("%s do not support binary payloads", description)
	}
	return nil
}

func validateFrontendBinaryPayload(payload json.RawMessage, binaryPayload []byte, message string) error {
	if binaryPayload == nil {
		return nil
	}
	isBinary, err := realtime.DependencyValueIsBinary(payload)
	if err != nil {
		return err
	}
	if !isBinary {
		return errors.New(message)
	}
	return nil
}
