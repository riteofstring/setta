package runtime

import (
	"errors"
	"testing"

	"setta/internal/agent"
)

func TestRuntimeDiskAdmissionDeniesPressureAndRecoversWithoutRestart(t *testing.T) {
	availableBytes := uint64(0)
	gate := runtimeDiskAdmissionGate{
		minimumFreeMiB: 1,
		path:           "/runtime",
		readStats: func(string) (runtimeDiskStatsResult, error) {
			return runtimeDiskStatsResult{
				AvailableBytes: availableBytes,
				TotalBytes:     100 * 1024 * 1024,
			}, nil
		},
	}

	err := gate.AdmitTurn(t.Context())
	code, retryable, admissionFailure := agent.TurnAdmissionFailure(err)
	if !admissionFailure || code != runtimeDiskPressureFailureCode || !retryable {
		t.Fatalf("disk pressure failure = %q, %t, %t from %v", code, retryable, admissionFailure, err)
	}

	availableBytes = 2 * 1024 * 1024
	if err := gate.AdmitTurn(t.Context()); err != nil {
		t.Fatalf("disk admission after recovery: %v", err)
	}
}

func TestRuntimeDiskAdmissionFailsClosedWhenStorageCannotBeInspected(t *testing.T) {
	gate := runtimeDiskAdmissionGate{
		minimumFreeMiB: 1,
		path:           "/runtime",
		readStats: func(string) (runtimeDiskStatsResult, error) {
			return runtimeDiskStatsResult{}, errors.New("storage unavailable")
		},
	}

	err := gate.AdmitTurn(t.Context())
	code, retryable, admissionFailure := agent.TurnAdmissionFailure(err)
	if !admissionFailure || code != runtimeDiskInspectionFailureCode || !retryable {
		t.Fatalf("disk inspection failure = %q, %t, %t from %v", code, retryable, admissionFailure, err)
	}
}
