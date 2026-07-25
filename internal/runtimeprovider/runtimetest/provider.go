// Package runtimetest provides in-memory runtimeprovider implementations for
// provider-neutral tests.
package runtimetest

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"

	"setta/internal/runtimeprovider"
)

// Options configures a Provider.
type Options struct {
	Now                                  func() time.Time
	WorkloadIdentity                     runtimeprovider.ServiceIdentity
	AllowMissingRuntime                  bool
	RestoreRejectionsAfterServiceRestart int
}

// ServiceProbe configures deterministic service start and restart markers.
type ServiceProbe struct {
	ServiceName   string
	CounterPath   string
	HeartbeatPath string
}

// CurlHandler handles fake curl exec requests.
type CurlHandler func(runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, bool, error)

// MoveHook observes a successful file move after the destination has been
// written.
type MoveHook func(destination string, data []byte) error

// Provider is an in-memory runtimeprovider.Provider. It models persistent
// filesystem state, services, checkpoints, network policy, and destruction
// without provider SDK types.
type Provider struct {
	options         Options
	runtimes        map[string]runtimeprovider.RuntimeObservation
	files           map[string][]byte
	service         map[serviceKey]runtimeprovider.ServiceObservation
	networkPolicies map[string]runtimeprovider.NetworkPolicy
	checkpoints     map[string]map[string]checkpointState
	chmodModes      map[string]string
	installDirModes map[string]string
	fileOwners      map[string]runtimeprovider.ServiceIdentity
	dirOwners       map[string]runtimeprovider.ServiceIdentity
	serviceProbes   map[string]ServiceProbe
	curlHandler     CurlHandler
	moveHook        MoveHook
	execCalls       int
	ensureCalls     int
	uploads         int
	tarExtracts     int
	restoreCalls    int
	restoreRejects  int
	nextResourceID  int
	nextCheckpoint  int
	nextProcessID   int
	lastService     runtimeprovider.ServiceObservation
}

type serviceKey struct {
	runtimeName string
	serviceName string
}

type checkpointState struct {
	observation runtimeprovider.CheckpointObservation
	filesystem  filesystemSnapshot
}

type filesystemSnapshot struct {
	files           map[string][]byte
	chmodModes      map[string]string
	installDirModes map[string]string
	fileOwners      map[string]runtimeprovider.ServiceIdentity
	dirOwners       map[string]runtimeprovider.ServiceIdentity
}

// NewProvider returns a new empty fake provider.
func NewProvider(options Options) *Provider {
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.WorkloadIdentity.IsZero() {
		options.WorkloadIdentity = runtimeprovider.ServiceIdentity{
			User:  "sprite",
			Group: "sprite",
		}
	}
	return &Provider{
		options:         options,
		runtimes:        make(map[string]runtimeprovider.RuntimeObservation),
		files:           make(map[string][]byte),
		service:         make(map[serviceKey]runtimeprovider.ServiceObservation),
		networkPolicies: make(map[string]runtimeprovider.NetworkPolicy),
		checkpoints:     make(map[string]map[string]checkpointState),
		chmodModes:      make(map[string]string),
		installDirModes: make(map[string]string),
		fileOwners:      make(map[string]runtimeprovider.ServiceIdentity),
		dirOwners:       make(map[string]runtimeprovider.ServiceIdentity),
		serviceProbes:   make(map[string]ServiceProbe),
		nextResourceID:  1,
		nextCheckpoint:  1,
		nextProcessID:   1000,
	}
}

// SetCurlHandler installs a handler for /usr/bin/curl.
func (provider *Provider) SetCurlHandler(handler CurlHandler) {
	provider.curlHandler = handler
}

// SetMoveHook installs a successful-move observer.
func (provider *Provider) SetMoveHook(hook MoveHook) {
	provider.moveHook = hook
}

// SetServiceProbe configures marker writes for one service.
func (provider *Provider) SetServiceProbe(probe ServiceProbe) {
	provider.serviceProbes[probe.ServiceName] = probe
}

// SetFile writes one fake remote file.
func (provider *Provider) SetFile(remotePath string, data []byte) {
	provider.files[remotePath] = bytes.Clone(data)
	provider.fileOwners[remotePath] = provider.options.WorkloadIdentity
}

// HasFile reports whether a fake remote file exists.
func (provider *Provider) HasFile(remotePath string) bool {
	_, ok := provider.files[remotePath]
	return ok
}

// File returns one fake remote file.
func (provider *Provider) File(remotePath string) ([]byte, bool) {
	data, ok := provider.files[remotePath]
	return bytes.Clone(data), ok
}

// ChmodMode returns the last chmod mode recorded for a path.
func (provider *Provider) ChmodMode(remotePath string) string {
	return provider.chmodModes[remotePath]
}

// InstallDirMode returns the mode recorded for an install-created directory.
func (provider *Provider) InstallDirMode(remotePath string) string {
	return provider.installDirModes[remotePath]
}

// FileOwner returns the owner recorded for a file.
func (provider *Provider) FileOwner(remotePath string) runtimeprovider.ServiceIdentity {
	return provider.fileOwners[remotePath]
}

// DirOwner returns the owner recorded for a directory.
func (provider *Provider) DirOwner(remotePath string) runtimeprovider.ServiceIdentity {
	return provider.dirOwners[remotePath]
}

// LastService returns the most recent service observation.
func (provider *Provider) LastService() runtimeprovider.ServiceObservation {
	return provider.lastService
}

// Service returns one service observation.
func (provider *Provider) Service(
	runtimeName string,
	serviceName string,
) (runtimeprovider.ServiceObservation, bool) {
	service, ok := provider.service[serviceKey{runtimeName: runtimeName, serviceName: serviceName}]
	return service, ok
}

// ExecCalls returns the number of exec calls received.
func (provider *Provider) ExecCalls() int {
	return provider.execCalls
}

// EnsureServiceCalls returns the number of EnsureService calls received.
func (provider *Provider) EnsureServiceCalls() int {
	return provider.ensureCalls
}

// RestoreCheckpointCalls returns the number of restore requests received.
func (provider *Provider) RestoreCheckpointCalls() int {
	return provider.restoreCalls
}

// Uploads returns the number of dd uploads received.
func (provider *Provider) Uploads() int {
	return provider.uploads
}

// TarExtracts returns the number of tar extractions received.
func (provider *Provider) TarExtracts() int {
	return provider.tarExtracts
}

// ResetTransferCounters clears upload and extraction counters.
func (provider *Provider) ResetTransferCounters() {
	provider.uploads = 0
	provider.tarExtracts = 0
}

// IdentityCanWrite reports whether identity can write the recorded path.
func (provider *Provider) IdentityCanWrite(
	remotePath string,
	identity runtimeprovider.ServiceIdentity,
) (bool, error) {
	mode, owner, ok := provider.pathModeOwner(remotePath)
	if !ok {
		return false, fmt.Errorf("missing metadata for %s", remotePath)
	}
	permissions, err := strconv.ParseUint(mode, 8, 32)
	if err != nil {
		return false, fmt.Errorf("parse mode %q for %s: %w", mode, remotePath, err)
	}
	switch {
	case identity.User == owner.User:
		return permissions&0o200 != 0, nil
	case identity.Group == owner.Group:
		return permissions&0o020 != 0, nil
	default:
		return permissions&0o002 != 0, nil
	}
}

// VersionForBinary returns a test release version encoded as "version:<value>".
func (provider *Provider) VersionForBinary(binaryPath string) (string, bool) {
	data, ok := provider.files[binaryPath]
	if !ok {
		return "", false
	}
	version := strings.TrimSpace(strings.TrimPrefix(string(data), "version:"))
	if version == string(data) || version == "" {
		return "", false
	}
	return version, true
}

func (provider *Provider) restartService(key serviceKey) error {
	service, ok := provider.service[key]
	if !ok {
		return fmt.Errorf("service %s is absent on %s", key.serviceName, key.runtimeName)
	}
	provider.nextProcessID++
	service.ProcessID = provider.nextProcessID
	service.RestartCount++
	provider.service[key] = service
	provider.lastService = service
	if probe, ok := provider.serviceProbes[key.serviceName]; ok {
		provider.startServiceProbe(probe, 0)
	}
	provider.restoreRejects = provider.options.RestoreRejectionsAfterServiceRestart
	return nil
}

// Create records or returns a Setta-managed runtime.
func (provider *Provider) Create(
	_ context.Context,
	request runtimeprovider.CreateRequest,
) (runtimeprovider.RuntimeObservation, error) {
	if err := request.Identity.Validate(); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	if err := request.Resources.Validate(); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	if existing, ok := provider.runtimes[request.Identity.Name]; ok {
		if existing.Resources != request.Resources {
			return runtimeprovider.RuntimeObservation{}, fmt.Errorf(
				"%w: existing runtime resource shape differs from create request",
				runtimeprovider.ErrInvalidContract,
			)
		}
		return cloneRuntimeObservation(existing), nil
	}
	now := provider.options.Now().UTC()
	resourceID := fmt.Sprintf("fake-runtime-%04d", provider.nextResourceID)
	provider.nextResourceID++
	observation := runtimeprovider.RuntimeObservation{
		ProviderResourceID: resourceID,
		Name:               request.Identity.Name,
		Labels:             slices.Clone(request.Identity.Labels),
		Resources:          request.Resources,
		Activity:           runtimeprovider.RuntimeActivityActive,
		URL:                "https://" + request.Identity.Name + ".invalid",
		URLAccess:          runtimeprovider.URLAccessAuthenticated,
		Placement:          "memory",
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	provider.runtimes[request.Identity.Name] = observation
	return cloneRuntimeObservation(observation), nil
}

// Inspect returns a previously created runtime.
func (provider *Provider) Inspect(
	_ context.Context,
	name string,
) (runtimeprovider.RuntimeObservation, bool, error) {
	if err := runtimeprovider.ValidateManagedName(name); err != nil {
		return runtimeprovider.RuntimeObservation{}, false, err
	}
	observation, ok := provider.runtimes[name]
	return cloneRuntimeObservation(observation), ok, nil
}

// Exec executes a small deterministic subset of POSIX-style commands used by
// provider-neutral tests.
func (provider *Provider) Exec(
	_ context.Context,
	request runtimeprovider.ExecRequest,
) (runtimeprovider.ExecResult, error) {
	if err := provider.requireRuntime(request.RuntimeName); err != nil {
		return runtimeprovider.ExecResult{}, err
	}
	provider.execCalls++
	if result, handled := provider.execReadWriteCommand(request); handled {
		return result, nil
	}
	if result, handled := provider.execFilesystemCommand(request); handled {
		return result, nil
	}
	return provider.execSpecialCommand(request)
}

func (provider *Provider) execReadWriteCommand(request runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, bool) {
	switch request.Path {
	case "/usr/bin/test":
		return provider.execTest(request), true
	case "/usr/bin/cat":
		return provider.execCat(request), true
	case "/usr/bin/dd":
		return provider.execDD(request), true
	case "/usr/bin/tee":
		return provider.execTee(request), true
	case "/usr/bin/sha256sum":
		return provider.execSHA256Sum(request), true
	case "/usr/bin/install":
		return provider.execInstall(request), true
	case "/usr/bin/minisign":
		return runtimeprovider.ExecResult{}, true
	default:
		return runtimeprovider.ExecResult{}, false
	}
}

func (provider *Provider) execFilesystemCommand(request runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, bool) {
	switch request.Path {
	case "/usr/bin/mkdir":
		return provider.execMkdir(request), true
	case "/bin/rm":
		return provider.execRM(request), true
	case "/bin/tar":
		return provider.execTar(request), true
	case "/bin/chown":
		return provider.execChown(request), true
	case "/bin/chmod", "/usr/bin/chmod":
		return provider.execChmod(request), true
	case "/bin/mv", "/usr/bin/mv":
		return provider.execMV(request), true
	default:
		return runtimeprovider.ExecResult{}, false
	}
}

func (provider *Provider) execSpecialCommand(request runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error) {
	switch request.Path {
	case "/bin/kill":
		return provider.execKill(request), nil
	case "/usr/bin/curl":
		if provider.curlHandler == nil {
			return runtimeprovider.ExecResult{}, fmt.Errorf("unexpected Exec path %s", request.Path)
		}
		result, handled, err := provider.curlHandler(request)
		if err != nil || handled {
			return result, err
		}
		return runtimeprovider.ExecResult{}, fmt.Errorf("unexpected Exec curl arguments %v", request.Arguments)
	default:
		return runtimeprovider.ExecResult{}, fmt.Errorf("unexpected Exec path %s", request.Path)
	}
}

func (provider *Provider) execKill(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) != 2 || request.Arguments[0] != "-TERM" {
		return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported kill")}
	}
	processID, err := strconv.Atoi(request.Arguments[1])
	if err != nil || processID <= 0 {
		return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("invalid PID")}
	}
	for key, service := range provider.service {
		if key.runtimeName == request.RuntimeName && service.ProcessID == processID {
			if err := provider.restartService(key); err != nil {
				return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte(err.Error())}
			}
			return runtimeprovider.ExecResult{}
		}
	}
	return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte("process is absent")}
}

// ConfigureURL records URL access for an existing runtime.
func (provider *Provider) ConfigureURL(
	_ context.Context,
	name string,
	access runtimeprovider.URLAccess,
) error {
	observation, ok := provider.runtimes[name]
	if !ok {
		return fmt.Errorf("runtime %s is absent", name)
	}
	switch access {
	case runtimeprovider.URLAccessAuthenticated, runtimeprovider.URLAccessPublic:
	default:
		return fmt.Errorf("%w: unsupported URL access %q", runtimeprovider.ErrInvalidContract, access)
	}
	observation.URLAccess = access
	observation.UpdatedAt = provider.options.Now().UTC()
	provider.runtimes[name] = observation
	return nil
}

// EnsureService records a running service with the exact provider-neutral spec.
func (provider *Provider) EnsureService(
	_ context.Context,
	runtimeName string,
	spec runtimeprovider.ServiceSpec,
) (runtimeprovider.ServiceObservation, error) {
	if err := provider.requireRuntime(runtimeName); err != nil {
		return runtimeprovider.ServiceObservation{}, err
	}
	if err := spec.Validate(); err != nil {
		return runtimeprovider.ServiceObservation{}, err
	}
	provider.ensureCalls++
	provider.nextProcessID++
	key := serviceKey{runtimeName: runtimeName, serviceName: spec.Name}
	previous, existed := provider.service[key]
	observation := runtimeprovider.ServiceObservation{
		Spec:      cloneServiceSpec(spec),
		State:     runtimeprovider.ServiceStateRunning,
		ProcessID: provider.nextProcessID,
	}
	if existed {
		observation.RestartCount = previous.RestartCount
	}
	provider.service[key] = observation
	provider.lastService = observation
	if probe, ok := provider.serviceProbes[spec.Name]; ok {
		provider.startServiceProbe(probe, 1)
	}
	return cloneServiceObservation(observation), nil
}

// InspectService returns a recorded service.
func (provider *Provider) InspectService(
	_ context.Context,
	runtimeName string,
	serviceName string,
) (runtimeprovider.ServiceObservation, bool, error) {
	if err := provider.requireRuntime(runtimeName); err != nil {
		return runtimeprovider.ServiceObservation{}, false, err
	}
	observation, ok := provider.service[serviceKey{runtimeName: runtimeName, serviceName: serviceName}]
	return cloneServiceObservation(observation), ok, nil
}

// ApplyNetworkPolicy records a provider-neutral network policy.
func (provider *Provider) ApplyNetworkPolicy(
	_ context.Context,
	runtimeName string,
	policy runtimeprovider.NetworkPolicy,
) error {
	if err := provider.requireRuntime(runtimeName); err != nil {
		return err
	}
	provider.networkPolicies[runtimeName] = runtimeprovider.NetworkPolicy{
		Rules: slices.Clone(policy.Rules),
	}
	return nil
}

// InspectNetworkPolicy returns the recorded provider-neutral policy.
func (provider *Provider) InspectNetworkPolicy(
	_ context.Context,
	runtimeName string,
) (runtimeprovider.NetworkPolicy, error) {
	if err := provider.requireRuntime(runtimeName); err != nil {
		return runtimeprovider.NetworkPolicy{}, err
	}
	policy := provider.networkPolicies[runtimeName]
	return runtimeprovider.NetworkPolicy{Rules: slices.Clone(policy.Rules)}, nil
}

// CreateCheckpoint snapshots the fake persistent filesystem.
func (provider *Provider) CreateCheckpoint(
	_ context.Context,
	runtimeName string,
	comment string,
) (runtimeprovider.CheckpointObservation, error) {
	if err := provider.requireRuntime(runtimeName); err != nil {
		return runtimeprovider.CheckpointObservation{}, err
	}
	if strings.TrimSpace(comment) == "" {
		return runtimeprovider.CheckpointObservation{}, fmt.Errorf("%w: checkpoint comment is empty", runtimeprovider.ErrInvalidContract)
	}
	checkpointID := fmt.Sprintf("checkpoint-%04d", provider.nextCheckpoint)
	provider.nextCheckpoint++
	observation := runtimeprovider.CheckpointObservation{
		ID:        checkpointID,
		Comment:   comment,
		CreatedAt: provider.options.Now().UTC(),
	}
	if provider.checkpoints[runtimeName] == nil {
		provider.checkpoints[runtimeName] = make(map[string]checkpointState)
	}
	provider.checkpoints[runtimeName][checkpointID] = checkpointState{
		observation: observation,
		filesystem:  provider.snapshotFilesystem(),
	}
	return observation, nil
}

// InspectCheckpoint returns one recorded checkpoint.
func (provider *Provider) InspectCheckpoint(
	_ context.Context,
	runtimeName string,
	checkpointID string,
) (runtimeprovider.CheckpointObservation, bool, error) {
	if err := provider.requireRuntime(runtimeName); err != nil {
		return runtimeprovider.CheckpointObservation{}, false, err
	}
	checkpoint, ok := provider.checkpoints[runtimeName][checkpointID]
	return checkpoint.observation, ok, nil
}

// RestoreCheckpoint rolls the fake persistent filesystem back to a checkpoint.
func (provider *Provider) RestoreCheckpoint(
	_ context.Context,
	runtimeName string,
	checkpointID string,
) error {
	if err := provider.requireRuntime(runtimeName); err != nil {
		return err
	}
	provider.restoreCalls++
	if provider.restoreRejects > 0 {
		provider.restoreRejects--
		return errors.New("runtime service supervisor is still settling")
	}
	checkpoint, ok := provider.checkpoints[runtimeName][checkpointID]
	if !ok {
		return fmt.Errorf("checkpoint %s is absent on %s", checkpointID, runtimeName)
	}
	provider.restoreFilesystem(checkpoint.filesystem)
	for key := range provider.service {
		if key.runtimeName == runtimeName {
			if err := provider.restartService(key); err != nil {
				return err
			}
		}
	}
	return nil
}

// Destroy removes a runtime and its provider-owned metadata.
func (provider *Provider) Destroy(_ context.Context, name string) error {
	if _, ok := provider.runtimes[name]; !ok {
		return nil
	}
	delete(provider.runtimes, name)
	delete(provider.networkPolicies, name)
	delete(provider.checkpoints, name)
	for key := range provider.service {
		if key.runtimeName == name {
			delete(provider.service, key)
		}
	}
	return nil
}

func (provider *Provider) execTest(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) == 2 && request.Arguments[0] == "-f" {
		if provider.HasFile(request.Arguments[1]) {
			return runtimeprovider.ExecResult{}
		}
		return runtimeprovider.ExecResult{ExitCode: 1}
	}
	return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported test")}
}

func (provider *Provider) execCat(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) != 1 {
		return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported cat")}
	}
	data, ok := provider.files[request.Arguments[0]]
	if !ok {
		return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte("missing")}
	}
	return runtimeprovider.ExecResult{Stdout: bytes.Clone(data)}
}

func (provider *Provider) execDD(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	for _, argument := range request.Arguments {
		if strings.HasPrefix(argument, "of=") {
			remotePath := strings.TrimPrefix(argument, "of=")
			provider.SetFile(remotePath, request.Stdin)
			provider.uploads++
			return runtimeprovider.ExecResult{}
		}
	}
	return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("missing of")}
}

func (provider *Provider) execTee(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) != 1 {
		return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported tee")}
	}
	provider.SetFile(request.Arguments[0], request.Stdin)
	return runtimeprovider.ExecResult{Stdout: bytes.Clone(request.Stdin)}
}

func (provider *Provider) execSHA256Sum(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) != 1 {
		return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported sha256sum")}
	}
	data, ok := provider.files[request.Arguments[0]]
	if !ok {
		return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte("missing")}
	}
	return runtimeprovider.ExecResult{
		Stdout: []byte(sha256String(data) + "  " + request.Arguments[0] + "\n"),
	}
}

func (provider *Provider) execInstall(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) >= 2 && request.Arguments[0] == "-d" {
		mode, owner, dirs, ok := parseInstallDirArguments(request.Arguments)
		if !ok {
			return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported install -d")}
		}
		for _, dir := range dirs {
			provider.installDirModes[dir] = mode
			provider.dirOwners[dir] = owner
		}
	}
	return runtimeprovider.ExecResult{}
}

func (provider *Provider) execMkdir(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) != 2 || request.Arguments[0] != "-p" {
		return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported mkdir")}
	}
	provider.installDirModes[request.Arguments[1]] = "0755"
	provider.dirOwners[request.Arguments[1]] = provider.options.WorkloadIdentity
	return runtimeprovider.ExecResult{}
}

func (provider *Provider) execChmod(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) != 2 {
		return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported chmod")}
	}
	provider.chmodModes[request.Arguments[1]] = request.Arguments[0]
	return runtimeprovider.ExecResult{}
}

func (provider *Provider) execChown(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) == 2 {
		owner, ok := parseOwnerGroup(request.Arguments[0])
		if !ok {
			return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported chown owner")}
		}
		provider.fileOwners[request.Arguments[1]] = owner
		return runtimeprovider.ExecResult{}
	}
	if len(request.Arguments) == 3 && request.Arguments[0] == "-R" {
		owner, ok := parseOwnerGroup(request.Arguments[1])
		if !ok {
			return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported chown owner")}
		}
		provider.setRecursiveOwner(request.Arguments[2], owner)
		return runtimeprovider.ExecResult{}
	}
	return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported chown")}
}

func (provider *Provider) setRecursiveOwner(root string, owner runtimeprovider.ServiceIdentity) {
	provider.dirOwners[root] = owner
	for remotePath := range provider.files {
		if pathWithinRoot(remotePath, root) {
			provider.fileOwners[remotePath] = owner
		}
	}
	for remotePath := range provider.dirOwners {
		if pathWithinRoot(remotePath, root) {
			provider.dirOwners[remotePath] = owner
		}
	}
}

func pathWithinRoot(remotePath string, root string) bool {
	return remotePath == root || strings.HasPrefix(remotePath, root+"/")
}

func (provider *Provider) execRM(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	for _, argument := range request.Arguments {
		if argument == "-rf" {
			continue
		}
		for remotePath := range provider.files {
			if remotePath == argument || strings.HasPrefix(remotePath, argument+"/") {
				delete(provider.files, remotePath)
				delete(provider.fileOwners, remotePath)
				delete(provider.chmodModes, remotePath)
			}
		}
	}
	return runtimeprovider.ExecResult{}
}

func (provider *Provider) execTar(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) != 4 || request.Arguments[0] != "-xzf" || request.Arguments[2] != "-C" {
		return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported tar")}
	}
	archive, ok := provider.files[request.Arguments[1]]
	if !ok {
		return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte("missing archive")}
	}
	releaseDir := request.Arguments[3]
	gzipReader, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte(err.Error())}
	}
	defer gzipReader.Close()
	tarReader := tar.NewReader(gzipReader)
	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte(err.Error())}
		}
		if !isRegularTarEntry(header.Typeflag) {
			continue
		}
		if err := provider.extractTarEntry(tarReader, releaseDir, header.Name); err != nil {
			return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte(err.Error())}
		}
	}
	provider.tarExtracts++
	return runtimeprovider.ExecResult{}
}

func isRegularTarEntry(typeFlag byte) bool {
	return typeFlag == tar.TypeReg || typeFlag == tar.TypeRegA
}

func (provider *Provider) extractTarEntry(reader io.Reader, releaseDir string, name string) error {
	var data bytes.Buffer
	if _, err := data.ReadFrom(reader); err != nil {
		return err
	}
	provider.SetFile(path.Join(releaseDir, name), data.Bytes())
	return nil
}

func (provider *Provider) execMV(request runtimeprovider.ExecRequest) runtimeprovider.ExecResult {
	if len(request.Arguments) != 2 {
		return runtimeprovider.ExecResult{ExitCode: 2, Stderr: []byte("unsupported mv")}
	}
	data, ok := provider.files[request.Arguments[0]]
	if !ok {
		return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte("missing source")}
	}
	provider.files[request.Arguments[1]] = bytes.Clone(data)
	if mode, ok := provider.chmodModes[request.Arguments[0]]; ok {
		provider.chmodModes[request.Arguments[1]] = mode
		delete(provider.chmodModes, request.Arguments[0])
	}
	if owner, ok := provider.fileOwners[request.Arguments[0]]; ok {
		provider.fileOwners[request.Arguments[1]] = owner
		delete(provider.fileOwners, request.Arguments[0])
	}
	delete(provider.files, request.Arguments[0])
	if provider.moveHook != nil {
		if err := provider.moveHook(request.Arguments[1], bytes.Clone(data)); err != nil {
			return runtimeprovider.ExecResult{ExitCode: 1, Stderr: []byte(err.Error())}
		}
	}
	return runtimeprovider.ExecResult{}
}

func (provider *Provider) startServiceProbe(probe ServiceProbe, heartbeat int) {
	count := 0
	if data, ok := provider.files[probe.CounterPath]; ok {
		parsed, err := strconv.Atoi(strings.TrimSpace(string(data)))
		if err == nil {
			count = parsed
		}
	}
	provider.SetFile(probe.CounterPath, []byte(strconv.Itoa(count+1)+"\n"))
	provider.SetFile(probe.HeartbeatPath, []byte(strconv.Itoa(heartbeat)+"\n"))
}

func (provider *Provider) requireRuntime(name string) error {
	if provider.options.AllowMissingRuntime {
		return nil
	}
	if _, ok := provider.runtimes[name]; !ok {
		return fmt.Errorf("runtime %s is absent", name)
	}
	return nil
}

func (provider *Provider) pathModeOwner(remotePath string) (string, runtimeprovider.ServiceIdentity, bool) {
	if mode, ok := provider.chmodModes[remotePath]; ok {
		owner, ownerOK := provider.fileOwners[remotePath]
		return mode, owner, ownerOK
	}
	if mode, ok := provider.installDirModes[remotePath]; ok {
		owner, ownerOK := provider.dirOwners[remotePath]
		return mode, owner, ownerOK
	}
	return "", runtimeprovider.ServiceIdentity{}, false
}

func (provider *Provider) snapshotFilesystem() filesystemSnapshot {
	return filesystemSnapshot{
		files:           cloneBytesMap(provider.files),
		chmodModes:      cloneStringMap(provider.chmodModes),
		installDirModes: cloneStringMap(provider.installDirModes),
		fileOwners:      cloneIdentityMap(provider.fileOwners),
		dirOwners:       cloneIdentityMap(provider.dirOwners),
	}
}

func (provider *Provider) restoreFilesystem(snapshot filesystemSnapshot) {
	provider.files = cloneBytesMap(snapshot.files)
	provider.chmodModes = cloneStringMap(snapshot.chmodModes)
	provider.installDirModes = cloneStringMap(snapshot.installDirModes)
	provider.fileOwners = cloneIdentityMap(snapshot.fileOwners)
	provider.dirOwners = cloneIdentityMap(snapshot.dirOwners)
}

func parseInstallDirArguments(arguments []string) (string, runtimeprovider.ServiceIdentity, []string, bool) {
	var mode string
	var owner runtimeprovider.ServiceIdentity
	var dirs []string
	for index := 1; index < len(arguments); index++ {
		next, ok := parseInstallDirArgument(arguments, index, &mode, &owner, &dirs)
		if !ok {
			return "", runtimeprovider.ServiceIdentity{}, nil, false
		}
		index = next
	}
	if mode == "" || owner.User == "" || owner.Group == "" || len(dirs) == 0 {
		return "", runtimeprovider.ServiceIdentity{}, nil, false
	}
	return mode, owner, dirs, true
}

func parseInstallDirArgument(
	arguments []string,
	index int,
	mode *string,
	owner *runtimeprovider.ServiceIdentity,
	dirs *[]string,
) (int, bool) {
	argument := arguments[index]
	switch argument {
	case "-m", "-o", "-g":
		if index+1 >= len(arguments) {
			return index, false
		}
		value := arguments[index+1]
		switch argument {
		case "-m":
			*mode = value
		case "-o":
			owner.User = value
		case "-g":
			owner.Group = value
		}
		return index + 1, true
	default:
		if strings.HasPrefix(argument, "-") {
			return index, false
		}
		*dirs = append(*dirs, argument)
		return index, true
	}
}

func parseOwnerGroup(value string) (runtimeprovider.ServiceIdentity, bool) {
	owner, group, ok := strings.Cut(value, ":")
	if !ok || owner == "" || group == "" {
		return runtimeprovider.ServiceIdentity{}, false
	}
	return runtimeprovider.ServiceIdentity{User: owner, Group: group}, true
}

func cloneRuntimeObservation(observation runtimeprovider.RuntimeObservation) runtimeprovider.RuntimeObservation {
	observation.Labels = slices.Clone(observation.Labels)
	return observation
}

func cloneServiceObservation(observation runtimeprovider.ServiceObservation) runtimeprovider.ServiceObservation {
	observation.Spec = cloneServiceSpec(observation.Spec)
	return observation
}

func cloneServiceSpec(spec runtimeprovider.ServiceSpec) runtimeprovider.ServiceSpec {
	spec.Arguments = slices.Clone(spec.Arguments)
	spec.Needs = slices.Clone(spec.Needs)
	if spec.HTTPPort != nil {
		port := *spec.HTTPPort
		spec.HTTPPort = &port
	}
	return spec
}

func cloneBytesMap(values map[string][]byte) map[string][]byte {
	cloned := make(map[string][]byte, len(values))
	for key, value := range values {
		cloned[key] = bytes.Clone(value)
	}
	return cloned
}

func cloneStringMap(values map[string]string) map[string]string {
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func cloneIdentityMap(values map[string]runtimeprovider.ServiceIdentity) map[string]runtimeprovider.ServiceIdentity {
	cloned := make(map[string]runtimeprovider.ServiceIdentity, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func sha256String(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

var _ runtimeprovider.Provider = (*Provider)(nil)
