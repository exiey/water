# 水坝监测系统

一个面向课程设计 / 原型验证的软硬件一体化项目：STM32 负责传感器采集，LoRa 负责远距离传输，ESP32-S3 作为网关接入 OneNET，`Expo + Express` 提供移动端监测界面、实时推送和 AI 分析能力。

## 项目概览

- 实时显示流量、水位、TDS、水质姿态角和 LoRa 通信状态
- 服务端通过 OneNET 拉取最新设备属性，并通过 WebSocket 推送到前端
- 前端在 WebSocket 不可用时自动降级到 HTTP 轮询
- 内置 AI 分析页，可结合当前监测数据生成中文分析结果
- 项目已移除仓库中的硬编码敏感信息，适合继续整理后开源

## 系统架构

```text
传感器 -> STM32 -> LoRa -> ESP32-S3 网关 -> OneNET -> Express Server -> Expo App
                                                      |                |
                                                      |                +-> WebSocket / HTTP
                                                      +-> AI 分析上下文 -> SSE
```

## 仓库结构

```text
.
├── Core/                         STM32 工程源码
├── Drivers/                      STM32 HAL / CMSIS
├── MDK-ARM/                      Keil 工程
├── station/                      ESP32-S3 网关工程（ESP-IDF）
├── projects/
│   ├── client/                   Expo / React Native 前端
│   ├── server/                   Express 服务端
│   └── .cozeproj/                本地开发脚本
├── water.ioc                     STM32CubeMX 工程文件
└── README.md
```

## 主要功能

### 移动端

- 监测首页展示最新传感器数据与趋势图
- AI 页面支持流式问答
- 设置页可对接后续阈值和校准能力

### 服务端

- 从 OneNET 查询设备属性
- 通过 WebSocket 广播最新监测数据
- 提供 AI SSE 接口

### 嵌入式链路

- STM32 采集传感器数据
- LoRa 传输采样结果
- ESP32-S3 解析串口数据并上报 OneNET

## 快速开始

### 1. 环境要求

- Node.js 18+
- pnpm 9+
- Expo / React Native 开发环境
- ESP-IDF（如需编译 `station/`）
- Keil 或 STM32CubeMX（如需编译 STM32 部分）

### 2. 前后端启动

```bash
cd projects
pnpm install
pnpm dev
```

默认情况下：

- 前端开发地址：Expo 启动后按终端提示访问
- 服务端地址：`http://localhost:9091`
- WebSocket 地址：`ws://localhost:9091/ws/monitoring`

你也可以分别启动：

```bash
cd projects/server
pnpm install
pnpm dev
```

```bash
cd projects/client
npm install
npx expo start --web --clear
```

## 环境变量

服务端示例配置见 `projects/server/.env.example`。

常用变量：

```env
PORT=9091
ONENET_PRODUCT_ID=your_product_id
ONENET_DEVICE_ID=your_device_id
ONENET_ACCESS_KEY=your_access_key
ONENET_DEVICE_KEY=your_device_key
ONENET_API_BASE=https://iot-api.heclouds.com
LLM_API_KEY=your_llm_api_key
```

前端示例配置见 `projects/client/.env.example`。

```env
EXPO_PUBLIC_BACKEND_BASE_URL=http://localhost:9091
```

## 当前接口

### HTTP

- `GET /api/v1/health`：健康检查
- `GET /api/v1/onenet/config`：返回公开 OneNET 配置
- `GET /api/v1/monitoring/latest`：获取最近一次监测数据
- `GET /api/v1/ai/history`：获取 AI 对话历史
- `DELETE /api/v1/ai/history`：清空 AI 对话历史
- `POST /api/v1/ai/chat`：SSE 流式 AI 分析

### WebSocket

- 路径：`/ws/monitoring`
- 消息类型：`connected`、`sensor_data`、`pong`

## 数据字段

当前监测数据结构主要包括：

- `water_flow`：瞬时流量
- `total_flow`：累计流量
- `water_level`：水位
- `water_quality`：TDS
- `euler_angle_x / y / z`：姿态角
- `lora_status`：LoRa 连接状态
- `recorded_at`：记录时间

## 嵌入式说明

### STM32

- 主工程位于 `Core/`、`Drivers/` 和 `MDK-ARM/`
- `water.ioc` 可用于 STM32CubeMX 重新生成配置

### ESP32-S3 网关

- 工程位于 `station/`
- 通过 `idf.py menuconfig` 配置 Wi-Fi 和 OneNET 参数
- 已移除示例中的明文密码日志输出

## 开源前安全建议

- 不要提交 `.env`、设备 token、OneNET access key、Wi-Fi 密码
- 即使工作区已删除敏感值，也要确认 Git 历史中没有旧凭据
- 公开仓库前，建议轮换所有曾经写入代码或提交记录的 key / token
- 编译产物、日志和本地 IDE 配置不建议纳入版本控制

## 后续可完善方向

- 补齐阈值配置与校准接口
- 增加历史数据持久化与查询
- 加入用户鉴权和权限控制
- 为网关和服务端增加测试与部署文档

## License

MIT
