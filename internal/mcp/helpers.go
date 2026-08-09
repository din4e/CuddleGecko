package mcp

import (
	"fmt"
	"strings"
	"time"
)

// arg helpers - extract typed values from map[string]interface{}

func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case uint:
		return float64(val)
	case json_number:
		f, _ := val.Float64()
		return f
	default:
		return 0
	}
}

type json_number interface {
	Float64() (float64, error)
}

func toUint(v interface{}) uint {
	switch val := v.(type) {
	case float64:
		return uint(val)
	case float32:
		return uint(val)
	case int:
		return uint(val)
	case int64:
		return uint(val)
	case uint:
		return val
	default:
		return 0
	}
}

func toBool(v interface{}) bool {
	switch val := v.(type) {
	case bool:
		return val
	case string:
		s := strings.ToLower(strings.TrimSpace(val))
		return s == "true" || s == "1" || s == "yes"
	case float64:
		return val != 0
	case float32:
		return val != 0
	case int:
		return val != 0
	case int64:
		return val != 0
	default:
		return false
	}
}

func toString(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func toStringSlice(v interface{}) []string {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case []string:
		return val
	case []interface{}:
		result := make([]string, len(val))
		for i, item := range val {
			result[i] = toString(item)
		}
		return result
	default:
		return nil
	}
}

func toUintSlice(v interface{}) []uint {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case []uint:
		return val
	case []interface{}:
		result := make([]uint, len(val))
		for i, item := range val {
			result[i] = toUint(item)
		}
		return result
	default:
		return nil
	}
}

func toTime(v interface{}) time.Time {
	if v == nil {
		return time.Time{}
	}
	s := toString(v)
	if s == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}
	}
	return t
}

func toTimePtr(v interface{}) *time.Time {
	if v == nil {
		return nil
	}
	s := toString(v)
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil
	}
	return &t
}

func toFloat64Ptr(v interface{}) *float64 {
	if v == nil {
		return nil
	}
	f := toFloat64(v)
	return &f
}

func toUintPtr(v interface{}) *uint {
	if v == nil {
		return nil
	}
	u := toUint(v)
	return &u
}

func toStringPtr(v interface{}) *string {
	if v == nil {
		return nil
	}
	s := toString(v)
	return &s
}

func getArg(args map[string]interface{}, key string) interface{} {
	if args == nil {
		return nil
	}
	return args[key]
}

func getArgInt(args map[string]interface{}, key string, defaultVal int) int {
	v := getArg(args, key)
	if v == nil {
		return defaultVal
	}
	switch val := v.(type) {
	case float64:
		return int(val)
	case int:
		return val
	default:
		return defaultVal
	}
}
