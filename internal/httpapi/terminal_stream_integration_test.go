package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/terminal"
)

func TestTerminalStreamWritesAcknowledgesDeduplicatesAndResumes(t *testing.T) {
	handler, starter := newTerminalHandler(t, nil)
	created := postJSON[TerminalSessionResponse](t, handler, "/terminals/create", CreateTerminalRequest{
		WorkspaceID: "workspace_terminal",
		PaneID:      "pane_stream",
		Cols:        80,
		Rows:        24,
	}, http.StatusOK)
	server := httptest.NewServer(handler)
	defer server.Close()

	clientID := "terminal_stream_integration"
	connection := dialTerminalStream(t, server, issueTerminalStreamTicket(t, server, clientID))
	writeTerminalStreamFrame(t, connection, terminal.TerminalStreamStartMessage{
		Kind:           terminal.TerminalStreamClientStart,
		ClientStreamID: clientID,
	})
	ready := readTerminalStreamMessage[terminal.TerminalStreamReadyMessage](t, connection, terminal.TerminalStreamServerReady)
	if ready.ClientStreamID != clientID || ready.ProtocolVersion != terminal.TerminalStreamProtocolVersion {
		t.Fatalf("ready frame = %+v", ready)
	}
	readTerminalStreamUntilEvent(t, connection, terminal.TerminalEventStarted)

	input := terminal.TerminalStreamInputMessage{
		Kind:          terminal.TerminalStreamClientInput,
		SessionID:     created.Session.ID,
		InputSequence: 1,
		DataBase64:    base64.StdEncoding.EncodeToString([]byte("echo duplex\n")),
	}
	gapInput := input
	gapInput.InputSequence = 3
	writeTerminalStreamFrame(t, connection, gapInput)
	gap := readTerminalStreamMessage[terminal.TerminalStreamErrorMessage](t, connection, terminal.TerminalStreamServerError)
	if gap.Code != terminal.TerminalStreamErrorInputSequenceGap || !gap.Retryable {
		t.Fatalf("input sequence gap = %+v", gap)
	}
	writeTerminalStreamFrame(t, connection, input)
	ack := readTerminalStreamMessage[terminal.TerminalStreamInputAckMessage](t, connection, terminal.TerminalStreamServerInputAck)
	if ack.AcknowledgedInputSequence != 1 || ack.AcceptedBytes != len("echo duplex\n") {
		t.Fatalf("input ack = %+v", ack)
	}
	if _, err := time.Parse(time.RFC3339Nano, ack.HandlerReceivedAt); err != nil {
		t.Fatalf("input ack handlerReceivedAt = %q: %v", ack.HandlerReceivedAt, err)
	}
	if _, err := time.Parse(time.RFC3339Nano, ack.PTYWriteCompletedAt); err != nil {
		t.Fatalf("input ack ptyWriteCompletedAt = %q: %v", ack.PTYWriteCompletedAt, err)
	}
	secondInput := input
	secondInput.InputSequence = 2
	secondInput.DataBase64 = base64.StdEncoding.EncodeToString([]byte("printf ordered\n"))
	writeTerminalStreamFrame(t, connection, secondInput)
	secondAck := readTerminalStreamMessage[terminal.TerminalStreamInputAckMessage](t, connection, terminal.TerminalStreamServerInputAck)
	if secondAck.AcknowledgedInputSequence != 2 || secondAck.AcceptedBytes != len("printf ordered\n") {
		t.Fatalf("second input ack = %+v", secondAck)
	}
	_ = connection.Close(websocket.StatusNormalClosure, "test reconnect")

	resumed := dialTerminalStream(t, server, issueTerminalStreamTicket(t, server, clientID))
	defer resumed.CloseNow()
	writeTerminalStreamFrame(t, resumed, terminal.TerminalStreamResumeMessage{
		Kind:           terminal.TerminalStreamClientResume,
		ClientStreamID: clientID,
		Sessions: []terminal.TerminalStreamResumeSession{{
			SessionID:                     created.Session.ID,
			LastAcknowledgedInputSequence: 2,
		}},
	})
	resumeReady := readTerminalStreamMessage[terminal.TerminalStreamReadyMessage](t, resumed, terminal.TerminalStreamServerReady)
	if len(resumeReady.Sessions) != 1 || resumeReady.Sessions[0].AcknowledgedInputSequence != 2 {
		t.Fatalf("resume ready sessions = %+v", resumeReady.Sessions)
	}
	writeTerminalStreamFrame(t, resumed, secondInput)
	duplicateAck := readTerminalStreamMessage[terminal.TerminalStreamInputAckMessage](t, resumed, terminal.TerminalStreamServerInputAck)
	if duplicateAck.AcknowledgedInputSequence != 2 {
		t.Fatalf("duplicate input ack = %+v", duplicateAck)
	}
	if duplicateAck.HandlerReceivedAt != "" || duplicateAck.PTYWriteCompletedAt != "" {
		t.Fatalf("duplicate input ack fabricated timing = %+v", duplicateAck)
	}
	conflictInput := secondInput
	conflictInput.DataBase64 = base64.StdEncoding.EncodeToString([]byte("different\n"))
	writeTerminalStreamFrame(t, resumed, conflictInput)
	conflict := readTerminalStreamMessage[terminal.TerminalStreamErrorMessage](t, resumed, terminal.TerminalStreamServerError)
	if conflict.Code != terminal.TerminalStreamErrorInputSequenceConflict || conflict.Retryable {
		t.Fatalf("input sequence conflict = %+v", conflict)
	}
	if written := starter.handleAt(t, 0).writtenString(); written != "echo duplex\nprintf ordered\n" {
		t.Fatalf("PTY input = %q, want ordered deduplicated writes", written)
	}
}

func TestTerminalStreamRejectsMalformedInputFrame(t *testing.T) {
	handler, _ := newTerminalHandler(t, nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	clientID := "terminal_stream_malformed"
	connection := dialTerminalStream(t, server, issueTerminalStreamTicket(t, server, clientID))
	defer connection.CloseNow()
	writeTerminalStreamFrame(t, connection, terminal.TerminalStreamStartMessage{
		Kind:           terminal.TerminalStreamClientStart,
		ClientStreamID: clientID,
	})
	readTerminalStreamMessage[terminal.TerminalStreamReadyMessage](t, connection, terminal.TerminalStreamServerReady)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := connection.Write(ctx, websocket.MessageText, []byte(`{"kind":"terminal.stream.input","sessionId":7}`)); err != nil {
		t.Fatalf("write malformed terminal stream frame: %v", err)
	}
	message := readTerminalStreamMessage[terminal.TerminalStreamErrorMessage](t, connection, terminal.TerminalStreamServerError)
	if message.Code != terminal.TerminalStreamErrorMalformedFrame || message.Retryable {
		t.Fatalf("malformed frame error = %+v", message)
	}
}

func TestTerminalStreamOutputQueueFailsWithTypedBackpressure(t *testing.T) {
	connection := terminalStreamConnection{
		outputQueue: newTerminalStreamByteQueue[terminalStreamOutbound](1, 1),
	}
	err := connection.enqueueMessage(terminal.TerminalStreamReadyMessage{Kind: terminal.TerminalStreamServerReady})
	if terminalStreamErrorCode(err) != terminal.TerminalStreamErrorOutputBackpressure {
		t.Fatalf("output queue error = %v, want output_backpressure", err)
	}
}

func TestTerminalStreamTicketIsSingleUse(t *testing.T) {
	handler, _ := newTerminalHandler(t, nil)
	server := httptest.NewServer(handler)
	defer server.Close()
	ticket := issueTerminalStreamTicket(t, server, "terminal_stream_single_use")
	connection := dialTerminalStream(t, server, ticket)
	connection.CloseNow()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, response, err := websocket.Dial(ctx, terminalStreamURL(server, ticket), nil)
	if err == nil {
		t.Fatal("second terminal stream upgrade unexpectedly succeeded")
	}
	if response == nil || response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("second upgrade response = %+v, err = %v", response, err)
	}
}

func issueTerminalStreamTicket(t *testing.T, server *httptest.Server, clientID string) string {
	t.Helper()
	body, err := json.Marshal(CreateTerminalStreamTicketRequest{ClientStreamID: clientID})
	if err != nil {
		t.Fatal(err)
	}
	response, err := server.Client().Post(server.URL+"/terminals/stream/ticket", "application/json", bytesReader(body))
	if err != nil {
		t.Fatalf("issue terminal stream ticket: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("ticket status = %d", response.StatusCode)
	}
	var ticket CreateTerminalStreamTicketResponse
	if err := json.NewDecoder(response.Body).Decode(&ticket); err != nil {
		t.Fatalf("decode ticket: %v", err)
	}
	return ticket.Ticket
}

func dialTerminalStream(t *testing.T, server *httptest.Server, ticket string) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	connection, response, err := websocket.Dial(ctx, terminalStreamURL(server, ticket), nil)
	if err != nil {
		t.Fatalf("dial terminal stream response=%+v: %v", response, err)
	}
	return connection
}

func terminalStreamURL(server *httptest.Server, ticket string) string {
	parsed, _ := url.Parse(server.URL)
	parsed.Scheme = "ws"
	parsed.Path = "/terminals/stream"
	parsed.RawQuery = url.Values{"ticket": {ticket}}.Encode()
	return parsed.String()
}

func writeTerminalStreamFrame(t *testing.T, connection *websocket.Conn, message any) {
	t.Helper()
	payload, err := json.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := connection.Write(ctx, websocket.MessageText, payload); err != nil {
		t.Fatalf("write terminal stream frame: %v", err)
	}
}

func readTerminalStreamMessage[T any](t *testing.T, connection *websocket.Conn, kind terminal.TerminalStreamServerMessageKind) T {
	t.Helper()
	for {
		payload := readTerminalStreamPayload(t, connection)
		var envelope struct {
			Kind terminal.TerminalStreamServerMessageKind `json:"kind"`
		}
		if err := json.Unmarshal(payload, &envelope); err != nil {
			t.Fatalf("decode terminal stream envelope: %v", err)
		}
		if envelope.Kind != kind {
			continue
		}
		var message T
		if err := json.Unmarshal(payload, &message); err != nil {
			t.Fatalf("decode terminal stream %s: %v", kind, err)
		}
		return message
	}
}

func readTerminalStreamUntilEvent(t *testing.T, connection *websocket.Conn, eventType terminal.TerminalEventType) terminal.TerminalEvent {
	t.Helper()
	for {
		message := readTerminalStreamMessage[terminal.TerminalStreamEventMessage](t, connection, terminal.TerminalStreamServerEvent)
		if message.Event.Type == eventType {
			return message.Event
		}
	}
}

func readTerminalStreamPayload(t *testing.T, connection *websocket.Conn) []byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	messageType, payload, err := connection.Read(ctx)
	if err != nil {
		t.Fatalf("read terminal stream frame: %v", err)
	}
	if messageType != websocket.MessageText {
		t.Fatalf("terminal stream message type = %d", messageType)
	}
	return payload
}

func bytesReader(data []byte) *bytes.Reader {
	return bytes.NewReader(data)
}
