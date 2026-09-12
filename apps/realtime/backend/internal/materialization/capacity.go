package materialization

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/setta/realtime/backend/internal/contracts"
)

const (
	maximumReferenceBytes int64 = 256 << 20
	maximumStoreBytes     int64 = 2 << 30
)

func (store *Store) ensureReplacementCapacity(bindingKey string, candidate manifest, references []contracts.ContentReference) error {
	retainedBytes, err := store.storedBytes(bindingKey)
	if err != nil {
		return err
	}
	replacementBytes, err := projectedReplacementBytes(bindingKey, candidate, references)
	if err != nil {
		return err
	}
	if retainedBytes > store.maximumBytes-replacementBytes {
		return ErrCapacity
	}
	return nil
}

func projectedReplacementBytes(bindingKey string, candidate manifest, references []contracts.ContentReference) (int64, error) {
	generation := strings.Repeat("0", 32)
	candidate.Content = make([]contentRecord, 0, len(references))
	var total int64
	for index, reference := range references {
		candidate.Content = append(candidate.Content, contentRecord{
			Reference: reference,
			Path:      strings.Join([]string{"content", bindingKey, generation, contentFileName(index)}, "/"),
		})
		if total > maximumStoreBytes-reference.ByteLength {
			return 0, ErrCapacity
		}
		total += reference.ByteLength
	}
	encoded, err := json.Marshal(candidate)
	if err != nil {
		return 0, fmt.Errorf("materialization: encode projected manifest: %w", err)
	}
	if len(encoded) > maximumManifestBytes || total > maximumStoreBytes-int64(len(encoded)) {
		return 0, ErrCapacity
	}
	return total + int64(len(encoded)), nil
}

func (store *Store) storedBytes(excludeBindingKey string) (int64, error) {
	manifestBytes, err := store.storedManifestBytes(excludeBindingKey)
	if err != nil {
		return 0, err
	}
	return store.storedContentBytes(excludeBindingKey, manifestBytes)
}

func (store *Store) storedManifestBytes(excludeBindingKey string) (int64, error) {
	entries, err := os.ReadDir(store.manifestRoot)
	if err != nil {
		return 0, fmt.Errorf("materialization: scan manifest capacity: %w", err)
	}
	var total int64
	for _, entry := range entries {
		key, err := capacityManifestKey(entry)
		if err != nil {
			return 0, err
		}
		if key == excludeBindingKey {
			continue
		}
		size, err := regularEntrySize(entry, maximumManifestBytes)
		if err != nil {
			return 0, corrupt("manifest entry %q is invalid: %v", entry.Name(), err)
		}
		total, err = addStoreBytes(total, size)
		if err != nil {
			return 0, err
		}
	}
	return total, nil
}

func capacityManifestKey(entry os.DirEntry) (string, error) {
	if isManifestTemporary(entry.Name()) {
		if entry.Type()&os.ModeSymlink != 0 || !entry.Type().IsRegular() {
			return "", corrupt("temporary manifest %q is unsafe", entry.Name())
		}
		return "", nil
	}
	return manifestEntryKey(entry)
}

func (store *Store) storedContentBytes(excludeBindingKey string, initial int64) (int64, error) {
	entries, err := os.ReadDir(store.contentRoot)
	if err != nil {
		return 0, fmt.Errorf("materialization: scan content capacity: %w", err)
	}
	total := initial
	for _, entry := range entries {
		if err := validateContentBindingEntry(entry); err != nil {
			return 0, err
		}
		if entry.Name() == excludeBindingKey {
			continue
		}
		total, err = store.storedBindingBytes(entry.Name(), total)
		if err != nil {
			return 0, err
		}
	}
	return total, nil
}

func validateContentBindingEntry(entry os.DirEntry) error {
	if !validLowerHex(entry.Name(), 32) || entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
		return corrupt("content entry %q is invalid", entry.Name())
	}
	return nil
}

func (store *Store) storedBindingBytes(bindingKey string, initial int64) (int64, error) {
	root := filepath.Join(store.contentRoot, bindingKey)
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0, fmt.Errorf("materialization: scan binding capacity: %w", err)
	}
	total := initial
	for _, entry := range entries {
		if !validLowerHex(entry.Name(), 16) || entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
			return 0, corrupt("binding content entry %q is invalid", entry.Name())
		}
		total, err = storedGenerationBytes(filepath.Join(root, entry.Name()), total)
		if err != nil {
			return 0, err
		}
	}
	return total, nil
}

func storedGenerationBytes(root string, initial int64) (int64, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0, fmt.Errorf("materialization: scan generation capacity: %w", err)
	}
	if len(entries) > maximumReferences {
		return 0, corrupt("content generation exceeds the record limit")
	}
	total := initial
	for _, entry := range entries {
		if !validContentFileName(entry.Name()) {
			return 0, corrupt("content file %q is invalid", entry.Name())
		}
		size, err := regularEntrySize(entry, maximumReferenceBytes)
		if err != nil {
			return 0, corrupt("content file %q is invalid: %v", entry.Name(), err)
		}
		total, err = addStoreBytes(total, size)
		if err != nil {
			return 0, err
		}
	}
	return total, nil
}

func validContentFileName(name string) bool {
	if len(name) != len("000000.content") || !strings.HasSuffix(name, ".content") {
		return false
	}
	for _, character := range strings.TrimSuffix(name, ".content") {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func regularEntrySize(entry os.DirEntry, maximum int64) (int64, error) {
	if entry.Type()&os.ModeSymlink != 0 || !entry.Type().IsRegular() {
		return 0, errors.New("entry is not a regular file")
	}
	information, err := entry.Info()
	if err != nil {
		return 0, err
	}
	if information.Size() < 0 || information.Size() > maximum {
		return 0, errors.New("entry exceeds its byte limit")
	}
	return information.Size(), nil
}

func addStoreBytes(total int64, size int64) (int64, error) {
	if total > maximumStoreBytes-size {
		return 0, ErrCapacity
	}
	return total + size, nil
}
