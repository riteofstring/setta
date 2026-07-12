package main

import (
	"encoding/json"
	"fmt"
	"reflect"

	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/conversation"
	"setta/internal/master"
	"setta/internal/orchestrator"
	"setta/internal/runtimeauth"
	"setta/internal/semanticgraph"
	"setta/internal/speech"
	"setta/internal/terminal"
	"setta/internal/workspaceactivity"
	"setta/internal/workspaceui"
	"setta/internal/workspaceui/conversationpalette"
)

func contractUnions() map[reflect.Type]unionSpec {
	specs := map[reflect.Type]unionSpec{}
	for _, union := range chat.ContractUnions() {
		variants := make([]unionVariantSpec, 0, len(union.Variants))
		for _, variant := range union.Variants {
			variants = append(variants, unionVariantSpec{
				KindValue: variant.KindValue,
				Name:      variant.Name,
				Type:      variant.Type,
			})
		}
		specs[union.Type] = unionSpec{
			Discriminator: union.Discriminator,
			Name:          union.Name,
			Type:          union.Type,
			Variants:      variants,
		}
	}
	for _, union := range conversation.ContractUnions() {
		variants := make([]unionVariantSpec, 0, len(union.Variants))
		for _, variant := range union.Variants {
			variants = append(variants, unionVariantSpec{
				KindValue: variant.KindValue,
				Name:      variant.Name,
				Type:      variant.Type,
			})
		}
		specs[union.Type] = unionSpec{
			Discriminator: union.Discriminator,
			Name:          union.Name,
			Type:          union.Type,
			Variants:      variants,
		}
	}
	return specs
}

// contractTaggedUnions registers struct contracts whose `kind` discriminator
// selects exactly one nullable branch payload. The generated decoder validates
// that invariant (exactly one branch populated, matching kind) so a malformed
// block fails loudly at the decode boundary instead of null-dereferencing later.
func contractTaggedUnions() map[reflect.Type]taggedUnionSpec {
	result := map[reflect.Type]taggedUnionSpec{
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
				{Field: "plan", KindValue: string(chat.RunItemDetailsKindPlan)},
				{Field: "commandExecution", KindValue: string(chat.RunItemDetailsKindCommandExecution)},
				{Field: "commandStartFailure", KindValue: string(chat.RunItemDetailsKindCommandStartFailure)},
				{Field: "mcpToolCall", KindValue: string(chat.RunItemDetailsKindMCPToolCall)},
				{Field: "dynamicToolCall", KindValue: string(chat.RunItemDetailsKindDynamicToolCall)},
				{Field: "fileChange", KindValue: string(chat.RunItemDetailsKindFileChange)},
				{Field: "diff", KindValue: string(chat.RunItemDetailsKindDiff)},
				{Field: "approval", KindValue: string(chat.RunItemDetailsKindApproval)},
				{Field: "providerStreamLifecycle", KindValue: string(chat.RunItemDetailsKindProviderStreamLifecycle)},
			},
		},
	}
	for _, union := range conversation.ContractTaggedUnions() {
		branches := make([]taggedUnionBranch, 0, len(union.Branches))
		for _, branch := range union.Branches {
			branches = append(branches, taggedUnionBranch{Field: branch.Field, KindValue: branch.KindValue})
		}
		result[union.Type] = taggedUnionSpec{Discriminator: union.Discriminator, Branches: branches}
	}
	return result
}

func contractValueSets() []chat.ContractValueSet {
	sets := chat.ContractValueSets()
	for _, set := range appearance.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range codexaccount.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range conversation.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range master.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range orchestrator.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	return appendAdditionalContractValueSets(sets)
}

func appendAdditionalContractValueSets(sets []chat.ContractValueSet) []chat.ContractValueSet {
	for _, set := range runtimeauth.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range semanticgraph.ContractValueSets() {
		sets = append(sets, chat.ContractValueSet{Name: set.Name, Values: set.Values})
	}
	for _, set := range speech.ContractValueSets() {
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

func conversationPaletteCatalogSpecs(enabled bool) ([]generatedValueSpec, error) {
	if !enabled {
		return nil, nil
	}
	catalog := conversationpalette.Catalog()
	if len(catalog) == 0 {
		return nil, fmt.Errorf("conversation palette catalog is empty")
	}
	specs := make([]generatedValueSpec, 0, len(catalog))
	seen := make(map[conversationpalette.ConversationPaletteID]bool, len(catalog))
	for _, palette := range catalog {
		if palette.ID == "" {
			return nil, fmt.Errorf("conversation palette catalog contains an empty id")
		}
		if seen[palette.ID] {
			return nil, fmt.Errorf("conversation palette catalog contains duplicate id %q", palette.ID)
		}
		seen[palette.ID] = true
		encoded, err := json.Marshal(palette)
		if err != nil {
			return nil, fmt.Errorf("encode conversation palette %q: %w", palette.ID, err)
		}
		specs = append(specs, generatedValueSpec{Key: string(palette.ID), JSON: string(encoded)})
	}
	return specs, nil
}
