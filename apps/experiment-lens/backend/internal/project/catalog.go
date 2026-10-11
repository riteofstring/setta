package project

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/contracts"
	"github.com/riteofstring/setta/packages/local-backend/projectfs"
)

const maximumManifestBytes = 4 << 20

type Catalog struct {
	root           string
	manifest       contracts.ExperimentManifest
	manifestSHA256 string
	source         contracts.ObservationSource
	sourceSHA256   string
	artifacts      map[string]contracts.ArtifactReference
	observations   map[string]contracts.Observation
}

func Open(root string) (*Catalog, error) {
	projectRoot, err := projectfs.Open(root)
	if err != nil {
		return nil, fmt.Errorf("project: open root: %w", projectFileError(err))
	}
	defer projectRoot.Close()
	manifestBytes, err := readConfinedRegular(projectRoot, "experiment.json", maximumManifestBytes)
	if err != nil {
		return nil, fmt.Errorf("project: read manifest: %w", err)
	}
	var manifest contracts.ExperimentManifest
	if err := contracts.DecodeStrict(manifestBytes, &manifest); err != nil {
		return nil, fmt.Errorf("project: decode manifest: %w", err)
	}
	if err := manifest.Validate(); err != nil {
		return nil, fmt.Errorf("project: validate manifest: %w", err)
	}
	source, sourceSHA, err := loadObservationSource(projectRoot, manifest)
	if err != nil {
		return nil, err
	}
	manifestDigest := sha256.Sum256(manifestBytes)
	catalog := &Catalog{
		root:           projectRoot.Path(),
		manifest:       manifest,
		manifestSHA256: hex.EncodeToString(manifestDigest[:]),
		source:         source,
		sourceSHA256:   sourceSHA,
		artifacts:      make(map[string]contracts.ArtifactReference, len(manifest.Artifacts)),
		observations:   make(map[string]contracts.Observation, len(source.Observations)),
	}
	for _, artifact := range manifest.Artifacts {
		catalog.artifacts[artifact.ID] = artifact
	}
	for _, observation := range source.Observations {
		catalog.observations[observation.ID] = observation
	}
	return catalog, nil
}

func loadObservationSource(root *projectfs.Root, manifest contracts.ExperimentManifest) (contracts.ObservationSource, string, error) {
	sourceBytes, err := readConfinedRegular(root, manifest.Observations.Path, manifest.Observations.ByteLength)
	if err != nil {
		return contracts.ObservationSource{}, "", fmt.Errorf("project: read observations: %w", err)
	}
	if int64(len(sourceBytes)) != manifest.Observations.ByteLength {
		return contracts.ObservationSource{}, "", errors.New("project: observation source byte length does not match")
	}
	sourceDigest := sha256.Sum256(sourceBytes)
	sourceSHA := hex.EncodeToString(sourceDigest[:])
	if sourceSHA != manifest.Observations.SHA256 {
		return contracts.ObservationSource{}, "", errors.New("project: observation source digest does not match")
	}
	var source contracts.ObservationSource
	if err := contracts.DecodeStrict(sourceBytes, &source); err != nil {
		return contracts.ObservationSource{}, "", fmt.Errorf("project: decode observations: %w", err)
	}
	if err := source.ValidateAgainst(manifest); err != nil {
		return contracts.ObservationSource{}, "", fmt.Errorf("project: validate observations: %w", err)
	}
	return source, sourceSHA, nil
}

func (catalog *Catalog) Root() string {
	return catalog.root
}

func (catalog *Catalog) Manifest() (contracts.ExperimentManifest, error) {
	return clone(catalog.manifest)
}

func (catalog *Catalog) ManifestSHA256() string {
	return catalog.manifestSHA256
}

func (catalog *Catalog) Source() (contracts.ObservationSource, error) {
	return clone(catalog.source)
}

func (catalog *Catalog) SourceSHA256() string {
	return catalog.sourceSHA256
}

func (catalog *Catalog) Artifact(id string) (contracts.ArtifactReference, bool, error) {
	reference, exists := catalog.artifacts[id]
	if !exists {
		return contracts.ArtifactReference{}, false, nil
	}
	copy, err := clone(reference)
	return copy, true, err
}

func (catalog *Catalog) Observation(id string) (contracts.Observation, bool, error) {
	observation, exists := catalog.observations[id]
	if !exists {
		return contracts.Observation{}, false, nil
	}
	copy, err := clone(observation)
	return copy, true, err
}

func ReadConfinedRegular(root string, relative string, maximum int64) ([]byte, error) {
	projectRoot, err := projectfs.Open(root)
	if err != nil {
		return nil, err
	}
	defer projectRoot.Close()
	return readConfinedRegular(projectRoot, relative, maximum)
}

func OpenConfinedRegular(root string, relative string) (*os.File, os.FileInfo, error) {
	projectRoot, err := projectfs.Open(root)
	if err != nil {
		return nil, nil, err
	}
	file, info, openErr := projectRoot.OpenRegular(relative)
	closeErr := projectRoot.Close()
	if openErr != nil {
		return nil, nil, projectFileError(openErr)
	}
	if closeErr != nil {
		_ = file.Close()
		return nil, nil, closeErr
	}
	return file, info, nil
}

func readConfinedRegular(root *projectfs.Root, relative string, maximum int64) ([]byte, error) {
	data, err := root.ReadRegular(relative, maximum)
	return data, projectFileError(err)
}

func projectFileError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, projectfs.ErrInvalidPath):
		return fmt.Errorf("project: path escapes the project root: %w", err)
	case errors.Is(err, projectfs.ErrIrregularPath):
		return fmt.Errorf("project: symlink or irregular path is not admitted: %w", err)
	case errors.Is(err, projectfs.ErrMaximumSize):
		return fmt.Errorf("project: file exceeds the admitted size limit: %w", err)
	default:
		return err
	}
}

func clone[T any](value T) (T, error) {
	var cloned T
	encoded, err := json.Marshal(value)
	if err != nil {
		return cloned, fmt.Errorf("project: clone encode: %w", err)
	}
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return cloned, fmt.Errorf("project: clone decode: %w", err)
	}
	return cloned, nil
}
