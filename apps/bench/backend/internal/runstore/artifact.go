package runstore

import (
	"crypto/sha256"
	"errors"
	"hash"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/setta/bench/backend/internal/contracts"
	"github.com/setta/bench/backend/internal/durable"
)

type artifactAdoption struct {
	stagingRoot     string
	destinationRoot string
	accepted        []contracts.ArtifactReferenceV1
	created         []string
	total           int64
}

func (store *Store) AdoptArtifacts(launchID string, runID string, caseID string, stagingRoot string, artifacts []contracts.CandidateArtifactV1) ([]contracts.ArtifactReferenceV1, error) {
	if err := validateArtifactAdoption(launchID, runID, caseID, artifacts); err != nil {
		return nil, err
	}
	canonicalStaging, err := admittedStagingRoot(stagingRoot)
	if err != nil {
		return nil, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.validateArtifactOwner(launchID, runID, caseID); err != nil {
		return nil, err
	}
	destinationRoot := filepath.Join(store.runsRoot, launchID, "artifacts", runID, caseID)
	if err := os.MkdirAll(destinationRoot, 0o700); err != nil {
		return nil, err
	}
	adoption := &artifactAdoption{
		stagingRoot: canonicalStaging, destinationRoot: destinationRoot,
		accepted: make([]contracts.ArtifactReferenceV1, 0, len(artifacts)), created: make([]string, 0, len(artifacts)),
	}
	if err := adoption.adoptAll(artifacts); err != nil {
		return nil, err
	}
	if err := adoption.syncTo(filepath.Join(store.runsRoot, launchID)); err != nil {
		adoption.rollback()
		return nil, err
	}
	for index, reference := range adoption.accepted {
		store.artifacts[reference.ID] = artifactRecord{reference: reference, path: adoption.created[index]}
	}
	return contracts.Clone(adoption.accepted)
}

func validateArtifactAdoption(launchID string, runID string, caseID string, artifacts []contracts.CandidateArtifactV1) error {
	if !contracts.ValidID(launchID) || !contracts.ValidID(runID) || !contracts.ValidID(caseID) || len(artifacts) > contracts.MaximumArtifacts {
		return errors.New("runstore: artifact adoption identity is invalid")
	}
	return nil
}

func admittedStagingRoot(stagingRoot string) (string, error) {
	canonicalStaging, err := filepath.EvalSymlinks(stagingRoot)
	if err != nil {
		return "", err
	}
	if err := durable.RequireDirectory(canonicalStaging); err != nil {
		return "", err
	}
	return canonicalStaging, nil
}

func (store *Store) validateArtifactOwner(launchID string, runID string, caseID string) error {
	run, exists := store.runs[runID]
	if !exists || run.LaunchID != launchID {
		return ErrRunNotFound
	}
	for _, result := range run.CaseResults {
		if result.CaseID == caseID {
			return nil
		}
	}
	return errors.New("runstore: artifact case was not found")
}

func (adoption *artifactAdoption) adoptAll(artifacts []contracts.CandidateArtifactV1) error {
	for _, artifact := range artifacts {
		if err := adoption.adopt(artifact); err != nil {
			adoption.rollback()
			return err
		}
	}
	return nil
}

func (adoption *artifactAdoption) adopt(artifact contracts.CandidateArtifactV1) error {
	if err := artifact.Validate(); err != nil {
		return err
	}
	source, err := admittedArtifactPath(adoption.stagingRoot, artifact.Path)
	if err != nil {
		return err
	}
	input, err := openArtifactSource(source)
	if err != nil {
		return err
	}
	id, err := randomID("artifact")
	if err != nil {
		_ = input.Close()
		return err
	}
	destination := filepath.Join(adoption.destinationRoot, id+".artifact")
	length, digest, err := copyArtifactSource(destination, input)
	if err != nil {
		return err
	}
	if adoption.total+length > contracts.MaximumCaseArtifactBytes {
		_ = os.Remove(destination)
		return errors.New("runstore: case artifacts exceed the byte limit")
	}
	reference := contracts.ArtifactReferenceV1{ID: id, Name: artifact.Name, MediaType: artifact.MediaType, ByteLength: length, SHA256: digest}
	if err := reference.Validate(); err != nil {
		_ = os.Remove(destination)
		return err
	}
	adoption.total += length
	adoption.created = append(adoption.created, destination)
	adoption.accepted = append(adoption.accepted, reference)
	return nil
}

func openArtifactSource(source string) (*os.File, error) {
	entry, err := os.Lstat(source)
	if err != nil || entry.Mode()&os.ModeSymlink != 0 || !entry.Mode().IsRegular() {
		return nil, errors.New("runstore: artifact is not a regular file")
	}
	input, err := os.Open(source)
	if err != nil {
		return nil, err
	}
	opened, err := input.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(entry, opened) {
		_ = input.Close()
		return nil, errors.New("runstore: artifact is not a regular file")
	}
	return input, nil
}

func copyArtifactSource(destination string, input *os.File) (int64, string, error) {
	length, digest, copyErr := copyBounded(destination, input, contracts.MaximumArtifactBytes)
	closeErr := input.Close()
	return length, digest, errors.Join(copyErr, closeErr)
}

func (adoption *artifactAdoption) syncTo(launchRoot string) error {
	for directory := adoption.destinationRoot; ; directory = filepath.Dir(directory) {
		if err := durable.SyncDirectory(directory); err != nil {
			return err
		}
		if directory == launchRoot {
			return nil
		}
	}
}

func (adoption *artifactAdoption) rollback() {
	for _, path := range adoption.created {
		_ = os.Remove(path)
	}
}

func (store *Store) OpenArtifact(id string) (contracts.ArtifactReferenceV1, io.ReadCloser, error) {
	if !contracts.ValidID(id) {
		return contracts.ArtifactReferenceV1{}, nil, ErrArtifactNotFound
	}
	store.mu.Lock()
	record, exists := store.artifacts[id]
	store.mu.Unlock()
	if !exists {
		return contracts.ArtifactReferenceV1{}, nil, ErrArtifactNotFound
	}
	entry, err := os.Lstat(record.path)
	if err != nil || entry.Mode()&os.ModeSymlink != 0 || !entry.Mode().IsRegular() || entry.Size() != record.reference.ByteLength {
		return contracts.ArtifactReferenceV1{}, nil, ErrArtifactNotFound
	}
	file, err := os.Open(record.path)
	if err != nil {
		return contracts.ArtifactReferenceV1{}, nil, ErrArtifactNotFound
	}
	opened, err := file.Stat()
	if err != nil || !os.SameFile(entry, opened) {
		_ = file.Close()
		return contracts.ArtifactReferenceV1{}, nil, ErrArtifactNotFound
	}
	return record.reference, file, nil
}

func (store *Store) indexArtifacts(launchRoot string, run contracts.RunV1) {
	for _, result := range run.CaseResults {
		for _, reference := range result.Artifacts {
			path := filepath.Join(launchRoot, "artifacts", run.ID, result.CaseID, reference.ID+".artifact")
			store.artifacts[reference.ID] = artifactRecord{reference: reference, path: path}
		}
	}
}

func admittedArtifactPath(root string, relative string) (string, error) {
	if !validArtifactPath(relative) {
		return "", errors.New("runstore: artifact path is invalid")
	}
	joined := filepath.Join(root, filepath.FromSlash(relative))
	entry, err := os.Lstat(joined)
	if err != nil || entry.Mode()&os.ModeSymlink != 0 || !entry.Mode().IsRegular() {
		return "", errors.New("runstore: artifact path is not a regular file")
	}
	resolved, err := filepath.EvalSymlinks(joined)
	if err != nil {
		return "", err
	}
	if !withinArtifactRoot(root, resolved) {
		return "", errors.New("runstore: artifact escapes its staging directory")
	}
	return resolved, nil
}

func validArtifactPath(relative string) bool {
	return relative != "" && !filepath.IsAbs(relative) && filepath.Clean(relative) == relative && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func withinArtifactRoot(root string, candidate string) bool {
	relation, err := filepath.Rel(root, candidate)
	return err == nil && !filepath.IsAbs(relation) && relation != ".." && !strings.HasPrefix(relation, ".."+string(filepath.Separator))
}

func newSHA256() hash.Hash {
	return sha256.New()
}
