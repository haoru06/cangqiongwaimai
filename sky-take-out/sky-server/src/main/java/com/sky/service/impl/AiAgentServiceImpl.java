package com.sky.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.sky.dto.AiAgentChatDTO;
import com.sky.dto.AiCopywritingDTO;
import com.sky.dto.GoodsSalesDTO;
import com.sky.entity.Dish;
import com.sky.entity.Orders;
import com.sky.mapper.DishMapper;
import com.sky.mapper.OrderMapper;
import com.sky.properties.AiProperties;
import com.sky.service.AiAgentService;
import com.sky.service.WorkspaceService;
import com.sky.utils.AiClientUtil;
import com.sky.vo.AiAgentChatVO;
import com.sky.vo.BusinessDataVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * AI 智能助手服务实现
 * <p>
 * Agent 核心是一个「模型 ↔ 工具」循环（ReAct 思想）：
 * 1. 把系统提示词 + 历史对话 + 用户问题发给大模型，并附上可用工具（function calling）定义；
 * 2. 若模型返回 tool_calls，则在服务端执行对应业务工具（复用既有 Mapper/Service），
 * 把结果以 role=tool 消息回填，再次请求模型；
 * 3. 循环直到模型给出自然语言最终回答，或达到最大轮次；
 * 4. 多轮上下文存放在 Redis（按 sessionId 隔离）。
 */
@Service
@Slf4j
public class AiAgentServiceImpl implements AiAgentService {

    /** 多轮对话上下文在 Redis 中的 key 前缀 */
    private static final String HISTORY_KEY_PREFIX = "ai:agent:history:";

    /** 单个会话保留的最大历史条数（一条=一条 user/assistant 消息） */
    private static final int MAX_HISTORY = 20;

    /** 单次提问允许的最大「工具调用轮次」，防止死循环 */
    private static final int MAX_ITERATIONS = 6;

    @Autowired
    private AiClientUtil aiClientUtil;
    @Autowired
    private AiProperties aiProperties;
    @Autowired
    private WorkspaceService workspaceService;
    @Autowired
    private OrderMapper orderMapper;
    @Autowired
    private DishMapper dishMapper;
    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    @Override
    public AiAgentChatVO chat(AiAgentChatDTO aiAgentChatDTO) {
        String sessionId = aiAgentChatDTO.getSessionId() == null || aiAgentChatDTO.getSessionId().isBlank()
                ? "default" : aiAgentChatDTO.getSessionId();

        // AI 能力未配置时给出友好提示，保证接口可用性
        if (!aiProperties.isConfigured()) {
            return AiAgentChatVO.builder()
                    .reply("管理员还未配置 AI 服务（application-dev.yml 中 sky.ai.api-key），智能助手暂不可用，请先在配置文件中填入大模型 API Key。")
                    .toolTrace(Collections.emptyList())
                    .build();
        }

        String historyKey = HISTORY_KEY_PREFIX + sessionId;
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(buildMessage("system", SYSTEM_PROMPT));
        // 载入历史上下文
        List<String> history = stringRedisTemplate.opsForList().range(historyKey, -MAX_HISTORY, -1);
        if (history != null) {
            history.forEach(h -> messages.add(JSON.parseObject(h)));
        }
        Map<String, Object> userMessage = buildMessage("user", aiAgentChatDTO.getMessage());
        messages.add(userMessage);

        List<String> toolTrace = new ArrayList<>();
        String reply;
        try {
            reply = runAgentLoop(messages, toolTrace);
        } catch (IOException e) {
            log.error("AI 接口调用失败", e);
            return AiAgentChatVO.builder()
                    .reply("AI 服务暂时不可用，请稍后再试。")
                    .toolTrace(toolTrace)
                    .build();
        }

        // 持久化本轮对话，供下一轮使用
        stringRedisTemplate.opsForList().rightPush(historyKey, JSON.toJSONString(userMessage));
        Map<String, Object> assistantMessage = buildMessage("assistant", reply);
        stringRedisTemplate.opsForList().rightPush(historyKey, JSON.toJSONString(assistantMessage));
        stringRedisTemplate.opsForList().trim(historyKey, -MAX_HISTORY, -1);
        stringRedisTemplate.expire(historyKey, java.time.Duration.ofHours(2));

        return AiAgentChatVO.builder().reply(reply).toolTrace(toolTrace).build();
    }

    @Override
    public String generateDishCopywriting(AiCopywritingDTO aiCopywritingDTO) {
        if (!aiProperties.isConfigured()) {
            return "AI 服务未配置：请在 application-dev.yml 的 sky.ai.api-key 中填入大模型 API Key 后重启服务";
        }
        Dish dish = dishMapper.getById(aiCopywritingDTO.getDishId());
        if (dish == null) {
            return null;
        }
        String prompt = "你是一名外卖行业的资深文案策划。请为以下菜品写一条 30 字以内的中文售卖文案，"
                + "突出食材、口味与性价比，直接输出文案本身，不要任何解释或引号。"
                + "菜名：" + dish.getName() + "，价格：" + dish.getPrice() + " 元。";
        if (dish.getDescription() != null && !dish.getDescription().isBlank()) {
            prompt += "现有简介（可参考改写）：" + dish.getDescription();
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(buildMessage("user", prompt));
        try {
            JSONObject response = aiClientUtil.chatCompletion(messages, null);
            return aiClientUtil.extractMessage(response).getString("content");
        } catch (IOException e) {
            log.error("AI 文案生成失败", e);
            return null;
        }
    }

    /**
     * Agent 主循环：模型给出 tool_calls 则执行并回填结果，直到产生最终回答
     */
    private String runAgentLoop(List<Map<String, Object>> messages, List<String> toolTrace) throws IOException {
        JSONArray tools = buildToolDefinitions();
        for (int i = 0; i < MAX_ITERATIONS; i++) {
            JSONObject response = aiClientUtil.chatCompletion(messages, tools);
            JSONObject assistantMessage = aiClientUtil.extractMessage(response);
            JSONArray toolCalls = assistantMessage.getJSONArray("tool_calls");

            if (toolCalls == null || toolCalls.isEmpty()) {
                String content = assistantMessage.getString("content");
                return content == null || content.isBlank() ? "（模型未返回内容）" : content;
            }

            // 模型请求调用工具：把助手的 tool_calls 消息原样加入上下文
            messages.add(assistantMessage);
            for (int j = 0; j < toolCalls.size(); j++) {
                JSONObject toolCall = toolCalls.getJSONObject(j);
                JSONObject function = toolCall.getJSONObject("function");
                String name = function.getString("name");
                JSONObject args = JSON.parseObject(function.getString("arguments"));

                String result;
                try {
                    result = executeTool(name, args);
                } catch (Exception e) {
                    log.error("工具 {} 执行失败", name, e);
                    result = "{\"error\": \"工具执行失败: " + e.getMessage() + "\"}";
                }
                toolTrace.add(name + "(" + args.toJSONString() + ") -> "
                        + (result.length() > 300 ? result.substring(0, 300) + "..." : result));

                // 工具结果以 role=tool 回填，tool_call_id 必须与请求一一对应
                Map<String, Object> toolMessage = new java.util.HashMap<>();
                toolMessage.put("role", "tool");
                toolMessage.put("tool_call_id", toolCall.getString("id"));
                toolMessage.put("content", result);
                messages.add(toolMessage);
            }
        }
        return "这个问题涉及的数据查询轮次较多，请尝试拆分成更小的问题。";
    }

    /**
     * 执行具体工具：全部复用现有业务层，不做任何新的数据逻辑
     */
    private String executeTool(String name, JSONObject args) {
        LocalDate today = LocalDate.now();
        switch (name) {
            case "query_today_business_data": {
                BusinessDataVO vo = workspaceService.getBusinessData(
                        LocalDateTime.now().with(LocalTime.MIN),
                        LocalDateTime.now().with(LocalTime.MAX));
                return JSON.toJSONString(vo);
            }
            case "query_sales_top10": {
                List<GoodsSalesDTO> top10 = orderMapper.getSalesTop10(
                        today.minusDays(29).atStartOfDay(), LocalDateTime.now());
                return JSON.toJSONString(top10.stream()
                        .map(g -> g.getName() + " x" + g.getNumber())
                        .collect(Collectors.toList()));
            }
            case "search_dishes": {
                Dish cond = new Dish();
                cond.setName(args.getString("keyword"));
                List<Dish> dishes = dishMapper.list(cond);
                return JSON.toJSONString(dishes.stream()
                        .map(d -> new JSONObject()
                                .fluentPut("id", d.getId())
                                .fluentPut("name", d.getName())
                                .fluentPut("price", d.getPrice())
                                .fluentPut("status", d.getStatus() == null ? null :
                                        (d.getStatus() == 1 ? "在售" : "停售"))
                                .fluentPut("description", d.getDescription()))
                        .collect(Collectors.toList()));
            }
            case "query_today_order_statistics": {
                LocalDateTime begin = today.atStartOfDay();
                LocalDateTime end = today.atTime(LocalTime.MAX);
                Integer total = orderMapper.countByMap(buildCountMap(begin, end, null));
                Integer completed = orderMapper.countByMap(buildCountMap(begin, end, Orders.COMPLETED));
                Integer cancelled = orderMapper.countByMap(buildCountMap(begin, end, Orders.CANCELLED));
                return JSON.toJSONString(new JSONObject()
                        .fluentPut("total", total)
                        .fluentPut("completed", completed)
                        .fluentPut("cancelled", cancelled));
            }
            default:
                return "{\"error\": \"未知工具: " + name + "\"}";
        }
    }

    private Map buildCountMap(LocalDateTime begin, LocalDateTime end, Integer status) {
        Map map = new java.util.HashMap();
        map.put("begin", begin);
        map.put("end", end);
        if (status != null) {
            map.put("status", status);
        }
        return map;
    }

    /**
     * 工具定义（OpenAI function calling 格式），描述越清晰模型选择越准确
     */
    private JSONArray buildToolDefinitions() {
        JSONArray tools = new JSONArray();
        tools.add(tool("query_today_business_data", "查询本店今日经营数据：营业额、有效订单数、订单完成率、平均客单价、新增用户数"));
        tools.add(tool("query_sales_top10", "查询近 30 天菜品销量 Top10 榜单"));
        tools.add(tool("search_dishes", "按关键词搜索店内菜品，返回名称、价格、在售状态与简介",
                new String[]{"keyword"}, new String[]{"菜品关键词，如「宫保鸡丁」"}));
        tools.add(tool("query_today_order_statistics", "查询今日订单总数、已完成数、已取消数"));
        return tools;
    }

    private JSONObject tool(String name, String description) {
        return tool(name, description, new String[0], new String[0]);
    }

    private JSONObject tool(String name, String description, String[] paramNames, String[] paramDescs) {
        JSONObject function = new JSONObject()
                .fluentPut("name", name)
                .fluentPut("description", description);
        JSONObject properties = new JSONObject();
        for (int i = 0; i < paramNames.length; i++) {
            properties.put(paramNames[i], new JSONObject()
                    .fluentPut("type", "string")
                    .fluentPut("description", paramDescs[i]));
        }
        function.put("parameters", new JSONObject()
                .fluentPut("type", "object")
                .fluentPut("properties", properties));
        if (paramNames.length > 0) {
            function.put("required", paramNames);
        }
        return new JSONObject().fluentPut("type", "function").fluentPut("function", function);
    }

    private Map<String, Object> buildMessage(String role, String content) {
        Map<String, Object> message = new java.util.HashMap<>();
        message.put("role", role);
        message.put("content", content);
        return message;
    }

    /**
     * 系统提示词：约束 Agent 的角色、工具使用原则与回答风格
     */
    private static final String SYSTEM_PROMPT =
            "你是「苍穹外卖」店铺的智能运营助手，服务对象是店铺管理员。"
                    + "你可以调用工具查询实时经营数据（今日营业数据、销量 Top10、菜品信息、订单统计）。"
                    + "规则：1. 当问题涉及经营数据、菜品、订单时必须先调用相关工具，不要凭空编造数字；"
                    + "2. 数据回答需给出简短结论或建议，例如根据销量榜单提出菜品优化建议；"
                    + "3. 与店铺无关的问题请礼貌引导回经营话题；4. 全程使用简体中文，回答简洁。";
}
