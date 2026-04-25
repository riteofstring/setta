var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
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
function createCodeFileBinding(options = {}) {
  return options;
}
function createMetaControlSizingPolicyByType(options = {}) {
  const defaults = {
    ButtonParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    CodeCallable: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    CodeParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    ColorPickerParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    DateParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    DropdownParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "auto_only",
      sizeModeWidth: "any"
    },
    DropzoneParam: {
      minHeight: 120,
      minWidth: 240,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    NestedParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    PasswordParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "auto_only",
      sizeModeWidth: "any"
    },
    RotaryParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    SliderParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "auto_only",
      sizeModeWidth: "any"
    },
    SwitchParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    TextAreaParam: {
      minHeight: 80,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    TextParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    },
    TimeParam: {
      minHeight: 32,
      minWidth: 200,
      sizeModeHeight: "any",
      sizeModeWidth: "any"
    }
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    CodeCallable: createMetaControlSizingPolicyTypeEntry(
      options["CodeCallable"] ?? defaults["CodeCallable"]
    ),
    CodeParam: createMetaControlSizingPolicyTypeEntry(
      options["CodeParam"] ?? defaults["CodeParam"]
    ),
    TextParam: createMetaControlSizingPolicyTypeEntry(
      options["TextParam"] ?? defaults["TextParam"]
    ),
    DateParam: createMetaControlSizingPolicyTypeEntry(
      options["DateParam"] ?? defaults["DateParam"]
    ),
    TimeParam: createMetaControlSizingPolicyTypeEntry(
      options["TimeParam"] ?? defaults["TimeParam"]
    ),
    ButtonParam: createMetaControlSizingPolicyTypeEntry(
      options["ButtonParam"] ?? defaults["ButtonParam"]
    ),
    SliderParam: createMetaControlSizingPolicyTypeEntry(
      options["SliderParam"] ?? defaults["SliderParam"]
    ),
    RotaryParam: createMetaControlSizingPolicyTypeEntry(
      options["RotaryParam"] ?? defaults["RotaryParam"]
    ),
    SwitchParam: createMetaControlSizingPolicyTypeEntry(
      options["SwitchParam"] ?? defaults["SwitchParam"]
    ),
    ColorPickerParam: createMetaControlSizingPolicyTypeEntry(
      options["ColorPickerParam"] ?? defaults["ColorPickerParam"]
    ),
    DropdownParam: createMetaControlSizingPolicyTypeEntry(
      options["DropdownParam"] ?? defaults["DropdownParam"]
    ),
    PasswordParam: createMetaControlSizingPolicyTypeEntry(
      options["PasswordParam"] ?? defaults["PasswordParam"]
    ),
    TextAreaParam: createMetaControlSizingPolicyTypeEntry(
      options["TextAreaParam"] ?? defaults["TextAreaParam"]
    ),
    DropzoneParam: createMetaControlSizingPolicyTypeEntry(
      options["DropzoneParam"] ?? defaults["DropzoneParam"]
    ),
    NestedParam: createMetaControlSizingPolicyTypeEntry(
      options["NestedParam"] ?? defaults["NestedParam"]
    )
  };
}
function createMetaControlSizingPolicyTypeEntry(options = {}) {
  return options;
}
function createPolicy(options = {}) {
  return options;
}
function createProjectChatWindowingState(options = {}) {
  const defaults = {
    instancesById: {},
    nextInstanceNumber: 1,
    order: []
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
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
  return {
    ...mergeGeneratedOptions(defaults, options),
    viewport: options["viewport"] === null ? null : (options["viewport"] ?? defaults["viewport"]) === null ? null : createViewport(
      options["viewport"] === null ? null : options["viewport"] ?? defaults["viewport"]
    ),
    runCapabilities: createProjectRunCapabilities(
      options["runCapabilities"] ?? defaults["runCapabilities"]
    )
  };
}
function createProjectRunCapabilities(options = {}) {
  const defaults = {
    canRunFromMain: false,
    effectiveEntrySectionId: null,
    mainRunDisabledReason: null
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
function createSectionSizingPolicy(options = {}) {
  const defaults = {
    byType: {
      Browser: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 250,
        minWidth: 200
      },
      Callable: {
        hideParamsMinHeight: 90,
        hideSearchMinHeight: 42,
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 104,
        minWidth: 200
      },
      Chart: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 300,
        minWidth: 300
      },
      Chat: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 200,
        minWidth: 400
      },
      Code: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 58.2,
        minWidth: 200
      },
      Dict: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 78,
        minWidth: 200
      },
      Draw: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 100,
        minWidth: 402
      },
      GenPythonCode: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 0,
        minWidth: 200
      },
      GenPythonMetadata: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 0,
        minWidth: 200
      },
      GlobalVariables: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 78,
        minWidth: 200
      },
      Group: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 0,
        minWidth: 200
      },
      IFrame: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 0,
        minWidth: 200
      },
      Image: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 100,
        minWidth: 200
      },
      ListRoot: {
        maxHeight: 50,
        maxWidth: 1e5,
        minHeight: 50,
        minWidth: 200
      },
      MetaControl: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 10,
        minWidth: 100
      },
      Plugin: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 80,
        minWidth: 200
      },
      Prompt: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 150,
        minWidth: 300
      },
      Social: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 50,
        minWidth: 200
      },
      Spreadsheet: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 260,
        minWidth: 420
      },
      StateMachineEnd: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 96,
        minWidth: 240
      },
      StateMachineGate: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 120,
        minWidth: 240
      },
      StateMachineStart: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 96,
        minWidth: 240
      },
      TaskBoard: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 240,
        minWidth: 360
      },
      Terminal: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 100,
        minWidth: 200
      },
      TextBlock: {
        maxHeight: 1e5,
        maxWidth: 1e5,
        minHeight: 49,
        minWidth: 100
      }
    },
    globals: {
      autoMaxHeight: 350,
      infiniteMaxHeight: 1e5,
      infiniteMaxWidth: 1e5,
      minimizedHeight: 32,
      pinnedParamsAreaMinHeight: 64,
      unpinnedParamsAreaMinHeight: 36
    },
    metaControlByType: {
      ButtonParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      CodeCallable: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      CodeParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      ColorPickerParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      DateParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      DropdownParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "auto_only",
        sizeModeWidth: "any"
      },
      DropzoneParam: {
        minHeight: 120,
        minWidth: 240,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      NestedParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      PasswordParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "auto_only",
        sizeModeWidth: "any"
      },
      RotaryParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      SliderParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "auto_only",
        sizeModeWidth: "any"
      },
      SwitchParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      TextAreaParam: {
        minHeight: 80,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      TextParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      },
      TimeParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any"
      }
    }
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    byType: createSectionSizingPolicyByType(
      options["byType"] ?? defaults["byType"]
    ),
    metaControlByType: createMetaControlSizingPolicyByType(
      options["metaControlByType"] ?? defaults["metaControlByType"]
    ),
    globals: createSectionSizingPolicyGlobals(
      options["globals"] ?? defaults["globals"]
    )
  };
}
function createSectionSizingPolicyByType(options = {}) {
  const defaults = {
    Browser: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 250,
      minWidth: 200
    },
    Callable: {
      hideParamsMinHeight: 90,
      hideSearchMinHeight: 42,
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 104,
      minWidth: 200
    },
    Chart: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 300,
      minWidth: 300
    },
    Chat: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 200,
      minWidth: 400
    },
    Code: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 58.2,
      minWidth: 200
    },
    Dict: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 78,
      minWidth: 200
    },
    Draw: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 100,
      minWidth: 402
    },
    GenPythonCode: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 0,
      minWidth: 200
    },
    GenPythonMetadata: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 0,
      minWidth: 200
    },
    GlobalVariables: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 78,
      minWidth: 200
    },
    Group: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 0,
      minWidth: 200
    },
    IFrame: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 0,
      minWidth: 200
    },
    Image: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 100,
      minWidth: 200
    },
    ListRoot: {
      maxHeight: 50,
      maxWidth: 1e5,
      minHeight: 50,
      minWidth: 200
    },
    MetaControl: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 10,
      minWidth: 100
    },
    Plugin: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 80,
      minWidth: 200
    },
    Prompt: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 150,
      minWidth: 300
    },
    Social: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 50,
      minWidth: 200
    },
    Spreadsheet: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 260,
      minWidth: 420
    },
    StateMachineEnd: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 96,
      minWidth: 240
    },
    StateMachineGate: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 120,
      minWidth: 240
    },
    StateMachineStart: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 96,
      minWidth: 240
    },
    TaskBoard: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 240,
      minWidth: 360
    },
    Terminal: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 100,
      minWidth: 200
    },
    TextBlock: {
      maxHeight: 1e5,
      maxWidth: 1e5,
      minHeight: 49,
      minWidth: 100
    }
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    Callable: createSectionSizingPolicyCallableTypeEntry(
      options["Callable"] ?? defaults["Callable"]
    ),
    Dict: createSectionSizingPolicyTypeEntry(
      options["Dict"] ?? defaults["Dict"]
    ),
    ListRoot: createSectionSizingPolicyTypeEntry(
      options["ListRoot"] ?? defaults["ListRoot"]
    ),
    Group: createSectionSizingPolicyTypeEntry(
      options["Group"] ?? defaults["Group"]
    ),
    StateMachineStart: createSectionSizingPolicyTypeEntry(
      options["StateMachineStart"] ?? defaults["StateMachineStart"]
    ),
    StateMachineGate: createSectionSizingPolicyTypeEntry(
      options["StateMachineGate"] ?? defaults["StateMachineGate"]
    ),
    StateMachineEnd: createSectionSizingPolicyTypeEntry(
      options["StateMachineEnd"] ?? defaults["StateMachineEnd"]
    ),
    Image: createSectionSizingPolicyTypeEntry(
      options["Image"] ?? defaults["Image"]
    ),
    Chart: createSectionSizingPolicyTypeEntry(
      options["Chart"] ?? defaults["Chart"]
    ),
    Draw: createSectionSizingPolicyTypeEntry(
      options["Draw"] ?? defaults["Draw"]
    ),
    Prompt: createSectionSizingPolicyTypeEntry(
      options["Prompt"] ?? defaults["Prompt"]
    ),
    TextBlock: createSectionSizingPolicyTypeEntry(
      options["TextBlock"] ?? defaults["TextBlock"]
    ),
    MetaControl: createSectionSizingPolicyTypeEntry(
      options["MetaControl"] ?? defaults["MetaControl"]
    ),
    Social: createSectionSizingPolicyTypeEntry(
      options["Social"] ?? defaults["Social"]
    ),
    GlobalVariables: createSectionSizingPolicyTypeEntry(
      options["GlobalVariables"] ?? defaults["GlobalVariables"]
    ),
    Code: createSectionSizingPolicyTypeEntry(
      options["Code"] ?? defaults["Code"]
    ),
    GenPythonCode: createSectionSizingPolicyTypeEntry(
      options["GenPythonCode"] ?? defaults["GenPythonCode"]
    ),
    GenPythonMetadata: createSectionSizingPolicyTypeEntry(
      options["GenPythonMetadata"] ?? defaults["GenPythonMetadata"]
    ),
    Terminal: createSectionSizingPolicyTypeEntry(
      options["Terminal"] ?? defaults["Terminal"]
    ),
    IFrame: createSectionSizingPolicyTypeEntry(
      options["IFrame"] ?? defaults["IFrame"]
    ),
    Chat: createSectionSizingPolicyTypeEntry(
      options["Chat"] ?? defaults["Chat"]
    ),
    Browser: createSectionSizingPolicyTypeEntry(
      options["Browser"] ?? defaults["Browser"]
    ),
    Plugin: createSectionSizingPolicyTypeEntry(
      options["Plugin"] ?? defaults["Plugin"]
    ),
    TaskBoard: createSectionSizingPolicyTypeEntry(
      options["TaskBoard"] ?? defaults["TaskBoard"]
    ),
    Spreadsheet: createSectionSizingPolicyTypeEntry(
      options["Spreadsheet"] ?? defaults["Spreadsheet"]
    )
  };
}
function createSectionSizingPolicyCallableTypeEntry(options = {}) {
  return options;
}
function createSectionSizingPolicyGlobals(options = {}) {
  const defaults = {
    autoMaxHeight: 350,
    infiniteMaxHeight: 1e5,
    infiniteMaxWidth: 1e5,
    minimizedHeight: 32,
    pinnedParamsAreaMinHeight: 64,
    unpinnedParamsAreaMinHeight: 36
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
function createSectionSizingPolicyTypeEntry(options = {}) {
  return options;
}
function createSettingsBackend(options = {}) {
  const defaults = {
    autoRefetchCallableParamsOnLspMismatch: true,
    autobackup: true,
    autobackupFreq: 300,
    autobackupKeepLastN: 10,
    autosave: true,
    clearTerminalBeforeMarkingAsReady: true,
    completionGuardEnabled: false,
    defaultTerminalShell: null,
    exportDbReadableOnSave: false,
    exportDbReadableWithVariantsOnSave: false,
    renameRefactorMode: "ALWAYS_ASK",
    runSnapshotMode: "ephemeral",
    saveRenderedValues: false,
    showDefaultConfigOnLoad: true
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    defaultTerminalShell: options["defaultTerminalShell"] === null ? null : options["defaultTerminalShell"] ?? null
  };
}
function createSettingsChatWindowing(options = {}) {
  const defaults = {
    autoCreateInitialChat: true,
    restorePriorStateOnUnmaximize: true,
    shortcuts: {
      canvasToggle: "Shift + Esc",
      maximizeFocused: "Mod + Shift + Enter",
      minimizeFocused: "Mod + Shift + M",
      snapBottom: "Mod + Alt + ArrowDown",
      snapLeft: "Mod + Alt + ArrowLeft",
      snapRight: "Mod + Alt + ArrowRight",
      snapTop: "Mod + Alt + ArrowUp"
    }
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    shortcuts: createSettingsChatWindowingShortcuts(
      options["shortcuts"] ?? defaults["shortcuts"]
    )
  };
}
function createSettingsChatWindowingShortcuts(options = {}) {
  const defaults = {
    canvasToggle: "Shift + Esc",
    maximizeFocused: "Mod + Shift + Enter",
    minimizeFocused: "Mod + Shift + M",
    snapBottom: "Mod + Alt + ArrowDown",
    snapLeft: "Mod + Alt + ArrowLeft",
    snapRight: "Mod + Alt + ArrowRight",
    snapTop: "Mod + Alt + ArrowUp"
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
function createSettingsGUI(options = {}) {
  const defaults = {
    defaultZoomLevel: 1,
    gridColor: "#afbacf",
    gridColorDarkMode: "#2b364a",
    gridPattern: "dots",
    gridPatternSize: 2,
    leftSidePaneShiftsMap: true,
    maxZoom: 10,
    minZoom: 0.1,
    panOnDrag: true,
    panOnScroll: true,
    panOnScrollMode: "free",
    panOnScrollSpeed: 1,
    sectionTagColorChoices: [
      {
        color: "#ef4444",
        description: "Red"
      },
      {
        color: "#f97316",
        description: "Orange"
      },
      {
        color: "#eab308",
        description: "Yellow"
      },
      {
        color: "#22c55e",
        description: "Green"
      },
      {
        color: "#06b6d4",
        description: "Cyan"
      },
      {
        color: "#3b82f6",
        description: "Blue"
      },
      {
        color: "#a855f7",
        description: "Purple"
      },
      {
        color: "#64748b",
        description: "Slate"
      }
    ],
    selectionMode: "partial",
    showGridLines: true,
    snapGrid: [15, 15],
    transitionDuration: 50,
    wireColor: "#41506c",
    wireColorDarkMode: "#bac2d3",
    zoomOnDoubleClick: false,
    zoomOnPinch: true,
    zoomOnScroll: true
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
function createSettingsLanguageServer(options = {}) {
  const defaults = {
    selectedByLanguage: {}
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
function createSettingsShortcuts(options = {}) {
  const defaults = {
    advancedSearchShortcut: "Mod + P",
    commandPaletteShortcut: "Mod + Shift + P",
    copyShortcut: "Mod + C",
    copyTooltipTextShortcut: "Q + C",
    decrementTooltipPageShortcut: "Q + ArrowLeft",
    deleteSectionShortcut: "Backspace",
    fitViewShortcut: "F",
    focusCanvasShortcut: "Ctrl + Shift + 3",
    focusHeaderShortcut: "Ctrl + Shift + 1",
    focusOverviewShortcut: "Ctrl + Shift + 2",
    focusUiEditorShortcut: "Ctrl + Shift + 4",
    formatCode: "Shift + Alt + F",
    freezeTooltipShortcut: "Q + F",
    frozenTooltipCopyShortcut: "C",
    frozenTooltipDecrementShortcut: "ArrowLeft",
    frozenTooltipIncrementShortcut: "ArrowRight",
    frozenTooltipToMarkdownShortcut: "W",
    frozenTooltipToPlaintextShortcut: "S",
    groupShortcut: "Mod + G",
    incrementTooltipPageShortcut: "Q + ArrowRight",
    loadShortcut: "Mod + L",
    movingFreeShortcut: "Alt",
    multiSelectionKeyCode: "Mod",
    newCardShortcut: "N",
    newGroupShortcut: "G",
    newProjectConfigShortcut: "",
    newTerminalShortcut: "Ctrl + `",
    nextTopLevelSectionShortcut: "Alt + J",
    panActivationKeyCode: "Space",
    paramIndentShortcut: "Tab",
    paramMoveDownShortcut: "Alt + ArrowDown",
    paramMoveUpShortcut: "Alt + ArrowUp",
    paramSelect: "Mod + Shift",
    paramUnindentShortcut: "Shift + Tab",
    pasteAsRefShortcut: "Mod + Shift + V",
    pasteShortcut: "Mod + V",
    prevTopLevelSectionShortcut: "Alt + K",
    redoShortcut: "Mod + Shift + Z",
    resetZoomShortcut: "Mod + Comma",
    restartLanguageServerShortcut: "Alt + Shift + R",
    runCodeShortcut: "Mod + Enter",
    runEntryCodeBlockShortcut: "Mod + Shift + Enter",
    saveAsShortcut: "Mod + Shift + S",
    saveShortcut: "Mod + S",
    searchShortcut: "Mod + K",
    selectAll: "Mod + A",
    selectTopLevelNonGroupSections: "Mod + Shift + A",
    selectionKeyCode: "Shift",
    showParamUITypeTabShortcut: "P",
    showProjectOverviewTabShortcut: "O",
    showTooltipShortcut: "Q",
    showVersionsTabShortcut: "V",
    sortingShortcut: "Mod + Alt",
    tooltipToMarkdownShortcut: "Q + W",
    tooltipToPlaintextShortcut: "Q + S",
    typeCheckShortcut: "",
    undoShortcut: "Mod + Z",
    ungroupShortcut: "Shift + Mod + G",
    zoomActivationKeyCode: "Mod",
    zoomInShortcut: "Equal",
    zoomOutShortcut: "Minus",
    zoomToMouseShortcut: "Z"
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
function createSettingsState(options = {}) {
  const defaults = {
    backend: {
      autoRefetchCallableParamsOnLspMismatch: true,
      autobackup: true,
      autobackupFreq: 300,
      autobackupKeepLastN: 10,
      autosave: true,
      clearTerminalBeforeMarkingAsReady: true,
      completionGuardEnabled: false,
      defaultTerminalShell: null,
      exportDbReadableOnSave: false,
      exportDbReadableWithVariantsOnSave: false,
      renameRefactorMode: "ALWAYS_ASK",
      runSnapshotMode: "ephemeral",
      saveRenderedValues: false,
      showDefaultConfigOnLoad: true
    },
    chatWindowing: {
      autoCreateInitialChat: true,
      restorePriorStateOnUnmaximize: true,
      shortcuts: {
        canvasToggle: "Shift + Esc",
        maximizeFocused: "Mod + Shift + Enter",
        minimizeFocused: "Mod + Shift + M",
        snapBottom: "Mod + Alt + ArrowDown",
        snapLeft: "Mod + Alt + ArrowLeft",
        snapRight: "Mod + Alt + ArrowRight",
        snapTop: "Mod + Alt + ArrowUp"
      }
    },
    gui: {
      defaultZoomLevel: 1,
      gridColor: "#afbacf",
      gridColorDarkMode: "#2b364a",
      gridPattern: "dots",
      gridPatternSize: 2,
      leftSidePaneShiftsMap: true,
      maxZoom: 10,
      minZoom: 0.1,
      panOnDrag: true,
      panOnScroll: true,
      panOnScrollMode: "free",
      panOnScrollSpeed: 1,
      sectionTagColorChoices: [
        {
          color: "#ef4444",
          description: "Red"
        },
        {
          color: "#f97316",
          description: "Orange"
        },
        {
          color: "#eab308",
          description: "Yellow"
        },
        {
          color: "#22c55e",
          description: "Green"
        },
        {
          color: "#06b6d4",
          description: "Cyan"
        },
        {
          color: "#3b82f6",
          description: "Blue"
        },
        {
          color: "#a855f7",
          description: "Purple"
        },
        {
          color: "#64748b",
          description: "Slate"
        }
      ],
      selectionMode: "partial",
      showGridLines: true,
      snapGrid: [15, 15],
      transitionDuration: 50,
      wireColor: "#41506c",
      wireColorDarkMode: "#bac2d3",
      zoomOnDoubleClick: false,
      zoomOnPinch: true,
      zoomOnScroll: true
    },
    languageServer: {
      selectedByLanguage: {}
    },
    sectionSizingPolicy: {
      byType: {
        Browser: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 250,
          minWidth: 200
        },
        Callable: {
          hideParamsMinHeight: 90,
          hideSearchMinHeight: 42,
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 104,
          minWidth: 200
        },
        Chart: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 300,
          minWidth: 300
        },
        Chat: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 200,
          minWidth: 400
        },
        Code: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 58.2,
          minWidth: 200
        },
        Dict: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 78,
          minWidth: 200
        },
        Draw: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 100,
          minWidth: 402
        },
        GenPythonCode: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 0,
          minWidth: 200
        },
        GenPythonMetadata: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 0,
          minWidth: 200
        },
        GlobalVariables: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 78,
          minWidth: 200
        },
        Group: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 0,
          minWidth: 200
        },
        IFrame: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 0,
          minWidth: 200
        },
        Image: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 100,
          minWidth: 200
        },
        ListRoot: {
          maxHeight: 50,
          maxWidth: 1e5,
          minHeight: 50,
          minWidth: 200
        },
        MetaControl: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 10,
          minWidth: 100
        },
        Plugin: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 80,
          minWidth: 200
        },
        Prompt: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 150,
          minWidth: 300
        },
        Social: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 50,
          minWidth: 200
        },
        Spreadsheet: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 260,
          minWidth: 420
        },
        StateMachineEnd: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 96,
          minWidth: 240
        },
        StateMachineGate: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 120,
          minWidth: 240
        },
        StateMachineStart: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 96,
          minWidth: 240
        },
        TaskBoard: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 240,
          minWidth: 360
        },
        Terminal: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 100,
          minWidth: 200
        },
        TextBlock: {
          maxHeight: 1e5,
          maxWidth: 1e5,
          minHeight: 49,
          minWidth: 100
        }
      },
      globals: {
        autoMaxHeight: 350,
        infiniteMaxHeight: 1e5,
        infiniteMaxWidth: 1e5,
        minimizedHeight: 32,
        pinnedParamsAreaMinHeight: 64,
        unpinnedParamsAreaMinHeight: 36
      },
      metaControlByType: {
        ButtonParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        CodeCallable: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        CodeParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        ColorPickerParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        DateParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        DropdownParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "auto_only",
          sizeModeWidth: "any"
        },
        DropzoneParam: {
          minHeight: 120,
          minWidth: 240,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        NestedParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        PasswordParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "auto_only",
          sizeModeWidth: "any"
        },
        RotaryParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        SliderParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "auto_only",
          sizeModeWidth: "any"
        },
        SwitchParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        TextAreaParam: {
          minHeight: 80,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        TextParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        },
        TimeParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: "any",
          sizeModeWidth: "any"
        }
      }
    },
    shortcuts: {
      advancedSearchShortcut: "Mod + P",
      commandPaletteShortcut: "Mod + Shift + P",
      copyShortcut: "Mod + C",
      copyTooltipTextShortcut: "Q + C",
      decrementTooltipPageShortcut: "Q + ArrowLeft",
      deleteSectionShortcut: "Backspace",
      fitViewShortcut: "F",
      focusCanvasShortcut: "Ctrl + Shift + 3",
      focusHeaderShortcut: "Ctrl + Shift + 1",
      focusOverviewShortcut: "Ctrl + Shift + 2",
      focusUiEditorShortcut: "Ctrl + Shift + 4",
      formatCode: "Shift + Alt + F",
      freezeTooltipShortcut: "Q + F",
      frozenTooltipCopyShortcut: "C",
      frozenTooltipDecrementShortcut: "ArrowLeft",
      frozenTooltipIncrementShortcut: "ArrowRight",
      frozenTooltipToMarkdownShortcut: "W",
      frozenTooltipToPlaintextShortcut: "S",
      groupShortcut: "Mod + G",
      incrementTooltipPageShortcut: "Q + ArrowRight",
      loadShortcut: "Mod + L",
      movingFreeShortcut: "Alt",
      multiSelectionKeyCode: "Mod",
      newCardShortcut: "N",
      newGroupShortcut: "G",
      newProjectConfigShortcut: "",
      newTerminalShortcut: "Ctrl + `",
      nextTopLevelSectionShortcut: "Alt + J",
      panActivationKeyCode: "Space",
      paramIndentShortcut: "Tab",
      paramMoveDownShortcut: "Alt + ArrowDown",
      paramMoveUpShortcut: "Alt + ArrowUp",
      paramSelect: "Mod + Shift",
      paramUnindentShortcut: "Shift + Tab",
      pasteAsRefShortcut: "Mod + Shift + V",
      pasteShortcut: "Mod + V",
      prevTopLevelSectionShortcut: "Alt + K",
      redoShortcut: "Mod + Shift + Z",
      resetZoomShortcut: "Mod + Comma",
      restartLanguageServerShortcut: "Alt + Shift + R",
      runCodeShortcut: "Mod + Enter",
      runEntryCodeBlockShortcut: "Mod + Shift + Enter",
      saveAsShortcut: "Mod + Shift + S",
      saveShortcut: "Mod + S",
      searchShortcut: "Mod + K",
      selectAll: "Mod + A",
      selectTopLevelNonGroupSections: "Mod + Shift + A",
      selectionKeyCode: "Shift",
      showParamUITypeTabShortcut: "P",
      showProjectOverviewTabShortcut: "O",
      showTooltipShortcut: "Q",
      showVersionsTabShortcut: "V",
      sortingShortcut: "Mod + Alt",
      tooltipToMarkdownShortcut: "Q + W",
      tooltipToPlaintextShortcut: "Q + S",
      typeCheckShortcut: "",
      undoShortcut: "Mod + Z",
      ungroupShortcut: "Shift + Mod + G",
      zoomActivationKeyCode: "Mod",
      zoomInShortcut: "Equal",
      zoomOutShortcut: "Minus",
      zoomToMouseShortcut: "Z"
    }
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    shortcuts: createSettingsShortcuts(
      options["shortcuts"] ?? defaults["shortcuts"]
    ),
    gui: createSettingsGUI(options["gui"] ?? defaults["gui"]),
    backend: createSettingsBackend(options["backend"] ?? defaults["backend"]),
    chatWindowing: createSettingsChatWindowing(
      options["chatWindowing"] ?? defaults["chatWindowing"]
    ),
    sectionSizingPolicy: createSectionSizingPolicy(
      options["sectionSizingPolicy"] ?? defaults["sectionSizingPolicy"]
    ),
    languageServer: createSettingsLanguageServer(
      options["languageServer"] ?? defaults["languageServer"]
    )
  };
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
    projectConfig: {
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
    },
    requiredDecodedImages: [],
    sectionCapabilities: {},
    sectionImpls: {},
    sectionVariants: {},
    sections: {},
    shownParamIds: {},
    singletonSections: {
      GenPythonCode: null,
      GenPythonMetadata: null,
      GlobalVariables: null
    }
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    projectConfig: createProjectConfig(
      options["projectConfig"] ?? defaults["projectConfig"]
    ),
    singletonSections: createSingletonSections(
      options["singletonSections"] ?? defaults["singletonSections"]
    ),
    genCodeBinding: options["genCodeBinding"] === null ? null : (options["genCodeBinding"] ?? defaults["genCodeBinding"]) === null ? null : createCodeFileBinding(
      options["genCodeBinding"] === null ? null : options["genCodeBinding"] ?? defaults["genCodeBinding"]
    ),
    projectChatWindowing: createProjectChatWindowingState(
      options["projectChatWindowing"] ?? defaults["projectChatWindowing"]
    )
  };
}
function createSingletonSections(options = {}) {
  const defaults = {
    GenPythonCode: null,
    GenPythonMetadata: null,
    GlobalVariables: null
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
function createViewport(options = {}) {
  const defaults = {
    x: 0,
    y: 0,
    zoom: 1
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
const ArtifactTypeEnum = {
  Image: "Image",
  BrushStroke: "BrushStroke",
  DrawAreaLayerItemTransform: "DrawAreaLayerItemTransform",
  ChartData: "ChartData",
  File: "File"
};
const CodeObjTypeEnum = {
  CodeCallable: "CodeCallable",
  CodeParam: "CodeParam",
  TextParam: "TextParam",
  DateParam: "DateParam",
  TimeParam: "TimeParam",
  ButtonParam: "ButtonParam",
  SliderParam: "SliderParam",
  RotaryParam: "RotaryParam",
  SwitchParam: "SwitchParam",
  ColorPickerParam: "ColorPickerParam",
  DropdownParam: "DropdownParam",
  PasswordParam: "PasswordParam",
  TextAreaParam: "TextAreaParam",
  DropzoneParam: "DropzoneParam",
  NestedParam: "NestedParam"
};
const ConfigLanguageEnum = {
  python: "python",
  json: "json"
};
const DateCalendarWeekStartEnum = {
  sunday: "sunday",
  monday: "monday"
};
const DateControlModeEnum = {
  input: "input",
  calendar: "calendar"
};
const DateDisplayFormatEnum = {
  iso: "iso",
  us: "us",
  eu: "eu",
  long: "long"
};
const DateSelectionModeEnum = {
  single: "single",
  multiple: "multiple"
};
const DependencyKeyTypeEnum = {
  Section: "Section",
  SectionParam: "SectionParam"
};
const DependencyValueTypeEnum = {
  Literal: "Literal",
  Binary: "Binary",
  FileRead: "FileRead"
};
const DropzoneModeEnum = {
  STATEFUL: "STATEFUL",
  STATELESS: "STATELESS"
};
const EndpointOriginEnum = {
  backend: "backend",
  launcher: "launcher",
  BackendOrigin: "backend-origin"
};
const SectionTypeEnum = {
  Callable: "Callable",
  Dict: "Dict",
  ListRoot: "ListRoot",
  Group: "Group",
  StateMachineStart: "StateMachineStart",
  StateMachineGate: "StateMachineGate",
  StateMachineEnd: "StateMachineEnd",
  Image: "Image",
  Chart: "Chart",
  Draw: "Draw",
  TextBlock: "TextBlock",
  Prompt: "Prompt",
  MetaControl: "MetaControl",
  Social: "Social",
  GlobalVariables: "GlobalVariables",
  Code: "Code",
  GenPythonCode: "GenPythonCode",
  GenPythonMetadata: "GenPythonMetadata",
  Terminal: "Terminal",
  IFrame: "IFrame",
  Chat: "Chat",
  Browser: "Browser",
  Plugin: "Plugin",
  TaskBoard: "TaskBoard",
  Spreadsheet: "Spreadsheet"
};
const TextBlockFormatEnum = {
  Plaintext: "Plaintext",
  Markdown: "Markdown"
};
const TextParamInputUITypeEnum = {
  plain: "plain",
  time: "time",
  date: "date"
};
const TimeControlModeEnum = {
  input: "input",
  display: "display"
};
const TimeDisplayFontEnum = {
  clock: "clock",
  monospace: "monospace",
  system: "system"
};
const TimeDisplayFormatEnum = {
  twenty_four_hour: "twenty_four_hour",
  twelve_hour: "twelve_hour"
};
const BaseChildlessCodeObjImplTypeSet = /* @__PURE__ */ new Set([
  "CodeParam",
  "TextParam",
  "DateParam",
  "TimeParam",
  "SliderParam",
  "RotaryParam",
  "SwitchParam",
  "ColorPickerParam",
  "DropdownParam",
  "PasswordParam",
  "TextAreaParam",
  "DropzoneParam"
]);
function isBaseChildlessCodeObjImpl(x) {
  return BaseChildlessCodeObjImplTypeSet.has(x.type);
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
function isBaseParamCodeObjImpl(x) {
  return BaseParamCodeObjImplTypeSet.has(x.type);
}
const BaseSectionWithParamsImplTypeSet = /* @__PURE__ */ new Set([
  "Callable",
  "Dict",
  "MetaControl",
  "GlobalVariables"
]);
function isBaseSectionWithParamsImpl(x) {
  return BaseSectionWithParamsImplTypeSet.has(x.type);
}
const BootstrapProtocol = {
  backendOriginOverrideQueryParam: "__setta_backend_origin",
  launcherOriginHashParam: "lo",
  launcherOriginProofHashParam: "lop",
  launcherOriginStorageKey: "setta.launcherOrigin",
  maxValueLength: 8192,
  openWorkspaceSwitcherHashParam: "osw",
  openWorkspaceSwitcherQueryParam: "__setta_open_workspace_switcher",
  workspaceHistoryHashParam: "wh",
  workspaceHistoryQueryParam: "__setta_workspace_history",
  workspaceHistoryStorageKey: "setta.workspaceHistoryHandoff"
};
const C = {
  AUTH_COOKIE_REFRESH_WINDOW_SECONDS: 3600,
  CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES: [],
  CHAT_ATTACHMENTS_MAX_FILES: 10,
  CHAT_ATTACHMENTS_MAX_FILE_BYTES: 26214400,
  CHAT_ATTACHMENTS_MAX_FILE_LABEL: "25 MB",
  DEFAULT_HOST: "127.0.0.1",
  DEFAULT_PORT: 8e3,
  DROPZONE_ALLOWED_MIME_PREFIXES: [],
  DROPZONE_STATEFUL_MAX_FILE_BYTES: 26214400,
  DROPZONE_STATEFUL_MAX_FILE_LABEL: "25 MB",
  DROPZONE_STATELESS_MAX_FILE_BYTES: 5242880,
  DROPZONE_STATELESS_MAX_FILE_LABEL: "5 MB",
  DROPZONE_STATELESS_MAX_TOTAL_BYTES: 16777216,
  DROPZONE_STATELESS_MAX_TOTAL_LABEL: "16 MB",
  EDGE_OUTPUT_BASE_LABEL: "value",
  GEN_CODE_SEPARATOR_NEWLINES: 2,
  LLM_TEXT: "text",
  LLM_THINKING: "thinking",
  NOTIFICATION_IS_FOR_ALL_PROJECTS: "NOTIFICATION_IS_FOR_ALL_PROJECTS",
  REALTIME_BINARY_MAX_BYTES: 10485760,
  SETTA_TERMINAL_READY: "SETTA_TERMINAL_READY",
  SETTINGS_PROJECT_NAME: "settings",
  WS_TERMINAL_RESIZE: "terminalResize"
};
const DefaultAppPolicy = {
  allowExternalLinks: false,
  allowFileDownloads: false,
  allowLLM: false,
  allowLayoutChanges: false,
  allowMultipleRuns: true,
  allowParamChanges: true,
  allowRun: true,
  allowVariantChanges: false,
  runSnapshotMode: "ephemeral"
};
const EndpointOriginPolicyByRoute = {
  "/__setta__/tools/call": "backend-origin",
  "/addLauncherRecentWorkspace": "launcher",
  "/createWorkspaceLaunchIntent": "launcher",
  "/launch": "launcher",
  "/launcherFilesystemRoots": "launcher",
  "/launcherRecentWorkspaces": "launcher",
  "/listLauncherDirectory": "launcher",
  "/openLauncherWorkspace": "launcher",
  "/pinLauncherRecentWorkspace": "launcher",
  "/removeLauncherRecentWorkspace": "launcher",
  "/settaHomeInfo": "backend"
};
const LocalHostnamePolicyConfig = {
  loopbackHosts: ["127.0.0.1", "localhost", "::1"]
};
const ModeScopedLauncherRoutesList = [
  "/launch",
  "/createWorkspaceLaunchIntent"
];
const OverviewTabUIConfig = {
  names: {
    App: "App",
    FileBrowser: "FileBrowser",
    Git: "Git",
    Notifications: "Notifications",
    Overview: "Overview",
    Plugins: "Plugins",
    ProjectAIChat: "ProjectAIChat",
    ProjectAISettings: "ProjectAISettings",
    RunInstructions: "RunInstructions",
    ViewModes: "ViewModes"
  }
};
const RunSnapshotModeUIConfig = {
  deploymentOptions: [
    {
      description: "Snapshot per run, cleaned up automatically.",
      label: "Ephemeral",
      value: "ephemeral"
    },
    {
      description: "Snapshot per run, stored under code history.",
      label: "Always",
      value: "always"
    }
  ],
  options: [
    {
      description: "Snapshot per run, cleaned up automatically.",
      label: "Ephemeral",
      value: "ephemeral"
    },
    {
      description: "Snapshot per run, stored under code history.",
      label: "Always",
      value: "always"
    },
    {
      description: "Run from canonical files without a snapshot.",
      label: "Never",
      value: "never"
    }
  ]
};
const TransportRouteConstants = {
  apiPrefix: "/api",
  binary: { download: "/binary/{contentId}", upload: "/binary/upload" },
  root: {
    bootstrapPage: "/__setta__/bootstrap",
    toolsCall: "/__setta__/tools/call"
  },
  websocket: {
    frontend: "/ws/frontend",
    listenerById: "/ws/listeners/{listenerID}",
    terminalBySection: "/ws/terminals/{projectID}/{sectionID}"
  }
};
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
const BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY = "setta.backendOriginOverride";
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
  // Resolve backend and launcher origins from Go-owned bindings plus runtime overrides.
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
    __publicField(this, "fns", []);
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
function createDefaultAppPolicy() {
  return createPolicy({ ...DefaultAppPolicy });
}
function resolveAppPolicy(appPolicy) {
  return appPolicy ?? createDefaultAppPolicy();
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
  return new URL(address, resolveTransportBaseUrl(serverMode, address)).toString();
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
const contracts = /* @__PURE__ */ JSON.parse('[{"name":"AIFollowToolArgumentsUpdateContent","kind":"model","schemaRef":"#/$defs/AIFollowToolArgumentsUpdateContent"},{"name":"AIFollowToolArgumentsUpdateMessage","kind":"model","schemaRef":"#/$defs/AIFollowToolArgumentsUpdateMessage"},{"name":"AIFollowToolResultUpdateContent","kind":"model","schemaRef":"#/$defs/AIFollowToolResultUpdateContent"},{"name":"AIFollowToolResultUpdateMessage","kind":"model","schemaRef":"#/$defs/AIFollowToolResultUpdateMessage"},{"name":"AddKwargResult","kind":"model","schemaRef":"#/$defs/AddKwargResult"},{"name":"AgentProfile","kind":"model","schemaRef":"#/$defs/AgentProfile"},{"name":"AgentProfilesUpdatedContent","kind":"model","schemaRef":"#/$defs/AgentProfilesUpdatedContent"},{"name":"AgentProfilesUpdatedMessage","kind":"model","schemaRef":"#/$defs/AgentProfilesUpdatedMessage"},{"name":"AgentRun","kind":"model","schemaRef":"#/$defs/AgentRun"},{"name":"AgentRunUpdatedMessage","kind":"model","schemaRef":"#/$defs/AgentRunUpdatedMessage"},{"name":"AgenticEdge","kind":"model","schemaRef":"#/$defs/AgenticEdge"},{"name":"AgenticEdgeContextMode","kind":"enum","schemaRef":"#/$defs/AgenticEdgeContextMode","enumValues":[{"name":"reference_only","value":"reference_only"},{"name":"inline_text","value":"inline_text"},{"name":"summary","value":"summary"}]},{"name":"AgenticEdgeKind","kind":"enum","schemaRef":"#/$defs/AgenticEdgeKind","enumValues":[{"name":"chat_chat","value":"chat_chat"},{"name":"section_chat","value":"section_chat"},{"name":"chat_section","value":"chat_section"}]},{"name":"AgenticSummaryCacheStatus","kind":"model","schemaRef":"#/$defs/AgenticSummaryCacheStatus"},{"name":"AllConfigs","kind":"model","schemaRef":"#/$defs/AllConfigs"},{"name":"AllConnectionsMessage","kind":"model","schemaRef":"#/$defs/AllConnectionsMessage"},{"name":"AllProjectMetadata","kind":"model","schemaRef":"#/$defs/AllProjectMetadata"},{"name":"AllProjectMetadataContent","kind":"model","schemaRef":"#/$defs/AllProjectMetadataContent"},{"name":"AllProjectMetadataMessage","kind":"model","schemaRef":"#/$defs/AllProjectMetadataMessage"},{"name":"Allocation","kind":"model","schemaRef":"#/$defs/Allocation"},{"name":"AppDefinition","kind":"model","schemaRef":"#/$defs/AppDefinition"},{"name":"AppGenerationMode","kind":"enum","schemaRef":"#/$defs/AppGenerationMode","enumValues":[{"name":"json_render","value":"json_render"},{"name":"json_render_with_image","value":"json_render_with_image"},{"name":"prompt_builder","value":"prompt_builder"},{"name":"mcp_server","value":"mcp_server"}]},{"name":"AppRoute","kind":"model","schemaRef":"#/$defs/AppRoute"},{"name":"AppSubsystemChatSlashCommandValue","kind":"model","schemaRef":"#/$defs/AppSubsystemChatSlashCommandValue"},{"name":"AppSubsystemChatUIConfigValue","kind":"model","schemaRef":"#/$defs/AppSubsystemChatUIConfigValue"},{"name":"AppSubsystemCustomSlashCommandModeOptionValue","kind":"model","schemaRef":"#/$defs/AppSubsystemCustomSlashCommandModeOptionValue"},{"name":"AppendMessagesRequest","kind":"model","schemaRef":"#/$defs/AppendMessagesRequest"},{"name":"ArtifactSaveResult","kind":"model","schemaRef":"#/$defs/ArtifactSaveResult"},{"name":"ArtifactType","kind":"enum","schemaRef":"#/$defs/ArtifactType","enumValues":[{"name":"Image","value":"Image"},{"name":"BrushStroke","value":"BrushStroke"},{"name":"DrawAreaLayerItemTransform","value":"DrawAreaLayerItemTransform"},{"name":"ChartData","value":"ChartData"},{"name":"File","value":"File"}]},{"name":"AssistantChatMessage","kind":"model","schemaRef":"#/$defs/AssistantChatMessage"},{"name":"BackendCodegenTargetRequest","kind":"model","schemaRef":"#/$defs/BackendCodegenTargetRequest"},{"name":"BackendHTTPRequest","kind":"model","schemaRef":"#/$defs/BackendHTTPRequest"},{"name":"BackendHTTPResponse","kind":"model","schemaRef":"#/$defs/BackendHTTPResponse"},{"name":"BackendListenerEndpointRequest","kind":"model","schemaRef":"#/$defs/BackendListenerEndpointRequest"},{"name":"BackendLogEvent","kind":"model","schemaRef":"#/$defs/BackendLogEvent"},{"name":"BackendRequestContext","kind":"model","schemaRef":"#/$defs/BackendRequestContext"},{"name":"BackgroundVariant","kind":"enum","schemaRef":"#/$defs/BackgroundVariant","enumValues":[{"name":"lines","value":"lines"},{"name":"dots","value":"dots"},{"name":"cross","value":"cross"}]},{"name":"BaseArtifactUnion","kind":"model","schemaRef":"#/$defs/BaseArtifactUnion"},{"name":"BaseChartSettingsUnion","kind":"model","schemaRef":"#/$defs/BaseChartSettingsUnion"},{"name":"BaseChatMessageUnion","kind":"model","schemaRef":"#/$defs/BaseChatMessageUnion"},{"name":"BaseCodeObjImpl","kind":"model","schemaRef":"#/$defs/BaseCodeObjImpl"},{"name":"BaseDependencyKeyUnion","kind":"model","schemaRef":"#/$defs/BaseDependencyKeyUnion"},{"name":"BaseDependencyValueUnion","kind":"model","schemaRef":"#/$defs/BaseDependencyValueUnion"},{"name":"BaseParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/BaseParamCodeObjImpl"},{"name":"BaseSectionImpl","kind":"model","schemaRef":"#/$defs/BaseSectionImpl"},{"name":"BaseValueParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/BaseValueParamCodeObjImpl"},{"name":"BinaryDependencyValue","kind":"model","schemaRef":"#/$defs/BinaryDependencyValue"},{"name":"BinaryTransportRoutes","kind":"model","schemaRef":"#/$defs/BinaryTransportRoutes"},{"name":"BootstrapHandoffProtocol","kind":"model","schemaRef":"#/$defs/BootstrapHandoffProtocol"},{"name":"BrowserAreaViewMode","kind":"enum","schemaRef":"#/$defs/BrowserAreaViewMode","enumValues":[{"name":"list","value":"list"},{"name":"thumbnail","value":"thumbnail"},{"name":"carousel","value":"carousel"}]},{"name":"BrowserSavedSearch","kind":"model","schemaRef":"#/$defs/BrowserSavedSearch"},{"name":"BrowserSavedSearchTypeFilters","kind":"model","schemaRef":"#/$defs/BrowserSavedSearchTypeFilters"},{"name":"BrowserSearchScope","kind":"enum","schemaRef":"#/$defs/BrowserSearchScope","enumValues":[{"name":"recursive","value":"recursive"},{"name":"local","value":"local"}]},{"name":"BrowserSectionImpl","kind":"model","schemaRef":"#/$defs/BrowserSectionImpl"},{"name":"BrushStroke","kind":"model","schemaRef":"#/$defs/BrushStroke"},{"name":"BrushStrokeArtifact","kind":"model","schemaRef":"#/$defs/BrushStrokeArtifact"},{"name":"BrushStrokeWithTransform","kind":"model","schemaRef":"#/$defs/BrushStrokeWithTransform"},{"name":"ButtonActionMode","kind":"enum","schemaRef":"#/$defs/ButtonActionMode","enumValues":[{"name":"WEBSOCKET_LISTENER","value":"WEBSOCKET_LISTENER"},{"name":"HTTP_REQUEST","value":"HTTP_REQUEST"},{"name":"SETTA_API","value":"SETTA_API"}]},{"name":"ButtonParamActionModeOption","kind":"model","schemaRef":"#/$defs/ButtonParamActionModeOption"},{"name":"ButtonParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/ButtonParamCodeObjImpl"},{"name":"ButtonParamRequestMethodOption","kind":"model","schemaRef":"#/$defs/ButtonParamRequestMethodOption"},{"name":"ButtonParamUIConfigValue","kind":"model","schemaRef":"#/$defs/ButtonParamUIConfigValue"},{"name":"CallableSectionImpl","kind":"model","schemaRef":"#/$defs/CallableSectionImpl"},{"name":"CanvasPoint","kind":"alias","schemaRef":"#/$defs/CanvasPoint"},{"name":"Capabilities","kind":"model","schemaRef":"#/$defs/Capabilities"},{"name":"ChangeParamImplUIConfigValue","kind":"model","schemaRef":"#/$defs/ChangeParamImplUIConfigValue"},{"name":"ChartDataArtifact","kind":"model","schemaRef":"#/$defs/ChartDataArtifact"},{"name":"ChartDataValue","kind":"alias","schemaRef":"#/$defs/ChartDataValue"},{"name":"ChartSectionImpl","kind":"model","schemaRef":"#/$defs/ChartSectionImpl"},{"name":"ChartSettingsUpdate","kind":"model","schemaRef":"#/$defs/ChartSettingsUpdate"},{"name":"ChartType","kind":"enum","schemaRef":"#/$defs/ChartType","enumValues":[{"name":"line","value":"line"},{"name":"scatter","value":"scatter"}]},{"name":"Chat","kind":"model","schemaRef":"#/$defs/Chat"},{"name":"ChatAppGenerationMessageMode","kind":"enum","schemaRef":"#/$defs/ChatAppGenerationMessageMode","enumValues":[{"name":"plain_chat","value":"plain_chat"},{"name":"json_render","value":"json_render"},{"name":"json_render_with_image","value":"json_render_with_image"},{"name":"prompt_builder","value":"prompt_builder"},{"name":"mcp_server","value":"mcp_server"}]},{"name":"ChatDictationMode","kind":"enum","schemaRef":"#/$defs/ChatDictationMode","enumValues":[{"name":"auto","value":"auto"},{"name":"browser","value":"browser"},{"name":"provider","value":"provider"}]},{"name":"ChatFileAttachment","kind":"model","schemaRef":"#/$defs/ChatFileAttachment"},{"name":"ChatMetadata","kind":"model","schemaRef":"#/$defs/ChatMetadata"},{"name":"ChatPermissionMode","kind":"enum","schemaRef":"#/$defs/ChatPermissionMode","enumValues":[{"name":"minimal","value":"minimal"},{"name":"yolo","value":"yolo"},{"name":"config_toml_custom","value":"config_toml_custom"}]},{"name":"ChatRole","kind":"enum","schemaRef":"#/$defs/ChatRole","enumValues":[{"name":"system","value":"system"},{"name":"user","value":"user"},{"name":"assistant","value":"assistant"},{"name":"tool","value":"tool"}]},{"name":"ChatRunTypeSet","kind":"alias","schemaRef":"#/$defs/ChatRunTypeSet"},{"name":"ChatSectionBranch","kind":"model","schemaRef":"#/$defs/ChatSectionBranch"},{"name":"ChatSectionImpl","kind":"model","schemaRef":"#/$defs/ChatSectionImpl"},{"name":"ChatSectionSettings","kind":"model","schemaRef":"#/$defs/ChatSectionSettings"},{"name":"ChatSectionState","kind":"model","schemaRef":"#/$defs/ChatSectionState"},{"name":"ChatSendAction","kind":"enum","schemaRef":"#/$defs/ChatSendAction","enumValues":[{"name":"send","value":"send"}]},{"name":"ChatSendEvent","kind":"model","schemaRef":"#/$defs/ChatSendEvent"},{"name":"ChatStopAction","kind":"enum","schemaRef":"#/$defs/ChatStopAction","enumValues":[{"name":"stop","value":"stop"}]},{"name":"ChatStopEvent","kind":"model","schemaRef":"#/$defs/ChatStopEvent"},{"name":"ChatWindowBounds","kind":"model","schemaRef":"#/$defs/ChatWindowBounds"},{"name":"ChatWindowDockMetrics","kind":"model","schemaRef":"#/$defs/ChatWindowDockMetrics"},{"name":"ChatWindowMode","kind":"enum","schemaRef":"#/$defs/ChatWindowMode","enumValues":[{"name":"project_ai_mode","value":"project_ai_mode"},{"name":"section_mode","value":"section_mode"},{"name":"git_graph_mode","value":"git_graph_mode"}]},{"name":"ChatWindowPlacement","kind":"enum","schemaRef":"#/$defs/ChatWindowPlacement","enumValues":[{"name":"bottom_docked","value":"bottom_docked"},{"name":"floating","value":"floating"},{"name":"maximized","value":"maximized"},{"name":"canvas_section","value":"canvas_section"}]},{"name":"ChildCodeObjFields","kind":"model","schemaRef":"#/$defs/ChildCodeObjFields"},{"name":"ChildDefaultsUIConfigValue","kind":"model","schemaRef":"#/$defs/ChildDefaultsUIConfigValue"},{"name":"ChildSectionFields","kind":"model","schemaRef":"#/$defs/ChildSectionFields"},{"name":"ClaudeSettingsManaged","kind":"model","schemaRef":"#/$defs/ClaudeSettingsManaged"},{"name":"ClaudeSettingsPermissions","kind":"model","schemaRef":"#/$defs/ClaudeSettingsPermissions"},{"name":"ClaudeSettingsSource","kind":"enum","schemaRef":"#/$defs/ClaudeSettingsSource","enumValues":[{"name":"user","value":"user"},{"name":"project","value":"project"},{"name":"local","value":"local"}]},{"name":"ClipboardDataType","kind":"enum","schemaRef":"#/$defs/ClipboardDataType","enumValues":[{"name":"Sections","value":"Sections"}]},{"name":"ClipboardProjectStateCore","kind":"model","schemaRef":"#/$defs/ClipboardProjectStateCore"},{"name":"ClipboardProjectStateCoreWithSectionVariantMap","kind":"model","schemaRef":"#/$defs/ClipboardProjectStateCoreWithSectionVariantMap"},{"name":"CodeCallableCodeObjImpl","kind":"model","schemaRef":"#/$defs/CodeCallableCodeObjImpl"},{"name":"CodeFileAccessMode","kind":"enum","schemaRef":"#/$defs/CodeFileAccessMode","enumValues":[{"name":"read_write","value":"read_write"},{"name":"read_only","value":"read_only"},{"name":"write_only","value":"write_only"}]},{"name":"CodeFileBinding","kind":"model","schemaRef":"#/$defs/CodeFileBinding"},{"name":"CodeLanguage","kind":"enum","schemaRef":"#/$defs/CodeLanguage","enumValues":[{"name":"python","value":"python"},{"name":"bash","value":"bash"},{"name":"javascript","value":"javascript"},{"name":"typescript","value":"typescript"},{"name":"json","value":"json"},{"name":"yaml","value":"yaml"},{"name":"toml","value":"toml"},{"name":"markdown","value":"markdown"},{"name":"plaintext","value":"plaintext"}]},{"name":"CodeMirrorCompletion","kind":"model","schemaRef":"#/$defs/CodeMirrorCompletion"},{"name":"CodeObjType","kind":"enum","schemaRef":"#/$defs/CodeObjType","enumValues":[{"name":"CodeCallable","value":"CodeCallable"},{"name":"CodeParam","value":"CodeParam"},{"name":"TextParam","value":"TextParam"},{"name":"DateParam","value":"DateParam"},{"name":"TimeParam","value":"TimeParam"},{"name":"ButtonParam","value":"ButtonParam"},{"name":"SliderParam","value":"SliderParam"},{"name":"RotaryParam","value":"RotaryParam"},{"name":"SwitchParam","value":"SwitchParam"},{"name":"ColorPickerParam","value":"ColorPickerParam"},{"name":"DropdownParam","value":"DropdownParam"},{"name":"PasswordParam","value":"PasswordParam"},{"name":"TextAreaParam","value":"TextAreaParam"},{"name":"DropzoneParam","value":"DropzoneParam"},{"name":"NestedParam","value":"NestedParam"}]},{"name":"CodeObjTypeValuePolicy","kind":"model","schemaRef":"#/$defs/CodeObjTypeValuePolicy"},{"name":"CodeObjValueOverride","kind":"model","schemaRef":"#/$defs/CodeObjValueOverride"},{"name":"CodeObjValuePolicy","kind":"model","schemaRef":"#/$defs/CodeObjValuePolicy"},{"name":"CodeObjValueRepresentationMode","kind":"enum","schemaRef":"#/$defs/CodeObjValueRepresentationMode","enumValues":[{"name":"expression","value":"expression"},{"name":"json_parsed","value":"json_parsed"},{"name":"string","value":"string"},{"name":"file_path","value":"file_path"},{"name":"file_read","value":"file_read"}]},{"name":"CodeObject","kind":"model","schemaRef":"#/$defs/CodeObject"},{"name":"CodeObjectImpl","kind":"model","schemaRef":"#/$defs/CodeObjectImpl"},{"name":"CodeObjectVariant","kind":"model","schemaRef":"#/$defs/CodeObjectVariant"},{"name":"CodeParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/CodeParamCodeObjImpl"},{"name":"CodeSectionDiagnosticsIgnoreState","kind":"model","schemaRef":"#/$defs/CodeSectionDiagnosticsIgnoreState"},{"name":"CodeSectionImpl","kind":"model","schemaRef":"#/$defs/CodeSectionImpl"},{"name":"ColorPickerChoice","kind":"model","schemaRef":"#/$defs/ColorPickerChoice"},{"name":"ColorPickerParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/ColorPickerParamCodeObjImpl"},{"name":"CompareAndSetMutationResult","kind":"model","schemaRef":"#/$defs/CompareAndSetMutationResult"},{"name":"CompareAndSetStringResult","kind":"model","schemaRef":"#/$defs/CompareAndSetStringResult"},{"name":"ConfigLanguage","kind":"enum","schemaRef":"#/$defs/ConfigLanguage","enumValues":[{"name":"python","value":"python"},{"name":"json","value":"json"}]},{"name":"Connection","kind":"model","schemaRef":"#/$defs/Connection"},{"name":"ConnectionType","kind":"enum","schemaRef":"#/$defs/ConnectionType","enumValues":[{"name":"frontend","value":"frontend"},{"name":"listener","value":"listener"},{"name":"SERVER","value":"SERVER"},{"name":"terminal","value":"terminal"}]},{"name":"Constants","kind":"model","schemaRef":"#/$defs/Constants"},{"name":"ContentRef","kind":"model","schemaRef":"#/$defs/ContentRef"},{"name":"Core","kind":"model","schemaRef":"#/$defs/Core"},{"name":"CreateChatRequest","kind":"model","schemaRef":"#/$defs/CreateChatRequest"},{"name":"CreateChildSectionsInput","kind":"model","schemaRef":"#/$defs/CreateChildSectionsInput"},{"name":"CreateChildSectionsResult","kind":"model","schemaRef":"#/$defs/CreateChildSectionsResult"},{"name":"CreateChildSectionsViaIncrementerInput","kind":"model","schemaRef":"#/$defs/CreateChildSectionsViaIncrementerInput"},{"name":"CreateNewSectionVariantInput","kind":"model","schemaRef":"#/$defs/CreateNewSectionVariantInput"},{"name":"CreateNewSectionVariantResult","kind":"model","schemaRef":"#/$defs/CreateNewSectionVariantResult"},{"name":"CreateTopLevelSectionInput","kind":"model","schemaRef":"#/$defs/CreateTopLevelSectionInput"},{"name":"CreateTopLevelSectionResult","kind":"model","schemaRef":"#/$defs/CreateTopLevelSectionResult"},{"name":"CurrentAddressUpdateMessage","kind":"model","schemaRef":"#/$defs/CurrentAddressUpdateMessage"},{"name":"DateCalendarWeekStart","kind":"enum","schemaRef":"#/$defs/DateCalendarWeekStart","enumValues":[{"name":"sunday","value":"sunday"},{"name":"monday","value":"monday"}]},{"name":"DateControlMode","kind":"enum","schemaRef":"#/$defs/DateControlMode","enumValues":[{"name":"input","value":"input"},{"name":"calendar","value":"calendar"}]},{"name":"DateDisplayFormat","kind":"enum","schemaRef":"#/$defs/DateDisplayFormat","enumValues":[{"name":"iso","value":"iso"},{"name":"us","value":"us"},{"name":"eu","value":"eu"},{"name":"long","value":"long"}]},{"name":"DateParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/DateParamCodeObjImpl"},{"name":"DateSelectionMode","kind":"enum","schemaRef":"#/$defs/DateSelectionMode","enumValues":[{"name":"single","value":"single"},{"name":"multiple","value":"multiple"}]},{"name":"DeleteChatRequest","kind":"model","schemaRef":"#/$defs/DeleteChatRequest"},{"name":"DeleteChildSectionsViaDecrementerInput","kind":"model","schemaRef":"#/$defs/DeleteChildSectionsViaDecrementerInput"},{"name":"DeleteKwargResult","kind":"model","schemaRef":"#/$defs/DeleteKwargResult"},{"name":"DeleteRequest","kind":"model","schemaRef":"#/$defs/DeleteRequest"},{"name":"DeleteRequestItem","kind":"model","schemaRef":"#/$defs/DeleteRequestItem"},{"name":"DeleteSectionsInput","kind":"model","schemaRef":"#/$defs/DeleteSectionsInput"},{"name":"DeleteSectionsResult","kind":"model","schemaRef":"#/$defs/DeleteSectionsResult"},{"name":"DeleteSelectedParamsInput","kind":"model","schemaRef":"#/$defs/DeleteSelectedParamsInput"},{"name":"DeleteSelectedParamsResult","kind":"model","schemaRef":"#/$defs/DeleteSelectedParamsResult"},{"name":"DependencyEvent","kind":"model","schemaRef":"#/$defs/DependencyEvent"},{"name":"DependencyKeyType","kind":"enum","schemaRef":"#/$defs/DependencyKeyType","enumValues":[{"name":"Section","value":"Section"},{"name":"SectionParam","value":"SectionParam"}]},{"name":"DependencyValueType","kind":"enum","schemaRef":"#/$defs/DependencyValueType","enumValues":[{"name":"Literal","value":"Literal"},{"name":"Binary","value":"Binary"},{"name":"FileRead","value":"FileRead"}]},{"name":"DetachedRun","kind":"model","schemaRef":"#/$defs/DetachedRun"},{"name":"DetachedStatus","kind":"enum","schemaRef":"#/$defs/DetachedStatus","enumValues":[{"name":"queued","value":"queued"},{"name":"running","value":"running"},{"name":"exited","value":"exited"},{"name":"failed","value":"failed"},{"name":"canceled","value":"canceled"},{"name":"lost","value":"lost"}]},{"name":"DictSectionImpl","kind":"model","schemaRef":"#/$defs/DictSectionImpl"},{"name":"Document","kind":"alias","schemaRef":"#/$defs/Document"},{"name":"DrawAreaBrushShape","kind":"enum","schemaRef":"#/$defs/DrawAreaBrushShape","enumValues":[{"name":"butt","value":"butt"},{"name":"round","value":"round"},{"name":"square","value":"square"}]},{"name":"DrawAreaLayer","kind":"model","schemaRef":"#/$defs/DrawAreaLayer"},{"name":"DrawAreaLayerItem","kind":"model","schemaRef":"#/$defs/DrawAreaLayerItem"},{"name":"DrawAreaLayerItemTransform","kind":"model","schemaRef":"#/$defs/DrawAreaLayerItemTransform"},{"name":"DrawAreaLayerItemTransformArtifact","kind":"model","schemaRef":"#/$defs/DrawAreaLayerItemTransformArtifact"},{"name":"DrawAreaLayerItemType","kind":"enum","schemaRef":"#/$defs/DrawAreaLayerItemType","enumValues":[{"name":"Image","value":"Image"},{"name":"BrushStroke","value":"BrushStroke"}]},{"name":"DrawAreaMode","kind":"enum","schemaRef":"#/$defs/DrawAreaMode","enumValues":[{"name":"draw","value":"draw"},{"name":"erase","value":"erase"},{"name":"edit","value":"edit"}]},{"name":"DrawAreaTransform","kind":"alias","schemaRef":"#/$defs/DrawAreaTransform"},{"name":"DrawSectionImpl","kind":"model","schemaRef":"#/$defs/DrawSectionImpl"},{"name":"DropdownParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/DropdownParamCodeObjImpl"},{"name":"DropzoneMode","kind":"enum","schemaRef":"#/$defs/DropzoneMode","enumValues":[{"name":"STATEFUL","value":"STATEFUL"},{"name":"STATELESS","value":"STATELESS"}]},{"name":"DropzoneParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/DropzoneParamCodeObjImpl"},{"name":"Edge","kind":"model","schemaRef":"#/$defs/Edge"},{"name":"EdgePort","kind":"model","schemaRef":"#/$defs/EdgePort"},{"name":"EmitStreamDeltaRequest","kind":"model","schemaRef":"#/$defs/EmitStreamDeltaRequest"},{"name":"EndpointOrigin","kind":"enum","schemaRef":"#/$defs/EndpointOrigin","enumValues":[{"name":"backend","value":"backend"},{"name":"launcher","value":"launcher"},{"name":"BackendOrigin","value":"backend-origin"}]},{"name":"EndpointOriginPolicy","kind":"alias","schemaRef":"#/$defs/EndpointOriginPolicy"},{"name":"EngineConfig","kind":"model","schemaRef":"#/$defs/EngineConfig"},{"name":"EngineConfigDefaults","kind":"model","schemaRef":"#/$defs/EngineConfigDefaults"},{"name":"EngineConfigsUpdatedContent","kind":"model","schemaRef":"#/$defs/EngineConfigsUpdatedContent"},{"name":"EngineConfigsUpdatedMessage","kind":"model","schemaRef":"#/$defs/EngineConfigsUpdatedMessage"},{"name":"EngineRuntimeSupport","kind":"model","schemaRef":"#/$defs/EngineRuntimeSupport"},{"name":"EngineType","kind":"enum","schemaRef":"#/$defs/EngineType","enumValues":[{"name":"setta_llm","value":"setta_llm"},{"name":"external_agent","value":"external_agent"}]},{"name":"EnvVarStatus","kind":"model","schemaRef":"#/$defs/EnvVarStatus"},{"name":"ErrorKind","kind":"enum","schemaRef":"#/$defs/ErrorKind","enumValues":[{"name":"invalid_request","value":"invalid_request"},{"name":"path_forbidden","value":"path_forbidden"},{"name":"path_not_found","value":"path_not_found"},{"name":"path_not_file","value":"path_not_file"},{"name":"binary_payload_invalid","value":"binary_payload_invalid"},{"name":"binary_payload_not_found","value":"binary_payload_not_found"},{"name":"artifact_type_unsupported","value":"artifact_type_unsupported"},{"name":"policy_denied","value":"policy_denied"},{"name":"too_large","value":"too_large"},{"name":"mime_not_allowed","value":"mime_not_allowed"}]},{"name":"ExternalAgentApprovalPolicyOption","kind":"model","schemaRef":"#/$defs/ExternalAgentApprovalPolicyOption"},{"name":"ExternalAgentConfig","kind":"model","schemaRef":"#/$defs/ExternalAgentConfig"},{"name":"ExternalAgentConfigsUpdatedContent","kind":"model","schemaRef":"#/$defs/ExternalAgentConfigsUpdatedContent"},{"name":"ExternalAgentConfigsUpdatedMessage","kind":"model","schemaRef":"#/$defs/ExternalAgentConfigsUpdatedMessage"},{"name":"ExternalAgentStatus","kind":"model","schemaRef":"#/$defs/ExternalAgentStatus"},{"name":"ExternalAgentUIConfigValue","kind":"model","schemaRef":"#/$defs/ExternalAgentUIConfigValue"},{"name":"FileArtifact","kind":"model","schemaRef":"#/$defs/FileArtifact"},{"name":"FileBrowserTransportRoutes","kind":"model","schemaRef":"#/$defs/FileBrowserTransportRoutes"},{"name":"FileReadDependencyValue","kind":"model","schemaRef":"#/$defs/FileReadDependencyValue"},{"name":"Format","kind":"enum","schemaRef":"#/$defs/Format","enumValues":[{"name":"Jinja","value":"Jinja"}]},{"name":"GenPythonCodeSectionImpl","kind":"model","schemaRef":"#/$defs/GenPythonCodeSectionImpl"},{"name":"GenPythonMetadataSectionImpl","kind":"model","schemaRef":"#/$defs/GenPythonMetadataSectionImpl"},{"name":"GeneratedSectionImpl","kind":"model","schemaRef":"#/$defs/GeneratedSectionImpl"},{"name":"GeneratedSectionKind","kind":"enum","schemaRef":"#/$defs/GeneratedSectionKind","enumValues":[{"name":"python_code","value":"python_code"},{"name":"python_metadata","value":"python_metadata"},{"name":"plugin","value":"plugin"}]},{"name":"GetAllMetadataRequest","kind":"model","schemaRef":"#/$defs/GetAllMetadataRequest"},{"name":"GetChatRequest","kind":"model","schemaRef":"#/$defs/GetChatRequest"},{"name":"GlobalVariablesSectionImpl","kind":"model","schemaRef":"#/$defs/GlobalVariablesSectionImpl"},{"name":"GroupSectionImpl","kind":"model","schemaRef":"#/$defs/GroupSectionImpl"},{"name":"GroupSectionsInput","kind":"model","schemaRef":"#/$defs/GroupSectionsInput"},{"name":"HTTPRequestMethod","kind":"enum","schemaRef":"#/$defs/HTTPRequestMethod","enumValues":[{"name":"GET","value":"GET"},{"name":"POST","value":"POST"},{"name":"PUT","value":"PUT"},{"name":"PATCH","value":"PATCH"},{"name":"DELETE","value":"DELETE"},{"name":"HEAD","value":"HEAD"},{"name":"OPTIONS","value":"OPTIONS"}]},{"name":"IFrameSectionImpl","kind":"model","schemaRef":"#/$defs/IFrameSectionImpl"},{"name":"IdentityContent","kind":"model","schemaRef":"#/$defs/IdentityContent"},{"name":"IdentityMessage","kind":"model","schemaRef":"#/$defs/IdentityMessage"},{"name":"ImageArtifact","kind":"model","schemaRef":"#/$defs/ImageArtifact"},{"name":"ImportFilesRequest","kind":"model","schemaRef":"#/$defs/ImportFilesRequest"},{"name":"ImportFilesResponseItem","kind":"model","schemaRef":"#/$defs/ImportFilesResponseItem"},{"name":"IndentParamsInput","kind":"model","schemaRef":"#/$defs/IndentParamsInput"},{"name":"JSONArtifact","kind":"model","schemaRef":"#/$defs/JSONArtifact"},{"name":"LLMAPIKeysUpdatedMessage","kind":"model","schemaRef":"#/$defs/LLMAPIKeysUpdatedMessage"},{"name":"LLMConfig","kind":"model","schemaRef":"#/$defs/LLMConfig"},{"name":"LLMConfigUpdatedMessage","kind":"model","schemaRef":"#/$defs/LLMConfigUpdatedMessage"},{"name":"LLMStreamingResponseChunk","kind":"model","schemaRef":"#/$defs/LLMStreamingResponseChunk"},{"name":"LLMStreamingResponseContent","kind":"model","schemaRef":"#/$defs/LLMStreamingResponseContent"},{"name":"LLMStreamingResponseMessage","kind":"model","schemaRef":"#/$defs/LLMStreamingResponseMessage"},{"name":"LSPDiagnostic","kind":"model","schemaRef":"#/$defs/LSPDiagnostic"},{"name":"LSPDiagnosticPosition","kind":"model","schemaRef":"#/$defs/LSPDiagnosticPosition"},{"name":"LSPDiagnosticRange","kind":"model","schemaRef":"#/$defs/LSPDiagnosticRange"},{"name":"LSPDiagnosticsMessage","kind":"model","schemaRef":"#/$defs/LSPDiagnosticsMessage"},{"name":"LSPDiagnosticsPayload","kind":"model","schemaRef":"#/$defs/LSPDiagnosticsPayload"},{"name":"LanguageServerProviderOption","kind":"model","schemaRef":"#/$defs/LanguageServerProviderOption"},{"name":"LanguageServerSelectionSeverity","kind":"enum","schemaRef":"#/$defs/LanguageServerSelectionSeverity","enumValues":[{"name":"default","value":"default"},{"name":"warning","value":"warning"},{"name":"success","value":"success"}]},{"name":"LanguageServerSelectionState","kind":"enum","schemaRef":"#/$defs/LanguageServerSelectionState","enumValues":[{"name":"unset","value":"unset"},{"name":"disabled","value":"disabled"},{"name":"selected","value":"selected"}]},{"name":"LanguageServerSelectionStatus","kind":"model","schemaRef":"#/$defs/LanguageServerSelectionStatus"},{"name":"LanguageServerSelectionStatusKind","kind":"enum","schemaRef":"#/$defs/LanguageServerSelectionStatusKind","enumValues":[{"name":"unselected","value":"unselected"},{"name":"disabled","value":"disabled"},{"name":"no_available_providers","value":"no_available_providers"},{"name":"selected_unavailable","value":"selected_unavailable"},{"name":"selected_incompatible","value":"selected_incompatible"},{"name":"pending_restart","value":"pending_restart"},{"name":"active","value":"active"}]},{"name":"LauncherManagementTransportRoutes","kind":"model","schemaRef":"#/$defs/LauncherManagementTransportRoutes"},{"name":"LineChartSettings","kind":"model","schemaRef":"#/$defs/LineChartSettings"},{"name":"ListRootSectionImpl","kind":"model","schemaRef":"#/$defs/ListRootSectionImpl"},{"name":"ListRootViewMode","kind":"enum","schemaRef":"#/$defs/ListRootViewMode","enumValues":[{"name":"default","value":"default"},{"name":"task_list","value":"task_list"},{"name":"kanban","value":"kanban"}]},{"name":"ListRootViewModeOption","kind":"model","schemaRef":"#/$defs/ListRootViewModeOption"},{"name":"ListenerConfig","kind":"model","schemaRef":"#/$defs/ListenerConfig"},{"name":"ListenerCoverageDependency","kind":"model","schemaRef":"#/$defs/ListenerCoverageDependency"},{"name":"ListenerCoverageSnapshot","kind":"model","schemaRef":"#/$defs/ListenerCoverageSnapshot"},{"name":"ListenerCoverageSnapshotMessage","kind":"model","schemaRef":"#/$defs/ListenerCoverageSnapshotMessage"},{"name":"ListenerDependencyCatalog","kind":"model","schemaRef":"#/$defs/ListenerDependencyCatalog"},{"name":"ListenerDependencyCatalogEntry","kind":"model","schemaRef":"#/$defs/ListenerDependencyCatalogEntry"},{"name":"ListenerDependencyEvent","kind":"model","schemaRef":"#/$defs/ListenerDependencyEvent"},{"name":"ListenerDependencyEventContent","kind":"model","schemaRef":"#/$defs/ListenerDependencyEventContent"},{"name":"ListenerDependencyEventEntry","kind":"model","schemaRef":"#/$defs/ListenerDependencyEventEntry"},{"name":"ListenerDependencyEventMessage","kind":"model","schemaRef":"#/$defs/ListenerDependencyEventMessage"},{"name":"ListenerDependencyMode","kind":"enum","schemaRef":"#/$defs/ListenerDependencyMode","enumValues":[{"name":"always","value":"always"},{"name":"realtime_only","value":"realtime_only"},{"name":"refresh_only","value":"refresh_only"}]},{"name":"ListenerErrorContent","kind":"model","schemaRef":"#/$defs/ListenerErrorContent"},{"name":"ListenerErrorEvent","kind":"model","schemaRef":"#/$defs/ListenerErrorEvent"},{"name":"ListenerErrorMessage","kind":"model","schemaRef":"#/$defs/ListenerErrorMessage"},{"name":"ListenerForceRefreshContent","kind":"model","schemaRef":"#/$defs/ListenerForceRefreshContent"},{"name":"ListenerForceRefreshEvent","kind":"model","schemaRef":"#/$defs/ListenerForceRefreshEvent"},{"name":"ListenerForceRefreshMessage","kind":"model","schemaRef":"#/$defs/ListenerForceRefreshMessage"},{"name":"ListenerFrontendEmitContent","kind":"model","schemaRef":"#/$defs/ListenerFrontendEmitContent"},{"name":"ListenerFrontendEmitMessage","kind":"model","schemaRef":"#/$defs/ListenerFrontendEmitMessage"},{"name":"ListenerFrontendEmitRequest","kind":"model","schemaRef":"#/$defs/ListenerFrontendEmitRequest"},{"name":"ListenerInitContent","kind":"model","schemaRef":"#/$defs/ListenerInitContent"},{"name":"ListenerInitMessage","kind":"model","schemaRef":"#/$defs/ListenerInitMessage"},{"name":"ListenerInitRequest","kind":"model","schemaRef":"#/$defs/ListenerInitRequest"},{"name":"ListenerMessageType","kind":"enum","schemaRef":"#/$defs/ListenerMessageType","enumValues":[{"name":"ListenerInit","value":"ListenerInit"},{"name":"ListenerRegister","value":"ListenerRegister"},{"name":"ListenerRegisterAck","value":"ListenerRegisterAck"},{"name":"ListenerFrontendEmit","value":"ListenerFrontendEmit"},{"name":"ListenerRouterEndpointCall","value":"ListenerRouterEndpointCall"},{"name":"ListenerRouterEndpointResult","value":"ListenerRouterEndpointResult"},{"name":"ListenerRealtimeEvent","value":"ListenerRealtimeEvent"},{"name":"ListenerDependencyEvent","value":"ListenerDependencyEvent"},{"name":"ListenerForceRefresh","value":"ListenerForceRefresh"},{"name":"ListenerError","value":"ListenerError"}]},{"name":"ListenerRealtimeDelta","kind":"model","schemaRef":"#/$defs/ListenerRealtimeDelta"},{"name":"ListenerRealtimeEvent","kind":"model","schemaRef":"#/$defs/ListenerRealtimeEvent"},{"name":"ListenerRealtimeEventContent","kind":"model","schemaRef":"#/$defs/ListenerRealtimeEventContent"},{"name":"ListenerRealtimeEventMessage","kind":"model","schemaRef":"#/$defs/ListenerRealtimeEventMessage"},{"name":"ListenerRegisterAckContent","kind":"model","schemaRef":"#/$defs/ListenerRegisterAckContent"},{"name":"ListenerRegisterAckEvent","kind":"model","schemaRef":"#/$defs/ListenerRegisterAckEvent"},{"name":"ListenerRegisterAckMessage","kind":"model","schemaRef":"#/$defs/ListenerRegisterAckMessage"},{"name":"ListenerRegisterAckStatus","kind":"model","schemaRef":"#/$defs/ListenerRegisterAckStatus"},{"name":"ListenerRegisterCallbackSpec","kind":"model","schemaRef":"#/$defs/ListenerRegisterCallbackSpec"},{"name":"ListenerRegisterContent","kind":"model","schemaRef":"#/$defs/ListenerRegisterContent"},{"name":"ListenerRegisterMessage","kind":"model","schemaRef":"#/$defs/ListenerRegisterMessage"},{"name":"ListenerRegisterRequest","kind":"model","schemaRef":"#/$defs/ListenerRegisterRequest"},{"name":"ListenerRenderedDependencyValue","kind":"model","schemaRef":"#/$defs/ListenerRenderedDependencyValue"},{"name":"ListenerRenderedDependencyValues","kind":"model","schemaRef":"#/$defs/ListenerRenderedDependencyValues"},{"name":"ListenerRouterEndpointCall","kind":"model","schemaRef":"#/$defs/ListenerRouterEndpointCall"},{"name":"ListenerRouterEndpointCallContent","kind":"model","schemaRef":"#/$defs/ListenerRouterEndpointCallContent"},{"name":"ListenerRouterEndpointCallMessage","kind":"model","schemaRef":"#/$defs/ListenerRouterEndpointCallMessage"},{"name":"ListenerRouterEndpointResult","kind":"model","schemaRef":"#/$defs/ListenerRouterEndpointResult"},{"name":"ListenerRouterEndpointResultContent","kind":"model","schemaRef":"#/$defs/ListenerRouterEndpointResultContent"},{"name":"ListenerRouterEndpointResultMessage","kind":"model","schemaRef":"#/$defs/ListenerRouterEndpointResultMessage"},{"name":"ListenerSnapshot","kind":"model","schemaRef":"#/$defs/ListenerSnapshot"},{"name":"LiteralDependencyValue","kind":"model","schemaRef":"#/$defs/LiteralDependencyValue"},{"name":"LoadCachedPathsRequest","kind":"model","schemaRef":"#/$defs/LoadCachedPathsRequest"},{"name":"LocalCoreCommandEnvelope","kind":"model","schemaRef":"#/$defs/LocalCoreCommandEnvelope"},{"name":"LocalCoreListenerRealtimeDelta","kind":"model","schemaRef":"#/$defs/LocalCoreListenerRealtimeDelta"},{"name":"LocalCoreRenderRealtimeDependencyValuesRequest","kind":"model","schemaRef":"#/$defs/LocalCoreRenderRealtimeDependencyValuesRequest"},{"name":"LocalCoreRenderRealtimeDependencyValuesResult","kind":"model","schemaRef":"#/$defs/LocalCoreRenderRealtimeDependencyValuesResult"},{"name":"LocalCoreResultEnvelope","kind":"model","schemaRef":"#/$defs/LocalCoreResultEnvelope"},{"name":"LocalCoreVersionHandshake","kind":"model","schemaRef":"#/$defs/LocalCoreVersionHandshake"},{"name":"LocalHostnamePolicy","kind":"model","schemaRef":"#/$defs/LocalHostnamePolicy"},{"name":"Location","kind":"model","schemaRef":"#/$defs/Location"},{"name":"ManagedAPIKeysSnapshot","kind":"model","schemaRef":"#/$defs/ManagedAPIKeysSnapshot"},{"name":"ManagedAPIKeysWriteStatus","kind":"enum","schemaRef":"#/$defs/ManagedAPIKeysWriteStatus","enumValues":[{"name":"success","value":"success"},{"name":"revision_conflict","value":"revision_conflict"},{"name":"corrupt_store","value":"corrupt_store"},{"name":"store_unavailable","value":"store_unavailable"}]},{"name":"Manifest","kind":"model","schemaRef":"#/$defs/Manifest"},{"name":"MessageContent","kind":"model","schemaRef":"#/$defs/MessageContent"},{"name":"MessageContentDelta","kind":"model","schemaRef":"#/$defs/MessageContentDelta"},{"name":"MessageDeltaEvent","kind":"model","schemaRef":"#/$defs/MessageDeltaEvent"},{"name":"MessageFinalizedEvent","kind":"model","schemaRef":"#/$defs/MessageFinalizedEvent"},{"name":"MessageImageURL","kind":"model","schemaRef":"#/$defs/MessageImageURL"},{"name":"MessageImageURLContent","kind":"model","schemaRef":"#/$defs/MessageImageURLContent"},{"name":"MessageStartEvent","kind":"model","schemaRef":"#/$defs/MessageStartEvent"},{"name":"MessageStopEvent","kind":"model","schemaRef":"#/$defs/MessageStopEvent"},{"name":"MessageTextContent","kind":"model","schemaRef":"#/$defs/MessageTextContent"},{"name":"MessageTextDelta","kind":"model","schemaRef":"#/$defs/MessageTextDelta"},{"name":"MessageThinkingContent","kind":"model","schemaRef":"#/$defs/MessageThinkingContent"},{"name":"MessageThinkingDelta","kind":"model","schemaRef":"#/$defs/MessageThinkingDelta"},{"name":"MessageType","kind":"enum","schemaRef":"#/$defs/MessageType","enumValues":[{"name":"CurrentAddressUpdate","value":"CurrentAddressUpdate"},{"name":"UISettingRevealResult","value":"UISettingRevealResult"},{"name":"RealtimeUIChange","value":"RealtimeUIChange"},{"name":"RealtimeDependencyEvent","value":"RealtimeDependencyEvent"}]},{"name":"MetaControlSectionImpl","kind":"model","schemaRef":"#/$defs/MetaControlSectionImpl"},{"name":"MetaControlSizeMode","kind":"enum","schemaRef":"#/$defs/MetaControlSizeMode","enumValues":[{"name":"any","value":"any"},{"name":"auto_only","value":"auto_only"},{"name":"manual_only","value":"manual_only"}]},{"name":"MetaControlSizingPolicyByType","kind":"model","schemaRef":"#/$defs/MetaControlSizingPolicyByType"},{"name":"MetaControlSizingPolicyTypeEntry","kind":"model","schemaRef":"#/$defs/MetaControlSizingPolicyTypeEntry"},{"name":"Metadata","kind":"model","schemaRef":"#/$defs/Metadata"},{"name":"Mode","kind":"enum","schemaRef":"#/$defs/Mode","enumValues":[{"name":"ide","value":"ide"},{"name":"share","value":"share"},{"name":"app","value":"app"},{"name":"launcher","value":"launcher"}]},{"name":"ModeScopedLauncherRoutes","kind":"alias","schemaRef":"#/$defs/ModeScopedLauncherRoutes"},{"name":"MoveParamGroupInput","kind":"model","schemaRef":"#/$defs/MoveParamGroupInput"},{"name":"MoveParamGroupsInput","kind":"model","schemaRef":"#/$defs/MoveParamGroupsInput"},{"name":"MoveParamsInput","kind":"model","schemaRef":"#/$defs/MoveParamsInput"},{"name":"MoveSectionsInput","kind":"model","schemaRef":"#/$defs/MoveSectionsInput"},{"name":"MutationResult","kind":"model","schemaRef":"#/$defs/MutationResult"},{"name":"NameValidationContract","kind":"model","schemaRef":"#/$defs/NameValidationContract"},{"name":"NameValidationErrors","kind":"model","schemaRef":"#/$defs/NameValidationErrors"},{"name":"NameValidationErrorsMessage","kind":"model","schemaRef":"#/$defs/NameValidationErrorsMessage"},{"name":"NestedParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/NestedParamCodeObjImpl"},{"name":"NormalizedFloatingWindowBounds","kind":"model","schemaRef":"#/$defs/NormalizedFloatingWindowBounds"},{"name":"NotificationContent","kind":"model","schemaRef":"#/$defs/NotificationContent"},{"name":"NotificationMessage","kind":"model","schemaRef":"#/$defs/NotificationMessage"},{"name":"NotificationType","kind":"enum","schemaRef":"#/$defs/NotificationType","enumValues":[{"name":"error","value":"error"},{"name":"warning","value":"warning"},{"name":"info","value":"info"},{"name":"save","value":"save"}]},{"name":"OpenAIRealtimeTranscriptionStreamMode","kind":"alias","schemaRef":"#/$defs/OpenAIRealtimeTranscriptionStreamMode"},{"name":"OverviewTabName","kind":"enum","schemaRef":"#/$defs/OverviewTabName","enumValues":[{"name":"Overview","value":"Overview"},{"name":"Plugins","value":"Plugins"},{"name":"FileBrowser","value":"FileBrowser"},{"name":"Git","value":"Git"},{"name":"App","value":"App"},{"name":"RunInstructions","value":"RunInstructions"},{"name":"ViewModes","value":"ViewModes"},{"name":"Notifications","value":"Notifications"},{"name":"ProjectAIChat","value":"ProjectAIChat"},{"name":"ProjectAISettings","value":"ProjectAISettings"}]},{"name":"OverviewTabNamesValue","kind":"model","schemaRef":"#/$defs/OverviewTabNamesValue"},{"name":"OverviewTabTitlesValue","kind":"model","schemaRef":"#/$defs/OverviewTabTitlesValue"},{"name":"OverviewTabUIConfigValue","kind":"model","schemaRef":"#/$defs/OverviewTabUIConfigValue"},{"name":"PanOnScrollMode","kind":"enum","schemaRef":"#/$defs/PanOnScrollMode","enumValues":[{"name":"free","value":"free"},{"name":"vertical","value":"vertical"},{"name":"horizontal","value":"horizontal"}]},{"name":"ParamCodeObjFields","kind":"model","schemaRef":"#/$defs/ParamCodeObjFields"},{"name":"ParamNameType","kind":"enum","schemaRef":"#/$defs/ParamNameType","enumValues":[{"name":"CODE","value":"CODE"},{"name":"TEXT","value":"TEXT"}]},{"name":"ParameterPassingStyle","kind":"enum","schemaRef":"#/$defs/ParameterPassingStyle","enumValues":[{"name":"DEFAULT","value":"DEFAULT"},{"name":"ARGS","value":"ARGS"},{"name":"KWARGS","value":"KWARGS"},{"name":"POSITIONAL_ONLY","value":"POSITIONAL_ONLY"},{"name":"KEYWORD_ONLY","value":"KEYWORD_ONLY"}]},{"name":"PasswordParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/PasswordParamCodeObjImpl"},{"name":"PasteSectionsInput","kind":"model","schemaRef":"#/$defs/PasteSectionsInput"},{"name":"PatchPolicy","kind":"model","schemaRef":"#/$defs/PatchPolicy"},{"name":"PluginAppSubsystemCapabilities","kind":"model","schemaRef":"#/$defs/PluginAppSubsystemCapabilities"},{"name":"PluginAppSubsystemFeatureManifest","kind":"model","schemaRef":"#/$defs/PluginAppSubsystemFeatureManifest"},{"name":"PluginAppSubsystemProviderSelection","kind":"model","schemaRef":"#/$defs/PluginAppSubsystemProviderSelection"},{"name":"PluginAppSubsystemProviderSelectionStatusKind","kind":"enum","schemaRef":"#/$defs/PluginAppSubsystemProviderSelectionStatusKind","enumValues":[{"name":"no_provider","value":"no_provider"},{"name":"disabled_provider","value":"disabled_provider"},{"name":"invalid_provider","value":"invalid_provider"},{"name":"active","value":"active"},{"name":"provider_conflict","value":"provider_conflict"}]},{"name":"PluginBackendManifest","kind":"model","schemaRef":"#/$defs/PluginBackendManifest"},{"name":"PluginBlockedCapability","kind":"model","schemaRef":"#/$defs/PluginBlockedCapability"},{"name":"PluginBlockedCapabilityReason","kind":"enum","schemaRef":"#/$defs/PluginBlockedCapabilityReason","enumValues":[{"name":"mode_policy","value":"mode_policy"},{"name":"host_policy","value":"host_policy"},{"name":"manifest_invalid","value":"manifest_invalid"}]},{"name":"PluginConfigDescriptor","kind":"model","schemaRef":"#/$defs/PluginConfigDescriptor"},{"name":"PluginConfigValidationResult","kind":"model","schemaRef":"#/$defs/PluginConfigValidationResult"},{"name":"PluginConfigWriteResponse","kind":"model","schemaRef":"#/$defs/PluginConfigWriteResponse"},{"name":"PluginContentDescriptor","kind":"model","schemaRef":"#/$defs/PluginContentDescriptor"},{"name":"PluginContentManifest","kind":"model","schemaRef":"#/$defs/PluginContentManifest"},{"name":"PluginEnableDisableResponse","kind":"model","schemaRef":"#/$defs/PluginEnableDisableResponse"},{"name":"PluginEnablementSource","kind":"enum","schemaRef":"#/$defs/PluginEnablementSource","enumValues":[{"name":"workspace_disabled","value":"workspace_disabled"},{"name":"workspace_enabled","value":"workspace_enabled"},{"name":"global_auto_enabled","value":"global_auto_enabled"},{"name":"manifest_default","value":"manifest_default"}]},{"name":"PluginErrorInfo","kind":"model","schemaRef":"#/$defs/PluginErrorInfo"},{"name":"PluginFeatureCapabilities","kind":"model","schemaRef":"#/$defs/PluginFeatureCapabilities"},{"name":"PluginFeatureCapabilitiesManifest","kind":"model","schemaRef":"#/$defs/PluginFeatureCapabilitiesManifest"},{"name":"PluginFrontendDescriptor","kind":"model","schemaRef":"#/$defs/PluginFrontendDescriptor"},{"name":"PluginFrontendManifest","kind":"model","schemaRef":"#/$defs/PluginFrontendManifest"},{"name":"PluginInstallHistoryEntry","kind":"model","schemaRef":"#/$defs/PluginInstallHistoryEntry"},{"name":"PluginInstallMetadataEntry","kind":"model","schemaRef":"#/$defs/PluginInstallMetadataEntry"},{"name":"PluginInstallMetadataFile","kind":"model","schemaRef":"#/$defs/PluginInstallMetadataFile"},{"name":"PluginInstallResponse","kind":"model","schemaRef":"#/$defs/PluginInstallResponse"},{"name":"PluginInstallerBackend","kind":"enum","schemaRef":"#/$defs/PluginInstallerBackend","enumValues":[{"name":"auto","value":"auto"},{"name":"pip","value":"pip"},{"name":"uv","value":"uv"}]},{"name":"PluginListEntry","kind":"model","schemaRef":"#/$defs/PluginListEntry"},{"name":"PluginListResponse","kind":"model","schemaRef":"#/$defs/PluginListResponse"},{"name":"PluginLockApplyResponse","kind":"model","schemaRef":"#/$defs/PluginLockApplyResponse"},{"name":"PluginLockEntry","kind":"model","schemaRef":"#/$defs/PluginLockEntry"},{"name":"PluginLockWriteResponse","kind":"model","schemaRef":"#/$defs/PluginLockWriteResponse"},{"name":"PluginManifest","kind":"model","schemaRef":"#/$defs/PluginManifest"},{"name":"PluginOverviewTabPrefix","kind":"enum","schemaRef":"#/$defs/PluginOverviewTabPrefix","enumValues":[{"name":"PluginPane","value":"PluginPane"}]},{"name":"PluginRegisteredBackendRoute","kind":"model","schemaRef":"#/$defs/PluginRegisteredBackendRoute"},{"name":"PluginRegisteredCodegenTarget","kind":"model","schemaRef":"#/$defs/PluginRegisteredCodegenTarget"},{"name":"PluginRegisteredLanguageServer","kind":"model","schemaRef":"#/$defs/PluginRegisteredLanguageServer"},{"name":"PluginRegisteredListenerEndpoint","kind":"model","schemaRef":"#/$defs/PluginRegisteredListenerEndpoint"},{"name":"PluginRegisteredStaticDir","kind":"model","schemaRef":"#/$defs/PluginRegisteredStaticDir"},{"name":"PluginRegisteredUISetting","kind":"model","schemaRef":"#/$defs/PluginRegisteredUISetting"},{"name":"PluginRestartCapability","kind":"model","schemaRef":"#/$defs/PluginRestartCapability"},{"name":"PluginRestartCapabilityMode","kind":"enum","schemaRef":"#/$defs/PluginRestartCapabilityMode","enumValues":[{"name":"manual","value":"manual"},{"name":"programmatic","value":"programmatic"}]},{"name":"PluginRestartResponse","kind":"model","schemaRef":"#/$defs/PluginRestartResponse"},{"name":"PluginRollbackResponse","kind":"model","schemaRef":"#/$defs/PluginRollbackResponse"},{"name":"PluginRuntimeResponse","kind":"model","schemaRef":"#/$defs/PluginRuntimeResponse"},{"name":"PluginRuntimeState","kind":"enum","schemaRef":"#/$defs/PluginRuntimeState","enumValues":[{"name":"active","value":"active"},{"name":"disabled","value":"disabled"},{"name":"invalid","value":"invalid"},{"name":"shadowed","value":"shadowed"},{"name":"pending_restart","value":"pending_restart"}]},{"name":"PluginRuntimeUpdateMessage","kind":"model","schemaRef":"#/$defs/PluginRuntimeUpdateMessage"},{"name":"PluginScope","kind":"enum","schemaRef":"#/$defs/PluginScope","enumValues":[{"name":"workspace","value":"workspace"},{"name":"setta_files","value":"setta_files"},{"name":"global","value":"global"}]},{"name":"PluginSourceManager","kind":"enum","schemaRef":"#/$defs/PluginSourceManager","enumValues":[{"name":"setta","value":"setta"},{"name":"package_manager","value":"package_manager"}]},{"name":"PluginSourceScheme","kind":"enum","schemaRef":"#/$defs/PluginSourceScheme","enumValues":[{"name":"github","value":"github"},{"name":"pypi","value":"pypi"}]},{"name":"PluginSourceTrustStatus","kind":"enum","schemaRef":"#/$defs/PluginSourceTrustStatus","enumValues":[{"name":"unverified","value":"unverified"}]},{"name":"PluginStatusEntry","kind":"model","schemaRef":"#/$defs/PluginStatusEntry"},{"name":"PluginStatusResponse","kind":"model","schemaRef":"#/$defs/PluginStatusResponse"},{"name":"PluginUninstallResponse","kind":"model","schemaRef":"#/$defs/PluginUninstallResponse"},{"name":"PluginUpdateResponse","kind":"model","schemaRef":"#/$defs/PluginUpdateResponse"},{"name":"PluginsGlobalStateFile","kind":"model","schemaRef":"#/$defs/PluginsGlobalStateFile"},{"name":"PluginsLockFile","kind":"model","schemaRef":"#/$defs/PluginsLockFile"},{"name":"PluginsStateFile","kind":"model","schemaRef":"#/$defs/PluginsStateFile"},{"name":"Policy","kind":"model","schemaRef":"#/$defs/Policy"},{"name":"Position","kind":"model","schemaRef":"#/$defs/Position"},{"name":"PreviewKind","kind":"enum","schemaRef":"#/$defs/PreviewKind","enumValues":[{"name":"code","value":"code"},{"name":"paramValue","value":"paramValue"},{"name":"callableName","value":"callableName"},{"name":"appSpecPatch","value":"appSpecPatch"}]},{"name":"ProjectChatAgenticEdgeContextModeOption","kind":"model","schemaRef":"#/$defs/ProjectChatAgenticEdgeContextModeOption"},{"name":"ProjectChatDictationModeOption","kind":"model","schemaRef":"#/$defs/ProjectChatDictationModeOption"},{"name":"ProjectChatPermissionModeOption","kind":"model","schemaRef":"#/$defs/ProjectChatPermissionModeOption"},{"name":"ProjectChatUIConfigValue","kind":"model","schemaRef":"#/$defs/ProjectChatUIConfigValue"},{"name":"ProjectChatWindowInstance","kind":"model","schemaRef":"#/$defs/ProjectChatWindowInstance"},{"name":"ProjectChatWindowModeOption","kind":"model","schemaRef":"#/$defs/ProjectChatWindowModeOption"},{"name":"ProjectChatWindowingState","kind":"model","schemaRef":"#/$defs/ProjectChatWindowingState"},{"name":"ProjectCodegenLanguage","kind":"enum","schemaRef":"#/$defs/ProjectCodegenLanguage","enumValues":[{"name":"python","value":"python"}]},{"name":"ProjectCodegenPluginTarget","kind":"model","schemaRef":"#/$defs/ProjectCodegenPluginTarget"},{"name":"ProjectCodegenPythonTarget","kind":"model","schemaRef":"#/$defs/ProjectCodegenPythonTarget"},{"name":"ProjectCodegenTarget","kind":"alias","schemaRef":"#/$defs/ProjectCodegenTarget"},{"name":"ProjectConfig","kind":"model","schemaRef":"#/$defs/ProjectConfig"},{"name":"ProjectConfigDiagnostics","kind":"model","schemaRef":"#/$defs/ProjectConfigDiagnostics"},{"name":"ProjectConfigMetadata","kind":"model","schemaRef":"#/$defs/ProjectConfigMetadata"},{"name":"ProjectRunCapabilities","kind":"model","schemaRef":"#/$defs/ProjectRunCapabilities"},{"name":"ProjectStateItem","kind":"model","schemaRef":"#/$defs/ProjectStateItem"},{"name":"ProjectStateSummary","kind":"model","schemaRef":"#/$defs/ProjectStateSummary"},{"name":"ProjectStateUpdateContent","kind":"model","schemaRef":"#/$defs/ProjectStateUpdateContent"},{"name":"ProjectStateUpdateMessage","kind":"model","schemaRef":"#/$defs/ProjectStateUpdateMessage"},{"name":"PromptSectionImpl","kind":"model","schemaRef":"#/$defs/PromptSectionImpl"},{"name":"PromptTemplatesUpdatedContent","kind":"model","schemaRef":"#/$defs/PromptTemplatesUpdatedContent"},{"name":"PromptTemplatesUpdatedMessage","kind":"model","schemaRef":"#/$defs/PromptTemplatesUpdatedMessage"},{"name":"PythonCodeObjValueRepresentationMode","kind":"enum","schemaRef":"#/$defs/PythonCodeObjValueRepresentationMode","enumValues":[{"name":"expression","value":"expression"},{"name":"json_parsed","value":"json_parsed"},{"name":"string","value":"string"},{"name":"file_path","value":"file_path"},{"name":"file_read","value":"file_read"}]},{"name":"PythonCodegenPolicyCodeObjOption","kind":"model","schemaRef":"#/$defs/PythonCodegenPolicyCodeObjOption"},{"name":"PythonCodegenPolicyUIConfigValue","kind":"model","schemaRef":"#/$defs/PythonCodegenPolicyUIConfigValue"},{"name":"PythonSectionCodegenMode","kind":"enum","schemaRef":"#/$defs/PythonSectionCodegenMode","enumValues":[{"name":"inherit","value":"inherit"},{"name":"include","value":"include"},{"name":"exclude","value":"exclude"}]},{"name":"PythonSectionRepresentationMode","kind":"enum","schemaRef":"#/$defs/PythonSectionRepresentationMode","enumValues":[{"name":"expression","value":"expression"},{"name":"file_path","value":"file_path"},{"name":"file_read","value":"file_read"}]},{"name":"RawArtifact","kind":"model","schemaRef":"#/$defs/RawArtifact"},{"name":"RawMessage","kind":"alias","schemaRef":"#/$defs/RawMessage"},{"name":"ReadResult","kind":"model","schemaRef":"#/$defs/ReadResult"},{"name":"RealtimeDependencyEventContent","kind":"model","schemaRef":"#/$defs/RealtimeDependencyEventContent"},{"name":"RealtimeDependencyEventMessage","kind":"model","schemaRef":"#/$defs/RealtimeDependencyEventMessage"},{"name":"RealtimeDependencyEventPayload","kind":"model","schemaRef":"#/$defs/RealtimeDependencyEventPayload"},{"name":"RealtimeUIChangeContent","kind":"model","schemaRef":"#/$defs/RealtimeUIChangeContent"},{"name":"RealtimeUIChangeMessage","kind":"model","schemaRef":"#/$defs/RealtimeUIChangeMessage"},{"name":"RenameRefactorBroadcastContent","kind":"model","schemaRef":"#/$defs/RenameRefactorBroadcastContent"},{"name":"RenameRefactorMode","kind":"enum","schemaRef":"#/$defs/RenameRefactorMode","enumValues":[{"name":"ALWAYS_ASK","value":"ALWAYS_ASK"},{"name":"ALWAYS_RENAME","value":"ALWAYS_RENAME"},{"name":"NEVER_RENAME","value":"NEVER_RENAME"}]},{"name":"RenameRefactorResultsMessage","kind":"model","schemaRef":"#/$defs/RenameRefactorResultsMessage"},{"name":"RenameReferenceChangedValue","kind":"model","schemaRef":"#/$defs/RenameReferenceChangedValue"},{"name":"RenameReferenceDependencyKey","kind":"model","schemaRef":"#/$defs/RenameReferenceDependencyKey"},{"name":"RequiredUIEditorTabMap","kind":"alias","schemaRef":"#/$defs/RequiredUIEditorTabMap"},{"name":"ResolvedSettaFilesLocation","kind":"enum","schemaRef":"#/$defs/ResolvedSettaFilesLocation","enumValues":[{"name":"local","value":"local"},{"name":"global","value":"global"}]},{"name":"RestartRequiredResponse","kind":"model","schemaRef":"#/$defs/RestartRequiredResponse"},{"name":"RootTransportRoutes","kind":"model","schemaRef":"#/$defs/RootTransportRoutes"},{"name":"RotaryParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/RotaryParamCodeObjImpl"},{"name":"Route","kind":"enum","schemaRef":"#/$defs/Route","enumValues":[{"name":"ACCEPT_RENAME_REFACTOR","value":"/acceptRenameRefactor"},{"name":"ADD_KWARG","value":"/addKwarg"},{"name":"ADD_LAUNCHER_RECENT_WORKSPACE","value":"/addLauncherRecentWorkspace"},{"name":"API_PREFIX","value":"/api"},{"name":"APPEND_DRAW_AREA_LAYER_ITEM","value":"/appendDrawAreaLayerItem"},{"name":"APPEND_TRANSCRIPTION_AUDIO","value":"/appendTranscriptionAudio"},{"name":"APP_DEPLOYMENTS","value":"/app/deployments"},{"name":"APP_DEPLOYMENT_CURRENT_SESSION","value":"/app/deployments/current/session"},{"name":"APP_DEPLOYMENT_LATEST","value":"/app/deployments/{deploymentName}/latest"},{"name":"APP_DEPLOYMENT_PROJECT_CONFIG","value":"/app/deployments/{deploymentName}/{version}/project_config"},{"name":"APP_DEPLOYMENT_STATE","value":"/app/deployments/{deploymentName}/{version}/state"},{"name":"APP_DEPLOYMENT_VERSIONS","value":"/app/deployments/{deploymentName}/versions"},{"name":"ATTACHMENT_DOWNLOAD","value":"/attachments/{token}"},{"name":"AUTO_LAYOUT_TOP_LEVEL_SECTIONS","value":"/autoLayoutTopLevelSections"},{"name":"BINARY_DOWNLOAD","value":"/binary/{contentId}"},{"name":"BINARY_UPLOAD","value":"/binary/upload"},{"name":"BOOTSTRAP_CONSUME","value":"/__setta__/bootstrap/consume"},{"name":"BOOTSTRAP_PAGE","value":"/__setta__/bootstrap"},{"name":"CANCEL_RUN","value":"/cancelRun"},{"name":"CANCEL_TRANSCRIPTION_SESSION","value":"/cancelTranscriptionSession"},{"name":"CHANGE_PARAM_IMPL","value":"/changeParamImpl"},{"name":"CHECK_IF_FILE_EXISTS","value":"/checkIfFileExists"},{"name":"CHECK_WORKSPACE_INITIALIZED","value":"/checkWorkspaceInitialized"},{"name":"CLEAR_TEXT_FIELD_COMPLETION","value":"/clearTextFieldCompletion"},{"name":"CODE_AREA_COMPLETION","value":"/codeAreaCompletion"},{"name":"CREATE_AGENTIC_EDGE","value":"/createAgenticEdge"},{"name":"CREATE_AGENT_PROFILE","value":"/createAgentProfile"},{"name":"CREATE_CHILD_SECTIONS","value":"/createChildSections"},{"name":"CREATE_CHILD_SECTIONS_VIA_INCREMENTER","value":"/createChildSectionsViaIncrementer"},{"name":"CREATE_EDGE","value":"/createEdge"},{"name":"CREATE_ENGINE_CONFIG","value":"/createEngineConfig"},{"name":"CREATE_EXTERNAL_AGENT_CONFIG","value":"/createExternalAgentConfig"},{"name":"CREATE_FILE","value":"/createFile"},{"name":"CREATE_NEW_SECTION_VARIANT","value":"/createNewSectionVariant"},{"name":"CREATE_PROJECT_CONFIG","value":"/createProjectConfig"},{"name":"CREATE_PROMPT_TEMPLATE","value":"/createPromptTemplate"},{"name":"CREATE_STATE_MACHINE_EDGE","value":"/createStateMachineEdge"},{"name":"CREATE_TOP_LEVEL_SECTION","value":"/createTopLevelSection"},{"name":"CREATE_TRANSCRIPTION_PROFILE","value":"/createTranscriptionProfile"},{"name":"CREATE_VIEW_MODE","value":"/createViewMode"},{"name":"CREATE_WINDOW_SPACE","value":"/createWindowSpace"},{"name":"CREATE_WORKSPACE_LAUNCH_INTENT","value":"/createWorkspaceLaunchIntent"},{"name":"DECLINE_RENAME_REFACTOR","value":"/declineRenameRefactor"},{"name":"DELETE_AGENTIC_EDGES","value":"/deleteAgenticEdges"},{"name":"DELETE_AGENT_PROFILE","value":"/deleteAgentProfile"},{"name":"DELETE_ARTIFACTS","value":"/deleteArtifacts"},{"name":"DELETE_CHILD_SECTIONS_VIA_DECREMENTER","value":"/deleteChildSectionsViaDecrementer"},{"name":"DELETE_EDGES","value":"/deleteEdges"},{"name":"DELETE_ENGINE_CONFIG","value":"/deleteEngineConfig"},{"name":"DELETE_EXTERNAL_AGENT_CONFIG","value":"/deleteExternalAgentConfig"},{"name":"DELETE_JSON_SOURCE_FILE_AND_VARIANT","value":"/deleteJsonSourceFileAndVariant"},{"name":"DELETE_KWARG","value":"/deleteKwarg"},{"name":"DELETE_NOTIFICATION","value":"/deleteNotification"},{"name":"DELETE_PROJECT_CONFIGS","value":"/deleteProjectConfigs"},{"name":"DELETE_PROMPT_TEMPLATE","value":"/deletePromptTemplate"},{"name":"DELETE_SECTIONS","value":"/deleteSections"},{"name":"DELETE_SECTION_VARIANT_OR_ASK","value":"/deleteSectionVariantOrAsk"},{"name":"DELETE_SELECTED_PARAMS","value":"/deleteSelectedParams"},{"name":"DELETE_STATE_MACHINE_EDGES","value":"/deleteStateMachineEdges"},{"name":"DELETE_TERMINALS","value":"/deleteTerminals"},{"name":"DELETE_TRANSCRIPTION_PROFILE","value":"/deleteTranscriptionProfile"},{"name":"DELETE_VIEW_MODE","value":"/deleteViewMode"},{"name":"DELETE_WINDOW_SPACE","value":"/deleteWindowSpace"},{"name":"DOCSTRING_TO_MARKDOWN","value":"/docstringToMarkdown"},{"name":"FILE_BROWSER_DOWNLOAD","value":"/fileBrowser/{token}"},{"name":"FORCE_REFRESH_LISTENER","value":"/forceRefreshListener"},{"name":"FORMAT_CODE","value":"/formatCode"},{"name":"FRONTEND","value":"/ws/frontend"},{"name":"GEN_CODE_PREFIX_COMPLETION","value":"/genCodePrefixCompletion"},{"name":"GEN_CODE_SUFFIX_COMPLETION","value":"/genCodeSuffixCompletion"},{"name":"GET_AGENTIC_SUMMARY_CACHE_STATUS","value":"/getAgenticSummaryCacheStatus"},{"name":"GET_AGENT_PROFILE","value":"/getAgentProfile"},{"name":"GET_AGENT_PROFILES","value":"/getAgentProfiles"},{"name":"GET_AGENT_RUN","value":"/getAgentRun"},{"name":"GET_AGENT_RUNS","value":"/getAgentRuns"},{"name":"GET_AI_FOLLOW_SNAPSHOT","value":"/getAIFollowSnapshot"},{"name":"GET_APP_CATALOG","value":"/getAppCatalog"},{"name":"GET_APP_DEFINITION","value":"/getAppDefinition"},{"name":"GET_APP_GEN_SKILLS","value":"/getAppGenSkills"},{"name":"GET_APP_GEN_SKILL_CONTENT","value":"/getAppGenSkillContent"},{"name":"GET_ATTACHMENT_DOWNLOAD_URL","value":"/getAttachmentDownloadUrl"},{"name":"GET_ATTACHMENT_DOWNLOAD_UR_LS","value":"/getAttachmentDownloadUrls"},{"name":"GET_AUTH_REFRESH_STATUS","value":"/authRefreshStatus"},{"name":"GET_BACKEND_INIT_STATUS","value":"/backendInitStatus"},{"name":"GET_CHAT_SECTION_CHAT_ID","value":"/getChatSectionChatId"},{"name":"GET_ENGINE_CONFIG","value":"/getEngineConfig"},{"name":"GET_ENGINE_CONFIGS","value":"/getEngineConfigs"},{"name":"GET_EXTERNAL_AGENT_CHAT","value":"/getExternalAgentChat"},{"name":"GET_EXTERNAL_AGENT_CONFIG","value":"/getExternalAgentConfig"},{"name":"GET_EXTERNAL_AGENT_CONFIGS","value":"/getExternalAgentConfigs"},{"name":"GET_EXTERNAL_AGENT_HEALTH","value":"/getExternalAgentHealth"},{"name":"GET_FILE_BROWSER_DOWNLOAD_URL","value":"/getFileBrowserDownloadUrls"},{"name":"GET_FILE_BROWSER_FILE_CONTENT","value":"/getFileBrowserFileContent"},{"name":"GET_FILE_BROWSER_FILE_STAT","value":"/getFileBrowserFileStat"},{"name":"GET_FILE_BROWSER_ROOT","value":"/getFileBrowserRoot"},{"name":"GET_FOLDER_CONTENTS","value":"/getFolderContents"},{"name":"GET_GIT_COMMIT_DETAILS","value":"/git/commitDetails"},{"name":"GET_GIT_COMMIT_FILE_DIFF","value":"/git/commitFileDiff"},{"name":"GET_GIT_DIFF","value":"/git/diff"},{"name":"GET_GIT_LOG","value":"/git/log"},{"name":"GET_GIT_STATUS","value":"/git/status"},{"name":"GET_LATEST_LSP_DIAGNOSTICS","value":"/getLatestLspDiagnostics"},{"name":"GET_LATEST_PROJECT_STATE","value":"/getLatestProjectState"},{"name":"GET_LAUNCHER_FILESYSTEM_ROOTS","value":"/launcherFilesystemRoots"},{"name":"GET_LAUNCHER_RECENT_WORKSPACES","value":"/launcherRecentWorkspaces"},{"name":"GET_LAUNCHER_STATUS","value":"/launcherStatus"},{"name":"GET_LISTENER_COVERAGE","value":"/getListenerCoverage"},{"name":"GET_LLM_CHAT","value":"/getLLMChat"},{"name":"GET_LLM_RESPONSE","value":"/getLLMResponse"},{"name":"GET_NOTIFICATIONS","value":"/getNotifications"},{"name":"GET_PASSWORD_PARAM_VALUE","value":"/getPasswordParamValue"},{"name":"GET_PROMPT_TEMPLATE","value":"/getPromptTemplate"},{"name":"GET_PROMPT_TEMPLATES","value":"/getPromptTemplates"},{"name":"GET_RUNNER_SUMMARY","value":"/getRunnerSummary"},{"name":"GET_RUN_STATUS","value":"/getRunStatus"},{"name":"GET_SERVER_MODE","value":"/serverMode"},{"name":"GET_SETTA_HOME_INFO","value":"/settaHomeInfo"},{"name":"GET_STATE_MACHINE_RUN","value":"/getStateMachineRun"},{"name":"GET_TRANSCRIPTION_PROFILES","value":"/getTranscriptionProfiles"},{"name":"GET_WORKSPACE_PYTHON_SIGNAL","value":"/getWorkspacePythonSignal"},{"name":"GROUP_SECTIONS","value":"/groupSections"},{"name":"IMPORT_FILES_TO_ARTIFACTS","value":"/importFilesToArtifacts"},{"name":"INDENT_PARAMS","value":"/indentParams"},{"name":"INTERRUPT_TERMINAL_PROCESSES","value":"/interruptTerminalProcesses"},{"name":"LAUNCH","value":"/launch"},{"name":"LISTENER_BY_ID","value":"/ws/listeners/{listenerID}"},{"name":"LIST_LAUNCHER_DIRECTORY","value":"/listLauncherDirectory"},{"name":"LLMAPI_KEYS","value":"/llm/apiKeys"},{"name":"LLM_CONFIG","value":"/llm/config"},{"name":"LOAD_ALL_PROJECT_METADATA","value":"/loadAllProjectMetadata"},{"name":"LOAD_CACHED_BRUSH_STROKES","value":"/loadCachedBrushStrokes"},{"name":"LOAD_CACHED_CHART_DATA","value":"/loadCachedChartData"},{"name":"LOAD_CACHED_DRAW_AREA_LAYER_ITEM_TRANSFORM","value":"/loadDrawAreaLayerItemTransform"},{"name":"LOAD_CACHED_IMAGE_ARTIFACTS","value":"/loadCachedImageArtifacts"},{"name":"LOAD_PROJECT_CONFIG","value":"/loadProjectConfig"},{"name":"LOAD_SETTINGS","value":"/loadSettings"},{"name":"MCP_SERVER_RUNTIME_STATUS","value":"/mcpServerRuntimeStatus"},{"name":"MCP_TOOL_CALL","value":"/__setta__/tools/call"},{"name":"MOVE_PARAMS","value":"/moveParams"},{"name":"MOVE_PARAM_GROUPS","value":"/moveParamGroups"},{"name":"MOVE_SECTIONS","value":"/moveSections"},{"name":"OPEN_LAUNCHER_WORKSPACE","value":"/openLauncherWorkspace"},{"name":"OUTPUT_ACCESSOR_COMPLETION","value":"/outputAccessorCompletion"},{"name":"PASTE_SECTIONS","value":"/pasteSections"},{"name":"PIN_LAUNCHER_RECENT_WORKSPACE","value":"/pinLauncherRecentWorkspace"},{"name":"PLUGINS_ASSET_WILDCARD","value":"/plugins/{pluginId}/*"},{"name":"PLUGINS_CONFIG","value":"/plugins/config"},{"name":"PLUGINS_DISABLE","value":"/plugins/disable"},{"name":"PLUGINS_ENABLE","value":"/plugins/enable"},{"name":"PLUGINS_INSTALL","value":"/plugins/install"},{"name":"PLUGINS_LINK","value":"/plugins/link"},{"name":"PLUGINS_LOCK_APPLY","value":"/plugins/lock/apply"},{"name":"PLUGINS_LOCK_WRITE","value":"/plugins/lock/write"},{"name":"PLUGINS_RESCAN","value":"/plugins/rescan"},{"name":"PLUGINS_RESTART","value":"/plugins/restart"},{"name":"PLUGINS_ROLLBACK","value":"/plugins/rollback"},{"name":"PLUGINS_RUNTIME","value":"/plugins/runtime"},{"name":"PLUGINS_UNINSTALL","value":"/plugins/uninstall"},{"name":"PLUGINS_UPDATE","value":"/plugins/update"},{"name":"PREPARE_SECTIONS_FOR_COPY","value":"/prepareSectionsForCopy"},{"name":"RECONNECT_EDGE","value":"/reconnectEdge"},{"name":"REDO","value":"/redo"},{"name":"REMOVE_LAUNCHER","value":"/removeLauncher"},{"name":"REMOVE_LAUNCHER_RECENT_WORKSPACE","value":"/removeLauncherRecentWorkspace"},{"name":"REPAIR_LAUNCHER","value":"/repairLauncher"},{"name":"RESET_STATE_MACHINE","value":"/resetStateMachine"},{"name":"RESPOND_EXTERNAL_AGENT_APPROVAL","value":"/respondExternalAgentApproval"},{"name":"RESPOND_EXTERNAL_AGENT_QUESTION","value":"/respondExternalAgentQuestion"},{"name":"RESTART_LANGUAGE_SERVER","value":"/restartLanguageServer"},{"name":"REVEAL_PATH_IN_OS_FILE_EXPLORER","value":"/revealPathInOsFileExplorer"},{"name":"RUN_CODE","value":"/runCode"},{"name":"RUN_DETACHED","value":"/runDetached"},{"name":"SAVE_AS_NEW_PROJECT_CONFIG","value":"/saveAsNewProjectConfig"},{"name":"SAVE_PROJECT","value":"/saveProject"},{"name":"SAVE_SETTINGS","value":"/saveSettings"},{"name":"SDK_RUNTIME_HANDSHAKE","value":"/sdkRuntimeHandshake"},{"name":"SETUP_LAUNCHER","value":"/setupLauncher"},{"name":"SET_ACTIVE_I_DS","value":"/setActiveIds"},{"name":"SET_ACTIVE_VIEW_MODE","value":"/setActiveViewMode"},{"name":"SET_AGENTIC_EDGES","value":"/setAgenticEdges"},{"name":"SET_APP_DEFINITION","value":"/setAppDefinition"},{"name":"SET_AS_DEFAULT_PROJECT","value":"/setAsDefaultProject"},{"name":"SET_BROWSER_AREA_VIEW_MODE","value":"/setBrowserAreaViewMode"},{"name":"SET_BROWSER_COLUMN_WIDTHS","value":"/setBrowserColumnWidths"},{"name":"SET_BROWSER_HIDE_COLUMN","value":"/setBrowserHideColumn"},{"name":"SET_BROWSER_SAVED_SEARCHES","value":"/setBrowserSavedSearches"},{"name":"SET_CALLABLE","value":"/setCallable"},{"name":"SET_CALLABLE_HIDE_PARAMS","value":"/setCallableHideParams"},{"name":"SET_CHART_AREA_DATA_PATH","value":"/setChartAreaDataPath"},{"name":"SET_CHART_SETTINGS","value":"/setChartSettings"},{"name":"SET_CHART_TYPE","value":"/setChartType"},{"name":"SET_CHAT_SECTION_CHAT_ID","value":"/setChatSectionChatId"},{"name":"SET_CHAT_SECTION_SETTINGS","value":"/setChatSectionSettings"},{"name":"SET_CHAT_SECTION_STATE","value":"/setChatSectionState"},{"name":"SET_CODE","value":"/setCode"},{"name":"SET_CODE_FILE_BINDING","value":"/setCodeFileBinding"},{"name":"SET_CODE_OBJ_DISPLAY_NAME","value":"/setCodeObjDisplayName"},{"name":"SET_CODE_OBJ_NAME","value":"/setCodeObjName"},{"name":"SET_CODE_SECTION_ATTACHED_TERMINAL","value":"/setCodeSectionAttachedTerminal"},{"name":"SET_CODE_SECTION_DIAGNOSTICS_MUTE","value":"/setCodeSectionDiagnosticsMute"},{"name":"SET_CODE_SECTION_DIAGNOSTIC_CODE_SUPPRESSION","value":"/setCodeSectionDiagnosticCodeSuppression"},{"name":"SET_DEFAULT_SECTION_VARIANT","value":"/setDefaultSectionVariant"},{"name":"SET_EDGES","value":"/setEdges"},{"name":"SET_GEN_CODE_PREFIX","value":"/setGenCodePrefix"},{"name":"SET_GEN_CODE_SUFFIX","value":"/setGenCodeSuffix"},{"name":"SET_GROUP_OVERFLOW_MODE","value":"/setGroupOverflowMode"},{"name":"SET_IMAGE_AREA_IMAGE_PATH","value":"/setImageAreaImagePath"},{"name":"SET_LANGUAGE_SERVER_SELECTION","value":"/setLanguageServerSelection"},{"name":"SET_LIST_ROOT_VIEW_MODE","value":"/setListRootViewMode"},{"name":"SET_META_CONTROL_SHOW_SECTION_TITLE","value":"/setMetaControlShowSectionTitle"},{"name":"SET_PARAM_ENTERED_VALUE","value":"/setParamEnteredValue"},{"name":"SET_PARENT_DEFAULT_CHILD_SECTION_TYPE","value":"/setParentDefaultChildSectionType"},{"name":"SET_PROJECT_CHAT_WINDOWING_STATE","value":"/setProjectChatWindowingState"},{"name":"SET_PROJECT_CHAT_WINDOW_CHAT_ID","value":"/setProjectChatWindowChatId"},{"name":"SET_PROJECT_CONFIG_CODEGEN_TARGETS","value":"/setProjectConfigCodegenTargets"},{"name":"SET_PROJECT_CONFIG_NAME","value":"/setProjectConfigName"},{"name":"SET_PROMPT_FORMAT","value":"/setPromptFormat"},{"name":"SET_PROMPT_INPUTS","value":"/setPromptInputs"},{"name":"SET_PROMPT_TEMPLATE","value":"/setPromptTemplate"},{"name":"SET_PROMPT_TEMPLATE_LINK","value":"/setPromptTemplateLink"},{"name":"SET_SECTION_COLUMN_WIDTH","value":"/setSectionColumnWidth"},{"name":"SET_SECTION_EDGE_INPUTS","value":"/setSectionEdgeInputs"},{"name":"SET_SECTION_EDGE_OUTPUTS","value":"/setSectionEdgeOutputs"},{"name":"SET_SECTION_HIDE_UNPINNED_PARAMS","value":"/setSectionHideUnpinnedParams"},{"name":"SET_SECTION_NAME","value":"/setSectionName"},{"name":"SET_SECTION_PARAM_FILTER","value":"/setSectionParamFilter"},{"name":"SET_SECTION_PINNED_PARAMS","value":"/setSectionPinnedParams"},{"name":"SET_SECTION_SIZES","value":"/setSectionSizes"},{"name":"SET_SECTION_STYLE_COLOR","value":"/setSectionStyleColor"},{"name":"SET_SECTION_TAG_COLOR","value":"/setSectionTagColor"},{"name":"SET_SECTION_VARIANT","value":"/setSectionVariant"},{"name":"SET_SECTION_VARIANT_NAME","value":"/setSectionVariantName"},{"name":"SET_SECTION_VARIANT_SORT_ORDER","value":"/setSectionVariantSortOrder"},{"name":"SET_SHOW_PARAM_DISPLAY_NAMES","value":"/setShowParamDisplayNames"},{"name":"SET_SOCIAL_URL","value":"/setSocialUrl"},{"name":"SET_SPREADSHEET_FILE_PATH","value":"/setSpreadsheetFilePath"},{"name":"SET_SPREADSHEET_SECTION_SETTINGS","value":"/setSpreadsheetSectionSettings"},{"name":"SET_STATE_MACHINE_EDGES","value":"/setStateMachineEdges"},{"name":"SET_STATE_MACHINE_SECTION_SETTINGS","value":"/setStateMachineSectionSettings"},{"name":"SET_TASK_BOARD_SECTION_STATE","value":"/setTaskBoardSectionState"},{"name":"SET_TEXT_BLOCK_DISPLAY_MODE","value":"/setTextBlockDisplayMode"},{"name":"SET_TEXT_BLOCK_FORMAT","value":"/setTextBlockFormat"},{"name":"SET_TEXT_BLOCK_HEADING_AS_SECTION_NAME","value":"/setTextBlockHeadingAsSectionName"},{"name":"SET_TEXT_BLOCK_MASTER_FONT_SIZE","value":"/setTextBlockMasterFontSize"},{"name":"SET_TEXT_BLOCK_META_CONTROL_STYLE","value":"/setTextBlockMetaControlStyle"},{"name":"SET_TEXT_BLOCK_TEXT","value":"/setTextBlockText"},{"name":"SET_TOP_LEVEL_SECTION_LAYOUT","value":"/setTopLevelSectionLayout"},{"name":"SET_TYPE_ERROR_IGNORE","value":"/setTypeErrorIgnore"},{"name":"SET_VARIANT_JSON_SOURCE_KEYS","value":"/setVariantJsonSourceKeys"},{"name":"SET_VIEWPORT","value":"/setViewport"},{"name":"SET_VIEW_MODE_NAME","value":"/setViewModeName"},{"name":"SET_VIEW_MODE_SORT_ORDER","value":"/setViewModeSortOrder"},{"name":"SET_WATCH_CODE_ENABLED","value":"/setWatchCodeEnabled"},{"name":"SET_WATCH_CODE_INPUTS","value":"/setWatchCodeInputs"},{"name":"SET_WINDOW_SPACE_NAME","value":"/setWindowSpaceName"},{"name":"SET_WINDOW_SPACE_SORT_ORDER","value":"/setWindowSpaceSortOrder"},{"name":"SHARE_DEPLOYMENTS","value":"/share/deployments"},{"name":"SHARE_DEPLOYMENT_CURRENT_SESSION","value":"/share/deployments/current/session"},{"name":"SHARE_DEPLOYMENT_LATEST","value":"/share/deployments/{deploymentName}/latest"},{"name":"SHARE_DEPLOYMENT_PROJECT_CONFIG","value":"/share/deployments/{deploymentName}/{version}/project_config"},{"name":"SHARE_DEPLOYMENT_STATE","value":"/share/deployments/{deploymentName}/{version}/state"},{"name":"SHARE_DEPLOYMENT_VERSIONS","value":"/share/deployments/{deploymentName}/versions"},{"name":"START_AGENT_RUN","value":"/startAgentRun"},{"name":"START_RUN_CHAIN","value":"/startRunChain"},{"name":"START_STATE_MACHINE_RUN","value":"/startStateMachineRun"},{"name":"START_TRANSCRIPTION_SESSION","value":"/startTranscriptionSession"},{"name":"STOP_AGENT_RUN","value":"/stopAgentRun"},{"name":"STOP_EXTERNAL_AGENT_RUN","value":"/stopExternalAgentRun"},{"name":"STOP_LLM_CHAT","value":"/stopLLMChat"},{"name":"STOP_RUN_CHAIN","value":"/stopRunChain"},{"name":"STOP_STATE_MACHINE_RUN","value":"/stopStateMachineRun"},{"name":"STOP_TRANSCRIPTION_SESSION","value":"/stopTranscriptionSession"},{"name":"TERMINAL_BY_SECTION","value":"/ws/terminals/{projectID}/{sectionID}"},{"name":"TEXT_FIELD_COMPLETION","value":"/textFieldCompletion"},{"name":"TOGGLE_GROUP_ORIENTATION","value":"/toggleGroupOrientation"},{"name":"TOGGLE_IS_EDITING_VIEW_MODE","value":"/toggleIsEditingViewMode"},{"name":"TOGGLE_MINIMIZED","value":"/toggleMinimized"},{"name":"TOGGLE_PARAM_SELECTED","value":"/toggleParamSelected"},{"name":"TOGGLE_POSITION_LOCKS","value":"/togglePositionLocks"},{"name":"TOGGLE_SECTION_VISIBILITY","value":"/toggleSectionVisibility"},{"name":"TOGGLE_VARIANT_FROZEN","value":"/toggleVariantFrozen"},{"name":"TOGGLE_VARIANT_JSON_SOURCE","value":"/toggleVariantJsonSource"},{"name":"TOGGLE_VIEW_MODE_TAB","value":"/toggleViewModeTab"},{"name":"TOGGLE_VIEW_MODE_USER_FACING","value":"/toggleViewModeUserFacing"},{"name":"TRANSFER_FILE_BROWSER_ENTRY","value":"/transferFileBrowserEntry"},{"name":"TYPE_CHECK","value":"/typeCheck"},{"name":"UNDO","value":"/undo"},{"name":"UNGROUP_GROUPS","value":"/ungroupGroups"},{"name":"UNINDENT_PARAMS","value":"/unindentParams"},{"name":"UNSELECT_ALL_PARAMS","value":"/unselectAllParams"},{"name":"UPDATE_AGENTIC_EDGE","value":"/updateAgenticEdge"},{"name":"UPDATE_AGENT_PROFILE","value":"/updateAgentProfile"},{"name":"UPDATE_ARTIFACTS","value":"/updateArtifacts"},{"name":"UPDATE_EDGE","value":"/updateEdge"},{"name":"UPDATE_ENGINE_CONFIG","value":"/updateEngineConfig"},{"name":"UPDATE_EXTERNAL_AGENT_CONFIG","value":"/updateExternalAgentConfig"},{"name":"UPDATE_LAUNCHER","value":"/updateLauncher"},{"name":"UPDATE_PARAM_IMPL_CONFIG","value":"/updateParamImplConfig"},{"name":"UPDATE_PROMPT_TEMPLATE","value":"/updatePromptTemplate"},{"name":"UPDATE_STATE_MACHINE_EDGE","value":"/updateStateMachineEdge"},{"name":"UPDATE_TRANSCRIPTION_PROFILE","value":"/updateTranscriptionProfile"},{"name":"UPSERT_APP_GEN_CUSTOM_SKILL","value":"/upsertAppGenCustomSkill"},{"name":"VALIDATE_APP_DEFINITION","value":"/validateAppDefinition"},{"name":"WRITE_FILE_BROWSER_CONTENT","value":"/writeFileBrowserFileContent"}]},{"name":"RunEvent","kind":"model","schemaRef":"#/$defs/RunEvent"},{"name":"RunIndex","kind":"model","schemaRef":"#/$defs/RunIndex"},{"name":"RunIndexEntry","kind":"model","schemaRef":"#/$defs/RunIndexEntry"},{"name":"RunMode","kind":"enum","schemaRef":"#/$defs/RunMode","enumValues":[{"name":"mcp","value":"mcp"},{"name":"server","value":"server"},{"name":"sdk","value":"sdk"},{"name":"app_server","value":"app_server"}]},{"name":"RunSnapshotMode","kind":"enum","schemaRef":"#/$defs/RunSnapshotMode","enumValues":[{"name":"ephemeral","value":"ephemeral"},{"name":"always","value":"always"},{"name":"never","value":"never"}]},{"name":"RunSnapshotModeOption","kind":"model","schemaRef":"#/$defs/RunSnapshotModeOption"},{"name":"RunSnapshotModeUIConfigValue","kind":"model","schemaRef":"#/$defs/RunSnapshotModeUIConfigValue"},{"name":"RunStatus","kind":"enum","schemaRef":"#/$defs/RunStatus","enumValues":[{"name":"queued","value":"queued"},{"name":"running","value":"running"},{"name":"completed","value":"completed"},{"name":"failed","value":"failed"},{"name":"cancelled","value":"cancelled"}]},{"name":"RunTargetKind","kind":"enum","schemaRef":"#/$defs/RunTargetKind","enumValues":[{"name":"manual_code","value":"manual_code"},{"name":"generated_entry","value":"generated_entry"}]},{"name":"RunToolsRequest","kind":"model","schemaRef":"#/$defs/RunToolsRequest"},{"name":"RunnerSummaryParam","kind":"model","schemaRef":"#/$defs/RunnerSummaryParam"},{"name":"RunnerSummarySection","kind":"model","schemaRef":"#/$defs/RunnerSummarySection"},{"name":"RunnerSummarySnapshot","kind":"model","schemaRef":"#/$defs/RunnerSummarySnapshot"},{"name":"RunnerSummaryVariant","kind":"model","schemaRef":"#/$defs/RunnerSummaryVariant"},{"name":"RunningBackendVersionHandshake","kind":"model","schemaRef":"#/$defs/RunningBackendVersionHandshake"},{"name":"SaveConflictStrategy","kind":"enum","schemaRef":"#/$defs/SaveConflictStrategy","enumValues":[{"name":"skip","value":"skip"},{"name":"backup","value":"backup"},{"name":"overwrite","value":"overwrite"}]},{"name":"SavePolicy","kind":"enum","schemaRef":"#/$defs/SavePolicy","enumValues":[{"name":"persist","value":"persist"},{"name":"in_memory","value":"in_memory"}]},{"name":"SaveStatus","kind":"enum","schemaRef":"#/$defs/SaveStatus","enumValues":[{"name":"saved","value":"saved"},{"name":"unchanged","value":"unchanged"},{"name":"skipped","value":"skipped"},{"name":"conflict","value":"conflict"}]},{"name":"ScatterChartSettings","kind":"model","schemaRef":"#/$defs/ScatterChartSettings"},{"name":"Section","kind":"model","schemaRef":"#/$defs/Section"},{"name":"SectionCapabilities","kind":"model","schemaRef":"#/$defs/SectionCapabilities"},{"name":"SectionCodegenMode","kind":"enum","schemaRef":"#/$defs/SectionCodegenMode","enumValues":[{"name":"inherit","value":"inherit"},{"name":"include","value":"include"},{"name":"exclude","value":"exclude"}]},{"name":"SectionCodegenOverride","kind":"model","schemaRef":"#/$defs/SectionCodegenOverride"},{"name":"SectionCodegenPolicy","kind":"model","schemaRef":"#/$defs/SectionCodegenPolicy"},{"name":"SectionDependencyKey","kind":"model","schemaRef":"#/$defs/SectionDependencyKey"},{"name":"SectionImpl","kind":"model","schemaRef":"#/$defs/SectionImpl"},{"name":"SectionKind","kind":"enum","schemaRef":"#/$defs/SectionKind","enumValues":[{"name":"code","value":"code"},{"name":"terminal","value":"terminal"},{"name":"draw","value":"draw"},{"name":"generated","value":"generated"}]},{"name":"SectionParamDependencyKey","kind":"model","schemaRef":"#/$defs/SectionParamDependencyKey"},{"name":"SectionRepresentationMode","kind":"enum","schemaRef":"#/$defs/SectionRepresentationMode","enumValues":[{"name":"expression","value":"expression"},{"name":"file_path","value":"file_path"},{"name":"file_read","value":"file_read"}]},{"name":"SectionSize","kind":"model","schemaRef":"#/$defs/SectionSize"},{"name":"SectionSizeMode","kind":"enum","schemaRef":"#/$defs/SectionSizeMode","enumValues":[{"name":"auto","value":"auto"}]},{"name":"SectionSizeValue","kind":"model","schemaRef":"#/$defs/SectionSizeValue"},{"name":"SectionSizingPolicy","kind":"model","schemaRef":"#/$defs/SectionSizingPolicy"},{"name":"SectionSizingPolicyByType","kind":"model","schemaRef":"#/$defs/SectionSizingPolicyByType"},{"name":"SectionSizingPolicyCallableTypeEntry","kind":"model","schemaRef":"#/$defs/SectionSizingPolicyCallableTypeEntry"},{"name":"SectionSizingPolicyGlobals","kind":"model","schemaRef":"#/$defs/SectionSizingPolicyGlobals"},{"name":"SectionSizingPolicyTypeEntry","kind":"model","schemaRef":"#/$defs/SectionSizingPolicyTypeEntry"},{"name":"SectionType","kind":"enum","schemaRef":"#/$defs/SectionType","enumValues":[{"name":"Callable","value":"Callable"},{"name":"Dict","value":"Dict"},{"name":"ListRoot","value":"ListRoot"},{"name":"Group","value":"Group"},{"name":"StateMachineStart","value":"StateMachineStart"},{"name":"StateMachineGate","value":"StateMachineGate"},{"name":"StateMachineEnd","value":"StateMachineEnd"},{"name":"Image","value":"Image"},{"name":"Chart","value":"Chart"},{"name":"Draw","value":"Draw"},{"name":"TextBlock","value":"TextBlock"},{"name":"Prompt","value":"Prompt"},{"name":"MetaControl","value":"MetaControl"},{"name":"Social","value":"Social"},{"name":"GlobalVariables","value":"GlobalVariables"},{"name":"Code","value":"Code"},{"name":"GenPythonCode","value":"GenPythonCode"},{"name":"GenPythonMetadata","value":"GenPythonMetadata"},{"name":"Terminal","value":"Terminal"},{"name":"IFrame","value":"IFrame"},{"name":"Chat","value":"Chat"},{"name":"Browser","value":"Browser"},{"name":"Plugin","value":"Plugin"},{"name":"TaskBoard","value":"TaskBoard"},{"name":"Spreadsheet","value":"Spreadsheet"}]},{"name":"SectionTypeCodegenPolicy","kind":"model","schemaRef":"#/$defs/SectionTypeCodegenPolicy"},{"name":"SectionTypeErrors","kind":"model","schemaRef":"#/$defs/SectionTypeErrors"},{"name":"SectionVariant","kind":"model","schemaRef":"#/$defs/SectionVariant"},{"name":"SectionWithParamsCommon","kind":"model","schemaRef":"#/$defs/SectionWithParamsCommon"},{"name":"SectionWithParamsLeadingFields","kind":"model","schemaRef":"#/$defs/SectionWithParamsLeadingFields"},{"name":"SectionWithParamsTrailingFields","kind":"model","schemaRef":"#/$defs/SectionWithParamsTrailingFields"},{"name":"SectionsClipboardData","kind":"model","schemaRef":"#/$defs/SectionsClipboardData"},{"name":"SelectionMode","kind":"enum","schemaRef":"#/$defs/SelectionMode","enumValues":[{"name":"partial","value":"partial"},{"name":"full","value":"full"}]},{"name":"ServerConfig","kind":"model","schemaRef":"#/$defs/ServerConfig"},{"name":"ServerModeBoundary","kind":"model","schemaRef":"#/$defs/ServerModeBoundary"},{"name":"ServerModeBoundaryPolicy","kind":"alias","schemaRef":"#/$defs/ServerModeBoundaryPolicy"},{"name":"ServerModeBoundaryRoutes","kind":"model","schemaRef":"#/$defs/ServerModeBoundaryRoutes"},{"name":"ServerModeCapabilities","kind":"model","schemaRef":"#/$defs/ServerModeCapabilities"},{"name":"ServiceErrorCode","kind":"enum","schemaRef":"#/$defs/ServiceErrorCode","enumValues":[{"name":"PLUGIN_BACKEND_BUILD_FAILED","value":"PLUGIN_BACKEND_BUILD_FAILED"},{"name":"PLUGIN_BACKEND_RUNTIME_INVALID","value":"PLUGIN_BACKEND_RUNTIME_INVALID"},{"name":"PLUGIN_ASSET_INVALID_PATH","value":"PLUGIN_ASSET_INVALID_PATH"},{"name":"PLUGIN_ASSET_NOT_FOUND","value":"PLUGIN_ASSET_NOT_FOUND"},{"name":"PLUGIN_CONFIG_CHANGED","value":"PLUGIN_CONFIG_CHANGED"},{"name":"PLUGIN_CONFIG_INVALID","value":"PLUGIN_CONFIG_INVALID"},{"name":"PLUGIN_CONFIG_SCHEMA_INVALID","value":"PLUGIN_CONFIG_SCHEMA_INVALID"},{"name":"PLUGIN_INSTALLER_BACKEND_UNAVAILABLE","value":"PLUGIN_INSTALLER_BACKEND_UNAVAILABLE"},{"name":"PLUGIN_INSTALL_METADATA_INVALID","value":"PLUGIN_INSTALL_METADATA_INVALID"},{"name":"PLUGIN_MANAGED_EXTERNALLY","value":"PLUGIN_MANAGED_EXTERNALLY"},{"name":"PLUGIN_GLOBAL_STATE_INVALID","value":"PLUGIN_GLOBAL_STATE_INVALID"},{"name":"PLUGIN_HOST_VERSION_INVALID","value":"PLUGIN_HOST_VERSION_INVALID"},{"name":"PLUGIN_INIT_INVALID_ID","value":"PLUGIN_INIT_INVALID_ID"},{"name":"PLUGIN_INIT_TARGET_EXISTS","value":"PLUGIN_INIT_TARGET_EXISTS"},{"name":"PLUGIN_INSTALL_FAILED","value":"PLUGIN_INSTALL_FAILED"},{"name":"PLUGIN_LINK_FAILED","value":"PLUGIN_LINK_FAILED"},{"name":"PLUGIN_LOCKFILE_ENTRY_MISSING_SOURCE","value":"PLUGIN_LOCKFILE_ENTRY_MISSING_SOURCE"},{"name":"PLUGIN_LOCKFILE_INVALID","value":"PLUGIN_LOCKFILE_INVALID"},{"name":"PLUGIN_LOCKFILE_NOT_FOUND","value":"PLUGIN_LOCKFILE_NOT_FOUND"},{"name":"PLUGIN_MANIFEST_DUPLICATE_CAPABILITY","value":"PLUGIN_MANIFEST_DUPLICATE_CAPABILITY"},{"name":"PLUGIN_MANIFEST_INVALID","value":"PLUGIN_MANIFEST_INVALID"},{"name":"PLUGIN_MANIFEST_INVALID_CAPABILITY","value":"PLUGIN_MANIFEST_INVALID_CAPABILITY"},{"name":"PLUGIN_MANIFEST_PATH_NOT_FOUND","value":"PLUGIN_MANIFEST_PATH_NOT_FOUND"},{"name":"PLUGIN_MANIFEST_UNSUPPORTED_SCHEMA","value":"PLUGIN_MANIFEST_UNSUPPORTED_SCHEMA"},{"name":"PLUGIN_MANIFEST_VERSION_INCOMPATIBLE","value":"PLUGIN_MANIFEST_VERSION_INCOMPATIBLE"},{"name":"PLUGIN_NOT_FOUND","value":"PLUGIN_NOT_FOUND"},{"name":"PLUGIN_RESTART_FAILED","value":"PLUGIN_RESTART_FAILED"},{"name":"PLUGIN_ROLLBACK_UNAVAILABLE","value":"PLUGIN_ROLLBACK_UNAVAILABLE"},{"name":"PLUGIN_SCOPE_INVALID","value":"PLUGIN_SCOPE_INVALID"},{"name":"PLUGIN_STATE_INVALID","value":"PLUGIN_STATE_INVALID"},{"name":"PLUGIN_SOURCE_ARCHIVE_TRAVERSAL","value":"PLUGIN_SOURCE_ARCHIVE_TRAVERSAL"},{"name":"PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT","value":"PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT"},{"name":"PLUGIN_SOURCE_FETCH_FAILED","value":"PLUGIN_SOURCE_FETCH_FAILED"},{"name":"PLUGIN_SOURCE_IDENTITY_MISMATCH","value":"PLUGIN_SOURCE_IDENTITY_MISMATCH"},{"name":"PLUGIN_SOURCE_INVALID","value":"PLUGIN_SOURCE_INVALID"},{"name":"PLUGIN_SOURCE_MANIFEST_NOT_FOUND","value":"PLUGIN_SOURCE_MANIFEST_NOT_FOUND"},{"name":"PLUGIN_SOURCE_NOT_FOUND","value":"PLUGIN_SOURCE_NOT_FOUND"},{"name":"PLUGIN_SOURCE_SCHEME_UNSUPPORTED","value":"PLUGIN_SOURCE_SCHEME_UNSUPPORTED"},{"name":"PLUGIN_SOURCE_VERSION_MISMATCH","value":"PLUGIN_SOURCE_VERSION_MISMATCH"},{"name":"PLUGIN_TARGET_EXISTS","value":"PLUGIN_TARGET_EXISTS"},{"name":"PLUGIN_TARGET_PATH_TRAVERSAL","value":"PLUGIN_TARGET_PATH_TRAVERSAL"},{"name":"PLUGIN_UNINSTALL_SCOPE_REQUIRED","value":"PLUGIN_UNINSTALL_SCOPE_REQUIRED"},{"name":"PLUGIN_UPDATE_UNAVAILABLE","value":"PLUGIN_UPDATE_UNAVAILABLE"}]},{"name":"Session","kind":"model","schemaRef":"#/$defs/Session"},{"name":"SetSystemPromptRequest","kind":"model","schemaRef":"#/$defs/SetSystemPromptRequest"},{"name":"SettaAPIPreset","kind":"model","schemaRef":"#/$defs/SettaAPIPreset"},{"name":"SettaAPIPresetConfigValue","kind":"model","schemaRef":"#/$defs/SettaAPIPresetConfigValue"},{"name":"SettaAPIPresetRoutes","kind":"model","schemaRef":"#/$defs/SettaAPIPresetRoutes"},{"name":"SettaAPIPresetRuntimeValueTokens","kind":"model","schemaRef":"#/$defs/SettaAPIPresetRuntimeValueTokens"},{"name":"SettaFilesLocation","kind":"enum","schemaRef":"#/$defs/SettaFilesLocation","enumValues":[{"name":"auto","value":"auto"},{"name":"local","value":"local"},{"name":"global","value":"global"}]},{"name":"SettaFilesLocationPolicy","kind":"model","schemaRef":"#/$defs/SettaFilesLocationPolicy"},{"name":"SettingsBackend","kind":"model","schemaRef":"#/$defs/SettingsBackend"},{"name":"SettingsChatWindowing","kind":"model","schemaRef":"#/$defs/SettingsChatWindowing"},{"name":"SettingsChatWindowingShortcuts","kind":"model","schemaRef":"#/$defs/SettingsChatWindowingShortcuts"},{"name":"SettingsGUI","kind":"model","schemaRef":"#/$defs/SettingsGUI"},{"name":"SettingsLanguageServer","kind":"model","schemaRef":"#/$defs/SettingsLanguageServer"},{"name":"SettingsManagedBlock","kind":"model","schemaRef":"#/$defs/SettingsManagedBlock"},{"name":"SettingsMode","kind":"enum","schemaRef":"#/$defs/SettingsMode","enumValues":[{"name":"read_only","value":"read_only"},{"name":"managed_local","value":"managed_local"},{"name":"managed_project","value":"managed_project"},{"name":"explicit_path","value":"explicit_path"}]},{"name":"SettingsShortcuts","kind":"model","schemaRef":"#/$defs/SettingsShortcuts"},{"name":"SettingsState","kind":"model","schemaRef":"#/$defs/SettingsState"},{"name":"SettingsUpdateMessage","kind":"model","schemaRef":"#/$defs/SettingsUpdateMessage"},{"name":"Severity","kind":"enum","schemaRef":"#/$defs/Severity","enumValues":[{"name":"info","value":"info"},{"name":"warning","value":"warning"},{"name":"error","value":"error"},{"name":"critical","value":"critical"}]},{"name":"SharePolicyOverrides","kind":"model","schemaRef":"#/$defs/SharePolicyOverrides"},{"name":"ShownParamIDDetails","kind":"model","schemaRef":"#/$defs/ShownParamIDDetails"},{"name":"ShownParamIDs","kind":"model","schemaRef":"#/$defs/ShownParamIDs"},{"name":"SignatureHelpStatus","kind":"enum","schemaRef":"#/$defs/SignatureHelpStatus","enumValues":[{"name":"matched","value":"matched"},{"name":"no_match","value":"no_match"},{"name":"skipped","value":"skipped"}]},{"name":"SingleConfig","kind":"model","schemaRef":"#/$defs/SingleConfig"},{"name":"SingletonSections","kind":"model","schemaRef":"#/$defs/SingletonSections"},{"name":"SliderParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/SliderParamCodeObjImpl"},{"name":"SpreadsheetGridDensity","kind":"enum","schemaRef":"#/$defs/SpreadsheetGridDensity","enumValues":[{"name":"compact","value":"compact"},{"name":"comfortable","value":"comfortable"}]},{"name":"SpreadsheetSectionImpl","kind":"model","schemaRef":"#/$defs/SpreadsheetSectionImpl"},{"name":"StateMachineCountOperator","kind":"enum","schemaRef":"#/$defs/StateMachineCountOperator","enumValues":[{"name":"lt","value":"lt"},{"name":"lte","value":"lte"},{"name":"eq","value":"eq"},{"name":"gte","value":"gte"},{"name":"gt","value":"gt"}]},{"name":"StateMachineCountOperatorOption","kind":"model","schemaRef":"#/$defs/StateMachineCountOperatorOption"},{"name":"StateMachineEdge","kind":"model","schemaRef":"#/$defs/StateMachineEdge"},{"name":"StateMachineEndSectionImpl","kind":"model","schemaRef":"#/$defs/StateMachineEndSectionImpl"},{"name":"StateMachineGateSectionImpl","kind":"model","schemaRef":"#/$defs/StateMachineGateSectionImpl"},{"name":"StateMachineGateType","kind":"enum","schemaRef":"#/$defs/StateMachineGateType","enumValues":[{"name":"AND","value":"AND"},{"name":"OR","value":"OR"},{"name":"XOR","value":"XOR"}]},{"name":"StateMachineGateTypeOption","kind":"model","schemaRef":"#/$defs/StateMachineGateTypeOption"},{"name":"StateMachineGateUIState","kind":"model","schemaRef":"#/$defs/StateMachineGateUIState"},{"name":"StateMachinePermissionModeOption","kind":"model","schemaRef":"#/$defs/StateMachinePermissionModeOption"},{"name":"StateMachinePromptSourceOption","kind":"model","schemaRef":"#/$defs/StateMachinePromptSourceOption"},{"name":"StateMachinePromptSourceType","kind":"enum","schemaRef":"#/$defs/StateMachinePromptSourceType","enumValues":[{"name":"inline_prompt","value":"inline_prompt"},{"name":"prompt_template","value":"prompt_template"},{"name":"prompt_section","value":"prompt_section"}]},{"name":"StateMachinePromptSourceTypesValue","kind":"model","schemaRef":"#/$defs/StateMachinePromptSourceTypesValue"},{"name":"StateMachineSectionSettings","kind":"model","schemaRef":"#/$defs/StateMachineSectionSettings"},{"name":"StateMachineSourceActivationCountCondition","kind":"model","schemaRef":"#/$defs/StateMachineSourceActivationCountCondition"},{"name":"StateMachineSourceFilter","kind":"model","schemaRef":"#/$defs/StateMachineSourceFilter"},{"name":"StateMachineSourceFilterType","kind":"enum","schemaRef":"#/$defs/StateMachineSourceFilterType","enumValues":[{"name":"run_completed","value":"run_completed"},{"name":"run_failed","value":"run_failed"},{"name":"signal","value":"signal"}]},{"name":"StateMachineSourceFilterTypeOption","kind":"model","schemaRef":"#/$defs/StateMachineSourceFilterTypeOption"},{"name":"StateMachineStartSectionImpl","kind":"model","schemaRef":"#/$defs/StateMachineStartSectionImpl"},{"name":"StateMachineTargetAction","kind":"model","schemaRef":"#/$defs/StateMachineTargetAction"},{"name":"StateMachineTargetActionType","kind":"enum","schemaRef":"#/$defs/StateMachineTargetActionType","enumValues":[{"name":"send_prompt","value":"send_prompt"},{"name":"reset_thread","value":"reset_thread"}]},{"name":"StateMachineTargetActionTypeOption","kind":"model","schemaRef":"#/$defs/StateMachineTargetActionTypeOption"},{"name":"StateMachineThreadStrategy","kind":"enum","schemaRef":"#/$defs/StateMachineThreadStrategy","enumValues":[{"name":"continue_current_thread","value":"continue_current_thread"},{"name":"new_thread_before_send","value":"new_thread_before_send"}]},{"name":"StateMachineThreadStrategyOption","kind":"model","schemaRef":"#/$defs/StateMachineThreadStrategyOption"},{"name":"StateMachineUIConfigValue","kind":"model","schemaRef":"#/$defs/StateMachineUIConfigValue"},{"name":"StatusTransportRoutes","kind":"model","schemaRef":"#/$defs/StatusTransportRoutes"},{"name":"StreamingEventType","kind":"enum","schemaRef":"#/$defs/StreamingEventType","enumValues":[{"name":"message_start","value":"message_start"},{"name":"delta","value":"delta"},{"name":"tool_call_delta","value":"tool_call_delta"},{"name":"tool_argument_preview_delta","value":"tool_argument_preview_delta"},{"name":"tool_result","value":"tool_result"},{"name":"message_stop","value":"message_stop"},{"name":"message_finalized","value":"message_finalized"}]},{"name":"SwitchParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/SwitchParamCodeObjImpl"},{"name":"SystemChatMessage","kind":"model","schemaRef":"#/$defs/SystemChatMessage"},{"name":"Target","kind":"enum","schemaRef":"#/$defs/Target","enumValues":[{"name":"main","value":"main"},{"name":"settings","value":"settings"}]},{"name":"TaskBoardColumn","kind":"model","schemaRef":"#/$defs/TaskBoardColumn"},{"name":"TaskBoardRecurrenceOption","kind":"model","schemaRef":"#/$defs/TaskBoardRecurrenceOption"},{"name":"TaskBoardRecurringMonth","kind":"enum","schemaRef":"#/$defs/TaskBoardRecurringMonth","enumValues":[{"name":"january","value":"january"},{"name":"february","value":"february"},{"name":"march","value":"march"},{"name":"april","value":"april"},{"name":"may","value":"may"},{"name":"june","value":"june"},{"name":"july","value":"july"},{"name":"august","value":"august"},{"name":"september","value":"september"},{"name":"october","value":"october"},{"name":"november","value":"november"},{"name":"december","value":"december"}]},{"name":"TaskBoardRecurringMonthOption","kind":"model","schemaRef":"#/$defs/TaskBoardRecurringMonthOption"},{"name":"TaskBoardRecurringWeekday","kind":"enum","schemaRef":"#/$defs/TaskBoardRecurringWeekday","enumValues":[{"name":"monday","value":"monday"},{"name":"tuesday","value":"tuesday"},{"name":"wednesday","value":"wednesday"},{"name":"thursday","value":"thursday"},{"name":"friday","value":"friday"},{"name":"saturday","value":"saturday"},{"name":"sunday","value":"sunday"}]},{"name":"TaskBoardRecurringWeekdayOption","kind":"model","schemaRef":"#/$defs/TaskBoardRecurringWeekdayOption"},{"name":"TaskBoardSectionImpl","kind":"model","schemaRef":"#/$defs/TaskBoardSectionImpl"},{"name":"TaskBoardTask","kind":"model","schemaRef":"#/$defs/TaskBoardTask"},{"name":"TaskBoardTaskRecurrence","kind":"enum","schemaRef":"#/$defs/TaskBoardTaskRecurrence","enumValues":[{"name":"none","value":"none"},{"name":"hourly","value":"hourly"},{"name":"daily","value":"daily"},{"name":"specified_days","value":"specified_days"},{"name":"specified_months","value":"specified_months"},{"name":"specified_years","value":"specified_years"}]},{"name":"TaskBoardUIConfigValue","kind":"model","schemaRef":"#/$defs/TaskBoardUIConfigValue"},{"name":"TaskBoardViewMode","kind":"enum","schemaRef":"#/$defs/TaskBoardViewMode","enumValues":[{"name":"task_list","value":"task_list"},{"name":"kanban","value":"kanban"}]},{"name":"TaskBoardViewModeOption","kind":"model","schemaRef":"#/$defs/TaskBoardViewModeOption"},{"name":"Template","kind":"model","schemaRef":"#/$defs/Template"},{"name":"TerminalSectionImpl","kind":"model","schemaRef":"#/$defs/TerminalSectionImpl"},{"name":"TerminalSessionMode","kind":"enum","schemaRef":"#/$defs/TerminalSessionMode","enumValues":[{"name":"Interactive","value":""},{"name":"managed_console","value":"managed_console"}]},{"name":"TextAreaParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/TextAreaParamCodeObjImpl"},{"name":"TextBlockDisplayMode","kind":"enum","schemaRef":"#/$defs/TextBlockDisplayMode","enumValues":[{"name":"Render","value":"Render"},{"name":"Edit","value":"Edit"}]},{"name":"TextBlockFormat","kind":"enum","schemaRef":"#/$defs/TextBlockFormat","enumValues":[{"name":"Plaintext","value":"Plaintext"},{"name":"Markdown","value":"Markdown"}]},{"name":"TextBlockSectionImpl","kind":"model","schemaRef":"#/$defs/TextBlockSectionImpl"},{"name":"TextParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/TextParamCodeObjImpl"},{"name":"TextParamDateCalendarWeekStartOption","kind":"model","schemaRef":"#/$defs/TextParamDateCalendarWeekStartOption"},{"name":"TextParamDateControlModeOption","kind":"model","schemaRef":"#/$defs/TextParamDateControlModeOption"},{"name":"TextParamDateDisplayFormatOption","kind":"model","schemaRef":"#/$defs/TextParamDateDisplayFormatOption"},{"name":"TextParamDateSelectionModeOption","kind":"model","schemaRef":"#/$defs/TextParamDateSelectionModeOption"},{"name":"TextParamInputUIType","kind":"enum","schemaRef":"#/$defs/TextParamInputUIType","enumValues":[{"name":"plain","value":"plain"},{"name":"time","value":"time"},{"name":"date","value":"date"}]},{"name":"TextParamTimeControlModeOption","kind":"model","schemaRef":"#/$defs/TextParamTimeControlModeOption"},{"name":"TextParamTimeDisplayFontOption","kind":"model","schemaRef":"#/$defs/TextParamTimeDisplayFontOption"},{"name":"TextParamTimeDisplayFormatOption","kind":"model","schemaRef":"#/$defs/TextParamTimeDisplayFormatOption"},{"name":"TextParamUIConfigValue","kind":"model","schemaRef":"#/$defs/TextParamUIConfigValue"},{"name":"TimeControlMode","kind":"enum","schemaRef":"#/$defs/TimeControlMode","enumValues":[{"name":"input","value":"input"},{"name":"display","value":"display"}]},{"name":"TimeDisplayFont","kind":"enum","schemaRef":"#/$defs/TimeDisplayFont","enumValues":[{"name":"clock","value":"clock"},{"name":"monospace","value":"monospace"},{"name":"system","value":"system"}]},{"name":"TimeDisplayFormat","kind":"enum","schemaRef":"#/$defs/TimeDisplayFormat","enumValues":[{"name":"twenty_four_hour","value":"twenty_four_hour"},{"name":"twelve_hour","value":"twelve_hour"}]},{"name":"TimeParamCodeObjImpl","kind":"model","schemaRef":"#/$defs/TimeParamCodeObjImpl"},{"name":"ToggleParamSelectedInput","kind":"model","schemaRef":"#/$defs/ToggleParamSelectedInput"},{"name":"ToolArgumentPreviewDeltaEvent","kind":"model","schemaRef":"#/$defs/ToolArgumentPreviewDeltaEvent"},{"name":"ToolArgumentPreviewTargetIDs","kind":"model","schemaRef":"#/$defs/ToolArgumentPreviewTargetIDs"},{"name":"ToolCall","kind":"model","schemaRef":"#/$defs/ToolCall"},{"name":"ToolCallDeltaEvent","kind":"model","schemaRef":"#/$defs/ToolCallDeltaEvent"},{"name":"ToolCallFunction","kind":"model","schemaRef":"#/$defs/ToolCallFunction"},{"name":"ToolChatMessage","kind":"model","schemaRef":"#/$defs/ToolChatMessage"},{"name":"ToolNameNormalization","kind":"model","schemaRef":"#/$defs/ToolNameNormalization"},{"name":"ToolReferenceContent","kind":"model","schemaRef":"#/$defs/ToolReferenceContent"},{"name":"ToolResultEvent","kind":"model","schemaRef":"#/$defs/ToolResultEvent"},{"name":"ToolType","kind":"enum","schemaRef":"#/$defs/ToolType","enumValues":[{"name":"claude_code","value":"claude_code"},{"name":"codex","value":"codex"}]},{"name":"TopLevelSectionLayout","kind":"model","schemaRef":"#/$defs/TopLevelSectionLayout"},{"name":"TranscriptionProfile","kind":"model","schemaRef":"#/$defs/TranscriptionProfile"},{"name":"TranscriptionProfileTransportModeOption","kind":"model","schemaRef":"#/$defs/TranscriptionProfileTransportModeOption"},{"name":"TranscriptionProfileTransportModesValue","kind":"model","schemaRef":"#/$defs/TranscriptionProfileTransportModesValue"},{"name":"TranscriptionProfileUIConfigValue","kind":"model","schemaRef":"#/$defs/TranscriptionProfileUIConfigValue"},{"name":"TranscriptionProfilesUpdatedContent","kind":"model","schemaRef":"#/$defs/TranscriptionProfilesUpdatedContent"},{"name":"TranscriptionProfilesUpdatedMessage","kind":"model","schemaRef":"#/$defs/TranscriptionProfilesUpdatedMessage"},{"name":"Transport","kind":"enum","schemaRef":"#/$defs/Transport","enumValues":[{"name":"sse","value":"sse"},{"name":"streamable_http","value":"streamable_http"},{"name":"stdio","value":"stdio"}]},{"name":"TransportMode","kind":"enum","schemaRef":"#/$defs/TransportMode","enumValues":[{"name":"auto","value":"auto"},{"name":"file","value":"file"},{"name":"realtime","value":"realtime"}]},{"name":"TransportRoutes","kind":"model","schemaRef":"#/$defs/TransportRoutes"},{"name":"Type","kind":"enum","schemaRef":"#/$defs/Type","enumValues":[{"name":"share","value":"share"},{"name":"app","value":"app"}]},{"name":"TypeErrorIgnoreState","kind":"model","schemaRef":"#/$defs/TypeErrorIgnoreState"},{"name":"UIEditorTabName","kind":"enum","schemaRef":"#/$defs/UIEditorTabName","enumValues":[{"name":"SectionConfig","value":"SectionConfig"},{"name":"QuickInfoConfig","value":"QuickInfoConfig"},{"name":"UIConfig","value":"UIConfig"},{"name":"InfoConfig","value":"InfoConfig"},{"name":"SectionVariantsConfig","value":"SectionVariantsConfig"}]},{"name":"UIEditorTabNamesValue","kind":"model","schemaRef":"#/$defs/UIEditorTabNamesValue"},{"name":"UIEditorTabTitlesValue","kind":"model","schemaRef":"#/$defs/UIEditorTabTitlesValue"},{"name":"UIEditorTabUIConfigValue","kind":"model","schemaRef":"#/$defs/UIEditorTabUIConfigValue"},{"name":"UISettingRevealActivationStep","kind":"model","schemaRef":"#/$defs/UISettingRevealActivationStep"},{"name":"UISettingRevealContent","kind":"model","schemaRef":"#/$defs/UISettingRevealContent"},{"name":"UISettingRevealMessage","kind":"model","schemaRef":"#/$defs/UISettingRevealMessage"},{"name":"UISettingRevealResultContent","kind":"model","schemaRef":"#/$defs/UISettingRevealResultContent"},{"name":"UISettingRevealResultMessage","kind":"model","schemaRef":"#/$defs/UISettingRevealResultMessage"},{"name":"UISettingRevealResultStatus","kind":"model","schemaRef":"#/$defs/UISettingRevealResultStatus"},{"name":"UISettingRevealTarget","kind":"model","schemaRef":"#/$defs/UISettingRevealTarget"},{"name":"UngroupGroupsInput","kind":"model","schemaRef":"#/$defs/UngroupGroupsInput"},{"name":"UnindentParamsInput","kind":"model","schemaRef":"#/$defs/UnindentParamsInput"},{"name":"UpdateArtifactsContent","kind":"model","schemaRef":"#/$defs/UpdateArtifactsContent"},{"name":"UpdateArtifactsMessage","kind":"model","schemaRef":"#/$defs/UpdateArtifactsMessage"},{"name":"UpdateRequest","kind":"model","schemaRef":"#/$defs/UpdateRequest"},{"name":"UploadScope","kind":"enum","schemaRef":"#/$defs/UploadScope","enumValues":[{"name":"chat","value":"chat"},{"name":"generic","value":"generic"}]},{"name":"UserChatMessage","kind":"model","schemaRef":"#/$defs/UserChatMessage"},{"name":"ValidationIssue","kind":"model","schemaRef":"#/$defs/ValidationIssue"},{"name":"ValidationResult","kind":"model","schemaRef":"#/$defs/ValidationResult"},{"name":"Variant","kind":"model","schemaRef":"#/$defs/Variant"},{"name":"ViewMode","kind":"model","schemaRef":"#/$defs/ViewMode"},{"name":"Viewport","kind":"model","schemaRef":"#/$defs/Viewport"},{"name":"ViewportBounds","kind":"model","schemaRef":"#/$defs/ViewportBounds"},{"name":"WatchCodeCallableKind","kind":"enum","schemaRef":"#/$defs/WatchCodeCallableKind","enumValues":[{"name":"function","value":"function"},{"name":"async_function","value":"async_function"},{"name":"class_init","value":"class_init"}]},{"name":"WatchCodeFolder","kind":"model","schemaRef":"#/$defs/WatchCodeFolder"},{"name":"WatchCodeRegistryEntry","kind":"model","schemaRef":"#/$defs/WatchCodeRegistryEntry"},{"name":"WebsocketMessage","kind":"model","schemaRef":"#/$defs/WebsocketMessage"},{"name":"WebsocketMessageType","kind":"enum","schemaRef":"#/$defs/WebsocketMessageType","enumValues":[{"name":"Notification","value":"Notification"},{"name":"AllProjectMetadata","value":"AllProjectMetadata"},{"name":"AllConnections","value":"AllConnections"},{"name":"FrontendIdentity","value":"FrontendIdentity"},{"name":"ListenerCoverageSnapshot","value":"ListenerCoverageSnapshot"},{"name":"UpdateArtifacts","value":"UpdateArtifacts"},{"name":"LLMStreamingResponse","value":"LLMStreamingResponse"},{"name":"AIFollowToolArgumentsUpdate","value":"AIFollowToolArgumentsUpdate"},{"name":"AIFollowToolResultUpdate","value":"AIFollowToolResultUpdate"},{"name":"UISettingReveal","value":"UISettingReveal"},{"name":"LSPDiagnostics","value":"LSPDiagnostics"},{"name":"NameValidationErrors","value":"NameValidationErrors"},{"name":"LLMConfigUpdated","value":"LLMConfigUpdated"},{"name":"LLMApiKeysUpdated","value":"LLMApiKeysUpdated"},{"name":"ExternalAgentConfigsUpdated","value":"ExternalAgentConfigsUpdated"},{"name":"EngineConfigsUpdated","value":"EngineConfigsUpdated"},{"name":"AgentProfilesUpdated","value":"AgentProfilesUpdated"},{"name":"AgentRunUpdated","value":"AgentRunUpdated"},{"name":"PromptTemplatesUpdated","value":"PromptTemplatesUpdated"},{"name":"TranscriptionProfilesUpdated","value":"TranscriptionProfilesUpdated"},{"name":"UpdateFrontendProjectState","value":"UpdateFrontendProjectState"},{"name":"UpdateSettings","value":"UpdateSettings"},{"name":"UpdatePluginRuntime","value":"UpdatePluginRuntime"},{"name":"ReturnRenameRefactorResults","value":"ReturnRenameRefactorResults"},{"name":"BackendLogEvent","value":"BackendLogEvent"}]},{"name":"WebsocketTransportRoutes","kind":"model","schemaRef":"#/$defs/WebsocketTransportRoutes"},{"name":"WindowSpaceConfig","kind":"model","schemaRef":"#/$defs/WindowSpaceConfig"},{"name":"WindowSpaceState","kind":"model","schemaRef":"#/$defs/WindowSpaceState"},{"name":"WindowSpaceSurfaceKind","kind":"enum","schemaRef":"#/$defs/WindowSpaceSurfaceKind","enumValues":[{"name":"project_chat","value":"project_chat"},{"name":"section","value":"section"}]},{"name":"WindowSpaceWindow","kind":"model","schemaRef":"#/$defs/WindowSpaceWindow"},{"name":"WorkingDirStrategy","kind":"enum","schemaRef":"#/$defs/WorkingDirStrategy","enumValues":[{"name":"project_root","value":"project_root"},{"name":"temp_dir","value":"temp_dir"},{"name":"custom","value":"custom"}]},{"name":"WorkspaceLaunchRouteKind","kind":"enum","schemaRef":"#/$defs/WorkspaceLaunchRouteKind","enumValues":[{"name":"ide","value":"ide"},{"name":"launcher","value":"launcher"},{"name":"blocked","value":"blocked"}]}]');
const exportedValues = /* @__PURE__ */ JSON.parse(`[{"name":"AppSpecPatchPolicyConfig","type":"PatchPolicy","value":{"allowedOps":["set","add","replace","remove"],"commentPrefix":"//","elementsPathPrefix":"/elements/","rootPath":"/root","rootResetValue":"","valueOptionalOps":["remove"]}},{"name":"AppSubsystemChatUIConfig","type":"AppSubsystemChatUIConfigValue","value":{"customSlashCommandModeOptions":[{"label":"Plain chat","requiresImageAttachment":false,"value":"plain_chat"},{"label":"JSON Render","requiresImageAttachment":false,"value":"json_render"},{"label":"Image to JSON Render","requiresImageAttachment":true,"value":"json_render_with_image"},{"label":"Prompt Builder","requiresImageAttachment":false,"value":"prompt_builder"},{"label":"MCP Server","requiresImageAttachment":false,"value":"mcp_server"}],"defaultCustomSlashCommandMode":"plain_chat","slashCommands":[{"action":"app_json_render","appGenerationMode":"json_render","command":"/app-json","promptTemplate":"Generate a polished standalone JSON-render app spec. Use a strong hero section, clear content grouping, and consistent spacing/typography by default. Include one obvious primary action path and production-ready baseline structure.","summary":"Generate a standalone app spec through JSON render."},{"action":"app_json_render_with_image","appGenerationMode":"json_render_with_image","command":"/app-image","promptTemplate":"Generate a JSON-render app spec that matches the attached reference image as closely as possible. Prioritize layout composition first, then spacing, typography scale, and color intent. Stay within catalog constraints and preserve the closest visual approximation when exact parity is impossible.","summary":"Generate an app spec using attached image guidance."},{"action":"app_prompt_builder","appGenerationMode":"prompt_builder","command":"/app-prompt","promptTemplate":"Generate a practical, polished JSON-render app spec for this project. Use strong information hierarchy, clear spacing rhythm, and one primary action path. Persist the result into the project via Setta app-definition tools.","summary":"Generate an app-definition plan for chat-driven iteration."},{"action":"app_mcp_server","appGenerationMode":"mcp_server","command":"/app-mcp","promptTemplate":"Use MCP tools to produce a high-fidelity UI implementation for this project. If design-import tools are available, import an existing design or generate one before mapping it back into Setta's app definition. Preserve clear hierarchy, responsive layout behavior, and practical defaults.","summary":"Route app generation through MCP-capable tools."}]}},{"name":"BootstrapProtocol","type":"BootstrapHandoffProtocol","value":{"backendOriginOverrideQueryParam":"__setta_backend_origin","launcherOriginHashParam":"lo","launcherOriginProofHashParam":"lop","launcherOriginStorageKey":"setta.launcherOrigin","maxValueLength":8192,"openWorkspaceSwitcherHashParam":"osw","openWorkspaceSwitcherQueryParam":"__setta_open_workspace_switcher","workspaceHistoryHashParam":"wh","workspaceHistoryQueryParam":"__setta_workspace_history","workspaceHistoryStorageKey":"setta.workspaceHistoryHandoff"}},{"name":"ButtonParamUIConfig","type":"ButtonParamUIConfigValue","value":{"actionModeOptions":[{"label":"Websocket listener","value":"WEBSOCKET_LISTENER"},{"label":"HTTP request","value":"HTTP_REQUEST"},{"label":"Setta API","value":"SETTA_API"}],"defaultActionMode":"WEBSOCKET_LISTENER","defaultRequestMethod":"POST","requestMethodOptions":[{"label":"GET","value":"GET"},{"label":"POST","value":"POST"},{"label":"PUT","value":"PUT"},{"label":"PATCH","value":"PATCH"},{"label":"DELETE","value":"DELETE"},{"label":"HEAD","value":"HEAD"},{"label":"OPTIONS","value":"OPTIONS"}]}},{"name":"C","type":"Constants","value":{"AUTH_COOKIE_REFRESH_WINDOW_SECONDS":3600,"CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES":[],"CHAT_ATTACHMENTS_MAX_FILES":10,"CHAT_ATTACHMENTS_MAX_FILE_BYTES":26214400,"CHAT_ATTACHMENTS_MAX_FILE_LABEL":"25 MB","DEFAULT_HOST":"127.0.0.1","DEFAULT_PORT":8000,"DROPZONE_ALLOWED_MIME_PREFIXES":[],"DROPZONE_STATEFUL_MAX_FILE_BYTES":26214400,"DROPZONE_STATEFUL_MAX_FILE_LABEL":"25 MB","DROPZONE_STATELESS_MAX_FILE_BYTES":5242880,"DROPZONE_STATELESS_MAX_FILE_LABEL":"5 MB","DROPZONE_STATELESS_MAX_TOTAL_BYTES":16777216,"DROPZONE_STATELESS_MAX_TOTAL_LABEL":"16 MB","EDGE_OUTPUT_BASE_LABEL":"value","GEN_CODE_SEPARATOR_NEWLINES":2,"LLM_TEXT":"text","LLM_THINKING":"thinking","NOTIFICATION_IS_FOR_ALL_PROJECTS":"NOTIFICATION_IS_FOR_ALL_PROJECTS","REALTIME_BINARY_MAX_BYTES":10485760,"SETTA_TERMINAL_READY":"SETTA_TERMINAL_READY","SETTINGS_PROJECT_NAME":"settings","WS_TERMINAL_RESIZE":"terminalResize"}},{"name":"ChangeParamImplUIConfig","type":"ChangeParamImplUIConfigValue","value":{"allParamCodeObjTypes":["CodeParam","TextParam","DateParam","TimeParam","ButtonParam","SliderParam","RotaryParam","SwitchParam","ColorPickerParam","DropdownParam","PasswordParam","TextAreaParam","DropzoneParam","NestedParam"],"controlCodeObjTypes":["CodeParam","TextParam","DateParam","TimeParam","ButtonParam","SliderParam","RotaryParam","SwitchParam","ColorPickerParam","DropdownParam","PasswordParam","TextAreaParam","DropzoneParam"],"sectionParamCodeObjTypes":["CodeParam","TextParam","DateParam","TimeParam","SliderParam","RotaryParam","SwitchParam","ColorPickerParam","DropdownParam","PasswordParam","TextAreaParam","DropzoneParam","NestedParam"]}},{"name":"ChatRunTypesByName","type":"ChatRunTypeSet","value":{"external_agent":true,"llm_chat":true,"scriptable_chat":true}},{"name":"ChildDefaultsUIConfig","type":"ChildDefaultsUIConfigValue","value":{"listRootViewModeOptions":[{"label":"Default Stack","value":"default"},{"label":"Task List","value":"task_list"},{"label":"Kanban Board","value":"kanban"}]}},{"name":"DefaultAppPolicy","type":"Policy","value":{"allowExternalLinks":false,"allowFileDownloads":false,"allowLLM":false,"allowLayoutChanges":false,"allowMultipleRuns":true,"allowParamChanges":true,"allowRun":true,"allowVariantChanges":false,"runSnapshotMode":"ephemeral"}},{"name":"EndpointOriginPolicyByRoute","type":"EndpointOriginPolicy","value":{"/__setta__/tools/call":"backend-origin","/addLauncherRecentWorkspace":"launcher","/createWorkspaceLaunchIntent":"launcher","/launch":"launcher","/launcherFilesystemRoots":"launcher","/launcherRecentWorkspaces":"launcher","/listLauncherDirectory":"launcher","/openLauncherWorkspace":"launcher","/pinLauncherRecentWorkspace":"launcher","/removeLauncherRecentWorkspace":"launcher","/settaHomeInfo":"backend"}},{"name":"ExternalAgentUIConfig","type":"ExternalAgentUIConfigValue","value":{"claudeApprovalPolicyOptions":[{"label":"Use settings file / chat override","value":""},{"label":"Default","value":"default"},{"label":"Accept edits","value":"acceptEdits"},{"label":"Plan","value":"plan"},{"label":"YOLO (bypassPermissions)","value":"bypassPermissions"}],"defaultClaudeAskRules":["Bash(rm:*)","Bash(sudo:*)","Bash(chmod:*)","Bash(chown:*)","Bash(git push:*)","Bash(git reset:*)","Bash(git clean:*)","Bash(dd:*)","Bash(mkfs:*)","Bash(diskutil:*)","Bash(shutdown:*)","Bash(reboot:*)"],"defaultClaudeSettingsSources":["project","local"]}},{"name":"LocalHostnamePolicyConfig","type":"LocalHostnamePolicy","value":{"loopbackHosts":["127.0.0.1","localhost","::1"]}},{"name":"ModeScopedLauncherRoutesList","type":"ModeScopedLauncherRoutes","value":["/launch","/createWorkspaceLaunchIntent"]},{"name":"NameValidationRules","type":"NameValidationContract","value":{"projectReservedNames":["home","settings"],"pythonIdentifierContinueChars":["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","_","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"],"pythonIdentifierStartChars":["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","_","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"],"pythonKeywords":["False","None","True","and","as","assert","async","await","break","case","class","continue","def","del","elif","else","except","finally","for","from","global","if","import","in","is","lambda","match","nonlocal","not","or","pass","raise","return","try","type","while","with","yield"],"simpleNameAllowedChars":[" ","-","0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","_","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"],"slugReplacementChars":["[","]","\\"","'"," "]}},{"name":"OverviewTabUIConfig","type":"OverviewTabUIConfigValue","value":{"names":{"App":"App","FileBrowser":"FileBrowser","Git":"Git","Notifications":"Notifications","Overview":"Overview","Plugins":"Plugins","ProjectAIChat":"ProjectAIChat","ProjectAISettings":"ProjectAISettings","RunInstructions":"RunInstructions","ViewModes":"ViewModes"},"pluginPanePrefix":"PluginPane","titles":{"App":"JSON Render","FileBrowser":"Explorer","Git":"Git","Notifications":"Notifications","Overview":"Overview","Plugins":"Plugins","ProjectAIChat":"Project AI Chat","ProjectAISettings":"Project AI Settings","RunInstructions":"Custom Runs","ViewModes":"View Modes"}}},{"name":"ProjectChatUIConfig","type":"ProjectChatUIConfigValue","value":{"agenticEdgeContextModeOptions":[{"label":"Reference only","value":"reference_only"},{"label":"Inline text","value":"inline_text"},{"label":"Summary","value":"summary"}],"permissionModeOptions":[{"label":"minimal","value":"minimal"},{"label":"yolo","value":"yolo"},{"label":"config.toml custom","value":"config_toml_custom"}],"projectDictationModeOptions":[{"label":"Auto","value":"auto"},{"label":"Provider","value":"provider"},{"label":"Browser","value":"browser"}],"sectionChatWindowModeOptions":[{"label":"Section mode (edge scoped)","value":"section_mode"},{"label":"Project AI mode (full project)","value":"project_ai_mode"}],"sectionDictationModeOptions":[{"label":"Auto","value":"auto"},{"label":"Browser","value":"browser"},{"label":"Provider","value":"provider"}]}},{"name":"PythonCodegenPolicyUIConfig","type":"PythonCodegenPolicyUIConfigValue","value":{"codeObjRepresentationOptionsByType":{"ButtonParam":["expression"],"CodeCallable":["expression"],"CodeParam":["expression","string"],"ColorPickerParam":["string"],"DateParam":["string"],"DropdownParam":["expression","string"],"DropzoneParam":["file_path","file_read"],"NestedParam":["expression"],"PasswordParam":["string"],"RotaryParam":["expression","string"],"SliderParam":["expression","json_parsed","string"],"SwitchParam":["expression","string"],"TextAreaParam":["string"],"TextParam":["string"],"TimeParam":["string"]},"codeObjTypes":["CodeParam","TextParam","DateParam","TimeParam","ButtonParam","SliderParam","RotaryParam","SwitchParam","ColorPickerParam","DropdownParam","PasswordParam","TextAreaParam","DropzoneParam","NestedParam"],"defaultCodeObjRepresentationOptions":["expression"],"defaultSectionRepresentationOptions":["expression"],"metaControlCodeObjTypes":[{"label":"Dropdown","type":"DropdownParam"},{"label":"Slider","type":"SliderParam"},{"label":"Rotary","type":"RotaryParam"},{"label":"Switch","type":"SwitchParam"},{"label":"Text Input","type":"TextParam"},{"label":"Date Input","type":"DateParam"},{"label":"Time Input","type":"TimeParam"},{"label":"Text Area","type":"TextAreaParam"},{"label":"Code Input","type":"CodeParam"},{"label":"Password Field","type":"PasswordParam"},{"label":"Color Picker","type":"ColorPickerParam"},{"label":"Button","type":"ButtonParam"},{"label":"Dropzone","type":"DropzoneParam"}],"sectionModeOptions":["inherit","include","exclude"],"sectionRepresentationOptionsByType":{"Browser":["expression"],"Callable":["expression"],"Chart":["expression","file_path"],"Chat":["expression","file_path","file_read"],"Code":["expression"],"Dict":["expression"],"Draw":["file_path","file_read"],"GenPythonCode":["expression"],"GenPythonMetadata":["expression"],"GlobalVariables":["expression"],"Group":["expression"],"IFrame":["expression"],"Image":["file_path","file_read"],"ListRoot":["expression"],"MetaControl":["expression"],"Plugin":["expression"],"Prompt":["expression"],"Social":["expression"],"Spreadsheet":["expression"],"StateMachineEnd":["expression"],"StateMachineGate":["expression"],"StateMachineStart":["expression"],"TaskBoard":["expression"],"Terminal":["expression"],"TextBlock":["expression"]},"sectionTypes":["Callable","Dict","ListRoot","Group","GlobalVariables","TextBlock","Draw","Image","MetaControl","Chat"]}},{"name":"RequiredUIEditorTabs","type":"RequiredUIEditorTabMap","value":{"Browser":["SectionConfig"],"Callable":["SectionConfig","UIConfig","QuickInfoConfig","SectionVariantsConfig"],"Chart":["SectionConfig"],"Chat":["SectionConfig"],"Code":["SectionConfig","SectionVariantsConfig"],"Dict":["SectionConfig","UIConfig","QuickInfoConfig","SectionVariantsConfig"],"Draw":["SectionConfig"],"GenPythonCode":["SectionConfig"],"GenPythonMetadata":["SectionConfig"],"GlobalVariables":["SectionConfig","UIConfig","QuickInfoConfig","SectionVariantsConfig"],"Group":["SectionConfig"],"IFrame":[],"Image":["SectionConfig"],"ListRoot":["SectionConfig","SectionVariantsConfig"],"MetaControl":["SectionConfig"],"Plugin":["SectionConfig"],"Prompt":["SectionConfig"],"Social":["SectionConfig"],"Spreadsheet":["SectionConfig"],"StateMachineEnd":["SectionConfig"],"StateMachineGate":["SectionConfig"],"StateMachineStart":["SectionConfig"],"TaskBoard":["SectionConfig"],"Terminal":["SectionConfig"],"TextBlock":["SectionConfig","InfoConfig","SectionVariantsConfig"]}},{"name":"RunSnapshotModeUIConfig","type":"RunSnapshotModeUIConfigValue","value":{"deploymentOptions":[{"description":"Snapshot per run, cleaned up automatically.","label":"Ephemeral","value":"ephemeral"},{"description":"Snapshot per run, stored under code history.","label":"Always","value":"always"}],"options":[{"description":"Snapshot per run, cleaned up automatically.","label":"Ephemeral","value":"ephemeral"},{"description":"Snapshot per run, stored under code history.","label":"Always","value":"always"},{"description":"Run from canonical files without a snapshot.","label":"Never","value":"never"}]}},{"name":"ServerModeBoundaryPolicyByMode","type":"ServerModeBoundaryPolicy","value":{"app":{"capabilities":{"canManageDesktopLauncher":false},"workspaceLaunchRouteKind":"blocked"},"ide":{"capabilities":{"canManageDesktopLauncher":true},"workspaceLaunchRouteKind":"ide"},"launcher":{"capabilities":{"canManageDesktopLauncher":false},"workspaceLaunchRouteKind":"launcher"},"share":{"capabilities":{"canManageDesktopLauncher":false},"workspaceLaunchRouteKind":"blocked"}}},{"name":"SettaAPIPresetConfig","type":"SettaAPIPresetConfigValue","value":{"presets":[{"bodyTemplate":{"controlCodeObjType":null,"implOverrides":{"text":"Hello","type":"TextBlock"},"implType":"TextBlock","position":"__SETTA_RUNTIME_EMPTY_SPACE_POSITION__","projectConfigId":"__SETTA_RUNTIME_PROJECT_CONFIG_ID__"},"label":"Create top-level section","route":"/createTopLevelSection"},{"bodyTemplate":{"projectConfigId":"__SETTA_RUNTIME_PROJECT_CONFIG_ID__"},"label":"Get latest project state","route":"/getLatestProjectState"},{"bodyTemplate":{"projectConfigId":"__SETTA_RUNTIME_PROJECT_CONFIG_ID__"},"label":"Save project","route":"/saveProject"}],"runtimeValueTokens":{"emptySpacePosition":"__SETTA_RUNTIME_EMPTY_SPACE_POSITION__","projectConfigId":"__SETTA_RUNTIME_PROJECT_CONFIG_ID__"}}},{"name":"SettaFilesLocationPolicyConfig","type":"SettaFilesLocationPolicy","value":{"requested":["auto","local","global"],"resolved":["local","global"]}},{"name":"StateMachineUIConfig","type":"StateMachineUIConfigValue","value":{"connectionSourceTypes":["Chat","StateMachineStart","StateMachineGate"],"connectionTargetTypes":["Chat","StateMachineGate","StateMachineEnd"],"defaultGateType":"AND","defaultPromptSourceType":"inline_prompt","defaultSourceActivationCountOperator":"eq","defaultSourceFilterType":"run_completed","defaultTargetActionType":"reset_thread","defaultThreadStrategy":"continue_current_thread","gateTypeOptions":[{"label":"AND","value":"AND"},{"label":"OR","value":"OR"},{"label":"XOR","value":"XOR"}],"permissionModeOptions":[{"label":"Minimal","value":"minimal"},{"label":"Yolo","value":"yolo"},{"label":"Config TOML Custom","value":"config_toml_custom"}],"promptSourceOptions":[{"label":"Inline Prompt","value":"inline_prompt"},{"label":"Prompt Template","value":"prompt_template"},{"label":"Prompt Section","value":"prompt_section"}],"promptSourceTypes":{"inline":"inline_prompt","promptSection":"prompt_section","promptTemplate":"prompt_template"},"selfLoopSectionTypes":["Chat"],"sourceActivationCountOperatorOptions":[{"label":"<","value":"lt"},{"label":"<=","value":"lte"},{"label":"=","value":"eq"},{"label":">=","value":"gte"},{"label":">","value":"gt"}],"sourceFilterOptions":[{"label":"Run Completed","value":"run_completed"},{"label":"Run Failed","value":"run_failed"},{"label":"Structured Signal","value":"signal"}],"targetActionOptions":[{"label":"Reset Thread","value":"reset_thread"},{"label":"Send Prompt","value":"send_prompt"}],"threadStrategyOptions":[{"label":"Continue Current Thread","value":"continue_current_thread"},{"label":"New Thread Before Send","value":"new_thread_before_send"}]}},{"name":"TaskBoardUIConfig","type":"TaskBoardUIConfigValue","value":{"monthOptions":[{"label":"Jan","value":"january"},{"label":"Feb","value":"february"},{"label":"Mar","value":"march"},{"label":"Apr","value":"april"},{"label":"May","value":"may"},{"label":"Jun","value":"june"},{"label":"Jul","value":"july"},{"label":"Aug","value":"august"},{"label":"Sep","value":"september"},{"label":"Oct","value":"october"},{"label":"Nov","value":"november"},{"label":"Dec","value":"december"}],"recurrenceOptions":[{"label":"No repeat","value":"none"},{"label":"Hourly","value":"hourly"},{"label":"Daily","value":"daily"},{"label":"Repeat specified days","value":"specified_days"},{"label":"Repeat specified months","value":"specified_months"},{"label":"Repeat specified years","value":"specified_years"}],"viewModeOptions":[{"label":"Task List","value":"task_list"},{"label":"Kanban","value":"kanban"}],"weekdayOptions":[{"label":"Mon","value":"monday"},{"label":"Tue","value":"tuesday"},{"label":"Wed","value":"wednesday"},{"label":"Thu","value":"thursday"},{"label":"Fri","value":"friday"},{"label":"Sat","value":"saturday"},{"label":"Sun","value":"sunday"}]}},{"name":"TextParamUIConfig","type":"TextParamUIConfigValue","value":{"calendarWeekdayLabelsByWeekStart":{"monday":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"sunday":["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]},"dateCalendarWeekStartOptions":[{"label":"Sunday","value":"sunday"},{"label":"Monday","value":"monday"}],"dateControlModeOptions":[{"label":"Date input","value":"input"},{"label":"Calendar","value":"calendar"}],"dateDisplayFormatOptions":[{"label":"ISO (YYYY-MM-DD)","value":"iso"},{"label":"US (MM/DD/YYYY)","value":"us"},{"label":"EU (DD/MM/YYYY)","value":"eu"},{"label":"Long (Month D, YYYY)","value":"long"}],"dateSelectionModeOptions":[{"label":"Single date","value":"single"},{"label":"Multiple dates","value":"multiple"}],"timeControlModeOptions":[{"label":"Display","value":"display"},{"label":"Input","value":"input"}],"timeDisplayFontOptions":[{"label":"Clock","value":"clock"},{"label":"Monospace","value":"monospace"},{"label":"System","value":"system"}],"timeDisplayFormatOptions":[{"label":"24-hour","value":"twenty_four_hour"},{"label":"12-hour","value":"twelve_hour"}]}},{"name":"ToolNameNormalizationConfig","type":"ToolNameNormalization","value":{"approvalToolName":"setta.approval","askUserQuestionToolAlias":"question","askUserQuestionToolName":"AskUserQuestion","doublePrefix":"setta__","mcpPrefix":"mcp__","singlePrefix":"setta_","todoWriteToolName":"TodoWrite"}},{"name":"TranscriptionProfileUIConfig","type":"TranscriptionProfileUIConfigValue","value":{"defaultChunkMs":1200,"defaultName":"Untitled","defaultTransportMode":"auto","maxChunkMs":10000,"minChunkMs":200,"transportModeOptions":[{"label":"auto","value":"auto"},{"label":"file","value":"file"},{"label":"realtime","value":"realtime"}],"transportModes":{"auto":"auto","file":"file","realtime":"realtime"}}},{"name":"TransportRouteConstants","type":"TransportRoutes","value":{"apiPrefix":"/api","binary":{"download":"/binary/{contentId}","upload":"/binary/upload"},"fileBrowser":{"getFileBrowserRoot":"/getFileBrowserRoot","getFolderContents":"/getFolderContents","writeFileBrowserContent":"/writeFileBrowserFileContent"},"launcherManagement":{"getLauncherStatus":"/launcherStatus","removeLauncher":"/removeLauncher","repairLauncher":"/repairLauncher","updateLauncher":"/updateLauncher"},"root":{"bootstrapPage":"/__setta__/bootstrap","toolsCall":"/__setta__/tools/call"},"serverModeBoundary":{"addLauncherRecentWorkspace":"/addLauncherRecentWorkspace","createWorkspaceLaunchIntent":"/createWorkspaceLaunchIntent","getLauncherFilesystemRoots":"/launcherFilesystemRoots","getLauncherRecentWorkspaces":"/launcherRecentWorkspaces","getSettaHomeInfo":"/settaHomeInfo","launch":"/launch","listLauncherDirectory":"/listLauncherDirectory","openLauncherWorkspace":"/openLauncherWorkspace","pinLauncherRecentWorkspace":"/pinLauncherRecentWorkspace","removeLauncherRecentWorkspace":"/removeLauncherRecentWorkspace"},"settaApiPresets":{"createTopLevelSection":"/createTopLevelSection","getLatestProjectState":"/getLatestProjectState","saveProject":"/saveProject"},"status":{"getSettaHomeInfo":"/settaHomeInfo","revealPathInOsFileExplorer":"/revealPathInOsFileExplorer"},"websocket":{"frontend":"/ws/frontend","listenerById":"/ws/listeners/{listenerID}","terminalBySection":"/ws/terminals/{projectID}/{sectionID}"}}},{"name":"UIEditorTabUIConfig","type":"UIEditorTabUIConfigValue","value":{"names":{"InfoConfig":"InfoConfig","QuickInfoConfig":"QuickInfoConfig","SectionConfig":"SectionConfig","SectionVariantsConfig":"SectionVariantsConfig","UIConfig":"UIConfig"},"titles":{"InfoConfig":"Text Editor","QuickInfoConfig":"Quick Info","SectionConfig":"Section","SectionVariantsConfig":"Variants","UIConfig":"Params"}}}]`);
const sidecar = {
  contracts,
  exportedValues
};
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
const OverviewTabNameEnum = OverviewTabUIConfig.names;
new Set(
  Object.values(OverviewTabNameEnum)
);
const NO_PAN_CLASS_NAME = "nopan";
const SETTA_PREVENT_SECTION_ACTIVE_CSS = "setta-prevent-section-active-css";
const CODEMIRROR_TOOLTIP_PARENT_ID = "setta-codemirror-tooltips";
const SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION = "setta-prevent-arrow-keys-moving-section";
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
function resolveAttachmentLimit(value) {
  if (!Number.isFinite(value)) {
    return { maxFiles: 0, disabled: true };
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
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var lodash$1 = { exports: {} };
/**
 * @license
 * Lodash <https://lodash.com/>
 * Copyright OpenJS Foundation and other contributors <https://openjsf.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */
var lodash = lodash$1.exports;
var hasRequiredLodash;
function requireLodash() {
  if (hasRequiredLodash) return lodash$1.exports;
  hasRequiredLodash = 1;
  (function(module, exports$1) {
    (function() {
      var undefined$1;
      var VERSION = "4.18.1";
      var LARGE_ARRAY_SIZE = 200;
      var CORE_ERROR_TEXT = "Unsupported core-js use. Try https://npms.io/search?q=ponyfill.", FUNC_ERROR_TEXT = "Expected a function", INVALID_TEMPL_VAR_ERROR_TEXT = "Invalid `variable` option passed into `_.template`", INVALID_TEMPL_IMPORTS_ERROR_TEXT = "Invalid `imports` option passed into `_.template`";
      var HASH_UNDEFINED = "__lodash_hash_undefined__";
      var MAX_MEMOIZE_SIZE = 500;
      var PLACEHOLDER = "__lodash_placeholder__";
      var CLONE_DEEP_FLAG = 1, CLONE_FLAT_FLAG = 2, CLONE_SYMBOLS_FLAG = 4;
      var COMPARE_PARTIAL_FLAG = 1, COMPARE_UNORDERED_FLAG = 2;
      var WRAP_BIND_FLAG = 1, WRAP_BIND_KEY_FLAG = 2, WRAP_CURRY_BOUND_FLAG = 4, WRAP_CURRY_FLAG = 8, WRAP_CURRY_RIGHT_FLAG = 16, WRAP_PARTIAL_FLAG = 32, WRAP_PARTIAL_RIGHT_FLAG = 64, WRAP_ARY_FLAG = 128, WRAP_REARG_FLAG = 256, WRAP_FLIP_FLAG = 512;
      var DEFAULT_TRUNC_LENGTH = 30, DEFAULT_TRUNC_OMISSION = "...";
      var HOT_COUNT = 800, HOT_SPAN = 16;
      var LAZY_FILTER_FLAG = 1, LAZY_MAP_FLAG = 2, LAZY_WHILE_FLAG = 3;
      var INFINITY = 1 / 0, MAX_SAFE_INTEGER = 9007199254740991, MAX_INTEGER = 17976931348623157e292, NAN = 0 / 0;
      var MAX_ARRAY_LENGTH = 4294967295, MAX_ARRAY_INDEX = MAX_ARRAY_LENGTH - 1, HALF_MAX_ARRAY_LENGTH = MAX_ARRAY_LENGTH >>> 1;
      var wrapFlags = [
        ["ary", WRAP_ARY_FLAG],
        ["bind", WRAP_BIND_FLAG],
        ["bindKey", WRAP_BIND_KEY_FLAG],
        ["curry", WRAP_CURRY_FLAG],
        ["curryRight", WRAP_CURRY_RIGHT_FLAG],
        ["flip", WRAP_FLIP_FLAG],
        ["partial", WRAP_PARTIAL_FLAG],
        ["partialRight", WRAP_PARTIAL_RIGHT_FLAG],
        ["rearg", WRAP_REARG_FLAG]
      ];
      var argsTag = "[object Arguments]", arrayTag = "[object Array]", asyncTag = "[object AsyncFunction]", boolTag = "[object Boolean]", dateTag = "[object Date]", domExcTag = "[object DOMException]", errorTag = "[object Error]", funcTag = "[object Function]", genTag = "[object GeneratorFunction]", mapTag = "[object Map]", numberTag = "[object Number]", nullTag = "[object Null]", objectTag = "[object Object]", promiseTag = "[object Promise]", proxyTag = "[object Proxy]", regexpTag = "[object RegExp]", setTag = "[object Set]", stringTag = "[object String]", symbolTag = "[object Symbol]", undefinedTag = "[object Undefined]", weakMapTag = "[object WeakMap]", weakSetTag = "[object WeakSet]";
      var arrayBufferTag = "[object ArrayBuffer]", dataViewTag = "[object DataView]", float32Tag = "[object Float32Array]", float64Tag = "[object Float64Array]", int8Tag = "[object Int8Array]", int16Tag = "[object Int16Array]", int32Tag = "[object Int32Array]", uint8Tag = "[object Uint8Array]", uint8ClampedTag = "[object Uint8ClampedArray]", uint16Tag = "[object Uint16Array]", uint32Tag = "[object Uint32Array]";
      var reEmptyStringLeading = /\b__p \+= '';/g, reEmptyStringMiddle = /\b(__p \+=) '' \+/g, reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;
      var reEscapedHtml = /&(?:amp|lt|gt|quot|#39);/g, reUnescapedHtml = /[&<>"']/g, reHasEscapedHtml = RegExp(reEscapedHtml.source), reHasUnescapedHtml = RegExp(reUnescapedHtml.source);
      var reEscape = /<%-([\s\S]+?)%>/g, reEvaluate = /<%([\s\S]+?)%>/g, reInterpolate = /<%=([\s\S]+?)%>/g;
      var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/, reIsPlainProp = /^\w*$/, rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
      var reRegExpChar = /[\\^$.*+?()[\]{}|]/g, reHasRegExpChar = RegExp(reRegExpChar.source);
      var reTrimStart = /^\s+/;
      var reWhitespace = /\s/;
      var reWrapComment = /\{(?:\n\/\* \[wrapped with .+\] \*\/)?\n?/, reWrapDetails = /\{\n\/\* \[wrapped with (.+)\] \*/, reSplitDetails = /,? & /;
      var reAsciiWord = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;
      var reForbiddenIdentifierChars = /[()=,{}\[\]\/\s]/;
      var reEscapeChar = /\\(\\)?/g;
      var reEsTemplate = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g;
      var reFlags = /\w*$/;
      var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
      var reIsBinary = /^0b[01]+$/i;
      var reIsHostCtor = /^\[object .+?Constructor\]$/;
      var reIsOctal = /^0o[0-7]+$/i;
      var reIsUint = /^(?:0|[1-9]\d*)$/;
      var reLatin = /[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g;
      var reNoMatch = /($^)/;
      var reUnescapedString = /['\n\r\u2028\u2029\\]/g;
      var rsAstralRange = "\\ud800-\\udfff", rsComboMarksRange = "\\u0300-\\u036f", reComboHalfMarksRange = "\\ufe20-\\ufe2f", rsComboSymbolsRange = "\\u20d0-\\u20ff", rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange, rsDingbatRange = "\\u2700-\\u27bf", rsLowerRange = "a-z\\xdf-\\xf6\\xf8-\\xff", rsMathOpRange = "\\xac\\xb1\\xd7\\xf7", rsNonCharRange = "\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf", rsPunctuationRange = "\\u2000-\\u206f", rsSpaceRange = " \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000", rsUpperRange = "A-Z\\xc0-\\xd6\\xd8-\\xde", rsVarRange = "\\ufe0e\\ufe0f", rsBreakRange = rsMathOpRange + rsNonCharRange + rsPunctuationRange + rsSpaceRange;
      var rsApos = "['’]", rsAstral = "[" + rsAstralRange + "]", rsBreak = "[" + rsBreakRange + "]", rsCombo = "[" + rsComboRange + "]", rsDigits = "\\d+", rsDingbat = "[" + rsDingbatRange + "]", rsLower = "[" + rsLowerRange + "]", rsMisc = "[^" + rsAstralRange + rsBreakRange + rsDigits + rsDingbatRange + rsLowerRange + rsUpperRange + "]", rsFitz = "\\ud83c[\\udffb-\\udfff]", rsModifier = "(?:" + rsCombo + "|" + rsFitz + ")", rsNonAstral = "[^" + rsAstralRange + "]", rsRegional = "(?:\\ud83c[\\udde6-\\uddff]){2}", rsSurrPair = "[\\ud800-\\udbff][\\udc00-\\udfff]", rsUpper = "[" + rsUpperRange + "]", rsZWJ = "\\u200d";
      var rsMiscLower = "(?:" + rsLower + "|" + rsMisc + ")", rsMiscUpper = "(?:" + rsUpper + "|" + rsMisc + ")", rsOptContrLower = "(?:" + rsApos + "(?:d|ll|m|re|s|t|ve))?", rsOptContrUpper = "(?:" + rsApos + "(?:D|LL|M|RE|S|T|VE))?", reOptMod = rsModifier + "?", rsOptVar = "[" + rsVarRange + "]?", rsOptJoin = "(?:" + rsZWJ + "(?:" + [rsNonAstral, rsRegional, rsSurrPair].join("|") + ")" + rsOptVar + reOptMod + ")*", rsOrdLower = "\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])", rsOrdUpper = "\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])", rsSeq = rsOptVar + reOptMod + rsOptJoin, rsEmoji = "(?:" + [rsDingbat, rsRegional, rsSurrPair].join("|") + ")" + rsSeq, rsSymbol = "(?:" + [rsNonAstral + rsCombo + "?", rsCombo, rsRegional, rsSurrPair, rsAstral].join("|") + ")";
      var reApos = RegExp(rsApos, "g");
      var reComboMark = RegExp(rsCombo, "g");
      var reUnicode = RegExp(rsFitz + "(?=" + rsFitz + ")|" + rsSymbol + rsSeq, "g");
      var reUnicodeWord = RegExp([
        rsUpper + "?" + rsLower + "+" + rsOptContrLower + "(?=" + [rsBreak, rsUpper, "$"].join("|") + ")",
        rsMiscUpper + "+" + rsOptContrUpper + "(?=" + [rsBreak, rsUpper + rsMiscLower, "$"].join("|") + ")",
        rsUpper + "?" + rsMiscLower + "+" + rsOptContrLower,
        rsUpper + "+" + rsOptContrUpper,
        rsOrdUpper,
        rsOrdLower,
        rsDigits,
        rsEmoji
      ].join("|"), "g");
      var reHasUnicode = RegExp("[" + rsZWJ + rsAstralRange + rsComboRange + rsVarRange + "]");
      var reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;
      var contextProps = [
        "Array",
        "Buffer",
        "DataView",
        "Date",
        "Error",
        "Float32Array",
        "Float64Array",
        "Function",
        "Int8Array",
        "Int16Array",
        "Int32Array",
        "Map",
        "Math",
        "Object",
        "Promise",
        "RegExp",
        "Set",
        "String",
        "Symbol",
        "TypeError",
        "Uint8Array",
        "Uint8ClampedArray",
        "Uint16Array",
        "Uint32Array",
        "WeakMap",
        "_",
        "clearTimeout",
        "isFinite",
        "parseInt",
        "setTimeout"
      ];
      var templateCounter = -1;
      var typedArrayTags = {};
      typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
      typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
      var cloneableTags = {};
      cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[mapTag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[setTag] = cloneableTags[stringTag] = cloneableTags[symbolTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
      cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[weakMapTag] = false;
      var deburredLetters = {
        // Latin-1 Supplement block.
        "À": "A",
        "Á": "A",
        "Â": "A",
        "Ã": "A",
        "Ä": "A",
        "Å": "A",
        "à": "a",
        "á": "a",
        "â": "a",
        "ã": "a",
        "ä": "a",
        "å": "a",
        "Ç": "C",
        "ç": "c",
        "Ð": "D",
        "ð": "d",
        "È": "E",
        "É": "E",
        "Ê": "E",
        "Ë": "E",
        "è": "e",
        "é": "e",
        "ê": "e",
        "ë": "e",
        "Ì": "I",
        "Í": "I",
        "Î": "I",
        "Ï": "I",
        "ì": "i",
        "í": "i",
        "î": "i",
        "ï": "i",
        "Ñ": "N",
        "ñ": "n",
        "Ò": "O",
        "Ó": "O",
        "Ô": "O",
        "Õ": "O",
        "Ö": "O",
        "Ø": "O",
        "ò": "o",
        "ó": "o",
        "ô": "o",
        "õ": "o",
        "ö": "o",
        "ø": "o",
        "Ù": "U",
        "Ú": "U",
        "Û": "U",
        "Ü": "U",
        "ù": "u",
        "ú": "u",
        "û": "u",
        "ü": "u",
        "Ý": "Y",
        "ý": "y",
        "ÿ": "y",
        "Æ": "Ae",
        "æ": "ae",
        "Þ": "Th",
        "þ": "th",
        "ß": "ss",
        // Latin Extended-A block.
        "Ā": "A",
        "Ă": "A",
        "Ą": "A",
        "ā": "a",
        "ă": "a",
        "ą": "a",
        "Ć": "C",
        "Ĉ": "C",
        "Ċ": "C",
        "Č": "C",
        "ć": "c",
        "ĉ": "c",
        "ċ": "c",
        "č": "c",
        "Ď": "D",
        "Đ": "D",
        "ď": "d",
        "đ": "d",
        "Ē": "E",
        "Ĕ": "E",
        "Ė": "E",
        "Ę": "E",
        "Ě": "E",
        "ē": "e",
        "ĕ": "e",
        "ė": "e",
        "ę": "e",
        "ě": "e",
        "Ĝ": "G",
        "Ğ": "G",
        "Ġ": "G",
        "Ģ": "G",
        "ĝ": "g",
        "ğ": "g",
        "ġ": "g",
        "ģ": "g",
        "Ĥ": "H",
        "Ħ": "H",
        "ĥ": "h",
        "ħ": "h",
        "Ĩ": "I",
        "Ī": "I",
        "Ĭ": "I",
        "Į": "I",
        "İ": "I",
        "ĩ": "i",
        "ī": "i",
        "ĭ": "i",
        "į": "i",
        "ı": "i",
        "Ĵ": "J",
        "ĵ": "j",
        "Ķ": "K",
        "ķ": "k",
        "ĸ": "k",
        "Ĺ": "L",
        "Ļ": "L",
        "Ľ": "L",
        "Ŀ": "L",
        "Ł": "L",
        "ĺ": "l",
        "ļ": "l",
        "ľ": "l",
        "ŀ": "l",
        "ł": "l",
        "Ń": "N",
        "Ņ": "N",
        "Ň": "N",
        "Ŋ": "N",
        "ń": "n",
        "ņ": "n",
        "ň": "n",
        "ŋ": "n",
        "Ō": "O",
        "Ŏ": "O",
        "Ő": "O",
        "ō": "o",
        "ŏ": "o",
        "ő": "o",
        "Ŕ": "R",
        "Ŗ": "R",
        "Ř": "R",
        "ŕ": "r",
        "ŗ": "r",
        "ř": "r",
        "Ś": "S",
        "Ŝ": "S",
        "Ş": "S",
        "Š": "S",
        "ś": "s",
        "ŝ": "s",
        "ş": "s",
        "š": "s",
        "Ţ": "T",
        "Ť": "T",
        "Ŧ": "T",
        "ţ": "t",
        "ť": "t",
        "ŧ": "t",
        "Ũ": "U",
        "Ū": "U",
        "Ŭ": "U",
        "Ů": "U",
        "Ű": "U",
        "Ų": "U",
        "ũ": "u",
        "ū": "u",
        "ŭ": "u",
        "ů": "u",
        "ű": "u",
        "ų": "u",
        "Ŵ": "W",
        "ŵ": "w",
        "Ŷ": "Y",
        "ŷ": "y",
        "Ÿ": "Y",
        "Ź": "Z",
        "Ż": "Z",
        "Ž": "Z",
        "ź": "z",
        "ż": "z",
        "ž": "z",
        "Ĳ": "IJ",
        "ĳ": "ij",
        "Œ": "Oe",
        "œ": "oe",
        "ŉ": "'n",
        "ſ": "s"
      };
      var htmlEscapes = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      var htmlUnescapes = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'"
      };
      var stringEscapes = {
        "\\": "\\",
        "'": "'",
        "\n": "n",
        "\r": "r",
        "\u2028": "u2028",
        "\u2029": "u2029"
      };
      var freeParseFloat = parseFloat, freeParseInt = parseInt;
      var freeGlobal = typeof commonjsGlobal == "object" && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;
      var freeSelf = typeof self == "object" && self && self.Object === Object && self;
      var root = freeGlobal || freeSelf || Function("return this")();
      var freeExports = exports$1 && !exports$1.nodeType && exports$1;
      var freeModule = freeExports && true && module && !module.nodeType && module;
      var moduleExports = freeModule && freeModule.exports === freeExports;
      var freeProcess = moduleExports && freeGlobal.process;
      var nodeUtil = (function() {
        try {
          var types = freeModule && freeModule.require && freeModule.require("util").types;
          if (types) {
            return types;
          }
          return freeProcess && freeProcess.binding && freeProcess.binding("util");
        } catch (e2) {
        }
      })();
      var nodeIsArrayBuffer = nodeUtil && nodeUtil.isArrayBuffer, nodeIsDate = nodeUtil && nodeUtil.isDate, nodeIsMap = nodeUtil && nodeUtil.isMap, nodeIsRegExp = nodeUtil && nodeUtil.isRegExp, nodeIsSet = nodeUtil && nodeUtil.isSet, nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
      function apply(func, thisArg, args) {
        switch (args.length) {
          case 0:
            return func.call(thisArg);
          case 1:
            return func.call(thisArg, args[0]);
          case 2:
            return func.call(thisArg, args[0], args[1]);
          case 3:
            return func.call(thisArg, args[0], args[1], args[2]);
        }
        return func.apply(thisArg, args);
      }
      function arrayAggregator(array, setter, iteratee, accumulator) {
        var index = -1, length = array == null ? 0 : array.length;
        while (++index < length) {
          var value = array[index];
          setter(accumulator, value, iteratee(value), array);
        }
        return accumulator;
      }
      function arrayEach(array, iteratee) {
        var index = -1, length = array == null ? 0 : array.length;
        while (++index < length) {
          if (iteratee(array[index], index, array) === false) {
            break;
          }
        }
        return array;
      }
      function arrayEachRight(array, iteratee) {
        var length = array == null ? 0 : array.length;
        while (length--) {
          if (iteratee(array[length], length, array) === false) {
            break;
          }
        }
        return array;
      }
      function arrayEvery(array, predicate) {
        var index = -1, length = array == null ? 0 : array.length;
        while (++index < length) {
          if (!predicate(array[index], index, array)) {
            return false;
          }
        }
        return true;
      }
      function arrayFilter(array, predicate) {
        var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
        while (++index < length) {
          var value = array[index];
          if (predicate(value, index, array)) {
            result[resIndex++] = value;
          }
        }
        return result;
      }
      function arrayIncludes(array, value) {
        var length = array == null ? 0 : array.length;
        return !!length && baseIndexOf(array, value, 0) > -1;
      }
      function arrayIncludesWith(array, value, comparator) {
        var index = -1, length = array == null ? 0 : array.length;
        while (++index < length) {
          if (comparator(value, array[index])) {
            return true;
          }
        }
        return false;
      }
      function arrayMap(array, iteratee) {
        var index = -1, length = array == null ? 0 : array.length, result = Array(length);
        while (++index < length) {
          result[index] = iteratee(array[index], index, array);
        }
        return result;
      }
      function arrayPush(array, values) {
        var index = -1, length = values.length, offset = array.length;
        while (++index < length) {
          array[offset + index] = values[index];
        }
        return array;
      }
      function arrayReduce(array, iteratee, accumulator, initAccum) {
        var index = -1, length = array == null ? 0 : array.length;
        if (initAccum && length) {
          accumulator = array[++index];
        }
        while (++index < length) {
          accumulator = iteratee(accumulator, array[index], index, array);
        }
        return accumulator;
      }
      function arrayReduceRight(array, iteratee, accumulator, initAccum) {
        var length = array == null ? 0 : array.length;
        if (initAccum && length) {
          accumulator = array[--length];
        }
        while (length--) {
          accumulator = iteratee(accumulator, array[length], length, array);
        }
        return accumulator;
      }
      function arraySome(array, predicate) {
        var index = -1, length = array == null ? 0 : array.length;
        while (++index < length) {
          if (predicate(array[index], index, array)) {
            return true;
          }
        }
        return false;
      }
      var asciiSize = baseProperty("length");
      function asciiToArray(string) {
        return string.split("");
      }
      function asciiWords(string) {
        return string.match(reAsciiWord) || [];
      }
      function baseFindKey(collection, predicate, eachFunc) {
        var result;
        eachFunc(collection, function(value, key, collection2) {
          if (predicate(value, key, collection2)) {
            result = key;
            return false;
          }
        });
        return result;
      }
      function baseFindIndex(array, predicate, fromIndex, fromRight) {
        var length = array.length, index = fromIndex + (fromRight ? 1 : -1);
        while (fromRight ? index-- : ++index < length) {
          if (predicate(array[index], index, array)) {
            return index;
          }
        }
        return -1;
      }
      function baseIndexOf(array, value, fromIndex) {
        return value === value ? strictIndexOf(array, value, fromIndex) : baseFindIndex(array, baseIsNaN, fromIndex);
      }
      function baseIndexOfWith(array, value, fromIndex, comparator) {
        var index = fromIndex - 1, length = array.length;
        while (++index < length) {
          if (comparator(array[index], value)) {
            return index;
          }
        }
        return -1;
      }
      function baseIsNaN(value) {
        return value !== value;
      }
      function baseMean(array, iteratee) {
        var length = array == null ? 0 : array.length;
        return length ? baseSum(array, iteratee) / length : NAN;
      }
      function baseProperty(key) {
        return function(object) {
          return object == null ? undefined$1 : object[key];
        };
      }
      function basePropertyOf(object) {
        return function(key) {
          return object == null ? undefined$1 : object[key];
        };
      }
      function baseReduce(collection, iteratee, accumulator, initAccum, eachFunc) {
        eachFunc(collection, function(value, index, collection2) {
          accumulator = initAccum ? (initAccum = false, value) : iteratee(accumulator, value, index, collection2);
        });
        return accumulator;
      }
      function baseSortBy(array, comparer) {
        var length = array.length;
        array.sort(comparer);
        while (length--) {
          array[length] = array[length].value;
        }
        return array;
      }
      function baseSum(array, iteratee) {
        var result, index = -1, length = array.length;
        while (++index < length) {
          var current = iteratee(array[index]);
          if (current !== undefined$1) {
            result = result === undefined$1 ? current : result + current;
          }
        }
        return result;
      }
      function baseTimes(n2, iteratee) {
        var index = -1, result = Array(n2);
        while (++index < n2) {
          result[index] = iteratee(index);
        }
        return result;
      }
      function baseToPairs(object, props) {
        return arrayMap(props, function(key) {
          return [key, object[key]];
        });
      }
      function baseTrim(string) {
        return string ? string.slice(0, trimmedEndIndex(string) + 1).replace(reTrimStart, "") : string;
      }
      function baseUnary(func) {
        return function(value) {
          return func(value);
        };
      }
      function baseValues(object, props) {
        return arrayMap(props, function(key) {
          return object[key];
        });
      }
      function cacheHas(cache, key) {
        return cache.has(key);
      }
      function charsStartIndex(strSymbols, chrSymbols) {
        var index = -1, length = strSymbols.length;
        while (++index < length && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {
        }
        return index;
      }
      function charsEndIndex(strSymbols, chrSymbols) {
        var index = strSymbols.length;
        while (index-- && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {
        }
        return index;
      }
      function countHolders(array, placeholder) {
        var length = array.length, result = 0;
        while (length--) {
          if (array[length] === placeholder) {
            ++result;
          }
        }
        return result;
      }
      var deburrLetter = basePropertyOf(deburredLetters);
      var escapeHtmlChar = basePropertyOf(htmlEscapes);
      function escapeStringChar(chr) {
        return "\\" + stringEscapes[chr];
      }
      function getValue(object, key) {
        return object == null ? undefined$1 : object[key];
      }
      function hasUnicode(string) {
        return reHasUnicode.test(string);
      }
      function hasUnicodeWord(string) {
        return reHasUnicodeWord.test(string);
      }
      function iteratorToArray(iterator) {
        var data, result = [];
        while (!(data = iterator.next()).done) {
          result.push(data.value);
        }
        return result;
      }
      function mapToArray(map) {
        var index = -1, result = Array(map.size);
        map.forEach(function(value, key) {
          result[++index] = [key, value];
        });
        return result;
      }
      function overArg(func, transform) {
        return function(arg) {
          return func(transform(arg));
        };
      }
      function replaceHolders(array, placeholder) {
        var index = -1, length = array.length, resIndex = 0, result = [];
        while (++index < length) {
          var value = array[index];
          if (value === placeholder || value === PLACEHOLDER) {
            array[index] = PLACEHOLDER;
            result[resIndex++] = index;
          }
        }
        return result;
      }
      function setToArray(set) {
        var index = -1, result = Array(set.size);
        set.forEach(function(value) {
          result[++index] = value;
        });
        return result;
      }
      function setToPairs(set) {
        var index = -1, result = Array(set.size);
        set.forEach(function(value) {
          result[++index] = [value, value];
        });
        return result;
      }
      function strictIndexOf(array, value, fromIndex) {
        var index = fromIndex - 1, length = array.length;
        while (++index < length) {
          if (array[index] === value) {
            return index;
          }
        }
        return -1;
      }
      function strictLastIndexOf(array, value, fromIndex) {
        var index = fromIndex + 1;
        while (index--) {
          if (array[index] === value) {
            return index;
          }
        }
        return index;
      }
      function stringSize(string) {
        return hasUnicode(string) ? unicodeSize(string) : asciiSize(string);
      }
      function stringToArray(string) {
        return hasUnicode(string) ? unicodeToArray(string) : asciiToArray(string);
      }
      function trimmedEndIndex(string) {
        var index = string.length;
        while (index-- && reWhitespace.test(string.charAt(index))) {
        }
        return index;
      }
      var unescapeHtmlChar = basePropertyOf(htmlUnescapes);
      function unicodeSize(string) {
        var result = reUnicode.lastIndex = 0;
        while (reUnicode.test(string)) {
          ++result;
        }
        return result;
      }
      function unicodeToArray(string) {
        return string.match(reUnicode) || [];
      }
      function unicodeWords(string) {
        return string.match(reUnicodeWord) || [];
      }
      var runInContext = (function runInContext2(context) {
        context = context == null ? root : _2.defaults(root.Object(), context, _2.pick(root, contextProps));
        var Array2 = context.Array, Date2 = context.Date, Error2 = context.Error, Function2 = context.Function, Math2 = context.Math, Object2 = context.Object, RegExp2 = context.RegExp, String = context.String, TypeError2 = context.TypeError;
        var arrayProto = Array2.prototype, funcProto = Function2.prototype, objectProto = Object2.prototype;
        var coreJsData = context["__core-js_shared__"];
        var funcToString = funcProto.toString;
        var hasOwnProperty = objectProto.hasOwnProperty;
        var idCounter = 0;
        var maskSrcKey = (function() {
          var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
          return uid ? "Symbol(src)_1." + uid : "";
        })();
        var nativeObjectToString = objectProto.toString;
        var objectCtorString = funcToString.call(Object2);
        var oldDash = root._;
        var reIsNative = RegExp2(
          "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
        );
        var Buffer2 = moduleExports ? context.Buffer : undefined$1, Symbol2 = context.Symbol, Uint8Array2 = context.Uint8Array, allocUnsafe = Buffer2 ? Buffer2.allocUnsafe : undefined$1, getPrototype = overArg(Object2.getPrototypeOf, Object2), objectCreate = Object2.create, propertyIsEnumerable = objectProto.propertyIsEnumerable, splice = arrayProto.splice, spreadableSymbol = Symbol2 ? Symbol2.isConcatSpreadable : undefined$1, symIterator = Symbol2 ? Symbol2.iterator : undefined$1, symToStringTag = Symbol2 ? Symbol2.toStringTag : undefined$1;
        var defineProperty = (function() {
          try {
            var func = getNative(Object2, "defineProperty");
            func({}, "", {});
            return func;
          } catch (e2) {
          }
        })();
        var ctxClearTimeout = context.clearTimeout !== root.clearTimeout && context.clearTimeout, ctxNow = Date2 && Date2.now !== root.Date.now && Date2.now, ctxSetTimeout = context.setTimeout !== root.setTimeout && context.setTimeout;
        var nativeCeil = Math2.ceil, nativeFloor = Math2.floor, nativeGetSymbols = Object2.getOwnPropertySymbols, nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : undefined$1, nativeIsFinite = context.isFinite, nativeJoin = arrayProto.join, nativeKeys = overArg(Object2.keys, Object2), nativeMax = Math2.max, nativeMin = Math2.min, nativeNow = Date2.now, nativeParseInt = context.parseInt, nativeRandom = Math2.random, nativeReverse = arrayProto.reverse;
        var DataView = getNative(context, "DataView"), Map2 = getNative(context, "Map"), Promise2 = getNative(context, "Promise"), Set2 = getNative(context, "Set"), WeakMap2 = getNative(context, "WeakMap"), nativeCreate = getNative(Object2, "create");
        var metaMap = WeakMap2 && new WeakMap2();
        var realNames = {};
        var dataViewCtorString = toSource(DataView), mapCtorString = toSource(Map2), promiseCtorString = toSource(Promise2), setCtorString = toSource(Set2), weakMapCtorString = toSource(WeakMap2);
        var symbolProto = Symbol2 ? Symbol2.prototype : undefined$1, symbolValueOf = symbolProto ? symbolProto.valueOf : undefined$1, symbolToString = symbolProto ? symbolProto.toString : undefined$1;
        function lodash2(value) {
          if (isObjectLike(value) && !isArray(value) && !(value instanceof LazyWrapper)) {
            if (value instanceof LodashWrapper) {
              return value;
            }
            if (hasOwnProperty.call(value, "__wrapped__")) {
              return wrapperClone(value);
            }
          }
          return new LodashWrapper(value);
        }
        var baseCreate = /* @__PURE__ */ (function() {
          function object() {
          }
          return function(proto) {
            if (!isObject(proto)) {
              return {};
            }
            if (objectCreate) {
              return objectCreate(proto);
            }
            object.prototype = proto;
            var result2 = new object();
            object.prototype = undefined$1;
            return result2;
          };
        })();
        function baseLodash() {
        }
        function LodashWrapper(value, chainAll) {
          this.__wrapped__ = value;
          this.__actions__ = [];
          this.__chain__ = !!chainAll;
          this.__index__ = 0;
          this.__values__ = undefined$1;
        }
        lodash2.templateSettings = {
          /**
           * Used to detect `data` property values to be HTML-escaped.
           *
           * @memberOf _.templateSettings
           * @type {RegExp}
           */
          "escape": reEscape,
          /**
           * Used to detect code to be evaluated.
           *
           * @memberOf _.templateSettings
           * @type {RegExp}
           */
          "evaluate": reEvaluate,
          /**
           * Used to detect `data` property values to inject.
           *
           * @memberOf _.templateSettings
           * @type {RegExp}
           */
          "interpolate": reInterpolate,
          /**
           * Used to reference the data object in the template text.
           *
           * @memberOf _.templateSettings
           * @type {string}
           */
          "variable": "",
          /**
           * Used to import variables into the compiled template.
           *
           * @memberOf _.templateSettings
           * @type {Object}
           */
          "imports": {
            /**
             * A reference to the `lodash` function.
             *
             * @memberOf _.templateSettings.imports
             * @type {Function}
             */
            "_": lodash2
          }
        };
        lodash2.prototype = baseLodash.prototype;
        lodash2.prototype.constructor = lodash2;
        LodashWrapper.prototype = baseCreate(baseLodash.prototype);
        LodashWrapper.prototype.constructor = LodashWrapper;
        function LazyWrapper(value) {
          this.__wrapped__ = value;
          this.__actions__ = [];
          this.__dir__ = 1;
          this.__filtered__ = false;
          this.__iteratees__ = [];
          this.__takeCount__ = MAX_ARRAY_LENGTH;
          this.__views__ = [];
        }
        function lazyClone() {
          var result2 = new LazyWrapper(this.__wrapped__);
          result2.__actions__ = copyArray(this.__actions__);
          result2.__dir__ = this.__dir__;
          result2.__filtered__ = this.__filtered__;
          result2.__iteratees__ = copyArray(this.__iteratees__);
          result2.__takeCount__ = this.__takeCount__;
          result2.__views__ = copyArray(this.__views__);
          return result2;
        }
        function lazyReverse() {
          if (this.__filtered__) {
            var result2 = new LazyWrapper(this);
            result2.__dir__ = -1;
            result2.__filtered__ = true;
          } else {
            result2 = this.clone();
            result2.__dir__ *= -1;
          }
          return result2;
        }
        function lazyValue() {
          var array = this.__wrapped__.value(), dir = this.__dir__, isArr = isArray(array), isRight = dir < 0, arrLength = isArr ? array.length : 0, view = getView(0, arrLength, this.__views__), start = view.start, end = view.end, length = end - start, index = isRight ? end : start - 1, iteratees = this.__iteratees__, iterLength = iteratees.length, resIndex = 0, takeCount = nativeMin(length, this.__takeCount__);
          if (!isArr || !isRight && arrLength == length && takeCount == length) {
            return baseWrapperValue(array, this.__actions__);
          }
          var result2 = [];
          outer:
            while (length-- && resIndex < takeCount) {
              index += dir;
              var iterIndex = -1, value = array[index];
              while (++iterIndex < iterLength) {
                var data = iteratees[iterIndex], iteratee2 = data.iteratee, type = data.type, computed = iteratee2(value);
                if (type == LAZY_MAP_FLAG) {
                  value = computed;
                } else if (!computed) {
                  if (type == LAZY_FILTER_FLAG) {
                    continue outer;
                  } else {
                    break outer;
                  }
                }
              }
              result2[resIndex++] = value;
            }
          return result2;
        }
        LazyWrapper.prototype = baseCreate(baseLodash.prototype);
        LazyWrapper.prototype.constructor = LazyWrapper;
        function Hash(entries) {
          var index = -1, length = entries == null ? 0 : entries.length;
          this.clear();
          while (++index < length) {
            var entry = entries[index];
            this.set(entry[0], entry[1]);
          }
        }
        function hashClear() {
          this.__data__ = nativeCreate ? nativeCreate(null) : {};
          this.size = 0;
        }
        function hashDelete(key) {
          var result2 = this.has(key) && delete this.__data__[key];
          this.size -= result2 ? 1 : 0;
          return result2;
        }
        function hashGet(key) {
          var data = this.__data__;
          if (nativeCreate) {
            var result2 = data[key];
            return result2 === HASH_UNDEFINED ? undefined$1 : result2;
          }
          return hasOwnProperty.call(data, key) ? data[key] : undefined$1;
        }
        function hashHas(key) {
          var data = this.__data__;
          return nativeCreate ? data[key] !== undefined$1 : hasOwnProperty.call(data, key);
        }
        function hashSet(key, value) {
          var data = this.__data__;
          this.size += this.has(key) ? 0 : 1;
          data[key] = nativeCreate && value === undefined$1 ? HASH_UNDEFINED : value;
          return this;
        }
        Hash.prototype.clear = hashClear;
        Hash.prototype["delete"] = hashDelete;
        Hash.prototype.get = hashGet;
        Hash.prototype.has = hashHas;
        Hash.prototype.set = hashSet;
        function ListCache(entries) {
          var index = -1, length = entries == null ? 0 : entries.length;
          this.clear();
          while (++index < length) {
            var entry = entries[index];
            this.set(entry[0], entry[1]);
          }
        }
        function listCacheClear() {
          this.__data__ = [];
          this.size = 0;
        }
        function listCacheDelete(key) {
          var data = this.__data__, index = assocIndexOf(data, key);
          if (index < 0) {
            return false;
          }
          var lastIndex = data.length - 1;
          if (index == lastIndex) {
            data.pop();
          } else {
            splice.call(data, index, 1);
          }
          --this.size;
          return true;
        }
        function listCacheGet(key) {
          var data = this.__data__, index = assocIndexOf(data, key);
          return index < 0 ? undefined$1 : data[index][1];
        }
        function listCacheHas(key) {
          return assocIndexOf(this.__data__, key) > -1;
        }
        function listCacheSet(key, value) {
          var data = this.__data__, index = assocIndexOf(data, key);
          if (index < 0) {
            ++this.size;
            data.push([key, value]);
          } else {
            data[index][1] = value;
          }
          return this;
        }
        ListCache.prototype.clear = listCacheClear;
        ListCache.prototype["delete"] = listCacheDelete;
        ListCache.prototype.get = listCacheGet;
        ListCache.prototype.has = listCacheHas;
        ListCache.prototype.set = listCacheSet;
        function MapCache(entries) {
          var index = -1, length = entries == null ? 0 : entries.length;
          this.clear();
          while (++index < length) {
            var entry = entries[index];
            this.set(entry[0], entry[1]);
          }
        }
        function mapCacheClear() {
          this.size = 0;
          this.__data__ = {
            "hash": new Hash(),
            "map": new (Map2 || ListCache)(),
            "string": new Hash()
          };
        }
        function mapCacheDelete(key) {
          var result2 = getMapData(this, key)["delete"](key);
          this.size -= result2 ? 1 : 0;
          return result2;
        }
        function mapCacheGet(key) {
          return getMapData(this, key).get(key);
        }
        function mapCacheHas(key) {
          return getMapData(this, key).has(key);
        }
        function mapCacheSet(key, value) {
          var data = getMapData(this, key), size2 = data.size;
          data.set(key, value);
          this.size += data.size == size2 ? 0 : 1;
          return this;
        }
        MapCache.prototype.clear = mapCacheClear;
        MapCache.prototype["delete"] = mapCacheDelete;
        MapCache.prototype.get = mapCacheGet;
        MapCache.prototype.has = mapCacheHas;
        MapCache.prototype.set = mapCacheSet;
        function SetCache(values2) {
          var index = -1, length = values2 == null ? 0 : values2.length;
          this.__data__ = new MapCache();
          while (++index < length) {
            this.add(values2[index]);
          }
        }
        function setCacheAdd(value) {
          this.__data__.set(value, HASH_UNDEFINED);
          return this;
        }
        function setCacheHas(value) {
          return this.__data__.has(value);
        }
        SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
        SetCache.prototype.has = setCacheHas;
        function Stack(entries) {
          var data = this.__data__ = new ListCache(entries);
          this.size = data.size;
        }
        function stackClear() {
          this.__data__ = new ListCache();
          this.size = 0;
        }
        function stackDelete(key) {
          var data = this.__data__, result2 = data["delete"](key);
          this.size = data.size;
          return result2;
        }
        function stackGet(key) {
          return this.__data__.get(key);
        }
        function stackHas(key) {
          return this.__data__.has(key);
        }
        function stackSet(key, value) {
          var data = this.__data__;
          if (data instanceof ListCache) {
            var pairs = data.__data__;
            if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
              pairs.push([key, value]);
              this.size = ++data.size;
              return this;
            }
            data = this.__data__ = new MapCache(pairs);
          }
          data.set(key, value);
          this.size = data.size;
          return this;
        }
        Stack.prototype.clear = stackClear;
        Stack.prototype["delete"] = stackDelete;
        Stack.prototype.get = stackGet;
        Stack.prototype.has = stackHas;
        Stack.prototype.set = stackSet;
        function arrayLikeKeys(value, inherited) {
          var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result2 = skipIndexes ? baseTimes(value.length, String) : [], length = result2.length;
          for (var key in value) {
            if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && // Safari 9 has enumerable `arguments.length` in strict mode.
            (key == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
            isBuff && (key == "offset" || key == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
            isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || // Skip index properties.
            isIndex(key, length)))) {
              result2.push(key);
            }
          }
          return result2;
        }
        function arraySample(array) {
          var length = array.length;
          return length ? array[baseRandom(0, length - 1)] : undefined$1;
        }
        function arraySampleSize(array, n2) {
          return shuffleSelf(copyArray(array), baseClamp(n2, 0, array.length));
        }
        function arrayShuffle(array) {
          return shuffleSelf(copyArray(array));
        }
        function assignMergeValue(object, key, value) {
          if (value !== undefined$1 && !eq(object[key], value) || value === undefined$1 && !(key in object)) {
            baseAssignValue(object, key, value);
          }
        }
        function assignValue(object, key, value) {
          var objValue = object[key];
          if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) || value === undefined$1 && !(key in object)) {
            baseAssignValue(object, key, value);
          }
        }
        function assocIndexOf(array, key) {
          var length = array.length;
          while (length--) {
            if (eq(array[length][0], key)) {
              return length;
            }
          }
          return -1;
        }
        function baseAggregator(collection, setter, iteratee2, accumulator) {
          baseEach(collection, function(value, key, collection2) {
            setter(accumulator, value, iteratee2(value), collection2);
          });
          return accumulator;
        }
        function baseAssign(object, source) {
          return object && copyObject(source, keys(source), object);
        }
        function baseAssignIn(object, source) {
          return object && copyObject(source, keysIn(source), object);
        }
        function baseAssignValue(object, key, value) {
          if (key == "__proto__" && defineProperty) {
            defineProperty(object, key, {
              "configurable": true,
              "enumerable": true,
              "value": value,
              "writable": true
            });
          } else {
            object[key] = value;
          }
        }
        function baseAt(object, paths) {
          var index = -1, length = paths.length, result2 = Array2(length), skip = object == null;
          while (++index < length) {
            result2[index] = skip ? undefined$1 : get(object, paths[index]);
          }
          return result2;
        }
        function baseClamp(number, lower, upper) {
          if (number === number) {
            if (upper !== undefined$1) {
              number = number <= upper ? number : upper;
            }
            if (lower !== undefined$1) {
              number = number >= lower ? number : lower;
            }
          }
          return number;
        }
        function baseClone(value, bitmask, customizer, key, object, stack) {
          var result2, isDeep = bitmask & CLONE_DEEP_FLAG, isFlat = bitmask & CLONE_FLAT_FLAG, isFull = bitmask & CLONE_SYMBOLS_FLAG;
          if (customizer) {
            result2 = object ? customizer(value, key, object, stack) : customizer(value);
          }
          if (result2 !== undefined$1) {
            return result2;
          }
          if (!isObject(value)) {
            return value;
          }
          var isArr = isArray(value);
          if (isArr) {
            result2 = initCloneArray(value);
            if (!isDeep) {
              return copyArray(value, result2);
            }
          } else {
            var tag = getTag(value), isFunc = tag == funcTag || tag == genTag;
            if (isBuffer(value)) {
              return cloneBuffer(value, isDeep);
            }
            if (tag == objectTag || tag == argsTag || isFunc && !object) {
              result2 = isFlat || isFunc ? {} : initCloneObject(value);
              if (!isDeep) {
                return isFlat ? copySymbolsIn(value, baseAssignIn(result2, value)) : copySymbols(value, baseAssign(result2, value));
              }
            } else {
              if (!cloneableTags[tag]) {
                return object ? value : {};
              }
              result2 = initCloneByTag(value, tag, isDeep);
            }
          }
          stack || (stack = new Stack());
          var stacked = stack.get(value);
          if (stacked) {
            return stacked;
          }
          stack.set(value, result2);
          if (isSet(value)) {
            value.forEach(function(subValue) {
              result2.add(baseClone(subValue, bitmask, customizer, subValue, value, stack));
            });
          } else if (isMap(value)) {
            value.forEach(function(subValue, key2) {
              result2.set(key2, baseClone(subValue, bitmask, customizer, key2, value, stack));
            });
          }
          var keysFunc = isFull ? isFlat ? getAllKeysIn : getAllKeys : isFlat ? keysIn : keys;
          var props = isArr ? undefined$1 : keysFunc(value);
          arrayEach(props || value, function(subValue, key2) {
            if (props) {
              key2 = subValue;
              subValue = value[key2];
            }
            assignValue(result2, key2, baseClone(subValue, bitmask, customizer, key2, value, stack));
          });
          return result2;
        }
        function baseConforms(source) {
          var props = keys(source);
          return function(object) {
            return baseConformsTo(object, source, props);
          };
        }
        function baseConformsTo(object, source, props) {
          var length = props.length;
          if (object == null) {
            return !length;
          }
          object = Object2(object);
          while (length--) {
            var key = props[length], predicate = source[key], value = object[key];
            if (value === undefined$1 && !(key in object) || !predicate(value)) {
              return false;
            }
          }
          return true;
        }
        function baseDelay(func, wait, args) {
          if (typeof func != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          return setTimeout2(function() {
            func.apply(undefined$1, args);
          }, wait);
        }
        function baseDifference(array, values2, iteratee2, comparator) {
          var index = -1, includes2 = arrayIncludes, isCommon = true, length = array.length, result2 = [], valuesLength = values2.length;
          if (!length) {
            return result2;
          }
          if (iteratee2) {
            values2 = arrayMap(values2, baseUnary(iteratee2));
          }
          if (comparator) {
            includes2 = arrayIncludesWith;
            isCommon = false;
          } else if (values2.length >= LARGE_ARRAY_SIZE) {
            includes2 = cacheHas;
            isCommon = false;
            values2 = new SetCache(values2);
          }
          outer:
            while (++index < length) {
              var value = array[index], computed = iteratee2 == null ? value : iteratee2(value);
              value = comparator || value !== 0 ? value : 0;
              if (isCommon && computed === computed) {
                var valuesIndex = valuesLength;
                while (valuesIndex--) {
                  if (values2[valuesIndex] === computed) {
                    continue outer;
                  }
                }
                result2.push(value);
              } else if (!includes2(values2, computed, comparator)) {
                result2.push(value);
              }
            }
          return result2;
        }
        var baseEach = createBaseEach(baseForOwn);
        var baseEachRight = createBaseEach(baseForOwnRight, true);
        function baseEvery(collection, predicate) {
          var result2 = true;
          baseEach(collection, function(value, index, collection2) {
            result2 = !!predicate(value, index, collection2);
            return result2;
          });
          return result2;
        }
        function baseExtremum(array, iteratee2, comparator) {
          var index = -1, length = array.length;
          while (++index < length) {
            var value = array[index], current = iteratee2(value);
            if (current != null && (computed === undefined$1 ? current === current && !isSymbol(current) : comparator(current, computed))) {
              var computed = current, result2 = value;
            }
          }
          return result2;
        }
        function baseFill(array, value, start, end) {
          var length = array.length;
          start = toInteger(start);
          if (start < 0) {
            start = -start > length ? 0 : length + start;
          }
          end = end === undefined$1 || end > length ? length : toInteger(end);
          if (end < 0) {
            end += length;
          }
          end = start > end ? 0 : toLength(end);
          while (start < end) {
            array[start++] = value;
          }
          return array;
        }
        function baseFilter(collection, predicate) {
          var result2 = [];
          baseEach(collection, function(value, index, collection2) {
            if (predicate(value, index, collection2)) {
              result2.push(value);
            }
          });
          return result2;
        }
        function baseFlatten(array, depth, predicate, isStrict, result2) {
          var index = -1, length = array.length;
          predicate || (predicate = isFlattenable);
          result2 || (result2 = []);
          while (++index < length) {
            var value = array[index];
            if (depth > 0 && predicate(value)) {
              if (depth > 1) {
                baseFlatten(value, depth - 1, predicate, isStrict, result2);
              } else {
                arrayPush(result2, value);
              }
            } else if (!isStrict) {
              result2[result2.length] = value;
            }
          }
          return result2;
        }
        var baseFor = createBaseFor();
        var baseForRight = createBaseFor(true);
        function baseForOwn(object, iteratee2) {
          return object && baseFor(object, iteratee2, keys);
        }
        function baseForOwnRight(object, iteratee2) {
          return object && baseForRight(object, iteratee2, keys);
        }
        function baseFunctions(object, props) {
          return arrayFilter(props, function(key) {
            return isFunction2(object[key]);
          });
        }
        function baseGet(object, path) {
          path = castPath(path, object);
          var index = 0, length = path.length;
          while (object != null && index < length) {
            object = object[toKey(path[index++])];
          }
          return index && index == length ? object : undefined$1;
        }
        function baseGetAllKeys(object, keysFunc, symbolsFunc) {
          var result2 = keysFunc(object);
          return isArray(object) ? result2 : arrayPush(result2, symbolsFunc(object));
        }
        function baseGetTag(value) {
          if (value == null) {
            return value === undefined$1 ? undefinedTag : nullTag;
          }
          return symToStringTag && symToStringTag in Object2(value) ? getRawTag(value) : objectToString(value);
        }
        function baseGt(value, other) {
          return value > other;
        }
        function baseHas(object, key) {
          return object != null && hasOwnProperty.call(object, key);
        }
        function baseHasIn(object, key) {
          return object != null && key in Object2(object);
        }
        function baseInRange(number, start, end) {
          return number >= nativeMin(start, end) && number < nativeMax(start, end);
        }
        function baseIntersection(arrays, iteratee2, comparator) {
          var includes2 = comparator ? arrayIncludesWith : arrayIncludes, length = arrays[0].length, othLength = arrays.length, othIndex = othLength, caches = Array2(othLength), maxLength = Infinity, result2 = [];
          while (othIndex--) {
            var array = arrays[othIndex];
            if (othIndex && iteratee2) {
              array = arrayMap(array, baseUnary(iteratee2));
            }
            maxLength = nativeMin(array.length, maxLength);
            caches[othIndex] = !comparator && (iteratee2 || length >= 120 && array.length >= 120) ? new SetCache(othIndex && array) : undefined$1;
          }
          array = arrays[0];
          var index = -1, seen = caches[0];
          outer:
            while (++index < length && result2.length < maxLength) {
              var value = array[index], computed = iteratee2 ? iteratee2(value) : value;
              value = comparator || value !== 0 ? value : 0;
              if (!(seen ? cacheHas(seen, computed) : includes2(result2, computed, comparator))) {
                othIndex = othLength;
                while (--othIndex) {
                  var cache = caches[othIndex];
                  if (!(cache ? cacheHas(cache, computed) : includes2(arrays[othIndex], computed, comparator))) {
                    continue outer;
                  }
                }
                if (seen) {
                  seen.push(computed);
                }
                result2.push(value);
              }
            }
          return result2;
        }
        function baseInverter(object, setter, iteratee2, accumulator) {
          baseForOwn(object, function(value, key, object2) {
            setter(accumulator, iteratee2(value), key, object2);
          });
          return accumulator;
        }
        function baseInvoke(object, path, args) {
          path = castPath(path, object);
          object = parent(object, path);
          var func = object == null ? object : object[toKey(last(path))];
          return func == null ? undefined$1 : apply(func, object, args);
        }
        function baseIsArguments(value) {
          return isObjectLike(value) && baseGetTag(value) == argsTag;
        }
        function baseIsArrayBuffer(value) {
          return isObjectLike(value) && baseGetTag(value) == arrayBufferTag;
        }
        function baseIsDate(value) {
          return isObjectLike(value) && baseGetTag(value) == dateTag;
        }
        function baseIsEqual(value, other, bitmask, customizer, stack) {
          if (value === other) {
            return true;
          }
          if (value == null || other == null || !isObjectLike(value) && !isObjectLike(other)) {
            return value !== value && other !== other;
          }
          return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
        }
        function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
          var objIsArr = isArray(object), othIsArr = isArray(other), objTag = objIsArr ? arrayTag : getTag(object), othTag = othIsArr ? arrayTag : getTag(other);
          objTag = objTag == argsTag ? objectTag : objTag;
          othTag = othTag == argsTag ? objectTag : othTag;
          var objIsObj = objTag == objectTag, othIsObj = othTag == objectTag, isSameTag = objTag == othTag;
          if (isSameTag && isBuffer(object)) {
            if (!isBuffer(other)) {
              return false;
            }
            objIsArr = true;
            objIsObj = false;
          }
          if (isSameTag && !objIsObj) {
            stack || (stack = new Stack());
            return objIsArr || isTypedArray(object) ? equalArrays(object, other, bitmask, customizer, equalFunc, stack) : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
          }
          if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
            var objIsWrapped = objIsObj && hasOwnProperty.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty.call(other, "__wrapped__");
            if (objIsWrapped || othIsWrapped) {
              var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
              stack || (stack = new Stack());
              return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
            }
          }
          if (!isSameTag) {
            return false;
          }
          stack || (stack = new Stack());
          return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
        }
        function baseIsMap(value) {
          return isObjectLike(value) && getTag(value) == mapTag;
        }
        function baseIsMatch(object, source, matchData, customizer) {
          var index = matchData.length, length = index, noCustomizer = !customizer;
          if (object == null) {
            return !length;
          }
          object = Object2(object);
          while (index--) {
            var data = matchData[index];
            if (noCustomizer && data[2] ? data[1] !== object[data[0]] : !(data[0] in object)) {
              return false;
            }
          }
          while (++index < length) {
            data = matchData[index];
            var key = data[0], objValue = object[key], srcValue = data[1];
            if (noCustomizer && data[2]) {
              if (objValue === undefined$1 && !(key in object)) {
                return false;
              }
            } else {
              var stack = new Stack();
              if (customizer) {
                var result2 = customizer(objValue, srcValue, key, object, source, stack);
              }
              if (!(result2 === undefined$1 ? baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG, customizer, stack) : result2)) {
                return false;
              }
            }
          }
          return true;
        }
        function baseIsNative(value) {
          if (!isObject(value) || isMasked(value)) {
            return false;
          }
          var pattern = isFunction2(value) ? reIsNative : reIsHostCtor;
          return pattern.test(toSource(value));
        }
        function baseIsRegExp(value) {
          return isObjectLike(value) && baseGetTag(value) == regexpTag;
        }
        function baseIsSet(value) {
          return isObjectLike(value) && getTag(value) == setTag;
        }
        function baseIsTypedArray(value) {
          return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
        }
        function baseIteratee(value) {
          if (typeof value == "function") {
            return value;
          }
          if (value == null) {
            return identity;
          }
          if (typeof value == "object") {
            return isArray(value) ? baseMatchesProperty(value[0], value[1]) : baseMatches(value);
          }
          return property(value);
        }
        function baseKeys(object) {
          if (!isPrototype(object)) {
            return nativeKeys(object);
          }
          var result2 = [];
          for (var key in Object2(object)) {
            if (hasOwnProperty.call(object, key) && key != "constructor") {
              result2.push(key);
            }
          }
          return result2;
        }
        function baseKeysIn(object) {
          if (!isObject(object)) {
            return nativeKeysIn(object);
          }
          var isProto = isPrototype(object), result2 = [];
          for (var key in object) {
            if (!(key == "constructor" && (isProto || !hasOwnProperty.call(object, key)))) {
              result2.push(key);
            }
          }
          return result2;
        }
        function baseLt(value, other) {
          return value < other;
        }
        function baseMap(collection, iteratee2) {
          var index = -1, result2 = isArrayLike(collection) ? Array2(collection.length) : [];
          baseEach(collection, function(value, key, collection2) {
            result2[++index] = iteratee2(value, key, collection2);
          });
          return result2;
        }
        function baseMatches(source) {
          var matchData = getMatchData(source);
          if (matchData.length == 1 && matchData[0][2]) {
            return matchesStrictComparable(matchData[0][0], matchData[0][1]);
          }
          return function(object) {
            return object === source || baseIsMatch(object, source, matchData);
          };
        }
        function baseMatchesProperty(path, srcValue) {
          if (isKey(path) && isStrictComparable(srcValue)) {
            return matchesStrictComparable(toKey(path), srcValue);
          }
          return function(object) {
            var objValue = get(object, path);
            return objValue === undefined$1 && objValue === srcValue ? hasIn(object, path) : baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG);
          };
        }
        function baseMerge(object, source, srcIndex, customizer, stack) {
          if (object === source) {
            return;
          }
          baseFor(source, function(srcValue, key) {
            stack || (stack = new Stack());
            if (isObject(srcValue)) {
              baseMergeDeep(object, source, key, srcIndex, baseMerge, customizer, stack);
            } else {
              var newValue = customizer ? customizer(safeGet(object, key), srcValue, key + "", object, source, stack) : undefined$1;
              if (newValue === undefined$1) {
                newValue = srcValue;
              }
              assignMergeValue(object, key, newValue);
            }
          }, keysIn);
        }
        function baseMergeDeep(object, source, key, srcIndex, mergeFunc, customizer, stack) {
          var objValue = safeGet(object, key), srcValue = safeGet(source, key), stacked = stack.get(srcValue);
          if (stacked) {
            assignMergeValue(object, key, stacked);
            return;
          }
          var newValue = customizer ? customizer(objValue, srcValue, key + "", object, source, stack) : undefined$1;
          var isCommon = newValue === undefined$1;
          if (isCommon) {
            var isArr = isArray(srcValue), isBuff = !isArr && isBuffer(srcValue), isTyped = !isArr && !isBuff && isTypedArray(srcValue);
            newValue = srcValue;
            if (isArr || isBuff || isTyped) {
              if (isArray(objValue)) {
                newValue = objValue;
              } else if (isArrayLikeObject(objValue)) {
                newValue = copyArray(objValue);
              } else if (isBuff) {
                isCommon = false;
                newValue = cloneBuffer(srcValue, true);
              } else if (isTyped) {
                isCommon = false;
                newValue = cloneTypedArray(srcValue, true);
              } else {
                newValue = [];
              }
            } else if (isPlainObject(srcValue) || isArguments(srcValue)) {
              newValue = objValue;
              if (isArguments(objValue)) {
                newValue = toPlainObject(objValue);
              } else if (!isObject(objValue) || isFunction2(objValue)) {
                newValue = initCloneObject(srcValue);
              }
            } else {
              isCommon = false;
            }
          }
          if (isCommon) {
            stack.set(srcValue, newValue);
            mergeFunc(newValue, srcValue, srcIndex, customizer, stack);
            stack["delete"](srcValue);
          }
          assignMergeValue(object, key, newValue);
        }
        function baseNth(array, n2) {
          var length = array.length;
          if (!length) {
            return;
          }
          n2 += n2 < 0 ? length : 0;
          return isIndex(n2, length) ? array[n2] : undefined$1;
        }
        function baseOrderBy(collection, iteratees, orders) {
          if (iteratees.length) {
            iteratees = arrayMap(iteratees, function(iteratee2) {
              if (isArray(iteratee2)) {
                return function(value) {
                  return baseGet(value, iteratee2.length === 1 ? iteratee2[0] : iteratee2);
                };
              }
              return iteratee2;
            });
          } else {
            iteratees = [identity];
          }
          var index = -1;
          iteratees = arrayMap(iteratees, baseUnary(getIteratee()));
          var result2 = baseMap(collection, function(value, key, collection2) {
            var criteria = arrayMap(iteratees, function(iteratee2) {
              return iteratee2(value);
            });
            return { "criteria": criteria, "index": ++index, "value": value };
          });
          return baseSortBy(result2, function(object, other) {
            return compareMultiple(object, other, orders);
          });
        }
        function basePick(object, paths) {
          return basePickBy(object, paths, function(value, path) {
            return hasIn(object, path);
          });
        }
        function basePickBy(object, paths, predicate) {
          var index = -1, length = paths.length, result2 = {};
          while (++index < length) {
            var path = paths[index], value = baseGet(object, path);
            if (predicate(value, path)) {
              baseSet(result2, castPath(path, object), value);
            }
          }
          return result2;
        }
        function basePropertyDeep(path) {
          return function(object) {
            return baseGet(object, path);
          };
        }
        function basePullAll(array, values2, iteratee2, comparator) {
          var indexOf2 = comparator ? baseIndexOfWith : baseIndexOf, index = -1, length = values2.length, seen = array;
          if (array === values2) {
            values2 = copyArray(values2);
          }
          if (iteratee2) {
            seen = arrayMap(array, baseUnary(iteratee2));
          }
          while (++index < length) {
            var fromIndex = 0, value = values2[index], computed = iteratee2 ? iteratee2(value) : value;
            while ((fromIndex = indexOf2(seen, computed, fromIndex, comparator)) > -1) {
              if (seen !== array) {
                splice.call(seen, fromIndex, 1);
              }
              splice.call(array, fromIndex, 1);
            }
          }
          return array;
        }
        function basePullAt(array, indexes) {
          var length = array ? indexes.length : 0, lastIndex = length - 1;
          while (length--) {
            var index = indexes[length];
            if (length == lastIndex || index !== previous) {
              var previous = index;
              if (isIndex(index)) {
                splice.call(array, index, 1);
              } else {
                baseUnset(array, index);
              }
            }
          }
          return array;
        }
        function baseRandom(lower, upper) {
          return lower + nativeFloor(nativeRandom() * (upper - lower + 1));
        }
        function baseRange(start, end, step, fromRight) {
          var index = -1, length = nativeMax(nativeCeil((end - start) / (step || 1)), 0), result2 = Array2(length);
          while (length--) {
            result2[fromRight ? length : ++index] = start;
            start += step;
          }
          return result2;
        }
        function baseRepeat(string, n2) {
          var result2 = "";
          if (!string || n2 < 1 || n2 > MAX_SAFE_INTEGER) {
            return result2;
          }
          do {
            if (n2 % 2) {
              result2 += string;
            }
            n2 = nativeFloor(n2 / 2);
            if (n2) {
              string += string;
            }
          } while (n2);
          return result2;
        }
        function baseRest(func, start) {
          return setToString(overRest(func, start, identity), func + "");
        }
        function baseSample(collection) {
          return arraySample(values(collection));
        }
        function baseSampleSize(collection, n2) {
          var array = values(collection);
          return shuffleSelf(array, baseClamp(n2, 0, array.length));
        }
        function baseSet(object, path, value, customizer) {
          if (!isObject(object)) {
            return object;
          }
          path = castPath(path, object);
          var index = -1, length = path.length, lastIndex = length - 1, nested = object;
          while (nested != null && ++index < length) {
            var key = toKey(path[index]), newValue = value;
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
              return object;
            }
            if (index != lastIndex) {
              var objValue = nested[key];
              newValue = customizer ? customizer(objValue, key, nested) : undefined$1;
              if (newValue === undefined$1) {
                newValue = isObject(objValue) ? objValue : isIndex(path[index + 1]) ? [] : {};
              }
            }
            assignValue(nested, key, newValue);
            nested = nested[key];
          }
          return object;
        }
        var baseSetData = !metaMap ? identity : function(func, data) {
          metaMap.set(func, data);
          return func;
        };
        var baseSetToString = !defineProperty ? identity : function(func, string) {
          return defineProperty(func, "toString", {
            "configurable": true,
            "enumerable": false,
            "value": constant(string),
            "writable": true
          });
        };
        function baseShuffle(collection) {
          return shuffleSelf(values(collection));
        }
        function baseSlice(array, start, end) {
          var index = -1, length = array.length;
          if (start < 0) {
            start = -start > length ? 0 : length + start;
          }
          end = end > length ? length : end;
          if (end < 0) {
            end += length;
          }
          length = start > end ? 0 : end - start >>> 0;
          start >>>= 0;
          var result2 = Array2(length);
          while (++index < length) {
            result2[index] = array[index + start];
          }
          return result2;
        }
        function baseSome(collection, predicate) {
          var result2;
          baseEach(collection, function(value, index, collection2) {
            result2 = predicate(value, index, collection2);
            return !result2;
          });
          return !!result2;
        }
        function baseSortedIndex(array, value, retHighest) {
          var low = 0, high = array == null ? low : array.length;
          if (typeof value == "number" && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
            while (low < high) {
              var mid = low + high >>> 1, computed = array[mid];
              if (computed !== null && !isSymbol(computed) && (retHighest ? computed <= value : computed < value)) {
                low = mid + 1;
              } else {
                high = mid;
              }
            }
            return high;
          }
          return baseSortedIndexBy(array, value, identity, retHighest);
        }
        function baseSortedIndexBy(array, value, iteratee2, retHighest) {
          var low = 0, high = array == null ? 0 : array.length;
          if (high === 0) {
            return 0;
          }
          value = iteratee2(value);
          var valIsNaN = value !== value, valIsNull = value === null, valIsSymbol = isSymbol(value), valIsUndefined = value === undefined$1;
          while (low < high) {
            var mid = nativeFloor((low + high) / 2), computed = iteratee2(array[mid]), othIsDefined = computed !== undefined$1, othIsNull = computed === null, othIsReflexive = computed === computed, othIsSymbol = isSymbol(computed);
            if (valIsNaN) {
              var setLow = retHighest || othIsReflexive;
            } else if (valIsUndefined) {
              setLow = othIsReflexive && (retHighest || othIsDefined);
            } else if (valIsNull) {
              setLow = othIsReflexive && othIsDefined && (retHighest || !othIsNull);
            } else if (valIsSymbol) {
              setLow = othIsReflexive && othIsDefined && !othIsNull && (retHighest || !othIsSymbol);
            } else if (othIsNull || othIsSymbol) {
              setLow = false;
            } else {
              setLow = retHighest ? computed <= value : computed < value;
            }
            if (setLow) {
              low = mid + 1;
            } else {
              high = mid;
            }
          }
          return nativeMin(high, MAX_ARRAY_INDEX);
        }
        function baseSortedUniq(array, iteratee2) {
          var index = -1, length = array.length, resIndex = 0, result2 = [];
          while (++index < length) {
            var value = array[index], computed = iteratee2 ? iteratee2(value) : value;
            if (!index || !eq(computed, seen)) {
              var seen = computed;
              result2[resIndex++] = value === 0 ? 0 : value;
            }
          }
          return result2;
        }
        function baseToNumber(value) {
          if (typeof value == "number") {
            return value;
          }
          if (isSymbol(value)) {
            return NAN;
          }
          return +value;
        }
        function baseToString(value) {
          if (typeof value == "string") {
            return value;
          }
          if (isArray(value)) {
            return arrayMap(value, baseToString) + "";
          }
          if (isSymbol(value)) {
            return symbolToString ? symbolToString.call(value) : "";
          }
          var result2 = value + "";
          return result2 == "0" && 1 / value == -INFINITY ? "-0" : result2;
        }
        function baseUniq(array, iteratee2, comparator) {
          var index = -1, includes2 = arrayIncludes, length = array.length, isCommon = true, result2 = [], seen = result2;
          if (comparator) {
            isCommon = false;
            includes2 = arrayIncludesWith;
          } else if (length >= LARGE_ARRAY_SIZE) {
            var set2 = iteratee2 ? null : createSet(array);
            if (set2) {
              return setToArray(set2);
            }
            isCommon = false;
            includes2 = cacheHas;
            seen = new SetCache();
          } else {
            seen = iteratee2 ? [] : result2;
          }
          outer:
            while (++index < length) {
              var value = array[index], computed = iteratee2 ? iteratee2(value) : value;
              value = comparator || value !== 0 ? value : 0;
              if (isCommon && computed === computed) {
                var seenIndex = seen.length;
                while (seenIndex--) {
                  if (seen[seenIndex] === computed) {
                    continue outer;
                  }
                }
                if (iteratee2) {
                  seen.push(computed);
                }
                result2.push(value);
              } else if (!includes2(seen, computed, comparator)) {
                if (seen !== result2) {
                  seen.push(computed);
                }
                result2.push(value);
              }
            }
          return result2;
        }
        function baseUnset(object, path) {
          path = castPath(path, object);
          var index = -1, length = path.length;
          if (!length) {
            return true;
          }
          while (++index < length) {
            var key = toKey(path[index]);
            if (key === "__proto__" && !hasOwnProperty.call(object, "__proto__")) {
              return false;
            }
            if ((key === "constructor" || key === "prototype") && index < length - 1) {
              return false;
            }
          }
          var obj = parent(object, path);
          return obj == null || delete obj[toKey(last(path))];
        }
        function baseUpdate(object, path, updater, customizer) {
          return baseSet(object, path, updater(baseGet(object, path)), customizer);
        }
        function baseWhile(array, predicate, isDrop, fromRight) {
          var length = array.length, index = fromRight ? length : -1;
          while ((fromRight ? index-- : ++index < length) && predicate(array[index], index, array)) {
          }
          return isDrop ? baseSlice(array, fromRight ? 0 : index, fromRight ? index + 1 : length) : baseSlice(array, fromRight ? index + 1 : 0, fromRight ? length : index);
        }
        function baseWrapperValue(value, actions) {
          var result2 = value;
          if (result2 instanceof LazyWrapper) {
            result2 = result2.value();
          }
          return arrayReduce(actions, function(result3, action) {
            return action.func.apply(action.thisArg, arrayPush([result3], action.args));
          }, result2);
        }
        function baseXor(arrays, iteratee2, comparator) {
          var length = arrays.length;
          if (length < 2) {
            return length ? baseUniq(arrays[0]) : [];
          }
          var index = -1, result2 = Array2(length);
          while (++index < length) {
            var array = arrays[index], othIndex = -1;
            while (++othIndex < length) {
              if (othIndex != index) {
                result2[index] = baseDifference(result2[index] || array, arrays[othIndex], iteratee2, comparator);
              }
            }
          }
          return baseUniq(baseFlatten(result2, 1), iteratee2, comparator);
        }
        function baseZipObject(props, values2, assignFunc) {
          var index = -1, length = props.length, valsLength = values2.length, result2 = {};
          while (++index < length) {
            var value = index < valsLength ? values2[index] : undefined$1;
            assignFunc(result2, props[index], value);
          }
          return result2;
        }
        function castArrayLikeObject(value) {
          return isArrayLikeObject(value) ? value : [];
        }
        function castFunction(value) {
          return typeof value == "function" ? value : identity;
        }
        function castPath(value, object) {
          if (isArray(value)) {
            return value;
          }
          return isKey(value, object) ? [value] : stringToPath(toString(value));
        }
        var castRest = baseRest;
        function castSlice(array, start, end) {
          var length = array.length;
          end = end === undefined$1 ? length : end;
          return !start && end >= length ? array : baseSlice(array, start, end);
        }
        var clearTimeout = ctxClearTimeout || function(id) {
          return root.clearTimeout(id);
        };
        function cloneBuffer(buffer, isDeep) {
          if (isDeep) {
            return buffer.slice();
          }
          var length = buffer.length, result2 = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);
          buffer.copy(result2);
          return result2;
        }
        function cloneArrayBuffer(arrayBuffer) {
          var result2 = new arrayBuffer.constructor(arrayBuffer.byteLength);
          new Uint8Array2(result2).set(new Uint8Array2(arrayBuffer));
          return result2;
        }
        function cloneDataView(dataView, isDeep) {
          var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
          return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
        }
        function cloneRegExp(regexp) {
          var result2 = new regexp.constructor(regexp.source, reFlags.exec(regexp));
          result2.lastIndex = regexp.lastIndex;
          return result2;
        }
        function cloneSymbol(symbol) {
          return symbolValueOf ? Object2(symbolValueOf.call(symbol)) : {};
        }
        function cloneTypedArray(typedArray, isDeep) {
          var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
          return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
        }
        function compareAscending(value, other) {
          if (value !== other) {
            var valIsDefined = value !== undefined$1, valIsNull = value === null, valIsReflexive = value === value, valIsSymbol = isSymbol(value);
            var othIsDefined = other !== undefined$1, othIsNull = other === null, othIsReflexive = other === other, othIsSymbol = isSymbol(other);
            if (!othIsNull && !othIsSymbol && !valIsSymbol && value > other || valIsSymbol && othIsDefined && othIsReflexive && !othIsNull && !othIsSymbol || valIsNull && othIsDefined && othIsReflexive || !valIsDefined && othIsReflexive || !valIsReflexive) {
              return 1;
            }
            if (!valIsNull && !valIsSymbol && !othIsSymbol && value < other || othIsSymbol && valIsDefined && valIsReflexive && !valIsNull && !valIsSymbol || othIsNull && valIsDefined && valIsReflexive || !othIsDefined && valIsReflexive || !othIsReflexive) {
              return -1;
            }
          }
          return 0;
        }
        function compareMultiple(object, other, orders) {
          var index = -1, objCriteria = object.criteria, othCriteria = other.criteria, length = objCriteria.length, ordersLength = orders.length;
          while (++index < length) {
            var result2 = compareAscending(objCriteria[index], othCriteria[index]);
            if (result2) {
              if (index >= ordersLength) {
                return result2;
              }
              var order = orders[index];
              return result2 * (order == "desc" ? -1 : 1);
            }
          }
          return object.index - other.index;
        }
        function composeArgs(args, partials, holders, isCurried) {
          var argsIndex = -1, argsLength = args.length, holdersLength = holders.length, leftIndex = -1, leftLength = partials.length, rangeLength = nativeMax(argsLength - holdersLength, 0), result2 = Array2(leftLength + rangeLength), isUncurried = !isCurried;
          while (++leftIndex < leftLength) {
            result2[leftIndex] = partials[leftIndex];
          }
          while (++argsIndex < holdersLength) {
            if (isUncurried || argsIndex < argsLength) {
              result2[holders[argsIndex]] = args[argsIndex];
            }
          }
          while (rangeLength--) {
            result2[leftIndex++] = args[argsIndex++];
          }
          return result2;
        }
        function composeArgsRight(args, partials, holders, isCurried) {
          var argsIndex = -1, argsLength = args.length, holdersIndex = -1, holdersLength = holders.length, rightIndex = -1, rightLength = partials.length, rangeLength = nativeMax(argsLength - holdersLength, 0), result2 = Array2(rangeLength + rightLength), isUncurried = !isCurried;
          while (++argsIndex < rangeLength) {
            result2[argsIndex] = args[argsIndex];
          }
          var offset = argsIndex;
          while (++rightIndex < rightLength) {
            result2[offset + rightIndex] = partials[rightIndex];
          }
          while (++holdersIndex < holdersLength) {
            if (isUncurried || argsIndex < argsLength) {
              result2[offset + holders[holdersIndex]] = args[argsIndex++];
            }
          }
          return result2;
        }
        function copyArray(source, array) {
          var index = -1, length = source.length;
          array || (array = Array2(length));
          while (++index < length) {
            array[index] = source[index];
          }
          return array;
        }
        function copyObject(source, props, object, customizer) {
          var isNew = !object;
          object || (object = {});
          var index = -1, length = props.length;
          while (++index < length) {
            var key = props[index];
            var newValue = customizer ? customizer(object[key], source[key], key, object, source) : undefined$1;
            if (newValue === undefined$1) {
              newValue = source[key];
            }
            if (isNew) {
              baseAssignValue(object, key, newValue);
            } else {
              assignValue(object, key, newValue);
            }
          }
          return object;
        }
        function copySymbols(source, object) {
          return copyObject(source, getSymbols(source), object);
        }
        function copySymbolsIn(source, object) {
          return copyObject(source, getSymbolsIn(source), object);
        }
        function createAggregator(setter, initializer) {
          return function(collection, iteratee2) {
            var func = isArray(collection) ? arrayAggregator : baseAggregator, accumulator = initializer ? initializer() : {};
            return func(collection, setter, getIteratee(iteratee2, 2), accumulator);
          };
        }
        function createAssigner(assigner) {
          return baseRest(function(object, sources) {
            var index = -1, length = sources.length, customizer = length > 1 ? sources[length - 1] : undefined$1, guard = length > 2 ? sources[2] : undefined$1;
            customizer = assigner.length > 3 && typeof customizer == "function" ? (length--, customizer) : undefined$1;
            if (guard && isIterateeCall(sources[0], sources[1], guard)) {
              customizer = length < 3 ? undefined$1 : customizer;
              length = 1;
            }
            object = Object2(object);
            while (++index < length) {
              var source = sources[index];
              if (source) {
                assigner(object, source, index, customizer);
              }
            }
            return object;
          });
        }
        function createBaseEach(eachFunc, fromRight) {
          return function(collection, iteratee2) {
            if (collection == null) {
              return collection;
            }
            if (!isArrayLike(collection)) {
              return eachFunc(collection, iteratee2);
            }
            var length = collection.length, index = fromRight ? length : -1, iterable = Object2(collection);
            while (fromRight ? index-- : ++index < length) {
              if (iteratee2(iterable[index], index, iterable) === false) {
                break;
              }
            }
            return collection;
          };
        }
        function createBaseFor(fromRight) {
          return function(object, iteratee2, keysFunc) {
            var index = -1, iterable = Object2(object), props = keysFunc(object), length = props.length;
            while (length--) {
              var key = props[fromRight ? length : ++index];
              if (iteratee2(iterable[key], key, iterable) === false) {
                break;
              }
            }
            return object;
          };
        }
        function createBind(func, bitmask, thisArg) {
          var isBind = bitmask & WRAP_BIND_FLAG, Ctor = createCtor(func);
          function wrapper() {
            var fn = this && this !== root && this instanceof wrapper ? Ctor : func;
            return fn.apply(isBind ? thisArg : this, arguments);
          }
          return wrapper;
        }
        function createCaseFirst(methodName) {
          return function(string) {
            string = toString(string);
            var strSymbols = hasUnicode(string) ? stringToArray(string) : undefined$1;
            var chr = strSymbols ? strSymbols[0] : string.charAt(0);
            var trailing = strSymbols ? castSlice(strSymbols, 1).join("") : string.slice(1);
            return chr[methodName]() + trailing;
          };
        }
        function createCompounder(callback) {
          return function(string) {
            return arrayReduce(words(deburr(string).replace(reApos, "")), callback, "");
          };
        }
        function createCtor(Ctor) {
          return function() {
            var args = arguments;
            switch (args.length) {
              case 0:
                return new Ctor();
              case 1:
                return new Ctor(args[0]);
              case 2:
                return new Ctor(args[0], args[1]);
              case 3:
                return new Ctor(args[0], args[1], args[2]);
              case 4:
                return new Ctor(args[0], args[1], args[2], args[3]);
              case 5:
                return new Ctor(args[0], args[1], args[2], args[3], args[4]);
              case 6:
                return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5]);
              case 7:
                return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
            }
            var thisBinding = baseCreate(Ctor.prototype), result2 = Ctor.apply(thisBinding, args);
            return isObject(result2) ? result2 : thisBinding;
          };
        }
        function createCurry(func, bitmask, arity) {
          var Ctor = createCtor(func);
          function wrapper() {
            var length = arguments.length, args = Array2(length), index = length, placeholder = getHolder(wrapper);
            while (index--) {
              args[index] = arguments[index];
            }
            var holders = length < 3 && args[0] !== placeholder && args[length - 1] !== placeholder ? [] : replaceHolders(args, placeholder);
            length -= holders.length;
            if (length < arity) {
              return createRecurry(
                func,
                bitmask,
                createHybrid,
                wrapper.placeholder,
                undefined$1,
                args,
                holders,
                undefined$1,
                undefined$1,
                arity - length
              );
            }
            var fn = this && this !== root && this instanceof wrapper ? Ctor : func;
            return apply(fn, this, args);
          }
          return wrapper;
        }
        function createFind(findIndexFunc) {
          return function(collection, predicate, fromIndex) {
            var iterable = Object2(collection);
            if (!isArrayLike(collection)) {
              var iteratee2 = getIteratee(predicate, 3);
              collection = keys(collection);
              predicate = function(key) {
                return iteratee2(iterable[key], key, iterable);
              };
            }
            var index = findIndexFunc(collection, predicate, fromIndex);
            return index > -1 ? iterable[iteratee2 ? collection[index] : index] : undefined$1;
          };
        }
        function createFlow(fromRight) {
          return flatRest(function(funcs) {
            var length = funcs.length, index = length, prereq = LodashWrapper.prototype.thru;
            if (fromRight) {
              funcs.reverse();
            }
            while (index--) {
              var func = funcs[index];
              if (typeof func != "function") {
                throw new TypeError2(FUNC_ERROR_TEXT);
              }
              if (prereq && !wrapper && getFuncName(func) == "wrapper") {
                var wrapper = new LodashWrapper([], true);
              }
            }
            index = wrapper ? index : length;
            while (++index < length) {
              func = funcs[index];
              var funcName = getFuncName(func), data = funcName == "wrapper" ? getData(func) : undefined$1;
              if (data && isLaziable(data[0]) && data[1] == (WRAP_ARY_FLAG | WRAP_CURRY_FLAG | WRAP_PARTIAL_FLAG | WRAP_REARG_FLAG) && !data[4].length && data[9] == 1) {
                wrapper = wrapper[getFuncName(data[0])].apply(wrapper, data[3]);
              } else {
                wrapper = func.length == 1 && isLaziable(func) ? wrapper[funcName]() : wrapper.thru(func);
              }
            }
            return function() {
              var args = arguments, value = args[0];
              if (wrapper && args.length == 1 && isArray(value)) {
                return wrapper.plant(value).value();
              }
              var index2 = 0, result2 = length ? funcs[index2].apply(this, args) : value;
              while (++index2 < length) {
                result2 = funcs[index2].call(this, result2);
              }
              return result2;
            };
          });
        }
        function createHybrid(func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary2, arity) {
          var isAry = bitmask & WRAP_ARY_FLAG, isBind = bitmask & WRAP_BIND_FLAG, isBindKey = bitmask & WRAP_BIND_KEY_FLAG, isCurried = bitmask & (WRAP_CURRY_FLAG | WRAP_CURRY_RIGHT_FLAG), isFlip = bitmask & WRAP_FLIP_FLAG, Ctor = isBindKey ? undefined$1 : createCtor(func);
          function wrapper() {
            var length = arguments.length, args = Array2(length), index = length;
            while (index--) {
              args[index] = arguments[index];
            }
            if (isCurried) {
              var placeholder = getHolder(wrapper), holdersCount = countHolders(args, placeholder);
            }
            if (partials) {
              args = composeArgs(args, partials, holders, isCurried);
            }
            if (partialsRight) {
              args = composeArgsRight(args, partialsRight, holdersRight, isCurried);
            }
            length -= holdersCount;
            if (isCurried && length < arity) {
              var newHolders = replaceHolders(args, placeholder);
              return createRecurry(
                func,
                bitmask,
                createHybrid,
                wrapper.placeholder,
                thisArg,
                args,
                newHolders,
                argPos,
                ary2,
                arity - length
              );
            }
            var thisBinding = isBind ? thisArg : this, fn = isBindKey ? thisBinding[func] : func;
            length = args.length;
            if (argPos) {
              args = reorder(args, argPos);
            } else if (isFlip && length > 1) {
              args.reverse();
            }
            if (isAry && ary2 < length) {
              args.length = ary2;
            }
            if (this && this !== root && this instanceof wrapper) {
              fn = Ctor || createCtor(fn);
            }
            return fn.apply(thisBinding, args);
          }
          return wrapper;
        }
        function createInverter(setter, toIteratee) {
          return function(object, iteratee2) {
            return baseInverter(object, setter, toIteratee(iteratee2), {});
          };
        }
        function createMathOperation(operator, defaultValue) {
          return function(value, other) {
            var result2;
            if (value === undefined$1 && other === undefined$1) {
              return defaultValue;
            }
            if (value !== undefined$1) {
              result2 = value;
            }
            if (other !== undefined$1) {
              if (result2 === undefined$1) {
                return other;
              }
              if (typeof value == "string" || typeof other == "string") {
                value = baseToString(value);
                other = baseToString(other);
              } else {
                value = baseToNumber(value);
                other = baseToNumber(other);
              }
              result2 = operator(value, other);
            }
            return result2;
          };
        }
        function createOver(arrayFunc) {
          return flatRest(function(iteratees) {
            iteratees = arrayMap(iteratees, baseUnary(getIteratee()));
            return baseRest(function(args) {
              var thisArg = this;
              return arrayFunc(iteratees, function(iteratee2) {
                return apply(iteratee2, thisArg, args);
              });
            });
          });
        }
        function createPadding(length, chars) {
          chars = chars === undefined$1 ? " " : baseToString(chars);
          var charsLength = chars.length;
          if (charsLength < 2) {
            return charsLength ? baseRepeat(chars, length) : chars;
          }
          var result2 = baseRepeat(chars, nativeCeil(length / stringSize(chars)));
          return hasUnicode(chars) ? castSlice(stringToArray(result2), 0, length).join("") : result2.slice(0, length);
        }
        function createPartial(func, bitmask, thisArg, partials) {
          var isBind = bitmask & WRAP_BIND_FLAG, Ctor = createCtor(func);
          function wrapper() {
            var argsIndex = -1, argsLength = arguments.length, leftIndex = -1, leftLength = partials.length, args = Array2(leftLength + argsLength), fn = this && this !== root && this instanceof wrapper ? Ctor : func;
            while (++leftIndex < leftLength) {
              args[leftIndex] = partials[leftIndex];
            }
            while (argsLength--) {
              args[leftIndex++] = arguments[++argsIndex];
            }
            return apply(fn, isBind ? thisArg : this, args);
          }
          return wrapper;
        }
        function createRange(fromRight) {
          return function(start, end, step) {
            if (step && typeof step != "number" && isIterateeCall(start, end, step)) {
              end = step = undefined$1;
            }
            start = toFinite(start);
            if (end === undefined$1) {
              end = start;
              start = 0;
            } else {
              end = toFinite(end);
            }
            step = step === undefined$1 ? start < end ? 1 : -1 : toFinite(step);
            return baseRange(start, end, step, fromRight);
          };
        }
        function createRelationalOperation(operator) {
          return function(value, other) {
            if (!(typeof value == "string" && typeof other == "string")) {
              value = toNumber(value);
              other = toNumber(other);
            }
            return operator(value, other);
          };
        }
        function createRecurry(func, bitmask, wrapFunc, placeholder, thisArg, partials, holders, argPos, ary2, arity) {
          var isCurry = bitmask & WRAP_CURRY_FLAG, newHolders = isCurry ? holders : undefined$1, newHoldersRight = isCurry ? undefined$1 : holders, newPartials = isCurry ? partials : undefined$1, newPartialsRight = isCurry ? undefined$1 : partials;
          bitmask |= isCurry ? WRAP_PARTIAL_FLAG : WRAP_PARTIAL_RIGHT_FLAG;
          bitmask &= ~(isCurry ? WRAP_PARTIAL_RIGHT_FLAG : WRAP_PARTIAL_FLAG);
          if (!(bitmask & WRAP_CURRY_BOUND_FLAG)) {
            bitmask &= -4;
          }
          var newData = [
            func,
            bitmask,
            thisArg,
            newPartials,
            newHolders,
            newPartialsRight,
            newHoldersRight,
            argPos,
            ary2,
            arity
          ];
          var result2 = wrapFunc.apply(undefined$1, newData);
          if (isLaziable(func)) {
            setData(result2, newData);
          }
          result2.placeholder = placeholder;
          return setWrapToString(result2, func, bitmask);
        }
        function createRound(methodName) {
          var func = Math2[methodName];
          return function(number, precision) {
            number = toNumber(number);
            precision = precision == null ? 0 : nativeMin(toInteger(precision), 292);
            if (precision && nativeIsFinite(number)) {
              var pair = (toString(number) + "e").split("e"), value = func(pair[0] + "e" + (+pair[1] + precision));
              pair = (toString(value) + "e").split("e");
              return +(pair[0] + "e" + (+pair[1] - precision));
            }
            return func(number);
          };
        }
        var createSet = !(Set2 && 1 / setToArray(new Set2([, -0]))[1] == INFINITY) ? noop : function(values2) {
          return new Set2(values2);
        };
        function createToPairs(keysFunc) {
          return function(object) {
            var tag = getTag(object);
            if (tag == mapTag) {
              return mapToArray(object);
            }
            if (tag == setTag) {
              return setToPairs(object);
            }
            return baseToPairs(object, keysFunc(object));
          };
        }
        function createWrap(func, bitmask, thisArg, partials, holders, argPos, ary2, arity) {
          var isBindKey = bitmask & WRAP_BIND_KEY_FLAG;
          if (!isBindKey && typeof func != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          var length = partials ? partials.length : 0;
          if (!length) {
            bitmask &= -97;
            partials = holders = undefined$1;
          }
          ary2 = ary2 === undefined$1 ? ary2 : nativeMax(toInteger(ary2), 0);
          arity = arity === undefined$1 ? arity : toInteger(arity);
          length -= holders ? holders.length : 0;
          if (bitmask & WRAP_PARTIAL_RIGHT_FLAG) {
            var partialsRight = partials, holdersRight = holders;
            partials = holders = undefined$1;
          }
          var data = isBindKey ? undefined$1 : getData(func);
          var newData = [
            func,
            bitmask,
            thisArg,
            partials,
            holders,
            partialsRight,
            holdersRight,
            argPos,
            ary2,
            arity
          ];
          if (data) {
            mergeData(newData, data);
          }
          func = newData[0];
          bitmask = newData[1];
          thisArg = newData[2];
          partials = newData[3];
          holders = newData[4];
          arity = newData[9] = newData[9] === undefined$1 ? isBindKey ? 0 : func.length : nativeMax(newData[9] - length, 0);
          if (!arity && bitmask & (WRAP_CURRY_FLAG | WRAP_CURRY_RIGHT_FLAG)) {
            bitmask &= -25;
          }
          if (!bitmask || bitmask == WRAP_BIND_FLAG) {
            var result2 = createBind(func, bitmask, thisArg);
          } else if (bitmask == WRAP_CURRY_FLAG || bitmask == WRAP_CURRY_RIGHT_FLAG) {
            result2 = createCurry(func, bitmask, arity);
          } else if ((bitmask == WRAP_PARTIAL_FLAG || bitmask == (WRAP_BIND_FLAG | WRAP_PARTIAL_FLAG)) && !holders.length) {
            result2 = createPartial(func, bitmask, thisArg, partials);
          } else {
            result2 = createHybrid.apply(undefined$1, newData);
          }
          var setter = data ? baseSetData : setData;
          return setWrapToString(setter(result2, newData), func, bitmask);
        }
        function customDefaultsAssignIn(objValue, srcValue, key, object) {
          if (objValue === undefined$1 || eq(objValue, objectProto[key]) && !hasOwnProperty.call(object, key)) {
            return srcValue;
          }
          return objValue;
        }
        function customDefaultsMerge(objValue, srcValue, key, object, source, stack) {
          if (isObject(objValue) && isObject(srcValue)) {
            stack.set(srcValue, objValue);
            baseMerge(objValue, srcValue, undefined$1, customDefaultsMerge, stack);
            stack["delete"](srcValue);
          }
          return objValue;
        }
        function customOmitClone(value) {
          return isPlainObject(value) ? undefined$1 : value;
        }
        function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
          var isPartial = bitmask & COMPARE_PARTIAL_FLAG, arrLength = array.length, othLength = other.length;
          if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
            return false;
          }
          var arrStacked = stack.get(array);
          var othStacked = stack.get(other);
          if (arrStacked && othStacked) {
            return arrStacked == other && othStacked == array;
          }
          var index = -1, result2 = true, seen = bitmask & COMPARE_UNORDERED_FLAG ? new SetCache() : undefined$1;
          stack.set(array, other);
          stack.set(other, array);
          while (++index < arrLength) {
            var arrValue = array[index], othValue = other[index];
            if (customizer) {
              var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
            }
            if (compared !== undefined$1) {
              if (compared) {
                continue;
              }
              result2 = false;
              break;
            }
            if (seen) {
              if (!arraySome(other, function(othValue2, othIndex) {
                if (!cacheHas(seen, othIndex) && (arrValue === othValue2 || equalFunc(arrValue, othValue2, bitmask, customizer, stack))) {
                  return seen.push(othIndex);
                }
              })) {
                result2 = false;
                break;
              }
            } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
              result2 = false;
              break;
            }
          }
          stack["delete"](array);
          stack["delete"](other);
          return result2;
        }
        function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
          switch (tag) {
            case dataViewTag:
              if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
                return false;
              }
              object = object.buffer;
              other = other.buffer;
            case arrayBufferTag:
              if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array2(object), new Uint8Array2(other))) {
                return false;
              }
              return true;
            case boolTag:
            case dateTag:
            case numberTag:
              return eq(+object, +other);
            case errorTag:
              return object.name == other.name && object.message == other.message;
            case regexpTag:
            case stringTag:
              return object == other + "";
            case mapTag:
              var convert = mapToArray;
            case setTag:
              var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
              convert || (convert = setToArray);
              if (object.size != other.size && !isPartial) {
                return false;
              }
              var stacked = stack.get(object);
              if (stacked) {
                return stacked == other;
              }
              bitmask |= COMPARE_UNORDERED_FLAG;
              stack.set(object, other);
              var result2 = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
              stack["delete"](object);
              return result2;
            case symbolTag:
              if (symbolValueOf) {
                return symbolValueOf.call(object) == symbolValueOf.call(other);
              }
          }
          return false;
        }
        function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
          var isPartial = bitmask & COMPARE_PARTIAL_FLAG, objProps = getAllKeys(object), objLength = objProps.length, othProps = getAllKeys(other), othLength = othProps.length;
          if (objLength != othLength && !isPartial) {
            return false;
          }
          var index = objLength;
          while (index--) {
            var key = objProps[index];
            if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
              return false;
            }
          }
          var objStacked = stack.get(object);
          var othStacked = stack.get(other);
          if (objStacked && othStacked) {
            return objStacked == other && othStacked == object;
          }
          var result2 = true;
          stack.set(object, other);
          stack.set(other, object);
          var skipCtor = isPartial;
          while (++index < objLength) {
            key = objProps[index];
            var objValue = object[key], othValue = other[key];
            if (customizer) {
              var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
            }
            if (!(compared === undefined$1 ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
              result2 = false;
              break;
            }
            skipCtor || (skipCtor = key == "constructor");
          }
          if (result2 && !skipCtor) {
            var objCtor = object.constructor, othCtor = other.constructor;
            if (objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
              result2 = false;
            }
          }
          stack["delete"](object);
          stack["delete"](other);
          return result2;
        }
        function flatRest(func) {
          return setToString(overRest(func, undefined$1, flatten), func + "");
        }
        function getAllKeys(object) {
          return baseGetAllKeys(object, keys, getSymbols);
        }
        function getAllKeysIn(object) {
          return baseGetAllKeys(object, keysIn, getSymbolsIn);
        }
        var getData = !metaMap ? noop : function(func) {
          return metaMap.get(func);
        };
        function getFuncName(func) {
          var result2 = func.name + "", array = realNames[result2], length = hasOwnProperty.call(realNames, result2) ? array.length : 0;
          while (length--) {
            var data = array[length], otherFunc = data.func;
            if (otherFunc == null || otherFunc == func) {
              return data.name;
            }
          }
          return result2;
        }
        function getHolder(func) {
          var object = hasOwnProperty.call(lodash2, "placeholder") ? lodash2 : func;
          return object.placeholder;
        }
        function getIteratee() {
          var result2 = lodash2.iteratee || iteratee;
          result2 = result2 === iteratee ? baseIteratee : result2;
          return arguments.length ? result2(arguments[0], arguments[1]) : result2;
        }
        function getMapData(map2, key) {
          var data = map2.__data__;
          return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
        }
        function getMatchData(object) {
          var result2 = keys(object), length = result2.length;
          while (length--) {
            var key = result2[length], value = object[key];
            result2[length] = [key, value, isStrictComparable(value)];
          }
          return result2;
        }
        function getNative(object, key) {
          var value = getValue(object, key);
          return baseIsNative(value) ? value : undefined$1;
        }
        function getRawTag(value) {
          var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
          try {
            value[symToStringTag] = undefined$1;
            var unmasked = true;
          } catch (e2) {
          }
          var result2 = nativeObjectToString.call(value);
          if (unmasked) {
            if (isOwn) {
              value[symToStringTag] = tag;
            } else {
              delete value[symToStringTag];
            }
          }
          return result2;
        }
        var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
          if (object == null) {
            return [];
          }
          object = Object2(object);
          return arrayFilter(nativeGetSymbols(object), function(symbol) {
            return propertyIsEnumerable.call(object, symbol);
          });
        };
        var getSymbolsIn = !nativeGetSymbols ? stubArray : function(object) {
          var result2 = [];
          while (object) {
            arrayPush(result2, getSymbols(object));
            object = getPrototype(object);
          }
          return result2;
        };
        var getTag = baseGetTag;
        if (DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap2 && getTag(new WeakMap2()) != weakMapTag) {
          getTag = function(value) {
            var result2 = baseGetTag(value), Ctor = result2 == objectTag ? value.constructor : undefined$1, ctorString = Ctor ? toSource(Ctor) : "";
            if (ctorString) {
              switch (ctorString) {
                case dataViewCtorString:
                  return dataViewTag;
                case mapCtorString:
                  return mapTag;
                case promiseCtorString:
                  return promiseTag;
                case setCtorString:
                  return setTag;
                case weakMapCtorString:
                  return weakMapTag;
              }
            }
            return result2;
          };
        }
        function getView(start, end, transforms) {
          var index = -1, length = transforms.length;
          while (++index < length) {
            var data = transforms[index], size2 = data.size;
            switch (data.type) {
              case "drop":
                start += size2;
                break;
              case "dropRight":
                end -= size2;
                break;
              case "take":
                end = nativeMin(end, start + size2);
                break;
              case "takeRight":
                start = nativeMax(start, end - size2);
                break;
            }
          }
          return { "start": start, "end": end };
        }
        function getWrapDetails(source) {
          var match = source.match(reWrapDetails);
          return match ? match[1].split(reSplitDetails) : [];
        }
        function hasPath(object, path, hasFunc) {
          path = castPath(path, object);
          var index = -1, length = path.length, result2 = false;
          while (++index < length) {
            var key = toKey(path[index]);
            if (!(result2 = object != null && hasFunc(object, key))) {
              break;
            }
            object = object[key];
          }
          if (result2 || ++index != length) {
            return result2;
          }
          length = object == null ? 0 : object.length;
          return !!length && isLength(length) && isIndex(key, length) && (isArray(object) || isArguments(object));
        }
        function initCloneArray(array) {
          var length = array.length, result2 = new array.constructor(length);
          if (length && typeof array[0] == "string" && hasOwnProperty.call(array, "index")) {
            result2.index = array.index;
            result2.input = array.input;
          }
          return result2;
        }
        function initCloneObject(object) {
          return typeof object.constructor == "function" && !isPrototype(object) ? baseCreate(getPrototype(object)) : {};
        }
        function initCloneByTag(object, tag, isDeep) {
          var Ctor = object.constructor;
          switch (tag) {
            case arrayBufferTag:
              return cloneArrayBuffer(object);
            case boolTag:
            case dateTag:
              return new Ctor(+object);
            case dataViewTag:
              return cloneDataView(object, isDeep);
            case float32Tag:
            case float64Tag:
            case int8Tag:
            case int16Tag:
            case int32Tag:
            case uint8Tag:
            case uint8ClampedTag:
            case uint16Tag:
            case uint32Tag:
              return cloneTypedArray(object, isDeep);
            case mapTag:
              return new Ctor();
            case numberTag:
            case stringTag:
              return new Ctor(object);
            case regexpTag:
              return cloneRegExp(object);
            case setTag:
              return new Ctor();
            case symbolTag:
              return cloneSymbol(object);
          }
        }
        function insertWrapDetails(source, details) {
          var length = details.length;
          if (!length) {
            return source;
          }
          var lastIndex = length - 1;
          details[lastIndex] = (length > 1 ? "& " : "") + details[lastIndex];
          details = details.join(length > 2 ? ", " : " ");
          return source.replace(reWrapComment, "{\n/* [wrapped with " + details + "] */\n");
        }
        function isFlattenable(value) {
          return isArray(value) || isArguments(value) || !!(spreadableSymbol && value && value[spreadableSymbol]);
        }
        function isIndex(value, length) {
          var type = typeof value;
          length = length == null ? MAX_SAFE_INTEGER : length;
          return !!length && (type == "number" || type != "symbol" && reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
        }
        function isIterateeCall(value, index, object) {
          if (!isObject(object)) {
            return false;
          }
          var type = typeof index;
          if (type == "number" ? isArrayLike(object) && isIndex(index, object.length) : type == "string" && index in object) {
            return eq(object[index], value);
          }
          return false;
        }
        function isKey(value, object) {
          if (isArray(value)) {
            return false;
          }
          var type = typeof value;
          if (type == "number" || type == "symbol" || type == "boolean" || value == null || isSymbol(value)) {
            return true;
          }
          return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object != null && value in Object2(object);
        }
        function isKeyable(value) {
          var type = typeof value;
          return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
        }
        function isLaziable(func) {
          var funcName = getFuncName(func), other = lodash2[funcName];
          if (typeof other != "function" || !(funcName in LazyWrapper.prototype)) {
            return false;
          }
          if (func === other) {
            return true;
          }
          var data = getData(other);
          return !!data && func === data[0];
        }
        function isMasked(func) {
          return !!maskSrcKey && maskSrcKey in func;
        }
        var isMaskable = coreJsData ? isFunction2 : stubFalse;
        function isPrototype(value) {
          var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
          return value === proto;
        }
        function isStrictComparable(value) {
          return value === value && !isObject(value);
        }
        function matchesStrictComparable(key, srcValue) {
          return function(object) {
            if (object == null) {
              return false;
            }
            return object[key] === srcValue && (srcValue !== undefined$1 || key in Object2(object));
          };
        }
        function memoizeCapped(func) {
          var result2 = memoize(func, function(key) {
            if (cache.size === MAX_MEMOIZE_SIZE) {
              cache.clear();
            }
            return key;
          });
          var cache = result2.cache;
          return result2;
        }
        function mergeData(data, source) {
          var bitmask = data[1], srcBitmask = source[1], newBitmask = bitmask | srcBitmask, isCommon = newBitmask < (WRAP_BIND_FLAG | WRAP_BIND_KEY_FLAG | WRAP_ARY_FLAG);
          var isCombo = srcBitmask == WRAP_ARY_FLAG && bitmask == WRAP_CURRY_FLAG || srcBitmask == WRAP_ARY_FLAG && bitmask == WRAP_REARG_FLAG && data[7].length <= source[8] || srcBitmask == (WRAP_ARY_FLAG | WRAP_REARG_FLAG) && source[7].length <= source[8] && bitmask == WRAP_CURRY_FLAG;
          if (!(isCommon || isCombo)) {
            return data;
          }
          if (srcBitmask & WRAP_BIND_FLAG) {
            data[2] = source[2];
            newBitmask |= bitmask & WRAP_BIND_FLAG ? 0 : WRAP_CURRY_BOUND_FLAG;
          }
          var value = source[3];
          if (value) {
            var partials = data[3];
            data[3] = partials ? composeArgs(partials, value, source[4]) : value;
            data[4] = partials ? replaceHolders(data[3], PLACEHOLDER) : source[4];
          }
          value = source[5];
          if (value) {
            partials = data[5];
            data[5] = partials ? composeArgsRight(partials, value, source[6]) : value;
            data[6] = partials ? replaceHolders(data[5], PLACEHOLDER) : source[6];
          }
          value = source[7];
          if (value) {
            data[7] = value;
          }
          if (srcBitmask & WRAP_ARY_FLAG) {
            data[8] = data[8] == null ? source[8] : nativeMin(data[8], source[8]);
          }
          if (data[9] == null) {
            data[9] = source[9];
          }
          data[0] = source[0];
          data[1] = newBitmask;
          return data;
        }
        function nativeKeysIn(object) {
          var result2 = [];
          if (object != null) {
            for (var key in Object2(object)) {
              result2.push(key);
            }
          }
          return result2;
        }
        function objectToString(value) {
          return nativeObjectToString.call(value);
        }
        function overRest(func, start, transform2) {
          start = nativeMax(start === undefined$1 ? func.length - 1 : start, 0);
          return function() {
            var args = arguments, index = -1, length = nativeMax(args.length - start, 0), array = Array2(length);
            while (++index < length) {
              array[index] = args[start + index];
            }
            index = -1;
            var otherArgs = Array2(start + 1);
            while (++index < start) {
              otherArgs[index] = args[index];
            }
            otherArgs[start] = transform2(array);
            return apply(func, this, otherArgs);
          };
        }
        function parent(object, path) {
          return path.length < 2 ? object : baseGet(object, baseSlice(path, 0, -1));
        }
        function reorder(array, indexes) {
          var arrLength = array.length, length = nativeMin(indexes.length, arrLength), oldArray = copyArray(array);
          while (length--) {
            var index = indexes[length];
            array[length] = isIndex(index, arrLength) ? oldArray[index] : undefined$1;
          }
          return array;
        }
        function safeGet(object, key) {
          if (key === "constructor" && typeof object[key] === "function") {
            return;
          }
          if (key == "__proto__") {
            return;
          }
          return object[key];
        }
        var setData = shortOut(baseSetData);
        var setTimeout2 = ctxSetTimeout || function(func, wait) {
          return root.setTimeout(func, wait);
        };
        var setToString = shortOut(baseSetToString);
        function setWrapToString(wrapper, reference, bitmask) {
          var source = reference + "";
          return setToString(wrapper, insertWrapDetails(source, updateWrapDetails(getWrapDetails(source), bitmask)));
        }
        function shortOut(func) {
          var count = 0, lastCalled = 0;
          return function() {
            var stamp = nativeNow(), remaining = HOT_SPAN - (stamp - lastCalled);
            lastCalled = stamp;
            if (remaining > 0) {
              if (++count >= HOT_COUNT) {
                return arguments[0];
              }
            } else {
              count = 0;
            }
            return func.apply(undefined$1, arguments);
          };
        }
        function shuffleSelf(array, size2) {
          var index = -1, length = array.length, lastIndex = length - 1;
          size2 = size2 === undefined$1 ? length : size2;
          while (++index < size2) {
            var rand = baseRandom(index, lastIndex), value = array[rand];
            array[rand] = array[index];
            array[index] = value;
          }
          array.length = size2;
          return array;
        }
        var stringToPath = memoizeCapped(function(string) {
          var result2 = [];
          if (string.charCodeAt(0) === 46) {
            result2.push("");
          }
          string.replace(rePropName, function(match, number, quote, subString) {
            result2.push(quote ? subString.replace(reEscapeChar, "$1") : number || match);
          });
          return result2;
        });
        function toKey(value) {
          if (typeof value == "string" || isSymbol(value)) {
            return value;
          }
          var result2 = value + "";
          return result2 == "0" && 1 / value == -INFINITY ? "-0" : result2;
        }
        function toSource(func) {
          if (func != null) {
            try {
              return funcToString.call(func);
            } catch (e2) {
            }
            try {
              return func + "";
            } catch (e2) {
            }
          }
          return "";
        }
        function updateWrapDetails(details, bitmask) {
          arrayEach(wrapFlags, function(pair) {
            var value = "_." + pair[0];
            if (bitmask & pair[1] && !arrayIncludes(details, value)) {
              details.push(value);
            }
          });
          return details.sort();
        }
        function wrapperClone(wrapper) {
          if (wrapper instanceof LazyWrapper) {
            return wrapper.clone();
          }
          var result2 = new LodashWrapper(wrapper.__wrapped__, wrapper.__chain__);
          result2.__actions__ = copyArray(wrapper.__actions__);
          result2.__index__ = wrapper.__index__;
          result2.__values__ = wrapper.__values__;
          return result2;
        }
        function chunk(array, size2, guard) {
          if (guard ? isIterateeCall(array, size2, guard) : size2 === undefined$1) {
            size2 = 1;
          } else {
            size2 = nativeMax(toInteger(size2), 0);
          }
          var length = array == null ? 0 : array.length;
          if (!length || size2 < 1) {
            return [];
          }
          var index = 0, resIndex = 0, result2 = Array2(nativeCeil(length / size2));
          while (index < length) {
            result2[resIndex++] = baseSlice(array, index, index += size2);
          }
          return result2;
        }
        function compact(array) {
          var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result2 = [];
          while (++index < length) {
            var value = array[index];
            if (value) {
              result2[resIndex++] = value;
            }
          }
          return result2;
        }
        function concat() {
          var length = arguments.length;
          if (!length) {
            return [];
          }
          var args = Array2(length - 1), array = arguments[0], index = length;
          while (index--) {
            args[index - 1] = arguments[index];
          }
          return arrayPush(isArray(array) ? copyArray(array) : [array], baseFlatten(args, 1));
        }
        var difference = baseRest(function(array, values2) {
          return isArrayLikeObject(array) ? baseDifference(array, baseFlatten(values2, 1, isArrayLikeObject, true)) : [];
        });
        var differenceBy = baseRest(function(array, values2) {
          var iteratee2 = last(values2);
          if (isArrayLikeObject(iteratee2)) {
            iteratee2 = undefined$1;
          }
          return isArrayLikeObject(array) ? baseDifference(array, baseFlatten(values2, 1, isArrayLikeObject, true), getIteratee(iteratee2, 2)) : [];
        });
        var differenceWith = baseRest(function(array, values2) {
          var comparator = last(values2);
          if (isArrayLikeObject(comparator)) {
            comparator = undefined$1;
          }
          return isArrayLikeObject(array) ? baseDifference(array, baseFlatten(values2, 1, isArrayLikeObject, true), undefined$1, comparator) : [];
        });
        function drop(array, n2, guard) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return [];
          }
          n2 = guard || n2 === undefined$1 ? 1 : toInteger(n2);
          return baseSlice(array, n2 < 0 ? 0 : n2, length);
        }
        function dropRight(array, n2, guard) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return [];
          }
          n2 = guard || n2 === undefined$1 ? 1 : toInteger(n2);
          n2 = length - n2;
          return baseSlice(array, 0, n2 < 0 ? 0 : n2);
        }
        function dropRightWhile(array, predicate) {
          return array && array.length ? baseWhile(array, getIteratee(predicate, 3), true, true) : [];
        }
        function dropWhile(array, predicate) {
          return array && array.length ? baseWhile(array, getIteratee(predicate, 3), true) : [];
        }
        function fill(array, value, start, end) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return [];
          }
          if (start && typeof start != "number" && isIterateeCall(array, value, start)) {
            start = 0;
            end = length;
          }
          return baseFill(array, value, start, end);
        }
        function findIndex(array, predicate, fromIndex) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return -1;
          }
          var index = fromIndex == null ? 0 : toInteger(fromIndex);
          if (index < 0) {
            index = nativeMax(length + index, 0);
          }
          return baseFindIndex(array, getIteratee(predicate, 3), index);
        }
        function findLastIndex(array, predicate, fromIndex) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return -1;
          }
          var index = length - 1;
          if (fromIndex !== undefined$1) {
            index = toInteger(fromIndex);
            index = fromIndex < 0 ? nativeMax(length + index, 0) : nativeMin(index, length - 1);
          }
          return baseFindIndex(array, getIteratee(predicate, 3), index, true);
        }
        function flatten(array) {
          var length = array == null ? 0 : array.length;
          return length ? baseFlatten(array, 1) : [];
        }
        function flattenDeep(array) {
          var length = array == null ? 0 : array.length;
          return length ? baseFlatten(array, INFINITY) : [];
        }
        function flattenDepth(array, depth) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return [];
          }
          depth = depth === undefined$1 ? 1 : toInteger(depth);
          return baseFlatten(array, depth);
        }
        function fromPairs(pairs) {
          var index = -1, length = pairs == null ? 0 : pairs.length, result2 = {};
          while (++index < length) {
            var pair = pairs[index];
            baseAssignValue(result2, pair[0], pair[1]);
          }
          return result2;
        }
        function head(array) {
          return array && array.length ? array[0] : undefined$1;
        }
        function indexOf(array, value, fromIndex) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return -1;
          }
          var index = fromIndex == null ? 0 : toInteger(fromIndex);
          if (index < 0) {
            index = nativeMax(length + index, 0);
          }
          return baseIndexOf(array, value, index);
        }
        function initial(array) {
          var length = array == null ? 0 : array.length;
          return length ? baseSlice(array, 0, -1) : [];
        }
        var intersection = baseRest(function(arrays) {
          var mapped = arrayMap(arrays, castArrayLikeObject);
          return mapped.length && mapped[0] === arrays[0] ? baseIntersection(mapped) : [];
        });
        var intersectionBy = baseRest(function(arrays) {
          var iteratee2 = last(arrays), mapped = arrayMap(arrays, castArrayLikeObject);
          if (iteratee2 === last(mapped)) {
            iteratee2 = undefined$1;
          } else {
            mapped.pop();
          }
          return mapped.length && mapped[0] === arrays[0] ? baseIntersection(mapped, getIteratee(iteratee2, 2)) : [];
        });
        var intersectionWith = baseRest(function(arrays) {
          var comparator = last(arrays), mapped = arrayMap(arrays, castArrayLikeObject);
          comparator = typeof comparator == "function" ? comparator : undefined$1;
          if (comparator) {
            mapped.pop();
          }
          return mapped.length && mapped[0] === arrays[0] ? baseIntersection(mapped, undefined$1, comparator) : [];
        });
        function join(array, separator) {
          return array == null ? "" : nativeJoin.call(array, separator);
        }
        function last(array) {
          var length = array == null ? 0 : array.length;
          return length ? array[length - 1] : undefined$1;
        }
        function lastIndexOf(array, value, fromIndex) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return -1;
          }
          var index = length;
          if (fromIndex !== undefined$1) {
            index = toInteger(fromIndex);
            index = index < 0 ? nativeMax(length + index, 0) : nativeMin(index, length - 1);
          }
          return value === value ? strictLastIndexOf(array, value, index) : baseFindIndex(array, baseIsNaN, index, true);
        }
        function nth(array, n2) {
          return array && array.length ? baseNth(array, toInteger(n2)) : undefined$1;
        }
        var pull = baseRest(pullAll);
        function pullAll(array, values2) {
          return array && array.length && values2 && values2.length ? basePullAll(array, values2) : array;
        }
        function pullAllBy(array, values2, iteratee2) {
          return array && array.length && values2 && values2.length ? basePullAll(array, values2, getIteratee(iteratee2, 2)) : array;
        }
        function pullAllWith(array, values2, comparator) {
          return array && array.length && values2 && values2.length ? basePullAll(array, values2, undefined$1, comparator) : array;
        }
        var pullAt = flatRest(function(array, indexes) {
          var length = array == null ? 0 : array.length, result2 = baseAt(array, indexes);
          basePullAt(array, arrayMap(indexes, function(index) {
            return isIndex(index, length) ? +index : index;
          }).sort(compareAscending));
          return result2;
        });
        function remove(array, predicate) {
          var result2 = [];
          if (!(array && array.length)) {
            return result2;
          }
          var index = -1, indexes = [], length = array.length;
          predicate = getIteratee(predicate, 3);
          while (++index < length) {
            var value = array[index];
            if (predicate(value, index, array)) {
              result2.push(value);
              indexes.push(index);
            }
          }
          basePullAt(array, indexes);
          return result2;
        }
        function reverse(array) {
          return array == null ? array : nativeReverse.call(array);
        }
        function slice(array, start, end) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return [];
          }
          if (end && typeof end != "number" && isIterateeCall(array, start, end)) {
            start = 0;
            end = length;
          } else {
            start = start == null ? 0 : toInteger(start);
            end = end === undefined$1 ? length : toInteger(end);
          }
          return baseSlice(array, start, end);
        }
        function sortedIndex(array, value) {
          return baseSortedIndex(array, value);
        }
        function sortedIndexBy(array, value, iteratee2) {
          return baseSortedIndexBy(array, value, getIteratee(iteratee2, 2));
        }
        function sortedIndexOf(array, value) {
          var length = array == null ? 0 : array.length;
          if (length) {
            var index = baseSortedIndex(array, value);
            if (index < length && eq(array[index], value)) {
              return index;
            }
          }
          return -1;
        }
        function sortedLastIndex(array, value) {
          return baseSortedIndex(array, value, true);
        }
        function sortedLastIndexBy(array, value, iteratee2) {
          return baseSortedIndexBy(array, value, getIteratee(iteratee2, 2), true);
        }
        function sortedLastIndexOf(array, value) {
          var length = array == null ? 0 : array.length;
          if (length) {
            var index = baseSortedIndex(array, value, true) - 1;
            if (eq(array[index], value)) {
              return index;
            }
          }
          return -1;
        }
        function sortedUniq(array) {
          return array && array.length ? baseSortedUniq(array) : [];
        }
        function sortedUniqBy(array, iteratee2) {
          return array && array.length ? baseSortedUniq(array, getIteratee(iteratee2, 2)) : [];
        }
        function tail(array) {
          var length = array == null ? 0 : array.length;
          return length ? baseSlice(array, 1, length) : [];
        }
        function take(array, n2, guard) {
          if (!(array && array.length)) {
            return [];
          }
          n2 = guard || n2 === undefined$1 ? 1 : toInteger(n2);
          return baseSlice(array, 0, n2 < 0 ? 0 : n2);
        }
        function takeRight(array, n2, guard) {
          var length = array == null ? 0 : array.length;
          if (!length) {
            return [];
          }
          n2 = guard || n2 === undefined$1 ? 1 : toInteger(n2);
          n2 = length - n2;
          return baseSlice(array, n2 < 0 ? 0 : n2, length);
        }
        function takeRightWhile(array, predicate) {
          return array && array.length ? baseWhile(array, getIteratee(predicate, 3), false, true) : [];
        }
        function takeWhile(array, predicate) {
          return array && array.length ? baseWhile(array, getIteratee(predicate, 3)) : [];
        }
        var union = baseRest(function(arrays) {
          return baseUniq(baseFlatten(arrays, 1, isArrayLikeObject, true));
        });
        var unionBy = baseRest(function(arrays) {
          var iteratee2 = last(arrays);
          if (isArrayLikeObject(iteratee2)) {
            iteratee2 = undefined$1;
          }
          return baseUniq(baseFlatten(arrays, 1, isArrayLikeObject, true), getIteratee(iteratee2, 2));
        });
        var unionWith = baseRest(function(arrays) {
          var comparator = last(arrays);
          comparator = typeof comparator == "function" ? comparator : undefined$1;
          return baseUniq(baseFlatten(arrays, 1, isArrayLikeObject, true), undefined$1, comparator);
        });
        function uniq(array) {
          return array && array.length ? baseUniq(array) : [];
        }
        function uniqBy(array, iteratee2) {
          return array && array.length ? baseUniq(array, getIteratee(iteratee2, 2)) : [];
        }
        function uniqWith(array, comparator) {
          comparator = typeof comparator == "function" ? comparator : undefined$1;
          return array && array.length ? baseUniq(array, undefined$1, comparator) : [];
        }
        function unzip(array) {
          if (!(array && array.length)) {
            return [];
          }
          var length = 0;
          array = arrayFilter(array, function(group) {
            if (isArrayLikeObject(group)) {
              length = nativeMax(group.length, length);
              return true;
            }
          });
          return baseTimes(length, function(index) {
            return arrayMap(array, baseProperty(index));
          });
        }
        function unzipWith(array, iteratee2) {
          if (!(array && array.length)) {
            return [];
          }
          var result2 = unzip(array);
          if (iteratee2 == null) {
            return result2;
          }
          return arrayMap(result2, function(group) {
            return apply(iteratee2, undefined$1, group);
          });
        }
        var without = baseRest(function(array, values2) {
          return isArrayLikeObject(array) ? baseDifference(array, values2) : [];
        });
        var xor = baseRest(function(arrays) {
          return baseXor(arrayFilter(arrays, isArrayLikeObject));
        });
        var xorBy = baseRest(function(arrays) {
          var iteratee2 = last(arrays);
          if (isArrayLikeObject(iteratee2)) {
            iteratee2 = undefined$1;
          }
          return baseXor(arrayFilter(arrays, isArrayLikeObject), getIteratee(iteratee2, 2));
        });
        var xorWith = baseRest(function(arrays) {
          var comparator = last(arrays);
          comparator = typeof comparator == "function" ? comparator : undefined$1;
          return baseXor(arrayFilter(arrays, isArrayLikeObject), undefined$1, comparator);
        });
        var zip = baseRest(unzip);
        function zipObject(props, values2) {
          return baseZipObject(props || [], values2 || [], assignValue);
        }
        function zipObjectDeep(props, values2) {
          return baseZipObject(props || [], values2 || [], baseSet);
        }
        var zipWith = baseRest(function(arrays) {
          var length = arrays.length, iteratee2 = length > 1 ? arrays[length - 1] : undefined$1;
          iteratee2 = typeof iteratee2 == "function" ? (arrays.pop(), iteratee2) : undefined$1;
          return unzipWith(arrays, iteratee2);
        });
        function chain(value) {
          var result2 = lodash2(value);
          result2.__chain__ = true;
          return result2;
        }
        function tap(value, interceptor) {
          interceptor(value);
          return value;
        }
        function thru(value, interceptor) {
          return interceptor(value);
        }
        var wrapperAt = flatRest(function(paths) {
          var length = paths.length, start = length ? paths[0] : 0, value = this.__wrapped__, interceptor = function(object) {
            return baseAt(object, paths);
          };
          if (length > 1 || this.__actions__.length || !(value instanceof LazyWrapper) || !isIndex(start)) {
            return this.thru(interceptor);
          }
          value = value.slice(start, +start + (length ? 1 : 0));
          value.__actions__.push({
            "func": thru,
            "args": [interceptor],
            "thisArg": undefined$1
          });
          return new LodashWrapper(value, this.__chain__).thru(function(array) {
            if (length && !array.length) {
              array.push(undefined$1);
            }
            return array;
          });
        });
        function wrapperChain() {
          return chain(this);
        }
        function wrapperCommit() {
          return new LodashWrapper(this.value(), this.__chain__);
        }
        function wrapperNext() {
          if (this.__values__ === undefined$1) {
            this.__values__ = toArray(this.value());
          }
          var done = this.__index__ >= this.__values__.length, value = done ? undefined$1 : this.__values__[this.__index__++];
          return { "done": done, "value": value };
        }
        function wrapperToIterator() {
          return this;
        }
        function wrapperPlant(value) {
          var result2, parent2 = this;
          while (parent2 instanceof baseLodash) {
            var clone2 = wrapperClone(parent2);
            clone2.__index__ = 0;
            clone2.__values__ = undefined$1;
            if (result2) {
              previous.__wrapped__ = clone2;
            } else {
              result2 = clone2;
            }
            var previous = clone2;
            parent2 = parent2.__wrapped__;
          }
          previous.__wrapped__ = value;
          return result2;
        }
        function wrapperReverse() {
          var value = this.__wrapped__;
          if (value instanceof LazyWrapper) {
            var wrapped = value;
            if (this.__actions__.length) {
              wrapped = new LazyWrapper(this);
            }
            wrapped = wrapped.reverse();
            wrapped.__actions__.push({
              "func": thru,
              "args": [reverse],
              "thisArg": undefined$1
            });
            return new LodashWrapper(wrapped, this.__chain__);
          }
          return this.thru(reverse);
        }
        function wrapperValue() {
          return baseWrapperValue(this.__wrapped__, this.__actions__);
        }
        var countBy = createAggregator(function(result2, value, key) {
          if (hasOwnProperty.call(result2, key)) {
            ++result2[key];
          } else {
            baseAssignValue(result2, key, 1);
          }
        });
        function every(collection, predicate, guard) {
          var func = isArray(collection) ? arrayEvery : baseEvery;
          if (guard && isIterateeCall(collection, predicate, guard)) {
            predicate = undefined$1;
          }
          return func(collection, getIteratee(predicate, 3));
        }
        function filter(collection, predicate) {
          var func = isArray(collection) ? arrayFilter : baseFilter;
          return func(collection, getIteratee(predicate, 3));
        }
        var find = createFind(findIndex);
        var findLast = createFind(findLastIndex);
        function flatMap(collection, iteratee2) {
          return baseFlatten(map(collection, iteratee2), 1);
        }
        function flatMapDeep(collection, iteratee2) {
          return baseFlatten(map(collection, iteratee2), INFINITY);
        }
        function flatMapDepth(collection, iteratee2, depth) {
          depth = depth === undefined$1 ? 1 : toInteger(depth);
          return baseFlatten(map(collection, iteratee2), depth);
        }
        function forEach(collection, iteratee2) {
          var func = isArray(collection) ? arrayEach : baseEach;
          return func(collection, getIteratee(iteratee2, 3));
        }
        function forEachRight(collection, iteratee2) {
          var func = isArray(collection) ? arrayEachRight : baseEachRight;
          return func(collection, getIteratee(iteratee2, 3));
        }
        var groupBy = createAggregator(function(result2, value, key) {
          if (hasOwnProperty.call(result2, key)) {
            result2[key].push(value);
          } else {
            baseAssignValue(result2, key, [value]);
          }
        });
        function includes(collection, value, fromIndex, guard) {
          collection = isArrayLike(collection) ? collection : values(collection);
          fromIndex = fromIndex && !guard ? toInteger(fromIndex) : 0;
          var length = collection.length;
          if (fromIndex < 0) {
            fromIndex = nativeMax(length + fromIndex, 0);
          }
          return isString(collection) ? fromIndex <= length && collection.indexOf(value, fromIndex) > -1 : !!length && baseIndexOf(collection, value, fromIndex) > -1;
        }
        var invokeMap = baseRest(function(collection, path, args) {
          var index = -1, isFunc = typeof path == "function", result2 = isArrayLike(collection) ? Array2(collection.length) : [];
          baseEach(collection, function(value) {
            result2[++index] = isFunc ? apply(path, value, args) : baseInvoke(value, path, args);
          });
          return result2;
        });
        var keyBy = createAggregator(function(result2, value, key) {
          baseAssignValue(result2, key, value);
        });
        function map(collection, iteratee2) {
          var func = isArray(collection) ? arrayMap : baseMap;
          return func(collection, getIteratee(iteratee2, 3));
        }
        function orderBy(collection, iteratees, orders, guard) {
          if (collection == null) {
            return [];
          }
          if (!isArray(iteratees)) {
            iteratees = iteratees == null ? [] : [iteratees];
          }
          orders = guard ? undefined$1 : orders;
          if (!isArray(orders)) {
            orders = orders == null ? [] : [orders];
          }
          return baseOrderBy(collection, iteratees, orders);
        }
        var partition = createAggregator(function(result2, value, key) {
          result2[key ? 0 : 1].push(value);
        }, function() {
          return [[], []];
        });
        function reduce(collection, iteratee2, accumulator) {
          var func = isArray(collection) ? arrayReduce : baseReduce, initAccum = arguments.length < 3;
          return func(collection, getIteratee(iteratee2, 4), accumulator, initAccum, baseEach);
        }
        function reduceRight(collection, iteratee2, accumulator) {
          var func = isArray(collection) ? arrayReduceRight : baseReduce, initAccum = arguments.length < 3;
          return func(collection, getIteratee(iteratee2, 4), accumulator, initAccum, baseEachRight);
        }
        function reject(collection, predicate) {
          var func = isArray(collection) ? arrayFilter : baseFilter;
          return func(collection, negate(getIteratee(predicate, 3)));
        }
        function sample(collection) {
          var func = isArray(collection) ? arraySample : baseSample;
          return func(collection);
        }
        function sampleSize(collection, n2, guard) {
          if (guard ? isIterateeCall(collection, n2, guard) : n2 === undefined$1) {
            n2 = 1;
          } else {
            n2 = toInteger(n2);
          }
          var func = isArray(collection) ? arraySampleSize : baseSampleSize;
          return func(collection, n2);
        }
        function shuffle(collection) {
          var func = isArray(collection) ? arrayShuffle : baseShuffle;
          return func(collection);
        }
        function size(collection) {
          if (collection == null) {
            return 0;
          }
          if (isArrayLike(collection)) {
            return isString(collection) ? stringSize(collection) : collection.length;
          }
          var tag = getTag(collection);
          if (tag == mapTag || tag == setTag) {
            return collection.size;
          }
          return baseKeys(collection).length;
        }
        function some(collection, predicate, guard) {
          var func = isArray(collection) ? arraySome : baseSome;
          if (guard && isIterateeCall(collection, predicate, guard)) {
            predicate = undefined$1;
          }
          return func(collection, getIteratee(predicate, 3));
        }
        var sortBy = baseRest(function(collection, iteratees) {
          if (collection == null) {
            return [];
          }
          var length = iteratees.length;
          if (length > 1 && isIterateeCall(collection, iteratees[0], iteratees[1])) {
            iteratees = [];
          } else if (length > 2 && isIterateeCall(iteratees[0], iteratees[1], iteratees[2])) {
            iteratees = [iteratees[0]];
          }
          return baseOrderBy(collection, baseFlatten(iteratees, 1), []);
        });
        var now = ctxNow || function() {
          return root.Date.now();
        };
        function after(n2, func) {
          if (typeof func != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          n2 = toInteger(n2);
          return function() {
            if (--n2 < 1) {
              return func.apply(this, arguments);
            }
          };
        }
        function ary(func, n2, guard) {
          n2 = guard ? undefined$1 : n2;
          n2 = func && n2 == null ? func.length : n2;
          return createWrap(func, WRAP_ARY_FLAG, undefined$1, undefined$1, undefined$1, undefined$1, n2);
        }
        function before(n2, func) {
          var result2;
          if (typeof func != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          n2 = toInteger(n2);
          return function() {
            if (--n2 > 0) {
              result2 = func.apply(this, arguments);
            }
            if (n2 <= 1) {
              func = undefined$1;
            }
            return result2;
          };
        }
        var bind = baseRest(function(func, thisArg, partials) {
          var bitmask = WRAP_BIND_FLAG;
          if (partials.length) {
            var holders = replaceHolders(partials, getHolder(bind));
            bitmask |= WRAP_PARTIAL_FLAG;
          }
          return createWrap(func, bitmask, thisArg, partials, holders);
        });
        var bindKey = baseRest(function(object, key, partials) {
          var bitmask = WRAP_BIND_FLAG | WRAP_BIND_KEY_FLAG;
          if (partials.length) {
            var holders = replaceHolders(partials, getHolder(bindKey));
            bitmask |= WRAP_PARTIAL_FLAG;
          }
          return createWrap(key, bitmask, object, partials, holders);
        });
        function curry(func, arity, guard) {
          arity = guard ? undefined$1 : arity;
          var result2 = createWrap(func, WRAP_CURRY_FLAG, undefined$1, undefined$1, undefined$1, undefined$1, undefined$1, arity);
          result2.placeholder = curry.placeholder;
          return result2;
        }
        function curryRight(func, arity, guard) {
          arity = guard ? undefined$1 : arity;
          var result2 = createWrap(func, WRAP_CURRY_RIGHT_FLAG, undefined$1, undefined$1, undefined$1, undefined$1, undefined$1, arity);
          result2.placeholder = curryRight.placeholder;
          return result2;
        }
        function debounce(func, wait, options) {
          var lastArgs, lastThis, maxWait, result2, timerId, lastCallTime, lastInvokeTime = 0, leading = false, maxing = false, trailing = true;
          if (typeof func != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          wait = toNumber(wait) || 0;
          if (isObject(options)) {
            leading = !!options.leading;
            maxing = "maxWait" in options;
            maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
            trailing = "trailing" in options ? !!options.trailing : trailing;
          }
          function invokeFunc(time) {
            var args = lastArgs, thisArg = lastThis;
            lastArgs = lastThis = undefined$1;
            lastInvokeTime = time;
            result2 = func.apply(thisArg, args);
            return result2;
          }
          function leadingEdge(time) {
            lastInvokeTime = time;
            timerId = setTimeout2(timerExpired, wait);
            return leading ? invokeFunc(time) : result2;
          }
          function remainingWait(time) {
            var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime, timeWaiting = wait - timeSinceLastCall;
            return maxing ? nativeMin(timeWaiting, maxWait - timeSinceLastInvoke) : timeWaiting;
          }
          function shouldInvoke(time) {
            var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime;
            return lastCallTime === undefined$1 || timeSinceLastCall >= wait || timeSinceLastCall < 0 || maxing && timeSinceLastInvoke >= maxWait;
          }
          function timerExpired() {
            var time = now();
            if (shouldInvoke(time)) {
              return trailingEdge(time);
            }
            timerId = setTimeout2(timerExpired, remainingWait(time));
          }
          function trailingEdge(time) {
            timerId = undefined$1;
            if (trailing && lastArgs) {
              return invokeFunc(time);
            }
            lastArgs = lastThis = undefined$1;
            return result2;
          }
          function cancel() {
            if (timerId !== undefined$1) {
              clearTimeout(timerId);
            }
            lastInvokeTime = 0;
            lastArgs = lastCallTime = lastThis = timerId = undefined$1;
          }
          function flush() {
            return timerId === undefined$1 ? result2 : trailingEdge(now());
          }
          function debounced() {
            var time = now(), isInvoking = shouldInvoke(time);
            lastArgs = arguments;
            lastThis = this;
            lastCallTime = time;
            if (isInvoking) {
              if (timerId === undefined$1) {
                return leadingEdge(lastCallTime);
              }
              if (maxing) {
                clearTimeout(timerId);
                timerId = setTimeout2(timerExpired, wait);
                return invokeFunc(lastCallTime);
              }
            }
            if (timerId === undefined$1) {
              timerId = setTimeout2(timerExpired, wait);
            }
            return result2;
          }
          debounced.cancel = cancel;
          debounced.flush = flush;
          return debounced;
        }
        var defer = baseRest(function(func, args) {
          return baseDelay(func, 1, args);
        });
        var delay = baseRest(function(func, wait, args) {
          return baseDelay(func, toNumber(wait) || 0, args);
        });
        function flip(func) {
          return createWrap(func, WRAP_FLIP_FLAG);
        }
        function memoize(func, resolver) {
          if (typeof func != "function" || resolver != null && typeof resolver != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          var memoized = function() {
            var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
            if (cache.has(key)) {
              return cache.get(key);
            }
            var result2 = func.apply(this, args);
            memoized.cache = cache.set(key, result2) || cache;
            return result2;
          };
          memoized.cache = new (memoize.Cache || MapCache)();
          return memoized;
        }
        memoize.Cache = MapCache;
        function negate(predicate) {
          if (typeof predicate != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          return function() {
            var args = arguments;
            switch (args.length) {
              case 0:
                return !predicate.call(this);
              case 1:
                return !predicate.call(this, args[0]);
              case 2:
                return !predicate.call(this, args[0], args[1]);
              case 3:
                return !predicate.call(this, args[0], args[1], args[2]);
            }
            return !predicate.apply(this, args);
          };
        }
        function once(func) {
          return before(2, func);
        }
        var overArgs = castRest(function(func, transforms) {
          transforms = transforms.length == 1 && isArray(transforms[0]) ? arrayMap(transforms[0], baseUnary(getIteratee())) : arrayMap(baseFlatten(transforms, 1), baseUnary(getIteratee()));
          var funcsLength = transforms.length;
          return baseRest(function(args) {
            var index = -1, length = nativeMin(args.length, funcsLength);
            while (++index < length) {
              args[index] = transforms[index].call(this, args[index]);
            }
            return apply(func, this, args);
          });
        });
        var partial = baseRest(function(func, partials) {
          var holders = replaceHolders(partials, getHolder(partial));
          return createWrap(func, WRAP_PARTIAL_FLAG, undefined$1, partials, holders);
        });
        var partialRight = baseRest(function(func, partials) {
          var holders = replaceHolders(partials, getHolder(partialRight));
          return createWrap(func, WRAP_PARTIAL_RIGHT_FLAG, undefined$1, partials, holders);
        });
        var rearg = flatRest(function(func, indexes) {
          return createWrap(func, WRAP_REARG_FLAG, undefined$1, undefined$1, undefined$1, indexes);
        });
        function rest(func, start) {
          if (typeof func != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          start = start === undefined$1 ? start : toInteger(start);
          return baseRest(func, start);
        }
        function spread(func, start) {
          if (typeof func != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          start = start == null ? 0 : nativeMax(toInteger(start), 0);
          return baseRest(function(args) {
            var array = args[start], otherArgs = castSlice(args, 0, start);
            if (array) {
              arrayPush(otherArgs, array);
            }
            return apply(func, this, otherArgs);
          });
        }
        function throttle(func, wait, options) {
          var leading = true, trailing = true;
          if (typeof func != "function") {
            throw new TypeError2(FUNC_ERROR_TEXT);
          }
          if (isObject(options)) {
            leading = "leading" in options ? !!options.leading : leading;
            trailing = "trailing" in options ? !!options.trailing : trailing;
          }
          return debounce(func, wait, {
            "leading": leading,
            "maxWait": wait,
            "trailing": trailing
          });
        }
        function unary(func) {
          return ary(func, 1);
        }
        function wrap(value, wrapper) {
          return partial(castFunction(wrapper), value);
        }
        function castArray() {
          if (!arguments.length) {
            return [];
          }
          var value = arguments[0];
          return isArray(value) ? value : [value];
        }
        function clone(value) {
          return baseClone(value, CLONE_SYMBOLS_FLAG);
        }
        function cloneWith(value, customizer) {
          customizer = typeof customizer == "function" ? customizer : undefined$1;
          return baseClone(value, CLONE_SYMBOLS_FLAG, customizer);
        }
        function cloneDeep(value) {
          return baseClone(value, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG);
        }
        function cloneDeepWith(value, customizer) {
          customizer = typeof customizer == "function" ? customizer : undefined$1;
          return baseClone(value, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG, customizer);
        }
        function conformsTo(object, source) {
          return source == null || baseConformsTo(object, source, keys(source));
        }
        function eq(value, other) {
          return value === other || value !== value && other !== other;
        }
        var gt = createRelationalOperation(baseGt);
        var gte = createRelationalOperation(function(value, other) {
          return value >= other;
        });
        var isArguments = baseIsArguments(/* @__PURE__ */ (function() {
          return arguments;
        })()) ? baseIsArguments : function(value) {
          return isObjectLike(value) && hasOwnProperty.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
        };
        var isArray = Array2.isArray;
        var isArrayBuffer = nodeIsArrayBuffer ? baseUnary(nodeIsArrayBuffer) : baseIsArrayBuffer;
        function isArrayLike(value) {
          return value != null && isLength(value.length) && !isFunction2(value);
        }
        function isArrayLikeObject(value) {
          return isObjectLike(value) && isArrayLike(value);
        }
        function isBoolean(value) {
          return value === true || value === false || isObjectLike(value) && baseGetTag(value) == boolTag;
        }
        var isBuffer = nativeIsBuffer || stubFalse;
        var isDate = nodeIsDate ? baseUnary(nodeIsDate) : baseIsDate;
        function isElement(value) {
          return isObjectLike(value) && value.nodeType === 1 && !isPlainObject(value);
        }
        function isEmpty(value) {
          if (value == null) {
            return true;
          }
          if (isArrayLike(value) && (isArray(value) || typeof value == "string" || typeof value.splice == "function" || isBuffer(value) || isTypedArray(value) || isArguments(value))) {
            return !value.length;
          }
          var tag = getTag(value);
          if (tag == mapTag || tag == setTag) {
            return !value.size;
          }
          if (isPrototype(value)) {
            return !baseKeys(value).length;
          }
          for (var key in value) {
            if (hasOwnProperty.call(value, key)) {
              return false;
            }
          }
          return true;
        }
        function isEqual(value, other) {
          return baseIsEqual(value, other);
        }
        function isEqualWith(value, other, customizer) {
          customizer = typeof customizer == "function" ? customizer : undefined$1;
          var result2 = customizer ? customizer(value, other) : undefined$1;
          return result2 === undefined$1 ? baseIsEqual(value, other, undefined$1, customizer) : !!result2;
        }
        function isError(value) {
          if (!isObjectLike(value)) {
            return false;
          }
          var tag = baseGetTag(value);
          return tag == errorTag || tag == domExcTag || typeof value.message == "string" && typeof value.name == "string" && !isPlainObject(value);
        }
        function isFinite(value) {
          return typeof value == "number" && nativeIsFinite(value);
        }
        function isFunction2(value) {
          if (!isObject(value)) {
            return false;
          }
          var tag = baseGetTag(value);
          return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
        }
        function isInteger(value) {
          return typeof value == "number" && value == toInteger(value);
        }
        function isLength(value) {
          return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
        }
        function isObject(value) {
          var type = typeof value;
          return value != null && (type == "object" || type == "function");
        }
        function isObjectLike(value) {
          return value != null && typeof value == "object";
        }
        var isMap = nodeIsMap ? baseUnary(nodeIsMap) : baseIsMap;
        function isMatch(object, source) {
          return object === source || baseIsMatch(object, source, getMatchData(source));
        }
        function isMatchWith(object, source, customizer) {
          customizer = typeof customizer == "function" ? customizer : undefined$1;
          return baseIsMatch(object, source, getMatchData(source), customizer);
        }
        function isNaN(value) {
          return isNumber(value) && value != +value;
        }
        function isNative(value) {
          if (isMaskable(value)) {
            throw new Error2(CORE_ERROR_TEXT);
          }
          return baseIsNative(value);
        }
        function isNull(value) {
          return value === null;
        }
        function isNil(value) {
          return value == null;
        }
        function isNumber(value) {
          return typeof value == "number" || isObjectLike(value) && baseGetTag(value) == numberTag;
        }
        function isPlainObject(value) {
          if (!isObjectLike(value) || baseGetTag(value) != objectTag) {
            return false;
          }
          var proto = getPrototype(value);
          if (proto === null) {
            return true;
          }
          var Ctor = hasOwnProperty.call(proto, "constructor") && proto.constructor;
          return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString.call(Ctor) == objectCtorString;
        }
        var isRegExp = nodeIsRegExp ? baseUnary(nodeIsRegExp) : baseIsRegExp;
        function isSafeInteger(value) {
          return isInteger(value) && value >= -MAX_SAFE_INTEGER && value <= MAX_SAFE_INTEGER;
        }
        var isSet = nodeIsSet ? baseUnary(nodeIsSet) : baseIsSet;
        function isString(value) {
          return typeof value == "string" || !isArray(value) && isObjectLike(value) && baseGetTag(value) == stringTag;
        }
        function isSymbol(value) {
          return typeof value == "symbol" || isObjectLike(value) && baseGetTag(value) == symbolTag;
        }
        var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
        function isUndefined(value) {
          return value === undefined$1;
        }
        function isWeakMap(value) {
          return isObjectLike(value) && getTag(value) == weakMapTag;
        }
        function isWeakSet(value) {
          return isObjectLike(value) && baseGetTag(value) == weakSetTag;
        }
        var lt = createRelationalOperation(baseLt);
        var lte = createRelationalOperation(function(value, other) {
          return value <= other;
        });
        function toArray(value) {
          if (!value) {
            return [];
          }
          if (isArrayLike(value)) {
            return isString(value) ? stringToArray(value) : copyArray(value);
          }
          if (symIterator && value[symIterator]) {
            return iteratorToArray(value[symIterator]());
          }
          var tag = getTag(value), func = tag == mapTag ? mapToArray : tag == setTag ? setToArray : values;
          return func(value);
        }
        function toFinite(value) {
          if (!value) {
            return value === 0 ? value : 0;
          }
          value = toNumber(value);
          if (value === INFINITY || value === -INFINITY) {
            var sign = value < 0 ? -1 : 1;
            return sign * MAX_INTEGER;
          }
          return value === value ? value : 0;
        }
        function toInteger(value) {
          var result2 = toFinite(value), remainder = result2 % 1;
          return result2 === result2 ? remainder ? result2 - remainder : result2 : 0;
        }
        function toLength(value) {
          return value ? baseClamp(toInteger(value), 0, MAX_ARRAY_LENGTH) : 0;
        }
        function toNumber(value) {
          if (typeof value == "number") {
            return value;
          }
          if (isSymbol(value)) {
            return NAN;
          }
          if (isObject(value)) {
            var other = typeof value.valueOf == "function" ? value.valueOf() : value;
            value = isObject(other) ? other + "" : other;
          }
          if (typeof value != "string") {
            return value === 0 ? value : +value;
          }
          value = baseTrim(value);
          var isBinary = reIsBinary.test(value);
          return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
        }
        function toPlainObject(value) {
          return copyObject(value, keysIn(value));
        }
        function toSafeInteger(value) {
          return value ? baseClamp(toInteger(value), -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER) : value === 0 ? value : 0;
        }
        function toString(value) {
          return value == null ? "" : baseToString(value);
        }
        var assign = createAssigner(function(object, source) {
          if (isPrototype(source) || isArrayLike(source)) {
            copyObject(source, keys(source), object);
            return;
          }
          for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
              assignValue(object, key, source[key]);
            }
          }
        });
        var assignIn = createAssigner(function(object, source) {
          copyObject(source, keysIn(source), object);
        });
        var assignInWith = createAssigner(function(object, source, srcIndex, customizer) {
          copyObject(source, keysIn(source), object, customizer);
        });
        var assignWith = createAssigner(function(object, source, srcIndex, customizer) {
          copyObject(source, keys(source), object, customizer);
        });
        var at = flatRest(baseAt);
        function create(prototype, properties) {
          var result2 = baseCreate(prototype);
          return properties == null ? result2 : baseAssign(result2, properties);
        }
        var defaults = baseRest(function(object, sources) {
          object = Object2(object);
          var index = -1;
          var length = sources.length;
          var guard = length > 2 ? sources[2] : undefined$1;
          if (guard && isIterateeCall(sources[0], sources[1], guard)) {
            length = 1;
          }
          while (++index < length) {
            var source = sources[index];
            var props = keysIn(source);
            var propsIndex = -1;
            var propsLength = props.length;
            while (++propsIndex < propsLength) {
              var key = props[propsIndex];
              var value = object[key];
              if (value === undefined$1 || eq(value, objectProto[key]) && !hasOwnProperty.call(object, key)) {
                object[key] = source[key];
              }
            }
          }
          return object;
        });
        var defaultsDeep = baseRest(function(args) {
          args.push(undefined$1, customDefaultsMerge);
          return apply(mergeWith, undefined$1, args);
        });
        function findKey(object, predicate) {
          return baseFindKey(object, getIteratee(predicate, 3), baseForOwn);
        }
        function findLastKey(object, predicate) {
          return baseFindKey(object, getIteratee(predicate, 3), baseForOwnRight);
        }
        function forIn(object, iteratee2) {
          return object == null ? object : baseFor(object, getIteratee(iteratee2, 3), keysIn);
        }
        function forInRight(object, iteratee2) {
          return object == null ? object : baseForRight(object, getIteratee(iteratee2, 3), keysIn);
        }
        function forOwn(object, iteratee2) {
          return object && baseForOwn(object, getIteratee(iteratee2, 3));
        }
        function forOwnRight(object, iteratee2) {
          return object && baseForOwnRight(object, getIteratee(iteratee2, 3));
        }
        function functions(object) {
          return object == null ? [] : baseFunctions(object, keys(object));
        }
        function functionsIn(object) {
          return object == null ? [] : baseFunctions(object, keysIn(object));
        }
        function get(object, path, defaultValue) {
          var result2 = object == null ? undefined$1 : baseGet(object, path);
          return result2 === undefined$1 ? defaultValue : result2;
        }
        function has(object, path) {
          return object != null && hasPath(object, path, baseHas);
        }
        function hasIn(object, path) {
          return object != null && hasPath(object, path, baseHasIn);
        }
        var invert = createInverter(function(result2, value, key) {
          if (value != null && typeof value.toString != "function") {
            value = nativeObjectToString.call(value);
          }
          result2[value] = key;
        }, constant(identity));
        var invertBy = createInverter(function(result2, value, key) {
          if (value != null && typeof value.toString != "function") {
            value = nativeObjectToString.call(value);
          }
          if (hasOwnProperty.call(result2, value)) {
            result2[value].push(key);
          } else {
            result2[value] = [key];
          }
        }, getIteratee);
        var invoke = baseRest(baseInvoke);
        function keys(object) {
          return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
        }
        function keysIn(object) {
          return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
        }
        function mapKeys(object, iteratee2) {
          var result2 = {};
          iteratee2 = getIteratee(iteratee2, 3);
          baseForOwn(object, function(value, key, object2) {
            baseAssignValue(result2, iteratee2(value, key, object2), value);
          });
          return result2;
        }
        function mapValues(object, iteratee2) {
          var result2 = {};
          iteratee2 = getIteratee(iteratee2, 3);
          baseForOwn(object, function(value, key, object2) {
            baseAssignValue(result2, key, iteratee2(value, key, object2));
          });
          return result2;
        }
        var merge = createAssigner(function(object, source, srcIndex) {
          baseMerge(object, source, srcIndex);
        });
        var mergeWith = createAssigner(function(object, source, srcIndex, customizer) {
          baseMerge(object, source, srcIndex, customizer);
        });
        var omit = flatRest(function(object, paths) {
          var result2 = {};
          if (object == null) {
            return result2;
          }
          var isDeep = false;
          paths = arrayMap(paths, function(path) {
            path = castPath(path, object);
            isDeep || (isDeep = path.length > 1);
            return path;
          });
          copyObject(object, getAllKeysIn(object), result2);
          if (isDeep) {
            result2 = baseClone(result2, CLONE_DEEP_FLAG | CLONE_FLAT_FLAG | CLONE_SYMBOLS_FLAG, customOmitClone);
          }
          var length = paths.length;
          while (length--) {
            baseUnset(result2, paths[length]);
          }
          return result2;
        });
        function omitBy(object, predicate) {
          return pickBy(object, negate(getIteratee(predicate)));
        }
        var pick = flatRest(function(object, paths) {
          return object == null ? {} : basePick(object, paths);
        });
        function pickBy(object, predicate) {
          if (object == null) {
            return {};
          }
          var props = arrayMap(getAllKeysIn(object), function(prop) {
            return [prop];
          });
          predicate = getIteratee(predicate);
          return basePickBy(object, props, function(value, path) {
            return predicate(value, path[0]);
          });
        }
        function result(object, path, defaultValue) {
          path = castPath(path, object);
          var index = -1, length = path.length;
          if (!length) {
            length = 1;
            object = undefined$1;
          }
          while (++index < length) {
            var value = object == null ? undefined$1 : object[toKey(path[index])];
            if (value === undefined$1) {
              index = length;
              value = defaultValue;
            }
            object = isFunction2(value) ? value.call(object) : value;
          }
          return object;
        }
        function set(object, path, value) {
          return object == null ? object : baseSet(object, path, value);
        }
        function setWith(object, path, value, customizer) {
          customizer = typeof customizer == "function" ? customizer : undefined$1;
          return object == null ? object : baseSet(object, path, value, customizer);
        }
        var toPairs = createToPairs(keys);
        var toPairsIn = createToPairs(keysIn);
        function transform(object, iteratee2, accumulator) {
          var isArr = isArray(object), isArrLike = isArr || isBuffer(object) || isTypedArray(object);
          iteratee2 = getIteratee(iteratee2, 4);
          if (accumulator == null) {
            var Ctor = object && object.constructor;
            if (isArrLike) {
              accumulator = isArr ? new Ctor() : [];
            } else if (isObject(object)) {
              accumulator = isFunction2(Ctor) ? baseCreate(getPrototype(object)) : {};
            } else {
              accumulator = {};
            }
          }
          (isArrLike ? arrayEach : baseForOwn)(object, function(value, index, object2) {
            return iteratee2(accumulator, value, index, object2);
          });
          return accumulator;
        }
        function unset(object, path) {
          return object == null ? true : baseUnset(object, path);
        }
        function update(object, path, updater) {
          return object == null ? object : baseUpdate(object, path, castFunction(updater));
        }
        function updateWith(object, path, updater, customizer) {
          customizer = typeof customizer == "function" ? customizer : undefined$1;
          return object == null ? object : baseUpdate(object, path, castFunction(updater), customizer);
        }
        function values(object) {
          return object == null ? [] : baseValues(object, keys(object));
        }
        function valuesIn(object) {
          return object == null ? [] : baseValues(object, keysIn(object));
        }
        function clamp(number, lower, upper) {
          if (upper === undefined$1) {
            upper = lower;
            lower = undefined$1;
          }
          if (upper !== undefined$1) {
            upper = toNumber(upper);
            upper = upper === upper ? upper : 0;
          }
          if (lower !== undefined$1) {
            lower = toNumber(lower);
            lower = lower === lower ? lower : 0;
          }
          return baseClamp(toNumber(number), lower, upper);
        }
        function inRange(number, start, end) {
          start = toFinite(start);
          if (end === undefined$1) {
            end = start;
            start = 0;
          } else {
            end = toFinite(end);
          }
          number = toNumber(number);
          return baseInRange(number, start, end);
        }
        function random(lower, upper, floating) {
          if (floating && typeof floating != "boolean" && isIterateeCall(lower, upper, floating)) {
            upper = floating = undefined$1;
          }
          if (floating === undefined$1) {
            if (typeof upper == "boolean") {
              floating = upper;
              upper = undefined$1;
            } else if (typeof lower == "boolean") {
              floating = lower;
              lower = undefined$1;
            }
          }
          if (lower === undefined$1 && upper === undefined$1) {
            lower = 0;
            upper = 1;
          } else {
            lower = toFinite(lower);
            if (upper === undefined$1) {
              upper = lower;
              lower = 0;
            } else {
              upper = toFinite(upper);
            }
          }
          if (lower > upper) {
            var temp = lower;
            lower = upper;
            upper = temp;
          }
          if (floating || lower % 1 || upper % 1) {
            var rand = nativeRandom();
            return nativeMin(lower + rand * (upper - lower + freeParseFloat("1e-" + ((rand + "").length - 1))), upper);
          }
          return baseRandom(lower, upper);
        }
        var camelCase = createCompounder(function(result2, word, index) {
          word = word.toLowerCase();
          return result2 + (index ? capitalize(word) : word);
        });
        function capitalize(string) {
          return upperFirst(toString(string).toLowerCase());
        }
        function deburr(string) {
          string = toString(string);
          return string && string.replace(reLatin, deburrLetter).replace(reComboMark, "");
        }
        function endsWith(string, target, position) {
          string = toString(string);
          target = baseToString(target);
          var length = string.length;
          position = position === undefined$1 ? length : baseClamp(toInteger(position), 0, length);
          var end = position;
          position -= target.length;
          return position >= 0 && string.slice(position, end) == target;
        }
        function escape(string) {
          string = toString(string);
          return string && reHasUnescapedHtml.test(string) ? string.replace(reUnescapedHtml, escapeHtmlChar) : string;
        }
        function escapeRegExp(string) {
          string = toString(string);
          return string && reHasRegExpChar.test(string) ? string.replace(reRegExpChar, "\\$&") : string;
        }
        var kebabCase = createCompounder(function(result2, word, index) {
          return result2 + (index ? "-" : "") + word.toLowerCase();
        });
        var lowerCase = createCompounder(function(result2, word, index) {
          return result2 + (index ? " " : "") + word.toLowerCase();
        });
        var lowerFirst = createCaseFirst("toLowerCase");
        function pad(string, length, chars) {
          string = toString(string);
          length = toInteger(length);
          var strLength = length ? stringSize(string) : 0;
          if (!length || strLength >= length) {
            return string;
          }
          var mid = (length - strLength) / 2;
          return createPadding(nativeFloor(mid), chars) + string + createPadding(nativeCeil(mid), chars);
        }
        function padEnd(string, length, chars) {
          string = toString(string);
          length = toInteger(length);
          var strLength = length ? stringSize(string) : 0;
          return length && strLength < length ? string + createPadding(length - strLength, chars) : string;
        }
        function padStart(string, length, chars) {
          string = toString(string);
          length = toInteger(length);
          var strLength = length ? stringSize(string) : 0;
          return length && strLength < length ? createPadding(length - strLength, chars) + string : string;
        }
        function parseInt2(string, radix, guard) {
          if (guard || radix == null) {
            radix = 0;
          } else if (radix) {
            radix = +radix;
          }
          return nativeParseInt(toString(string).replace(reTrimStart, ""), radix || 0);
        }
        function repeat(string, n2, guard) {
          if (guard ? isIterateeCall(string, n2, guard) : n2 === undefined$1) {
            n2 = 1;
          } else {
            n2 = toInteger(n2);
          }
          return baseRepeat(toString(string), n2);
        }
        function replace() {
          var args = arguments, string = toString(args[0]);
          return args.length < 3 ? string : string.replace(args[1], args[2]);
        }
        var snakeCase = createCompounder(function(result2, word, index) {
          return result2 + (index ? "_" : "") + word.toLowerCase();
        });
        function split(string, separator, limit) {
          if (limit && typeof limit != "number" && isIterateeCall(string, separator, limit)) {
            separator = limit = undefined$1;
          }
          limit = limit === undefined$1 ? MAX_ARRAY_LENGTH : limit >>> 0;
          if (!limit) {
            return [];
          }
          string = toString(string);
          if (string && (typeof separator == "string" || separator != null && !isRegExp(separator))) {
            separator = baseToString(separator);
            if (!separator && hasUnicode(string)) {
              return castSlice(stringToArray(string), 0, limit);
            }
          }
          return string.split(separator, limit);
        }
        var startCase = createCompounder(function(result2, word, index) {
          return result2 + (index ? " " : "") + upperFirst(word);
        });
        function startsWith(string, target, position) {
          string = toString(string);
          position = position == null ? 0 : baseClamp(toInteger(position), 0, string.length);
          target = baseToString(target);
          return string.slice(position, position + target.length) == target;
        }
        function template(string, options, guard) {
          var settings = lodash2.templateSettings;
          if (guard && isIterateeCall(string, options, guard)) {
            options = undefined$1;
          }
          string = toString(string);
          options = assignWith({}, options, settings, customDefaultsAssignIn);
          var imports = assignWith({}, options.imports, settings.imports, customDefaultsAssignIn), importsKeys = keys(imports), importsValues = baseValues(imports, importsKeys);
          arrayEach(importsKeys, function(key) {
            if (reForbiddenIdentifierChars.test(key)) {
              throw new Error2(INVALID_TEMPL_IMPORTS_ERROR_TEXT);
            }
          });
          var isEscaping, isEvaluating, index = 0, interpolate = options.interpolate || reNoMatch, source = "__p += '";
          var reDelimiters = RegExp2(
            (options.escape || reNoMatch).source + "|" + interpolate.source + "|" + (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + "|" + (options.evaluate || reNoMatch).source + "|$",
            "g"
          );
          var sourceURL = "//# sourceURL=" + (hasOwnProperty.call(options, "sourceURL") ? (options.sourceURL + "").replace(/\s/g, " ") : "lodash.templateSources[" + ++templateCounter + "]") + "\n";
          string.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
            interpolateValue || (interpolateValue = esTemplateValue);
            source += string.slice(index, offset).replace(reUnescapedString, escapeStringChar);
            if (escapeValue) {
              isEscaping = true;
              source += "' +\n__e(" + escapeValue + ") +\n'";
            }
            if (evaluateValue) {
              isEvaluating = true;
              source += "';\n" + evaluateValue + ";\n__p += '";
            }
            if (interpolateValue) {
              source += "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'";
            }
            index = offset + match.length;
            return match;
          });
          source += "';\n";
          var variable = hasOwnProperty.call(options, "variable") && options.variable;
          if (!variable) {
            source = "with (obj) {\n" + source + "\n}\n";
          } else if (reForbiddenIdentifierChars.test(variable)) {
            throw new Error2(INVALID_TEMPL_VAR_ERROR_TEXT);
          }
          source = (isEvaluating ? source.replace(reEmptyStringLeading, "") : source).replace(reEmptyStringMiddle, "$1").replace(reEmptyStringTrailing, "$1;");
          source = "function(" + (variable || "obj") + ") {\n" + (variable ? "" : "obj || (obj = {});\n") + "var __t, __p = ''" + (isEscaping ? ", __e = _.escape" : "") + (isEvaluating ? ", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n" : ";\n") + source + "return __p\n}";
          var result2 = attempt(function() {
            return Function2(importsKeys, sourceURL + "return " + source).apply(undefined$1, importsValues);
          });
          result2.source = source;
          if (isError(result2)) {
            throw result2;
          }
          return result2;
        }
        function toLower(value) {
          return toString(value).toLowerCase();
        }
        function toUpper(value) {
          return toString(value).toUpperCase();
        }
        function trim(string, chars, guard) {
          string = toString(string);
          if (string && (guard || chars === undefined$1)) {
            return baseTrim(string);
          }
          if (!string || !(chars = baseToString(chars))) {
            return string;
          }
          var strSymbols = stringToArray(string), chrSymbols = stringToArray(chars), start = charsStartIndex(strSymbols, chrSymbols), end = charsEndIndex(strSymbols, chrSymbols) + 1;
          return castSlice(strSymbols, start, end).join("");
        }
        function trimEnd(string, chars, guard) {
          string = toString(string);
          if (string && (guard || chars === undefined$1)) {
            return string.slice(0, trimmedEndIndex(string) + 1);
          }
          if (!string || !(chars = baseToString(chars))) {
            return string;
          }
          var strSymbols = stringToArray(string), end = charsEndIndex(strSymbols, stringToArray(chars)) + 1;
          return castSlice(strSymbols, 0, end).join("");
        }
        function trimStart(string, chars, guard) {
          string = toString(string);
          if (string && (guard || chars === undefined$1)) {
            return string.replace(reTrimStart, "");
          }
          if (!string || !(chars = baseToString(chars))) {
            return string;
          }
          var strSymbols = stringToArray(string), start = charsStartIndex(strSymbols, stringToArray(chars));
          return castSlice(strSymbols, start).join("");
        }
        function truncate(string, options) {
          var length = DEFAULT_TRUNC_LENGTH, omission = DEFAULT_TRUNC_OMISSION;
          if (isObject(options)) {
            var separator = "separator" in options ? options.separator : separator;
            length = "length" in options ? toInteger(options.length) : length;
            omission = "omission" in options ? baseToString(options.omission) : omission;
          }
          string = toString(string);
          var strLength = string.length;
          if (hasUnicode(string)) {
            var strSymbols = stringToArray(string);
            strLength = strSymbols.length;
          }
          if (length >= strLength) {
            return string;
          }
          var end = length - stringSize(omission);
          if (end < 1) {
            return omission;
          }
          var result2 = strSymbols ? castSlice(strSymbols, 0, end).join("") : string.slice(0, end);
          if (separator === undefined$1) {
            return result2 + omission;
          }
          if (strSymbols) {
            end += result2.length - end;
          }
          if (isRegExp(separator)) {
            if (string.slice(end).search(separator)) {
              var match, substring = result2;
              if (!separator.global) {
                separator = RegExp2(separator.source, toString(reFlags.exec(separator)) + "g");
              }
              separator.lastIndex = 0;
              while (match = separator.exec(substring)) {
                var newEnd = match.index;
              }
              result2 = result2.slice(0, newEnd === undefined$1 ? end : newEnd);
            }
          } else if (string.indexOf(baseToString(separator), end) != end) {
            var index = result2.lastIndexOf(separator);
            if (index > -1) {
              result2 = result2.slice(0, index);
            }
          }
          return result2 + omission;
        }
        function unescape(string) {
          string = toString(string);
          return string && reHasEscapedHtml.test(string) ? string.replace(reEscapedHtml, unescapeHtmlChar) : string;
        }
        var upperCase = createCompounder(function(result2, word, index) {
          return result2 + (index ? " " : "") + word.toUpperCase();
        });
        var upperFirst = createCaseFirst("toUpperCase");
        function words(string, pattern, guard) {
          string = toString(string);
          pattern = guard ? undefined$1 : pattern;
          if (pattern === undefined$1) {
            return hasUnicodeWord(string) ? unicodeWords(string) : asciiWords(string);
          }
          return string.match(pattern) || [];
        }
        var attempt = baseRest(function(func, args) {
          try {
            return apply(func, undefined$1, args);
          } catch (e2) {
            return isError(e2) ? e2 : new Error2(e2);
          }
        });
        var bindAll = flatRest(function(object, methodNames) {
          arrayEach(methodNames, function(key) {
            key = toKey(key);
            baseAssignValue(object, key, bind(object[key], object));
          });
          return object;
        });
        function cond(pairs) {
          var length = pairs == null ? 0 : pairs.length, toIteratee = getIteratee();
          pairs = !length ? [] : arrayMap(pairs, function(pair) {
            if (typeof pair[1] != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            return [toIteratee(pair[0]), pair[1]];
          });
          return baseRest(function(args) {
            var index = -1;
            while (++index < length) {
              var pair = pairs[index];
              if (apply(pair[0], this, args)) {
                return apply(pair[1], this, args);
              }
            }
          });
        }
        function conforms(source) {
          return baseConforms(baseClone(source, CLONE_DEEP_FLAG));
        }
        function constant(value) {
          return function() {
            return value;
          };
        }
        function defaultTo(value, defaultValue) {
          return value == null || value !== value ? defaultValue : value;
        }
        var flow = createFlow();
        var flowRight = createFlow(true);
        function identity(value) {
          return value;
        }
        function iteratee(func) {
          return baseIteratee(typeof func == "function" ? func : baseClone(func, CLONE_DEEP_FLAG));
        }
        function matches(source) {
          return baseMatches(baseClone(source, CLONE_DEEP_FLAG));
        }
        function matchesProperty(path, srcValue) {
          return baseMatchesProperty(path, baseClone(srcValue, CLONE_DEEP_FLAG));
        }
        var method = baseRest(function(path, args) {
          return function(object) {
            return baseInvoke(object, path, args);
          };
        });
        var methodOf = baseRest(function(object, args) {
          return function(path) {
            return baseInvoke(object, path, args);
          };
        });
        function mixin(object, source, options) {
          var props = keys(source), methodNames = baseFunctions(source, props);
          if (options == null && !(isObject(source) && (methodNames.length || !props.length))) {
            options = source;
            source = object;
            object = this;
            methodNames = baseFunctions(source, keys(source));
          }
          var chain2 = !(isObject(options) && "chain" in options) || !!options.chain, isFunc = isFunction2(object);
          arrayEach(methodNames, function(methodName) {
            var func = source[methodName];
            object[methodName] = func;
            if (isFunc) {
              object.prototype[methodName] = function() {
                var chainAll = this.__chain__;
                if (chain2 || chainAll) {
                  var result2 = object(this.__wrapped__), actions = result2.__actions__ = copyArray(this.__actions__);
                  actions.push({ "func": func, "args": arguments, "thisArg": object });
                  result2.__chain__ = chainAll;
                  return result2;
                }
                return func.apply(object, arrayPush([this.value()], arguments));
              };
            }
          });
          return object;
        }
        function noConflict() {
          if (root._ === this) {
            root._ = oldDash;
          }
          return this;
        }
        function noop() {
        }
        function nthArg(n2) {
          n2 = toInteger(n2);
          return baseRest(function(args) {
            return baseNth(args, n2);
          });
        }
        var over = createOver(arrayMap);
        var overEvery = createOver(arrayEvery);
        var overSome = createOver(arraySome);
        function property(path) {
          return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
        }
        function propertyOf(object) {
          return function(path) {
            return object == null ? undefined$1 : baseGet(object, path);
          };
        }
        var range = createRange();
        var rangeRight = createRange(true);
        function stubArray() {
          return [];
        }
        function stubFalse() {
          return false;
        }
        function stubObject() {
          return {};
        }
        function stubString() {
          return "";
        }
        function stubTrue() {
          return true;
        }
        function times(n2, iteratee2) {
          n2 = toInteger(n2);
          if (n2 < 1 || n2 > MAX_SAFE_INTEGER) {
            return [];
          }
          var index = MAX_ARRAY_LENGTH, length = nativeMin(n2, MAX_ARRAY_LENGTH);
          iteratee2 = getIteratee(iteratee2);
          n2 -= MAX_ARRAY_LENGTH;
          var result2 = baseTimes(length, iteratee2);
          while (++index < n2) {
            iteratee2(index);
          }
          return result2;
        }
        function toPath(value) {
          if (isArray(value)) {
            return arrayMap(value, toKey);
          }
          return isSymbol(value) ? [value] : copyArray(stringToPath(toString(value)));
        }
        function uniqueId(prefix) {
          var id = ++idCounter;
          return toString(prefix) + id;
        }
        var add = createMathOperation(function(augend, addend) {
          return augend + addend;
        }, 0);
        var ceil = createRound("ceil");
        var divide = createMathOperation(function(dividend, divisor) {
          return dividend / divisor;
        }, 1);
        var floor = createRound("floor");
        function max(array) {
          return array && array.length ? baseExtremum(array, identity, baseGt) : undefined$1;
        }
        function maxBy(array, iteratee2) {
          return array && array.length ? baseExtremum(array, getIteratee(iteratee2, 2), baseGt) : undefined$1;
        }
        function mean(array) {
          return baseMean(array, identity);
        }
        function meanBy(array, iteratee2) {
          return baseMean(array, getIteratee(iteratee2, 2));
        }
        function min(array) {
          return array && array.length ? baseExtremum(array, identity, baseLt) : undefined$1;
        }
        function minBy(array, iteratee2) {
          return array && array.length ? baseExtremum(array, getIteratee(iteratee2, 2), baseLt) : undefined$1;
        }
        var multiply = createMathOperation(function(multiplier, multiplicand) {
          return multiplier * multiplicand;
        }, 1);
        var round = createRound("round");
        var subtract = createMathOperation(function(minuend, subtrahend) {
          return minuend - subtrahend;
        }, 0);
        function sum(array) {
          return array && array.length ? baseSum(array, identity) : 0;
        }
        function sumBy(array, iteratee2) {
          return array && array.length ? baseSum(array, getIteratee(iteratee2, 2)) : 0;
        }
        lodash2.after = after;
        lodash2.ary = ary;
        lodash2.assign = assign;
        lodash2.assignIn = assignIn;
        lodash2.assignInWith = assignInWith;
        lodash2.assignWith = assignWith;
        lodash2.at = at;
        lodash2.before = before;
        lodash2.bind = bind;
        lodash2.bindAll = bindAll;
        lodash2.bindKey = bindKey;
        lodash2.castArray = castArray;
        lodash2.chain = chain;
        lodash2.chunk = chunk;
        lodash2.compact = compact;
        lodash2.concat = concat;
        lodash2.cond = cond;
        lodash2.conforms = conforms;
        lodash2.constant = constant;
        lodash2.countBy = countBy;
        lodash2.create = create;
        lodash2.curry = curry;
        lodash2.curryRight = curryRight;
        lodash2.debounce = debounce;
        lodash2.defaults = defaults;
        lodash2.defaultsDeep = defaultsDeep;
        lodash2.defer = defer;
        lodash2.delay = delay;
        lodash2.difference = difference;
        lodash2.differenceBy = differenceBy;
        lodash2.differenceWith = differenceWith;
        lodash2.drop = drop;
        lodash2.dropRight = dropRight;
        lodash2.dropRightWhile = dropRightWhile;
        lodash2.dropWhile = dropWhile;
        lodash2.fill = fill;
        lodash2.filter = filter;
        lodash2.flatMap = flatMap;
        lodash2.flatMapDeep = flatMapDeep;
        lodash2.flatMapDepth = flatMapDepth;
        lodash2.flatten = flatten;
        lodash2.flattenDeep = flattenDeep;
        lodash2.flattenDepth = flattenDepth;
        lodash2.flip = flip;
        lodash2.flow = flow;
        lodash2.flowRight = flowRight;
        lodash2.fromPairs = fromPairs;
        lodash2.functions = functions;
        lodash2.functionsIn = functionsIn;
        lodash2.groupBy = groupBy;
        lodash2.initial = initial;
        lodash2.intersection = intersection;
        lodash2.intersectionBy = intersectionBy;
        lodash2.intersectionWith = intersectionWith;
        lodash2.invert = invert;
        lodash2.invertBy = invertBy;
        lodash2.invokeMap = invokeMap;
        lodash2.iteratee = iteratee;
        lodash2.keyBy = keyBy;
        lodash2.keys = keys;
        lodash2.keysIn = keysIn;
        lodash2.map = map;
        lodash2.mapKeys = mapKeys;
        lodash2.mapValues = mapValues;
        lodash2.matches = matches;
        lodash2.matchesProperty = matchesProperty;
        lodash2.memoize = memoize;
        lodash2.merge = merge;
        lodash2.mergeWith = mergeWith;
        lodash2.method = method;
        lodash2.methodOf = methodOf;
        lodash2.mixin = mixin;
        lodash2.negate = negate;
        lodash2.nthArg = nthArg;
        lodash2.omit = omit;
        lodash2.omitBy = omitBy;
        lodash2.once = once;
        lodash2.orderBy = orderBy;
        lodash2.over = over;
        lodash2.overArgs = overArgs;
        lodash2.overEvery = overEvery;
        lodash2.overSome = overSome;
        lodash2.partial = partial;
        lodash2.partialRight = partialRight;
        lodash2.partition = partition;
        lodash2.pick = pick;
        lodash2.pickBy = pickBy;
        lodash2.property = property;
        lodash2.propertyOf = propertyOf;
        lodash2.pull = pull;
        lodash2.pullAll = pullAll;
        lodash2.pullAllBy = pullAllBy;
        lodash2.pullAllWith = pullAllWith;
        lodash2.pullAt = pullAt;
        lodash2.range = range;
        lodash2.rangeRight = rangeRight;
        lodash2.rearg = rearg;
        lodash2.reject = reject;
        lodash2.remove = remove;
        lodash2.rest = rest;
        lodash2.reverse = reverse;
        lodash2.sampleSize = sampleSize;
        lodash2.set = set;
        lodash2.setWith = setWith;
        lodash2.shuffle = shuffle;
        lodash2.slice = slice;
        lodash2.sortBy = sortBy;
        lodash2.sortedUniq = sortedUniq;
        lodash2.sortedUniqBy = sortedUniqBy;
        lodash2.split = split;
        lodash2.spread = spread;
        lodash2.tail = tail;
        lodash2.take = take;
        lodash2.takeRight = takeRight;
        lodash2.takeRightWhile = takeRightWhile;
        lodash2.takeWhile = takeWhile;
        lodash2.tap = tap;
        lodash2.throttle = throttle;
        lodash2.thru = thru;
        lodash2.toArray = toArray;
        lodash2.toPairs = toPairs;
        lodash2.toPairsIn = toPairsIn;
        lodash2.toPath = toPath;
        lodash2.toPlainObject = toPlainObject;
        lodash2.transform = transform;
        lodash2.unary = unary;
        lodash2.union = union;
        lodash2.unionBy = unionBy;
        lodash2.unionWith = unionWith;
        lodash2.uniq = uniq;
        lodash2.uniqBy = uniqBy;
        lodash2.uniqWith = uniqWith;
        lodash2.unset = unset;
        lodash2.unzip = unzip;
        lodash2.unzipWith = unzipWith;
        lodash2.update = update;
        lodash2.updateWith = updateWith;
        lodash2.values = values;
        lodash2.valuesIn = valuesIn;
        lodash2.without = without;
        lodash2.words = words;
        lodash2.wrap = wrap;
        lodash2.xor = xor;
        lodash2.xorBy = xorBy;
        lodash2.xorWith = xorWith;
        lodash2.zip = zip;
        lodash2.zipObject = zipObject;
        lodash2.zipObjectDeep = zipObjectDeep;
        lodash2.zipWith = zipWith;
        lodash2.entries = toPairs;
        lodash2.entriesIn = toPairsIn;
        lodash2.extend = assignIn;
        lodash2.extendWith = assignInWith;
        mixin(lodash2, lodash2);
        lodash2.add = add;
        lodash2.attempt = attempt;
        lodash2.camelCase = camelCase;
        lodash2.capitalize = capitalize;
        lodash2.ceil = ceil;
        lodash2.clamp = clamp;
        lodash2.clone = clone;
        lodash2.cloneDeep = cloneDeep;
        lodash2.cloneDeepWith = cloneDeepWith;
        lodash2.cloneWith = cloneWith;
        lodash2.conformsTo = conformsTo;
        lodash2.deburr = deburr;
        lodash2.defaultTo = defaultTo;
        lodash2.divide = divide;
        lodash2.endsWith = endsWith;
        lodash2.eq = eq;
        lodash2.escape = escape;
        lodash2.escapeRegExp = escapeRegExp;
        lodash2.every = every;
        lodash2.find = find;
        lodash2.findIndex = findIndex;
        lodash2.findKey = findKey;
        lodash2.findLast = findLast;
        lodash2.findLastIndex = findLastIndex;
        lodash2.findLastKey = findLastKey;
        lodash2.floor = floor;
        lodash2.forEach = forEach;
        lodash2.forEachRight = forEachRight;
        lodash2.forIn = forIn;
        lodash2.forInRight = forInRight;
        lodash2.forOwn = forOwn;
        lodash2.forOwnRight = forOwnRight;
        lodash2.get = get;
        lodash2.gt = gt;
        lodash2.gte = gte;
        lodash2.has = has;
        lodash2.hasIn = hasIn;
        lodash2.head = head;
        lodash2.identity = identity;
        lodash2.includes = includes;
        lodash2.indexOf = indexOf;
        lodash2.inRange = inRange;
        lodash2.invoke = invoke;
        lodash2.isArguments = isArguments;
        lodash2.isArray = isArray;
        lodash2.isArrayBuffer = isArrayBuffer;
        lodash2.isArrayLike = isArrayLike;
        lodash2.isArrayLikeObject = isArrayLikeObject;
        lodash2.isBoolean = isBoolean;
        lodash2.isBuffer = isBuffer;
        lodash2.isDate = isDate;
        lodash2.isElement = isElement;
        lodash2.isEmpty = isEmpty;
        lodash2.isEqual = isEqual;
        lodash2.isEqualWith = isEqualWith;
        lodash2.isError = isError;
        lodash2.isFinite = isFinite;
        lodash2.isFunction = isFunction2;
        lodash2.isInteger = isInteger;
        lodash2.isLength = isLength;
        lodash2.isMap = isMap;
        lodash2.isMatch = isMatch;
        lodash2.isMatchWith = isMatchWith;
        lodash2.isNaN = isNaN;
        lodash2.isNative = isNative;
        lodash2.isNil = isNil;
        lodash2.isNull = isNull;
        lodash2.isNumber = isNumber;
        lodash2.isObject = isObject;
        lodash2.isObjectLike = isObjectLike;
        lodash2.isPlainObject = isPlainObject;
        lodash2.isRegExp = isRegExp;
        lodash2.isSafeInteger = isSafeInteger;
        lodash2.isSet = isSet;
        lodash2.isString = isString;
        lodash2.isSymbol = isSymbol;
        lodash2.isTypedArray = isTypedArray;
        lodash2.isUndefined = isUndefined;
        lodash2.isWeakMap = isWeakMap;
        lodash2.isWeakSet = isWeakSet;
        lodash2.join = join;
        lodash2.kebabCase = kebabCase;
        lodash2.last = last;
        lodash2.lastIndexOf = lastIndexOf;
        lodash2.lowerCase = lowerCase;
        lodash2.lowerFirst = lowerFirst;
        lodash2.lt = lt;
        lodash2.lte = lte;
        lodash2.max = max;
        lodash2.maxBy = maxBy;
        lodash2.mean = mean;
        lodash2.meanBy = meanBy;
        lodash2.min = min;
        lodash2.minBy = minBy;
        lodash2.stubArray = stubArray;
        lodash2.stubFalse = stubFalse;
        lodash2.stubObject = stubObject;
        lodash2.stubString = stubString;
        lodash2.stubTrue = stubTrue;
        lodash2.multiply = multiply;
        lodash2.nth = nth;
        lodash2.noConflict = noConflict;
        lodash2.noop = noop;
        lodash2.now = now;
        lodash2.pad = pad;
        lodash2.padEnd = padEnd;
        lodash2.padStart = padStart;
        lodash2.parseInt = parseInt2;
        lodash2.random = random;
        lodash2.reduce = reduce;
        lodash2.reduceRight = reduceRight;
        lodash2.repeat = repeat;
        lodash2.replace = replace;
        lodash2.result = result;
        lodash2.round = round;
        lodash2.runInContext = runInContext2;
        lodash2.sample = sample;
        lodash2.size = size;
        lodash2.snakeCase = snakeCase;
        lodash2.some = some;
        lodash2.sortedIndex = sortedIndex;
        lodash2.sortedIndexBy = sortedIndexBy;
        lodash2.sortedIndexOf = sortedIndexOf;
        lodash2.sortedLastIndex = sortedLastIndex;
        lodash2.sortedLastIndexBy = sortedLastIndexBy;
        lodash2.sortedLastIndexOf = sortedLastIndexOf;
        lodash2.startCase = startCase;
        lodash2.startsWith = startsWith;
        lodash2.subtract = subtract;
        lodash2.sum = sum;
        lodash2.sumBy = sumBy;
        lodash2.template = template;
        lodash2.times = times;
        lodash2.toFinite = toFinite;
        lodash2.toInteger = toInteger;
        lodash2.toLength = toLength;
        lodash2.toLower = toLower;
        lodash2.toNumber = toNumber;
        lodash2.toSafeInteger = toSafeInteger;
        lodash2.toString = toString;
        lodash2.toUpper = toUpper;
        lodash2.trim = trim;
        lodash2.trimEnd = trimEnd;
        lodash2.trimStart = trimStart;
        lodash2.truncate = truncate;
        lodash2.unescape = unescape;
        lodash2.uniqueId = uniqueId;
        lodash2.upperCase = upperCase;
        lodash2.upperFirst = upperFirst;
        lodash2.each = forEach;
        lodash2.eachRight = forEachRight;
        lodash2.first = head;
        mixin(lodash2, (function() {
          var source = {};
          baseForOwn(lodash2, function(func, methodName) {
            if (!hasOwnProperty.call(lodash2.prototype, methodName)) {
              source[methodName] = func;
            }
          });
          return source;
        })(), { "chain": false });
        lodash2.VERSION = VERSION;
        arrayEach(["bind", "bindKey", "curry", "curryRight", "partial", "partialRight"], function(methodName) {
          lodash2[methodName].placeholder = lodash2;
        });
        arrayEach(["drop", "take"], function(methodName, index) {
          LazyWrapper.prototype[methodName] = function(n2) {
            n2 = n2 === undefined$1 ? 1 : nativeMax(toInteger(n2), 0);
            var result2 = this.__filtered__ && !index ? new LazyWrapper(this) : this.clone();
            if (result2.__filtered__) {
              result2.__takeCount__ = nativeMin(n2, result2.__takeCount__);
            } else {
              result2.__views__.push({
                "size": nativeMin(n2, MAX_ARRAY_LENGTH),
                "type": methodName + (result2.__dir__ < 0 ? "Right" : "")
              });
            }
            return result2;
          };
          LazyWrapper.prototype[methodName + "Right"] = function(n2) {
            return this.reverse()[methodName](n2).reverse();
          };
        });
        arrayEach(["filter", "map", "takeWhile"], function(methodName, index) {
          var type = index + 1, isFilter = type == LAZY_FILTER_FLAG || type == LAZY_WHILE_FLAG;
          LazyWrapper.prototype[methodName] = function(iteratee2) {
            var result2 = this.clone();
            result2.__iteratees__.push({
              "iteratee": getIteratee(iteratee2, 3),
              "type": type
            });
            result2.__filtered__ = result2.__filtered__ || isFilter;
            return result2;
          };
        });
        arrayEach(["head", "last"], function(methodName, index) {
          var takeName = "take" + (index ? "Right" : "");
          LazyWrapper.prototype[methodName] = function() {
            return this[takeName](1).value()[0];
          };
        });
        arrayEach(["initial", "tail"], function(methodName, index) {
          var dropName = "drop" + (index ? "" : "Right");
          LazyWrapper.prototype[methodName] = function() {
            return this.__filtered__ ? new LazyWrapper(this) : this[dropName](1);
          };
        });
        LazyWrapper.prototype.compact = function() {
          return this.filter(identity);
        };
        LazyWrapper.prototype.find = function(predicate) {
          return this.filter(predicate).head();
        };
        LazyWrapper.prototype.findLast = function(predicate) {
          return this.reverse().find(predicate);
        };
        LazyWrapper.prototype.invokeMap = baseRest(function(path, args) {
          if (typeof path == "function") {
            return new LazyWrapper(this);
          }
          return this.map(function(value) {
            return baseInvoke(value, path, args);
          });
        });
        LazyWrapper.prototype.reject = function(predicate) {
          return this.filter(negate(getIteratee(predicate)));
        };
        LazyWrapper.prototype.slice = function(start, end) {
          start = toInteger(start);
          var result2 = this;
          if (result2.__filtered__ && (start > 0 || end < 0)) {
            return new LazyWrapper(result2);
          }
          if (start < 0) {
            result2 = result2.takeRight(-start);
          } else if (start) {
            result2 = result2.drop(start);
          }
          if (end !== undefined$1) {
            end = toInteger(end);
            result2 = end < 0 ? result2.dropRight(-end) : result2.take(end - start);
          }
          return result2;
        };
        LazyWrapper.prototype.takeRightWhile = function(predicate) {
          return this.reverse().takeWhile(predicate).reverse();
        };
        LazyWrapper.prototype.toArray = function() {
          return this.take(MAX_ARRAY_LENGTH);
        };
        baseForOwn(LazyWrapper.prototype, function(func, methodName) {
          var checkIteratee = /^(?:filter|find|map|reject)|While$/.test(methodName), isTaker = /^(?:head|last)$/.test(methodName), lodashFunc = lodash2[isTaker ? "take" + (methodName == "last" ? "Right" : "") : methodName], retUnwrapped = isTaker || /^find/.test(methodName);
          if (!lodashFunc) {
            return;
          }
          lodash2.prototype[methodName] = function() {
            var value = this.__wrapped__, args = isTaker ? [1] : arguments, isLazy = value instanceof LazyWrapper, iteratee2 = args[0], useLazy = isLazy || isArray(value);
            var interceptor = function(value2) {
              var result3 = lodashFunc.apply(lodash2, arrayPush([value2], args));
              return isTaker && chainAll ? result3[0] : result3;
            };
            if (useLazy && checkIteratee && typeof iteratee2 == "function" && iteratee2.length != 1) {
              isLazy = useLazy = false;
            }
            var chainAll = this.__chain__, isHybrid = !!this.__actions__.length, isUnwrapped = retUnwrapped && !chainAll, onlyLazy = isLazy && !isHybrid;
            if (!retUnwrapped && useLazy) {
              value = onlyLazy ? value : new LazyWrapper(this);
              var result2 = func.apply(value, args);
              result2.__actions__.push({ "func": thru, "args": [interceptor], "thisArg": undefined$1 });
              return new LodashWrapper(result2, chainAll);
            }
            if (isUnwrapped && onlyLazy) {
              return func.apply(this, args);
            }
            result2 = this.thru(interceptor);
            return isUnwrapped ? isTaker ? result2.value()[0] : result2.value() : result2;
          };
        });
        arrayEach(["pop", "push", "shift", "sort", "splice", "unshift"], function(methodName) {
          var func = arrayProto[methodName], chainName = /^(?:push|sort|unshift)$/.test(methodName) ? "tap" : "thru", retUnwrapped = /^(?:pop|shift)$/.test(methodName);
          lodash2.prototype[methodName] = function() {
            var args = arguments;
            if (retUnwrapped && !this.__chain__) {
              var value = this.value();
              return func.apply(isArray(value) ? value : [], args);
            }
            return this[chainName](function(value2) {
              return func.apply(isArray(value2) ? value2 : [], args);
            });
          };
        });
        baseForOwn(LazyWrapper.prototype, function(func, methodName) {
          var lodashFunc = lodash2[methodName];
          if (lodashFunc) {
            var key = lodashFunc.name + "";
            if (!hasOwnProperty.call(realNames, key)) {
              realNames[key] = [];
            }
            realNames[key].push({ "name": methodName, "func": lodashFunc });
          }
        });
        realNames[createHybrid(undefined$1, WRAP_BIND_KEY_FLAG).name] = [{
          "name": "wrapper",
          "func": undefined$1
        }];
        LazyWrapper.prototype.clone = lazyClone;
        LazyWrapper.prototype.reverse = lazyReverse;
        LazyWrapper.prototype.value = lazyValue;
        lodash2.prototype.at = wrapperAt;
        lodash2.prototype.chain = wrapperChain;
        lodash2.prototype.commit = wrapperCommit;
        lodash2.prototype.next = wrapperNext;
        lodash2.prototype.plant = wrapperPlant;
        lodash2.prototype.reverse = wrapperReverse;
        lodash2.prototype.toJSON = lodash2.prototype.valueOf = lodash2.prototype.value = wrapperValue;
        lodash2.prototype.first = lodash2.prototype.head;
        if (symIterator) {
          lodash2.prototype[symIterator] = wrapperToIterator;
        }
        return lodash2;
      });
      var _2 = runInContext();
      if (freeModule) {
        (freeModule.exports = _2)._ = _2;
        freeExports._ = _2;
      } else {
        root._ = _2;
      }
    }).call(lodash);
  })(lodash$1, lodash$1.exports);
  return lodash$1.exports;
}
var lodashExports = requireLodash();
const _ = /* @__PURE__ */ getDefaultExportFromCjs(lodashExports);
const effectiveImplCacheByImpl = /* @__PURE__ */ new WeakMap();
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
  const effective = _.cloneDeep(impl);
  Object.assign(effective, { ...sharedModifier, ...variantModifier });
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
  if (sectionImpl.type !== SectionTypeEnum.MetaControl || !sectionImpl.metaControlParamId || sectionImpl.metaControlParamId !== codeObjId) {
    return null;
  }
  return sectionImpl.codeObjVariantMap[codeObjId] ?? null;
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
  if (impl && isBaseParamCodeObjImpl(impl) && impl.coreNameEditable) {
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
  configureAppSubsystemOpenAPI,
  createAppSubsystemFrontendHost,
  createDefaultAppPolicy,
  createDropzoneFileArtifactId,
  createDropzoneTextAttachmentId,
  createPolicy,
  createRandomName,
  createSettingsState,
  createSingleConfig,
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
  getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrentEffectiveSectionImpl,
  getCurrentEffectiveSectionImplIfPresent,
  getCurrentSectionVariantId,
  getCurrentSectionVariantIdIfPresent,
  getErrorCode,
  getErrorDetail,
  getLatestProjectState,
  getParamDisplayNameIfPresent,
  getPasswordParamValue,
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
  serializeDropzoneValue,
  setAppDefinition,
  setParamEnteredValue,
  shouldShowPasswordReveal,
  updateArtifacts,
  uploadBinary,
  validateAppDefinition
};
