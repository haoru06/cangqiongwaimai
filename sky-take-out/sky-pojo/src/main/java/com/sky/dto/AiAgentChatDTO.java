package com.sky.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 智能助手对话 DTO
 */
@Data
public class AiAgentChatDTO implements Serializable {

    /**
     * 会话 id，用于多轮对话上下文隔离，不传则使用默认会话
     */
    private String sessionId;

    /**
     * 用户本轮输入
     */
    private String message;
}
