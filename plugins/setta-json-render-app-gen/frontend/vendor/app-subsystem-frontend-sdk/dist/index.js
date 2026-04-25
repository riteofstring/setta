const contracts = [{ "name": "AppGenerationMode", "kind": "enum", "schemaRef": "#/$defs/AppGenerationMode", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "json_render", "value": "json_render" }, { "name": "json_render_with_image", "value": "json_render_with_image" }, { "name": "prompt_builder", "value": "prompt_builder" }, { "name": "mcp_server", "value": "mcp_server" }] }, { "name": "ArtifactType", "kind": "enum", "schemaRef": "#/$defs/ArtifactType", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "Image", "value": "Image" }, { "name": "BrushStroke", "value": "BrushStroke" }, { "name": "DrawAreaLayerItemTransform", "value": "DrawAreaLayerItemTransform" }, { "name": "ChartData", "value": "ChartData" }, { "name": "File", "value": "File" }] }, { "name": "CodeObjType", "kind": "enum", "schemaRef": "#/$defs/CodeObjType", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "CodeCallable", "value": "CodeCallable" }, { "name": "CodeParam", "value": "CodeParam" }, { "name": "TextParam", "value": "TextParam" }, { "name": "DateParam", "value": "DateParam" }, { "name": "TimeParam", "value": "TimeParam" }, { "name": "ButtonParam", "value": "ButtonParam" }, { "name": "SliderParam", "value": "SliderParam" }, { "name": "RotaryParam", "value": "RotaryParam" }, { "name": "SwitchParam", "value": "SwitchParam" }, { "name": "ColorPickerParam", "value": "ColorPickerParam" }, { "name": "DropdownParam", "value": "DropdownParam" }, { "name": "PasswordParam", "value": "PasswordParam" }, { "name": "TextAreaParam", "value": "TextAreaParam" }, { "name": "DropzoneParam", "value": "DropzoneParam" }, { "name": "NestedParam", "value": "NestedParam" }] }, { "name": "ConfigLanguage", "kind": "enum", "schemaRef": "#/$defs/ConfigLanguage", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "python", "value": "python" }, { "name": "json", "value": "json" }] }, { "name": "DateCalendarWeekStart", "kind": "enum", "schemaRef": "#/$defs/DateCalendarWeekStart", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "sunday", "value": "sunday" }, { "name": "monday", "value": "monday" }] }, { "name": "DateControlMode", "kind": "enum", "schemaRef": "#/$defs/DateControlMode", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "input", "value": "input" }, { "name": "calendar", "value": "calendar" }] }, { "name": "DateDisplayFormat", "kind": "enum", "schemaRef": "#/$defs/DateDisplayFormat", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "iso", "value": "iso" }, { "name": "us", "value": "us" }, { "name": "eu", "value": "eu" }, { "name": "long", "value": "long" }] }, { "name": "DateSelectionMode", "kind": "enum", "schemaRef": "#/$defs/DateSelectionMode", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "single", "value": "single" }, { "name": "multiple", "value": "multiple" }] }, { "name": "DependencyKeyType", "kind": "enum", "schemaRef": "#/$defs/DependencyKeyType", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "Section", "value": "Section" }, { "name": "SectionParam", "value": "SectionParam" }] }, { "name": "DependencyValueType", "kind": "enum", "schemaRef": "#/$defs/DependencyValueType", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "Literal", "value": "Literal" }, { "name": "Binary", "value": "Binary" }, { "name": "FileRead", "value": "FileRead" }] }, { "name": "DropzoneMode", "kind": "enum", "schemaRef": "#/$defs/DropzoneMode", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "STATEFUL", "value": "STATEFUL" }, { "name": "STATELESS", "value": "STATELESS" }] }, { "name": "EndpointOrigin", "kind": "enum", "schemaRef": "#/$defs/EndpointOrigin", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "backend", "value": "backend" }, { "name": "launcher", "value": "launcher" }, { "name": "BackendOrigin", "value": "backend-origin" }] }, { "name": "SectionType", "kind": "enum", "schemaRef": "#/$defs/SectionType", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "Callable", "value": "Callable" }, { "name": "Dict", "value": "Dict" }, { "name": "ListRoot", "value": "ListRoot" }, { "name": "Group", "value": "Group" }, { "name": "StateMachineStart", "value": "StateMachineStart" }, { "name": "StateMachineGate", "value": "StateMachineGate" }, { "name": "StateMachineEnd", "value": "StateMachineEnd" }, { "name": "Image", "value": "Image" }, { "name": "Chart", "value": "Chart" }, { "name": "Draw", "value": "Draw" }, { "name": "TextBlock", "value": "TextBlock" }, { "name": "Prompt", "value": "Prompt" }, { "name": "MetaControl", "value": "MetaControl" }, { "name": "Social", "value": "Social" }, { "name": "GlobalVariables", "value": "GlobalVariables" }, { "name": "Code", "value": "Code" }, { "name": "GenPythonCode", "value": "GenPythonCode" }, { "name": "GenPythonMetadata", "value": "GenPythonMetadata" }, { "name": "Terminal", "value": "Terminal" }, { "name": "IFrame", "value": "IFrame" }, { "name": "Chat", "value": "Chat" }, { "name": "Browser", "value": "Browser" }, { "name": "Plugin", "value": "Plugin" }, { "name": "TaskBoard", "value": "TaskBoard" }, { "name": "Spreadsheet", "value": "Spreadsheet" }] }, { "name": "TextBlockFormat", "kind": "enum", "schemaRef": "#/$defs/TextBlockFormat", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "Plaintext", "value": "Plaintext" }, { "name": "Markdown", "value": "Markdown" }] }, { "name": "TextParamInputUIType", "kind": "enum", "schemaRef": "#/$defs/TextParamInputUIType", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "plain", "value": "plain" }, { "name": "time", "value": "time" }, { "name": "date", "value": "date" }] }, { "name": "TimeControlMode", "kind": "enum", "schemaRef": "#/$defs/TimeControlMode", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "input", "value": "input" }, { "name": "display", "value": "display" }] }, { "name": "TimeDisplayFont", "kind": "enum", "schemaRef": "#/$defs/TimeDisplayFont", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "clock", "value": "clock" }, { "name": "monospace", "value": "monospace" }, { "name": "system", "value": "system" }] }, { "name": "TimeDisplayFormat", "kind": "enum", "schemaRef": "#/$defs/TimeDisplayFormat", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "twenty_four_hour", "value": "twenty_four_hour" }, { "name": "twelve_hour", "value": "twelve_hour" }] }, { "name": "WorkspaceLaunchRouteKind", "kind": "enum", "schemaRef": "#/$defs/WorkspaceLaunchRouteKind", "frontendSDKScopes": ["app-subsystem"], "enumValues": [{ "name": "ide", "value": "ide" }, { "name": "launcher", "value": "launcher" }, { "name": "blocked", "value": "blocked" }] }];
const exportedValues = [{ "name": "AppSpecPatchPolicyConfig", "type": "PatchPolicy", "frontendSDKScopes": [{ "scope": "app-subsystem", "includeFullValue": true }], "value": { "allowedOps": ["set", "add", "replace", "remove"], "commentPrefix": "//", "elementsPathPrefix": "/elements/", "rootPath": "/root", "rootResetValue": "", "valueOptionalOps": ["remove"] } }, { "name": "AppSubsystemChatUIConfig", "type": "AppSubsystemChatUIConfigValue", "frontendSDKScopes": [{ "scope": "app-subsystem", "includeFullValue": true }], "value": { "customSlashCommandModeOptions": [{ "label": "Plain chat", "requiresImageAttachment": false, "value": "plain_chat" }, { "label": "JSON Render", "requiresImageAttachment": false, "value": "json_render" }, { "label": "Image to JSON Render", "requiresImageAttachment": true, "value": "json_render_with_image" }, { "label": "Prompt Builder", "requiresImageAttachment": false, "value": "prompt_builder" }, { "label": "MCP Server", "requiresImageAttachment": false, "value": "mcp_server" }], "defaultCustomSlashCommandMode": "plain_chat", "slashCommands": [{ "action": "app_json_render", "appGenerationMode": "json_render", "command": "/app-json", "promptTemplate": "Generate a polished standalone JSON-render app spec. Use a strong hero section, clear content grouping, and consistent spacing/typography by default. Include one obvious primary action path and production-ready baseline structure.", "summary": "Generate a standalone app spec through JSON render." }, { "action": "app_json_render_with_image", "appGenerationMode": "json_render_with_image", "command": "/app-image", "promptTemplate": "Generate a JSON-render app spec that matches the attached reference image as closely as possible. Prioritize layout composition first, then spacing, typography scale, and color intent. Stay within catalog constraints and preserve the closest visual approximation when exact parity is impossible.", "summary": "Generate an app spec using attached image guidance." }, { "action": "app_prompt_builder", "appGenerationMode": "prompt_builder", "command": "/app-prompt", "promptTemplate": "Generate a practical, polished JSON-render app spec for this project. Use strong information hierarchy, clear spacing rhythm, and one primary action path. Persist the result into the project via Setta app-definition tools.", "summary": "Generate an app-definition plan for chat-driven iteration." }, { "action": "app_mcp_server", "appGenerationMode": "mcp_server", "command": "/app-mcp", "promptTemplate": "Use MCP tools to produce a high-fidelity UI implementation for this project. If design-import tools are available, import an existing design or generate one before mapping it back into Setta's app definition. Preserve clear hierarchy, responsive layout behavior, and practical defaults.", "summary": "Route app generation through MCP-capable tools." }] } }, { "name": "BootstrapProtocol", "type": "BootstrapHandoffProtocol", "frontendSDKScopes": [{ "scope": "app-subsystem", "valuePaths": [["launcherOriginStorageKey"]] }], "value": { "launcherOriginStorageKey": "setta.launcherOrigin" } }, { "name": "C", "type": "Constants", "frontendSDKScopes": [{ "scope": "app-subsystem", "includeFullValue": true }], "value": { "AUTH_COOKIE_REFRESH_WINDOW_SECONDS": 3600, "CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES": [], "CHAT_ATTACHMENTS_MAX_FILES": 10, "CHAT_ATTACHMENTS_MAX_FILE_BYTES": 26214400, "CHAT_ATTACHMENTS_MAX_FILE_LABEL": "25 MB", "DEFAULT_HOST": "127.0.0.1", "DEFAULT_PORT": 8e3, "DROPZONE_ALLOWED_MIME_PREFIXES": [], "DROPZONE_STATEFUL_MAX_FILE_BYTES": 26214400, "DROPZONE_STATEFUL_MAX_FILE_LABEL": "25 MB", "DROPZONE_STATELESS_MAX_FILE_BYTES": 5242880, "DROPZONE_STATELESS_MAX_FILE_LABEL": "5 MB", "DROPZONE_STATELESS_MAX_TOTAL_BYTES": 16777216, "DROPZONE_STATELESS_MAX_TOTAL_LABEL": "16 MB", "EDGE_OUTPUT_BASE_LABEL": "value", "GEN_CODE_SEPARATOR_NEWLINES": 2, "LLM_TEXT": "text", "LLM_THINKING": "thinking", "NOTIFICATION_IS_FOR_ALL_PROJECTS": "NOTIFICATION_IS_FOR_ALL_PROJECTS", "REALTIME_BINARY_MAX_BYTES": 10485760, "SETTA_TERMINAL_READY": "SETTA_TERMINAL_READY", "SETTINGS_PROJECT_NAME": "settings", "WS_TERMINAL_RESIZE": "terminalResize" } }, { "name": "DefaultAppPolicy", "type": "Policy", "frontendSDKScopes": [{ "scope": "app-subsystem", "includeFullValue": true }], "value": { "allowExternalLinks": false, "allowFileDownloads": false, "allowLLM": false, "allowLayoutChanges": false, "allowMultipleRuns": true, "allowParamChanges": true, "allowRun": true, "allowVariantChanges": false, "runSnapshotMode": "ephemeral" } }, { "name": "EndpointOriginPolicyByRoute", "type": "EndpointOriginPolicy", "frontendSDKScopes": [{ "scope": "app-subsystem", "valuePaths": [["/__setta__/tools/call"]] }], "value": { "/__setta__/tools/call": "backend-origin" } }, { "name": "LocalHostnamePolicyConfig", "type": "LocalHostnamePolicy", "frontendSDKScopes": [{ "scope": "app-subsystem", "includeFullValue": true }], "value": { "loopbackHosts": ["127.0.0.1", "localhost", "::1"] } }, { "name": "ModeScopedLauncherRoutesList", "type": "ModeScopedLauncherRoutes", "frontendSDKScopes": [{ "scope": "app-subsystem" }], "value": [] }, { "name": "RunSnapshotModeUIConfig", "type": "RunSnapshotModeUIConfigValue", "frontendSDKScopes": [{ "scope": "app-subsystem", "includeFullValue": true }], "value": { "deploymentOptions": [{ "description": "Snapshot per run, cleaned up automatically.", "label": "Ephemeral", "value": "ephemeral" }, { "description": "Snapshot per run, stored under code history.", "label": "Always", "value": "always" }], "options": [{ "description": "Snapshot per run, cleaned up automatically.", "label": "Ephemeral", "value": "ephemeral" }, { "description": "Snapshot per run, stored under code history.", "label": "Always", "value": "always" }, { "description": "Run from canonical files without a snapshot.", "label": "Never", "value": "never" }] } }, { "name": "ServerModeBoundaryPolicyByMode", "type": "ServerModeBoundaryPolicy", "frontendSDKScopes": [{ "scope": "app-subsystem", "includeFullValue": true }], "value": { "app": { "capabilities": { "canManageDesktopLauncher": false }, "workspaceLaunchRouteKind": "blocked" }, "ide": { "capabilities": { "canManageDesktopLauncher": true }, "workspaceLaunchRouteKind": "ide" }, "launcher": { "capabilities": { "canManageDesktopLauncher": false }, "workspaceLaunchRouteKind": "launcher" }, "share": { "capabilities": { "canManageDesktopLauncher": false }, "workspaceLaunchRouteKind": "blocked" } } }, { "name": "TransportRouteConstants", "type": "TransportRoutes", "frontendSDKScopes": [{ "scope": "app-subsystem", "valuePaths": [["apiPrefix"], ["binary", "download"], ["binary", "upload"], ["root", "bootstrapPage"], ["root", "toolsCall"], ["websocket", "frontend"], ["websocket", "listenerById"], ["websocket", "terminalBySection"]] }], "value": { "apiPrefix": "/api", "binary": { "download": "/binary/{contentId}", "upload": "/binary/upload" }, "root": { "bootstrapPage": "/__setta__/bootstrap", "toolsCall": "/__setta__/tools/call" }, "websocket": { "frontend": "/ws/frontend", "listenerById": "/ws/listeners/{listenerID}", "terminalBySection": "/ws/terminals/{projectID}/{sectionID}" } } }];
const sidecar = {
  contracts,
  exportedValues
};
const a = (a2) => {
  a2 = 1831565813 + (a2 |= 0) | 0;
  let e2 = Math.imul(a2 ^ a2 >>> 15, 1 | a2);
  return e2 = e2 + Math.imul(e2 ^ e2 >>> 7, 61 | e2) ^ e2, ((e2 ^ e2 >>> 14) >>> 0) / 4294967296;
};
class e {
  constructor(a2) {
    this.dictionaries = void 0, this.length = void 0, this.separator = void 0, this.style = void 0, this.seed = void 0;
    const { length: e2, separator: i2, dictionaries: n2, style: l2, seed: r } = a2;
    this.dictionaries = n2, this.separator = i2, this.length = e2, this.style = l2, this.seed = r;
  }
  generate() {
    if (!this.dictionaries) throw new Error('Cannot find any dictionary. Please provide at least one, or leave the "dictionary" field empty in the config object');
    if (this.length <= 0) throw new Error("Invalid length provided");
    if (this.length > this.dictionaries.length) throw new Error(`The length cannot be bigger than the number of dictionaries.
Length provided: ${this.length}. Number of dictionaries provided: ${this.dictionaries.length}`);
    let e2 = this.seed;
    return this.dictionaries.slice(0, this.length).reduce((i2, n2) => {
      let l2;
      e2 ? (l2 = ((e3) => {
        if ("string" == typeof e3) {
          const i3 = e3.split("").map((a2) => a2.charCodeAt(0)).reduce((a2, e4) => a2 + e4, 1), n3 = Math.floor(Number(i3));
          return a(n3);
        }
        return a(e3);
      })(e2), e2 = 4294967296 * l2) : l2 = Math.random();
      let r = n2[Math.floor(l2 * n2.length)] || "";
      if ("lowerCase" === this.style) r = r.toLowerCase();
      else if ("capital" === this.style) {
        const [a2, ...e3] = r.split("");
        r = a2.toUpperCase() + e3.join("");
      } else "upperCase" === this.style && (r = r.toUpperCase());
      return i2 ? `${i2}${this.separator}${r}` : `${r}`;
    }, "");
  }
}
const i = { separator: "_", dictionaries: [] }, n = (a2) => {
  const n2 = [...a2 && a2.dictionaries || i.dictionaries], l2 = { ...i, ...a2, length: a2 && a2.length || n2.length, dictionaries: n2 };
  if (!a2 || !a2.dictionaries || !a2.dictionaries.length) throw new Error('A "dictionaries" array must be provided. This is a breaking change introduced starting from Unique Name Generator v4. Read more about the breaking change here: https://github.com/andreasonny83/unique-names-generator#migration-guide');
  return new e(l2).generate();
};
var l = ["able", "above", "absent", "absolute", "abstract", "abundant", "academic", "acceptable", "accepted", "accessible", "accurate", "accused", "active", "actual", "acute", "added", "additional", "adequate", "adjacent", "administrative", "adorable", "advanced", "adverse", "advisory", "aesthetic", "afraid", "aggregate", "aggressive", "agreeable", "agreed", "agricultural", "alert", "alive", "alleged", "allied", "alone", "alright", "alternative", "amateur", "amazing", "ambitious", "amused", "ancient", "angry", "annoyed", "annual", "anonymous", "anxious", "appalling", "apparent", "applicable", "appropriate", "arbitrary", "architectural", "armed", "arrogant", "artificial", "artistic", "ashamed", "asleep", "assistant", "associated", "atomic", "attractive", "automatic", "autonomous", "available", "average", "awake", "aware", "awful", "awkward", "back", "bad", "balanced", "bare", "basic", "beautiful", "beneficial", "better", "bewildered", "big", "binding", "biological", "bitter", "bizarre", "blank", "blind", "blonde", "bloody", "blushing", "boiling", "bold", "bored", "boring", "bottom", "brainy", "brave", "breakable", "breezy", "brief", "bright", "brilliant", "broad", "broken", "bumpy", "burning", "busy", "calm", "capable", "capitalist", "careful", "casual", "causal", "cautious", "central", "certain", "changing", "characteristic", "charming", "cheap", "cheerful", "chemical", "chief", "chilly", "chosen", "christian", "chronic", "chubby", "circular", "civic", "civil", "civilian", "classic", "classical", "clean", "clear", "clever", "clinical", "close", "closed", "cloudy", "clumsy", "coastal", "cognitive", "coherent", "cold", "collective", "colonial", "colorful", "colossal", "coloured", "colourful", "combative", "combined", "comfortable", "coming", "commercial", "common", "communist", "compact", "comparable", "comparative", "compatible", "competent", "competitive", "complete", "complex", "complicated", "comprehensive", "compulsory", "conceptual", "concerned", "concrete", "condemned", "confident", "confidential", "confused", "conscious", "conservation", "conservative", "considerable", "consistent", "constant", "constitutional", "contemporary", "content", "continental", "continued", "continuing", "continuous", "controlled", "controversial", "convenient", "conventional", "convinced", "convincing", "cooing", "cool", "cooperative", "corporate", "correct", "corresponding", "costly", "courageous", "crazy", "creative", "creepy", "criminal", "critical", "crooked", "crowded", "crucial", "crude", "cruel", "cuddly", "cultural", "curious", "curly", "current", "curved", "cute", "daily", "damaged", "damp", "dangerous", "dark", "dead", "deaf", "deafening", "dear", "decent", "decisive", "deep", "defeated", "defensive", "defiant", "definite", "deliberate", "delicate", "delicious", "delighted", "delightful", "democratic", "dependent", "depressed", "desirable", "desperate", "detailed", "determined", "developed", "developing", "devoted", "different", "difficult", "digital", "diplomatic", "direct", "dirty", "disabled", "disappointed", "disastrous", "disciplinary", "disgusted", "distant", "distinct", "distinctive", "distinguished", "disturbed", "disturbing", "diverse", "divine", "dizzy", "domestic", "dominant", "double", "doubtful", "drab", "dramatic", "dreadful", "driving", "drunk", "dry", "dual", "due", "dull", "dusty", "dutch", "dying", "dynamic", "eager", "early", "eastern", "easy", "economic", "educational", "eerie", "effective", "efficient", "elaborate", "elated", "elderly", "eldest", "electoral", "electric", "electrical", "electronic", "elegant", "eligible", "embarrassed", "embarrassing", "emotional", "empirical", "empty", "enchanting", "encouraging", "endless", "energetic", "enormous", "enthusiastic", "entire", "entitled", "envious", "environmental", "equal", "equivalent", "essential", "established", "estimated", "ethical", "ethnic", "eventual", "everyday", "evident", "evil", "evolutionary", "exact", "excellent", "exceptional", "excess", "excessive", "excited", "exciting", "exclusive", "existing", "exotic", "expected", "expensive", "experienced", "experimental", "explicit", "extended", "extensive", "external", "extra", "extraordinary", "extreme", "exuberant", "faint", "fair", "faithful", "familiar", "famous", "fancy", "fantastic", "far", "fascinating", "fashionable", "fast", "fat", "fatal", "favourable", "favourite", "federal", "fellow", "female", "feminist", "few", "fierce", "filthy", "final", "financial", "fine", "firm", "fiscal", "fit", "fixed", "flaky", "flat", "flexible", "fluffy", "fluttering", "flying", "following", "fond", "foolish", "foreign", "formal", "formidable", "forthcoming", "fortunate", "forward", "fragile", "frail", "frantic", "free", "frequent", "fresh", "friendly", "frightened", "front", "frozen", "full", "fun", "functional", "fundamental", "funny", "furious", "future", "fuzzy", "gastric", "gay", "general", "generous", "genetic", "gentle", "genuine", "geographical", "giant", "gigantic", "given", "glad", "glamorous", "gleaming", "global", "glorious", "golden", "good", "gorgeous", "gothic", "governing", "graceful", "gradual", "grand", "grateful", "greasy", "great", "grieving", "grim", "gross", "grotesque", "growing", "grubby", "grumpy", "guilty", "handicapped", "handsome", "happy", "hard", "harsh", "head", "healthy", "heavy", "helpful", "helpless", "hidden", "high", "hilarious", "hissing", "historic", "historical", "hollow", "holy", "homeless", "homely", "hon", "honest", "horizontal", "horrible", "hostile", "hot", "huge", "human", "hungry", "hurt", "hushed", "husky", "icy", "ideal", "identical", "ideological", "ill", "illegal", "imaginative", "immediate", "immense", "imperial", "implicit", "important", "impossible", "impressed", "impressive", "improved", "inadequate", "inappropriate", "inc", "inclined", "increased", "increasing", "incredible", "independent", "indirect", "individual", "industrial", "inevitable", "influential", "informal", "inherent", "initial", "injured", "inland", "inner", "innocent", "innovative", "inquisitive", "instant", "institutional", "insufficient", "intact", "integral", "integrated", "intellectual", "intelligent", "intense", "intensive", "interested", "interesting", "interim", "interior", "intermediate", "internal", "international", "intimate", "invisible", "involved", "irrelevant", "isolated", "itchy", "jealous", "jittery", "joint", "jolly", "joyous", "judicial", "juicy", "junior", "just", "keen", "key", "kind", "known", "labour", "large", "late", "latin", "lazy", "leading", "left", "legal", "legislative", "legitimate", "lengthy", "lesser", "level", "lexical", "liable", "liberal", "light", "like", "likely", "limited", "linear", "linguistic", "liquid", "literary", "little", "live", "lively", "living", "local", "logical", "lonely", "long", "loose", "lost", "loud", "lovely", "low", "loyal", "ltd", "lucky", "mad", "magic", "magnetic", "magnificent", "main", "major", "male", "mammoth", "managerial", "managing", "manual", "many", "marginal", "marine", "marked", "married", "marvellous", "marxist", "mass", "massive", "mathematical", "mature", "maximum", "mean", "meaningful", "mechanical", "medical", "medieval", "melodic", "melted", "mental", "mere", "metropolitan", "mid", "middle", "mighty", "mild", "military", "miniature", "minimal", "minimum", "ministerial", "minor", "miserable", "misleading", "missing", "misty", "mixed", "moaning", "mobile", "moderate", "modern", "modest", "molecular", "monetary", "monthly", "moral", "motionless", "muddy", "multiple", "mushy", "musical", "mute", "mutual", "mysterious", "naked", "narrow", "nasty", "national", "native", "natural", "naughty", "naval", "near", "nearby", "neat", "necessary", "negative", "neighbouring", "nervous", "net", "neutral", "new", "nice", "noble", "noisy", "normal", "northern", "nosy", "notable", "novel", "nuclear", "numerous", "nursing", "nutritious", "nutty", "obedient", "objective", "obliged", "obnoxious", "obvious", "occasional", "occupational", "odd", "official", "ok", "okay", "old", "olympic", "only", "open", "operational", "opposite", "optimistic", "oral", "ordinary", "organic", "organisational", "original", "orthodox", "other", "outdoor", "outer", "outrageous", "outside", "outstanding", "overall", "overseas", "overwhelming", "painful", "pale", "panicky", "parallel", "parental", "parliamentary", "partial", "particular", "passing", "passive", "past", "patient", "payable", "peaceful", "peculiar", "perfect", "permanent", "persistent", "personal", "petite", "philosophical", "physical", "plain", "planned", "plastic", "pleasant", "pleased", "poised", "polite", "political", "poor", "popular", "positive", "possible", "potential", "powerful", "practical", "precious", "precise", "preferred", "pregnant", "preliminary", "premier", "prepared", "present", "presidential", "pretty", "previous", "prickly", "primary", "prime", "primitive", "principal", "printed", "prior", "private", "probable", "productive", "professional", "profitable", "profound", "progressive", "prominent", "promising", "proper", "proposed", "prospective", "protective", "protestant", "proud", "provincial", "psychiatric", "psychological", "public", "puny", "pure", "purring", "puzzled", "quaint", "qualified", "quarrelsome", "querulous", "quick", "quickest", "quiet", "quintessential", "quixotic", "racial", "radical", "rainy", "random", "rapid", "rare", "raspy", "rational", "ratty", "raw", "ready", "real", "realistic", "rear", "reasonable", "recent", "reduced", "redundant", "regional", "registered", "regular", "regulatory", "related", "relative", "relaxed", "relevant", "reliable", "relieved", "religious", "reluctant", "remaining", "remarkable", "remote", "renewed", "representative", "repulsive", "required", "resident", "residential", "resonant", "respectable", "respective", "responsible", "resulting", "retail", "retired", "revolutionary", "rich", "ridiculous", "right", "rigid", "ripe", "rising", "rival", "roasted", "robust", "rolling", "romantic", "rotten", "rough", "round", "royal", "rubber", "rude", "ruling", "running", "rural", "sacred", "sad", "safe", "salty", "satisfactory", "satisfied", "scared", "scary", "scattered", "scientific", "scornful", "scrawny", "screeching", "secondary", "secret", "secure", "select", "selected", "selective", "selfish", "semantic", "senior", "sensible", "sensitive", "separate", "serious", "severe", "sexual", "shaggy", "shaky", "shallow", "shared", "sharp", "sheer", "shiny", "shivering", "shocked", "short", "shrill", "shy", "sick", "significant", "silent", "silky", "silly", "similar", "simple", "single", "skilled", "skinny", "sleepy", "slight", "slim", "slimy", "slippery", "slow", "small", "smart", "smiling", "smoggy", "smooth", "social", "socialist", "soft", "solar", "sole", "solid", "sophisticated", "sore", "sorry", "sound", "sour", "southern", "soviet", "spare", "sparkling", "spatial", "special", "specific", "specified", "spectacular", "spicy", "spiritual", "splendid", "spontaneous", "sporting", "spotless", "spotty", "square", "squealing", "stable", "stale", "standard", "static", "statistical", "statutory", "steady", "steep", "sticky", "stiff", "still", "stingy", "stormy", "straight", "straightforward", "strange", "strategic", "strict", "striking", "striped", "strong", "structural", "stuck", "stupid", "subjective", "subsequent", "substantial", "subtle", "successful", "successive", "sudden", "sufficient", "suitable", "sunny", "super", "superb", "superior", "supporting", "supposed", "supreme", "sure", "surprised", "surprising", "surrounding", "surviving", "suspicious", "sweet", "swift", "symbolic", "sympathetic", "systematic", "tall", "tame", "tart", "tasteless", "tasty", "technical", "technological", "teenage", "temporary", "tender", "tense", "terrible", "territorial", "testy", "then", "theoretical", "thick", "thin", "thirsty", "thorough", "thoughtful", "thoughtless", "thundering", "tight", "tiny", "tired", "top", "tory", "total", "tough", "toxic", "traditional", "tragic", "tremendous", "tricky", "tropical", "troubled", "typical", "ugliest", "ugly", "ultimate", "unable", "unacceptable", "unaware", "uncertain", "unchanged", "uncomfortable", "unconscious", "underground", "underlying", "unemployed", "uneven", "unexpected", "unfair", "unfortunate", "unhappy", "uniform", "uninterested", "unique", "united", "universal", "unknown", "unlikely", "unnecessary", "unpleasant", "unsightly", "unusual", "unwilling", "upper", "upset", "uptight", "urban", "urgent", "used", "useful", "useless", "usual", "vague", "valid", "valuable", "variable", "varied", "various", "varying", "vast", "verbal", "vertical", "very", "vicarious", "vicious", "victorious", "violent", "visible", "visiting", "visual", "vital", "vitreous", "vivacious", "vivid", "vocal", "vocational", "voiceless", "voluminous", "voluntary", "vulnerable", "wandering", "warm", "wasteful", "watery", "weak", "wealthy", "weary", "wee", "weekly", "weird", "welcome", "well", "western", "wet", "whispering", "whole", "wicked", "wide", "widespread", "wild", "wilful", "willing", "willowy", "wily", "wise", "wispy", "wittering", "witty", "wonderful", "wooden", "working", "worldwide", "worried", "worrying", "worthwhile", "worthy", "written", "wrong", "xenacious", "xenial", "xenogeneic", "xenophobic", "xeric", "xerothermic", "yabbering", "yammering", "yappiest", "yappy", "yawning", "yearling", "yearning", "yeasty", "yelling", "yelping", "yielding", "yodelling", "young", "youngest", "youthful", "ytterbic", "yucky", "yummy", "zany", "zealous", "zeroth", "zestful", "zesty", "zippy", "zonal", "zoophagous", "zygomorphic", "zygotic"], t = ["amaranth", "amber", "amethyst", "apricot", "aqua", "aquamarine", "azure", "beige", "black", "blue", "blush", "bronze", "brown", "chocolate", "coffee", "copper", "coral", "crimson", "cyan", "emerald", "fuchsia", "gold", "gray", "green", "harlequin", "indigo", "ivory", "jade", "lavender", "lime", "magenta", "maroon", "moccasin", "olive", "orange", "peach", "pink", "plum", "purple", "red", "rose", "salmon", "sapphire", "scarlet", "silver", "tan", "teal", "tomato", "turquoise", "violet", "white", "yellow"];
let getRandomValues;
const rnds8 = new Uint8Array(16);
function rng() {
  if (!getRandomValues) {
    getRandomValues = typeof crypto !== "undefined" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);
    if (!getRandomValues) {
      throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
    }
  }
  return getRandomValues(rnds8);
}
const byteToHex = [];
for (let i2 = 0; i2 < 256; ++i2) {
  byteToHex.push((i2 + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
const randomUUID = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
const native = {
  randomUUID
};
function v4(options, buf, offset) {
  if (native.randomUUID && true && !options) {
    return native.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  return unsafeStringify(rnds);
}
const ARTIFACTS_ROOT = "artifacts";
function createNewId() {
  return v4();
}
function createArtifactId(extension = ".json") {
  return `${ARTIFACTS_ROOT}/${createNewId()}${extension}`;
}
function createPngArtifactId() {
  return createFileArtifactId(".png");
}
function createFileArtifactId(extension = ".bin") {
  return createArtifactId(extension);
}
function createRandomName() {
  const customConfig = {
    dictionaries: [l, t],
    separator: "_",
    length: 2
  };
  return n(customConfig);
}
function cloneGeneratedValue(value) {
  if (value === null || value === void 0 || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneGeneratedValue(entry));
  }
  const cloned = {};
  for (const [key, entry] of Object.entries(
    value
  )) {
    cloned[key] = cloneGeneratedValue(entry);
  }
  return cloned;
}
function mergeGeneratedOptions(defaults, options = {}) {
  return {
    ...cloneGeneratedValue(defaults),
    ...cloneGeneratedValue(options)
  };
}
function readGeneratedExportedValue$1(name) {
  const entry = sidecar.exportedValues.find(
    (candidate) => candidate.name === name
  );
  if (!entry) {
    throw new Error(
      `Missing generated app-subsystem SDK exported value ${JSON.stringify(name)}. Regenerate frontend bindings.`
    );
  }
  return entry.value;
}
function readGeneratedStringEnum$1(name) {
  const entry = sidecar.contracts.find(
    (candidate) => candidate.kind === "enum" && candidate.name === name
  );
  const values = entry?.enumValues ?? [];
  if (values.length === 0) {
    throw new Error(
      `Missing generated app-subsystem SDK string enum ${JSON.stringify(name)}.`
    );
  }
  return Object.freeze(
    Object.fromEntries(
      values.map((candidate) => [candidate.name, candidate.value])
    )
  );
}
const ArtifactTypeEnum = readGeneratedStringEnum$1("ArtifactType");
const CodeObjTypeEnum = readGeneratedStringEnum$1("CodeObjType");
const ConfigLanguageEnum = readGeneratedStringEnum$1("ConfigLanguage");
const DateCalendarWeekStartEnum = readGeneratedStringEnum$1(
  "DateCalendarWeekStart"
);
const DateControlModeEnum = readGeneratedStringEnum$1("DateControlMode");
const DateDisplayFormatEnum = readGeneratedStringEnum$1("DateDisplayFormat");
const DateSelectionModeEnum = readGeneratedStringEnum$1("DateSelectionMode");
const DependencyKeyTypeEnum = readGeneratedStringEnum$1("DependencyKeyType");
const DependencyValueTypeEnum = readGeneratedStringEnum$1(
  "DependencyValueType"
);
const DropzoneModeEnum = readGeneratedStringEnum$1("DropzoneMode");
const EndpointOriginEnum = readGeneratedStringEnum$1("EndpointOrigin");
const SectionTypeEnum = readGeneratedStringEnum$1("SectionType");
const TextBlockFormatEnum = readGeneratedStringEnum$1("TextBlockFormat");
const TextParamInputUITypeEnum = readGeneratedStringEnum$1(
  "TextParamInputUIType"
);
const TimeControlModeEnum = readGeneratedStringEnum$1("TimeControlMode");
const TimeDisplayFontEnum = readGeneratedStringEnum$1("TimeDisplayFont");
const TimeDisplayFormatEnum = readGeneratedStringEnum$1("TimeDisplayFormat");
readGeneratedStringEnum$1(
  "WorkspaceLaunchRouteKind"
);
const BootstrapProtocol = readGeneratedExportedValue$1("BootstrapProtocol");
const C = readGeneratedExportedValue$1("C");
const DefaultAppPolicy = readGeneratedExportedValue$1("DefaultAppPolicy");
const EndpointOriginPolicyByRoute = readGeneratedExportedValue$1("EndpointOriginPolicyByRoute");
const LocalHostnamePolicyConfig = readGeneratedExportedValue$1("LocalHostnamePolicyConfig");
const ModeScopedLauncherRoutesList = readGeneratedExportedValue$1("ModeScopedLauncherRoutesList");
const RunSnapshotModeUIConfig = readGeneratedExportedValue$1(
  "RunSnapshotModeUIConfig"
);
readGeneratedExportedValue$1(
  "ServerModeBoundaryPolicyByMode"
);
const TransportRouteConstants = readGeneratedExportedValue$1("TransportRouteConstants");
function createPolicy(options = {}) {
  return cloneGeneratedValue(options);
}
function createCore(options = {}) {
  const defaults = {
    defaultVariant: null,
    displayName: "",
    id: "",
    name: "",
    sharedModifier: {},
    unsharedKeys: [],
    variants: []
  };
  return mergeGeneratedOptions(defaults, options);
}
function createVariant(options = {}) {
  const defaults = {
    id: "",
    impl: "",
    isFrozen: false,
    modifier: {},
    name: "",
    nonPresetImpls: []
  };
  return mergeGeneratedOptions(defaults, options);
}
function createContentRef(options = {}) {
  return cloneGeneratedValue(options);
}
function createImageArtifact(options = {}) {
  const defaults = {
    id: "",
    type: "Image",
    value: {
      byteLength: 0,
      contentId: "",
      mimeType: "",
      sha256: ""
    }
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    id: options.id ?? createPngArtifactId(),
    value: options.value ?? createContentRef()
  };
}
function createProjectConfig(options = {}) {
  const defaults = {
    activeIds: [],
    activeViewModeId: null,
    agenticEdges: [],
    allowJsonSourceKeyEdits: false,
    codegenTargets: [],
    edges: [],
    entryCodeBlockId: null,
    hasPythonCodegenTarget: false,
    id: "",
    isEditingViewMode: false,
    name: "",
    previewImgColor: "",
    runCapabilities: {
      canRunFromMain: false,
      effectiveEntrySectionId: null,
      mainRunDisabledReason: null
    },
    sectionIdsByPathSlug: {},
    sectionPathSlugsById: {},
    sectionVariantMap: {},
    showParamDisplayNames: false,
    stateMachineEdges: [],
    topLevelSections: {},
    viewModes: {},
    viewport: null,
    viewportInitialized: false,
    watchCodeBaselineByPath: {},
    watchCodeEnabled: false,
    watchCodeFiles: [],
    watchCodeFolders: [],
    watchCodeRegistry: {},
    windowSpaceIdsBySlug: {},
    windowSpaceSlugsById: {},
    windowSpaces: {}
  };
  return mergeGeneratedOptions(defaults, options);
}
function createSingletonSections(options = {}) {
  const defaults = {
    GenPythonCode: null,
    GenPythonMetadata: null,
    GlobalVariables: null
  };
  return mergeGeneratedOptions(defaults, options);
}
function createSectionCapabilities(options = {}) {
  const defaults = {
    canRun: false,
    canSelectAsEntryCodeBlock: false,
    entryCodeBlockValue: null,
    runDisabledReason: null,
    runRequestSectionId: null
  };
  return mergeGeneratedOptions(defaults, options);
}
function createSingleConfig(options = {}) {
  const defaults = {
    artifactGroups: {},
    codeObjImpls: {},
    codeObjVariants: {},
    codeObjs: {},
    genCodeBinding: null,
    parentSectionMap: {},
    projectChatWindowing: {
      instancesById: {},
      nextInstanceNumber: 1,
      order: []
    },
    projectConfig: createProjectConfig(),
    requiredDecodedImages: [],
    sectionCapabilities: {},
    sectionImpls: {},
    sectionVariants: {},
    sections: {},
    shownParamIds: {},
    singletonSections: createSingletonSections()
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    projectConfig: createProjectConfig(
      options.projectConfig ?? defaults.projectConfig
    ),
    singletonSections: createSingletonSections(
      options.singletonSections ?? defaults.singletonSections
    )
  };
}
function createSettingsState(options = {}) {
  const defaults = {
    backend: {
      runSnapshotMode: "ephemeral"
    }
  };
  return mergeGeneratedOptions(defaults, options);
}
function createCallableSectionImpl(options = {}) {
  const defaults = {
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    callable: null,
    codeObjVariantMap: {},
    columnWidth: null,
    configLanguage: "python",
    edgeInputParams: [],
    edgeOutputPorts: [],
    hideParams: false,
    hideUnpinnedParams: false,
    id: "",
    ignoreTypeErrors: {
      callable: false,
      params: {}
    },
    isFrozen: false,
    isInOtherProjectConfigs: false,
    isMinimized: false,
    isPreset: false,
    name: "",
    paramFilter: "",
    pinnedParams: [],
    positionAndSizeLocked: false,
    selectedParams: [],
    size: {
      height: 150,
      width: 250
    },
    styleColor: null,
    tagColor: null,
    type: "Callable"
  };
  return mergeGeneratedOptions(defaults, options);
}
function createCodeParamCodeObjImpl(options = {}) {
  const defaults = {
    coreNameEditable: false,
    coreNameType: "TEXT",
    defaultVal: "",
    description: "",
    id: "",
    isPreset: false,
    name: "",
    passingStyle: "DEFAULT",
    type: "CodeParam",
    typeAnnotation: "",
    value: ""
  };
  return mergeGeneratedOptions(defaults, options);
}
function createTextBlockSectionImpl(options = {}) {
  const defaults = {
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    format: "Plaintext",
    headingAsSectionName: false,
    id: "",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    isMinimized: false,
    isPreset: false,
    masterFontSizePx: 14,
    metaControlStyle: false,
    name: "",
    positionAndSizeLocked: false,
    size: {
      height: 150,
      width: 500
    },
    styleColor: null,
    tagColor: null,
    text: "",
    textDisplayMode: "Render",
    type: "TextBlock"
  };
  return mergeGeneratedOptions(defaults, options);
}
const BaseChildlessCodeObjImplTypeSet = /* @__PURE__ */ new Set([
  "ButtonParam",
  "CodeParam",
  "ColorPickerParam",
  "DateParam",
  "DropdownParam",
  "DropzoneParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
  "TimeParam"
]);
function isBaseChildlessCodeObjImpl(value) {
  return BaseChildlessCodeObjImplTypeSet.has(value.type);
}
const BaseParamCodeObjImplTypeSet = /* @__PURE__ */ new Set([
  "CodeParam",
  "TextParam",
  "DateParam",
  "TimeParam",
  "ButtonParam",
  "SliderParam",
  "RotaryParam",
  "SwitchParam",
  "ColorPickerParam",
  "DropdownParam",
  "PasswordParam",
  "TextAreaParam",
  "DropzoneParam",
  "NestedParam"
]);
function isBaseParamCodeObjImpl(value) {
  return BaseParamCodeObjImplTypeSet.has(value.type);
}
const BaseSectionWithParamsImplTypeSet = /* @__PURE__ */ new Set([
  "Callable",
  "Dict",
  "MetaControl",
  "GlobalVariables"
]);
function isBaseSectionWithParamsImpl(value) {
  return BaseSectionWithParamsImplTypeSet.has(value.type);
}
const LOCAL_HOSTNAME_SET = new Set(
  LocalHostnamePolicyConfig.loopbackHosts.map(
    (hostname) => hostname.toLowerCase()
  )
);
function isLocalHostname(hostname) {
  return LOCAL_HOSTNAME_SET.has(hostname.trim().toLowerCase());
}
function formatGeneratedOriginHost(hostname) {
  if (hostname.includes(":") && !hostname.startsWith("[")) {
    return "[" + hostname + "]";
  }
  return hostname;
}
function parseGeneratedOrigin(rawOrigin) {
  if (typeof rawOrigin !== "string") {
    return null;
  }
  const trimmedOrigin = rawOrigin.trim();
  if (!trimmedOrigin) {
    return null;
  }
  try {
    return new URL(trimmedOrigin);
  } catch {
    return null;
  }
}
function isGeneratedHttpOrigin(parsedOrigin) {
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    return false;
  }
  if (!parsedOrigin.hostname) {
    return false;
  }
  return !parsedOrigin.username && !parsedOrigin.password;
}
function formatNormalizedGeneratedOrigin(parsedOrigin) {
  const formattedHost = formatGeneratedOriginHost(parsedOrigin.hostname);
  const port = parsedOrigin.port.trim();
  if (!port) {
    return parsedOrigin.protocol + "//" + formattedHost;
  }
  return parsedOrigin.protocol + "//" + formattedHost + ":" + port;
}
function normalizeGeneratedOrigin(rawOrigin) {
  const parsedOrigin = parseGeneratedOrigin(rawOrigin);
  if (!parsedOrigin) {
    return null;
  }
  if (!isGeneratedHttpOrigin(parsedOrigin)) {
    return null;
  }
  return formatNormalizedGeneratedOrigin(parsedOrigin);
}
function stripGeneratedTransportAddressQueryAndHash(address) {
  const hashIndex = address.indexOf("#");
  let withoutHash = address;
  if (hashIndex >= 0) {
    withoutHash = address.slice(0, hashIndex);
  }
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex >= 0) {
    return withoutHash.slice(0, queryIndex);
  }
  return withoutHash;
}
function resolveGeneratedEndpointOriginForMode(address, serverMode, options) {
  const normalizedAddress = stripGeneratedTransportAddressQueryAndHash(address);
  if (normalizedAddress.startsWith(options.bootstrapPage)) {
    return options.backendOriginValue;
  }
  const routePolicy = options.endpointOriginPolicy[normalizedAddress];
  if (routePolicy === options.backendOriginValue) {
    return options.backendOriginValue;
  }
  if (routePolicy === options.launcherOriginValue) {
    if (options.modeScopedLauncherRoutes.has(normalizedAddress) && serverMode !== options.launcherMode) {
      return options.backendValue;
    }
    return options.launcherOriginValue;
  }
  return options.backendValue;
}
function normalizeOrigin(origin, label = "backend origin") {
  const trimmedOrigin = origin.trim();
  if (!trimmedOrigin) {
    return void 0;
  }
  const normalized = normalizeGeneratedOrigin(trimmedOrigin);
  if (normalized) {
    return normalized;
  }
  console.error(`Invalid ${label} "${origin}".`);
  return void 0;
}
function safeSessionStorage() {
  if (typeof window === "undefined") {
    return void 0;
  }
  try {
    return window.sessionStorage;
  } catch {
    return void 0;
  }
}
function launcherOriginStorage() {
  return safeSessionStorage();
}
function isLauncherOriginAllowed(launcherOrigin, currentOrigin) {
  let launcherUrl;
  let currentUrl;
  try {
    launcherUrl = new URL(launcherOrigin);
    currentUrl = new URL(currentOrigin);
  } catch {
    return false;
  }
  if (launcherUrl.hostname === currentUrl.hostname) {
    return true;
  }
  return isLocalHostname(launcherUrl.hostname) && isLocalHostname(currentUrl.hostname);
}
function readLauncherOrigin() {
  const storage = launcherOriginStorage();
  if (!storage) {
    return void 0;
  }
  try {
    const raw = storage.getItem(BootstrapProtocol.launcherOriginStorageKey);
    if (!raw) {
      return void 0;
    }
    const normalized = normalizeOrigin(raw, "launcher origin");
    if (!normalized) {
      return void 0;
    }
    if (typeof window !== "undefined" && !isLauncherOriginAllowed(normalized, window.location.origin)) {
      try {
        storage.removeItem(BootstrapProtocol.launcherOriginStorageKey);
      } catch {
      }
      return void 0;
    }
    return normalized;
  } catch {
    return void 0;
  }
}
function writeLauncherOrigin(origin) {
  const storage = launcherOriginStorage();
  if (!storage) {
    return;
  }
  const normalized = normalizeOrigin(origin, "launcher origin");
  if (!normalized) {
    return;
  }
  if (typeof window !== "undefined" && !isLauncherOriginAllowed(normalized, window.location.origin)) {
    return;
  }
  try {
    storage.setItem(BootstrapProtocol.launcherOriginStorageKey, normalized);
  } catch {
  }
}
function getOrInitLauncherOrigin(fallbackOrigin) {
  const existing = readLauncherOrigin();
  if (existing) {
    return existing;
  }
  const normalized = normalizeOrigin(fallbackOrigin, "launcher origin");
  const resolved = normalized ?? fallbackOrigin;
  writeLauncherOrigin(resolved);
  return resolved;
}
const __vite_import_meta_env__ = {};
const BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY = "setta.backendOriginOverride";
class C_ADDRESSES {
  static get DEV_MODE() {
    return false;
  }
  static get DEV_BACKEND_ORIGIN_SESSION_OVERRIDE() {
    const storage = safeSessionStorage();
    if (!storage) {
      return void 0;
    }
    try {
      const rawOverride = storage.getItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);
      if (!rawOverride) {
        return void 0;
      }
      return normalizeOrigin(
        rawOverride,
        "backend origin override (sessionStorage)"
      );
    } catch (error) {
      console.warn(
        "Failed to read backend origin override from sessionStorage",
        error
      );
      return void 0;
    }
  }
  static get DEV_BACKEND_ORIGIN_OVERRIDE() {
    const override = __vite_import_meta_env__?.VITE_BACKEND_ORIGIN;
    if (!override) {
      return void 0;
    }
    return normalizeOrigin(override, "VITE_BACKEND_ORIGIN");
  }
  static get BACKEND_ORIGIN() {
    if (this.DEV_MODE) {
      const sessionOverride = this.DEV_BACKEND_ORIGIN_SESSION_OVERRIDE;
      if (sessionOverride) {
        return sessionOverride;
      }
      const override = this.DEV_BACKEND_ORIGIN_OVERRIDE;
      if (override) {
        return override;
      }
      return `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
    }
    return location.origin;
  }
  static get LAUNCHER_ORIGIN() {
    if (!this.DEV_MODE) {
      return getOrInitLauncherOrigin(location.origin);
    }
    const override = this.DEV_BACKEND_ORIGIN_OVERRIDE;
    if (override) {
      return getOrInitLauncherOrigin(override);
    }
    let fallback = `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
    try {
      const backendUrl = new URL(this.BACKEND_ORIGIN);
      if (backendUrl.protocol === "http:" || backendUrl.protocol === "https:") {
        const hostname = backendUrl.hostname.includes(":") ? `[${backendUrl.hostname}]` : backendUrl.hostname;
        fallback = `${backendUrl.protocol}//${hostname}:${C.DEFAULT_PORT}`;
      }
    } catch {
    }
    return getOrInitLauncherOrigin(fallback);
  }
  static get LAUNCHER() {
    return `${this.LAUNCHER_ORIGIN}${TransportRouteConstants.apiPrefix}`;
  }
  static get BACKEND() {
    return `${this.BACKEND_ORIGIN}${TransportRouteConstants.apiPrefix}`;
  }
  static get WEBSOCKET() {
    const originUrl = new URL(this.BACKEND_ORIGIN);
    const protocol = originUrl.protocol === "https:" || originUrl.protocol === "wss:" ? "wss:" : "ws:";
    return `${protocol}//${originUrl.host}${TransportRouteConstants.apiPrefix}`;
  }
}
const serializeFormDataPair = (data, key, value) => {
  if (typeof value === "string" || value instanceof Blob) {
    data.append(key, value);
  } else if (value instanceof Date) {
    data.append(key, value.toISOString());
  } else {
    data.append(key, JSON.stringify(value));
  }
};
const formDataBodySerializer = {
  bodySerializer: (body) => {
    const data = new FormData();
    Object.entries(body).forEach(([key, value]) => {
      if (value === void 0 || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((v) => serializeFormDataPair(data, key, v));
      } else {
        serializeFormDataPair(data, key, value);
      }
    });
    return data;
  }
};
const jsonBodySerializer = {
  bodySerializer: (body) => JSON.stringify(
    body,
    (_key, value) => typeof value === "bigint" ? value.toString() : value
  )
};
const createSseClient = ({
  onRequest,
  onSseError,
  onSseEvent,
  responseTransformer,
  responseValidator,
  sseDefaultRetryDelay,
  sseMaxRetryAttempts,
  sseMaxRetryDelay,
  sseSleepFn,
  url,
  ...options
}) => {
  let lastEventId;
  const sleep = sseSleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const createStream = async function* () {
    let retryDelay = sseDefaultRetryDelay ?? 3e3;
    let attempt = 0;
    const signal = options.signal ?? new AbortController().signal;
    while (true) {
      if (signal.aborted) break;
      attempt++;
      const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers);
      if (lastEventId !== void 0) {
        headers.set("Last-Event-ID", lastEventId);
      }
      try {
        const requestInit = {
          redirect: "follow",
          ...options,
          ...options.serializedBody === void 0 ? {} : { body: options.serializedBody },
          headers,
          signal
        };
        let request = new Request(url, requestInit);
        if (onRequest) {
          request = await onRequest(url, requestInit);
        }
        const _fetch = options.fetch ?? globalThis.fetch;
        const response = await _fetch(request);
        if (!response.ok)
          throw new Error(
            `SSE failed: ${response.status} ${response.statusText}`
          );
        if (!response.body) throw new Error("No body in SSE response");
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        const abortHandler = () => {
          try {
            reader.cancel();
          } catch {
          }
        };
        signal.addEventListener("abort", abortHandler);
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const lines = chunk.split("\n");
              const dataLines = [];
              let eventName;
              for (const line of lines) {
                if (line.startsWith("data:")) {
                  dataLines.push(line.replace(/^data:\s*/, ""));
                } else if (line.startsWith("event:")) {
                  eventName = line.replace(/^event:\s*/, "");
                } else if (line.startsWith("id:")) {
                  lastEventId = line.replace(/^id:\s*/, "");
                } else if (line.startsWith("retry:")) {
                  const parsed = Number.parseInt(
                    line.replace(/^retry:\s*/, ""),
                    10
                  );
                  if (!Number.isNaN(parsed)) {
                    retryDelay = parsed;
                  }
                }
              }
              let data;
              let parsedJson = false;
              if (dataLines.length) {
                const rawData = dataLines.join("\n");
                try {
                  data = JSON.parse(rawData);
                  parsedJson = true;
                } catch {
                  data = rawData;
                }
              }
              if (parsedJson) {
                if (responseValidator) {
                  await responseValidator(data);
                }
                if (responseTransformer) {
                  data = await responseTransformer(data);
                }
              }
              onSseEvent?.({
                data,
                event: eventName,
                id: lastEventId,
                retry: retryDelay
              });
              if (dataLines.length) {
                yield data;
              }
            }
          }
        } finally {
          signal.removeEventListener("abort", abortHandler);
          reader.releaseLock();
        }
        break;
      } catch (error) {
        onSseError?.(error);
        if (sseMaxRetryAttempts !== void 0 && attempt >= sseMaxRetryAttempts) {
          break;
        }
        const backoff = Math.min(
          retryDelay * 2 ** (attempt - 1),
          sseMaxRetryDelay ?? 3e4
        );
        await sleep(backoff);
      }
    }
  };
  const stream = createStream();
  return { stream };
};
const separatorArrayExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
const separatorArrayNoExplode = (style) => {
  switch (style) {
    case "form":
      return ",";
    case "pipeDelimited":
      return "|";
    case "spaceDelimited":
      return "%20";
    default:
      return ",";
  }
};
const separatorObjectExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
const serializeArrayParam = ({
  allowReserved,
  explode,
  name,
  style,
  value
}) => {
  if (!explode) {
    const joinedValues2 = (allowReserved ? value : value.map((v) => encodeURIComponent(v))).join(separatorArrayNoExplode(style));
    switch (style) {
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      case "simple":
        return joinedValues2;
      default:
        return `${name}=${joinedValues2}`;
    }
  }
  const separator = separatorArrayExplode(style);
  const joinedValues = value.map((v) => {
    if (style === "label" || style === "simple") {
      return allowReserved ? v : encodeURIComponent(v);
    }
    return serializePrimitiveParam({
      allowReserved,
      name,
      value: v
    });
  }).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};
const serializePrimitiveParam = ({
  allowReserved,
  name,
  value
}) => {
  if (value === void 0 || value === null) {
    return "";
  }
  if (typeof value === "object") {
    throw new Error(
      "Deeply-nested arrays/objects aren’t supported. Provide your own `querySerializer()` to handle these."
    );
  }
  return `${name}=${allowReserved ? value : encodeURIComponent(value)}`;
};
const serializeObjectParam = ({
  allowReserved,
  explode,
  name,
  style,
  value,
  valueOnly
}) => {
  if (value instanceof Date) {
    return valueOnly ? value.toISOString() : `${name}=${value.toISOString()}`;
  }
  if (style !== "deepObject" && !explode) {
    let values = [];
    Object.entries(value).forEach(([key, v]) => {
      values = [
        ...values,
        key,
        allowReserved ? v : encodeURIComponent(v)
      ];
    });
    const joinedValues2 = values.join(",");
    switch (style) {
      case "form":
        return `${name}=${joinedValues2}`;
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      default:
        return joinedValues2;
    }
  }
  const separator = separatorObjectExplode(style);
  const joinedValues = Object.entries(value).map(
    ([key, v]) => serializePrimitiveParam({
      allowReserved,
      name: style === "deepObject" ? `${name}[${key}]` : key,
      value: v
    })
  ).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};
const PATH_PARAM_RE = /\{[^{}]+\}/g;
const defaultPathSerializer = ({ path, url: _url }) => {
  let url = _url;
  const matches = _url.match(PATH_PARAM_RE);
  if (matches) {
    for (const match of matches) {
      let explode = false;
      let name = match.substring(1, match.length - 1);
      let style = "simple";
      if (name.endsWith("*")) {
        explode = true;
        name = name.substring(0, name.length - 1);
      }
      if (name.startsWith(".")) {
        name = name.substring(1);
        style = "label";
      } else if (name.startsWith(";")) {
        name = name.substring(1);
        style = "matrix";
      }
      const value = path[name];
      if (value === void 0 || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        url = url.replace(
          match,
          serializeArrayParam({ explode, name, style, value })
        );
        continue;
      }
      if (typeof value === "object") {
        url = url.replace(
          match,
          serializeObjectParam({
            explode,
            name,
            style,
            value,
            valueOnly: true
          })
        );
        continue;
      }
      if (style === "matrix") {
        url = url.replace(
          match,
          `;${serializePrimitiveParam({
            name,
            value
          })}`
        );
        continue;
      }
      const replaceValue = encodeURIComponent(
        style === "label" ? `.${value}` : value
      );
      url = url.replace(match, replaceValue);
    }
  }
  return url;
};
const getUrl = ({
  baseUrl,
  path,
  query,
  querySerializer,
  url: _url
}) => {
  const pathUrl = _url.startsWith("/") ? _url : `/${_url}`;
  let url = (baseUrl ?? "") + pathUrl;
  if (path) {
    url = defaultPathSerializer({ path, url });
  }
  let search = query ? querySerializer(query) : "";
  if (search.startsWith("?")) {
    search = search.substring(1);
  }
  if (search) {
    url += `?${search}`;
  }
  return url;
};
function getValidRequestBody(options) {
  const hasBody = options.body !== void 0;
  const isSerializedBody = hasBody && options.bodySerializer;
  if (isSerializedBody) {
    if ("serializedBody" in options) {
      const hasSerializedBody = options.serializedBody !== void 0 && options.serializedBody !== "";
      return hasSerializedBody ? options.serializedBody : null;
    }
    return options.body !== "" ? options.body : null;
  }
  if (hasBody) {
    return options.body;
  }
  return void 0;
}
const getAuthToken = async (auth, callback) => {
  const token = typeof callback === "function" ? await callback(auth) : callback;
  if (!token) {
    return;
  }
  if (auth.scheme === "bearer") {
    return `Bearer ${token}`;
  }
  if (auth.scheme === "basic") {
    return `Basic ${btoa(token)}`;
  }
  return token;
};
const createQuerySerializer = ({
  parameters = {},
  ...args
} = {}) => {
  const querySerializer = (queryParams) => {
    const search = [];
    if (queryParams && typeof queryParams === "object") {
      for (const name in queryParams) {
        const value = queryParams[name];
        if (value === void 0 || value === null) {
          continue;
        }
        const options = parameters[name] || args;
        if (Array.isArray(value)) {
          const serializedArray = serializeArrayParam({
            allowReserved: options.allowReserved,
            explode: true,
            name,
            style: "form",
            value,
            ...options.array
          });
          if (serializedArray) search.push(serializedArray);
        } else if (typeof value === "object") {
          const serializedObject = serializeObjectParam({
            allowReserved: options.allowReserved,
            explode: true,
            name,
            style: "deepObject",
            value,
            ...options.object
          });
          if (serializedObject) search.push(serializedObject);
        } else {
          const serializedPrimitive = serializePrimitiveParam({
            allowReserved: options.allowReserved,
            name,
            value
          });
          if (serializedPrimitive) search.push(serializedPrimitive);
        }
      }
    }
    return search.join("&");
  };
  return querySerializer;
};
const getParseAs = (contentType) => {
  if (!contentType) {
    return "stream";
  }
  const cleanContent = contentType.split(";")[0]?.trim();
  if (!cleanContent) {
    return;
  }
  if (cleanContent.startsWith("application/json") || cleanContent.endsWith("+json")) {
    return "json";
  }
  if (cleanContent === "multipart/form-data") {
    return "formData";
  }
  if (["application/", "audio/", "image/", "video/"].some(
    (type) => cleanContent.startsWith(type)
  )) {
    return "blob";
  }
  if (cleanContent.startsWith("text/")) {
    return "text";
  }
  return;
};
const checkForExistence = (options, name) => {
  if (!name) {
    return false;
  }
  if (options.headers.has(name) || options.query?.[name] || options.headers.get("Cookie")?.includes(`${name}=`)) {
    return true;
  }
  return false;
};
const setAuthParams = async ({
  security,
  ...options
}) => {
  for (const auth of security) {
    if (checkForExistence(options, auth.name)) {
      continue;
    }
    const token = await getAuthToken(auth, options.auth);
    if (!token) {
      continue;
    }
    const name = auth.name ?? "Authorization";
    switch (auth.in) {
      case "query":
        if (!options.query) {
          options.query = {};
        }
        options.query[name] = token;
        break;
      case "cookie":
        options.headers.append("Cookie", `${name}=${token}`);
        break;
      case "header":
      default:
        options.headers.set(name, token);
        break;
    }
  }
};
const buildUrl = (options) => getUrl({
  baseUrl: options.baseUrl,
  path: options.path,
  query: options.query,
  querySerializer: typeof options.querySerializer === "function" ? options.querySerializer : createQuerySerializer(options.querySerializer),
  url: options.url
});
const mergeConfigs = (a2, b) => {
  const config = { ...a2, ...b };
  if (config.baseUrl?.endsWith("/")) {
    config.baseUrl = config.baseUrl.substring(0, config.baseUrl.length - 1);
  }
  config.headers = mergeHeaders(a2.headers, b.headers);
  return config;
};
const headersEntries = (headers) => {
  const entries = [];
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries;
};
const mergeHeaders = (...headers) => {
  const mergedHeaders = new Headers();
  for (const header of headers) {
    if (!header) {
      continue;
    }
    const iterator = header instanceof Headers ? headersEntries(header) : Object.entries(header);
    for (const [key, value] of iterator) {
      if (value === null) {
        mergedHeaders.delete(key);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          mergedHeaders.append(key, v);
        }
      } else if (value !== void 0) {
        mergedHeaders.set(
          key,
          typeof value === "object" ? JSON.stringify(value) : value
        );
      }
    }
  }
  return mergedHeaders;
};
class Interceptors {
  constructor() {
    this.fns = [];
  }
  clear() {
    this.fns = [];
  }
  eject(id) {
    const index = this.getInterceptorIndex(id);
    if (this.fns[index]) {
      this.fns[index] = null;
    }
  }
  exists(id) {
    const index = this.getInterceptorIndex(id);
    return Boolean(this.fns[index]);
  }
  getInterceptorIndex(id) {
    if (typeof id === "number") {
      return this.fns[id] ? id : -1;
    }
    return this.fns.indexOf(id);
  }
  update(id, fn) {
    const index = this.getInterceptorIndex(id);
    if (this.fns[index]) {
      this.fns[index] = fn;
      return id;
    }
    return false;
  }
  use(fn) {
    this.fns.push(fn);
    return this.fns.length - 1;
  }
}
const createInterceptors = () => ({
  error: new Interceptors(),
  request: new Interceptors(),
  response: new Interceptors()
});
const defaultQuerySerializer = createQuerySerializer({
  allowReserved: false,
  array: {
    explode: true,
    style: "form"
  },
  object: {
    explode: true,
    style: "deepObject"
  }
});
const defaultHeaders = {
  "Content-Type": "application/json"
};
const createConfig = (override = {}) => ({
  ...jsonBodySerializer,
  headers: defaultHeaders,
  parseAs: "auto",
  querySerializer: defaultQuerySerializer,
  ...override
});
const createClient = (config = {}) => {
  let _config = mergeConfigs(createConfig(), config);
  const getConfig = () => ({ ..._config });
  const setConfig = (config2) => {
    _config = mergeConfigs(_config, config2);
    return getConfig();
  };
  const interceptors = createInterceptors();
  const beforeRequest = async (options) => {
    const opts = {
      ..._config,
      ...options,
      fetch: options.fetch ?? _config.fetch ?? globalThis.fetch,
      headers: mergeHeaders(_config.headers, options.headers)
    };
    if (opts.security) {
      await setAuthParams({
        ...opts,
        security: opts.security
      });
    }
    if (opts.requestValidator) {
      await opts.requestValidator(opts);
    }
    if (opts.body !== void 0 && opts.bodySerializer) {
      opts.serializedBody = opts.bodySerializer(opts.body);
    }
    if (opts.body === void 0 || opts.serializedBody === "") {
      opts.headers.delete("Content-Type");
    }
    const url = buildUrl(opts);
    return { opts, url };
  };
  const request = async (options) => {
    const { opts, url } = await beforeRequest(options);
    const requestInit = {
      redirect: "follow",
      ...opts,
      body: getValidRequestBody(opts)
    };
    let request2 = new Request(url, requestInit);
    for (const fn of interceptors.request.fns) {
      if (fn) {
        request2 = await fn(request2, opts);
      }
    }
    const _fetch = opts.fetch;
    let response = await _fetch(request2);
    for (const fn of interceptors.response.fns) {
      if (fn) {
        response = await fn(response, request2, opts);
      }
    }
    const result = {
      request: request2,
      response
    };
    if (response.ok) {
      const parseAs = (opts.parseAs === "auto" ? getParseAs(response.headers.get("Content-Type")) : opts.parseAs) ?? "json";
      if (response.status === 204 || response.headers.get("Content-Length") === "0") {
        let emptyData;
        switch (parseAs) {
          case "arrayBuffer":
          case "blob":
          case "text":
            emptyData = await response[parseAs]();
            break;
          case "formData":
            emptyData = new FormData();
            break;
          case "stream":
            emptyData = response.body;
            break;
          case "json":
          default:
            emptyData = {};
            break;
        }
        return opts.responseStyle === "data" ? emptyData : {
          data: emptyData,
          ...result
        };
      }
      let data;
      switch (parseAs) {
        case "arrayBuffer":
        case "blob":
        case "formData":
        case "json":
        case "text":
          data = await response[parseAs]();
          break;
        case "stream":
          return opts.responseStyle === "data" ? response.body : {
            data: response.body,
            ...result
          };
      }
      if (parseAs === "json") {
        if (opts.responseValidator) {
          await opts.responseValidator(data);
        }
        if (opts.responseTransformer) {
          data = await opts.responseTransformer(data);
        }
      }
      return opts.responseStyle === "data" ? data : {
        data,
        ...result
      };
    }
    const textError = await response.text();
    let jsonError;
    try {
      jsonError = JSON.parse(textError);
    } catch {
    }
    const error = jsonError ?? textError;
    let finalError = error;
    for (const fn of interceptors.error.fns) {
      if (fn) {
        finalError = await fn(error, response, request2, opts);
      }
    }
    finalError = finalError || {};
    if (opts.throwOnError) {
      throw finalError;
    }
    return opts.responseStyle === "data" ? void 0 : {
      error: finalError,
      ...result
    };
  };
  const makeMethodFn = (method) => (options) => request({ ...options, method });
  const makeSseFn = (method) => async (options) => {
    const { opts, url } = await beforeRequest(options);
    return createSseClient({
      ...opts,
      ...opts.body === void 0 ? {} : { body: opts.body },
      headers: opts.headers,
      method,
      onRequest: async (url2, init) => {
        let request2 = new Request(url2, init);
        for (const fn of interceptors.request.fns) {
          if (fn) {
            request2 = await fn(request2, opts);
          }
        }
        return request2;
      },
      url
    });
  };
  return {
    buildUrl,
    connect: makeMethodFn("CONNECT"),
    delete: makeMethodFn("DELETE"),
    get: makeMethodFn("GET"),
    getConfig,
    head: makeMethodFn("HEAD"),
    interceptors,
    options: makeMethodFn("OPTIONS"),
    patch: makeMethodFn("PATCH"),
    post: makeMethodFn("POST"),
    put: makeMethodFn("PUT"),
    request,
    setConfig,
    sse: {
      connect: makeSseFn("CONNECT"),
      delete: makeSseFn("DELETE"),
      get: makeSseFn("GET"),
      head: makeSseFn("HEAD"),
      options: makeSseFn("OPTIONS"),
      patch: makeSseFn("PATCH"),
      post: makeSseFn("POST"),
      put: makeSseFn("PUT"),
      trace: makeSseFn("TRACE")
    },
    trace: makeMethodFn("TRACE")
  };
};
const client = createClient(
  createConfig({
    baseUrl: "/api"
  })
);
async function rebuildBackendRequest(request, resolvedURL) {
  const rebuiltInit = {
    method: request.method,
    headers: new Headers(request.headers),
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal
  };
  if (request.body !== null && request.method !== "GET" && request.method !== "HEAD") {
    rebuiltInit.body = await request.clone().arrayBuffer();
  }
  return new Request(resolvedURL, rebuiltInit);
}
const activeHostCounts = /* @__PURE__ */ new Map();
const activeHostOrder = [];
function removeActiveHostFromOrder(host) {
  const index = activeHostOrder.indexOf(host);
  if (index >= 0) {
    activeHostOrder.splice(index, 1);
  }
}
function activateAppSubsystemFrontendHostRuntime(host) {
  const currentCount = activeHostCounts.get(host) ?? 0;
  activeHostCounts.set(host, currentCount + 1);
  removeActiveHostFromOrder(host);
  activeHostOrder.push(host);
}
function deactivateAppSubsystemFrontendHostRuntime(host) {
  const currentCount = activeHostCounts.get(host);
  if (!currentCount) {
    return;
  }
  if (currentCount === 1) {
    activeHostCounts.delete(host);
    removeActiveHostFromOrder(host);
    return;
  }
  activeHostCounts.set(host, currentCount - 1);
}
function getActiveAppSubsystemFrontendHostRuntime() {
  for (let index = activeHostOrder.length - 1; index >= 0; index -= 1) {
    const host = activeHostOrder[index];
    if (host && activeHostCounts.has(host)) {
      return host;
    }
  }
  return null;
}
async function runWithAppSubsystemFrontendHostRuntime(host, run) {
  activateAppSubsystemFrontendHostRuntime(host);
  try {
    return await run();
  } finally {
    deactivateAppSubsystemFrontendHostRuntime(host);
  }
}
const ROOT_TRANSPORT_ROUTES = Object.freeze(
  TransportRouteConstants.root
);
Object.freeze(
  TransportRouteConstants.websocket
);
const BINARY_TRANSPORT_ROUTES = Object.freeze(TransportRouteConstants.binary);
function replaceTransportRoutePathParams(routePath, params) {
  let resolved = routePath;
  for (const [key, value] of Object.entries(params)) {
    resolved = resolved.replaceAll(`{${key}}`, value);
  }
  return resolved;
}
function buildBinaryDownloadRoute(contentId) {
  return replaceTransportRoutePathParams(BINARY_TRANSPORT_ROUTES.download, {
    contentId
  });
}
function resolveEndpointOriginForMode(address, serverMode) {
  return resolveGeneratedEndpointOriginForMode(address, serverMode, {
    bootstrapPage: ROOT_TRANSPORT_ROUTES.bootstrapPage,
    launcherMode: "launcher",
    endpointOriginPolicy: EndpointOriginPolicyByRoute,
    modeScopedLauncherRoutes: new Set(ModeScopedLauncherRoutesList),
    backendOriginValue: EndpointOriginEnum.BackendOrigin,
    launcherOriginValue: EndpointOriginEnum.launcher,
    backendValue: EndpointOriginEnum.backend
  });
}
function createDefaultAppPolicy() {
  return createPolicy({ ...DefaultAppPolicy });
}
function resolveAppPolicy(appPolicy) {
  return appPolicy ?? createDefaultAppPolicy();
}
function res200(res) {
  return res.status === 200;
}
const ERROR_DETAIL_PATHS = [
  ["message"],
  ["detail"],
  ["detail", "message"],
  ["detail", "detail"],
  ["error", "message"],
  ["error", "detail"]
];
const ERROR_CODE_PATHS = [
  ["errorCode"],
  ["error", "code"],
  ["error", "errorCode"],
  ["detail", "errorCode"]
];
function isRecord$2(value) {
  return value !== null && typeof value === "object";
}
function normalizeErrorPayload(value) {
  if (!value) {
    return { payload: null, decodedText: null };
  }
  if (!(value instanceof Uint8Array)) {
    return { payload: value, decodedText: null };
  }
  const decodedText = new TextDecoder().decode(value).trim();
  if (decodedText.length === 0) {
    return { payload: null, decodedText: null };
  }
  try {
    return { payload: JSON.parse(decodedText), decodedText };
  } catch {
    return { payload: null, decodedText };
  }
}
function getValueAtPath(value, path) {
  let current = value;
  for (const segment of path) {
    if (!isRecord$2(current)) {
      return null;
    }
    current = current[segment];
  }
  return current;
}
function getStringAtPath(value, path, requireNonEmpty) {
  const candidate = getValueAtPath(value, path);
  if (typeof candidate !== "string") {
    return null;
  }
  if (requireNonEmpty && candidate.trim().length === 0) {
    return null;
  }
  return candidate;
}
function findStringAtPaths(value, paths, requireNonEmpty) {
  for (const path of paths) {
    const candidate = getStringAtPath(value, path, requireNonEmpty);
    if (candidate !== null) {
      return candidate;
    }
  }
  return null;
}
function getErrorDetail(value) {
  const { payload, decodedText } = normalizeErrorPayload(value);
  if (typeof payload === "string") {
    return payload;
  }
  return findStringAtPaths(payload, ERROR_DETAIL_PATHS, false) ?? decodedText;
}
function getErrorCode(value) {
  const { payload } = normalizeErrorPayload(value);
  return findStringAtPaths(payload, ERROR_CODE_PATHS, true);
}
const listAppDeployments = (options) => {
  return (options?.client ?? client).get({
    url: "/app/deployments",
    ...options
  });
};
const publishAppDeployment = (options) => {
  return (options.client ?? client).post({
    url: "/app/deployments",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const getAppDeploymentCurrentSession = (options) => {
  return (options?.client ?? client).post({
    url: "/app/deployments/current/session",
    ...options
  });
};
const getAppDeploymentProjectConfig = (options) => {
  return (options.client ?? client).post({
    url: "/app/deployments/{deploymentName}/{version}/project_config",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const getAppDeploymentState = (options) => {
  return (options.client ?? client).get({
    url: "/app/deployments/{deploymentName}/{version}/state",
    ...options
  });
};
const uploadBinary = (options) => {
  return (options.client ?? client).post({
    ...formDataBodySerializer,
    url: "/binary/upload",
    ...options,
    headers: {
      "Content-Type": null,
      ...options.headers
    }
  });
};
const downloadBinary = (options) => {
  return (options.client ?? client).get({
    url: "/binary/{contentId}",
    ...options
  });
};
const checkIfFileExists = (options) => {
  return (options.client ?? client).post({
    url: "/checkIfFileExists",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const deleteArtifacts = (options) => {
  return (options.client ?? client).post({
    url: "/deleteArtifacts",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const getAppDefinition = (options) => {
  return (options.client ?? client).post({
    url: "/getAppDefinition",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const getAttachmentDownloadUrl = (options) => {
  return (options.client ?? client).post({
    url: "/getAttachmentDownloadUrl",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const getLatestProjectState = (options) => {
  return (options.client ?? client).post({
    url: "/getLatestProjectState",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const getPasswordParamValue = (options) => {
  return (options.client ?? client).post({
    url: "/getPasswordParamValue",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const loadCachedImageArtifacts = (options) => {
  return (options.client ?? client).post({
    url: "/loadCachedImageArtifacts",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const loadProjectConfig = (options) => {
  return (options.client ?? client).post({
    url: "/loadProjectConfig",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const runCode = (options) => {
  return (options.client ?? client).post({
    url: "/runCode",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const setAppDefinition = (options) => {
  return (options.client ?? client).post({
    url: "/setAppDefinition",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const setParamEnteredValue = (options) => {
  return (options.client ?? client).post({
    url: "/setParamEnteredValue",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const updateArtifacts = (options) => {
  return (options.client ?? client).post({
    url: "/updateArtifacts",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
const validateAppDefinition = (options) => {
  return (options.client ?? client).post({
    url: "/validateAppDefinition",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
};
async function callOpenAPI(promise) {
  try {
    const result = await promise;
    return {
      data: result.data ?? result.error,
      status: result.response.status,
      hasResponse: true
    };
  } catch (error) {
    console.error("OpenAPI request error:", error);
    return { data: void 0, status: void 0, hasResponse: false };
  }
}
function createRunnableRunRequest(effectiveSectionId, runRequestSectionId) {
  const explicitExecutionSectionId = runRequestSectionId?.trim() ?? "";
  return {
    canRun: true,
    disabledReason: null,
    // Generated entry sections intentionally leave runRequestSectionId unset;
    // running them still requires sending the concrete section id.
    executionSectionId: explicitExecutionSectionId || effectiveSectionId,
    effectiveSectionId
  };
}
function createDisabledRunRequest(disabledReason, effectiveSectionId) {
  return {
    canRun: false,
    disabledReason,
    executionSectionId: null,
    effectiveSectionId
  };
}
const DEFAULT_RUN_DISABLED_REASON = "Run is unavailable.";
const MANUAL_ENTRY_REQUIRED_REASON = "Select a manual entry code block to run.";
function resolveRunRequest(state, requestedSectionId) {
  if (requestedSectionId !== null) {
    return resolveSectionRunRequest(state, requestedSectionId);
  }
  return resolveMainRunRequest(state);
}
function resolveMainRunRequest(state) {
  const effectiveSectionId = resolveEffectiveMainRunSectionId(state);
  if (!effectiveSectionId) {
    return createDisabledRunRequest(MANUAL_ENTRY_REQUIRED_REASON, null);
  }
  const sectionCapabilities = state.sectionCapabilities[effectiveSectionId];
  if (!sectionCapabilities?.canRun) {
    return createDisabledRunRequest(
      sectionCapabilities?.runDisabledReason ?? DEFAULT_RUN_DISABLED_REASON,
      effectiveSectionId
    );
  }
  return createRunnableRunRequest(
    effectiveSectionId,
    sectionCapabilities.runRequestSectionId
  );
}
function resolveEffectiveMainRunSectionId(state) {
  const configuredEntrySectionId = state.projectConfig.entryCodeBlockId?.trim() ?? "";
  if (configuredEntrySectionId) {
    return configuredEntrySectionId;
  }
  if (!state.projectConfig.hasPythonCodegenTarget) {
    return null;
  }
  const generatedEntrySectionId = state.singletonSections.GenPythonCode?.trim();
  return generatedEntrySectionId ? generatedEntrySectionId : null;
}
function resolveSectionRunRequest(state, sectionId) {
  const sectionCapabilities = state.sectionCapabilities[sectionId];
  if (!sectionCapabilities?.canRun) {
    return createDisabledRunRequest(
      sectionCapabilities?.runDisabledReason ?? DEFAULT_RUN_DISABLED_REASON,
      sectionId
    );
  }
  return createRunnableRunRequest(
    sectionId,
    sectionCapabilities.runRequestSectionId
  );
}
function resolveTransportBaseUrl(serverMode, address) {
  const endpointOrigin = resolveEndpointOriginForMode(address, serverMode);
  if (endpointOrigin === "backend-origin") {
    return C_ADDRESSES.BACKEND_ORIGIN;
  }
  if (endpointOrigin === "launcher") {
    return C_ADDRESSES.LAUNCHER;
  }
  return C_ADDRESSES.BACKEND;
}
function resolveOpenAPIBaseURL() {
  if (typeof location === "undefined") {
    return "http://localhost";
  }
  return C_ADDRESSES.BACKEND_ORIGIN;
}
function buildShareSessionHeaders() {
  const frontendHost = getActiveAppSubsystemFrontendHostRuntime();
  const runtimeShareSessionId = frontendHost?.getRuntimeContext().shareSessionId ?? null;
  const deploymentShareSessionId = frontendHost?.getAppDeploymentSession()?.shareSessionId ?? null;
  const shareSessionId = runtimeShareSessionId ?? deploymentShareSessionId;
  if (!shareSessionId) {
    return {};
  }
  return { "X-Share-Session-Id": shareSessionId };
}
function buildBackendURL(address) {
  const frontendHost = getActiveAppSubsystemFrontendHostRuntime();
  const serverMode = frontendHost?.getServerModeState().mode ?? null;
  return new URL(
    address,
    resolveTransportBaseUrl(serverMode, address)
  ).toString();
}
async function fetchOpenAPIRequest(input, init) {
  const request = input instanceof Request ? input : new Request(input, init);
  const requestURL = new URL(request.url);
  const resolvedURL = buildBackendURL(
    `${requestURL.pathname}${requestURL.search}`
  );
  const nextRequest = await rebuildBackendRequest(request, resolvedURL);
  const shareHeaders = buildShareSessionHeaders();
  for (const [key, value] of Object.entries(shareHeaders)) {
    nextRequest.headers.set(key, value);
  }
  return await fetch(nextRequest);
}
function configureAppSubsystemOpenAPI() {
  client.setConfig({
    baseUrl: resolveOpenAPIBaseURL(),
    credentials: "include",
    responseStyle: "fields",
    fetch: fetchOpenAPIRequest
  });
}
function buildBinaryDownloadUrl(contentId, shareSessionId, serverMode) {
  const address = buildBinaryDownloadRoute(contentId);
  const url = new URL(address, resolveTransportBaseUrl(serverMode, address));
  if (shareSessionId) {
    url.searchParams.set("shareSessionId", shareSessionId);
  }
  return url.toString();
}
const APP_SUBSYSTEM_FRONTEND_HOST_API_VERSION = 1;
const EMPTY_APP_SUBSYSTEM_PROJECT_CONTEXT = Object.freeze({
  defaultProjectConfigId: null,
  projectMetadata: [],
  projectConfig: {
    id: null,
    name: "",
    entryCodeBlockId: null
  }
});
const EMPTY_APP_SUBSYSTEM_RUNTIME_CONTEXT = Object.freeze({
  isAppDeploymentMode: false,
  shareSessionId: null,
  sessionRunCount: 0,
  sharePolicy: null,
  defaultRunSnapshotMode: createSettingsState().backend.runSnapshotMode,
  runSnapshotModeByProjectConfigId: {}
});
const EMPTY_APP_SUBSYSTEM_PROJECT_STATE_SNAPSHOT = Object.freeze({
  ...createSingleConfig(),
  previewSectionVariantMap: {}
});
const EMPTY_APP_SUBSYSTEM_SERVER_MODE_STATE = Object.freeze({
  mode: null,
  modeResolved: false,
  modeError: null
});
function createAppSubsystemFrontendHost(overrides = {}) {
  return {
    apiVersion: APP_SUBSYSTEM_FRONTEND_HOST_API_VERSION,
    closeModal: () => void 0,
    notify: () => void 0,
    emitRealtimeDependencyEvent: () => void 0,
    emitRealtimeSectionParamLiteral: () => void 0,
    getProjectContext: () => EMPTY_APP_SUBSYSTEM_PROJECT_CONTEXT,
    subscribeProjectContext: () => () => void 0,
    getProjectStateSnapshot: () => EMPTY_APP_SUBSYSTEM_PROJECT_STATE_SNAPSHOT,
    subscribeProjectStateSnapshot: () => () => void 0,
    getRuntimeContext: () => EMPTY_APP_SUBSYSTEM_RUNTIME_CONTEXT,
    subscribeRuntimeContext: () => () => void 0,
    getAppDeploymentSession: () => null,
    setAppDeploymentSession: () => void 0,
    incrementAppDeploymentSessionRunCount: () => void 0,
    getServerModeState: () => EMPTY_APP_SUBSYSTEM_SERVER_MODE_STATE,
    subscribeServerModeState: () => () => void 0,
    setServerModeState: () => void 0,
    setProjectLoadState: () => void 0,
    resetProjectRuntimeState: () => void 0,
    ...overrides
  };
}
function isRecord$1(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isFunction(value) {
  return typeof value === "function";
}
function isAppSubsystemRenderer(value) {
  if (!isRecord$1(value)) {
    return false;
  }
  return isFunction(value.mount) && (value.update === void 0 || isFunction(value.update)) && (value.unmount === void 0 || isFunction(value.unmount));
}
function isOverviewTabRegistration(value) {
  if (!isRecord$1(value)) {
    return false;
  }
  return isAppSubsystemRenderer(value.renderer) && typeof value.titleQuickInfo === "string" && typeof value.moreMenuQuickInfo === "string" && typeof value.moreMenuLabel === "string";
}
function isPreviewSurfaceRegistration(value) {
  return isRecord$1(value) && isAppSubsystemRenderer(value.renderer);
}
function isAppModeRouteRegistration(value) {
  return isRecord$1(value) && isAppSubsystemRenderer(value.renderer);
}
function isAppDeploymentModalRegistration(value) {
  return isRecord$1(value) && isAppSubsystemRenderer(value.renderer);
}
function isSlashCommandRegistration(value) {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(
    (entry) => isRecord$1(entry) && typeof entry.command === "string" && typeof entry.action === "string" && typeof entry.summary === "string" && (entry.requiresImageAttachment === void 0 || typeof entry.requiresImageAttachment === "boolean") && (entry.promptTemplate === void 0 || typeof entry.promptTemplate === "string") && (entry.appGenerationMode === void 0 || entry.appGenerationMode === null || typeof entry.appGenerationMode === "string") && (entry.unavailableFeedback === void 0 || typeof entry.unavailableFeedback === "string")
  );
}
function isImageRequiredModeRegistration(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}
function isCustomSlashCommandModeRegistration(value) {
  if (!isRecord$1(value) || typeof value.defaultMode !== "string") {
    return false;
  }
  const options = value.options;
  if (!Array.isArray(options)) {
    return false;
  }
  return options.every(
    (entry) => isRecord$1(entry) && typeof entry.id === "string" && typeof entry.name === "string"
  );
}
function isChatRegistration(value) {
  return isRecord$1(value) && isSlashCommandRegistration(value.slashCommands) && isImageRequiredModeRegistration(value.imageRequiredModes) && isCustomSlashCommandModeRegistration(value.customSlashCommandModes);
}
function hasOptionalRegistration(value, key, validator) {
  const entry = value[key];
  if (entry === void 0) {
    return true;
  }
  return validator(entry);
}
function hasOptionalFunction(value, key) {
  const entry = value[key];
  if (entry === void 0) {
    return true;
  }
  return isFunction(entry);
}
const APP_SUBSYSTEM_FRONTEND_REGISTRATION_VALIDATORS = [
  ["overviewTab", isOverviewTabRegistration],
  ["previewSurface", isPreviewSurfaceRegistration],
  ["appModeRoute", isAppModeRouteRegistration],
  ["appDeploymentModal", isAppDeploymentModalRegistration],
  ["chat", isChatRegistration]
];
const APP_SUBSYSTEM_FRONTEND_CONTROLLER_OPTIONAL_FUNCTION_KEYS = [
  "getPreviewEnabled",
  "subscribePreviewEnabled",
  "applyAppDefinitionStructuredContentToStore",
  "applyAppSpecPatchPreviewDeltaToStore",
  "clearAppSpecPatchPreviewStream",
  "clearAllAppSpecPatchPreviewStreams",
  "initializeAppSessionFromCurrentDeployment",
  "resetAppSessionState",
  "processAppProjectStateUpdateFromBackend",
  "initializeProjectState",
  "resetProjectState"
];
function isControllerRegistration(value) {
  if (!isRecord$1(value)) {
    return false;
  }
  return APP_SUBSYSTEM_FRONTEND_CONTROLLER_OPTIONAL_FUNCTION_KEYS.every(
    (key) => hasOptionalFunction(value, key)
  );
}
function hasValidOptionalFrontendFunctions(value) {
  return hasOptionalRegistration(value, "controller", isControllerRegistration);
}
function isAppSubsystemFrontendRegistration(value) {
  if (!isRecord$1(value)) {
    return false;
  }
  for (const [
    key,
    validator
  ] of APP_SUBSYSTEM_FRONTEND_REGISTRATION_VALIDATORS) {
    if (!hasOptionalRegistration(value, key, validator)) {
      return false;
    }
  }
  return hasValidOptionalFrontendFunctions(value);
}
function resolveAppSubsystemPluginRegistrationHost(host) {
  if (!isRecord$1(host)) {
    throw new Error(
      "Plugin host does not support registerAppSubsystem for app-subsystem providers."
    );
  }
  if (typeof host.pluginId !== "string" || host.pluginId.trim().length === 0 || typeof host.apiVersion !== "number" || !isFunction(host.registerAppSubsystem)) {
    throw new Error(
      "Plugin host does not support registerAppSubsystem for app-subsystem providers."
    );
  }
  return host;
}
function registerAppSubsystemPlugin(host, registration) {
  const resolvedHost = resolveAppSubsystemPluginRegistrationHost(host);
  resolvedHost.registerAppSubsystem(registration);
  return resolvedHost;
}
function buildDefaultAppSpecPath(pluginId) {
  const normalizedPluginId = pluginId?.trim() ?? "";
  if (normalizedPluginId.length === 0) {
    return "";
  }
  return `plugins/${normalizedPluginId}/app_specs/app.json`;
}
function readGeneratedExportedValue(name) {
  const entry = sidecar.exportedValues.find(
    (candidate) => candidate.name === name
  );
  if (!entry) {
    throw new Error(
      `Missing generated app exported value ${JSON.stringify(name)}. Regenerate frontend bindings.`
    );
  }
  return entry.value;
}
function readGeneratedStringEnum(name) {
  const entry = sidecar.contracts.find(
    (candidate) => candidate.kind === "enum" && candidate.name === name
  );
  const values = entry?.enumValues ?? [];
  if (values.length === 0) {
    throw new Error(
      `Missing generated string enum ${JSON.stringify(name)} in shared sidecar.`
    );
  }
  return Object.freeze(
    Object.fromEntries(
      values.map((candidate) => [candidate.name, candidate.value])
    )
  );
}
const AppGenerationModeEnum = readGeneratedStringEnum("AppGenerationMode");
const AppSpecPatchPolicyConfig = readGeneratedExportedValue("AppSpecPatchPolicyConfig");
const AppSubsystemChatUIConfig = readGeneratedExportedValue("AppSubsystemChatUIConfig");
function resolveAttachmentLimit(value) {
  if (!Number.isFinite(value)) {
    return { maxFiles: 0, disabled: true };
  }
  if (value === 0) {
    return { maxFiles: 0, disabled: true };
  }
  if (value < 0) {
    return { maxFiles: null, disabled: false };
  }
  return { maxFiles: value, disabled: false };
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** index;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[index]}`;
}
function resolveNumber(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}
function resolveLabel(value, bytes) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return formatBytes(bytes);
}
function normalizeMimePrefixes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((prefix) => {
    return typeof prefix === "string" && prefix.trim().length > 0;
  });
}
function buildAllowedMimeLabel(prefixes) {
  if (prefixes.length === 0) {
    return "";
  }
  return `Allowed types: ${prefixes.join(", ")}.`;
}
function getAttachmentPolicy(scope) {
  if (scope === "chat") {
    const maxFileBytes2 = resolveNumber(C.CHAT_ATTACHMENTS_MAX_FILE_BYTES, 0);
    const { maxFiles, disabled } = resolveAttachmentLimit(
      C.CHAT_ATTACHMENTS_MAX_FILES
    );
    const allowedMimePrefixes2 = normalizeMimePrefixes(
      C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES
    );
    return {
      scope,
      maxFiles,
      maxFilesDisabled: disabled,
      maxFileBytes: maxFileBytes2,
      maxFileLabel: resolveLabel(
        C.CHAT_ATTACHMENTS_MAX_FILE_LABEL,
        maxFileBytes2
      ),
      maxTotalBytes: null,
      maxTotalLabel: null,
      allowedMimePrefixes: allowedMimePrefixes2,
      allowedMimeLabel: buildAllowedMimeLabel(allowedMimePrefixes2)
    };
  }
  if (scope === "dropzone_stateless") {
    const maxFileBytes2 = resolveNumber(C.DROPZONE_STATELESS_MAX_FILE_BYTES, 0);
    const maxTotalBytes = resolveNumber(
      C.DROPZONE_STATELESS_MAX_TOTAL_BYTES,
      0
    );
    const allowedMimePrefixes2 = normalizeMimePrefixes(
      C.DROPZONE_ALLOWED_MIME_PREFIXES
    );
    return {
      scope,
      maxFiles: null,
      maxFilesDisabled: false,
      maxFileBytes: maxFileBytes2,
      maxFileLabel: resolveLabel(
        C.DROPZONE_STATELESS_MAX_FILE_LABEL,
        maxFileBytes2
      ),
      maxTotalBytes,
      maxTotalLabel: resolveLabel(
        C.DROPZONE_STATELESS_MAX_TOTAL_LABEL,
        maxTotalBytes
      ),
      allowedMimePrefixes: allowedMimePrefixes2,
      allowedMimeLabel: buildAllowedMimeLabel(allowedMimePrefixes2)
    };
  }
  const maxFileBytes = resolveNumber(C.DROPZONE_STATEFUL_MAX_FILE_BYTES, 0);
  const allowedMimePrefixes = normalizeMimePrefixes(
    C.DROPZONE_ALLOWED_MIME_PREFIXES
  );
  return {
    scope: "dropzone_stateful",
    maxFiles: null,
    maxFilesDisabled: false,
    maxFileBytes,
    maxFileLabel: resolveLabel(
      C.DROPZONE_STATEFUL_MAX_FILE_LABEL,
      maxFileBytes
    ),
    maxTotalBytes: null,
    maxTotalLabel: null,
    allowedMimePrefixes,
    allowedMimeLabel: buildAllowedMimeLabel(allowedMimePrefixes)
  };
}
function isAttachmentMimeAllowed(mimeType, policy) {
  if (policy.allowedMimePrefixes.length === 0) {
    return true;
  }
  return policy.allowedMimePrefixes.some(
    (prefix) => mimeType.startsWith(prefix)
  );
}
const CODEMIRROR_TOOLTIP_PARENT_ID = "setta-codemirror-tooltips";
const NO_PAN_CLASS_NAME = "nopan";
const SETTA_PREVENT_SECTION_ACTIVE_CSS = "setta-prevent-section-active-css";
const SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION = "setta-prevent-arrow-keys-moving-section";
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function hasRequiredStringProperty(value, key) {
  return typeof value[key] === "string";
}
function hasOptionalStringProperty(value, key) {
  const property = value[key];
  return property === void 0 || typeof property === "string";
}
function hasOptionalNumberProperty(value, key) {
  const property = value[key];
  return property === void 0 || typeof property === "number" && !Number.isNaN(property);
}
function isStoredFileAttachment(value) {
  return value.kind === "file" && hasRequiredStringProperty(value, "id") && hasRequiredStringProperty(value, "name") && hasOptionalStringProperty(value, "mimeType") && hasOptionalNumberProperty(value, "size");
}
function isStoredTextAttachment(value) {
  return value.kind === "text" && hasRequiredStringProperty(value, "id") && hasRequiredStringProperty(value, "name") && hasRequiredStringProperty(value, "text");
}
function isStoredAttachment(value) {
  if (value.kind === "file") {
    return isStoredFileAttachment(value);
  }
  if (value.kind === "text") {
    return isStoredTextAttachment(value);
  }
  return false;
}
function parseDropzoneValue(value) {
  if (value.trim() === "") {
    return null;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const attachments = parsed.attachments;
  if (!Array.isArray(attachments)) {
    return null;
  }
  const normalized = [];
  for (const item of attachments) {
    if (!isRecord(item)) {
      return null;
    }
    if (!isStoredAttachment(item)) {
      return null;
    }
    normalized.push(item);
  }
  return {
    attachments: normalized
  };
}
function serializeDropzoneValue(attachments) {
  if (attachments.length === 0) {
    return "";
  }
  const payload = {
    attachments
  };
  return JSON.stringify(payload);
}
function extractFileExtension(fileName) {
  const baseName = fileName.split(/[/\\]/).pop() ?? fileName;
  if (!baseName) {
    return null;
  }
  let dotIndex = baseName.indexOf(".");
  if (dotIndex <= 0) {
    if (baseName.startsWith(".")) {
      dotIndex = baseName.indexOf(".", 1);
    }
  }
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return null;
  }
  return baseName.slice(dotIndex);
}
function createDropzoneFileArtifactId(fileName, baseFolder) {
  const extension = extractFileExtension(fileName);
  const suffix = extension ?? ".bin";
  const resolvedFolder = baseFolder ?? ARTIFACTS_ROOT;
  return `${resolvedFolder}/${createNewId()}${suffix}`;
}
function createDropzoneTextAttachmentId() {
  return `text:${createNewId()}`;
}
function shouldShowPasswordReveal({
  value,
  hasSecret
}) {
  return hasSecret && value === "";
}
const TEXT_BLOCK_FONT_SIZE_MIN = 8;
const TEXT_BLOCK_FONT_SIZE_MAX = 48;
const TEXT_BLOCK_FONT_SIZE_DEFAULT = 14;
function roundToTenth(value) {
  return Math.round(value * 10) / 10;
}
function clampTextBlockMasterFontSize(value) {
  if (!Number.isFinite(value)) {
    return TEXT_BLOCK_FONT_SIZE_DEFAULT;
  }
  return Math.max(
    TEXT_BLOCK_FONT_SIZE_MIN,
    Math.min(TEXT_BLOCK_FONT_SIZE_MAX, value)
  );
}
function buildTextBlockTypographyScale(masterFontSizePx) {
  const base = clampTextBlockMasterFontSize(masterFontSizePx);
  return {
    bodyPx: roundToTenth(base),
    codePx: roundToTenth(base * 0.92),
    h1Px: roundToTenth(base * 2),
    h2Px: roundToTenth(base * 1.6),
    h3Px: roundToTenth(base * 1.35),
    h4Px: roundToTenth(base * 1.18),
    h5Px: roundToTenth(base * 1.04),
    h6Px: roundToTenth(base * 0.95)
  };
}
const effectiveImplCacheByImpl = /* @__PURE__ */ new WeakMap();
function isMetaControlSectionLike(value) {
  return value.type === SectionTypeEnum.MetaControl;
}
function hasEditableCoreName(value) {
  return isBaseParamCodeObjImpl(value) && "coreNameEditable" in value;
}
function cloneProjectStateValue(value) {
  if (value === null || value === void 0 || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneProjectStateValue(entry));
  }
  const cloned = {};
  for (const [key, entry] of Object.entries(
    value
  )) {
    cloned[key] = cloneProjectStateValue(entry);
  }
  return cloned;
}
function clearEffectiveImplCache(impl) {
  effectiveImplCacheByImpl.delete(impl);
}
function getEffectiveImpl(impl, core, variant) {
  const sharedModifier = core.sharedModifier;
  const variantModifier = variant.modifier;
  let cacheBySharedModifier = effectiveImplCacheByImpl.get(impl);
  if (!cacheBySharedModifier) {
    cacheBySharedModifier = /* @__PURE__ */ new WeakMap();
    effectiveImplCacheByImpl.set(impl, cacheBySharedModifier);
  }
  let cacheByVariantModifier = cacheBySharedModifier.get(sharedModifier);
  if (!cacheByVariantModifier) {
    cacheByVariantModifier = /* @__PURE__ */ new WeakMap();
    cacheBySharedModifier.set(sharedModifier, cacheByVariantModifier);
  }
  const cached = cacheByVariantModifier.get(variantModifier);
  if (cached) {
    return cached;
  }
  const effective = cloneProjectStateValue(impl);
  Object.assign(
    effective,
    cloneProjectStateValue(core.sharedModifier),
    cloneProjectStateValue(variant.modifier)
  );
  cacheByVariantModifier.set(variantModifier, effective);
  return effective;
}
function getCurrentSectionVariantIdIfPresent(projectState, sectionId, preview = false) {
  const variantId = preview ? projectState.previewSectionVariantMap[sectionId] ?? projectState.projectConfig.sectionVariantMap[sectionId] : projectState.projectConfig.sectionVariantMap[sectionId];
  return variantId ?? null;
}
function getCurrentSectionVariantId(projectState, sectionId, preview = false) {
  const variantId = getCurrentSectionVariantIdIfPresent(
    projectState,
    sectionId,
    preview
  );
  if (!variantId) {
    throw new Error(`Missing section variant for section ${sectionId}.`);
  }
  return variantId;
}
function getCurrentEffectiveSectionImplIfPresent(projectState, sectionId, preview = false) {
  const variantId = getCurrentSectionVariantIdIfPresent(
    projectState,
    sectionId,
    preview
  );
  if (!variantId) {
    return null;
  }
  const variant = projectState.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const baseImpl = projectState.sectionImpls[variant.impl];
  if (!baseImpl) {
    return null;
  }
  const core = projectState.sections[sectionId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(baseImpl, core, variant);
}
function getCurrentEffectiveSectionImpl(projectState, sectionId, preview = false) {
  const impl = getCurrentEffectiveSectionImplIfPresent(
    projectState,
    sectionId,
    preview
  );
  if (!impl) {
    throw new Error(`Missing section implementation for section ${sectionId}.`);
  }
  return impl;
}
function getSectionCodeObjVariantId(sectionImpl, codeObjId) {
  if (isBaseSectionWithParamsImpl(sectionImpl)) {
    return sectionImpl.codeObjVariantMap[codeObjId] ?? null;
  }
  if (!isMetaControlSectionLike(sectionImpl)) {
    return null;
  }
  if (sectionImpl.metaControlParamId !== codeObjId) {
    return null;
  }
  return sectionImpl.codeObjVariantMap?.[codeObjId] ?? null;
}
function getCurrentEffectiveCodeObjImplIfPresent(projectState, sectionId, codeObjId, preview = false) {
  const sectionImpl = getCurrentEffectiveSectionImplIfPresent(
    projectState,
    sectionId,
    preview
  );
  if (!sectionImpl) {
    return null;
  }
  const variantId = getSectionCodeObjVariantId(sectionImpl, codeObjId);
  if (!variantId) {
    return null;
  }
  const variant = projectState.codeObjVariants[variantId];
  if (!variant) {
    return null;
  }
  const baseImpl = projectState.codeObjImpls[variant.impl];
  if (!baseImpl) {
    return null;
  }
  const core = projectState.codeObjs[codeObjId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(baseImpl, core, variant);
}
function getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent(projectState, sectionId, codeObjId, typeGuard, preview = false) {
  const impl = getCurrentEffectiveCodeObjImplIfPresent(
    projectState,
    sectionId,
    codeObjId,
    preview
  );
  if (!impl || !typeGuard(impl)) {
    return null;
  }
  return impl;
}
function getParamDisplayNameIfPresent(projectState, sectionId, codeObjId) {
  const codeObj = projectState.codeObjs[codeObjId];
  if (!codeObj) {
    return null;
  }
  if (!projectState.projectConfig.showParamDisplayNames) {
    return codeObj.name;
  }
  const impl = getCurrentEffectiveCodeObjImplIfPresent(
    projectState,
    sectionId,
    codeObjId
  );
  if (impl && hasEditableCoreName(impl) && impl.coreNameEditable) {
    return codeObj.name;
  }
  const trimmedDisplayName = codeObj.displayName.trim();
  if (trimmedDisplayName.length > 0) {
    return codeObj.displayName;
  }
  return codeObj.name;
}
export {
  APP_SUBSYSTEM_FRONTEND_HOST_API_VERSION,
  AppGenerationModeEnum,
  AppSpecPatchPolicyConfig,
  AppSubsystemChatUIConfig,
  ArtifactTypeEnum,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  DefaultAppPolicy,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  DropzoneModeEnum,
  NO_PAN_CLASS_NAME,
  RunSnapshotModeUIConfig,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SectionTypeEnum,
  TextBlockFormatEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  activateAppSubsystemFrontendHostRuntime,
  buildBinaryDownloadUrl,
  buildDefaultAppSpecPath,
  buildTextBlockTypographyScale,
  callOpenAPI,
  checkIfFileExists,
  clearEffectiveImplCache,
  configureAppSubsystemOpenAPI,
  createAppSubsystemFrontendHost,
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createContentRef,
  createCore,
  createDefaultAppPolicy,
  createDropzoneFileArtifactId,
  createDropzoneTextAttachmentId,
  createImageArtifact,
  createPolicy,
  createProjectConfig,
  createRandomName,
  createSectionCapabilities,
  createSettingsState,
  createSingleConfig,
  createSingletonSections,
  createTextBlockSectionImpl,
  createVariant,
  deactivateAppSubsystemFrontendHostRuntime,
  deleteArtifacts,
  downloadBinary,
  formatBytes,
  getActiveAppSubsystemFrontendHostRuntime,
  getAppDefinition,
  getAppDeploymentCurrentSession,
  getAppDeploymentProjectConfig,
  getAppDeploymentState,
  getAttachmentDownloadUrl,
  getAttachmentPolicy,
  getCurrentEffectiveCodeObjImplIfPresent,
  getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrentEffectiveSectionImpl,
  getCurrentEffectiveSectionImplIfPresent,
  getCurrentSectionVariantId,
  getCurrentSectionVariantIdIfPresent,
  getEffectiveImpl,
  getErrorCode,
  getErrorDetail,
  getLatestProjectState,
  getParamDisplayNameIfPresent,
  getPasswordParamValue,
  getSectionCodeObjVariantId,
  isAppSubsystemFrontendRegistration,
  isAttachmentMimeAllowed,
  isBaseChildlessCodeObjImpl,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  listAppDeployments,
  loadCachedImageArtifacts,
  loadProjectConfig,
  parseDropzoneValue,
  publishAppDeployment,
  registerAppSubsystemPlugin,
  res200,
  resolveAppPolicy,
  resolveAppSubsystemPluginRegistrationHost,
  resolveMainRunRequest,
  resolveRunRequest,
  runCode,
  runWithAppSubsystemFrontendHostRuntime,
  serializeDropzoneValue,
  setAppDefinition,
  setParamEnteredValue,
  shouldShowPasswordReveal,
  updateArtifacts,
  uploadBinary,
  validateAppDefinition
};
