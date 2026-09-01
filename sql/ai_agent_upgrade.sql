-- AI 运营能力独立表。应用启动时也会执行 CREATE TABLE IF NOT EXISTS 兜底。
CREATE TABLE IF NOT EXISTS ai_action_proposal (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dedupe_key VARCHAR(200) NOT NULL UNIQUE COMMENT '同一分析日同一动作幂等键',
    type VARCHAR(40) NOT NULL COMMENT 'DISABLE_DISH / PAUSE_SHOP',
    target_id BIGINT NULL COMMENT '动作目标，例如菜品 id',
    payload_json LONGTEXT NOT NULL,
    evidence_json LONGTEXT NULL,
    status VARCHAR(20) NOT NULL COMMENT 'PENDING / REJECTED / EXECUTED',
    result_text VARCHAR(500) NULL,
    created_time DATETIME NOT NULL,
    updated_time DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 建议动作审批记录';

CREATE TABLE IF NOT EXISTS ai_agent_run (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    run_type VARCHAR(40) NOT NULL COMMENT 'DIAGNOSIS / NL_QUERY',
    analysis_date VARCHAR(20) NULL,
    trace_json LONGTEXT NULL,
    result_json LONGTEXT NULL,
    created_time DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI Agent 运行轨迹';
