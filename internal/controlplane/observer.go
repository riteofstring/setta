package controlplane

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	"setta/internal/runtimeaccess"
)

type GatewayMeasurement struct {
	CompletedAt               time.Time                          `json:"completed_at"`
	DurationMilliseconds      float64                            `json:"duration_ms"`
	Event                     string                             `json:"event"`
	FirstResponseMilliseconds float64                            `json:"first_response_ms"`
	FirstResponseObserved     bool                               `json:"first_response_observed"`
	Method                    runtimeaccess.GatewayRequestMethod `json:"method"`
	Operation                 string                             `json:"operation"`
	ProviderTransportOpened   bool                               `json:"provider_transport_opened"`
	RequestBytes              int64                              `json:"request_bytes"`
	ResumeRequested           bool                               `json:"resume_requested"`
	ResponseBytes             int64                              `json:"response_bytes"`
	Result                    runtimeaccess.GatewayRequestResult `json:"result"`
	RouteResolved             bool                               `json:"route_resolved"`
	Status                    int                                `json:"status"`
}

type HostedAccessTiming struct {
	CompletedAt   time.Time
	EnsureToSync  time.Duration
	EnsureToReady time.Duration
	SyncToReady   time.Duration
}

type HostedAccessTimingMeasurement struct {
	CompletedAt               time.Time `json:"completed_at"`
	EnsureToReadyMilliseconds float64   `json:"ensure_to_ready_ms"`
	EnsureToSyncMilliseconds  float64   `json:"ensure_to_sync_ms"`
	Event                     string    `json:"event"`
	SyncToReadyMilliseconds   float64   `json:"sync_to_ready_ms"`
}

type HostedAccessFailureObservation struct {
	CompletedAt time.Time
	ReasonCode  HostedAccessReasonCode
	Retryable   bool
}

type HostedAccessFailureMeasurement struct {
	CompletedAt time.Time              `json:"completed_at"`
	Event       string                 `json:"event"`
	ReasonCode  HostedAccessReasonCode `json:"reason_code"`
	Retryable   bool                   `json:"retryable"`
}

type RuntimeAuditObservation struct {
	AttemptCount      int
	AttemptDuration   time.Duration
	CompletedAt       time.Time
	ErrorCode         string
	Kind              RuntimeProgressKind
	OperationDuration time.Duration
	Retryable         bool
	StartedAt         time.Time
	State             RuntimeProgressState
}

type RuntimeAuditMeasurement struct {
	AttemptCount                  int                  `json:"attempt_count"`
	AttemptDurationMilliseconds   float64              `json:"attempt_duration_ms"`
	CompletedAt                   time.Time            `json:"completed_at"`
	ErrorCode                     string               `json:"error_code"`
	Event                         string               `json:"event"`
	Kind                          RuntimeProgressKind  `json:"kind"`
	OperationDurationMilliseconds float64              `json:"operation_duration_ms"`
	Retryable                     bool                 `json:"retryable"`
	StartedAt                     time.Time            `json:"started_at"`
	State                         RuntimeProgressState `json:"state"`
}

type ControlPlaneAuditAction string

const (
	ControlPlaneAuditDeviceEnsured ControlPlaneAuditAction = "device_ensured"
	ControlPlaneAuditDeviceRevoked ControlPlaneAuditAction = "device_revoked"
	ControlPlaneAuditUserStatusSet ControlPlaneAuditAction = "user_status_set"
	ControlPlaneAuditBudgetSet     ControlPlaneAuditAction = "budget_set"
	ControlPlaneAuditUsageRecorded ControlPlaneAuditAction = "usage_recorded"
)

type ControlPlaneAuditObservation struct {
	Action     ControlPlaneAuditAction
	OccurredAt time.Time
	State      string
}

type ControlPlaneAuditMeasurement struct {
	Action     ControlPlaneAuditAction `json:"action"`
	Event      string                  `json:"event"`
	OccurredAt time.Time               `json:"occurred_at"`
	State      string                  `json:"state"`
}

type HostedAccessObserver interface {
	ObserveHostedAccessFailure(HostedAccessFailureObservation)
	ObserveHostedAccessTiming(HostedAccessTiming)
}

type RuntimeAuditObserver interface {
	ObserveRuntimeAudit(RuntimeAuditObservation)
}

type ControlPlaneAuditObserver interface {
	ObserveControlPlaneAudit(ControlPlaneAuditObservation)
}

type ControlPlaneObserver interface {
	ControlPlaneAuditObserver
	HostedAccessObserver
	RuntimeAuditObserver
}

type JSONLinesObserver struct {
	encoder *json.Encoder
	mu      sync.Mutex
	err     error
}

func NewJSONLinesObserver(writer io.Writer) (*JSONLinesObserver, error) {
	if writer == nil {
		return nil, fmt.Errorf("gateway measurement writer is required")
	}
	return &JSONLinesObserver{encoder: json.NewEncoder(writer)}, nil
}

func (observer *JSONLinesObserver) ObserveGatewayRequest(observation runtimeaccess.GatewayRequestObservation) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.err != nil {
		return
	}
	observer.err = observer.encoder.Encode(GatewayMeasurement{
		CompletedAt:               observation.CompletedAt.UTC(),
		DurationMilliseconds:      float64(observation.Duration) / float64(time.Millisecond),
		Event:                     "gateway_request",
		FirstResponseMilliseconds: milliseconds(observation.FirstResponseDuration),
		FirstResponseObserved:     observation.FirstResponseObserved,
		Method:                    observation.Method,
		Operation:                 observation.Operation,
		ProviderTransportOpened:   observation.ProviderTransportOpened,
		RequestBytes:              observation.RequestBytes,
		ResumeRequested:           observation.ResumeRequested,
		ResponseBytes:             observation.ResponseBytes,
		Result:                    observation.Result,
		RouteResolved:             observation.RouteResolved,
		Status:                    observation.Status,
	})
}

func (observer *JSONLinesObserver) ObserveHostedAccessTiming(timing HostedAccessTiming) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.err != nil {
		return
	}
	observer.err = observer.encoder.Encode(HostedAccessTimingMeasurement{
		CompletedAt:               timing.CompletedAt.UTC(),
		EnsureToReadyMilliseconds: milliseconds(timing.EnsureToReady),
		EnsureToSyncMilliseconds:  milliseconds(timing.EnsureToSync),
		Event:                     "hosted_access_ready",
		SyncToReadyMilliseconds:   milliseconds(timing.SyncToReady),
	})
}

func (observer *JSONLinesObserver) ObserveHostedAccessFailure(observation HostedAccessFailureObservation) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.err != nil {
		return
	}
	observer.err = observer.encoder.Encode(HostedAccessFailureMeasurement{
		CompletedAt: observation.CompletedAt.UTC(),
		Event:       "hosted_access_failed",
		ReasonCode:  observation.ReasonCode,
		Retryable:   observation.Retryable,
	})
}

func (observer *JSONLinesObserver) ObserveRuntimeAudit(observation RuntimeAuditObservation) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.err != nil {
		return
	}
	if observation.AttemptDuration < 0 || observation.OperationDuration < 0 {
		observer.err = errors.New("runtime reconciliation timing cannot be negative")
		return
	}
	observer.err = observer.encoder.Encode(RuntimeAuditMeasurement{
		AttemptCount:                  observation.AttemptCount,
		AttemptDurationMilliseconds:   milliseconds(observation.AttemptDuration),
		CompletedAt:                   observation.CompletedAt.UTC(),
		ErrorCode:                     observation.ErrorCode,
		Event:                         "runtime_reconciliation",
		Kind:                          observation.Kind,
		OperationDurationMilliseconds: milliseconds(observation.OperationDuration),
		Retryable:                     observation.Retryable,
		StartedAt:                     observation.StartedAt.UTC(),
		State:                         observation.State,
	})
}

func (observer *JSONLinesObserver) ObserveControlPlaneAudit(observation ControlPlaneAuditObservation) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.err != nil {
		return
	}
	observer.err = observer.encoder.Encode(ControlPlaneAuditMeasurement{
		Action:     observation.Action,
		Event:      "control_plane_audit",
		OccurredAt: observation.OccurredAt.UTC(),
		State:      observation.State,
	})
}

func milliseconds(duration time.Duration) float64 {
	return float64(duration) / float64(time.Millisecond)
}

func (observer *JSONLinesObserver) Err() error {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.err
}

var _ runtimeaccess.GatewayObserver = (*JSONLinesObserver)(nil)
var _ ControlPlaneObserver = (*JSONLinesObserver)(nil)
var _ HostedAccessObserver = (*JSONLinesObserver)(nil)
var _ RuntimeAuditObserver = (*JSONLinesObserver)(nil)
