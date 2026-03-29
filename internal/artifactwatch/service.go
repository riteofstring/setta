package artifactwatch

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

	"setta/internal/artifacts"
)

const defaultPollInterval = 300 * time.Millisecond

type ImageRef struct {
	ProjectID string
	SectionID string
}

type FileInput struct {
	Path      string
	Types     []artifacts.ArtifactType
	ImageRefs []ImageRef
}

type FileUpdate struct {
	Path      string
	Types     []artifacts.ArtifactType
	ImageRefs []ImageRef
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
	types     []artifacts.ArtifactType
	imageRefs []ImageRef
	state     fileState
}

type fileState struct {
	initialized bool
	exists      bool
	size        int64
	modTime     time.Time
	hash        string
}

type pollInput struct {
	path      string
	types     []artifacts.ArtifactType
	imageRefs []ImageRef
	state     fileState
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.OnFileUpdate == nil {
		return nil, fmt.Errorf("artifact file update callback is required")
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
			return fmt.Errorf("artifact file path is required")
		}

		types := normalizeArtifactTypes(input.Types)
		if len(types) == 0 {
			continue
		}
		imageRefs := normalizeImageRefs(input.ImageRefs)
		state, err := captureFileState(path)
		if err != nil {
			return err
		}

		existing, exists := next[path]
		if !exists {
			next[path] = trackedFile{
				types:     types,
				imageRefs: imageRefs,
				state:     state,
			}
			continue
		}

		existing.types = mergeArtifactTypes(existing.types, types)
		existing.imageRefs = mergeImageRefs(existing.imageRefs, imageRefs)
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
			path:      path,
			types:     append([]artifacts.ArtifactType(nil), track.types...),
			imageRefs: append([]ImageRef(nil), track.imageRefs...),
			state:     track.state,
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
		Path:      input.path,
		Types:     append([]artifacts.ArtifactType(nil), input.types...),
		ImageRefs: append([]ImageRef(nil), input.imageRefs...),
	}); err != nil {
		return fmt.Errorf("artifact file update %q: %w", input.path, err)
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
		return fileState{}, fmt.Errorf("artifact file stat %q: %w", path, err)
	}
	if info.IsDir() {
		return fileState{}, fmt.Errorf("artifact file %q must be a file", path)
	}

	rawBytes, err := os.ReadFile(path)
	if err != nil {
		return fileState{}, fmt.Errorf("artifact file read %q: %w", path, err)
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
	return left.size == right.size &&
		left.modTime.Equal(right.modTime) &&
		left.hash == right.hash
}

func hashContent(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func normalizeArtifactTypes(types []artifacts.ArtifactType) []artifacts.ArtifactType {
	seen := make(map[artifacts.ArtifactType]struct{}, len(types))
	normalized := make([]artifacts.ArtifactType, 0, len(types))
	for _, artifactType := range types {
		trimmed := artifacts.ArtifactType(strings.TrimSpace(string(artifactType)))
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	sort.Slice(normalized, func(i int, j int) bool {
		return normalized[i] < normalized[j]
	})
	return normalized
}

func mergeArtifactTypes(left []artifacts.ArtifactType, right []artifacts.ArtifactType) []artifacts.ArtifactType {
	combined := append(append([]artifacts.ArtifactType(nil), left...), right...)
	return normalizeArtifactTypes(combined)
}

func normalizeImageRefs(refs []ImageRef) []ImageRef {
	seen := make(map[string]struct{}, len(refs))
	normalized := make([]ImageRef, 0, len(refs))
	for _, ref := range refs {
		projectID := strings.TrimSpace(ref.ProjectID)
		sectionID := strings.TrimSpace(ref.SectionID)
		if projectID == "" || sectionID == "" {
			continue
		}
		key := projectID + "\x00" + sectionID
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, ImageRef{
			ProjectID: projectID,
			SectionID: sectionID,
		})
	}
	sort.Slice(normalized, func(i int, j int) bool {
		if normalized[i].ProjectID != normalized[j].ProjectID {
			return normalized[i].ProjectID < normalized[j].ProjectID
		}
		return normalized[i].SectionID < normalized[j].SectionID
	})
	return normalized
}

func mergeImageRefs(left []ImageRef, right []ImageRef) []ImageRef {
	combined := append(append([]ImageRef(nil), left...), right...)
	return normalizeImageRefs(combined)
}
