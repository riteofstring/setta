package project

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/setta/experiment-lens/backend/internal/contracts"
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
	canonical, err := canonicalRoot(root)
	if err != nil {
		return nil, err
	}
	manifestBytes, err := ReadConfinedRegular(canonical, "experiment.json", maximumManifestBytes)
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
	sourceBytes, err := ReadConfinedRegular(canonical, manifest.Observations.Path, manifest.Observations.ByteLength)
	if err != nil {
		return nil, fmt.Errorf("project: read observations: %w", err)
	}
	if int64(len(sourceBytes)) != manifest.Observations.ByteLength {
		return nil, errors.New("project: observation source byte length does not match")
	}
	sourceDigest := sha256.Sum256(sourceBytes)
	sourceSHA := hex.EncodeToString(sourceDigest[:])
	if sourceSHA != manifest.Observations.SHA256 {
		return nil, errors.New("project: observation source digest does not match")
	}
	var source contracts.ObservationSource
	if err := contracts.DecodeStrict(sourceBytes, &source); err != nil {
		return nil, fmt.Errorf("project: decode observations: %w", err)
	}
	if err := source.ValidateAgainst(manifest); err != nil {
		return nil, fmt.Errorf("project: validate observations: %w", err)
	}
	manifestDigest := sha256.Sum256(manifestBytes)
	catalog := &Catalog{
		root:           canonical,
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
	file, info, err := OpenConfinedRegular(root, relative)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if info.Size() > maximum {
		return nil, errors.New("project: file exceeds the admitted size limit")
	}
	data, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maximum {
		return nil, errors.New("project: file exceeds the admitted size limit")
	}
	return data, nil
}

func OpenConfinedRegular(root string, relative string) (*os.File, os.FileInfo, error) {
	cleaned, err := cleanRelative(relative)
	if err != nil {
		return nil, nil, err
	}
	current := root
	for _, part := range strings.Split(cleaned, string(filepath.Separator)) {
		current = filepath.Join(current, part)
		info, inspectErr := os.Lstat(current)
		if inspectErr != nil {
			return nil, nil, inspectErr
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil, nil, errors.New("project: symlink paths are not admitted")
		}
	}
	info, err := os.Lstat(current)
	if err != nil {
		return nil, nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, nil, errors.New("project: path is not a regular file")
	}
	file, err := os.Open(current)
	if err != nil {
		return nil, nil, err
	}
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(info, opened) {
		file.Close()
		return nil, nil, errors.New("project: file identity changed while opening")
	}
	return file, opened, nil
}

func canonicalRoot(root string) (string, error) {
	if root == "" || root != strings.TrimSpace(root) || strings.ContainsRune(root, '\x00') {
		return "", errors.New("project: root is invalid")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("project: resolve root: %w", err)
	}
	canonical, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("project: canonicalize root: %w", err)
	}
	info, err := os.Stat(canonical)
	if err != nil || !info.IsDir() {
		return "", errors.New("project: root is not a directory")
	}
	return canonical, nil
}

func cleanRelative(relative string) (string, error) {
	if relative == "" || relative != strings.TrimSpace(relative) || filepath.IsAbs(relative) || strings.ContainsRune(relative, '\x00') || strings.Contains(relative, "\\") {
		return "", errors.New("project: path escapes the project root")
	}
	cleaned := filepath.Clean(filepath.FromSlash(relative))
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", errors.New("project: path escapes the project root")
	}
	return cleaned, nil
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
