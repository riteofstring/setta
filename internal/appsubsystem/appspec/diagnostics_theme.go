package appspec

import (
	"strings"
)

func collectThemeColorIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	themeColors, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.colors must be an object."}}
	}
	if !themeColorsUseVariants(themeColors) {
		return collectThemeColorMapIssues(themeColors, "theme.colors", warnings)
	}
	warnUnknownThemeColorVariants(themeColors, warnings)
	return collectThemeColorVariantIssues(themeColors, warnings)
}

func themeColorsUseVariants(themeColors map[string]any) bool {
	return hasMapKey(themeColors, "light") || hasMapKey(themeColors, "dark")
}

func warnUnknownThemeColorVariants(themeColors map[string]any, warnings *[]AppValidationIssue) {
	extraVariantKeys := make([]string, 0)
	for key := range themeColors {
		if key != "light" && key != "dark" {
			extraVariantKeys = append(extraVariantKeys, key)
		}
	}
	if len(extraVariantKeys) == 0 {
		return
	}
	preview, suffix := previewSorted(extraVariantKeys, 6)
	*warnings = append(*warnings, AppValidationIssue{
		Message: "theme.colors contains unknown keys and they will be ignored: " + preview + suffix,
	})
}

func collectThemeColorVariantIssues(themeColors map[string]any, warnings *[]AppValidationIssue) []AppValidationIssue {
	errors := make([]AppValidationIssue, 0)
	for _, variantName := range []string{"light", "dark"} {
		if !hasMapKey(themeColors, variantName) {
			continue
		}
		errors = append(errors, collectSingleThemeColorVariantIssues(themeColors[variantName], variantName, warnings)...)
	}
	return errors
}

func collectSingleThemeColorVariantIssues(raw any, variantName string, warnings *[]AppValidationIssue) []AppValidationIssue {
	variant, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{
			Message: "theme.colors." + variantName + " must be an object.",
		}}
	}
	return collectThemeColorMapIssues(variant, "theme.colors."+variantName, warnings)
}

func collectThemeColorMapIssues(raw map[string]any, prefix string, warnings *[]AppValidationIssue) []AppValidationIssue {
	unknown := unknownMapKeys(raw, themeColorKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: prefix + " contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range themeColorKeys {
		if !hasMapKey(raw, key) {
			continue
		}
		if _, ok := raw[key].(string); !ok {
			errors = append(errors, AppValidationIssue{
				Message: prefix + "." + key + " must be a string.",
			})
		}
	}
	return errors
}

func collectThemeFontIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	fonts, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.fonts must be an object."}}
	}

	unknown := unknownMapKeys(fonts, themeFontKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.fonts contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range themeFontKeys {
		if !hasMapKey(fonts, key) {
			continue
		}
		if _, ok := fonts[key].(string); !ok {
			errors = append(errors, AppValidationIssue{
				Message: "theme.fonts." + key + " must be a string.",
			})
		}
	}
	return errors
}

func collectThemeTypographyIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	typography, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.typography must be an object."}}
	}

	unknown := unknownMapKeys(typography, themeTypographyKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.typography contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := collectThemeStringOrNumberIssues(
		typography,
		[]string{"bodySize", "bodyLineHeight", "headingLineHeight"},
		"theme.typography",
	)
	errors = append(errors, collectThemeOptionalStringOrNumberMapIssues(
		typography,
		"headingSizes",
		themeHeadingSizeKeys,
		"theme.typography.headingSizes",
		warnings,
	)...)
	errors = append(errors, collectThemeOptionalStringOrNumberMapIssues(
		typography,
		"scale",
		themeTextScaleKeys,
		"theme.typography.scale",
		warnings,
	)...)
	return errors
}

func collectThemeStringOrNumberIssues(values map[string]any, keys []string, prefix string) []AppValidationIssue {
	errors := make([]AppValidationIssue, 0)
	for _, key := range keys {
		if !hasMapKey(values, key) {
			continue
		}
		if !isStringOrNumber(values[key]) {
			errors = append(errors, AppValidationIssue{
				Message: prefix + "." + key + " must be a number or string.",
			})
		}
	}
	return errors
}

func collectThemeOptionalStringOrNumberMapIssues(
	values map[string]any,
	key string,
	allowed map[string]struct{},
	prefix string,
	warnings *[]AppValidationIssue,
) []AppValidationIssue {
	if !hasMapKey(values, key) {
		return nil
	}
	entries, ok := values[key].(map[string]any)
	if !ok {
		return []AppValidationIssue{{
			Message: prefix + " must be an object.",
		}}
	}

	unknown := unknownMapKeys(entries, allowed)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: prefix + " contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for allowedKey := range allowed {
		if !hasMapKey(entries, allowedKey) {
			continue
		}
		if !isStringOrNumber(entries[allowedKey]) {
			errors = append(errors, AppValidationIssue{
				Message: prefix + "." + allowedKey + " must be a number or string.",
			})
		}
	}
	return errors
}

func collectThemeSpacingIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	spacing, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.spacing must be an object."}}
	}

	unknown := unknownMapKeys(spacing, themeSpacingKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.spacing contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range themeSpacingKeys {
		if !hasMapKey(spacing, key) {
			continue
		}
		if !isStringOrNumber(spacing[key]) {
			errors = append(errors, AppValidationIssue{
				Message: "theme.spacing." + key + " must be a number or string.",
			})
		}
	}
	return errors
}

func collectThemeVarIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	vars, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.vars must be an object."}}
	}

	invalidNamespace := make([]string, 0)
	for key := range vars {
		if !strings.HasPrefix(key, "--app-") {
			invalidNamespace = append(invalidNamespace, key)
		}
	}
	if len(invalidNamespace) > 0 {
		preview, suffix := previewSorted(invalidNamespace, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.vars contains keys that do not start with '--app-' and will be ignored: " + preview + suffix,
		})
	}

	for key, value := range vars {
		if !strings.HasPrefix(key, "--app-") {
			continue
		}
		if _, ok := value.(string); ok {
			continue
		}
		if _, ok := asNumber(value); ok {
			continue
		}
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.vars " + key + " must be a string or number and will be ignored.",
		})
	}
	return nil
}

func collectThemeMotionIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	motion, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.motion must be an object."}}
	}

	unknown := unknownMapKeys(motion, themeMotionKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.motion contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for _, key := range []string{"durationMs", "delayMs", "staggerMs"} {
		if !hasMapKey(motion, key) {
			continue
		}
		if _, ok := asNumber(motion[key]); !ok {
			errors = append(errors, AppValidationIssue{
				Message: "theme.motion." + key + " must be a number.",
			})
		}
	}
	if easing, ok := motion["easing"]; ok {
		if _, ok := easing.(string); !ok {
			errors = append(errors, AppValidationIssue{Message: "theme.motion.easing must be a string."})
		}
	}
	return errors
}

func collectThemeShadowIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	shadows, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.shadows must be an object."}}
	}

	unknown := unknownMapKeys(shadows, themeShadowKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.shadows contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range themeShadowKeys {
		if !hasMapKey(shadows, key) {
			continue
		}
		if _, ok := shadows[key].(string); !ok {
			errors = append(errors, AppValidationIssue{
				Message: "theme.shadows." + key + " must be a string.",
			})
		}
	}
	return errors
}

func collectThemeComponentIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	components, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.components must be an object."}}
	}

	unknown := unknownMapKeys(components, themeComponentKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.components contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	errors = append(errors, collectThemeComponentTokenBlock(components, "button", themeButtonTokenKeys, warnings)...)
	errors = append(errors, collectThemeComponentTokenBlock(components, "input", themeInputTokenKeys, warnings)...)
	errors = append(errors, collectThemeComponentTokenBlock(components, "dropdown", themeDropdownTokenKeys, warnings)...)
	errors = append(errors, collectThemeComponentTokenBlock(components, "card", themeCardTokenKeys, warnings)...)
	errors = append(errors, collectThemeComponentTokenBlock(components, "page", themePageTokenKeys, warnings)...)
	return errors
}

func collectThemeComponentTokenBlock(
	components map[string]any,
	component string,
	tokenKeys map[string]struct{},
	warnings *[]AppValidationIssue,
) []AppValidationIssue {
	if !hasMapKey(components, component) {
		return nil
	}

	prefix := "theme.components." + component
	value, ok := components[component].(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: prefix + " must be an object."}}
	}

	unknown := unknownMapKeys(value, tokenKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: prefix + " contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range tokenKeys {
		if !hasMapKey(value, key) {
			continue
		}
		if _, ok := value[key].(string); !ok {
			errors = append(errors, AppValidationIssue{
				Message: prefix + "." + key + " must be a string.",
			})
		}
	}
	return errors
}
