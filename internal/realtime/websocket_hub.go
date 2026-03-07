package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"sync"

	"github.com/coder/websocket"
)

var (
	ErrMissingFrontendAffinityToken = errors.New("realtime: missing frontend affinity token")
	ErrNonFrontendConnection        = errors.New("realtime: connection is not a frontend connection")
)

type ConnectParams struct {
	ID                   string
	Type                 ConnectionType
	ShareSessionID       string
	BroadcastConnections bool
}

type WebsocketHubOptions struct {
	Registry *Registry
}

type WebsocketHub struct {
	registry *Registry

	mu          sync.RWMutex
	connections map[string]*liveWebsocketConnection
}

type liveWebsocketConnection struct {
	conn   *websocket.Conn
	sendMu sync.Mutex
}

func NewWebsocketHub(options WebsocketHubOptions) *WebsocketHub {
	registry := options.Registry
	if registry == nil {
		registry = NewRegistry(RegistryOptions{})
	}

	return &WebsocketHub{
		registry:    registry,
		connections: make(map[string]*liveWebsocketConnection),
	}
}

func (h *WebsocketHub) Registry() *Registry {
	return h.registry
}

func (h *WebsocketHub) Connect(ctx context.Context, conn *websocket.Conn, params ConnectParams) (Connection, error) {
	connection, err := h.registry.Register(RegisterParams{
		ID:             params.ID,
		Type:           params.Type,
		ShareSessionID: params.ShareSessionID,
	})
	if err != nil {
		return Connection{}, err
	}

	h.mu.Lock()
	if _, exists := h.connections[connection.ID]; exists {
		h.mu.Unlock()
		h.registry.Unregister(connection.ID)
		return Connection{}, ErrDuplicateConnection
	}
	h.connections[connection.ID] = &liveWebsocketConnection{
		conn: conn,
	}
	h.mu.Unlock()

	if params.BroadcastConnections {
		if _, err := h.BroadcastConnections(ctx); err != nil {
			h.removeConnection(connection.ID)
			return Connection{}, err
		}
	}

	return connection, nil
}

func (h *WebsocketHub) Disconnect(ctx context.Context, connectionID string, broadcastConnections bool) bool {
	removed := h.removeConnection(connectionID)
	if !removed {
		return false
	}
	if broadcastConnections {
		_, _ = h.BroadcastConnections(ctx)
	}
	return true
}

func (h *WebsocketHub) Connection(connectionID string) (Connection, bool) {
	return h.registry.Connection(connectionID)
}

func (h *WebsocketHub) Connections(selection Selection) []Connection {
	return h.registry.Connections(selection)
}

func (h *WebsocketHub) UpdateCurrentAddress(
	ctx context.Context,
	connectionID string,
	currentAddress string,
	broadcastConnections bool,
) error {
	if err := h.registry.UpdateCurrentAddress(connectionID, currentAddress); err != nil {
		return err
	}
	if broadcastConnections {
		_, err := h.BroadcastConnections(ctx)
		return err
	}
	return nil
}

func (h *WebsocketHub) SendJSON(ctx context.Context, message any, connectionID string) (bool, error) {
	payload, err := json.Marshal(message)
	if err != nil {
		return false, err
	}
	return h.sendPayload(ctx, payload, connectionID), nil
}

func (h *WebsocketHub) BroadcastJSON(ctx context.Context, message any, selection Selection) (int, error) {
	payload, err := json.Marshal(message)
	if err != nil {
		return 0, err
	}

	targets := h.registry.Connections(selection)
	if len(targets) == 0 {
		return 0, nil
	}

	deliveredCounts := make(chan bool, len(targets))
	var wg sync.WaitGroup
	for _, target := range targets {
		wg.Add(1)
		go func(connectionID string) {
			defer wg.Done()
			deliveredCounts <- h.sendPayload(ctx, payload, connectionID)
		}(target.ID)
	}
	wg.Wait()
	close(deliveredCounts)

	delivered := 0
	for wasDelivered := range deliveredCounts {
		if wasDelivered {
			delivered++
		}
	}
	return delivered, nil
}

func (h *WebsocketHub) BroadcastConnections(ctx context.Context) (int, error) {
	return h.BroadcastJSON(
		ctx,
		NewAllConnectionsMessage(h.registry.Connections(Selection{})),
		Selection{Type: ConnectionTypeFrontend},
	)
}

func (h *WebsocketHub) SendFrontendIdentity(ctx context.Context, connectionID string) error {
	connection, ok := h.registry.Connection(connectionID)
	if !ok {
		return ErrUnknownConnection
	}
	if connection.Type != ConnectionTypeFrontend {
		return ErrNonFrontendConnection
	}

	frontendAffinityToken, ok := h.registry.FrontendAffinityToken(connectionID)
	if !ok {
		return ErrMissingFrontendAffinityToken
	}

	_, err := h.SendJSON(ctx, NewFrontendIdentityMessage(frontendAffinityToken), connectionID)
	return err
}

func (h *WebsocketHub) sendPayload(ctx context.Context, payload []byte, connectionID string) bool {
	liveConnection, ok := h.liveConnection(connectionID)
	if !ok {
		return false
	}

	liveConnection.sendMu.Lock()
	defer liveConnection.sendMu.Unlock()

	if err := liveConnection.conn.Write(ctx, websocket.MessageText, payload); err != nil {
		if shouldDropConnection(err) {
			h.removeConnection(connectionID)
		}
		return false
	}
	return true
}

func (h *WebsocketHub) liveConnection(connectionID string) (*liveWebsocketConnection, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	liveConnection, ok := h.connections[connectionID]
	return liveConnection, ok
}

func (h *WebsocketHub) removeConnection(connectionID string) bool {
	h.mu.Lock()
	delete(h.connections, connectionID)
	h.mu.Unlock()

	return h.registry.Unregister(connectionID)
}

func shouldDropConnection(err error) bool {
	if err == nil {
		return false
	}
	return !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded)
}
