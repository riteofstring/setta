package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/hostedmeasurement"
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
	if len(plan.Actions) != 20 || plan.Shape.MachineCount != 1 || plan.Shape.ScheduledSnapshots {
		t.Fatalf("dry-run plan = %+v", plan)
	}
	if _, err := os.Stat(filepath.Join(directory, "state.json")); !os.IsNotExist(err) {
		t.Fatalf("dry-run created state: %v", err)
	}
}
