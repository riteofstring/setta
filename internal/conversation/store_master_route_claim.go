package conversation

import (
	"errors"

	"setta/internal/master"
)

func validateMasterRouteClaimTiming(accepted master.AcceptedMasterInput, startedAt string) error {
	started, _ := validateTimestamp("master input routing startedAt", startedAt)
	acceptedTime, _ := validateTimestamp("master input acceptedAt", accepted.AcceptedAt)
	if started.Before(acceptedTime) {
		return errors.New("master input routing cannot start before input acceptance")
	}
	return nil
}
