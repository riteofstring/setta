package realtime

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
)

const FrontendAffinityAddressMarker = "#setta-ws-affinity="

type ConnectionType string

const (
	ConnectionTypeFrontend ConnectionType = "frontend"
	ConnectionTypeListener ConnectionType = "listener"
	ConnectionTypeServer   ConnectionType = "SERVER"
	ConnectionTypeTerminal ConnectionType = "terminal"
)

var (
	ErrEmptyConnectionID   = errors.New("realtime: connection id is required")
	ErrDuplicateConnection = errors.New("realtime: connection id already exists")
	ErrUnknownConnection   = errors.New("realtime: unknown connection")
	ErrEmptyConnectionType = errors.New("realtime: connection type is required")
)

type Connection struct {
	ID             string         `json:"id"`
	Type           ConnectionType `json:"connectionType"`
	ShareSessionID string         `json:"shareSessionId,omitempty"`
	CurrentAddress string         `json:"currentAddress,omitempty"`
}

type RegisterParams struct {
	ID             string
	Type           ConnectionType
	ShareSessionID string
}

type Selection struct {
	Type           ConnectionType
	ShareSessionID string
	CurrentAddress string
}

type TokenSource func() (string, error)

type RegistryOptions struct {
	FrontendAffinityTokenSource TokenSource
}

type Registry struct {
	mu sync.RWMutex

	connections                         map[string]Connection
	frontendAffinityTokenByConnectionID map[string]string
	frontendConnectionIDByAffinityToken map[string]string
	frontendAffinityTokenSource         TokenSource
}

func NewRegistry(options RegistryOptions) *Registry {
	tokenSource := options.FrontendAffinityTokenSource
	if tokenSource == nil {
		tokenSource = generateFrontendAffinityToken
	}

	return &Registry{
		connections:                         make(map[string]Connection),
		frontendAffinityTokenByConnectionID: make(map[string]string),
		frontendConnectionIDByAffinityToken: make(map[string]string),
		frontendAffinityTokenSource:         tokenSource,
	}
}

func (r *Registry) Register(params RegisterParams) (Connection, error) {
	connectionID := strings.TrimSpace(params.ID)
	if connectionID == "" {
		return Connection{}, ErrEmptyConnectionID
	}
	if params.Type == "" {
		return Connection{}, ErrEmptyConnectionType
	}

	connection := Connection{
		ID:             connectionID,
		Type:           params.Type,
		ShareSessionID: strings.TrimSpace(params.ShareSessionID),
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.connections[connectionID]; exists {
		return Connection{}, ErrDuplicateConnection
	}
	r.connections[connectionID] = connection

	if connection.Type == ConnectionTypeFrontend {
		token, err := r.nextFrontendAffinityTokenLocked()
		if err != nil {
			delete(r.connections, connectionID)
			return Connection{}, err
		}
		r.setFrontendAffinityTokenLocked(connectionID, token)
	}

	return connection, nil
}

func (r *Registry) Unregister(connectionID string) bool {
	connectionID = strings.TrimSpace(connectionID)
	if connectionID == "" {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.connections[connectionID]; !exists {
		return false
	}
	delete(r.connections, connectionID)
	r.removeFrontendAffinityTokenLocked(connectionID)
	return true
}

func (r *Registry) Connection(connectionID string) (Connection, bool) {
	connectionID = strings.TrimSpace(connectionID)
	if connectionID == "" {
		return Connection{}, false
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	connection, ok := r.connections[connectionID]
	return connection, ok
}

func (r *Registry) Connections(selection Selection) []Connection {
	r.mu.RLock()
	defer r.mu.RUnlock()

	connections := make([]Connection, 0, len(r.connections))
	for _, connection := range r.connections {
		if selection.Type != "" && connection.Type != selection.Type {
			continue
		}
		if selection.ShareSessionID != "" && connection.ShareSessionID != selection.ShareSessionID {
			continue
		}
		if selection.CurrentAddress != "" && connection.CurrentAddress != selection.CurrentAddress {
			continue
		}
		connections = append(connections, connection)
	}

	sort.Slice(connections, func(i, j int) bool {
		return connections[i].ID < connections[j].ID
	})
	return connections
}

func (r *Registry) UpdateCurrentAddress(connectionID string, currentAddress string) error {
	connectionID = strings.TrimSpace(connectionID)
	if connectionID == "" {
		return ErrUnknownConnection
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	connection, ok := r.connections[connectionID]
	if !ok {
		return ErrUnknownConnection
	}
	connection.CurrentAddress = SanitizeCurrentAddress(currentAddress)
	r.connections[connectionID] = connection
	return nil
}

func (r *Registry) FrontendAffinityToken(connectionID string) (string, bool) {
	connectionID = strings.TrimSpace(connectionID)
	if connectionID == "" {
		return "", false
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	token, ok := r.frontendAffinityTokenByConnectionID[connectionID]
	return token, ok
}

func (r *Registry) ResolveFrontendConnectionID(affinityToken string, shareSessionID string) (string, bool) {
	affinityToken = strings.TrimSpace(affinityToken)
	if affinityToken == "" {
		return "", false
	}
	shareSessionID = strings.TrimSpace(shareSessionID)

	r.mu.Lock()
	defer r.mu.Unlock()

	connectionID, ok := r.frontendConnectionIDByAffinityToken[affinityToken]
	if !ok {
		return "", false
	}
	connection, ok := r.connections[connectionID]
	if !ok {
		delete(r.frontendConnectionIDByAffinityToken, affinityToken)
		r.removeFrontendAffinityTokenLocked(connectionID)
		return "", false
	}
	if connection.Type != ConnectionTypeFrontend {
		delete(r.frontendConnectionIDByAffinityToken, affinityToken)
		r.removeFrontendAffinityTokenLocked(connectionID)
		return "", false
	}
	if shareSessionID != "" && connection.ShareSessionID != shareSessionID {
		return "", false
	}
	return connectionID, true
}

func SanitizeCurrentAddress(currentAddress string) string {
	markerIndex := strings.Index(currentAddress, FrontendAffinityAddressMarker)
	if markerIndex == -1 {
		return currentAddress
	}

	strippedAddress := strings.TrimSpace(currentAddress[:markerIndex])
	if strippedAddress == "" {
		return "/"
	}
	return strippedAddress
}

func (r *Registry) nextFrontendAffinityTokenLocked() (string, error) {
	for range 8 {
		token, err := r.frontendAffinityTokenSource()
		if err != nil {
			return "", err
		}
		token = strings.TrimSpace(token)
		if token == "" {
			return "", fmt.Errorf("realtime: frontend affinity token source returned an empty token")
		}
		if _, exists := r.frontendConnectionIDByAffinityToken[token]; exists {
			continue
		}
		return token, nil
	}

	return "", fmt.Errorf("realtime: unable to mint a unique frontend affinity token")
}

func (r *Registry) setFrontendAffinityTokenLocked(connectionID string, token string) {
	previousToken := r.frontendAffinityTokenByConnectionID[connectionID]
	r.frontendAffinityTokenByConnectionID[connectionID] = token
	if previousToken != "" && previousToken != token {
		if mappedConnectionID := r.frontendConnectionIDByAffinityToken[previousToken]; mappedConnectionID == connectionID {
			delete(r.frontendConnectionIDByAffinityToken, previousToken)
		}
	}
	r.frontendConnectionIDByAffinityToken[token] = connectionID
}

func (r *Registry) removeFrontendAffinityTokenLocked(connectionID string) {
	token := r.frontendAffinityTokenByConnectionID[connectionID]
	if token == "" {
		delete(r.frontendAffinityTokenByConnectionID, connectionID)
		return
	}
	delete(r.frontendAffinityTokenByConnectionID, connectionID)
	if mappedConnectionID := r.frontendConnectionIDByAffinityToken[token]; mappedConnectionID == connectionID {
		delete(r.frontendConnectionIDByAffinityToken, token)
	}
}

func generateFrontendAffinityToken() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate frontend affinity token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
