package frontendbindings

import (
	"reflect"
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/deployments"
	"setta/internal/detachedruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/filebrowser"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/transcriptionprofiles"
)

var frontendBindingTypeNameOverrides = map[reflect.Type]string{
	reflect.TypeOf(agentprofiles.Profile{}):                     "AgentProfile",
	reflect.TypeOf(agentruns.Run{}):                             "AgentRun",
	reflect.TypeOf(agentruns.RunStatus("")):                     "AgentRunStatus",
	reflect.TypeOf(deployments.Type("")):                        "DeploymentType",
	reflect.TypeOf(deployments.ListenerConfig{}):                "DeploymentListenerConfig",
	reflect.TypeOf(deployments.Manifest{}):                      "DeploymentManifest",
	reflect.TypeOf(deployments.Policy{}):                        "SharePolicy",
	reflect.TypeOf(detachedruns.Run{}):                          "DetachedRun",
	reflect.TypeOf(detachedruns.Status("")):                     "DetachedRunStatus",
	reflect.TypeOf(externalagentconfigs.ToolType("")):           "ExternalAgentToolType",
	reflect.TypeOf(externalagentconfigs.RunMode("")):            "ExternalAgentRunMode",
	reflect.TypeOf(externalagentconfigs.SettingsMode("")):       "ExternalAgentSettingsMode",
	reflect.TypeOf(externalagentconfigs.WorkingDirStrategy("")): "ExternalAgentWorkingDirStrategy",
	reflect.TypeOf(externalagentconfigs.SettingsManagedBlock{}): "ExternalAgentSettingsManagedBlock",
	reflect.TypeOf(externalagentconfigs.Config{}):               "ExternalAgentConfig",
	reflect.TypeOf(externalagentconfigs.EnvVarStatus{}):         "ExternalAgentEnvVarStatus",
	reflect.TypeOf(filebrowser.RootResponse{}):                  "FileBrowserRootResponse",
	reflect.TypeOf(filebrowser.ListFolderResponse{}):            "GetFolderContentsResponse",
	reflect.TypeOf(filebrowser.FileContentResponse{}):           "FileBrowserFileContentResponse",
	reflect.TypeOf(filebrowser.FileStatResponse{}):              "FileBrowserFileStatResponse",
	reflect.TypeOf(filebrowser.WriteFileContentResponse{}):      "WriteFileBrowserFileContentResponse",
	reflect.TypeOf(filebrowser.TransferResponse{}):              "TransferFileBrowserEntryResponse",
	reflect.TypeOf(httpapi.DeploymentMetadataResponse{}):        "DeploymentMetadata",
	reflect.TypeOf(llmconfig.Transport("")):                     "MCPServerTransport",
	reflect.TypeOf(llmconfig.ServerConfig{}):                    "MCPServerConfig",
	reflect.TypeOf(llmconfig.Config{}):                          "LLMConfig",
	reflect.TypeOf(llmconfig.AllConfigs{}):                      "AllLLMConfigs",
	reflect.TypeOf(projectstate.ProjectConfigMetadata{}):        "ProjectMetadataEntry",
	reflect.TypeOf(prompttemplates.Format("")):                  "PromptFormat",
	reflect.TypeOf(prompttemplates.Template{}):                  "PromptTemplate",
	reflect.TypeOf(transcriptionprofiles.TransportMode("")):     "TranscriptionTransportMode",
	reflect.TypeOf(transcriptionprofiles.Profile{}):             "TranscriptionProfile",
}

func normalizedFrontendBindingTypeName(name string) string {
	name = strings.TrimSpace(name)
	if strings.HasPrefix(name, "Frontend") && len(name) > len("Frontend") {
		return strings.TrimPrefix(name, "Frontend")
	}
	return name
}
