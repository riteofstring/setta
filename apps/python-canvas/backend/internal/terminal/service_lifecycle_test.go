package terminal

import (
	"context"
	"errors"
	"io"
	"os"
	"sync"
	"testing"
	"time"
)

func TestRunRollbackReturnsArtifactRemovalFailures(t *testing.T) {
	writeFailure := errors.New("write PTY")
	removeFailure := errors.New("remove artifact")
	for _, testCase := range []struct {
		name    string
		prepare func(*Service, *session, context.CancelFunc)
		want    error
	}{
		{
			name: "canceled context after artifact creation",
			prepare: func(service *Service, _ *session, cancel context.CancelFunc) {
				service.createArtifact = func(directory string, code string) (runArtifact, error) {
					artifact, err := createRunArtifact(directory, code)
					cancel()
					return artifact, err
				}
			},
			want: context.Canceled,
		},
		{
			name: "session exits after artifact creation",
			prepare: func(service *Service, session *session, _ context.CancelFunc) {
				service.createArtifact = func(directory string, code string) (runArtifact, error) {
					artifact, err := createRunArtifact(directory, code)
					session.finish(nil)
					return artifact, err
				}
			},
			want: ErrSessionExited,
		},
		{
			name: "PTY write fails",
			prepare: func(_ *Service, session *session, _ context.CancelFunc) {
				session.pty.(*lifecyclePTY).writeErr = writeFailure
			},
			want: writeFailure,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			service, session, artifactPaths := newLifecycleService(t, &lifecyclePTY{})
			service.removeArtifact = func(path string) error {
				artifactPaths.add(path)
				return removeFailure
			}
			session.remove = service.removeArtifact
			runContext, cancel := context.WithCancel(context.Background())
			defer cancel()
			testCase.prepare(service, session, cancel)

			_, created, err := service.Run(runContext, "print('run')\n", 80, 24)
			if created {
				t.Fatal("Run unexpectedly created a replacement terminal session")
			}
			if !errors.Is(err, testCase.want) || !errors.Is(err, removeFailure) {
				t.Fatalf("Run() error = %v, want %v and %v", err, testCase.want, removeFailure)
			}
			for _, path := range artifactPaths.values() {
				if cleanupErr := removeRunArtifact(path); cleanupErr != nil {
					t.Errorf("cleanup test artifact %q: %v", path, cleanupErr)
				}
			}
		})
	}
}

func TestSessionFinishPropagatesArtifactRemovalFailure(t *testing.T) {
	removeFailure := errors.New("remove artifact")
	artifact, err := createRunArtifact(t.TempDir(), "print('run')\n")
	if err != nil {
		t.Fatalf("create artifact: %v", err)
	}
	t.Cleanup(func() { _ = removeRunArtifact(artifact.path) })
	session := &session{
		pty:       &lifecyclePTY{},
		done:      make(chan struct{}),
		history:   historyBuffer{limit: defaultHistoryLimit},
		artifacts: map[string]struct{}{artifact.path: {}},
		remove:    func(string) error { return removeFailure },
	}

	session.finish(nil)
	if err := session.waitError(); !errors.Is(err, removeFailure) {
		t.Fatalf("session cleanup error = %v, want %v", err, removeFailure)
	}
	select {
	case <-session.done:
	default:
		t.Fatal("session cleanup did not finish")
	}
}

func TestOpenReportsExitedSessionCleanupFailureBeforeReplacement(t *testing.T) {
	cleanupFailure := errors.New("guardian cleanup")
	old := &session{
		pty:       &lifecyclePTY{},
		done:      make(chan struct{}),
		history:   historyBuffer{limit: defaultHistoryLimit},
		artifacts: make(map[string]struct{}),
		exited:    true,
		waitErr:   cleanupFailure,
	}
	close(old.done)
	service, _, _ := newLifecycleService(t, &lifecyclePTY{releaseOnClose: true})
	service.session = old
	opened := 0
	service.openTerminal = func([]string, string, []string, int, int) (ptySession, error) {
		opened++
		return &lifecyclePTY{releaseOnClose: true}, nil
	}

	if _, created, err := service.Open(80, 24); created || !errors.Is(err, cleanupFailure) {
		t.Fatalf("first Open = created %t error %v, want cleanup failure", created, err)
	}
	if opened != 0 {
		t.Fatalf("Open created replacement before surfacing cleanup failure: %d", opened)
	}
	if _, created, err := service.Open(80, 24); err != nil || !created {
		t.Fatalf("recovery Open = created %t error %v", created, err)
	}
}

func TestCanceledDeleteRetainsTeardownOwnerUntilContainmentFinishes(t *testing.T) {
	oldPTY := &lifecyclePTY{waitRelease: make(chan struct{}), closeStarted: make(chan struct{})}
	service, old, _ := newLifecycleService(t, oldPTY)
	go service.waitLoop(old)
	deleteContext, cancel := context.WithCancel(context.Background())
	deleteDone := make(chan error, 1)
	go func() { deleteDone <- service.Delete(deleteContext) }()
	select {
	case <-oldPTY.closeStarted:
	case <-time.After(time.Second):
		t.Fatal("Delete did not start terminal teardown")
	}
	cancel()
	if err := <-deleteDone; !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled Delete error = %v, want context cancellation", err)
	}
	if _, created, err := service.Open(80, 24); created || !errors.Is(err, ErrSessionExited) {
		t.Fatalf("Open during teardown = created %t error %v, want %v", created, err, ErrSessionExited)
	}
	oldPTY.release()
	select {
	case <-old.done:
	case <-time.After(time.Second):
		t.Fatal("terminal containment did not finish")
	}
	freshPTY := &lifecyclePTY{releaseOnClose: true}
	service.openTerminal = func([]string, string, []string, int, int) (ptySession, error) {
		return freshPTY, nil
	}
	if _, created, err := service.Open(80, 24); err != nil || !created {
		t.Fatalf("Open after teardown = created %t error %v", created, err)
	}
	closeContext, closeCancel := context.WithTimeout(context.Background(), time.Second)
	defer closeCancel()
	if err := service.Close(closeContext); err != nil {
		t.Fatalf("close recovered service: %v", err)
	}
}

func newLifecycleService(t *testing.T, pty *lifecyclePTY) (*Service, *session, *artifactPathSet) {
	t.Helper()
	interpreter, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	paths := &artifactPathSet{}
	session := &session{
		pty:       pty,
		columns:   80,
		rows:      24,
		done:      make(chan struct{}),
		history:   historyBuffer{limit: defaultHistoryLimit},
		artifacts: make(map[string]struct{}),
	}
	service := &Service{
		projectDirectory: t.TempDir(),
		interpreter:      interpreter,
		childEnvironment: []string{"PATH=/bin"},
		historyLimit:     defaultHistoryLimit,
		tickets:          make(map[string]ticket),
		session:          session,
		createArtifact:   createRunArtifact,
	}
	service.removeArtifact = func(path string) error {
		paths.add(path)
		return removeRunArtifact(path)
	}
	session.remove = service.removeArtifact
	return service, session, paths
}

type artifactPathSet struct {
	mu    sync.Mutex
	paths []string
}

func (set *artifactPathSet) add(path string) {
	set.mu.Lock()
	defer set.mu.Unlock()
	set.paths = append(set.paths, path)
}

func (set *artifactPathSet) values() []string {
	set.mu.Lock()
	defer set.mu.Unlock()
	return append([]string(nil), set.paths...)
}

type lifecyclePTY struct {
	writeErr       error
	closeErr       error
	waitErr        error
	waitRelease    chan struct{}
	closeStarted   chan struct{}
	releaseOnClose bool
	closeOnce      sync.Once
	releaseOnce    sync.Once
}

func (pty *lifecyclePTY) Read([]byte) (int, error)       { return 0, io.EOF }
func (pty *lifecyclePTY) Write(data []byte) (int, error) { return len(data), pty.writeErr }
func (pty *lifecyclePTY) Resize(int, int) error          { return nil }
func (pty *lifecyclePTY) Close() error {
	pty.closeOnce.Do(func() {
		if pty.closeStarted != nil {
			close(pty.closeStarted)
		}
		if pty.releaseOnClose {
			pty.release()
		}
	})
	return pty.closeErr
}
func (pty *lifecyclePTY) Wait() error {
	if pty.waitRelease != nil {
		<-pty.waitRelease
	}
	return pty.waitErr
}
func (pty *lifecyclePTY) release() {
	if pty.waitRelease == nil {
		return
	}
	pty.releaseOnce.Do(func() { close(pty.waitRelease) })
}
