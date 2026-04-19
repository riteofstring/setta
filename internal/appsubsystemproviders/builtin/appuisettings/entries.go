package appuisettings

import (
	"context"
	"fmt"
	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
)

func BuildEntries(service appdefinition.Runtime, pluginID string) ([]uisettings.RuntimeEntry, error) {
	if service == nil {
		return nil, fmt.Errorf("app subsystem UI settings require an app definition runtime")
	}

	nonEmptyStringSchema := uisettings.ValueSchema{
		Type:      uisettings.ValueTypeString,
		MinLength: intPointer(1),
	}
	themeModeSchema := uisettings.ValueSchema{
		Type:       uisettings.ValueTypeString,
		EnumValues: []any{"auto", "dark", "light"},
	}

	return []uisettings.RuntimeEntry{
		uisettings.NewCompareAndSetEntry(
			entryMetadata(
				"core.app.catalog_id",
				pluginID,
				"App Catalog ID",
				[]string{"app catalog", "catalog id"},
				"Catalog id for the app definition.",
				nonEmptyStringSchema,
			),
			readValue(service, func(ctx context.Context, runtime appdefinition.Runtime) (any, error) {
				definition, err := runtime.GetEffectiveAppDefinition(ctx)
				if err != nil {
					return nil, err
				}
				return definition.CatalogID, nil
			}),
			uisettings.NormalizeOptionalNonEmptyStringWrite,
			func(ctx context.Context, _ string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := service.CompareAndSetAppDefinitionCatalogID(ctx, nextValue, expected)
				return result, err
			},
			uisettings.ComparableMutationResult[string],
		),
		uisettings.NewCompareAndSetEntry(
			entryMetadata(
				"core.app.spec_version",
				pluginID,
				"App Spec Version",
				[]string{"app version", "spec version"},
				"Version marker for the app definition schema payload.",
				nonEmptyStringSchema,
			),
			readValue(service, func(ctx context.Context, runtime appdefinition.Runtime) (any, error) {
				definition, err := runtime.GetEffectiveAppDefinition(ctx)
				if err != nil {
					return nil, err
				}
				return definition.AppSpecVersion, nil
			}),
			uisettings.NormalizeOptionalNonEmptyStringWrite,
			func(ctx context.Context, _ string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := service.CompareAndSetAppDefinitionSpecVersion(ctx, nextValue, expected)
				return result, err
			},
			uisettings.ComparableMutationResult[string],
		),
		uisettings.NewCompareAndSetEntry(
			entryMetadata(
				"core.app.spec_path",
				pluginID,
				"App Spec Path",
				[]string{"app path", "spec path"},
				"Filesystem path where app spec JSON is saved.",
				nonEmptyStringSchema,
			),
			readValue(service, func(ctx context.Context, runtime appdefinition.Runtime) (any, error) {
				return runtime.GetEffectiveAppSpecPath(ctx)
			}),
			uisettings.NormalizeOptionalNonEmptyStringWrite,
			func(ctx context.Context, _ string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := service.CompareAndSetAppDefinitionSpecPath(ctx, nextValue, expected)
				return result, err
			},
			uisettings.ComparableMutationResult[string],
		),
		uisettings.NewCompareAndSetEntry(
			entryMetadata(
				"core.app.theme_mode",
				pluginID,
				"App Theme Mode",
				[]string{"theme mode", "app theme", "light mode", "dark mode"},
				"Theme mode for the app definition.",
				themeModeSchema,
			),
			readValue(service, func(ctx context.Context, runtime appdefinition.Runtime) (any, error) {
				return runtime.GetEffectiveAppThemeMode(ctx)
			}),
			uisettings.NormalizeOptionalThemeModeWrite,
			func(ctx context.Context, _ string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := service.CompareAndSetAppDefinitionThemeMode(ctx, nextValue, expected)
				return result, err
			},
			uisettings.ComparableMutationResult[string],
		),
	}, nil
}

func entryMetadata(
	settingID string,
	pluginID string,
	title string,
	synonyms []string,
	description string,
	valueSchema uisettings.ValueSchema,
) uisettings.Entry {
	return uisettings.Entry{
		SettingID:   settingID,
		Title:       title,
		Synonyms:    append([]string(nil), synonyms...),
		Description: description,
		Location: uisettings.Location{
			Side:           uisettings.SideLeft,
			OverviewTabKey: string(uisettings.OverviewTabNameApp),
		},
		Highlight: uisettings.Highlight{
			Strategy: uisettings.HighlightStrategyDOMAnchor,
			AnchorID: settingID,
		},
		Source:      uisettings.SourcePlugin,
		PluginID:    pluginID,
		Mutability:  uisettings.MutabilityWritable,
		ValueSchema: valueSchema,
	}
}

func readValue(
	runtime appdefinition.Runtime,
	read func(context.Context, appdefinition.Runtime) (any, error),
) uisettings.ReadFunc {
	return func(ctx context.Context, _ string) (any, error) {
		return read(ctx, runtime)
	}
}

func intPointer(value int) *int {
	return &value
}
