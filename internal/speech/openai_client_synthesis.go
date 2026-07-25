package speech

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
)

const (
	openAIPCMSampleRate      = 24_000
	openAIPCMChannels        = 1
	openAIPCMBitsPerSample   = 16
	canonicalWAVHeaderLength = 44
)

type speechSynthesisRequest struct {
	Model          string        `json:"model"`
	Input          string        `json:"input"`
	Voice          SpeechVoiceID `json:"voice"`
	ResponseFormat string        `json:"response_format"`
	Speed          float64       `json:"speed"`
}

func (client *OpenAIClient) SynthesizeSpeech(
	ctx context.Context,
	input ProviderSynthesisInput,
) (SynthesizedAudio, error) {
	if err := input.Validate(); err != nil {
		return SynthesizedAudio{}, err
	}
	payload := speechSynthesisRequest{
		Model:          SynthesisModel,
		Input:          input.Text,
		Voice:          input.VoiceID,
		ResponseFormat: OpenAISynthesisResponseFormat,
		Speed:          input.Rate,
	}
	response, err := client.postJSON(
		ctx,
		openAICreateSpeechPath,
		payload,
		openAICreateSpeechResponseMediaType,
		"",
	)
	if err != nil {
		return SynthesizedAudio{}, err
	}
	defer response.Body.Close()
	if err := requireContentType(response, openAICreateSpeechWireResponseMediaTypes[:]...); err != nil {
		return SynthesizedAudio{}, err
	}
	pcm, err := readBoundedResponse(response, MaximumSynthesisAudioBytes-canonicalWAVHeaderLength)
	if err != nil {
		return SynthesizedAudio{}, err
	}
	audio, err := canonicalWAVFromOpenAIPCM(pcm)
	if err != nil {
		return SynthesizedAudio{}, classifiedError(ErrorProviderResponseMalformed, fmt.Sprintf("OpenAI speech returned malformed PCM audio: %s.", err), err)
	}
	if err := validateWAV(audio); err != nil {
		return SynthesizedAudio{}, fmt.Errorf("validate canonical speech WAV: %w", err)
	}
	return SynthesizedAudio{Bytes: audio, MediaType: SynthesisMediaType, Format: SynthesisFormat}, nil
}

func canonicalWAVFromOpenAIPCM(pcm []byte) ([]byte, error) {
	const bytesPerSample = openAIPCMBitsPerSample / 8
	const blockAlign = openAIPCMChannels * bytesPerSample
	if len(pcm) == 0 {
		return nil, errors.New("PCM audio is empty")
	}
	if len(pcm)%blockAlign != 0 {
		return nil, fmt.Errorf("PCM byte length %d is not aligned to %d bytes", len(pcm), blockAlign)
	}
	audio := make([]byte, canonicalWAVHeaderLength+len(pcm))
	copy(audio[0:4], "RIFF")
	binary.LittleEndian.PutUint32(audio[4:8], uint32(len(audio)-8))
	copy(audio[8:12], "WAVE")
	copy(audio[12:16], "fmt ")
	binary.LittleEndian.PutUint32(audio[16:20], 16)
	binary.LittleEndian.PutUint16(audio[20:22], 1)
	binary.LittleEndian.PutUint16(audio[22:24], openAIPCMChannels)
	binary.LittleEndian.PutUint32(audio[24:28], openAIPCMSampleRate)
	binary.LittleEndian.PutUint32(audio[28:32], openAIPCMSampleRate*blockAlign)
	binary.LittleEndian.PutUint16(audio[32:34], blockAlign)
	binary.LittleEndian.PutUint16(audio[34:36], openAIPCMBitsPerSample)
	copy(audio[36:40], "data")
	binary.LittleEndian.PutUint32(audio[40:44], uint32(len(pcm)))
	copy(audio[canonicalWAVHeaderLength:], pcm)
	return audio, nil
}
