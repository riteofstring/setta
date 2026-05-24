package wsapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"setta/internal/modes"
	"setta/internal/realtime"

	"github.com/coder/websocket"
)

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
