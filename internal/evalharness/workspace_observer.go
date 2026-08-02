package evalharness

import (
	"errors"
	"fmt"

	"setta/internal/evalharness/workspaceevidence"
)

type evaluationWorkspaceDigestReader func() (workspaceevidence.Digest, error)

// evaluationWorkspaceObserver owns the harness's filesystem evidence. It is
// deliberately independent of provider trajectory events: a shell command can
// write files without producing a file-change item, while this observer sees
// the resulting workspace state at every conversation-event boundary.
type evaluationWorkspaceObserver struct {
	readDigest  evaluationWorkspaceDigestReader
	initialized bool
	current     EvaluationWorkspaceObservation
}

func newEvaluationWorkspaceObserver(root string) *evaluationWorkspaceObserver {
	return newEvaluationWorkspaceObserverWithReader(func() (workspaceevidence.Digest, error) {
		return workspaceevidence.Capture(root)
	})
}

func newEvaluationWorkspaceObserverWithReader(
	readDigest evaluationWorkspaceDigestReader,
) *evaluationWorkspaceObserver {
	return &evaluationWorkspaceObserver{readDigest: readDigest}
}

func (observer *evaluationWorkspaceObserver) CaptureBaseline() (EvaluationWorkspaceObservation, error) {
	if observer == nil {
		return EvaluationWorkspaceObservation{}, errors.New("evaluation workspace observer is required")
	}
	if observer.initialized {
		return EvaluationWorkspaceObservation{}, errors.New("evaluation workspace baseline was already captured")
	}
	digest, err := observer.captureDigest()
	if err != nil {
		return EvaluationWorkspaceObservation{}, err
	}
	observer.current = EvaluationWorkspaceObservation{Digest: digest.SHA256}
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
	digest, err := observer.captureDigest()
	if err != nil {
		return EvaluationWorkspaceObservation{}, err
	}
	if digest.SHA256 != observer.current.Digest {
		observer.current.Revision++
		observer.current.Digest = digest.SHA256
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

func (observer *evaluationWorkspaceObserver) captureDigest() (workspaceevidence.Digest, error) {
	if observer.readDigest == nil {
		return workspaceevidence.Digest{}, errors.New("evaluation workspace digest reader is required")
	}
	digest, err := observer.readDigest()
	if err != nil {
		return workspaceevidence.Digest{}, fmt.Errorf("observe evaluation workspace: %w", err)
	}
	if err := digest.Validate(); err != nil {
		return workspaceevidence.Digest{}, fmt.Errorf("validate evaluation workspace digest: %w", err)
	}
	return digest, nil
}
