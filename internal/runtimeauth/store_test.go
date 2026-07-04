package runtimeauth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/hex"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestDeviceSessionTokensAreHashedAndResolvable(t *testing.T) {
	store := newTestStore(t)
	session, token, err := store.CreateDeviceSession(context.Background(), "Local desktop")
	if err != nil {
		t.Fatalf("create device session: %v", err)
	}
	assertHexLength(t, token, 64)

	db := openRuntimeAuthDB(t, store.Path())
	defer db.Close()
	var storedHash []byte
	if err := db.QueryRow("SELECT token_hash FROM device_sessions WHERE id = ?", session.ID).Scan(&storedHash); err != nil {
		t.Fatalf("read stored token hash: %v", err)
	}
	if bytes.Equal(storedHash, []byte(token)) {
		t.Fatal("stored token hash equals token text")
	}
	if !bytes.Equal(storedHash, hashTokenBytes(token)) {
		t.Fatal("stored token hash does not match SHA-256 token hash")
	}

	resolved, ok, err := store.ResolveDeviceToken(context.Background(), token)
	if err != nil {
		t.Fatalf("resolve token: %v", err)
	}
	if !ok {
		t.Fatal("resolve token returned not found")
	}
	if resolved.ID != session.ID || resolved.Scope != DeviceScopeFull {
		t.Fatalf("resolved session = %+v, want %s full scope", resolved, session.ID)
	}

	if _, ok, err := store.ResolveDeviceToken(context.Background(), "not-the-token"); err != nil || ok {
		t.Fatalf("resolve invalid token ok=%v err=%v, want not found", ok, err)
	}
}

func TestPairingTokenCompletesOnce(t *testing.T) {
	store := newTestStore(t)
	_, pairingToken, err := store.CreatePairingToken(context.Background())
	if err != nil {
		t.Fatalf("create pairing token: %v", err)
	}
	assertHexLength(t, pairingToken, 64)

	session, deviceToken, ok, err := store.CompletePairing(context.Background(), pairingToken, "Laptop")
	if err != nil {
		t.Fatalf("complete pairing: %v", err)
	}
	if !ok {
		t.Fatal("complete pairing returned not found")
	}
	if session.ID == "" || deviceToken == "" || session.DisplayName != "Laptop" {
		t.Fatalf("pairing result session=%+v token=%q", session, deviceToken)
	}

	_, _, ok, err = store.CompletePairing(context.Background(), pairingToken, "Phone")
	if err != nil {
		t.Fatalf("complete used pairing token: %v", err)
	}
	if ok {
		t.Fatal("used pairing token completed twice")
	}
}

func TestPairingTokenExpires(t *testing.T) {
	clock := newTestClock(mustParseTime(t, "2026-07-02T10:00:00Z"))
	store := newTestStore(t, WithClock(clock.Now))
	_, pairingToken, err := store.CreatePairingToken(context.Background())
	if err != nil {
		t.Fatalf("create pairing token: %v", err)
	}

	clock.Set(mustParseTime(t, "2026-07-02T10:10:01Z"))
	_, _, ok, err := store.CompletePairing(context.Background(), pairingToken, "Late client")
	if err != nil {
		t.Fatalf("complete expired pairing token: %v", err)
	}
	if ok {
		t.Fatal("expired pairing token completed")
	}
}

func TestRevokedDeviceSessionStopsResolving(t *testing.T) {
	store := newTestStore(t)
	session, token, err := store.CreateDeviceSession(context.Background(), "Local desktop")
	if err != nil {
		t.Fatalf("create device session: %v", err)
	}
	revoked, ok, err := store.RevokeDeviceSession(context.Background(), session.ID)
	if err != nil {
		t.Fatalf("revoke device session: %v", err)
	}
	if !ok || revoked.RevokedAt == nil {
		t.Fatalf("revoked session = %+v ok=%v, want revoked", revoked, ok)
	}
	isRevoked, err := store.IsDeviceSessionRevoked(context.Background(), session.ID)
	if err != nil {
		t.Fatalf("read revocation: %v", err)
	}
	if !isRevoked {
		t.Fatal("session is not marked revoked")
	}
	if _, ok, err := store.ResolveDeviceToken(context.Background(), token); err != nil || ok {
		t.Fatalf("resolve revoked token ok=%v err=%v, want not found", ok, err)
	}
	if touched, err := store.TouchDeviceSession(context.Background(), session.ID); err != nil || touched {
		t.Fatalf("touch revoked session touched=%v err=%v, want false", touched, err)
	}
}

func newTestStore(t *testing.T, options ...StoreOption) *Store {
	t.Helper()
	store, err := NewStore(t.TempDir(), options...)
	if err != nil {
		t.Fatalf("new runtime auth store: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close runtime auth store: %v", err)
		}
	})
	return store
}

func openRuntimeAuthDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	if filepath.Base(path) != runtimeAuthDatabaseName {
		t.Fatalf("runtime auth db path = %s, want %s", path, runtimeAuthDatabaseName)
	}
	db, err := sql.Open(sqliteDriverName, path)
	if err != nil {
		t.Fatalf("open runtime auth db: %v", err)
	}
	return db
}

func assertHexLength(t *testing.T, value string, want int) {
	t.Helper()
	if len(value) != want {
		t.Fatalf("token length = %d, want %d", len(value), want)
	}
	if _, err := hex.DecodeString(value); err != nil {
		t.Fatalf("token is not hex: %v", err)
	}
}

type testClock struct {
	now time.Time
}

func newTestClock(now time.Time) *testClock {
	return &testClock{now: now}
}

func (clock *testClock) Now() time.Time {
	return clock.now
}

func (clock *testClock) Set(now time.Time) {
	clock.now = now
}

func mustParseTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatalf("parse time: %v", err)
	}
	return parsed
}
