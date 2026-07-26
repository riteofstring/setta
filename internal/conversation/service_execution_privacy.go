package conversation

import (
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/agent"
)

// privateWorkingDirectoryRedaction is the public replacement for the absolute
// app-data path an unbound provider process runs in. It preserves useful
// command and file context without exposing an internal host path as though it
// were one of the user's workspaces.
const privateWorkingDirectoryRedaction = "[working directory]"

// redactPrivateExecutionEvent removes the private working-directory path from
// every provider-authored string that can become durable conversation state.
// Provider item and turn identities are left untouched because they correlate
// lifecycle events; the working directory is never part of those identities.
func redactPrivateExecutionEvent(
	scope conversationExecutionScope,
	event agent.Event,
) agent.Event {
	aliases := privateWorkingDirectoryAliases(scope)
	if len(aliases) == 0 {
		return event
	}
	redact := func(value string) string {
		return redactPrivateWorkingDirectoryText(aliases, value)
	}
	redactPointer := func(value *string) *string {
		if value == nil {
			return nil
		}
		redacted := redact(*value)
		return &redacted
	}

	if event.Text != nil {
		value := *event.Text
		value.Text = redact(value.Text)
		event.Text = &value
	}
	if event.Plan != nil {
		value := *event.Plan
		value.Explanation = redactPointer(value.Explanation)
		value.Steps = append([]agent.PlanStep{}, value.Steps...)
		for index := range value.Steps {
			value.Steps[index].Step = redact(value.Steps[index].Step)
		}
		event.Plan = &value
	}
	if event.Activity != nil {
		value := *event.Activity
		value.Title = redact(value.Title)
		value.Summary = redact(value.Summary)
		value.Command = redactPointer(value.Command)
		value.CWD = redactPointer(value.CWD)
		value.Server = redactPointer(value.Server)
		value.Tool = redactPointer(value.Tool)
		value.Namespace = redactPointer(value.Namespace)
		value.ProcessID = redactPointer(value.ProcessID)
		value.SavedPath = redactPointer(value.SavedPath)
		value.FileChanges = append([]agent.FileChange{}, value.FileChanges...)
		for index := range value.FileChanges {
			value.FileChanges[index].Path = redact(value.FileChanges[index].Path)
			value.FileChanges[index].MovePath = redactPointer(value.FileChanges[index].MovePath)
			value.FileChanges[index].Diff = redact(value.FileChanges[index].Diff)
		}
		event.Activity = &value
	}
	if event.Approval != nil {
		value := *event.Approval
		value.Title = redact(value.Title)
		value.Body = redact(value.Body)
		value.Command = redact(value.Command)
		value.Path = redact(value.Path)
		value.PermissionProfile = redact(value.PermissionProfile)
		value.Questions = append([]agent.ApprovalQuestion{}, value.Questions...)
		for index := range value.Questions {
			value.Questions[index].Header = redact(value.Questions[index].Header)
			value.Questions[index].Question = redact(value.Questions[index].Question)
			value.Questions[index].Options = append([]string{}, value.Questions[index].Options...)
			for optionIndex := range value.Questions[index].Options {
				value.Questions[index].Options[optionIndex] = redact(
					value.Questions[index].Options[optionIndex],
				)
			}
		}
		event.Approval = &value
	}
	if event.Validation != nil {
		value := *event.Validation
		value.Subject = redactPointer(value.Subject)
		value.Summary = redact(value.Summary)
		event.Validation = &value
	}
	if event.Terminal != nil {
		value := *event.Terminal
		value.Error = redactPointer(value.Error)
		event.Terminal = &value
	}
	return event
}

// redactPrivateExecutionEventForTurn adds stream awareness to the stateless
// event redactor. A provider may split an absolute path across answer,
// reasoning, or process-progress deltas, so the only suffix delayed from each
// delta is one that could become a complete private-path alias when the next
// delta arrives. Completed snapshots are redacted independently and clear the
// pending suffix.
func redactPrivateExecutionEventForTurn(
	active *activeConversationTurn,
	event agent.Event,
) (agent.Event, bool) {
	if active == nil {
		return event, true
	}
	aliases := privateWorkingDirectoryAliases(active.scope)
	if len(aliases) == 0 {
		return event, true
	}
	switch event.Kind {
	case agent.EventKindAgentTextCompleted:
		clearPrivateStreamTail(active, privateAnswerStreamKey(event.Text))
		return redactPrivateExecutionEvent(active.scope, event), true
	case agent.EventKindReasoningSummary:
		if event.Text != nil && event.Text.Final {
			clearPrivateStreamTail(active, privateReasoningStreamKey(event.Text))
			return redactPrivateExecutionEvent(active.scope, event), true
		}
		return redactPrivateTextStreamDelta(
			active,
			event,
			aliases,
			privateReasoningStreamKey(event.Text),
		)
	case agent.EventKindAgentTextDelta:
		return redactPrivateTextStreamDelta(
			active,
			event,
			aliases,
			privateAnswerStreamKey(event.Text),
		)
	case agent.EventKindActivityStarted, agent.EventKindActivityCompleted:
		if event.Activity != nil {
			clearPrivateStreamTail(active, privateActivityStreamKey(event.Activity))
		}
		return redactPrivateExecutionEvent(active.scope, event), true
	case agent.EventKindActivityUpdated:
		return redactPrivateActivityStreamDelta(active, event, aliases)
	default:
		return redactPrivateExecutionEvent(active.scope, event), true
	}
}

func redactPrivateTextStreamDelta(
	active *activeConversationTurn,
	event agent.Event,
	aliases []string,
	key string,
) (agent.Event, bool) {
	if event.Text == nil {
		return redactPrivateExecutionEvent(active.scope, event), true
	}
	text := *event.Text
	var persist bool
	text.Text, persist = redactPrivateStreamDelta(active, key, text.Text, aliases)
	if !persist {
		return event, false
	}
	event.Text = &text
	return event, true
}

func redactPrivateActivityStreamDelta(
	active *activeConversationTurn,
	event agent.Event,
	aliases []string,
) (agent.Event, bool) {
	if event.Activity == nil {
		return redactPrivateExecutionEvent(active.scope, event), true
	}
	activity := *event.Activity
	key := privateActivityStreamKey(&activity)
	var persist bool
	if strings.TrimSpace(activity.Summary) != "" {
		activity.Summary, persist = redactPrivateStreamDelta(
			active,
			key,
			activity.Summary,
			aliases,
		)
	} else {
		activity.Title, persist = redactPrivateStreamDelta(
			active,
			key,
			activity.Title,
			aliases,
		)
	}
	if !persist {
		return event, false
	}
	event.Activity = &activity
	return redactPrivateExecutionEvent(active.scope, event), true
}

func redactPrivateStreamDelta(
	active *activeConversationTurn,
	key string,
	value string,
	aliases []string,
) (string, bool) {
	if active.privateStreamTails == nil {
		active.privateStreamTails = map[string]string{}
	}
	buffer := active.privateStreamTails[key] + value
	buffer = redactPrivateWorkingDirectoryText(aliases, buffer)
	tailLength := privatePathPrefixTailLength(buffer, aliases)
	value = buffer[:len(buffer)-tailLength]
	active.privateStreamTails[key] = buffer[len(buffer)-tailLength:]
	return value, value != ""
}

func clearPrivateStreamTail(active *activeConversationTurn, key string) {
	if active.privateStreamTails != nil && key != "" {
		delete(active.privateStreamTails, key)
	}
}

func privateAnswerStreamKey(text *agent.TextEvent) string {
	if text == nil {
		return ""
	}
	return "answer:" + text.ProviderItemID
}

func privateReasoningStreamKey(text *agent.TextEvent) string {
	if text == nil {
		return ""
	}
	return "reasoning:" + text.ProviderItemID
}

func privateActivityStreamKey(activity *agent.ActivityEvent) string {
	if activity == nil {
		return ""
	}
	return "activity:" + activity.ProviderItemID
}

func redactPrivateWorkingDirectoryText(aliases []string, value string) string {
	for _, alias := range aliases {
		value = strings.ReplaceAll(value, alias, privateWorkingDirectoryRedaction)
	}
	return value
}

func privatePathPrefixTailLength(value string, aliases []string) int {
	longest := 0
	for _, alias := range aliases {
		for end := range alias {
			if end > longest && strings.HasSuffix(value, alias[:end]) {
				longest = end
			}
		}
		if len(alias) > longest && strings.HasSuffix(value, alias) {
			longest = len(alias)
		}
	}
	return longest
}

func privateWorkingDirectoryAliases(scope conversationExecutionScope) []string {
	if scope.workspaceID != nil || scope.workingDirectory == "" {
		return nil
	}
	if len(scope.privatePathAliases) > 0 {
		return scope.privatePathAliases
	}
	return resolvePrivateWorkingDirectoryAliases(scope.workingDirectory)
}

func resolvePrivateWorkingDirectoryAliases(workingDirectory string) []string {
	aliases := map[string]bool{}
	add := func(value string) {
		if value == "" || value == "." {
			return
		}
		aliases[value] = true
		aliases[filepath.ToSlash(value)] = true
	}
	add(filepath.Clean(workingDirectory))
	if canonical, err := filepath.EvalSymlinks(workingDirectory); err == nil {
		add(filepath.Clean(canonical))
	}
	result := make([]string, 0, len(aliases))
	for alias := range aliases {
		result = append(result, alias)
	}
	// Replace a canonical child or otherwise longer spelling before one of its
	// prefixes so no suffix of the private root survives.
	sort.Slice(result, func(left int, right int) bool {
		return len(result[left]) > len(result[right])
	})
	return result
}

func containsPrivateWorkingDirectory(
	scope conversationExecutionScope,
	value string,
) bool {
	for _, alias := range privateWorkingDirectoryAliases(scope) {
		if strings.Contains(value, alias) {
			return true
		}
	}
	return false
}

func userVisibleWorkingDirectory(scope conversationExecutionScope) string {
	if len(privateWorkingDirectoryAliases(scope)) > 0 {
		return privateWorkingDirectoryRedaction
	}
	return scope.workingDirectory
}
