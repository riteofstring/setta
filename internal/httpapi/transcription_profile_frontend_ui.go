package httpapi

import "setta/internal/transcriptionprofiles"

// Keep transcription profile draft defaults and transport metadata Go-owned so
// the frontend does not restate backend validation or default behavior.
var frontendTranscriptionProfileTransportModeOptions = []TranscriptionProfileTransportModeOption{
	{Value: transcriptionprofiles.TransportModeAuto, Label: string(transcriptionprofiles.TransportModeAuto)},
	{Value: transcriptionprofiles.TransportModeFile, Label: string(transcriptionprofiles.TransportModeFile)},
	{Value: transcriptionprofiles.TransportModeRealtime, Label: string(transcriptionprofiles.TransportModeRealtime)},
}

type TranscriptionProfileTransportModesValue struct {
	Auto     transcriptionprofiles.TransportMode `json:"auto"`
	File     transcriptionprofiles.TransportMode `json:"file"`
	Realtime transcriptionprofiles.TransportMode `json:"realtime"`
}

type TranscriptionProfileTransportModeOption struct {
	Value transcriptionprofiles.TransportMode `json:"value"`
	Label string                              `json:"label"`
}

type TranscriptionProfileUIConfigValue struct {
	DefaultName          string                                    `json:"defaultName"`
	DefaultTransportMode transcriptionprofiles.TransportMode       `json:"defaultTransportMode"`
	DefaultChunkMs       int                                       `json:"defaultChunkMs"`
	MinChunkMs           int                                       `json:"minChunkMs"`
	MaxChunkMs           int                                       `json:"maxChunkMs"`
	TransportModes       TranscriptionProfileTransportModesValue   `json:"transportModes"`
	TransportModeOptions []TranscriptionProfileTransportModeOption `json:"transportModeOptions"`
}

func FrontendValueTranscriptionProfileUIConfig() TranscriptionProfileUIConfigValue {
	return TranscriptionProfileUIConfigValue{
		DefaultName:          transcriptionprofiles.DefaultProfileName,
		DefaultTransportMode: transcriptionprofiles.TransportModeAuto,
		DefaultChunkMs:       transcriptionprofiles.DefaultChunkMs,
		MinChunkMs:           transcriptionprofiles.MinChunkMs,
		MaxChunkMs:           transcriptionprofiles.MaxChunkMs,
		TransportModes: TranscriptionProfileTransportModesValue{
			Auto:     transcriptionprofiles.TransportModeAuto,
			File:     transcriptionprofiles.TransportModeFile,
			Realtime: transcriptionprofiles.TransportModeRealtime,
		},
		TransportModeOptions: append([]TranscriptionProfileTransportModeOption(nil), frontendTranscriptionProfileTransportModeOptions...),
	}
}
