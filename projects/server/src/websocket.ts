import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { fetchLatestOneNETSnapshot, type MonitoringSnapshot } from "./onenet.js";

// WebSocket 客户端类型
interface WebSocketClient extends WebSocket {
  isAlive: boolean;
}

// 全局 WebSocket 服务器实例
let wss: WebSocketServer | null = null;

// 已连接的客户端
const clients = new Set<WebSocketClient>();

// 上一次的数据（用于检测变化）
let lastData: MonitoringSnapshot | null = null;

// 轮询间隔（毫秒）
const POLLING_INTERVAL = 1000; // 1秒轮询一次 OneNET

/**
 * 初始化 WebSocket 服务器
 */
export function initWebSocket(server: any): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });

  // 处理 HTTP 升级到 WebSocket
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = request.url;

    if (pathname === "/ws/monitoring") {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
    const client = ws as WebSocketClient;
    client.isAlive = true;
    clients.add(client);

    const clientIp = request.socket.remoteAddress;
    console.log(`[WebSocket] 客户端连接: ${clientIp}, 当前连接数: ${clients.size}`);

    // 发送欢迎消息
    sendMessage(client, {
      type: "connected",
      message: "WebSocket 连接成功",
      timestamp: Date.now(),
    });

    // 如果有缓存数据，立即发送
    if (lastData) {
      sendMessage(client, {
        type: "sensor_data",
        data: lastData,
        timestamp: Date.now(),
      });
    }

    // 心跳检测
    client.on("pong", () => {
      client.isAlive = true;
    });

    // 接收客户端消息
    client.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(client, message);
      } catch (error) {
        console.error("[WebSocket] 解析消息失败:", error);
      }
    });

    // 客户端断开
    client.on("close", () => {
      clients.delete(client);
      console.log(`[WebSocket] 客户端断开, 当前连接数: ${clients.size}`);
    });
  });

  // 心跳检测定时器
  setInterval(() => {
    wss?.clients.forEach((ws) => {
      const client = ws as WebSocketClient;
      if (!client.isAlive) {
        client.terminate();
        clients.delete(client);
        return;
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  // 启动数据轮询
  startDataPolling();

  console.log("[WebSocket] 服务器已启动, 路径: /ws/monitoring");
  return wss;
}

/**
 * 处理客户端消息
 */
function handleClientMessage(client: WebSocketClient, message: any) {
  switch (message.type) {
    case "ping":
      sendMessage(client, { type: "pong", timestamp: Date.now() });
      break;

    case "refresh":
      // 手动刷新请求
      pollAndBroadcast();
      break;

    default:
      console.log("[WebSocket] 未知消息类型:", message.type);
  }
}

/**
 * 发送消息给客户端
 */
function sendMessage(client: WebSocket, data: object) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(data));
  }
}

/**
 * 广播消息给所有客户端
 */
function broadcast(data: object) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

/**
 * 启动数据轮询（从 OneNet 获取数据并推送）
 */
function startDataPolling() {
  // 立即获取一次
  pollAndBroadcast();

  // 定时轮询
  setInterval(pollAndBroadcast, POLLING_INTERVAL);
}

/**
 * 轮询 OneNet 数据并广播
 */
async function pollAndBroadcast() {
  try {
    const data = await fetchLatestOneNETSnapshot();

    if (!data) {
      return;
    }

    // 检测数据是否有变化
    const hasChanged = !lastData || dataHasChanged(lastData, data);

    if (hasChanged) {
      lastData = data;

      // 广播给所有客户端
      broadcast({
        type: "sensor_data",
        data: data,
        timestamp: Date.now(),
      });

      console.log(`[WebSocket] 数据已推送: 水位=${data.water_level}cm, 流量=${data.water_flow}L/min`);
    }
  } catch (error) {
    console.error("[WebSocket] 轮询数据失败:", error);
  }
}

/**
 * 检测数据是否有变化
 */
function dataHasChanged(oldData: MonitoringSnapshot, newData: MonitoringSnapshot): boolean {
  // 水位变化超过 0.1
  if (Math.abs(oldData.water_level - newData.water_level) > 0.1) return true;
  
  // 流量变化超过 0.1
  if (Math.abs(oldData.water_flow - newData.water_flow) > 0.01) return true;
  
  // 累计流量变化
  if (Math.abs(oldData.total_flow - newData.total_flow) > 0.1) return true;
  
  // TDS 变化超过 1
  if (Math.abs(oldData.water_quality - newData.water_quality) > 1) return true;
  
  // 姿态变化超过 1 度
  if (Math.abs(oldData.euler_angle_x - newData.euler_angle_x) > 1) return true;
  if (Math.abs(oldData.euler_angle_y - newData.euler_angle_y) > 1) return true;
  if (Math.abs(oldData.euler_angle_z - newData.euler_angle_z) > 1) return true;
  
  // LoRa 状态变化
  if (oldData.lora_status !== newData.lora_status) return true;

  return false;
}

/**
 * 手动触发数据推送（外部调用）
 */
export function pushSensorData(data: MonitoringSnapshot) {
  lastData = data;
  broadcast({
    type: "sensor_data",
    data: data,
    timestamp: Date.now(),
  });
}

/**
 * 获取当前连接数
 */
export function getConnectedClientsCount(): number {
  return clients.size;
}

/**
 * 获取最新数据
 */
export function getLastData(): MonitoringSnapshot | null {
  return lastData;
}
