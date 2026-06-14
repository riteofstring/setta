package semanticgraph

import (
	"context"
	"errors"

	"setta/internal/chat"
)

func (service *Service) ReadSemanticCartographerSettings(ctx context.Context) (SemanticCartographerSettingsRecord, error) {
	if ctx == nil {
		return SemanticCartographerSettingsRecord{}, errors.New("context is required")
	}
	return service.store.ReadSemanticCartographerSettings(ctx)
}

func (service *Service) UpdateSemanticCartographerSettings(ctx context.Context, input SemanticCartographerSettingsInput, models []chat.ChatModelOption) (SemanticCartographerSettingsRecord, error) {
	if ctx == nil {
		return SemanticCartographerSettingsRecord{}, errors.New("context is required")
	}
	candidate := SemanticCartographerSettingsFromInput(input, timestamp(service.now()))
	if err := ValidateSemanticCartographerSettingsAgainstModelCatalog(candidate, models); err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	record, err := service.store.UpdateSemanticCartographerSettings(ctx, candidate)
	if err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	service.applySemanticCartographerSettingsDefaults(record.Settings)
	return record, nil
}
