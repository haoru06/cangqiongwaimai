package com.sky.ai.diagnosis;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 每天在午晚高峰后自动生成一份经营诊断；管理员也可通过接口立即触发。 */
@Component
@Slf4j
public class AiDiagnosisTask {

    @Autowired
    private AiDiagnosisService diagnosisService;

    @Scheduled(cron = "0 0 14,21 * * ?")
    public void runAfterPeak() {
        try {
            diagnosisService.run();
            log.info("AI 经营诊断定时巡检完成");
        } catch (Exception e) {
            log.error("AI 经营诊断定时巡检失败", e);
        }
    }
}
