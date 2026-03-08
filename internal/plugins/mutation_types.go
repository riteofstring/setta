package plugins

type CandidatePlugin struct {
	Root               string
	Manifest           PluginManifest
	CanonicalSourceKey string
	SourceDigestSHA256 *string
}

type PendingRestartRemovedBackendPlugin struct {
	PluginID              string
	Name                  string
	Version               string
	Scope                 PluginScope
	SourcePath            string
	CanonicalSourceKey    string
	SourceDigestSHA256    *string
	RequestedCapabilities []string
	EffectiveCapabilities []string
	BlockedCapabilities   []PluginBlockedCapability
}

type InstallOptions struct {
	SourceSpec string
	Scope      *PluginScope
	Installer  *PluginInstallerBackend
	Enable     bool
	Force      bool
}

type UpdateOptions struct {
	PluginID string
	Scope    *PluginScope
	To       string
}

type EnableDisableOptions struct {
	PluginID string
}

type UninstallOptions struct {
	PluginID string
	Scope    *PluginScope
}

type RollbackOptions struct {
	PluginID string
	Scope    *PluginScope
}

type PluginInstallResult struct {
	PluginID              string             `json:"pluginId"`
	Version               string             `json:"version"`
	SourceScope           PluginScope        `json:"sourceScope"`
	SourcePath            string             `json:"sourcePath"`
	CanonicalSourceKey    string             `json:"canonicalSourceKey"`
	SourceDigestSHA256    *string            `json:"sourceDigestSha256"`
	RequestedCapabilities []string           `json:"requestedCapabilities"`
	Components            []string           `json:"components"`
	State                 PluginRuntimeState `json:"state"`
	RestartRequired       bool               `json:"restartRequired"`
}

type PluginEnableDisableResult struct {
	PluginID        string             `json:"pluginId"`
	State           PluginRuntimeState `json:"state"`
	RestartRequired bool               `json:"restartRequired"`
}

type PluginUninstallResult struct {
	PluginID         string      `json:"pluginId"`
	RemovedFromScope PluginScope `json:"removedFromScope"`
	RestartRequired  bool        `json:"restartRequired"`
}

type PluginUpdateResult struct {
	PluginID           string  `json:"pluginId"`
	FromVersion        string  `json:"fromVersion"`
	ToVersion          string  `json:"toVersion"`
	SourceDigestSHA256 *string `json:"sourceDigestSha256"`
	RestartRequired    bool    `json:"restartRequired"`
}

type PluginRollbackResult struct {
	PluginID           string  `json:"pluginId"`
	RestoredVersion    string  `json:"restoredVersion"`
	SourceDigestSHA256 *string `json:"sourceDigestSha256"`
	RestartRequired    bool    `json:"restartRequired"`
}
