package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/hostedmeasurement"
	"setta/internal/runtimeprovider"
)

func TestDryRunRendersCompletePlanWithoutCredentialsOrStateMutation(t *testing.T) {
	t.Setenv("SPRITE_TOKEN", "sentinel-secret-value")
	authorizedAt := time.Date(2026, 7, 20, 1, 0, 0, 0, time.UTC)
	directory := filepath.Join(t.TempDir(), "private-run")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := hostedmeasurement.Manifest{
		SchemaVersion:       hostedmeasurement.ManifestSchemaVersion,
		RunID:               "dry-run",
		OwnerAuthorizedAt:   authorizedAt.Format(time.RFC3339),
		StartDeadline:       authorizedAt.Add(30 * time.Minute).Format(time.RFC3339),
		CleanupDeadline:     authorizedAt.Add(2 * time.Hour).Format(time.RFC3339),
		MaximumSpendUSD:     "5.00",
		SpritesOrganization: "setta-100",
		FlyOrganization:     "setta-100",
		FlyRegion:           "yyz",
		FlyAppName:          "setta-gateway-dry-run",
		ResourcePrefix:      "setta-gateway-dry-run",
		SpriteResources:     commandTestSpriteResources(),
		MinimumDiskFreeMiB:  1_024,
		AuthorizedWorkload: []string{
			"hosted-candidate-b-http-sse",
			"controlled-unauthenticated-wake",
			"rotation-revocation-suspension-rate-limit-reconnect-redaction",
		},
		ExcludedWorkload: []string{"websocket", "phase1c"},
		CleanupAuthority: hostedmeasurement.CleanupAuthority,
		BillingObserver:  hostedmeasurement.BillingObserver,
	}
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(directory, "manifest.json")
	if err := os.WriteFile(manifestPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run(
		context.Background(),
		[]string{"dry-run", "--manifest", manifestPath},
		&stdout,
		&stderr,
		func() time.Time { return authorizedAt.Add(time.Minute) },
	)
	if exitCode != 0 {
		t.Fatalf("run exit = %d, stderr = %s", exitCode, stderr.String())
	}
	if strings.Contains(stdout.String(), "sentinel-secret-value") {
		t.Fatalf("dry-run output contains credential material: %s", stdout.String())
	}
	var plan hostedmeasurement.Plan
	if err := json.Unmarshal(stdout.Bytes(), &plan); err != nil {
		t.Fatalf("decode dry-run: %v", err)
	}
	if len(plan.Actions) != 20 || plan.Shape.MachineCount != 1 || plan.Shape.ScheduledSnapshots ||
		plan.MinimumDiskFreeMiB != 1_024 {
		t.Fatalf("dry-run plan = %+v", plan)
	}
	if _, err := os.Stat(filepath.Join(directory, "state.json")); !os.IsNotExist(err) {
		t.Fatalf("dry-run created state: %v", err)
	}
}

func commandTestSpriteResources() runtimeprovider.RuntimeResources {
	return runtimeprovider.RuntimeResources{
		CPUCoreMillionths: 1_000_000,
		MemoryBytes:       512_000_000,
		StorageBytes:      10_000_000_000,
	}
}

func TestCleanupRequiresExistingStateAndWorksAfterAuthorizationExpiry(t *testing.T) {
	authorizedAt := time.Date(2026, 7, 20, 1, 0, 0, 0, time.UTC)
	directory, manifestPath, authorization := writeCommandTestManifest(t, authorizedAt, "expired-cleanup")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run(
		context.Background(),
		[]string{"cleanup", "--manifest", manifestPath},
		&stdout,
		&stderr,
		func() time.Time { return authorizedAt.Add(3 * time.Hour) },
	)
	if exitCode != 1 || !strings.Contains(stderr.String(), "cleanup state does not exist") {
		t.Fatalf("missing state exit = %d, stderr = %q", exitCode, stderr.String())
	}
	if _, err := os.Stat(filepath.Join(directory, "state.json")); !os.IsNotExist(err) {
		t.Fatalf("cleanup initialized missing state: %v", err)
	}
	store, err := hostedmeasurement.OpenStateStore(directory, authorization, authorizedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	stdout.Reset()
	stderr.Reset()
	exitCode = run(
		context.Background(),
		[]string{"cleanup", "--manifest", manifestPath},
		&stdout,
		&stderr,
		func() time.Time { return authorizedAt.Add(3 * time.Hour) },
	)
	if exitCode != 0 {
		t.Fatalf("expired cleanup exit = %d, stderr = %q", exitCode, stderr.String())
	}
	if store.Snapshot().Phase == hostedmeasurement.PhaseClean {
		t.Fatal("original in-memory store unexpectedly observed an external journal update")
	}
	reopened, err := hostedmeasurement.OpenExistingStateStore(directory, authorization)
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Snapshot().Phase != hostedmeasurement.PhaseClean {
		t.Fatalf("cleanup phase = %s", reopened.Snapshot().Phase)
	}
	if !strings.Contains(stdout.String(), `"event":"hosted_measurement_cleanup_complete"`) {
		t.Fatalf("cleanup output = %q", stdout.String())
	}
}

func TestRunCommandRequiresEveryAbsoluteGuardedInput(t *testing.T) {
	var stderr bytes.Buffer
	exitCode := run(
		context.Background(),
		[]string{"run", "--manifest", "/private/manifest.json"},
		&bytes.Buffer{},
		&stderr,
		time.Now,
	)
	if exitCode != 2 || !strings.Contains(stderr.String(), "must be an absolute path") {
		t.Fatalf("incomplete run exit = %d, stderr = %q", exitCode, stderr.String())
	}
}

func TestProvisionCredentialsMustBePrivateAndPairwiseDistinct(t *testing.T) {
	authorizedAt := time.Date(2026, 7, 20, 1, 0, 0, 0, time.UTC)
	directory, _, authorization := writeCommandTestManifest(t, authorizedAt, "credential-preflight")
	flags := provisionFlags{
		FlyMutationTokenPath:  filepath.Join(directory, "fly-mutation-token"),
		FlyInventoryTokenPath: filepath.Join(directory, "fly-inventory-token"),
		SpritesTokenPath:      filepath.Join(directory, "sprites-token"),
	}
	for path, value := range map[string]string{
		flags.FlyMutationTokenPath:  "fly-mutation-value",
		flags.FlyInventoryTokenPath: "fly-inventory-value",
		flags.SpritesTokenPath:      "sprites-value",
	} {
		if err := os.WriteFile(path, []byte(value), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	mutation, inventory, sprite, err := readProvisionCredentials(flags, authorization)
	if err != nil || string(mutation) != "fly-mutation-value" || string(inventory) != "fly-inventory-value" ||
		string(sprite) != "sprites-value" {
		t.Fatalf("credential preflight = %q/%q/%q, %v", mutation, inventory, sprite, err)
	}
	if err := os.WriteFile(flags.SpritesTokenPath, mutation, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := readProvisionCredentials(flags, authorization); err == nil {
		t.Fatal("credential preflight accepted repeated provider authority")
	}
}

func writeCommandTestManifest(
	t *testing.T,
	authorizedAt time.Time,
	runID string,
) (string, string, hostedmeasurement.Authorization) {
	t.Helper()
	directory := filepath.Join(t.TempDir(), "private-run")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := hostedmeasurement.Manifest{
		SchemaVersion:       hostedmeasurement.ManifestSchemaVersion,
		RunID:               runID,
		OwnerAuthorizedAt:   authorizedAt.Format(time.RFC3339),
		StartDeadline:       authorizedAt.Add(30 * time.Minute).Format(time.RFC3339),
		CleanupDeadline:     authorizedAt.Add(2 * time.Hour).Format(time.RFC3339),
		MaximumSpendUSD:     "5.00",
		SpritesOrganization: "setta-100",
		FlyOrganization:     "setta-100",
		FlyRegion:           "yyz",
		FlyAppName:          "setta-gateway-" + runID,
		ResourcePrefix:      "setta-gateway-" + runID,
		SpriteResources:     commandTestSpriteResources(),
		MinimumDiskFreeMiB:  1_024,
		AuthorizedWorkload: []string{
			"hosted-candidate-b-http-sse",
			"controlled-unauthenticated-wake",
			"rotation-revocation-suspension-rate-limit-reconnect-redaction",
		},
		ExcludedWorkload: []string{"websocket", "phase1c"},
		CleanupAuthority: hostedmeasurement.CleanupAuthority,
		BillingObserver:  hostedmeasurement.BillingObserver,
	}
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(directory, "manifest.json")
	if err := os.WriteFile(manifestPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	authorization, err := hostedmeasurement.LoadManifest(
		manifestPath,
		authorizedAt.Add(time.Minute),
		hostedmeasurement.ValidateForStart,
	)
	if err != nil {
		t.Fatal(err)
	}
	return directory, manifestPath, authorization
}
