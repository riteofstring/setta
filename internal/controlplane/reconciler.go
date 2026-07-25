package controlplane

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setta/internal/runtimeprovider"
)

type RuntimeReconcilerProvider interface {
	Create(context.Context, runtimeprovider.CreateRequest) (runtimeprovider.RuntimeObservation, error)
	Inspect(context.Context, string) (runtimeprovider.RuntimeObservation, bool, error)
	ConfigureURL(context.Context, string, runtimeprovider.URLAccess) error
	Destroy(context.Context, string) error
}

type ReconcilerConfig struct {
	LeaseDuration    time.Duration
	MaxAttempts      int
	OperationTimeout time.Duration
	Provider         RuntimeReconcilerProvider
	RetryDelay       time.Duration
	Store            *Store
	WorkerID         string
}

type Reconciler struct {
	leaseDuration    time.Duration
	maxAttempts      int
	operationTimeout time.Duration
	provider         RuntimeReconcilerProvider
	retryDelay       time.Duration
	store            *Store
	workerID         string
}

func NewReconciler(config ReconcilerConfig) (*Reconciler, error) {
	if config.Store == nil || config.Provider == nil {
		return nil, errors.New("runtime reconciler requires a store and provider")
	}
	if err := validateIdentifier("reconciler worker id", config.WorkerID); err != nil {
		return nil, err
	}
	if config.LeaseDuration <= 0 || config.RetryDelay <= 0 || config.OperationTimeout <= 0 || config.MaxAttempts <= 0 {
		return nil, errors.New("runtime reconciler durations and attempt ceiling must be positive")
	}
	if config.OperationTimeout >= config.LeaseDuration {
		return nil, errors.New("runtime reconciler operation timeout must be shorter than its lease")
	}
	return &Reconciler{
		leaseDuration:    config.LeaseDuration,
		maxAttempts:      config.MaxAttempts,
		operationTimeout: config.OperationTimeout,
		provider:         config.Provider,
		retryDelay:       config.RetryDelay,
		store:            config.Store,
		workerID:         config.WorkerID,
	}, nil
}

func (reconciler *Reconciler) ReconcileOnce(ctx context.Context) (bool, error) {
	operationCtx, cancel := context.WithTimeout(ctx, reconciler.operationTimeout)
	defer cancel()
	deletion, found, err := reconciler.store.ClaimRuntimeDeletionOperation(
		operationCtx,
		reconciler.workerID,
		reconciler.leaseDuration,
	)
	if err != nil {
		return false, err
	}
	if found {
		return true, reconciler.reconcileDeletionClaim(ctx, operationCtx, deletion)
	}
	claim, found, err := reconciler.store.ClaimRuntimeOperation(
		operationCtx,
		reconciler.workerID,
		reconciler.leaseDuration,
	)
	if err != nil || !found {
		return found, err
	}
	return true, reconciler.reconcileProvisioningClaim(ctx, operationCtx, claim)
}

func (reconciler *Reconciler) reconcileProvisioningClaim(
	parentCtx context.Context,
	operationCtx context.Context,
	claim ClaimedRuntimeOperation,
) error {
	verified, failure := reconciler.ensureProviderRuntime(operationCtx, claim)
	if failure != nil {
		if failure.permanent {
			err := reconciler.failOperation(operationCtx, claim, failure.code)
			return normalizeOperationError(parentCtx, operationCtx, err)
		}
		return reconciler.deferProviderFailure(parentCtx, operationCtx, claim, failure.code)
	}
	if err := reconciler.store.CompleteRuntimeOperation(operationCtx, claim, verified); err != nil {
		if errors.Is(err, ErrFenceLost) {
			return nil
		}
		return normalizeOperationError(parentCtx, operationCtx, err)
	}
	return nil
}

type providerReconcileFailure struct {
	code      string
	permanent bool
}

func (reconciler *Reconciler) ensureProviderRuntime(
	ctx context.Context,
	claim ClaimedRuntimeOperation,
) (runtimeprovider.RuntimeObservation, *providerReconcileFailure) {
	if failure := reconciler.inspectOrCreateRuntime(ctx, claim); failure != nil {
		return runtimeprovider.RuntimeObservation{}, failure
	}
	if err := reconciler.provider.ConfigureURL(ctx, claim.RuntimeName, runtimeprovider.URLAccessAuthenticated); err != nil {
		return runtimeprovider.RuntimeObservation{}, &providerReconcileFailure{code: "provider_configure_url"}
	}
	return reconciler.verifyRuntime(ctx, claim)
}

func (reconciler *Reconciler) inspectOrCreateRuntime(
	ctx context.Context,
	claim ClaimedRuntimeOperation,
) *providerReconcileFailure {
	observation, found, err := reconciler.provider.Inspect(ctx, claim.RuntimeName)
	if err != nil {
		return &providerReconcileFailure{code: "provider_inspect"}
	}
	if !found {
		observation, err = reconciler.provider.Create(ctx, runtimeprovider.CreateRequest{Identity: claim.Identity})
		if err != nil {
			return &providerReconcileFailure{code: "provider_create"}
		}
	}
	if err := validateManagedObservation(claim.Identity, observation); err != nil {
		return &providerReconcileFailure{code: "provider_identity_mismatch", permanent: true}
	}
	return nil
}

func (reconciler *Reconciler) verifyRuntime(
	ctx context.Context,
	claim ClaimedRuntimeOperation,
) (runtimeprovider.RuntimeObservation, *providerReconcileFailure) {
	verified, found, err := reconciler.provider.Inspect(ctx, claim.RuntimeName)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, &providerReconcileFailure{code: "provider_verify"}
	}
	if !found {
		return runtimeprovider.RuntimeObservation{}, &providerReconcileFailure{code: "provider_verify_missing"}
	}
	if err := validateManagedObservation(claim.Identity, verified); err != nil {
		return runtimeprovider.RuntimeObservation{}, &providerReconcileFailure{code: "provider_identity_mismatch", permanent: true}
	}
	if verified.URLAccess != runtimeprovider.URLAccessAuthenticated {
		return runtimeprovider.RuntimeObservation{}, &providerReconcileFailure{code: "provider_access_unconfirmed"}
	}
	return verified, nil
}

func (reconciler *Reconciler) deferProviderFailure(
	parentCtx context.Context,
	operationCtx context.Context,
	claim ClaimedRuntimeOperation,
	errorCode string,
) error {
	if parentCtx.Err() != nil {
		return parentCtx.Err()
	}
	if operationCtx.Err() != nil {
		return nil
	}
	terminal := claim.AttemptCount >= reconciler.maxAttempts
	return reconciler.store.DeferRuntimeOperation(
		operationCtx,
		claim,
		errorCode,
		claim.UpdatedAt.Add(reconciler.retryDelay),
		terminal,
	)
}

func (reconciler *Reconciler) failOperation(
	ctx context.Context,
	claim ClaimedRuntimeOperation,
	errorCode string,
) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return reconciler.store.DeferRuntimeOperation(ctx, claim, errorCode, claim.UpdatedAt, true)
}

func (reconciler *Reconciler) reconcileDeletionClaim(
	parentCtx context.Context,
	operationCtx context.Context,
	claim ClaimedRuntimeDeletionOperation,
) error {
	failure := reconciler.destroyProviderRuntime(operationCtx, claim)
	if failure != nil {
		if failure.permanent {
			err := reconciler.failDeletion(operationCtx, claim, failure.code)
			return normalizeOperationError(parentCtx, operationCtx, err)
		}
		return reconciler.deferDeletionFailure(parentCtx, operationCtx, claim, failure.code)
	}
	err := reconciler.store.CompleteRuntimeDeletionOperation(operationCtx, claim)
	if errors.Is(err, ErrFenceLost) {
		return nil
	}
	return normalizeOperationError(parentCtx, operationCtx, err)
}

func (reconciler *Reconciler) destroyProviderRuntime(
	ctx context.Context,
	claim ClaimedRuntimeDeletionOperation,
) *providerReconcileFailure {
	observation, found, err := reconciler.provider.Inspect(ctx, claim.RuntimeName)
	if err != nil {
		return &providerReconcileFailure{code: "provider_delete_inspect"}
	}
	if found {
		if err := validateManagedObservation(claim.Identity, observation); err != nil {
			return &providerReconcileFailure{code: "provider_identity_mismatch", permanent: true}
		}
		if err := reconciler.provider.Destroy(ctx, claim.RuntimeName); err != nil {
			return &providerReconcileFailure{code: "provider_destroy"}
		}
	}
	verified, stillPresent, err := reconciler.provider.Inspect(ctx, claim.RuntimeName)
	if err != nil {
		return &providerReconcileFailure{code: "provider_delete_verify"}
	}
	if !stillPresent {
		return nil
	}
	if err := validateManagedObservation(claim.Identity, verified); err != nil {
		return &providerReconcileFailure{code: "provider_identity_mismatch", permanent: true}
	}
	return &providerReconcileFailure{code: "provider_delete_unconfirmed"}
}

func (reconciler *Reconciler) deferDeletionFailure(
	parentCtx context.Context,
	operationCtx context.Context,
	claim ClaimedRuntimeDeletionOperation,
	errorCode string,
) error {
	if parentCtx.Err() != nil {
		return parentCtx.Err()
	}
	if operationCtx.Err() != nil {
		return nil
	}
	terminal := claim.AttemptCount >= reconciler.maxAttempts
	return reconciler.store.DeferRuntimeDeletionOperation(
		operationCtx,
		claim,
		errorCode,
		claim.UpdatedAt.Add(reconciler.retryDelay),
		terminal,
	)
}

func (reconciler *Reconciler) failDeletion(
	ctx context.Context,
	claim ClaimedRuntimeDeletionOperation,
	errorCode string,
) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return reconciler.store.DeferRuntimeDeletionOperation(
		ctx,
		claim,
		errorCode,
		claim.UpdatedAt,
		true,
	)
}

func (reconciler *Reconciler) Run(ctx context.Context) error {
	if ctx == nil {
		return errors.New("runtime reconciler context is required")
	}
	for {
		processed, err := reconciler.ReconcileOnce(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		if processed {
			continue
		}
		if err := reconciler.waitForWork(ctx); err != nil {
			return err
		}
	}
}

func normalizeOperationError(
	parentCtx context.Context,
	operationCtx context.Context,
	err error,
) error {
	if err == nil || parentCtx.Err() != nil {
		return err
	}
	if operationCtx.Err() != nil {
		return nil
	}
	return err
}

func (reconciler *Reconciler) waitForWork(ctx context.Context) error {
	next, found, err := reconciler.store.NextRuntimeOperationAt(ctx)
	if err != nil {
		return err
	}
	if !found {
		select {
		case <-ctx.Done():
			return nil
		case <-reconciler.store.OperationWake():
			return nil
		}
	}
	delay := time.Until(next)
	if delay < 0 {
		delay = 0
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return nil
	case <-reconciler.store.OperationWake():
		return nil
	case <-timer.C:
		return nil
	}
}

func validateManagedObservation(
	identity runtimeprovider.ManagedIdentity,
	observation runtimeprovider.RuntimeObservation,
) error {
	if observation.ProviderResourceID == "" || observation.Name != identity.Name ||
		!equalLabels(observation.Labels, identity.Labels) {
		return fmt.Errorf("provider observation does not match managed identity %s", identity.Name)
	}
	return nil
}
