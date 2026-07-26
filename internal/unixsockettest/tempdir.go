// Package unixsockettest provides temporary directories for tests that bind
// Unix sockets.
package unixsockettest

import (
	"os"
	"path/filepath"
	"testing"
)

const (
	shortTemporaryDirectory = "/tmp"
	unixSocketPathLimit     = 104
)

// TempDir returns a private, unique temporary directory that is removed when
// the test finishes. socketRelativePath names the socket that the test will
// create inside the returned directory.
func TempDir(t testing.TB, socketRelativePath string) string {
	t.Helper()
	if !filepath.IsLocal(socketRelativePath) {
		t.Fatalf(
			"create private temporary directory for Unix socket within %d-byte sun_path limit: socket path %q is not relative",
			unixSocketPathLimit,
			socketRelativePath,
		)
	}
	directory, err := os.MkdirTemp(shortTemporaryDirectory, "setta-")
	if err != nil {
		t.Fatalf(
			"create private temporary directory for Unix socket within %d-byte sun_path limit: %v",
			unixSocketPathLimit,
			err,
		)
	}
	t.Cleanup(func() {
		if err := os.RemoveAll(directory); err != nil {
			t.Errorf("remove Unix socket temporary directory %q: %v", directory, err)
		}
	})
	if err := os.Chmod(directory, 0o700); err != nil {
		t.Fatalf(
			"make temporary directory private for Unix socket within %d-byte sun_path limit: %v",
			unixSocketPathLimit,
			err,
		)
	}
	socketPath := filepath.Join(directory, socketRelativePath)
	if len(socketPath) >= unixSocketPathLimit {
		t.Fatalf(
			"temporary Unix socket path %q is %d bytes; %d-byte sun_path limit requires fewer than %d bytes",
			socketPath,
			len(socketPath),
			unixSocketPathLimit,
			unixSocketPathLimit,
		)
	}
	return directory
}
