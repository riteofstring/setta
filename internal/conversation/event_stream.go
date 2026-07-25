package conversation

import (
	"fmt"
	"strconv"
	"strings"
)

// One conversation's durable event stream inside the app-wide committed log.
// The prefix is what keeps a conversation cursor from ever addressing another
// owner's stream, and it is owned here rather than spelled out at each caller.

const conversationStreamPrefix = "conversation:"

func ConversationStreamID(conversationID string) (string, error) {
	if err := validateIdentifier("conversation event stream conversation id", conversationID); err != nil {
		return "", err
	}
	return conversationStreamPrefix + conversationID, nil
}

// ConversationIDFromStreamID names the conversation a durable stream belongs to.
// An app-scoped reader of the committed log needs it for the few payloads that
// can be empty, such as a queue that just drained to nothing.
func ConversationIDFromStreamID(streamID string) (string, error) {
	conversationID, found := strings.CutPrefix(streamID, conversationStreamPrefix)
	if !found {
		return "", fmt.Errorf("stream %q is not a conversation event stream", streamID)
	}
	if err := validateIdentifier("conversation event stream conversation id", conversationID); err != nil {
		return "", err
	}
	return conversationID, nil
}

func ConversationEventID(streamID string, sequence int) (string, error) {
	if err := validateIdentifier("conversation event stream id", streamID); err != nil {
		return "", err
	}
	if sequence <= 0 {
		return "", fmt.Errorf("conversation event sequence must be positive: %d", sequence)
	}
	return streamID + ":" + strconv.Itoa(sequence), nil
}
