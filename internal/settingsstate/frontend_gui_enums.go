package settingsstate

type BackgroundVariant string

const (
	BackgroundVariantLines BackgroundVariant = "lines"
	BackgroundVariantDots  BackgroundVariant = "dots"
	BackgroundVariantCross BackgroundVariant = "cross"
)

type SelectionMode string

const (
	SelectionModePartial SelectionMode = "partial"
	SelectionModeFull    SelectionMode = "full"
)

type PanOnScrollMode string

const (
	PanOnScrollModeFree       PanOnScrollMode = "free"
	PanOnScrollModeVertical   PanOnScrollMode = "vertical"
	PanOnScrollModeHorizontal PanOnScrollMode = "horizontal"
)

func BackgroundVariantValues() []string {
	return []string{
		string(BackgroundVariantLines),
		string(BackgroundVariantDots),
		string(BackgroundVariantCross),
	}
}

func SelectionModeValues() []string {
	return []string{
		string(SelectionModePartial),
		string(SelectionModeFull),
	}
}

func PanOnScrollModeValues() []string {
	return []string{
		string(PanOnScrollModeFree),
		string(PanOnScrollModeVertical),
		string(PanOnScrollModeHorizontal),
	}
}
