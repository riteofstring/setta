package controlplane

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setta/internal/runtimecost"
	"setta/internal/runtimeprovider"
)

type RuntimeReconcilerProvider interface {
	Create(context.Context, runtimeprovider.CreateRequest) (runtimeprovider.RuntimeObservation, error)
	Inspect(context.Context, string) (runtimeprovider.RuntimeObservation, bool, error)
	ConfigureURL(context.Context, string, runtimeprovider.URLAccess) error
	Suspend(context.Context, string) error
	Destroy(context.Context, string) error
}

type ReconcilerConfig struct {
	AccountingObserver ControlPlaneAuditObserver
	AccountingWindow   time.Duration
	AlertObserver      OperationalAlertObserver
	LeaseDuration      time.Duration
	MaxAttempts        int
	OperationTimeout   time.Duration
	Observer           RuntimeAuditObserver
	PriceSchedule      runtimecost.PriceSchedule
	Provider           RuntimeReconcilerProvider
	RetryDelay         time.Duration
	Store              *Store
	WorkerID           string
}

type Reconciler struct {
	accountingObserver ControlPlaneAuditObserver
	accountingWindow   time.Duration
	alertObserver      OperationalAlertObserver
	leaseDuration      time.Duration
	maxAttempts        int
	operationTimeout   time.Duration
	observer           RuntimeAuditObserver
	priceSchedule      runtimecost.PriceSchedule
	provider           RuntimeReconcilerProvider
	retryDelay         time.Duration
	store              *Store
	workerID           string
}

func NewReconciler(config ReconcilerConfig) (*Reconciler, error) {
	if err := validateReconcilerConfig(config); err != nil {
		return nil, err
	}
	return &Reconciler{
		accountingObserver: config.AccountingObserver,
		accountingWindow:   config.AccountingWindow,
		alertObserver:      config.AlertObserver,
		leaseDuration:      config.LeaseDuration,
		maxAttempts:        config.MaxAttempts,
		operationTimeout:   config.OperationTimeout,
		observer:           config.Observer,
		priceSchedule:      config.PriceSchedule,
		provider:           config.Provider,
		retryDelay:         config.RetryDelay,
		store:              config.Store,
		workerID:           config.WorkerID,
	}, nil
}

func validateReconcilerConfig(config ReconcilerConfig) error {
	if err := validateReconcilerDependencies(config); err != nil {
		return err
	}
	if err := validateIdentifier("reconciler worker id", config.WorkerID); err != nil {
		return err
	}
	if err := validateReconcilerLimits(config); err != nil {
		return err
	}
	if err := runtimecost.ValidatePriceSchedule(config.PriceSchedule); err != nil {
		return fmt.Errorf("runtime reconciler price schedule: %w", err)
	}
	return nil
}

func validateReconcilerDependencies(config ReconcilerConfig) error {
	if config.Store == nil || config.Provider == nil || config.Observer == nil ||
		config.AccountingObserver == nil || config.AlertObserver == nil {
		return errors.New(
			"runtime reconciler requires a store, provider, runtime, accounting, and alert observers",
		)
	}
	return nil
}

func validateReconcilerLimits(config ReconcilerConfig) error {
	if config.AccountingWindow <= 0 || config.LeaseDuration <= 0 ||
		config.RetryDelay <= 0 || config.OperationTimeout <= 0 || config.MaxAttempts <= 0 {
		return errors.New("runtime reconciler durations and attempt ceiling must be positive")
	}
	if config.OperationTimeout >= config.LeaseDuration {
		return errors.New("runtime reconciler operation timeout must be shorter than its lease")
	}
	return nil
}

func (reconciler *Reconciler) ReconcileOnce(ctx context.Context) (bool, error) {
	operationCtx, cancel := context.WithTimeout(ctx, reconciler.operationTimeout)
	defer cancel()
	cutoff, found, err := reconciler.store.ClaimBudgetCutoffOperation(
		operationCtx,
		reconciler.workerID,
		reconciler.leaseDuration,
	)
	if err != nil {
		return false, err
	}
	if found {
		return true, reconciler.reconcileBudgetCutoffClaim(ctx, operationCtx, cutoff)
	}
	accounting, found, err := reconciler.store.NextAccountingWindow(
		operationCtx,
		reconciler.accountingWindow,
	)
	if err != nil {
		return false, err
	}
	if found && !accounting.WindowEnd.After(reconciler.store.clock().UTC()) {
		return true, reconciler.finalizeScheduledAccountingWindow(operationCtx, accounting)
	}
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

func (reconciler *Reconciler) finalizeScheduledAccountingWindow(
	ctx context.Context,
	window ScheduledAccountingWindow,
) error {
	finalized, err := reconciler.store.FinalizeRuntimeAccountingWindow(
		ctx,
		FinalizeRuntimeAccountingWindowRequest{
			IdempotencyKey: window.IdempotencyKey,
			RuntimeName:    window.RuntimeName,
			UserID:         window.UserID,
			WindowEnd:      window.WindowEnd,
		},
		reconciler.priceSchedule,
	)
	if err != nil {
		return err
	}
	state := "continue"
	if finalized.Interval.CutoffRequired {
		state = "cutoff"
	}
	reconciler.accountingObserver.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditUsageRecorded,
		OccurredAt: finalized.FinalizedAt,
		State:      state,
	})
	observeApproachingBudget(reconciler.alertObserver, finalized.Interval)
	return nil
}

func (reconciler *Reconciler) reconcileBudgetCutoffClaim(
	parentCtx context.Context,
	operationCtx context.Context,
	claim ClaimedBudgetCutoffOperation,
) error {
	remaining := claim.DeadlineAt.Sub(reconciler.store.clock().UTC())
	if remaining <= 0 {
		return reconciler.deferBudgetCutoff(
			parentCtx,
			operationCtx,
			claim,
			&providerReconcileFailure{code: "cutoff_deadline_exceeded", permanent: true},
		)
	}
	cutoffCtx, cancel := context.WithTimeout(operationCtx, remaining)
	defer cancel()
	failure := reconciler.suspendBudgetRuntime(cutoffCtx, claim)
	if cutoffCtx.Err() != nil && operationCtx.Err() == nil {
		failure = &providerReconcileFailure{code: "cutoff_deadline_exceeded", permanent: true}
	}
	if failure != nil {
		return reconciler.deferBudgetCutoff(parentCtx, operationCtx, claim, failure)
	}
	err := reconciler.store.CompleteBudgetCutoffOperation(operationCtx, claim)
	if errors.Is(err, ErrFenceLost) {
		return nil
	}
	if err == nil {
		reconciler.observeRuntimeAudit(
			claim.RuntimeOperation,
			RuntimeProgressBudgetCutoff,
			RuntimeProgressSuspended,
			"",
			false,
		)
	}
	return normalizeOperationError(parentCtx, operationCtx, err)
}

func (reconciler *Reconciler) suspendBudgetRuntime(
	ctx context.Context,
	claim ClaimedBudgetCutoffOperation,
) *providerReconcileFailure {
	observation, found, failure := reconciler.inspectBudgetRuntime(
		ctx,
		claim,
		"provider_cutoff_inspect",
	)
	if failure != nil {
		return failure
	}
	if !found {
		return nil
	}
	if providerActivitySuspended(observation.Activity) {
		return nil
	}
	if err := reconciler.provider.Suspend(ctx, claim.RuntimeName); err != nil {
		return &providerReconcileFailure{code: "provider_suspend"}
	}
	verified, found, failure := reconciler.inspectBudgetRuntime(
		ctx,
		claim,
		"provider_cutoff_verify",
	)
	if failure != nil {
		return failure
	}
	if !found {
		return nil
	}
	if !providerActivitySuspended(verified.Activity) {
		return &providerReconcileFailure{code: "provider_cutoff_unconfirmed"}
	}
	return nil
}

func (reconciler *Reconciler) inspectBudgetRuntime(
	ctx context.Context,
	claim ClaimedBudgetCutoffOperation,
	inspectErrorCode string,
) (runtimeprovider.RuntimeObservation, bool, *providerReconcileFailure) {
	observation, found, err := reconciler.provider.Inspect(ctx, claim.RuntimeName)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, false, &providerReconcileFailure{code: inspectErrorCode}
	}
	if !found {
		return runtimeprovider.RuntimeObservation{}, false, nil
	}
	if err := validateManagedObservation(claim.Identity, observation); err != nil {
		return runtimeprovider.RuntimeObservation{}, false, &providerReconcileFailure{
			code: "provider_identity_mismatch", permanent: true,
		}
	}
	if !validProviderActivity(observation.Activity) {
		return runtimeprovider.RuntimeObservation{}, false, &providerReconcileFailure{
			code: "provider_activity_invalid", permanent: true,
		}
	}
	return observation, true, nil
}

func validProviderActivity(activity runtimeprovider.RuntimeActivity) bool {
	switch activity {
	case runtimeprovider.RuntimeActivityProvisioning,
		runtimeprovider.RuntimeActivityActive,
		runtimeprovider.RuntimeActivityWarm,
		runtimeprovider.RuntimeActivityCold:
		return true
	default:
		return false
	}
}

func providerActivitySuspended(activity runtimeprovider.RuntimeActivity) bool {
	return activity == runtimeprovider.RuntimeActivityWarm ||
		activity == runtimeprovider.RuntimeActivityCold
}

func (reconciler *Reconciler) deferBudgetCutoff(
	parentCtx context.Context,
	operationCtx context.Context,
	claim ClaimedBudgetCutoffOperation,
	failure *providerReconcileFailure,
) error {
	if parentCtx.Err() != nil {
		return parentCtx.Err()
	}
	if operationCtx.Err() != nil {
		return nil
	}
	terminal := failure.permanent || claim.AttemptCount >= reconciler.maxAttempts
	if !reconciler.store.clock().UTC().Before(claim.DeadlineAt) {
		failure.code = "cutoff_deadline_exceeded"
		terminal = true
	}
	err := reconciler.store.DeferBudgetCutoffOperation(
		operationCtx,
		claim,
		failure.code,
		claim.UpdatedAt.Add(reconciler.retryDelay),
		terminal,
	)
	if err == nil {
		state := RuntimeProgressRetrying
		if terminal {
			state = RuntimeProgressFailed
		}
		reconciler.observeRuntimeAudit(
			claim.RuntimeOperation,
			RuntimeProgressBudgetCutoff,
			state,
			failure.code,
			!terminal,
		)
	}
	return err
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
	reconciler.observeRuntimeAudit(claim.RuntimeOperation, RuntimeProgressEnsureRuntime, RuntimeProgressProvisioned, "", false)
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
		observation, err = reconciler.provider.Create(ctx, runtimeprovider.CreateRequest{
			Identity: claim.Identity, Resources: claim.Resources,
		})
		if err != nil {
			return &providerReconcileFailure{code: "provider_create"}
		}
	}
	if err := validateManagedObservation(claim.Identity, observation); err != nil {
		return &providerReconcileFailure{code: "provider_identity_mismatch", permanent: true}
	}
	if observation.Resources != claim.Resources {
		return &providerReconcileFailure{code: "provider_resources_mismatch", permanent: true}
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
	if verified.Resources != claim.Resources {
		return runtimeprovider.RuntimeObservation{}, &providerReconcileFailure{
			code: "provider_resources_mismatch", permanent: true,
		}
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
	err := reconciler.store.DeferRuntimeOperation(
		operationCtx,
		claim,
		errorCode,
		claim.UpdatedAt.Add(reconciler.retryDelay),
		terminal,
	)
	if err == nil {
		state := RuntimeProgressRetrying
		if terminal {
			state = RuntimeProgressFailed
		}
		reconciler.observeRuntimeAudit(claim.RuntimeOperation, RuntimeProgressEnsureRuntime, state, errorCode, !terminal)
	}
	return err
}

func (reconciler *Reconciler) failOperation(
	ctx context.Context,
	claim ClaimedRuntimeOperation,
	errorCode string,
) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	err := reconciler.store.DeferRuntimeOperation(ctx, claim, errorCode, claim.UpdatedAt, true)
	if err == nil {
		reconciler.observeRuntimeAudit(
			claim.RuntimeOperation,
			RuntimeProgressEnsureRuntime,
			RuntimeProgressFailed,
			errorCode,
			false,
		)
	}
	return err
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
	if err == nil {
		reconciler.observeRuntimeAudit(
			claim.RuntimeOperation,
			RuntimeProgressDeleteRuntime,
			RuntimeProgressDeleted,
			"",
			false,
		)
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
	err := reconciler.store.DeferRuntimeDeletionOperation(
		operationCtx,
		claim,
		errorCode,
		claim.UpdatedAt.Add(reconciler.retryDelay),
		terminal,
	)
	if err == nil {
		state := RuntimeProgressRetrying
		if terminal {
			state = RuntimeProgressFailed
		}
		reconciler.observeRuntimeAudit(claim.RuntimeOperation, RuntimeProgressDeleteRuntime, state, errorCode, !terminal)
	}
	return err
}

func (reconciler *Reconciler) failDeletion(
	ctx context.Context,
	claim ClaimedRuntimeDeletionOperation,
	errorCode string,
) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	err := reconciler.store.DeferRuntimeDeletionOperation(
		ctx,
		claim,
		errorCode,
		claim.UpdatedAt,
		true,
	)
	if err == nil {
		reconciler.observeRuntimeAudit(
			claim.RuntimeOperation,
			RuntimeProgressDeleteRuntime,
			RuntimeProgressFailed,
			errorCode,
			false,
		)
	}
	return err
}

func (reconciler *Reconciler) observeRuntimeAudit(
	operation RuntimeOperation,
	kind RuntimeProgressKind,
	state RuntimeProgressState,
	errorCode string,
	retryable bool,
) {
	completedAt := reconciler.store.clock().UTC()
	reconciler.observer.ObserveRuntimeAudit(RuntimeAuditObservation{
		AttemptCount:      operation.AttemptCount,
		AttemptDuration:   completedAt.Sub(operation.UpdatedAt),
		CompletedAt:       completedAt,
		ErrorCode:         errorCode,
		Kind:              kind,
		OperationDuration: completedAt.Sub(operation.CreatedAt),
		Retryable:         retryable,
		StartedAt:         operation.UpdatedAt,
		State:             state,
	})
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
	next, found, err := reconciler.nextWorkAt(ctx)
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
	delay := next.Sub(reconciler.store.clock().UTC())
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

func (reconciler *Reconciler) nextWorkAt(ctx context.Context) (time.Time, bool, error) {
	nextOperation, operationFound, err := reconciler.store.NextRuntimeOperationAt(ctx)
	if err != nil {
		return time.Time{}, false, err
	}
	accounting, accountingFound, err := reconciler.store.NextAccountingWindow(
		ctx,
		reconciler.accountingWindow,
	)
	if err != nil {
		return time.Time{}, false, err
	}
	if accountingFound &&
		(!operationFound || accounting.WindowEnd.Before(nextOperation)) {
		return accounting.WindowEnd, true, nil
	}
	return nextOperation, operationFound, nil
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
