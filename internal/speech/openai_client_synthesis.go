package speech

import (
	"context"
	"fmt"
)

type speechSynthesisRequest struct {
	Model          string `json:"model"`
	Input          string `json:"input"`
	Voice          string `json:"voice"`
	ResponseFormat string `json:"response_format"`
}

func (client *OpenAIClient) SynthesizeSpeech(ctx context.Context, text string) (SynthesizedAudio, error) {
	if err := validateSynthesisText(text); err != nil {
		return SynthesizedAudio{}, err
	}
	payload := speechSynthesisRequest{
		Model:          SynthesisModel,
		Input:          text,
		Voice:          SynthesisVoice,
		ResponseFormat: SynthesisFormat,
	}
	response, err := client.postJSON(ctx, "/audio/speech", payload, "application/octet-stream", "")
	if err != nil {
		return SynthesizedAudio{}, err
	}
	defer response.Body.Close()
	if err := requireContentType(response, "application/octet-stream", "audio/wav", "audio/x-wav"); err != nil {
		return SynthesizedAudio{}, err
	}
	audio, err := readBoundedResponse(response, MaximumSynthesisAudioBytes)
	if err != nil {
		return SynthesizedAudio{}, err
	}
	if err := validateWAV(audio); err != nil {
		return SynthesizedAudio{}, classifiedError(ErrorProviderResponseMalformed, fmt.Sprintf("OpenAI speech returned malformed WAV audio: %s.", err), err)
	}
	return SynthesizedAudio{Bytes: audio, MediaType: SynthesisMediaType, Format: SynthesisFormat}, nil
}
