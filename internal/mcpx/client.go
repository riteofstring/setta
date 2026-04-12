package mcpx

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/tools"
)

const (
	clientName               = "setta-internal-mcp-client"
	clientVersion            = "0.1.0"
	defaultRetryDelay        = 250 * time.Millisecond
	defaultReconnectWait     = 2 * time.Second
	defaultKeepAliveInterval = 10 * time.Second
	defaultHTTPConnectWait   = 5 * time.Second
)

var envPlaceholderPattern = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)\}`)

type HeaderProvider func(serverID string) (http.Header, error)

type ClientOptions struct {
	Logger            *slog.Logger
	Servers           map[string]ServerConfig
	HeaderProvider    HeaderProvider
	EnvLookup         func(string) (string, bool)
	RetryDelay        time.Duration
	ReconnectWait     time.Duration
	KeepAliveInterval time.Duration
	HTTPConnectWait   time.Duration

	connector connector
}

type ToolDescriptor struct {
	ServerID       string
	NamespacedName string
	RemoteName     string
	Description    string
	Kind           tools.Kind
	ReadOnly       bool
	InputSchema    any
	OutputSchema   any
	Metadata       *tools.Metadata
}

type ToolCallResult struct {
	IsError           bool
	StructuredContent any
	Text              string
}

type MissingEnvVarError struct {
	VarName string
}

func (e *MissingEnvVarError) Error() string {
	return fmt.Sprintf("MCP config references missing environment variable %q", e.VarName)
}

type Client struct {
	logger            *slog.Logger
	servers           map[string]ServerConfig
	headerProvider    HeaderProvider
	envLookup         func(string) (string, bool)
	retryDelay        time.Duration
	reconnectWait     time.Duration
	keepAliveInterval time.Duration
	httpConnectWait   time.Duration
	connector         connector

	startOnce sync.Once
	stopOnce  sync.Once
	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup

	mu                sync.RWMutex
	nextSessionID     uint64
	sessions          map[string]*activeSession
	serverToolCache   map[string]serverToolCache
	initTools         map[string]ToolDescriptor
	discoverableTools map[string]ToolDescriptor
	routing           map[string]toolRoute
	runtimeStatuses   map[string]ServerRuntimeStatus
	shuttingDown      bool
}

type toolRoute struct {
	serverID string
	toolName string
}

type serverToolCache struct {
	initTools         map[string]ToolDescriptor
	discoverableTools map[string]ToolDescriptor
	routing           map[string]toolRoute
}

type activeSession struct {
	id      uint64
	session sessionHandle
}

type connector interface {
	Connect(ctx context.Context, config ServerConfig, headers http.Header) (sessionHandle, error)
}

type sessionHandle interface {
	ListTools(ctx context.Context) ([]remoteTool, error)
	CallTool(ctx context.Context, toolName string, arguments map[string]any, meta map[string]any) (ToolCallResult, error)
	Ping(ctx context.Context) error
	Close() error
}

type remoteTool struct {
	Name         string
	Description  string
	InputSchema  any
	OutputSchema any
	Kind         tools.Kind
	ReadOnly     bool
	Metadata     *tools.Metadata
}

type sdkConnector struct {
	logger          *slog.Logger
	httpConnectWait time.Duration
}

type sdkSession struct {
	session *sdkmcp.ClientSession
}

func NewClient(opts ClientOptions) (*Client, error) {
	return newClientWithConnector(opts)
}

func newClientWithConnector(opts ClientOptions) (*Client, error) {
	servers := make(map[string]ServerConfig, len(opts.Servers))
	statuses := make(map[string]ServerRuntimeStatus, len(opts.Servers))
	for serverID, config := range opts.Servers {
		normalized, err := config.normalize(serverID)
		if err != nil {
			return nil, err
		}
		servers[serverID] = normalized
		statuses[serverID] = ServerRuntimeStatus{
			ServerID:  serverID,
			Source:    "setta_mcp",
			Transport: normalized.Transport,
			Endpoint:  serverEndpoint(normalized),
			State:     RuntimeStateUnknown,
		}
	}

	envLookup := opts.EnvLookup
	if envLookup == nil {
		envLookup = os.LookupEnv
	}
	retryDelay := opts.RetryDelay
	if retryDelay <= 0 {
		retryDelay = defaultRetryDelay
	}
	reconnectWait := opts.ReconnectWait
	if reconnectWait <= 0 {
		reconnectWait = defaultReconnectWait
	}
	keepAliveInterval := opts.KeepAliveInterval
	if keepAliveInterval <= 0 {
		keepAliveInterval = defaultKeepAliveInterval
	}
	httpConnectWait := opts.HTTPConnectWait
	if httpConnectWait <= 0 {
		httpConnectWait = defaultHTTPConnectWait
	}
	clientConnector := opts.connector
	if clientConnector == nil {
		clientConnector = &sdkConnector{
			logger:          opts.Logger,
			httpConnectWait: httpConnectWait,
		}
	}

	return &Client{
		logger:            opts.Logger,
		servers:           servers,
		headerProvider:    opts.HeaderProvider,
		envLookup:         envLookup,
		retryDelay:        retryDelay,
		reconnectWait:     reconnectWait,
		keepAliveInterval: keepAliveInterval,
		httpConnectWait:   httpConnectWait,
		connector:         clientConnector,
		sessions:          map[string]*activeSession{},
		serverToolCache:   map[string]serverToolCache{},
		initTools:         map[string]ToolDescriptor{},
		discoverableTools: map[string]ToolDescriptor{},
		routing:           map[string]toolRoute{},
		runtimeStatuses:   statuses,
	}, nil
}

func (c *Client) Start(ctx context.Context) {
	if c == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	c.startOnce.Do(func() {
		c.ctx, c.cancel = context.WithCancel(ctx)
		for serverID, config := range c.servers {
			c.wg.Add(1)
			go c.runServerLoop(serverID, config)
		}
	})
}

func (c *Client) Close(ctx context.Context) error {
	if c == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	c.stopOnce.Do(func() {
		c.mu.Lock()
		c.shuttingDown = true
		c.mu.Unlock()
		if c.cancel != nil {
			c.cancel()
		}
	})

	done := make(chan struct{})
	go func() {
		c.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-ctx.Done():
		return ctx.Err()
	}

	for serverID := range c.servers {
		c.cleanupServer(serverID)
		c.markDisabled(serverID)
	}
	return nil
}

func (c *Client) RuntimeStatuses() []ServerRuntimeStatus {
	if c == nil {
		return nil
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	statuses := make([]ServerRuntimeStatus, 0, len(c.runtimeStatuses))
	for _, status := range c.runtimeStatuses {
		statuses = append(statuses, cloneRuntimeStatus(status))
	}
	sort.Slice(statuses, func(left int, right int) bool {
		return statuses[left].ServerID < statuses[right].ServerID
	})
	return statuses
}

func (c *Client) InitToolsForServers(serverIDs map[string]struct{}) map[string]ToolDescriptor {
	return c.filterToolDescriptors(serverIDs, true)
}

func (c *Client) DiscoverableToolsForServers(serverIDs map[string]struct{}) map[string]ToolDescriptor {
	return c.filterToolDescriptors(serverIDs, false)
}

func (c *Client) ToolDescriptorsForServers(serverIDs map[string]struct{}) map[string]ToolDescriptor {
	combined := c.filterToolDescriptors(serverIDs, true)
	for name, descriptor := range c.filterToolDescriptors(serverIDs, false) {
		combined[name] = descriptor
	}
	return combined
}

func (c *Client) CallTool(ctx context.Context, namespacedToolName string, arguments map[string]any) (ToolCallResult, error) {
	return c.CallToolWithMeta(ctx, namespacedToolName, arguments, nil)
}

func (c *Client) CallToolWithMeta(ctx context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (ToolCallResult, error) {
	if c == nil {
		return ToolCallResult{}, fmt.Errorf("mcpx: client is nil")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	normalizedName := NormalizeToolName(namespacedToolName)
	if normalizedName == "" {
		return ToolCallResult{}, fmt.Errorf("mcpx: namespaced tool name is required")
	}
	if arguments == nil {
		arguments = map[string]any{}
	}

	c.mu.RLock()
	route, ok := c.routing[normalizedName]
	active := c.sessions[route.serverID]
	descriptor, descriptorOK := c.lookupToolLocked(normalizedName)
	c.mu.RUnlock()

	if !ok || !descriptorOK {
		return ToolCallResult{}, fmt.Errorf("mcpx: tool %q is not registered", normalizedName)
	}
	if active == nil {
		return ToolCallResult{}, fmt.Errorf("mcpx: server %q is not connected", route.serverID)
	}

	result, err := active.session.CallTool(ctx, route.toolName, arguments, meta)
	if err == nil {
		return result, nil
	}
	if !errors.Is(err, sdkmcp.ErrConnectionClosed) || !descriptor.ReadOnly {
		return ToolCallResult{}, err
	}

	reconnected := c.waitForSessionReconnect(ctx, route.serverID, active)
	if reconnected == nil {
		return ToolCallResult{}, err
	}
	return reconnected.session.CallTool(ctx, route.toolName, arguments, meta)
}

func (c *Client) runServerLoop(serverID string, config ServerConfig) {
	defer c.wg.Done()

	for {
		if c.isShuttingDown() {
			return
		}

		c.markConnecting(serverID)
		err := c.connectServerOnce(serverID, config)
		c.cleanupServer(serverID)
		if err == nil || errors.Is(err, context.Canceled) || c.isShuttingDown() {
			return
		}

		var missingEnv *MissingEnvVarError
		if errors.As(err, &missingEnv) {
			c.markFailure(serverID, err, missingEnv.VarName)
			return
		}

		c.markFailure(serverID, err, "")
		if c.isShuttingDown() {
			return
		}
		c.markRetrying(serverID)
		if !sleepWithContext(c.ctx, c.retryDelay) {
			return
		}
	}
}

func (c *Client) connectServerOnce(serverID string, config ServerConfig) error {
	resolvedConfig, err := c.resolveServerConfig(config)
	if err != nil {
		return err
	}
	headers, err := c.buildHTTPHeaders(serverID, resolvedConfig)
	if err != nil {
		return err
	}
	session, err := c.connector.Connect(c.ctx, resolvedConfig, headers)
	if err != nil {
		return err
	}

	active := &activeSession{
		id:      atomic.AddUint64(&c.nextSessionID, 1),
		session: session,
	}
	c.mu.Lock()
	c.sessions[serverID] = active
	c.mu.Unlock()

	toolsForServer, err := session.ListTools(c.ctx)
	if err != nil {
		return err
	}
	c.updateToolCacheForServer(serverID, toolsForServer)
	c.markConnected(serverID, len(toolsForServer))

	return c.keepAlive(serverID, active)
}

func (c *Client) keepAlive(serverID string, active *activeSession) error {
	runtimeCtx := c.runtimeContext()
	ticker := time.NewTicker(c.keepAliveInterval)
	defer ticker.Stop()

	for {
		select {
		case <-runtimeCtx.Done():
			return runtimeCtx.Err()
		case <-ticker.C:
			c.mu.RLock()
			current := c.sessions[serverID]
			c.mu.RUnlock()
			if current != active {
				return sdkmcp.ErrConnectionClosed
			}
			if err := active.session.Ping(c.ctx); err != nil {
				return err
			}
		}
	}
}

func (c *Client) waitForSessionReconnect(ctx context.Context, serverID string, previous *activeSession) *activeSession {
	if ctx == nil {
		ctx = context.Background()
	}
	runtimeCtx := c.runtimeContext()
	deadline := time.NewTimer(c.reconnectWait)
	defer deadline.Stop()

	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-runtimeCtx.Done():
			return nil
		case <-deadline.C:
			return nil
		case <-ticker.C:
			c.mu.RLock()
			current := c.sessions[serverID]
			c.mu.RUnlock()
			if current != nil && current != previous {
				return current
			}
		}
	}
}

func (c *Client) cleanupServer(serverID string) {
	c.mu.Lock()
	active := c.sessions[serverID]
	delete(c.sessions, serverID)
	delete(c.serverToolCache, serverID)
	c.rebuildToolCacheLocked()
	status, ok := c.runtimeStatuses[serverID]
	if ok {
		status.ToolCount = 0
		c.runtimeStatuses[serverID] = status
	}
	c.mu.Unlock()

	if active != nil {
		_ = active.session.Close()
	}
}

func (c *Client) updateToolCacheForServer(serverID string, remoteTools []remoteTool) {
	initTools := make(map[string]ToolDescriptor)
	discoverableTools := make(map[string]ToolDescriptor)
	routing := make(map[string]toolRoute)

	for _, tool := range remoteTools {
		namespacedName := BuildNamespacedToolName(serverID, tool.Name)
		descriptor := ToolDescriptor{
			ServerID:       serverID,
			NamespacedName: namespacedName,
			RemoteName:     tool.Name,
			Description:    tool.Description,
			Kind:           tool.Kind,
			ReadOnly:       tool.ReadOnly,
			InputSchema:    tool.InputSchema,
			OutputSchema:   tool.OutputSchema,
			Metadata:       cloneMetadataPtr(tool.Metadata),
		}
		if descriptor.Kind == tools.KindInit {
			initTools[namespacedName] = descriptor
		} else {
			discoverableTools[namespacedName] = descriptor
		}
		routing[namespacedName] = toolRoute{
			serverID: serverID,
			toolName: tool.Name,
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.serverToolCache[serverID] = serverToolCache{
		initTools:         initTools,
		discoverableTools: discoverableTools,
		routing:           routing,
	}
	c.rebuildToolCacheLocked()
}

func (c *Client) rebuildToolCacheLocked() {
	initTools := make(map[string]ToolDescriptor)
	discoverableTools := make(map[string]ToolDescriptor)
	routing := make(map[string]toolRoute)
	for _, cache := range c.serverToolCache {
		for name, descriptor := range cache.initTools {
			initTools[name] = cloneDescriptor(descriptor)
		}
		for name, descriptor := range cache.discoverableTools {
			discoverableTools[name] = cloneDescriptor(descriptor)
		}
		for name, route := range cache.routing {
			routing[name] = route
		}
	}
	c.initTools = initTools
	c.discoverableTools = discoverableTools
	c.routing = routing
}

func (c *Client) filterToolDescriptors(serverIDs map[string]struct{}, initOnly bool) map[string]ToolDescriptor {
	if c == nil {
		return nil
	}
	c.mu.RLock()
	defer c.mu.RUnlock()

	source := c.discoverableTools
	if initOnly {
		source = c.initTools
	}
	filtered := make(map[string]ToolDescriptor)
	for name, descriptor := range source {
		if len(serverIDs) > 0 {
			if _, ok := serverIDs[descriptor.ServerID]; !ok {
				continue
			}
		}
		filtered[name] = cloneDescriptor(descriptor)
	}
	return filtered
}

func (c *Client) lookupToolLocked(name string) (ToolDescriptor, bool) {
	if descriptor, ok := c.initTools[name]; ok {
		return descriptor, true
	}
	descriptor, ok := c.discoverableTools[name]
	return descriptor, ok
}

func (c *Client) resolveServerConfig(config ServerConfig) (ServerConfig, error) {
	resolved := config
	if err := c.resolveStringFields(
		resolvedField{source: config.URL, target: &resolved.URL},
		resolvedField{source: config.Command, target: &resolved.Command},
		resolvedField{source: config.CWD, target: &resolved.CWD},
	); err != nil {
		return ServerConfig{}, err
	}
	if len(config.Args) > 0 {
		args, err := c.resolveStringSlice(config.Args)
		if err != nil {
			return ServerConfig{}, err
		}
		resolved.Args = args
	}
	if len(config.Env) > 0 {
		env, err := c.resolveStringMap(config.Env)
		if err != nil {
			return ServerConfig{}, err
		}
		resolved.Env = env
	}
	if len(config.HTTPHeaders) > 0 {
		headers, err := c.resolveStringMap(config.HTTPHeaders)
		if err != nil {
			return ServerConfig{}, err
		}
		resolved.HTTPHeaders = headers
	}
	return resolved, nil
}

type resolvedField struct {
	source string
	target *string
}

func (c *Client) resolveStringFields(fields ...resolvedField) error {
	for _, field := range fields {
		resolved, err := c.resolvePlaceholders(field.source)
		if err != nil {
			return err
		}
		*field.target = resolved
	}
	return nil
}

func (c *Client) resolveStringSlice(values []string) ([]string, error) {
	resolved := make([]string, 0, len(values))
	for _, value := range values {
		item, err := c.resolvePlaceholders(value)
		if err != nil {
			return nil, err
		}
		resolved = append(resolved, item)
	}
	return resolved, nil
}

func (c *Client) resolveStringMap(values map[string]string) (map[string]string, error) {
	resolved := make(map[string]string, len(values))
	for key, value := range values {
		item, err := c.resolvePlaceholders(value)
		if err != nil {
			return nil, err
		}
		resolved[key] = item
	}
	return resolved, nil
}

func (c *Client) resolvePlaceholders(value string) (string, error) {
	if !strings.Contains(value, "${") {
		return value, nil
	}
	matches := envPlaceholderPattern.FindAllStringSubmatchIndex(value, -1)
	if len(matches) == 0 {
		return value, nil
	}

	var builder strings.Builder
	lastIndex := 0
	for _, match := range matches {
		builder.WriteString(value[lastIndex:match[0]])
		varName := value[match[2]:match[3]]
		resolved, ok := c.envLookup(varName)
		if !ok {
			return "", &MissingEnvVarError{VarName: varName}
		}
		builder.WriteString(resolved)
		lastIndex = match[1]
	}
	builder.WriteString(value[lastIndex:])
	return builder.String(), nil
}

func (c *Client) buildHTTPHeaders(serverID string, config ServerConfig) (http.Header, error) {
	headers := http.Header{}
	for key, value := range config.HTTPHeaders {
		headers.Set(key, value)
	}
	if c.headerProvider == nil {
		if len(headers) == 0 {
			return nil, nil
		}
		return headers, nil
	}
	extra, err := c.headerProvider(serverID)
	if err != nil {
		return nil, err
	}
	for key, values := range extra {
		for _, value := range values {
			headers.Add(key, value)
		}
	}
	if len(headers) == 0 {
		return nil, nil
	}
	return headers, nil
}

func (c *Client) markConnecting(serverID string) {
	c.markStatus(serverID, func(status ServerRuntimeStatus, now time.Time) ServerRuntimeStatus {
		status.State = RuntimeStateConnecting
		status.LastAttemptAt = cloneTimePtr(&now)
		return status
	})
}

func (c *Client) markConnected(serverID string, toolCount int) {
	c.markStatus(serverID, func(status ServerRuntimeStatus, now time.Time) ServerRuntimeStatus {
		status.State = RuntimeStateConnected
		status.LastConnectedAt = cloneTimePtr(&now)
		status.LastError = nil
		status.MissingEnvVar = nil
		status.ConsecutiveFailures = 0
		status.ToolCount = toolCount
		return status
	})
}

func (c *Client) markFailure(serverID string, err error, missingEnvVar string) {
	message := strings.TrimSpace(err.Error())
	if message == "" {
		message = "unknown MCP connection failure"
	}
	c.markStatus(serverID, func(status ServerRuntimeStatus, now time.Time) ServerRuntimeStatus {
		status.State = RuntimeStateError
		status.LastFailureAt = cloneTimePtr(&now)
		status.ConsecutiveFailures++
		status.ToolCount = 0
		status.LastError = cloneStringPtr(&message)
		if missingEnvVar == "" {
			status.MissingEnvVar = nil
		} else {
			status.MissingEnvVar = cloneStringPtr(&missingEnvVar)
		}
		return status
	})
}

func (c *Client) markRetrying(serverID string) {
	c.markStatus(serverID, func(status ServerRuntimeStatus, _ time.Time) ServerRuntimeStatus {
		status.State = RuntimeStateRetrying
		status.ToolCount = 0
		return status
	})
}

func (c *Client) markDisabled(serverID string) {
	c.markStatus(serverID, func(status ServerRuntimeStatus, _ time.Time) ServerRuntimeStatus {
		status.State = RuntimeStateDisabled
		status.ToolCount = 0
		status.LastError = nil
		status.MissingEnvVar = nil
		status.ConsecutiveFailures = 0
		return status
	})
}

func (c *Client) markStatus(serverID string, update func(ServerRuntimeStatus, time.Time) ServerRuntimeStatus) {
	c.mu.Lock()
	defer c.mu.Unlock()
	status, ok := c.runtimeStatuses[serverID]
	if !ok {
		return
	}
	c.runtimeStatuses[serverID] = update(status, time.Now().UTC())
}

func (c *Client) isShuttingDown() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.shuttingDown
}

func (c *Client) runtimeContext() context.Context {
	if c != nil && c.ctx != nil {
		return c.ctx
	}
	return context.Background()
}

func (c *sdkConnector) Connect(ctx context.Context, config ServerConfig, headers http.Header) (sessionHandle, error) {
	client := sdkmcp.NewClient(&sdkmcp.Implementation{
		Name:    clientName,
		Version: clientVersion,
	}, &sdkmcp.ClientOptions{
		Logger: c.logger,
	})

	transport, err := buildSDKTransport(config, headers, c.httpConnectWait)
	if err != nil {
		return nil, err
	}

	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return nil, err
	}
	return &sdkSession{session: session}, nil
}

func (s *sdkSession) ListTools(ctx context.Context) ([]remoteTool, error) {
	result, err := s.session.ListTools(ctx, nil)
	if err != nil {
		return nil, err
	}

	toolsForServer := make([]remoteTool, 0, len(result.Tools))
	for _, tool := range result.Tools {
		parsed, err := parseSDKTool(tool)
		if err != nil {
			return nil, err
		}
		toolsForServer = append(toolsForServer, parsed)
	}
	return toolsForServer, nil
}

func (s *sdkSession) CallTool(ctx context.Context, toolName string, arguments map[string]any, meta map[string]any) (ToolCallResult, error) {
	params := &sdkmcp.CallToolParams{
		Name:      toolName,
		Arguments: arguments,
	}
	if len(meta) > 0 {
		params.Meta = copyMetaMap(meta)
	}
	result, err := s.session.CallTool(ctx, params)
	if err != nil {
		return ToolCallResult{}, err
	}

	text := strings.Builder{}
	for _, content := range result.Content {
		textContent, ok := content.(*sdkmcp.TextContent)
		if !ok {
			continue
		}
		if text.Len() > 0 {
			text.WriteByte('\n')
		}
		text.WriteString(textContent.Text)
	}

	return ToolCallResult{
		IsError:           result.IsError,
		StructuredContent: result.StructuredContent,
		Text:              text.String(),
	}, nil
}

func (s *sdkSession) Ping(ctx context.Context) error {
	return s.session.Ping(ctx, nil)
}

func (s *sdkSession) Close() error {
	return s.session.Close()
}

func parseSDKTool(tool *sdkmcp.Tool) (remoteTool, error) {
	metadata, err := parseToolMetadata(tool.Name, tool.Meta)
	if err != nil {
		return remoteTool{}, err
	}

	kind := tools.KindDiscoverable
	readOnly := false
	if tool.Annotations != nil && tool.Annotations.ReadOnlyHint {
		readOnly = true
	}
	if metadata != nil {
		kind = metadata.Kind
		if metadata.AccessType == tools.AccessTypeRead {
			readOnly = true
		}
	}

	return remoteTool{
		Name:         tool.Name,
		Description:  tool.Description,
		InputSchema:  tool.InputSchema,
		OutputSchema: tool.OutputSchema,
		Kind:         kind,
		ReadOnly:     readOnly,
		Metadata:     metadata,
	}, nil
}

func parseToolMetadata(toolName string, meta sdkmcp.Meta) (*tools.Metadata, error) {
	if len(meta) == 0 {
		return nil, nil
	}
	raw, ok := meta[toolMetaNamespace]
	if !ok {
		return nil, nil
	}
	payload, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("mcpx: tool %q has invalid setta metadata payload", toolName)
	}

	metadata := tools.Metadata{
		Kind:                          tools.Kind(readOptionalString(payload, "toolKind")),
		AccessType:                    tools.AccessType(readOptionalString(payload, "accessType")),
		RequiresLLM:                   readOptionalBool(payload, "requiresLLM"),
		StartsRun:                     readOptionalBool(payload, "startsRun"),
		DefaultTargetSingletonSection: readOptionalString(payload, "defaultTargetSingletonSection"),
		ResultFilter:                  tools.ResultFilter(readOptionalString(payload, "resultFilter")),
		SearchTags:                    parseStringList(payload["searchTags"]),
		SearchCategory:                readOptionalString(payload, "searchCategory"),
		IDPathsByType:                 parseIDPathsByType(payload["idPathsByType"]),
		ResultIDPathsByType:           parseIDPathsByType(payload["resultIdPathsByType"]),
		ToolArgumentPreview:           parseToolArgumentPreviewMetadata(payload["toolArgumentPreview"]),
	}
	normalized, err := metadata.Normalize(toolName)
	if err != nil {
		return nil, fmt.Errorf("mcpx: normalize tool metadata for %q: %w", toolName, err)
	}
	return &normalized, nil
}

func buildSDKTransport(config ServerConfig, headers http.Header, httpConnectWait time.Duration) (sdkmcp.Transport, error) {
	switch config.Transport {
	case TransportSSE:
		return &sdkmcp.SSEClientTransport{
			Endpoint:   config.URL,
			HTTPClient: buildMCPHTTPClient(headers, httpConnectWait),
		}, nil
	case TransportStreamableHTTP:
		return &sdkmcp.StreamableClientTransport{
			Endpoint:   config.URL,
			HTTPClient: buildMCPHTTPClient(headers, httpConnectWait),
		}, nil
	case TransportStdio:
		cmd := exec.Command(config.Command, config.Args...)
		cmd.Dir = config.CWD
		cmd.Env = mergeCommandEnv(config.Env)
		return &sdkmcp.CommandTransport{Command: cmd}, nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrTransportInvalid, config.Transport)
	}
}

func buildMCPHTTPClient(headers http.Header, connectWait time.Duration) *http.Client {
	base := http.DefaultTransport.(*http.Transport).Clone()
	base.DialContext = (&net.Dialer{
		Timeout: connectWait,
	}).DialContext
	base.ResponseHeaderTimeout = connectWait
	base.TLSHandshakeTimeout = connectWait

	transport := http.RoundTripper(base)
	if len(headers) > 0 {
		transport = &headerRoundTripper{
			headers:  headers.Clone(),
			delegate: base,
		}
	}

	return &http.Client{Transport: transport}
}

type headerRoundTripper struct {
	headers  http.Header
	delegate http.RoundTripper
}

func (r *headerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	cloned := req.Clone(req.Context())
	cloned.Header = req.Header.Clone()
	for key, values := range r.headers {
		for _, value := range values {
			cloned.Header.Add(key, value)
		}
	}
	return r.delegate.RoundTrip(cloned)
}

func mergeCommandEnv(overrides map[string]string) []string {
	if len(overrides) == 0 {
		return os.Environ()
	}
	envByKey := make(map[string]string, len(overrides))
	for _, entry := range os.Environ() {
		key, value, ok := strings.Cut(entry, "=")
		if !ok {
			continue
		}
		envByKey[key] = value
	}
	for key, value := range overrides {
		envByKey[key] = value
	}
	keys := make([]string, 0, len(envByKey))
	for key := range envByKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	merged := make([]string, 0, len(keys))
	for _, key := range keys {
		merged = append(merged, key+"="+envByKey[key])
	}
	return merged
}

func serverEndpoint(config ServerConfig) string {
	if config.URL != "" {
		return config.URL
	}
	if config.Command != "" {
		return config.Command
	}
	return "(no endpoint)"
}

func sleepWithContext(ctx context.Context, wait time.Duration) bool {
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func readOptionalString(payload map[string]any, key string) string {
	value, ok := payload[key]
	if !ok {
		return ""
	}
	stringValue, _ := value.(string)
	return strings.TrimSpace(stringValue)
}

func readOptionalBool(payload map[string]any, key string) bool {
	value, ok := payload[key]
	if !ok {
		return false
	}
	boolValue, _ := value.(bool)
	return boolValue
}

func parseStringList(value any) []string {
	switch raw := value.(type) {
	case []string:
		return append([]string(nil), raw...)
	case []any:
		values := make([]string, 0, len(raw))
		for _, item := range raw {
			stringValue, ok := item.(string)
			if !ok {
				continue
			}
			values = append(values, stringValue)
		}
		return values
	default:
		return nil
	}
}

func parseIDPathsByType(value any) map[tools.IDType][]string {
	rawMap, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	paths := make(map[tools.IDType][]string, len(rawMap))
	for key, rawPaths := range rawMap {
		paths[tools.IDType(key)] = parseStringList(rawPaths)
	}
	return paths
}

func parseToolArgumentPreviewMetadata(value any) *tools.ToolArgumentPreviewMetadata {
	payload, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	return &tools.ToolArgumentPreviewMetadata{
		TargetIDPathsByType: parseIDPathsByType(payload["targetIdPathsByType"]),
		PreviewValuePath:    readOptionalString(payload, "previewValuePath"),
		PreviewKind:         tools.PreviewKind(readOptionalString(payload, "previewKind")),
	}
}

func cloneDescriptor(descriptor ToolDescriptor) ToolDescriptor {
	return ToolDescriptor{
		ServerID:       descriptor.ServerID,
		NamespacedName: descriptor.NamespacedName,
		RemoteName:     descriptor.RemoteName,
		Description:    descriptor.Description,
		Kind:           descriptor.Kind,
		ReadOnly:       descriptor.ReadOnly,
		InputSchema:    descriptor.InputSchema,
		OutputSchema:   descriptor.OutputSchema,
		Metadata:       cloneMetadataPtr(descriptor.Metadata),
	}
}

func cloneMetadataPtr(metadata *tools.Metadata) *tools.Metadata {
	if metadata == nil {
		return nil
	}
	clonedPaths := make(map[tools.IDType][]string, len(metadata.IDPathsByType))
	for idType, paths := range metadata.IDPathsByType {
		clonedPaths[idType] = append([]string(nil), paths...)
	}
	clonedResultPaths := make(map[tools.IDType][]string, len(metadata.ResultIDPathsByType))
	for idType, paths := range metadata.ResultIDPathsByType {
		clonedResultPaths[idType] = append([]string(nil), paths...)
	}
	var clonedPreview *tools.ToolArgumentPreviewMetadata
	if metadata.ToolArgumentPreview != nil {
		clonedTargetPaths := make(map[tools.IDType][]string, len(metadata.ToolArgumentPreview.TargetIDPathsByType))
		for idType, paths := range metadata.ToolArgumentPreview.TargetIDPathsByType {
			clonedTargetPaths[idType] = append([]string(nil), paths...)
		}
		clonedPreview = &tools.ToolArgumentPreviewMetadata{
			TargetIDPathsByType: clonedTargetPaths,
			PreviewValuePath:    metadata.ToolArgumentPreview.PreviewValuePath,
			PreviewKind:         metadata.ToolArgumentPreview.PreviewKind,
		}
	}
	cloned := &tools.Metadata{
		Kind:                          metadata.Kind,
		AccessType:                    metadata.AccessType,
		IDPathsByType:                 clonedPaths,
		ResultIDPathsByType:           clonedResultPaths,
		ToolArgumentPreview:           clonedPreview,
		DefaultTargetSingletonSection: metadata.DefaultTargetSingletonSection,
		ResultFilter:                  metadata.ResultFilter,
		SearchTags:                    append([]string(nil), metadata.SearchTags...),
		SearchCategory:                metadata.SearchCategory,
	}
	return cloned
}
