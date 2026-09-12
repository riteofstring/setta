package aggregate

import (
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strings"
	"unicode/utf8"
)

type ParameterUIType string

const (
	ParameterUITypeCode     ParameterUIType = "CodeParam"
	ParameterUITypeText     ParameterUIType = "TextParam"
	ParameterUITypeDate     ParameterUIType = "DateParam"
	ParameterUITypeTime     ParameterUIType = "TimeParam"
	ParameterUITypeSlider   ParameterUIType = "SliderParam"
	ParameterUITypeRotary   ParameterUIType = "RotaryParam"
	ParameterUITypeSwitch   ParameterUIType = "SwitchParam"
	ParameterUITypeColor    ParameterUIType = "ColorPickerParam"
	ParameterUITypeDropdown ParameterUIType = "DropdownParam"
	ParameterUITypePassword ParameterUIType = "PasswordParam"
	ParameterUITypeTextArea ParameterUIType = "TextAreaParam"
	ParameterUITypeDropzone ParameterUIType = "DropzoneParam"
	ParameterUITypeNested   ParameterUIType = "NestedParam"
)

type TextUIConfiguration struct {
	Disabled    bool    `json:"disabled"`
	Placeholder *string `json:"placeholder"`
	SingleLine  bool    `json:"singleLine"`
	WrapLines   bool    `json:"wrapLines"`
}

type CodeUIConfiguration struct {
	Disabled    bool    `json:"disabled"`
	Language    string  `json:"language"`
	Placeholder *string `json:"placeholder"`
	SingleLine  bool    `json:"singleLine"`
	WrapLines   bool    `json:"wrapLines"`
}

type TextAreaUIConfiguration struct {
	Disabled    bool    `json:"disabled"`
	Language    *string `json:"language"`
	Placeholder *string `json:"placeholder"`
}

type SwitchUIConfiguration struct {
	Disabled bool `json:"disabled"`
}

type DropdownChoiceGroup struct {
	Group   string   `json:"group"`
	Choices []string `json:"choices"`
}

type DropdownUIConfiguration struct {
	Disabled       bool                   `json:"disabled"`
	Placeholder    *string                `json:"placeholder"`
	FlatChoices    *[]string              `json:"flatChoices"`
	GroupedChoices *[]DropdownChoiceGroup `json:"groupedChoices"`
}

type ColorChoice struct {
	Color       string `json:"color"`
	Description string `json:"description"`
}

type ColorUIConfiguration struct {
	Disabled bool           `json:"disabled"`
	Choices  *[]ColorChoice `json:"choices"`
}

type NumericUIConfiguration struct {
	Disabled bool    `json:"disabled"`
	Min      float64 `json:"min"`
	Max      float64 `json:"max"`
	Step     float64 `json:"step"`
}

type PasswordUIConfiguration struct {
	Disabled    bool    `json:"disabled"`
	Placeholder *string `json:"placeholder"`
}

type DateUIConfiguration struct {
	Disabled          bool   `json:"disabled"`
	DisplayFormat     string `json:"displayFormat"`
	ControlMode       string `json:"controlMode"`
	SelectionMode     string `json:"selectionMode"`
	WeekStart         string `json:"weekStart"`
	IncludeTime       bool   `json:"includeTime"`
	TimeDisplayFormat string `json:"timeDisplayFormat"`
}

type TimeUIConfiguration struct {
	Disabled      bool    `json:"disabled"`
	ControlMode   string  `json:"controlMode"`
	DisplayFormat string  `json:"displayFormat"`
	Transparent   bool    `json:"transparent"`
	Scale         float64 `json:"scale"`
	Font          string  `json:"font"`
}

type DropzonePolicy struct {
	MaxAttachments      *int     `json:"maxAttachments"`
	MaxFileBytes        int      `json:"maxFileBytes"`
	MaxTotalBytes       *int     `json:"maxTotalBytes"`
	AllowedMIMEPrefixes []string `json:"allowedMimePrefixes"`
}

type DropzoneUIConfiguration struct {
	Disabled    bool           `json:"disabled"`
	Placeholder string         `json:"placeholder"`
	Policy      DropzonePolicy `json:"policy"`
}

type ParameterUI struct {
	Type     ParameterUIType
	Text     *TextUIConfiguration
	Code     *CodeUIConfiguration
	TextArea *TextAreaUIConfiguration
	Switch   *SwitchUIConfiguration
	Dropdown *DropdownUIConfiguration
	Color    *ColorUIConfiguration
	Numeric  *NumericUIConfiguration
	Password *PasswordUIConfiguration
	Date     *DateUIConfiguration
	Time     *TimeUIConfiguration
	Dropzone *DropzoneUIConfiguration
}

type parameterUIBehavior struct {
	applyDefault     func(*ParameterUI)
	configuration    func(ParameterUI) any
	newConfiguration func(*ParameterUI) any
	validate         func(ParameterUI) error
}

func configuredParameterUIBehavior[Configuration any](
	set func(*ParameterUI, *Configuration),
	get func(ParameterUI) *Configuration,
	defaultConfiguration func() Configuration,
	validateConfiguration func(Configuration) error,
) parameterUIBehavior {
	return parameterUIBehavior{
		applyDefault: func(ui *ParameterUI) {
			configuration := defaultConfiguration()
			set(ui, &configuration)
		},
		configuration: func(ui ParameterUI) any {
			return get(ui)
		},
		newConfiguration: func(ui *ParameterUI) any {
			configuration := new(Configuration)
			set(ui, configuration)
			return configuration
		},
		validate: func(ui ParameterUI) error {
			return validateConfiguration(*get(ui))
		},
	}
}

func validConfiguration[Configuration any](Configuration) error {
	return nil
}

var parameterUIBehaviors = map[ParameterUIType]parameterUIBehavior{
	ParameterUITypeCode: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *CodeUIConfiguration) { ui.Code = configuration },
		func(ui ParameterUI) *CodeUIConfiguration { return ui.Code },
		func() CodeUIConfiguration {
			return CodeUIConfiguration{Language: "python", SingleLine: true, WrapLines: true}
		},
		validateCodeUI,
	),
	ParameterUITypeText: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *TextUIConfiguration) { ui.Text = configuration },
		func(ui ParameterUI) *TextUIConfiguration { return ui.Text },
		func() TextUIConfiguration {
			return TextUIConfiguration{SingleLine: true, WrapLines: true}
		},
		validateTextUI,
	),
	ParameterUITypeTextArea: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *TextAreaUIConfiguration) { ui.TextArea = configuration },
		func(ui ParameterUI) *TextAreaUIConfiguration { return ui.TextArea },
		func() TextAreaUIConfiguration { return TextAreaUIConfiguration{} },
		validateTextAreaUI,
	),
	ParameterUITypeSwitch: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *SwitchUIConfiguration) { ui.Switch = configuration },
		func(ui ParameterUI) *SwitchUIConfiguration { return ui.Switch },
		func() SwitchUIConfiguration { return SwitchUIConfiguration{} },
		validConfiguration[SwitchUIConfiguration],
	),
	ParameterUITypeDropdown: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *DropdownUIConfiguration) { ui.Dropdown = configuration },
		func(ui ParameterUI) *DropdownUIConfiguration { return ui.Dropdown },
		func() DropdownUIConfiguration {
			choices := []string{}
			return DropdownUIConfiguration{FlatChoices: &choices}
		},
		validateDropdownUI,
	),
	ParameterUITypeColor: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *ColorUIConfiguration) { ui.Color = configuration },
		func(ui ParameterUI) *ColorUIConfiguration { return ui.Color },
		func() ColorUIConfiguration {
			choices := []ColorChoice{}
			return ColorUIConfiguration{Choices: &choices}
		},
		validateColorUI,
	),
	ParameterUITypeSlider: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *NumericUIConfiguration) { ui.Numeric = configuration },
		func(ui ParameterUI) *NumericUIConfiguration { return ui.Numeric },
		func() NumericUIConfiguration {
			return NumericUIConfiguration{Min: 0, Max: 100, Step: 1}
		},
		validateNumericUI,
	),
	ParameterUITypeRotary: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *NumericUIConfiguration) { ui.Numeric = configuration },
		func(ui ParameterUI) *NumericUIConfiguration { return ui.Numeric },
		func() NumericUIConfiguration {
			return NumericUIConfiguration{Min: 0, Max: 1, Step: 0.1}
		},
		validateNumericUI,
	),
	ParameterUITypePassword: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *PasswordUIConfiguration) { ui.Password = configuration },
		func(ui ParameterUI) *PasswordUIConfiguration { return ui.Password },
		func() PasswordUIConfiguration { return PasswordUIConfiguration{} },
		func(configuration PasswordUIConfiguration) error {
			return validateOptionalUIString("password placeholder", configuration.Placeholder)
		},
	),
	ParameterUITypeDate: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *DateUIConfiguration) { ui.Date = configuration },
		func(ui ParameterUI) *DateUIConfiguration { return ui.Date },
		func() DateUIConfiguration {
			return DateUIConfiguration{
				DisplayFormat:     "iso",
				ControlMode:       "input",
				SelectionMode:     "single",
				WeekStart:         "sunday",
				TimeDisplayFormat: "twenty_four_hour",
			}
		},
		validateDateUI,
	),
	ParameterUITypeTime: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *TimeUIConfiguration) { ui.Time = configuration },
		func(ui ParameterUI) *TimeUIConfiguration { return ui.Time },
		func() TimeUIConfiguration {
			return TimeUIConfiguration{
				ControlMode:   "display",
				DisplayFormat: "twenty_four_hour",
				Scale:         1,
				Font:          "monospace",
			}
		},
		validateTimeUI,
	),
	ParameterUITypeDropzone: configuredParameterUIBehavior(
		func(ui *ParameterUI, configuration *DropzoneUIConfiguration) { ui.Dropzone = configuration },
		func(ui ParameterUI) *DropzoneUIConfiguration { return ui.Dropzone },
		func() DropzoneUIConfiguration {
			return DropzoneUIConfiguration{
				Placeholder: "Drop files here",
				Policy: DropzonePolicy{
					MaxFileBytes:        26_214_400,
					AllowedMIMEPrefixes: []string{},
				},
			}
		},
		validateDropzoneUI,
	),
	ParameterUITypeNested: {
		applyDefault:     func(*ParameterUI) {},
		configuration:    func(ParameterUI) any { return struct{}{} },
		newConfiguration: func(*ParameterUI) any { return new(struct{}) },
		validate:         func(ParameterUI) error { return nil },
	},
}

func DefaultParameterUI(uiType ParameterUIType) ParameterUI {
	behavior, exists := parameterUIBehaviors[uiType]
	if !exists {
		return ParameterUI{}
	}
	ui := ParameterUI{Type: uiType}
	behavior.applyDefault(&ui)
	return ui
}

func NewEmptyParameterUI(uiType ParameterUIType) (ParameterUI, any) {
	behavior, exists := parameterUIBehaviors[uiType]
	if !exists {
		return ParameterUI{}, nil
	}
	ui := ParameterUI{Type: uiType}
	destination := behavior.newConfiguration(&ui)
	return ui, destination
}

func (ui ParameterUI) Configuration() (any, error) {
	if err := ui.Validate(); err != nil {
		return nil, err
	}
	return parameterUIBehaviors[ui.Type].configuration(ui), nil
}

func (ui ParameterUI) Clone() ParameterUI {
	clone := ui
	cloneTextParameterUIConfigurations(ui, &clone)
	cloneChoiceParameterUIConfigurations(ui, &clone)
	cloneScalarParameterUIConfigurations(ui, &clone)
	cloneDropzoneParameterUIConfiguration(ui, &clone)
	return clone
}

func cloneTextParameterUIConfigurations(ui ParameterUI, clone *ParameterUI) {
	if ui.Text != nil {
		value := *ui.Text
		value.Placeholder = cloneString(value.Placeholder)
		clone.Text = &value
	}
	if ui.Code != nil {
		value := *ui.Code
		value.Placeholder = cloneString(value.Placeholder)
		clone.Code = &value
	}
	if ui.TextArea != nil {
		value := *ui.TextArea
		value.Language = cloneString(value.Language)
		value.Placeholder = cloneString(value.Placeholder)
		clone.TextArea = &value
	}
	if ui.Password != nil {
		value := *ui.Password
		value.Placeholder = cloneString(value.Placeholder)
		clone.Password = &value
	}
}

func cloneChoiceParameterUIConfigurations(ui ParameterUI, clone *ParameterUI) {
	if ui.Dropdown != nil {
		value := *ui.Dropdown
		value.Placeholder = cloneString(value.Placeholder)
		value.FlatChoices = cloneStringSlicePointer(value.FlatChoices)
		value.GroupedChoices = cloneDropdownChoiceGroups(value.GroupedChoices)
		clone.Dropdown = &value
	}
	if ui.Color != nil {
		value := *ui.Color
		value.Choices = cloneColorChoices(value.Choices)
		clone.Color = &value
	}
}

func cloneScalarParameterUIConfigurations(ui ParameterUI, clone *ParameterUI) {
	if ui.Switch != nil {
		value := *ui.Switch
		clone.Switch = &value
	}
	if ui.Numeric != nil {
		value := *ui.Numeric
		clone.Numeric = &value
	}
	if ui.Date != nil {
		value := *ui.Date
		clone.Date = &value
	}
	if ui.Time != nil {
		value := *ui.Time
		clone.Time = &value
	}
}

func cloneDropzoneParameterUIConfiguration(ui ParameterUI, clone *ParameterUI) {
	if ui.Dropzone == nil {
		return
	}
	value := *ui.Dropzone
	value.Policy.MaxAttachments = cloneInt(value.Policy.MaxAttachments)
	value.Policy.MaxTotalBytes = cloneInt(value.Policy.MaxTotalBytes)
	value.Policy.AllowedMIMEPrefixes = cloneStrings(value.Policy.AllowedMIMEPrefixes)
	clone.Dropzone = &value
}

func (ui ParameterUI) Validate() error {
	if !ui.hasOnlyExpectedConfiguration() {
		return validationError("parameter UI %q has an incoherent configuration union", ui.Type)
	}
	behavior, exists := parameterUIBehaviors[ui.Type]
	if !exists {
		return validationError("parameter UI type %q is unsupported", ui.Type)
	}
	return behavior.validate(ui)
}

func (ui ParameterUI) hasOnlyExpectedConfiguration() bool {
	present := map[ParameterUIType]bool{
		ParameterUITypeText:     ui.Text != nil,
		ParameterUITypeCode:     ui.Code != nil,
		ParameterUITypeTextArea: ui.TextArea != nil,
		ParameterUITypeSwitch:   ui.Switch != nil,
		ParameterUITypeDropdown: ui.Dropdown != nil,
		ParameterUITypeColor:    ui.Color != nil,
		ParameterUITypeSlider:   ui.Numeric != nil,
		ParameterUITypeRotary:   ui.Numeric != nil,
		ParameterUITypePassword: ui.Password != nil,
		ParameterUITypeDate:     ui.Date != nil,
		ParameterUITypeTime:     ui.Time != nil,
		ParameterUITypeDropzone: ui.Dropzone != nil,
	}
	count := 0
	for _, value := range []bool{ui.Text != nil, ui.Code != nil, ui.TextArea != nil, ui.Switch != nil, ui.Dropdown != nil, ui.Color != nil, ui.Numeric != nil, ui.Password != nil, ui.Date != nil, ui.Time != nil, ui.Dropzone != nil} {
		if value {
			count++
		}
	}
	if ui.Type == ParameterUITypeNested {
		return count == 0
	}
	return count == 1 && present[ui.Type]
}

func SameParameterUI(left ParameterUI, right ParameterUI) bool {
	return reflect.DeepEqual(left, right)
}

func cloneParameterUIOverrides(values map[string]ParameterUI) map[string]ParameterUI {
	if values == nil {
		return nil
	}
	clone := make(map[string]ParameterUI, len(values))
	for targetID, ui := range values {
		clone[targetID] = ui.Clone()
	}
	return clone
}

func validateParameterUIOverrides(state State) error {
	configurableTargets := make(map[string]struct{})
	for _, callable := range state.Callables {
		for _, parameter := range callable.Parameters {
			configurableTargets[parameter.ID] = struct{}{}
		}
	}
	for _, dictionary := range state.ParameterDictionaries {
		collectConfigurableDictionaryEntryIDs(dictionary.Entries, configurableTargets)
	}
	for targetID, ui := range state.ParameterUIOverrides {
		if _, exists := configurableTargets[targetID]; !exists {
			return validationError("parameter UI override target %q is not a callable parameter or dictionary leaf", targetID)
		}
		if err := ui.Validate(); err != nil {
			return fmt.Errorf("parameter UI override %q: %w", targetID, err)
		}
		if ui.Type == ParameterUITypeNested {
			return validationError("parameter UI override %q cannot use NestedParam", targetID)
		}
		if SameParameterUI(ui, DefaultParameterUI(ParameterUITypeCode)) {
			return validationError("parameter UI override %q redundantly stores the default CodeParam", targetID)
		}
	}
	return nil
}

func collectConfigurableDictionaryEntryIDs(entries []DictionaryEntry, targetIDs map[string]struct{}) {
	for _, entry := range entries {
		if entry.Leaf != nil {
			targetIDs[entry.ID] = struct{}{}
		}
		if entry.Parent != nil {
			collectConfigurableDictionaryEntryIDs(entry.Parent.Children, targetIDs)
		}
	}
}

func (state State) ResolveParameterUI(targetID string) ParameterUI {
	if override, exists := state.ParameterUIOverrides[targetID]; exists {
		return override.Clone()
	}
	return DefaultParameterUI(ParameterUITypeCode)
}

func (state *State) retainParameterUIOverrides() {
	configurableTargets := make(map[string]struct{})
	for _, callable := range state.Callables {
		for _, parameter := range callable.Parameters {
			configurableTargets[parameter.ID] = struct{}{}
		}
	}
	for _, dictionary := range state.ParameterDictionaries {
		collectConfigurableDictionaryEntryIDs(dictionary.Entries, configurableTargets)
	}
	for targetID := range state.ParameterUIOverrides {
		if _, exists := configurableTargets[targetID]; !exists {
			delete(state.ParameterUIOverrides, targetID)
		}
	}
}

func sameProposedParameterUIs(state State, proposals []ParameterProposal) bool {
	for _, proposal := range proposals {
		if !SameParameterUI(state.ResolveParameterUI(proposal.ID), proposedParameterUI(proposal)) {
			return false
		}
	}
	return true
}

func replaceProposedParameterUIs(state *State, previous []Parameter, proposals []ParameterProposal) {
	for _, parameter := range previous {
		delete(state.ParameterUIOverrides, parameter.ID)
	}
	for _, proposal := range proposals {
		ui := proposedParameterUI(proposal)
		if !SameParameterUI(ui, DefaultParameterUI(ParameterUITypeCode)) {
			ensureParameterUIOverrides(state)
			state.ParameterUIOverrides[proposal.ID] = ui.Clone()
		}
	}
}

func proposedParameterUI(proposal ParameterProposal) ParameterUI {
	if proposal.UI == nil {
		return DefaultParameterUI(ParameterUITypeCode)
	}
	return proposal.UI.Clone()
}

func preserveRefreshedParameterUIs(state *State, previous []Parameter, next []Parameter) {
	byName := make(map[string]ParameterUI, len(previous))
	for _, parameter := range previous {
		if override, exists := state.ParameterUIOverrides[parameter.ID]; exists {
			byName[parameter.Name] = override.Clone()
		}
		delete(state.ParameterUIOverrides, parameter.ID)
	}
	for _, parameter := range next {
		if ui, exists := byName[parameter.Name]; exists {
			ensureParameterUIOverrides(state)
			state.ParameterUIOverrides[parameter.ID] = ui
		}
	}
}

func sameDictionaryEntryUIs(state State, entries []DictionaryEntry, overrides map[string]ParameterUI) bool {
	leafIDs := make(map[string]struct{})
	collectConfigurableDictionaryEntryIDs(entries, leafIDs)
	for leafID := range leafIDs {
		expected := DefaultParameterUI(ParameterUITypeCode)
		if override, exists := overrides[leafID]; exists {
			expected = override
		}
		if !SameParameterUI(state.ResolveParameterUI(leafID), expected) {
			return false
		}
	}
	return true
}

func replaceDictionaryEntryUIs(state *State, previous []DictionaryEntry, next []DictionaryEntry, overrides map[string]ParameterUI) {
	previousLeafIDs := make(map[string]struct{})
	collectConfigurableDictionaryEntryIDs(previous, previousLeafIDs)
	for leafID := range previousLeafIDs {
		delete(state.ParameterUIOverrides, leafID)
	}
	nextLeafIDs := make(map[string]struct{})
	collectConfigurableDictionaryEntryIDs(next, nextLeafIDs)
	for leafID, ui := range overrides {
		if _, exists := nextLeafIDs[leafID]; exists && !SameParameterUI(ui, DefaultParameterUI(ParameterUITypeCode)) {
			ensureParameterUIOverrides(state)
			state.ParameterUIOverrides[leafID] = ui.Clone()
		}
	}
}

func ensureParameterUIOverrides(state *State) {
	if state.ParameterUIOverrides == nil {
		state.ParameterUIOverrides = make(map[string]ParameterUI)
	}
}

func validateCodeUI(config CodeUIConfiguration) error {
	if !isSupportedUILanguage(config.Language) {
		return validationError("code UI language %q is unsupported", config.Language)
	}
	return validateOptionalUIString("code placeholder", config.Placeholder)
}

func validateTextUI(config TextUIConfiguration) error {
	return validateOptionalUIString("text placeholder", config.Placeholder)
}

func validateTextAreaUI(config TextAreaUIConfiguration) error {
	if config.Language != nil && !isSupportedUILanguage(*config.Language) {
		return validationError("text area UI language %q is unsupported", *config.Language)
	}
	return validateOptionalUIString("text area placeholder", config.Placeholder)
}

func isSupportedUILanguage(value string) bool {
	switch value {
	case "python", "typescript", "javascript", "json", "yaml", "toml", "markdown":
		return true
	default:
		return false
	}
}

func validateOptionalUIString(label string, value *string) error {
	if value == nil {
		return nil
	}
	return validateUIString(label, *value, true)
}

func validateUIString(label string, value string, allowEmpty bool) error {
	if (!allowEmpty && strings.TrimSpace(value) == "") || len(value) > maxAuthoredExpressionBytes || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return validationError("%s is invalid", label)
	}
	return nil
}

func validateDropdownUI(config DropdownUIConfiguration) error {
	if (config.FlatChoices == nil) == (config.GroupedChoices == nil) {
		return validationError("dropdown UI must contain exactly one choice-set variant")
	}
	if err := validateOptionalUIString("dropdown placeholder", config.Placeholder); err != nil {
		return err
	}
	if config.FlatChoices != nil {
		return validateUIChoices("dropdown choice", *config.FlatChoices)
	}
	for index, group := range *config.GroupedChoices {
		if err := validateUIString(fmt.Sprintf("dropdown group %d", index), group.Group, false); err != nil {
			return err
		}
		if err := validateUIChoices(fmt.Sprintf("dropdown group %d choice", index), group.Choices); err != nil {
			return err
		}
	}
	return nil
}

func validateUIChoices(label string, choices []string) error {
	seen := map[string]struct{}{}
	for index, choice := range choices {
		if err := validateUIString(fmt.Sprintf("%s %d", label, index), choice, false); err != nil {
			return err
		}
		if _, exists := seen[choice]; exists {
			return validationError("%s %d repeats %q", label, index, choice)
		}
		seen[choice] = struct{}{}
	}
	return nil
}

var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func validateColorUI(config ColorUIConfiguration) error {
	if config.Choices == nil {
		return nil
	}
	for index, choice := range *config.Choices {
		if !colorPattern.MatchString(choice.Color) {
			return validationError("color UI choice %d has invalid color %q", index, choice.Color)
		}
		if err := validateUIString(fmt.Sprintf("color UI choice %d description", index), choice.Description, true); err != nil {
			return err
		}
	}
	return nil
}

func validateNumericUI(config NumericUIConfiguration) error {
	if !finite(config.Min) || !finite(config.Max) || !finite(config.Step) {
		return validationError("numeric UI bounds must be finite")
	}
	if config.Min >= config.Max {
		return validationError("numeric UI min must be less than max")
	}
	if config.Step <= 0 || config.Step > config.Max-config.Min {
		return validationError("numeric UI step must be positive and no larger than max minus min")
	}
	return nil
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func validateDateUI(config DateUIConfiguration) error {
	if !oneOf(config.DisplayFormat, "iso", "us", "eu", "long") ||
		!oneOf(config.ControlMode, "input", "calendar") ||
		!oneOf(config.SelectionMode, "single", "multiple") ||
		!oneOf(config.WeekStart, "sunday", "monday") ||
		!oneOf(config.TimeDisplayFormat, "twenty_four_hour", "twelve_hour") {
		return validationError("date UI configuration contains an unsupported option")
	}
	return nil
}

func validateTimeUI(config TimeUIConfiguration) error {
	if !oneOf(config.ControlMode, "input", "display") ||
		!oneOf(config.DisplayFormat, "twenty_four_hour", "twelve_hour") ||
		!oneOf(config.Font, "clock", "monospace", "system") {
		return validationError("time UI configuration contains an unsupported option")
	}
	if !finite(config.Scale) || config.Scale < 0.5 || config.Scale > 3 {
		return validationError("time UI scale must be between 0.5 and 3")
	}
	return nil
}

func validateDropzoneUI(config DropzoneUIConfiguration) error {
	if err := validateUIString("dropzone placeholder", config.Placeholder, true); err != nil {
		return err
	}
	if config.Policy.MaxFileBytes <= 0 ||
		(config.Policy.MaxAttachments != nil && *config.Policy.MaxAttachments <= 0) ||
		(config.Policy.MaxTotalBytes != nil && *config.Policy.MaxTotalBytes <= 0) {
		return validationError("dropzone UI limits must be positive")
	}
	for index, prefix := range config.Policy.AllowedMIMEPrefixes {
		if err := validateUIString(fmt.Sprintf("dropzone MIME prefix %d", index), prefix, false); err != nil {
			return err
		}
	}
	return nil
}

func oneOf(value string, choices ...string) bool {
	for _, choice := range choices {
		if value == choice {
			return true
		}
	}
	return false
}

func cloneStringSlicePointer(value *[]string) *[]string {
	if value == nil {
		return nil
	}
	clone := cloneStrings(*value)
	return &clone
}

func cloneDropdownChoiceGroups(value *[]DropdownChoiceGroup) *[]DropdownChoiceGroup {
	if value == nil {
		return nil
	}
	clone := make([]DropdownChoiceGroup, len(*value))
	for index, group := range *value {
		clone[index] = DropdownChoiceGroup{Group: group.Group, Choices: cloneStrings(group.Choices)}
	}
	return &clone
}

func cloneColorChoices(value *[]ColorChoice) *[]ColorChoice {
	if value == nil {
		return nil
	}
	clone := append([]ColorChoice(nil), (*value)...)
	return &clone
}
