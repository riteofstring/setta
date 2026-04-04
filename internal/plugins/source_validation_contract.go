package plugins

const (
	unsupportedPluginSourceSpecMessagePrefix   = "Unsupported plugin source spec: "
	unsupportedPluginSourceSpecMessageFormat   = unsupportedPluginSourceSpecMessagePrefix + "%s"
	unsupportedPluginSourceSchemeMessagePrefix = "Unsupported plugin source scheme: "
	unsupportedPluginSourceSchemeMessageFormat = unsupportedPluginSourceSchemeMessagePrefix + "%s"
	gitHubPluginSourceUsageMessage             = "GitHub source must be github:<owner>/<repo>[#ref] or github:<owner>/<repo>@ref."
	pyPIPluginSourceUsageMessage               = "PyPI source must be pypi:<package>[==version]."
	invalidPyPISourceSpecMessagePrefix         = "Invalid PyPI source spec: "
	invalidPyPISourceSpecMessageFormat         = invalidPyPISourceSpecMessagePrefix + "%s"
	invalidPackageNameMessagePrefix            = "Invalid package name: "
	invalidPackageNameMessageFormat            = invalidPackageNameMessagePrefix + "%q"
)

type FrontendSourceValidationContract struct {
	GitHubScheme                 string
	PyPIScheme                   string
	GitHubUsageMessage           string
	PyPIUsageMessage             string
	UnsupportedSpecPrefix        string
	UnsupportedSchemePrefix      string
	InvalidPyPISpecPrefix        string
	InvalidPackageNamePrefix     string
	AllowedPackageNameCharacters []string
}

func FrontendSourceValidationContractData() FrontendSourceValidationContract {
	return FrontendSourceValidationContract{
		GitHubScheme:                 string(PluginSourceSchemeGitHub),
		PyPIScheme:                   string(PluginSourceSchemePyPI),
		GitHubUsageMessage:           gitHubPluginSourceUsageMessage,
		PyPIUsageMessage:             pyPIPluginSourceUsageMessage,
		UnsupportedSpecPrefix:        unsupportedPluginSourceSpecMessagePrefix,
		UnsupportedSchemePrefix:      unsupportedPluginSourceSchemeMessagePrefix,
		InvalidPyPISpecPrefix:        invalidPyPISourceSpecMessagePrefix,
		InvalidPackageNamePrefix:     invalidPackageNameMessagePrefix,
		AllowedPackageNameCharacters: pluginPackageNameAllowedCharacters(),
	}
}

func pluginPackageNameAllowedCharacters() []string {
	characters := make([]string, 0, 26+10+3)
	for char := byte('a'); char <= byte('z'); char++ {
		characters = append(characters, string(char))
	}
	for char := byte('0'); char <= byte('9'); char++ {
		characters = append(characters, string(char))
	}
	return append(characters, "-", "_", ".")
}
