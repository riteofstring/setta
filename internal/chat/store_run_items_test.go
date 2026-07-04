package chat

import (
	"fmt"
	"os"
	"testing"
)

func TestStoreLoadRunItemsPageDoesNotReadBeyondLimit(t *testing.T) {
	store := mustStore(t, t.TempDir())
	saveRunItemRange(t, store, 1, 4)
	if err := os.WriteFile(store.runItemPath("workspace_api", "run_api", "run_item_0004"), []byte("{"), 0o644); err != nil {
		t.Fatalf("corrupt out-of-page item: %v", err)
	}

	items, nextItemID, hasMore, err := store.LoadRunItemsPage("workspace_api", "run_api", "", 3)
	if err != nil {
		t.Fatalf("load run items page: %v", err)
	}
	if len(items) != 3 || nextItemID != "run_item_0003" || !hasMore {
		t.Fatalf("items len/next/hasMore = %d/%s/%v, want 3/run_item_0003/true", len(items), nextItemID, hasMore)
	}

	if _, err := store.LoadRunItems("workspace_api", "run_api"); err == nil {
		t.Fatal("full run item load succeeded after corrupting out-of-page item, want corrupt state error")
	}
}

func TestStoreLoadRunItemsPageRebuildsStaleIndex(t *testing.T) {
	store := mustStore(t, t.TempDir())
	items := saveRunItemRange(t, store, 1, 4)
	staleIndex := runItemIndexFromItems(items[:3])
	if err := store.writeRunItemIndex("workspace_api", "run_api", staleIndex); err != nil {
		t.Fatalf("write stale run item index: %v", err)
	}

	firstPage, nextItemID, hasMore, err := store.LoadRunItemsPage("workspace_api", "run_api", "", 2)
	if err != nil {
		t.Fatalf("load first run item page: %v", err)
	}
	if runItemIDs(firstPage) != "run_item_0001,run_item_0002" || nextItemID != "run_item_0002" || !hasMore {
		t.Fatalf("first page ids/next/hasMore = %s/%s/%v", runItemIDs(firstPage), nextItemID, hasMore)
	}

	secondPage, nextItemID, hasMore, err := store.LoadRunItemsPage("workspace_api", "run_api", nextItemID, 2)
	if err != nil {
		t.Fatalf("load second run item page: %v", err)
	}
	if runItemIDs(secondPage) != "run_item_0003,run_item_0004" || nextItemID != "" || hasMore {
		t.Fatalf("second page ids/next/hasMore = %s/%s/%v", runItemIDs(secondPage), nextItemID, hasMore)
	}
}

func TestStoreLoadRunItemsBeforeReadsTailPages(t *testing.T) {
	store := mustStore(t, t.TempDir())
	saveRunItemRange(t, store, 1, 4)

	tailPage, nextBeforeItemID, hasMore, err := store.LoadRunItemsBefore("workspace_api", "run_api", "", 2)
	if err != nil {
		t.Fatalf("load tail run item page: %v", err)
	}
	if runItemIDs(tailPage) != "run_item_0003,run_item_0004" || nextBeforeItemID != "run_item_0003" || !hasMore {
		t.Fatalf("tail page ids/nextBefore/hasMore = %s/%s/%v", runItemIDs(tailPage), nextBeforeItemID, hasMore)
	}

	olderPage, nextBeforeItemID, hasMore, err := store.LoadRunItemsBefore("workspace_api", "run_api", nextBeforeItemID, 2)
	if err != nil {
		t.Fatalf("load older run item page: %v", err)
	}
	if runItemIDs(olderPage) != "run_item_0001,run_item_0002" || nextBeforeItemID != "" || hasMore {
		t.Fatalf("older page ids/nextBefore/hasMore = %s/%s/%v", runItemIDs(olderPage), nextBeforeItemID, hasMore)
	}
}

func saveRunItemRange(t *testing.T, store *Store, start int, end int) []RunItem {
	t.Helper()
	items := make([]RunItem, 0, end-start+1)
	for index := start; index <= end; index++ {
		item := RunItem{
			SchemaVersion:  SchemaVersion,
			ID:             fmt.Sprintf("run_item_%04d", index),
			WorkspaceID:    "workspace_api",
			ConversationID: "conversation_api",
			RunID:          "run_api",
			ProviderItemID: fmt.Sprintf("provider_%04d", index),
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusCompleted,
			Title:          fmt.Sprintf("Command %d", index),
			Details:        NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{Command: fmt.Sprintf("printf %d", index)}),
			CreatedAt:      fmt.Sprintf("2026-05-29T20:00:0%dZ", index),
		}
		if err := store.SaveRunItem(item); err != nil {
			t.Fatalf("save run item %d: %v", index, err)
		}
		items = append(items, item)
	}
	return items
}

func runItemIDs(items []RunItem) string {
	ids := ""
	for index, item := range items {
		if index > 0 {
			ids += ","
		}
		ids += item.ID
	}
	return ids
}
