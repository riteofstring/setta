package conversation

import (
	"fmt"
	"time"
)

const MaxNavigatorPageLimit = 100

type NavigatorCursor struct {
	UpdatedAt      string `json:"updatedAt"`
	ConversationID string `json:"conversationId"`
}

type NavigatorItem struct {
	Conversation        TopicConversation               `json:"conversation"`
	PresentationProfile ConversationPresentationProfile `json:"presentationProfile"`
	Branch              *ConversationBranch             `json:"branch"`
}

type NavigatorPage struct {
	Items      []NavigatorItem  `json:"items"`
	NextCursor *NavigatorCursor `json:"nextCursor"`
}

func (cursor NavigatorCursor) Validate() error {
	if _, err := validateTimestamp("conversation navigator cursor updatedAt", cursor.UpdatedAt); err != nil {
		return err
	}
	return validateIdentifier("conversation navigator cursor conversation id", cursor.ConversationID)
}

func (item NavigatorItem) Validate(workspaceID string) error {
	if err := validateIdentifier("conversation navigator workspace id", workspaceID); err != nil {
		return err
	}
	if err := item.Conversation.Validate(); err != nil {
		return err
	}
	if item.Conversation.WorkspaceID != workspaceID {
		return fmt.Errorf(
			"conversation navigator item %s belongs to workspace %s, want %s",
			item.Conversation.ID,
			item.Conversation.WorkspaceID,
			workspaceID,
		)
	}
	if item.Conversation.ArchivedAt != nil {
		return fmt.Errorf("conversation navigator item %s is archived", item.Conversation.ID)
	}
	if err := item.PresentationProfile.Validate(); err != nil {
		return err
	}
	if item.PresentationProfile.ConversationID != item.Conversation.ID {
		return fmt.Errorf("conversation navigator item %s presentation profile ownership does not match", item.Conversation.ID)
	}
	if item.Branch == nil {
		return nil
	}
	if err := item.Branch.Validate(); err != nil {
		return err
	}
	if item.Branch.ChildConversationID != item.Conversation.ID {
		return fmt.Errorf("conversation navigator item %s branch ownership does not match", item.Conversation.ID)
	}
	return nil
}

func (page NavigatorPage) Validate(workspaceID string, limit int) error {
	if limit <= 0 || limit > MaxNavigatorPageLimit {
		return fmt.Errorf("conversation navigator page limit must be between 1 and %d: %d", MaxNavigatorPageLimit, limit)
	}
	if page.Items == nil {
		return fmt.Errorf("conversation navigator page items must be an array")
	}
	if len(page.Items) > limit {
		return fmt.Errorf("conversation navigator page contains %d items, limit is %d", len(page.Items), limit)
	}
	if err := validateNavigatorItems(workspaceID, page.Items); err != nil {
		return err
	}
	return validateNavigatorNextCursor(page)
}

func validateNavigatorItems(workspaceID string, items []NavigatorItem) error {
	seen := make(map[string]bool, len(items))
	for index, item := range items {
		if err := item.Validate(workspaceID); err != nil {
			return fmt.Errorf("conversation navigator item %d: %w", index, err)
		}
		conversationID := item.Conversation.ID
		if seen[conversationID] {
			return fmt.Errorf("conversation navigator item %s is duplicated", conversationID)
		}
		seen[conversationID] = true
		if index > 0 && !navigatorItemBefore(items[index-1], item) {
			return fmt.Errorf("conversation navigator page is not ordered by recency and id")
		}
	}
	return nil
}

func validateNavigatorNextCursor(page NavigatorPage) error {
	if page.NextCursor == nil {
		return nil
	}
	if err := page.NextCursor.Validate(); err != nil {
		return err
	}
	if len(page.Items) == 0 {
		return fmt.Errorf("conversation navigator page cannot have a next cursor without items")
	}
	last := page.Items[len(page.Items)-1].Conversation
	if page.NextCursor.UpdatedAt != last.UpdatedAt || page.NextCursor.ConversationID != last.ID {
		return fmt.Errorf("conversation navigator next cursor does not match the final item")
	}
	return nil
}

func navigatorItemBefore(left NavigatorItem, right NavigatorItem) bool {
	leftUpdatedAt, leftErr := time.Parse(time.RFC3339Nano, left.Conversation.UpdatedAt)
	rightUpdatedAt, rightErr := time.Parse(time.RFC3339Nano, right.Conversation.UpdatedAt)
	if leftErr != nil || rightErr != nil {
		return false
	}
	if !leftUpdatedAt.Equal(rightUpdatedAt) {
		return leftUpdatedAt.After(rightUpdatedAt)
	}
	return left.Conversation.ID < right.Conversation.ID
}
