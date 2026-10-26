# job-tracker 求职追踪

一个前后端完整的求职投递追踪小系统：记录投递、按状态流转、安排面试、查看统计。

## 功能

- **投递列表**：新增 / 编辑 / 删除投递记录，展示公司、职位、薪资、渠道、投递日期与备注
- **按状态筛选**：全部 / 待投递 / 已投递 / 面试中 / 已录取 / 已拒绝，标签上带数量
- **状态流转**：按规则流转并做合法性校验，非法流转返回 400（见下方流转表）
- **面试安排**：为投递添加面试（时间、轮次、形式、地点、备注），支持编辑与删除；
  「已投递」的记录安排面试后自动流转为「面试中」
- **投递统计**：各状态数量、总投递、面试场次、即将开始的面试

## 技术栈

- 后端：Node.js + Express，数据持久化到 `server/data.json`
- 前端：原生 HTML / CSS / JavaScript（`client/`，由后端静态托管，同源调用 REST API）

## 目录结构

```
job-tracker/
├── package.json        # npm start 启动脚本，端口 3012
├── README.md
├── server/
│   └── index.js        # Express 后端：REST API + 静态托管前端
│   └── data.json       # 数据文件（首次启动自动生成，含 10 条示例投递）
└── client/
    ├── index.html      # 页面结构
    ├── style.css       # 样式
    └── app.js          # 前端逻辑（列表、筛选、弹窗、统计渲染）
```

## 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 启动（后端端口 3012，同时托管前端页面）
npm start

# 3. 打开浏览器访问
#    http://localhost:3012
```

- 端口固定为 **3012**；如需临时更换：`PORT=3020 npm start`
- 首次启动会自动在 `server/data.json` 写入 **10 条示例投递记录** 和 4 条示例面试安排；
  删除 `server/data.json` 后重启即可恢复初始示例数据。

## REST API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/meta` | 状态列表与流转规则 |
| GET | `/api/applications?status=` | 投递列表（可按状态筛选） |
| POST | `/api/applications` | 新增投递 `{company, position, salary?, source?, notes?}` |
| GET | `/api/applications/:id` | 投递详情 |
| PUT | `/api/applications/:id` | 编辑投递 |
| PATCH | `/api/applications/:id/status` | 状态流转 `{status}` |
| DELETE | `/api/applications/:id` | 删除投递（连同其面试安排） |
| GET | `/api/interviews?applicationId=` | 面试列表（可按投递过滤） |
| POST | `/api/interviews` | 新增面试 `{applicationId, datetime, round?, type?, location?, notes?}` |
| PUT | `/api/interviews/:id` | 编辑面试 |
| DELETE | `/api/interviews/:id` | 删除面试 |
| GET | `/api/stats` | 投递统计 |

示例：

```bash
# 列出所有投递
curl http://localhost:3012/api/applications

# 新增投递
curl -X POST http://localhost:3012/api/applications \
  -H 'Content-Type: application/json' \
  -d '{"company":"某公司","position":"前端工程师","salary":"20-30K","source":"内推"}'

# 状态流转（待投递 -> 已投递）
curl -X PATCH http://localhost:3012/api/applications/<id>/status \
  -H 'Content-Type: application/json' -d '{"status":"已投递"}'
```

## 状态流转规则

| 当前状态 | 可流转到 |
|---|---|
| 待投递 | 已投递 |
| 已投递 | 面试中、已拒绝 |
| 面试中 | 已录取、已拒绝 |
| 已录取 | —（终态） |
| 已拒绝 | 已投递（可重新投递） |
