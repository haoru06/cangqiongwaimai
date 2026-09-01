package com.sky.ai.query;

import com.alibaba.druid.sql.SQLUtils;
import com.alibaba.druid.sql.ast.SQLStatement;
import com.alibaba.druid.sql.ast.statement.SQLSelectStatement;
import com.alibaba.druid.util.JdbcConstants;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 只读 SQL 沙箱：先解析与白名单校验，再执行查询。 */
@Component
public class AiSqlSandbox {

    private static final int MAX_ROWS = 200;
    private static final Set<String> ALLOWED_TABLES = new HashSet<>(Arrays.asList(
            "orders", "order_detail", "dish", "setmeal", "setmeal_dish", "category", "user", "dish_flavor"));
    private static final Pattern TABLE_PATTERN = Pattern.compile("(?i)\\b(?:from|join)\\s+[`]?([a-z0-9_]+)[`]?\\b");
    private static final Pattern LIMIT_PATTERN = Pattern.compile("(?i)\\blimit\\s+(\\d+)(?:\\s*,\\s*(\\d+))?");
    private static final Pattern FORBIDDEN_PATTERN = Pattern.compile(
            "(?i)(?:--|/\\*|#|\\b(?:insert|update|delete|drop|alter|truncate|create|grant|revoke|call|outfile|infile|into)\\b|\\b(?:phone|address|openid|secret|private_key)\\b)");

    @Autowired
    private DataSource dataSource;

    public ExecutionResult execute(String sql) {
        String safeSql = prepare(sql);
        try (Connection connection = dataSource.getConnection(); PreparedStatement statement = connection.prepareStatement(safeSql)) {
            connection.setReadOnly(true);
            statement.setQueryTimeout(5);
            try (ResultSet resultSet = statement.executeQuery()) {
                List<String> columns = new ArrayList<>();
                for (int i = 1; i <= resultSet.getMetaData().getColumnCount(); i++) {
                    columns.add(resultSet.getMetaData().getColumnLabel(i));
                }
                List<Map<String, Object>> rows = new ArrayList<>();
                while (resultSet.next() && rows.size() < MAX_ROWS) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= columns.size(); i++) {
                        row.put(columns.get(i - 1), resultSet.getObject(i));
                    }
                    rows.add(row);
                }
                return new ExecutionResult(safeSql, columns, rows);
            }
        } catch (SQLException e) {
            throw new IllegalArgumentException("SQL 执行失败：" + e.getMessage(), e);
        }
    }

    public String schemaDescription() {
        StringBuilder schema = new StringBuilder();
        try (Connection connection = dataSource.getConnection();
             ResultSet tables = connection.getMetaData().getTables(connection.getCatalog(), null, "%", new String[]{"TABLE"})) {
            while (tables.next()) {
                String table = tables.getString("TABLE_NAME");
                if (!ALLOWED_TABLES.contains(table)) {
                    continue;
                }
                schema.append(table).append("(");
                try (ResultSet columns = connection.getMetaData().getColumns(connection.getCatalog(), null, table, "%")) {
                    boolean first = true;
                    while (columns.next()) {
                        String column = columns.getString("COLUMN_NAME");
                        if (isSensitive(column)) {
                            continue;
                        }
                        if (!first) {
                            schema.append(", ");
                        }
                        schema.append(column).append(" ").append(columns.getString("TYPE_NAME"));
                        first = false;
                    }
                }
                schema.append(");\n");
            }
            return schema.toString();
        } catch (SQLException e) {
            throw new IllegalStateException("数据库结构读取失败", e);
        }
    }

    String prepare(String sql) {
        if (sql == null || sql.trim().isEmpty()) {
            throw new IllegalArgumentException("SQL 不能为空");
        }
        String normalized = sql.trim();
        if (normalized.endsWith(";")) {
            normalized = normalized.substring(0, normalized.length() - 1).trim();
        }
        if (normalized.indexOf(';') >= 0) {
            throw new IllegalArgumentException("只允许执行一条 SQL");
        }
        if (FORBIDDEN_PATTERN.matcher(normalized).find()) {
            throw new IllegalArgumentException("SQL 包含非只读或敏感字段操作");
        }
        List<SQLStatement> statements;
        try {
            statements = SQLUtils.parseStatements(normalized, JdbcConstants.MYSQL);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("SQL 语法解析失败：" + e.getMessage(), e);
        }
        if (statements.size() != 1 || !(statements.get(0) instanceof SQLSelectStatement)) {
            throw new IllegalArgumentException("只允许执行单条 SELECT 查询");
        }
        Matcher tableMatcher = TABLE_PATTERN.matcher(normalized);
        while (tableMatcher.find()) {
            String table = tableMatcher.group(1).toLowerCase();
            if (!ALLOWED_TABLES.contains(table)) {
                throw new IllegalArgumentException("表不在查询白名单中：" + table);
            }
        }
        Matcher limitMatcher = LIMIT_PATTERN.matcher(normalized);
        if (limitMatcher.find()) {
            String offset = limitMatcher.group(2);
            int count = Integer.parseInt(offset == null ? limitMatcher.group(1) : offset);
            if (count > MAX_ROWS) {
                throw new IllegalArgumentException("查询结果不能超过 " + MAX_ROWS + " 行");
            }
            return normalized;
        }
        return normalized + " limit " + MAX_ROWS;
    }

    private boolean isSensitive(String column) {
        return column != null && Pattern.compile("(?i)phone|address|openid|secret|private_key").matcher(column).find();
    }

    public static class ExecutionResult {
        public final String sql;
        public final List<String> columns;
        public final List<Map<String, Object>> rows;

        public ExecutionResult(String sql, List<String> columns, List<Map<String, Object>> rows) {
            this.sql = sql;
            this.columns = columns;
            this.rows = rows;
        }
    }
}
