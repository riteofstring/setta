package conversationpalette

type ConversationPaletteID string

const (
	ConversationPaletteSky     ConversationPaletteID = "sky"
	ConversationPaletteBlue    ConversationPaletteID = "blue"
	ConversationPaletteViolet  ConversationPaletteID = "violet"
	ConversationPaletteMagenta ConversationPaletteID = "magenta"
	ConversationPaletteAmber   ConversationPaletteID = "amber"
	ConversationPaletteGreen   ConversationPaletteID = "green"
	ConversationPaletteTeal    ConversationPaletteID = "teal"
)

type SemanticTokens struct {
	ConversationAccent           string `json:"conversationAccent"`
	ConversationAccentForeground string `json:"conversationAccentForeground"`
	ConversationFocusRing        string `json:"conversationFocusRing"`
}

type ConversationPalette struct {
	ID    ConversationPaletteID `json:"id"`
	Dark  SemanticTokens        `json:"dark"`
	Light SemanticTokens        `json:"light"`
}

const (
	darkForeground  = "oklch(0.0697 0.0051 260.18)"
	lightForeground = "oklch(0.9574 0.0071 267.38)"
)

var catalog = []ConversationPalette{
	newConversationPalette(ConversationPaletteSky, "oklch(0.846 0.1292 213.38)", "oklch(0.48 0.13 213.38)"),
	newConversationPalette(ConversationPaletteBlue, "oklch(0.76 0.115 250)", "oklch(0.48 0.13 250)"),
	newConversationPalette(ConversationPaletteViolet, "oklch(0.76 0.125 290)", "oklch(0.48 0.14 290)"),
	newConversationPalette(ConversationPaletteMagenta, "oklch(0.77 0.135 335)", "oklch(0.48 0.16 335)"),
	newConversationPalette(ConversationPaletteAmber, "oklch(0.82 0.135 78)", "oklch(0.48 0.12 78)"),
	newConversationPalette(ConversationPaletteGreen, "oklch(0.79 0.145 152)", "oklch(0.48 0.13 152)"),
	newConversationPalette(ConversationPaletteTeal, "oklch(0.82 0.125 185)", "oklch(0.48 0.11 185)"),
}

func Catalog() []ConversationPalette {
	result := make([]ConversationPalette, len(catalog))
	copy(result, catalog)
	return result
}

func IDs() []ConversationPaletteID {
	result := make([]ConversationPaletteID, 0, len(catalog))
	for _, palette := range catalog {
		result = append(result, palette.ID)
	}
	return result
}

func Lookup(id ConversationPaletteID) (ConversationPalette, bool) {
	for _, palette := range catalog {
		if palette.ID == id {
			return palette, true
		}
	}
	return ConversationPalette{}, false
}

func newConversationPalette(id ConversationPaletteID, darkAccent string, lightAccent string) ConversationPalette {
	return ConversationPalette{
		ID: id,
		Dark: SemanticTokens{
			ConversationAccent:           darkAccent,
			ConversationAccentForeground: darkForeground,
			ConversationFocusRing:        darkAccent,
		},
		Light: SemanticTokens{
			ConversationAccent:           lightAccent,
			ConversationAccentForeground: lightForeground,
			ConversationFocusRing:        lightAccent,
		},
	}
}
