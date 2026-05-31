package settacli

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"setta/internal/chat"
)

func watchRun(context *Context, workspaceID string, conversationID string, runID string) error {
	return watchRunFromCursor(context, workspaceID, conversationID, runID, "")
}

func watchRunFromCursor(cliContext *Context, workspaceID string, conversationID string, runID string, cursor string) error {
	client, err := cliContext.client()
	if err != nil {
		return err
	}
	ctx, cancel := cliContext.commandContext()
	defer cancel()
	response, err := client.Stream(ctx, "EventStream", cursor)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	reader := bufio.NewReader(response.Body)
	for {
		event, err := readMatchingRunEvent(ctx, reader, workspaceID, conversationID, runID)
		if err != nil {
			return streamReadError(err)
		}
		if err := writeNDJSONEvent(cliContext, event); err != nil {
			return err
		}
		if completes, err := eventCompletesRun(event, runID); err != nil || completes {
			return err
		}
	}
}

func streamEvents(cliContext *Context, cursor string, limit int) error {
	client, err := cliContext.client()
	if err != nil {
		return err
	}
	ctx, cancel := cliContext.commandContext()
	defer cancel()
	response, err := client.Stream(ctx, "EventStream", cursor)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	reader := bufio.NewReader(response.Body)
	count := 0
	for {
		event, err := readServerSentEvent(ctx, reader)
		if err != nil {
			return streamReadError(err)
		}
		if err := writeNDJSONEvent(cliContext, event); err != nil {
			return err
		}
		count++
		if limit > 0 && count >= limit {
			return nil
		}
	}
}

func readMatchingRunEvent(ctx context.Context, reader *bufio.Reader, workspaceID string, conversationID string, runID string) (chat.Event, error) {
	for {
		event, err := readServerSentEvent(ctx, reader)
		if err != nil {
			return chat.Event{}, err
		}
		if eventMatchesRun(event, workspaceID, conversationID, runID) {
			return event, nil
		}
	}
}

func streamReadError(err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return cliError{ExitCode: exitCancelled, Code: "stream_cancelled", Message: err.Error()}
	}
	return err
}

func eventCompletesRun(event chat.Event, runID string) (bool, error) {
	if event.Type != chat.EventTypeRunUpdated || event.RunID != runID {
		return false, nil
	}
	status, err := runStatusFromEvent(event)
	if err != nil {
		return false, err
	}
	return terminalRunStatus(status), nil
}

func readServerSentEvent(ctx context.Context, reader *bufio.Reader) (chat.Event, error) {
	var data strings.Builder
	for {
		select {
		case <-ctx.Done():
			return chat.Event{}, ctx.Err()
		default:
		}
		line, err := reader.ReadString('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				return chat.Event{}, io.ErrUnexpectedEOF
			}
			return chat.Event{}, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if data.Len() == 0 {
				continue
			}
			var event chat.Event
			if err := json.Unmarshal([]byte(data.String()), &event); err != nil {
				return chat.Event{}, fmt.Errorf("decode event stream data: %w", err)
			}
			return event, nil
		}
		if strings.HasPrefix(line, "data: ") {
			if data.Len() > 0 {
				data.WriteByte('\n')
			}
			data.WriteString(strings.TrimPrefix(line, "data: "))
		}
	}
}

func eventMatchesRun(event chat.Event, workspaceID string, conversationID string, runID string) bool {
	if event.Type == chat.EventTypeResyncRequired {
		return true
	}
	if event.WorkspaceID != workspaceID || event.ConversationID != conversationID {
		return false
	}
	return event.RunID == runID || event.RunID == ""
}

func runStatusFromEvent(event chat.Event) (chat.RunStatus, error) {
	var payload chat.RunUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return "", fmt.Errorf("decode run update payload: %w", err)
	}
	return payload.Run.Status, nil
}

func terminalRunStatus(status chat.RunStatus) bool {
	switch status {
	case chat.RunStatusCompleted, chat.RunStatusCancelled, chat.RunStatusFailed:
		return true
	default:
		return false
	}
}
