package semanticgraph

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"setta/internal/chat"
)

const (
	semanticCartographerSettingsSchemaVersion = 1
	semanticCartographerSettingsID            = "global"

	defaultSemanticCartographerFinalInputBudget       = 12000
	defaultSemanticCartographerQuietCloseAfterSeconds = 120
)

type SemanticCartographerModelSelection string
type SemanticCartographerAuditCaptureLevel string

const (
	SemanticCartographerModelSelectionProviderDefault SemanticCartographerModelSelection = "provider_default"
	SemanticCartographerModelSelectionExplicit        SemanticCartographerModelSelection = "explicit"

	SemanticCartographerAuditCaptureMinimal  SemanticCartographerAuditCaptureLevel = "minimal"
	SemanticCartographerAuditCaptureStandard SemanticCartographerAuditCaptureLevel = "standard"
	SemanticCartographerAuditCaptureDebug    SemanticCartographerAuditCaptureLevel = "debug"
)

type SemanticCartographerSettings struct {
	SchemaVersion              int                                   `json:"schemaVersion"`
	AutomaticProcessingEnabled bool                                  `json:"automaticProcessingEnabled"`
	LiveTaskConfig             SemanticCartographerTaskConfig        `json:"liveTaskConfig"`
	FinalSynthesisTaskConfig   SemanticCartographerTaskConfig        `json:"finalSynthesisTaskConfig"`
	ProcessingConfig           SemanticCartographerProcessingConfig  `json:"processingConfig"`
	ObservationConfig          SemanticCartographerObservationConfig `json:"observationConfig"`
	AuditConfig                SemanticCartographerAuditConfig       `json:"auditConfig"`
	UpdatedAt                  string                                `json:"updatedAt"`
}

type SemanticCartographerTaskConfig struct {
	ModelSelection  SemanticCartographerModelSelection `json:"modelSelection"`
	ModelID         string                             `json:"modelId"`
	ReasoningEffort chat.ReasoningEffort               `json:"reasoningEffort"`
	InputBudget     int                                `json:"inputBudget"`
}

type SemanticCartographerProcessingConfig struct {
	MaxConcurrent        int `json:"maxConcurrent"`
	PerSourceConcurrent  int `json:"perSourceConcurrent"`
	MaxQueuedPerSource   int `json:"maxQueuedPerSource"`
	LeaseDurationSeconds int `json:"leaseDurationSeconds"`
}

type SemanticCartographerObservationConfig struct {
	MaxWindowEvents         int `json:"maxWindowEvents"`
	MaxWindowContentBytes   int `json:"maxWindowContentBytes"`
	AssistantThresholdBytes int `json:"assistantThresholdBytes"`
	OutputThresholdBytes    int `json:"outputThresholdBytes"`
	PriorSummaryLimit       int `json:"priorSummaryLimit"`
	TokenBudget             int `json:"tokenBudget"`
	QuietCloseAfterSeconds  int `json:"quietCloseAfterSeconds"`
}

type SemanticCartographerAuditConfig struct {
	CaptureLevel SemanticCartographerAuditCaptureLevel `json:"captureLevel"`
}

type SemanticCartographerSettingsRecord struct {
	ID           string                       `json:"id"`
	Settings     SemanticCartographerSettings `json:"settings"`
	SettingsHash string                       `json:"settingsHash"`
	CreatedAt    string                       `json:"createdAt"`
	UpdatedAt    string                       `json:"updatedAt"`
}

func DefaultSemanticCartographerSettings(updatedAt string) SemanticCartographerSettings {
	observation := DefaultCartographerObservationConfig()
	processing := normalizeAutomaticCartographerProcessingConfig(AutomaticCartographerProcessingConfig{})
	return SemanticCartographerSettings{
		SchemaVersion:              semanticCartographerSettingsSchemaVersion,
		AutomaticProcessingEnabled: true,
		LiveTaskConfig: SemanticCartographerTaskConfig{
			ModelSelection:  SemanticCartographerModelSelectionProviderDefault,
			ModelID:         "",
			ReasoningEffort: chat.ReasoningEffortLow,
			InputBudget:     observation.TokenBudget,
		},
		FinalSynthesisTaskConfig: SemanticCartographerTaskConfig{
			ModelSelection:  SemanticCartographerModelSelectionProviderDefault,
			ModelID:         "",
			ReasoningEffort: chat.ReasoningEffortMedium,
			InputBudget:     defaultSemanticCartographerFinalInputBudget,
		},
		ProcessingConfig: SemanticCartographerProcessingConfig{
			MaxConcurrent:        processing.MaxConcurrent,
			PerSourceConcurrent:  processing.PerSourceConcurrent,
			MaxQueuedPerSource:   processing.MaxQueuedPerSource,
			LeaseDurationSeconds: processing.LeaseDurationSeconds,
		},
		ObservationConfig: SemanticCartographerObservationConfig{
			MaxWindowEvents:         observation.MaxWindowEvents,
			MaxWindowContentBytes:   observation.MaxWindowContentBytes,
			AssistantThresholdBytes: observation.AssistantThresholdBytes,
			OutputThresholdBytes:    observation.OutputThresholdBytes,
			PriorSummaryLimit:       observation.PriorSummaryLimit,
			TokenBudget:             observation.TokenBudget,
			QuietCloseAfterSeconds:  defaultSemanticCartographerQuietCloseAfterSeconds,
		},
		AuditConfig: SemanticCartographerAuditConfig{
			CaptureLevel: SemanticCartographerAuditCaptureStandard,
		},
		UpdatedAt: updatedAt,
	}
}

func validateSemanticCartographerSettings(settings SemanticCartographerSettings) error {
	if settings.SchemaVersion != semanticCartographerSettingsSchemaVersion {
		return fmt.Errorf("semantic cartographer settings schemaVersion = %d, want %d", settings.SchemaVersion, semanticCartographerSettingsSchemaVersion)
	}
	if err := validateSemanticCartographerTaskConfig(settings.LiveTaskConfig, "semantic cartographer live task config"); err != nil {
		return err
	}
	if err := validateSemanticCartographerTaskConfig(settings.FinalSynthesisTaskConfig, "semantic cartographer final synthesis task config"); err != nil {
		return err
	}
	if err := validateSemanticCartographerProcessingConfig(settings.ProcessingConfig); err != nil {
		return err
	}
	if err := validateSemanticCartographerObservationConfig(settings.ObservationConfig); err != nil {
		return err
	}
	if err := validateSemanticCartographerAuditConfig(settings.AuditConfig); err != nil {
		return err
	}
	if settings.UpdatedAt == "" {
		return fmt.Errorf("semantic cartographer settings updatedAt is required")
	}
	return validateTimestamp("semantic cartographer settings updatedAt", settings.UpdatedAt)
}

func validateSemanticCartographerTaskConfig(config SemanticCartographerTaskConfig, label string) error {
	switch config.ModelSelection {
	case SemanticCartographerModelSelectionProviderDefault:
		if config.ModelID != "" {
			return fmt.Errorf("%s modelId must be empty when modelSelection is %s", label, SemanticCartographerModelSelectionProviderDefault)
		}
	case SemanticCartographerModelSelectionExplicit:
		if strings.TrimSpace(config.ModelID) == "" {
			return fmt.Errorf("%s modelId is required when modelSelection is %s", label, SemanticCartographerModelSelectionExplicit)
		}
		if strings.TrimSpace(config.ModelID) != config.ModelID {
			return fmt.Errorf("%s modelId must not have leading or trailing whitespace", label)
		}
	default:
		return fmt.Errorf("%s modelSelection is unsupported: %s", label, config.ModelSelection)
	}
	if !isSemanticCartographerReasoningEffort(config.ReasoningEffort) {
		return fmt.Errorf("%s reasoningEffort is unsupported: %s", label, config.ReasoningEffort)
	}
	if config.InputBudget <= 0 {
		return fmt.Errorf("%s inputBudget must be positive: %d", label, config.InputBudget)
	}
	return nil
}

func validateSemanticCartographerProcessingConfig(config SemanticCartographerProcessingConfig) error {
	if config.MaxConcurrent <= 0 {
		return fmt.Errorf("semantic cartographer processing maxConcurrent must be positive: %d", config.MaxConcurrent)
	}
	if config.PerSourceConcurrent <= 0 {
		return fmt.Errorf("semantic cartographer processing perSourceConcurrent must be positive: %d", config.PerSourceConcurrent)
	}
	if config.PerSourceConcurrent > config.MaxConcurrent {
		return fmt.Errorf("semantic cartographer processing perSourceConcurrent %d exceeds maxConcurrent %d", config.PerSourceConcurrent, config.MaxConcurrent)
	}
	if config.MaxQueuedPerSource <= 0 {
		return fmt.Errorf("semantic cartographer processing maxQueuedPerSource must be positive: %d", config.MaxQueuedPerSource)
	}
	if config.LeaseDurationSeconds <= 0 {
		return fmt.Errorf("semantic cartographer processing leaseDurationSeconds must be positive: %d", config.LeaseDurationSeconds)
	}
	return nil
}

func validateSemanticCartographerObservationConfig(config SemanticCartographerObservationConfig) error {
	if config.MaxWindowEvents <= 0 {
		return fmt.Errorf("semantic cartographer observation maxWindowEvents must be positive: %d", config.MaxWindowEvents)
	}
	if config.MaxWindowContentBytes <= 0 {
		return fmt.Errorf("semantic cartographer observation maxWindowContentBytes must be positive: %d", config.MaxWindowContentBytes)
	}
	if config.AssistantThresholdBytes <= 0 {
		return fmt.Errorf("semantic cartographer observation assistantThresholdBytes must be positive: %d", config.AssistantThresholdBytes)
	}
	if config.AssistantThresholdBytes > config.MaxWindowContentBytes {
		return fmt.Errorf("semantic cartographer observation assistantThresholdBytes %d exceeds maxWindowContentBytes %d", config.AssistantThresholdBytes, config.MaxWindowContentBytes)
	}
	if config.OutputThresholdBytes <= 0 {
		return fmt.Errorf("semantic cartographer observation outputThresholdBytes must be positive: %d", config.OutputThresholdBytes)
	}
	if config.OutputThresholdBytes > config.MaxWindowContentBytes {
		return fmt.Errorf("semantic cartographer observation outputThresholdBytes %d exceeds maxWindowContentBytes %d", config.OutputThresholdBytes, config.MaxWindowContentBytes)
	}
	if config.PriorSummaryLimit <= 0 {
		return fmt.Errorf("semantic cartographer observation priorSummaryLimit must be positive: %d", config.PriorSummaryLimit)
	}
	if config.TokenBudget <= 0 {
		return fmt.Errorf("semantic cartographer observation tokenBudget must be positive: %d", config.TokenBudget)
	}
	if config.QuietCloseAfterSeconds <= 0 {
		return fmt.Errorf("semantic cartographer observation quietCloseAfterSeconds must be positive: %d", config.QuietCloseAfterSeconds)
	}
	return nil
}

func validateSemanticCartographerAuditConfig(config SemanticCartographerAuditConfig) error {
	switch config.CaptureLevel {
	case SemanticCartographerAuditCaptureMinimal,
		SemanticCartographerAuditCaptureStandard,
		SemanticCartographerAuditCaptureDebug:
		return nil
	default:
		return fmt.Errorf("semantic cartographer audit captureLevel is unsupported: %s", config.CaptureLevel)
	}
}

func isSemanticCartographerReasoningEffort(effort chat.ReasoningEffort) bool {
	switch effort {
	case chat.ReasoningEffortNone,
		chat.ReasoningEffortMinimal,
		chat.ReasoningEffortLow,
		chat.ReasoningEffortMedium,
		chat.ReasoningEffortHigh,
		chat.ReasoningEffortXHigh:
		return true
	default:
		return false
	}
}

func canonicalSemanticCartographerSettingsJSON(settings SemanticCartographerSettings) (string, error) {
	if err := validateSemanticCartographerSettings(settings); err != nil {
		return "", err
	}
	data, err := json.Marshal(settings)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func semanticCartographerSettingsHash(settings SemanticCartographerSettings) (string, error) {
	settingsJSON, err := canonicalSemanticCartographerSettingsJSON(settings)
	if err != nil {
		return "", err
	}
	return hashBytes([]byte(settingsJSON)), nil
}

func decodeSemanticCartographerSettings(settingsJSON string) (SemanticCartographerSettings, error) {
	var settings SemanticCartographerSettings
	decoder := json.NewDecoder(bytes.NewReader([]byte(settingsJSON)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&settings); err != nil {
		return settings, fmt.Errorf("decode semantic cartographer settings: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return settings, fmt.Errorf("decode semantic cartographer settings: trailing JSON value")
		}
		return settings, fmt.Errorf("decode semantic cartographer settings trailing JSON: %w", err)
	}
	return settings, nil
}

func (config SemanticCartographerProcessingConfig) automaticCartographerProcessingConfig() AutomaticCartographerProcessingConfig {
	return AutomaticCartographerProcessingConfig{
		MaxConcurrent:        config.MaxConcurrent,
		PerSourceConcurrent:  config.PerSourceConcurrent,
		LeaseDurationSeconds: config.LeaseDurationSeconds,
		MaxQueuedPerSource:   config.MaxQueuedPerSource,
	}
}

func (config SemanticCartographerObservationConfig) cartographerObservationConfig() CartographerObservationConfig {
	return CartographerObservationConfig{
		MaxWindowEvents:         config.MaxWindowEvents,
		MaxWindowContentBytes:   config.MaxWindowContentBytes,
		AssistantThresholdBytes: config.AssistantThresholdBytes,
		OutputThresholdBytes:    config.OutputThresholdBytes,
		PriorSummaryLimit:       config.PriorSummaryLimit,
		TokenBudget:             config.TokenBudget,
	}
}
