package wsapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/realtime"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
)

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
