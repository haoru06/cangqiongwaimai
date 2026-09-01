package com.sky.ai.diagnosis;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.sky.ai.AiFeatureModels;
import com.sky.ai.repository.AiActionRepository;
import com.sky.ai.repository.AiAnalyticsRepository;
import com.sky.entity.Dish;
import com.sky.mapper.DishMapper;
import com.sky.properties.AiProperties;
import com.sky.utils.AiClientUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 主动式经营诊断 Agent：确定性指标发现问题，模型负责证据下钻与解释。 */
@Service
@Slf4j
public class AiDiagnosisService {

    private static final String LATEST_KEY = "ai:diagnosis:latest";
    private static final int MAX_AGENT_ITERATIONS = 3;

    @Autowired
    private AiAnalyticsRepository analyticsRepository;
    @Autowired
    private AiActionRepository actionRepository;
    @Autowired
    private DishMapper dishMapper;
    @Autowired
    private AiClientUtil aiClientUtil;
    @Autowired
    private AiProperties aiProperties;
    @Autowired
    private StringRedisTemplate stringRedisTemplate;
    @Autowired
    private RedisTemplate redisTemplate;

    public AiFeatureModels.DiagnosisReport run() {
        AiFeatureModels.DiagnosisReport report = new AiFeatureModels.DiagnosisReport();
        LocalDateTime latest = analyticsRepository.latestOrderTime();
        if (latest == null) {
            report.status = "NO_DATA";
            report.generatedAt = LocalDateTime.now().toString();
            report.agentTrace.add("没有订单数据，跳过异常检测");
            return report;
        }

        // 演示库中的种子订单可能不是今天的；真实环境会自然落到当天。
        LocalDate analysisDate = latest.toLocalDate().isBefore(LocalDate.now())
                ? latest.toLocalDate() : LocalDate.now();
        LocalDateTime begin = analysisDate.atStartOfDay();
        LocalDateTime end = analysisDate.atTime(LocalTime.MAX);
        LocalDateTime previousBegin = analysisDate.minusDays(1).atStartOfDay();
        LocalDateTime previousEnd = analysisDate.minusDays(1).atTime(LocalTime.MAX);
        Map<String, Object> current = analyticsRepository.queryKpi(begin, end);
        Map<String, Object> previous = analyticsRepository.queryKpi(previousBegin, previousEnd);
        List<Map<String, Object>> reasons = analyticsRepository.cancellationReasons(begin, end);
        List<Map<String, Object>> sales = analyticsRepository.topSales(analysisDate.minusDays(7).atStartOfDay(), end, 5);
        List<Map<String, Object>> dormant = analyticsRepository.dormantDishes(analysisDate.minusDays(30).atStartOfDay(), end);

        report.analysisDate = analysisDate.toString();
        report.agentTrace.add("固定指标工具完成：KPI、取消原因、销量、滞销菜品");
        addCancellationAnomaly(report, current, previous, reasons);
        addTurnoverAnomaly(report, current, previous);
        addTimingAnomaly(report, current, previous);
        addDormantAnomaly(report, dormant);

        if (report.anomalies.isEmpty()) {
            report.status = "NORMAL";
            report.agentTrace.add("规则层未发现达到阈值的异常");
        } else {
            report.status = "HAS_ANOMALY";
            for (AiFeatureModels.Anomaly anomaly : report.anomalies) {
                enrichWithAgent(anomaly, analysisDate, begin, end, report.agentTrace);
                if (anomaly.actionType != null) {
                    report.actions.add(createAction(report.analysisDate, anomaly));
                }
            }
        }
        for (int i = 0; i < report.anomalies.size(); i++) {
            report.anomalies.get(i).rank = i + 1;
        }
        report.generatedAt = LocalDateTime.now().toString();
        long runId = actionRepository.saveRun("DIAGNOSIS", report.analysisDate,
                JSON.toJSONString(report.agentTrace), JSON.toJSONString(report));
        report.runId = runId;
        stringRedisTemplate.opsForValue().set(LATEST_KEY, JSON.toJSONString(report), Duration.ofDays(7));
        return report;
    }

    public AiFeatureModels.DiagnosisReport latest() {
        String value = stringRedisTemplate.opsForValue().get(LATEST_KEY);
        return value == null ? null : JSON.parseObject(value, AiFeatureModels.DiagnosisReport.class);
    }

    public List<Map<String, Object>> pendingActions() {
        return actionRepository.listPendingActions();
    }

    public String approve(long id) {
        Map<String, Object> action = actionRepository.getAction(id);
        if (action == null) {
            throw new IllegalArgumentException("审批动作不存在");
        }
        if (!"PENDING".equals(action.get("status"))) {
            return "动作当前状态为 " + action.get("status") + "，无需重复执行";
        }
        String type = String.valueOf(action.get("type"));
        Map<String, Object> payload = JSON.parseObject(String.valueOf(action.get("payload_json")), Map.class);
        String result;
        if ("DISABLE_DISH".equals(type)) {
            Long dishId = longValue(payload.get("dishId"));
            Dish dish = dishMapper.getById(dishId);
            if (dish == null) {
                result = "菜品不存在，未执行";
            } else if (Integer.valueOf(0).equals(dish.getStatus())) {
                result = "菜品已经是停售状态";
            } else {
                Dish update = new Dish();
                update.setId(dishId);
                update.setStatus(0);
                dishMapper.update(update);
                result = "已停售菜品：" + dish.getName();
            }
        } else if ("PAUSE_SHOP".equals(type)) {
            redisTemplate.opsForValue().set("SHOP_STATUS", 0);
            result = "店铺已设置为打烊状态";
        } else {
            throw new IllegalArgumentException("不支持的审批动作：" + type);
        }
        actionRepository.updateAction(id, "EXECUTED", result);
        return result;
    }

    public String reject(long id) {
        Map<String, Object> action = actionRepository.getAction(id);
        if (action == null) {
            throw new IllegalArgumentException("审批动作不存在");
        }
        if ("PENDING".equals(action.get("status"))) {
            actionRepository.updateAction(id, "REJECTED", "管理员驳回");
            return "已驳回";
        }
        return "动作当前状态为 " + action.get("status") + "，无需重复处理";
    }

    private void addCancellationAnomaly(AiFeatureModels.DiagnosisReport report, Map<String, Object> current,
                                        Map<String, Object> previous, List<Map<String, Object>> reasons) {
        int total = number(current.get("total_orders"));
        int cancelled = number(current.get("cancelled_orders"));
        int previousTotal = number(previous.get("total_orders"));
        double rate = ratio(cancelled, total);
        double previousRate = ratio(number(previous.get("cancelled_orders")), previousTotal);
        if (total >= 2 && rate >= 0.25 && (previousTotal == 0 || rate > previousRate + 0.1)) {
            AiFeatureModels.Anomaly anomaly = anomaly("ORDER_CANCEL_RATE", "HIGH", "订单取消率异常",
                    String.format("取消率 %.1f%%，共 %d 笔取消订单", rate * 100, cancelled),
                    formatPercent(rate), formatPercent(previousRate),
                    JSON.toJSONString(reasons), estimateImpact(current, cancelled));
            anomaly.suggestion = "先核对取消/拒单原因，若高峰期持续超阈值，可暂时降低接单压力";
            if (total >= 3 && rate >= 0.5) {
                anomaly.actionType = "PAUSE_SHOP";
                anomaly.actionLabel = "设置店铺打烊，停止继续接单";
            }
            report.anomalies.add(anomaly);
        }
    }

    private void addTurnoverAnomaly(AiFeatureModels.DiagnosisReport report, Map<String, Object> current,
                                    Map<String, Object> previous) {
        double turnover = decimal(current.get("turnover"));
        double previousTurnover = decimal(previous.get("turnover"));
        if (previousTurnover > 0 && turnover < previousTurnover * 0.7) {
            AiFeatureModels.Anomaly anomaly = anomaly("TURNOVER", "MEDIUM", "营业额较上一营业日下降",
                    String.format("营业额 %.2f 元，较上一营业日下降 %.1f%%", turnover,
                            (1 - turnover / previousTurnover) * 100),
                    String.format("%.2f 元", turnover), String.format("%.2f 元", previousTurnover),
                    "对比已完成订单 amount，排除未支付与取消订单", BigDecimal.valueOf(previousTurnover - turnover));
            anomaly.suggestion = "结合销量榜和取消原因检查是否存在爆款断供、价格变化或高峰期接单损失";
            report.anomalies.add(anomaly);
        }
    }

    private void addTimingAnomaly(AiFeatureModels.DiagnosisReport report, Map<String, Object> current,
                                  Map<String, Object> previous) {
        double avg = decimal(current.get("avg_prepare_minutes"));
        double previousAvg = decimal(previous.get("avg_prepare_minutes"));
        int overdue = number(current.get("overdue_orders"));
        if (number(current.get("completed_orders")) >= 2 &&
                (avg >= 30 || (previousAvg > 0 && avg > previousAvg * 1.5))) {
            AiFeatureModels.Anomaly anomaly = anomaly("PREPARE_TIME", "HIGH", "出餐耗时异常",
                    String.format("平均出餐耗时 %.1f 分钟", avg), String.format("%.1f 分钟", avg),
                    String.format("%.1f 分钟", previousAvg),
                    "由 order_time 到 checkout_time 计算，当前窗口配送超时单 " + overdue + " 笔",
                    BigDecimal.valueOf(Math.max(0, overdue) * 10L));
            anomaly.suggestion = "下钻销量集中菜品与高峰时段，必要时暂时打烊或下架高负载菜品";
            if (overdue >= 2) {
                anomaly.actionType = "PAUSE_SHOP";
                anomaly.actionLabel = "设置店铺打烊，缓解出餐压力";
            }
            report.anomalies.add(anomaly);
        }
    }

    private void addDormantAnomaly(AiFeatureModels.DiagnosisReport report, List<Map<String, Object>> dormant) {
        if (dormant.size() < 3) {
            return;
        }
        AiFeatureModels.Anomaly anomaly = anomaly("DORMANT_DISH", "LOW", "在售菜品连续 30 天无销量",
                "共有 " + dormant.size() + " 个在售菜品没有已完成订单", dormant.size() + " 个菜品",
                "建议控制在 2 个以内", JSON.toJSONString(dormant), BigDecimal.ZERO);
        anomaly.suggestion = "先停售一个滞销菜品观察菜单结构，审批后才会修改菜品状态";
        Map<String, Object> first = dormant.get(0);
        anomaly.actionType = "DISABLE_DISH";
        anomaly.actionTargetId = longValue(first.get("id"));
        anomaly.actionLabel = "停售：" + first.get("name");
        report.anomalies.add(anomaly);
    }

    private AiFeatureModels.Anomaly anomaly(String metric, String level, String title, String conclusion,
                                            String observed, String baseline, String evidence, BigDecimal impact) {
        AiFeatureModels.Anomaly anomaly = new AiFeatureModels.Anomaly();
        anomaly.metric = metric;
        anomaly.level = level;
        anomaly.title = title;
        anomaly.conclusion = conclusion;
        anomaly.observed = observed;
        anomaly.baseline = baseline;
        anomaly.evidence = evidence;
        anomaly.impactAmount = impact == null ? BigDecimal.ZERO : impact.setScale(2, RoundingMode.HALF_UP);
        return anomaly;
    }

    private AiFeatureModels.ActionProposal createAction(String analysisDate, AiFeatureModels.Anomaly anomaly) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (anomaly.actionTargetId != null) {
            payload.put("dishId", anomaly.actionTargetId);
        }
        payload.put("reason", anomaly.title);
        String dedupeKey = analysisDate + ":" + anomaly.actionType + ":" +
                (anomaly.actionTargetId == null ? "shop" : anomaly.actionTargetId);
        long id = actionRepository.saveAction(dedupeKey, anomaly.actionType, anomaly.actionTargetId,
                JSON.toJSONString(payload), JSON.toJSONString(Collections.singletonMap("evidence", anomaly.evidence)));
        AiFeatureModels.ActionProposal proposal = new AiFeatureModels.ActionProposal();
        proposal.id = id;
        proposal.type = anomaly.actionType;
        proposal.targetId = anomaly.actionTargetId;
        proposal.payload = payload;
        proposal.evidence = anomaly.evidence;
        proposal.status = "PENDING";
        proposal.createdTime = LocalDateTime.now().toString();
        return proposal;
    }

    private void enrichWithAgent(AiFeatureModels.Anomaly anomaly, LocalDate date, LocalDateTime begin,
                                 LocalDateTime end, List<String> trace) {
        if (!aiProperties.isConfigured()) {
            anomaly.rootCause = fallbackRootCause(anomaly);
            trace.add(anomaly.metric + "：未配置模型，使用确定性兜底建议");
            return;
        }
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(message("system", "你是外卖店值班店长。只能基于工具返回的事实解释异常，" +
                "回答两句以内：先说最可能的根因，再说一个可执行建议。不要编造数字。"));
        messages.add(message("user", "分析日期=" + date + "。异常=" + JSON.toJSONString(anomaly) +
                "。请先调用工具下钻证据，再给结论。"));
        for (int i = 0; i < MAX_AGENT_ITERATIONS; i++) {
            try {
                JSONObject response = aiClientUtil.chatCompletion(messages, buildTools());
                JSONObject assistant = aiClientUtil.extractMessage(response);
                JSONArray calls = assistant.getJSONArray("tool_calls");
                if (calls != null && !calls.isEmpty()) {
                    messages.add(JSON.parseObject(assistant.toJSONString(), Map.class));
                    for (Object value : calls) {
                        JSONObject call = (JSONObject) value;
                        JSONObject function = call.getJSONObject("function");
                        String name = function.getString("name");
                        JSONObject args = JSON.parseObject(function.getString("arguments"));
                        String toolResult = executeTool(name, args, begin, end);
                        trace.add(anomaly.metric + " -> " + name);
                        Map<String, Object> toolMessage = message("tool", toolResult);
                        toolMessage.put("tool_call_id", call.getString("id"));
                        messages.add(toolMessage);
                    }
                    continue;
                }
                String content = assistant.getString("content");
                if (content != null && !content.trim().isEmpty()) {
                    anomaly.rootCause = content.trim();
                    trace.add(anomaly.metric + " -> agent 已完成归因");
                    return;
                }
            } catch (Exception e) {
                log.warn("经营诊断 Agent 调用失败，使用兜底结论", e);
                trace.add(anomaly.metric + " -> agent 调用失败");
                break;
            }
        }
        anomaly.rootCause = fallbackRootCause(anomaly);
    }

    private String executeTool(String name, JSONObject args, LocalDateTime begin, LocalDateTime end) {
        if ("query_sales_top".equals(name)) {
            int days = args == null ? 7 : args.getIntValue("days");
            if (days <= 0) days = 7;
            return JSON.toJSONString(analyticsRepository.topSales(end.minusDays(days), end, 10));
        }
        if ("query_cancel_reasons".equals(name)) {
            return JSON.toJSONString(analyticsRepository.cancellationReasons(begin, end));
        }
        if ("query_slow_orders".equals(name)) {
            int minutes = args == null ? 30 : args.getIntValue("minutes");
            return JSON.toJSONString(Collections.singletonMap("slowOrders",
                    analyticsRepository.countSlowOrders(begin, end, minutes <= 0 ? 30 : minutes)));
        }
        return JSON.toJSONString(Collections.singletonMap("error", "未知工具"));
    }

    private JSONArray buildTools() {
        JSONArray tools = new JSONArray();
        tools.add(tool("query_sales_top", "查询指定天数内的已完成订单销量 Top 菜品", "days", "天数，默认 7"));
        tools.add(tool("query_cancel_reasons", "查询当前分析窗口的取消和拒单原因分布"));
        tools.add(tool("query_slow_orders", "查询出餐耗时超过阈值的已完成订单数", "minutes", "耗时阈值，默认 30"));
        return tools;
    }

    private JSONObject tool(String name, String description, String... params) {
        JSONObject function = new JSONObject().fluentPut("name", name).fluentPut("description", description);
        JSONObject properties = new JSONObject();
        for (int i = 0; i + 1 < params.length; i += 2) {
            properties.put(params[i], new JSONObject().fluentPut("type", "integer").fluentPut("description", params[i + 1]));
        }
        function.put("parameters", new JSONObject().fluentPut("type", "object").fluentPut("properties", properties));
        return new JSONObject().fluentPut("type", "function").fluentPut("function", function);
    }

    private Map<String, Object> message(String role, String content) {
        Map<String, Object> message = new HashMap<>();
        message.put("role", role);
        message.put("content", content);
        return message;
    }

    private String fallbackRootCause(AiFeatureModels.Anomaly anomaly) {
        if ("DORMANT_DISH".equals(anomaly.metric)) return "该菜品在观察窗口没有已完成订单，可能是菜单曝光不足或需求弱。";
        if ("PREPARE_TIME".equals(anomaly.metric)) return "出餐时长超过阈值，需重点检查高峰期销量集中菜品与厨房产能。";
        if ("ORDER_CANCEL_RATE".equals(anomaly.metric)) return "取消率明显偏高，建议优先查看取消/拒单原因并降低高峰接单压力。";
        return "营业额下降需要结合销量集中度和订单取消原因进一步排查。";
    }

    private double ratio(int numerator, int denominator) {
        return denominator == 0 ? 0 : (double) numerator / denominator;
    }

    private String formatPercent(double value) {
        return String.format("%.1f%%", value * 100);
    }

    private BigDecimal estimateImpact(Map<String, Object> current, int cancelled) {
        double turnover = decimal(current.get("turnover"));
        int completed = number(current.get("completed_orders"));
        return BigDecimal.valueOf(completed == 0 ? cancelled * 10.0 : turnover / completed * cancelled)
                .setScale(2, RoundingMode.HALF_UP);
    }

    private int number(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }

    private double decimal(Object value) {
        return value == null ? 0 : ((Number) value).doubleValue();
    }

    private Long longValue(Object value) {
        return value == null ? null : Long.valueOf(String.valueOf(value));
    }
}
