package runstore

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/setta/bench/backend/internal/contracts"
	"github.com/setta/bench/backend/internal/durable"
)

const maximumRecordBytes = 8 << 20

var (
	ErrRunNotFound      = errors.New("runstore: run was not found")
	ErrRunTerminal      = errors.New("runstore: terminal run is immutable")
	ErrArtifactNotFound = errors.New("runstore: artifact was not found")
)

type reviewDocument struct {
	Version int                  `json:"version"`
	Reviews []contracts.ReviewV1 `json:"reviews"`
}

type artifactRecord struct {
	reference contracts.ArtifactReferenceV1
	path      string
}

type Store struct {
	mu          sync.Mutex
	stateRoot   string
	runsRoot    string
	stagingRoot string
	reviewsPath string
	launches    map[string]contracts.LaunchV1
	runs        map[string]contracts.RunV1
	reviews     map[string]contracts.ReviewV1
	artifacts   map[string]artifactRecord
	diagnostics []contracts.StructuredErrorV1
}

func Open(stateRoot string) (*Store, error) {
	if strings.TrimSpace(stateRoot) == "" || stateRoot != strings.TrimSpace(stateRoot) || strings.ContainsRune(stateRoot, '\x00') {
		return nil, errors.New("runstore: state root is invalid")
	}
	absolute, err := filepath.Abs(stateRoot)
	if err != nil {
		return nil, err
	}
	runsRoot := filepath.Join(absolute, "runs")
	stagingRoot := filepath.Join(absolute, "staging")
	for _, directory := range []string{absolute, runsRoot, stagingRoot} {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			return nil, fmt.Errorf("runstore: create directory: %w", err)
		}
		if err := durable.RequireDirectory(directory); err != nil {
			return nil, err
		}
	}
	store := &Store{
		stateRoot: absolute, runsRoot: runsRoot, stagingRoot: stagingRoot,
		reviewsPath: filepath.Join(absolute, "reviews.json"), launches: map[string]contracts.LaunchV1{},
		runs: map[string]contracts.RunV1{}, reviews: map[string]contracts.ReviewV1{}, artifacts: map[string]artifactRecord{}, diagnostics: []contracts.StructuredErrorV1{},
	}
	if err := store.cleanStaging(); err != nil {
		return nil, err
	}
	if err := store.loadRuns(); err != nil {
		return nil, err
	}
	if err := store.loadReviews(); err != nil {
		store.addDiagnostic("corrupt_reviews", fmt.Sprintf("Unable to read saved reviews: %v", err))
	}
	return store, nil
}

func (store *Store) NewStagingDirectory() (string, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	return os.MkdirTemp(store.stagingRoot, ".execution-")
}

func (store *Store) CreateLaunch(launch contracts.LaunchV1, runs []contracts.RunV1) error {
	if err := validateLaunchRuns(launch, runs); err != nil {
		return err
	}
	storedLaunch, storedRuns, err := cloneLaunchRuns(launch, runs)
	if err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if _, exists := store.launches[launch.ID]; exists {
		return errors.New("runstore: launch already exists")
	}
	staging, err := store.stageLaunch(launch, runs)
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)
	if err := store.installLaunch(staging, launch.ID); err != nil {
		return err
	}
	store.launches[launch.ID] = storedLaunch
	for _, storedRun := range storedRuns {
		store.runs[storedRun.ID] = storedRun
	}
	return nil
}

func validateLaunchRuns(launch contracts.LaunchV1, runs []contracts.RunV1) error {
	if err := launch.Validate(); err != nil {
		return err
	}
	if len(runs) != len(launch.RunIDs) {
		return errors.New("runstore: launch run collection does not match")
	}
	for index, run := range runs {
		if err := run.Validate(); err != nil {
			return err
		}
		if run.ID != launch.RunIDs[index] || run.LaunchID != launch.ID || run.CandidateID != launch.Candidates[index].ID || run.Status != "queued" {
			return errors.New("runstore: initial run does not match launch")
		}
	}
	return nil
}

func cloneLaunchRuns(launch contracts.LaunchV1, runs []contracts.RunV1) (contracts.LaunchV1, []contracts.RunV1, error) {
	storedLaunch, err := contracts.Clone(launch)
	if err != nil {
		return contracts.LaunchV1{}, nil, err
	}
	storedRuns := make([]contracts.RunV1, 0, len(runs))
	for _, run := range runs {
		storedRun, err := contracts.Clone(run)
		if err != nil {
			return contracts.LaunchV1{}, nil, err
		}
		storedRuns = append(storedRuns, storedRun)
	}
	return storedLaunch, storedRuns, nil
}

func (store *Store) stageLaunch(launch contracts.LaunchV1, runs []contracts.RunV1) (string, error) {
	staging, err := os.MkdirTemp(store.runsRoot, ".launch-")
	if err != nil {
		return "", err
	}
	if err := writeLaunchFiles(staging, launch, runs); err != nil {
		_ = os.RemoveAll(staging)
		return "", err
	}
	return staging, nil
}

func writeLaunchFiles(staging string, launch contracts.LaunchV1, runs []contracts.RunV1) error {
	if err := durable.WriteJSON(filepath.Join(staging, "launch.json"), launch, 0o600, maximumRecordBytes); err != nil {
		return err
	}
	for _, run := range runs {
		if err := durable.WriteJSON(filepath.Join(staging, run.ID+".json"), run, 0o600, maximumRecordBytes); err != nil {
			return err
		}
	}
	return durable.SyncDirectory(staging)
}

func (store *Store) installLaunch(staging string, launchID string) error {
	target := filepath.Join(store.runsRoot, launchID)
	if err := os.Rename(staging, target); err != nil {
		return fmt.Errorf("runstore: install launch: %w", err)
	}
	if err := durable.SyncDirectory(store.runsRoot); err != nil {
		removeErr := os.RemoveAll(target)
		resyncErr := durable.SyncDirectory(store.runsRoot)
		return errors.Join(err, removeErr, resyncErr)
	}
	return nil
}

func (store *Store) UpdateRun(candidate contracts.RunV1) (contracts.RunV1, error) {
	if err := candidate.Validate(); err != nil {
		return contracts.RunV1{}, err
	}
	stored, err := contracts.Clone(candidate)
	if err != nil {
		return contracts.RunV1{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	previous, exists := store.runs[candidate.ID]
	if !exists {
		return contracts.RunV1{}, ErrRunNotFound
	}
	if contracts.RunTerminal(previous.Status) {
		return contracts.RunV1{}, ErrRunTerminal
	}
	if err := validateRunTransition(previous, candidate); err != nil {
		return contracts.RunV1{}, err
	}
	path := filepath.Join(store.runsRoot, candidate.LaunchID, candidate.ID+".json")
	if err := durable.WriteJSON(path, candidate, 0o600, maximumRecordBytes); err != nil {
		return contracts.RunV1{}, err
	}
	store.runs[candidate.ID] = stored
	return contracts.Clone(candidate)
}

func validateRunTransition(previous contracts.RunV1, candidate contracts.RunV1) error {
	if !sameRunIdentity(previous, candidate) {
		return errors.New("runstore: immutable run identity changed")
	}
	for index := range previous.CaseResults {
		if changedImmutableCase(previous.CaseResults[index], candidate.CaseResults[index]) {
			return errors.New("runstore: immutable case result changed")
		}
	}
	return nil
}

func sameRunIdentity(previous contracts.RunV1, candidate contracts.RunV1) bool {
	return previous.Version == candidate.Version && previous.ID == candidate.ID && previous.LaunchID == candidate.LaunchID && previous.CandidateID == candidate.CandidateID && previous.CandidateName == candidate.CandidateName && previous.CreatedAt == candidate.CreatedAt && equalOptional(previous.RerunParentID, candidate.RerunParentID) && len(previous.CaseResults) == len(candidate.CaseResults)
}

func changedImmutableCase(previous contracts.CaseResultV1, candidate contracts.CaseResultV1) bool {
	if previous.CaseID != candidate.CaseID || previous.CaseName != candidate.CaseName {
		return true
	}
	return caseTerminal(previous.Status) && !equalCaseResult(previous, candidate)
}

func (store *Store) Run(id string) (contracts.RunV1, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	run, exists := store.runs[id]
	if !exists {
		return contracts.RunV1{}, ErrRunNotFound
	}
	return contracts.Clone(run)
}

func (store *Store) Launch(id string) (contracts.LaunchV1, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	launch, exists := store.launches[id]
	if !exists {
		return contracts.LaunchV1{}, ErrRunNotFound
	}
	return contracts.Clone(launch)
}

func (store *Store) LaunchForRun(runID string) (contracts.LaunchV1, contracts.RunV1, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	run, exists := store.runs[runID]
	if !exists {
		return contracts.LaunchV1{}, contracts.RunV1{}, ErrRunNotFound
	}
	launch, exists := store.launches[run.LaunchID]
	if !exists {
		return contracts.LaunchV1{}, contracts.RunV1{}, ErrRunNotFound
	}
	clonedLaunch, err := contracts.Clone(launch)
	if err != nil {
		return contracts.LaunchV1{}, contracts.RunV1{}, err
	}
	clonedRun, err := contracts.Clone(run)
	return clonedLaunch, clonedRun, err
}

func (store *Store) Snapshot() ([]contracts.LaunchV1, []contracts.RunV1, []contracts.ReviewV1, []contracts.StructuredErrorV1, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	launches := make([]contracts.LaunchV1, 0, len(store.launches))
	for _, launch := range store.launches {
		launches = append(launches, launch)
	}
	sort.Slice(launches, func(i, j int) bool {
		if launches[i].CreatedAt == launches[j].CreatedAt {
			return launches[i].ID > launches[j].ID
		}
		return launches[i].CreatedAt > launches[j].CreatedAt
	})
	runs := make([]contracts.RunV1, 0, len(store.runs))
	for _, run := range store.runs {
		runs = append(runs, run)
	}
	sort.Slice(runs, func(i, j int) bool {
		if runs[i].CreatedAt == runs[j].CreatedAt {
			return runs[i].ID > runs[j].ID
		}
		return runs[i].CreatedAt > runs[j].CreatedAt
	})
	reviews := make([]contracts.ReviewV1, 0, len(store.reviews))
	for _, review := range store.reviews {
		reviews = append(reviews, review)
	}
	sort.Slice(reviews, func(i, j int) bool {
		if reviews[i].UpdatedAt == reviews[j].UpdatedAt {
			return reviewKey(reviews[i].LeftRunID, reviews[i].RightRunID) < reviewKey(reviews[j].LeftRunID, reviews[j].RightRunID)
		}
		return reviews[i].UpdatedAt > reviews[j].UpdatedAt
	})
	clonedLaunches, err := contracts.Clone(launches)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	clonedRuns, err := contracts.Clone(runs)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	clonedReviews, err := contracts.Clone(reviews)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	clonedDiagnostics, err := contracts.Clone(store.diagnostics)
	return clonedLaunches, clonedRuns, clonedReviews, clonedDiagnostics, err
}

func (store *Store) PutReview(request contracts.PutReviewRequestV1, now time.Time) (contracts.ReviewV1, error) {
	if err := request.Validate(); err != nil {
		return contracts.ReviewV1{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	left, leftExists := store.runs[request.LeftRunID]
	right, rightExists := store.runs[request.RightRunID]
	if !leftExists || !rightExists {
		return contracts.ReviewV1{}, ErrRunNotFound
	}
	if !contracts.RunTerminal(left.Status) || !contracts.RunTerminal(right.Status) {
		return contracts.ReviewV1{}, errors.New("runstore: reviews require terminal runs")
	}
	review := contracts.ReviewV1{
		Version: contracts.ReviewVersion, LeftRunID: request.LeftRunID, RightRunID: request.RightRunID,
		PreferredRunID: request.PreferredRunID, Note: request.Note, UpdatedAt: now.UTC().Format(time.RFC3339Nano),
	}
	if err := review.Validate(); err != nil {
		return contracts.ReviewV1{}, err
	}
	replacement := make(map[string]contracts.ReviewV1, len(store.reviews)+1)
	for key, current := range store.reviews {
		replacement[key] = current
	}
	replacement[reviewKey(review.LeftRunID, review.RightRunID)] = review
	if err := store.writeReviews(replacement); err != nil {
		return contracts.ReviewV1{}, err
	}
	store.reviews = replacement
	return contracts.Clone(review)
}

func (store *Store) loadRuns() error {
	entries, err := os.ReadDir(store.runsRoot)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			if entry.IsDir() && strings.HasPrefix(entry.Name(), ".launch-") {
				_ = os.RemoveAll(filepath.Join(store.runsRoot, entry.Name()))
			}
			continue
		}
		if !entry.IsDir() || !contracts.ValidID(entry.Name()) {
			store.addDiagnostic("corrupt_runtime", "Ignored an invalid run-history entry.")
			continue
		}
		if err := store.loadLaunchDirectory(filepath.Join(store.runsRoot, entry.Name()), entry.Name()); err != nil {
			store.addDiagnostic("corrupt_runtime", fmt.Sprintf("Unable to read launch %s: %v", entry.Name(), err))
		}
	}
	return nil
}

func (store *Store) loadLaunchDirectory(root string, id string) error {
	launch, err := loadLaunchRecord(root, id)
	if err != nil {
		return err
	}
	loadedRuns := make([]contracts.RunV1, 0, len(launch.RunIDs))
	for _, runID := range launch.RunIDs {
		run, err := loadRunRecord(root, launch.ID, runID)
		if err != nil {
			return err
		}
		loadedRuns = append(loadedRuns, run)
	}
	store.launches[launch.ID] = launch
	for _, run := range loadedRuns {
		store.runs[run.ID] = run
		store.indexArtifacts(root, run)
	}
	return nil
}

func loadLaunchRecord(root string, id string) (contracts.LaunchV1, error) {
	data, err := durable.ReadRegular(filepath.Join(root, "launch.json"), maximumRecordBytes)
	if err != nil {
		return contracts.LaunchV1{}, err
	}
	var launch contracts.LaunchV1
	if err := contracts.DecodeStrict(data, &launch); err != nil {
		return contracts.LaunchV1{}, err
	}
	if err := launch.Validate(); err != nil || launch.ID != id {
		return contracts.LaunchV1{}, errors.New("runstore: launch record is invalid")
	}
	return launch, nil
}

func loadRunRecord(root string, launchID string, runID string) (contracts.RunV1, error) {
	path := filepath.Join(root, runID+".json")
	data, err := durable.ReadRegular(path, maximumRecordBytes)
	if err != nil {
		return contracts.RunV1{}, err
	}
	var run contracts.RunV1
	if err := contracts.DecodeStrict(data, &run); err != nil {
		return contracts.RunV1{}, err
	}
	if err := run.Validate(); err != nil || run.ID != runID || run.LaunchID != launchID {
		return contracts.RunV1{}, errors.New("runstore: run record is invalid")
	}
	if contracts.RunTerminal(run.Status) {
		return run, nil
	}
	run = interruptedRun(run, time.Now().UTC())
	if err := durable.WriteJSON(path, run, 0o600, maximumRecordBytes); err != nil {
		return contracts.RunV1{}, err
	}
	return run, nil
}

func interruptedRun(run contracts.RunV1, now time.Time) contracts.RunV1 {
	stamp := now.Format(time.RFC3339Nano)
	run.Status = "interrupted"
	run.CompletedAt = &stamp
	run.Error = &contracts.StructuredErrorV1{Code: "host_restarted", Message: "The Bench host stopped before this run became terminal."}
	for index := range run.CaseResults {
		if !caseTerminal(run.CaseResults[index].Status) {
			run.CaseResults[index].Status = "interrupted"
			run.CaseResults[index].CompletedAt = &stamp
			run.CaseResults[index].Error = &contracts.StructuredErrorV1{Code: "host_restarted", Message: "The Bench host stopped before this case became terminal."}
		}
	}
	return run
}

func (store *Store) loadReviews() error {
	data, err := durable.ReadRegular(store.reviewsPath, maximumRecordBytes)
	if errors.Is(err, os.ErrNotExist) {
		document := reviewDocument{Version: contracts.ReviewVersion, Reviews: []contracts.ReviewV1{}}
		return durable.WriteJSON(store.reviewsPath, document, 0o600, maximumRecordBytes)
	}
	if err != nil {
		return err
	}
	var document reviewDocument
	if err := contracts.DecodeStrict(data, &document); err != nil {
		return err
	}
	if document.Version != contracts.ReviewVersion || document.Reviews == nil {
		return errors.New("runstore: review document is invalid")
	}
	for _, review := range document.Reviews {
		if err := review.Validate(); err != nil {
			return err
		}
		store.reviews[reviewKey(review.LeftRunID, review.RightRunID)] = review
	}
	return nil
}

func (store *Store) writeReviews(reviews map[string]contracts.ReviewV1) error {
	values := make([]contracts.ReviewV1, 0, len(reviews))
	for _, review := range reviews {
		values = append(values, review)
	}
	sort.Slice(values, func(i, j int) bool {
		return reviewKey(values[i].LeftRunID, values[i].RightRunID) < reviewKey(values[j].LeftRunID, values[j].RightRunID)
	})
	return durable.WriteJSON(store.reviewsPath, reviewDocument{Version: contracts.ReviewVersion, Reviews: values}, 0o600, maximumRecordBytes)
}

func (store *Store) cleanStaging() error {
	entries, err := os.ReadDir(store.stagingRoot)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), ".execution-") {
			if err := os.RemoveAll(filepath.Join(store.stagingRoot, entry.Name())); err != nil {
				return err
			}
		}
	}
	return nil
}

func (store *Store) addDiagnostic(code string, message string) {
	if len(store.diagnostics) >= 100 {
		return
	}
	message = strings.ToValidUTF8(message, "�")
	if len(message) > 4096 {
		message = message[:4096]
		for !utf8.ValidString(message) {
			message = message[:len(message)-1]
		}
	}
	store.diagnostics = append(store.diagnostics, contracts.StructuredErrorV1{Code: code, Message: message})
}

func reviewKey(left string, right string) string {
	if left > right {
		left, right = right, left
	}
	return left + "\x00" + right
}

func equalOptional(left *string, right *string) bool {
	return left == nil && right == nil || left != nil && right != nil && *left == *right
}

func caseTerminal(status string) bool {
	switch status {
	case "succeeded", "failed", "canceled", "timed_out", "interrupted":
		return true
	default:
		return false
	}
}

func equalCaseResult(left contracts.CaseResultV1, right contracts.CaseResultV1) bool {
	return reflect.DeepEqual(left, right)
}

func randomID(prefix string) (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return prefix + "-" + hex.EncodeToString(value), nil
}

func copyBounded(destination string, source io.Reader, maximum int64) (int64, string, error) {
	file, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return 0, "", err
	}
	hash := newSHA256()
	written, copyErr := io.Copy(io.MultiWriter(file, hash), io.LimitReader(source, maximum+1))
	if written > maximum {
		copyErr = errors.New("runstore: artifact exceeds the byte limit")
	}
	if copyErr == nil {
		copyErr = file.Sync()
	}
	closeErr := file.Close()
	if copyErr == nil {
		copyErr = closeErr
	}
	if copyErr != nil {
		_ = os.Remove(destination)
		return 0, "", copyErr
	}
	return written, hex.EncodeToString(hash.Sum(nil)), nil
}
