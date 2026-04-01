# 大坝监测系统 (Dam Monitoring System)

一款基于 Expo + Express 的智能大坝监测移动应用，实现实时数据可视化、AI 智能分析和远程阈值配置。

## 功能特性

### 实时监测
- 瞬时流量 / 累计流量实时曲线图
- 水位高度实时监测
- TDS 水质指标监测
- 欧拉角（横滚/俯仰/偏航）姿态监测
- LoRa 无线模块连通性状态
- WebSocket 实时推送 + HTTP 轮询双保险机制

### AI 智能分析
- 基于大语言模型的智能数据分析
- SSE 流式输出，实时响应
- 支持自然语言查询监测数据
- 自动生成数据异常分析报告

### 系统设置
- 各参数阈值告警配置
- 传感器校准参数设置
- 下拉选择器快速切换参数

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Expo 54 + React Native |
| 路由导航 | Expo Router (Tabs) |
| 图表库 | react-native-gifted-charts |
| 选择器 | @react-native-picker/picker |
| SSE 客户端 | react-native-sse |
| 后端框架 | Express.js |
| 实时通信 | WebSocket (ws) |
| AI 能力 | 大语言模型 SDK |
| IoT 平台 | 中国移动物联网平台 (OneNET) |

## 项目结构

```
├── client/                          # Expo 前端
│   ├── app/                         # Expo Router 路由
│   │   ├── _layout.tsx              # 根布局
│   │   ├── (tabs)/                  # Tab 导航
│   │   │   ├── _layout.tsx          # Tab 布局
│   │   │   ├── index.tsx            # 监测页（首页）
│   │   │   ├── ai.tsx               # AI 分析页
│   │   │   └── settings.tsx         # 设置页
│   │   └── +not-found.tsx           # 404 页面
│   ├── screens/                     # 页面组件实现
│   │   ├── monitoring/              # 监测页面
│   │   ├── ai/                      # AI 分析页面
│   │   └── settings/                # 设置页面
│   ├── components/                  # 公共组件
│   ├── hooks/                       # 自定义 Hooks
│   │   ├── useTheme.ts              # 主题 Hook
│   │   └── useWebSocket.ts          # WebSocket Hook
│   ├── constants/                   # 常量配置
│   └── utils/                       # 工具函数
│
├── server/                          # Express 后端
│   ├── src/
│   │   ├── index.ts                 # 服务入口
│   │   ├── websocket.ts             # WebSocket 服务
│   │   ├── onenet.ts                # OneNET 平台对接
│   │   └── routes/                  # API 路由
│   │       ├── ai.ts                # AI 分析接口
│   │       ├── thresholds.ts        # 阈值配置接口
│   │       └── calibrations.ts      # 校准参数接口
│   └── package.json
│
├── package.json                     # Monorepo 配置
└── README.md
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8
- Expo CLI

### 安装依赖

```bash
# 安装前端依赖
cd client && npx expo install

# 安装后端依赖
cd server && pnpm install
```

### 配置环境变量

在 `server/` 目录创建 `.env` 文件：

```env
# OneNET 平台配置
ONENET_PRODUCT_ID=your_product_id
ONENET_DEVICE_NAME=your_device_name
ONENET_ACCESS_KEY=your_access_key

# AI 服务配置（可选）
LLM_API_KEY=your_api_key
```

### 启动开发服务

```bash
# 同时启动前后端
npm run dev

# 或分别启动
cd server && pnpm run dev    # 后端 :9091
cd client && npx expo start  # 前端
```

### 访问应用

- 前端 Web: http://localhost:5000
- 后端 API: http://localhost:9091
- WebSocket: ws://localhost:9091/ws/monitoring

## API 接口

### 监测数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/monitoring/latest` | 获取最新监测数据 |
| GET | `/api/v1/monitoring?limit=20` | 获取历史数据列表 |

### AI 分析

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/ai/chat` | AI 对话（SSE 流式） |
| GET | `/api/v1/ai/history` | 获取对话历史 |
| DELETE | `/api/v1/ai/history` | 清空对话历史 |

### 阈值配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/thresholds` | 获取所有阈值配置 |
| PUT | `/api/v1/thresholds/:type` | 更新指定参数阈值 |

### 校准参数

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/calibrations` | 获取所有校准参数 |
| PUT | `/api/v1/calibrations/:type` | 更新指定参数校准值 |

## 数据流架构

```
┌──────────┐    UART    ┌──────────┐    无线    ┌──────────┐    UART    ┌──────────┐
│  传感器   │ ────────► │  STM32   │ ────────► │  LoRa    │ ────────► │  LoRa    │
│  模组    │           │  主控    │           │  发射端  │           │  接收端  │
└──────────┘           └──────────┘           └──────────┘           └─────┬────┘
                                                                    │
                                                              UART/SPI
                                                                    │
                                                                    ▼
                                                             ┌──────────┐
                                                             │ ESP32-S3 │
                                                             │  网关    │
                                                             └─────┬────┘
                                                                   │
                                                            WiFi/4G
                                                                   │
                                                                   ▼
┌──────────┐     HTTP API      ┌──────────┐     WebSocket     ┌──────────┐
│  Expo    │ ◄──────────────── │ Express  │ ◄──────────────── │ OneNET   │
│  App     │                   │ Server   │                   │ 云平台   │
└──────────┘                   └──────────┘                   └──────────┘
     │
     │ SSE
     ▼
┌──────────┐
│  AI 分析 │
│  (LLM)   │
└──────────┘
```

**数据传输链路：**
1. **采集层**：传感器模组采集流量、水位、TDS、姿态角等数据
2. **控制层**：STM32 主控芯片处理传感器数据
3. **传输层**：LoRa 无线模块实现远距离数据传输
4. **网关层**：ESP32-S3 接收 LoRa 数据并上传云端
5. **云平台**：OneNET 物联网平台存储和管理数据
6. **应用层**：Express 服务端 + Expo 移动端展示分析

## UI 设计

采用**纯白极简商务风**设计语言：

- 纯白背景 (#FFFFFF)
- 近黑主色 (#111111)
- 极细线条分割
- 大留白排版
- 清晰的信息层级

## 开发指南

### 静态检查

```bash
npm run lint          # 全量检查
npm run lint:client   # 前端检查
npm run lint:server   # 后端检查
```

### 路径别名

前端使用 `@/` 别名指向 `client/` 目录：

```tsx
import { Screen } from '@/components/Screen';
import { useTheme } from '@/hooks/useTheme';
```

### 依赖安装规范

| 目录 | 命令 |
|------|------|
| client/ | `npx expo install <package>` |
| server/ | `pnpm add <package>` |

## License

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request。
