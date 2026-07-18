package conversation

import (
	"errors"
	"fmt"
)

func validateConfigurableRoleProfile(profile RoleProfile) error {
	if err := profile.Validate(); err != nil {
		return err
	}
	switch profile.Role {
	case RoleAgent:
		return validateAgentRoleProfile(profile)
	case RoleNarrator:
		return validateNarratorRoleProfile(profile)
	case RoleMaster:
		return validateMasterRoleProfile(profile)
	case RoleSideAgent:
		return validateSideAgentRoleProfile(profile)
	default:
		return fmt.Errorf("unsupported configurable role %q", profile.Role)
	}
}

func validateAgentRoleProfile(profile RoleProfile) error {
	if profile.Role != RoleAgent {
		return fmt.Errorf("agent configuration requires agent role profile, got %s", profile.Role)
	}
	permission := profile.PermissionProfile
	if permission.ToolAccess.Mode != ToolAccessAll {
		return errors.New("agent role profile requires normal provider tool access")
	}
	return validateWorkspaceMutationPermission(profile.Role, permission)
}

func validateNarratorRoleProfile(profile RoleProfile) error {
	if profile.Role != RoleNarrator {
		return fmt.Errorf("narrator configuration requires narrator role profile, got %s", profile.Role)
	}
	permission := profile.PermissionProfile
	if permission.ProviderPermissionProfile != ":read-only" || permission.WorkspaceMutation {
		return errors.New("narrator role profile must use read-only permission without workspace mutation")
	}
	if permission.ApprovalPolicy != ApprovalPolicyNever || permission.Approvals {
		return errors.New("narrator role profile must disable approvals")
	}
	if permission.ToolAccess.Mode != ToolAccessNone {
		return errors.New("narrator role profile must disable all tools")
	}
	return nil
}

func validateSideAgentRoleProfile(profile RoleProfile) error {
	if profile.Role != RoleSideAgent {
		return fmt.Errorf("side-agent configuration requires side_agent role profile, got %s", profile.Role)
	}
	permission := profile.PermissionProfile
	if permission.ProviderPermissionProfile != ":read-only" || permission.WorkspaceMutation {
		return errors.New("side-agent role profile must use read-only permission without workspace mutation")
	}
	if permission.ToolAccess.Mode != ToolAccessAll {
		return errors.New("side-agent role profile requires provider tools constrained by the read-only sandbox")
	}
	return nil
}

func validateWorkspaceMutationPermission(role Role, permission PermissionProfile) error {
	switch permission.ProviderPermissionProfile {
	case ":read-only":
		if permission.WorkspaceMutation {
			return fmt.Errorf("%s read-only role profile cannot declare workspace mutation", role)
		}
	case ":workspace", ":full-access":
		if !permission.WorkspaceMutation {
			return fmt.Errorf(
				"%s role profile permission %s must declare workspace mutation",
				role,
				permission.ProviderPermissionProfile,
			)
		}
	default:
		return fmt.Errorf(
			"%s role profile has unsupported provider permission %q",
			role,
			permission.ProviderPermissionProfile,
		)
	}
	return nil
}
