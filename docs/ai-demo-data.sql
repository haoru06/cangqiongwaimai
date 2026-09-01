-- 可选演示数据：在已有业务数据之外补一组可触发诊断的取消订单。
-- 使用前请确认 user_id、address_book_id 在当前数据库中存在。
INSERT INTO orders
(number,status,user_id,address_book_id,order_time,pay_method,pay_status,amount,remark,phone,address,consignee,
 cancel_reason,cancel_time,delivery_status,tableware_status)
VALUES
('AI-DEMO-001',6,1,1,'2026-05-20 18:10:00',1,1,39.00,'', '13800000000','演示地址','演示用户','高峰期出餐慢','2026-05-20 18:35:00',1,1),
('AI-DEMO-002',6,1,1,'2026-05-20 18:20:00',1,1,49.00,'', '13800000000','演示地址','演示用户','商家暂时没货','2026-05-20 18:40:00',1,1),
('AI-DEMO-003',6,1,1,'2026-05-20 18:30:00',1,1,29.00,'', '13800000000','演示地址','演示用户','配送等待时间太长','2026-05-20 18:50:00',1,1);
