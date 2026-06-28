package chat

import (
	"fmt"
	"strings"
)

type chatCommandDefinition struct {
	DefaultGoalAction GoalCommandAction
	Description       string
	Grammar           ChatCommandGrammar
	Kind              ChatSlashCommandKind
	Name              string
}

var chatCommandDefinitions = []chatCommandDefinition{
	{
		DefaultGoalAction: GoalCommandShow,
		Description:       "Show, edit, set, pause, resume, or clear the active goal.",
		Grammar: ChatCommandGrammar{
			Summary:      "/goal [objective|edit|clear|pause|resume]",
			LiteralMatch: ChatCommandLiteralMatchExact,
			Arguments: []ChatCommandArgumentSpec{
				ChatCommandLiteralArgumentSpec{
					Kind:        ChatCommandArgumentLiteral,
					Token:       "edit",
					Description: "Open the goal editor.",
					GoalAction:  GoalCommandEdit,
				},
				ChatCommandLiteralArgumentSpec{
					Kind:        ChatCommandArgumentLiteral,
					Token:       "clear",
					Description: "Clear the active goal.",
					GoalAction:  GoalCommandClear,
				},
				ChatCommandLiteralArgumentSpec{
					Kind:        ChatCommandArgumentLiteral,
					Token:       "pause",
					Description: "Pause the active goal.",
					GoalAction:  GoalCommandPause,
					GoalStatus:  "paused",
				},
				ChatCommandLiteralArgumentSpec{
					Kind:        ChatCommandArgumentLiteral,
					Token:       "resume",
					Description: "Resume the active goal.",
					GoalAction:  GoalCommandResume,
					GoalStatus:  "active",
				},
				ChatCommandFreeTextArgumentSpec{
					Kind:        ChatCommandArgumentFreeText,
					Name:        "objective",
					Description: "Set or replace the active goal objective.",
					MaxRunes:    maxGoalObjectiveRunes,
					Required:    false,
					GoalAction:  GoalCommandSet,
					GoalStatus:  "active",
				},
			},
		},
		Kind: ChatSlashCommandGoal,
		Name: "goal",
	},
}

func chatCommandDefinitionByName(name string) (chatCommandDefinition, bool) {
	for _, definition := range chatCommandDefinitions {
		if definition.Name == name {
			return definition, true
		}
	}
	return chatCommandDefinition{}, false
}

func chatCommandNameBySlashKind(kind ChatSlashCommandKind) (string, bool) {
	for _, definition := range chatCommandDefinitions {
		if definition.Kind == kind {
			return "/" + definition.Name, true
		}
	}
	return "", false
}

func defaultCommandDescriptors(activeRun *Run) []ChatCommandDescriptor {
	descriptors := make([]ChatCommandDescriptor, 0, len(chatCommandDefinitions))
	for _, definition := range chatCommandDefinitions {
		available, reason := chatCommandAvailability(definition.Kind, activeRun)
		descriptors = append(descriptors, ChatCommandDescriptor{
			Available:         available,
			Description:       definition.Description,
			Grammar:           definition.Grammar,
			Kind:              definition.Kind,
			Name:              "/" + definition.Name,
			UnavailableReason: reason,
		})
	}
	mustValidateChatCommandDescriptors(descriptors)
	return descriptors
}

func parseChatCommandDefinition(raw string, args string, definition chatCommandDefinition) (ChatCommand, error) {
	if args == "" {
		return defaultChatCommandForDefinition(raw, args, definition)
	}
	if literal, ok := exactLiteralArgument(definition.Grammar, args); ok {
		return literalChatCommandForDefinition(raw, args, definition, literal)
	}
	if freeText, ok := freeTextArgument(definition.Grammar); ok {
		if len([]rune(args)) > freeText.MaxRunes {
			return ChatCommand{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("/%s %s must be %d characters or fewer", definition.Name, freeText.Name, freeText.MaxRunes), nil)
		}
		return freeTextChatCommandForDefinition(raw, args, definition, freeText)
	}
	return ChatCommand{}, commandError(ChatCommandErrorMalformedCommand, "/"+definition.Name+" does not accept arguments: "+args, nil)
}

func exactLiteralArgument(grammar ChatCommandGrammar, args string) (ChatCommandLiteralArgumentSpec, bool) {
	if grammar.LiteralMatch != ChatCommandLiteralMatchExact {
		return ChatCommandLiteralArgumentSpec{}, false
	}
	for _, argument := range grammar.Arguments {
		literal, ok := argument.(ChatCommandLiteralArgumentSpec)
		if !ok {
			continue
		}
		if literal.Token == args {
			return literal, true
		}
	}
	return ChatCommandLiteralArgumentSpec{}, false
}

func freeTextArgument(grammar ChatCommandGrammar) (ChatCommandFreeTextArgumentSpec, bool) {
	for _, argument := range grammar.Arguments {
		freeText, ok := argument.(ChatCommandFreeTextArgumentSpec)
		if ok {
			return freeText, true
		}
	}
	return ChatCommandFreeTextArgumentSpec{}, false
}

func defaultChatCommandForDefinition(raw string, args string, definition chatCommandDefinition) (ChatCommand, error) {
	switch definition.Kind {
	case ChatSlashCommandGoal:
		return goalChatCommand(raw, args, definition.DefaultGoalAction, "", ""), nil
	default:
		return ChatCommand{}, commandError(ChatCommandErrorUnsupportedHarness, fmt.Sprintf("unsupported chat command kind: %s", definition.Kind), nil)
	}
}

func literalChatCommandForDefinition(raw string, args string, definition chatCommandDefinition, literal ChatCommandLiteralArgumentSpec) (ChatCommand, error) {
	switch definition.Kind {
	case ChatSlashCommandGoal:
		return goalChatCommand(raw, args, literal.GoalAction, "", literal.GoalStatus), nil
	default:
		return ChatCommand{}, commandError(ChatCommandErrorUnsupportedHarness, fmt.Sprintf("unsupported chat command kind: %s", definition.Kind), nil)
	}
}

func freeTextChatCommandForDefinition(raw string, args string, definition chatCommandDefinition, freeText ChatCommandFreeTextArgumentSpec) (ChatCommand, error) {
	switch definition.Kind {
	case ChatSlashCommandGoal:
		return goalChatCommand(raw, args, freeText.GoalAction, args, freeText.GoalStatus), nil
	default:
		return ChatCommand{}, commandError(ChatCommandErrorUnsupportedHarness, fmt.Sprintf("unsupported chat command kind: %s", definition.Kind), nil)
	}
}

func chatCommandAvailability(kind ChatSlashCommandKind, _ *Run) (bool, string) {
	switch kind {
	case ChatSlashCommandGoal:
		return true, ""
	default:
		return false, fmt.Sprintf("unsupported chat command kind: %s", kind)
	}
}

func mustValidateChatCommandDescriptors(descriptors []ChatCommandDescriptor) {
	if err := validateChatCommandDescriptors(descriptors); err != nil {
		panic(err)
	}
}

func validateChatCommandDescriptors(descriptors []ChatCommandDescriptor) error {
	seen := map[string]bool{}
	for _, descriptor := range descriptors {
		if err := validateChatCommandDescriptorIdentity(descriptor, seen); err != nil {
			return err
		}
		if err := validateChatCommandDescriptorFields(descriptor); err != nil {
			return err
		}
		if err := validateChatCommandDescriptorArguments(descriptor); err != nil {
			return err
		}
	}
	return nil
}

func validateChatCommandDescriptorIdentity(descriptor ChatCommandDescriptor, seen map[string]bool) error {
	if descriptor.Name == "" || !strings.HasPrefix(descriptor.Name, "/") {
		return fmt.Errorf("chat command descriptor has unsupported name %q", descriptor.Name)
	}
	name := strings.TrimPrefix(descriptor.Name, "/")
	if !isValidCommandName(name) {
		return fmt.Errorf("chat command descriptor %s has invalid command name", descriptor.Name)
	}
	if _, ok := chatCommandDefinitionByName(name); !ok {
		return fmt.Errorf("chat command descriptor %s has no parser definition", descriptor.Name)
	}
	if seen[descriptor.Name] {
		return fmt.Errorf("chat command descriptor %s is duplicated", descriptor.Name)
	}
	seen[descriptor.Name] = true
	return nil
}

func validateChatCommandDescriptorFields(descriptor ChatCommandDescriptor) error {
	if !validValue(descriptor.Kind, chatSlashCommandKindValues) {
		return fmt.Errorf("chat command descriptor %s has unsupported kind %s", descriptor.Name, descriptor.Kind)
	}
	if descriptor.Description == "" {
		return fmt.Errorf("chat command descriptor %s description is required", descriptor.Name)
	}
	if descriptor.Grammar.Summary == "" {
		return fmt.Errorf("chat command descriptor %s grammar summary is required", descriptor.Name)
	}
	if !validValue(descriptor.Grammar.LiteralMatch, chatCommandLiteralMatchModeValues) {
		return fmt.Errorf("chat command descriptor %s has unsupported literal match mode %s", descriptor.Name, descriptor.Grammar.LiteralMatch)
	}
	if descriptor.Available && descriptor.UnavailableReason != "" {
		return fmt.Errorf("chat command descriptor %s is available with an unavailable reason", descriptor.Name)
	}
	if !descriptor.Available && descriptor.UnavailableReason == "" {
		return fmt.Errorf("chat command descriptor %s is unavailable without a reason", descriptor.Name)
	}
	return nil
}

func validateChatCommandDescriptorArguments(descriptor ChatCommandDescriptor) error {
	for _, argument := range descriptor.Grammar.Arguments {
		if err := validateChatCommandArgumentSpec(descriptor.Name, argument); err != nil {
			return err
		}
	}
	return nil
}

func validateChatCommandArgumentSpec(commandName string, argument ChatCommandArgumentSpec) error {
	switch spec := argument.(type) {
	case ChatCommandLiteralArgumentSpec:
		return validateChatCommandLiteralArgumentSpec(commandName, spec)
	case ChatCommandFreeTextArgumentSpec:
		return validateChatCommandFreeTextArgumentSpec(commandName, spec)
	default:
		return fmt.Errorf("%s has unsupported argument spec %T", commandName, argument)
	}
}

func validateChatCommandLiteralArgumentSpec(commandName string, spec ChatCommandLiteralArgumentSpec) error {
	if spec.Kind != ChatCommandArgumentLiteral {
		return fmt.Errorf("%s literal argument has kind %s", commandName, spec.Kind)
	}
	if spec.Token == "" || strings.ContainsAny(spec.Token, " \t\r\n") {
		return fmt.Errorf("%s literal argument has invalid token %q", commandName, spec.Token)
	}
	if spec.Description == "" {
		return fmt.Errorf("%s literal argument %s description is required", commandName, spec.Token)
	}
	if commandName == "/goal" && !validValue(spec.GoalAction, goalCommandActionValues) {
		return fmt.Errorf("%s literal argument %s has unsupported goal action %s", commandName, spec.Token, spec.GoalAction)
	}
	return nil
}

func validateChatCommandFreeTextArgumentSpec(commandName string, spec ChatCommandFreeTextArgumentSpec) error {
	if spec.Kind != ChatCommandArgumentFreeText {
		return fmt.Errorf("%s free text argument has kind %s", commandName, spec.Kind)
	}
	if spec.Name == "" {
		return fmt.Errorf("%s free text argument name is required", commandName)
	}
	if spec.Description == "" {
		return fmt.Errorf("%s free text argument %s description is required", commandName, spec.Name)
	}
	if spec.MaxRunes <= 0 {
		return fmt.Errorf("%s free text argument %s maxRunes must be positive", commandName, spec.Name)
	}
	if commandName == "/goal" && !validValue(spec.GoalAction, goalCommandActionValues) {
		return fmt.Errorf("%s free text argument %s has unsupported goal action %s", commandName, spec.Name, spec.GoalAction)
	}
	return nil
}
