package com.sky.utils;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.sky.properties.AiProperties;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 大模型客户端工具类
 * 调用 OpenAI 兼容的 chat/completions 接口（智谱 GLM、DeepSeek、通义千问等均兼容），
 * 支持携带 tools 实现 Function Calling，供智能助手 Agent 使用
 */
@Component
public class AiClientUtil {

    static final int TIMEOUT_MSEC = 60 * 1000;

    @Autowired
    private AiProperties aiProperties;

    /**
     * 发起一次对话补全请求
     *
     * @param messages 对话消息列表，元素结构 {role, content}，tool 角色的消息需带 tool_call_id
     * @param tools    工具定义列表（OpenAI function calling 格式），可为 null 表示不启用工具
     * @return 响应体 JSONObject，核心结构 choices[0].message{role, content, tool_calls[]}
     */
    public JSONObject chatCompletion(List<Map<String, Object>> messages, JSONArray tools) throws IOException {
        JSONObject body = new JSONObject();
        body.put("model", aiProperties.getModel());
        body.put("messages", messages);
        body.put("temperature", 0.6);
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
            body.put("tool_choice", "auto");
        }

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpPost httpPost = new HttpPost(aiProperties.getBaseUrl() + "/chat/completions");
            httpPost.setHeader("Authorization", "Bearer " + aiProperties.getApiKey());
            httpPost.setHeader("Content-Type", "application/json");
            httpPost.setEntity(new StringEntity(body.toJSONString(), "utf-8"));
            httpPost.setConfig(buildRequestConfig());

            try (CloseableHttpResponse response = httpClient.execute(httpPost)) {
                String result = EntityUtils.toString(response.getEntity(), "UTF-8");
                if (response.getStatusLine().getStatusCode() != 200) {
                    throw new IOException("AI 接口响应异常：" + result);
                }
                return JSON.parseObject(result);
            }
        }
    }

    /**
     * 从响应中取出助手消息
     */
    public JSONObject extractMessage(JSONObject response) {
        return response.getJSONArray("choices").getJSONObject(0).getJSONObject("message");
    }

    private static RequestConfig buildRequestConfig() {
        return RequestConfig.custom()
                .setConnectTimeout(TIMEOUT_MSEC)
                .setConnectionRequestTimeout(TIMEOUT_MSEC)
                .setSocketTimeout(TIMEOUT_MSEC).build();
    }
}
