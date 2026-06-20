package appearance

// AppearanceAccentPalette holds the semantic accent hues anchored to the Setta
// logo cyan: violet marks agent activity, blue marks links and selection,
// green/amber/red mark additions/changes/errors, teal marks metadata and
// inline code, and magenta marks attention-needed states.
type AppearanceAccentPalette struct {
	Cyan    string `json:"cyan"`
	Blue    string `json:"blue"`
	Violet  string `json:"violet"`
	Magenta string `json:"magenta"`
	Red     string `json:"red"`
	Amber   string `json:"amber"`
	Green   string `json:"green"`
	Teal    string `json:"teal"`
}

func validateAccentPalette(label string, palette AppearanceAccentPalette) error {
	values := []namedValue{
		{"cyan", palette.Cyan},
		{"blue", palette.Blue},
		{"violet", palette.Violet},
		{"magenta", palette.Magenta},
		{"red", palette.Red},
		{"amber", palette.Amber},
		{"green", palette.Green},
		{"teal", palette.Teal},
	}
	return validateOKLCHFields(label, values)
}
