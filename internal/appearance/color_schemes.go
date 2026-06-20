package appearance

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
	card := "oklch(1.0000 0.0000 0.00)"
	destructive := "oklch(0.6368 0.2078 25.33)"
	info := "oklch(0.6231 0.1880 259.81)"
	success := "oklch(0.7227 0.1920 149.58)"
	warning := "oklch(0.7686 0.1647 70.08)"
	alert := "oklch(0.7686 0.1647 70.08)"
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
	}
}

func defaultDarkColorScheme(tailwind AppearanceTailwindPalette) AppearanceColorScheme {
	destructive := "oklch(0.6368 0.2078 25.33)"
	info := "oklch(0.7137 0.1434 254.62)"
	success := "oklch(0.7227 0.1920 149.58)"
	warning := "oklch(0.7686 0.1647 70.08)"
	alert := "oklch(0.4732 0.1247 46.20)"
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
	}
}
