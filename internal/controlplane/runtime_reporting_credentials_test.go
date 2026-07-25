package controlplane

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"testing"
	"time"
)

func TestRuntimeReportingCredentialRotationIsScopedIdempotentAndDurable(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	now := time.Date(2026, 7, 25, 18, 0, 0, 0, time.UTC)
	store := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	runtimeName := prepareDeletionRuntime(t, store, "reporting-credential", "user-reporting-credential")
	first := newTestRuntimeReportingCredential(t)
	rotation, err := store.RotateRuntimeReportingCredential(ctx, runtimeName, first)
	if err != nil || rotation.Epoch != 1 || !rotation.UpdatedAt.Equal(now) {
		t.Fatalf("first reporting credential rotation = %+v, %v", rotation, err)
	}
	requireRuntimeReporterAuthorization(t, store, first, runtimeName, true)

	now = now.Add(time.Minute)
	replayed, err := store.RotateRuntimeReportingCredential(ctx, runtimeName, first)
	if err != nil || replayed.Epoch != 1 || !replayed.UpdatedAt.Equal(rotation.UpdatedAt) {
		t.Fatalf("replayed reporting credential rotation = %+v, %v", replayed, err)
	}
	second := newTestRuntimeReportingCredential(t)
	rotated, err := store.RotateRuntimeReportingCredential(ctx, runtimeName, second)
	if err != nil || rotated.Epoch != 2 || !rotated.UpdatedAt.Equal(now) {
		t.Fatalf("second reporting credential rotation = %+v, %v", rotated, err)
	}
	requireRuntimeReporterAuthorization(t, store, first, "", false)
	requireRuntimeReporterAuthorization(t, store, second, runtimeName, true)
	requireReportingCredentialHashOnly(t, store, runtimeName, second.Token)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	restarted := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	defer restarted.Close()
	requireRuntimeReporterAuthorization(t, restarted, second, runtimeName, true)
}

func TestRuntimeReportingCredentialRejectsMalformedAndForeignInputs(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	malformed := RuntimeReportingCredential{Token: "not-a-valid-token"}
	if _, err := store.RotateRuntimeReportingCredential(
		ctx,
		testRuntimeName(t, "missing-reporting-runtime"),
		malformed,
	); err == nil {
		t.Fatal("reporting credential rotation accepted malformed credential")
	}
	if _, authorized, err := store.AuthorizeRuntimeReporter(ctx, malformed); err != nil || authorized {
		t.Fatalf("malformed reporting credential authorization = %t, %v", authorized, err)
	}
	credential := newTestRuntimeReportingCredential(t)
	if _, err := store.RotateRuntimeReportingCredential(
		ctx,
		testRuntimeName(t, "missing-reporting-runtime"),
		credential,
	); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign runtime reporting credential error = %v", err)
	}
}

func newTestRuntimeReportingCredential(t *testing.T) RuntimeReportingCredential {
	t.Helper()
	credential, err := NewRuntimeReportingCredential()
	if err != nil {
		t.Fatal(err)
	}
	return credential
}

func requireRuntimeReporterAuthorization(
	t *testing.T,
	store *Store,
	credential RuntimeReportingCredential,
	wantRuntimeName string,
	wantAuthorized bool,
) {
	t.Helper()
	runtimeName, authorized, err := store.AuthorizeRuntimeReporter(context.Background(), credential)
	if err != nil || authorized != wantAuthorized || runtimeName != wantRuntimeName {
		t.Fatalf(
			"runtime reporter authorization = %q, %t, %v; want %q, %t",
			runtimeName,
			authorized,
			err,
			wantRuntimeName,
			wantAuthorized,
		)
	}
}

func requireReportingCredentialHashOnly(
	t *testing.T,
	store *Store,
	runtimeName string,
	rawToken string,
) {
	t.Helper()
	var stored []byte
	if err := store.db.QueryRow(
		`SELECT token_hash FROM runtime_reporting_credentials WHERE runtime_name = ?`,
		runtimeName,
	).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if len(stored) != sha256.Size || bytes.Contains(stored, []byte(rawToken)) {
		t.Fatalf("stored runtime reporting credential = %x", stored)
	}
}
