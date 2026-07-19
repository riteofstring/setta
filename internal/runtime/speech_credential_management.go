package runtime

import (
	"context"

	"setta/internal/httpapi"
	"setta/internal/speech"
)

type speechCredentialPolicyService struct {
	owner   SpeechCredentialOwner
	service *speech.Service
}

func speechServiceWithCredentialPolicy(
	owner SpeechCredentialOwner,
	service *speech.Service,
) httpapi.SpeechService {
	if service == nil {
		return nil
	}
	return speechCredentialPolicyService{
		owner:   owner,
		service: service,
	}
}

func (service speechCredentialPolicyService) ReadCapabilities(
	ctx context.Context,
) (speech.SpeechCapabilities, error) {
	return service.service.ReadCapabilities(ctx)
}

func (service speechCredentialPolicyService) ReadMasterVoiceSelection(
	ctx context.Context,
) (speech.MasterVoiceSelection, error) {
	return service.service.ReadMasterVoiceSelection(ctx)
}

func (service speechCredentialPolicyService) ReadNarratorVoiceDefault(
	ctx context.Context,
) (speech.NarratorVoiceDefault, error) {
	return service.service.ReadNarratorVoiceDefault(ctx)
}

func (service speechCredentialPolicyService) UpdateMasterVoiceSelection(
	ctx context.Context,
	request speech.VoiceSelectionRequest,
) (speech.MasterVoiceSelection, error) {
	return service.service.UpdateMasterVoiceSelection(ctx, request)
}

func (service speechCredentialPolicyService) UpdateNarratorVoiceDefault(
	ctx context.Context,
	request speech.VoiceSelectionRequest,
) (speech.NarratorVoiceDefault, error) {
	return service.service.UpdateNarratorVoiceDefault(ctx, request)
}

func (service speechCredentialPolicyService) ValidateCredential(
	ctx context.Context,
	apiKey string,
	deviceID string,
) (speech.SpeechCredentialValidationResult, error) {
	if err := service.validateDesktopCredentialManagement(); err != nil {
		return speech.SpeechCredentialValidationResult{}, err
	}
	return service.service.ValidateCredential(ctx, apiKey, deviceID)
}

func (service speechCredentialPolicyService) LoadCredential(
	ctx context.Context,
	apiKey string,
) (speech.SpeechCredentialStatus, error) {
	if err := service.validateDesktopCredentialManagement(); err != nil {
		return speech.SpeechCredentialStatus{}, err
	}
	return service.service.LoadCredential(ctx, apiKey)
}

func (service speechCredentialPolicyService) ClearCredential(
	ctx context.Context,
) (speech.SpeechCredentialStatus, error) {
	if err := service.validateDesktopCredentialManagement(); err != nil {
		return speech.SpeechCredentialStatus{}, err
	}
	return service.service.ClearCredential(ctx)
}

func (service speechCredentialPolicyService) CreateTranscriptionSession(
	ctx context.Context,
	deviceID string,
) (speech.SpeechTranscriptionSession, error) {
	return service.service.CreateTranscriptionSession(ctx, deviceID)
}

func (service speechCredentialPolicyService) SynthesizeSpeech(
	ctx context.Context,
	request speech.SpeechSynthesisRequest,
) (speech.SpeechAudio, error) {
	return service.service.SynthesizeSpeech(ctx, request)
}

func (service speechCredentialPolicyService) validateDesktopCredentialManagement() error {
	if service.owner == SpeechCredentialOwnerElectronVault {
		return nil
	}
	return &speech.Error{
		Code:    speech.ErrorCredentialManagementUnavailable,
		Message: "Desktop speech credential management is unavailable for this runtime.",
	}
}
