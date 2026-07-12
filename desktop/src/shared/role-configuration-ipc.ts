import type {
  ReadConversationRoleConfigurationRequest,
  ReadWorkspaceRoleConfigurationRequest,
  RoleConfiguration,
  RoleModelCatalog,
  UpdateConversationRoleProfilesRequest,
  UpdateGlobalRoleProfilesRequest,
  UpdateWorkspaceRoleProfilesRequest,
} from "@generated/backend";

export const roleConfigurationIpcChannels = {
  roleConfigurationReadConversation: "role-configuration:read-conversation",
  roleConfigurationReadGlobal: "role-configuration:read-global",
  roleConfigurationReadModels: "role-configuration:read-models",
  roleConfigurationReadWorkspace: "role-configuration:read-workspace",
  roleConfigurationUpdateConversation: "role-configuration:update-conversation",
  roleConfigurationUpdateGlobal: "role-configuration:update-global",
  roleConfigurationUpdateWorkspace: "role-configuration:update-workspace",
} as const;

export interface RoleConfigurationIpcContract {
  roleConfigurationReadConversation: {
    args: [request: ReadConversationRoleConfigurationRequest];
    result: RoleConfiguration;
  };
  roleConfigurationReadGlobal: {
    args: [];
    result: RoleConfiguration;
  };
  roleConfigurationReadModels: {
    args: [];
    result: RoleModelCatalog;
  };
  roleConfigurationReadWorkspace: {
    args: [request: ReadWorkspaceRoleConfigurationRequest];
    result: RoleConfiguration;
  };
  roleConfigurationUpdateConversation: {
    args: [request: UpdateConversationRoleProfilesRequest];
    result: RoleConfiguration;
  };
  roleConfigurationUpdateGlobal: {
    args: [request: UpdateGlobalRoleProfilesRequest];
    result: RoleConfiguration;
  };
  roleConfigurationUpdateWorkspace: {
    args: [request: UpdateWorkspaceRoleProfilesRequest];
    result: RoleConfiguration;
  };
}
