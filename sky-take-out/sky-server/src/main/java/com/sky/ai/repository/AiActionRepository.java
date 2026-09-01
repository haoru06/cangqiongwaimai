package com.sky.ai.repository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import javax.annotation.PostConstruct;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** AI 审批动作与 Agent 运行轨迹的最小持久化仓库。 */
@Repository
@Slf4j
public class AiActionRepository {

    @Autowired
    private DataSource dataSource;

    @PostConstruct
    public void ensureTables() {
        String actionSql = "create table if not exists ai_action_proposal ("
                + "id bigint primary key auto_increment,"
                + "dedupe_key varchar(200) not null unique,"
                + "type varchar(40) not null,"
                + "target_id bigint null,"
                + "payload_json longtext not null,"
                + "evidence_json longtext null,"
                + "status varchar(20) not null,"
                + "result_text varchar(500) null,"
                + "created_time datetime not null,"
                + "updated_time datetime not null"
                + ") engine=InnoDB default charset=utf8mb4";
        String runSql = "create table if not exists ai_agent_run ("
                + "id bigint primary key auto_increment,"
                + "run_type varchar(40) not null,"
                + "analysis_date varchar(20) null,"
                + "trace_json longtext null,"
                + "result_json longtext null,"
                + "created_time datetime not null"
                + ") engine=InnoDB default charset=utf8mb4";
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.executeUpdate(actionSql);
            statement.executeUpdate(runSql);
        } catch (SQLException e) {
            log.warn("AI 表自动初始化失败，请执行 sql/ai_agent_upgrade.sql", e);
        }
    }

    public long saveAction(String dedupeKey, String type, Long targetId, String payloadJson, String evidenceJson) {
        String findSql = "select id from ai_action_proposal where dedupe_key = ?";
        String insertSql = "insert into ai_action_proposal "
                + "(dedupe_key,type,target_id,payload_json,evidence_json,status,created_time,updated_time) "
                + "values (?,?,?,?,?,'PENDING',?,?)";
        try (Connection connection = dataSource.getConnection();
             PreparedStatement find = connection.prepareStatement(findSql)) {
            find.setString(1, dedupeKey);
            try (ResultSet resultSet = find.executeQuery()) {
                if (resultSet.next()) {
                    return resultSet.getLong(1);
                }
            }
            try (PreparedStatement insert = connection.prepareStatement(insertSql, Statement.RETURN_GENERATED_KEYS)) {
                Timestamp now = Timestamp.valueOf(LocalDateTime.now());
                insert.setString(1, dedupeKey);
                insert.setString(2, type);
                if (targetId == null) {
                    insert.setObject(3, null);
                } else {
                    insert.setLong(3, targetId);
                }
                insert.setString(4, payloadJson);
                insert.setString(5, evidenceJson);
                insert.setTimestamp(6, now);
                insert.setTimestamp(7, now);
                insert.executeUpdate();
                try (ResultSet keys = insert.getGeneratedKeys()) {
                    if (keys.next()) {
                        return keys.getLong(1);
                    }
                }
            }
            throw new IllegalStateException("AI 审批动作创建失败");
        } catch (SQLException e) {
            throw new IllegalStateException("AI 审批动作持久化失败", e);
        }
    }

    public List<Map<String, Object>> listPendingActions() {
        return query("select id,type,target_id,payload_json,evidence_json,status,result_text,created_time "
                + "from ai_action_proposal where status='PENDING' order by created_time desc");
    }

    public Map<String, Object> getAction(long id) {
        List<Map<String, Object>> rows = query("select id,type,target_id,payload_json,evidence_json,status,result_text,created_time "
                + "from ai_action_proposal where id=" + id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void updateAction(long id, String status, String result) {
        String sql = "update ai_action_proposal set status=?,result_text=?,updated_time=? where id=?";
        try (Connection connection = dataSource.getConnection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, status);
            statement.setString(2, result);
            statement.setTimestamp(3, Timestamp.valueOf(LocalDateTime.now()));
            statement.setLong(4, id);
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("AI 审批动作更新失败", e);
        }
    }

    public long saveRun(String type, String analysisDate, String traceJson, String resultJson) {
        String sql = "insert into ai_agent_run(run_type,analysis_date,trace_json,result_json,created_time) values(?,?,?,?,?)";
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            statement.setString(1, type);
            statement.setString(2, analysisDate);
            statement.setString(3, traceJson);
            statement.setString(4, resultJson);
            statement.setTimestamp(5, Timestamp.valueOf(LocalDateTime.now()));
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                if (keys.next()) {
                    return keys.getLong(1);
                }
            }
            return 0L;
        } catch (SQLException e) {
            throw new IllegalStateException("AI 运行轨迹保存失败", e);
        }
    }

    private List<Map<String, Object>> query(String sql) {
        List<Map<String, Object>> rows = new ArrayList<>();
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            int columnCount = resultSet.getMetaData().getColumnCount();
            while (resultSet.next()) {
                Map<String, Object> row = new LinkedHashMap<>();
                for (int i = 1; i <= columnCount; i++) {
                    row.put(resultSet.getMetaData().getColumnLabel(i), resultSet.getObject(i));
                }
                rows.add(row);
            }
            return rows;
        } catch (SQLException e) {
            throw new IllegalStateException("AI 数据读取失败", e);
        }
    }
}
