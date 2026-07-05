package appearance

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

type oklchColor struct {
	l float64
	c float64
	h float64
}

func validateOKLCH(label string, value string) error {
	_, err := parseOKLCH(label, value)
	return err
}

func parseOKLCH(label string, value string) (oklchColor, error) {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "oklch(") || !strings.HasSuffix(value, ")") {
		return oklchColor{}, fmt.Errorf("%s must be oklch(l c h)", label)
	}
	parts := strings.Fields(strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(value, "oklch("), ")")))
	if len(parts) != 3 {
		return oklchColor{}, fmt.Errorf("%s must have lightness, chroma, and hue", label)
	}
	lightness, err := parseOKLCHNumber(label, "lightness", parts[0], 0, 1)
	if err != nil {
		return oklchColor{}, err
	}
	chroma, err := parseOKLCHNumber(label, "chroma", parts[1], 0, 1)
	if err != nil {
		return oklchColor{}, err
	}
	hue, err := parseOKLCHNumber(label, "hue", parts[2], 0, 360)
	if err != nil {
		return oklchColor{}, err
	}
	return oklchColor{l: lightness, c: chroma, h: hue}, nil
}

func parseOKLCHNumber(label string, component string, raw string, min float64, max float64) (float64, error) {
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("%s %s must be a number from %s to %s", label, component, formatRangeNumber(min), formatRangeNumber(max))
	}
	if math.IsNaN(value) || value < min || value > max {
		return 0, fmt.Errorf("%s %s must be a number from %s to %s", label, component, formatRangeNumber(min), formatRangeNumber(max))
	}
	return value, nil
}

func formatRangeNumber(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

type contrastPair struct {
	name string
	fg   string
	bg   string
	min  float64
}

func validateColorContrast(label string, scheme AppearanceColorScheme) error {
	pairs := []contrastPair{
		{name: "shadcn.foreground on shadcn.background", fg: scheme.Shadcn.Foreground, bg: scheme.Shadcn.Background, min: wcagAANormalTextContrast},
		{name: "shadcn.foreground on shadcn.card", fg: scheme.Shadcn.Foreground, bg: scheme.Shadcn.Card, min: wcagAANormalTextContrast},
		{name: "shadcn.cardForeground on shadcn.card", fg: scheme.Shadcn.CardForeground, bg: scheme.Shadcn.Card, min: wcagAANormalTextContrast},
		{name: "shadcn.popoverForeground on shadcn.popover", fg: scheme.Shadcn.PopoverForeground, bg: scheme.Shadcn.Popover, min: wcagAANormalTextContrast},
		{name: "shadcn.mutedForeground on shadcn.background", fg: scheme.Shadcn.MutedForeground, bg: scheme.Shadcn.Background, min: wcagAANormalTextContrast},
		{name: "shadcn.mutedForeground on shadcn.card", fg: scheme.Shadcn.MutedForeground, bg: scheme.Shadcn.Card, min: wcagAANormalTextContrast},
		{name: "shadcn.primaryForeground on shadcn.primary", fg: scheme.Shadcn.PrimaryForeground, bg: scheme.Shadcn.Primary, min: wcagAANormalTextContrast},
		{name: "shadcn.secondaryForeground on shadcn.secondary", fg: scheme.Shadcn.SecondaryForeground, bg: scheme.Shadcn.Secondary, min: wcagAANormalTextContrast},
		{name: "shadcn.accentForeground on shadcn.accent", fg: scheme.Shadcn.AccentForeground, bg: scheme.Shadcn.Accent, min: wcagAANormalTextContrast},
		{name: "shadcn.destructiveForeground on shadcn.destructive", fg: scheme.Shadcn.DestructiveForeground, bg: scheme.Shadcn.Destructive, min: wcagAANormalTextContrast},
		{name: "shadcn.sidebarForeground on shadcn.sidebar", fg: scheme.Shadcn.SidebarForeground, bg: scheme.Shadcn.Sidebar, min: wcagAANormalTextContrast},
		{name: "shadcn.sidebarAccentForeground on shadcn.sidebarAccent", fg: scheme.Shadcn.SidebarAccentForeground, bg: scheme.Shadcn.SidebarAccent, min: wcagAANormalTextContrast},
		{name: "status.infoForeground on status.info", fg: scheme.Status.InfoForeground, bg: scheme.Status.Info, min: wcagAANormalTextContrast},
		{name: "status.successForeground on status.success", fg: scheme.Status.SuccessForeground, bg: scheme.Status.Success, min: wcagAANormalTextContrast},
		{name: "status.warningForeground on status.warning", fg: scheme.Status.WarningForeground, bg: scheme.Status.Warning, min: wcagAANormalTextContrast},
		{name: "status.alertForeground on status.alert", fg: scheme.Status.AlertForeground, bg: scheme.Status.Alert, min: wcagAANormalTextContrast},
		{name: "status.criticalForeground on status.critical", fg: scheme.Status.CriticalForeground, bg: scheme.Status.Critical, min: wcagAANormalTextContrast},
	}
	for _, pair := range pairs {
		ratio, err := contrastRatio(pair.fg, pair.bg)
		if err != nil {
			return fmt.Errorf("%s %s contrast: %w", label, pair.name, err)
		}
		if ratio+1e-9 < pair.min {
			return fmt.Errorf("%s %s contrast = %.2f:1, want at least %.1f:1 for WCAG AA normal text", label, pair.name, ratio, pair.min)
		}
	}
	return nil
}

func contrastRatio(fg string, bg string) (float64, error) {
	fgColor, err := parseOKLCH("foreground", fg)
	if err != nil {
		return 0, err
	}
	bgColor, err := parseOKLCH("background", bg)
	if err != nil {
		return 0, err
	}
	return contrastRatioForColors(fgColor, bgColor), nil
}

func contrastRatioForColors(fg oklchColor, bg oklchColor) float64 {
	fgLuminance := relativeLuminance(fg)
	bgLuminance := relativeLuminance(bg)
	lighter := math.Max(fgLuminance, bgLuminance)
	darker := math.Min(fgLuminance, bgLuminance)
	return (lighter + 0.05) / (darker + 0.05)
}

func relativeLuminance(color oklchColor) float64 {
	hueRadians := color.h * math.Pi / 180
	a := color.c * math.Cos(hueRadians)
	b := color.c * math.Sin(hueRadians)
	lPrime := color.l + 0.3963377774*a + 0.2158037573*b
	mPrime := color.l - 0.1055613458*a - 0.0638541728*b
	sPrime := color.l - 0.0894841775*a - 1.2914855480*b
	l := lPrime * lPrime * lPrime
	m := mPrime * mPrime * mPrime
	s := sPrime * sPrime * sPrime
	red := clamp01(4.0767416621*l - 3.3077115913*m + 0.2309699292*s)
	green := clamp01(-1.2684380046*l + 2.6097574011*m - 0.3413193965*s)
	blue := clamp01(-0.0041960863*l - 0.7034186147*m + 1.7076147010*s)
	return 0.2126*red + 0.7152*green + 0.0722*blue
}

func clamp01(value float64) float64 {
	return math.Min(1, math.Max(0, value))
}

func bestReadableForeground(background string, first string, second string) string {
	if mustContrastRatio(first, background) >= mustContrastRatio(second, background) {
		return first
	}
	return second
}

func highContrastForeground(background string) string {
	return bestReadableForeground(background, accessibleWhite, accessibleBlack)
}

func firstReadableForeground(backgrounds []string, candidates ...string) string {
	for _, candidate := range candidates {
		if minContrastRatio(candidate, backgrounds) >= wcagAANormalTextContrast {
			return candidate
		}
	}
	best := candidates[0]
	bestRatio := minContrastRatio(best, backgrounds)
	for _, candidate := range candidates[1:] {
		candidateRatio := minContrastRatio(candidate, backgrounds)
		if candidateRatio > bestRatio {
			best = candidate
			bestRatio = candidateRatio
		}
	}
	return best
}

func minContrastRatio(foreground string, backgrounds []string) float64 {
	minRatio := math.Inf(1)
	for _, background := range backgrounds {
		minRatio = math.Min(minRatio, mustContrastRatio(foreground, background))
	}
	return minRatio
}

func mustContrastRatio(foreground string, background string) float64 {
	ratio, err := contrastRatio(foreground, background)
	if err != nil {
		panic(err)
	}
	return ratio
}
