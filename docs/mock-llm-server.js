// 本地 Mock 大模型：覆盖经营诊断 Agent 与自然语言取数 Agent。
// 用法：node docs/mock-llm-server.js
const http = require('http');

function reply(res, content, toolCalls) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: content, tool_calls: toolCalls } }] }));
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    if (!req.url.includes('/chat/completions')) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    const messages = JSON.parse(body).messages || [];
    const system = messages.filter(item => item.role === 'system').map(item => item.content || '').join('\n');
    const hasTool = messages.some(item => item.role === 'tool');
    if (system.includes('经营诊断') && !hasTool) {
      reply(res, null, [{ id: 'diagnosis_call_1', type: 'function', function: {
        name: 'query_sales_top', arguments: '{"days":7}'
      }}]);
      return;
    }
    if (system.includes('经营诊断') && hasTool) {
      reply(res, '销量证据显示订单集中在少数菜品，建议先根据取消原因核对高峰期产能，再谨慎调整菜单。', null);
      return;
    }
    if (system.includes('根据查询结果')) {
      reply(res, '查询结果已基于数据库事实汇总。', null);
      return;
    }
    if (system.includes('只读数据分析 Agent')) {
      reply(res, JSON.stringify({
        sql: 'select od.name, sum(od.number) number from order_detail od join orders o on od.order_id=o.id where o.status=5 group by od.name order by number desc limit 5',
        summary: '返回已完成订单中的销量排名。'
      }), null);
      return;
    }
    reply(res, 'Mock LLM 未匹配到测试场景。', null);
  });
});

server.listen(18080, () => console.log('mock llm on 18080'));
