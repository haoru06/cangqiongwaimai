package com.sky.controller.admin;

import com.sky.dto.AiAgentChatDTO;
import com.sky.dto.AiCopywritingDTO;
import com.sky.result.Result;
import com.sky.service.AiAgentService;
import com.sky.vo.AiAgentChatVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 智能助手
 */
@RestController
@RequestMapping("/admin/ai")
@Slf4j
@Api(tags = "AI 智能助手相关接口")
public class AiAgentController {

    @Autowired
    private AiAgentService aiAgentService;

    /**
     * 智能助手对话（支持多轮，Agent 会按需调用店内工具）
     *
     * @param aiAgentChatDTO 会话 id 与用户输入
     * @return 助手回复与工具调用轨迹
     */
    @PostMapping("/agent/chat")
    @ApiOperation("智能助手对话")
    public Result<AiAgentChatVO> chat(@RequestBody AiAgentChatDTO aiAgentChatDTO) {
        log.info("智能助手对话：{}", aiAgentChatDTO.getMessage());
        return Result.success(aiAgentService.chat(aiAgentChatDTO));
    }

    /**
     * 为菜品生成 AI 售卖文案
     *
     * @param aiCopywritingDTO 菜品 id
     * @return 生成的文案
     */
    @PostMapping("/dish/copywriting")
    @ApiOperation("AI 菜品文案生成")
    public Result<String> copywriting(@RequestBody AiCopywritingDTO aiCopywritingDTO) {
        log.info("AI 菜品文案生成：{}", aiCopywritingDTO);
        String text = aiAgentService.generateDishCopywriting(aiCopywritingDTO);
        return text == null ? Result.error("菜品不存在") : Result.success(text);
    }
}
