package controlplane

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
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

type RuntimeWakeTiming struct {
	CompletedAt time.Time
	Duration    time.Duration
	StartedAt   time.Time
}

type RuntimeWakeTimingMeasurement struct {
	CompletedAt          time.Time `json:"completed_at"`
	DurationMilliseconds float64   `json:"duration_ms"`
	Event                string    `json:"event"`
	StartedAt            time.Time `json:"started_at"`
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
	ControlPlaneAuditDeviceEnsured          ControlPlaneAuditAction = "device_ensured"
	ControlPlaneAuditDeviceRevoked          ControlPlaneAuditAction = "device_revoked"
	ControlPlaneAuditUserStatusSet          ControlPlaneAuditAction = "user_status_set"
	ControlPlaneAuditBudgetSet              ControlPlaneAuditAction = "budget_set"
	ControlPlaneAuditUsageRecorded          ControlPlaneAuditAction = "usage_recorded"
	ControlPlaneAuditRuntimeWakeRequested   ControlPlaneAuditAction = "runtime_wake_requested"
	ControlPlaneAuditRuntimeWakeObserved    ControlPlaneAuditAction = "runtime_wake_observed"
	ControlPlaneAuditRuntimeHealthRecorded  ControlPlaneAuditAction = "runtime_health_recorded"
	ControlPlaneAuditRuntimeReporterRotated ControlPlaneAuditAction = "runtime_reporting_credential_rotated"
	ControlPlaneAuditRuntimeUsageReported   ControlPlaneAuditAction = "runtime_accounting_transition_recorded"
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

type OperationalAlertSignal string

const (
	OperationalAlertProvisioningFailed    OperationalAlertSignal = "provisioning_failed"
	OperationalAlertWakeFailed            OperationalAlertSignal = "wake_failed"
	OperationalAlertProviderError         OperationalAlertSignal = "provider_error"
	OperationalAlertBudgetCutoffFailed    OperationalAlertSignal = "budget_cutoff_failed"
	OperationalAlertBudgetApproaching     OperationalAlertSignal = "budget_approaching"
	OperationalAlertReconciliationBacklog OperationalAlertSignal = "reconciliation_backlog"
	OperationalAlertStaleWorkloadTask     OperationalAlertSignal = "stale_workload_task"
	OperationalAlertStaleActiveSession    OperationalAlertSignal = "stale_active_session"
)

type OperationalAlertSeverity string

const (
	OperationalAlertWarning  OperationalAlertSeverity = "warning"
	OperationalAlertCritical OperationalAlertSeverity = "critical"
)

type OperationalAlertObservation struct {
	ErrorCode  string
	OccurredAt time.Time
	Severity   OperationalAlertSeverity
	Signal     OperationalAlertSignal
}

type OperationalAlertMeasurement struct {
	ErrorCode  string                   `json:"error_code"`
	Event      string                   `json:"event"`
	OccurredAt time.Time                `json:"occurred_at"`
	Severity   OperationalAlertSeverity `json:"severity"`
	Signal     OperationalAlertSignal   `json:"signal"`
}

type HostedAccessObserver interface {
	ObserveHostedAccessFailure(HostedAccessFailureObservation)
	ObserveHostedAccessTiming(HostedAccessTiming)
}

type RuntimeAuditObserver interface {
	ObserveRuntimeAudit(RuntimeAuditObservation)
}

type RuntimeWakeObserver interface {
	ObserveRuntimeWakeTiming(RuntimeWakeTiming)
}

type ControlPlaneAuditObserver interface {
	ObserveControlPlaneAudit(ControlPlaneAuditObservation)
}

type OperationalAlertObserver interface {
	ObserveOperationalAlert(OperationalAlertObservation)
}

type ControlPlaneObserver interface {
	ControlPlaneAuditObserver
	HostedAccessObserver
	OperationalAlertObserver
	RuntimeAuditObserver
	RuntimeWakeObserver
}

type AlertingObserver struct {
	alerts     OperationalAlertObserver
	downstream ControlPlaneObserver
	gateway    runtimeaccess.GatewayObserver
}

func NewAlertingObserver(
	downstream ControlPlaneObserver,
	gateway runtimeaccess.GatewayObserver,
	alerts OperationalAlertObserver,
) (*AlertingObserver, error) {
	if downstream == nil || gateway == nil || alerts == nil {
		return nil, errors.New("alerting observer requires control-plane, gateway, and alert observers")
	}
	return &AlertingObserver{alerts: alerts, downstream: downstream, gateway: gateway}, nil
}

func (observer *AlertingObserver) ObserveGatewayRequest(observation runtimeaccess.GatewayRequestObservation) {
	observer.gateway.ObserveGatewayRequest(observation)
}

func (observer *AlertingObserver) ObserveHostedAccessFailure(observation HostedAccessFailureObservation) {
	observer.downstream.ObserveHostedAccessFailure(observation)
}

func (observer *AlertingObserver) ObserveHostedAccessTiming(timing HostedAccessTiming) {
	observer.downstream.ObserveHostedAccessTiming(timing)
}

func (observer *AlertingObserver) ObserveControlPlaneAudit(observation ControlPlaneAuditObservation) {
	observer.downstream.ObserveControlPlaneAudit(observation)
}

func (observer *AlertingObserver) ObserveRuntimeAudit(observation RuntimeAuditObservation) {
	observer.downstream.ObserveRuntimeAudit(observation)
	for _, alert := range runtimeAuditAlerts(observation) {
		observer.alerts.ObserveOperationalAlert(alert)
	}
}

func (observer *AlertingObserver) ObserveRuntimeWakeTiming(timing RuntimeWakeTiming) {
	observer.downstream.ObserveRuntimeWakeTiming(timing)
}

func (observer *AlertingObserver) ObserveOperationalAlert(
	observation OperationalAlertObservation,
) {
	observer.alerts.ObserveOperationalAlert(observation)
}

func observeApproachingBudget(
	observer OperationalAlertObserver,
	interval UsageInterval,
) {
	if !interval.ApproachingBudget {
		return
	}
	observer.ObserveOperationalAlert(OperationalAlertObservation{
		ErrorCode:  "budget_cutoff_exposure_remaining",
		OccurredAt: interval.RecordedAt,
		Severity:   OperationalAlertWarning,
		Signal:     OperationalAlertBudgetApproaching,
	})
}

func runtimeAuditAlerts(observation RuntimeAuditObservation) []OperationalAlertObservation {
	alerts := make([]OperationalAlertObservation, 0, 2)
	if strings.HasPrefix(observation.ErrorCode, "provider_") {
		severity := OperationalAlertWarning
		if !observation.Retryable {
			severity = OperationalAlertCritical
		}
		alerts = append(alerts, OperationalAlertObservation{
			ErrorCode: observation.ErrorCode, OccurredAt: observation.CompletedAt,
			Severity: severity, Signal: OperationalAlertProviderError,
		})
	}
	if observation.State != RuntimeProgressFailed {
		return alerts
	}
	var signal OperationalAlertSignal
	switch observation.Kind {
	case RuntimeProgressEnsureRuntime:
		signal = OperationalAlertProvisioningFailed
	case RuntimeProgressWakeRuntime:
		signal = OperationalAlertWakeFailed
	case RuntimeProgressBudgetCutoff:
		signal = OperationalAlertBudgetCutoffFailed
	default:
		return alerts
	}
	return append(alerts, OperationalAlertObservation{
		ErrorCode: observation.ErrorCode, OccurredAt: observation.CompletedAt,
		Severity: OperationalAlertCritical, Signal: signal,
	})
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

func (observer *JSONLinesObserver) ObserveRuntimeWakeTiming(timing RuntimeWakeTiming) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.err != nil {
		return
	}
	if timing.Duration < 0 {
		observer.err = errors.New("runtime wake timing cannot be negative")
		return
	}
	observer.err = observer.encoder.Encode(RuntimeWakeTimingMeasurement{
		CompletedAt:          timing.CompletedAt.UTC(),
		DurationMilliseconds: milliseconds(timing.Duration),
		Event:                "runtime_wake_ready",
		StartedAt:            timing.StartedAt.UTC(),
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

func (observer *JSONLinesObserver) ObserveOperationalAlert(observation OperationalAlertObservation) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	if observer.err != nil {
		return
	}
	observer.err = observer.encoder.Encode(OperationalAlertMeasurement{
		ErrorCode:  observation.ErrorCode,
		Event:      "operational_alert",
		OccurredAt: observation.OccurredAt.UTC(),
		Severity:   observation.Severity,
		Signal:     observation.Signal,
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
var _ runtimeaccess.GatewayObserver = (*AlertingObserver)(nil)
var _ ControlPlaneObserver = (*JSONLinesObserver)(nil)
var _ ControlPlaneObserver = (*AlertingObserver)(nil)
var _ HostedAccessObserver = (*JSONLinesObserver)(nil)
var _ OperationalAlertObserver = (*JSONLinesObserver)(nil)
var _ RuntimeAuditObserver = (*JSONLinesObserver)(nil)
