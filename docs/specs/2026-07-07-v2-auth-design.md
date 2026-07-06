# Design: v2 账号体系（注册/登录/JWT）

Date: 2026-07-07
Status: Approved

## 目标

- 为用户提供邮箱 + 密码注册/登录
- 登录后获得 JWT，替换临时的 `X-User-Id` 头鉴权
- popup 内嵌登录视图，无需跳转外部页面
- 为后续历史记录接入真实账号打基础

## 非目标

- 不做 refresh token（JWT 有效期 30 天，MVP 够用）
- 不做邮件验证（注册即可用）
- 不做邀请码或管理员审批
- 不做密码重置
- 不做 OAuth（Google/GitHub 登录）
- 不做 Web 控制台登录界面（仅 popup）

---

## 后端设计

### 新增接口

```
POST /api/auth/register
Content-Type: application/json

{ "email": "user@example.com", "password": "secret123" }
```

响应（201）：
```json
{ "token": "<jwt>", "user_id": "<uuid>", "email": "user@example.com" }
```

错误：
- `409` — 邮箱已注册
- `422` — 参数校验失败（邮箱格式、密码最短 8 位）

```
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "secret123" }
```

响应（200）：
```json
{ "token": "<jwt>", "user_id": "<uuid>", "email": "user@example.com" }
```

错误：
- `401` — 邮箱不存在或密码错误（统一报错，不区分两种情况）
- `422` — 参数校验失败

### JWT 规格

- 算法：HS256
- Payload：`{ "sub": "<user_uuid>", "exp": <now + 30 天> }`
- Secret：从环境变量 `JWT_SECRET` 读取
- 库：`PyJWT`

### 密码安全

- 哈希：`bcrypt`（`passlib[bcrypt]`）
- 最短 8 位，无其他复杂度要求（MVP）

### 鉴权依赖替换

原 `get_current_user_id`（读 `X-User-Id` 头）替换为 `verify_jwt`：

```python
def verify_jwt(authorization: str = Header(...)) -> uuid.UUID:
    # 读 Authorization: Bearer <token>
    # 验证签名和 exp
    # 返回 user_id (UUID)
    # 失败抛 401
```

所有需要用户身份的路由（`/api/history`）改用此依赖。

### Schema 变更

`users` 表新增列：
```sql
ALTER TABLE users ADD COLUMN password_hash text NOT NULL DEFAULT '';
```

注：开发环境无生产数据，直接修改 `schema.sql` 并重建表。

### 新增环境变量

`.env.example` 新增：
```
JWT_SECRET=your-random-secret-here
```

### 新增依赖

`requirements.txt` 新增：
```
PyJWT>=2.8.0
passlib[bcrypt]>=1.7.4
```

---

## 扩展设计

### chrome.storage.local 新增字段

- `jwt`：字符串，登录后的 JWT token，默认空
- `userEmail`：字符串，登录后的用户邮箱，用于主视图展示，默认空

### popup 视图切换逻辑

```
打开 popup
  ↓
读 chrome.storage.local: jwt, backendUrl
  ↓
backendUrl 为空？
  └─ 是 → 主视图（显示"请先配置后端地址才能登录"提示）
  ↓
jwt 为空 或 已过期（解码 JWT payload 的 base64 中段，读 exp 字段与 Date.now()/1000 比较）？
  ├─ 是 → 登录视图
  └─ 否 → 主视图
```

### 登录视图

HTML 结构（在现有 popup.html 内新增，默认隐藏）：

- 邮箱输入框
- 密码输入框
- 模式切换链接："没有账号？注册" / "已有账号？登录"
- 提交按钮（文字随模式变化："登录" / "注册"）
- 错误提示区

行为：
- 提交 → 调 `{backendUrl}/api/auth/login` 或 `/api/auth/register`
- 成功 → 存 `jwt` 和 `userEmail` 到 `chrome.storage.local` → 切主视图
- 失败 → 显示后端返回的错误信息（409/401/422）

### 主视图变更

- 顶部新增已登录用户邮箱展示（`user@example.com`）
- 新增"退出"按钮 → 清除 `chrome.storage.local` 中的 `jwt` 和 `userEmail` → 切登录视图

### background.js 变更

调用后端翻译时，从 `chrome.storage.local` 读 `jwt` 并带入请求头：

```javascript
headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${cachedJwt}`,
}
```

storage 初始化和 `onChanged` 监听加入 `jwt` 字段。

---

## 文件变更清单

**后端：**
- `backend/schema.sql` — users 表加 `password_hash` 列
- `backend/auth_service.py`（新建）— bcrypt 密码哈希、JWT 签发/验证
- `backend/main.py` — 新增 `/api/auth/register`、`/api/auth/login` 路由；`verify_jwt` 替换 `get_current_user_id`
- `backend/requirements.txt` — 新增 `PyJWT`、`passlib[bcrypt]`
- `backend/.env.example` — 新增 `JWT_SECRET`
- `backend/tests/test_auth.py`（新建）— 注册/登录/JWT 验证测试

**扩展：**
- `extension/popup.html` — 新增登录视图 HTML
- `extension/popup.js` — 视图切换逻辑、登录/注册表单提交、退出
- `extension/background.js` — 读取 jwt 并带入后端翻译请求头

---

## 验收标准

1. `POST /api/auth/register` 新邮箱返回 201 + JWT
2. 重复邮箱返回 409
3. `POST /api/auth/login` 正确密码返回 200 + JWT，错误密码返回 401
4. JWT 可解码，`sub` 为注册用户的 UUID，`exp` 约 30 天后
5. `GET /api/history` 携带有效 JWT 返回 200，无 JWT 返回 401
6. popup 未登录时显示登录视图
7. 登录成功后切主视图，顶部显示邮箱
8. 退出后清除 JWT，切回登录视图
9. JWT 过期（客户端判断）时自动显示登录视图
