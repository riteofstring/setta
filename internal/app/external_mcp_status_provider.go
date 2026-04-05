package app

import (
	"setta/internal/externalagents"
	"setta/internal/mcpx"
)

type externalMCPStatusProvider struct {
	runtime *externalagents.Runtime
	send    *externalagents.SendService
}

func (p externalMCPStatusProvider) Disabled() bool {
	return p.send == nil || p.send.Disabled()
}

func (p externalMCPStatusProvider) ExternalRuntimeStatuses(chatID *string, engineConfigID *string) ([]mcpx.ServerRuntimeStatus, error) {
	if p.runtime == nil {
		return []mcpx.ServerRuntimeStatus{}, nil
	}
	return p.runtime.ExternalRuntimeStatuses(chatID, engineConfigID)
}
