package agent

import (
	"context"
	"errors"
)

type TurnAdmissionGate interface {
	AdmitTurn(context.Context) error
}

type turnAdmissionFailure interface {
	error
	TurnAdmissionFailure() (string, bool)
}

func TurnAdmissionFailure(err error) (string, bool, bool) {
	var failure turnAdmissionFailure
	if !errors.As(err, &failure) {
		return "", false, false
	}
	code, retryable := failure.TurnAdmissionFailure()
	return code, retryable, true
}
