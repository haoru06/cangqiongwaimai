package com.sky.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * AI 文案生成 DTO
 */
@Data
public class AiCopywritingDTO implements Serializable {

    /**
     * 菜品 id
     */
    private Long dishId;
}
