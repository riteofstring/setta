package codexruntime

import stdruntime "runtime"

const (
	ProviderCodex = "codex"

	StrategyBundledStandaloneAppServer = "bundled-standalone-app-server"

	RequiredCodexSourceCommit          = "ab16046c88b2ea9e9af849ab6662129c6becb151"
	RequiredProtocolSchemaCommit       = "67009bc53ffc684eaf235c6186df890d35259240"
	RequiredArtifactName               = "codex-app-server"
	RequiredAppServerSessionSource     = "app-server"
	DevelopmentOverrideEnv             = "SETTA_CODEX_BIN"
	ManagedRuntimeDirectoryName        = "codex-runtime"
	ManagedRuntimeIntegrityDescription = "artifact SHA-256 computed at runtime plus startup protocol probe"
)

type ManagedRuntimeManifest struct {
	Strategy                string `json:"strategy"`
	CodexSourceCommit       string `json:"codexSourceCommit"`
	ProtocolSchemaCommit    string `json:"protocolSchemaCommit"`
	ArtifactName            string `json:"artifactName"`
	Platform                string `json:"platform"`
	Integrity               string `json:"integrity"`
	RequiredSessionSource   string `json:"requiredSessionSource"`
	DevelopmentOverrideEnv  string `json:"developmentOverrideEnv"`
	ManagedRuntimeDirectory string `json:"managedRuntimeDirectory"`
}

func Manifest() ManagedRuntimeManifest {
	return ManagedRuntimeManifest{
		Strategy:                StrategyBundledStandaloneAppServer,
		CodexSourceCommit:       RequiredCodexSourceCommit,
		ProtocolSchemaCommit:    RequiredProtocolSchemaCommit,
		ArtifactName:            platformExecutableName(RequiredArtifactName),
		Platform:                Platform(),
		Integrity:               ManagedRuntimeIntegrityDescription,
		RequiredSessionSource:   RequiredAppServerSessionSource,
		DevelopmentOverrideEnv:  DevelopmentOverrideEnv,
		ManagedRuntimeDirectory: ManagedRuntimeDirectoryName,
	}
}

func Platform() string {
	return stdruntime.GOOS + "/" + stdruntime.GOARCH
}
