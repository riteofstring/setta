package project

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"

	"github.com/riteofstring/setta/apps/review/backend/internal/contracts"
	"github.com/riteofstring/setta/packages/local-backend/projectfs"
)

const maximumRequestBytes = 4 << 20

type AdmittedRequest struct {
	Path     string
	SHA256   string
	Document contracts.ReviewRequest
	bytes    []byte
}

type Catalog struct {
	root       string
	manifest   contracts.ProjectManifest
	requestIDs []string
	requests   map[string]AdmittedRequest
}

func Open(root string) (*Catalog, error) {
	projectRoot, err := projectfs.Open(root)
	if err != nil {
		return nil, fmt.Errorf("project: open root: %w", projectFileError(err))
	}
	defer projectRoot.Close()
	manifestBytes, err := readConfinedRegular(projectRoot, "review.json", maximumRequestBytes)
	if err != nil {
		return nil, fmt.Errorf("project: read manifest: %w", err)
	}
	var manifest contracts.ProjectManifest
	if err := contracts.DecodeStrict(manifestBytes, &manifest); err != nil {
		return nil, fmt.Errorf("project: decode manifest: %w", err)
	}
	if err := manifest.Validate(); err != nil {
		return nil, fmt.Errorf("project: validate manifest: %w", err)
	}
	catalog := &Catalog{
		root:       projectRoot.Path(),
		manifest:   manifest,
		requestIDs: make([]string, 0, len(manifest.Requests)),
		requests:   make(map[string]AdmittedRequest, len(manifest.Requests)),
	}
	for _, path := range manifest.Requests {
		request, err := admitRequest(projectRoot, path)
		if err != nil {
			return nil, err
		}
		if _, exists := catalog.requests[request.Document.ID]; exists {
			return nil, fmt.Errorf("project: request id %q is duplicated", request.Document.ID)
		}
		catalog.requestIDs = append(catalog.requestIDs, request.Document.ID)
		catalog.requests[request.Document.ID] = request
	}
	return catalog, nil
}

func (catalog *Catalog) Root() string {
	return catalog.root
}

func (catalog *Catalog) Manifest() (contracts.ProjectManifest, error) {
	return clone(catalog.manifest)
}

func (catalog *Catalog) Requests() ([]AdmittedRequest, error) {
	requests := make([]AdmittedRequest, 0, len(catalog.requestIDs))
	for _, id := range catalog.requestIDs {
		request, err := cloneAdmitted(catalog.requests[id])
		if err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}
	return requests, nil
}

func (catalog *Catalog) Request(id string) (AdmittedRequest, bool, error) {
	request, found := catalog.requests[id]
	if !found {
		return AdmittedRequest{}, false, nil
	}
	cloned, err := cloneAdmitted(request)
	return cloned, true, err
}

func (catalog *Catalog) Evidence(requestID string, evidenceID string) (contracts.EvidenceReference, bool, error) {
	request, found := catalog.requests[requestID]
	if !found {
		return contracts.EvidenceReference{}, false, nil
	}
	for _, reference := range request.Document.Evidence {
		if reference.ID == evidenceID {
			cloned, err := clone(reference)
			return cloned, true, err
		}
	}
	return contracts.EvidenceReference{}, false, nil
}

func (request AdmittedRequest) Bytes() []byte {
	return append([]byte(nil), request.bytes...)
}

func admitRequest(root *projectfs.Root, path string) (AdmittedRequest, error) {
	data, err := readConfinedRegular(root, path, maximumRequestBytes)
	if err != nil {
		return AdmittedRequest{}, fmt.Errorf("project: read request %q: %w", path, err)
	}
	var request contracts.ReviewRequest
	if err := contracts.DecodeStrict(data, &request); err != nil {
		return AdmittedRequest{}, fmt.Errorf("project: decode request %q: %w", path, err)
	}
	if err := request.Validate(); err != nil {
		return AdmittedRequest{}, fmt.Errorf("project: validate request %q: %w", path, err)
	}
	digest := sha256.Sum256(data)
	return AdmittedRequest{
		Path:     filepath.ToSlash(filepath.Clean(path)),
		SHA256:   hex.EncodeToString(digest[:]),
		Document: request,
		bytes:    append([]byte(nil), data...),
	}, nil
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

func cloneAdmitted(request AdmittedRequest) (AdmittedRequest, error) {
	document, err := clone(request.Document)
	if err != nil {
		return AdmittedRequest{}, err
	}
	return AdmittedRequest{
		Path:     request.Path,
		SHA256:   request.SHA256,
		Document: document,
		bytes:    append([]byte(nil), request.bytes...),
	}, nil
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
