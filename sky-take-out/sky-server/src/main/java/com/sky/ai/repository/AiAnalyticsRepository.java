package com.sky.ai.repository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 固定、可审计的经营分析 SQL。LLM 不参与这些数字的计算。 */
@Repository
public class AiAnalyticsRepository {

    @Autowired
    private DataSource dataSource;

    public LocalDateTime latestOrderTime() {
        List<Map<String, Object>> rows = query("select max(order_time) latest_order_time from orders");
        Object value = rows.isEmpty() ? null : rows.get(0).get("latest_order_time");
        if (value instanceof java.sql.Timestamp) {
            return ((Timestamp) value).toLocalDateTime();
        }
        return value instanceof LocalDateTime ? (LocalDateTime) value : null;
    }

    public Map<String, Object> queryKpi(LocalDateTime begin, LocalDateTime end) {
        String sql = "select count(*) total_orders,"
                + "sum(case when status=5 then 1 else 0 end) completed_orders,"
                + "sum(case when status=6 then 1 else 0 end) cancelled_orders,"
                + "coalesce(sum(case when status=5 then amount else 0 end),0) turnover,"
                + "coalesce(avg(case when status=5 and checkout_time is not null "
                + "then timestampdiff(minute,order_time,checkout_time) end),0) avg_prepare_minutes,"
                + "sum(case when status=5 and estimated_delivery_time is not null and delivery_time is not null "
                + "and delivery_time > estimated_delivery_time then 1 else 0 end) overdue_orders "
                + "from orders where order_time>=? and order_time<=?";
        return first(query(sql, begin, end));
    }

    public int countSlowOrders(LocalDateTime begin, LocalDateTime end, int minMinutes) {
        String sql = "select count(*) slow_orders from orders where status=5 and checkout_time is not null "
                + "and order_time>=? and order_time<=? and timestampdiff(minute,order_time,checkout_time)>=?";
        return number(first(query(sql, begin, end, minMinutes)).get("slow_orders"));
    }

    public List<Map<String, Object>> topSales(LocalDateTime begin, LocalDateTime end, int limit) {
        String sql = "select od.name, sum(od.number) number, sum(od.amount) amount "
                + "from order_detail od join orders o on od.order_id=o.id "
                + "where o.status=5 and o.order_time>=? and o.order_time<=? "
                + "group by od.name order by number desc limit " + Math.max(1, Math.min(limit, 20));
        return query(sql, begin, end);
    }

    public List<Map<String, Object>> cancellationReasons(LocalDateTime begin, LocalDateTime end) {
        String sql = "select coalesce(nullif(rejection_reason,''),nullif(cancel_reason,''),'未填写') reason,count(*) number "
                + "from orders where status=6 and order_time>=? and order_time<=? "
                + "group by reason order by number desc limit 10";
        return query(sql, begin, end);
    }

    public List<Map<String, Object>> dormantDishes(LocalDateTime begin, LocalDateTime end) {
        String sql = "select d.id,d.name from dish d left join ("
                + "select od.dish_id from order_detail od join orders o on od.order_id=o.id "
                + "where o.status=5 and o.order_time>=? and o.order_time<=? and od.dish_id is not null "
                + "group by od.dish_id) sold on sold.dish_id=d.id "
                + "where d.status=1 and sold.dish_id is null order by d.id limit 20";
        return query(sql, begin, end);
    }

    private Map<String, Object> first(List<Map<String, Object>> rows) {
        return rows.isEmpty() ? new LinkedHashMap<>() : rows.get(0);
    }

    private int number(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }

    private List<Map<String, Object>> query(String sql, Object... params) {
        List<Map<String, Object>> rows = new ArrayList<>();
        try (Connection connection = dataSource.getConnection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                Object param = params[i];
                if (param instanceof LocalDateTime) {
                    statement.setTimestamp(i + 1, Timestamp.valueOf((LocalDateTime) param));
                } else {
                    statement.setObject(i + 1, param);
                }
            }
            try (ResultSet resultSet = statement.executeQuery()) {
                int columnCount = resultSet.getMetaData().getColumnCount();
                while (resultSet.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= columnCount; i++) {
                        row.put(resultSet.getMetaData().getColumnLabel(i), resultSet.getObject(i));
                    }
                    rows.add(row);
                }
            }
            return rows;
        } catch (SQLException e) {
            throw new IllegalStateException("经营分析查询失败", e);
        }
    }
}
