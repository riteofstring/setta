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
	"setta/internal/modes"
	"setta/internal/realtime"
)

const (
	RouteFrontend          = "/ws/frontend"
	RouteListenerByID      = "/ws/listeners/{listenerID}"
	listenerProjectIDQuery = "projectId"
)

const (
	FrontendMessageTypeCurrentAddressUpdate = "CurrentAddressUpdate"
)

type RouteDependencies struct {
	Transport           Dependencies
	WebsocketHub        *realtime.WebsocketHub
	ListenerBroadcaster *realtime.ListenerBroadcaster
	FrontendIDSource    func() (string, error)
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
	if deps.FrontendIDSource == nil {
		deps.FrontendIDSource = generateFrontendConnectionID
	}

	router.Get(RouteFrontend, AuthenticatedRequestHandler(deps.Transport, func(ctx context.Context, r *http.Request, conn *websocket.Conn, info ConnectionInfo) error {
		return serveFrontendConnection(ctx, r, conn, info, deps)
	}))
	router.Get(RouteListenerByID, AuthenticatedRequestHandler(deps.Transport, func(ctx context.Context, r *http.Request, conn *websocket.Conn, info ConnectionInfo) error {
		return serveListenerConnection(ctx, r, conn, info, deps)
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

	if err := deps.WebsocketHub.SendFrontendIdentity(ctx, connection.ID); err != nil {
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

		envelope, err := decodeFrontendEnvelope(payload)
		if err != nil {
			return &CloseError{Code: CloseCodeBadRequest, Reason: "Invalid websocket message."}
		}
		switch envelope.MessageType {
		case FrontendMessageTypeCurrentAddressUpdate:
			if err := deps.WebsocketHub.UpdateCurrentAddress(ctx, connection.ID, envelope.Content, broadcastConnections); err != nil {
				return err
			}
		default:
			return &CloseError{Code: CloseCodeBadRequest, Reason: "Unsupported websocket message type."}
		}
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

func decodeFrontendEnvelope(payload []byte) (frontendCurrentAddressUpdate, error) {
	var envelope frontendEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return frontendCurrentAddressUpdate{}, err
	}
	switch envelope.MessageType {
	case FrontendMessageTypeCurrentAddressUpdate:
		var content string
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			return frontendCurrentAddressUpdate{}, err
		}
		return frontendCurrentAddressUpdate{
			MessageType: envelope.MessageType,
			Content:     content,
		}, nil
	default:
		return frontendCurrentAddressUpdate{
			MessageType: envelope.MessageType,
		}, nil
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

func generateFrontendConnectionID() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate frontend connection id: %w", err)
	}
	return "frontend-" + hex.EncodeToString(buf), nil
}
