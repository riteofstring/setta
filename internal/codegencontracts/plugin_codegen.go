package codegencontracts

type PluginTargetResolution struct {
	DefaultFileName   string
	ImplementationKey string
}

type PluginGeneratedFile struct {
	RelativePath string
	Content      string
}
