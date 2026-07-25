package controlplane

import (
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"

	"setta/internal/runtimeaccess"
)

type GatewayMeasurement struct {
	CompletedAt             time.Time                          `json:"completed_at"`
	DurationMilliseconds    float64                            `json:"duration_ms"`
	Event                   string                             `json:"event"`
	Method                  runtimeaccess.GatewayRequestMethod `json:"method"`
	ProviderTransportOpened bool                               `json:"provider_transport_opened"`
	RequestBytes            int64                              `json:"request_bytes"`
	ResponseBytes           int64                              `json:"response_bytes"`
	Result                  runtimeaccess.GatewayRequestResult `json:"result"`
	RouteResolved           bool                               `json:"route_resolved"`
	Status                  int                                `json:"status"`
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

type HostedAccessObserver interface {
	ObserveHostedAccessFailure(HostedAccessFailureObservation)
	ObserveHostedAccessTiming(HostedAccessTiming)
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
		CompletedAt:             observation.CompletedAt.UTC(),
		DurationMilliseconds:    float64(observation.Duration) / float64(time.Millisecond),
		Event:                   "gateway_request",
		Method:                  observation.Method,
		ProviderTransportOpened: observation.ProviderTransportOpened,
		RequestBytes:            observation.RequestBytes,
		ResponseBytes:           observation.ResponseBytes,
		Result:                  observation.Result,
		RouteResolved:           observation.RouteResolved,
		Status:                  observation.Status,
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

func milliseconds(duration time.Duration) float64 {
	return float64(duration) / float64(time.Millisecond)
}

func (observer *JSONLinesObserver) Err() error {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.err
}

var _ runtimeaccess.GatewayObserver = (*JSONLinesObserver)(nil)
var _ HostedAccessObserver = (*JSONLinesObserver)(nil)
