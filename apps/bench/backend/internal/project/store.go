package project

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/setta/bench/backend/internal/contracts"
	"github.com/setta/bench/backend/internal/durable"
)

const maximumProjectBytes = 4 << 20

var (
	ErrAlreadyExists    = errors.New("project: project already exists")
	ErrRevisionConflict = errors.New("project: revision conflict")
	ErrIdentityConflict = errors.New("project: identity conflict")
)

type Store struct {
	mu          sync.Mutex
	projectRoot string
	stateRoot   string
	path        string
	project     contracts.ProjectV1
}

type bundleCopy struct {
	source      string
	destination string
	total       int64
	files       int
	directories []string
}

func Open(projectRoot string, create bool) (*Store, error) {
	root, err := canonicalDirectory(projectRoot)
	if err != nil {
		return nil, err
	}
	stateRoot := filepath.Join(root, ".local", "bench")
	path := filepath.Join(stateRoot, "project.json")
	if create {
		if err := createInitialProject(stateRoot, path); err != nil {
			return nil, err
		}
	}
	data, err := durable.ReadRegular(path, maximumProjectBytes)
	if err != nil {
		return nil, fmt.Errorf("project: read: %w", err)
	}
	var loaded contracts.ProjectV1
	if err := contracts.DecodeStrict(data, &loaded); err != nil {
		return nil, fmt.Errorf("project: decode: %w", err)
	}
	if err := loaded.Validate(); err != nil {
		return nil, fmt.Errorf("project: validate: %w", err)
	}
	store := &Store{projectRoot: root, stateRoot: stateRoot, path: path, project: loaded}
	if err := store.cleanImportStaging(); err != nil {
		return nil, err
	}
	return store, nil
}

func createInitialProject(stateRoot string, path string) error {
	if err := os.MkdirAll(stateRoot, 0o700); err != nil {
		return fmt.Errorf("project: create state directory: %w", err)
	}
	if _, err := os.Lstat(path); err == nil {
		return ErrAlreadyExists
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	project, err := NewProject()
	if err != nil {
		return err
	}
	return durable.WriteJSON(path, project, 0o600, maximumProjectBytes)
}

func NewProject() (contracts.ProjectV1, error) {
	id, err := randomID("project")
	if err != nil {
		return contracts.ProjectV1{}, err
	}
	project := contracts.ProjectV1{
		Version: contracts.ProjectVersion, ID: id, Revision: 0, Name: "Setta Bench",
		CaseSet: contracts.CaseSetV1{ID: "cases", Name: "Cases", Manifest: "cases.jsonl"},
		Candidates: []contracts.CandidateV1{
			{ID: "baseline", Name: "Baseline", Command: contracts.CommandV1{Argv: []string{"python3", "baseline.py"}, WorkingDirectory: "."}},
			{ID: "challenger", Name: "Challenger", Command: contracts.CommandV1{Argv: []string{"python3", "challenger.py"}, WorkingDirectory: "."}},
		},
		Evaluator: &contracts.EvaluatorV1{ID: "checks", Name: "Shared checks", Checks: []contracts.CheckV1{}},
		Execution: contracts.ExecutionPolicyV1{Concurrency: 2, TimeoutMilliseconds: 30_000},
		Presentation: contracts.PresentationV1{
			Sections: map[string]contracts.SectionLayoutV1{
				"cases":      {X: 80, Y: 180, Width: 280, Height: 180, ZIndex: 1},
				"baseline":   {X: 460, Y: 80, Width: 300, Height: 180, ZIndex: 2},
				"challenger": {X: 460, Y: 320, Width: 300, Height: 180, ZIndex: 3},
				"checks":     {X: 860, Y: 180, Width: 300, Height: 220, ZIndex: 4},
			},
			Viewport: contracts.ViewportV1{X: 0, Y: 0, Zoom: 1},
		},
	}
	return project, project.Validate()
}

func (store *Store) Root() string {
	return store.projectRoot
}

func (store *Store) StateRoot() string {
	return store.stateRoot
}

func (store *Store) Snapshot() (contracts.ProjectV1, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	return contracts.Clone(store.project)
}

func (store *Store) Replace(request contracts.ReplaceProjectRequestV1) (contracts.ProjectV1, error) {
	if err := request.Validate(); err != nil {
		return contracts.ProjectV1{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if request.ProjectID != store.project.ID {
		return contracts.ProjectV1{}, ErrIdentityConflict
	}
	if request.ExpectedRevision != store.project.Revision {
		return contracts.ProjectV1{}, ErrRevisionConflict
	}
	candidate, err := contracts.Clone(contracts.ProjectV1{
		Version: contracts.ProjectVersion, ID: store.project.ID, Revision: store.project.Revision + 1,
		Name: request.Project.Name, CaseSet: request.Project.CaseSet, Candidates: request.Project.Candidates,
		Evaluator: request.Project.Evaluator, Execution: request.Project.Execution, Presentation: request.Project.Presentation,
	})
	if err != nil {
		return contracts.ProjectV1{}, err
	}
	if err := candidate.Validate(); err != nil {
		return contracts.ProjectV1{}, err
	}
	if err := durable.WriteJSON(store.path, candidate, 0o600, maximumProjectBytes); err != nil {
		return contracts.ProjectV1{}, err
	}
	store.project = candidate
	return contracts.Clone(candidate)
}

func (store *Store) Import(request contracts.ImportCandidateRequestV1) (contracts.ProjectV1, error) {
	if err := request.Validate(); err != nil {
		return contracts.ProjectV1{}, err
	}
	bundleRoot, bundle, err := loadBundle(request.BundleDirectory)
	if err != nil {
		return contracts.ProjectV1{}, err
	}
	if withinPath(store.stateRoot, bundleRoot) {
		return contracts.ProjectV1{}, errors.New("project: candidate bundle cannot be imported from Bench-owned state")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.importBundleLocked(request, bundleRoot, bundle)
}

func (store *Store) importBundleLocked(request contracts.ImportCandidateRequestV1, bundleRoot string, bundle contracts.CandidateBundleV1) (contracts.ProjectV1, error) {
	if request.ProjectID != store.project.ID {
		return contracts.ProjectV1{}, ErrIdentityConflict
	}
	if request.ExpectedRevision != store.project.Revision {
		return contracts.ProjectV1{}, ErrRevisionConflict
	}
	destination, relative, err := store.copyBundle(bundleRoot)
	if err != nil {
		return contracts.ProjectV1{}, err
	}
	accepted := importedCandidate(bundle, relative)
	candidate, err := contracts.Clone(store.project)
	if err != nil {
		_ = os.RemoveAll(destination)
		return contracts.ProjectV1{}, err
	}
	candidate.Revision++
	if err := putImportedCandidate(&candidate, accepted); err != nil {
		_ = os.RemoveAll(destination)
		return contracts.ProjectV1{}, err
	}
	if err := candidate.Validate(); err != nil {
		_ = os.RemoveAll(destination)
		return contracts.ProjectV1{}, err
	}
	if err := durable.WriteJSON(store.path, candidate, 0o600, maximumProjectBytes); err != nil {
		_ = os.RemoveAll(destination)
		return contracts.ProjectV1{}, err
	}
	store.project = candidate
	return contracts.Clone(candidate)
}

func importedCandidate(bundle contracts.CandidateBundleV1, relative string) contracts.CandidateV1 {
	accepted := bundle.Candidate
	accepted.Origin = &bundle.Source
	if accepted.Command.WorkingDirectory == "." {
		accepted.Command.WorkingDirectory = filepath.ToSlash(relative)
	} else {
		accepted.Command.WorkingDirectory = filepath.ToSlash(filepath.Join(relative, accepted.Command.WorkingDirectory))
	}
	return accepted
}

func putImportedCandidate(project *contracts.ProjectV1, accepted contracts.CandidateV1) error {
	for index := range project.Candidates {
		if project.Candidates[index].ID == accepted.ID {
			project.Candidates[index] = accepted
			return nil
		}
	}
	if len(project.Candidates) >= contracts.MaximumCandidates {
		return errors.New("project: candidate capacity is exhausted")
	}
	project.Candidates = append(project.Candidates, accepted)
	project.Presentation.Sections[accepted.ID] = contracts.SectionLayoutV1{X: 460, Y: float64(80 + len(project.Candidates)*220), Width: 300, Height: 180, ZIndex: len(project.Presentation.Sections) + 1}
	return nil
}

func (store *Store) cleanImportStaging() error {
	importsRoot := filepath.Join(store.stateRoot, "imports")
	entries, err := os.ReadDir(importsRoot)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), ".import-") {
			continue
		}
		if err := os.RemoveAll(filepath.Join(importsRoot, entry.Name())); err != nil {
			return err
		}
	}
	return durable.SyncDirectory(importsRoot)
}

func loadBundle(path string) (string, contracts.CandidateBundleV1, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", contracts.CandidateBundleV1{}, err
	}
	root, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", contracts.CandidateBundleV1{}, fmt.Errorf("project: resolve candidate bundle: %w", err)
	}
	if err := durable.RequireDirectory(root); err != nil {
		return "", contracts.CandidateBundleV1{}, fmt.Errorf("project: validate candidate bundle: %w", err)
	}
	data, err := durable.ReadRegular(filepath.Join(root, "bench-candidate.json"), maximumProjectBytes)
	if err != nil {
		return "", contracts.CandidateBundleV1{}, fmt.Errorf("project: read candidate bundle: %w", err)
	}
	var bundle contracts.CandidateBundleV1
	if err := contracts.DecodeStrict(data, &bundle); err != nil {
		return "", contracts.CandidateBundleV1{}, fmt.Errorf("project: decode candidate bundle: %w", err)
	}
	if err := bundle.Validate(); err != nil {
		return "", contracts.CandidateBundleV1{}, err
	}
	return root, bundle, nil
}

func (store *Store) copyBundle(source string) (string, string, error) {
	importsRoot := filepath.Join(store.stateRoot, "imports")
	if err := os.MkdirAll(importsRoot, 0o700); err != nil {
		return "", "", err
	}
	id, err := randomID("candidate")
	if err != nil {
		return "", "", err
	}
	staging := filepath.Join(importsRoot, ".import-"+id)
	if err := copyTree(source, staging); err != nil {
		_ = os.RemoveAll(staging)
		return "", "", err
	}
	if err := durable.SyncDirectory(staging); err != nil {
		_ = os.RemoveAll(staging)
		return "", "", err
	}
	destination := filepath.Join(importsRoot, id)
	if err := os.Rename(staging, destination); err != nil {
		_ = os.RemoveAll(staging)
		return "", "", err
	}
	if err := durable.SyncDirectory(importsRoot); err != nil {
		removeErr := os.RemoveAll(destination)
		resyncErr := durable.SyncDirectory(importsRoot)
		return "", "", errors.Join(err, removeErr, resyncErr)
	}
	relative, err := filepath.Rel(store.projectRoot, destination)
	return destination, relative, err
}

func withinPath(root string, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	return err == nil && !filepath.IsAbs(relative) && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func copyTree(source string, destination string) error {
	copy := &bundleCopy{source: source, destination: destination, directories: []string{}}
	if err := filepath.WalkDir(source, copy.visit); err != nil {
		return err
	}
	for index := len(copy.directories) - 1; index >= 0; index-- {
		if err := durable.SyncDirectory(copy.directories[index]); err != nil {
			return err
		}
	}
	return nil
}

func (copy *bundleCopy) visit(path string, entry os.DirEntry, walkErr error) error {
	if walkErr != nil {
		return walkErr
	}
	if entry.Type()&os.ModeSymlink != 0 {
		return errors.New("project: candidate bundle contains a symbolic link")
	}
	relative, err := filepath.Rel(copy.source, path)
	if err != nil {
		return err
	}
	target := filepath.Join(copy.destination, relative)
	if entry.IsDir() {
		return copy.addDirectory(target)
	}
	return copy.addFile(path, target, entry)
}

func (copy *bundleCopy) addDirectory(target string) error {
	if err := os.MkdirAll(target, 0o700); err != nil {
		return err
	}
	copy.directories = append(copy.directories, target)
	return nil
}

func (copy *bundleCopy) addFile(source string, target string, entry os.DirEntry) error {
	info, err := entry.Info()
	if err != nil || !info.Mode().IsRegular() {
		return errors.New("project: candidate bundle contains a non-regular file")
	}
	copy.files++
	if copy.files > 256 || info.Size() > 128<<20-copy.total {
		return errors.New("project: candidate bundle exceeds the admitted capacity")
	}
	written, err := copyFile(source, target, info.Mode().Perm(), 128<<20-copy.total)
	copy.total += written
	return err
}

func copyFile(source string, destination string, mode os.FileMode, maximum int64) (int64, error) {
	entry, err := os.Lstat(source)
	if err != nil || entry.Mode()&os.ModeSymlink != 0 || !entry.Mode().IsRegular() {
		return 0, errors.New("project: candidate bundle contains a non-regular file")
	}
	input, err := os.Open(source)
	if err != nil {
		return 0, err
	}
	defer input.Close()
	opened, err := input.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(entry, opened) {
		return 0, errors.New("project: candidate bundle file identity changed while opening")
	}
	output, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode&0o700)
	if err != nil {
		return 0, err
	}
	written, copyErr := io.Copy(output, io.LimitReader(input, maximum+1))
	if written > maximum {
		copyErr = errors.New("project: candidate bundle exceeds the admitted capacity")
	}
	syncErr := output.Sync()
	closeErr := output.Close()
	if err := errors.Join(copyErr, syncErr, closeErr); err != nil {
		_ = os.Remove(destination)
		return written, err
	}
	return written, nil
}

func canonicalDirectory(path string) (string, error) {
	if strings.TrimSpace(path) == "" || path != strings.TrimSpace(path) || strings.ContainsRune(path, '\x00') {
		return "", errors.New("project: root is invalid")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(absolute, 0o755); err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", err
	}
	if err := durable.RequireDirectory(resolved); err != nil {
		return "", err
	}
	return resolved, nil
}

func randomID(prefix string) (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return prefix + "-" + hex.EncodeToString(value), nil
}
