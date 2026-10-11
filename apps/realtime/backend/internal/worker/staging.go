package worker

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
)

type ContentOpener interface {
	Open(contracts.ContentReference) (io.ReadCloser, error)
}

type invocationScope struct {
	identity contracts.InvocationIdentity
	root     string
}

func stageInvocation(root string, opener ContentOpener, params contracts.InvokeParams) (contracts.InvokeParams, string, error) {
	if err := validateInvokeParams(params); err != nil {
		return contracts.InvokeParams{}, "", err
	}
	invocationRoot := filepath.Join(root, params.Identity.InvocationID)
	if err := os.Mkdir(invocationRoot, 0o700); err != nil {
		return contracts.InvokeParams{}, "", fmt.Errorf("worker: create invocation staging: %w", err)
	}
	complete := false
	defer func() {
		if !complete {
			_ = os.RemoveAll(invocationRoot)
		}
	}()
	references, paths, err := stageReferences(invocationRoot, opener, params.Content)
	if err != nil {
		return contracts.InvokeParams{}, "", err
	}
	arguments, err := rewriteArguments(params.Arguments, references, paths)
	if err != nil {
		return contracts.InvokeParams{}, "", err
	}
	params.Arguments = arguments
	complete = true
	return params, invocationRoot, nil
}

func stageReferences(root string, opener ContentOpener, content []contracts.ContentReference) (map[string]contracts.ContentReference, map[string]string, error) {
	paths := make(map[string]string, len(content))
	references := make(map[string]contracts.ContentReference, len(content))
	if len(content) > 0 && opener == nil {
		return nil, nil, errors.New("worker: content opener is required")
	}
	for _, reference := range content {
		if previous, exists := references[reference.ID]; exists {
			if previous != reference {
				return nil, nil, errors.New("worker: content reference identity is ambiguous")
			}
			continue
		}
		path, err := stageContent(root, opener, reference)
		if err != nil {
			return nil, nil, err
		}
		references[reference.ID] = reference
		paths[reference.ID] = path
	}
	return references, paths, nil
}

func rewriteArguments(source map[string]json.RawMessage, references map[string]contracts.ContentReference, paths map[string]string) (map[string]json.RawMessage, error) {
	arguments := make(map[string]json.RawMessage, len(source))
	for name, raw := range source {
		value, err := decodePortableValue(raw)
		if err != nil {
			return nil, fmt.Errorf("worker: decode argument %s: %w", name, err)
		}
		rewritten, err := rewriteContentReferences(value, references, paths)
		if err != nil {
			return nil, fmt.Errorf("worker: rewrite argument %s: %w", name, err)
		}
		encoded, err := json.Marshal(rewritten)
		if err != nil {
			return nil, fmt.Errorf("worker: encode argument %s: %w", name, err)
		}
		arguments[name] = encoded
	}
	return arguments, nil
}

func stageContent(root string, opener ContentOpener, reference contracts.ContentReference) (string, error) {
	reader, err := opener.Open(reference)
	if err != nil {
		return "", fmt.Errorf("worker: open staged content %s: %w", reference.ID, err)
	}
	defer reader.Close()
	directory := filepath.Join(root, "content")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", fmt.Errorf("worker: create content staging: %w", err)
	}
	path := filepath.Join(directory, reference.ID+".content")
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", fmt.Errorf("worker: create staged content: %w", err)
	}
	hash := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(file, hash), io.LimitReader(reader, reference.ByteLength+1))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		return "", fmt.Errorf("worker: copy staged content: %w", errors.Join(copyErr, closeErr))
	}
	if written != reference.ByteLength || !strings.EqualFold(hex.EncodeToString(hash.Sum(nil)), reference.SHA256) {
		return "", errors.New("worker: staged content does not match its reference")
	}
	return path, nil
}

func decodePortableValue(raw json.RawMessage) (any, error) {
	if err := validateUniqueJSON(raw); err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	return value, nil
}

func rewriteContentReferences(value any, references map[string]contracts.ContentReference, paths map[string]string) (any, error) {
	switch typed := value.(type) {
	case []any:
		return rewriteContentReferenceList(typed, references, paths)
	case map[string]any:
		return rewriteContentReferenceMap(typed, references, paths)
	default:
		return value, nil
	}
}

func rewriteContentReferenceList(values []any, references map[string]contracts.ContentReference, paths map[string]string) ([]any, error) {
	for index, item := range values {
		rewritten, err := rewriteContentReferences(item, references, paths)
		if err != nil {
			return nil, err
		}
		values[index] = rewritten
	}
	return values, nil
}

func rewriteContentReferenceMap(value map[string]any, references map[string]contracts.ContentReference, paths map[string]string) (map[string]any, error) {
	if contentReferenceObject(value) {
		return rewriteContentReference(value, references, paths)
	}
	for name, item := range value {
		rewritten, err := rewriteContentReferences(item, references, paths)
		if err != nil {
			return nil, err
		}
		value[name] = rewritten
	}
	return value, nil
}

func rewriteContentReference(value map[string]any, references map[string]contracts.ContentReference, paths map[string]string) (map[string]any, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var reference contracts.ContentReference
	if err := contracts.DecodeStrict(encoded, &reference); err != nil {
		return nil, err
	}
	if err := reference.Validate(); err != nil {
		return nil, err
	}
	staged, exists := references[reference.ID]
	if !exists || staged != reference {
		return nil, errors.New("content reference was not staged for this invocation")
	}
	value["path"] = paths[reference.ID]
	return value, nil
}

func contentReferenceObject(value map[string]any) bool {
	for _, name := range []string{"id", "mediaType", "byteLength", "sha256", "invocationId"} {
		if _, exists := value[name]; !exists {
			return false
		}
	}
	return true
}

func openScopedArtifact(scope invocationScope, identity contracts.InvocationIdentity, value string) (io.ReadCloser, string, error) {
	if !validScopedArtifactRequest(scope, identity, value) {
		return nil, "", errors.New("worker: artifact path is invalid")
	}
	_, candidate, err := resolveScopedArtifact(scope.root, value)
	if err != nil {
		return nil, "", err
	}
	file, err := openRegularArtifact(candidate)
	if err != nil {
		return nil, "", err
	}
	return file, candidate, nil
}

func validScopedArtifactRequest(scope invocationScope, identity contracts.InvocationIdentity, value string) bool {
	return scope.identity == identity && strings.TrimSpace(value) != "" && value == strings.TrimSpace(value) && !strings.ContainsRune(value, '\x00')
}

func resolveScopedArtifact(scopeRoot string, value string) (string, string, error) {
	root, err := filepath.EvalSymlinks(scopeRoot)
	if err != nil {
		return "", "", errors.New("worker: invocation staging is unavailable")
	}
	candidate := value
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(root, candidate)
	}
	candidate, err = filepath.EvalSymlinks(filepath.Clean(candidate))
	if err != nil {
		return "", "", errors.New("worker: artifact is unavailable")
	}
	relative, err := filepath.Rel(root, candidate)
	if err != nil || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", "", errors.New("worker: artifact leaves invocation staging")
	}
	return root, candidate, nil
}

func openRegularArtifact(candidate string) (io.ReadCloser, error) {
	file, err := os.Open(candidate)
	if err != nil {
		return nil, errors.New("worker: artifact is unavailable")
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		_ = file.Close()
		return nil, errors.New("worker: artifact is not a regular file")
	}
	return file, nil
}
