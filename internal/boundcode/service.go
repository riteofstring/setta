package boundcode

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

const defaultPollInterval = 300 * time.Millisecond

type Binding struct {
	ProjectID string
	SectionID string
}

type FileInput struct {
	Path     string
	Bindings []Binding
}

type FileUpdate struct {
	Path     string
	Raw      string
	Bindings []Binding
}

type ServiceOptions struct {
	PollInterval time.Duration
	OnFileUpdate func(context.Context, FileUpdate) error
	OnError      func(error)
}

type Service struct {
	pollInterval time.Duration
	onFileUpdate func(context.Context, FileUpdate) error
	onError      func(error)

	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}

	mu     sync.Mutex
	tracks map[string]trackedFile
}

type trackedFile struct {
	bindings     []Binding
	state        fileState
	pendingState fileState
	pendingValid bool
}

type fileState struct {
	initialized bool
	exists      bool
	size        int64
	modTime     time.Time
	hash        string
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.OnFileUpdate == nil {
		return nil, fmt.Errorf("bound code file update callback is required")
	}
	if options.PollInterval <= 0 {
		options.PollInterval = defaultPollInterval
	}

	ctx, cancel := context.WithCancel(context.Background())
	service := &Service{
		pollInterval: options.PollInterval,
		onFileUpdate: options.OnFileUpdate,
		onError:      options.OnError,
		ctx:          ctx,
		cancel:       cancel,
		done:         make(chan struct{}),
		tracks:       map[string]trackedFile{},
	}
	go service.run()
	return service, nil
}

func (s *Service) Close() error {
	if s == nil {
		return nil
	}
	s.cancel()
	<-s.done
	return nil
}

func (s *Service) SyncInputs(inputs []FileInput) error {
	if s == nil {
		return nil
	}

	next := make(map[string]trackedFile, len(inputs))
	for _, input := range inputs {
		path := strings.TrimSpace(input.Path)
		if path == "" {
			return fmt.Errorf("bound code file path is required")
		}

		bindings := normalizeBindings(input.Bindings)
		if len(bindings) == 0 {
			continue
		}

		track, exists := next[path]
		if !exists {
			next[path] = trackedFile{
				bindings: bindings,
			}
			continue
		}
		track.bindings = mergeBindings(track.bindings, bindings)
		next[path] = track
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for path, track := range next {
		if existing, ok := s.tracks[path]; ok {
			track.state = existing.state
			track.pendingState = existing.pendingState
			track.pendingValid = existing.pendingValid
		}
		next[path] = track
	}
	s.tracks = next
	return nil
}

func (s *Service) run() {
	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()
	defer close(s.done)

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.poll()
		}
	}
}

func (s *Service) poll() {
	for _, pollInput := range s.snapshotTracks() {
		if err := s.pollFile(pollInput); err != nil {
			s.reportError(err)
		}
	}
}

type pollInput struct {
	path         string
	bindings     []Binding
	state        fileState
	pendingState fileState
	pendingValid bool
}

type fileObservation struct {
	state     fileState
	rawBytes  []byte
	unchanged bool
}

func (s *Service) snapshotTracks() []pollInput {
	s.mu.Lock()
	defer s.mu.Unlock()

	paths := make([]string, 0, len(s.tracks))
	for path := range s.tracks {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	inputs := make([]pollInput, 0, len(paths))
	for _, path := range paths {
		track := s.tracks[path]
		inputs = append(inputs, pollInput{
			path:         path,
			bindings:     append([]Binding(nil), track.bindings...),
			state:        track.state,
			pendingState: track.pendingState,
			pendingValid: track.pendingValid,
		})
	}
	return inputs
}

func (s *Service) pollFile(input pollInput) error {
	observed, err := captureObservedFile(input.path, input.state)
	if err != nil {
		return err
	}
	if observed.unchanged {
		return nil
	}
	return s.applyObservedFile(input, observed)
}

func (s *Service) applyObservedFile(input pollInput, observed fileObservation) error {
	if shouldRecordObservedState(input, observed.state) {
		s.recordState(input.path, observed.state)
		return nil
	}
	if shouldWaitForStableObservedState(input, observed.state) {
		s.recordPendingState(input.path, observed.state)
		return nil
	}
	if err := s.onFileUpdate(s.ctx, FileUpdate{
		Path:     input.path,
		Raw:      string(observed.rawBytes),
		Bindings: append([]Binding(nil), input.bindings...),
	}); err != nil {
		return fmt.Errorf("bound code file update %q: %w", input.path, err)
	}
	s.recordState(input.path, observed.state)
	return nil
}

func (s *Service) recordState(path string, state fileState) {
	s.mu.Lock()
	defer s.mu.Unlock()

	track, ok := s.tracks[path]
	if !ok {
		return
	}
	track.state = state
	track.pendingValid = false
	s.tracks[path] = track
}

func (s *Service) recordPendingState(path string, state fileState) {
	s.mu.Lock()
	defer s.mu.Unlock()

	track, ok := s.tracks[path]
	if !ok {
		return
	}
	track.pendingState = state
	track.pendingValid = true
	s.tracks[path] = track
}

func (s *Service) reportError(err error) {
	if err == nil || s.onError == nil {
		return
	}
	s.onError(err)
}

func normalizeBindings(bindings []Binding) []Binding {
	normalized := make([]Binding, 0, len(bindings))
	seen := map[Binding]struct{}{}
	for _, binding := range bindings {
		normalizedBinding := Binding{
			ProjectID: strings.TrimSpace(binding.ProjectID),
			SectionID: strings.TrimSpace(binding.SectionID),
		}
		if normalizedBinding.ProjectID == "" || normalizedBinding.SectionID == "" {
			continue
		}
		if _, exists := seen[normalizedBinding]; exists {
			continue
		}
		seen[normalizedBinding] = struct{}{}
		normalized = append(normalized, normalizedBinding)
	}
	sort.Slice(normalized, func(left int, right int) bool {
		if normalized[left].ProjectID != normalized[right].ProjectID {
			return normalized[left].ProjectID < normalized[right].ProjectID
		}
		return normalized[left].SectionID < normalized[right].SectionID
	})
	return normalized
}

func mergeBindings(existing []Binding, additions []Binding) []Binding {
	return normalizeBindings(append(append([]Binding(nil), existing...), additions...))
}

func captureObservedFile(path string, currentState fileState) (fileObservation, error) {
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			nextState := missingFileState()
			return fileObservation{
				state:     nextState,
				unchanged: sameObservedState(currentState, nextState),
			}, nil
		}
		return fileObservation{}, fmt.Errorf("bound code file stat %q: %w", path, err)
	}
	if info.IsDir() {
		return fileObservation{}, fmt.Errorf("bound code file %q must be a file", path)
	}
	if fileMetadataMatchesState(currentState, info) {
		return fileObservation{unchanged: true}, nil
	}

	rawBytes, err := os.ReadFile(path)
	if err != nil {
		return fileObservation{}, fmt.Errorf("bound code file read %q: %w", path, err)
	}
	return fileObservation{
		state:    observedFileState(info, rawBytes),
		rawBytes: rawBytes,
	}, nil
}

func hashContent(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func missingFileState() fileState {
	return fileState{
		initialized: true,
		exists:      false,
	}
}

func observedFileState(info os.FileInfo, rawBytes []byte) fileState {
	return fileState{
		initialized: true,
		exists:      true,
		size:        info.Size(),
		modTime:     info.ModTime(),
		hash:        hashContent(rawBytes),
	}
}

func fileMetadataMatchesState(state fileState, info os.FileInfo) bool {
	return state.initialized &&
		state.exists &&
		info.Size() == state.size &&
		info.ModTime().Equal(state.modTime)
}

func sameObservedState(left fileState, right fileState) bool {
	return left.initialized == right.initialized &&
		left.exists == right.exists &&
		left.size == right.size &&
		left.modTime.Equal(right.modTime) &&
		left.hash == right.hash
}

func shouldRecordObservedState(input pollInput, nextState fileState) bool {
	return !nextState.exists ||
		!input.state.initialized ||
		(input.state.exists && input.state.hash == nextState.hash)
}

func shouldWaitForStableObservedState(input pollInput, nextState fileState) bool {
	return !input.pendingValid || !sameObservedState(input.pendingState, nextState)
}
