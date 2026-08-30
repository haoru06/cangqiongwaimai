/* 苍穹外卖 · AI 智能助手悬浮组件（独立注入，不侵入原 Vue 应用）
 * 功能：1) 智能运营助手（Tool-Calling Agent 多轮对话，展示工具调用轨迹）
 *      2) AI 菜品文案生成（选择菜品 → 生成售卖文案 → 一键复制）
 * 依赖：仅原生 JS；token 读取管理端登录后的 Cookie（键名 token）
 */
(function () {
  if (window.__SKY_AI_ASSISTANT__) return;
  window.__SKY_AI_ASSISTANT__ = true;

  /* ---------- 样式 ---------- */
  var css = [
    '.skyai-fab{position:fixed;right:28px;bottom:32px;z-index:99999;width:56px;height:56px;border-radius:50%;',
    'background:linear-gradient(135deg,#2587a8,#1d6f8c);color:#fff;font:700 18px/56px "Microsoft YaHei",sans-serif;',
    'text-align:center;cursor:pointer;box-shadow:0 4px 16px rgba(37,135,168,.45);user-select:none;transition:transform .15s}',
    '.skyai-fab:hover{transform:scale(1.08)}',
    '.skyai-panel{position:fixed;right:28px;bottom:100px;z-index:99999;width:380px;height:540px;background:#fff;',
    'border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;',
    'font:13px/1.6 "Microsoft YaHei",sans-serif;color:#303133}',
    '.skyai-panel.open{display:flex}',
    '.skyai-head{background:#2587a8;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center}',
    '.skyai-head b{font-size:15px}','.skyai-close{cursor:pointer;font-size:18px;opacity:.85}',
    '.skyai-tabs{display:flex;border-bottom:1px solid #ebeef5;background:#f7f9fa}',
    '.skyai-tab{flex:1;text-align:center;padding:10px 0;cursor:pointer;color:#606266;border-bottom:2px solid transparent}',
    '.skyai-tab.on{color:#2587a8;border-bottom-color:#2587a8;background:#fff;font-weight:700}',
    '.skyai-body{flex:1;display:none;flex-direction:column;min-height:0}',
    '.skyai-body.on{display:flex}',
    '.skyai-msgs{flex:1;overflow-y:auto;padding:14px;background:#f5f7f9}',
    '.skyai-row{margin-bottom:12px;display:flex}',
    '.skyai-row.me{justify-content:flex-end}',
    '.skyai-bub{max-width:78%;padding:9px 12px;border-radius:10px;white-space:pre-wrap;word-break:break-word}',
    '.skyai-row.me .skyai-bub{background:#2587a8;color:#fff;border-top-right-radius:2px}',
    '.skyai-row.ai .skyai-bub{background:#fff;border:1px solid #e4e7ed;border-top-left-radius:2px}',
    '.skyai-trace{margin-top:6px;font:11px/1.7 Consolas,monospace;color:#909399;background:#f4f4f5;',
    'border-radius:6px;padding:6px 8px;word-break:break-all}',
    '.skyai-input{display:flex;gap:8px;padding:10px;border-top:1px solid #ebeef5;background:#fff}',
    '.skyai-input textarea{flex:1;height:44px;resize:none;border:1px solid #dcdfe6;border-radius:8px;',
    'padding:8px 10px;font:13px "Microsoft YaHei",sans-serif;outline:none}',
    '.skyai-input textarea:focus{border-color:#2587a8}',
    '.skyai-btn{border:none;border-radius:8px;background:#2587a8;color:#fff;padding:0 18px;cursor:pointer;',
    'font:13px "Microsoft YaHei",sans-serif}',
    '.skyai-btn:hover{background:#1d6f8c}',
    '.skyai-btn[disabled]{background:#a0cdd9;cursor:not-allowed}',
    '.skyai-form{padding:14px;display:flex;flex-direction:column;gap:10px}',
    '.skyai-form label{color:#606266;font-size:12px}',
    '.skyai-form select{padding:8px;border:1px solid #dcdfe6;border-radius:8px;outline:none;font:13px "Microsoft YaHei"}',
    '.skyai-result{min-height:110px;border:1px dashed #c7bea5;border-radius:8px;padding:10px;background:#fafbfc;',
    'white-space:pre-wrap;color:#303133}',
    '.skyai-tip{color:#909399;font-size:12px;text-align:center;padding:24px 14px}',
    '.skyai-copy{background:#fff;color:#2587a8;border:1px solid #2587a8}',
    '.skyai-copy:hover{background:#e3f0f5}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- 工具函数 ---------- */
  function getToken() {
    var m = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function api(path, body) {
    var opt = {
      method: body ? 'POST' : 'GET',
      headers: { 'token': getToken() }
    };
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(path, opt).then(function (r) { return r.json(); }).then(function (r) {
      if (r.code === 1) return r.data;
      throw new Error(r.msg || '请求失败');
    });
  }

  /* ---------- DOM 骨架 ---------- */
  var fab = document.createElement('div');
  fab.className = 'skyai-fab';
  fab.title = 'AI 智能助手';
  fab.textContent = 'AI';

  var panel = document.createElement('div');
  panel.className = 'skyai-panel';
  panel.innerHTML =
    '<div class="skyai-head"><b>AI 智能助手</b><span class="skyai-close">×</span></div>' +
    '<div class="skyai-tabs"><div class="skyai-tab on" data-tab="chat">智能助手</div>' +
    '<div class="skyai-tab" data-tab="copy">菜品文案</div></div>' +
    '<div class="skyai-body on" data-body="chat">' +
      '<div class="skyai-msgs"></div>' +
      '<div class="skyai-input"><textarea placeholder="问问经营情况，如：今天生意怎么样？"></textarea>' +
      '<button class="skyai-btn send">发送</button></div>' +
    '</div>' +
    '<div class="skyai-body" data-body="copy">' +
      '<div class="skyai-form">' +
        '<label>选择菜品（来自菜品管理列表）</label>' +
        '<select></select>' +
        '<button class="skyai-btn gen">生成售卖文案</button>' +
        '<div class="skyai-result">尚未生成</div>' +
        '<button class="skyai-btn copy" style="display:none">复制文案</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var msgs = panel.querySelector('.skyai-msgs');
  var ta = panel.querySelector('.skyai-input textarea');
  var sendBtn = panel.querySelector('.skyai-btn.send');
  var sessionId = 'web-' + Math.random().toString(36).slice(2, 10);

  /* ---------- 通用渲染 ---------- */
  function addRow(cls, html) {
    var row = document.createElement('div');
    row.className = 'skyai-row ' + cls;
    var bub = document.createElement('div');
    bub.className = 'skyai-bub';
    bub.innerHTML = html;
    row.appendChild(bub);
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
    return bub;
  }
  function loginHint() {
    if (getToken()) return true;
    msgs.innerHTML = '';
    var tip = document.createElement('div');
    tip.className = 'skyai-tip';
    tip.textContent = '请先登录管理端，登录后即可使用 AI 功能';
    msgs.appendChild(tip);
    return false;
  }

  /* ---------- Tab 切换 ---------- */
  var tabs = panel.querySelectorAll('.skyai-tab');
  var bodies = panel.querySelectorAll('.skyai-body');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('on'); });
      bodies.forEach(function (x) { x.classList.remove('on'); });
      t.classList.add('on');
      panel.querySelector('[data-body="' + t.dataset.tab + '"]').classList.add('on');
      if (t.dataset.tab === 'copy') loadDishes();
    });
  });

  fab.addEventListener('click', function () {
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && !msgs.children.length) {
      if (loginHint()) {
        addRow('ai', esc('你好，我是店铺智能运营助手。可以问我：今天生意怎么样？销量前十的菜？宫保鸡丁在售吗？'));
      }
    }
  });
  panel.querySelector('.skyai-close').addEventListener('click', function () {
    panel.classList.remove('open');
  });

  /* ---------- 功能 1：智能助手对话 ---------- */
  function sendChat() {
    var text = ta.value.trim();
    if (!text) return;
    if (!loginHint()) return;
    ta.value = '';
    sendBtn.disabled = true;
    addRow('me', esc(text));
    var pending = addRow('ai', '<span style="color:#909399">思考中…</span>');
    api('/api/ai/agent/chat', { sessionId: sessionId, message: text })
      .then(function (data) {
        var html = esc(data.reply || '（空回复）');
        if (data.toolTrace && data.toolTrace.length) {
          html += '<div class="skyai-trace">▸ 工具调用 ' + data.toolTrace.length + ' 次<br>' +
            data.toolTrace.map(function (t) { return esc('· ' + t); }).join('<br>') + '</div>';
        }
        pending.innerHTML = html;
        msgs.scrollTop = msgs.scrollHeight;
      })
      .catch(function (e) { pending.innerHTML = '<span style="color:#af5149">' + esc(e.message) + '</span>'; })
      .finally(function () { sendBtn.disabled = false; });
  }
  sendBtn.addEventListener('click', sendChat);
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  /* ---------- 功能 2：菜品文案 ---------- */
  var sel = panel.querySelector('select');
  var result = panel.querySelector('.skyai-result');
  var genBtn = panel.querySelector('.skyai-btn.gen');
  var copyBtn = panel.querySelector('.skyai-btn.copy');
  var dishesLoaded = false;

  function loadDishes() {
    if (dishesLoaded) return;
    sel.innerHTML = '<option>加载中…</option>';
    api('/api/dish/list').then(function (list) {
      sel.innerHTML = '';
      (list || []).forEach(function (d) {
        var o = document.createElement('option');
        o.value = d.id;
        o.textContent = d.name + (d.status === 1 ? '' : '（停售）');
        sel.appendChild(o);
      });
      if (!sel.children.length) sel.innerHTML = '<option>暂无菜品</option>';
      dishesLoaded = true;
    }).catch(function (e) {
      sel.innerHTML = '<option>菜品列表加载失败：' + e.message + '</option>';
    });
  }
  genBtn.addEventListener('click', function () {
    if (!loginHint()) return;
    var dishId = sel.value;
    if (!dishId) return;
    genBtn.disabled = true;
    copyBtn.style.display = 'none';
    result.textContent = '生成中…';
    api('/api/ai/dish/copywriting', { dishId: dishId }).then(function (text) {
      result.textContent = text;
      copyBtn.style.display = 'inline-block';
    }).catch(function (e) {
      result.textContent = '生成失败：' + e.message;
    }).finally(function () { genBtn.disabled = false; });
  });
  copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(result.textContent).then(function () {
      copyBtn.textContent = '已复制 ✓';
      setTimeout(function () { copyBtn.textContent = '复制文案'; }, 1500);
    });
  });
})();
