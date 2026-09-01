/* 苍穹外卖 AI 运营面板：诊断、审批、自然语言取数。 */
(function () {
  if (window.__SKY_AI_ASSISTANT__) return;
  window.__SKY_AI_ASSISTANT__ = true;

  var css = [
    '.skyai-fab{position:fixed;right:28px;bottom:32px;z-index:99999;width:56px;height:56px;border-radius:50%;background:#0b7285;color:#fff;font:700 16px/56px "Microsoft YaHei";text-align:center;cursor:pointer;box-shadow:0 6px 18px rgba(11,114,133,.35);user-select:none;transition:transform .18s,box-shadow .18s}.skyai-fab:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(11,114,133,.45)}',
    '.skyai-panel{position:fixed;right:28px;bottom:100px;z-index:99999;width:520px;height:680px;background:#f4f7f8;border-radius:10px;box-shadow:0 12px 42px rgba(15,61,74,.24);display:none;flex-direction:column;overflow:hidden;font:13px/1.6 "Microsoft YaHei",sans-serif;color:#24343a}.skyai-panel.open{display:flex}',
    '.skyai-head{background:#0f3d4a;color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center}.skyai-head b{display:block;font-size:16px;letter-spacing:0}.skyai-subtitle{display:block;margin-top:2px;color:#b8d4d8;font-size:11px}.skyai-close{border:0;background:transparent;color:#dcecef;font-size:22px;line-height:1;cursor:pointer;padding:2px 4px}.skyai-close:hover{color:#fff}',
    '.skyai-tabs{display:flex;border-bottom:1px solid #dce7e9;background:#fff}.skyai-tab{flex:1;text-align:center;padding:11px 0 10px;cursor:pointer;color:#60737a;border-bottom:3px solid transparent;transition:color .15s,border-color .15s}.skyai-tab:hover{color:#0b7285}.skyai-tab.on{color:#0b7285;border-bottom-color:#0b7285;background:#fff;font-weight:700}',
    '.skyai-body{display:none;flex:1;min-height:0;overflow:auto}.skyai-body.on{display:block}.skyai-toolbar{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #dce7e9;background:#fff}.skyai-toolbar-note{margin-left:auto;color:#7d9096;font-size:11px}.skyai-btn{border:0;border-radius:5px;background:#0b7285;color:#fff;padding:8px 14px;cursor:pointer;font:13px "Microsoft YaHei";transition:background .15s,opacity .15s}.skyai-btn:hover{background:#095f70}.skyai-btn.alt{background:#fff;color:#0b7285;border:1px solid #9bc3c9}.skyai-btn.alt:hover{background:#edf7f8}.skyai-btn.danger{color:#a74646;border-color:#dca9a9}.skyai-btn.danger:hover{background:#fff4f4}.skyai-btn[disabled]{opacity:.55;cursor:not-allowed}',
    '.skyai-report-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 14px 4px;color:#63767c;font-size:12px}.skyai-meta{color:#809197;font-size:11px}.skyai-status{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:12px;background:#e6f5ef;color:#217453;font-size:11px;font-weight:700}.skyai-status.warn{background:#fff3dc;color:#9a6813}.skyai-status:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}.skyai-overview{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 14px 2px}.skyai-stat{padding:10px 11px;border:1px solid #dce7e9;border-radius:7px;background:#fff}.skyai-stat-label{display:block;color:#7d9096;font-size:11px}.skyai-stat-value{display:block;margin-top:2px;color:#0f3d4a;font-size:20px;line-height:1.25;font-weight:700}',
    '.skyai-card{margin:10px 14px;padding:13px;border:1px solid #dce7e9;border-top:3px solid #d7a43b;border-radius:7px;background:#fff;box-shadow:0 2px 6px rgba(15,61,74,.04)}.skyai-card.high{border-top-color:#c45656}.skyai-card.medium{border-top-color:#d7a43b}.skyai-card.low{border-top-color:#6fa7a6}.skyai-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.skyai-card h3{margin:6px 0 5px;color:#173f49;font-size:15px;line-height:1.35}.skyai-card-conclusion{margin:0;color:#3c5157;line-height:1.7}.skyai-chip{display:inline-flex;align-items:center;flex:0 0 auto;padding:3px 8px;border-radius:12px;background:#edf1f2;color:#60737a;font-size:11px;font-weight:700;white-space:nowrap}.skyai-chip.high{background:#fff0ef;color:#ad4f4b}.skyai-chip.medium{background:#fff5df;color:#9a6813}.skyai-chip.low{background:#eaf6f5;color:#317775}.skyai-chip.pending{background:#fff5df;color:#9a6813}.skyai-chip.done{background:#e6f5ef;color:#217453}',
    '.skyai-fact-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.skyai-fact{padding:8px 9px;border-radius:5px;background:#f5f8f8}.skyai-fact-label{display:block;color:#809197;font-size:11px}.skyai-fact-value{display:block;margin-top:2px;color:#26454d;font-size:12px;font-weight:700;word-break:break-word}.skyai-section-label{display:block;margin:13px 0 6px;color:#6f8389;font-size:11px;font-weight:700;letter-spacing:.2px}.skyai-insight{padding:10px 11px;border-left:3px solid #0b7285;border-radius:0 5px 5px 0;background:#edf7f8;color:#31535b;line-height:1.7}.skyai-evidence{padding:10px 11px;border-radius:5px;background:#f6f8f8;color:#51656b;line-height:1.65}.skyai-evidence-copy{white-space:pre-wrap;word-break:break-word}.skyai-evidence-list{display:flex;flex-direction:column;gap:6px}.skyai-evidence-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 8px;border-bottom:1px solid #e6eeee}.skyai-evidence-item:last-child{border-bottom:0}.skyai-evidence-count{color:#0b7285;font-weight:700;white-space:nowrap}.skyai-action{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:10px 11px;border:1px solid #c9e3e5;border-radius:5px;background:#f0f9fa}.skyai-action-text{min-width:0}.skyai-action-label{display:block;color:#809197;font-size:11px}.skyai-action-name{display:block;margin-top:2px;color:#0b6677;font-weight:700;word-break:break-word}.skyai-action-note{display:block;margin-top:2px;color:#72868b;font-size:11px}.skyai-action-buttons{display:flex;flex:0 0 auto;gap:6px}.skyai-details{margin-top:10px;border-top:1px solid #e6eeee}.skyai-details summary{padding-top:9px;color:#6d8389;font-size:11px;cursor:pointer}.skyai-raw{margin-top:7px;padding:8px;background:#f5f7f7;color:#6b7d82;font:11px/1.5 Consolas,monospace;white-space:pre-wrap;word-break:break-word}.skyai-empty{padding:42px 18px;text-align:center;color:#819399}.skyai-empty strong{display:block;margin-bottom:4px;color:#476068;font-size:14px}.skyai-error{margin:14px;padding:11px;border:1px solid #e7baba;border-radius:5px;background:#fff3f3;color:#a74646;white-space:pre-wrap;word-break:break-word}',
    '.skyai-query{padding:15px}.skyai-query-label{display:block;margin-bottom:7px;color:#3d5961;font-size:13px;font-weight:700}.skyai-query-row{display:flex;align-items:flex-end;gap:8px}.skyai-query textarea{box-sizing:border-box;flex:1;width:100%;height:72px;resize:none;border:1px solid #c8dadd;border-radius:6px;padding:9px 10px;background:#fff;color:#24343a;font:13px/1.5 "Microsoft YaHei";outline:none}.skyai-query textarea:focus{border-color:#0b7285;box-shadow:0 0 0 2px rgba(11,114,133,.1)}.skyai-query-hint{margin-top:6px;color:#87979c;font-size:11px}.skyai-query-row .query-btn{height:72px;min-width:64px}.skyai-result{margin-top:15px}.skyai-result-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.skyai-result-title{color:#173f49;font-size:14px;font-weight:700}.skyai-result-count{color:#809197;font-size:11px}.skyai-summary{margin-top:9px;padding:11px 12px;border-left:3px solid #0b7285;border-radius:0 5px 5px 0;background:#edf7f8;color:#31535b;line-height:1.7}.skyai-table-wrap{margin-top:10px;border:1px solid #dce7e9;border-radius:5px;background:#fff;overflow:auto}.skyai-table{width:100%;border-collapse:collapse;font-size:12px}.skyai-table th,.skyai-table td{border-bottom:1px solid #e6eeee;padding:8px 9px;text-align:left;white-space:nowrap}.skyai-table th{background:#f5f8f8;color:#5c737a;font-weight:700}.skyai-table td{max-width:180px;overflow:hidden;text-overflow:ellipsis;color:#344e56}.skyai-table tr:last-child td{border-bottom:0}.skyai-sql{margin-top:8px;padding:9px;background:#20373e;color:#d7edef;font:11px/1.5 Consolas,monospace;white-space:pre-wrap;word-break:break-word}.skyai-trace{margin-top:8px;color:#6d8389;font-size:11px;line-height:1.7}.skyai-no-data{padding:18px;text-align:center;color:#87979c;font-size:12px}',
    '@media(max-width:600px){.skyai-panel{right:8px;bottom:78px;width:calc(100vw - 16px);height:calc(100vh - 96px)}.skyai-fab{right:16px;bottom:16px}.skyai-fact-grid{grid-template-columns:repeat(2,1fr)}.skyai-query-row{align-items:stretch;flex-direction:column}.skyai-query-row .query-btn{height:40px}.skyai-action{align-items:flex-start;flex-direction:column}.skyai-action-buttons{width:100%}.skyai-action-buttons .skyai-btn{flex:1}}'
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
  panel.innerHTML = '<div class="skyai-head"><div><b>AI 运营中心</b><span class="skyai-subtitle">经营判断与数据取数</span></div><button class="skyai-close" type="button" aria-label="关闭">×</button></div>' +
    '<div class="skyai-tabs"><div class="skyai-tab on" data-tab="diagnosis">经营诊断</div><div class="skyai-tab" data-tab="actions">待审批动作</div><div class="skyai-tab" data-tab="query">自然语言取数</div></div>' +
    '<div class="skyai-body on" data-body="diagnosis"><div class="skyai-toolbar"><button class="skyai-btn run">立即巡检</button><button class="skyai-btn alt refresh">刷新结果</button><span class="skyai-toolbar-note">先看异常，再决定动作</span></div><div class="diagnosis-content"><div class="skyai-empty"><strong>还没有巡检结果</strong>点击“立即巡检”查看今天的经营状态</div></div></div>' +
    '<div class="skyai-body" data-body="actions"><div class="skyai-toolbar"><button class="skyai-btn alt refresh-actions">刷新待办</button><span class="skyai-toolbar-note">审批后才会影响业务</span></div><div class="actions-content"><div class="skyai-empty">正在加载待审批动作</div></div></div>' +
    '<div class="skyai-body" data-body="query"><div class="skyai-query"><label class="skyai-query-label">你想了解什么？</label><div class="skyai-query-row"><textarea placeholder="例如：近 7 天销量最高的 5 个菜品是什么？"></textarea><button class="skyai-btn query-btn">查询</button></div><div class="skyai-query-hint">结果来自店内业务数据，最多展示 200 条</div><div class="query-result"></div></div></div>';
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

  var fieldLabels = {
    name: '菜品名称',
    number: '销量',
    amount: '金额（元）',
    price: '价格（元）',
    reason: '原因',
    total_orders: '订单总数',
    completed_orders: '已完成订单',
    cancelled_orders: '取消订单',
    turnover: '营业额（元）',
    avg_prepare_minutes: '平均出餐（分钟）',
    overdue_orders: '配送超时单',
    slow_orders: '慢单数',
    id: '编号'
  };

  function levelKey(level) {
    return String(level || '').toLowerCase() === 'high' ? 'high'
      : String(level || '').toLowerCase() === 'low' ? 'low' : 'medium';
  }
  function levelText(level) {
    return levelKey(level) === 'high' ? '高风险' : levelKey(level) === 'low' ? '低风险' : '需关注';
  }
  function statusText(status) {
    return status === 'HAS_ANOMALY' ? '发现异常' : status === 'NORMAL' ? '运行正常' : status === 'NO_DATA' ? '暂无数据' : '待查看';
  }
  function actionText(type) {
    if (type === 'DISABLE_DISH') return '停售菜品';
    if (type === 'PAUSE_SHOP') return '暂停接单';
    return '处理经营异常';
  }
  function fieldLabel(field) {
    return fieldLabels[field] || String(field || '').replace(/_/g, ' ');
  }
  function formatAmount(value) {
    var number = Number(value);
    return isNaN(number) ? '暂无' : number.toFixed(2) + ' 元';
  }
  function formatDate(value) {
    if (!value) return '暂无';
    var text = String(value).replace('T', ' ');
    return text.length > 16 ? text.slice(0, 16) : text;
  }
  function parseJson(value) {
    if (value == null || typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (e) { return null; }
  }
  function formatCell(value, column) {
    if (value == null || value === '') return '-';
    if (typeof value === 'number' || (!isNaN(Number(value)) && String(value).trim() !== '')) {
      var number = Number(value);
      if (/amount|price|turnover/i.test(column)) return number.toFixed(2);
      return String(value);
    }
    return /^\d{4}-\d{2}-\d{2}(?:T|\s)/.test(String(value)) ? formatDate(value) : String(value);
  }
  function renderEvidence(value) {
    var data = parseJson(value);
    if (data && !Array.isArray(data) && data.evidence != null) return renderEvidence(data.evidence);
    if (Array.isArray(data)) {
      if (!data.length) return '<div class="skyai-no-data">没有可展示的明细</div>';
      return '<div class="skyai-evidence-list">' + data.slice(0, 20).map(function (item) {
        if (item && item.reason != null) {
          return '<div class="skyai-evidence-item"><span>' + esc(item.reason) + '</span><span class="skyai-evidence-count">' + esc(item.number == null ? 0 : item.number) + ' 笔</span></div>';
        }
        if (item && item.name != null) {
          return '<div class="skyai-evidence-item"><span>' + esc(item.name) + '</span><span class="skyai-evidence-count">' + (item.number == null ? '在售中' : esc(item.number) + ' 份') + '</span></div>';
        }
        var readable = item && typeof item === 'object'
          ? Object.keys(item).map(function (key) { return fieldLabel(key) + '：' + item[key]; }).join('，')
          : item;
        return '<div class="skyai-evidence-item"><span>' + esc(readable) + '</span></div>';
      }).join('') + (data.length > 20 ? '<div class="skyai-no-data">还有 ' + (data.length - 20) + ' 条明细未展开</div>' : '') + '</div>';
    }
    if (data && typeof data === 'object') {
      return '<div class="skyai-evidence-list">' + Object.keys(data).map(function (key) {
        return '<div class="skyai-evidence-item"><span>' + esc(fieldLabel(key)) + '</span><span>' + esc(data[key]) + '</span></div>';
      }).join('') + '</div>';
    }
    return '<div class="skyai-evidence-copy">' + esc(value || '暂无') + '</div>';
  }
  function renderTrace(trace) {
    if (!trace || !trace.length) return '';
    return '<details class="skyai-details"><summary>查看分析过程</summary><div class="skyai-trace">' +
      trace.map(function (item) { return esc(item); }).join('<br>') + '</div></details>';
  }

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
    var anomalies = report.anomalies || [];
    var actions = report.actions || [];
    var impact = anomalies.reduce(function (sum, item) { return sum + (Number(item.impactAmount) || 0); }, 0);
    var hasAnomaly = report.status === 'HAS_ANOMALY';
    var html = '<div class="skyai-report-meta"><span>最近巡检：' + esc(formatDate(report.generatedAt)) + '</span><span class="skyai-status ' + (hasAnomaly ? 'warn' : '') + '">' + esc(statusText(report.status)) + '</span></div>' +
      '<div class="skyai-overview"><div class="skyai-stat"><span class="skyai-stat-label">异常项</span><strong class="skyai-stat-value">' + anomalies.length + '</strong></div>' +
      '<div class="skyai-stat"><span class="skyai-stat-label">待审批动作</span><strong class="skyai-stat-value">' + actions.length + '</strong></div>' +
      '<div class="skyai-stat"><span class="skyai-stat-label">预计影响</span><strong class="skyai-stat-value">' + (impact ? impact.toFixed(2) : '0') + ' 元</strong></div></div>';
    anomalies.forEach(function (item) {
      var risk = levelKey(item.level);
      var insight = item.rootCause || item.suggestion || '暂未生成进一步分析';
      html += '<article class="skyai-card ' + risk + '"><div class="skyai-card-head"><div><span class="skyai-chip ' + risk + '">' + esc(levelText(item.level)) + '</span><h3>' + esc(item.title || '经营异常') + '</h3></div></div>' +
        '<p class="skyai-card-conclusion">' + esc(item.conclusion || '发现一项需要关注的经营变化') + '</p>' +
        '<div class="skyai-fact-grid"><div class="skyai-fact"><span class="skyai-fact-label">当前情况</span><strong class="skyai-fact-value">' + esc(item.observed || '暂无') + '</strong></div>' +
        '<div class="skyai-fact"><span class="skyai-fact-label">参考基线</span><strong class="skyai-fact-value">' + esc(item.baseline || '暂无') + '</strong></div>' +
        '<div class="skyai-fact"><span class="skyai-fact-label">预计影响</span><strong class="skyai-fact-value">' + esc(formatAmount(item.impactAmount)) + '</strong></div></div>' +
        '<span class="skyai-section-label">AI 判断</span><div class="skyai-insight">' + esc(insight) + '</div>' +
        '<span class="skyai-section-label">数据依据</span><div class="skyai-evidence">' + renderEvidence(item.evidence) + '</div>';
      if (item.actionType) {
        html += '<div class="skyai-action"><div class="skyai-action-text"><span class="skyai-action-label">建议动作</span><strong class="skyai-action-name">' + esc(item.actionLabel || actionText(item.actionType)) + '</strong><small class="skyai-action-note">需要在“待审批动作”中确认后才会执行</small></div><span class="skyai-chip pending">待确认</span></div>';
      }
      html += '</article>';
    });
    if (!anomalies.length) html += '<div class="skyai-empty"><strong>' + esc(statusText(report.status)) + '</strong>当前没有达到阈值的经营异常</div>';
    html += renderTrace(report.agentTrace);
    container.innerHTML = html;
  }
  function showDiagnosisError(error) { panel.querySelector('.diagnosis-content').innerHTML = '<div class="skyai-error">' + esc(error.message) + '</div>'; }

  function loadActions() {
    api('/api/ai/actions/pending').then(renderActions).catch(function (error) { panel.querySelector('.actions-content').innerHTML = '<div class="skyai-error">' + esc(error.message) + '</div>'; });
  }
  function renderActions(actions) {
    var container = panel.querySelector('.actions-content');
    if (!actions || !actions.length) { container.innerHTML = '<div class="skyai-empty">暂无待审批动作</div>'; return; }
    var html = '<div class="skyai-report-meta"><span>需要你确认的经营动作</span><span class="skyai-chip pending">' + actions.length + ' 条待处理</span></div>';
    html += actions.map(function (item) {
      var target = item.target_id == null ? '' : ' · 菜品 #' + esc(item.target_id);
      return '<article class="skyai-card"><div class="skyai-card-head"><div><span class="skyai-chip pending">待审批</span><h3>' + esc(actionText(item.type)) + target + '</h3></div></div>' +
        '<div class="skyai-meta">建议时间：' + esc(formatDate(item.created_time)) + '</div>' +
        '<span class="skyai-section-label">为什么建议这样处理</span><div class="skyai-evidence">' + renderEvidence(item.evidence_json) + '</div>' +
        '<div class="skyai-action"><div class="skyai-action-text"><span class="skyai-action-label">执行影响</span><strong class="skyai-action-name">' + esc(actionText(item.type)) + (item.target_id == null ? '店铺' : '菜品 #' + item.target_id) + '</strong><small class="skyai-action-note">确认后系统会调用原有业务接口执行</small></div>' +
        '<div class="skyai-action-buttons"><button class="skyai-btn approve" data-id="' + esc(item.id) + '" data-action="' + esc(actionText(item.type)) + '">同意执行</button><button class="skyai-btn alt danger reject" data-id="' + esc(item.id) + '">驳回</button></div></div></article>';
    }).join('');
    container.innerHTML = html;
    container.querySelectorAll('.approve').forEach(function (button) { button.addEventListener('click', function () { changeAction(button, 'approve'); }); });
    container.querySelectorAll('.reject').forEach(function (button) { button.addEventListener('click', function () { changeAction(button, 'reject'); }); });
  }
  function changeAction(button, operation) {
    if (!loggedIn()) return;
    if (operation === 'approve' && !window.confirm('确认' + (button.dataset.action || '执行该动作') + '吗？')) return;
    if (operation === 'reject' && !window.confirm('确认驳回这条建议吗？')) return;
    button.disabled = true;
    api('/api/ai/actions/' + encodeURIComponent(button.dataset.id) + '/' + operation, null, 'POST').then(function (message) { alert(message || '操作完成'); loadActions(); loadLatest(); }).catch(function (error) { alert(error.message); button.disabled = false; });
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
    var columns = result.columns || [];
    var rows = result.rows || [];
    var html = '<div class="skyai-result-head"><span class="skyai-result-title">查询结果</span><span class="skyai-result-count">共 ' + rows.length + ' 条</span></div>' +
      '<div class="skyai-summary">' + esc(result.summary || '已根据店内数据完成查询') + '</div>';
    if (rows.length && columns.length) {
      html += '<div class="skyai-table-wrap"><table class="skyai-table"><thead><tr>' +
        columns.map(function (column) { return '<th>' + esc(fieldLabel(column)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (row) { return '<tr>' + columns.map(function (column) { return '<td title="' + esc(formatCell(row[column], column)) + '">' + esc(formatCell(row[column], column)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    } else {
      html += '<div class="skyai-no-data">没有符合条件的数据</div>';
    }
    html += '<details class="skyai-details"><summary>查看查询依据</summary><div class="skyai-sql">' + esc(result.sql || '暂无 SQL') + '</div>' +
      (result.trace && result.trace.length ? '<div class="skyai-trace">' + result.trace.map(function (item) { return esc(item); }).join('<br>') + '</div>' : '') + '</details>';
    container.innerHTML = html;
  }
  panel.querySelector('.run').addEventListener('click', runDiagnosis);
  panel.querySelector('.refresh').addEventListener('click', loadLatest);
  panel.querySelector('.refresh-actions').addEventListener('click', loadActions);
})();
