package hostedmeasurement

import "setta/internal/runtimeprovider"

const (
	BaseImage = "gcr.io/distroless/static-debian12@sha256:597c2b4bc7f353100af9b8b06bb4f126c4a45f9d8175e25d4f01f965d5d94396"
)

type DeploymentShape struct {
	AppCount               int    `json:"app_count"`
	MachineCount           int    `json:"machine_count"`
	CPUKind                string `json:"cpu_kind"`
	CPUs                   int    `json:"cpus"`
	MemoryMiB              int    `json:"memory_mib"`
	VolumeCount            int    `json:"volume_count"`
	VolumeSizeGiB          int    `json:"volume_size_gib"`
	VolumeEncrypted        bool   `json:"volume_encrypted"`
	ScheduledSnapshots     bool   `json:"scheduled_snapshots"`
	InternalPort           int    `json:"internal_port"`
	ForceHTTPS             bool   `json:"force_https"`
	HardConcurrencyLimit   int    `json:"hard_concurrency_limit"`
	AutoStartMachines      bool   `json:"auto_start_machines"`
	AutoStopMachines       string `json:"auto_stop_machines"`
	MinimumMachinesRunning int    `json:"minimum_machines_running"`
	HealthPath             string `json:"health_path"`
	DataDirectory          string `json:"data_directory"`
	SecretDirectory        string `json:"secret_directory"`
	RuntimeTarget          string `json:"runtime_target"`
}

type PlanAction struct {
	Sequence int    `json:"sequence"`
	Stage    string `json:"stage"`
	Provider string `json:"provider"`
	Mutation bool   `json:"mutation"`
	Code     string `json:"code"`
}

type Plan struct {
	SchemaVersion       int                              `json:"schema_version"`
	RunID               string                           `json:"run_id"`
	ManifestDigest      string                           `json:"manifest_digest"`
	FlyOrganization     string                           `json:"fly_organization"`
	FlyRegion           string                           `json:"fly_region"`
	FlyAppName          string                           `json:"fly_app_name"`
	SpritesOrganization string                           `json:"sprites_organization"`
	MaximumSpendUSD     string                           `json:"maximum_spend_usd"`
	CleanupDeadline     string                           `json:"cleanup_deadline"`
	BaseImage           string                           `json:"base_image"`
	SpriteResources     runtimeprovider.RuntimeResources `json:"sprite_resources"`
	Shape               DeploymentShape                  `json:"shape"`
	Actions             []PlanAction                     `json:"actions"`
}

func BuildPlan(authorization Authorization) Plan {
	actions := []PlanAction{
		{Stage: "preflight", Provider: "local", Code: "validate_manifest_and_distinct_credential_sources"},
		{Stage: "preflight", Provider: "fly", Code: "capture_independent_organization_inventory"},
		{Stage: "preflight", Provider: "sprites", Code: "capture_independent_organization_inventory"},
		{Stage: "artifact", Provider: "local", Code: "build_and_verify_checksummed_linux_amd64_release"},
		{Stage: "artifact", Provider: "local", Code: "build_pinned_image_and_record_digest"},
		{Stage: "deploy", Provider: "fly", Mutation: true, Code: "create_exact_app"},
		{Stage: "deploy", Provider: "fly", Mutation: true, Code: "create_encrypted_one_gib_volume_without_scheduled_snapshots"},
		{Stage: "deploy", Provider: "fly", Mutation: true, Code: "stage_secrets_from_stdin"},
		{Stage: "deploy", Provider: "fly", Mutation: true, Code: "create_exactly_one_machine"},
		{Stage: "deploy", Provider: "fly", Code: "confirm_shape_placement_digest_and_health"},
		{Stage: "runtime", Provider: "sprites", Mutation: true, Code: "create_disposable_private_sprite"},
		{Stage: "runtime", Provider: "sprites", Mutation: true, Code: "install_signed_runtime_and_bootstrap"},
		{Stage: "runtime", Provider: "local", Code: "confirm_route_closed_until_secret_and_grant_are_durable"},
		{Stage: "measurement", Provider: "local", Mutation: true, Code: "run_only_authorized_http_sse_workload"},
		{Stage: "cleanup", Provider: "local", Mutation: true, Code: "revoke_grant_and_remove_client_credential"},
		{Stage: "cleanup", Provider: "sprites", Mutation: true, Code: "destroy_sprite_and_confirm_absence"},
		{Stage: "cleanup", Provider: "fly", Mutation: true, Code: "destroy_exact_machine_and_confirm_absence"},
		{Stage: "cleanup", Provider: "fly", Mutation: true, Code: "destroy_exact_volume_and_confirm_absence"},
		{Stage: "cleanup", Provider: "fly", Mutation: true, Code: "destroy_exact_app_and_confirm_independent_absence"},
		{Stage: "cleanup", Provider: "local", Code: "record_content_free_cleanup_proof"},
	}
	for index := range actions {
		actions[index].Sequence = index + 1
	}
	return Plan{
		SchemaVersion:       1,
		RunID:               authorization.Manifest.RunID,
		ManifestDigest:      authorization.ManifestDigest,
		FlyOrganization:     authorization.Manifest.FlyOrganization,
		FlyRegion:           authorization.Manifest.FlyRegion,
		FlyAppName:          authorization.Manifest.FlyAppName,
		SpritesOrganization: authorization.Manifest.SpritesOrganization,
		MaximumSpendUSD:     authorization.Manifest.MaximumSpendUSD,
		CleanupDeadline:     authorization.Manifest.CleanupDeadline,
		BaseImage:           BaseImage,
		SpriteResources:     authorization.Manifest.SpriteResources,
		Shape: DeploymentShape{
			AppCount:               1,
			MachineCount:           1,
			CPUKind:                "shared",
			CPUs:                   1,
			MemoryMiB:              256,
			VolumeCount:            1,
			VolumeSizeGiB:          1,
			VolumeEncrypted:        true,
			ScheduledSnapshots:     false,
			InternalPort:           8080,
			ForceHTTPS:             true,
			HardConcurrencyLimit:   64,
			AutoStartMachines:      true,
			AutoStopMachines:       "stop",
			MinimumMachinesRunning: 0,
			HealthPath:             "/healthz",
			DataDirectory:          "/data/control-plane",
			SecretDirectory:        "/data/runtime-secrets",
			RuntimeTarget:          "127.0.0.1:7345",
		},
		Actions: actions,
	}
}
