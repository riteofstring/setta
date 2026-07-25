package conversationpalette

import "testing"

func TestCatalogPreservesApprovedOrderAndSemanticTokens(t *testing.T) {
	wantIDs := []ConversationPaletteID{
		ConversationPaletteSky,
		ConversationPaletteBlue,
		ConversationPaletteViolet,
		ConversationPaletteMagenta,
		ConversationPaletteAmber,
		ConversationPaletteGreen,
		ConversationPaletteTeal,
	}
	palettes := Catalog()
	if len(palettes) != len(wantIDs) {
		t.Fatalf("catalog length = %d, want %d", len(palettes), len(wantIDs))
	}
	seen := map[ConversationPaletteID]bool{}
	for index, palette := range palettes {
		if palette.ID != wantIDs[index] {
			t.Errorf("catalog[%d].ID = %q, want %q", index, palette.ID, wantIDs[index])
		}
		if seen[palette.ID] {
			t.Errorf("catalog contains duplicate palette ID %q", palette.ID)
		}
		seen[palette.ID] = true
		for mode, tokens := range map[string]SemanticTokens{"dark": palette.Dark, "light": palette.Light} {
			if tokens.ConversationAccent == "" || tokens.ConversationAccentForeground == "" {
				t.Errorf("palette %q %s tokens are incomplete: %+v", palette.ID, mode, tokens)
			}
			if tokens.ConversationFocusRing != tokens.ConversationAccent {
				t.Errorf("palette %q %s focus ring = %q, want accent %q", palette.ID, mode, tokens.ConversationFocusRing, tokens.ConversationAccent)
			}
		}
		lookedUp, ok := Lookup(palette.ID)
		if !ok || lookedUp != palette {
			t.Errorf("Lookup(%q) = %+v, %v; want %+v, true", palette.ID, lookedUp, ok, palette)
		}
	}
	if _, ok := Lookup("missing"); ok {
		t.Fatal("Lookup(missing) succeeded")
	}
}

func TestCatalogReturnsIndependentSlices(t *testing.T) {
	first := Catalog()
	first[0].ID = "changed"
	second := Catalog()
	if second[0].ID != ConversationPaletteSky {
		t.Fatalf("catalog mutation escaped: first ID = %q", second[0].ID)
	}

	ids := IDs()
	ids[0] = "changed"
	if got := IDs()[0]; got != ConversationPaletteSky {
		t.Fatalf("ID mutation escaped: first ID = %q", got)
	}
}
