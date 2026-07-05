package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	awsProvisionProviderID           = "aws"
	awsQuickCreateTemplateAssetName  = "setta-runtime-aws-cloudformation.yaml"
	awsUbuntu2404AmiSSMParameter     = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
	defaultProvisionRuntimeName      = "setta-cloud-runtime"
	defaultProvisioningTTL           = time.Hour
	cfnMarkerRuntimeName             = "%%setta_cfn_runtime_name%%"
	cfnMarkerTailscaleAuthKey        = "%%setta_cfn_tailscale_auth_key%%"
	cfnMarkerPairingTokenHash        = "%%setta_cfn_pairing_token_hash%%"
	cfnMarkerProvisionID             = "%%setta_cfn_provision_id%%"
	cfnMarkerProvisionAttestationKey = "%%setta_cfn_provision_attestation_key%%"
	cfnMarkerProvisionExpiresAt      = "%%setta_cfn_provision_expires_at%%"
)

type provisionRenderLinkOptions struct {
	AppDataDir          string
	BootstrapPath       string
	DiskGB              int
	ExpiresAt           string
	InstallRepo         string
	InstallerSHA256     string
	InstallerURL        string
	InstanceType        string
	JSON                bool
	MinisignPublicKey   string
	Provider            string
	ProvisionID         string
	Region              string
	ReleaseBaseURL      string
	RuntimeName         string
	RuntimePort         int
	SeedPath            string
	ServiceGroup        string
	ServiceUser         string
	SettaVersion        string
	SetupReportPath     string
	Shape               string
	StackName           string
	SubnetID            string
	TailscaleInstallURL string
	TemplateURL         string
	VPCID               string
}

type provisionRenderLinkResult struct {
	OK                       bool                           `json:"ok"`
	Provider                 string                         `json:"provider"`
	Region                   string                         `json:"region"`
	RuntimeName              string                         `json:"runtimeName"`
	StackName                string                         `json:"stackName"`
	QuickCreateURL           string                         `json:"quickCreateUrl"`
	DeleteStackURL           string                         `json:"deleteStackUrl"`
	TemplateURL              string                         `json:"templateUrl"`
	Template                 string                         `json:"template"`
	TemplateSHA256           string                         `json:"templateSha256"`
	SecretFreeQuickCreateURL bool                           `json:"secretFreeQuickCreateUrl"`
	Resolution               provisionResolvedCandidate     `json:"resolution"`
	PrefilledParameters      []provisionLinkParameterValue  `json:"prefilledParameters"`
	ManualParameters         []provisionLinkManualParameter `json:"manualParameters"`
	Warnings                 []string                       `json:"warnings,omitempty"`
}

type provisionLinkParameterValue struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description"`
}

type provisionLinkManualParameter struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	NoEcho      bool   `json:"noEcho"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
}

func runProvisionRenderLink(args []string, deps cliDeps) error {
	options, err := provisionRenderLinkOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := renderProvisionLink(options)
	if err != nil {
		return err
	}
	return encodeProvisionJSON(deps, result, "render-link JSON")
}

func provisionRenderLinkOptionsFromArgs(args []string, deps cliDeps) (provisionRenderLinkOptions, error) {
	options := provisionRenderLinkOptions{
		AppDataDir:          defaultProvisionAppDataDir,
		BootstrapPath:       defaultProvisionBootstrapPath,
		InstallRepo:         defaultProvisionInstallRepo,
		Provider:            awsProvisionProviderID,
		RuntimeName:         defaultProvisionRuntimeName,
		RuntimePort:         defaultProvisionRuntimePort,
		ServiceGroup:        defaultProvisionServiceGroup,
		ServiceUser:         defaultProvisionServiceUser,
		SettaVersion:        version,
		SetupReportPath:     defaultProvisionSetupReportPath,
		Shape:               defaultProvisionShape,
		TailscaleInstallURL: defaultProvisionTailscaleInstall,
	}
	flagSet := newFlagSet("setta provision render-link", deps.stderr)
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	flagSet.StringVar(&options.Provider, "provider", options.Provider, "provider id; only aws is supported")
	flagSet.StringVar(&options.RuntimeName, "runtime-name", options.RuntimeName, "Tailscale hostname for the runtime")
	flagSet.StringVar(&options.StackName, "stack-name", "", "AWS CloudFormation stack name")
	flagSet.StringVar(&options.Shape, "shape", options.Shape, "machine shape used for fallback instance selection")
	flagSet.StringVar(&options.Region, "region", "", "AWS region")
	flagSet.IntVar(&options.DiskGB, "disk-gb", 0, "boot disk size in GiB; defaults to the shape floor")
	flagSet.StringVar(&options.InstanceType, "instance-type", "", "exact AWS EC2 instance type override")
	flagSet.StringVar(&options.ProvisionID, "provision-id", "", "non-secret provisioning correlation ID")
	flagSet.StringVar(&options.ExpiresAt, "expires-at", "", "RFC3339Nano provisioning expiry; defaults to one hour from now")
	flagSet.StringVar(&options.VPCID, "vpc-id", "", "optional AWS VPC id for accounts without a default VPC")
	flagSet.StringVar(&options.SubnetID, "subnet-id", "", "optional AWS subnet id for accounts without a default subnet")
	flagSet.StringVar(&options.SettaVersion, "setta-version", options.SettaVersion, "explicit Setta release version")
	flagSet.StringVar(&options.InstallRepo, "install-repo", options.InstallRepo, "GitHub owner/repo for release downloads")
	flagSet.StringVar(&options.ReleaseBaseURL, "release-base-url", "", "explicit release asset base URL")
	flagSet.StringVar(&options.TemplateURL, "template-url", "", "published CloudFormation template URL")
	flagSet.StringVar(&options.InstallerURL, "installer-url", "", "pinned installer script URL")
	flagSet.StringVar(&options.InstallerSHA256, "installer-sha256", "", "expected SHA-256 of the installer script")
	flagSet.StringVar(&options.MinisignPublicKey, "minisign-public-key", "", "minisign public key trusted for release verification")
	flagSet.StringVar(&options.ServiceUser, "service-user", options.ServiceUser, "runtime service user")
	flagSet.StringVar(&options.ServiceGroup, "service-group", options.ServiceGroup, "runtime service group")
	flagSet.StringVar(&options.AppDataDir, "app-data-dir", options.AppDataDir, "runtime app data directory")
	flagSet.StringVar(&options.SeedPath, "seed-path", "", "provisioning seed file path; defaults under app-data-dir")
	flagSet.IntVar(&options.RuntimePort, "runtime-port", options.RuntimePort, "runtime HTTP port")
	flagSet.StringVar(&options.BootstrapPath, "bootstrap-path", options.BootstrapPath, "temporary bootstrap script path")
	flagSet.StringVar(&options.SetupReportPath, "setup-report-path", options.SetupReportPath, "runtime setup report path")
	flagSet.StringVar(&options.TailscaleInstallURL, "tailscale-install-url", options.TailscaleInstallURL, "official Tailscale install script URL")
	if err := flagSet.Parse(args); err != nil {
		return provisionRenderLinkOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return provisionRenderLinkOptions{}, usageError{err: errors.New("setta provision render-link does not accept positional arguments")}
	}
	if err := normalizeProvisionRenderLinkOptions(&options, deps); err != nil {
		return provisionRenderLinkOptions{}, err
	}
	return options, nil
}

func normalizeProvisionRenderLinkOptions(options *provisionRenderLinkOptions, deps cliDeps) error {
	if !options.JSON {
		return usageError{err: errors.New("setta provision render-link requires --json")}
	}
	if err := normalizeProvisionRenderLinkSelection(options); err != nil {
		return err
	}
	if err := normalizeProvisionRenderLinkProvisioning(options, deps); err != nil {
		return err
	}
	if err := normalizeProvisionRenderLinkRelease(options); err != nil {
		return err
	}
	return validateProvisionRenderLinkLayout(options)
}

func normalizeProvisionRenderLinkSelection(options *provisionRenderLinkOptions) error {
	var err error
	options.Provider = strings.TrimSpace(options.Provider)
	if options.Provider != awsProvisionProviderID {
		return usageError{err: fmt.Errorf("setta provision render-link only supports provider %q", awsProvisionProviderID)}
	}
	if options.RuntimeName, err = validateCloudInitHostname(options.RuntimeName); err != nil {
		return err
	}
	options.Shape, err = requirePlainField("shape", options.Shape, 1, 64)
	if err != nil {
		return err
	}
	options.InstanceType = strings.TrimSpace(options.InstanceType)
	options.Region = strings.TrimSpace(options.Region)
	options.VPCID = strings.TrimSpace(options.VPCID)
	options.SubnetID = strings.TrimSpace(options.SubnetID)
	if options.StackName == "" {
		options.StackName = "setta-" + options.RuntimeName
	}
	options.StackName, err = validateCloudFormationStackName(options.StackName)
	return err
}

func normalizeProvisionRenderLinkProvisioning(options *provisionRenderLinkOptions, deps cliDeps) error {
	var err error
	if options.ProvisionID == "" {
		options.ProvisionID, err = randomProvisionID()
		if err != nil {
			return err
		}
	} else if options.ProvisionID, err = validateProvisionCloudInitID(options.ProvisionID); err != nil {
		return err
	}
	if options.ExpiresAt == "" {
		options.ExpiresAt = deps.now().UTC().Add(defaultProvisioningTTL).Format(time.RFC3339Nano)
	} else if options.ExpiresAt, err = validateRFC3339NanoField("expires-at", options.ExpiresAt); err != nil {
		return err
	}
	return nil
}

func normalizeProvisionRenderLinkRelease(options *provisionRenderLinkOptions) error {
	var err error
	if options.SettaVersion, err = validatePinnedSettaVersion(options.SettaVersion); err != nil {
		return err
	}
	if options.InstallRepo, err = validateInstallRepo(options.InstallRepo); err != nil {
		return err
	}
	if options.ReleaseBaseURL == "" {
		options.ReleaseBaseURL = "https://github.com/" + options.InstallRepo + "/releases/download/" + options.SettaVersion
	}
	return normalizeProvisionRenderLinkReleaseURLs(options)
}

func normalizeProvisionRenderLinkReleaseURLs(options *provisionRenderLinkOptions) error {
	var err error
	if options.ReleaseBaseURL, err = validateHTTPURL("release-base-url", options.ReleaseBaseURL); err != nil {
		return err
	}
	if options.TemplateURL == "" {
		options.TemplateURL = strings.TrimRight(options.ReleaseBaseURL, "/") + "/" + awsQuickCreateTemplateAssetName
	}
	if options.TemplateURL, err = validateHTTPURL("template-url", options.TemplateURL); err != nil {
		return err
	}
	if options.InstallerURL == "" {
		options.InstallerURL = strings.TrimRight(options.ReleaseBaseURL, "/") + "/install.sh"
	}
	if options.InstallerURL, err = validateHTTPURL("installer-url", options.InstallerURL); err != nil {
		return err
	}
	if options.TailscaleInstallURL, err = validateHTTPURL("tailscale-install-url", options.TailscaleInstallURL); err != nil {
		return err
	}
	if options.InstallerSHA256, err = validateSHA256Hex("installer sha256", options.InstallerSHA256); err != nil {
		return err
	}
	if options.MinisignPublicKey, err = requirePlainField("minisign public key", options.MinisignPublicKey, 8, 256); err != nil {
		return err
	}
	return nil
}

func validateProvisionRenderLinkLayout(options *provisionRenderLinkOptions) error {
	if options.RuntimePort <= 0 || options.RuntimePort > 65535 {
		return fmt.Errorf("runtime port must be between 1 and 65535: %d", options.RuntimePort)
	}
	var err error
	if options.ServiceUser, err = validateLinuxName("service user", options.ServiceUser); err != nil {
		return err
	}
	if options.ServiceGroup, err = validateLinuxName("service group", options.ServiceGroup); err != nil {
		return err
	}
	for label, path := range map[string]string{
		"app-data-dir":      options.AppDataDir,
		"bootstrap-path":    options.BootstrapPath,
		"seed-path":         options.SeedPath,
		"setup-report-path": options.SetupReportPath,
	} {
		if label == "seed-path" && path == "" {
			continue
		}
		if err := validateAbsoluteNoSpacePath(label, path); err != nil {
			return err
		}
	}
	if options.SeedPath == "" {
		options.SeedPath = pathJoin(options.AppDataDir, "provisioning-seed.json")
	}
	return nil
}

func renderProvisionLink(options provisionRenderLinkOptions) (provisionRenderLinkResult, error) {
	resolution, warnings, err := resolveAWSRenderLinkCandidate(options)
	if err != nil {
		return provisionRenderLinkResult{}, err
	}
	region := resolution.Region
	prefilled := awsQuickCreatePrefilledParameters(options, resolution)
	manual := awsQuickCreateManualParameters()
	quickCreateURL := awsQuickCreateURL(region, options.TemplateURL, options.StackName, prefilled)
	deleteStackURL := awsDeleteStackURL(region, options.StackName)
	template := renderAWSCloudFormationTemplate(options, resolution)
	return provisionRenderLinkResult{
		OK:                       true,
		Provider:                 options.Provider,
		Region:                   region,
		RuntimeName:              options.RuntimeName,
		StackName:                options.StackName,
		QuickCreateURL:           quickCreateURL,
		DeleteStackURL:           deleteStackURL,
		TemplateURL:              options.TemplateURL,
		Template:                 template,
		TemplateSHA256:           sha256Hex([]byte(template)),
		SecretFreeQuickCreateURL: awsQuickCreateURLIsSecretFree(quickCreateURL, manual),
		Resolution:               resolution,
		PrefilledParameters:      prefilled,
		ManualParameters:         manual,
		Warnings:                 warnings,
	}, nil
}

func resolveAWSRenderLinkCandidate(options provisionRenderLinkOptions) (provisionResolvedCandidate, []string, error) {
	catalog, err := loadProvisionCatalog()
	if err != nil {
		return provisionResolvedCandidate{}, nil, err
	}
	provider, ok := provisionCatalogProviderByID(catalog, awsProvisionProviderID)
	if !ok {
		return provisionResolvedCandidate{}, nil, fmt.Errorf("provision catalog missing provider %q", awsProvisionProviderID)
	}
	shape, ok := provisionCatalogShapeByID(catalog, options.Shape)
	if !ok {
		return provisionResolvedCandidate{}, nil, usageError{err: fmt.Errorf("unknown shape %q", options.Shape)}
	}
	mapping, ok := provider.Mappings[shape.ID]
	if !ok {
		return provisionResolvedCandidate{}, nil, usageError{err: fmt.Errorf("provider %q does not have a fallback mapping for shape %q", provider.ID, shape.ID)}
	}
	warnings := []string{
		"AWS quick-create uses the selected region's default VPC unless VpcId/SubnetId are filled in CloudFormation.",
	}
	if options.InstanceType != "" {
		mapping.InstanceType = options.InstanceType
		warnings = append(warnings, "instance type was supplied by the caller and was not validated against live AWS data or the fallback catalog")
	}
	resolveOptions := provisionResolveOptions{
		DiskGB: options.DiskGB,
		Region: options.Region,
	}
	constraints := provisionResolveConstraints{
		DiskGB:           options.DiskGB,
		RegionPreference: options.Region,
		ExactInstance:    options.InstanceType,
	}
	resolution, regionWarnings := catalogResolvedCandidate(provider, shape, mapping, constraints, resolveOptions)
	warnings = append(warnings, regionWarnings...)
	resolution.Warnings = append(resolution.Warnings, warnings...)
	return resolution, warnings, nil
}

func awsQuickCreatePrefilledParameters(options provisionRenderLinkOptions, resolution provisionResolvedCandidate) []provisionLinkParameterValue {
	parameters := []provisionLinkParameterValue{
		{Key: "RuntimeName", Value: options.RuntimeName, Description: "Tailscale hostname and Setta runtime name."},
		{Key: "InstanceType", Value: resolution.InstanceType, Description: "Resolved EC2 instance type."},
		{Key: "DiskGB", Value: strconv.Itoa(resolution.DiskGB), Description: "Root EBS volume size in GiB."},
		{Key: "UbuntuAmiId", Value: awsUbuntu2404AmiSSMParameter, Description: "Canonical Ubuntu 24.04 LTS public SSM parameter."},
		{Key: "ProvisionId", Value: options.ProvisionID, Description: "Non-secret Setta provisioning correlation id."},
		{Key: "ProvisionExpiresAt", Value: options.ExpiresAt, Description: "Provisioning seed expiry."},
	}
	if options.VPCID != "" {
		parameters = append(parameters, provisionLinkParameterValue{Key: "VpcId", Value: options.VPCID, Description: "AWS VPC id."})
	}
	if options.SubnetID != "" {
		parameters = append(parameters, provisionLinkParameterValue{Key: "SubnetId", Value: options.SubnetID, Description: "AWS subnet id."})
	}
	return parameters
}

func awsQuickCreateManualParameters() []provisionLinkManualParameter {
	return []provisionLinkManualParameter{
		{
			Key:         "TailscaleAuthKey",
			Label:       "Tailscale auth key",
			NoEcho:      true,
			Required:    true,
			Description: "Paste a single-use, preauthorized, tagged Tailscale auth key.",
		},
		{
			Key:         "PairingTokenHash",
			Label:       "Pairing token hash",
			NoEcho:      true,
			Required:    true,
			Description: "Paste the SHA-256 hash of the desktop-held pairing token.",
		},
		{
			Key:         "ProvisionAttestationKey",
			Label:       "Provision attestation key",
			NoEcho:      true,
			Required:    true,
			Description: "Paste the HMAC attestation key generated for this provision.",
		},
	}
}

func awsQuickCreateURL(region string, templateURL string, stackName string, prefilled []provisionLinkParameterValue) string {
	params := url.Values{}
	params.Set("templateURL", templateURL)
	params.Set("stackName", stackName)
	for _, parameter := range prefilled {
		params.Set("param_"+parameter.Key, parameter.Value)
	}
	return awsCloudFormationConsoleURL(region, "/stacks/quickcreate", params)
}

func awsDeleteStackURL(region string, stackName string) string {
	params := url.Values{}
	params.Set("stackId", stackName)
	return awsCloudFormationConsoleURL(region, "/stacks/stackinfo", params)
}

func awsCloudFormationConsoleURL(region string, fragmentPath string, params url.Values) string {
	return "https://console.aws.amazon.com/cloudformation/home?region=" +
		url.QueryEscape(region) +
		"#" +
		fragmentPath +
		"?" +
		params.Encode()
}

func awsQuickCreateURLIsSecretFree(rawURL string, manual []provisionLinkManualParameter) bool {
	for _, parameter := range manual {
		if strings.Contains(rawURL, parameter.Key) || strings.Contains(rawURL, "param_"+parameter.Key) {
			return false
		}
	}
	return true
}

func renderAWSCloudFormationTemplate(options provisionRenderLinkOptions, resolution provisionResolvedCandidate) string {
	userData := renderAWSCloudFormationUserData(options)
	var builder strings.Builder
	builder.WriteString("AWSTemplateFormatVersion: '2010-09-09'\n")
	builder.WriteString("Description: Setta BYO cloud runtime for a user-owned AWS account.\n")
	builder.WriteString("Metadata:\n")
	builder.WriteString("  AWS::CloudFormation::Interface:\n")
	builder.WriteString("    ParameterGroups:\n")
	builder.WriteString("      - Label:\n")
	builder.WriteString("          default: Runtime\n")
	builder.WriteString("        Parameters: [RuntimeName, TailscaleAuthKey, PairingTokenHash, ProvisionId, ProvisionAttestationKey, ProvisionExpiresAt]\n")
	builder.WriteString("      - Label:\n")
	builder.WriteString("          default: AWS placement\n")
	builder.WriteString("        Parameters: [InstanceType, UbuntuAmiId, DiskGB, VpcId, SubnetId]\n")
	builder.WriteString("Parameters:\n")
	builder.WriteString("  RuntimeName:\n")
	builder.WriteString("    Type: String\n")
	builder.WriteString("    Default: " + yamlSingleQuote(options.RuntimeName) + "\n")
	builder.WriteString("    AllowedPattern: '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'\n")
	builder.WriteString("    Description: Tailscale hostname and Setta runtime name.\n")
	builder.WriteString("  TailscaleAuthKey:\n")
	builder.WriteString("    Type: String\n")
	builder.WriteString("    NoEcho: true\n")
	builder.WriteString("    MinLength: 8\n")
	builder.WriteString("    Description: Single-use, preauthorized, tagged Tailscale auth key.\n")
	builder.WriteString("  PairingTokenHash:\n")
	builder.WriteString("    Type: String\n")
	builder.WriteString("    NoEcho: true\n")
	builder.WriteString("    AllowedPattern: '^[a-fA-F0-9]{64}$'\n")
	builder.WriteString("    Description: SHA-256 hash of the desktop-held pairing token.\n")
	builder.WriteString("  ProvisionId:\n")
	builder.WriteString("    Type: String\n")
	builder.WriteString("    Default: " + yamlSingleQuote(options.ProvisionID) + "\n")
	builder.WriteString("    MinLength: 8\n")
	builder.WriteString("    Description: Non-secret Setta provisioning correlation id.\n")
	builder.WriteString("  ProvisionAttestationKey:\n")
	builder.WriteString("    Type: String\n")
	builder.WriteString("    NoEcho: true\n")
	builder.WriteString("    MinLength: 32\n")
	builder.WriteString("    Description: HMAC attestation key generated for this provision.\n")
	builder.WriteString("  ProvisionExpiresAt:\n")
	builder.WriteString("    Type: String\n")
	builder.WriteString("    Default: " + yamlSingleQuote(options.ExpiresAt) + "\n")
	builder.WriteString("    Description: RFC3339Nano provisioning seed expiry.\n")
	builder.WriteString("  InstanceType:\n")
	builder.WriteString("    Type: String\n")
	builder.WriteString("    Default: " + yamlSingleQuote(resolution.InstanceType) + "\n")
	builder.WriteString("    AllowedPattern: '^[A-Za-z0-9._-]+$'\n")
	builder.WriteString("    Description: EC2 instance type resolved by Setta.\n")
	builder.WriteString("  UbuntuAmiId:\n")
	builder.WriteString("    Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>\n")
	builder.WriteString("    Default: " + yamlSingleQuote(awsUbuntu2404AmiSSMParameter) + "\n")
	builder.WriteString("    Description: Canonical Ubuntu 24.04 LTS AMI SSM parameter.\n")
	builder.WriteString("  DiskGB:\n")
	builder.WriteString("    Type: Number\n")
	builder.WriteString("    Default: " + strconv.Itoa(resolution.DiskGB) + "\n")
	builder.WriteString("    MinValue: " + strconv.Itoa(diskFloorGB(resolution.Shape)) + "\n")
	builder.WriteString("    Description: Root EBS gp3 volume size in GiB.\n")
	builder.WriteString("  VpcId:\n")
	builder.WriteString("    Type: String\n")
	builder.WriteString("    Default: " + yamlSingleQuote(options.VPCID) + "\n")
	builder.WriteString("    Description: Optional VPC id. Leave empty to use the region default VPC.\n")
	builder.WriteString("  SubnetId:\n")
	builder.WriteString("    Type: String\n")
	builder.WriteString("    Default: " + yamlSingleQuote(options.SubnetID) + "\n")
	builder.WriteString("    Description: Optional subnet id. Leave empty to use an AWS-selected default subnet.\n")
	builder.WriteString("Conditions:\n")
	builder.WriteString("  HasVpcId: !Not [!Equals [!Ref VpcId, '']]\n")
	builder.WriteString("  HasSubnetId: !Not [!Equals [!Ref SubnetId, '']]\n")
	builder.WriteString("Resources:\n")
	builder.WriteString("  RuntimeSecurityGroup:\n")
	builder.WriteString("    Type: AWS::EC2::SecurityGroup\n")
	builder.WriteString("    Properties:\n")
	builder.WriteString("      GroupDescription: !Sub 'Setta runtime ${RuntimeName} outbound-only access'\n")
	builder.WriteString("      VpcId: !If [HasVpcId, !Ref VpcId, !Ref AWS::NoValue]\n")
	builder.WriteString("      SecurityGroupEgress:\n")
	builder.WriteString("        - IpProtocol: '-1'\n")
	builder.WriteString("          CidrIp: 0.0.0.0/0\n")
	builder.WriteString("      Tags:\n")
	builder.WriteString(awsCloudFormationTags())
	builder.WriteString("  RuntimeInstance:\n")
	builder.WriteString("    Type: AWS::EC2::Instance\n")
	builder.WriteString("    Properties:\n")
	builder.WriteString("      ImageId: !Ref UbuntuAmiId\n")
	builder.WriteString("      InstanceType: !Ref InstanceType\n")
	builder.WriteString("      SubnetId: !If [HasSubnetId, !Ref SubnetId, !Ref AWS::NoValue]\n")
	builder.WriteString("      SecurityGroupIds:\n")
	builder.WriteString("        - !Ref RuntimeSecurityGroup\n")
	builder.WriteString("      BlockDeviceMappings:\n")
	builder.WriteString("        - DeviceName: /dev/sda1\n")
	builder.WriteString("          Ebs:\n")
	builder.WriteString("            VolumeSize: !Ref DiskGB\n")
	builder.WriteString("            VolumeType: gp3\n")
	builder.WriteString("            DeleteOnTermination: true\n")
	builder.WriteString("            Encrypted: true\n")
	builder.WriteString("      UserData:\n")
	builder.WriteString("        Fn::Base64: !Sub |\n")
	builder.WriteString(indentBlock(userData, "          "))
	builder.WriteString("      Tags:\n")
	builder.WriteString(awsCloudFormationTags())
	builder.WriteString("Outputs:\n")
	builder.WriteString("  InstanceId:\n")
	builder.WriteString("    Value: !Ref RuntimeInstance\n")
	builder.WriteString("  RuntimeName:\n")
	builder.WriteString("    Value: !Ref RuntimeName\n")
	return builder.String()
}

func renderAWSCloudFormationUserData(options provisionRenderLinkOptions) string {
	cloudInitOptions := provisionRenderCloudInitOptions{
		AppDataDir:          options.AppDataDir,
		AttestationKey:      cfnMarkerProvisionAttestationKey,
		BootstrapPath:       options.BootstrapPath,
		ExpiresAt:           cfnMarkerProvisionExpiresAt,
		ImageContract:       defaultProvisionImageContract,
		InstallRepo:         options.InstallRepo,
		InstallerSHA256:     options.InstallerSHA256,
		InstallerURL:        options.InstallerURL,
		MinisignPublicKey:   options.MinisignPublicKey,
		PairingTokenHash:    cfnMarkerPairingTokenHash,
		ProvisionID:         cfnMarkerProvisionID,
		ReleaseBaseURL:      options.ReleaseBaseURL,
		RuntimeName:         cfnMarkerRuntimeName,
		RuntimePort:         options.RuntimePort,
		SeedPath:            options.SeedPath,
		ServiceGroup:        options.ServiceGroup,
		ServiceUser:         options.ServiceUser,
		SettaVersion:        options.SettaVersion,
		SetupReportPath:     options.SetupReportPath,
		Shape:               options.Shape,
		TailscaleAuthKey:    cfnMarkerTailscaleAuthKey,
		TailscaleInstallURL: options.TailscaleInstallURL,
	}
	cloudInit := renderCloudInitDocument(cloudInitOptions)
	cloudInit = strings.ReplaceAll(cloudInit, "${", "${!")
	replacements := map[string]string{
		cfnMarkerRuntimeName:             "${RuntimeName}",
		cfnMarkerTailscaleAuthKey:        "${TailscaleAuthKey}",
		cfnMarkerPairingTokenHash:        "${PairingTokenHash}",
		cfnMarkerProvisionID:             "${ProvisionId}",
		cfnMarkerProvisionAttestationKey: "${ProvisionAttestationKey}",
		cfnMarkerProvisionExpiresAt:      "${ProvisionExpiresAt}",
	}
	for marker, parameter := range replacements {
		cloudInit = strings.ReplaceAll(cloudInit, marker, parameter)
	}
	return cloudInit
}

func awsCloudFormationTags() string {
	return "        - Key: setta:runtime\n" +
		"          Value: 'true'\n" +
		"        - Key: setta:runtime_name\n" +
		"          Value: !Ref RuntimeName\n" +
		"        - Key: setta:created_by\n" +
		"          Value: user\n"
}

func yamlSingleQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func validateCloudFormationStackName(value string) (string, error) {
	trimmed, err := requirePlainField("stack-name", value, 1, 128)
	if err != nil {
		return "", err
	}
	first := rune(trimmed[0])
	if !isASCIILetter(first) {
		return "", fmt.Errorf("stack-name must start with a letter: %s", value)
	}
	for _, character := range trimmed {
		if isCloudFormationStackNameCharacter(character) {
			continue
		}
		return "", fmt.Errorf("stack-name contains unsupported character %q", character)
	}
	return trimmed, nil
}

func isCloudFormationStackNameCharacter(character rune) bool {
	return isASCIILetter(character) || (character >= '0' && character <= '9') || character == '-'
}

func isASCIILetter(character rune) bool {
	return (character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z')
}

func randomProvisionID() (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", fmt.Errorf("generate provision id: %w", err)
	}
	return "provision_" + hex.EncodeToString(data[:]), nil
}

func pathJoin(base string, element string) string {
	base = strings.TrimRight(base, "/")
	if base == "" {
		return "/" + element
	}
	return base + "/" + element
}
