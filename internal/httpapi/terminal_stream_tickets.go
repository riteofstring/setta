package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"sync"
	"time"

	"setta/internal/terminal"
)

type terminalStreamTicketStore struct {
	clock   func() time.Time
	mu      sync.Mutex
	tickets map[[sha256.Size]byte]terminalStreamTicket
}

type terminalStreamTicket struct {
	clientStreamID string
	deviceID       string
	expiresAt      time.Time
	runtimeID      string
}

func newTerminalStreamTicketStore(clock func() time.Time) *terminalStreamTicketStore {
	return &terminalStreamTicketStore{clock: clock, tickets: map[[sha256.Size]byte]terminalStreamTicket{}}
}

func (store *terminalStreamTicketStore) issue(deviceID string, runtimeID string, clientStreamID string) (string, terminalStreamTicket, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", terminalStreamTicket{}, err
	}
	value := base64.RawURLEncoding.EncodeToString(bytes)
	ticket := terminalStreamTicket{
		clientStreamID: clientStreamID,
		deviceID:       deviceID,
		expiresAt:      store.clock().UTC().Add(time.Duration(terminal.TerminalStreamTicketTTLSeconds) * time.Second),
		runtimeID:      runtimeID,
	}
	store.mu.Lock()
	store.removeExpiredLocked(store.clock().UTC())
	store.tickets[sha256.Sum256([]byte(value))] = ticket
	store.mu.Unlock()
	return value, ticket, nil
}

func (store *terminalStreamTicketStore) consume(value string, runtimeID string) (terminalStreamTicket, error) {
	if value == "" {
		return terminalStreamTicket{}, errors.New("terminal stream ticket is required")
	}
	now := store.clock().UTC()
	hash := sha256.Sum256([]byte(value))
	store.mu.Lock()
	ticket, ok := store.tickets[hash]
	delete(store.tickets, hash)
	store.removeExpiredLocked(now)
	store.mu.Unlock()
	if !ok || !ticket.expiresAt.After(now) {
		return terminalStreamTicket{}, errors.New("terminal stream ticket is invalid or expired")
	}
	if ticket.runtimeID != runtimeID {
		return terminalStreamTicket{}, errors.New("terminal stream ticket belongs to another runtime")
	}
	return ticket, nil
}

func (store *terminalStreamTicketStore) removeExpiredLocked(now time.Time) {
	for hash, ticket := range store.tickets {
		if !ticket.expiresAt.After(now) {
			delete(store.tickets, hash)
		}
	}
}
