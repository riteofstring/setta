package appearance

import (
	"fmt"
	"math"
	"strings"
	"unicode"
)

const SchemaVersion = 3

const (
	accessibleBlack               = "oklch(0.0000 0.0000 0.00)"
	accessibleWhite               = "oklch(1.0000 0.0000 0.00)"
	defaultOverviewCardMaxWidthPx = 460
	defaultOverviewCardMinWidthPx = 280
	maximumOverviewCardWidthPx    = 900
	minimumOverviewCardWidthPx    = 180
	wcagAANormalTextContrast      = 4.5
)

type AppearanceColorMode string
type AppearancePresetID string

const (
	ColorModeDark  AppearanceColorMode = "dark"
	ColorModeLight AppearanceColorMode = "light"
)

var colorModeValues = []AppearanceColorMode{ColorModeDark, ColorModeLight}

const (
	PresetSettaStandard   AppearancePresetID = "setta_standard"
	PresetTailwindSlate   AppearancePresetID = "tailwind_slate"
	PresetTailwindGray    AppearancePresetID = "tailwind_gray"
	PresetTailwindZinc    AppearancePresetID = "tailwind_zinc"
	PresetTailwindNeutral AppearancePresetID = "tailwind_neutral"
	PresetTailwindStone   AppearancePresetID = "tailwind_stone"
	PresetTailwindRed     AppearancePresetID = "tailwind_red"
	PresetTailwindOrange  AppearancePresetID = "tailwind_orange"
	PresetTailwindAmber   AppearancePresetID = "tailwind_amber"
	PresetTailwindYellow  AppearancePresetID = "tailwind_yellow"
	PresetTailwindLime    AppearancePresetID = "tailwind_lime"
	PresetTailwindGreen   AppearancePresetID = "tailwind_green"
	PresetTailwindEmerald AppearancePresetID = "tailwind_emerald"
	PresetTailwindTeal    AppearancePresetID = "tailwind_teal"
	PresetTailwindCyan    AppearancePresetID = "tailwind_cyan"
	PresetTailwindSky     AppearancePresetID = "tailwind_sky"
	PresetTailwindBlue    AppearancePresetID = "tailwind_blue"
	PresetTailwindIndigo  AppearancePresetID = "tailwind_indigo"
	PresetTailwindViolet  AppearancePresetID = "tailwind_violet"
	PresetTailwindPurple  AppearancePresetID = "tailwind_purple"
	PresetTailwindFuchsia AppearancePresetID = "tailwind_fuchsia"
	PresetTailwindPink    AppearancePresetID = "tailwind_pink"
	PresetTailwindRose    AppearancePresetID = "tailwind_rose"
	PresetShadcnMauve     AppearancePresetID = "shadcn_mauve"
	PresetShadcnOlive     AppearancePresetID = "shadcn_olive"
	PresetShadcnMist      AppearancePresetID = "shadcn_mist"
	PresetShadcnTaupe     AppearancePresetID = "shadcn_taupe"
)

// settaLogoCyan is the OKLCH conversion of the #4CE2FF fill in the Setta logo.
const settaLogoCyan = "oklch(0.8460 0.1292 213.38)"

var presetIDValues = defaultPresetIDValues()

type AppearanceSettings struct {
	SchemaVersion int                         `json:"schemaVersion"`
	Mode          AppearanceColorMode         `json:"mode"`
	Light         AppearanceColorScheme       `json:"light"`
	Dark          AppearanceColorScheme       `json:"dark"`
	Fonts         AppearanceFontScheme        `json:"fonts"`
	Developer     AppearanceDeveloperSettings `json:"developer"`
	Shortcuts     AppearanceShortcutsSettings `json:"shortcuts"`
}

type AppearanceColorScheme struct {
	Tailwind AppearanceTailwindPalette `json:"tailwind"`
	Shadcn   AppearanceShadcnPalette   `json:"shadcn"`
	Status   AppearanceStatusPalette   `json:"status"`
	Accent   AppearanceAccentPalette   `json:"accent"`
}

type AppearanceTailwindPalette struct {
	Setta50  string `json:"setta50"`
	Setta100 string `json:"setta100"`
	Setta150 string `json:"setta150"`
	Setta200 string `json:"setta200"`
	Setta300 string `json:"setta300"`
	Setta400 string `json:"setta400"`
	Setta500 string `json:"setta500"`
	Setta600 string `json:"setta600"`
	Setta700 string `json:"setta700"`
	Setta750 string `json:"setta750"`
	Setta800 string `json:"setta800"`
	Setta850 string `json:"setta850"`
	Setta860 string `json:"setta860"`
	Setta875 string `json:"setta875"`
	Setta900 string `json:"setta900"`
	Setta925 string `json:"setta925"`
	Setta950 string `json:"setta950"`
	Setta975 string `json:"setta975"`
}

type AppearanceShadcnPalette struct {
	Background              string `json:"background"`
	Foreground              string `json:"foreground"`
	Card                    string `json:"card"`
	CardForeground          string `json:"cardForeground"`
	Popover                 string `json:"popover"`
	PopoverForeground       string `json:"popoverForeground"`
	Primary                 string `json:"primary"`
	PrimaryForeground       string `json:"primaryForeground"`
	Secondary               string `json:"secondary"`
	SecondaryForeground     string `json:"secondaryForeground"`
	Muted                   string `json:"muted"`
	MutedForeground         string `json:"mutedForeground"`
	Accent                  string `json:"accent"`
	AccentForeground        string `json:"accentForeground"`
	Destructive             string `json:"destructive"`
	DestructiveForeground   string `json:"destructiveForeground"`
	Border                  string `json:"border"`
	Input                   string `json:"input"`
	Ring                    string `json:"ring"`
	Sidebar                 string `json:"sidebar"`
	SidebarForeground       string `json:"sidebarForeground"`
	SidebarAccent           string `json:"sidebarAccent"`
	SidebarAccentForeground string `json:"sidebarAccentForeground"`
}

type AppearanceStatusPalette struct {
	Info               string `json:"info"`
	InfoForeground     string `json:"infoForeground"`
	Success            string `json:"success"`
	SuccessForeground  string `json:"successForeground"`
	Warning            string `json:"warning"`
	WarningForeground  string `json:"warningForeground"`
	Alert              string `json:"alert"`
	AlertForeground    string `json:"alertForeground"`
	Critical           string `json:"critical"`
	CriticalForeground string `json:"criticalForeground"`
}

type AppearanceFontScheme struct {
	Sans    string `json:"sans"`
	Mono    string `json:"mono"`
	Heading string `json:"heading"`
}

type AppearancePreset struct {
	ID          AppearancePresetID `json:"id"`
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Settings    AppearanceSettings `json:"settings"`
}

type AppearancePresetList struct {
	DefaultPresetID AppearancePresetID `json:"defaultPresetId"`
	Presets         []AppearancePreset `json:"presets"`
}

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "AppearanceColorMode", Values: stringValues(colorModeValues)},
		{Name: "AppearancePresetID", Values: stringValues(presetIDValues)},
		{Name: "AppearanceWorkspaceNavigationShortcut", Values: stringValues(workspaceNavigationShortcutValues)},
	}
}

func DefaultSettings() AppearanceSettings {
	tailwind := defaultSettaTailwindPalette()
	return AppearanceSettings{
		SchemaVersion: SchemaVersion,
		Mode:          ColorModeDark,
		Light:         defaultSettaLightColorScheme(tailwind),
		Dark:          defaultSettaDarkColorScheme(tailwind),
		Fonts: AppearanceFontScheme{
			Sans:    `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
			Mono:    `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`,
			Heading: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
		},
		Developer: AppearanceDeveloperSettings{
			AllowResizedPanesToOverflowViewport: false,
			OverviewCardMaxWidthPx:              defaultOverviewCardMaxWidthPx,
			OverviewCardMinWidthPx:              defaultOverviewCardMinWidthPx,
			ShowPerformanceStats:                false,
		},
		Shortcuts: AppearanceShortcutsSettings{
			WorkspaceNavigation: WorkspaceNavigationModAltArrows,
		},
	}
}

func DefaultPresetList() AppearancePresetList {
	presets := []AppearancePreset{
		{
			ID:          PresetSettaStandard,
			Name:        "Setta Standard",
			Description: "The default Setta palette tuned for the app chrome and transcript surfaces.",
			Settings:    DefaultSettings(),
		},
	}
	for _, preset := range tailwindPalettePresets {
		presets = append(presets, appearancePreset(preset))
	}
	for _, preset := range shadcnPalettePresets {
		presets = append(presets, appearancePreset(preset))
	}
	return AppearancePresetList{
		DefaultPresetID: PresetSettaStandard,
		Presets:         presets,
	}
}

func appearancePreset(preset palettePreset) AppearancePreset {
	tailwind := tailwindPaletteFromScale(preset.scale)
	settings := DefaultSettings()
	settings.Light = defaultLightColorScheme(tailwind)
	settings.Dark = defaultDarkColorScheme(tailwind)
	return AppearancePreset{
		ID:          preset.id,
		Name:        preset.source + " " + preset.color,
		Description: preset.source + " " + strings.ToLower(preset.color) + " translated into Setta palette tokens.",
		Settings:    settings,
	}
}

func defaultPresetIDValues() []AppearancePresetID {
	values := []AppearancePresetID{PresetSettaStandard}
	for _, preset := range tailwindPalettePresets {
		values = append(values, preset.id)
	}
	for _, preset := range shadcnPalettePresets {
		values = append(values, preset.id)
	}
	return values
}

func Validate(settings AppearanceSettings) error {
	if settings.SchemaVersion != SchemaVersion {
		return fmt.Errorf("appearance schemaVersion = %d, want %d", settings.SchemaVersion, SchemaVersion)
	}
	if settings.Mode != ColorModeDark && settings.Mode != ColorModeLight {
		return fmt.Errorf("appearance mode is unsupported: %s", settings.Mode)
	}
	if err := validateColorScheme("light", settings.Light); err != nil {
		return err
	}
	if err := validateColorScheme("dark", settings.Dark); err != nil {
		return err
	}
	if err := validateFontScheme(settings.Fonts); err != nil {
		return err
	}
	if err := validateDeveloperSettings(settings.Developer); err != nil {
		return err
	}
	return validateShortcutsSettings(settings.Shortcuts)
}

func Normalize(settings AppearanceSettings) AppearanceSettings {
	if settings.Developer.OverviewCardMinWidthPx == 0 {
		settings.Developer.OverviewCardMinWidthPx = defaultOverviewCardMinWidthPx
	}
	if settings.Developer.OverviewCardMaxWidthPx == 0 {
		settings.Developer.OverviewCardMaxWidthPx = defaultOverviewCardMaxWidthPx
	}
	if settings.Shortcuts.WorkspaceNavigation == "" {
		settings.Shortcuts.WorkspaceNavigation = WorkspaceNavigationModAltArrows
	}
	return settings
}

func validateColorScheme(label string, scheme AppearanceColorScheme) error {
	if err := validateTailwindPalette(label+".tailwind", scheme.Tailwind); err != nil {
		return err
	}
	if err := validateShadcnPalette(label+".shadcn", scheme.Shadcn); err != nil {
		return err
	}
	if err := validateStatusPalette(label+".status", scheme.Status); err != nil {
		return err
	}
	if err := validateAccentPalette(label+".accent", scheme.Accent); err != nil {
		return err
	}
	return validateColorContrast(label, scheme)
}

func validateTailwindPalette(label string, palette AppearanceTailwindPalette) error {
	values := []namedValue{
		{"setta50", palette.Setta50},
		{"setta100", palette.Setta100},
		{"setta150", palette.Setta150},
		{"setta200", palette.Setta200},
		{"setta300", palette.Setta300},
		{"setta400", palette.Setta400},
		{"setta500", palette.Setta500},
		{"setta600", palette.Setta600},
		{"setta700", palette.Setta700},
		{"setta750", palette.Setta750},
		{"setta800", palette.Setta800},
		{"setta850", palette.Setta850},
		{"setta860", palette.Setta860},
		{"setta875", palette.Setta875},
		{"setta900", palette.Setta900},
		{"setta925", palette.Setta925},
		{"setta950", palette.Setta950},
		{"setta975", palette.Setta975},
	}
	return validateOKLCHFields(label, values)
}

func validateShadcnPalette(label string, palette AppearanceShadcnPalette) error {
	values := []namedValue{
		{"background", palette.Background},
		{"foreground", palette.Foreground},
		{"card", palette.Card},
		{"cardForeground", palette.CardForeground},
		{"popover", palette.Popover},
		{"popoverForeground", palette.PopoverForeground},
		{"primary", palette.Primary},
		{"primaryForeground", palette.PrimaryForeground},
		{"secondary", palette.Secondary},
		{"secondaryForeground", palette.SecondaryForeground},
		{"muted", palette.Muted},
		{"mutedForeground", palette.MutedForeground},
		{"accent", palette.Accent},
		{"accentForeground", palette.AccentForeground},
		{"destructive", palette.Destructive},
		{"destructiveForeground", palette.DestructiveForeground},
		{"border", palette.Border},
		{"input", palette.Input},
		{"ring", palette.Ring},
		{"sidebar", palette.Sidebar},
		{"sidebarForeground", palette.SidebarForeground},
		{"sidebarAccent", palette.SidebarAccent},
		{"sidebarAccentForeground", palette.SidebarAccentForeground},
	}
	return validateOKLCHFields(label, values)
}

func validateStatusPalette(label string, palette AppearanceStatusPalette) error {
	values := []namedValue{
		{"info", palette.Info},
		{"infoForeground", palette.InfoForeground},
		{"success", palette.Success},
		{"successForeground", palette.SuccessForeground},
		{"warning", palette.Warning},
		{"warningForeground", palette.WarningForeground},
		{"alert", palette.Alert},
		{"alertForeground", palette.AlertForeground},
		{"critical", palette.Critical},
		{"criticalForeground", palette.CriticalForeground},
	}
	return validateOKLCHFields(label, values)
}

type namedValue struct {
	name  string
	value string
}

func validateOKLCHFields(label string, values []namedValue) error {
	for _, value := range values {
		if err := validateOKLCH(label+"."+value.name, value.value); err != nil {
			return err
		}
	}
	return nil
}

func validateFontScheme(fonts AppearanceFontScheme) error {
	if err := validateFontFamily("fonts.sans", fonts.Sans); err != nil {
		return err
	}
	if err := validateFontFamily("fonts.mono", fonts.Mono); err != nil {
		return err
	}
	return validateFontFamily("fonts.heading", fonts.Heading)
}

func validateFontFamily(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if len(value) > 240 {
		return fmt.Errorf("%s is too long", label)
	}
	for _, char := range value {
		if unicode.IsControl(char) || char == ';' || char == '{' || char == '}' {
			return fmt.Errorf("%s contains unsupported CSS syntax", label)
		}
	}
	return nil
}

func defaultSettaTailwindPalette() AppearanceTailwindPalette {
	return AppearanceTailwindPalette{
		Setta50:  "oklch(0.9574 0.0071 267.38)",
		Setta100: "oklch(0.9085 0.0130 263.02)",
		Setta150: "oklch(0.8575 0.0208 262.99)",
		Setta200: "oklch(0.8057 0.0292 262.95)",
		Setta300: "oklch(0.7167 0.0439 264.25)",
		Setta400: "oklch(0.6255 0.0618 263.97)",
		Setta500: "oklch(0.5216 0.0651 263.76)",
		Setta600: "oklch(0.4311 0.0508 262.49)",
		Setta700: "oklch(0.3324 0.0381 262.51)",
		Setta750: "oklch(0.2903 0.0317 262.55)",
		Setta800: "oklch(0.2458 0.0254 263.94)",
		Setta850: "oklch(0.2162 0.0198 264.03)",
		Setta860: "oklch(0.1903 0.0158 264.09)",
		Setta875: "oklch(0.1797 0.0141 264.13)",
		Setta900: "oklch(0.1631 0.0125 264.14)",
		Setta925: "oklch(0.1471 0.0086 263.76)",
		Setta950: "oklch(0.1281 0.0070 261.32)",
		Setta975: "oklch(0.0697 0.0051 260.18)",
	}
}

type tailwindScale struct {
	s50  oklchColor
	s100 oklchColor
	s200 oklchColor
	s300 oklchColor
	s400 oklchColor
	s500 oklchColor
	s600 oklchColor
	s700 oklchColor
	s800 oklchColor
	s900 oklchColor
	s950 oklchColor
}

func tailwindPaletteFromScale(scale tailwindScale) AppearanceTailwindPalette {
	ramp := defaultSettaTailwindPalette()
	return AppearanceTailwindPalette{
		Setta50:  translateScaleColor(scale.s50, ramp.Setta50),
		Setta100: translateScaleColor(scale.s100, ramp.Setta100),
		Setta150: translateScaleColor(mixOKLCH(scale.s100, scale.s200, 0.5), ramp.Setta150),
		Setta200: translateScaleColor(scale.s200, ramp.Setta200),
		Setta300: translateScaleColor(scale.s300, ramp.Setta300),
		Setta400: translateScaleColor(scale.s400, ramp.Setta400),
		Setta500: translateScaleColor(scale.s500, ramp.Setta500),
		Setta600: translateScaleColor(scale.s600, ramp.Setta600),
		Setta700: translateScaleColor(scale.s700, ramp.Setta700),
		Setta750: translateScaleColor(mixOKLCH(scale.s700, scale.s800, 0.5), ramp.Setta750),
		Setta800: translateScaleColor(scale.s800, ramp.Setta800),
		Setta850: translateScaleColor(mixOKLCH(scale.s800, scale.s900, 0.5), ramp.Setta850),
		Setta860: translateScaleColor(mixOKLCH(scale.s800, scale.s900, 0.6), ramp.Setta860),
		Setta875: translateScaleColor(mixOKLCH(scale.s800, scale.s900, 0.75), ramp.Setta875),
		Setta900: translateScaleColor(scale.s900, ramp.Setta900),
		Setta925: translateScaleColor(mixOKLCH(scale.s900, scale.s950, 0.5), ramp.Setta925),
		Setta950: translateScaleColor(scale.s950, ramp.Setta950),
		Setta975: translateScaleColor(oklchColor{c: scale.s950.c * 0.65, h: scale.s950.h}, ramp.Setta975),
	}
}

func translateScaleColor(source oklchColor, targetLightness string) string {
	target, err := parseOKLCH("setta palette ramp", targetLightness)
	if err != nil {
		panic(err)
	}
	return formatOKLCH(oklchColor{
		l: target.l,
		c: translatedScaleChroma(source.c, target.l),
		h: source.h,
	})
}

func translatedScaleChroma(sourceChroma float64, targetLightness float64) float64 {
	switch {
	case targetLightness <= 0.25:
		return math.Min(sourceChroma, 0.065)
	case targetLightness <= 0.35:
		return math.Min(sourceChroma, 0.08)
	default:
		return sourceChroma
	}
}

func mixOKLCH(from oklchColor, to oklchColor, amount float64) oklchColor {
	return oklchColor{
		l: from.l + (to.l-from.l)*amount,
		c: from.c + (to.c-from.c)*amount,
		h: from.h + (to.h-from.h)*amount,
	}
}

func formatOKLCH(color oklchColor) string {
	return fmt.Sprintf("oklch(%.4f %.4f %.2f)", color.l, color.c, color.h)
}

type palettePreset struct {
	id     AppearancePresetID
	source string
	color  string
	scale  tailwindScale
}

var tailwindPalettePresets = []palettePreset{
	{
		id:     PresetTailwindSlate,
		source: "Tailwind 4",
		color:  "Slate",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.984, c: 0.003, h: 247.858},
			s100: oklchColor{l: 0.968, c: 0.007, h: 247.896},
			s200: oklchColor{l: 0.929, c: 0.013, h: 255.508},
			s300: oklchColor{l: 0.869, c: 0.022, h: 252.894},
			s400: oklchColor{l: 0.704, c: 0.04, h: 256.788},
			s500: oklchColor{l: 0.554, c: 0.046, h: 257.417},
			s600: oklchColor{l: 0.446, c: 0.043, h: 257.281},
			s700: oklchColor{l: 0.372, c: 0.044, h: 257.287},
			s800: oklchColor{l: 0.279, c: 0.041, h: 260.031},
			s900: oklchColor{l: 0.208, c: 0.042, h: 265.755},
			s950: oklchColor{l: 0.129, c: 0.042, h: 264.695},
		},
	},
	{
		id:     PresetTailwindGray,
		source: "Tailwind 4",
		color:  "Gray",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.985, c: 0.002, h: 247.839},
			s100: oklchColor{l: 0.967, c: 0.003, h: 264.542},
			s200: oklchColor{l: 0.928, c: 0.006, h: 264.531},
			s300: oklchColor{l: 0.872, c: 0.01, h: 258.338},
			s400: oklchColor{l: 0.707, c: 0.022, h: 261.325},
			s500: oklchColor{l: 0.551, c: 0.027, h: 264.364},
			s600: oklchColor{l: 0.446, c: 0.03, h: 256.802},
			s700: oklchColor{l: 0.373, c: 0.034, h: 259.733},
			s800: oklchColor{l: 0.278, c: 0.033, h: 256.848},
			s900: oklchColor{l: 0.21, c: 0.034, h: 264.665},
			s950: oklchColor{l: 0.13, c: 0.028, h: 261.692},
		},
	},
	{
		id:     PresetTailwindZinc,
		source: "Tailwind 4",
		color:  "Zinc",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.985, c: 0, h: 0},
			s100: oklchColor{l: 0.967, c: 0.001, h: 286.375},
			s200: oklchColor{l: 0.92, c: 0.004, h: 286.32},
			s300: oklchColor{l: 0.871, c: 0.006, h: 286.286},
			s400: oklchColor{l: 0.705, c: 0.015, h: 286.067},
			s500: oklchColor{l: 0.552, c: 0.016, h: 285.938},
			s600: oklchColor{l: 0.442, c: 0.017, h: 285.786},
			s700: oklchColor{l: 0.37, c: 0.013, h: 285.805},
			s800: oklchColor{l: 0.274, c: 0.006, h: 286.033},
			s900: oklchColor{l: 0.21, c: 0.006, h: 285.885},
			s950: oklchColor{l: 0.141, c: 0.005, h: 285.823},
		},
	},
	{
		id:     PresetTailwindNeutral,
		source: "Tailwind 4",
		color:  "Neutral",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.985, c: 0, h: 0},
			s100: oklchColor{l: 0.97, c: 0, h: 0},
			s200: oklchColor{l: 0.922, c: 0, h: 0},
			s300: oklchColor{l: 0.87, c: 0, h: 0},
			s400: oklchColor{l: 0.708, c: 0, h: 0},
			s500: oklchColor{l: 0.556, c: 0, h: 0},
			s600: oklchColor{l: 0.439, c: 0, h: 0},
			s700: oklchColor{l: 0.371, c: 0, h: 0},
			s800: oklchColor{l: 0.269, c: 0, h: 0},
			s900: oklchColor{l: 0.205, c: 0, h: 0},
			s950: oklchColor{l: 0.145, c: 0, h: 0},
		},
	},
	{
		id:     PresetTailwindStone,
		source: "Tailwind 4",
		color:  "Stone",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.985, c: 0.001, h: 106.423},
			s100: oklchColor{l: 0.97, c: 0.001, h: 106.424},
			s200: oklchColor{l: 0.923, c: 0.003, h: 48.717},
			s300: oklchColor{l: 0.869, c: 0.005, h: 56.366},
			s400: oklchColor{l: 0.709, c: 0.01, h: 56.259},
			s500: oklchColor{l: 0.553, c: 0.013, h: 58.071},
			s600: oklchColor{l: 0.444, c: 0.011, h: 73.639},
			s700: oklchColor{l: 0.374, c: 0.01, h: 67.558},
			s800: oklchColor{l: 0.268, c: 0.007, h: 34.298},
			s900: oklchColor{l: 0.216, c: 0.006, h: 56.043},
			s950: oklchColor{l: 0.147, c: 0.004, h: 49.25},
		},
	},
	{
		id:     PresetTailwindRed,
		source: "Tailwind 4",
		color:  "Red",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.971, c: 0.013, h: 17.38},
			s100: oklchColor{l: 0.936, c: 0.032, h: 17.717},
			s200: oklchColor{l: 0.885, c: 0.062, h: 18.334},
			s300: oklchColor{l: 0.808, c: 0.114, h: 19.571},
			s400: oklchColor{l: 0.704, c: 0.191, h: 22.216},
			s500: oklchColor{l: 0.637, c: 0.237, h: 25.331},
			s600: oklchColor{l: 0.577, c: 0.245, h: 27.325},
			s700: oklchColor{l: 0.505, c: 0.213, h: 27.518},
			s800: oklchColor{l: 0.444, c: 0.177, h: 26.899},
			s900: oklchColor{l: 0.396, c: 0.141, h: 25.723},
			s950: oklchColor{l: 0.258, c: 0.092, h: 26.042},
		},
	},
	{
		id:     PresetTailwindOrange,
		source: "Tailwind 4",
		color:  "Orange",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.98, c: 0.016, h: 73.684},
			s100: oklchColor{l: 0.954, c: 0.038, h: 75.164},
			s200: oklchColor{l: 0.901, c: 0.076, h: 70.697},
			s300: oklchColor{l: 0.837, c: 0.128, h: 66.29},
			s400: oklchColor{l: 0.75, c: 0.183, h: 55.934},
			s500: oklchColor{l: 0.705, c: 0.213, h: 47.604},
			s600: oklchColor{l: 0.646, c: 0.222, h: 41.116},
			s700: oklchColor{l: 0.553, c: 0.195, h: 38.402},
			s800: oklchColor{l: 0.47, c: 0.157, h: 37.304},
			s900: oklchColor{l: 0.408, c: 0.123, h: 38.172},
			s950: oklchColor{l: 0.266, c: 0.079, h: 36.259},
		},
	},
	{
		id:     PresetTailwindAmber,
		source: "Tailwind 4",
		color:  "Amber",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.987, c: 0.022, h: 95.277},
			s100: oklchColor{l: 0.962, c: 0.059, h: 95.617},
			s200: oklchColor{l: 0.924, c: 0.12, h: 95.746},
			s300: oklchColor{l: 0.879, c: 0.169, h: 91.605},
			s400: oklchColor{l: 0.828, c: 0.189, h: 84.429},
			s500: oklchColor{l: 0.769, c: 0.188, h: 70.08},
			s600: oklchColor{l: 0.666, c: 0.179, h: 58.318},
			s700: oklchColor{l: 0.555, c: 0.163, h: 48.998},
			s800: oklchColor{l: 0.473, c: 0.137, h: 46.201},
			s900: oklchColor{l: 0.414, c: 0.112, h: 45.904},
			s950: oklchColor{l: 0.279, c: 0.077, h: 45.635},
		},
	},
	{
		id:     PresetTailwindYellow,
		source: "Tailwind 4",
		color:  "Yellow",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.987, c: 0.026, h: 102.212},
			s100: oklchColor{l: 0.973, c: 0.071, h: 103.193},
			s200: oklchColor{l: 0.945, c: 0.129, h: 101.54},
			s300: oklchColor{l: 0.905, c: 0.182, h: 98.111},
			s400: oklchColor{l: 0.852, c: 0.199, h: 91.936},
			s500: oklchColor{l: 0.795, c: 0.184, h: 86.047},
			s600: oklchColor{l: 0.681, c: 0.162, h: 75.834},
			s700: oklchColor{l: 0.554, c: 0.135, h: 66.442},
			s800: oklchColor{l: 0.476, c: 0.114, h: 61.907},
			s900: oklchColor{l: 0.421, c: 0.095, h: 57.708},
			s950: oklchColor{l: 0.286, c: 0.066, h: 53.813},
		},
	},
	{
		id:     PresetTailwindLime,
		source: "Tailwind 4",
		color:  "Lime",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.986, c: 0.031, h: 120.757},
			s100: oklchColor{l: 0.967, c: 0.067, h: 122.328},
			s200: oklchColor{l: 0.938, c: 0.127, h: 124.321},
			s300: oklchColor{l: 0.897, c: 0.196, h: 126.665},
			s400: oklchColor{l: 0.841, c: 0.238, h: 128.85},
			s500: oklchColor{l: 0.768, c: 0.233, h: 130.85},
			s600: oklchColor{l: 0.648, c: 0.2, h: 131.684},
			s700: oklchColor{l: 0.532, c: 0.157, h: 131.589},
			s800: oklchColor{l: 0.453, c: 0.124, h: 130.933},
			s900: oklchColor{l: 0.405, c: 0.101, h: 131.063},
			s950: oklchColor{l: 0.274, c: 0.072, h: 132.109},
		},
	},
	{
		id:     PresetTailwindGreen,
		source: "Tailwind 4",
		color:  "Green",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.982, c: 0.018, h: 155.826},
			s100: oklchColor{l: 0.962, c: 0.044, h: 156.743},
			s200: oklchColor{l: 0.925, c: 0.084, h: 155.995},
			s300: oklchColor{l: 0.871, c: 0.15, h: 154.449},
			s400: oklchColor{l: 0.792, c: 0.209, h: 151.711},
			s500: oklchColor{l: 0.723, c: 0.219, h: 149.579},
			s600: oklchColor{l: 0.627, c: 0.194, h: 149.214},
			s700: oklchColor{l: 0.527, c: 0.154, h: 150.069},
			s800: oklchColor{l: 0.448, c: 0.119, h: 151.328},
			s900: oklchColor{l: 0.393, c: 0.095, h: 152.535},
			s950: oklchColor{l: 0.266, c: 0.065, h: 152.934},
		},
	},
	{
		id:     PresetTailwindEmerald,
		source: "Tailwind 4",
		color:  "Emerald",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.979, c: 0.021, h: 166.113},
			s100: oklchColor{l: 0.95, c: 0.052, h: 163.051},
			s200: oklchColor{l: 0.905, c: 0.093, h: 164.15},
			s300: oklchColor{l: 0.845, c: 0.143, h: 164.978},
			s400: oklchColor{l: 0.765, c: 0.177, h: 163.223},
			s500: oklchColor{l: 0.696, c: 0.17, h: 162.48},
			s600: oklchColor{l: 0.596, c: 0.145, h: 163.225},
			s700: oklchColor{l: 0.508, c: 0.118, h: 165.612},
			s800: oklchColor{l: 0.432, c: 0.095, h: 166.913},
			s900: oklchColor{l: 0.378, c: 0.077, h: 168.94},
			s950: oklchColor{l: 0.262, c: 0.051, h: 172.552},
		},
	},
	{
		id:     PresetTailwindTeal,
		source: "Tailwind 4",
		color:  "Teal",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.984, c: 0.014, h: 180.72},
			s100: oklchColor{l: 0.953, c: 0.051, h: 180.801},
			s200: oklchColor{l: 0.91, c: 0.096, h: 180.426},
			s300: oklchColor{l: 0.855, c: 0.138, h: 181.071},
			s400: oklchColor{l: 0.777, c: 0.152, h: 181.912},
			s500: oklchColor{l: 0.704, c: 0.14, h: 182.503},
			s600: oklchColor{l: 0.6, c: 0.118, h: 184.704},
			s700: oklchColor{l: 0.511, c: 0.096, h: 186.391},
			s800: oklchColor{l: 0.437, c: 0.078, h: 188.216},
			s900: oklchColor{l: 0.386, c: 0.063, h: 188.416},
			s950: oklchColor{l: 0.277, c: 0.046, h: 192.524},
		},
	},
	{
		id:     PresetTailwindCyan,
		source: "Tailwind 4",
		color:  "Cyan",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.984, c: 0.019, h: 200.873},
			s100: oklchColor{l: 0.956, c: 0.045, h: 203.388},
			s200: oklchColor{l: 0.917, c: 0.08, h: 205.041},
			s300: oklchColor{l: 0.865, c: 0.127, h: 207.078},
			s400: oklchColor{l: 0.789, c: 0.154, h: 211.53},
			s500: oklchColor{l: 0.715, c: 0.143, h: 215.221},
			s600: oklchColor{l: 0.609, c: 0.126, h: 221.723},
			s700: oklchColor{l: 0.52, c: 0.105, h: 223.128},
			s800: oklchColor{l: 0.45, c: 0.085, h: 224.283},
			s900: oklchColor{l: 0.398, c: 0.07, h: 227.392},
			s950: oklchColor{l: 0.302, c: 0.056, h: 229.695},
		},
	},
	{
		id:     PresetTailwindSky,
		source: "Tailwind 4",
		color:  "Sky",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.977, c: 0.013, h: 236.62},
			s100: oklchColor{l: 0.951, c: 0.026, h: 236.824},
			s200: oklchColor{l: 0.901, c: 0.058, h: 230.902},
			s300: oklchColor{l: 0.828, c: 0.111, h: 230.318},
			s400: oklchColor{l: 0.746, c: 0.16, h: 232.661},
			s500: oklchColor{l: 0.685, c: 0.169, h: 237.323},
			s600: oklchColor{l: 0.588, c: 0.158, h: 241.966},
			s700: oklchColor{l: 0.5, c: 0.134, h: 242.749},
			s800: oklchColor{l: 0.443, c: 0.11, h: 240.79},
			s900: oklchColor{l: 0.391, c: 0.09, h: 240.876},
			s950: oklchColor{l: 0.293, c: 0.066, h: 243.157},
		},
	},
	{
		id:     PresetTailwindBlue,
		source: "Tailwind 4",
		color:  "Blue",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.97, c: 0.014, h: 254.604},
			s100: oklchColor{l: 0.932, c: 0.032, h: 255.585},
			s200: oklchColor{l: 0.882, c: 0.059, h: 254.128},
			s300: oklchColor{l: 0.809, c: 0.105, h: 251.813},
			s400: oklchColor{l: 0.707, c: 0.165, h: 254.624},
			s500: oklchColor{l: 0.623, c: 0.214, h: 259.815},
			s600: oklchColor{l: 0.546, c: 0.245, h: 262.881},
			s700: oklchColor{l: 0.488, c: 0.243, h: 264.376},
			s800: oklchColor{l: 0.424, c: 0.199, h: 265.638},
			s900: oklchColor{l: 0.379, c: 0.146, h: 265.522},
			s950: oklchColor{l: 0.282, c: 0.091, h: 267.935},
		},
	},
	{
		id:     PresetTailwindIndigo,
		source: "Tailwind 4",
		color:  "Indigo",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.962, c: 0.018, h: 272.314},
			s100: oklchColor{l: 0.93, c: 0.034, h: 272.788},
			s200: oklchColor{l: 0.87, c: 0.065, h: 274.039},
			s300: oklchColor{l: 0.785, c: 0.115, h: 274.713},
			s400: oklchColor{l: 0.673, c: 0.182, h: 276.935},
			s500: oklchColor{l: 0.585, c: 0.233, h: 277.117},
			s600: oklchColor{l: 0.511, c: 0.262, h: 276.966},
			s700: oklchColor{l: 0.457, c: 0.24, h: 277.023},
			s800: oklchColor{l: 0.398, c: 0.195, h: 277.366},
			s900: oklchColor{l: 0.359, c: 0.144, h: 278.697},
			s950: oklchColor{l: 0.257, c: 0.09, h: 281.288},
		},
	},
	{
		id:     PresetTailwindViolet,
		source: "Tailwind 4",
		color:  "Violet",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.969, c: 0.016, h: 293.756},
			s100: oklchColor{l: 0.943, c: 0.029, h: 294.588},
			s200: oklchColor{l: 0.894, c: 0.057, h: 293.283},
			s300: oklchColor{l: 0.811, c: 0.111, h: 293.571},
			s400: oklchColor{l: 0.702, c: 0.183, h: 293.541},
			s500: oklchColor{l: 0.606, c: 0.25, h: 292.717},
			s600: oklchColor{l: 0.541, c: 0.281, h: 293.009},
			s700: oklchColor{l: 0.491, c: 0.27, h: 292.581},
			s800: oklchColor{l: 0.432, c: 0.232, h: 292.759},
			s900: oklchColor{l: 0.38, c: 0.189, h: 293.745},
			s950: oklchColor{l: 0.283, c: 0.141, h: 291.089},
		},
	},
	{
		id:     PresetTailwindPurple,
		source: "Tailwind 4",
		color:  "Purple",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.977, c: 0.014, h: 308.299},
			s100: oklchColor{l: 0.946, c: 0.033, h: 307.174},
			s200: oklchColor{l: 0.902, c: 0.063, h: 306.703},
			s300: oklchColor{l: 0.827, c: 0.119, h: 306.383},
			s400: oklchColor{l: 0.714, c: 0.203, h: 305.504},
			s500: oklchColor{l: 0.627, c: 0.265, h: 303.9},
			s600: oklchColor{l: 0.558, c: 0.288, h: 302.321},
			s700: oklchColor{l: 0.496, c: 0.265, h: 301.924},
			s800: oklchColor{l: 0.438, c: 0.218, h: 303.724},
			s900: oklchColor{l: 0.381, c: 0.176, h: 304.987},
			s950: oklchColor{l: 0.291, c: 0.149, h: 302.717},
		},
	},
	{
		id:     PresetTailwindFuchsia,
		source: "Tailwind 4",
		color:  "Fuchsia",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.977, c: 0.017, h: 320.058},
			s100: oklchColor{l: 0.952, c: 0.037, h: 318.852},
			s200: oklchColor{l: 0.903, c: 0.076, h: 319.62},
			s300: oklchColor{l: 0.833, c: 0.145, h: 321.434},
			s400: oklchColor{l: 0.74, c: 0.238, h: 322.16},
			s500: oklchColor{l: 0.667, c: 0.295, h: 322.15},
			s600: oklchColor{l: 0.591, c: 0.293, h: 322.896},
			s700: oklchColor{l: 0.518, c: 0.253, h: 323.949},
			s800: oklchColor{l: 0.452, c: 0.211, h: 324.591},
			s900: oklchColor{l: 0.401, c: 0.17, h: 325.612},
			s950: oklchColor{l: 0.293, c: 0.136, h: 325.661},
		},
	},
	{
		id:     PresetTailwindPink,
		source: "Tailwind 4",
		color:  "Pink",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.971, c: 0.014, h: 343.198},
			s100: oklchColor{l: 0.948, c: 0.028, h: 342.258},
			s200: oklchColor{l: 0.899, c: 0.061, h: 343.231},
			s300: oklchColor{l: 0.823, c: 0.12, h: 346.018},
			s400: oklchColor{l: 0.718, c: 0.202, h: 349.761},
			s500: oklchColor{l: 0.656, c: 0.241, h: 354.308},
			s600: oklchColor{l: 0.592, c: 0.249, h: 0.584},
			s700: oklchColor{l: 0.525, c: 0.223, h: 3.958},
			s800: oklchColor{l: 0.459, c: 0.187, h: 3.815},
			s900: oklchColor{l: 0.408, c: 0.153, h: 2.432},
			s950: oklchColor{l: 0.284, c: 0.109, h: 3.907},
		},
	},
	{
		id:     PresetTailwindRose,
		source: "Tailwind 4",
		color:  "Rose",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.969, c: 0.015, h: 12.422},
			s100: oklchColor{l: 0.941, c: 0.03, h: 12.58},
			s200: oklchColor{l: 0.892, c: 0.058, h: 10.001},
			s300: oklchColor{l: 0.81, c: 0.117, h: 11.638},
			s400: oklchColor{l: 0.712, c: 0.194, h: 13.428},
			s500: oklchColor{l: 0.645, c: 0.246, h: 16.439},
			s600: oklchColor{l: 0.586, c: 0.253, h: 17.585},
			s700: oklchColor{l: 0.514, c: 0.222, h: 16.935},
			s800: oklchColor{l: 0.455, c: 0.188, h: 13.697},
			s900: oklchColor{l: 0.41, c: 0.159, h: 10.272},
			s950: oklchColor{l: 0.271, c: 0.105, h: 12.094},
		},
	},
}

var shadcnPalettePresets = []palettePreset{
	{
		id:     PresetShadcnMauve,
		source: "shadcn/ui",
		color:  "Mauve",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.985, c: 0, h: 0},
			s100: oklchColor{l: 0.96, c: 0.003, h: 325.6},
			s200: oklchColor{l: 0.922, c: 0.005, h: 325.62},
			s300: oklchColor{l: 0.865, c: 0.012, h: 325.68},
			s400: oklchColor{l: 0.711, c: 0.019, h: 323.02},
			s500: oklchColor{l: 0.542, c: 0.034, h: 322.5},
			s600: oklchColor{l: 0.435, c: 0.029, h: 321.78},
			s700: oklchColor{l: 0.364, c: 0.029, h: 323.89},
			s800: oklchColor{l: 0.263, c: 0.024, h: 320.12},
			s900: oklchColor{l: 0.212, c: 0.019, h: 322.12},
			s950: oklchColor{l: 0.145, c: 0.008, h: 326},
		},
	},
	{
		id:     PresetShadcnOlive,
		source: "shadcn/ui",
		color:  "Olive",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.988, c: 0.003, h: 106.5},
			s100: oklchColor{l: 0.966, c: 0.005, h: 106.5},
			s200: oklchColor{l: 0.93, c: 0.007, h: 106.5},
			s300: oklchColor{l: 0.88, c: 0.011, h: 106.6},
			s400: oklchColor{l: 0.737, c: 0.021, h: 106.9},
			s500: oklchColor{l: 0.58, c: 0.031, h: 107.3},
			s600: oklchColor{l: 0.466, c: 0.025, h: 107.3},
			s700: oklchColor{l: 0.394, c: 0.023, h: 107.4},
			s800: oklchColor{l: 0.286, c: 0.016, h: 107.4},
			s900: oklchColor{l: 0.228, c: 0.013, h: 107.4},
			s950: oklchColor{l: 0.153, c: 0.006, h: 107.1},
		},
	},
	{
		id:     PresetShadcnMist,
		source: "shadcn/ui",
		color:  "Mist",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.987, c: 0.002, h: 197.1},
			s100: oklchColor{l: 0.963, c: 0.002, h: 197.1},
			s200: oklchColor{l: 0.925, c: 0.005, h: 214.3},
			s300: oklchColor{l: 0.872, c: 0.007, h: 219.6},
			s400: oklchColor{l: 0.723, c: 0.014, h: 214.4},
			s500: oklchColor{l: 0.56, c: 0.021, h: 213.5},
			s600: oklchColor{l: 0.45, c: 0.017, h: 213.2},
			s700: oklchColor{l: 0.378, c: 0.015, h: 216},
			s800: oklchColor{l: 0.275, c: 0.011, h: 216.9},
			s900: oklchColor{l: 0.218, c: 0.008, h: 223.9},
			s950: oklchColor{l: 0.148, c: 0.004, h: 228.8},
		},
	},
	{
		id:     PresetShadcnTaupe,
		source: "shadcn/ui",
		color:  "Taupe",
		scale: tailwindScale{
			s50:  oklchColor{l: 0.986, c: 0.002, h: 67.8},
			s100: oklchColor{l: 0.96, c: 0.002, h: 17.2},
			s200: oklchColor{l: 0.922, c: 0.005, h: 34.3},
			s300: oklchColor{l: 0.868, c: 0.007, h: 39.5},
			s400: oklchColor{l: 0.714, c: 0.014, h: 41.2},
			s500: oklchColor{l: 0.547, c: 0.021, h: 43.1},
			s600: oklchColor{l: 0.438, c: 0.017, h: 39.3},
			s700: oklchColor{l: 0.367, c: 0.016, h: 35.7},
			s800: oklchColor{l: 0.268, c: 0.011, h: 36.5},
			s900: oklchColor{l: 0.214, c: 0.009, h: 43.1},
			s950: oklchColor{l: 0.147, c: 0.004, h: 49.3},
		},
	},
}

func stringValues[T ~string](values []T) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = append(out, string(value))
	}
	return out
}
