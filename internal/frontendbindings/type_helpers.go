package frontendbindings

import (
	"encoding/json"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
)

var timeType = reflect.TypeOf(time.Time{})
var rawJSONType = reflect.TypeOf(json.RawMessage{})

func mustTSLiteralValueFromGoValue(context string, value any) any {
	payload, err := json.Marshal(value)
	if err != nil {
		panic(context + ": marshal Go default: " + err.Error())
	}
	var normalized any
	if err := json.Unmarshal(payload, &normalized); err != nil {
		panic(context + ": decode Go default: " + err.Error())
	}
	return normalized
}

func writeTSLiteralValue(builder *strings.Builder, indent string, value any) {
	switch typed := value.(type) {
	case nil:
		builder.WriteString("null")
	case bool:
		builder.WriteString(strconv.FormatBool(typed))
	case string:
		builder.WriteString(strconv.Quote(typed))
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			panic("settings defaults contained a non-finite numeric literal")
		}
		builder.WriteString(strconv.FormatFloat(typed, 'f', -1, 64))
	case []any:
		if len(typed) == 0 {
			builder.WriteString("[]")
			return
		}
		inline := true
		for _, value := range typed {
			switch value.(type) {
			case nil, bool, string, float64:
			default:
				inline = false
			}
			if !inline {
				break
			}
		}
		if inline {
			builder.WriteString("[")
			for index, value := range typed {
				if index > 0 {
					builder.WriteString(", ")
				}
				writeTSLiteralValue(builder, indent, value)
			}
			builder.WriteString("]")
			return
		}
		builder.WriteString("[\n")
		childIndent := indent + "  "
		for _, value := range typed {
			builder.WriteString(childIndent)
			writeTSLiteralValue(builder, childIndent, value)
			builder.WriteString(",\n")
		}
		builder.WriteString(indent)
		builder.WriteString("]")
	case map[string]any:
		builder.WriteString("{\n")
		childIndent := indent + "  "
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		writeProperty := func(key string, value any) {
			builder.WriteString(childIndent)
			builder.WriteString(renderTSObjectKey(key))
			builder.WriteString(": ")
			writeTSLiteralValue(builder, childIndent, value)
			builder.WriteString(",\n")
		}
		for _, key := range keys {
			writeProperty(key, typed[key])
		}
		builder.WriteString(indent)
		builder.WriteString("}")
	default:
		payload, err := json.Marshal(typed)
		if err != nil {
			panic("marshal TypeScript literal value: " + err.Error())
		}
		builder.Write(payload)
	}
}

func renderTSObjectKey(key string) string {
	if key != "__proto__" && tsIdentifierPattern.MatchString(key) {
		return key
	}
	return strconv.Quote(key)
}
