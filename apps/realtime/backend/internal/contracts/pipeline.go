package contracts

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

type PipelineEvent struct {
	SectionID string
	Event     string
}

type CompiledPipeline struct {
	Bindings                map[string]Binding
	HandlerSectionByBinding map[string]string
	EventBindings           map[PipelineEvent][]string
	InputsByBinding         map[string]map[string]BindingInput
	ChildrenByBinding       map[string][]string
	DescendantsByBinding    map[string][]string
	TopologicalOrder        []string
	RootEventByBinding      map[string]PipelineEvent
	ReachableByEvent        map[PipelineEvent][]string
}

type eventBindingTrigger struct {
	Kind      string `json:"kind"`
	SectionID string `json:"sectionId"`
	Event     string `json:"event"`
}

type joinBindingTrigger struct {
	Kind   string                  `json:"kind"`
	Mode   string                  `json:"mode"`
	Inputs map[string]BindingInput `json:"inputs"`
}

type disconnectedBindingTrigger struct {
	Kind string `json:"kind"`
}

func (trigger BindingTrigger) MarshalJSON() ([]byte, error) {
	switch trigger.Kind {
	case "event":
		if trigger.Mode != "" || trigger.Inputs != nil {
			return nil, errors.New("contracts: event binding trigger has join fields")
		}
		return json.Marshal(eventBindingTrigger{Kind: trigger.Kind, SectionID: trigger.SectionID, Event: trigger.Event})
	case "join":
		if trigger.SectionID != "" || trigger.Event != "" {
			return nil, errors.New("contracts: join binding trigger has event fields")
		}
		return json.Marshal(joinBindingTrigger{Kind: trigger.Kind, Mode: trigger.Mode, Inputs: trigger.Inputs})
	case "disconnected":
		if trigger.SectionID != "" || trigger.Event != "" || trigger.Mode != "" || trigger.Inputs != nil {
			return nil, errors.New("contracts: disconnected binding trigger has connected fields")
		}
		return json.Marshal(disconnectedBindingTrigger{Kind: trigger.Kind})
	default:
		return nil, fmt.Errorf("contracts: unsupported binding trigger kind %q", trigger.Kind)
	}
}

func (trigger *BindingTrigger) UnmarshalJSON(data []byte) error {
	var discriminator struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(data, &discriminator); err != nil {
		return err
	}
	switch discriminator.Kind {
	case "event":
		var value eventBindingTrigger
		if err := DecodeStrict(data, &value); err != nil {
			return err
		}
		*trigger = BindingTrigger{Kind: value.Kind, SectionID: value.SectionID, Event: value.Event}
	case "join":
		var value joinBindingTrigger
		if err := DecodeStrict(data, &value); err != nil {
			return err
		}
		*trigger = BindingTrigger{Kind: value.Kind, Mode: value.Mode, Inputs: value.Inputs}
	case "disconnected":
		var value disconnectedBindingTrigger
		if err := DecodeStrict(data, &value); err != nil {
			return err
		}
		*trigger = BindingTrigger{Kind: value.Kind}
	default:
		return fmt.Errorf("contracts: unsupported binding trigger kind %q", discriminator.Kind)
	}
	return nil
}

func CompilePipeline(project Project) (CompiledPipeline, error) {
	compiled := CompiledPipeline{
		Bindings:                make(map[string]Binding, len(project.Bindings)),
		HandlerSectionByBinding: make(map[string]string, len(project.Bindings)),
		EventBindings:           make(map[PipelineEvent][]string),
		InputsByBinding:         make(map[string]map[string]BindingInput, len(project.Bindings)),
		ChildrenByBinding:       make(map[string][]string, len(project.Bindings)),
		DescendantsByBinding:    make(map[string][]string, len(project.Bindings)),
		RootEventByBinding:      make(map[string]PipelineEvent, len(project.Bindings)),
		ReachableByEvent:        make(map[PipelineEvent][]string),
	}
	for index, binding := range project.Bindings {
		if _, exists := compiled.Bindings[binding.ID]; exists {
			return CompiledPipeline{}, fmt.Errorf("contracts: duplicate binding id %q", binding.ID)
		}
		if err := binding.Validate(project.Sections); err != nil {
			return CompiledPipeline{}, fmt.Errorf("contracts: binding %d: %w", index, err)
		}
		compiled.Bindings[binding.ID] = binding
		compiled.InputsByBinding[binding.ID] = map[string]BindingInput{}
		compiled.ChildrenByBinding[binding.ID] = []string{}
	}
	if err := compileHandlerSections(project.Sections, &compiled); err != nil {
		return CompiledPipeline{}, err
	}
	if err := compileBindingEdges(&compiled); err != nil {
		return CompiledPipeline{}, err
	}
	order, err := pipelineTopologicalOrder(compiled.Bindings, compiled.ChildrenByBinding, compiled.InputsByBinding)
	if err != nil {
		return CompiledPipeline{}, err
	}
	compiled.TopologicalOrder = order
	if err := compileRootEvents(&compiled); err != nil {
		return CompiledPipeline{}, err
	}
	if err := validatePipelineMaterializations(&compiled); err != nil {
		return CompiledPipeline{}, err
	}
	compileReachability(&compiled)
	return compiled, nil
}

func compileHandlerSections(sections map[string]Section, compiled *CompiledPipeline) error {
	sectionIDs := make([]string, 0, len(sections))
	for sectionID := range sections {
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	for _, sectionID := range sectionIDs {
		section := sections[sectionID]
		if section.Kind != "handler" {
			continue
		}
		var data HandlerSectionData
		if err := DecodeStrict(section.Data, &data); err != nil {
			return fmt.Errorf("contracts: handler section %q: %w", sectionID, err)
		}
		if _, exists := compiled.Bindings[data.BindingID]; !exists {
			return fmt.Errorf("contracts: handler section %q references missing binding %q", sectionID, data.BindingID)
		}
		if previous, exists := compiled.HandlerSectionByBinding[data.BindingID]; exists {
			return fmt.Errorf("contracts: binding %q has multiple handler sections %q and %q", data.BindingID, previous, sectionID)
		}
		compiled.HandlerSectionByBinding[data.BindingID] = sectionID
	}
	bindingIDs := sortedBindingIDs(compiled.Bindings)
	for _, bindingID := range bindingIDs {
		if _, exists := compiled.HandlerSectionByBinding[bindingID]; !exists {
			return fmt.Errorf("contracts: binding %q has no handler section", bindingID)
		}
	}
	return nil
}

func compileBindingEdges(compiled *CompiledPipeline) error {
	for _, bindingID := range sortedBindingIDs(compiled.Bindings) {
		binding := compiled.Bindings[bindingID]
		switch binding.Trigger.Kind {
		case "event":
			root := PipelineEvent{SectionID: binding.Trigger.SectionID, Event: binding.Trigger.Event}
			compiled.EventBindings[root] = append(compiled.EventBindings[root], bindingID)
		case "join":
			inputs := make(map[string]BindingInput, len(binding.Trigger.Inputs))
			parentIDs := make(map[string]struct{})
			for _, inputName := range sortedInputNames(binding.Trigger.Inputs) {
				input := binding.Trigger.Inputs[inputName]
				producer, exists := compiled.Bindings[input.BindingID]
				if !exists {
					return fmt.Errorf("contracts: binding %q input %q references missing binding %q", bindingID, inputName, input.BindingID)
				}
				if input.BindingID == bindingID {
					return fmt.Errorf("contracts: binding %q references itself", bindingID)
				}
				if _, exists := producer.Outputs[input.Output]; !exists {
					return fmt.Errorf("contracts: binding %q input %q references missing output %q on binding %q", bindingID, inputName, input.Output, input.BindingID)
				}
				inputs[inputName] = input
				parentIDs[input.BindingID] = struct{}{}
			}
			compiled.InputsByBinding[bindingID] = inputs
			for parentID := range parentIDs {
				compiled.ChildrenByBinding[parentID] = append(compiled.ChildrenByBinding[parentID], bindingID)
			}
		case "disconnected":
		default:
			return fmt.Errorf("contracts: binding %q trigger kind is unsupported", bindingID)
		}
	}
	for event := range compiled.EventBindings {
		sort.Strings(compiled.EventBindings[event])
	}
	for bindingID := range compiled.ChildrenByBinding {
		sort.Strings(compiled.ChildrenByBinding[bindingID])
	}
	return nil
}

func pipelineTopologicalOrder(bindings map[string]Binding, children map[string][]string, inputs map[string]map[string]BindingInput) ([]string, error) {
	indegree := make(map[string]int, len(bindings))
	for bindingID := range bindings {
		indegree[bindingID] = 0
	}
	for bindingID, bindingInputs := range inputs {
		parents := make(map[string]struct{}, len(bindingInputs))
		for _, input := range bindingInputs {
			parents[input.BindingID] = struct{}{}
		}
		indegree[bindingID] = len(parents)
	}
	ready := make([]string, 0, len(bindings))
	for bindingID, count := range indegree {
		if count == 0 {
			ready = append(ready, bindingID)
		}
	}
	sort.Strings(ready)
	order := make([]string, 0, len(bindings))
	for len(ready) > 0 {
		bindingID := ready[0]
		ready = ready[1:]
		order = append(order, bindingID)
		for _, childID := range children[bindingID] {
			indegree[childID]--
			if indegree[childID] == 0 {
				ready = append(ready, childID)
				sort.Strings(ready)
			}
		}
	}
	if len(order) != len(bindings) {
		return nil, errors.New("contracts: binding graph contains a cycle")
	}
	return order, nil
}

func compileRootEvents(compiled *CompiledPipeline) error {
	for _, bindingID := range compiled.TopologicalOrder {
		binding := compiled.Bindings[bindingID]
		switch binding.Trigger.Kind {
		case "event":
			compiled.RootEventByBinding[bindingID] = PipelineEvent{SectionID: binding.Trigger.SectionID, Event: binding.Trigger.Event}
		case "join":
			var root PipelineEvent
			set := false
			for _, inputName := range sortedInputNames(binding.Trigger.Inputs) {
				parentID := binding.Trigger.Inputs[inputName].BindingID
				candidate, exists := compiled.RootEventByBinding[parentID]
				if !exists {
					return fmt.Errorf("contracts: binding %q is an orphan join", bindingID)
				}
				if set && candidate != root {
					return fmt.Errorf("contracts: binding %q has ambiguous root event ancestry", bindingID)
				}
				root = candidate
				set = true
			}
			if !set {
				return fmt.Errorf("contracts: binding %q is an orphan join", bindingID)
			}
			compiled.RootEventByBinding[bindingID] = root
		case "disconnected":
		}
	}
	return nil
}

func validatePipelineMaterializations(compiled *CompiledPipeline) error {
	for _, bindingID := range compiled.TopologicalOrder {
		binding := compiled.Bindings[bindingID]
		if binding.Materialization == nil || binding.Materialization.Startup == "manual" {
			continue
		}
		root, exists := compiled.RootEventByBinding[bindingID]
		if !exists || root.Event != "change" && root.Event != "snapshot" {
			return fmt.Errorf("contracts: binding %q materialization startup requires change or snapshot root ancestry", bindingID)
		}
	}
	return nil
}

func compileReachability(compiled *CompiledPipeline) {
	for _, bindingID := range compiled.TopologicalOrder {
		if root, exists := compiled.RootEventByBinding[bindingID]; exists {
			compiled.ReachableByEvent[root] = append(compiled.ReachableByEvent[root], bindingID)
		}
		reachable := make(map[string]struct{})
		frontier := append([]string(nil), compiled.ChildrenByBinding[bindingID]...)
		for len(frontier) > 0 {
			candidate := frontier[0]
			frontier = frontier[1:]
			if _, exists := reachable[candidate]; exists {
				continue
			}
			reachable[candidate] = struct{}{}
			frontier = append(frontier, compiled.ChildrenByBinding[candidate]...)
		}
		for _, candidate := range compiled.TopologicalOrder {
			if _, exists := reachable[candidate]; exists {
				compiled.DescendantsByBinding[bindingID] = append(compiled.DescendantsByBinding[bindingID], candidate)
			}
		}
		if compiled.DescendantsByBinding[bindingID] == nil {
			compiled.DescendantsByBinding[bindingID] = []string{}
		}
	}
}

func sortedBindingIDs(bindings map[string]Binding) []string {
	result := make([]string, 0, len(bindings))
	for bindingID := range bindings {
		result = append(result, bindingID)
	}
	sort.Strings(result)
	return result
}

func sortedInputNames(inputs map[string]BindingInput) []string {
	result := make([]string, 0, len(inputs))
	for inputName := range inputs {
		result = append(result, inputName)
	}
	sort.Strings(result)
	return result
}

func bindingReferencesSection(argument json.RawMessage, sectionID string) bool {
	var reference string
	if json.Unmarshal(argument, &reference) != nil {
		return false
	}
	prefix := "$sections." + sectionID + "."
	return len(reference) > len(prefix) && strings.HasPrefix(reference, prefix)
}
