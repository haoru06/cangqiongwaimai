package com.sky.ai.query;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.sky.ai.AiFeatureModels;
import com.sky.ai.repository.AiActionRepository;
import com.sky.properties.AiProperties;
import com.sky.utils.AiClientUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 自然语言取数 Agent：生成 SQL、进入沙箱、失败后把错误回填并自动修复。 */
@Service
@Slf4j
public class AiQueryService {

    private static final int MAX_ATTEMPTS = 3;

    @Autowired
    private AiSqlSandbox sqlSandbox;
    @Autowired
    private AiClientUtil aiClientUtil;
    @Autowired
    private AiProperties aiProperties;
    @Autowired
    private AiActionRepository actionRepository;

    public AiFeatureModels.QueryResult query(AiFeatureModels.QueryRequest request) {
        AiFeatureModels.QueryResult result = new AiFeatureModels.QueryResult();
        String question = request == null ? null : request.question;
        result.question = question;
        if (question == null || question.trim().isEmpty()) {
            result.error = "问题不能为空";
            return result;
        }
        if (question.length() > 300) {
            result.error = "问题长度不能超过 300 个字符";
            return result;
        }
        if (!aiProperties.isConfigured()) {
            result.error = "AI 服务未配置，请在 sky.ai.api-key 中填入模型密钥";
            result.trace.add("未配置模型，未执行 SQL");
            return result;
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(message("system", "你是苍穹外卖的只读数据分析 Agent。" +
                "只能使用给定表和字段生成一条 MySQL 8 SELECT。" +
                "营业额只统计 orders.status=5 的 amount；禁止查询手机号、地址、openid 等隐私字段。" +
                "必须只输出 JSON：{\"sql\":\"...\",\"summary\":\"...\"}，不要 Markdown。"));
        messages.add(message("user", "可用数据库结构：\n" + sqlSandbox.schemaDescription() + "\n用户问题：" + question));

        String lastSql = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                JSONObject response = aiClientUtil.chatCompletion(messages, null);
                JSONObject assistant = aiClientUtil.extractMessage(response);
                String content = assistant.getString("content");
                JSONObject answer = parseAnswer(content);
                String sql = answer == null ? null : answer.getString("sql");
                if (sql == null || sql.trim().isEmpty()) {
                    throw new IllegalArgumentException("模型没有返回合法 SQL JSON");
                }
                lastSql = sql;
                result.trace.add("第 " + attempt + " 次生成 SQL");
                AiSqlSandbox.ExecutionResult execution = sqlSandbox.execute(sql);
                result.success = true;
                result.sql = execution.sql;
                result.columns = execution.columns;
                result.rows = execution.rows;
                result.summary = summarize(question, execution, answer.getString("summary"), result.trace);
                actionRepository.saveRun("NL_QUERY", null, JSON.toJSONString(result.trace), JSON.toJSONString(result));
                return result;
            } catch (Exception e) {
                String error = e.getMessage() == null ? "未知错误" : e.getMessage();
                result.trace.add("第 " + attempt + " 次失败：" + error);
                messages.add(message("assistant", lastSql == null ? "" : lastSql));
                messages.add(message("user", "上一条 SQL 执行失败：" + error +
                        "。请修正 SQL，只输出 JSON，不要解释。"));
                result.error = error;
            }
        }
        actionRepository.saveRun("NL_QUERY", null, JSON.toJSONString(result.trace), JSON.toJSONString(result));
        return result;
    }

    private JSONObject parseAnswer(String content) {
        if (content == null) return null;
        String text = content.trim().replace("```json", "").replace("```", "").trim();
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parseObject(text.substring(start, end + 1));
            } catch (Exception ignored) {
                // 继续尝试从普通文本中提取 SELECT。
            }
        }
        int select = text.toLowerCase().indexOf("select ");
        if (select < 0) return null;
        return new JSONObject().fluentPut("sql", text.substring(select));
    }

    private String summarize(String question, AiSqlSandbox.ExecutionResult execution, String modelSummary,
                             List<String> trace) {
        if (!aiProperties.isConfigured()) {
            return "查询完成，共返回 " + execution.rows.size() + " 行";
        }
        try {
            List<Map<String, Object>> messages = new ArrayList<>();
            messages.add(message("system", "根据查询结果回答用户问题，只能使用结果中的事实，输出一句简体中文总结。"));
            messages.add(message("user", "问题=" + question + "；列=" + execution.columns + "；结果=" +
                    JSON.toJSONString(execution.rows)));
            JSONObject response = aiClientUtil.chatCompletion(messages, null);
            String summary = aiClientUtil.extractMessage(response).getString("content");
            if (summary != null && !summary.trim().isEmpty()) {
                trace.add("结果汇总完成");
                return summary.trim();
            }
        } catch (Exception e) {
            log.warn("查询结果汇总失败，使用本地摘要", e);
        }
        return modelSummary == null || modelSummary.trim().isEmpty()
                ? "查询完成，共返回 " + execution.rows.size() + " 行" : modelSummary.trim();
    }

    private Map<String, Object> message(String role, String content) {
        Map<String, Object> message = new HashMap<>();
        message.put("role", role);
        message.put("content", content);
        return message;
    }
}
