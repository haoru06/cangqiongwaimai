// 本地 Mock 大模型服务器：模拟 OpenAI 兼容的 /chat/completions 接口，
// 用于在未申请真实 API Key 时联调智能助手 Agent 的工具调用循环。
//
// 用法：
//   node docs/mock-llm-server.js
//   java -jar sky-server/target/sky-server-1.0-SNAPSHOT.jar \
//        --sky.ai.base-url=http://localhost:18080/v1 \
//        --sky.ai.api-key=test-key --sky.ai.model=mock-model
//
// 行为：
//   - 单条 user 消息（文案生成场景）→ 直接返回一段固定文案
//   - Agent 对话第一轮 → 返回 tool_calls 要求调用 query_today_business_data
//   - 消息中包含工具结果 → 返回基于工具结果的最终回答
const http = require('http');
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    console.log('REQ', req.url, body.slice(0, 200));
    let payload;
    const messages = JSON.parse(body).messages || [];
    if (messages.length === 1 && messages[0].role === "user") {
      payload = { choices: [{ message: { role: "assistant", content: "【mock 文案】手工现做，鲜香入魂。" } }] };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload));
      return;
    }
    const hasToolResult = messages.some(m => m.role === 'tool');
    if (req.url.includes('/chat/completions')) {
      if (!hasToolResult) {
        // 第一轮：要求调用今日经营数据工具
        payload = {
          choices: [{ message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 'call_1', type: 'function',
              function: { name: 'query_today_business_data', arguments: '{}' } }]
          }}]
        };
      } else {
        // 第二轮：基于工具结果生成最终回答
        const toolMsg = messages.filter(m => m.role === 'tool').pop();
        payload = { choices: [{ message: { role: 'assistant',
          content: '根据工具查询结果，今日经营情况如下：' + toolMsg.content } }] };
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  });
});
server.listen(18080, () => console.log('mock llm on 18080'));
