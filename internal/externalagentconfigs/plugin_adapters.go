package externalagentconfigs

type PluginExternalAgentAdapter struct {
	AdapterID       string
	PluginID        string
	Name            string
	RunModes        []string
	Command         string
	Args            []string
	EnvVarWhitelist []string
	DefaultModel    *string
}

type PluginExternalAgentAdapterProvider interface {
	RegisteredExternalAgentAdapters() ([]PluginExternalAgentAdapter, error)
}
