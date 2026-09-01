/* 苍穹外卖 AI 运营面板：诊断、审批、自然语言取数。 */
(function () {
  if (window.__SKY_AI_ASSISTANT__) return;
  window.__SKY_AI_ASSISTANT__ = true;

  var css = [
    '.skyai-fab{position:fixed;right:28px;bottom:32px;z-index:99999;width:56px;height:56px;border-radius:50%;background:#176b87;color:#fff;font:700 16px/56px "Microsoft YaHei";text-align:center;cursor:pointer;box-shadow:0 4px 16px rgba(23,107,135,.4)}',
    '.skyai-panel{position:fixed;right:28px;bottom:100px;z-index:99999;width:460px;height:610px;background:#fff;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;font:13px/1.6 "Microsoft YaHei";color:#303133}',
    '.skyai-panel.open{display:flex}.skyai-head{background:#176b87;color:#fff;padding:13px 16px;display:flex;justify-content:space-between;align-items:center}.skyai-head b{font-size:15px}.skyai-close{font-size:20px;cursor:pointer}',
    '.skyai-tabs{display:flex;border-bottom:1px solid #ebeef5;background:#f7f9fa}.skyai-tab{flex:1;text-align:center;padding:10px 0;cursor:pointer;color:#606266;border-bottom:2px solid transparent}.skyai-tab.on{color:#176b87;border-bottom-color:#176b87;background:#fff;font-weight:700}',
    '.skyai-body{display:none;flex:1;min-height:0;overflow:auto}.skyai-body.on{display:block}.skyai-toolbar{display:flex;gap:8px;padding:12px;border-bottom:1px solid #ebeef5}.skyai-btn{border:0;border-radius:6px;background:#176b87;color:#fff;padding:7px 13px;cursor:pointer;font:13px "Microsoft YaHei"}.skyai-btn.alt{background:#fff;color:#176b87;border:1px solid #176b87}.skyai-btn[disabled]{opacity:.55;cursor:not-allowed}',
    '.skyai-card{margin:12px;border:1px solid #ebeef5;border-left:4px solid #d7a43b;padding:12px;background:#fff}.skyai-card.high{border-left-color:#c45656}.skyai-card h4{margin:0 0 6px;font-size:14px}.skyai-meta{color:#909399;font-size:12px}.skyai-evidence{margin-top:8px;padding:8px;background:#f7f8fa;white-space:pre-wrap;word-break:break-word;color:#606266}.skyai-action{margin-top:9px;padding:8px;background:#eef7f9;color:#176b87}.skyai-empty{padding:30px 16px;text-align:center;color:#909399}',
    '.skyai-query{padding:12px}.skyai-query textarea{box-sizing:border-box;width:100%;height:72px;resize:none;border:1px solid #dcdfe6;border-radius:6px;padding:8px;font:13px "Microsoft YaHei";outline:none}.skyai-query textarea:focus{border-color:#176b87}.skyai-sql{margin-top:10px;padding:9px;background:#202b33;color:#d9f0f4;font:12px/1.5 Consolas,monospace;white-space:pre-wrap;word-break:break-word}.skyai-summary{margin-top:10px;color:#303133}.skyai-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}.skyai-table th,.skyai-table td{border:1px solid #ebeef5;padding:6px;text-align:left;white-space:nowrap}.skyai-table th{background:#f5f7fa}.skyai-error{padding:10px;margin-top:10px;background:#fef0f0;color:#c45656;white-space:pre-wrap}',
    '@media(max-width:600px){.skyai-panel{right:8px;bottom:78px;width:calc(100vw - 16px);height:calc(100vh - 96px)}.skyai-fab{right:16px;bottom:16px}}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function token() {
    var match = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function api(path, body, method) {
    var options = { method: method || (body == null ? 'GET' : 'POST'), headers: { token: token() } };
    if (body != null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    return fetch(path, options).then(function (response) { return response.json(); }).then(function (response) {
      if (response.code === 1) return response.data;
      throw new Error(response.msg || '请求失败');
    });
  }
  function loggedIn() {
    if (token()) return true;
    alert('请先登录管理端');
    return false;
  }

  var fab = document.createElement('div');
  fab.className = 'skyai-fab'; fab.title = 'AI 运营中心'; fab.textContent = 'AI';
  var panel = document.createElement('div');
  panel.className = 'skyai-panel';
  panel.innerHTML = '<div class="skyai-head"><b>AI 运营中心</b><span class="skyai-close">×</span></div>' +
    '<div class="skyai-tabs"><div class="skyai-tab on" data-tab="diagnosis">经营诊断</div><div class="skyai-tab" data-tab="actions">待审批动作</div><div class="skyai-tab" data-tab="query">自然语言取数</div></div>' +
    '<div class="skyai-body on" data-body="diagnosis"><div class="skyai-toolbar"><button class="skyai-btn run">立即巡检</button><button class="skyai-btn alt refresh">刷新结果</button></div><div class="diagnosis-content"><div class="skyai-empty">尚未执行巡检</div></div></div>' +
    '<div class="skyai-body" data-body="actions"><div class="skyai-toolbar"><button class="skyai-btn alt refresh-actions">刷新待办</button></div><div class="actions-content"><div class="skyai-empty">加载中</div></div></div>' +
    '<div class="skyai-body" data-body="query"><div class="skyai-query"><textarea placeholder="例如：近 7 天销量最高的 5 个菜品是什么？"></textarea><button class="skyai-btn query-btn">查询</button><div class="query-result"></div></div></div>';
  document.body.appendChild(fab); document.body.appendChild(panel);

  var tabs = panel.querySelectorAll('.skyai-tab');
  var bodies = panel.querySelectorAll('.skyai-body');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (item) { item.classList.remove('on'); }); bodies.forEach(function (item) { item.classList.remove('on'); });
      tab.classList.add('on'); panel.querySelector('[data-body="' + tab.dataset.tab + '"]').classList.add('on');
      if (tab.dataset.tab === 'actions') loadActions();
      if (tab.dataset.tab === 'diagnosis') loadLatest();
    });
  });
  fab.addEventListener('click', function () { panel.classList.toggle('open'); if (panel.classList.contains('open') && loggedIn()) { loadLatest(); loadActions(); } });
  panel.querySelector('.skyai-close').addEventListener('click', function () { panel.classList.remove('open'); });

  function loadLatest() {
    api('/api/ai/diagnosis/latest').then(renderDiagnosis).catch(showDiagnosisError);
  }
  function runDiagnosis() {
    if (!loggedIn()) return;
    var button = panel.querySelector('.run'); button.disabled = true; button.textContent = '巡检中...';
    api('/api/ai/diagnosis/run', null, 'POST').then(renderDiagnosis).catch(showDiagnosisError).finally(function () { button.disabled = false; button.textContent = '立即巡检'; });
  }
  function renderDiagnosis(report) {
    var container = panel.querySelector('.diagnosis-content');
    if (!report) { container.innerHTML = '<div class="skyai-empty">尚未执行巡检</div>'; return; }
    var html = '<div class="skyai-meta" style="padding:10px 12px">分析日期：' + esc(report.analysisDate || '-') + ' · 状态：' + esc(report.status || '-') + '</div>';
    (report.anomalies || []).forEach(function (item) {
      html += '<div class="skyai-card ' + (item.level === 'HIGH' ? 'high' : '') + '"><h4>' + esc(item.title) + '</h4>' +
        '<div>' + esc(item.conclusion) + '</div><div class="skyai-meta">观测：' + esc(item.observed) + '　基线：' + esc(item.baseline) + '　影响：' + esc(item.impactAmount) + ' 元</div>' +
        '<div class="skyai-evidence">证据：' + esc(item.evidence) + '</div><div class="skyai-action">Agent 建议：' + esc(item.rootCause || item.suggestion) + (item.actionLabel ? '<br>待审批动作：' + esc(item.actionLabel) : '') + '</div></div>';
    });
    if (!report.anomalies || !report.anomalies.length) html += '<div class="skyai-empty">规则层未发现高风险异常</div>';
    container.innerHTML = html;
  }
  function showDiagnosisError(error) { panel.querySelector('.diagnosis-content').innerHTML = '<div class="skyai-error">' + esc(error.message) + '</div>'; }

  function loadActions() {
    api('/api/ai/actions/pending').then(renderActions).catch(function (error) { panel.querySelector('.actions-content').innerHTML = '<div class="skyai-error">' + esc(error.message) + '</div>'; });
  }
  function renderActions(actions) {
    var container = panel.querySelector('.actions-content');
    if (!actions || !actions.length) { container.innerHTML = '<div class="skyai-empty">暂无待审批动作</div>'; return; }
    container.innerHTML = actions.map(function (item) {
      return '<div class="skyai-card"><h4>' + esc(item.type) + (item.target_id ? ' #' + esc(item.target_id) : '') + '</h4><div class="skyai-meta">创建时间：' + esc(item.created_time) + '</div><div class="skyai-evidence">' + esc(item.evidence_json) + '</div><button class="skyai-btn approve" data-id="' + esc(item.id) + '">同意执行</button> <button class="skyai-btn alt reject" data-id="' + esc(item.id) + '">驳回</button></div>';
    }).join('');
    container.querySelectorAll('.approve').forEach(function (button) { button.addEventListener('click', function () { changeAction(button, 'approve'); }); });
    container.querySelectorAll('.reject').forEach(function (button) { button.addEventListener('click', function () { changeAction(button, 'reject'); }); });
  }
  function changeAction(button, operation) {
    if (!loggedIn()) return;
    button.disabled = true;
    api('/api/ai/actions/' + encodeURIComponent(button.dataset.id) + '/' + operation, null, 'POST').then(function (message) { alert(message); loadActions(); loadLatest(); }).catch(function (error) { alert(error.message); button.disabled = false; });
  }

  panel.querySelector('.query-btn').addEventListener('click', function () {
    if (!loggedIn()) return;
    var input = panel.querySelector('.skyai-query textarea'); var question = input.value.trim(); if (!question) return;
    var button = panel.querySelector('.query-btn'); button.disabled = true; button.textContent = '查询中...';
    api('/api/ai/query', { question: question }).then(renderQuery).catch(function (error) { panel.querySelector('.query-result').innerHTML = '<div class="skyai-error">' + esc(error.message) + '</div>'; }).finally(function () { button.disabled = false; button.textContent = '查询'; });
  });
  function renderQuery(result) {
    var container = panel.querySelector('.query-result');
    if (!result || !result.success) { container.innerHTML = '<div class="skyai-error">' + esc(result && (result.error || result.summary) || '查询失败') + '</div>'; return; }
    var html = '<div class="skyai-summary">' + esc(result.summary) + '</div><div class="skyai-sql">' + esc(result.sql) + '</div><table class="skyai-table"><thead><tr>' +
      (result.columns || []).map(function (column) { return '<th>' + esc(column) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (result.rows || []).map(function (row) { return '<tr>' + (result.columns || []).map(function (column) { return '<td>' + esc(row[column]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    container.innerHTML = html;
  }
  panel.querySelector('.run').addEventListener('click', runDiagnosis);
  panel.querySelector('.refresh').addEventListener('click', loadLatest);
  panel.querySelector('.refresh-actions').addEventListener('click', loadActions);
})();
