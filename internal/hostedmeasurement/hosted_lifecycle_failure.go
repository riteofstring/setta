package hostedmeasurement

import (
	"errors"
	"fmt"
)

const (
	hostedLifecycleConfigurationInvalidFailureCode    = "hosted_lifecycle_configuration_invalid"
	hostedLifecycleProviderRequestFailureCode         = "hosted_lifecycle_provider_request_failed"
	hostedLifecycleOwnershipMismatchFailureCode       = "hosted_lifecycle_ownership_mismatch"
	hostedLifecycleProviderIdentityInvalidFailureCode = "hosted_lifecycle_provider_identity_invalid"
	hostedLifecycleResourceShapeMismatchFailureCode   = "hosted_lifecycle_resource_shape_mismatch"
	hostedLifecycleRecordedResourceMissingFailureCode = "hosted_lifecycle_recorded_resource_missing"
)

type hostedLifecycleFailure interface {
	error
	HostedLifecycleFailure() (string, bool)
}

type hostedLifecycleError struct {
	code      string
	retryable bool
	err       error
}

func newHostedLifecycleFailure(code string, retryable bool, message string) error {
	return hostedLifecycleError{
		code:      code,
		retryable: retryable,
		err:       errors.New(message),
	}
}

func wrapHostedLifecycleFailure(code string, retryable bool, message string, err error) error {
	return hostedLifecycleError{
		code:      code,
		retryable: retryable,
		err:       fmt.Errorf("%s: %w", message, err),
	}
}

func (failure hostedLifecycleError) Error() string {
	return failure.err.Error()
}

func (failure hostedLifecycleError) Unwrap() error {
	return failure.err
}

func (failure hostedLifecycleError) HostedLifecycleFailure() (string, bool) {
	return failure.code, failure.retryable
}

func HostedLifecycleFailure(err error) (string, bool, bool) {
	var failure hostedLifecycleFailure
	if !errors.As(err, &failure) {
		return "", false, false
	}
	code, retryable := failure.HostedLifecycleFailure()
	return code, retryable, true
}
