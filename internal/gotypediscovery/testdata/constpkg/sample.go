package constpkg

const (
	apiPrefix         = "/api"
	bootstrapPath     = "/__setta__/bootstrap"
	toolsCallTail     = "/tools/call"
	notARoute         = "ignored"
	nonStringConstant = 3
)

const RouteAPIPrefix = apiPrefix
const RouteBootstrapPage = bootstrapPath
const RouteToolsCall = apiPrefix + toolsCallTail
const RouteSDKRuntimeHandshake = "/sdkRuntimeHandshake"
