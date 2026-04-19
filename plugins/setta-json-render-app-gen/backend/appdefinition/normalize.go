package appdefinition

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

var errAppRoutePathRequired = errors.New("app route path is required")

func DecodeStoredAppDefinition(
	raw projectstate.RawJSON,
) (*AppDefinition, error) {
	normalizedRaw, err := normalizeStoredAppDefinitionRawJSON(raw)
	if err != nil {
		return nil, err
	}
	if len(normalizedRaw) == 0 {
		return nil, nil
	}

	var definition AppDefinition
	if err := json.Unmarshal(normalizedRaw, &definition); err != nil {
		return nil, fmt.Errorf("%w: appDefinition", projectstate.ErrFrontendPayloadInvalid)
	}

	normalized, err := normalizeAppDefinition(definition)
	if err != nil {
		return nil, err
	}
	return &normalized, nil
}

func EncodeStoredAppDefinition(
	definition *AppDefinition,
) (projectstate.RawJSON, error) {
	if definition == nil {
		return nil, nil
	}
	normalized, err := normalizeAppDefinition(definition.Clone())
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return nil, fmt.Errorf("marshal appDefinition: %w", err)
	}
	return cloneAppDefinitionRawJSON(encoded), nil
}

func effectiveAppDefinition(document projectstate.Document) (AppDefinition, error) {
	current, err := DecodeStoredAppDefinition(StoredDocumentAppDefinitionRaw(document))
	if err != nil {
		return AppDefinition{}, err
	}
	if current == nil {
		return AppDefinition{
			AppSpecVersion: defaultAppSpecVersion,
			CatalogID:      appspec.DefaultCatalogID,
		}, nil
	}

	if strings.TrimSpace(current.AppSpecVersion) == "" {
		current.AppSpecVersion = defaultAppSpecVersion
	}
	if strings.TrimSpace(current.CatalogID) == "" {
		current.CatalogID = appspec.DefaultCatalogID
	}
	return current.Clone(), nil
}

func effectiveAppSpecPath(document projectstate.Document) (string, error) {
	current, err := effectiveAppDefinition(document)
	if err != nil {
		return "", err
	}
	if trimmed := strings.TrimSpace(current.AppSpecPath); trimmed != "" {
		return trimmed, nil
	}
	return appspec.DefaultPath(), nil
}

func effectiveAppThemeMode(document projectstate.Document) (string, error) {
	current, err := effectiveAppDefinition(document)
	if err != nil {
		return "", err
	}
	theme, err := decodeAppDefinitionJSONObject(current.Theme, "appDefinition.theme")
	if err != nil || theme == nil {
		return defaultAppThemeMode, err
	}
	if mode, ok := theme["mode"].(string); ok && strings.TrimSpace(mode) != "" {
		return mode, nil
	}
	return defaultAppThemeMode, nil
}

func normalizeAppDefinition(definition AppDefinition) (AppDefinition, error) {
	normalized := definition.Clone()
	normalized.AppSpecVersion = strings.TrimSpace(normalized.AppSpecVersion)
	normalized.CatalogID = strings.TrimSpace(normalized.CatalogID)
	normalized.AppSpecPath = strings.TrimSpace(normalized.AppSpecPath)

	var err error
	normalized.DataBindings, err = normalizeAppDefinitionJSONObject(
		normalized.DataBindings,
		"appDefinition.dataBindings",
	)
	if err != nil {
		return AppDefinition{}, err
	}
	normalized.Actions, err = normalizeAppDefinitionJSONObject(
		normalized.Actions,
		"appDefinition.actions",
	)
	if err != nil {
		return AppDefinition{}, err
	}
	normalized.Theme, err = normalizeAppDefinitionRawJSON(normalized.Theme, "appDefinition.theme")
	if err != nil {
		return AppDefinition{}, err
	}
	normalized.Assets, err = normalizeAppDefinitionRawJSON(normalized.Assets, "appDefinition.assets")
	if err != nil {
		return AppDefinition{}, err
	}

	for index, route := range normalized.Routes {
		normalizedRoute, err := normalizeAppRoute(route)
		if err != nil {
			return AppDefinition{}, fmt.Errorf("normalize app route %d: %w", index, err)
		}
		normalized.Routes[index] = normalizedRoute
	}

	return normalized, nil
}

func normalizeAppRoute(route AppRoute) (AppRoute, error) {
	normalized := AppRoute{
		Path:    strings.TrimSpace(route.Path),
		Name:    strings.TrimSpace(route.Name),
		RootKey: strings.TrimSpace(route.RootKey),
	}
	if normalized.Path == "" {
		return AppRoute{}, errAppRoutePathRequired
	}
	return normalized, nil
}

func normalizeAppDefinitionRawJSON(raw projectstate.RawJSON, field string) (projectstate.RawJSON, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, nil
	}
	if !json.Valid(trimmed) {
		return nil, fmt.Errorf("%w: %s", projectstate.ErrFrontendPayloadInvalid, field)
	}
	return cloneAppDefinitionRawJSON(trimmed), nil
}

func normalizeAppDefinitionJSONObject(raw projectstate.RawJSON, field string) (projectstate.RawJSON, error) {
	normalized, err := normalizeAppDefinitionRawJSON(raw, field)
	if err != nil {
		return nil, err
	}
	if _, err := decodeAppDefinitionJSONObject(normalized, field); err != nil {
		return nil, err
	}
	return normalized, nil
}

func cloneAppDefinitionRawJSON(raw projectstate.RawJSON) projectstate.RawJSON {
	if len(raw) == 0 {
		return nil
	}
	cloned := make(projectstate.RawJSON, len(raw))
	copy(cloned, raw)
	return cloned
}

func normalizeStoredAppDefinitionRawJSON(
	raw projectstate.RawJSON,
) (projectstate.RawJSON, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, nil
	}
	if !json.Valid(trimmed) {
		return nil, fmt.Errorf("%w: appDefinition", projectstate.ErrFrontendPayloadInvalid)
	}
	return cloneAppDefinitionRawJSON(trimmed), nil
}
