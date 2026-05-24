package projectview

import (
	"encoding/json"
	"sort"
	"strings"

	"setta/internal/projectstate"
)

func sectionImplPayload(impl projectstate.SectionImpl) (json.RawMessage, error) {
	return projectstate.SectionImplPayload(impl)
}

func sectionImplPayloadUnchecked(impl projectstate.SectionImpl) json.RawMessage {
	payload, err := sectionImplPayload(impl)
	if err != nil {
		panic(err)
	}
	return payload
}

func codeObjImplPayload(impl projectstate.CodeObjectImpl) (json.RawMessage, error) {
	return projectstate.CodeObjectImplPayload(impl)
}

func fallbackSectionType(impl projectstate.SectionImpl) string {
	switch {
	case impl.IsCode():
		return "Code"
	case impl.IsTerminal():
		return "Terminal"
	case impl.IsDraw():
		return "Draw"
	case impl.IsGenerated():
		switch impl.Generated.Kind {
		case projectstate.GeneratedSectionKindPythonCode:
			return "GenPythonCode"
		case projectstate.GeneratedSectionKindPythonMetadata:
			return "GenPythonMetadata"
		case projectstate.GeneratedSectionKindPlugin:
			return "Plugin"
		}
	}
	if impl.Kind == "" {
		return ""
	}
	return string(impl.Kind)
}

func codegenTargetPayload(target projectstate.ProjectCodegenTarget) json.RawMessage {
	if strings.TrimSpace(target.Language) == string(projectstate.CodeLanguagePython) {
		payload, ok := pythonCodegenTargetPayload(target)
		if ok {
			return payload
		}
	}
	return pluginCodegenTargetPayload(target)
}

func pythonCodegenTargetPayload(
	target projectstate.ProjectCodegenTarget,
) (json.RawMessage, bool) {
	config, err := projectstate.DecodePythonCodegenTarget(target)
	if err != nil {
		return nil, false
	}
	sectionPolicy, err := config.DecodedSectionPolicy()
	if err != nil {
		return nil, false
	}
	codeObjValuePolicy, err := config.DecodedCodeObjValuePolicy()
	if err != nil {
		return nil, false
	}
	return mustMarshal(ProjectCodegenPythonTarget{
		Language:         ProjectCodegenLanguagePython,
		GenCodePrefix:    config.GenCodePrefix,
		GenCodeSuffix:    config.GenCodeSuffix,
		GenerateMetadata: config.GenerateMetadata,
		SectionPolicy: frontendPythonSectionPolicy(
			config.SectionPolicy,
			sectionPolicy,
		),
		CodeObjValuePolicy: frontendPythonCodeObjValuePolicy(
			config.CodeObjValuePolicy,
			codeObjValuePolicy,
		),
	}), true
}

func pluginCodegenTargetPayload(target projectstate.ProjectCodegenTarget) json.RawMessage {
	payload := ProjectCodegenPluginTarget{
		Language: target.Language,
		Options:  map[string]any{},
	}
	if rawFields, ok := rawJSONObjectFields(target.Payload); ok {
		if rawOptions, exists := rawFields["options"]; exists {
			var options map[string]any
			if err := json.Unmarshal(rawOptions, &options); err == nil && options != nil {
				payload.Options = options
			}
		}
	}
	return mustMarshal(payload)
}

func FrontendDefaultPythonSectionCodegenPolicy() SectionCodegenPolicy {
	return frontendPythonSectionPolicy(nil, projectstate.DefaultPythonSectionCodegenPolicy())
}

func FrontendDefaultPythonCodeObjValuePolicy() CodeObjValuePolicy {
	return frontendPythonCodeObjValuePolicy(nil, projectstate.DefaultPythonCodeObjValuePolicy())
}

func FrontendDefaultProjectCodegenPythonTarget() ProjectCodegenPythonTarget {
	config, err := projectstate.DecodePythonCodegenTarget(projectstate.ProjectCodegenTarget{
		Language: string(projectstate.CodeLanguagePython),
	})
	if err != nil {
		panic("decode default project codegen python target: " + err.Error())
	}
	return ProjectCodegenPythonTarget{
		Language:           ProjectCodegenLanguagePython,
		GenCodePrefix:      config.GenCodePrefix,
		GenCodeSuffix:      config.GenCodeSuffix,
		GenerateMetadata:   config.GenerateMetadata,
		SectionPolicy:      FrontendDefaultPythonSectionCodegenPolicy(),
		CodeObjValuePolicy: FrontendDefaultPythonCodeObjValuePolicy(),
	}
}

func frontendPythonSectionPolicy(
	raw projectstate.RawJSON,
	policy projectstate.PythonSectionCodegenPolicy,
) SectionCodegenPolicy {
	rawFields, ok := rawJSONObjectFields(raw)
	if !ok {
		return SectionCodegenPolicy{
			Allowlist:            orderedTypedPolicyList(policy.Allowlist, defaultPythonSectionAllowlistOrder, policy.AllowlistAllowAll),
			MetaControlAllowlist: orderedTypedPolicyList(policy.MetaControlAllowlist, defaultPythonMetaControlAllowlistOrder, policy.MetaControlAllowlistAllowAll),
			Exclude:              orderedSetValues(policy.Exclude),
			TypePolicies:         frontendPythonSectionTypePolicies(policy.TypePolicies),
			SectionOverrides:     frontendPythonSectionOverrides(policy.SectionOverrides),
		}
	}

	allowlist := orderedTypedPolicyList(
		policy.Allowlist,
		defaultPythonSectionAllowlistOrder,
		policy.AllowlistAllowAll,
	)
	if rawAllowlist, exists := rawFields["allowlist"]; exists {
		allowlist = decodeOrderedTypedList(rawAllowlist, allowlist)
	}
	metaControlAllowlist := orderedTypedPolicyList(
		policy.MetaControlAllowlist,
		defaultPythonMetaControlAllowlistOrder,
		policy.MetaControlAllowlistAllowAll,
	)
	if rawAllowlist, exists := rawFields["metaControlAllowlist"]; exists {
		metaControlAllowlist = decodeOrderedTypedList(
			rawAllowlist,
			metaControlAllowlist,
		)
	}
	exclude := orderedSetValues(policy.Exclude)
	if rawExclude, exists := rawFields["exclude"]; exists {
		exclude = decodeOrderedStringList(rawExclude, exclude)
	}
	typePolicies := frontendPythonSectionTypePolicies(policy.TypePolicies)
	if rawTypePolicies, exists := rawFields["typePolicies"]; exists {
		typePolicies = frontendPythonSectionTypePoliciesFromRaw(
			rawTypePolicies,
			policy.TypePolicies,
		)
	}
	sectionOverrides := frontendPythonSectionOverrides(policy.SectionOverrides)
	if rawOverrides, exists := rawFields["sectionOverrides"]; exists {
		sectionOverrides = frontendPythonSectionOverridesFromRaw(
			rawOverrides,
			policy.SectionOverrides,
		)
	}
	return SectionCodegenPolicy{
		Allowlist:            allowlist,
		MetaControlAllowlist: metaControlAllowlist,
		Exclude:              exclude,
		TypePolicies:         typePolicies,
		SectionOverrides:     sectionOverrides,
	}
}

func frontendPythonCodeObjValuePolicy(
	raw projectstate.RawJSON,
	policy projectstate.PythonCodeObjValuePolicy,
) CodeObjValuePolicy {
	rawFields, ok := rawJSONObjectFields(raw)
	if !ok {
		return CodeObjValuePolicy{
			TypePolicies:     frontendPythonCodeObjTypePolicies(policy.TypePolicies),
			CodeObjOverrides: frontendPythonCodeObjOverrides(policy.CodeObjOverrides),
		}
	}

	typePolicies := frontendPythonCodeObjTypePolicies(policy.TypePolicies)
	if rawTypePolicies, exists := rawFields["typePolicies"]; exists {
		typePolicies = frontendPythonCodeObjTypePoliciesFromRaw(
			rawTypePolicies,
			policy.TypePolicies,
		)
	}
	codeObjOverrides := frontendPythonCodeObjOverrides(policy.CodeObjOverrides)
	if rawOverrides, exists := rawFields["codeObjOverrides"]; exists {
		codeObjOverrides = frontendPythonCodeObjOverridesFromRaw(
			rawOverrides,
			policy.CodeObjOverrides,
		)
	}
	return CodeObjValuePolicy{
		TypePolicies:     typePolicies,
		CodeObjOverrides: codeObjOverrides,
	}
}

func frontendPythonSectionTypePolicies(
	policies map[string]projectstate.PythonSectionTypeCodegenPolicy,
) map[string]SectionTypeCodegenPolicy {
	result := make(map[string]SectionTypeCodegenPolicy, len(policies))
	for _, key := range orderedPolicyKeys(policies, pythonSectionTypeOrder) {
		result[key] = frontendSectionTypeCodegenPolicyValue(policies[key])
	}
	return result
}

func frontendPythonSectionOverrides(
	overrides map[string]projectstate.PythonSectionCodegenOverride,
) map[string]SectionCodegenOverride {
	result := make(map[string]SectionCodegenOverride, len(overrides))
	for _, key := range orderedMapKeys(overrides) {
		result[key] = frontendSectionCodegenOverrideValue(overrides[key])
	}
	return result
}

func frontendPythonSectionTypePoliciesFromRaw(
	raw json.RawMessage,
	policies map[string]projectstate.PythonSectionTypeCodegenPolicy,
) map[string]SectionTypeCodegenPolicy {
	fields, ok := rawJSONObjectFields(raw)
	if !ok {
		return frontendPythonSectionTypePolicies(policies)
	}
	result := make(map[string]SectionTypeCodegenPolicy, len(fields))
	for _, key := range orderedPolicyKeys(fields, pythonSectionTypeOrder) {
		result[key] = frontendSectionTypeCodegenPolicyValue(policies[key])
	}
	return result
}

func frontendPythonSectionOverridesFromRaw(
	raw json.RawMessage,
	overrides map[string]projectstate.PythonSectionCodegenOverride,
) map[string]SectionCodegenOverride {
	fields, ok := rawJSONObjectFields(raw)
	if !ok {
		return frontendPythonSectionOverrides(overrides)
	}
	result := make(map[string]SectionCodegenOverride, len(fields))
	for _, key := range orderedPolicyKeys(fields, nil) {
		result[key] = frontendSectionCodegenOverrideValue(overrides[key])
	}
	return result
}

func frontendPythonCodeObjTypePolicies(
	policies map[string]projectstate.PythonCodeObjTypeValuePolicy,
) map[string]CodeObjTypeValuePolicy {
	result := make(map[string]CodeObjTypeValuePolicy, len(policies))
	for _, key := range orderedPolicyKeys(policies, pythonCodeObjTypeOrder) {
		result[key] = frontendCodeObjTypeValuePolicyValue(policies[key])
	}
	return result
}

func frontendPythonCodeObjTypePoliciesFromRaw(
	raw json.RawMessage,
	policies map[string]projectstate.PythonCodeObjTypeValuePolicy,
) map[string]CodeObjTypeValuePolicy {
	fields, ok := rawJSONObjectFields(raw)
	if !ok {
		return frontendPythonCodeObjTypePolicies(policies)
	}
	result := make(map[string]CodeObjTypeValuePolicy, len(fields))
	for _, key := range orderedPolicyKeys(fields, pythonCodeObjTypeOrder) {
		result[key] = frontendCodeObjTypeValuePolicyValue(policies[key])
	}
	return result
}

func frontendPythonCodeObjOverrides(
	overrides map[string]projectstate.PythonCodeObjValueOverride,
) map[string]CodeObjValueOverride {
	result := make(map[string]CodeObjValueOverride, len(overrides))
	for _, key := range orderedMapKeys(overrides) {
		result[key] = frontendCodeObjValueOverrideValue(overrides[key])
	}
	return result
}

func frontendPythonCodeObjOverridesFromRaw(
	raw json.RawMessage,
	overrides map[string]projectstate.PythonCodeObjValueOverride,
) map[string]CodeObjValueOverride {
	fields, ok := rawJSONObjectFields(raw)
	if !ok {
		return frontendPythonCodeObjOverrides(overrides)
	}
	result := make(map[string]CodeObjValueOverride, len(fields))
	for _, key := range orderedPolicyKeys(fields, nil) {
		result[key] = frontendCodeObjValueOverrideValue(overrides[key])
	}
	return result
}

func orderedTypedPolicyList[T ~string](
	values map[string]struct{},
	reference []T,
	allowAll bool,
) []T {
	if allowAll {
		return nil
	}
	return orderedTypedSetValuesByReference(values, reference)
}

func orderedSetValues(values map[string]struct{}) []string {
	return orderedSetValuesByReference(values, nil)
}

func orderedTypedSetValuesByReference[T ~string](
	values map[string]struct{},
	reference []T,
) []T {
	if len(values) == 0 {
		return []T{}
	}
	ordered := make([]T, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, key := range reference {
		stringKey := string(key)
		if _, ok := values[stringKey]; !ok {
			continue
		}
		ordered = append(ordered, key)
		seen[stringKey] = struct{}{}
	}
	extras := make([]string, 0, len(values)-len(seen))
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		extras = append(extras, key)
	}
	sort.Strings(extras)
	for _, key := range extras {
		ordered = append(ordered, T(key))
	}
	return ordered
}

func orderedSetValuesByReference(
	values map[string]struct{},
	reference []string,
) []string {
	if len(values) == 0 {
		return []string{}
	}
	ordered := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, key := range reference {
		if _, ok := values[key]; !ok {
			continue
		}
		ordered = append(ordered, key)
		seen[key] = struct{}{}
	}
	extras := make([]string, 0, len(values)-len(seen))
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		extras = append(extras, key)
	}
	sort.Strings(extras)
	return append(ordered, extras...)
}

func rawJSONObjectFields(raw json.RawMessage) (map[string]json.RawMessage, bool) {
	if len(raw) == 0 {
		return nil, false
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		return nil, false
	}
	return fields, true
}

func decodeOrderedStringList(raw json.RawMessage, fallback []string) []string {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "null" {
		return nil
	}
	var values []string
	if err := json.Unmarshal(raw, &values); err != nil {
		return fallback
	}
	return values
}

func decodeOrderedTypedList[T ~string](raw json.RawMessage, fallback []T) []T {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "null" {
		return nil
	}
	var values []string
	if err := json.Unmarshal(raw, &values); err != nil {
		return fallback
	}
	converted := make([]T, 0, len(values))
	for _, value := range values {
		converted = append(converted, T(value))
	}
	return converted
}

func orderedPolicyKeys[T any](values map[string]T, reference []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	ordered := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, key := range reference {
		if _, ok := values[key]; !ok {
			continue
		}
		ordered = append(ordered, key)
		seen[key] = struct{}{}
	}
	extras := make([]string, 0, len(values)-len(seen))
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		extras = append(extras, key)
	}
	sort.Strings(extras)
	return append(ordered, extras...)
}

func orderedMapKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func codeFileBindingFromProjectState(binding *projectstate.CodeFileBinding) *CodeFileBinding {
	if binding == nil {
		return nil
	}
	return &CodeFileBinding{
		CanonicalPath: binding.Path,
		AccessMode:    bindingAccessMode(binding.AccessMode),
		AutoBinding:   false,
	}
}

func decodeFrontendBinding(payload map[string]any) (*CodeFileBinding, error) {
	canonicalPath := stringField(payload, "canonical_path")
	if canonicalPath == "" {
		return nil, nil
	}
	return &CodeFileBinding{
		CanonicalPath: canonicalPath,
		AccessMode:    projectstate.CodeFileAccessMode(stringField(payload, "access_mode")),
		AutoBinding:   boolField(payload, "autoBinding"),
	}, nil
}

func bindingAccessMode(mode projectstate.CodeFileAccessMode) projectstate.CodeFileAccessMode {
	if strings.TrimSpace(string(mode)) == "" {
		return projectstate.CodeFileAccessModeReadWrite
	}
	return mode
}

func rawObjectFromModifier(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	return rawObjectFromPayload(raw)
}

func rawObjectFromPayload(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, ErrFrontendObjectRequired
	}
	return object, nil
}

func mergeObjects(base map[string]any, modifier map[string]any) map[string]any {
	merged := cloneObject(base)
	for key, value := range modifier {
		baseObject, baseIsObject := merged[key].(map[string]any)
		modifierObject, modifierIsObject := value.(map[string]any)
		if baseIsObject && modifierIsObject {
			merged[key] = mergeObjects(baseObject, modifierObject)
			continue
		}
		merged[key] = cloneValue(value)
	}
	return merged
}

func cloneObject(source map[string]any) map[string]any {
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneValue(value)
	}
	return cloned
}

func cloneValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneObject(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = cloneValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func stringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	output, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(output)
}

func boolField(object map[string]any, key string) bool {
	value, ok := object[key]
	if !ok {
		return false
	}
	output, ok := value.(bool)
	return ok && output
}

func arrayStringField(object map[string]any, key string) []string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawEntries, ok := value.([]any)
	if !ok {
		return nil
	}
	output := make([]string, 0, len(rawEntries))
	for _, entry := range rawEntries {
		stringValue, ok := entry.(string)
		if ok && strings.TrimSpace(stringValue) != "" {
			output = append(output, strings.TrimSpace(stringValue))
		}
	}
	return output
}

func stringMapField(object map[string]any, key string) map[string]string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawMap, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	output := make(map[string]string, len(rawMap))
	for mapKey, rawValue := range rawMap {
		stringValue, ok := rawValue.(string)
		if ok && strings.TrimSpace(stringValue) != "" {
			output[mapKey] = strings.TrimSpace(stringValue)
		}
	}
	return output
}

func objectField(object map[string]any, key string) (map[string]any, bool) {
	value, ok := object[key]
	if !ok {
		return nil, false
	}
	rawObject, ok := value.(map[string]any)
	return rawObject, ok
}

func stringSet(values []string) map[string]struct{} {
	output := make(map[string]struct{}, len(values))
	for _, value := range values {
		output[value] = struct{}{}
	}
	return output
}

func sortedSectionIDs(sections map[string]projectstate.Section) []string {
	ids := make([]string, 0, len(sections))
	for sectionID := range sections {
		ids = append(ids, sectionID)
	}
	sort.Strings(ids)
	return ids
}

func sortedKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func stringPointer(value string) *string {
	output := value
	return &output
}

func stringPointerOrNil(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return stringPointer(trimmed)
}

func cloneStringMap(source map[string]string) map[string]string {
	if source == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func cloneStringSlice(source []string) []string {
	if len(source) == 0 {
		return []string{}
	}
	return append([]string(nil), source...)
}

func cloneStringSlicesMap(source map[string][]string) map[string][]string {
	if source == nil {
		return map[string][]string{}
	}
	cloned := make(map[string][]string, len(source))
	for key, values := range source {
		cloned[key] = cloneStringSlice(values)
	}
	return cloned
}

func cloneViewport(viewport *projectstate.Viewport) *projectstate.Viewport {
	if viewport == nil {
		return nil
	}
	cloned := *viewport
	return &cloned
}

func cloneRawJSON(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	cloned := make(json.RawMessage, len(raw))
	copy(cloned, raw)
	return cloned
}

func cloneRawJSONObject(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return mustMarshal(map[string]any{})
	}
	return cloneRawJSON(raw)
}

func mustMarshal(payload any) json.RawMessage {
	content, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return content
}
