package com.sky.service;

import com.sky.dto.AiAgentChatDTO;
import com.sky.dto.AiCopywritingDTO;
import com.sky.vo.AiAgentChatVO;

/**
 * AI 智能助手服务接口
 */
public interface AiAgentService {

    /**
     * 智能助手多轮对话：大模型根据用户问题自主决定是否调用店内工具（营业数据、销量 Top10、
     * 菜品检索、订单统计），工具结果回填后由模型汇总成最终回答
     *
     * @param aiAgentChatDTO 用户输入与会话 id
     * @return 助手回复及本轮工具调用轨迹
     */
    AiAgentChatVO chat(AiAgentChatDTO aiAgentChatDTO);

    /**
     * 为指定菜品生成一条 AI 售卖文案
     *
     * @param aiCopywritingDTO 包含菜品 id
     * @return 生成的文案
     */
    String generateDishCopywriting(AiCopywritingDTO aiCopywritingDTO);
}
