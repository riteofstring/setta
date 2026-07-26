package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"setta/internal/controlplane"
	"setta/internal/hostedmeasurement"
	"setta/internal/hostedruntime"
	"setta/internal/runtimeinstall"
	"setta/internal/runtimepair"
	"setta/internal/runtimeprovider"
)

const (
	developerHostedMinimumFreeMiB = 1_024
	developerHostedSafetyReserve  = int64(100_000)
	hostedHealthAttempts          = 60
	hostedHealthInterval          = 2 * time.Second
)

var developerHostedRuntimeResources = runtimeprovider.RuntimeResources{
	CPUCoreMillionths: 1_000_000,
	MemoryBytes:       512_000_000,
	StorageBytes:      10_000_000_000,
}

type developerHostedRuntimeServices struct {
	coordinator *controlplane.DeveloperHostedRuntimeCoordinator
	preparer    controlplane.RuntimeProvisioningPreparer
}

type developerHostedRuntimeProvider interface {
	runtimeprovider.Provider
	runtimeprovider.PrivateAccessDialer
}

type developerHostedRuntimePreparer struct {
	bootstrapBaseURL string
	environmentID    string
	preparer         hostedruntime.Preparer
	secrets          controlplane.MutableSecretStore
	sessionDuration  time.Duration
	store            *controlplane.Store
	userID           string
}

func configureDeveloperHostedRuntime(
	ctx context.Context,
	config commandConfig,
	store *controlplane.Store,
	secrets controlplane.MutableSecretStore,
	provider developerHostedRuntimeProvider,
) (developerHostedRuntimeServices, error) {
	if !config.DeveloperHostedRuntime {
		return developerHostedRuntimeServices{}, nil
	}
	release, err := hostedmeasurement.LoadRuntimeReleaseManifest(
		config.DeveloperHostedReleaseManifest,
	)
	if err != nil {
		return developerHostedRuntimeServices{}, fmt.Errorf(
			"load developer hosted runtime release: %w",
			err,
		)
	}
	verifier := runtimeinstall.MinisignVerifier{Command: config.DeveloperHostedMinisign}
	if err := runtimeinstall.VerifyReleaseArtifact(ctx, release.Artifact, verifier); err != nil {
		return developerHostedRuntimeServices{}, fmt.Errorf(
			"verify developer hosted runtime release: %w",
			err,
		)
	}
	identity, err := runtimeprovider.NewManagedIdentity(
		"developer-hosted:" + config.DeveloperHostedEnvironmentID,
	)
	if err != nil {
		return developerHostedRuntimeServices{}, err
	}
	cutoffExposureUSDMicros, err := controlplane.CalculateHardBudgetCutoffExposureUSDMicros(
		controlPlanePriceSchedule(),
		identity.Name,
		developerHostedRuntimeResources,
		time.Minute,
	)
	if err != nil {
		return developerHostedRuntimeServices{}, err
	}
	coordinator, err := controlplane.NewDeveloperHostedRuntimeCoordinator(
		controlplane.DeveloperHostedRuntimeCoordinatorConfig{
			AutomaticDeletionWhileOffline: config.DeveloperHostedIndependentController,
			BudgetUSDMicros:               controlplane.DefaultDeveloperHostedRuntimeBudgetUSDMicros,
			CutoffExposureUSDMicros:       cutoffExposureUSDMicros,
			EnvironmentID:                 config.DeveloperHostedEnvironmentID,
			GatewayBaseURL:                config.DeveloperHostedGatewayBaseURL,
			MaximumCutoffLag:              time.Minute,
			Release:                       release.Artifact.Version,
			Resources:                     developerHostedRuntimeResources,
			SafetyReserveUSDMicros:        developerHostedSafetyReserve,
			Secrets:                       secrets,
			SessionDuration:               controlplane.DefaultDeveloperHostedRuntimeSessionDuration,
			Store:                         store,
			UserID:                        config.DeveloperHostedUserID,
		},
	)
	if err != nil {
		return developerHostedRuntimeServices{}, err
	}
	layout := runtimeinstall.DefaultLayout()
	preparer := &developerHostedRuntimePreparer{
		bootstrapBaseURL: config.DeveloperHostedGatewayBaseURL,
		environmentID:    config.DeveloperHostedEnvironmentID,
		preparer: hostedruntime.Preparer{
			HealthAttempts: hostedHealthAttempts,
			HealthInterval: hostedHealthInterval,
			Installer: runtimeinstall.Loop{
				Provider:           provider,
				Verifier:           verifier,
				RemoteVerifierPath: release.RemoteVerifierPath,
			},
			Layout:   layout,
			Pairer:   runtimepair.Pairer{Provider: provider},
			Provider: provider,
			Release: hostedruntime.ReleaseInputs{
				Artifact:           release.Artifact,
				LocalVerifierPath:  release.LocalVerifierPath,
				RemoteVerifierPath: release.RemoteVerifierPath,
				VerifierSHA256:     release.VerifierSHA256,
			},
			Verifier: runtimeinstall.VerifierInstaller{Executor: provider},
		},
		secrets:         secrets,
		sessionDuration: controlplane.DefaultDeveloperHostedRuntimeSessionDuration,
		store:           store,
		userID:          config.DeveloperHostedUserID,
	}
	return developerHostedRuntimeServices{coordinator: coordinator, preparer: preparer}, nil
}

func (preparer *developerHostedRuntimePreparer) Prepare(
	ctx context.Context,
	preparation controlplane.RuntimeProvisioningPreparation,
) error {
	ready, err := preparer.activationReady(ctx)
	if err != nil {
		return err
	}
	if ready {
		return nil
	}
	result, err := preparer.prepareRuntime(ctx, preparation)
	if err != nil {
		return err
	}
	return preparer.activateRuntime(ctx, preparation, result)
}

func (preparer *developerHostedRuntimePreparer) activationReady(
	ctx context.Context,
) (bool, error) {
	state, err := preparer.store.DeveloperHostedRuntimeState(ctx, preparer.environmentID)
	if err == nil && state.BootstrapSecretRef != "" && state.RuntimeRegistryID != "" {
		return true, nil
	}
	if err != nil && !errors.Is(err, controlplane.ErrNotFound) {
		return false, &controlplane.RuntimePreparationError{Code: "runtime_state_read"}
	}
	if errors.Is(err, controlplane.ErrNotFound) {
		return false, &controlplane.RuntimePreparationError{Code: "runtime_state_not_ready"}
	}
	return false, nil
}

func (preparer *developerHostedRuntimePreparer) prepareRuntime(
	ctx context.Context,
	preparation controlplane.RuntimeProvisioningPreparation,
) (hostedruntime.Result, error) {
	phase := hostedruntime.PhaseInstalling
	result, err := preparer.preparer.Prepare(ctx, hostedruntime.Request{
		ClientDisplayName: "Setta developer hosted controller",
		MinimumFreeMiB:    developerHostedMinimumFreeMiB,
		RuntimeName:       preparation.Claim.RuntimeName,
		ReportProgress: func(next hostedruntime.Phase) error {
			phase = next
			if next == hostedruntime.PhasePairing {
				return preparation.ReportProgress(controlplane.RuntimeProgressPairing)
			}
			return nil
		},
	})
	if err != nil {
		return hostedruntime.Result{}, classifyDeveloperHostedPreparationError(phase, err)
	}
	return result, nil
}

func (preparer *developerHostedRuntimePreparer) activateRuntime(
	ctx context.Context,
	preparation controlplane.RuntimeProvisioningPreparation,
	result hostedruntime.Result,
) error {
	runtimeRecord, err := preparer.store.Runtime(ctx, preparation.Claim.RuntimeName)
	if err != nil {
		return &controlplane.RuntimePreparationError{Code: "runtime_state_read"}
	}
	if err := preparer.secrets.WriteSecret(
		ctx,
		runtimeRecord.CredentialSecretRef,
		[]byte(result.Pairing.DeviceToken),
	); err != nil {
		return &controlplane.RuntimePreparationError{Code: "runtime_credential_store"}
	}
	if _, err := preparer.store.AssignRuntime(ctx, controlplane.AssignRuntimeRequest{
		IdempotencyKey:      activationOperationID(preparation.Claim.IdempotencyKey),
		UserID:              preparation.Claim.UserID,
		RuntimeName:         preparation.Claim.RuntimeName,
		Lifecycle:           controlplane.RuntimeLifecycleReady,
		AccessState:         controlplane.RuntimeAccessEnabled,
		HealthState:         controlplane.RuntimeHealthHealthy,
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: runtimeRecord.CredentialSecretRef,
		DesiredRelease:      result.Install.Installed.Version,
		ObservedRelease:     result.Install.Installed.Version,
		Resources:           preparation.Claim.Resources,
	}); err != nil {
		return &controlplane.RuntimePreparationError{Code: "runtime_activation"}
	}
	deviceCredential, err := controlplane.NewDeviceCredential()
	if err != nil {
		return &controlplane.RuntimePreparationError{Code: "desktop_credential_create"}
	}
	created, err := preparer.store.EnsureDeviceGrant(ctx, controlplane.EnsureDeviceGrantRequest{
		Credential:  deviceCredential,
		UserID:      preparation.Claim.UserID,
		RuntimeName: preparation.Claim.RuntimeName,
		DisplayName: "Setta Desktop hosted runtime",
		GrantTTL:    preparer.sessionDuration,
	})
	if err != nil {
		return &controlplane.RuntimePreparationError{Code: "desktop_credential_grant"}
	}
	return preparer.storeDesktopBootstrap(
		ctx,
		result,
		created,
		deviceCredential,
	)
}

func (preparer *developerHostedRuntimePreparer) storeDesktopBootstrap(
	ctx context.Context,
	result hostedruntime.Result,
	created controlplane.CreatedDeviceGrant,
	deviceCredential controlplane.DeviceCredential,
) error {
	bootstrap := controlplane.DeveloperHostedRuntimeBootstrap{
		BaseURL:         preparer.bootstrapBaseURL,
		DeviceID:        created.Device.ID,
		DeviceSecret:    deviceCredential.Token,
		ExpiresAt:       created.Grant.ExpiresAt.UTC().Format(time.RFC3339Nano),
		ProtocolVersion: result.Pairing.ProtocolVersion,
		RuntimeID:       result.Pairing.RuntimeID,
		Token:           created.Token,
		UserID:          preparer.userID,
	}
	encoded, err := json.Marshal(bootstrap)
	if err != nil {
		return &controlplane.RuntimePreparationError{Code: "desktop_bootstrap_encode"}
	}
	const bootstrapSecretRef = "developer-hosted-runtime-bootstrap"
	if err := preparer.secrets.WriteSecret(ctx, bootstrapSecretRef, encoded); err != nil {
		return &controlplane.RuntimePreparationError{Code: "desktop_bootstrap_store"}
	}
	if err := preparer.store.RecordDeveloperHostedRuntimeActivation(
		ctx,
		preparer.environmentID,
		result.Pairing.RuntimeID,
		bootstrapSecretRef,
		deviceCredential.DeviceID,
		deviceCredential.Token,
	); err != nil {
		return &controlplane.RuntimePreparationError{Code: "runtime_activation_record"}
	}
	return nil
}

func classifyDeveloperHostedPreparationError(
	phase hostedruntime.Phase,
	err error,
) error {
	switch {
	case errors.Is(err, runtimeinstall.ErrSignatureRejected):
		return &controlplane.RuntimePreparationError{
			Code: "release_verification_failed", Permanent: true,
		}
	case errors.Is(err, runtimeinstall.ErrHealthCheckFailed):
		return &controlplane.RuntimePreparationError{Code: "runtime_health_failed"}
	case phase == hostedruntime.PhasePairing:
		return &controlplane.RuntimePreparationError{Code: "runtime_pairing_failed"}
	default:
		return &controlplane.RuntimePreparationError{Code: "runtime_install_failed"}
	}
}

func activationOperationID(ensureOperationID string) string {
	digest := sha256.Sum256([]byte(ensureOperationID))
	return "developer-activate-" + hex.EncodeToString(digest[:16])
}
