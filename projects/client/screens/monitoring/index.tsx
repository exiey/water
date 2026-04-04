import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  ScrollView,
  View,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import { FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useWebSocket, getWebSocketUrl } from '@/hooks/useWebSocket';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { createStyles } from './styles';

// 后端 URL
const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

// 轮询间隔
const POLLING_INTERVAL = 2000;

// 监测数据格式
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

function formatFlowRate(value?: number) {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toFixed(2);
}

function formatTotalFlow(value?: number) {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toFixed(1);
}

export default function MonitoringScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [data, setData] = useState<MonitoringData[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionSource, setConnectionSource] = useState<'connecting' | 'websocket' | 'polling' | 'disconnected'>('connecting');
  
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // WebSocket 连接
  const wsUrl = getWebSocketUrl();
  const { status: wsStatus, data: wsData } = useWebSocket(wsUrl);

  // 处理 WebSocket 数据
  useEffect(() => {
    if (wsData && wsStatus === 'connected') {
      // 将新数据添加到列表顶部
      setData(prev => {
        if (prev.length === 0) return [wsData];
        if (prev[0]?.id === wsData.id) return prev;
        return [wsData, ...prev.slice(0, 19)];
      });
      setConnectionSource('websocket');
      setLoading(false);
    }
  }, [wsData, wsStatus]);

  // 从云端获取数据（HTTP 轮询备用方案）
  const fetchFromCloud = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/monitoring/latest`);
      const result = await response.json();
      if (result.success && result.data) {
        setData(prev => {
          if (prev.length === 0) return [result.data];
          if (prev[0]?.id === result.data.id) return prev;
          return [result.data, ...prev.slice(0, 19)];
        });
        setConnectionSource('polling');
      }
    } catch (error) {
      console.error('Failed to fetch from cloud:', error);
      setConnectionSource('disconnected');
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket 断开时启用轮询
  useEffect(() => {
    if (wsStatus === 'connected') {
      // WebSocket 已连接，停止轮询
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setConnectionSource('websocket');
    } else if (wsStatus === 'disconnected' || wsStatus === 'error') {
      // WebSocket 断开，启动轮询
      setConnectionSource('polling');
      if (!pollingRef.current) {
        fetchFromCloud();
        pollingRef.current = setInterval(fetchFromCloud, POLLING_INTERVAL);
      }
    }
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [wsStatus, fetchFromCloud]);

  // 首次加载
  useFocusEffect(
    useCallback(() => {
      // 如果 WebSocket 未连接，立即获取一次数据
      if (wsStatus !== 'connected') {
        fetchFromCloud();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

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
        dataPointText: index === count - 1 ? formatFlowRate(item.water_flow) : '',
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

  // 渲染连接状态
  const renderConnectionStatus = () => {
    const isConnected = connectionSource === 'websocket' || connectionSource === 'polling';
    const statusColor = connectionSource === 'websocket' 
      ? '#22C55E' 
      : connectionSource === 'polling' 
        ? '#EAB308' 
        : '#EF4444';
    
    const statusText = connectionSource === 'websocket'
      ? '实时连接'
      : connectionSource === 'polling'
        ? '轮询模式'
        : connectionSource === 'connecting'
          ? '连接中'
          : '离线';

    return (
      <View style={styles.connectionStatus}>
        <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
        <ThemedText variant="tiny" color={statusColor}>
          {statusText}
        </ThemedText>
        {connectionSource === 'websocket' && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
          </View>
        )}
      </View>
    );
  };

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
              {renderConnectionStatus()}
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
                {formatFlowRate(latestData?.water_flow)}
              </ThemedText>
              <ThemedText variant="caption" color={theme.textSecondary}>
                L/min
              </ThemedText>
            </View>
            <View style={[styles.statCard, styles.flowCard]}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>
                累计流量 TOTAL
              </ThemedText>
              <ThemedText variant="stat" color="#111111">
                {formatTotalFlow(latestData?.total_flow)}
              </ThemedText>
              <ThemedText variant="caption" color={theme.textSecondary}>
                L
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
              瞬时流量变化 (L/min)
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
        </View>
      </ScrollView>
    </Screen>
  );
}
