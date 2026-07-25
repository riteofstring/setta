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
	Method                  runtimeaccess.GatewayRequestMethod `json:"method"`
	ProviderTransportOpened bool                               `json:"provider_transport_opened"`
	RequestBytes            int64                              `json:"request_bytes"`
	ResponseBytes           int64                              `json:"response_bytes"`
	Result                  runtimeaccess.GatewayRequestResult `json:"result"`
	RouteResolved           bool                               `json:"route_resolved"`
	Status                  int                                `json:"status"`
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
		Method:                  observation.Method,
		ProviderTransportOpened: observation.ProviderTransportOpened,
		RequestBytes:            observation.RequestBytes,
		ResponseBytes:           observation.ResponseBytes,
		Result:                  observation.Result,
		RouteResolved:           observation.RouteResolved,
		Status:                  observation.Status,
	})
}

func (observer *JSONLinesObserver) Err() error {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.err
}

var _ runtimeaccess.GatewayObserver = (*JSONLinesObserver)(nil)
