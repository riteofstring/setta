package main

type supportedContracts struct {
	RealtimeClientEvents []supportedRealtimeEvent `json:"realtimeClientEvents"`
	Operations           []supportedOperation     `json:"operations"`
	RealtimeServerEvents []supportedRealtimeEvent `json:"realtimeServerEvents"`
	Speech               supportedSpeech          `json:"speech"`
	Transcription        supportedTranscription   `json:"transcription"`
}

type supportedOperation struct {
	Method                 string   `json:"method"`
	Name                   string   `json:"name"`
	OperationID            string   `json:"operationId"`
	Path                   string   `json:"path"`
	RequestMediaType       string   `json:"requestMediaType"`
	RequestSchema          string   `json:"requestSchema"`
	ResponseMediaType      string   `json:"responseMediaType"`
	SuccessStatus          string   `json:"successStatus"`
	WireResponseMediaTypes []string `json:"wireResponseMediaTypes"`
}

type supportedRealtimeEvent struct {
	Name   string `json:"name"`
	Schema string `json:"schema"`
	Type   string `json:"type"`
}

type supportedSpeech struct {
	Model          string   `json:"model"`
	ResponseFormat string   `json:"responseFormat"`
	Voice          string   `json:"voice"`
	Voices         []string `json:"voices"`
}

type supportedTranscription struct {
	ClientSecretTTLSeconds int    `json:"clientSecretTTLSeconds"`
	Delay                  string `json:"delay"`
	Model                  string `json:"model"`
	SessionSchema          string `json:"sessionSchema"`
	WebRTCOperation        string `json:"webRTCOperation"`
}

type openAPIDocument struct {
	Components openAPIComponents      `yaml:"components"`
	Info       openAPIInfo            `yaml:"info"`
	OpenAPI    string                 `yaml:"openapi"`
	Paths      map[string]openAPIPath `yaml:"paths"`
	Servers    []openAPIServer        `yaml:"servers"`
}

type openAPIComponents struct {
	Schemas map[string]*openAPISchema `yaml:"schemas"`
}

type openAPIInfo struct {
	Version string `yaml:"version"`
}

type openAPIServer struct {
	URL string `yaml:"url"`
}

type openAPIPath struct {
	Post *openAPIOperation `yaml:"post"`
}

type openAPIOperation struct {
	OperationID string                     `yaml:"operationId"`
	RequestBody *openAPIRequestBody        `yaml:"requestBody"`
	Responses   map[string]openAPIResponse `yaml:"responses"`
}

type openAPIRequestBody struct {
	Content map[string]openAPIMediaType `yaml:"content"`
}

type openAPIResponse struct {
	Content map[string]openAPIMediaType `yaml:"content"`
}

type openAPIMediaType struct {
	Schema *openAPISchema `yaml:"schema"`
}

type openAPISchema struct {
	AllOf      []*openAPISchema          `yaml:"allOf"`
	AnyOf      []*openAPISchema          `yaml:"anyOf"`
	Const      any                       `yaml:"const"`
	Enum       []any                     `yaml:"enum"`
	Items      *openAPISchema            `yaml:"items"`
	Maximum    *float64                  `yaml:"maximum"`
	MaxLength  *int                      `yaml:"maxLength"`
	Minimum    *float64                  `yaml:"minimum"`
	OneOf      []*openAPISchema          `yaml:"oneOf"`
	Properties map[string]*openAPISchema `yaml:"properties"`
	Ref        string                    `yaml:"$ref"`
	Required   []string                  `yaml:"required"`
	Type       any                       `yaml:"type"`
}

type generationModel struct {
	APIVersion                 string
	ClientEvents               []realtimeEventContract
	Events                     []realtimeEventContract
	MaximumSynthesisCharacters int
	Operations                 []operationContract
	ServerURL                  string
	SourceCommit               string
	Speech                     supportedSpeech
	Transcription              supportedTranscription
}

type operationContract struct {
	Method                 string
	Name                   string
	OperationID            string
	Path                   string
	RequestMediaType       string
	RequestSchema          string
	ResponseMediaType      string
	SuccessStatus          string
	WireResponseMediaTypes []string
}

type realtimeEventContract struct {
	Name       string
	Properties []realtimeEventProperty
	Required   []string
	Schema     string
	Type       string
}

type realtimeEventProperty struct {
	Name  string
	Shape string
}
