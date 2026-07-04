package chat

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"
)

func updateConversationAfterPrompt(conversation Conversation, prompt string, now string) Conversation {
	if conversation.Title == "New chat" {
		conversation.Title = summarize(prompt, maxConversationTitle)
	}
	conversation.UpdatedAt = now
	return conversation
}

func latestHarnessRef(conversation Conversation, harness HarnessKind) HarnessThreadRef {
	for index := len(conversation.HarnessRefs) - 1; index >= 0; index-- {
		if conversation.HarnessRefs[index].Harness == harness {
			return conversation.HarnessRefs[index]
		}
	}
	return HarnessThreadRef{}
}

func upsertHarnessRef(refs *[]HarnessThreadRef, next HarnessThreadRef) {
	for index, existing := range *refs {
		if existing.Harness == next.Harness && existing.ThreadID == next.ThreadID {
			if existing.CreatedAt != "" {
				next.CreatedAt = existing.CreatedAt
			}
			(*refs)[index] = next
			return
		}
	}
	*refs = append(*refs, next)
}

func approvalResponseSummary(response string, answers []ApprovalAnswer) string {
	if strings.TrimSpace(response) != "" {
		return response
	}
	parts := make([]string, 0, len(answers))
	for _, answer := range answers {
		if len(answer.Answers) == 0 {
			continue
		}
		parts = append(parts, answer.QuestionID+": "+strings.Join(answer.Answers, ", "))
	}
	return strings.Join(parts, "\n")
}

func activeKey(workspaceID string, conversationID string) string {
	return workspaceID + "\x00" + conversationID
}

func summarize(value string, limit int) string {
	return normalizedTextPreview(value, limit)
}

func promptFromMessage(message ChatMessage) string {
	return messageText(message)
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func randomID(prefix string) (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(bytes[:]), nil
}
