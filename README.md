# 韩语 YouTube 中文字幕插件

一个 Chrome Manifest V3 插件，自动把 YouTube 视频里**已显示的韩语 CC 字幕**实时翻译成中文，叠加在原字幕正下方。

## 目标用户

看韩语游戏直播 / 视频，但**不懂韩语**的非韩语母语者。

## 功能（v1 现状）

| 功能 | 说明 |
|------|------|
| 实时翻译 | 监听 YouTube CC 字幕 DOM 变化，自动翻译并叠加中文 |
| 双引擎 | 默认用 Google 翻译（免费）；填入 DeepL API Key 后切换为 DeepL（质量更好） |
| 术语校正 | 机翻后用 `glossary/ko-zh-game-terms.csv` 校正游戏术语、人名、口头禅 |
| 开关 + 状态 | Popup 一键开关，绿点/灰点实时显示插件是否工作 |
| 无字幕引导 | 检测到没有 CC 字幕时，5 秒后提示用户开启韩语 CC |
| 切换视频 | YouTube 站内切视频（SPA）后自动重置，无需刷新页面 |
| 失败回退 | 翻译失败时显示原韩语 + 红色背景提示，不崩溃不空白 |

**使用前提**：需先在 YouTube 播放器中打开韩语 CC 字幕（CC 按钮 → 选择 Korean）。

## 技术栈

- **Chrome Extension Manifest V3**，原生 ES Modules
- **翻译引擎**：免费 Google 翻译（默认）/ DeepL Free API（可选）
- **后端**（后续阶段，代码完成待部署）：FastAPI + PostgreSQL，提供翻译历史 API
- **测试**：Node.js 内置测试器（`node --test`）

## 本地开发

### 1. 加载插件

```bash
# 克隆仓库
git clone https://github.com/Junhui1119/youtube-korean-translator.git
cd youtube-korean-translator
```

1. 打开 Chrome `chrome://extensions/`
2. 开启右上角 **Developer mode**
3. 点击 **Load unpacked** → 选择本仓库目录
4. 打开任意 YouTube 视频，开启韩语 CC，点工具栏插件图标

### 2. 配置 DeepL（可选，翻译质量更好）

1. 在 [deepl.com/pro-api](https://www.deepl.com/pro-api) 注册免费账号，获取 API Key
2. 点击浏览器工具栏插件图标，将 Key 粘贴到输入框，点**保存**
3. Popup 显示"当前引擎：DeepL"即生效

> API Key 仅保存在本机 `chrome.storage.local`，不会上传任何服务器。

### 3. 运行测试

```bash
npm test
```

### 4. 扩充术语库

编辑 `glossary/ko-zh-game-terms.csv`，增加词条，重新加载扩展即生效，无需改代码。

格式：`korean,chinese,category,note`

## 后端本地启动（可选）

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql://localhost:5432/ykt"
export TEST_DATABASE_URL="postgresql://localhost:5432/ykt_test"
uvicorn main:app --reload
```

运行测试（需本地 PostgreSQL）：

```bash
backend/.venv/bin/pytest
```

## 路线图

- **v1（当前）**：基于 CC 字幕的实时翻译，零后端，装上即用
- **v2（规划中）**：语音识别，无需字幕轨
  - 阶段 2a：Web Speech API（低延迟，先验证质量）
  - 阶段 2b：Deepgram 流式 API（~300ms 延迟，质量好）
- **后续**：账号体系、翻译历史、生词本（后端已就绪）

## License

MIT
