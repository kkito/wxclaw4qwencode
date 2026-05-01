---
name: ACP 目录选择器
description: /acp 命令支持无参数列出可配置目录、/acp N 选择对应项目进入 ACP 模式
type: spec
---

# ACP 目录选择器设计

## 需求

当前 `/acp` 必须直接传路径参数（如 `/acp /home/kkito/proj/myapp`）。用户希望：

1. `/acp`（无参数）列出 `config.json` 中配置的多个根目录下的所有一级子目录，按字母排序显示为 1.2.3.4
2. `/acp N`（N 为数字）选择第 N 个目录进入 ACP 模式
3. `/acp /some/path`（传路径）仍然直接使用该路径，兼容现有行为
4. 未配置目录时给出提示
5. 支持 Web 页面（`/settings/acp-dirs`）配置根目录列表
6. 使用无状态方案：两次扫描+排序，不依赖中间状态

## 错误处理

- 未配置目录：提示"未配置 ACP 项目目录，请前往后台配置"
- 序号无效/目录已变化：提示"序号无效或目录不存在"，停止流程

## 模块架构

```
src/acp-config/
├── store.ts          # 读写 config.json 的 acpProjectDirs 字段
├── scanner.ts        # 给定根目录列表，扫描并返回排序后的一级子目录列表
├── selector.ts       # 给定序号，再次扫描并找到对应目录
└── index.ts          # 统一导出

src/commands/acp/
├── COMMAND.md        # 更新 usage
└── handler.ts        # 精简：判断是 scan / select / direct，委托给 acp-config

src/web/
├── server.tsx        # 新增 GET/PUT /api/acp/dirs
└── views/acp-dirs.tsx # ACP 目录配置页面（表单，支持多行输入）
```

## 接口设计

### store.ts

```typescript
interface AcpConfig {
  acpProjectDirs?: string[];
}

export async function loadAcpProjectDirs(): Promise<string[]>
export async function saveAcpProjectDirs(dirs: string[]): Promise<void>
```

- 读写 `~/.ownclaw/config.json` 的 `acpProjectDirs` 字段
- 不存在或解析失败时返回空数组
- 保存时自动创建目录

### scanner.ts

```typescript
export interface ScannedDir {
  index: number;   // 1-based 序号
  name: string;    // 目录名（basename）
  path: string;    // 完整路径
  root: string;    // 所属的根目录
}

export async function scanProjectDirs(
  rootDirs: string[],
  fsDeps?: { readdir: typeof fs.readdir; stat: typeof fs.stat }
): Promise<ScannedDir[]>
```

- 对每个根目录，读取所有一级子目录
- 过滤：只保留目录（排除文件）
- 按路径字母顺序排序（localeCompare）
- 从 1 开始编号，返回 ScannedDir[]

### selector.ts

```typescript
export async function selectProjectByIndex(
  rootDirs: string[],
  index: number,
  fsDeps?: { readdir: typeof fs.readdir; stat: typeof fs.stat }
): Promise<{ path: string } | null>
```

- 调用 scanProjectDirs 获取排序列表
- 返回第 index 个目录的完整路径，或 null（超出范围）

### handler.ts

```
/acp            → scan → 无配置 → 提示去后台配置
                          → 有配置但无子目录 → 提示目录下无项目
                          → 有子目录 → 列出 1. name (root)  2. name (root) ...

/acp 2          → select → index=2 → 扫描+排序 → 找到对应目录 → createSession
                         → 找不到 → 提示"序号无效或目录不存在"

/acp /some/path → 直接 existsSync + statSync → createSession（现有逻辑不变）
```

判断逻辑：
- args.trim() === '' → scan 模式
- /^\d+$/.test(args.trim()) → select 模式
- 其他 → 直接路径模式

## Web API

- `GET /api/acp/dirs` → `{ dirs: string[] }`
- `PUT /api/acp/dirs` → `{ dirs: string[] }`，body: `{ dirs: [...] }`
- `GET /settings/acp-dirs` → 配置页面

## 单元测试

| 模块 | 测试用例 |
|------|---------|
| `store.test.ts` | load/save 读写 roundtrip、文件不存在返回空数组、目录不存在返回空数组 |
| `scanner.test.ts` | 单根目录扫描、多根目录合并、排序正确、过滤非目录、空根目录 |
| `selector.test.ts` | 正常选择、超出范围返回 null、目录不存在返回 null |
| `handler.test.ts` | scan 模式（有/无配置）、select 模式（有效/无效序号）、直接路径模式（已存在逻辑） |

## 现有行为兼容

- `/acp /some/absolute/path` 行为不变
- ACP session 创建/管理逻辑不变
- WeixinBridge 路由逻辑不变
