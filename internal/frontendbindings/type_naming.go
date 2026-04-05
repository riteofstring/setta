package frontendbindings

import (
	"reflect"
	"strings"

	"setta/internal/deployments"
	"setta/internal/projectstate"
)

var frontendBindingTypeNameOverrides = map[reflect.Type]string{
	reflect.TypeOf(deployments.Type("")):                 "DeploymentType",
	reflect.TypeOf(deployments.ListenerConfig{}):         "DeploymentListenerConfig",
	reflect.TypeOf(deployments.Manifest{}):               "DeploymentManifest",
	reflect.TypeOf(deployments.Policy{}):                 "SharePolicy",
	reflect.TypeOf(projectstate.ProjectConfigMetadata{}): "ProjectMetadataEntry",
}

func normalizedFrontendBindingTypeName(name string) string {
	name = strings.TrimSpace(name)
	if strings.HasPrefix(name, "Frontend") && len(name) > len("Frontend") {
		return strings.TrimPrefix(name, "Frontend")
	}
	return name
}

func prefixedFrontendBindingTypeName(baseName string, prefix string) string {
	baseName = strings.TrimSpace(baseName)
	prefix = strings.TrimSpace(prefix)
	if baseName == "" || prefix == "" || strings.HasPrefix(baseName, prefix) {
		return baseName
	}
	return prefix + baseName
}

func ownerFrontendBindingTypeName(t reflect.Type) (string, bool) {
	baseName := normalizedFrontendBindingTypeName(t.Name())
	switch t.PkgPath() {
	case "setta/internal/agentprofiles":
		return prefixedFrontendBindingTypeName(baseName, "Agent"), true
	case "setta/internal/agentruns":
		switch baseName {
		case "Run", "RunStatus":
			return "Agent" + baseName, true
		default:
			return baseName, true
		}
	case "setta/internal/detachedruns":
		switch baseName {
		case "Run":
			return "DetachedRun", true
		case "Status":
			return "DetachedRunStatus", true
		default:
			return prefixedFrontendBindingTypeName(baseName, "Detached"), true
		}
	case "setta/internal/externalagentconfigs":
		return prefixedFrontendBindingTypeName(baseName, "ExternalAgent"), true
	case "setta/internal/gitread":
		return prefixedFrontendBindingTypeName(baseName, "Git"), true
	case "setta/internal/llmconfig":
		switch baseName {
		case "Transport":
			return "MCPServerTransport", true
		case "ServerConfig":
			return "MCPServerConfig", true
		case "Config":
			return "LLMConfig", true
		case "AllConfigs":
			return "AllLLMConfigs", true
		default:
			return baseName, true
		}
	case "setta/internal/prompttemplates":
		return prefixedFrontendBindingTypeName(baseName, "Prompt"), true
	case "setta/internal/transcriptionprofiles":
		return prefixedFrontendBindingTypeName(baseName, "Transcription"), true
	default:
		return "", false
	}
}

func BindingTypeName(t reflect.Type) string {
	return frontendBindingTypeName(t)
}
