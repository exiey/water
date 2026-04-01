import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

// WebSocket 消息类型
interface WSMessage {
  type: string;
  data?: any;
  message?: string;
  timestamp?: number;
  deviceId?: string;
}

// 连接状态
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Hook 返回值
interface UseWebSocketReturn {
  status: ConnectionStatus;
  data: any | null;
  error: string | null;
  send: (message: object) => void;
  reconnect: () => void;
  disconnect: () => void;
}

// 重连配置
const RECONNECT_INTERVAL = 5000; // 5秒重连
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * WebSocket Hook - 用于实时数据推送
 * @param url WebSocket 服务器地址
 */
export function useWebSocket(url: string | null): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef(false);

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (!url || isUnmountedRef.current) return;

    // Web 端使用 HTTP URL 转换
    const wsUrl = url.replace(/^http/, 'ws') + '/ws/sensors';

    // 清理旧连接
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');
    setError(null);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }
        setStatus('connected');
        setError(null);
        reconnectAttemptsRef.current = 0;
        console.log('[WebSocket] 已连接:', wsUrl);
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              console.log('[WebSocket] 服务器确认连接');
              break;

            case 'sensor_data':
              setData(message.data);
              break;

            case 'pong':
              // 心跳响应
              break;

            default:
              console.log('[WebSocket] 收到消息:', message.type);
          }
        } catch (e) {
          console.error('[WebSocket] 解析消息失败:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] 连接错误:', event);
        setStatus('error');
        setError('WebSocket 连接错误');
      };

      ws.onclose = () => {
        console.log('[WebSocket] 连接关闭');
        setStatus('disconnected');
        
        // 尝试重连
        if (!isUnmountedRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          console.log(`[WebSocket] ${RECONNECT_INTERVAL / 1000}秒后尝试重连 (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_INTERVAL);
        }
      };

    } catch (e) {
      console.error('[WebSocket] 创建连接失败:', e);
      setStatus('error');
      setError('无法创建 WebSocket 连接');
    }
  }, [url]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  // 重连
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    disconnect();
    connect();
  }, [connect, disconnect]);

  // 发送消息
  const send = useCallback((message: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // 组件挂载时连接
  useEffect(() => {
    isUnmountedRef.current = false;
    
    if (url && Platform.OS !== 'web') {
      connect();
    } else if (Platform.OS === 'web' && url) {
      connect();
    }

    return () => {
      isUnmountedRef.current = true;
      disconnect();
    };
  }, [url, connect, disconnect]);

  // 心跳保活
  useEffect(() => {
    if (status !== 'connected') return;

    const heartbeatInterval = setInterval(() => {
      send({ type: 'ping' });
    }, 30000);

    return () => clearInterval(heartbeatInterval);
  }, [status, send]);

  return {
    status,
    data,
    error,
    send,
    reconnect,
    disconnect,
  };
}

/**
 * 获取 WebSocket URL
 */
export function getWebSocketUrl(): string | null {
  const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
  if (!baseUrl) return null;
  
  // 转换为 WebSocket URL
  let wsUrl = baseUrl.replace(/^http/, 'ws');
  
  // 检查是否已经包含 WebSocket 路径
  if (!wsUrl.endsWith('/ws/sensors')) {
    wsUrl += '/ws/sensors';
  }
  
  return wsUrl;
}
