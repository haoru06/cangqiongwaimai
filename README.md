# 苍穹外卖 (Sky Take-out)

基于 Spring Boot 的外卖点餐系统，包含管理端（Web）与用户端（小程序/Web）完整业务：员工登录、菜品/套餐管理、订单全流程（下单 → 支付 → 接单 → 派送 → 完成）、营业数据统计报表、WebSocket 来单提醒等。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 后端框架 | Spring Boot 2.7.3、Spring MVC、MyBatis、Spring Data Redis、Spring Cache、Spring Task、WebSocket |
| 数据存储 | MySQL 8.0、Redis |
| 中间件/工具 | Druid 连接池、PageHelper 分页、JWT（jjwt）、Apache POI（Excel 报表）、Knife4j（接口文档）、Lombok |
| 前端 | 管理端 Vue 打包产物（`qianduan/nginx-1.20.2/html/sky`），由 Nginx 托管并反向代理 |
| 第三方 | 阿里云 OSS（图片存储）、微信支付/登录（可选）、百度地图（地址解析，可选） |

## 目录结构

```
├── sql/sky_take_out.sql          # 建库建表 + 种子数据（导入即可用）
├── sky-take-out/                 # 后端 Maven 多模块工程
│   ├── sky-common/               # 公共模块：工具类、常量、异常、属性配置
│   ├── sky-pojo/                 # 实体 Entity / DTO / VO
│   └── sky-server/               # 服务模块：Controller / Service / Mapper / 配置 / 定时任务
├── qianduan/nginx-1.20.2/        # 管理端前端 + Nginx（80 端口，/api/ 反代到 8080）
└── WALKTHROUGH.md                # 项目讲解文档
```

## 环境要求

- JDK 17+（在 `sky-take-out/pom.xml` 中已将 `java.version` 设为 17）
- Maven 3.6+
- MySQL 8.0
- Redis（Windows 可用 tporadowski/redis 或 Memurai）

## 快速启动

### 1. 初始化数据库

```bash
mysql -uroot -p < sql/sky_take_out.sql
```

脚本会创建数据库 `sky_take_out`、11 张表并写入种子数据（员工、分类、菜品、套餐、订单等）。

### 2. 修改后端配置

编辑 `sky-take-out/sky-server/src/main/resources/application-dev.yml`：

- `sky.datasource.username/password`：改成你的 MySQL 账号密码
- `sky.redis.password`：改成你的 Redis 密码（未设密码可留空）
- `sky.alioss.*`：上传图片需要阿里云 OSS 密钥（没有 OSS 时除图片上传外的功能均可正常使用）
- `sky.wechat.*`：微信支付为演示配置，真实支付需替换为自己的商户参数

### 3. 启动后端

```bash
cd sky-take-out
mvn package -DskipTests
java -jar sky-server/target/sky-server-1.0-SNAPSHOT.jar
```

启动成功后：

- 后端地址：http://localhost:8080
- 接口文档（Knife4j）：http://localhost:8080/doc.html
- 管理端默认账号：`admin` / `123456`

### 4. 启动前端（可选）

```bash
cd qianduan/nginx-1.20.2
nginx.exe
```

访问 http://localhost 即为管理端登录页，Nginx 已配置：

- `/api/  → http://localhost:8080/admin/`
- `/user/ → http://localhost:8080/user/`
- `/ws/   → WebSocket 来单提醒`

## AI 运营能力（Agent 功能）

AI 能力集中在 `com.sky.ai` 新包中，接口文档见 Knife4j 的「AI 运营能力相关接口」分组。原来的聊天助手和菜品文案接口已删除。

### 1. AI 值班店长：经营异常巡检 Agent

管理员可以点 `POST /admin/ai/diagnosis/run` 立即巡检，系统也会在每天 14:00、21:00 自动执行。诊断先用固定 SQL 计算订单取消率、营业额、出餐耗时、配送超时和滞销菜品，再由 Agent 按异常下钻销量、取消原因和慢单证据。

每条异常包含观测值、历史基线、影响金额、证据和建议动作。可能的动作会进入 `ai_action_proposal` 待审批表，管理员确认后才允许执行：

```text
GET  /admin/ai/diagnosis/latest
GET  /admin/ai/actions/pending
POST /admin/ai/actions/{id}/approve
POST /admin/ai/actions/{id}/reject
```

当前动作白名单为 `DISABLE_DISH` 和 `PAUSE_SHOP`。审批执行使用原有菜品和店铺业务入口，并且按 `analysisDate + actionType + targetId` 做幂等，Agent 没有直接写数据库的权限。每次运行的工具轨迹保存到 `ai_agent_run`。

### 2. 自然语言取数 Agent：Text-to-SQL + SQL 沙箱

`POST /admin/ai/query`，请求体示例：`{"question":"近 7 天销量最高的 5 个菜品是什么？"}`。

Agent 读取数据库结构和指标口径生成 SELECT，随后进入 Druid SQL 解析沙箱。沙箱只允许单条查询、表名白名单、自动限制最多 200 行，并拒绝写操作、敏感字段和未知表。SQL 执行失败时会把错误回填给模型，最多自动修复 3 次；最终返回 SQL、列、真实查询结果、摘要和 trace。

### 配置与 Mock 联调

在 `application-dev.yml` 的 `sky.ai` 中配置 OpenAI 兼容接口：

```yaml
sky:
  ai:
    base-url: https://your-provider.example/v1
    model: your-model
    api-key: YOUR_AI_API_KEY
```

没有 API Key 时可以使用仓库自带 Mock：

```bash
node docs/mock-llm-server.js
java -jar sky-server/target/sky-server-1.0-SNAPSHOT.jar \
     --sky.ai.base-url=http://localhost:18080 \
     --sky.ai.api-key=test-key --sky.ai.model=mock-model
```

应用启动会自动创建 `ai_action_proposal`、`ai_agent_run` 两张表，也可以手动执行 `sql/ai_agent_upgrade.sql`。需要触发演示数据时，再执行 `docs/ai-demo-data.sql`。

## 主要业务流程速览

1. **管理端登录**：密码 MD5 校验 → 生成 JWT → 后续请求经 `JwtTokenAdminInterceptor` 校验，员工 id 存入 ThreadLocal 供公共字段自动填充使用。
2. **公共字段自动填充**：自定义注解 `@AutoFill` + AOP 切面 `AutoFillAspect`，在 insert/update 时统一填充 `create_time/update_time/create_user/update_user`。
3. **缓存**：菜品/套餐查询使用 Spring Cache（`@Cacheable`）+ Redis；增删改时清理缓存。
4. **用户下单**：校验地址/购物车 → 生成订单与订单明细（逻辑外键）→ 调用微信支付（演示环境可跳过）→ 支付成功后 WebSocket 推送来单提醒。
5. **定时任务**：`OrderTask` 每分钟处理支付超时订单（取消），每天凌晨 1 点将派送中的订单置为已完成。
6. **数据报表**：Apache POI 导出近 30 天营业数据 Excel（营业额、有效订单、用户/订单统计、销量 Top10）。

## 常见问题

- **启动报 Redis 连接失败**：确认本机 Redis 已启动且密码与 `application-dev.yml` 中 `sky.redis.password` 一致。
- **图片上传失败**：未配置阿里云 OSS 密钥所致，属于预期行为，其余功能不受影响。
- **微信登录/支付不可用**：需要真实的小程序 appid 与商户号，演示数据不影响其余功能。
