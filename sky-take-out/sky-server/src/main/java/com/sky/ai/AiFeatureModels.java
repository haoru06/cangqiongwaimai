package com.sky.ai;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 功能的输入输出模型。集中放在新包中，避免修改既有业务 DTO/VO。
 */
public final class AiFeatureModels {

    private AiFeatureModels() {
    }

    public static class QueryRequest {
        public String question;
    }

    public static class DiagnosisReport {
        public Long runId;
        public String analysisDate;
        public String status;
        public String generatedAt;
        public List<Anomaly> anomalies = new ArrayList<>();
        public List<ActionProposal> actions = new ArrayList<>();
        public List<String> agentTrace = new ArrayList<>();
    }

    public static class Anomaly {
        public int rank;
        public String level;
        public String metric;
        public String title;
        public String conclusion;
        public String rootCause;
        public String suggestion;
        public String observed;
        public String baseline;
        public String evidence;
        public BigDecimal impactAmount;
        public String actionType;
        public Long actionTargetId;
        public String actionLabel;
    }

    public static class ActionProposal {
        public Long id;
        public String type;
        public Long targetId;
        public Map<String, Object> payload = new LinkedHashMap<>();
        public String evidence;
        public String status;
        public String result;
        public String createdTime;
    }

    public static class QueryResult {
        public boolean success;
        public String question;
        public String sql;
        public String error;
        public String summary;
        public List<String> columns = new ArrayList<>();
        public List<Map<String, Object>> rows = new ArrayList<>();
        public List<String> trace = new ArrayList<>();
    }
}
