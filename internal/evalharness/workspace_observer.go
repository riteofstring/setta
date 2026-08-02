package evalharness

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

var evaluationWorkspaceSnapshotOptions = evalverifier.SnapshotOptions{
	IgnoredDirectoryNames: []string{".git", "dist", "node_modules"},
}

// evaluationWorkspaceObserver owns the harness's filesystem evidence. It is
// deliberately independent of provider trajectory events: a shell command can
// write files without producing a file-change item, while this observer sees
// the resulting workspace state at every conversation-event boundary.
type evaluationWorkspaceObserver struct {
	root        string
	initialized bool
	current     EvaluationWorkspaceObservation
}

func newEvaluationWorkspaceObserver(root string) *evaluationWorkspaceObserver {
	return &evaluationWorkspaceObserver{root: root}
}

func (observer *evaluationWorkspaceObserver) CaptureBaseline() (EvaluationWorkspaceObservation, error) {
	if observer == nil {
		return EvaluationWorkspaceObservation{}, errors.New("evaluation workspace observer is required")
	}
	if observer.initialized {
		return EvaluationWorkspaceObservation{}, errors.New("evaluation workspace baseline was already captured")
	}
	digest, err := readEvaluationWorkspaceDigest(observer.root)
	if err != nil {
		return EvaluationWorkspaceObservation{}, err
	}
	observer.current = EvaluationWorkspaceObservation{Digest: digest}
	observer.initialized = true
	return observer.current, nil
}

func (observer *evaluationWorkspaceObserver) Observe() (EvaluationWorkspaceObservation, error) {
	if observer == nil {
		return EvaluationWorkspaceObservation{}, errors.New("evaluation workspace observer is required")
	}
	if !observer.initialized {
		return EvaluationWorkspaceObservation{}, errors.New("evaluation workspace baseline has not been captured")
	}
	digest, err := readEvaluationWorkspaceDigest(observer.root)
	if err != nil {
		return EvaluationWorkspaceObservation{}, err
	}
	if digest != observer.current.Digest {
		observer.current.Revision++
		observer.current.Digest = digest
	}
	return observer.current, nil
}

func (observer *evaluationWorkspaceObserver) Current() (EvaluationWorkspaceObservation, error) {
	if observer == nil {
		return EvaluationWorkspaceObservation{}, errors.New("evaluation workspace observer is required")
	}
	if !observer.initialized {
		return EvaluationWorkspaceObservation{}, errors.New("evaluation workspace baseline has not been captured")
	}
	return observer.current, nil
}

func readEvaluationWorkspaceDigest(root string) (string, error) {
	snapshot, err := evalverifier.ReadWorkspace(root, evaluationWorkspaceSnapshotOptions)
	if err != nil {
		return "", fmt.Errorf("observe evaluation workspace: %w", err)
	}
	return digestEvaluationWorkspace(snapshot), nil
}

func digestEvaluationWorkspace(snapshot evalverifier.WorkspaceSnapshot) string {
	paths := make([]string, 0, len(snapshot))
	for path := range snapshot {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	digest := sha256.New()
	length := make([]byte, 8)
	for _, path := range paths {
		file := snapshot[path]
		writeEvaluationDigestPart(digest, length, []byte(path))
		if file.Executable {
			_, _ = digest.Write([]byte{1})
		} else {
			_, _ = digest.Write([]byte{0})
		}
		writeEvaluationDigestPart(digest, length, file.Content)
	}
	return hex.EncodeToString(digest.Sum(nil))
}

func writeEvaluationDigestPart(
	digest hash.Hash,
	length []byte,
	value []byte,
) {
	binary.BigEndian.PutUint64(length, uint64(len(value)))
	_, _ = digest.Write(length)
	_, _ = digest.Write(value)
}
