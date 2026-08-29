package com.sky.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

/**
 * 智能助手对话 VO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class AiAgentChatVO implements Serializable {

    /**
     * 助手最终回复内容
     */
    private String reply;

    /**
     * 本轮对话中 Agent 执行工具的轨迹，如 "query_today_business_data() -> {...}"
     */
    private List<String> toolTrace;
}
