package agent

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/codexapp"
)

func (runtime *Runtime) ListModels(ctx context.Context, cursor *string, limit int, includeHidden bool) (ModelPage, error) {
	if limit <= 0 || limit > MaxThreadPageSize {
		return ModelPage{}, fmt.Errorf("model list limit must be between 1 and %d", MaxThreadPageSize)
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodModelList, codexapp.ModelListParams{
		Cursor:        cloneString(cursor),
		IncludeHidden: &includeHidden,
		Limit:         &limit,
	})
	if err != nil {
		return ModelPage{}, fmt.Errorf("list agent models: %w", err)
	}
	response, err := codexapp.DecodeModelListResponse(raw)
	if err != nil {
		return ModelPage{}, fmt.Errorf("decode agent model list: %w", err)
	}
	page := ModelPage{Data: make([]Model, 0, len(response.Data)), NextCursor: cloneString(response.NextCursor)}
	for _, item := range response.Data {
		model := Model{
			ID:                        item.ID,
			DisplayName:               item.DisplayName,
			Description:               item.Description,
			DefaultReasoningEffort:    item.DefaultReasoningEffort,
			SupportedReasoningEfforts: make([]string, 0, len(item.SupportedReasoningEfforts)),
			ServiceTiers:              make([]string, 0, len(item.ServiceTiers)),
			DefaultServiceTier:        cloneString(item.DefaultServiceTier),
			IsDefault:                 item.IsDefault,
			Hidden:                    item.Hidden,
		}
		for _, effort := range item.SupportedReasoningEfforts {
			model.SupportedReasoningEfforts = append(model.SupportedReasoningEfforts, effort.ReasoningEffort)
		}
		for _, tier := range item.ServiceTiers {
			model.ServiceTiers = append(model.ServiceTiers, tier.ID)
		}
		page.Data = append(page.Data, model)
	}
	return page, nil
}

func (runtime *Runtime) ResolveInvocation(ctx context.Context, requested Invocation) (ResolvedInvocation, error) {
	if err := requested.Validate(); err != nil {
		return ResolvedInvocation{}, err
	}
	models, err := runtime.allModels(ctx)
	if err != nil {
		return ResolvedInvocation{}, err
	}
	selected, err := selectInvocationModel(models, requested)
	if err != nil {
		return ResolvedInvocation{}, err
	}
	effort, err := resolveReasoningEffort(*selected, requested.ReasoningEffort)
	if err != nil {
		return ResolvedInvocation{}, err
	}
	tier, err := resolveServiceTier(*selected, requested.ServiceTier)
	if err != nil {
		return ResolvedInvocation{}, err
	}
	return ResolvedInvocation{
		Requested:       requested,
		Model:           selected.ID,
		ReasoningEffort: effort,
		ServiceTier:     tier,
		PermissionMode:  requested.PermissionMode,
		ApprovalMode:    requested.ApprovalMode,
	}, nil
}

func selectInvocationModel(models []Model, requested Invocation) (*Model, error) {
	if !requested.ModelSelectionProviderDefault {
		for index := range models {
			if models[index].ID == requested.Model {
				return &models[index], nil
			}
		}
		return nil, fmt.Errorf("configured provider model %s is unavailable", requested.Model)
	}
	var selected *Model
	for index := range models {
		if !models[index].IsDefault {
			continue
		}
		if selected != nil {
			return nil, errors.New("provider model catalog contains multiple defaults")
		}
		selected = &models[index]
	}
	if selected == nil {
		return nil, errors.New("provider model catalog has no default model")
	}
	return selected, nil
}

func resolveReasoningEffort(model Model, requested string) (string, error) {
	effort := requested
	if effort == "" {
		effort = model.DefaultReasoningEffort
	}
	if !containsString(model.SupportedReasoningEfforts, effort) {
		return "", fmt.Errorf("provider model %s does not support reasoning effort %s", model.ID, effort)
	}
	return effort, nil
}

func resolveServiceTier(model Model, requested *string) (*string, error) {
	tier := cloneString(requested)
	if tier == nil {
		tier = cloneString(model.DefaultServiceTier)
	}
	if tier != nil && !containsString(model.ServiceTiers, *tier) {
		return nil, fmt.Errorf("provider model %s does not support service tier %s", model.ID, *tier)
	}
	return tier, nil
}

func (runtime *Runtime) allModels(ctx context.Context) ([]Model, error) {
	var models []Model
	var cursor *string
	for {
		page, err := runtime.ListModels(ctx, cursor, MaxThreadPageSize, true)
		if err != nil {
			return nil, err
		}
		models = append(models, page.Data...)
		if page.NextCursor == nil {
			return models, nil
		}
		if cursor != nil && *cursor == *page.NextCursor {
			return nil, errors.New("provider model catalog returned a repeated cursor")
		}
		cursor = cloneString(page.NextCursor)
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
