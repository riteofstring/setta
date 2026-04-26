package jsonsourcewatch

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
	VariantID string
}

type FileInput struct {
	Path     string
	Bindings []Binding
}

type FileUpdate struct {
	Path     string
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
	bindings []Binding
	state    fileState
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
		return nil, fmt.Errorf("json source file update callback is required")
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
			return fmt.Errorf("json source file path is required")
		}

		bindings := normalizeBindings(input.Bindings)
		if len(bindings) == 0 {
			continue
		}

		state, err := captureFileState(path)
		if err != nil {
			return err
		}

		existing, exists := next[path]
		if !exists {
			next[path] = trackedFile{
				bindings: bindings,
				state:    state,
			}
			continue
		}
		existing.bindings = mergeBindings(existing.bindings, bindings)
		existing.state = state
		next[path] = existing
	}

	s.mu.Lock()
	s.tracks = next
	s.mu.Unlock()
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

type pollInput struct {
	path     string
	bindings []Binding
	state    fileState
}

func (s *Service) poll() {
	for _, input := range s.snapshotTracks() {
		if err := s.pollFile(input); err != nil {
			s.reportError(err)
		}
	}
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
			path:     path,
			bindings: append([]Binding(nil), track.bindings...),
			state:    track.state,
		})
	}
	return inputs
}

func (s *Service) pollFile(input pollInput) error {
	nextState, err := captureFileState(input.path)
	if err != nil {
		return err
	}
	if !input.state.initialized {
		s.recordState(input.path, nextState)
		return nil
	}
	if fileStatesEqual(input.state, nextState) {
		return nil
	}

	if err := s.onFileUpdate(s.ctx, FileUpdate{
		Path:     input.path,
		Bindings: append([]Binding(nil), input.bindings...),
	}); err != nil {
		return fmt.Errorf("json source file update %q: %w", input.path, err)
	}
	s.recordState(input.path, nextState)
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
	s.tracks[path] = track
}

func (s *Service) reportError(err error) {
	if err == nil || s.onError == nil {
		return
	}
	s.onError(err)
}

func captureFileState(path string) (fileState, error) {
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fileState{
				initialized: true,
				exists:      false,
			}, nil
		}
		return fileState{}, fmt.Errorf("json source file stat %q: %w", path, err)
	}
	if info.IsDir() {
		return fileState{}, fmt.Errorf("json source file %q must be a file", path)
	}

	rawBytes, err := os.ReadFile(path)
	if err != nil {
		return fileState{}, fmt.Errorf("json source file read %q: %w", path, err)
	}
	return fileState{
		initialized: true,
		exists:      true,
		size:        info.Size(),
		modTime:     info.ModTime(),
		hash:        hashContent(rawBytes),
	}, nil
}

func fileStatesEqual(left fileState, right fileState) bool {
	if left.initialized != right.initialized || left.exists != right.exists {
		return false
	}
	if !left.exists {
		return true
	}
	return left.size == right.size && left.modTime.Equal(right.modTime) && left.hash == right.hash
}

func hashContent(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func normalizeBindings(bindings []Binding) []Binding {
	normalized := make([]Binding, 0, len(bindings))
	seen := map[Binding]struct{}{}
	for _, binding := range bindings {
		normalizedBinding := Binding{
			ProjectID: strings.TrimSpace(binding.ProjectID),
			SectionID: strings.TrimSpace(binding.SectionID),
			VariantID: strings.TrimSpace(binding.VariantID),
		}
		if normalizedBinding.ProjectID == "" || normalizedBinding.SectionID == "" || normalizedBinding.VariantID == "" {
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
		if normalized[left].SectionID != normalized[right].SectionID {
			return normalized[left].SectionID < normalized[right].SectionID
		}
		return normalized[left].VariantID < normalized[right].VariantID
	})
	return normalized
}

func mergeBindings(existing []Binding, additional []Binding) []Binding {
	merged := append([]Binding(nil), existing...)
	seen := map[Binding]struct{}{}
	for _, binding := range merged {
		seen[binding] = struct{}{}
	}
	for _, binding := range additional {
		if _, exists := seen[binding]; exists {
			continue
		}
		seen[binding] = struct{}{}
		merged = append(merged, binding)
	}
	sort.Slice(merged, func(left int, right int) bool {
		if merged[left].ProjectID != merged[right].ProjectID {
			return merged[left].ProjectID < merged[right].ProjectID
		}
		if merged[left].SectionID != merged[right].SectionID {
			return merged[left].SectionID < merged[right].SectionID
		}
		return merged[left].VariantID < merged[right].VariantID
	})
	return merged
}
