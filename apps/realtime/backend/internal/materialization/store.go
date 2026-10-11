package materialization

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
)

const (
	manifestVersion          = 1
	maximumManifestBytes     = 16 << 20
	maximumMaterializedBytes = 512 << 20
	maximumReferences        = 1024
)

var (
	ErrNotFound = errors.New("materialization: retained result was not found")
	ErrCorrupt  = errors.New("materialization: retained result is corrupt")
	ErrCapacity = errors.New("materialization: durable store capacity is exhausted")
)

type ContentOpener interface {
	Open(contracts.ContentReference) (io.ReadCloser, error)
}

type ContentWriter interface {
	Put(string, string, io.Reader) (contracts.ContentReference, error)
}

type Restored struct {
	Fingerprint string
	Outputs     map[string]json.RawMessage
	Content     []contracts.ContentReference
}

type contentRecord struct {
	Reference contracts.ContentReference `json:"reference"`
	Path      string                     `json:"path"`
}

type manifest struct {
	Version     int                        `json:"version"`
	BindingID   string                     `json:"bindingId"`
	Fingerprint string                     `json:"fingerprint"`
	Outputs     map[string]json.RawMessage `json:"outputs"`
	Content     []contentRecord            `json:"content"`
}

type Store struct {
	mu           sync.Mutex
	root         string
	manifestRoot string
	contentRoot  string
	maximumBytes int64
}

func Open(root string) (*Store, error) {
	resolved, err := resolveRoot(root)
	if err != nil {
		return nil, err
	}
	store := &Store{
		root:         resolved,
		manifestRoot: filepath.Join(resolved, "manifests"),
		contentRoot:  filepath.Join(resolved, "content"),
		maximumBytes: maximumStoreBytes,
	}
	if err := store.ensureDirectories(); err != nil {
		return nil, err
	}
	return store, nil
}

func (store *Store) Replace(bindingID string, fingerprint string, outputs map[string]json.RawMessage, opener ContentOpener) error {
	candidate, references, err := prepareReplacement(bindingID, fingerprint, outputs, opener)
	if err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.replaceLocked(candidate, references, opener)
}

func prepareReplacement(bindingID string, fingerprint string, outputs map[string]json.RawMessage, opener ContentOpener) (manifest, []contracts.ContentReference, error) {
	if opener == nil {
		return manifest{}, nil, errors.New("materialization: content opener is required")
	}
	if err := validateBindingID(bindingID); err != nil {
		return manifest{}, nil, err
	}
	if err := validateFingerprint(fingerprint); err != nil {
		return manifest{}, nil, err
	}
	cloned, references, err := prepareOutputs(outputs)
	if err != nil {
		return manifest{}, nil, fmt.Errorf("materialization: validate outputs: %w", err)
	}
	if err := validateReferenceCapacity(references); err != nil {
		return manifest{}, nil, err
	}
	return manifest{
		Version: manifestVersion, BindingID: bindingID, Fingerprint: fingerprint,
		Outputs: cloned, Content: []contentRecord{},
	}, references, nil
}

func (store *Store) replaceLocked(candidate manifest, references []contracts.ContentReference, opener ContentOpener) error {
	if err := store.ensureDirectories(); err != nil {
		return err
	}
	bindingKey := bindingKey(candidate.BindingID)
	if err := store.validateBindingContent(bindingKey); err != nil {
		return err
	}
	if err := store.ensureReplacementCapacity(bindingKey, candidate, references); err != nil {
		return err
	}
	generation, records, err := store.stageContent(bindingKey, references, opener)
	if err != nil {
		return err
	}
	installed := false
	if generation != "" {
		defer func() {
			if !installed {
				_ = os.RemoveAll(filepath.Join(store.contentRoot, bindingKey, generation))
			}
		}()
	}
	candidate.Content = records
	if err := validateManifest(candidate, candidate.BindingID, bindingKey); err != nil {
		return fmt.Errorf("materialization: validate replacement: %w", err)
	}
	manifestInstalled, err := store.installManifest(bindingKey, candidate)
	installed = manifestInstalled
	if err != nil {
		return err
	}
	if err := store.cleanupBindingContent(bindingKey, generation); err != nil {
		return fmt.Errorf("materialization: clean replaced content: %w", err)
	}
	return nil
}

func (store *Store) Restore(bindingID string, invocationID string, writer ContentWriter) (Restored, error) {
	if writer == nil {
		return Restored{}, errors.New("materialization: content writer is required")
	}
	if err := validateBindingID(bindingID); err != nil {
		return Restored{}, err
	}
	if err := validateBindingID(invocationID); err != nil {
		return Restored{}, errors.New("materialization: invocation id is invalid")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.ensureDirectories(); err != nil {
		return Restored{}, err
	}
	bindingKey := bindingKey(bindingID)
	retained, err := store.readManifest(bindingID, bindingKey)
	if err != nil {
		return Restored{}, err
	}
	if err := store.verifyContent(bindingKey, retained.Content); err != nil {
		return Restored{}, err
	}
	fresh, content, err := store.restoreContent(invocationID, bindingKey, retained.Content, writer)
	if err != nil {
		return Restored{Fingerprint: retained.Fingerprint, Content: content}, err
	}
	rewritten, err := rewriteOutputs(retained.Outputs, fresh)
	if err != nil {
		return Restored{Fingerprint: retained.Fingerprint, Content: content}, corrupt("rewrite outputs: %v", err)
	}
	return Restored{Fingerprint: retained.Fingerprint, Outputs: rewritten, Content: content}, nil
}

func (store *Store) Delete(bindingID string) error {
	if err := validateBindingID(bindingID); err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.ensureDirectories(); err != nil {
		return err
	}
	key := bindingKey(bindingID)
	removed, err := removeRegularFile(store.manifestPath(key))
	if err != nil {
		return corrupt("remove manifest: %v", err)
	}
	if removed {
		if err := syncDirectory(store.manifestRoot); err != nil {
			return err
		}
	}
	return store.removeBindingContent(key)
}

func (store *Store) Prune(keep map[string]struct{}) error {
	if keep == nil {
		return errors.New("materialization: retained binding set is required")
	}
	keys, err := retainedBindingKeys(keep)
	if err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.ensureDirectories(); err != nil {
		return err
	}
	active, err := store.pruneManifests(keys)
	if err != nil {
		return err
	}
	return store.pruneContent(active)
}

func resolveRoot(root string) (string, error) {
	if strings.TrimSpace(root) == "" || root != strings.TrimSpace(root) || strings.ContainsRune(root, '\x00') {
		return "", errors.New("materialization: root directory is invalid")
	}
	resolved, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("materialization: resolve root: %w", err)
	}
	if err := os.MkdirAll(resolved, 0o755); err != nil {
		return "", fmt.Errorf("materialization: create root: %w", err)
	}
	if err := requireDirectory(resolved); err != nil {
		return "", fmt.Errorf("materialization: validate supplied root: %w", err)
	}
	canonical, err := filepath.EvalSymlinks(resolved)
	if err != nil {
		return "", fmt.Errorf("materialization: resolve root links: %w", err)
	}
	if err := requireDirectory(canonical); err != nil {
		return "", fmt.Errorf("materialization: validate root: %w", err)
	}
	return canonical, nil
}

func (store *Store) ensureDirectories() error {
	for _, path := range []string{store.root, store.manifestRoot, store.contentRoot} {
		if err := ensureDirectory(path); err != nil {
			return fmt.Errorf("materialization: prepare directory: %w", err)
		}
	}
	return nil
}

func ensureDirectory(path string) error {
	if err := os.MkdirAll(path, 0o700); err != nil {
		return err
	}
	return requireDirectory(path)
}

func requireDirectory(path string) error {
	information, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if information.Mode()&os.ModeSymlink != 0 || !information.IsDir() {
		return errors.New("path is not a regular directory")
	}
	return nil
}

func bindingKey(bindingID string) string {
	digest := sha256.Sum256([]byte(bindingID))
	return hex.EncodeToString(digest[:])
}

func (store *Store) manifestPath(bindingKey string) string {
	return filepath.Join(store.manifestRoot, bindingKey+".json")
}

func (store *Store) stageContent(bindingKey string, references []contracts.ContentReference, opener ContentOpener) (string, []contentRecord, error) {
	records := make([]contentRecord, 0, len(references))
	if len(references) == 0 {
		return "", records, nil
	}
	bindingRoot := filepath.Join(store.contentRoot, bindingKey)
	if err := ensureDirectory(bindingRoot); err != nil {
		return "", nil, fmt.Errorf("materialization: prepare binding content: %w", err)
	}
	generation, generationRoot, err := createGeneration(bindingRoot)
	if err != nil {
		return "", nil, err
	}
	complete := false
	defer func() {
		if !complete {
			_ = os.RemoveAll(generationRoot)
		}
	}()
	for index, reference := range references {
		path := filepath.Join(generationRoot, contentFileName(index))
		if err := copyReference(path, reference, opener); err != nil {
			return "", nil, err
		}
		relative, err := filepath.Rel(store.root, path)
		if err != nil {
			return "", nil, fmt.Errorf("materialization: resolve content path: %w", err)
		}
		records = append(records, contentRecord{Reference: reference, Path: filepath.ToSlash(relative)})
	}
	if err := syncDirectory(generationRoot); err != nil {
		return "", nil, err
	}
	if err := syncDirectory(bindingRoot); err != nil {
		return "", nil, err
	}
	complete = true
	return generation, records, nil
}

func createGeneration(bindingRoot string) (string, string, error) {
	for attempts := 0; attempts < 4; attempts++ {
		generation, err := randomHex(16)
		if err != nil {
			return "", "", err
		}
		path := filepath.Join(bindingRoot, generation)
		err = os.Mkdir(path, 0o700)
		if err == nil {
			return generation, path, nil
		}
		if !errors.Is(err, os.ErrExist) {
			return "", "", fmt.Errorf("materialization: create content generation: %w", err)
		}
	}
	return "", "", errors.New("materialization: generate unique content directory")
}

func copyReference(path string, reference contracts.ContentReference, opener ContentOpener) error {
	reader, err := opener.Open(reference)
	if err != nil {
		return fmt.Errorf("materialization: open content %q: %w", reference.ID, err)
	}
	if reader == nil {
		return fmt.Errorf("materialization: open content %q: reader is missing", reference.ID)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		_ = reader.Close()
		return fmt.Errorf("materialization: create content %q: %w", reference.ID, err)
	}
	if err := writeReference(file, reader, reference); err != nil {
		_ = os.Remove(path)
		return fmt.Errorf("materialization: copy content %q: %w", reference.ID, err)
	}
	return nil
}

func writeReference(file *os.File, reader io.ReadCloser, reference contracts.ContentReference) error {
	hash := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(file, hash), io.LimitReader(reader, reference.ByteLength+1))
	readerCloseErr := reader.Close()
	if copyErr == nil && readerCloseErr != nil {
		copyErr = readerCloseErr
	}
	if copyErr == nil && written != reference.ByteLength {
		copyErr = fmt.Errorf("byte length is %d instead of %d", written, reference.ByteLength)
	}
	if copyErr == nil && hex.EncodeToString(hash.Sum(nil)) != reference.SHA256 {
		copyErr = errors.New("digest does not match the content reference")
	}
	if copyErr == nil {
		copyErr = file.Sync()
	}
	closeErr := file.Close()
	if copyErr == nil {
		copyErr = closeErr
	}
	return copyErr
}

func (store *Store) installManifest(bindingKey string, value manifest) (bool, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return false, fmt.Errorf("materialization: encode manifest: %w", err)
	}
	if len(encoded) > maximumManifestBytes {
		return false, errors.New("materialization: manifest exceeds the byte limit")
	}
	file, err := os.CreateTemp(store.manifestRoot, ".manifest-*.tmp")
	if err != nil {
		return false, fmt.Errorf("materialization: stage manifest: %w", err)
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return false, fmt.Errorf("materialization: protect manifest: %w", err)
	}
	if _, err := file.Write(encoded); err != nil {
		_ = file.Close()
		return false, fmt.Errorf("materialization: write manifest: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return false, fmt.Errorf("materialization: sync manifest: %w", err)
	}
	if err := file.Close(); err != nil {
		return false, fmt.Errorf("materialization: close manifest: %w", err)
	}
	if err := os.Rename(temporary, store.manifestPath(bindingKey)); err != nil {
		return false, fmt.Errorf("materialization: install manifest: %w", err)
	}
	return true, syncDirectory(store.manifestRoot)
}

func (store *Store) readManifest(bindingID string, bindingKey string) (manifest, error) {
	encoded, err := readRegularFile(store.manifestPath(bindingKey), maximumManifestBytes)
	if errors.Is(err, os.ErrNotExist) {
		return manifest{}, ErrNotFound
	}
	if err != nil {
		return manifest{}, corrupt("read manifest: %v", err)
	}
	var retained manifest
	if err := contracts.DecodeStrict(encoded, &retained); err != nil {
		return manifest{}, corrupt("decode manifest: %v", err)
	}
	if err := validateManifest(retained, bindingID, bindingKey); err != nil {
		return manifest{}, corrupt("validate manifest: %v", err)
	}
	return retained, nil
}

func (store *Store) verifyContent(bindingKey string, records []contentRecord) error {
	for index, record := range records {
		file, err := store.openContent(bindingKey, record, index)
		if err != nil {
			return corrupt("open content %q: %v", record.Reference.ID, err)
		}
		hash := sha256.New()
		written, copyErr := io.Copy(hash, io.LimitReader(file, record.Reference.ByteLength+1))
		closeErr := file.Close()
		if copyErr != nil {
			return corrupt("read content %q: %v", record.Reference.ID, copyErr)
		}
		if closeErr != nil {
			return corrupt("close content %q: %v", record.Reference.ID, closeErr)
		}
		if written != record.Reference.ByteLength || hex.EncodeToString(hash.Sum(nil)) != record.Reference.SHA256 {
			return corrupt("content %q metadata does not match", record.Reference.ID)
		}
	}
	return nil
}

func (store *Store) restoreContent(invocationID string, bindingKey string, records []contentRecord, writer ContentWriter) (map[string]contracts.ContentReference, []contracts.ContentReference, error) {
	fresh := make(map[string]contracts.ContentReference, len(records))
	content := make([]contracts.ContentReference, 0, len(records))
	oldIDs := make(map[string]struct{}, len(records))
	newIDs := make(map[string]struct{}, len(records))
	for _, record := range records {
		oldIDs[record.Reference.ID] = struct{}{}
	}
	for index, record := range records {
		file, err := store.openContent(bindingKey, record, index)
		if err != nil {
			return nil, content, corrupt("reopen content %q: %v", record.Reference.ID, err)
		}
		reference, putErr := writer.Put(invocationID, record.Reference.MediaType, file)
		closeErr := file.Close()
		if putErr != nil {
			return nil, content, fmt.Errorf("materialization: restore content %q: %w", record.Reference.ID, putErr)
		}
		if err := reference.Validate(); err != nil {
			return nil, content, fmt.Errorf("materialization: restored content reference is invalid: %w", err)
		}
		content = append(content, reference)
		if closeErr != nil {
			return nil, content, fmt.Errorf("materialization: close restored content %q: %w", record.Reference.ID, closeErr)
		}
		if err := validateFreshReference(reference, record.Reference, invocationID, oldIDs, newIDs); err != nil {
			return nil, content, err
		}
		newIDs[reference.ID] = struct{}{}
		fresh[record.Reference.ID] = reference
	}
	return fresh, content, nil
}

func validateFreshReference(fresh contracts.ContentReference, retained contracts.ContentReference, invocationID string, oldIDs map[string]struct{}, newIDs map[string]struct{}) error {
	if fresh.InvocationID != invocationID || fresh.MediaType != retained.MediaType || fresh.ByteLength != retained.ByteLength || fresh.SHA256 != retained.SHA256 {
		return errors.New("materialization: restored content metadata does not match")
	}
	if _, exists := oldIDs[fresh.ID]; exists {
		return errors.New("materialization: restored content identity is not fresh")
	}
	if _, exists := newIDs[fresh.ID]; exists {
		return errors.New("materialization: restored content identity is duplicated")
	}
	return nil
}

func (store *Store) openContent(bindingKey string, record contentRecord, index int) (*os.File, error) {
	generation, err := validateContentPath(record.Path, bindingKey, index)
	if err != nil {
		return nil, err
	}
	if err := requireDirectory(store.contentRoot); err != nil {
		return nil, err
	}
	if err := requireDirectory(filepath.Join(store.contentRoot, bindingKey)); err != nil {
		return nil, err
	}
	if err := requireDirectory(filepath.Join(store.contentRoot, bindingKey, generation)); err != nil {
		return nil, err
	}
	path := filepath.Join(store.root, filepath.FromSlash(record.Path))
	file, information, err := openRegularFile(path)
	if err != nil {
		return nil, err
	}
	if information.Size() != record.Reference.ByteLength {
		_ = file.Close()
		return nil, errors.New("content byte length does not match")
	}
	return file, nil
}

func (store *Store) validateBindingContent(bindingKey string) error {
	root := filepath.Join(store.contentRoot, bindingKey)
	entries, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("materialization: inspect binding content: %w", err)
	}
	if err := requireDirectory(root); err != nil {
		return corrupt("binding content path is unsafe: %v", err)
	}
	for _, entry := range entries {
		if !validLowerHex(entry.Name(), 16) || entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
			return corrupt("binding content entry %q is invalid", entry.Name())
		}
	}
	return nil
}

func (store *Store) cleanupBindingContent(bindingKey string, keepGeneration string) error {
	root := filepath.Join(store.contentRoot, bindingKey)
	entries, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := requireDirectory(root); err != nil {
		return err
	}
	for _, entry := range entries {
		if !validLowerHex(entry.Name(), 16) || entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
			return corrupt("binding content entry %q is invalid", entry.Name())
		}
		if entry.Name() != keepGeneration {
			if err := os.RemoveAll(filepath.Join(root, entry.Name())); err != nil {
				return err
			}
		}
	}
	if keepGeneration == "" {
		return os.Remove(root)
	}
	return syncDirectory(root)
}

func (store *Store) removeBindingContent(bindingKey string) error {
	root := filepath.Join(store.contentRoot, bindingKey)
	information, err := os.Lstat(root)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if information.Mode()&os.ModeSymlink != 0 || !information.IsDir() {
		return corrupt("binding content path is unsafe")
	}
	if err := os.RemoveAll(root); err != nil {
		return fmt.Errorf("materialization: remove binding content: %w", err)
	}
	return syncDirectory(store.contentRoot)
}

func retainedBindingKeys(keep map[string]struct{}) (map[string]string, error) {
	keys := make(map[string]string, len(keep))
	for bindingID := range keep {
		if err := validateBindingID(bindingID); err != nil {
			return nil, err
		}
		key := bindingKey(bindingID)
		if _, exists := keys[key]; exists {
			return nil, errors.New("materialization: retained binding identity is ambiguous")
		}
		keys[key] = bindingID
	}
	return keys, nil
}

func (store *Store) pruneManifests(keep map[string]string) (map[string]string, error) {
	entries, err := os.ReadDir(store.manifestRoot)
	if err != nil {
		return nil, fmt.Errorf("materialization: scan manifests: %w", err)
	}
	active := make(map[string]string)
	removed := false
	for _, entry := range entries {
		key, generation, entryRemoved, err := store.pruneManifestEntry(entry, keep)
		if err != nil {
			return nil, err
		}
		removed = removed || entryRemoved
		if key != "" {
			active[key] = generation
		}
	}
	if removed {
		if err := syncDirectory(store.manifestRoot); err != nil {
			return nil, err
		}
	}
	return active, nil
}

func (store *Store) pruneManifestEntry(entry os.DirEntry, keep map[string]string) (string, string, bool, error) {
	if isManifestTemporary(entry.Name()) {
		if entry.Type()&os.ModeSymlink != 0 || !entry.Type().IsRegular() {
			return "", "", false, corrupt("temporary manifest %q is unsafe", entry.Name())
		}
		err := os.Remove(filepath.Join(store.manifestRoot, entry.Name()))
		return "", "", err == nil, err
	}
	key, err := manifestEntryKey(entry)
	if err != nil {
		return "", "", false, err
	}
	bindingID, retained := keep[key]
	if !retained {
		err := os.Remove(filepath.Join(store.manifestRoot, entry.Name()))
		return "", "", err == nil, err
	}
	value, err := store.readManifest(bindingID, key)
	if err != nil {
		return "", "", false, err
	}
	generation, err := manifestGeneration(value, key)
	if err != nil {
		return "", "", false, corrupt("validate retained manifest: %v", err)
	}
	return key, generation, false, nil
}

func (store *Store) pruneContent(active map[string]string) error {
	entries, err := os.ReadDir(store.contentRoot)
	if err != nil {
		return fmt.Errorf("materialization: scan content: %w", err)
	}
	for _, entry := range entries {
		if !validLowerHex(entry.Name(), 32) || entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
			return corrupt("content entry %q is invalid", entry.Name())
		}
		generation, retained := active[entry.Name()]
		if !retained {
			if err := store.removeBindingContent(entry.Name()); err != nil {
				return err
			}
			continue
		}
		if err := store.cleanupBindingContent(entry.Name(), generation); err != nil {
			return err
		}
	}
	return nil
}

func manifestEntryKey(entry os.DirEntry) (string, error) {
	name := entry.Name()
	if entry.Type()&os.ModeSymlink != 0 || !entry.Type().IsRegular() || !strings.HasSuffix(name, ".json") {
		return "", corrupt("manifest entry %q is invalid", name)
	}
	key := strings.TrimSuffix(name, ".json")
	if !validLowerHex(key, 32) {
		return "", corrupt("manifest entry %q is invalid", name)
	}
	return key, nil
}

func isManifestTemporary(name string) bool {
	return strings.HasPrefix(name, ".manifest-") && strings.HasSuffix(name, ".tmp")
}

func contentFileName(index int) string {
	return fmt.Sprintf("%06d.content", index)
}

func validateContentPath(path string, bindingKey string, index int) (string, error) {
	if path == "" || path != filepath.ToSlash(filepath.Clean(filepath.FromSlash(path))) {
		return "", errors.New("content path is not normalized")
	}
	parts := strings.Split(path, "/")
	if len(parts) != 4 || parts[0] != "content" || parts[1] != bindingKey || !validLowerHex(parts[2], 16) || parts[3] != contentFileName(index) {
		return "", errors.New("content path is outside its binding generation")
	}
	return parts[2], nil
}

func validateManifest(value manifest, bindingID string, bindingKey string) error {
	if err := validateManifestHeader(value, bindingID, bindingKey); err != nil {
		return err
	}
	_, references, err := prepareOutputs(value.Outputs)
	if err != nil {
		return err
	}
	return validateManifestContent(value, bindingKey, references)
}

func validateManifestHeader(value manifest, bindingID string, bindingKey string) error {
	if value.Version != manifestVersion {
		return fmt.Errorf("unsupported version %d", value.Version)
	}
	if value.BindingID != bindingID || bindingKey != bindingKeyForManifest(value.BindingID) {
		return errors.New("binding identity does not match its manifest path")
	}
	if err := validateFingerprint(value.Fingerprint); err != nil {
		return err
	}
	return nil
}

func validateManifestContent(value manifest, bindingKey string, references []contracts.ContentReference) error {
	if value.Content == nil || len(value.Content) > maximumReferences || len(value.Content) != len(references) {
		return errors.New("content records do not match referenced outputs")
	}
	for index, record := range value.Content {
		if err := record.Reference.Validate(); err != nil {
			return err
		}
		if record.Reference != references[index] {
			return errors.New("content record order or identity is invalid")
		}
		if _, err := validateContentPath(record.Path, bindingKey, index); err != nil {
			return err
		}
	}
	if err := validateReferenceCapacity(references); err != nil {
		return err
	}
	_, err := manifestGeneration(value, bindingKey)
	return err
}

func validateReferenceCapacity(references []contracts.ContentReference) error {
	if len(references) > maximumReferences {
		return errors.New("materialization: referenced content exceeds the record limit")
	}
	var total int64
	for _, reference := range references {
		if total > maximumMaterializedBytes-reference.ByteLength {
			return errors.New("materialization: materialized content exceeds the byte limit")
		}
		total += reference.ByteLength
	}
	return nil
}

func bindingKeyForManifest(bindingID string) string {
	if validateBindingID(bindingID) != nil {
		return ""
	}
	return bindingKey(bindingID)
}

func manifestGeneration(value manifest, bindingKey string) (string, error) {
	generation := ""
	for index, record := range value.Content {
		candidate, err := validateContentPath(record.Path, bindingKey, index)
		if err != nil {
			return "", err
		}
		if generation == "" {
			generation = candidate
		}
		if generation != candidate {
			return "", errors.New("content records span multiple generations")
		}
	}
	return generation, nil
}

func validateBindingID(value string) error {
	if len(value) < 1 || len(value) > 128 {
		return errors.New("materialization: binding id is invalid")
	}
	for index, character := range value {
		if index == 0 && !letterOrDigit(character) {
			return errors.New("materialization: binding id is invalid")
		}
		if !letterOrDigit(character) && character != '.' && character != '_' && character != ':' && character != '-' {
			return errors.New("materialization: binding id is invalid")
		}
	}
	return nil
}

func validateFingerprint(value string) error {
	if !validLowerHex(value, 32) {
		return errors.New("materialization: fingerprint is invalid")
	}
	return nil
}

func validLowerHex(value string, byteLength int) bool {
	if len(value) != byteLength*2 || value != strings.ToLower(value) {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == byteLength
}

func letterOrDigit(value rune) bool {
	return value >= 'a' && value <= 'z' || value >= 'A' && value <= 'Z' || value >= '0' && value <= '9'
}

func randomHex(byteLength int) (string, error) {
	value := make([]byte, byteLength)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("materialization: generate identity: %w", err)
	}
	return hex.EncodeToString(value), nil
}

func readRegularFile(path string, maximum int64) ([]byte, error) {
	file, information, err := openRegularFile(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if information.Size() > maximum {
		return nil, errors.New("file exceeds the byte limit")
	}
	data, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maximum {
		return nil, errors.New("file exceeds the byte limit")
	}
	return data, nil
}

func openRegularFile(path string) (*os.File, os.FileInfo, error) {
	before, err := os.Lstat(path)
	if err != nil {
		return nil, nil, err
	}
	if before.Mode()&os.ModeSymlink != 0 || !before.Mode().IsRegular() {
		return nil, nil, errors.New("path is not a regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	after, err := file.Stat()
	if err != nil || !after.Mode().IsRegular() || !os.SameFile(before, after) {
		_ = file.Close()
		return nil, nil, errors.New("file changed while opening")
	}
	return file, after, nil
}

func removeRegularFile(path string) (bool, error) {
	information, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if information.Mode()&os.ModeSymlink != 0 || !information.Mode().IsRegular() {
		return false, errors.New("path is not a regular file")
	}
	return true, os.Remove(path)
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("materialization: open directory: %w", err)
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("materialization: sync directory: %w", err)
	}
	return nil
}

func corrupt(format string, values ...any) error {
	return fmt.Errorf("%w: %s", ErrCorrupt, fmt.Sprintf(format, values...))
}

func sortedKeys[Value any](values map[string]Value) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
