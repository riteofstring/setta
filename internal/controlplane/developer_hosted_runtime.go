package controlplane

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"time"

	"setta/internal/runtimeprovider"
)

const (
	DefaultDeveloperHostedRuntimeSessionDuration = 30 * time.Minute
	DefaultDeveloperHostedRuntimeBudgetUSDMicros = int64(1_000_000)
	MaximumDeveloperHostedRuntimeBudgetUSDMicros = int64(5_000_000)
)

type DeveloperHostedRuntimeBootstrap struct {
	BaseURL         string `json:"baseUrl"`
	DeviceID        string `json:"deviceId"`
	DeviceSecret    string `json:"deviceSecret"`
	ExpiresAt       string `json:"expiresAt"`
	ProtocolVersion int    `json:"protocolVersion"`
	RuntimeID       string `json:"runtimeId"`
	Token           string `json:"token"`
	UserID          string `json:"userId"`
}

type DeveloperHostedRuntimeCredential struct {
	DeviceID  string `json:"deviceId"`
	ExpiresAt string `json:"expiresAt"`
	RuntimeID string `json:"runtimeId"`
	Token     string `json:"token"`
}

type DeveloperHostedRuntimeState struct {
	EnvironmentID      string
	RuntimeName        string
	EnsureOperationID  string
	DestroyOperationID string
	RuntimeRegistryID  string
	BootstrapSecretRef string
	LastConnectedAt    *time.Time
	UpdatedAt          time.Time
}

type DeveloperHostedRuntimeCoordinatorConfig struct {
	AutomaticDeletionWhileOffline bool
	BudgetUSDMicros               int64
	CutoffExposureUSDMicros       int64
	EnvironmentID                 string
	GatewayBaseURL                string
	MaximumCutoffLag              time.Duration
	Release                       string
	Resources                     runtimeprovider.RuntimeResources
	SafetyReserveUSDMicros        int64
	Secrets                       MutableSecretStore
	SessionDuration               time.Duration
	Store                         *Store
	UserID                        string
}

type DeveloperHostedRuntimeCoordinator struct {
	automaticDeletionWhileOffline bool
	budgetUSDMicros               int64
	cutoffExposureUSDMicros       int64
	environmentID                 string
	gatewayBaseURL                string
	maximumCutoffLag              time.Duration
	release                       string
	resources                     runtimeprovider.RuntimeResources
	runtimeName                   string
	safetyReserveUSDMicros        int64
	secrets                       MutableSecretStore
	sessionDuration               time.Duration
	store                         *Store
	userID                        string
}

func NewDeveloperHostedRuntimeCoordinator(
	config DeveloperHostedRuntimeCoordinatorConfig,
) (*DeveloperHostedRuntimeCoordinator, error) {
	config = defaultDeveloperHostedRuntimeConfig(config)
	parsedGateway, err := validateDeveloperHostedRuntimeConfig(config)
	if err != nil {
		return nil, err
	}
	identity, err := runtimeprovider.NewManagedIdentity("developer-hosted:" + config.EnvironmentID)
	if err != nil {
		return nil, err
	}
	return &DeveloperHostedRuntimeCoordinator{
		automaticDeletionWhileOffline: config.AutomaticDeletionWhileOffline,
		budgetUSDMicros:               config.BudgetUSDMicros,
		cutoffExposureUSDMicros:       config.CutoffExposureUSDMicros,
		environmentID:                 config.EnvironmentID,
		gatewayBaseURL:                parsedGateway.String(),
		maximumCutoffLag:              config.MaximumCutoffLag,
		release:                       config.Release,
		resources:                     config.Resources,
		runtimeName:                   identity.Name,
		safetyReserveUSDMicros:        config.SafetyReserveUSDMicros,
		secrets:                       config.Secrets,
		sessionDuration:               config.SessionDuration,
		store:                         config.Store,
		userID:                        config.UserID,
	}, nil
}

func defaultDeveloperHostedRuntimeConfig(
	config DeveloperHostedRuntimeCoordinatorConfig,
) DeveloperHostedRuntimeCoordinatorConfig {
	if config.SessionDuration == 0 {
		config.SessionDuration = DefaultDeveloperHostedRuntimeSessionDuration
	}
	if config.BudgetUSDMicros == 0 {
		config.BudgetUSDMicros = DefaultDeveloperHostedRuntimeBudgetUSDMicros
	}
	if config.MaximumCutoffLag == 0 {
		config.MaximumCutoffLag = time.Minute
	}
	return config
}

func validateDeveloperHostedRuntimeConfig(
	config DeveloperHostedRuntimeCoordinatorConfig,
) (*url.URL, error) {
	if config.Store == nil || config.Secrets == nil {
		return nil, errors.New("developer hosted runtime requires a store and secret store")
	}
	if err := validateIdentifier("developer hosted environment id", config.EnvironmentID); err != nil {
		return nil, err
	}
	if err := validateIdentifier("developer hosted user id", config.UserID); err != nil {
		return nil, err
	}
	parsedGateway, err := validateDeveloperHostedGateway(config.GatewayBaseURL)
	if err != nil {
		return nil, err
	}
	if config.Release == "" {
		return nil, errors.New("developer hosted runtime release is required")
	}
	if err := config.Resources.ValidateProvisioningRequest(); err != nil {
		return nil, err
	}
	return parsedGateway, validateDeveloperHostedRuntimePolicy(config)
}

func validateDeveloperHostedGateway(value string) (*url.URL, error) {
	parsed, err := url.Parse(value)
	if err != nil || !parsed.IsAbs() || parsed.Host == "" {
		return nil, errors.New("developer hosted runtime gateway base URL is invalid")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("developer hosted runtime gateway base URL is invalid")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("developer hosted runtime gateway base URL is invalid")
	}
	return parsed, nil
}

func validateDeveloperHostedRuntimePolicy(config DeveloperHostedRuntimeCoordinatorConfig) error {
	invalidDuration := config.SessionDuration <= 0 || config.MaximumCutoffLag <= 0
	invalidBudget := config.BudgetUSDMicros <= 0 ||
		config.BudgetUSDMicros > MaximumDeveloperHostedRuntimeBudgetUSDMicros
	invalidReserve := config.SafetyReserveUSDMicros < 0 ||
		config.CutoffExposureUSDMicros < 0 ||
		config.SafetyReserveUSDMicros+config.CutoffExposureUSDMicros >= config.BudgetUSDMicros
	if invalidDuration || invalidBudget || invalidReserve {
		return errors.New("developer hosted runtime budget and session policy is invalid")
	}
	return nil
}

func (coordinator *DeveloperHostedRuntimeCoordinator) Ensure(
	ctx context.Context,
	request EnsureDeveloperHostedRuntimeRequest,
) (DeveloperHostedRuntimeStatus, error) {
	if err := validateIdentifier("developer hosted ensure operation id", request.OperationID); err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	status, replayed, err := coordinator.replayEnsure(ctx, request.OperationID)
	if err != nil || replayed {
		return status, err
	}
	if err := coordinator.startEnsure(ctx, request.OperationID); err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	return coordinator.Status(ctx)
}

func (coordinator *DeveloperHostedRuntimeCoordinator) replayEnsure(
	ctx context.Context,
	operationID string,
) (DeveloperHostedRuntimeStatus, bool, error) {
	existing, err := coordinator.store.DeveloperHostedRuntimeState(ctx, coordinator.environmentID)
	if errors.Is(err, ErrNotFound) {
		return DeveloperHostedRuntimeStatus{}, false, nil
	}
	if err != nil {
		return DeveloperHostedRuntimeStatus{}, false, err
	}
	status, err := coordinator.statusForState(ctx, existing)
	if err != nil || status.Phase == DeveloperHostedRuntimeRemoved {
		return DeveloperHostedRuntimeStatus{}, false, err
	}
	if existing.EnsureOperationID != operationID {
		return DeveloperHostedRuntimeStatus{}, true, ErrIdempotencyConflict
	}
	return status, true, nil
}

func (coordinator *DeveloperHostedRuntimeCoordinator) startEnsure(
	ctx context.Context,
	operationID string,
) error {
	now := coordinator.store.clock().UTC()
	if _, err := coordinator.store.UpsertUser(ctx, coordinator.userID); err != nil {
		return err
	}
	if err := coordinator.ensureBudget(ctx, now); err != nil {
		return err
	}
	if _, err := coordinator.store.EnsureRuntimeIntent(ctx, EnsureRuntimeRequest{
		IdempotencyKey:      operationID,
		UserID:              coordinator.userID,
		RuntimeName:         coordinator.runtimeName,
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: coordinator.innerCredentialSecretRef(),
		DesiredRelease:      coordinator.release,
		Resources:           coordinator.resources,
	}); err != nil {
		return err
	}
	deletionOperationID := automaticDeletionOperationID(operationID)
	if _, err := coordinator.store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: deletionOperationID,
		RuntimeName:    coordinator.runtimeName,
		ScheduledAt:    now.Add(coordinator.sessionDuration),
	}); err != nil {
		return err
	}
	return coordinator.store.RecordDeveloperHostedRuntimeEnsure(
		ctx,
		DeveloperHostedRuntimeState{
			EnvironmentID:     coordinator.environmentID,
			RuntimeName:       coordinator.runtimeName,
			EnsureOperationID: operationID,
		},
	)
}

func (coordinator *DeveloperHostedRuntimeCoordinator) Destroy(
	ctx context.Context,
	request DestroyDeveloperHostedRuntimeRequest,
) (DeveloperHostedRuntimeStatus, error) {
	if err := validateIdentifier("developer hosted destroy operation id", request.OperationID); err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	state, err := coordinator.store.DeveloperHostedRuntimeState(ctx, coordinator.environmentID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return coordinator.removedStatus(request.OperationID), nil
		}
		return DeveloperHostedRuntimeStatus{}, err
	}
	status, done, err := coordinator.replayDestroy(ctx, state, request.OperationID)
	if done || err != nil {
		return status, err
	}
	operationID, err := coordinator.prepareDestroyOperation(ctx, state, request.OperationID)
	if err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	if err := coordinator.store.RecordDeveloperHostedRuntimeDestroy(
		ctx,
		coordinator.environmentID,
		operationID,
	); err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	return coordinator.Status(ctx)
}

func (coordinator *DeveloperHostedRuntimeCoordinator) replayDestroy(
	ctx context.Context,
	state DeveloperHostedRuntimeState,
	operationID string,
) (DeveloperHostedRuntimeStatus, bool, error) {
	status, err := coordinator.statusForState(ctx, state)
	if err == nil && status.Phase == DeveloperHostedRuntimeRemoved {
		return status, true, nil
	}
	if state.DestroyOperationID == "" {
		return status, false, err
	}
	if state.DestroyOperationID != operationID {
		return DeveloperHostedRuntimeStatus{}, true, ErrIdempotencyConflict
	}
	return status, true, err
}

func (coordinator *DeveloperHostedRuntimeCoordinator) prepareDestroyOperation(
	ctx context.Context,
	state DeveloperHostedRuntimeState,
	requestedOperationID string,
) (string, error) {
	active, activeErr := coordinator.store.ActiveRuntimeDeletionOperation(ctx, state.RuntimeName)
	if activeErr == nil && active.Status == RuntimeOperationRunning {
		return active.IdempotencyKey, nil
	}
	if activeErr == nil {
		if _, err := coordinator.store.CancelRuntimeDeletion(
			ctx,
			state.RuntimeName,
			RuntimeAccessEnabled,
		); err != nil {
			return "", err
		}
	}
	if activeErr != nil && !errors.Is(activeErr, ErrNotFound) {
		return "", activeErr
	}
	_, err := coordinator.store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: requestedOperationID,
		RuntimeName:    state.RuntimeName,
		ScheduledAt:    coordinator.store.clock().UTC().Add(time.Millisecond),
	})
	if err != nil {
		return "", err
	}
	return requestedOperationID, nil
}

func (coordinator *DeveloperHostedRuntimeCoordinator) Status(
	ctx context.Context,
) (DeveloperHostedRuntimeStatus, error) {
	state, err := coordinator.store.DeveloperHostedRuntimeState(ctx, coordinator.environmentID)
	if err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	return coordinator.statusForState(ctx, state)
}

func (coordinator *DeveloperHostedRuntimeCoordinator) StatusAfter(
	ctx context.Context,
	operationID string,
	cursor string,
) ([]DeveloperHostedRuntimeStatus, <-chan struct{}, error) {
	events, update, err := coordinator.store.RuntimeProgressAfter(ctx, operationID, cursor)
	if err != nil {
		return nil, nil, err
	}
	state, err := coordinator.store.DeveloperHostedRuntimeState(ctx, coordinator.environmentID)
	if err != nil {
		return nil, nil, err
	}
	statuses := make([]DeveloperHostedRuntimeStatus, 0, len(events))
	for _, event := range events {
		status, statusErr := coordinator.statusFromProgress(ctx, state, event)
		if statusErr != nil {
			return nil, nil, statusErr
		}
		statuses = append(statuses, status)
	}
	return statuses, update, nil
}

func (coordinator *DeveloperHostedRuntimeCoordinator) Bootstrap(
	ctx context.Context,
) (DeveloperHostedRuntimeBootstrap, error) {
	state, err := coordinator.store.DeveloperHostedRuntimeState(ctx, coordinator.environmentID)
	if err != nil {
		return DeveloperHostedRuntimeBootstrap{}, err
	}
	if state.BootstrapSecretRef == "" {
		return DeveloperHostedRuntimeBootstrap{}, ErrNotFound
	}
	payload, err := coordinator.secrets.ReadSecret(ctx, state.BootstrapSecretRef)
	if err != nil {
		return DeveloperHostedRuntimeBootstrap{}, err
	}
	var bootstrap DeveloperHostedRuntimeBootstrap
	if err := json.Unmarshal(payload, &bootstrap); err != nil {
		return DeveloperHostedRuntimeBootstrap{}, errors.New(
			"developer hosted runtime bootstrap is invalid",
		)
	}
	if err := coordinator.validateBootstrap(bootstrap); err != nil {
		return DeveloperHostedRuntimeBootstrap{}, errors.New(
			"developer hosted runtime bootstrap differs from controller policy",
		)
	}
	token, expiresAt, err := coordinator.store.RotateDeveloperHostedRuntimeCredential(
		ctx,
		coordinator.environmentID,
		bootstrap.DeviceID,
		bootstrap.DeviceSecret,
		bootstrap.RuntimeID,
	)
	if err != nil {
		return DeveloperHostedRuntimeBootstrap{}, err
	}
	bootstrap.Token = token
	bootstrap.ExpiresAt = timestamp(expiresAt)
	return bootstrap, nil
}

func (coordinator *DeveloperHostedRuntimeCoordinator) validateBootstrap(
	bootstrap DeveloperHostedRuntimeBootstrap,
) error {
	missingIdentity := bootstrap.RuntimeID == "" || bootstrap.DeviceID == ""
	missingCredential := bootstrap.DeviceSecret == "" || bootstrap.Token == ""
	wrongPolicy := bootstrap.BaseURL != coordinator.gatewayBaseURL ||
		bootstrap.UserID != coordinator.userID ||
		bootstrap.ProtocolVersion <= 0
	if missingIdentity || missingCredential || wrongPolicy {
		return errors.New("developer hosted runtime bootstrap differs from controller policy")
	}
	return nil
}

func (coordinator *DeveloperHostedRuntimeCoordinator) ConfirmConnected(
	ctx context.Context,
	runtimeRegistryID string,
) (DeveloperHostedRuntimeStatus, error) {
	if err := validateIdentifier("developer hosted runtime registry id", runtimeRegistryID); err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	state, err := coordinator.store.DeveloperHostedRuntimeState(ctx, coordinator.environmentID)
	if err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	if state.RuntimeRegistryID != runtimeRegistryID {
		return DeveloperHostedRuntimeStatus{}, errors.New(
			"connected runtime registry id does not match the prepared runtime",
		)
	}
	if err := coordinator.store.ConfirmDeveloperHostedRuntimeConnected(
		ctx,
		state.EnsureOperationID,
		coordinator.environmentID,
		runtimeRegistryID,
	); err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	return coordinator.Status(ctx)
}

func (coordinator *DeveloperHostedRuntimeCoordinator) RotateCredential(
	ctx context.Context,
	deviceID string,
	deviceSecret string,
	runtimeRegistryID string,
) (DeveloperHostedRuntimeCredential, error) {
	if err := validateIdentifier("developer hosted device id", deviceID); err != nil {
		return DeveloperHostedRuntimeCredential{}, err
	}
	if deviceSecret == "" {
		return DeveloperHostedRuntimeCredential{}, errors.New(
			"developer hosted device secret is required",
		)
	}
	if err := validateIdentifier(
		"developer hosted runtime registry id",
		runtimeRegistryID,
	); err != nil {
		return DeveloperHostedRuntimeCredential{}, err
	}
	token, expiresAt, err := coordinator.store.RotateDeveloperHostedRuntimeCredential(
		ctx,
		coordinator.environmentID,
		deviceID,
		deviceSecret,
		runtimeRegistryID,
	)
	if err != nil {
		return DeveloperHostedRuntimeCredential{}, err
	}
	return DeveloperHostedRuntimeCredential{
		DeviceID:  deviceID,
		ExpiresAt: timestamp(expiresAt),
		RuntimeID: runtimeRegistryID,
		Token:     token,
	}, nil
}

func (coordinator *DeveloperHostedRuntimeCoordinator) FinalizeRemoval(ctx context.Context) error {
	state, err := coordinator.store.DeveloperHostedRuntimeState(ctx, coordinator.environmentID)
	if err != nil {
		return err
	}
	status, err := coordinator.statusForState(ctx, state)
	if err != nil {
		return err
	}
	if status.Phase != DeveloperHostedRuntimeRemoved {
		return errors.New("developer hosted runtime removal is not verified")
	}
	for _, reference := range []string{state.BootstrapSecretRef, coordinator.innerCredentialSecretRef()} {
		if reference == "" {
			continue
		}
		if err := coordinator.secrets.DeleteSecret(ctx, reference); err != nil &&
			!errors.Is(err, ErrNotFound) {
			return err
		}
	}
	return coordinator.store.ClearDeveloperHostedRuntimeBootstrap(
		ctx,
		coordinator.environmentID,
	)
}

func (coordinator *DeveloperHostedRuntimeCoordinator) ensureBudget(
	ctx context.Context,
	now time.Time,
) error {
	existing, err := coordinator.store.UserBudgetPolicy(ctx, coordinator.userID)
	if err == nil && now.Before(existing.PeriodEnd) {
		return nil
	}
	if err != nil && !errors.Is(err, ErrNotFound) {
		return err
	}
	_, err = coordinator.store.SetUserBudgetPolicy(ctx, SetUserBudgetPolicyRequest{
		UserID:                  coordinator.userID,
		PeriodStart:             now,
		PeriodEnd:               now.Add(coordinator.sessionDuration),
		CoveredLimitUSDMicros:   coordinator.budgetUSDMicros,
		SafetyReserveUSDMicros:  coordinator.safetyReserveUSDMicros,
		CutoffExposureUSDMicros: coordinator.cutoffExposureUSDMicros,
		MaximumCutoffLag:        coordinator.maximumCutoffLag,
	})
	return err
}

func (coordinator *DeveloperHostedRuntimeCoordinator) statusForState(
	ctx context.Context,
	state DeveloperHostedRuntimeState,
) (DeveloperHostedRuntimeStatus, error) {
	operationID := state.EnsureOperationID
	if state.DestroyOperationID != "" {
		operationID = state.DestroyOperationID
	} else {
		automaticOperationID := automaticDeletionOperationID(state.EnsureOperationID)
		deletion, deletionErr := coordinator.store.RuntimeDeletionOperation(
			ctx,
			automaticOperationID,
		)
		if deletionErr == nil &&
			deletion.Status != RuntimeOperationCanceled &&
			(deletion.Status != RuntimeOperationPending ||
				!coordinator.store.clock().UTC().Before(deletion.NextAttemptAt)) {
			operationID = automaticOperationID
		} else if deletionErr != nil && !errors.Is(deletionErr, ErrNotFound) {
			return DeveloperHostedRuntimeStatus{}, deletionErr
		}
	}
	events, _, err := coordinator.store.RuntimeProgressAfter(ctx, operationID, "")
	if err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	if len(events) == 0 {
		return DeveloperHostedRuntimeStatus{}, ErrNotFound
	}
	return coordinator.statusFromProgress(ctx, state, events[len(events)-1])
}

func (coordinator *DeveloperHostedRuntimeCoordinator) statusFromProgress(
	ctx context.Context,
	state DeveloperHostedRuntimeState,
	event RuntimeProgress,
) (DeveloperHostedRuntimeStatus, error) {
	runtime, err := coordinator.store.Runtime(ctx, state.RuntimeName)
	if err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	policy, err := coordinator.store.UserBudgetPolicy(ctx, coordinator.userID)
	if err != nil {
		return DeveloperHostedRuntimeStatus{}, err
	}
	kind := DeveloperHostedRuntimeEnsure
	if event.Kind == RuntimeProgressDeleteRuntime {
		kind = DeveloperHostedRuntimeDestroy
	}
	phase, reason, terminal := developerHostedProjection(event)
	var registryID *string
	if state.RuntimeRegistryID != "" {
		registryID = &state.RuntimeRegistryID
	}
	var lastConnected *string
	if state.LastConnectedAt != nil {
		value := timestamp(*state.LastConnectedAt)
		lastConnected = &value
	}
	var reportedUsage *int
	reported, reportErr := coordinator.store.HasReportedUsage(ctx, coordinator.userID)
	if reportErr != nil {
		return DeveloperHostedRuntimeStatus{}, reportErr
	}
	if reported {
		value := int(policy.AccruedUSDMicros)
		reportedUsage = &value
	}
	deletionScheduledAt := ""
	if runtime.DeletionScheduledAt != nil {
		deletionScheduledAt = timestamp(*runtime.DeletionScheduledAt)
	}
	occurredAt := event.OccurredAt
	return DeveloperHostedRuntimeStatus{
		OperationID:                   event.OperationID,
		Cursor:                        event.Cursor,
		RuntimeRegistryID:             registryID,
		OperationKind:                 kind,
		Phase:                         phase,
		Retryable:                     event.Retryable,
		ReasonCode:                    reason,
		OccurredAt:                    occurredAt,
		LastConnectedAt:               lastConnected,
		EnforcedBudgetUSDMicros:       int(policy.EnforcedBudgetUSDMicros()),
		ReportedUsageUSDMicros:        reportedUsage,
		DeletionScheduledAt:           deletionScheduledAt,
		AutomaticDeletionWhileOffline: coordinator.automaticDeletionWhileOffline,
		TerminalOutcome:               terminal,
	}, nil
}

func developerHostedProjection(
	event RuntimeProgress,
) (
	DeveloperHostedRuntimePhase,
	*DeveloperHostedRuntimeReasonCode,
	*DeveloperHostedRuntimeTerminalOutcome,
) {
	if phase, reason, terminal, ok := developerHostedTerminalProjection(event); ok {
		return phase, reason, terminal
	}
	phase, ok := developerHostedNonTerminalPhases[event.State]
	if event.State == RuntimeProgressReconciling {
		phase = DeveloperHostedRuntimeProvisioning
		if event.Kind == RuntimeProgressDeleteRuntime {
			phase = DeveloperHostedRuntimeDestroying
		}
		ok = true
	}
	if !ok {
		panic(fmt.Sprintf("unhandled runtime progress state %q", event.State))
	}
	if event.ErrorCode == "" {
		return phase, nil, nil
	}
	reason := developerHostedReason(event.ErrorCode)
	return phase, &reason, nil
}

var developerHostedNonTerminalPhases = map[RuntimeProgressState]DeveloperHostedRuntimePhase{
	RuntimeProgressQueued:            DeveloperHostedRuntimePreparing,
	RuntimeProgressRetrying:          DeveloperHostedRuntimeRetrying,
	RuntimeProgressInstalling:        DeveloperHostedRuntimeInstalling,
	RuntimeProgressPairing:           DeveloperHostedRuntimePairing,
	RuntimeProgressConnecting:        DeveloperHostedRuntimeConnecting,
	RuntimeProgressDeletionScheduled: DeveloperHostedRuntimeDestroying,
	RuntimeProgressProvisioned:       DeveloperHostedRuntimeProvisioning,
	RuntimeProgressWakeRequested:     DeveloperHostedRuntimeNeedsAttention,
	RuntimeProgressHealthy:           DeveloperHostedRuntimeNeedsAttention,
	RuntimeProgressSuspended:         DeveloperHostedRuntimeNeedsAttention,
}

func developerHostedTerminalProjection(
	event RuntimeProgress,
) (
	DeveloperHostedRuntimePhase,
	*DeveloperHostedRuntimeReasonCode,
	*DeveloperHostedRuntimeTerminalOutcome,
	bool,
) {
	switch event.State {
	case RuntimeProgressConnected:
		terminal := DeveloperHostedRuntimeTerminalConnected
		return DeveloperHostedRuntimeConnected, nil, &terminal, true
	case RuntimeProgressDeleted:
		terminal := DeveloperHostedRuntimeTerminalRemoved
		return DeveloperHostedRuntimeRemoved, nil, &terminal, true
	case RuntimeProgressCanceled:
		reason := DeveloperHostedRuntimeReasonProvisioningCanceled
		terminal := DeveloperHostedRuntimeTerminalCanceled
		return DeveloperHostedRuntimeNeedsAttention, &reason, &terminal, true
	case RuntimeProgressFailed:
		reason := developerHostedReason(event.ErrorCode)
		terminal := DeveloperHostedRuntimeTerminalFailed
		return DeveloperHostedRuntimeNeedsAttention, &reason, &terminal, true
	default:
		return "", nil, nil, false
	}
}

func developerHostedReason(errorCode string) DeveloperHostedRuntimeReasonCode {
	switch errorCode {
	case "provider_identity_mismatch":
		return DeveloperHostedRuntimeReasonProviderIdentityMismatch
	case "release_verification", "release_verification_failed":
		return DeveloperHostedRuntimeReasonReleaseVerificationFailed
	case "runtime_health", "runtime_health_failed":
		return DeveloperHostedRuntimeReasonHealthCheckFailed
	case "runtime_pair", "runtime_pairing_failed":
		return DeveloperHostedRuntimeReasonPairingFailed
	case "budget_cutoff":
		return DeveloperHostedRuntimeReasonBudgetCutoff
	case "provider_delete_unconfirmed", "provider_delete_verify":
		return DeveloperHostedRuntimeReasonCleanupPending
	default:
		return DeveloperHostedRuntimeReasonProviderUnavailable
	}
}

func (coordinator *DeveloperHostedRuntimeCoordinator) removedStatus(
	operationID string,
) DeveloperHostedRuntimeStatus {
	outcome := DeveloperHostedRuntimeTerminalRemoved
	return DeveloperHostedRuntimeStatus{
		OperationID:   operationID,
		Cursor:        "1",
		OperationKind: DeveloperHostedRuntimeDestroy,
		Phase:         DeveloperHostedRuntimeRemoved,
		OccurredAt:    timestamp(coordinator.store.clock().UTC()),
		EnforcedBudgetUSDMicros: int(coordinator.budgetUSDMicros -
			coordinator.safetyReserveUSDMicros -
			coordinator.cutoffExposureUSDMicros),
		AutomaticDeletionWhileOffline: coordinator.automaticDeletionWhileOffline,
		TerminalOutcome:               &outcome,
	}
}

func (coordinator *DeveloperHostedRuntimeCoordinator) innerCredentialSecretRef() string {
	return "developer-hosted-runtime-inner"
}

func automaticDeletionOperationID(ensureOperationID string) string {
	digest := sha256.Sum256([]byte(ensureOperationID))
	return fmt.Sprintf("developer-expiry-%x", digest[:16])
}

func (store *Store) RecordDeveloperHostedRuntimeEnsure(
	ctx context.Context,
	state DeveloperHostedRuntimeState,
) error {
	if err := validateIdentifier("developer hosted environment id", state.EnvironmentID); err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	now := timestamp(store.clock().UTC())
	_, err := store.db.ExecContext(ctx, `
INSERT INTO developer_hosted_runtime_state (
  environment_id, runtime_name, ensure_operation_id, updated_at
) VALUES (?, ?, ?, ?)
ON CONFLICT(environment_id) DO UPDATE SET
  runtime_name = excluded.runtime_name,
  ensure_operation_id = excluded.ensure_operation_id,
  destroy_operation_id = NULL,
  runtime_registry_id = NULL,
  bootstrap_secret_ref = NULL,
  desktop_device_id = NULL,
  desktop_refresh_token_hash = NULL,
  last_connected_at = NULL,
  updated_at = excluded.updated_at
`, state.EnvironmentID, state.RuntimeName, state.EnsureOperationID, now)
	if err != nil {
		return fmt.Errorf("record developer hosted runtime ensure: %w", err)
	}
	return nil
}

func (store *Store) RecordDeveloperHostedRuntimeActivation(
	ctx context.Context,
	environmentID string,
	runtimeRegistryID string,
	bootstrapSecretRef string,
	deviceID string,
	deviceSecret string,
) error {
	if err := validateIdentifier("developer hosted desktop device id", deviceID); err != nil {
		return err
	}
	if deviceSecret == "" {
		return errors.New("developer hosted desktop device secret is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
UPDATE developer_hosted_runtime_state
SET runtime_registry_id = ?, bootstrap_secret_ref = ?,
    desktop_device_id = ?, desktop_refresh_token_hash = ?, updated_at = ?
WHERE environment_id = ?
`, runtimeRegistryID, bootstrapSecretRef, deviceID, hashToken(deviceSecret),
		timestamp(store.clock().UTC()), environmentID)
	if err != nil {
		return fmt.Errorf("record developer hosted runtime activation: %w", err)
	}
	return requireOneRow(result, "record developer hosted runtime activation")
}

func (store *Store) RecordDeveloperHostedRuntimeDestroy(
	ctx context.Context,
	environmentID string,
	operationID string,
) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
UPDATE developer_hosted_runtime_state
SET destroy_operation_id = ?, updated_at = ?
WHERE environment_id = ?
`, operationID, timestamp(store.clock().UTC()), environmentID)
	if err != nil {
		return fmt.Errorf("record developer hosted runtime destroy: %w", err)
	}
	return requireOneRow(result, "record developer hosted runtime destroy")
}

func (store *Store) ClearDeveloperHostedRuntimeBootstrap(
	ctx context.Context,
	environmentID string,
) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
UPDATE developer_hosted_runtime_state
SET bootstrap_secret_ref = NULL, desktop_device_id = NULL,
    desktop_refresh_token_hash = NULL, updated_at = ?
WHERE environment_id = ?
`, timestamp(store.clock().UTC()), environmentID)
	if err != nil {
		return fmt.Errorf("clear developer hosted runtime bootstrap: %w", err)
	}
	return requireOneRow(result, "clear developer hosted runtime bootstrap")
}

func (store *Store) DeveloperHostedRuntimeState(
	ctx context.Context,
	environmentID string,
) (DeveloperHostedRuntimeState, error) {
	if err := validateIdentifier("developer hosted environment id", environmentID); err != nil {
		return DeveloperHostedRuntimeState{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	var state DeveloperHostedRuntimeState
	var destroyOperationID sql.NullString
	var runtimeRegistryID sql.NullString
	var bootstrapSecretRef sql.NullString
	var lastConnectedAt sql.NullString
	var updatedAt string
	err := store.db.QueryRowContext(ctx, `
SELECT environment_id, runtime_name, ensure_operation_id, destroy_operation_id,
       runtime_registry_id, bootstrap_secret_ref, last_connected_at, updated_at
FROM developer_hosted_runtime_state
WHERE environment_id = ?
`, environmentID).Scan(
		&state.EnvironmentID,
		&state.RuntimeName,
		&state.EnsureOperationID,
		&destroyOperationID,
		&runtimeRegistryID,
		&bootstrapSecretRef,
		&lastConnectedAt,
		&updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return DeveloperHostedRuntimeState{}, ErrNotFound
	}
	if err != nil {
		return DeveloperHostedRuntimeState{}, fmt.Errorf("read developer hosted runtime state: %w", err)
	}
	state.DestroyOperationID = destroyOperationID.String
	state.RuntimeRegistryID = runtimeRegistryID.String
	state.BootstrapSecretRef = bootstrapSecretRef.String
	state.UpdatedAt, err = parseStoredTime(updatedAt)
	if err != nil {
		return DeveloperHostedRuntimeState{}, err
	}
	state.LastConnectedAt, err = parseOptionalStoredTime(lastConnectedAt)
	if err != nil {
		return DeveloperHostedRuntimeState{}, err
	}
	return state, nil
}

func (store *Store) ActiveRuntimeDeletionOperation(
	ctx context.Context,
	runtimeName string,
) (RuntimeOperation, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	var operationID string
	err := store.db.QueryRowContext(ctx, `
SELECT idempotency_key
FROM runtime_deletion_operations
WHERE runtime_name = ? AND status IN (?, ?, ?)
ORDER BY created_at DESC, idempotency_key DESC
LIMIT 1
`, runtimeName, RuntimeOperationPending, RuntimeOperationRunning,
		RuntimeOperationRetryWait).Scan(&operationID)
	if errors.Is(err, sql.ErrNoRows) {
		return RuntimeOperation{}, ErrNotFound
	}
	if err != nil {
		return RuntimeOperation{}, fmt.Errorf("read active runtime deletion operation: %w", err)
	}
	return readRuntimeDeletionOperation(ctx, store.db, operationID)
}

func (store *Store) HasReportedUsage(ctx context.Context, userID string) (bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	var count int
	if err := store.db.QueryRowContext(ctx, `
SELECT COUNT(*) FROM usage_intervals WHERE user_id = ?
`, userID).Scan(&count); err != nil {
		return false, fmt.Errorf("read developer hosted reported usage: %w", err)
	}
	return count != 0, nil
}
