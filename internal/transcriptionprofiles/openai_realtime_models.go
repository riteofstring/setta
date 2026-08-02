package transcriptionprofiles

import (
	"strings"

	openairealtime "github.com/openai/openai-go/v3/realtime"
)

type OpenAIRealtimeTranscriptionStreamMode int

const (
	OpenAIRealtimeTranscriptionStreamModeUnsupported OpenAIRealtimeTranscriptionStreamMode = iota
	OpenAIRealtimeTranscriptionStreamModeSnapshot
	OpenAIRealtimeTranscriptionStreamModeIncremental
)

const openAIRealtimeTranscribeLatestModel = "gpt-4o-transcribe-latest"

func ResolveOpenAIRealtimeTranscriptionStreamMode(model string) OpenAIRealtimeTranscriptionStreamMode {
	// Keep runtime admission aligned with the docs-backed current model matrix.
	// Do not widen this to SDK-only aliases unless a caller-backed/product
	// decision explicitly moves that boundary.
	switch strings.ToLower(strings.TrimSpace(model)) {
	case string(openairealtime.AudioTranscriptionModelWhisper1):
		return OpenAIRealtimeTranscriptionStreamModeSnapshot
	case string(openairealtime.AudioTranscriptionModelGPT4oTranscribe),
		string(openairealtime.AudioTranscriptionModelGPT4oMiniTranscribe),
		openAIRealtimeTranscribeLatestModel:
		return OpenAIRealtimeTranscriptionStreamModeIncremental
	default:
		return OpenAIRealtimeTranscriptionStreamModeUnsupported
	}
}
