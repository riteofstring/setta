package unixsockettest

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTempDirIsPrivateShortAndCleanedUp(t *testing.T) {
	var directory string
	t.Run("temporary directory", func(t *testing.T) {
		t.Setenv("TMPDIR", filepath.Join(
			"/var/folders/h8/yx9s_2gs37d50mktlw56975m0000gn/T",
			"an-intentionally-long-temporary-directory",
		))
		directory = TempDir(t, filepath.Join("data", "admin.sock"))
		info, err := os.Stat(directory)
		if err != nil {
			t.Fatalf("stat temporary directory: %v", err)
		}
		if mode := info.Mode().Perm(); mode != 0o700 {
			t.Fatalf("temporary directory mode = %04o, want 0700", mode)
		}
		if socketPath := filepath.Join(directory, "data", "admin.sock"); len(socketPath) >= unixSocketPathLimit {
			t.Fatalf("Unix socket path is %d bytes, want fewer than %d", len(socketPath), unixSocketPathLimit)
		}
	})
	if _, err := os.Stat(directory); !os.IsNotExist(err) {
		t.Fatalf("temporary directory still exists after cleanup: %v", err)
	}
}
