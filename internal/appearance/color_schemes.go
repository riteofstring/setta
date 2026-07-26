package appearance

// The accent palettes are tuned in OKLCH around the Setta logo cyan (hue
// 213.38) so all hues share its perceived lightness and chroma weight. Dark
// accents target readable text on the Setta850-Setta950 surfaces; light
// accents are deeper and more chromatic for white and Setta50 surfaces.
func defaultDarkAccentPalette() AppearanceAccentPalette {
	return AppearanceAccentPalette{
		Cyan:    settaLogoCyan,
		Blue:    "oklch(0.7600 0.1150 250.00)",
		Violet:  "oklch(0.7600 0.1250 290.00)",
		Magenta: "oklch(0.7700 0.1350 335.00)",
		Red:     "oklch(0.7100 0.1650 25.00)",
		Amber:   "oklch(0.8200 0.1350 78.00)",
		Green:   "oklch(0.7900 0.1450 152.00)",
		Teal:    "oklch(0.8200 0.1250 185.00)",
	}
}

func defaultSettaDarkColorScheme(tailwind AppearanceTailwindPalette) AppearanceColorScheme {
	scheme := defaultDarkColorScheme(tailwind)
	scheme.Shadcn.Primary = settaLogoCyan
	scheme.Shadcn.PrimaryForeground = highContrastForeground(scheme.Shadcn.Primary)
	scheme.Shadcn.Ring = settaLogoCyan
	scheme.Status.Info = settaLogoCyan
	scheme.Status.InfoForeground = highContrastForeground(scheme.Status.Info)
	return scheme
}

func defaultDarkColorScheme(tailwind AppearanceTailwindPalette) AppearanceColorScheme {
	accent := defaultDarkAccentPalette()
	destructive := "oklch(0.6368 0.2078 25.33)"
	info := accent.Blue
	success := accent.Green
	warning := accent.Amber
	alert := accent.Magenta
	critical := destructive
	mutedForeground := firstReadableForeground(
		[]string{tailwind.Setta875, tailwind.Setta850},
		tailwind.Setta400,
		tailwind.Setta300,
		tailwind.Setta200,
		tailwind.Setta100,
		tailwind.Setta50,
	)
	return AppearanceColorScheme{
		Tailwind: tailwind,
		Shadcn: AppearanceShadcnPalette{
			Background:              tailwind.Setta875,
			Foreground:              tailwind.Setta100,
			Card:                    tailwind.Setta850,
			CardForeground:          tailwind.Setta100,
			Popover:                 tailwind.Setta850,
			PopoverForeground:       tailwind.Setta100,
			Primary:                 tailwind.Setta300,
			PrimaryForeground:       highContrastForeground(tailwind.Setta300),
			Secondary:               tailwind.Setta850,
			SecondaryForeground:     tailwind.Setta100,
			Muted:                   tailwind.Setta850,
			MutedForeground:         mutedForeground,
			Accent:                  tailwind.Setta850,
			AccentForeground:        tailwind.Setta100,
			Destructive:             destructive,
			DestructiveForeground:   highContrastForeground(destructive),
			Border:                  tailwind.Setta850,
			Input:                   tailwind.Setta850,
			Ring:                    tailwind.Setta400,
			Sidebar:                 tailwind.Setta850,
			SidebarForeground:       tailwind.Setta100,
			SidebarAccent:           tailwind.Setta700,
			SidebarAccentForeground: highContrastForeground(tailwind.Setta700),
		},
		Status: AppearanceStatusPalette{
			Info:               info,
			InfoForeground:     highContrastForeground(info),
			Success:            success,
			SuccessForeground:  highContrastForeground(success),
			Warning:            warning,
			WarningForeground:  highContrastForeground(warning),
			Alert:              alert,
			AlertForeground:    highContrastForeground(alert),
			Critical:           critical,
			CriticalForeground: highContrastForeground(critical),
		},
		Accent: accent,
	}
}
