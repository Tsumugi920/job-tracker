/**
 * job-tracker 求职追踪 - 后端服务
 * Node + Express，数据持久化到 server/data.json
 * 启动：npm start（端口 3012），同时托管 client/ 前端页面
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3012;
const DATA_FILE = path.join(__dirname, 'data.json');
const CLIENT_DIR = path.join(__dirname, '..', 'client');

// ---------- 常量 ----------
const STATUSES = ['待投递', '已投递', '面试中', '已录取', '已拒绝'];

// 状态流转规则：当前状态 → 允许流转到的状态
const TRANSITIONS = {
  待投递: ['已投递'],
  已投递: ['面试中', '已拒绝'],
  面试中: ['已录取', '已拒绝'],
  已录取: [],
  已拒绝: ['已投递'],
};

const SOURCES = ['官网', '内推', 'BOSS直聘', '拉勾', '猎聘', '其他'];
const INTERVIEW_TYPES = ['现场面', '视频面', '电话面', '笔试', '其他'];
const ROUNDS = ['一面', '二面', '三面', 'HR面', '笔试', '其他'];

// ---------- 数据层 ----------
let db = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

function now() {
  return new Date().toISOString();
}

// 本地时间 YYYY-MM-DDTHH:mm，与前端 datetime-local 的格式对齐
function localNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function today() {
  return localNow().slice(0, 10);
}

function saveDb() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function seedApplications() {
  const base = [
    ['字节跳动', '前端开发工程师', '已投递', '25-40K·15薪', '内推', '2026-10-18', '学长内推，简历已过筛，等 HR 约聊'],
    ['腾讯', '后端开发工程师（Go）', '面试中', '28-45K·16薪', '官网', '2026-10-12', '一面已过，二面时间已约'],
    ['阿里巴巴', '全栈开发工程师', '待投递', '30-50K·16薪', '官网', '', '需要先补一份针对 P6 的简历'],
    ['美团', 'Java 后端开发', '已拒绝', '24-38K·15.5薪', 'BOSS直聘', '2026-09-28', '二面聊得一般，已发感谢信'],
    ['网易', '游戏客户端开发（Unity）', '已投递', '22-35K·14薪', '拉勾', '2026-10-20', '笔试已完成，难度中等'],
    ['百度', '搜索算法工程师', '面试中', '30-55K·14.5薪', '猎聘', '2026-10-10', '一面聊了召回策略，感觉不错'],
    ['京东', '数据分析师', '已录取', '20-32K·14薪', '内推', '2026-09-20', 'Offer 已签，11 月入职'],
    ['小米', '嵌入式软件开发', '待投递', '21-33K·14薪', '官网', '', '想把简历里的车载项目再润色一下'],
    ['华为', 'C/C++ 开发工程师', '已投递', '25-40K·14薪', '官网', '2026-10-22', '竞争激烈，同步在准备手撕代码'],
    ['拼多多', '服务端开发工程师', '已拒绝', '35-60K·18薪', 'BOSS直聘', '2026-09-15', '加班强度劝退，没去二面'],
  ];
  return base.map(([company, position, status, salary, source, appliedDate, notes], idx) => ({
    id: idx + 1,
    company,
    position,
    status,
    salary,
    source,
    appliedDate: appliedDate || null,
    notes,
    createdAt: `2026-10-${pad(10 + idx)}T09:00:00.000Z`,
    updatedAt: `2026-10-${pad(20 + (idx % 5))}T12:00:00.000Z`,
  }));
}

function seedInterviews() {
  const base = [
    [2, '2026-10-27T14:00', '视频面', '二面', '腾讯会议', '部门 Leader 面，重点问 Go 并发'],
    [6, '2026-10-29T10:00', '现场面', '二面', '北京·百度科技园 K5', '带上论文和项目 demo'],
    [4, '2026-10-15T16:00', '视频面', '二面', '飞书会议', '聊了订单系统设计，回答一般'],
    [7, '2026-10-19T10:30', '现场面', 'HR面', '北京·亦庄京东总部', '谈薪顺利，一周内发 Offer'],
  ];
  return base.map(([applicationId, datetime, type, round, location, notes], idx) => ({
    id: idx + 1,
    applicationId,
    datetime,
    type,
    round,
    location,
    notes,
    createdAt: '2026-10-20T08:00:00.000Z',
  }));
}

function loadDb() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
      console.error('[job-tracker] data.json 解析失败，将重新生成示例数据:', err.message);
      db = null;
    }
  }
  if (!db || !Array.isArray(db.applications)) {
    db = {
      seq: 100,
      applications: seedApplications(),
      interviews: seedInterviews(),
    };
    saveDb();
    console.log(`[job-tracker] 已写入 ${db.applications.length} 条示例投递记录 -> ${DATA_FILE}`);
  }
  if (!Array.isArray(db.interviews)) db.interviews = [];
  if (!Number.isInteger(db.seq)) db.seq = 100;
}

function nextId() {
  db.seq += 1;
  return db.seq;
}

function findApp(id) {
  return db.applications.find((a) => a.id === Number(id));
}

function findInterview(id) {
  return db.interviews.find((i) => i.id === Number(id));
}

function appBrief(a) {
  if (!a) return null;
  return { id: a.id, company: a.company, position: a.position, status: a.status };
}

function interviewView(iv) {
  return { ...iv, application: appBrief(findApp(iv.applicationId)) };
}

// ---------- 应用 ----------
app.use(express.json());

// 允许跨域（方便直接用 file:// 打开前端或前后端分离部署调试）
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(CLIENT_DIR));

const api = express.Router();

// 元信息：状态列表 + 流转规则，前端据此渲染流转按钮
api.get('/meta', (req, res) => {
  res.json({ statuses: STATUSES, transitions: TRANSITIONS, sources: SOURCES, interviewTypes: INTERVIEW_TYPES, rounds: ROUNDS });
});

// ----- 投递记录 -----
api.get('/applications', (req, res) => {
  let list = db.applications;
  const { status } = req.query;
  if (status) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `无效的状态筛选：${status}` });
    list = list.filter((a) => a.status === status);
  }
  res.json([...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
});

api.get('/applications/:id', (req, res) => {
  const item = findApp(req.params.id);
  if (!item) return res.status(404).json({ error: '投递记录不存在' });
  res.json(item);
});

api.post('/applications', (req, res) => {
  const body = req.body || {};
  const company = String(body.company ?? '').trim();
  const position = String(body.position ?? '').trim();
  if (!company) return res.status(400).json({ error: '公司名称不能为空' });
  if (!position) return res.status(400).json({ error: '职位名称不能为空' });
  const item = {
    id: nextId(),
    company,
    position,
    status: '待投递',
    salary: String(body.salary ?? '').trim(),
    source: SOURCES.includes(body.source) ? body.source : '',
    appliedDate: null,
    notes: String(body.notes ?? '').trim(),
    createdAt: now(),
    updatedAt: now(),
  };
  db.applications.push(item);
  saveDb();
  res.status(201).json(item);
});

api.put('/applications/:id', (req, res) => {
  const item = findApp(req.params.id);
  if (!item) return res.status(404).json({ error: '投递记录不存在' });
  const body = req.body || {};
  for (const key of ['company', 'position', 'salary', 'notes']) {
    if (body[key] !== undefined) item[key] = String(body[key]).trim();
  }
  if (body.source !== undefined) item.source = SOURCES.includes(body.source) ? body.source : '';
  if (!item.company) return res.status(400).json({ error: '公司名称不能为空' });
  if (!item.position) return res.status(400).json({ error: '职位名称不能为空' });
  item.updatedAt = now();
  saveDb();
  res.json(item);
});

// 状态流转
api.patch('/applications/:id/status', (req, res) => {
  const item = findApp(req.params.id);
  if (!item) return res.status(404).json({ error: '投递记录不存在' });
  const target = req.body ? req.body.status : undefined;
  if (!STATUSES.includes(target)) return res.status(400).json({ error: `无效状态：${target ?? '(空)'}` });
  if (target === item.status) return res.json(item);
  const allowed = TRANSITIONS[item.status] || [];
  if (!allowed.includes(target)) {
    return res.status(400).json({
      error: `状态不能从「${item.status}」流转为「${target}」，允许流转：${allowed.length ? allowed.join('、') : '无（终态）'}`,
    });
  }
  item.status = target;
  if (target === '已投递' && !item.appliedDate) item.appliedDate = today();
  item.updatedAt = now();
  saveDb();
  res.json(item);
});

api.delete('/applications/:id', (req, res) => {
  const idx = db.applications.findIndex((a) => a.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '投递记录不存在' });
  const [removed] = db.applications.splice(idx, 1);
  db.interviews = db.interviews.filter((i) => i.applicationId !== removed.id);
  saveDb();
  res.json({ ok: true, deleted: removed.id });
});

// ----- 面试安排 -----
api.get('/interviews', (req, res) => {
  let list = db.interviews;
  const { applicationId } = req.query;
  if (applicationId) list = list.filter((i) => i.applicationId === Number(applicationId));
  res.json(list.map(interviewView).sort((a, b) => a.datetime.localeCompare(b.datetime)));
});

api.post('/interviews', (req, res) => {
  const body = req.body || {};
  const target = findApp(body.applicationId);
  if (!target) return res.status(400).json({ error: '请选择有效的投递记录' });
  if (!body.datetime) return res.status(400).json({ error: '面试时间不能为空' });
  const iv = {
    id: nextId(),
    applicationId: target.id,
    datetime: String(body.datetime),
    type: INTERVIEW_TYPES.includes(body.type) ? body.type : '视频面',
    round: ROUNDS.includes(body.round) ? body.round : '一面',
    location: String(body.location ?? '').trim(),
    notes: String(body.notes ?? '').trim(),
    createdAt: now(),
  };
  db.interviews.push(iv);
  // 已投递的记录安排了面试 → 自动流转为「面试中」
  let transitioned = false;
  if (target.status === '已投递') {
    target.status = '面试中';
    target.updatedAt = now();
    transitioned = true;
  }
  saveDb();
  res.status(201).json({ ...interviewView(iv), transitioned });
});

api.put('/interviews/:id', (req, res) => {
  const iv = findInterview(req.params.id);
  if (!iv) return res.status(404).json({ error: '面试安排不存在' });
  const body = req.body || {};
  if (body.datetime !== undefined) {
    if (!body.datetime) return res.status(400).json({ error: '面试时间不能为空' });
    iv.datetime = String(body.datetime);
  }
  for (const key of ['type', 'round']) {
    if (body[key] !== undefined) iv[key] = String(body[key]).trim() || iv[key];
  }
  for (const key of ['location', 'notes']) {
    if (body[key] !== undefined) iv[key] = String(body[key]).trim();
  }
  saveDb();
  res.json(interviewView(iv));
});

api.delete('/interviews/:id', (req, res) => {
  const idx = db.interviews.findIndex((i) => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '面试安排不存在' });
  const [removed] = db.interviews.splice(idx, 1);
  saveDb();
  res.json({ ok: true, deleted: removed.id });
});

// ----- 统计 -----
api.get('/stats', (req, res) => {
  const byStatus = {};
  STATUSES.forEach((s) => { byStatus[s] = 0; });
  db.applications.forEach((a) => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
  const sorted = [...db.interviews].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const upcoming = sorted.filter((i) => i.datetime >= localNow()).map(interviewView);
  res.json({
    total: db.applications.length,
    byStatus,
    interviewTotal: db.interviews.length,
    upcomingCount: upcoming.length,
    upcoming: upcoming.slice(0, 5),
  });
});

api.use((req, res) => res.status(404).json({ error: '接口不存在' }));
app.use('/api', api);

// 统一错误处理
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '请求体不是合法 JSON' });
  console.error('[job-tracker] 服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

loadDb();
app.listen(PORT, () => {
  console.log(`[job-tracker] 服务已启动: http://localhost:${PORT}`);
  console.log(`[job-tracker] 数据文件: ${DATA_FILE}`);
});
