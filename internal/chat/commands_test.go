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
		{raw: "/goal clear", action: GoalCommandClear, args: "clear"},
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

func TestParseChatCommandModelCommands(t *testing.T) {
	picker, err := ParseChatCommand("/model")
	if err != nil {
		t.Fatalf("parse /model: %v", err)
	}
	if picker.Kind != ChatCommandModel || picker.Model == nil || picker.Model.Action != ModelCommandShowPicker {
		t.Fatalf("picker command = %+v, want model picker", picker)
	}
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
		{raw: "/model gpt-5.5", code: ChatCommandErrorMalformedCommand, text: "opens the model picker"},
		{raw: "/model effort high", code: ChatCommandErrorMalformedCommand, text: "opens the model picker"},
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
