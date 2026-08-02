package backendruntime

import "setta/internal/projectstate"

const (
	AppSubsystemBackendContractVersion        = 1
	ListenerEndpointGetAppDefinition          = "appsubsystem_get_app_definition"
	ListenerEndpointGetEffectiveAppDefinition = "appsubsystem_get_effective_app_definition"
	ListenerEndpointGetEffectiveAppSpecPath   = "appsubsystem_get_effective_app_spec_path"
	ListenerEndpointGetEffectiveAppThemeMode  = "appsubsystem_get_effective_app_theme_mode"
	ListenerEndpointValidateAppDefinition     = "appsubsystem_validate_app_definition"
	ListenerEndpointSetAppDefinition          = "appsubsystem_set_app_definition"
	ListenerEndpointStreamAppDefinition       = "appsubsystem_stream_app_definition"
	ListenerEndpointUpdateAppDefinition       = "appsubsystem_update_app_definition"
	ListenerEndpointCompareAndSetCatalogID    = "appsubsystem_compare_and_set_catalog_id"
	ListenerEndpointCompareAndSetSpecVersion  = "appsubsystem_compare_and_set_spec_version"
	ListenerEndpointCompareAndSetSpecPath     = "appsubsystem_compare_and_set_spec_path"
	ListenerEndpointCompareAndSetThemeMode    = "appsubsystem_compare_and_set_theme_mode"
	ErrorCodeInvalidRequest                   = "invalid_request"
	ErrorCodeRuntimeClosed                    = "runtime_closed"
	ErrorCodeAppSpecPathUnconfigured          = "app_spec_path_unconfigured"
	ErrorCodeAppSpecNotFound                  = "app_spec_not_found"
	ErrorCodeAppSpecPatchInvalid              = "app_spec_patch_invalid"
	ErrorCodeExpectedOldValueMismatch         = "expected_old_value_mismatch"
)

var requiredListenerEndpointNames = [...]string{
	ListenerEndpointGetAppDefinition,
	ListenerEndpointGetEffectiveAppDefinition,
	ListenerEndpointGetEffectiveAppSpecPath,
	ListenerEndpointGetEffectiveAppThemeMode,
	ListenerEndpointValidateAppDefinition,
	ListenerEndpointSetAppDefinition,
	ListenerEndpointStreamAppDefinition,
	ListenerEndpointUpdateAppDefinition,
	ListenerEndpointCompareAndSetCatalogID,
	ListenerEndpointCompareAndSetSpecVersion,
	ListenerEndpointCompareAndSetSpecPath,
	ListenerEndpointCompareAndSetThemeMode,
}

func RequiredListenerEndpointNames() []string {
	return append([]string(nil), requiredListenerEndpointNames[:]...)
}

type UpdateAppDefinitionRequest struct {
	Patch any `json:"patch"`
}

type CompareAndSetStringRequest struct {
	Value            string  `json:"value"`
	ExpectedOldValue *string `json:"expectedOldValue,omitempty"`
}

type ExpectedOldValueMismatchDetails struct {
	SettingID        string `json:"settingId"`
	ExpectedOldValue any    `json:"expectedOldValue,omitempty"`
	ObservedOldValue any    `json:"observedOldValue,omitempty"`
}

func DetailsFromExpectedOldValueMismatch(
	err *projectstate.ExpectedOldValueMismatchError,
) ExpectedOldValueMismatchDetails {
	if err == nil {
		return ExpectedOldValueMismatchDetails{}
	}
	return ExpectedOldValueMismatchDetails{
		SettingID:        err.SettingID,
		ExpectedOldValue: err.ExpectedOldValue,
		ObservedOldValue: err.ObservedOldValue,
	}
}
