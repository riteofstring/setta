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

type UninstallOptions struct {
	PluginID string
	Scope    *PluginScope
}

type RollbackOptions struct {
	PluginID string
	Scope    *PluginScope
}

type PluginInstallResult struct {
	PluginID              string
	Version               string
	SourceScope           PluginScope
	SourcePath            string
	CanonicalSourceKey    string
	SourceDigestSHA256    *string
	RequestedCapabilities []string
	Components            []string
	State                 PluginRuntimeState
	RestartRequired       bool
}

type PluginUninstallResult struct {
	PluginID         string
	RemovedFromScope PluginScope
	RestartRequired  bool
}

type PluginUpdateResult struct {
	PluginID           string
	FromVersion        string
	ToVersion          string
	SourceDigestSHA256 *string
	RestartRequired    bool
}

type PluginRollbackResult struct {
	PluginID           string
	RestoredVersion    string
	SourceDigestSHA256 *string
	RestartRequired    bool
}
