package chat

import (
	"strings"
	"testing"
)

func TestParseChatCommandGoalCommands(t *testing.T) {
	tests := []struct {
		raw       string
		action    GoalCommandAction
		objective string
		status    string
		args      string
	}{
		{raw: "/goal", action: GoalCommandShow},
		{raw: "/goal   ", action: GoalCommandShow},
		{raw: "/goal edit", action: GoalCommandEdit, args: "edit"},
		{raw: "/goal finish renderer tests", action: GoalCommandSet, objective: "finish renderer tests", status: "active", args: "finish renderer tests"},
		{raw: "/goal e", action: GoalCommandSet, objective: "e", status: "active", args: "e"},
		{raw: "/goal clear", action: GoalCommandClear, args: "clear"},
		{raw: "/goal clear the cache", action: GoalCommandSet, objective: "clear the cache", status: "active", args: "clear the cache"},
		{raw: "/goal pause", action: GoalCommandPause, status: "paused", args: "pause"},
		{raw: "/goal resume", action: GoalCommandResume, status: "active", args: "resume"},
	}
	for _, test := range tests {
		command, err := ParseChatCommand(test.raw)
		if err != nil {
			t.Fatalf("parse %q: %v", test.raw, err)
		}
		if command.Kind != ChatCommandGoal || command.Goal == nil {
			t.Fatalf("parse %q = %+v, want goal command", test.raw, command)
		}
		if command.Goal.Action != test.action || command.Goal.Objective != test.objective || command.Goal.Status != test.status || command.Args != test.args {
			t.Fatalf("parse %q goal = %+v args %q, want action %s objective %q status %q args %q", test.raw, command.Goal, command.Args, test.action, test.objective, test.status, test.args)
		}
	}
}

func TestDefaultCommandDescriptorsExposeTypedGrammar(t *testing.T) {
	descriptors := defaultCommandDescriptors(nil)
	if err := validateChatCommandDescriptors(descriptors); err != nil {
		t.Fatalf("validate descriptors: %v", err)
	}
	if len(descriptors) != 1 {
		t.Fatalf("descriptors = %+v, want /goal only", descriptors)
	}
	goal := commandDescriptorByKind(t, descriptors, ChatSlashCommandGoal)
	if goal.Name != "/goal" || goal.Grammar.Summary == "" {
		t.Fatalf("goal descriptor = %+v, want named grammar", goal)
	}
	if goal.Grammar.LiteralMatch != ChatCommandLiteralMatchExact {
		t.Fatalf("goal descriptor = %+v, want exact-literal grammar", goal)
	}
	if _, err := ParseChatCommand(goal.Name); err != nil {
		t.Fatalf("parse descriptor command %s: %v", goal.Name, err)
	}
	literals := map[string]bool{}
	freeText := false
	for _, argument := range goal.Grammar.Arguments {
		switch spec := argument.(type) {
		case ChatCommandLiteralArgumentSpec:
			literals[spec.Token] = true
		case ChatCommandFreeTextArgumentSpec:
			freeText = spec.Name == "objective" && spec.MaxRunes == maxGoalObjectiveRunes
		}
	}
	for _, token := range []string{"edit", "clear", "pause", "resume"} {
		if !literals[token] {
			t.Fatalf("goal literals = %+v, want %s", literals, token)
		}
	}
	if !freeText {
		t.Fatalf("goal arguments = %+v, want objective free text", goal.Grammar.Arguments)
	}
}

func commandDescriptorByKind(t *testing.T, descriptors []ChatCommandDescriptor, kind ChatSlashCommandKind) ChatCommandDescriptor {
	t.Helper()
	for _, descriptor := range descriptors {
		if descriptor.Kind == kind {
			return descriptor
		}
	}
	t.Fatalf("command descriptor %s not found in %+v", kind, descriptors)
	return ChatCommandDescriptor{}
}

func TestModelSelectionCommandsAreTypedActions(t *testing.T) {
	set, err := modelSetChatCommand("gpt-5.5")
	if err != nil {
		t.Fatalf("build model set command: %v", err)
	}
	if set.Model == nil || set.Model.Action != ModelCommandSet || set.Model.ModelID != "gpt-5.5" {
		t.Fatalf("set command = %+v, want model set", set)
	}

	effort, err := reasoningEffortSetChatCommand(ReasoningEffortHigh)
	if err != nil {
		t.Fatalf("build effort set command: %v", err)
	}
	if effort.Model == nil || effort.Model.Action != ModelCommandSetEffort || effort.Model.ReasoningEffort == nil || *effort.Model.ReasoningEffort != ReasoningEffortHigh {
		t.Fatalf("effort command = %+v, want reasoning effort set", effort)
	}
}

func TestReasoningEffortDisplayNamesIncludeCurrentCodexLevels(t *testing.T) {
	if got := reasoningEffortDisplayName(ReasoningEffortMax); got != "Max" {
		t.Fatalf("max display name = %q, want Max", got)
	}
	if got := reasoningEffortDisplayName(ReasoningEffortUltra); got != "Ultra" {
		t.Fatalf("ultra display name = %q, want Ultra", got)
	}
}

func TestParseChatCommandRejectsMalformedAndUnknownInput(t *testing.T) {
	tests := []struct {
		raw  string
		code ChatCommandErrorCode
		text string
	}{
		{raw: "goal", code: ChatCommandErrorMalformedCommand, text: "must start with /"},
		{raw: "/", code: ChatCommandErrorMalformedCommand, text: "name is required"},
		{raw: "/Goal", code: ChatCommandErrorMalformedCommand, text: "lowercase"},
		{raw: "/goal!", code: ChatCommandErrorMalformedCommand, text: "lowercase"},
		{raw: "/unknown", code: ChatCommandErrorUnknownCommand, text: "unknown slash command"},
		{raw: "/goal " + strings.Repeat("a", maxGoalObjectiveRunes+1), code: ChatCommandErrorMalformedCommand, text: "4000 characters or fewer"},
	}
	for _, test := range tests {
		_, err := ParseChatCommand(test.raw)
		if err == nil {
			t.Fatalf("parse %q succeeded, want error", test.raw)
		}
		commandErr, ok := IsChatCommandError(err)
		if !ok || commandErr.Code != test.code {
			t.Fatalf("parse %q error = %#v, want code %s", test.raw, err, test.code)
		}
		if !strings.Contains(err.Error(), test.text) {
			t.Fatalf("parse %q error = %q, want %q", test.raw, err.Error(), test.text)
		}
	}
}
