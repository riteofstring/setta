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

func TestRuntimeDiskAdmissionMapsDiagnosticReasonCodes(t *testing.T) {
	tests := []struct {
		name                 string
		readStats            func(string) (runtimeDiskStatsResult, error)
		wantDiagnosticReason string
		wantFailureCode      string
	}{
		{
			name: "below minimum",
			readStats: func(string) (runtimeDiskStatsResult, error) {
				return runtimeDiskStatsResult{}, nil
			},
			wantDiagnosticReason: runtimeDiskSpaceBelowMinimumReasonCode,
			wantFailureCode:      runtimeDiskPressureFailureCode,
		},
		{
			name: "inspection failure",
			readStats: func(string) (runtimeDiskStatsResult, error) {
				return runtimeDiskStatsResult{}, errors.New("storage unavailable")
			},
			wantDiagnosticReason: runtimeDiskSpaceUnavailableReasonCode,
			wantFailureCode:      runtimeDiskInspectionFailureCode,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			diagnostic := runtimeDiskSpaceDiagnosticWithReader("/runtime", 1, test.readStats)
			if diagnostic.ReasonCode != test.wantDiagnosticReason {
				t.Fatalf("diagnostic reason = %q, want %q", diagnostic.ReasonCode, test.wantDiagnosticReason)
			}

			gate := runtimeDiskAdmissionGate{
				minimumFreeMiB: 1,
				path:           "/runtime",
				readStats:      test.readStats,
			}
			err := gate.AdmitTurn(t.Context())
			code, retryable, admissionFailure := agent.TurnAdmissionFailure(err)
			if !admissionFailure || code != test.wantFailureCode || !retryable {
				t.Fatalf(
					"admission failure = %q, %t, %t from %v; want %q, true, true",
					code,
					retryable,
					admissionFailure,
					err,
					test.wantFailureCode,
				)
			}
		})
	}
}

func TestDefaultConfigInstallsWorkingRuntimeDiskAdmissionGate(t *testing.T) {
	config := DefaultConfig()
	config.AppDataDir = t.TempDir()
	if config.MinimumDiskFreeMiB <= 0 {
		t.Fatalf("default minimum free disk = %d MiB, want positive", config.MinimumDiskFreeMiB)
	}

	admissionGate := newRuntimeDiskAdmissionGate(
		config.AppDataDir,
		config.DiskSpacePath,
		config.MinimumDiskFreeMiB,
	)
	gate, ok := admissionGate.(runtimeDiskAdmissionGate)
	if !ok {
		t.Fatalf("default disk admission gate = %T, want runtimeDiskAdmissionGate", admissionGate)
	}
	gate.readStats = func(string) (runtimeDiskStatsResult, error) {
		return runtimeDiskStatsResult{
			AvailableBytes: uint64(config.MinimumDiskFreeMiB-1) * 1024 * 1024,
			TotalBytes:     uint64(config.MinimumDiskFreeMiB+1) * 1024 * 1024,
		}, nil
	}

	err := gate.AdmitTurn(t.Context())
	code, retryable, admissionFailure := agent.TurnAdmissionFailure(err)
	if !admissionFailure || code != runtimeDiskPressureFailureCode || !retryable {
		t.Fatalf("default disk admission failure = %q, %t, %t from %v", code, retryable, admissionFailure, err)
	}
}

func TestZeroMinimumDisablesRuntimeDiskAdmissionGate(t *testing.T) {
	if gate := newRuntimeDiskAdmissionGate("/runtime", "", 0); gate != nil {
		t.Fatalf("zero-minimum disk admission gate = %T, want nil", gate)
	}
}
