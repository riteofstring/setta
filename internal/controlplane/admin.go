package controlplane

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimecost"
	"setta/internal/runtimeprovider"
)

const maximumAdminRequestBytes = 16 * 1024

const adminSocketFileName = "admin.sock"

type AdminServerConfig struct {
	Observer      ControlPlaneObserver
	PriceSchedule runtimecost.PriceSchedule
	SocketPath    string
	Store         *Store
}

type AdminServer struct {
	httpServer  *http.Server
	listener    net.Listener
	done        chan error
	closeOnce   sync.Once
	shutdownErr error
}

type AdminEnsureDeviceRequest struct {
	Credential  DeviceCredential `json:"credential"`
	DisplayName string           `json:"display_name"`
	GrantTTL    time.Duration    `json:"grant_ttl"`
	RuntimeName string           `json:"runtime_name"`
	UserID      string           `json:"user_id"`
}

type AdminCompleteHostedAccessRequest struct {
	Credential           DeviceCredential                 `json:"credential"`
	CredentialEpoch      uint64                           `json:"credential_epoch"`
	DeviceDisplayName    string                           `json:"device_display_name"`
	GrantTTL             time.Duration                    `json:"grant_ttl"`
	HostedAccessIntentID string                           `json:"hosted_access_intent_id"`
	IdempotencyKey       string                           `json:"idempotency_key"`
	ProjectID            string                           `json:"project_id"`
	RuntimeName          string                           `json:"runtime_name"`
	RuntimeRelease       string                           `json:"runtime_release"`
	RuntimeSecretRef     string                           `json:"runtime_secret_ref"`
	RuntimeTarget        string                           `json:"runtime_target"`
	Resources            runtimeprovider.RuntimeResources `json:"resources"`
	UserID               string                           `json:"user_id"`
	WorkstreamID         string                           `json:"workstream_id"`
}

type AdminRevokeDeviceRequest struct {
	DeviceID string `json:"device_id"`
}

type AdminSetUserStatusRequest struct {
	Status UserStatus `json:"status"`
	UserID string     `json:"user_id"`
}

type AdminSetUserBudgetRequest struct {
	UserID                  string        `json:"user_id"`
	PeriodStart             time.Time     `json:"period_start"`
	PeriodEnd               time.Time     `json:"period_end"`
	CoveredLimitUSDMicros   int64         `json:"covered_limit_usd_micros"`
	SafetyReserveUSDMicros  int64         `json:"safety_reserve_usd_micros"`
	CutoffExposureUSDMicros int64         `json:"cutoff_exposure_usd_micros"`
	MaximumCutoffLag        time.Duration `json:"maximum_cutoff_lag"`
}

type AdminRecordUsageRequest struct {
	IdempotencyKey string                     `json:"idempotency_key"`
	UserID         string                     `json:"user_id"`
	Evidence       runtimeaccounting.Evidence `json:"evidence"`
}

type AdminRecordRuntimeAccountingEventRequest struct {
	RuntimeName string                               `json:"runtime_name"`
	Transition  runtimeaccounting.ActivityTransition `json:"transition"`
}

type AdminRequestRuntimeWakeRequest struct {
	IdempotencyKey string `json:"idempotency_key"`
	RuntimeName    string `json:"runtime_name"`
}

type AdminRecordRuntimeHealthRequest struct {
	HealthState     RuntimeHealthState `json:"health_state"`
	ObservedRelease string             `json:"observed_release"`
	RuntimeName     string             `json:"runtime_name"`
}

type AdminFinalizeRuntimeAccountingWindowRequest struct {
	IdempotencyKey string    `json:"idempotency_key"`
	RuntimeName    string    `json:"runtime_name"`
	UserID         string    `json:"user_id"`
	WindowEnd      time.Time `json:"window_end"`
}

type AdminEvent struct {
	DeviceID string `json:"device_id,omitempty"`
	Event    string `json:"event"`
	Status   string `json:"status,omitempty"`
	UserID   string `json:"user_id,omitempty"`
}

func AdminSocketPath(dataDirectory string) string {
	return filepath.Join(dataDirectory, adminSocketFileName)
}

func StartAdminServer(config AdminServerConfig) (*AdminServer, error) {
	if err := validateAdminServerConfig(config); err != nil {
		return nil, err
	}
	listener, err := net.Listen("unix", config.SocketPath)
	if err != nil {
		return nil, fmt.Errorf("listen for control-plane administration: %w", err)
	}
	if err := os.Chmod(config.SocketPath, 0o600); err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("protect control-plane administration socket: %w", err)
	}
	httpServer := &http.Server{
		Handler:           adminHandler(config.Store, config.Observer, config.PriceSchedule),
		ReadHeaderTimeout: 5 * time.Second,
	}
	server := &AdminServer{httpServer: httpServer, listener: listener, done: make(chan error, 1)}
	go func() {
		err := httpServer.Serve(listener)
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		server.done <- err
		close(server.done)
	}()
	return server, nil
}

func (server *AdminServer) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("control-plane administration shutdown context is required")
	}
	server.closeOnce.Do(func() {
		if err := server.httpServer.Shutdown(ctx); err != nil {
			server.shutdownErr = fmt.Errorf("shutdown control-plane administration: %w", err)
			_ = server.httpServer.Close()
		}
	})
	return server.shutdownErr
}

func (server *AdminServer) Wait() error {
	return <-server.done
}

func validateAdminServerConfig(config AdminServerConfig) error {
	if config.Store == nil || config.Observer == nil || config.SocketPath == "" || !filepath.IsAbs(config.SocketPath) {
		return errors.New("control-plane administration requires a store, observer, and absolute socket path")
	}
	if err := runtimecost.ValidatePriceSchedule(config.PriceSchedule); err != nil {
		return fmt.Errorf("control-plane administration price schedule: %w", err)
	}
	if filepath.Dir(config.SocketPath) != filepath.Dir(config.Store.Path()) {
		return errors.New("control-plane administration socket must share the private store directory")
	}
	if _, err := os.Lstat(config.SocketPath); err == nil {
		return errors.New("control-plane administration socket path already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect control-plane administration socket: %w", err)
	}
	return nil
}

func adminHandler(
	store *Store,
	observer ControlPlaneObserver,
	priceSchedule runtimecost.PriceSchedule,
) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if handleHostedAccessAdminRoute(store, observer, response, request) {
			return
		}
		if handleRuntimeAdminRoute(store, observer, response, request) {
			return
		}
		if handleRuntimeAccountingAdminRoute(store, observer, priceSchedule, response, request) {
			return
		}
		if handleBudgetAdminRoute(store, observer, priceSchedule, response, request) {
			return
		}
		switch request.URL.Path {
		case "/v1/devices/ensure":
			if !requireAdminMethod(response, request, http.MethodPost) {
				return
			}
			response.Header().Set("Content-Type", "application/json")
			handleAdminEnsureDevice(store, observer, response, request)
		case "/v1/devices/revoke":
			if !requireAdminMethod(response, request, http.MethodPost) {
				return
			}
			response.Header().Set("Content-Type", "application/json")
			handleAdminRevokeDevice(store, observer, response, request)
		case "/v1/users/status":
			if !requireAdminMethod(response, request, http.MethodPost) {
				return
			}
			response.Header().Set("Content-Type", "application/json")
			handleAdminSetUserStatus(store, observer, response, request)
		default:
			response.WriteHeader(http.StatusNotFound)
		}
	})
}

func handleRuntimeAdminRoute(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) bool {
	return handleRuntimeProgressAdminRoute(store, response, request) ||
		handleRuntimePolicyAdminRoute(store, observer, response, request)
}

func handleRuntimePolicyAdminRoute(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) bool {
	switch request.URL.Path {
	case "/v1/runtimes/wake":
		if !requireAdminMethod(response, request, http.MethodPost) {
			return true
		}
		response.Header().Set("Content-Type", "application/json")
		var payload AdminRequestRuntimeWakeRequest
		if !decodeAdminRequest(response, request, &payload) {
			return true
		}
		runtime, err := store.RequestRuntimeWake(
			request.Context(),
			payload.IdempotencyKey,
			payload.RuntimeName,
		)
		if err != nil {
			writeAdminError(response)
			return true
		}
		observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
			Action:     ControlPlaneAuditRuntimeWakeRequested,
			OccurredAt: runtime.UpdatedAt,
			State:      "requested",
		})
		writeAdminJSON(response, AdminEvent{Event: "runtime_wake_requested", Status: "requested"})
		return true
	case "/v1/runtimes/health":
		if !requireAdminMethod(response, request, http.MethodPost) {
			return true
		}
		response.Header().Set("Content-Type", "application/json")
		var payload AdminRecordRuntimeHealthRequest
		if !decodeAdminRequest(response, request, &payload) {
			return true
		}
		result, err := store.RecordRuntimeHealth(request.Context(), RecordRuntimeHealthRequest{
			RuntimeName:     payload.RuntimeName,
			HealthState:     payload.HealthState,
			ObservedRelease: payload.ObservedRelease,
		})
		if err != nil {
			writeAdminError(response)
			return true
		}
		observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
			Action:     ControlPlaneAuditRuntimeHealthRecorded,
			OccurredAt: result.Runtime.UpdatedAt,
			State:      string(result.Runtime.HealthState),
		})
		if result.WakePending {
			state := string(result.Runtime.HealthState)
			if result.WakeCompleted {
				state = "completed"
			}
			observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
				Action:     ControlPlaneAuditRuntimeWakeObserved,
				OccurredAt: result.Runtime.UpdatedAt,
				State:      state,
			})
		}
		writeAdminJSON(response, AdminEvent{
			Event:  "runtime_health_recorded",
			Status: string(result.Runtime.HealthState),
		})
		return true
	default:
		return false
	}
}

func handleRuntimeAccountingAdminRoute(
	store *Store,
	observer ControlPlaneAuditObserver,
	priceSchedule runtimecost.PriceSchedule,
	response http.ResponseWriter,
	request *http.Request,
) bool {
	switch request.URL.Path {
	case "/v1/runtime-accounting/events":
		if !requireAdminMethod(response, request, http.MethodPost) {
			return true
		}
		response.Header().Set("Content-Type", "application/json")
		var payload AdminRecordRuntimeAccountingEventRequest
		if !decodeAdminRequest(response, request, &payload) {
			return true
		}
		if _, err := store.RecordRuntimeAccountingEvent(request.Context(), RecordRuntimeAccountingEventRequest(payload)); err != nil {
			writeAdminError(response)
			return true
		}
		writeAdminJSON(response, AdminEvent{Event: "runtime_accounting_event_recorded", Status: "accepted"})
		return true
	case "/v1/runtime-accounting/windows/finalize":
		if !requireAdminMethod(response, request, http.MethodPost) {
			return true
		}
		response.Header().Set("Content-Type", "application/json")
		handleAdminFinalizeRuntimeAccountingWindow(store, observer, priceSchedule, response, request)
		return true
	default:
		return false
	}
}

func handleAdminFinalizeRuntimeAccountingWindow(
	store *Store,
	observer ControlPlaneAuditObserver,
	priceSchedule runtimecost.PriceSchedule,
	response http.ResponseWriter,
	request *http.Request,
) {
	var payload AdminFinalizeRuntimeAccountingWindowRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	finalized, err := store.FinalizeRuntimeAccountingWindow(
		request.Context(),
		FinalizeRuntimeAccountingWindowRequest{
			IdempotencyKey: payload.IdempotencyKey,
			UserID:         payload.UserID,
			RuntimeName:    payload.RuntimeName,
			WindowEnd:      payload.WindowEnd,
		},
		priceSchedule,
	)
	if err != nil {
		writeAdminError(response)
		return
	}
	state := "continue"
	if finalized.Interval.CutoffRequired {
		state = "cutoff"
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditUsageRecorded,
		OccurredAt: finalized.FinalizedAt,
		State:      state,
	})
	writeAdminJSON(response, AdminEvent{
		Event:  "runtime_accounting_window_finalized",
		Status: state,
		UserID: payload.UserID,
	})
}

func handleBudgetAdminRoute(
	store *Store,
	observer ControlPlaneObserver,
	priceSchedule runtimecost.PriceSchedule,
	response http.ResponseWriter,
	request *http.Request,
) bool {
	switch request.URL.Path {
	case "/v1/users/budget":
		if requireAdminMethod(response, request, http.MethodPost) {
			response.Header().Set("Content-Type", "application/json")
			handleAdminSetUserBudget(store, observer, response, request)
		}
		return true
	case "/v1/usage/record":
		if requireAdminMethod(response, request, http.MethodPost) {
			response.Header().Set("Content-Type", "application/json")
			handleAdminRecordUsage(store, observer, priceSchedule, response, request)
		}
		return true
	default:
		return false
	}
}

func handleAdminSetUserBudget(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	var payload AdminSetUserBudgetRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	policy, err := store.SetUserBudgetPolicy(request.Context(), SetUserBudgetPolicyRequest(payload))
	if err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditBudgetSet,
		OccurredAt: policy.UpdatedAt,
		State:      "enforced",
	})
	writeAdminJSON(response, AdminEvent{Event: "user_budget_set", Status: "enforced", UserID: payload.UserID})
}

func handleAdminRecordUsage(
	store *Store,
	observer ControlPlaneAuditObserver,
	priceSchedule runtimecost.PriceSchedule,
	response http.ResponseWriter,
	request *http.Request,
) {
	var payload AdminRecordUsageRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	interval, err := store.RecordUsageEvidence(request.Context(), RecordUsageEvidenceRequest{
		IdempotencyKey: payload.IdempotencyKey,
		UserID:         payload.UserID,
		Evidence:       payload.Evidence,
	}, priceSchedule)
	if err != nil {
		writeAdminError(response)
		return
	}
	state := "continue"
	if interval.CutoffRequired {
		state = "cutoff"
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditUsageRecorded,
		OccurredAt: interval.RecordedAt,
		State:      state,
	})
	writeAdminJSON(response, AdminEvent{Event: "usage_recorded", Status: state, UserID: payload.UserID})
}

func handleRuntimeProgressAdminRoute(
	store *Store,
	response http.ResponseWriter,
	request *http.Request,
) bool {
	if request.URL.Path != "/v1/runtime-progress/events" {
		return false
	}
	if requireAdminMethod(response, request, http.MethodGet) {
		handleAdminRuntimeProgressEvents(store, response, request)
	}
	return true
}

func handleHostedAccessAdminRoute(
	store *Store,
	observer ControlPlaneObserver,
	response http.ResponseWriter,
	request *http.Request,
) bool {
	switch request.URL.Path {
	case "/v1/hosted-access/ensure":
		if requireAdminMethod(response, request, http.MethodPost) {
			response.Header().Set("Content-Type", "application/json")
			handleAdminEnsureHostedAccess(store, response, request)
		}
		return true
	case "/v1/hosted-access/events":
		if requireAdminMethod(response, request, http.MethodGet) {
			handleAdminHostedAccessEvents(store, response, request)
		}
		return true
	case "/v1/hosted-access/complete":
		if requireAdminMethod(response, request, http.MethodPost) {
			response.Header().Set("Content-Type", "application/json")
			handleAdminCompleteHostedAccess(store, observer, response, request)
		}
		return true
	default:
		return false
	}
}

func requireAdminMethod(response http.ResponseWriter, request *http.Request, method string) bool {
	if request.Method == method {
		return true
	}
	response.WriteHeader(http.StatusMethodNotAllowed)
	return false
}

func handleAdminEnsureHostedAccess(store *Store, response http.ResponseWriter, request *http.Request) {
	var intent EnsureHostedAccessIntent
	if !decodeAdminRequest(response, request, &intent) {
		return
	}
	if _, err := store.UpsertUser(request.Context(), intent.UserID); err != nil {
		writeAdminError(response)
		return
	}
	progress, err := store.EnsureHostedAccessIntent(request.Context(), intent)
	if err != nil {
		writeAdminError(response)
		return
	}
	writeAdminJSON(response, progress)
}

func handleAdminCompleteHostedAccess(
	store *Store,
	observer ControlPlaneObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	var payload AdminCompleteHostedAccessRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	created, err := completeHostedAccess(request.Context(), store, observer, payload)
	if err != nil {
		writeAdminError(response)
		return
	}
	timing, err := store.HostedAccessTiming(request.Context(), payload.HostedAccessIntentID)
	if err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveHostedAccessTiming(timing)
	writeAdminJSON(response, BootstrapEvent{
		DeviceID:    created.Device.ID,
		Event:       BootstrapReadyEvent,
		RuntimeName: created.Grant.RuntimeName,
	})
}

func completeHostedAccess(
	ctx context.Context,
	store *Store,
	observer ControlPlaneObserver,
	payload AdminCompleteHostedAccessRequest,
) (CreatedDeviceGrant, error) {
	if _, err := store.UpsertUser(ctx, payload.UserID); err != nil {
		return CreatedDeviceGrant{}, err
	}
	if _, err := store.EnsureHostedAccessIntent(ctx, hostedAccessIntentFromAdmin(payload)); err != nil {
		return CreatedDeviceGrant{}, err
	}
	if _, err := store.BeginHostedAccessSync(ctx, payload.HostedAccessIntentID); err != nil {
		return CreatedDeviceGrant{}, err
	}
	if _, err := store.AssignRuntime(ctx, AssignRuntimeRequest{
		IdempotencyKey:      payload.IdempotencyKey,
		UserID:              payload.UserID,
		RuntimeName:         payload.RuntimeName,
		Lifecycle:           RuntimeLifecycleReady,
		AccessState:         RuntimeAccessEnabled,
		HealthState:         RuntimeHealthHealthy,
		CredentialEpoch:     payload.CredentialEpoch,
		UpstreamAuthority:   payload.RuntimeTarget,
		CredentialSecretRef: payload.RuntimeSecretRef,
		DesiredRelease:      payload.RuntimeRelease,
		ObservedRelease:     payload.RuntimeRelease,
		Resources:           payload.Resources,
	}); err != nil {
		return CreatedDeviceGrant{}, recordHostedAccessFailure(
			ctx,
			store,
			observer,
			payload.HostedAccessIntentID,
			HostedAccessReasonRuntimeAssignmentRejected,
			err,
		)
	}
	created, err := store.EnsureDeviceGrant(ctx, EnsureDeviceGrantRequest{
		Credential:  payload.Credential,
		UserID:      payload.UserID,
		RuntimeName: payload.RuntimeName,
		DisplayName: payload.DeviceDisplayName,
		GrantTTL:    payload.GrantTTL,
	})
	if err != nil {
		return CreatedDeviceGrant{}, recordHostedAccessFailure(
			ctx,
			store,
			observer,
			payload.HostedAccessIntentID,
			HostedAccessReasonDeviceGrantRejected,
			err,
		)
	}
	if _, err := store.CompleteHostedAccessIntent(ctx, payload.HostedAccessIntentID, created); err != nil {
		return CreatedDeviceGrant{}, err
	}
	return created, nil
}

func recordHostedAccessFailure(
	ctx context.Context,
	store *Store,
	observer HostedAccessObserver,
	intentID string,
	reason HostedAccessReasonCode,
	cause error,
) error {
	_, recordError := store.FailHostedAccessIntent(ctx, intentID, reason, false)
	if recordError == nil {
		observer.ObserveHostedAccessFailure(HostedAccessFailureObservation{
			CompletedAt: time.Now(),
			ReasonCode:  reason,
			Retryable:   false,
		})
	}
	return errors.Join(cause, recordError)
}

func hostedAccessIntentFromAdmin(payload AdminCompleteHostedAccessRequest) EnsureHostedAccessIntent {
	return EnsureHostedAccessIntent{
		IdempotencyKey: payload.HostedAccessIntentID,
		UserID:         payload.UserID,
		ProjectID:      payload.ProjectID,
		WorkstreamID:   payload.WorkstreamID,
		Client: HostedAccessClient{
			DeviceID: payload.Credential.DeviceID,
			Kind:     HostedAccessClientPhone,
		},
		RequestedCapabilities: []HostedAccessCapability{
			HostedAccessCapabilityObserve,
			HostedAccessCapabilitySteer,
			HostedAccessCapabilityApprove,
			HostedAccessCapabilityArtifacts,
		},
	}
}

func handleAdminHostedAccessEvents(store *Store, response http.ResponseWriter, request *http.Request) {
	query := request.URL.Query()
	intentID := query.Get("intentId")
	if len(query) != 1 || intentID == "" {
		writeAdminError(response)
		return
	}
	cursor := request.Header.Get("Last-Event-ID")
	events, update, err := store.HostedAccessProgressAfter(request.Context(), intentID, cursor)
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
	streamHostedAccessEvents(request.Context(), store, response, flusher, intentID, cursor, events, update)
}

func streamHostedAccessEvents(
	ctx context.Context,
	store *Store,
	response http.ResponseWriter,
	flusher http.Flusher,
	intentID string,
	cursor string,
	events []HostedAccessProgress,
	update <-chan struct{},
) {
	for {
		terminal, writeErr := writeHostedAccessEvents(response, flusher, events)
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
		events, update, err = store.HostedAccessProgressAfter(ctx, intentID, cursor)
		if err != nil {
			return
		}
	}
}

func writeHostedAccessEvents(
	response http.ResponseWriter,
	flusher http.Flusher,
	events []HostedAccessProgress,
) (bool, error) {
	for _, event := range events {
		data, err := json.Marshal(event)
		if err != nil {
			return false, err
		}
		if _, err := fmt.Fprintf(response, "id: %s\nevent: hosted_access_progress\ndata: %s\n\n", event.Cursor, data); err != nil {
			return false, err
		}
		flusher.Flush()
		if hostedAccessProgressTerminal(event) {
			return true, nil
		}
	}
	return false, nil
}

func hostedAccessProgressTerminal(progress HostedAccessProgress) bool {
	return progress.State == HostedAccessProgressReadyOnPhone ||
		progress.State == HostedAccessProgressSuspended ||
		(progress.State == HostedAccessProgressNeedsAttention && !progress.Retryable)
}

func handleAdminRuntimeProgressEvents(
	store *Store,
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
	events, update, err := store.RuntimeProgressAfter(request.Context(), operationID, cursor)
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
	streamRuntimeProgressEvents(
		request.Context(),
		store,
		response,
		flusher,
		operationID,
		cursor,
		events,
		update,
	)
}

func streamRuntimeProgressEvents(
	ctx context.Context,
	store *Store,
	response http.ResponseWriter,
	flusher http.Flusher,
	operationID string,
	cursor string,
	events []RuntimeProgress,
	update <-chan struct{},
) {
	for {
		terminal, writeErr := writeRuntimeProgressEvents(response, flusher, events)
		if len(events) != 0 {
			cursor = events[len(events)-1].Cursor
		}
		if writeErr != nil || terminal {
			return
		}
		if runtimeProgressCursorEnded(ctx, store, operationID, cursor, events) {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-update:
		}
		var err error
		events, update, err = store.RuntimeProgressAfter(ctx, operationID, cursor)
		if err != nil {
			return
		}
	}
}

func runtimeProgressCursorEnded(
	ctx context.Context,
	store *Store,
	operationID string,
	cursor string,
	events []RuntimeProgress,
) bool {
	if len(events) != 0 || cursor == "" {
		return false
	}
	terminal, err := store.runtimeProgressCursorTerminal(ctx, operationID, cursor)
	return err != nil || terminal
}

func writeRuntimeProgressEvents(
	response http.ResponseWriter,
	flusher http.Flusher,
	events []RuntimeProgress,
) (bool, error) {
	for _, event := range events {
		data, err := json.Marshal(event)
		if err != nil {
			return false, err
		}
		if _, err := fmt.Fprintf(
			response,
			"id: %s\nevent: runtime_progress\ndata: %s\n\n",
			event.Cursor,
			data,
		); err != nil {
			return false, err
		}
		flusher.Flush()
		if runtimeProgressTerminal(event.State) {
			return true, nil
		}
	}
	return false, nil
}

func handleAdminEnsureDevice(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	var payload AdminEnsureDeviceRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	created, err := store.EnsureDeviceGrant(request.Context(), EnsureDeviceGrantRequest{
		Credential: payload.Credential, UserID: payload.UserID, RuntimeName: payload.RuntimeName,
		DisplayName: payload.DisplayName, GrantTTL: payload.GrantTTL,
	})
	if err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditDeviceEnsured,
		OccurredAt: time.Now(),
		State:      "active",
	})
	writeAdminEvent(response, AdminEvent{DeviceID: created.Device.ID, Event: "device_ensured"})
}

func handleAdminRevokeDevice(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	var payload AdminRevokeDeviceRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	if err := store.RevokeDevice(request.Context(), payload.DeviceID); err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditDeviceRevoked,
		OccurredAt: time.Now(),
		State:      "revoked",
	})
	writeAdminEvent(response, AdminEvent{DeviceID: payload.DeviceID, Event: "device_revoked"})
}

func handleAdminSetUserStatus(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	var payload AdminSetUserStatusRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	if err := store.SetUserStatus(request.Context(), payload.UserID, payload.Status); err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditUserStatusSet,
		OccurredAt: time.Now(),
		State:      string(payload.Status),
	})
	writeAdminEvent(response, AdminEvent{Event: "user_status_set", Status: string(payload.Status), UserID: payload.UserID})
}

func decodeAdminRequest(response http.ResponseWriter, request *http.Request, target any) bool {
	decoder := json.NewDecoder(io.LimitReader(request.Body, maximumAdminRequestBytes+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		writeAdminError(response)
		return false
	}
	return true
}

func writeAdminEvent(response http.ResponseWriter, event AdminEvent) {
	writeAdminJSON(response, event)
}

func writeAdminJSON(response http.ResponseWriter, value any) {
	if err := json.NewEncoder(response).Encode(value); err != nil {
		return
	}
}

func writeAdminError(response http.ResponseWriter) {
	http.Error(response, `{"error":"administration_failed"}`, http.StatusBadRequest)
}
