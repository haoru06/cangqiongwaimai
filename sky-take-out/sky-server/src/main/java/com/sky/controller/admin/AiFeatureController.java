package com.sky.controller.admin;

import com.sky.ai.AiFeatureModels;
import com.sky.ai.diagnosis.AiDiagnosisService;
import com.sky.ai.query.AiQueryService;
import com.sky.result.Result;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** AI 值班店长与自然语言取数接口。 */
@RestController
@RequestMapping("/admin/ai")
@Api(tags = "AI 运营能力相关接口")
@Slf4j
public class AiFeatureController {

    @Autowired
    private AiDiagnosisService diagnosisService;
    @Autowired
    private AiQueryService queryService;

    @PostMapping("/diagnosis/run")
    @ApiOperation("立即执行经营异常巡检")
    public Result<AiFeatureModels.DiagnosisReport> runDiagnosis() {
        return Result.success(diagnosisService.run());
    }

    @GetMapping("/diagnosis/latest")
    @ApiOperation("查询最近一次经营诊断")
    public Result<AiFeatureModels.DiagnosisReport> latestDiagnosis() {
        return Result.success(diagnosisService.latest());
    }

    @GetMapping("/actions/pending")
    @ApiOperation("查询待审批 AI 动作")
    public Result<List<Map<String, Object>>> pendingActions() {
        return Result.success(diagnosisService.pendingActions());
    }

    @PostMapping("/actions/{id}/approve")
    @ApiOperation("批准并执行 AI 动作")
    public Result<String> approve(@PathVariable Long id) {
        try {
            return Result.success(diagnosisService.approve(id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/actions/{id}/reject")
    @ApiOperation("驳回 AI 动作")
    public Result<String> reject(@PathVariable Long id) {
        try {
            return Result.success(diagnosisService.reject(id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/query")
    @ApiOperation("自然语言查询经营数据")
    public Result<AiFeatureModels.QueryResult> query(@RequestBody AiFeatureModels.QueryRequest request) {
        return Result.success(queryService.query(request));
    }
}
