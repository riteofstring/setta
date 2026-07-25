package runtime

import (
	"context"

	"setta/internal/agent"
	"setta/internal/runtimecapability"
)

const (
	runtimeDiskPressureFailureCode   = "runtime_disk_pressure"
	runtimeDiskInspectionFailureCode = "runtime_disk_inspection_failed"
)

type runtimeDiskAdmissionGate struct {
	minimumFreeMiB int
	path           string
	readStats      func(string) (runtimeDiskStatsResult, error)
}

type runtimeDiskAdmissionFailure struct {
	code    string
	message string
}

func newRuntimeDiskAdmissionGate(
	appDataDir string,
	diskSpacePath string,
	minimumFreeMiB int,
) agent.TurnAdmissionGate {
	if minimumFreeMiB == 0 {
		return nil
	}
	if diskSpacePath == "" {
		diskSpacePath = appDataDir
	}
	return runtimeDiskAdmissionGate{
		minimumFreeMiB: minimumFreeMiB,
		path:           diskSpacePath,
		readStats:      runtimeDiskStats,
	}
}

func (gate runtimeDiskAdmissionGate) AdmitTurn(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	readStats := gate.readStats
	if readStats == nil {
		readStats = runtimeDiskStats
	}
	diagnostic := runtimeDiskSpaceDiagnosticWithReader(
		gate.path,
		gate.minimumFreeMiB,
		readStats,
	)
	if diagnostic.Status == runtimecapability.DiagnosticStatusOK {
		return nil
	}
	if diagnostic.ReasonCode == "disk_space_below_minimum" {
		return runtimeDiskAdmissionFailure{
			code:    runtimeDiskPressureFailureCode,
			message: "runtime free storage is below the configured minimum; free space and retry",
		}
	}
	return runtimeDiskAdmissionFailure{
		code:    runtimeDiskInspectionFailureCode,
		message: "runtime free storage could not be verified; retry after storage health recovers",
	}
}

func (failure runtimeDiskAdmissionFailure) Error() string {
	return failure.message
}

func (failure runtimeDiskAdmissionFailure) TurnAdmissionFailure() (string, bool) {
	return failure.code, true
}
