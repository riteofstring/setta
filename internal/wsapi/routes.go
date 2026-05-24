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
	"setta/internal/listenerendpoints"
	"setta/internal/listenersnapshot"
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

	session, cleanup, err := setupListenerRoute(ctx, r, conn, info.Modes, deps)
	if err != nil {
		return err
	}
	defer cleanup()

	return runListenerRouteLoop(ctx, conn, session.connectionID, info, deps)
}

func setupListenerRoute(
	ctx context.Context,
	r *http.Request,
	conn *websocket.Conn,
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
) (listenerRouteSession, func(), error) {
	listenerID := strings.TrimSpace(chi.URLParam(r, "listenerID"))
	if listenerID == "" {
		return listenerRouteSession{}, nil, &CloseError{Code: CloseCodeBadRequest, Reason: "Missing listener id."}
	}
	connection, err := deps.WebsocketHub.Connect(ctx, conn, realtime.ConnectParams{
		ID:             listenerID,
		Type:           realtime.ConnectionTypeListener,
		ShareSessionID: requestInfo.ShareSessionID,
	})
	if err != nil {
		return listenerRouteSession{}, nil, err
	}
	cleanup := func() {
		cleanupListenerRouteConnection(connection.ID, deps)
	}
	projectID := strings.TrimSpace(r.URL.Query().Get(listenerProjectIDQuery))
	if err := recordListenerBootstrap(connection.ID, projectID, requestInfo.ShareSessionID, deps); err != nil {
		cleanup()
		return listenerRouteSession{}, nil, err
	}
	return listenerRouteSession{connectionID: connection.ID}, cleanup, nil
}

func cleanupListenerRouteConnection(connectionID string, deps RouteDependencies) {
	deps.WebsocketHub.Disconnect(context.Background(), connectionID, false)
	registration, hadRegistration := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	deps.ListenerBroadcaster.RemoveConnection(connectionID)
	if !hadRegistration {
		return
	}
	_, _ = deps.ListenerBroadcaster.BroadcastCoverageSnapshot(
		context.Background(),
		registration.ProjectID,
		registration.ShareSessionID,
	)
}

func recordListenerBootstrap(connectionID string, projectID string, shareSessionID string, deps RouteDependencies) error {
	if projectID == "" {
		return nil
	}
	return deps.ListenerBroadcaster.Registry().RecordBootstrap(realtime.ListenerBootstrap{
		ConnectionID:   connectionID,
		ProjectID:      projectID,
		ShareSessionID: shareSessionID,
	})
}

func runListenerRouteLoop(
	ctx context.Context,
	conn *websocket.Conn,
	connectionID string,
	info ConnectionInfo,
	deps RouteDependencies,
) error {
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
			return invalidWebsocketMessageError()
		}
		if err := handleListenerMessage(ctx, connectionID, info, message, deps); err != nil {
			return err
		}
	}
}

func handleListenerMessage(
	ctx context.Context,
	connectionID string,
	info ConnectionInfo,
	message listenerInboundMessage,
	deps RouteDependencies,
) error {
	handler, ok := listenerMessageHandlers[message.MessageType]
	if !ok {
		return unsupportedWebsocketMessageError()
	}
	return handler(ctx, connectionID, info, message, deps)
}

func handleListenerInitMessage(
	ctx context.Context,
	connectionID string,
	info ConnectionInfo,
	message listenerInboundMessage,
	deps RouteDependencies,
) error {
	if message.Init == nil {
		return invalidWebsocketMessageError()
	}
	return handleListenerInit(ctx, connectionID, info.Modes, *message.Init, deps)
}

func handleListenerRegisterMessage(
	ctx context.Context,
	connectionID string,
	_ ConnectionInfo,
	message listenerInboundMessage,
	deps RouteDependencies,
) error {
	if message.Register == nil {
		return invalidWebsocketMessageError()
	}
	return handleListenerRegister(ctx, connectionID, *message.Register, deps)
}

func handleListenerFrontendEmitMessage(
	ctx context.Context,
	connectionID string,
	info ConnectionInfo,
	message listenerInboundMessage,
	deps RouteDependencies,
) error {
	if message.FrontendEmit == nil {
		return invalidWebsocketMessageError()
	}
	return handleListenerFrontendEmit(ctx, connectionID, info.Modes, *message.FrontendEmit, deps)
}

func handleListenerRouterCallMessage(
	ctx context.Context,
	connectionID string,
	info ConnectionInfo,
	message listenerInboundMessage,
	deps RouteDependencies,
) error {
	if message.RouterCall == nil {
		return invalidWebsocketMessageError()
	}
	return handleListenerRouterEndpointCall(ctx, info, connectionID, *message.RouterCall, deps)
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

func handleListenerTemporaryIDError(
	ctx context.Context,
	connectionID string,
	err error,
	deps RouteDependencies,
) error {
	if message, ok := listenerTemporaryIDMessage(err); ok {
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "listener_invalid_id",
			Details: map[string]any{
				"message": message,
			},
		}, deps)
	}
	return err
}

func handleListenerRegister(
	ctx context.Context,
	connectionID string,
	content realtime.ListenerRegisterContent,
	deps RouteDependencies,
) error {
	useTemporaryIDs := listenerUsesTemporaryIDs(deps, connectionID)
	requestedProjectID, err := resolveListenerRegisterProjectID(ctx, connectionID, strings.TrimSpace(content.ProjectConfigID), useTemporaryIDs, deps)
	if err != nil {
		return err
	}
	if err := validateListenerRegisterProjectMatch(connectionID, requestedProjectID, deps); err != nil {
		return err
	}

	callbacks, ackStatuses, err := buildListenerRegisterCallbacks(ctx, connectionID, content.Callbacks, useTemporaryIDs, deps)
	if err != nil {
		return err
	}

	if err := deps.ListenerBroadcaster.Registry().UpsertRegistration(connectionID, requestedProjectID, callbacks, ""); err != nil {
		return &CloseError{Code: CloseCodeBadRequest, Reason: err.Error()}
	}

	registration, ok := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	if !ok {
		return fmt.Errorf("listener registration was not retained for websocket %s", connectionID)
	}
	return sendListenerRegisterAck(ctx, connectionID, registration, ackStatuses, deps)
}

func resolveListenerRegisterProjectID(
	ctx context.Context,
	connectionID string,
	requestedProjectID string,
	useTemporaryIDs bool,
	deps RouteDependencies,
) (string, error) {
	if !useTemporaryIDs || requestedProjectID == "" {
		return requestedProjectID, nil
	}
	resolvedProjectID, err := resolveListenerProjectIDFromTemporary(requestedProjectID, deps.TemporaryIDs)
	if err != nil {
		return "", handleListenerTemporaryIDError(ctx, connectionID, err, deps)
	}
	return resolvedProjectID, nil
}

func validateListenerRegisterProjectMatch(connectionID string, requestedProjectID string, deps RouteDependencies) error {
	if requestedProjectID == "" {
		return nil
	}
	if bootstrap, ok := deps.ListenerBroadcaster.Registry().Bootstrap(connectionID); ok && bootstrap.ProjectID != requestedProjectID {
		return &CloseError{Code: CloseCodeBadRequest, Reason: "project config mismatch"}
	}
	return nil
}

func buildListenerRegisterCallbacks(
	ctx context.Context,
	connectionID string,
	callbackContent map[string]realtime.ListenerRegisterCallbackSpec,
	useTemporaryIDs bool,
	deps RouteDependencies,
) (map[string]realtime.ListenerCallback, map[string]realtime.ListenerRegisterAckStatus, error) {
	callbacks := make(map[string]realtime.ListenerCallback, len(callbackContent))
	ackStatuses := make(map[string]realtime.ListenerRegisterAckStatus, len(callbackContent))
	for callbackID, callback := range callbackContent {
		dependencies, err := resolveListenerRegisterDependencies(ctx, connectionID, callback.Dependencies, useTemporaryIDs, deps)
		if err != nil {
			return nil, nil, err
		}
		callbacks[callbackID] = realtime.ListenerCallback{
			Dependencies:   dependencies,
			DependencyMode: callback.DependencyMode,
		}
		ackStatuses[callbackID] = realtime.ListenerRegisterAckStatus{Status: "accepted"}
	}
	return callbacks, ackStatuses, nil
}

func resolveListenerRegisterDependencies(
	ctx context.Context,
	connectionID string,
	dependencies []string,
	useTemporaryIDs bool,
	deps RouteDependencies,
) ([]string, error) {
	resolvedDependencies := append([]string(nil), dependencies...)
	if !useTemporaryIDs {
		return resolvedDependencies, nil
	}
	for index, dependency := range resolvedDependencies {
		resolvedDependency, err := resolveListenerDependencyKeyFromTemporary(dependency, deps.TemporaryIDs)
		if err != nil {
			return nil, handleListenerTemporaryIDError(ctx, connectionID, err, deps)
		}
		resolvedDependencies[index] = resolvedDependency
	}
	return resolvedDependencies, nil
}

func sendListenerRegisterAck(
	ctx context.Context,
	connectionID string,
	registration realtime.ListenerRegistration,
	ackStatuses map[string]realtime.ListenerRegisterAckStatus,
	deps RouteDependencies,
) error {
	responseProjectID, err := listenerProjectIDForResponse(connectionID, registration.ProjectID, deps)
	if err != nil {
		return err
	}
	_, err = deps.WebsocketHub.SendJSON(
		ctx,
		realtime.NewListenerRegisterAckMessage(realtime.ListenerRegisterAckContent{
			ProjectConfigID: responseProjectID,
			ShareSessionID:  registration.ShareSessionID,
			Callbacks:       ackStatuses,
		}),
		connectionID,
	)
	if err != nil {
		return err
	}
	_, err = deps.ListenerBroadcaster.BroadcastCoverageSnapshot(
		ctx,
		registration.ProjectID,
		registration.ShareSessionID,
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
		if deps.TemporaryIDs == nil {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_invalid_id",
				Details: map[string]any{
					"message": "Temporary listener ids are unavailable on this Setta server.",
				},
			}, deps)
		}
		resolvedProjectID, err := resolveListenerProjectIDFromTemporary(content.ProjectConfigID, deps.TemporaryIDs)
		if err != nil {
			var temporaryIDError *listenerTemporaryIDError
			if errors.As(err, &temporaryIDError) {
				return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
					Error: "listener_invalid_id",
					Details: map[string]any{
						"message": temporaryIDError.Error(),
					},
				}, deps)
			}
			return err
		}
		content.ProjectConfigID = resolvedProjectID
	}

	projectID, snapshotPayload, details, err := resolveListenerBootstrap(
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
		ConnectionID:    connectionID,
		ProjectID:       projectID,
		ShareSessionID:  requestInfo.ShareSessionID,
		UseTemporaryIDs: content.UseTemporaryIDs,
	}); err != nil {
		return err
	}

	_, err = deps.ListenerBroadcaster.SendForceRefresh(ctx, realtime.ForceRefreshParams{
		ProjectID:           projectID,
		ShareSessionID:      requestInfo.ShareSessionID,
		Snapshot:            snapshotPayload,
		RefreshKind:         "bootstrap",
		TargetConnectionIDs: []string{connectionID},
	})
	return err
}

func resolveListenerBootstrap(
	requestInfo modes.RequestInfo,
	content realtime.ListenerInitContent,
	deps RouteDependencies,
) (string, listenersnapshot.ListenerSnapshotPayload, map[string]any, error) {
	snapshot, err := listenerBootstrapSnapshot(requestInfo, deps)
	if err != nil {
		return "", listenersnapshot.ListenerSnapshotPayload{}, map[string]any{"message": err.Error()}, err
	}

	target, details, err := resolveListenerBootstrapTarget(snapshot.Document, content)
	if err != nil {
		return "", listenersnapshot.ListenerSnapshotPayload{}, details, err
	}
	if err := validateListenerBootstrapTarget(snapshot.Document, target); err != nil {
		return "", listenersnapshot.ListenerSnapshotPayload{}, listenerBootstrapTargetErrorDetails(target, err), err
	}

	snapshotPayload, err := listenersnapshot.BuildListenerSnapshotPayload(snapshot.Document, target.projectID)
	if err != nil {
		return "", listenersnapshot.ListenerSnapshotPayload{}, map[string]any{"message": err.Error()}, err
	}
	return target.projectID, snapshotPayload, nil, nil
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

type listenerBootstrapTarget struct {
	projectID   string
	projectName string
}

func resolveListenerBootstrapTarget(
	document projectstate.Document,
	content realtime.ListenerInitContent,
) (listenerBootstrapTarget, map[string]any, error) {
	target := listenerBootstrapTarget{
		projectID:   strings.TrimSpace(content.ProjectConfigID),
		projectName: strings.TrimSpace(content.ProjectName),
	}
	if target.projectID != "" {
		return target, nil, nil
	}
	if target.projectName != "" {
		projectID, err := document.ProjectIDByName(target.projectName)
		if err != nil {
			return listenerBootstrapTarget{}, listenerBootstrapProjectNameErrorDetails(target.projectName, err), err
		}
		target.projectID = projectID
		return target, nil, nil
	}
	target.projectID = strings.TrimSpace(document.DefaultProjectID)
	if target.projectID != "" {
		return target, nil, nil
	}
	err := fmt.Errorf("%w: default project id", projectview.ErrProjectConfigIDRequired)
	return listenerBootstrapTarget{}, map[string]any{"message": err.Error()}, err
}

func validateListenerBootstrapTarget(
	document projectstate.Document,
	target listenerBootstrapTarget,
) error {
	_, err := projectview.SingleConfigByProjectID(document, target.projectID)
	return err
}

func listenerBootstrapProjectNameErrorDetails(projectName string, err error) map[string]any {
	details := map[string]any{
		"projectName": projectName,
	}
	if !errors.Is(err, projectstate.ErrProjectNotFound) {
		details["message"] = err.Error()
	}
	return details
}

func listenerBootstrapTargetErrorDetails(target listenerBootstrapTarget, err error) map[string]any {
	details := map[string]any{}
	if target.projectID != "" {
		details["projectConfigId"] = target.projectID
	}
	if target.projectName != "" {
		details["projectName"] = target.projectName
	}
	if !errors.Is(err, projectstate.ErrProjectNotFound) {
		details["message"] = err.Error()
	}
	return details
}

func handleListenerRouterEndpointCall(
	ctx context.Context,
	info ConnectionInfo,
	connectionID string,
	content realtime.ListenerRouterEndpointCallContent,
	deps RouteDependencies,
) error {
	state, err := resolveListenerRouterCallState(ctx, connectionID, content, deps)
	if err != nil {
		return err
	}
	if state == nil {
		return nil
	}
	payload, ok, err := normalizeListenerRouterPayload(ctx, connectionID, *state, content, deps)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	result, err := invokeListenerEndpoint(ctx, info, state.endpointName, payload, deps)
	if err != nil {
		return sendListenerRouterError(ctx, connectionID, state.responseProjectID, state.callID, "listener_call_failed", map[string]any{
			"message": err.Error(),
		}, deps)
	}

	if err := sendListenerRouterSuccess(ctx, connectionID, state.responseProjectID, state.callID, result, deps); err != nil {
		return err
	}

	return maybeSendListenerEndpointForceRefresh(ctx, info.Modes, connectionID, *state, deps)
}

func resolveListenerRouterCallState(
	ctx context.Context,
	connectionID string,
	content realtime.ListenerRouterEndpointCallContent,
	deps RouteDependencies,
) (*listenerRouterCallState, error) {
	callID := strings.TrimSpace(content.CallID)
	registration, ok := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	if !ok {
		err := sendListenerRouterError(ctx, connectionID, strings.TrimSpace(content.ProjectConfigID), callID, "listener_not_registered", map[string]any{
			"websocketId": connectionID,
		}, deps)
		return nil, err
	}

	projectID := registration.ProjectID
	responseProjectID, err := listenerProjectIDForResponse(connectionID, projectID, deps)
	if err != nil {
		return nil, err
	}
	receivedProjectID, err := resolveListenerRouterProjectID(ctx, connectionID, strings.TrimSpace(content.ProjectConfigID), responseProjectID, callID, deps)
	if err != nil {
		return nil, err
	}
	if receivedProjectID != projectID {
		err := sendListenerRouterError(ctx, connectionID, responseProjectID, callID, "project_config_mismatch", map[string]any{
			"expectedProjectConfigId": responseProjectID,
			"receivedProjectConfigId": strings.TrimSpace(content.ProjectConfigID),
		}, deps)
		return nil, err
	}

	endpointName := strings.TrimSpace(content.EndpointName)
	if endpointName == "" {
		err := sendListenerRouterError(ctx, connectionID, responseProjectID, callID, "listener_call_invalid_operation", map[string]any{
			"message": "endpointName must be non-empty",
		}, deps)
		return nil, err
	}

	state := listenerRouterCallState{
		callID:            callID,
		projectID:         projectID,
		responseProjectID: responseProjectID,
		endpointName:      endpointName,
	}
	return &state, nil
}

func resolveListenerRouterProjectID(
	ctx context.Context,
	connectionID string,
	trimmedProjectID string,
	responseProjectID string,
	callID string,
	deps RouteDependencies,
) (string, error) {
	if !listenerUsesTemporaryIDs(deps, connectionID) {
		return trimmedProjectID, nil
	}
	resolvedProjectID, err := resolveListenerProjectIDFromTemporary(trimmedProjectID, deps.TemporaryIDs)
	if err != nil {
		if message, ok := listenerTemporaryIDMessage(err); ok {
			return "", sendListenerRouterError(ctx, connectionID, responseProjectID, callID, "listener_invalid_id", map[string]any{
				"message": message,
			}, deps)
		}
		return "", err
	}
	return resolvedProjectID, nil
}

func normalizeListenerRouterPayload(
	ctx context.Context,
	connectionID string,
	state listenerRouterCallState,
	content realtime.ListenerRouterEndpointCallContent,
	deps RouteDependencies,
) (map[string]any, bool, error) {
	payload := cloneListenerPayload(content.Payload)
	if payload == nil {
		payload = map[string]any{}
	}
	rawProjectID, ok := payload["projectConfigId"]
	if !ok {
		payload["projectConfigId"] = state.projectID
		return payload, true, nil
	}
	payloadProjectID, ok := rawProjectID.(string)
	if !ok {
		return payload, true, nil
	}
	receivedPayloadProjectID, err := resolveListenerRouterProjectID(
		ctx,
		connectionID,
		strings.TrimSpace(payloadProjectID),
		state.responseProjectID,
		state.callID,
		deps,
	)
	if err != nil {
		return nil, false, err
	}
	if receivedPayloadProjectID != state.projectID {
		err := sendListenerRouterError(ctx, connectionID, state.responseProjectID, state.callID, "project_config_mismatch", map[string]any{
			"expectedProjectConfigId": state.responseProjectID,
			"receivedProjectConfigId": strings.TrimSpace(payloadProjectID),
		}, deps)
		return nil, false, err
	}
	payload["projectConfigId"] = state.projectID
	return payload, true, nil
}

func sendListenerRouterError(
	ctx context.Context,
	connectionID string,
	projectID string,
	callID string,
	errorCode string,
	details map[string]any,
	deps RouteDependencies,
) error {
	return sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: projectID,
		CallID:          callID,
		OK:              false,
		Error:           errorCode,
		Details:         details,
	}, deps)
}

func sendListenerRouterSuccess(
	ctx context.Context,
	connectionID string,
	projectID string,
	callID string,
	result any,
	deps RouteDependencies,
) error {
	return sendListenerRouterEndpointResult(ctx, connectionID, realtime.ListenerRouterEndpointResultContent{
		ProjectConfigID: projectID,
		CallID:          callID,
		OK:              true,
		Result:          result,
	}, deps)
}

func maybeSendListenerEndpointForceRefresh(
	ctx context.Context,
	requestInfo modes.RequestInfo,
	connectionID string,
	state listenerRouterCallState,
	deps RouteDependencies,
) error {
	if !listenerEndpointRequiresForceRefresh(state.endpointName) {
		return nil
	}
	if err := sendListenerEndpointForceRefresh(
		ctx,
		requestInfo,
		state.projectID,
		state.callID,
		state.endpointName,
		deps,
	); err != nil {
		_ = sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "listener_refresh_failed",
			Details: map[string]any{
				"endpointName": state.endpointName,
				"callId":       state.callID,
				"message":      err.Error(),
			},
		}, deps)
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
	return nil, fmt.Errorf("unknown listener endpoint: %s", endpointName)
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
	case listenerendpoints.EndpointSetChatSectionState:
		return true
	default:
		return false
	}
}

func sendListenerEndpointForceRefresh(
	ctx context.Context,
	requestInfo modes.RequestInfo,
	projectID string,
	callID string,
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

	snapshotPayload, err := listenersnapshot.BuildListenerSnapshotPayload(snapshot.Document, projectID)
	if err != nil {
		return err
	}

	_, err = deps.ListenerBroadcaster.SendForceRefresh(ctx, realtime.ForceRefreshParams{
		ProjectID:      projectID,
		ShareSessionID: requestInfo.ShareSessionID,
		CallID:         strings.TrimSpace(callID),
		Snapshot:       snapshotPayload,
		RefreshKind:    "force_refresh",
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

func closeTerminalRouteConnection(conn *websocket.Conn, code websocket.StatusCode, reason string) error {
	if err := conn.Close(code, reason); err != nil {
		if websocket.CloseStatus(err) != -1 || errors.Is(err, context.Canceled) {
			return nil
		}
		return err
	}
	return nil
}

func generateFrontendConnectionID() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate frontend connection id: %w", err)
	}
	return "frontend-" + hex.EncodeToString(buf), nil
}
