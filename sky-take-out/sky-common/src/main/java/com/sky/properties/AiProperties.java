package com.sky.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "sky.ai")
@Data
public class AiProperties {

    /**
     * OpenAI 兼容接口地址，如智谱 https://open.bigmodel.cn/api/paas/v4
     */
    private String baseUrl;

    /**
     * 模型名称，如 glm-4-flash
     */
    private String model;

    /**
     * API Key，未配置时智能助手会给出友好提示而不是报错
     */
    private String apiKey;

    /**
     * 判断 AI 能力是否已配置
     */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank()
                && !"YOUR_AI_API_KEY".equals(apiKey);
    }
}
