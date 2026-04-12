package projectstate

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
)

var memorableNameAdjectives = []string{
	"happy",
	"clever",
	"swift",
	"brave",
	"bright",
	"calm",
	"eager",
	"fierce",
	"gentle",
	"kind",
	"lively",
	"proud",
	"quiet",
	"rapid",
	"sharp",
	"smart",
	"strong",
	"warm",
	"wise",
	"bold",
	"crisp",
	"deep",
	"free",
	"grand",
	"high",
	"keen",
	"neat",
	"rich",
	"safe",
	"true",
	"young",
	"dark",
	"light",
	"wild",
	"soft",
	"loud",
	"quick",
	"slow",
	"tall",
	"short",
	"fresh",
	"clean",
	"cool",
	"hot",
	"fair",
	"sweet",
	"tough",
	"pure",
	"nice",
	"raw",
	"real",
	"rare",
	"fine",
	"vast",
	"mild",
	"firm",
	"fast",
	"late",
	"main",
	"wide",
	"deep",
	"blue",
	"red",
	"green",
	"gold",
	"pink",
	"gray",
	"tiny",
	"huge",
	"broad",
	"flat",
	"thick",
	"thin",
	"white",
	"black",
	"round",
	"dry",
	"wet",
	"full",
	"empty",
	"heavy",
	"light",
	"loose",
	"tight",
	"long",
	"brief",
	"clear",
	"dark",
	"busy",
	"lazy",
	"spare",
	"prime",
	"royal",
	"plain",
	"spare",
	"crude",
	"chief",
	"swift",
	"dim",
	"dull",
	"rough",
	"smooth",
	"still",
	"small",
	"great",
	"quick",
	"ready",
	"right",
	"rust",
	"tame",
	"vital",
	"young",
	"zinc",
	"zesty",
}

var memorableNameNouns = []string{
	"apple",
	"bear",
	"bird",
	"cat",
	"cloud",
	"deer",
	"dog",
	"fish",
	"fox",
	"frog",
	"hawk",
	"lion",
	"moon",
	"owl",
	"pine",
	"rose",
	"star",
	"sun",
	"tree",
	"wolf",
	"river",
	"mountain",
	"ocean",
	"forest",
	"desert",
	"valley",
	"meadow",
	"garden",
	"brook",
	"lake",
	"beach",
	"cliff",
	"coast",
	"creek",
	"field",
	"flame",
	"flood",
	"frost",
	"glade",
	"grove",
	"shore",
	"spring",
	"storm",
	"stream",
	"tide",
	"trail",
	"whale",
	"wind",
	"wood",
	"world",
	"amber",
	"ash",
	"balm",
	"bark",
	"bay",
	"blade",
	"bloom",
	"branch",
	"brass",
	"bronze",
	"cane",
	"cedar",
	"chalk",
	"clay",
	"cliff",
	"coal",
	"coast",
	"coral",
	"crown",
	"crystal",
	"dew",
	"dove",
	"drake",
	"dune",
	"dust",
	"elm",
	"fern",
	"flake",
	"flame",
	"flock",
	"foam",
	"fog",
	"frost",
	"gale",
	"gem",
	"gill",
	"glacier",
	"grove",
	"gull",
	"harbor",
	"hare",
	"heath",
	"hill",
	"jazz",
	"jewel",
	"kale",
	"kelp",
	"kite",
	"lark",
	"leaf",
	"lime",
	"mane",
	"marsh",
	"mint",
	"mist",
	"moss",
	"nest",
	"night",
	"north",
	"oak",
	"opal",
	"otter",
	"palm",
	"peak",
	"pear",
	"pearl",
	"petal",
	"pike",
	"pine",
	"plant",
	"plum",
	"pond",
	"pool",
	"quail",
	"queen",
	"quill",
	"rain",
	"reef",
	"rice",
	"ridge",
	"rock",
	"root",
	"rose",
	"ruby",
	"rush",
	"sage",
	"sail",
	"salt",
	"sand",
	"seal",
	"seed",
	"shark",
	"shell",
	"shore",
	"silk",
	"slag",
	"slate",
	"sleet",
	"slope",
	"snow",
	"south",
	"spark",
	"spine",
	"spray",
	"spring",
	"sprout",
	"squid",
	"star",
	"stone",
	"storm",
	"swan",
	"swift",
	"tank",
	"tide",
	"tiger",
	"torch",
	"trout",
	"tulip",
	"vapor",
	"vine",
	"voice",
	"wave",
	"weed",
	"well",
	"whale",
	"wind",
	"wing",
	"winter",
	"wolf",
	"womb",
	"wood",
	"wren",
	"yarn",
	"yeast",
	"zebra",
}

var memorableNameVerbs = []string{
	"running",
	"jumping",
	"flying",
	"dancing",
	"singing",
	"laughing",
	"sleeping",
	"dreaming",
	"playing",
	"swimming",
	"climbing",
	"diving",
	"gliding",
	"hopping",
	"leaping",
	"racing",
	"skating",
	"sliding",
	"walking",
	"wandering",
	"acting",
	"baking",
	"being",
	"brewing",
	"buying",
	"calling",
	"caring",
	"catching",
	"chasing",
	"coding",
	"cooking",
	"dealing",
	"doing",
	"drawing",
	"driving",
	"eating",
	"falling",
	"feeling",
	"finding",
	"flowing",
	"giving",
	"glowing",
	"going",
	"growing",
	"having",
	"hearing",
	"hiding",
	"hitting",
	"holding",
	"keeping",
	"knowing",
	"leading",
	"leaving",
	"making",
	"moving",
	"painting",
	"playing",
	"reading",
	"riding",
	"rising",
	"saying",
	"seeing",
	"selling",
	"sending",
	"setting",
	"shining",
	"showing",
	"singing",
	"sitting",
	"speaking",
	"spending",
	"standing",
	"staying",
	"taking",
	"talking",
	"teaching",
	"telling",
	"thinking",
	"turning",
	"using",
	"waiting",
	"watching",
	"winning",
	"working",
	"writing",
	"zooming",
}

var memorableNameWordLists = [][]string{
	memorableNameAdjectives,
	memorableNameNouns,
	memorableNameVerbs,
}

// MemorableNameAdjectives returns the Go-owned adjective vocabulary used for
// generated memorable names.
func MemorableNameAdjectives() []string {
	return append([]string(nil), memorableNameAdjectives...)
}

// MemorableNameNouns returns the Go-owned noun vocabulary used for generated
// memorable names.
func MemorableNameNouns() []string {
	return append([]string(nil), memorableNameNouns...)
}

// MemorableNameVerbs returns the Go-owned verb vocabulary used for generated
// memorable names.
func MemorableNameVerbs() []string {
	return append([]string(nil), memorableNameVerbs...)
}

type generatedNameValidator func(string) (bool, error)

func generateMemorableString() (string, error) {
	selected := make([]string, 0, 2)
	used := map[string]struct{}{}

	for len(selected) < 2 {
		wordListIndex, err := secureRandomIndex(len(memorableNameWordLists))
		if err != nil {
			return "", err
		}
		wordList := memorableNameWordLists[wordListIndex]
		wordIndex, err := secureRandomIndex(len(wordList))
		if err != nil {
			return "", err
		}
		word := wordList[wordIndex]
		if _, exists := used[word]; exists {
			continue
		}
		used[word] = struct{}{}
		selected = append(selected, word)
	}

	return strings.Join(selected, "_"), nil
}

func nextAvailableGeneratedName(
	generate func() (string, error),
	validate generatedNameValidator,
) (string, error) {
	for {
		candidate, err := generate()
		if err != nil {
			return "", err
		}
		ok, err := validate(candidate)
		if err != nil {
			return "", err
		}
		if ok {
			return candidate, nil
		}
	}
}

func nextAvailableMemorableName(validate generatedNameValidator) (string, error) {
	return nextAvailableGeneratedName(generateMemorableString, validate)
}

func secureRandomIndex(max int) (int, error) {
	if max <= 0 {
		return 0, fmt.Errorf("random index max must be positive")
	}
	value, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return 0, err
	}
	return int(value.Int64()), nil
}
