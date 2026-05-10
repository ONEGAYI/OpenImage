# Fork 会话分支功能设计

## 概述

将当前"同一 session 内 fork_from 标记"机制改造为"真正创建新 session + 物理拷贝图片"的独立分支。用户点击 Fork 后立即获得一个完整独立的新会话，后续两个分支互不影响。

## 设计决策

| 决策项 | 选择 | 原因 |
|--------|------|------|
| 触发时机 | 点击即 Fork | 减少用户认知负担，所见即所得 |
| 命名规则 | `原名 (Fork #N)` | 支持多次 fork 递增编号 |
| 切换行为 | 自动切换到新 session | 用户直接在新分支上工作 |
| 拷贝范围 | 目标图片及之前所有图 | 保留完整历史，最大保留数据 |
| 文件处理 | 物理拷贝 | 两个分支完全独立，删除原 session 不影响分支 |
| API 上下文 | 保留 response_id 链 | 保持 OpenAI responses 模式的多步迭代能力 |
| 实现方式 | 后端 Fork API | 事务原子性，前端逻辑极简 |

## 后端：Fork API

### 新端点 `POST /api/sessions/{session_id}/fork`

**请求体：**

```json
{
  "image_id": "img_xxx"
}
```

**处理流程：**

1. 查询目标图片记录，验证存在性，获取其 `step` 和 `session_id`
2. 查询 Fork 编号：统计 `LIKE '原名 (Fork #%)'` 的 session 数量，确定 N
3. 创建新 session，命名 `原名 (Fork #N)`，`head_response_id` 设为目标图片的 `response_id`
4. 物理拷贝：将原始 session 目录下 `step <= 目标.step` 对应的图片文件拷贝到新 session 目录
5. 数据库拷贝：将目标图片及其之前（`step <= 目标.step`）的所有记录插入新 session
   - `id` 重新生成（避免主键冲突）
   - `response_id`、`prompt`、`revised_prompt`、`parent_image_id`、`step`、`size`、`quality`、`output_format` 全部保留原值
   - `session_id` 指向新 session
   - `file_path` 更新为新 session 目录下的路径
   - `created_at` 保持原值
6. 返回新 session 信息

**执行顺序**：先拷贝文件（文件系统操作不可回滚），成功后再执行数据库插入。文件拷贝失败时直接报错，不写入数据库。

### 移除的旧逻辑

- `GenerateRequest.fork_from` 字段
- `_resolve_previous()` 中的 `fork_from` 分支

## 前端改造

### DetailPanel

`handleFork` / `handleForkLast` 改为直接调用 Fork API：

```
点击 Fork → 调用 POST /api/sessions/{id}/fork → 刷新会话列表 → selectSession(newId) → Toast 提示
```

按钮增加 loading 状态防止重复点击。

### api.ts 新增

```typescript
export async function forkSession(sessionId: string, imageId: string): Promise<Session>
```

### 需要移除的前端代码

- `generationStore.pendingForkFrom` 状态及 `setPendingForkFrom` 方法
- `InputArea.tsx` 中 `pendingForkFrom` 相关的提示条 UI
- `startGeneration` 的 `forkFrom` 参数
- `GenerateRequest.fork_from` 类型定义

## 错误处理与边界情况

### 错误处理

| 场景 | 后端响应 | 前端行为 |
|------|---------|---------|
| 图片不存在 | 404 | Toast "源图片未找到" |
| Session 不存在 | 404 | Toast "会话未找到" |
| 文件拷贝失败 | 500 | 数据库不写入，Toast "分支创建失败" |
| 快速重复点击 | — | 按钮 loading 状态防重复 |

### 边界情况

- **Fork 编号计数**：通过 `LIKE '原名 (Fork #%)'` 查询已有 session 数量确定 N。编号可能跳号（删除某个 Fork 后），行为可接受
- **目标图片无 response_id**：`head_response_id` 设为 NULL，新 session 从零开始
- **空 session Fork**（无图片）：不应出现此场景，前端 Fork 按钮仅在选中图片时显示

## 测试

### 后端测试（test_session.py 新增）

- 基本拷贝：验证新 session 包含正确数量的图片、step 顺序、文件存在
- response_id 保留：验证新 session 的 head_response_id 与目标图片一致
- 编号递增：多次 fork 后命名正确
- 独立性：删除原 session 后新 session 的图片和文件不受影响
- 错误场景：fork 不存在的图片返回 404

### 前端手动验证

- 点击 Fork 后自动切换到新 session
- 新 session 包含完整图片历史
- 新 session 可继续正常生成
- 删除原 session 不影响分支
