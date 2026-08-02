package uisettings

type OverviewTabName string

const (
	OverviewTabNameOverview          OverviewTabName = "Overview"
	OverviewTabNamePlugins           OverviewTabName = "Plugins"
	OverviewTabNameFileBrowser       OverviewTabName = "FileBrowser"
	OverviewTabNameGit               OverviewTabName = "Git"
	OverviewTabNameApp               OverviewTabName = "App"
	OverviewTabNameRunInstructions   OverviewTabName = "RunInstructions"
	OverviewTabNameViewModes         OverviewTabName = "ViewModes"
	OverviewTabNameNotifications     OverviewTabName = "Notifications"
	OverviewTabNameProjectAIChat     OverviewTabName = "ProjectAIChat"
	OverviewTabNameProjectAISettings OverviewTabName = "ProjectAISettings"
)

type PluginOverviewTabPrefix string

const PluginOverviewTabPrefixValue PluginOverviewTabPrefix = "PluginPane"

type UIEditorTabName string

const (
	UIEditorTabNameSectionConfig         UIEditorTabName = "SectionConfig"
	UIEditorTabNameQuickInfoConfig       UIEditorTabName = "QuickInfoConfig"
	UIEditorTabNameUIConfig              UIEditorTabName = "UIConfig"
	UIEditorTabNameInfoConfig            UIEditorTabName = "InfoConfig"
	UIEditorTabNameSectionVariantsConfig UIEditorTabName = "SectionVariantsConfig"
)

type OverviewTabNamesValue struct {
	Overview          OverviewTabName `json:"Overview"`
	Plugins           OverviewTabName `json:"Plugins"`
	FileBrowser       OverviewTabName `json:"FileBrowser"`
	Git               OverviewTabName `json:"Git"`
	App               OverviewTabName `json:"App"`
	RunInstructions   OverviewTabName `json:"RunInstructions"`
	ViewModes         OverviewTabName `json:"ViewModes"`
	Notifications     OverviewTabName `json:"Notifications"`
	ProjectAIChat     OverviewTabName `json:"ProjectAIChat"`
	ProjectAISettings OverviewTabName `json:"ProjectAISettings"`
}

type OverviewTabTitlesValue struct {
	Overview          string `json:"Overview"`
	Plugins           string `json:"Plugins"`
	FileBrowser       string `json:"FileBrowser"`
	Git               string `json:"Git"`
	App               string `json:"App"`
	RunInstructions   string `json:"RunInstructions"`
	ViewModes         string `json:"ViewModes"`
	Notifications     string `json:"Notifications"`
	ProjectAIChat     string `json:"ProjectAIChat"`
	ProjectAISettings string `json:"ProjectAISettings"`
}

type OverviewTabUIConfigValue struct {
	Names            OverviewTabNamesValue   `json:"names"`
	Titles           OverviewTabTitlesValue  `json:"titles"`
	PluginPanePrefix PluginOverviewTabPrefix `json:"pluginPanePrefix"`
}

type UIEditorTabNamesValue struct {
	SectionConfig         UIEditorTabName `json:"SectionConfig"`
	QuickInfoConfig       UIEditorTabName `json:"QuickInfoConfig"`
	UIConfig              UIEditorTabName `json:"UIConfig"`
	InfoConfig            UIEditorTabName `json:"InfoConfig"`
	SectionVariantsConfig UIEditorTabName `json:"SectionVariantsConfig"`
}

type UIEditorTabTitlesValue struct {
	SectionConfig         string `json:"SectionConfig"`
	QuickInfoConfig       string `json:"QuickInfoConfig"`
	UIConfig              string `json:"UIConfig"`
	InfoConfig            string `json:"InfoConfig"`
	SectionVariantsConfig string `json:"SectionVariantsConfig"`
}

type UIEditorTabUIConfigValue struct {
	Names  UIEditorTabNamesValue  `json:"names"`
	Titles UIEditorTabTitlesValue `json:"titles"`
}

var validUIEditorTabNames = map[UIEditorTabName]struct{}{
	UIEditorTabNameSectionConfig:         {},
	UIEditorTabNameQuickInfoConfig:       {},
	UIEditorTabNameUIConfig:              {},
	UIEditorTabNameInfoConfig:            {},
	UIEditorTabNameSectionVariantsConfig: {},
}

func isValidUIEditorTabName(value string) bool {
	_, ok := validUIEditorTabNames[UIEditorTabName(value)]
	return ok
}

func FrontendValueOverviewTabUIConfig() OverviewTabUIConfigValue {
	return OverviewTabUIConfigValue{
		Names: OverviewTabNamesValue{
			Overview:          OverviewTabNameOverview,
			Plugins:           OverviewTabNamePlugins,
			FileBrowser:       OverviewTabNameFileBrowser,
			Git:               OverviewTabNameGit,
			App:               OverviewTabNameApp,
			RunInstructions:   OverviewTabNameRunInstructions,
			ViewModes:         OverviewTabNameViewModes,
			Notifications:     OverviewTabNameNotifications,
			ProjectAIChat:     OverviewTabNameProjectAIChat,
			ProjectAISettings: OverviewTabNameProjectAISettings,
		},
		Titles: OverviewTabTitlesValue{
			Overview:          "Overview",
			Plugins:           "Plugins",
			FileBrowser:       "Explorer",
			Git:               "Git",
			App:               "JSON Render",
			RunInstructions:   "Custom Runs",
			ViewModes:         "View Modes",
			Notifications:     "Notifications",
			ProjectAIChat:     "Project AI Chat",
			ProjectAISettings: "Project AI Settings",
		},
		PluginPanePrefix: PluginOverviewTabPrefixValue,
	}
}

func FrontendValueUIEditorTabUIConfig() UIEditorTabUIConfigValue {
	return UIEditorTabUIConfigValue{
		Names: UIEditorTabNamesValue{
			SectionConfig:         UIEditorTabNameSectionConfig,
			QuickInfoConfig:       UIEditorTabNameQuickInfoConfig,
			UIConfig:              UIEditorTabNameUIConfig,
			InfoConfig:            UIEditorTabNameInfoConfig,
			SectionVariantsConfig: UIEditorTabNameSectionVariantsConfig,
		},
		Titles: UIEditorTabTitlesValue{
			SectionConfig:         "Section",
			QuickInfoConfig:       "Quick Info",
			UIConfig:              "Params",
			InfoConfig:            "Text Editor",
			SectionVariantsConfig: "Variants",
		},
	}
}
