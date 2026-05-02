package httpapi

import (
	"errors"
	"net/http"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/managedllm"
	"setta/internal/projectstate"
)

type llmResponseErrorDetails struct {
	Status  int
	Code    string
	Message string
}

type llmResponseErrorMatcher func(error) (llmResponseErrorDetails, bool)

var defaultGetLLMResponseError = llmResponseErrorDetails{
	Status:  http.StatusInternalServerError,
	Code:    "internal_error",
	Message: "Internal Server Error",
}

var getLLMResponseErrorMatchers = []llmResponseErrorMatcher{
	fixedLLMResponseError(
		http.StatusBadRequest,
		"message_required",
		"Message is required.",
		externalagents.ErrMessageRequired,
		managedchat.ErrMessageRequired,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"project_config_id_required",
		"Project config id is required.",
		externalagents.ErrProjectConfigIDRequired,
		managedchat.ErrProjectConfigIDRequired,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"permission_mode_invalid",
		"permissionMode is invalid.",
		externalagents.ErrPermissionModeRequired,
		externalagents.ErrPermissionModeInvalid,
		managedchat.ErrPermissionModeRequired,
		managedchat.ErrPermissionModeInvalid,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"section_id_required",
		externalagents.ErrSectionIDRequired,
		managedchat.ErrSectionIDRequired,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"allow_unscoped_conflict",
		externalagents.ErrAllowUnscopedRequiresSectionOmitted,
		managedchat.ErrAllowUnscopedRequiresSectionOmitted,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"branch_fields_required",
		externalagents.ErrBranchFieldsRequired,
		managedchat.ErrBranchFieldsRequired,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"continue_from_chat_with_branch_edits",
		externalagents.ErrContinueFromChatWithBranchEdits,
		managedchat.ErrContinueFromChatWithBranchEdits,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"continue_from_chat_conflict",
		externalagents.ErrContinueFromChatRequiresChatIDOmitted,
		managedchat.ErrContinueFromChatRequiresChatIDOmitted,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"frontend_affinity_token_invalid",
		"frontendAffinityToken must not be blank.",
		externalagents.ErrFrontendAffinityTokenInvalid,
		managedchat.ErrFrontendAffinityTokenInvalid,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"app_generation_mode_invalid",
		"appGenerationMode is invalid.",
		externalagents.ErrAppGenerationModeInvalid,
		managedchat.ErrAppGenerationModeInvalid,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"app_generation_reference_image_url_too_large",
		externalagents.ErrAppGenerationReferenceImageURLTooLarge,
		managedchat.ErrAppGenerationReferenceImageURLTooLarge,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"app_generation_reference_image_notes_too_large",
		externalagents.ErrAppGenerationReferenceImageNotesTooLarge,
		managedchat.ErrAppGenerationReferenceImageNotesTooLarge,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"app_generation_image_attachment_required",
		externalagents.ErrAppGenerationImageAttachmentRequired,
		managedchat.ErrAppGenerationImageAttachmentRequired,
	),
	typedLLMResponseError[*externalagents.ContinueFromChatSourceNotFoundError](
		http.StatusNotFound,
		"source_chat_not_found",
	),
	typedLLMResponseError[*managedchat.ContinueFromChatSourceNotFoundError](
		http.StatusNotFound,
		"source_chat_not_found",
	),
	typedLLMResponseError[*externalagents.BranchMessageNotFoundError](
		http.StatusNotFound,
		"branch_message_not_found",
	),
	typedLLMResponseError[*managedchat.BranchMessageNotFoundError](
		http.StatusNotFound,
		"branch_message_not_found",
	),
	fixedLLMResponseError(
		http.StatusNotFound,
		"agent_profile_not_found",
		"Agent profile not found.",
		agentprofiles.ErrProfileNotFound,
	),
	fixedLLMResponseError(
		http.StatusNotFound,
		"engine_config_not_found",
		"Engine config not found.",
		agentruns.ErrEngineConfigNotFound,
	),
	fixedLLMResponseError(
		http.StatusNotFound,
		"project_config_not_found",
		"Project config not found.",
		projectstate.ErrProjectNotFound,
	),
	fixedLLMResponseError(
		http.StatusNotFound,
		"section_not_found",
		"Section not found.",
		projectstate.ErrSectionNotFound,
	),
	dynamicLLMResponseError(
		http.StatusConflict,
		"chat_engine_mismatch",
		externalagents.ErrChatEngineMismatch,
		managedchat.ErrChatEngineMismatch,
	),
	dynamicLLMResponseError(
		http.StatusConflict,
		"chat_project_config_mismatch",
		externalagents.ErrChatProjectConfigMismatch,
		managedchat.ErrChatProjectConfigMismatch,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"provider_unsupported",
		managedllm.ErrProviderUnsupported,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"provider_config_invalid",
		managedllm.ErrProviderConfigInvalid,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"thinking_unsupported",
		managedllm.ErrReasoningUnsupported,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"unsupported_engine_config",
		"Unsupported engine config.",
		externalagents.ErrExternalAgentEngineRequired,
		agentruns.ErrManagedLLMEngineRequired,
	),
	fixedLLMResponseError(
		http.StatusServiceUnavailable,
		"agent_runner_unavailable",
		"Agent runner is not available",
		managedchat.ErrStarterRequired,
		agentruns.ErrManagedExecutorUnavailable,
	),
	fixedLLMResponseError(
		http.StatusServiceUnavailable,
		"external_agent_runtime_unavailable",
		"External agent runtime is not available.",
		externalagents.ErrExecutorUnavailable,
		externalagents.ErrSendPreflightCheckerRequired,
	),
	typedLLMResponseError[*externalagents.PreflightUnavailableError](
		http.StatusServiceUnavailable,
		"external_agent_preflight_failed",
	),
	fixedLLMResponseError(
		http.StatusInternalServerError,
		"external_agent_config_not_found",
		"External agent config not found.",
		externalagentconfigs.ErrConfigNotFound,
		externalagents.ErrExternalAgentConfigIDRequired,
	),
}

func writeGetLLMResponseError(w http.ResponseWriter, r *http.Request, err error) {
	response := resolveGetLLMResponseError(err)
	writeError(w, r, response.Status, response.Code, response.Message)
}

func resolveGetLLMResponseError(err error) llmResponseErrorDetails {
	for _, matcher := range getLLMResponseErrorMatchers {
		if response, ok := matcher(err); ok {
			return response
		}
	}
	return defaultGetLLMResponseError
}

func fixedLLMResponseError(status int, code string, message string, candidates ...error) llmResponseErrorMatcher {
	return matchLLMResponseErrors(status, code, func(error) string {
		return message
	}, candidates...)
}

func dynamicLLMResponseError(status int, code string, candidates ...error) llmResponseErrorMatcher {
	return matchLLMResponseErrors(status, code, func(err error) string {
		return err.Error()
	}, candidates...)
}

func matchLLMResponseErrors(
	status int,
	code string,
	message func(error) string,
	candidates ...error,
) llmResponseErrorMatcher {
	return func(err error) (llmResponseErrorDetails, bool) {
		for _, candidate := range candidates {
			if errors.Is(err, candidate) {
				return llmResponseErrorDetails{
					Status:  status,
					Code:    code,
					Message: message(err),
				}, true
			}
		}
		return llmResponseErrorDetails{}, false
	}
}

func typedLLMResponseError[T error](status int, code string) llmResponseErrorMatcher {
	return func(err error) (llmResponseErrorDetails, bool) {
		var target T
		if !errors.As(err, &target) {
			return llmResponseErrorDetails{}, false
		}
		return llmResponseErrorDetails{
			Status:  status,
			Code:    code,
			Message: target.Error(),
		}, true
	}
}

func writeGetLLMResponseDecodeError(w http.ResponseWriter, r *http.Request, err error) {
	writeValidationError(
		w,
		http.StatusUnprocessableEntity,
		formatGetLLMResponseValidationMessage(err),
	)
}
