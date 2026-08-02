package deployments

type RunSnapshotModeOption struct {
	Value       RunSnapshotMode `json:"value"`
	Label       string          `json:"label"`
	Description string          `json:"description"`
}

type RunSnapshotModeUIConfigValue struct {
	Options           []RunSnapshotModeOption `json:"options"`
	DeploymentOptions []RunSnapshotModeOption `json:"deploymentOptions"`
}

var frontendRunSnapshotModeOptions = []RunSnapshotModeOption{
	{
		Value:       RunSnapshotModeEphemeral,
		Label:       "Ephemeral",
		Description: "Snapshot per run, cleaned up automatically.",
	},
	{
		Value:       RunSnapshotModeAlways,
		Label:       "Always",
		Description: "Snapshot per run, stored under code history.",
	},
	{
		Value:       RunSnapshotModeNever,
		Label:       "Never",
		Description: "Run from canonical files without a snapshot.",
	},
}

// Keep run-snapshot labels, descriptions, and deployment-allowed mode subsets
// Go-owned so the frontend does not restate backend mode semantics.
func FrontendValueRunSnapshotModeUIConfig() RunSnapshotModeUIConfigValue {
	return RunSnapshotModeUIConfigValue{
		Options: cloneRunSnapshotModeOptions(frontendRunSnapshotModeOptions),
		DeploymentOptions: frontendRunSnapshotModeOptionsFor(
			RunSnapshotModeEphemeral,
			RunSnapshotModeAlways,
		),
	}
}

func frontendRunSnapshotModeOptionsFor(
	values ...RunSnapshotMode,
) []RunSnapshotModeOption {
	options := make([]RunSnapshotModeOption, 0, len(values))
	for _, value := range values {
		for _, option := range frontendRunSnapshotModeOptions {
			if option.Value == value {
				options = append(options, option)
				break
			}
		}
	}
	return cloneRunSnapshotModeOptions(options)
}

func cloneRunSnapshotModeOptions(
	options []RunSnapshotModeOption,
) []RunSnapshotModeOption {
	return append([]RunSnapshotModeOption(nil), options...)
}
