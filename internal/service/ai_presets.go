package service

type ProviderPreset struct {
	Type         string
	Name         string
	BaseURL      string
	DefaultModel string
}

var ProviderPresets = []ProviderPreset{
	{Type: "deepseek", Name: "DeepSeek", BaseURL: "https://api.deepseek.com/v1", DefaultModel: "deepseek-chat"},
	{Type: "glm", Name: "GLM (Zhipu)", BaseURL: "https://open.bigmodel.cn/api/paas/v4", DefaultModel: "glm-4-flash"},
	{Type: "minimax", Name: "MiniMax", BaseURL: "https://api.minimax.chat/v1", DefaultModel: "MiniMax-Text-01"},
	{Type: "kimi", Name: "Kimi (Moonshot)", BaseURL: "https://api.moonshot.cn/v1", DefaultModel: "moonshot-v1-8k"},
	{Type: "qwen", Name: "Qwen (Alibaba)", BaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", DefaultModel: "qwen-turbo"},
	{Type: "openai", Name: "OpenAI", BaseURL: "https://api.openai.com/v1", DefaultModel: "gpt-4o-mini"},
	{Type: "custom", Name: "Custom", BaseURL: "", DefaultModel: ""},
}

func GetPresetByType(pType string) (ProviderPreset, bool) {
	for _, p := range ProviderPresets {
		if p.Type == pType {
			return p, true
		}
	}
	return ProviderPreset{}, false
}
