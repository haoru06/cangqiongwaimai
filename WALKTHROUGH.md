# 苍穹外卖项目 Walkthrough

> 本文基于当前工作区的源码、Nginx 配置、Maven 配置和已构建的管理端静态资源整理。
> 生成时间：2026-08-07

## 1. 项目边界

当前工作区由两部分组成：

- `sky-take-out`：Spring Boot 后端源码，采用 Maven 多模块结构。
- `qianduan/nginx-1.20.2`：Nginx 运行目录及已构建的 Vue 管理端资源，入口为 `html/sky`。
- 根目录的 `project.config.json` 表明项目还对应一个微信小程序，但当前工作区没有小程序业务源码，只有项目配置文件。

## 2. 总体架构

```mermaid
flowchart LR
    subgraph Client[客户端]
        Admin[管理端 Vue 构建产物]
        Mini["微信小程序 C 端<br/>源码未纳入当前工作区"]
    end

    subgraph Deploy[部署层]
        Nginx["Nginx :80<br/>静态托管 + 反向代理"]
    end

    subgraph App[sky-server Spring Boot :8080]
        MVC[Spring MVC]
        Auth["JWT 拦截器<br/>admin / user"]
        AdminController["Admin Controllers<br/>/admin/**"]
        UserController["User Controllers<br/>/user/**"]
        NotifyController["支付回调<br/>/notify/paySuccess"]
        WebSocket["WebSocketServer<br/>/ws/{sid}"]
        Service["Service / ServiceImpl<br/>业务编排"]
        Mapper[MyBatis Mapper + XML]
        Task["定时任务<br/>OrderTask / WebSocketTask"]
    end

    subgraph Common[sky-common]
        CommonModel["Result / PageResult / Exception<br/>JWT / OSS / 微信支付工具"]
    end

    subgraph Pojo[sky-pojo]
        DataModel["Entity / DTO / VO"]
    end

    MySQL[("MySQL<br/>sky_take_out")]
    Redis[("Redis<br/>缓存 / 营业状态")]
    WeChat[微信登录与支付]
    Baidu["百度地图<br/>地理编码 / 路线规划"]
    OSS["阿里云 OSS<br/>图片文件"]

    Admin --> Nginx
    Mini --> Nginx
    Nginx -->|/api/ 改写为 /admin/| AdminController
    Nginx -->|/user/ 代理| UserController
    Nginx -->|/ws/ 代理并升级连接| WebSocket

    AdminController -.经过.-> Auth
    UserController -.经过.-> Auth
    AdminController --> Service
    UserController --> Service
    NotifyController --> Service
    Service --> Mapper
    Mapper --> MySQL
    Service --> Redis
    Service --> CommonModel
    AdminController --> CommonModel
    UserController --> CommonModel
    MVC --> NotifyController
    MVC --> WebSocket
    Service --> WeChat
    Service --> Baidu
    AdminController --> OSS
    Task --> Mapper
    Task --> WebSocket
    Service -.共享类型.-> DataModel
    Mapper -.实体映射.-> DataModel
    CommonModel -.被依赖.-> AdminController
    CommonModel -.被依赖.-> UserController

    classDef client fill:#e8f1ff,stroke:#4c78a8,color:#17324d;
    classDef edge fill:#fff4dc,stroke:#c58a19,color:#4b3500;
    classDef app fill:#eaf7ef,stroke:#4e9f6e,color:#163d25;
    classDef data fill:#f5eafa,stroke:#9564a8,color:#3d2147;
    class Admin,Mini client;
    class Nginx edge;
    class MVC,Auth,AdminController,UserController,NotifyController,WebSocket,Service,Mapper,Task app;
    class MySQL,Redis,WeChat,Baidu,OSS,CommonModel,DataModel data;
```

### 2.1 模块依赖

```mermaid
flowchart TB
    Root["sky-take-out<br/>父工程 / Spring Boot 2.7.3"]
    Common["sky-common<br/>通用结果、异常、上下文、工具、配置属性"]
    Pojo["sky-pojo<br/>Entity、DTO、VO"]
    Server["sky-server<br/>Controller、Service、Mapper、配置、任务"]

    Root --> Common
    Root --> Pojo
    Root --> Server
    Server --> Common
    Server --> Pojo
```

- `sky-common` 提供 `Result`、分页结果、JWT、微信支付、OSS、HTTP、异常和配置属性等基础能力。
- `sky-pojo` 只承载跨层数据模型：订单、菜品、套餐、用户、员工等实体，以及请求 DTO 和响应 VO。
- `sky-server` 是可启动应用，负责 HTTP/WebSocket 入口、业务服务、MyBatis 数据访问、缓存、定时任务和 Spring 配置。

## 3. 请求路由与认证边界

```mermaid
flowchart LR
    Admin["管理端请求<br/>baseURL=/api"] --> Nginx["Nginx :80"]
    Nginx -->|/api/employee/login -> /admin/employee/login| AdminLogin["EmployeeController.login<br/>免 JWT"]
    Nginx -->|/api/* -> /admin/*| AdminApi["/admin/**"]
    AdminApi --> AdminJwt["JwtTokenAdminInterceptor<br/>读取 token"]
    AdminJwt --> AdminBusiness["Admin Controller -> Service"]

    Mini[小程序请求] --> UserRoute[Nginx /user/]
    UserRoute --> UserLogin["UserController.login<br/>免 JWT"]
    UserRoute --> UserApi["/user/**"]
    UserApi --> UserJwt["JwtTokenUserInterceptor<br/>读取 authentication"]
    UserJwt --> UserBusiness[User Controller -> Service]

    Wechat[微信支付平台] --> Callback["/notify/paySuccess<br/>当前不走 admin/user 拦截器"]
    Callback --> PayService[OrderService.paySuccess]

    Admin -.实时连接.-> WSRoute[Nginx /ws/]
    WSRoute --> WS["/ws/{sid}"]
```

认证实现位于 `sky-server/src/main/java/com/sky/config/WebMvcConfiguration.java`：

- `/admin/**` 除 `/admin/employee/login` 外统一经过管理员 JWT 拦截器，解析员工 ID 并写入 `BaseContext`。
- `/user/**` 除 `/user/user/login` 和 `/user/shop/status` 外统一经过用户 JWT 拦截器，解析用户 ID 并写入 `BaseContext`。
- 已构建管理端使用 `/api` 作为 Axios `baseURL`，请求头使用 `token`；Nginx 将该前缀映射到后端 `/admin/`。
- WebSocket 使用 `/ws/{sid}`，管理端构建产物中连接地址为 `ws://localhost/ws/{sid}`。

## 4. 核心流程一：登录与身份建立

### 4.1 管理员登录

```mermaid
sequenceDiagram
    autonumber
    participant A as 管理端
    participant N as Nginx
    participant C as EmployeeController
    participant S as EmployeeServiceImpl
    participant M as EmployeeMapper
    participant DB as MySQL

    A->>N: POST /api/employee/login
    N->>C: POST /admin/employee/login
    C->>S: login(username, password)
    S->>M: 按用户名查询员工
    M->>DB: SELECT employee
    DB-->>M: 员工记录
    M-->>S: Employee
    S-->>C: 校验密码和启用状态
    C->>C: 使用 admin secret 创建 JWT
    C-->>A: EmployeeLoginVO(token, employee info)
    A->>N: 后续请求携带 token
    N->>C: 转发 /admin/**
    C->>C: JwtTokenAdminInterceptor 校验并设置 empId
```

### 4.2 C 端微信登录

```mermaid
sequenceDiagram
    autonumber
    participant M as 微信小程序
    participant N as Nginx
    participant C as UserController
    participant S as UserServiceImpl
    participant WX as 微信 jscode2session
    participant DB as MySQL

    M->>N: POST /user/user/login(code)
    N->>C: 转发到 Spring Boot
    C->>S: wxLogin(code)
    S->>WX: 用 code 换取 openid
    WX-->>S: openid
    S->>DB: 查询 user.openid
    alt 新用户
        S->>DB: 插入 user(createTime)
    end
    S-->>C: User
    C->>C: 使用 user secret 创建 JWT
    C-->>M: UserLoginVO(token, openid, id)
    M->>N: 后续 /user/** 请求携带 authentication
    N->>C: 转发并由用户 JWT 拦截器校验
```

## 5. 核心流程二：浏览菜单、购物车与下单

```mermaid
flowchart TD
    Start[用户已登录] --> Shop["查询营业状态<br/>/user/shop/status"]
    Shop --> Category["查询分类<br/>/user/category/list"]
    Category --> Dish["查询可售菜品<br/>/user/dish/list"]
    Category --> Setmeal["查询可售套餐<br/>/user/setmeal/list"]
    Dish --> Cache1{菜品缓存命中?}
    Setmeal --> Cache2{套餐缓存命中?}
    Cache1 -->|是| Menu[返回菜单]
    Cache1 -->|否| DishDB["DishService + DishMapper<br/>读取 MySQL 后写 Redis"]
    Cache2 -->|是| Menu
    Cache2 -->|否| SetmealDB["SetmealService + Mapper<br/>读取 MySQL 后写 Spring Cache"]
    DishDB --> Menu
    SetmealDB --> Menu
    Menu --> Cart["购物车增减/清空<br/>ShoppingCartController"]
    Cart --> Address["维护收货地址<br/>AddressBookController"]
    Address --> Submit[POST /user/order/submit]
    Submit --> Validate[校验地址、购物车和配送范围]
    Validate -->|百度地图路线 > 5km| Reject[业务异常，拒绝下单]
    Validate -->|通过| Tx[事务写入订单和明细]
    Tx --> Clean[清空当前用户购物车]
    Clean --> Pending["订单状态 = 1 待支付<br/>支付状态 = 0 未支付"]
```

下单的关键事务位于 `OrderServiceImpl.submitOrder`：

1. 按地址簿 ID 查询收货地址，并调用百度地图地理编码和驾车路线接口校验配送距离。
2. 按 `BaseContext` 中的用户 ID读取购物车；购物车为空时直接失败。
3. 在 `orders` 写入订单，再批量写入 `order_detail`。
4. 清空该用户购物车；整个订单与明细写入流程使用 `@Transactional`。

## 6. 核心流程三：支付、支付回调与后台接单

```mermaid
sequenceDiagram
    autonumber
    participant U as 小程序用户
    participant C as User OrderController
    participant S as OrderServiceImpl
    participant WX as 微信支付
    participant N as PayNotifyController
    participant DB as MySQL
    participant WS as WebSocketServer
    participant A as 管理端工作台

    U->>C: PUT /user/order/payment(orderNumber)
    C->>S: payment(dto)
    S->>WX: 创建预支付交易
    WX-->>S: prepay_id 等支付参数
    S-->>U: OrderPaymentVO
    U->>WX: 调起微信支付
    WX->>N: POST /notify/paySuccess(加密回调)
    N->>N: AES-GCM 解密 resource
    N->>S: paySuccess(outTradeNo)
    S->>DB: 更新 payStatus=1、status=2、checkoutTime
    S->>WS: 广播 type=1 待接单消息
    WS-->>A: 推送订单提醒
    A->>C: PUT /admin/order/confirm
    C->>S: confirm(id)
    S->>DB: status=3 已接单
    A->>C: PUT /admin/order/delivery/{id}
    C->>S: delivery(id)
    S->>DB: status=4 派送中
    A->>C: PUT /admin/order/complete/{id}
    C->>S: complete(id)
    S->>DB: status=5 已完成、写入 deliveryTime
```

### 6.1 订单状态机

```mermaid
stateDiagram-v2
    [*] --> 待支付: submitOrder
    待支付 --> 待接单: 微信支付回调成功
    待支付 --> 已取消: 用户取消 / 15 分钟支付超时
    待接单 --> 已接单: 管理端 confirm
    待接单 --> 已取消: 管理端 rejection
    已接单 --> 派送中: 管理端 delivery
    派送中 --> 已完成: 管理端 complete
    派送中 --> 已完成: 定时任务超过 60 分钟
    已接单 --> 已取消: 管理端 cancel
    已完成 --> [*]
    已取消 --> [*]
```

订单状态常量定义在 `sky-pojo/src/main/java/com/sky/entity/Orders.java`：

| 值 | 业务状态 | 主要写入点 |
| --- | --- | --- |
| 1 | 待支付 | 用户提交订单 |
| 2 | 待接单 | 支付成功回调 |
| 3 | 已接单 | 管理端确认 |
| 4 | 派送中 | 管理端配送 |
| 5 | 已完成 | 管理端完成或定时任务兜底 |
| 6 | 已取消 | 用户/管理端取消或支付超时 |

支付状态单独使用 `payStatus` 表示未支付、已支付、退款。拒单或取消时，如果订单已支付，服务层会调用微信退款工具。

## 7. 核心流程四：实时通知与定时任务

```mermaid
flowchart LR
    Paid[支付成功] --> Notify1[OrderService.paySuccess]
    Notify1 --> Push1["WebSocketServer.broadcast<br/>type=1 待接单"]

    Reminder["用户催单<br/>/user/order/reminder/{id}"] --> Notify2["OrderService.reminder"]
    Notify2 --> Push2["WebSocketServer.broadcast<br/>type=2 催单"]

    Admin[管理端工作台] --> Socket["ws://localhost/ws/{sid}"]
    Socket --> WS[WebSocketServer sessionMap]
    Push1 --> WS
    Push2 --> WS

    EveryMinute[每分钟] --> Timeout[OrderTask.processTimeoutOrder]
    Timeout --> DB1[("MySQL orders")]
    Timeout --> Cancel[超过 15 分钟未支付 -> 已取消]

    EveryDay[每天 01:00] --> Delivery[OrderTask.processDeliveryOrder]
    Delivery --> DB2[("MySQL orders")]
    Delivery --> Complete[派送中超过 60 分钟 -> 已完成]

    Every5s[每 5 秒] --> Heartbeat[WebSocketTask.sendMessageToClient]
    Heartbeat --> WS
```

当前 WebSocket 服务是单实例内存会话表 `sessionMap`，消息由支付成功、催单和定时任务触发后广播给全部已连接客户端。

## 8. 核心流程五：后台运营数据与报表

```mermaid
flowchart TD
    Admin[管理端报表/工作台] --> Workspace["/admin/workspace/**"]
    Admin --> Report["/admin/report/**"]
    Workspace --> WSvc[WorkspaceServiceImpl]
    Report --> RSvc[ReportServiceImpl]
    WSvc --> OrderMapper[OrderMapper]
    WSvc --> UserMapper[UserMapper]
    WSvc --> DishMapper[DishMapper]
    WSvc --> SetmealMapper[SetmealMapper]
    RSvc --> OrderMapper
    RSvc --> UserMapper
    OrderMapper --> DB[("MySQL")]
    UserMapper --> DB
    DishMapper --> DB
    SetmealMapper --> DB
    RSvc --> Excel[Apache POI + Excel 模板]
    Excel --> Download[下载运营数据报表]
```

已实现的运营数据包括：营业额、有效订单、订单完成率、平均客单价、新增用户、订单统计和销量 Top10。`/admin/report/export` 读取 `sky-server/src/main/resources/template/运营数据报表模板.xlsx`，通过 Apache POI 填充最近 30 天数据并输出下载流。

## 9. 数据与外部系统映射

| 系统/组件 | 用途 | 代码入口 |
| --- | --- | --- |
| MySQL | 员工、用户、菜品、套餐、购物车、地址、订单和订单明细持久化 | `sky-server/src/main/resources/mapper/*.xml`、各 `Mapper` |
| Redis | 菜品列表缓存、套餐缓存、门店营业状态 | `DishController`、`SetmealController`、`ShopController` |
| 微信开放接口 | 小程序 code 换 openid | `UserServiceImpl` |
| 微信支付 | 预支付、支付回调解密、退款 | `WeChatPayUtil`、`PayNotifyController` |
| 百度地图 | 门店/用户地址地理编码、路线规划和配送距离校验 | `OrderServiceImpl.checkOutOfRange` |
| 阿里云 OSS | 管理端菜品/套餐图片上传 | `CommonController`、`AliOssUtil` |
| WebSocket | 待接单、催单和定时消息的实时推送 | `WebSocketServer` |
| Nginx | 管理端静态资源、API 及 WebSocket 代理 | `qianduan/nginx-1.20.2/conf/nginx.conf` |

## 10. 关键源码索引

- 应用启动和能力开关：`sky-server/src/main/java/com/sky/SkyApplication.java`
- 路由、JWT 拦截器和接口文档：`sky-server/src/main/java/com/sky/config/WebMvcConfiguration.java`
- 用户下单、支付、状态流转：`sky-server/src/main/java/com/sky/service/impl/OrderServiceImpl.java`
- 管理端订单入口：`sky-server/src/main/java/com/sky/controller/admin/OrderController.java`
- C 端订单入口：`sky-server/src/main/java/com/sky/controller/user/OrderController.java`
- 支付回调：`sky-server/src/main/java/com/sky/controller/notify/PayNotifyController.java`
- 实时推送：`sky-server/src/main/java/com/sky/websocket/WebSocketServer.java`
- 订单兜底任务：`sky-server/src/main/java/com/sky/task/OrderTask.java`
- 部署路由：`qianduan/nginx-1.20.2/conf/nginx.conf`

## 11. Walkthrough 观察项

以下事项是从当前代码和部署配置直接观察到的，属于运行或部署时需要确认的边界：

1. 微信支付回调使用 `/notify/paySuccess`，但 Nginx 当前只显式代理 `/api/`、`/user/` 和 `/ws/`；生产环境需要确认回调请求确实能到达 `PayNotifyController`。
2. 支付回调没有经过 admin/user JWT 拦截器，而 `paySuccess` 查询订单时依赖 `BaseContext` 中的用户 ID；需要在实际支付回调环境验证该上下文是否能正确建立。
3. 已构建管理端把 WebSocket 地址写成 `ws://localhost/ws/{sid}`，远程部署时浏览器的 `localhost` 不一定指向后端服务器，需要确认部署域名或构建配置。
4. `application-dev.yml` 当前包含数据库、Redis、OSS 和微信支付的明文开发配置；这些值不应复制到文档、提交历史或生产环境。
5. 当前工作区未包含管理端源码和小程序业务源码，因此前端图示只反映已构建管理端的可见调用方式，以及后端实际提供的 C 端接口。
