package frontendbindings

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strconv"
	"strings"
	"time"
)

var timeType = reflect.TypeOf(time.Time{})
var rawJSONType = reflect.TypeOf(json.RawMessage{})

func mustTSLiteralValueFromGoValue(context string, value any) any {
	payload, err := marshalTSLiteralJSON(value, false)
	if err != nil {
		panic(context + ": marshal Go default: " + err.Error())
	}
	var normalized any
	if err := json.Unmarshal(payload, &normalized); err != nil {
		panic(context + ": decode Go default: " + err.Error())
	}
	return normalized
}

func renderTSLiteralValue(value any, indent string) string {
	payload, err := marshalTSLiteralJSON(value, indent != "")
	if err != nil {
		panic("marshal TypeScript literal value: " + err.Error())
	}
	text := string(payload)
	if indent == "" {
		return text
	}
	return strings.ReplaceAll(text, "\n", "\n"+indent)
}

func marshalTSLiteralJSON(value any, multiline bool) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if multiline {
		encoder.SetIndent("", "  ")
	}
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n")), nil
}

func renderTSObjectKey(key string) string {
	if key != "__proto__" && tsIdentifierPattern.MatchString(key) {
		return key
	}
	return strconv.Quote(key)
}
