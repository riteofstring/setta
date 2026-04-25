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
  return {
    ...mergeGeneratedOptions(defaults, options),
    size: createSectionSize(options["size"] ?? defaults["size"]),
    ignoreTypeErrors: createTypeErrorIgnoreState(
      options["ignoreTypeErrors"] ?? defaults["ignoreTypeErrors"]
    )
  };
}
function createCodeFileBinding(options = {}) {
  return options;
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
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
function createContentRef(options = {}) {
  return options;
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
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
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
    id: options["id"] ?? createPngArtifactId(),
    value: options["value"] ?? createContentRef()
  };
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
function createSectionCapabilities(options = {}) {
  const defaults = {
    canRun: false,
    canSelectAsEntryCodeBlock: false,
    entryCodeBlockValue: null,
    runDisabledReason: null,
    runRequestSectionId: null
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
}
function createSectionSize(options = {}) {
  const defaults = {
    height: "auto",
    width: "auto"
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    width: options["width"] ?? SectionSizeModeEnum.auto,
    height: options["height"] ?? SectionSizeModeEnum.auto
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
  return {
    ...mergeGeneratedOptions(defaults, options),
    size: createSectionSize(options["size"] ?? defaults["size"])
  };
}
function createTypeErrorIgnoreState(options = {}) {
  const defaults = {
    callable: false,
    params: {}
  };
  return {
    ...mergeGeneratedOptions(defaults, options)
  };
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
const SectionSizeModeEnum = {
  auto: "auto"
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
function getEffectiveImpl(impl, core, variant) {
  const effective = cloneProjectStateValue(impl);
  Object.assign(
    effective,
    cloneProjectStateValue(core.sharedModifier),
    cloneProjectStateValue(variant.modifier)
  );
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
