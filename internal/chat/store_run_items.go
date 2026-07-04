package chat

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

const runItemsIndexFileName = "items-index.json"

type runItemIndex struct {
	SchemaVersion int                 `json:"schemaVersion"`
	Items         []runItemIndexEntry `json:"items"`
}

type runItemIndexEntry struct {
	ID        string `json:"id"`
	CreatedAt string `json:"createdAt"`
}

func (store *Store) SaveRunItem(item RunItem) error {
	if err := validateRunItem(item); err != nil {
		return err
	}
	if err := writeJSONFile(store.runItemPath(item.WorkspaceID, item.RunID, item.ID), item); err != nil {
		return err
	}
	return store.upsertRunItemIndex(item)
}

func (store *Store) LoadRunItems(workspaceID string, runID string) ([]RunItem, error) {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return nil, err
	}
	dir := store.runItemsDir(workspaceID, runID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []RunItem{}, nil
		}
		return nil, &PersistenceError{Operation: "list run items", Path: dir, Err: err}
	}
	items := make([]RunItem, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		item, err := store.loadRunItemByID(workspaceID, runID, entry.Name())
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	sortRunItems(items)
	return items, nil
}

func (store *Store) LoadRunItemsPage(workspaceID string, runID string, afterItemID string, limit int) ([]RunItem, string, bool, error) {
	if err := validateLoadRunItemsPageRequest(workspaceID, runID, afterItemID, limit); err != nil {
		return nil, "", false, err
	}
	index, err := store.ensureRunItemIndex(workspaceID, runID)
	if err != nil {
		return nil, "", false, err
	}
	entries, nextItemID, hasMore, err := runItemIndexPageEntries(index, afterItemID, limit, runID)
	if err != nil {
		return nil, "", false, err
	}
	items, err := store.loadRunItemsForIndexEntries(workspaceID, runID, entries)
	if err != nil {
		return nil, "", false, err
	}
	return items, nextItemID, hasMore, nil
}

func (store *Store) LoadRunItemsBefore(workspaceID string, runID string, beforeItemID string, limit int) ([]RunItem, string, bool, error) {
	if err := validateLoadRunItemsBeforeRequest(workspaceID, runID, beforeItemID, limit); err != nil {
		return nil, "", false, err
	}
	index, err := store.ensureRunItemIndex(workspaceID, runID)
	if err != nil {
		return nil, "", false, err
	}
	entries, nextBeforeItemID, hasMore, err := runItemIndexBeforePageEntries(index, beforeItemID, limit, runID)
	if err != nil {
		return nil, "", false, err
	}
	items, err := store.loadRunItemsForIndexEntries(workspaceID, runID, entries)
	if err != nil {
		return nil, "", false, err
	}
	return items, nextBeforeItemID, hasMore, nil
}

func validateLoadRunItemsPageRequest(workspaceID string, runID string, afterItemID string, limit int) error {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return err
	}
	if err := validateOptionalStorageID("run item page after item id", afterItemID); err != nil {
		return err
	}
	if limit <= 0 {
		return fmt.Errorf("run items page limit must be positive: %d", limit)
	}
	return nil
}

func validateLoadRunItemsBeforeRequest(workspaceID string, runID string, beforeItemID string, limit int) error {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return err
	}
	if err := validateOptionalStorageID("run item page before item id", beforeItemID); err != nil {
		return err
	}
	if limit <= 0 {
		return fmt.Errorf("run items before page limit must be positive: %d", limit)
	}
	return nil
}

func runItemIndexPageEntries(index runItemIndex, afterItemID string, limit int, runID string) ([]runItemIndexEntry, string, bool, error) {
	start, err := runItemIndexPageStart(index, afterItemID, runID)
	if err != nil {
		return nil, "", false, err
	}
	end := start + limit
	if end > len(index.Items) {
		end = len(index.Items)
	}
	entries := index.Items[start:end]
	hasMore := end < len(index.Items)
	nextItemID := ""
	if hasMore && len(entries) > 0 {
		nextItemID = entries[len(entries)-1].ID
	}
	return entries, nextItemID, hasMore, nil
}

func runItemIndexBeforePageEntries(index runItemIndex, beforeItemID string, limit int, runID string) ([]runItemIndexEntry, string, bool, error) {
	end, err := runItemIndexBeforePageEnd(index, beforeItemID, runID)
	if err != nil {
		return nil, "", false, err
	}
	start := end - limit
	if start < 0 {
		start = 0
	}
	entries := index.Items[start:end]
	hasMore := start > 0
	nextBeforeItemID := ""
	if hasMore && len(entries) > 0 {
		nextBeforeItemID = entries[0].ID
	}
	return entries, nextBeforeItemID, hasMore, nil
}

func runItemIndexPageStart(index runItemIndex, afterItemID string, runID string) (int, error) {
	if afterItemID == "" {
		return 0, nil
	}
	for indexIndex, entry := range index.Items {
		if entry.ID == afterItemID {
			return indexIndex + 1, nil
		}
	}
	return 0, fmt.Errorf("run items page after item id %s was not found in run %s", afterItemID, runID)
}

func runItemIndexBeforePageEnd(index runItemIndex, beforeItemID string, runID string) (int, error) {
	if beforeItemID == "" {
		return len(index.Items), nil
	}
	for indexIndex, entry := range index.Items {
		if entry.ID == beforeItemID {
			return indexIndex, nil
		}
	}
	return 0, fmt.Errorf("run items page before item id %s was not found in run %s", beforeItemID, runID)
}

func (store *Store) loadRunItemsForIndexEntries(workspaceID string, runID string, entries []runItemIndexEntry) ([]RunItem, error) {
	items := make([]RunItem, 0, len(entries))
	for _, entry := range entries {
		item, err := store.loadRunItemByID(workspaceID, runID, entry.ID)
		if err != nil {
			return nil, err
		}
		if item.CreatedAt != entry.CreatedAt {
			return nil, corruptStateErrorf(store.runItemsIndexPath(workspaceID, runID), "run item index entry %s createdAt %s does not match item createdAt %s", entry.ID, entry.CreatedAt, item.CreatedAt)
		}
		items = append(items, item)
	}
	return items, nil
}

func (store *Store) FindRunItemByProviderID(workspaceID string, runID string, providerItemID string) (RunItem, bool, error) {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return RunItem{}, false, err
	}
	items, err := store.LoadRunItems(workspaceID, runID)
	if err != nil {
		return RunItem{}, false, err
	}
	for _, item := range items {
		if item.ProviderItemID == providerItemID {
			return item, true, nil
		}
	}
	return RunItem{}, false, nil
}

func (store *Store) loadRunItemByID(workspaceID string, runID string, runItemID string) (RunItem, error) {
	path := store.runItemPath(workspaceID, runID, runItemID)
	var item RunItem
	if err := readJSONFile(path, &item); err != nil {
		return RunItem{}, err
	}
	if err := validateRunItem(item); err != nil {
		return RunItem{}, corruptStateError(path, err)
	}
	if item.ID != runItemID {
		return RunItem{}, corruptStateErrorf(path, "run item file id %s does not match requested id %s", item.ID, runItemID)
	}
	if item.WorkspaceID != workspaceID || item.RunID != runID {
		return RunItem{}, corruptStateErrorf(path, "run item %s belongs to workspace %s run %s, not workspace %s run %s", item.ID, item.WorkspaceID, item.RunID, workspaceID, runID)
	}
	return item, nil
}

func (store *Store) upsertRunItemIndex(item RunItem) error {
	index, exists, err := store.loadRunItemIndex(item.WorkspaceID, item.RunID)
	if err != nil {
		return err
	}
	if !exists {
		_, err = store.rebuildRunItemIndex(item.WorkspaceID, item.RunID)
		return err
	}
	entry := runItemIndexEntry{ID: item.ID, CreatedAt: item.CreatedAt}
	replaced := false
	for indexIndex, candidate := range index.Items {
		if candidate.ID == item.ID {
			index.Items[indexIndex] = entry
			replaced = true
			break
		}
	}
	if !replaced {
		index.Items = append(index.Items, entry)
	}
	sortRunItemIndexEntries(index.Items)
	return store.writeRunItemIndex(item.WorkspaceID, item.RunID, index)
}

func (store *Store) rebuildRunItemIndex(workspaceID string, runID string) (runItemIndex, error) {
	items, err := store.LoadRunItems(workspaceID, runID)
	if err != nil {
		return runItemIndex{}, err
	}
	index := runItemIndexFromItems(items)
	if err := store.writeRunItemIndex(workspaceID, runID, index); err != nil {
		return runItemIndex{}, err
	}
	return index, nil
}

func (store *Store) ensureRunItemIndex(workspaceID string, runID string) (runItemIndex, error) {
	index, exists, err := store.loadRunItemIndex(workspaceID, runID)
	if err != nil {
		return runItemIndex{}, err
	}
	if !exists {
		return store.rebuildRunItemIndex(workspaceID, runID)
	}
	directoryIDs, err := store.runItemDirectoryIDs(workspaceID, runID)
	if err != nil {
		return runItemIndex{}, err
	}
	if !runItemIndexMatchesDirectoryIDs(index, directoryIDs) {
		return store.rebuildRunItemIndex(workspaceID, runID)
	}
	return index, nil
}

func (store *Store) runItemDirectoryIDs(workspaceID string, runID string) ([]string, error) {
	dir := store.runItemsDir(workspaceID, runID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}
		return nil, &PersistenceError{Operation: "list run item directories", Path: dir, Err: err}
	}
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if err := validateStorageID("run item id", entry.Name()); err != nil {
			return nil, corruptStateError(filepath.Join(dir, entry.Name()), err)
		}
		ids = append(ids, entry.Name())
	}
	sort.Strings(ids)
	return ids, nil
}

func (store *Store) loadRunItemIndex(workspaceID string, runID string) (runItemIndex, bool, error) {
	path := store.runItemsIndexPath(workspaceID, runID)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return runItemIndex{}, false, nil
		}
		return runItemIndex{}, false, &PersistenceError{Operation: "stat run item index", Path: path, Err: err}
	}
	var index runItemIndex
	if err := readJSONFile(path, &index); err != nil {
		return runItemIndex{}, false, err
	}
	if err := validateRunItemIndex(index); err != nil {
		return runItemIndex{}, false, corruptStateError(path, err)
	}
	return index, true, nil
}

func (store *Store) writeRunItemIndex(workspaceID string, runID string, index runItemIndex) error {
	if err := validateRunItemIndex(index); err != nil {
		return err
	}
	return writeJSONFile(store.runItemsIndexPath(workspaceID, runID), index)
}

func runItemIndexFromItems(items []RunItem) runItemIndex {
	entries := make([]runItemIndexEntry, 0, len(items))
	for _, item := range items {
		entries = append(entries, runItemIndexEntry{ID: item.ID, CreatedAt: item.CreatedAt})
	}
	sortRunItemIndexEntries(entries)
	return runItemIndex{SchemaVersion: SchemaVersion, Items: entries}
}

func validateRunItemIndex(index runItemIndex) error {
	if index.SchemaVersion != SchemaVersion {
		return fmt.Errorf("run item index schemaVersion = %d, want %d", index.SchemaVersion, SchemaVersion)
	}
	seen := map[string]struct{}{}
	for itemIndex, entry := range index.Items {
		if err := validateStorageID("run item id", entry.ID); err != nil {
			return fmt.Errorf("run item index entry %d: %w", itemIndex, err)
		}
		if err := validateTimestamp(entry.CreatedAt, "run item index "+entry.ID+" createdAt"); err != nil {
			return err
		}
		if _, ok := seen[entry.ID]; ok {
			return fmt.Errorf("run item index contains duplicate item id %s", entry.ID)
		}
		seen[entry.ID] = struct{}{}
		if itemIndex > 0 && compareRunItemIndexEntries(index.Items[itemIndex-1], entry) > 0 {
			return fmt.Errorf("run item index entries are not sorted at %s", entry.ID)
		}
	}
	return nil
}

func runItemIndexMatchesDirectoryIDs(index runItemIndex, directoryIDs []string) bool {
	if len(index.Items) != len(directoryIDs) {
		return false
	}
	indexIDs := make(map[string]struct{}, len(index.Items))
	for _, entry := range index.Items {
		indexIDs[entry.ID] = struct{}{}
	}
	for _, directoryID := range directoryIDs {
		if _, ok := indexIDs[directoryID]; !ok {
			return false
		}
	}
	return true
}

func sortRunItems(items []RunItem) {
	sort.SliceStable(items, func(left int, right int) bool {
		if items[left].CreatedAt == items[right].CreatedAt {
			return items[left].ID < items[right].ID
		}
		return items[left].CreatedAt < items[right].CreatedAt
	})
}

func sortRunItemIndexEntries(entries []runItemIndexEntry) {
	sort.SliceStable(entries, func(left int, right int) bool {
		return compareRunItemIndexEntries(entries[left], entries[right]) < 0
	})
}

func compareRunItemIndexEntries(left runItemIndexEntry, right runItemIndexEntry) int {
	if left.CreatedAt < right.CreatedAt {
		return -1
	}
	if left.CreatedAt > right.CreatedAt {
		return 1
	}
	if left.ID < right.ID {
		return -1
	}
	if left.ID > right.ID {
		return 1
	}
	return 0
}
