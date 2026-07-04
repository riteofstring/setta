package main

import (
	"fmt"
	"reflect"

	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
	"setta/internal/terminal"
	"setta/internal/workspaceactivity"
	"setta/internal/workspaceui"
)

func contractUnions() map[reflect.Type]unionSpec {
	commandArgument := reflect.TypeFor[chat.ChatCommandArgumentSpec]()
	return map[reflect.Type]unionSpec{
		commandArgument: {
			Discriminator: "kind",
			Name:          commandArgument.Name(),
			Type:          commandArgument,
			Variants: []unionVariantSpec{
				{
					KindValue: string(chat.ChatCommandArgumentLiteral),
					Name:      "ChatCommandLiteralArgumentSpec",
					Type:      reflect.TypeFor[chat.ChatCommandLiteralArgumentSpec](),
				},
				{
					KindValue: string(chat.ChatCommandArgumentFreeText),
					Name:      "ChatCommandFreeTextArgumentSpec",
					Type:      reflect.TypeFor[chat.ChatCommandFreeTextArgumentSpec](),
				},
			},
		},
	}
}

// contractTaggedUnions registers struct contracts whose `kind` discriminator
// selects exactly one nullable branch payload. The generated decoder validates
// that invariant (exactly one branch populated, matching kind) so a malformed
// block fails loudly at the decode boundary instead of null-dereferencing later.
func contractTaggedUnions() map[reflect.Type]taggedUnionSpec {
	return map[reflect.Type]taggedUnionSpec{
		reflect.TypeFor[chat.ChatInputPart](): {
			Discriminator: "type",
			Branches: []taggedUnionBranch{
				{Field: "text", KindValue: string(chat.MessagePartText)},
				{Field: "image", KindValue: string(chat.MessagePartImage)},
			},
		},
		reflect.TypeFor[chat.MessagePart](): {
			Discriminator: "type",
			Branches: []taggedUnionBranch{
				{Field: "text", KindValue: string(chat.MessagePartText)},
				{Field: "image", KindValue: string(chat.MessagePartImage)},
			},
		},
		reflect.TypeFor[chat.TranscriptBlock](): {
			Discriminator: "kind",
			Branches: []taggedUnionBranch{
				{Field: "userMessage", KindValue: string(chat.TranscriptBlockKindUserMessage)},
				{Field: "assistantText", KindValue: string(chat.TranscriptBlockKindAssistantText)},
				{Field: "reasoning", KindValue: string(chat.TranscriptBlockKindReasoning)},
				{Field: "activity", KindValue: string(chat.TranscriptBlockKindActivityItem)},
				{Field: "runStatus", KindValue: string(chat.TranscriptBlockKindRunStatus)},
				{Field: "backgroundTerminal", KindValue: string(chat.TranscriptBlockKindBackgroundTerminal)},
			},
		},
		reflect.TypeFor[chat.RunItemDetails](): {
			Discriminator: "kind",
			Branches: []taggedUnionBranch{
				{Field: "commandExecution", KindValue: string(chat.RunItemDetailsKindCommandExecution)},
				{Field: "mcpToolCall", KindValue: string(chat.RunItemDetailsKindMCPToolCall)},
				{Field: "dynamicToolCall", KindValue: string(chat.RunItemDetailsKindDynamicToolCall)},
				{Field: "fileChange", KindValue: string(chat.RunItemDetailsKindFileChange)},
				{Field: "diff", KindValue: string(chat.RunItemDetailsKindDiff)},
				{Field: "approval", KindValue: string(chat.RunItemDetailsKindApproval)},
				{Field: "providerStreamLifecycle", KindValue: string(chat.RunItemDetailsKindProviderStreamLifecycle)},
			},
		},
	}
}

func contractValueSets() []chat.ContractValueSet {
	sets := chat.ContractValueSets()
	for _, set := range appearance.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range codexaccount.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range orchestrator.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range semanticgraph.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range terminal.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range workspaceactivity.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range workspaceui.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	return sets
}

func valueSetSpecs(registry []chat.ContractValueSet) (map[string]valueSetSpec, error) {
	specs := map[string]valueSetSpec{}
	for _, valueSet := range registry {
		if !isTypeScriptIdentifier(valueSet.Name) || !isUpperASCII(valueSet.Name[0]) {
			return nil, fmt.Errorf("unsupported value set name %s", valueSet.Name)
		}
		if _, exists := specs[valueSet.Name]; exists {
			return nil, fmt.Errorf("duplicate value set %s", valueSet.Name)
		}
		values, err := valueSetValues(valueSet)
		if err != nil {
			return nil, err
		}
		specs[valueSet.Name] = valueSetSpec{Name: valueSet.Name, Values: values}
	}
	return specs, nil
}

func valueSetValues(valueSet chat.ContractValueSet) ([]string, error) {
	if len(valueSet.Values) == 0 {
		return nil, fmt.Errorf("%s value set is empty", valueSet.Name)
	}
	seenValues := map[string]bool{}
	values := make([]string, 0, len(valueSet.Values))
	for _, value := range valueSet.Values {
		if value == "" {
			return nil, fmt.Errorf("%s value set contains an empty value", valueSet.Name)
		}
		if seenValues[value] {
			return nil, fmt.Errorf("%s value set contains duplicate value %q", valueSet.Name, value)
		}
		seenValues[value] = true
		values = append(values, value)
	}
	return values, nil
}
