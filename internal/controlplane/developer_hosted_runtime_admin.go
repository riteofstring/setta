package controlplane

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

type confirmDeveloperHostedRuntimeConnectedRequest struct {
	RuntimeRegistryID string `json:"runtimeRegistryId"`
}

type rotateDeveloperHostedRuntimeCredentialRequest struct {
	DeviceID          string `json:"deviceId"`
	DeviceSecret      string `json:"deviceSecret"`
	RuntimeRegistryID string `json:"runtimeId"`
}

func handleDeveloperHostedRuntimeAdminRoute(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) bool {
	const prefix = "/v1/developer-hosted-runtime/"
	if len(request.URL.Path) < len(prefix) || request.URL.Path[:len(prefix)] != prefix {
		return false
	}
	if coordinator == nil {
		response.Header().Set("Content-Type", "application/json")
		writeDeveloperHostedRuntimeDisabled(response)
		return true
	}
	handler := developerHostedRuntimeAdminHandler(request.URL.Path[len(prefix):])
	if handler == nil {
		response.WriteHeader(http.StatusNotFound)
		return true
	}
	handler(coordinator, response, request)
	return true
}

type developerHostedRuntimeRouteHandler func(
	*DeveloperHostedRuntimeCoordinator,
	http.ResponseWriter,
	*http.Request,
)

func developerHostedRuntimeAdminHandler(
	path string,
) developerHostedRuntimeRouteHandler {
	routes := map[string]developerHostedRuntimeRouteHandler{
		"ensure":           handleDeveloperHostedRuntimeEnsure,
		"destroy":          handleDeveloperHostedRuntimeDestroy,
		"status":           handleDeveloperHostedRuntimeStatus,
		"events":           handleDeveloperHostedRuntimeEventsRoute,
		"bootstrap":        handleDeveloperHostedRuntimeBootstrap,
		"connected":        handleDeveloperHostedRuntimeConnected,
		"credential":       handleDeveloperHostedRuntimeCredential,
		"finalize-removal": handleDeveloperHostedRuntimeFinalizeRemoval,
	}
	return routes[path]
}

func handleDeveloperHostedRuntimeEnsure(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireDeveloperHostedMethod(response, request, http.MethodPost) {
		return
	}
	var payload EnsureDeveloperHostedRuntimeRequest
	if decodeAdminRequest(response, request, &payload) {
		status, err := coordinator.Ensure(request.Context(), payload)
		writeDeveloperHostedRuntimeResult(response, status, err)
	}
}

func handleDeveloperHostedRuntimeDestroy(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireDeveloperHostedMethod(response, request, http.MethodPost) {
		return
	}
	var payload DestroyDeveloperHostedRuntimeRequest
	if decodeAdminRequest(response, request, &payload) {
		status, err := coordinator.Destroy(request.Context(), payload)
		writeDeveloperHostedRuntimeResult(response, status, err)
	}
}

func handleDeveloperHostedRuntimeStatus(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireDeveloperHostedMethod(response, request, http.MethodGet) {
		return
	}
	status, err := coordinator.Status(request.Context())
	if errors.Is(err, ErrNotFound) {
		response.WriteHeader(http.StatusNoContent)
		return
	}
	writeDeveloperHostedRuntimeResult(response, status, err)
}

func handleDeveloperHostedRuntimeEventsRoute(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) {
	if requireAdminMethod(response, request, http.MethodGet) {
		handleDeveloperHostedRuntimeEvents(coordinator, response, request)
	}
}

func handleDeveloperHostedRuntimeBootstrap(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireDeveloperHostedMethod(response, request, http.MethodGet) {
		return
	}
	bootstrap, err := coordinator.Bootstrap(request.Context())
	if err != nil {
		writeAdminError(response)
		return
	}
	writeAdminJSON(response, bootstrap)
}

func handleDeveloperHostedRuntimeConnected(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireDeveloperHostedMethod(response, request, http.MethodPost) {
		return
	}
	var payload confirmDeveloperHostedRuntimeConnectedRequest
	if decodeAdminRequest(response, request, &payload) {
		status, err := coordinator.ConfirmConnected(
			request.Context(),
			payload.RuntimeRegistryID,
		)
		writeDeveloperHostedRuntimeResult(response, status, err)
	}
}

func handleDeveloperHostedRuntimeCredential(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireDeveloperHostedMethod(response, request, http.MethodPost) {
		return
	}
	var payload rotateDeveloperHostedRuntimeCredentialRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	credential, err := coordinator.RotateCredential(
		request.Context(),
		payload.DeviceID,
		payload.DeviceSecret,
		payload.RuntimeRegistryID,
	)
	if err != nil {
		writeAdminError(response)
		return
	}
	writeAdminJSON(response, credential)
}

func handleDeveloperHostedRuntimeFinalizeRemoval(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireDeveloperHostedMethod(response, request, http.MethodPost) {
		return
	}
	if err := coordinator.FinalizeRemoval(request.Context()); err != nil {
		writeAdminError(response)
		return
	}
	writeAdminJSON(response, AdminEvent{
		Event:  "developer_hosted_runtime_removal_finalized",
		Status: "removed",
	})
}

func requireDeveloperHostedMethod(
	response http.ResponseWriter,
	request *http.Request,
	method string,
) bool {
	response.Header().Set("Content-Type", "application/json")
	return requireAdminMethod(response, request, method)
}

func writeDeveloperHostedRuntimeDisabled(response http.ResponseWriter) {
	reason := DeveloperHostedRuntimeReasonDeveloperFeatureDisabled
	outcome := DeveloperHostedRuntimeTerminalFailed
	writeAdminJSON(response, DeveloperHostedRuntimeStatus{
		OperationID:     "developer-hosted-runtime-disabled",
		Cursor:          "1",
		OperationKind:   DeveloperHostedRuntimeEnsure,
		Phase:           DeveloperHostedRuntimeNeedsAttention,
		ReasonCode:      &reason,
		OccurredAt:      timestampNow(),
		TerminalOutcome: &outcome,
	})
}

func timestampNow() string {
	return timestamp(timeNow().UTC())
}

var timeNow = func() time.Time {
	return time.Now()
}

func writeDeveloperHostedRuntimeResult(
	response http.ResponseWriter,
	status DeveloperHostedRuntimeStatus,
	err error,
) {
	if err != nil {
		writeAdminError(response)
		return
	}
	writeAdminJSON(response, status)
}

func handleDeveloperHostedRuntimeEvents(
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	request *http.Request,
) {
	query := request.URL.Query()
	operationID := query.Get("operationId")
	if len(query) != 1 || operationID == "" {
		writeAdminError(response)
		return
	}
	cursor := request.Header.Get("Last-Event-ID")
	events, update, err := coordinator.StatusAfter(
		request.Context(),
		operationID,
		cursor,
	)
	if err != nil {
		writeAdminError(response)
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeAdminError(response)
		return
	}
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Cache-Control", "no-store")
	response.WriteHeader(http.StatusOK)
	streamDeveloperHostedRuntimeEvents(
		request.Context(),
		coordinator,
		response,
		flusher,
		operationID,
		cursor,
		events,
		update,
	)
}

func streamDeveloperHostedRuntimeEvents(
	ctx context.Context,
	coordinator *DeveloperHostedRuntimeCoordinator,
	response http.ResponseWriter,
	flusher http.Flusher,
	operationID string,
	cursor string,
	events []DeveloperHostedRuntimeStatus,
	update <-chan struct{},
) {
	for {
		terminal, writeErr := writeDeveloperHostedRuntimeEvents(response, flusher, events)
		if len(events) != 0 {
			cursor = events[len(events)-1].Cursor
		}
		if writeErr != nil || terminal {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-update:
		}
		var err error
		events, update, err = coordinator.StatusAfter(ctx, operationID, cursor)
		if err != nil {
			return
		}
	}
}

func writeDeveloperHostedRuntimeEvents(
	response http.ResponseWriter,
	flusher http.Flusher,
	events []DeveloperHostedRuntimeStatus,
) (bool, error) {
	for _, event := range events {
		data, err := json.Marshal(event)
		if err != nil {
			return false, err
		}
		cursor := event.Cursor
		if _, err := fmt.Fprintf(
			response,
			"id: %s\nevent: developer_hosted_runtime_status\ndata: %s\n\n",
			cursor,
			data,
		); err != nil {
			return false, err
		}
		flusher.Flush()
		if developerHostedRuntimeStatusTerminal(event) {
			return true, nil
		}
	}
	return false, nil
}

func developerHostedRuntimeStatusTerminal(status DeveloperHostedRuntimeStatus) bool {
	return status.TerminalOutcome != nil
}
