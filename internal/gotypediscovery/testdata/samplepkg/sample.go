package samplepkg

type allowedAlias = string

type allowedStruct struct{}

type AllowedMode string

type AllowedBool bool

type AllowedNumber int

type AllowedUnsigned uint64

type AllowedFloat float64

type AllowedSlice []string

type AllowedArray [2]float64

type AllowedMap map[string]int

type AllowedStruct struct{}

type AllowedInterface interface {
	isAllowed()
}

// setta-go-type-discovery: skip
type SkippedStruct struct{}

// setta-go-type-discovery: skip
type SkippedInterface interface {
	isSkipped()
}

// setta-go-type-discovery: skip
type SkippedMode string
