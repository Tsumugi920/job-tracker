/* job-tracker 求职追踪 - 前端逻辑 */
'use strict';

// 前端默认由后端同源托管；若用 file:// 直接打开，则回退到本地 3012 端口
const API_BASE = location.protocol.startsWith('http') ? '' : 'http://localhost:3012';

const STATUS_CLASS = {
  待投递: 'st-todo',
  已投递: 'st-applied',
  面试中: 'st-interview',
  已录取: 'st-offer',
  已拒绝: 'st-reject',
};

// 流转按钮文案：目标状态 -> 按钮文字
const STATUS_ACTION = {
  已投递: '标记已投递',
  面试中: '进入面试',
  已录取: '标记录取',
  已拒绝: '标记拒绝',
};

let meta = { statuses: [], transitions: {}, sources: [], interviewTypes: [], rounds: [] };
let apps = [];
let interviews = [];
let stats = null;
let currentFilter = '全部';
let editingAppId = null; // null = 新增，否则为编辑的投递 id
let editingInterviewId = null;

const $ = (sel) => document.querySelector(sel);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// 本地时间 YYYY-MM-DDTHH:mm，与 datetime-local 值的格式一致
function localNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data = {};
  try { data = await res.json(); } catch (_) { /* 非 JSON 响应时忽略 */ }
  if (!res.ok) throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  return data;
}

function toast(message, type = 'ok') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add('hidden'), 2600);
}

async function refreshAll() {
  const [s, a, iv] = await Promise.all([
    api('/stats'),
    api('/applications'),
    api('/interviews'),
  ]);
  stats = s;
  apps = a;
  interviews = iv;
  renderStats();
  renderFilters();
  renderApps();
  renderInterviews();
}

/* ---------- 渲染 ---------- */
function renderStats() {
  const b = stats.byStatus;
  const cards = [
    { label: '总投递', value: stats.total, cls: 'c-total' },
    { label: '待投递', value: b['待投递'], cls: 'c-todo' },
    { label: '已投递', value: b['已投递'], cls: 'c-applied' },
    { label: '面试中', value: b['面试中'], cls: 'c-interview' },
    { label: '已录取', value: b['已录取'], cls: 'c-offer' },
    { label: '已拒绝', value: b['已拒绝'], cls: 'c-reject' },
    { label: '面试场次', value: stats.interviewTotal, cls: 'c-iv' },
    { label: '即将面试', value: stats.upcomingCount, cls: 'c-soon' },
  ];
  $('#stats').innerHTML = cards.map((c) => `
    <div class="stat-card ${c.cls}">
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>`).join('');
}

function renderFilters() {
  const counts = { 全部: apps.length };
  meta.statuses.forEach((s) => { counts[s] = apps.filter((a) => a.status === s).length; });
  const tabs = ['全部', ...meta.statuses];
  $('#filters').innerHTML = tabs.map((s) => `
    <button class="filter ${s === currentFilter ? 'active' : ''}" data-filter="${esc(s)}">
      ${esc(s)}<span class="count">${counts[s] ?? 0}</span>
    </button>`).join('');
}

function visibleApps() {
  return currentFilter === '全部' ? apps : apps.filter((a) => a.status === currentFilter);
}

function nextStatusButtons(app) {
  const nexts = meta.transitions[app.status] || [];
  if (!nexts.length) return '<span class="flow-end">🎉 流程已结束</span>';
  return nexts.map((s) => `
    <button class="btn tiny ${s === '已拒绝' ? 'danger' : 'soft'}"
      data-action="status" data-id="${app.id}" data-status="${esc(s)}">${STATUS_ACTION[s] || esc(s)}</button>`).join('');
}

function renderApps() {
  const list = visibleApps();
  const box = $('#app-list');
  if (!list.length) {
    box.innerHTML = `
      <div class="empty">📭 暂无「${esc(currentFilter)}」状态的投递记录<br>
      <small>点击右上角「＋ 新增投递」开始记录</small></div>`;
    return;
  }
  box.innerHTML = list.map((a) => `
    <article class="app-card">
      <div class="app-main">
        <div class="app-title">
          <strong>${esc(a.company)}</strong>
          <span class="position">${esc(a.position)}</span>
          <span class="badge ${STATUS_CLASS[a.status] || ''}">${esc(a.status)}</span>
        </div>
        <div class="app-meta">
          ${a.salary ? `<span>💰 ${esc(a.salary)}</span>` : ''}
          ${a.source ? `<span>📮 ${esc(a.source)}</span>` : ''}
          ${a.appliedDate ? `<span>📅 投递于 ${esc(a.appliedDate)}</span>` : ''}
        </div>
        ${a.notes ? `<div class="app-notes">${esc(a.notes)}</div>` : ''}
      </div>
      <div class="app-actions">
        <div class="flow-btns">${nextStatusButtons(a)}</div>
        <div class="ops">
          <button class="btn tiny soft" data-action="schedule" data-id="${a.id}">🗓️ 安排面试</button>
          <button class="btn tiny ghost" data-action="edit" data-id="${a.id}">编辑</button>
          <button class="btn tiny ghost danger-text" data-action="delete" data-id="${a.id}">删除</button>
        </div>
      </div>
    </article>`).join('');
}

function fmtDateTime(dt) {
  return String(dt || '').replace('T', ' ');
}

function renderInterviews() {
  const box = $('#interview-list');
  if (!interviews.length) {
    box.innerHTML = `
      <div class="empty small">暂无面试安排<br>
      <small>点击「＋ 安排面试」为投递添加面试</small></div>`;
    return;
  }
  const nowStr = localNow();
  box.innerHTML = interviews.map((iv) => {
    const a = iv.application || {};
    const upcoming = iv.datetime >= nowStr;
    return `
    <div class="iv-card ${upcoming ? 'upcoming' : ''}">
      <div class="iv-top">
        <span class="iv-datetime">🕒 ${esc(fmtDateTime(iv.datetime))}</span>
        <span class="badge ${upcoming ? 'st-interview' : 'st-todo'}">${upcoming ? '即将开始' : '已结束'}</span>
      </div>
      <div class="iv-company">${esc(a.company || '未知投递')} · ${esc(a.position || '')}</div>
      <div class="iv-meta">
        <span>${esc(iv.round)}</span>
        <span>${esc(iv.type)}</span>
        ${iv.location ? `<span>📍 ${esc(iv.location)}</span>` : ''}
      </div>
      ${iv.notes ? `<div class="iv-notes">${esc(iv.notes)}</div>` : ''}
      <div class="iv-actions">
        <button class="btn tiny ghost" data-iv-action="edit" data-id="${iv.id}">编辑</button>
        <button class="btn tiny ghost danger-text" data-iv-action="delete" data-id="${iv.id}">删除</button>
      </div>
    </div>`;
  }).join('');
}

/* ---------- 弹窗 ---------- */
function openModal(id) {
  $('#mask').classList.remove('hidden');
  $(`#${id}`).classList.remove('hidden');
  const first = $(`#${id}`).querySelector('input, select, textarea');
  if (first) first.focus();
}

function closeModals() {
  $('#mask').classList.add('hidden');
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  editingAppId = null;
  editingInterviewId = null;
}

function openAppModal(app) {
  editingAppId = app ? app.id : null;
  $('#modal-app-title').textContent = app ? `编辑投递：${app.company}` : '新增投递';
  const form = $('#form-app');
  form.reset();
  if (app) {
    form.company.value = app.company;
    form.position.value = app.position;
    form.salary.value = app.salary || '';
    form.source.value = app.source || '';
    form.notes.value = app.notes || '';
  }
  openModal('modal-app');
}

function openInterviewModal(iv, presetAppId) {
  if (!apps.length) {
    toast('请先添加一条投递记录', 'err');
    return;
  }
  editingInterviewId = iv ? iv.id : null;
  $('#modal-interview-title').textContent = iv ? '编辑面试安排' : '安排面试';
  const sel = $('#iv-app-select');
  sel.innerHTML = apps.map((a) => `
    <option value="${a.id}">${esc(a.company)} · ${esc(a.position)}（${esc(a.status)}）</option>`).join('');
  const form = $('#form-interview');
  form.reset();
  if (iv) {
    sel.value = iv.applicationId;
    form.datetime.value = iv.datetime;
    form.round.value = iv.round;
    form.type.value = iv.type;
    form.location.value = iv.location || '';
    form.notes.value = iv.notes || '';
  } else if (presetAppId) {
    sel.value = presetAppId;
  }
  openModal('modal-interview');
}

/* ---------- 事件 ---------- */
$('#form-app').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    company: f.company.value.trim(),
    position: f.position.value.trim(),
    salary: f.salary.value.trim(),
    source: f.source.value,
    notes: f.notes.value.trim(),
  };
  try {
    if (editingAppId) {
      await api(`/applications/${editingAppId}`, { method: 'PUT', body });
      toast('投递记录已更新');
    } else {
      await api('/applications', { method: 'POST', body });
      toast('投递记录已添加');
    }
    closeModals();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'err');
  }
});

$('#form-interview').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    applicationId: Number(f.applicationId.value),
    datetime: f.datetime.value,
    round: f.round.value,
    type: f.type.value,
    location: f.location.value.trim(),
    notes: f.notes.value.trim(),
  };
  try {
    if (editingInterviewId) {
      await api(`/interviews/${editingInterviewId}`, { method: 'PUT', body });
      toast('面试安排已更新');
    } else {
      const r = await api('/interviews', { method: 'POST', body });
      toast(r.transitioned ? '面试已安排，投递状态自动流转为「面试中」' : '面试已安排');
    }
    closeModals();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'err');
  }
});

$('#app-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  const { action, status } = btn.dataset;
  try {
    if (action === 'status') {
      const updated = await api(`/applications/${id}/status`, { method: 'PATCH', body: { status } });
      toast(`「${app.company}」状态已更新为「${updated.status}」`);
      await refreshAll();
    } else if (action === 'schedule') {
      openInterviewModal(null, id);
    } else if (action === 'edit') {
      openAppModal(app);
    } else if (action === 'delete') {
      if (!confirm(`确定删除「${app.company} - ${app.position}」这条投递记录吗？`)) return;
      await api(`/applications/${id}`, { method: 'DELETE' });
      toast('投递记录已删除');
      await refreshAll();
    }
  } catch (err) {
    toast(err.message, 'err');
  }
});

$('#interview-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-iv-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const iv = interviews.find((i) => i.id === id);
  if (!iv) return;
  try {
    if (btn.dataset.ivAction === 'edit') {
      openInterviewModal(iv);
    } else if (btn.dataset.ivAction === 'delete') {
      if (!confirm('确定删除这场面试安排吗？')) return;
      await api(`/interviews/${id}`, { method: 'DELETE' });
      toast('面试安排已删除');
      await refreshAll();
    }
  } catch (err) {
    toast(err.message, 'err');
  }
});

$('#filters').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  renderFilters();
  renderApps();
});

$('#btn-add-app').addEventListener('click', () => openAppModal(null));
$('#btn-add-interview').addEventListener('click', () => openInterviewModal(null));
$('#mask').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModals();
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModals();
});

/* ---------- 初始化 ---------- */
async function init() {
  try {
    meta = await api('/meta');
    $('#conn-status').textContent = '● 服务已连接';
    $('#conn-status').classList.remove('off');
    await refreshAll();
  } catch (err) {
    $('#conn-status').textContent = '● 服务未连接';
    $('#conn-status').classList.add('off');
    $('#stats').innerHTML = '';
    $('#filters').innerHTML = '';
    $('#interview-list').innerHTML = '';
    $('#app-list').innerHTML = `
      <div class="empty">⚠️ 无法连接后端服务（${esc(err.message)}）<br>
      <small>请先在项目根目录执行 <code>npm start</code>，然后刷新页面</small></div>`;
  }
}

init();
