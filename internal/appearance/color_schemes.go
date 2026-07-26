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

// Light accent lightness is tuned per hue so each accent keeps at least a
// 4.5:1 WCAG AA contrast ratio as text on Setta100, the darkest common light
// surface.
func defaultLightAccentPalette() AppearanceAccentPalette {
	return AppearanceAccentPalette{
		Cyan:    "oklch(0.4700 0.1300 213.38)",
		Blue:    "oklch(0.5000 0.1600 255.00)",
		Violet:  "oklch(0.5200 0.1800 290.00)",
		Magenta: "oklch(0.5200 0.1900 340.00)",
		Red:     "oklch(0.5200 0.2100 25.00)",
		Amber:   "oklch(0.5000 0.1500 70.00)",
		Green:   "oklch(0.4800 0.1500 152.00)",
		Teal:    "oklch(0.4700 0.1150 185.00)",
	}
}

func defaultSettaLightColorScheme(tailwind AppearanceTailwindPalette) AppearanceColorScheme {
	scheme := defaultLightColorScheme(tailwind)
	scheme.Shadcn.Primary = tailwind.Setta600
	scheme.Shadcn.PrimaryForeground = highContrastForeground(scheme.Shadcn.Primary)
	scheme.Shadcn.Ring = settaLogoCyan
	scheme.Status.Info = settaLogoCyan
	scheme.Status.InfoForeground = highContrastForeground(scheme.Status.Info)
	return scheme
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

func defaultLightColorScheme(tailwind AppearanceTailwindPalette) AppearanceColorScheme {
	accent := defaultLightAccentPalette()
	card := "oklch(1.0000 0.0000 0.00)"
	destructive := "oklch(0.6368 0.2078 25.33)"
	info := accent.Blue
	success := accent.Green
	warning := accent.Amber
	alert := accent.Magenta
	critical := destructive
	mutedForeground := firstReadableForeground(
		[]string{tailwind.Setta50, card},
		tailwind.Setta600,
		tailwind.Setta700,
		tailwind.Setta800,
		tailwind.Setta900,
		tailwind.Setta950,
		tailwind.Setta975,
	)
	return AppearanceColorScheme{
		Tailwind: tailwind,
		Shadcn: AppearanceShadcnPalette{
			Background:              tailwind.Setta50,
			Foreground:              tailwind.Setta900,
			Card:                    card,
			CardForeground:          tailwind.Setta900,
			Popover:                 card,
			PopoverForeground:       tailwind.Setta900,
			Primary:                 tailwind.Setta600,
			PrimaryForeground:       highContrastForeground(tailwind.Setta600),
			Secondary:               tailwind.Setta100,
			SecondaryForeground:     tailwind.Setta800,
			Muted:                   tailwind.Setta100,
			MutedForeground:         mutedForeground,
			Accent:                  tailwind.Setta200,
			AccentForeground:        tailwind.Setta800,
			Destructive:             destructive,
			DestructiveForeground:   highContrastForeground(destructive),
			Border:                  tailwind.Setta200,
			Input:                   tailwind.Setta200,
			Ring:                    tailwind.Setta500,
			Sidebar:                 tailwind.Setta100,
			SidebarForeground:       tailwind.Setta800,
			SidebarAccent:           tailwind.Setta200,
			SidebarAccentForeground: bestReadableForeground(tailwind.Setta200, tailwind.Setta900, accessibleBlack),
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
