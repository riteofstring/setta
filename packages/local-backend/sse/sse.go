package sse

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

var ErrUnsupported = errors.New("sse: response streaming is unsupported")

func Supported(response http.ResponseWriter) bool {
	_, supported := response.(http.Flusher)
	return supported
}

func Serve[T any](response http.ResponseWriter, request *http.Request, stream <-chan T, event string) error {
	controller, err := start(response, request, stream, event)
	if err != nil {
		return err
	}
	for {
		select {
		case <-request.Context().Done():
			return nil
		case value, open := <-stream:
			if !open {
				return nil
			}
			if err := writeEvent(response, controller, value, event); err != nil {
				return err
			}
		}
	}
}

func start[T any](response http.ResponseWriter, request *http.Request, stream <-chan T, event string) (*http.ResponseController, error) {
	if !Supported(response) {
		return nil, ErrUnsupported
	}
	if request == nil || stream == nil || strings.ContainsAny(event, "\r\n") {
		return nil, errors.New("sse: request, stream, or event is invalid")
	}
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Cache-Control", "no-cache, no-transform")
	response.Header().Set("Connection", "keep-alive")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	controller := http.NewResponseController(response)
	if err := controller.Flush(); err != nil {
		return nil, fmt.Errorf("sse: flush headers: %w", err)
	}
	return controller, nil
}

func writeEvent(response http.ResponseWriter, controller *http.ResponseController, value any, event string) error {
	encoded, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("sse: encode event: %w", err)
	}
	frame := make([]byte, 0, len(encoded)+len(event)+16)
	if event != "" {
		frame = append(frame, "event: "...)
		frame = append(frame, event...)
		frame = append(frame, '\n')
	}
	frame = append(frame, "data: "...)
	frame = append(frame, encoded...)
	frame = append(frame, '\n', '\n')
	if _, err := response.Write(frame); err != nil {
		return fmt.Errorf("sse: write event: %w", err)
	}
	if err := controller.Flush(); err != nil {
		return fmt.Errorf("sse: flush event: %w", err)
	}
	return nil
}
