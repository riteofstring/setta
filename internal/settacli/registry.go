package settacli

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

const schemaVersion = 1

type CommandSpec struct {
	Path              []string `json:"path"`
	Summary           string   `json:"summary"`
	Usage             string   `json:"usage"`
	Stability         string   `json:"stability"`
	Mutates           bool     `json:"mutates"`
	Dangerous         bool     `json:"dangerous"`
	RequiresBackend   bool     `json:"requiresBackend"`
	SupportsJSON      bool     `json:"supportsJson"`
	SupportsNDJSON    bool     `json:"supportsNdjson"`
	SupportsDryRun    bool     `json:"supportsDryRun"`
	RequiredFlags     []string `json:"requiredFlags"`
	OptionalFlags     []string `json:"optionalFlags"`
	InputSchemaName   string   `json:"inputSchemaName"`
	OutputSchemaName  string   `json:"outputSchemaName"`
	RelatedOperations []string `json:"relatedOperations"`
	Examples          []string `json:"examples"`

	handler commandHandler
}

type Registry struct {
	commands []CommandSpec
	byPath   map[string]int
}

type commandHandler func(*Context, []string) error

func (command CommandSpec) MarshalJSON() ([]byte, error) {
	type commandAlias CommandSpec
	normalized := commandAlias(command)
	normalized.handler = nil
	if normalized.RequiredFlags == nil {
		normalized.RequiredFlags = []string{}
	}
	if normalized.OptionalFlags == nil {
		normalized.OptionalFlags = []string{}
	}
	if normalized.RelatedOperations == nil {
		normalized.RelatedOperations = []string{}
	}
	if normalized.Examples == nil {
		normalized.Examples = []string{}
	}
	return json.Marshal(normalized)
}

func NewRegistry() *Registry {
	registry := &Registry{byPath: map[string]int{}}
	for _, command := range commandSpecs() {
		registry.add(command)
	}
	return registry
}

func (registry *Registry) Commands() []CommandSpec {
	commands := make([]CommandSpec, 0, len(registry.commands))
	for _, command := range registry.commands {
		command.handler = nil
		commands = append(commands, command)
	}
	sort.Slice(commands, func(left int, right int) bool {
		return commandPath(commands[left].Path) < commandPath(commands[right].Path)
	})
	return commands
}

func (registry *Registry) Find(path []string) (*CommandSpec, bool) {
	index, ok := registry.byPath[commandPath(path)]
	if !ok {
		return nil, false
	}
	return &registry.commands[index], true
}

func (registry *Registry) Match(args []string) (*CommandSpec, []string, error) {
	for length := len(args); length > 0; length-- {
		if containsFlag(args[:length]) {
			continue
		}
		if command, ok := registry.Find(args[:length]); ok {
			return command, args[length:], nil
		}
	}
	return nil, nil, fmt.Errorf("unknown command: %s", strings.Join(args, " "))
}

func (registry *Registry) add(command CommandSpec) {
	path := commandPath(command.Path)
	if path == "" {
		panic("command path is required")
	}
	if _, exists := registry.byPath[path]; exists {
		panic("duplicate command path: " + path)
	}
	command.Stability = defaultString(command.Stability, "stable")
	command.SupportsJSON = true
	registry.commands = append(registry.commands, command)
	registry.byPath[path] = len(registry.commands) - 1
}

func commandPath(path []string) string {
	return strings.Join(path, " ")
}

func containsFlag(args []string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			return true
		}
	}
	return false
}

func defaultString(value string, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}
