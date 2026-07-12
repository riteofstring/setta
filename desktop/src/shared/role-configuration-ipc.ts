import type {
  ReadConversationRoleConfigurationRequest,
  RoleConfiguration,
  RoleModelCatalog,
  UpdateConversationRoleProfilesRequest,
  UpdateGlobalRoleProfilesRequest,
} from "@generated/backend";

export const roleConfigurationIpcChannels = {
  roleConfigurationReadConversation: "role-configuration:read-conversation",
  roleConfigurationReadGlobal: "role-configuration:read-global",
  roleConfigurationReadModels: "role-configuration:read-models",
  roleConfigurationUpdateConversation: "role-configuration:update-conversation",
  roleConfigurationUpdateGlobal: "role-configuration:update-global",
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
  roleConfigurationUpdateConversation: {
    args: [request: UpdateConversationRoleProfilesRequest];
    result: RoleConfiguration;
  };
  roleConfigurationUpdateGlobal: {
    args: [request: UpdateGlobalRoleProfilesRequest];
    result: RoleConfiguration;
  };
}
