package chat

import "fmt"

type agentToolRegistrySetter interface {
	SetAgentToolRegistry(*AgentToolRegistry) error
}

func (service *Service) SetAgentToolRegistry(registry *AgentToolRegistry) error {
	if registry == nil {
		return fmt.Errorf("agent tool registry is required")
	}
	setter, ok := service.harness.(agentToolRegistrySetter)
	if !ok {
		return fmt.Errorf("chat harness %T does not support agent tool registry updates", service.harness)
	}
	return setter.SetAgentToolRegistry(registry)
}
