package plugins

const (
	pluginSourceSpecRequiredMessage            = "Source spec is required."
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
