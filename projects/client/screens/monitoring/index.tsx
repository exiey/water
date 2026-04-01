import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import { FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface MonitoringData {
  id: number;
  water_flow: number;
  total_flow: number;
  water_level: number;
  water_quality: number;
  euler_angle_x: number;
  euler_angle_y: number;
  euler_angle_z: number;
  lora_status: string;
  recorded_at: string;
}

interface MonitoringRealtimeMessage {
  type: 'connected' | 'snapshot' | 'monitoring_update';
  data?: MonitoringData;
  timestamp: string;
}

function getMonitoringWebSocketUrl(baseUrl?: string): string | null {
  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/monitoring';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (error) {
    console.error('构建 WebSocket 地址失败:', error);
    return null;
  }
}

function mergeLatestData(previous: MonitoringData[], incoming: MonitoringData): MonitoringData[] {
  if (previous.length === 0) {
    return [incoming];
  }

  if (previous[0]?.id === incoming.id) {
    return [incoming, ...previous.slice(1, 20)];
  }

  return [incoming, ...previous.filter(item => item.id !== incoming.id).slice(0, 19)];
}

export default function MonitoringScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [data, setData] = useState<MonitoringData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'polling' | 'disconnected'>('connecting');

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenActiveRef = useRef(false);

  const fetchData = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/monitoring?limit=20`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        return true;
      }
    } catch (error) {
      console.error('获取监测数据失败:', error);
    }

    return false;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await fetchData();
    setLoading(false);
  }, [fetchData]);

  const stopPolling = useCallback(() => {
    if (!pollingIntervalRef.current) {
      return;
    }

    clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null;
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    setConnectionStatus('polling');

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/monitoring/latest`);
        const result = await response.json();
        if (result.success && result.data) {
          setData(previous => mergeLatestData(previous, result.data));
          setConnectionStatus('polling');
        } else {
          setConnectionStatus('disconnected');
        }
      } catch (error) {
        console.error('轮询最新数据失败:', error);
        setConnectionStatus('disconnected');
      }
    }, 5000);
  }, [stopPolling]);

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimeoutRef.current) {
      return;
    }

    clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
  }, []);

  const closeWebSocket = useCallback(() => {
    const socket = websocketRef.current;
    websocketRef.current = null;
    if (socket) {
      socket.close();
    }
  }, []);

  function scheduleReconnect(): void {
    if (!screenActiveRef.current || reconnectTimeoutRef.current) {
      return;
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (screenActiveRef.current) {
        connectWebSocket();
      }
    }, 3000);
  }

  function connectWebSocket(): void {
    const url = getMonitoringWebSocketUrl(EXPO_PUBLIC_BACKEND_BASE_URL);
    if (!url) {
      startPolling();
      return;
    }

    clearReconnectTimer();
    closeWebSocket();
    setConnectionStatus('connecting');

    const socket = new WebSocket(url);
    websocketRef.current = socket;

    socket.onopen = () => {
      stopPolling();
      setConnectionStatus('connected');
    };

    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as MonitoringRealtimeMessage;
        if ((message.type === 'snapshot' || message.type === 'monitoring_update') && message.data) {
          setData(previous => mergeLatestData(previous, message.data as MonitoringData));
        }
      } catch (error) {
        console.error('解析 WebSocket 数据失败:', error);
      }
    };

    socket.onerror = error => {
      console.error('WebSocket 连接失败:', error);
    };

    socket.onclose = () => {
      if (websocketRef.current === socket) {
        websocketRef.current = null;
      }

      if (!screenActiveRef.current) {
        return;
      }

      startPolling();
      scheduleReconnect();
    };
  }

  useFocusEffect(
    useCallback(() => {
      screenActiveRef.current = true;
      void loadAll();
      connectWebSocket();

      return () => {
        screenActiveRef.current = false;
        clearReconnectTimer();
        stopPolling();
        closeWebSocket();
      };
    }, [clearReconnectTimer, closeWebSocket, loadAll, stopPolling])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const syncFromCloud = async () => {
    setSyncing(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/onenet/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();
      if (result.success) {
        await loadAll();
      } else {
        console.error('云端同步失败:', result.error);
      }
    } catch (error) {
      console.error('同步数据失败:', error);
    }
    setSyncing(false);
  };

  const chartData = useMemo(() => {
    if (data.length === 0) {
      return { flow: [], level: [], tds: [] };
    }

    const sortedData = [...data].reverse();
    const count = sortedData.length;

    return {
      flow: sortedData.map((item, index) => ({
        value: item.water_flow,
        label: index >= count - 3 ? item.recorded_at.slice(11, 16) : '',
        dataPointText: index === count - 1 ? `${item.water_flow.toFixed(1)}` : '',
      })),
      level: sortedData.map((item, index) => ({
        value: item.water_level,
        label: index >= count - 3 ? item.recorded_at.slice(11, 16) : '',
      })),
      tds: sortedData.map((item, index) => ({
        value: item.water_quality,
        label: index >= count - 3 ? item.recorded_at.slice(11, 16) : '',
      })),
    };
  }, [data]);

  const latestData = data[0];

  if (loading) {
    return (
      <Screen backgroundColor={theme.backgroundRoot} statusBarStyle="dark">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111111" />
          <ThemedText variant="body" color={theme.textSecondary} style={{ marginTop: 16 }}>
            加载监测数据...
          </ThemedText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle="dark">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#111111"
          />
        }
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View>
                <ThemedText variant="caption" color={theme.textSecondary}>
                  DAM MONITORING
                </ThemedText>
                <ThemedText variant="h1" color={theme.textPrimary} style={styles.title}>
                  大坝监测系统
                </ThemedText>
              </View>
              <View
                style={[
                  styles.connectionStatus,
                  connectionStatus === 'connected' && styles.connected,
                  connectionStatus === 'polling' && styles.polling,
                  connectionStatus === 'disconnected' && styles.disconnected,
                ]}
              >
                <View
                  style={[
                    styles.statusIndicator,
                    connectionStatus === 'connected' && styles.statusGreen,
                    connectionStatus === 'polling' && styles.statusYellow,
                    connectionStatus === 'disconnected' && styles.statusRed,
                  ]}
                />
                <ThemedText
                  variant="tiny"
                  color={
                    connectionStatus === 'connected'
                      ? '#22C55E'
                      : connectionStatus === 'polling'
                        ? '#EAB308'
                        : '#EF4444'
                  }
                >
                  {connectionStatus === 'connected'
                    ? '实时'
                    : connectionStatus === 'polling'
                      ? '轮询'
                      : connectionStatus === 'connecting'
                        ? '连接中'
                        : '离线'}
                </ThemedText>
              </View>
            </View>
            <View style={styles.divider} />
          </View>

          <View style={styles.sectionHeader}>
            <FontAwesome6 name="water" size={16} color="#111111" />
            <ThemedText variant="h4" color={theme.textPrimary}>流量监测</ThemedText>
          </View>
          <View style={styles.flowCards}>
            <View style={[styles.statCard, styles.flowCard]}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>
                瞬时流量 FLOW RATE
              </ThemedText>
              <ThemedText variant="stat" color="#111111">
                {latestData?.water_flow.toFixed(1) || '--'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.textSecondary}>
                m3/s
              </ThemedText>
            </View>
            <View style={[styles.statCard, styles.flowCard]}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>
                累计流量 TOTAL
              </ThemedText>
              <ThemedText variant="stat" color="#111111">
                {latestData?.total_flow?.toFixed(0) || '--'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.textSecondary}>
                m3
              </ThemedText>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <FontAwesome6 name="gauge" size={16} color="#111111" />
            <ThemedText variant="h4" color={theme.textPrimary}>水位水质</ThemedText>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>
                水位 LEVEL
              </ThemedText>
              <ThemedText variant="stat" color="#111111">
                {latestData?.water_level.toFixed(1) || '--'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.textSecondary}>
                cm
              </ThemedText>
              <View style={styles.statStatus}>
                <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
                <ThemedText variant="tiny" color="#22C55E">正常</ThemedText>
              </View>
            </View>

            <View style={styles.statCard}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>
                TDS 值 QUALITY
              </ThemedText>
              <ThemedText variant="stat" color="#111111">
                {latestData?.water_quality.toFixed(0) || '--'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.textSecondary}>
                ppm
              </ThemedText>
              <View style={styles.statStatus}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: (latestData?.water_quality ?? 0) < 300 ? '#22C55E' : '#EF4444' },
                  ]}
                />
                <ThemedText
                  variant="tiny"
                  color={(latestData?.water_quality ?? 0) < 300 ? '#22C55E' : '#EF4444'}
                >
                  {(latestData?.water_quality ?? 0) < 300 ? '良好' : '偏高'}
                </ThemedText>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <FontAwesome6 name="rotate" size={16} color="#111111" />
            <ThemedText variant="h4" color={theme.textPrimary}>姿态角</ThemedText>
          </View>
          <View style={styles.angleGrid}>
            <View style={styles.angleCard}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>
                横滚角 ROLL
              </ThemedText>
              <ThemedText variant="h2" color="#111111">
                {latestData?.euler_angle_x.toFixed(1) || '0'}°
              </ThemedText>
            </View>
            <View style={styles.angleCard}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>
                俯仰角 PITCH
              </ThemedText>
              <ThemedText variant="h2" color="#111111">
                {latestData?.euler_angle_y.toFixed(1) || '0'}°
              </ThemedText>
            </View>
            <View style={styles.angleCard}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>
                偏航角 YAW
              </ThemedText>
              <ThemedText variant="h2" color="#111111">
                {latestData?.euler_angle_z.toFixed(1) || '0'}°
              </ThemedText>
            </View>
          </View>

          <View style={styles.loraCard}>
            <View style={styles.loraLeft}>
              <FontAwesome6
                name="signal"
                size={20}
                color={latestData?.lora_status === 'connected' ? '#22C55E' : '#EF4444'}
              />
              <View>
                <ThemedText variant="bodyMedium" color={theme.textPrimary}>
                  LoRa 通信状态
                </ThemedText>
                <ThemedText variant="caption" color={theme.textSecondary}>
                  MODULE STATUS
                </ThemedText>
              </View>
            </View>
            <View
              style={[
                styles.loraStatus,
                { backgroundColor: latestData?.lora_status === 'connected' ? '#DCFCE7' : '#FEE2E2' },
              ]}
            >
              <ThemedText
                variant="smallMedium"
                color={latestData?.lora_status === 'connected' ? '#22C55E' : '#EF4444'}
              >
                {latestData?.lora_status === 'connected' ? '在线' : '离线'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <FontAwesome6 name="chart-line" size={16} color="#111111" />
            <ThemedText variant="h4" color={theme.textPrimary}>历史趋势</ThemedText>
          </View>

          <View style={styles.chartContainer}>
            <ThemedText variant="labelSmall" color={theme.textMuted} style={styles.chartTitle}>
              瞬时流量变化 (m3/s)
            </ThemedText>
            <View style={styles.chart}>
              <LineChart
                data={chartData.flow}
                spacing={15}
                initialSpacing={10}
                endSpacing={20}
                color="#111111"
                thickness={2}
                hideRules
                yAxisColor="#ECECEC"
                xAxisColor="#ECECEC"
                yAxisTextStyle={{ color: '#888888', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#888888', fontSize: 10 }}
                curved
                showDataPointOnFocus
                showTextOnFocus
                focusEnabled
                textColor="#111111"
                textFontSize={12}
              />
            </View>
          </View>

          <View style={styles.chartContainer}>
            <ThemedText variant="labelSmall" color={theme.textMuted} style={styles.chartTitle}>
              水位变化 (cm)
            </ThemedText>
            <View style={styles.chart}>
              <LineChart
                data={chartData.level}
                spacing={15}
                initialSpacing={10}
                endSpacing={20}
                color="#888888"
                thickness={2}
                hideRules
                yAxisColor="#ECECEC"
                xAxisColor="#ECECEC"
                yAxisTextStyle={{ color: '#888888', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#888888', fontSize: 10 }}
                curved
              />
            </View>
          </View>

          <View style={styles.chartContainer}>
            <ThemedText variant="labelSmall" color={theme.textMuted} style={styles.chartTitle}>
              TDS 值变化 (ppm)
            </ThemedText>
            <View style={styles.chart}>
              <LineChart
                data={chartData.tds}
                spacing={15}
                initialSpacing={10}
                endSpacing={20}
                color="#059669"
                thickness={2}
                hideRules
                yAxisColor="#ECECEC"
                xAxisColor="#ECECEC"
                yAxisTextStyle={{ color: '#888888', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#888888', fontSize: 10 }}
                curved
              />
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
              <FontAwesome6 name="rotate" size={14} color="#FFFFFF" />
              <ThemedText variant="smallMedium" color="#FFFFFF">
                刷新数据
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
              onPress={syncFromCloud}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <FontAwesome6 name="cloud-arrow-down" size={14} color="#FFFFFF" />
              )}
              <ThemedText variant="smallMedium" color="#FFFFFF">
                云端同步
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
