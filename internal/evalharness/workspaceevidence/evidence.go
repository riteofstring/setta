package workspaceevidence

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"sort"

	evalverifier "setta/internal/evalharness/verifier"
)

var snapshotOptions = evalverifier.SnapshotOptions{
	IgnoredDirectoryNames: []string{".git", "dist", "node_modules"},
}

// Digest is the bounded, content-addressed evidence for one evaluation
// workspace state. It is shared by local tests and the read-only Docker volume
// observer so both boundaries apply exactly the same snapshot contract.
type Digest struct {
	SHA256 string `json:"sha256"`
}

func Capture(root string) (Digest, error) {
	snapshot, err := evalverifier.ReadWorkspace(root, snapshotOptions)
	if err != nil {
		return Digest{}, fmt.Errorf("inspect evaluation workspace: %w", err)
	}
	return Digest{SHA256: digestWorkspace(snapshot)}, nil
}

func (digest Digest) Validate() error {
	if len(digest.SHA256) != sha256.Size*2 {
		return fmt.Errorf(
			"workspace observation digest must be %d lowercase hexadecimal characters",
			sha256.Size*2,
		)
	}
	decoded, err := hex.DecodeString(digest.SHA256)
	if err != nil || hex.EncodeToString(decoded) != digest.SHA256 {
		return errors.New("workspace observation digest must be lowercase hexadecimal")
	}
	return nil
}

func digestWorkspace(snapshot evalverifier.WorkspaceSnapshot) string {
	paths := make([]string, 0, len(snapshot))
	for path := range snapshot {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	digest := sha256.New()
	length := make([]byte, 8)
	for _, path := range paths {
		file := snapshot[path]
		writeDigestPart(digest, length, []byte(path))
		if file.Executable {
			_, _ = digest.Write([]byte{1})
		} else {
			_, _ = digest.Write([]byte{0})
		}
		writeDigestPart(digest, length, file.Content)
	}
	return hex.EncodeToString(digest.Sum(nil))
}

func writeDigestPart(digest hash.Hash, length []byte, value []byte) {
	binary.BigEndian.PutUint64(length, uint64(len(value)))
	_, _ = digest.Write(length)
	_, _ = digest.Write(value)
}
