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

	"github.com/setta/review/backend/internal/contracts"
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
	canonical, err := canonicalRoot(root)
	if err != nil {
		return nil, err
	}
	manifestBytes, err := readConfinedRegular(canonical, "review.json", maximumRequestBytes)
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
		root:       canonical,
		manifest:   manifest,
		requestIDs: make([]string, 0, len(manifest.Requests)),
		requests:   make(map[string]AdmittedRequest, len(manifest.Requests)),
	}
	for _, path := range manifest.Requests {
		request, err := admitRequest(canonical, path)
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

func admitRequest(root string, path string) (AdmittedRequest, error) {
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

func readConfinedRegular(root string, relative string, maximum int64) ([]byte, error) {
	cleaned, err := cleanRelative(relative)
	if err != nil {
		return nil, err
	}
	current := root
	for _, part := range strings.Split(cleaned, string(filepath.Separator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return nil, err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil, errors.New("project: symlink paths are not admitted")
		}
	}
	info, err := os.Lstat(current)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("project: path is not a regular file")
	}
	if info.Size() > maximum {
		return nil, errors.New("project: file exceeds the admitted size limit")
	}
	file, err := os.Open(current)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := readBounded(file, maximum)
	if err != nil {
		return nil, err
	}
	return data, nil
}

func cleanRelative(relative string) (string, error) {
	if relative == "" || relative != strings.TrimSpace(relative) || filepath.IsAbs(relative) || strings.ContainsRune(relative, '\x00') {
		return "", errors.New("project: path escapes the project root")
	}
	cleaned := filepath.Clean(relative)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", errors.New("project: path escapes the project root")
	}
	return cleaned, nil
}

func readBounded(file *os.File, maximum int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maximum {
		return nil, errors.New("project: file exceeds the admitted size limit")
	}
	return data, nil
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
