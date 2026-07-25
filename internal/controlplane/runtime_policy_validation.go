package controlplane

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/runtimeprovider"
)

func validateAssignment(request AssignRuntimeRequest) error {
	if err := validateAssignmentIdentity(request); err != nil {
		return err
	}
	if err := validateAssignmentState(request); err != nil {
		return err
	}
	if request.CredentialEpoch == 0 {
		return errors.New("runtime credential epoch must be positive")
	}
	if err := request.Resources.Validate(); err != nil {
		return err
	}
	if err := validateAuthority(request.UpstreamAuthority); err != nil {
		return err
	}
	return validateSecretReference(request.CredentialSecretRef)
}

func validateAssignmentIdentity(request AssignRuntimeRequest) error {
	if err := validateIdentifier("idempotency key", request.IdempotencyKey); err != nil {
		return err
	}
	if err := validateIdentifier("user id", request.UserID); err != nil {
		return err
	}
	return runtimeprovider.ValidateManagedName(request.RuntimeName)
}

func validateAssignmentState(request AssignRuntimeRequest) error {
	if !validRuntimeLifecycle(request.Lifecycle) {
		return fmt.Errorf("invalid runtime lifecycle %q", request.Lifecycle)
	}
	if !validRuntimeAccessState(request.AccessState) {
		return fmt.Errorf("invalid runtime access state %q", request.AccessState)
	}
	if request.AccessState == RuntimeAccessDeleteScheduled {
		return errors.New("assigned runtime cannot start with delete-scheduled access")
	}
	if !validRuntimeHealthState(request.HealthState) {
		return fmt.Errorf("invalid runtime health state %q", request.HealthState)
	}
	if request.DesiredRelease == "" {
		return errors.New("desired runtime release is required")
	}
	if err := validateRelease("desired release", request.DesiredRelease); err != nil {
		return err
	}
	if err := validateRelease("observed release", request.ObservedRelease); err != nil {
		return err
	}
	return validateAssignmentReadiness(request)
}

func validateAssignmentReadiness(request AssignRuntimeRequest) error {
	if request.Lifecycle == RuntimeLifecycleReady &&
		(request.HealthState != RuntimeHealthHealthy ||
			request.ObservedRelease != request.DesiredRelease) {
		return errors.New("ready runtime requires healthy state and a current desired release")
	}
	if request.HealthState == RuntimeHealthHealthy && request.ObservedRelease == "" {
		return errors.New("healthy runtime requires an observed release")
	}
	return nil
}

func validRuntimeLifecycle(lifecycle RuntimeLifecycle) bool {
	switch lifecycle {
	case RuntimeLifecycleProvisioning, RuntimeLifecycleReady, RuntimeLifecycleDeleting, RuntimeLifecycleFailed:
		return true
	default:
		return false
	}
}

func validRuntimeAccessState(state RuntimeAccessState) bool {
	switch state {
	case RuntimeAccessEnabled,
		RuntimeAccessSuspended,
		RuntimeAccessExportOnly,
		RuntimeAccessDeleteScheduled:
		return true
	default:
		return false
	}
}

func validRuntimeHealthState(state RuntimeHealthState) bool {
	switch state {
	case RuntimeHealthUnknown, RuntimeHealthHealthy, RuntimeHealthDegraded, RuntimeHealthUnreachable:
		return true
	default:
		return false
	}
}

func validEntitlementState(state EntitlementState) bool {
	switch state {
	case EntitlementActive, EntitlementGrace, EntitlementExportOnly, EntitlementEnded:
		return true
	default:
		return false
	}
}

func validateRelease(label string, release string) error {
	if release == "" {
		return nil
	}
	if strings.TrimSpace(release) != release || len(release) > 128 {
		return fmt.Errorf("%s must be trimmed and at most 128 bytes", label)
	}
	for _, character := range release {
		if character < 0x21 || character > 0x7e {
			return fmt.Errorf("%s must contain visible ASCII characters", label)
		}
	}
	return nil
}

func readyTimestamp(request AssignRuntimeRequest, now string) any {
	if request.Lifecycle == RuntimeLifecycleReady && request.HealthState == RuntimeHealthHealthy {
		return now
	}
	return nil
}
