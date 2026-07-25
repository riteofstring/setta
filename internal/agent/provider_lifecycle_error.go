package agent

import "errors"

// ProviderLifecycleError preserves the provider's diagnostic as an internal
// wrapped cause while presenting only stable product copy to callers that may
// persist an unexpected run failure.
type ProviderLifecycleError struct {
	Err error
}

func (err *ProviderLifecycleError) Error() string {
	return "Provider is temporarily unavailable. Try again."
}

func (err *ProviderLifecycleError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.Err
}

func IsProviderLifecycleError(err error) bool {
	var lifecycleError *ProviderLifecycleError
	return errors.As(err, &lifecycleError)
}
