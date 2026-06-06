package appearance

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
)

const SchemaVersion = 1

type AppearanceColorMode string

const (
	ColorModeDark  AppearanceColorMode = "dark"
	ColorModeLight AppearanceColorMode = "light"
)

var colorModeValues = []AppearanceColorMode{ColorModeDark, ColorModeLight}

type AppearanceSettings struct {
	SchemaVersion int                   `json:"schemaVersion"`
	Mode          AppearanceColorMode   `json:"mode"`
	Light         AppearanceColorScheme `json:"light"`
	Dark          AppearanceColorScheme `json:"dark"`
	Fonts         AppearanceFontScheme  `json:"fonts"`
}

type AppearanceColorScheme struct {
	Tailwind AppearanceTailwindPalette `json:"tailwind"`
	Shadcn   AppearanceShadcnPalette   `json:"shadcn"`
	Status   AppearanceStatusPalette   `json:"status"`
}

type AppearanceTailwindPalette struct {
	Zinc50  string `json:"zinc50"`
	Zinc100 string `json:"zinc100"`
	Zinc150 string `json:"zinc150"`
	Zinc200 string `json:"zinc200"`
	Zinc300 string `json:"zinc300"`
	Zinc400 string `json:"zinc400"`
	Zinc500 string `json:"zinc500"`
	Zinc600 string `json:"zinc600"`
	Zinc700 string `json:"zinc700"`
	Zinc750 string `json:"zinc750"`
	Zinc800 string `json:"zinc800"`
	Zinc850 string `json:"zinc850"`
	Zinc860 string `json:"zinc860"`
	Zinc875 string `json:"zinc875"`
	Zinc900 string `json:"zinc900"`
	Zinc925 string `json:"zinc925"`
	Zinc950 string `json:"zinc950"`
	Zinc975 string `json:"zinc975"`
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

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{{Name: "AppearanceColorMode", Values: stringValues(colorModeValues)}}
}

func DefaultSettings() AppearanceSettings {
	tailwind := defaultSettaTailwindPalette()
	return AppearanceSettings{
		SchemaVersion: SchemaVersion,
		Mode:          ColorModeDark,
		Light:         defaultLightColorScheme(tailwind),
		Dark:          defaultDarkColorScheme(tailwind),
		Fonts: AppearanceFontScheme{
			Sans:    `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
			Mono:    `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`,
			Heading: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
		},
	}
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
	return validateFontScheme(settings.Fonts)
}

func validateColorScheme(label string, scheme AppearanceColorScheme) error {
	if err := validateTailwindPalette(label+".tailwind", scheme.Tailwind); err != nil {
		return err
	}
	if err := validateShadcnPalette(label+".shadcn", scheme.Shadcn); err != nil {
		return err
	}
	return validateStatusPalette(label+".status", scheme.Status)
}

func validateTailwindPalette(label string, palette AppearanceTailwindPalette) error {
	values := []namedValue{
		{"zinc50", palette.Zinc50},
		{"zinc100", palette.Zinc100},
		{"zinc150", palette.Zinc150},
		{"zinc200", palette.Zinc200},
		{"zinc300", palette.Zinc300},
		{"zinc400", palette.Zinc400},
		{"zinc500", palette.Zinc500},
		{"zinc600", palette.Zinc600},
		{"zinc700", palette.Zinc700},
		{"zinc750", palette.Zinc750},
		{"zinc800", palette.Zinc800},
		{"zinc850", palette.Zinc850},
		{"zinc860", palette.Zinc860},
		{"zinc875", palette.Zinc875},
		{"zinc900", palette.Zinc900},
		{"zinc925", palette.Zinc925},
		{"zinc950", palette.Zinc950},
		{"zinc975", palette.Zinc975},
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

func validateOKLCH(label string, value string) error {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "oklch(") || !strings.HasSuffix(value, ")") {
		return fmt.Errorf("%s must be oklch(l c h)", label)
	}
	parts := strings.Fields(strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(value, "oklch("), ")")))
	if len(parts) != 3 {
		return fmt.Errorf("%s must have lightness, chroma, and hue", label)
	}
	if err := validateOKLCHNumber(label, "lightness", parts[0], 0, 1); err != nil {
		return err
	}
	if err := validateOKLCHNumber(label, "chroma", parts[1], 0, 1); err != nil {
		return err
	}
	if err := validateOKLCHNumber(label, "hue", parts[2], 0, 360); err != nil {
		return err
	}
	return nil
}

func validateOKLCHNumber(label string, component string, raw string, min float64, max float64) error {
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fmt.Errorf("%s %s must be a number from %s to %s", label, component, formatRangeNumber(min), formatRangeNumber(max))
	}
	if math.IsNaN(value) || value < min || value > max {
		return fmt.Errorf("%s %s must be a number from %s to %s", label, component, formatRangeNumber(min), formatRangeNumber(max))
	}
	return nil
}

func formatRangeNumber(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func defaultSettaTailwindPalette() AppearanceTailwindPalette {
	return AppearanceTailwindPalette{
		Zinc50:  "oklch(0.9574 0.0071 267.38)",
		Zinc100: "oklch(0.9085 0.0130 263.02)",
		Zinc150: "oklch(0.8575 0.0208 262.99)",
		Zinc200: "oklch(0.8057 0.0292 262.95)",
		Zinc300: "oklch(0.7167 0.0439 264.25)",
		Zinc400: "oklch(0.6255 0.0618 263.97)",
		Zinc500: "oklch(0.5216 0.0651 263.76)",
		Zinc600: "oklch(0.4311 0.0508 262.49)",
		Zinc700: "oklch(0.3324 0.0381 262.51)",
		Zinc750: "oklch(0.2903 0.0317 262.55)",
		Zinc800: "oklch(0.2458 0.0254 263.94)",
		Zinc850: "oklch(0.2162 0.0198 264.03)",
		Zinc860: "oklch(0.1903 0.0158 264.09)",
		Zinc875: "oklch(0.1797 0.0141 264.13)",
		Zinc900: "oklch(0.1631 0.0125 264.14)",
		Zinc925: "oklch(0.1471 0.0086 263.76)",
		Zinc950: "oklch(0.1281 0.0070 261.32)",
		Zinc975: "oklch(0.0697 0.0051 260.18)",
	}
}

func defaultLightColorScheme(tailwind AppearanceTailwindPalette) AppearanceColorScheme {
	return AppearanceColorScheme{
		Tailwind: tailwind,
		Shadcn: AppearanceShadcnPalette{
			Background:              tailwind.Zinc50,
			Foreground:              tailwind.Zinc900,
			Card:                    "oklch(1.0000 0.0000 0.00)",
			CardForeground:          tailwind.Zinc900,
			Popover:                 "oklch(1.0000 0.0000 0.00)",
			PopoverForeground:       tailwind.Zinc900,
			Primary:                 tailwind.Zinc600,
			PrimaryForeground:       tailwind.Zinc50,
			Secondary:               tailwind.Zinc100,
			SecondaryForeground:     tailwind.Zinc800,
			Muted:                   tailwind.Zinc100,
			MutedForeground:         tailwind.Zinc500,
			Accent:                  tailwind.Zinc200,
			AccentForeground:        tailwind.Zinc800,
			Destructive:             "oklch(0.6368 0.2078 25.33)",
			DestructiveForeground:   tailwind.Zinc50,
			Border:                  tailwind.Zinc200,
			Input:                   tailwind.Zinc200,
			Ring:                    tailwind.Zinc500,
			Sidebar:                 tailwind.Zinc100,
			SidebarForeground:       tailwind.Zinc800,
			SidebarAccent:           tailwind.Zinc200,
			SidebarAccentForeground: tailwind.Zinc900,
		},
		Status: AppearanceStatusPalette{
			Info:               "oklch(0.6231 0.1880 259.81)",
			InfoForeground:     tailwind.Zinc50,
			Success:            "oklch(0.7227 0.1920 149.58)",
			SuccessForeground:  tailwind.Zinc950,
			Warning:            "oklch(0.7686 0.1647 70.08)",
			WarningForeground:  tailwind.Zinc950,
			Alert:              "oklch(0.7686 0.1647 70.08)",
			AlertForeground:    tailwind.Zinc950,
			Critical:           "oklch(0.6368 0.2078 25.33)",
			CriticalForeground: tailwind.Zinc50,
		},
	}
}

func defaultDarkColorScheme(tailwind AppearanceTailwindPalette) AppearanceColorScheme {
	return AppearanceColorScheme{
		Tailwind: tailwind,
		Shadcn: AppearanceShadcnPalette{
			Background:              tailwind.Zinc900,
			Foreground:              tailwind.Zinc100,
			Card:                    tailwind.Zinc850,
			CardForeground:          tailwind.Zinc100,
			Popover:                 tailwind.Zinc850,
			PopoverForeground:       tailwind.Zinc100,
			Primary:                 tailwind.Zinc300,
			PrimaryForeground:       tailwind.Zinc950,
			Secondary:               tailwind.Zinc800,
			SecondaryForeground:     tailwind.Zinc100,
			Muted:                   tailwind.Zinc800,
			MutedForeground:         tailwind.Zinc400,
			Accent:                  tailwind.Zinc750,
			AccentForeground:        tailwind.Zinc100,
			Destructive:             "oklch(0.6368 0.2078 25.33)",
			DestructiveForeground:   tailwind.Zinc50,
			Border:                  tailwind.Zinc700,
			Input:                   tailwind.Zinc700,
			Ring:                    tailwind.Zinc400,
			Sidebar:                 tailwind.Zinc925,
			SidebarForeground:       tailwind.Zinc100,
			SidebarAccent:           tailwind.Zinc800,
			SidebarAccentForeground: tailwind.Zinc50,
		},
		Status: AppearanceStatusPalette{
			Info:               "oklch(0.7137 0.1434 254.62)",
			InfoForeground:     tailwind.Zinc950,
			Success:            "oklch(0.7227 0.1920 149.58)",
			SuccessForeground:  tailwind.Zinc950,
			Warning:            "oklch(0.7686 0.1647 70.08)",
			WarningForeground:  tailwind.Zinc950,
			Alert:              "oklch(0.4732 0.1247 46.20)",
			AlertForeground:    tailwind.Zinc50,
			Critical:           "oklch(0.6368 0.2078 25.33)",
			CriticalForeground: tailwind.Zinc50,
		},
	}
}

func stringValues[T ~string](values []T) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = append(out, string(value))
	}
	return out
}
