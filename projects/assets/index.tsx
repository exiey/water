import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ScrollView, View, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/hooks/useTheme';
import { useWebSocket, getWebSocketUrl } from '@/hooks/useWebSocket';
import { createStyles } from './styles';

// ESP32 默认配置
const DEFAULT_ESP32_IP = '192.168.4.1'; // ESP32 AP 模式默认 IP
const DEFAULT_PORT = '80';
const POLLING_INTERVAL = 5000; // WebSocket 断开时的轮询间隔（5秒）

// 云端传感器数据格式
interface CloudSensorData {
  device_id: string;
  temperature: number;
  humidity: number;
  smoke_level: number;
  smoke_alert: boolean;
  pir_detected: boolean;
  flame_detected: boolean;
  flame_intensity: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  device_status: string;
  created_at: string;
}

// ESP32 数据格式（用于内部显示）
interface ESP32Data {
  device_info: {
    device_id: string;
    factory_area: string;
    timestamp: number;
    firmware_version: string;
  };
  sensor_data: {
    temperature_humidity: {
      temperature: number;
      humidity: number;
      status: 'normal' | 'abnormal';
    };
    flame_sensor: {
      flame_detected: boolean;
      flame_intensity: number;
    };
    smoke_sensor: {
      smoke_concentration: number;
      status: 'normal' | 'abnormal';
    };
    human_infrared: {
      human_detected: boolean;
      detection_distance: number;
    };
    mpu6050: {
      euler_angle: {
        pitch: number;
        roll: number;
        yaw: number;
      };
      calibration_status: 'uncalibrated' | 'calibrated';
    };
  };
  threshold_config: {
    temperature: { min: number; max: number };
    humidity: { min: number; max: number };
    smoke_concentration: { max: number };
    flame_intensity: { min: number };
  };
  command: {
    cmd_type: string;
    cmd_id: string;
    params: any;
    cmd_response: {
      status: string;
      error_msg: string;
      execute_time: number;
    } | null;
  };
}

// 将云端数据转换为 ESP32 格式
function convertCloudToESP32(cloudData: CloudSensorData): ESP32Data {
  return {
    device_info: {
      device_id: cloudData.device_id || 'unknown',
      factory_area: '未配置',
      timestamp: Date.now(),
      firmware_version: 'N/A',
    },
    sensor_data: {
      temperature_humidity: {
        temperature: cloudData.temperature || 0,
        humidity: cloudData.humidity || 0,
        status: 'normal',
      },
      flame_sensor: {
        flame_detected: cloudData.flame_detected || false,
        flame_intensity: cloudData.flame_intensity || 0,
      },
      smoke_sensor: {
        smoke_concentration: cloudData.smoke_level || 0,
        status: cloudData.smoke_alert ? 'abnormal' : 'normal',
      },
      human_infrared: {
        human_detected: cloudData.pir_detected || false,
        detection_distance: 0,
      },
      mpu6050: {
        euler_angle: {
          pitch: cloudData.gyro_x || 0,
          roll: cloudData.gyro_y || 0,
          yaw: cloudData.gyro_z || 0,
        },
        calibration_status: 'calibrated',
      },
    },
    threshold_config: {
      temperature: { min: -10, max: 60 },
      humidity: { min: 10, max: 95 },
      smoke_concentration: { max: 0.1 },
      flame_intensity: { min: 1.0 },
    },
    command: {
      cmd_type: 'none',
      cmd_id: '',
      params: {},
      cmd_response: null,
    },
  };
}

export default function DashboardScreen() {
  const { theme, isDark } = useTheme();
  const styles = createStyles(theme);
  const [sensorData, setSensorData] = useState<ESP32Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionSource, setConnectionSource] = useState<'connecting' | 'esp32' | 'websocket' | 'cloud' | 'disconnected'>('connecting');
  const [esp32IP] = useState(DEFAULT_ESP32_IP);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // WebSocket 连接
  const wsUrl = getWebSocketUrl();
  const { status: wsStatus, data: wsData } = useWebSocket(wsUrl);

  // 处理 WebSocket 数据
  useEffect(() => {
    if (wsData && wsStatus === 'connected') {
      const formattedData = convertCloudToESP32(wsData as CloudSensorData);
      setSensorData(formattedData);
      setConnectionSource('websocket');
      setLoading(false);
    }
  }, [wsData, wsStatus]);

  // 从云端获取数据（HTTP 轮询备用方案）
  const fetchFromCloud = async () => {
    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';
      const response = await fetch(`${backendUrl}/api/v1/sensors/latest`);
      const result = await response.json();
      if (result.data) {
        const formattedData = convertCloudToESP32(result.data);
        setSensorData(formattedData);
        setConnectionSource('cloud');
      }
    } catch (error) {
      console.error('Failed to fetch from cloud:', error);
      setConnectionSource('disconnected');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // WebSocket 断开时启用轮询
  useEffect(() => {
    if (wsStatus === 'connected') {
      // WebSocket 已连接，停止轮询
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } else if (wsStatus === 'disconnected' || wsStatus === 'error') {
      // WebSocket 断开，启动轮询
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
  }, [wsStatus]);

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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFromCloud();
  }, []);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // 渲染连接状态横幅
  const renderConnectionBanner = () => {
    const isConnected = connectionSource === 'websocket' || connectionSource === 'cloud' || connectionSource === 'esp32';
    const bannerStyle = isConnected 
      ? styles.connectionBannerSuccess 
      : connectionSource === 'disconnected' 
        ? styles.connectionBannerError 
        : styles.connectionBanner;
    
    const textColor = isConnected 
      ? '#065F46' 
      : connectionSource === 'disconnected' 
        ? '#991B1B' 
        : theme.textMuted;

    const getStatusText = () => {
      switch (connectionSource) {
        case 'websocket':
          return '实时连接 (WebSocket)';
        case 'esp32':
          return `ESP32 直连 ${esp32IP}`;
        case 'cloud':
          return '已连接云端 (HTTP轮询)';
        case 'disconnected':
          return '连接失败';
        default:
          return '正在连接...';
      }
    };

    return (
      <View style={[styles.connectionBanner, bannerStyle]}>
        <Feather 
          name={isConnected ? 'wifi' : connectionSource === 'disconnected' ? 'wifi-off' : 'loader'} 
          size={16} 
          color={textColor} 
        />
        <ThemedText variant="smallMedium" style={[styles.connectionBannerText, { color: textColor }]}>
          {getStatusText()}
        </ThemedText>
        {connectionSource === 'websocket' && wsStatus === 'connected' && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <ThemedText variant="tiny" color="#059669">实时</ThemedText>
          </View>
        )}
      </View>
    );
  };

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
      >
        {/* Header */}
        <ThemedView level="root" style={styles.header}>
          <ThemedText variant="h1" style={styles.headerTitle}>
            IoT 监测中心
          </ThemedText>
          <ThemedText variant="body" color={theme.textSecondary} style={styles.headerSubtitle}>
            高危工程实时监控
          </ThemedText>
          {renderConnectionBanner()}
        </ThemedView>

        {/* 设备信息 */}
        {sensorData?.device_info && (
          <View style={styles.deviceInfoCard}>
            <ThemedText variant="labelSmall" color={theme.textMuted} style={{ marginBottom: Spacing.md }}>
              设备信息
            </ThemedText>
            <View style={styles.deviceInfoRow}>
              <ThemedText variant="small" color={theme.textMuted}>设备ID</ThemedText>
              <ThemedText variant="smallMedium">{sensorData.device_info.device_id}</ThemedText>
            </View>
            <View style={styles.deviceInfoRow}>
              <ThemedText variant="small" color={theme.textMuted}>部署区域</ThemedText>
              <ThemedText variant="smallMedium">{sensorData.device_info.factory_area}</ThemedText>
            </View>
            <View style={styles.deviceInfoRow}>
              <ThemedText variant="small" color={theme.textMuted}>固件版本</ThemedText>
              <ThemedText variant="smallMedium">{sensorData.device_info.firmware_version}</ThemedText>
            </View>
          </View>
        )}

        {/* 温湿度传感器 */}
        <ThemedView level="root" style={styles.section}>
          <ThemedText variant="labelSmall" color={theme.textMuted} style={styles.sectionTitle}>
            环境监测
          </ThemedText>
          <View style={styles.sensorRow}>
            {/* 温度 */}
            <View style={styles.sensorCard}>
              <View style={styles.sensorIconContainer}>
                <Feather name="thermometer" size={20} color={theme.textPrimary} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ThemedText variant="labelSmall" color={theme.textMuted}>温度</ThemedText>
                {sensorData?.sensor_data.temperature_humidity.status === 'abnormal' && (
                  <View style={[styles.statusTag, styles.statusAbnormal]}>
                    <ThemedText variant="tiny" style={{ color: '#991B1B' }}>异常</ThemedText>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
                <ThemedText variant="stat">
                  {sensorData?.sensor_data.temperature_humidity.temperature?.toFixed(1) ?? '--'}
                </ThemedText>
                <ThemedText variant="body" color={theme.textMuted} style={{ marginLeft: 4 }}>°C</ThemedText>
              </View>
              {sensorData?.threshold_config && (
                <View style={styles.thresholdContainer}>
                  <View style={styles.thresholdBadge}>
                    <ThemedText variant="tiny" color={theme.textMuted}>
                      {sensorData.threshold_config.temperature.min}~{sensorData.threshold_config.temperature.max}°C
                    </ThemedText>
                  </View>
                </View>
              )}
            </View>

            {/* 湿度 */}
            <View style={styles.sensorCard}>
              <View style={styles.sensorIconContainer}>
                <Feather name="droplet" size={20} color={theme.textPrimary} />
              </View>
              <ThemedText variant="labelSmall" color={theme.textMuted}>湿度</ThemedText>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
                <ThemedText variant="stat">
                  {sensorData?.sensor_data.temperature_humidity.humidity?.toFixed(1) ?? '--'}
                </ThemedText>
                <ThemedText variant="body" color={theme.textMuted} style={{ marginLeft: 4 }}>%</ThemedText>
              </View>
              {sensorData?.threshold_config && (
                <View style={styles.thresholdContainer}>
                  <View style={styles.thresholdBadge}>
                    <ThemedText variant="tiny" color={theme.textMuted}>
                      {sensorData.threshold_config.humidity.min}~{sensorData.threshold_config.humidity.max}%
                    </ThemedText>
                  </View>
                </View>
              )}
            </View>
          </View>
        </ThemedView>

        {/* 安全监测 */}
        <ThemedView level="root" style={styles.section}>
          <ThemedText variant="labelSmall" color={theme.textMuted} style={styles.sectionTitle}>
            安全监测
          </ThemedText>
          
          {/* 烟雾传感器 */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>烟雾传感器</ThemedText>
              <View style={styles.cardIconContainer}>
                <Feather 
                  name="cloud" 
                  size={18} 
                  color={sensorData?.sensor_data.smoke_sensor.status === 'abnormal' ? theme.accent : theme.textPrimary} 
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ThemedText variant="h3">
                {sensorData?.sensor_data.smoke_sensor.status === 'abnormal' ? '检测到烟雾' : '无烟雾'}
              </ThemedText>
              {sensorData?.sensor_data.smoke_sensor.status === 'abnormal' && (
                <View style={[styles.alertBadge, { marginLeft: 12 }]}>
                  <ThemedText variant="tiny" color="#FFFFFF">报警</ThemedText>
                </View>
              )}
            </View>
          </View>

          {/* 人体红外 */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>人体红外</ThemedText>
              <View style={styles.cardIconContainer}>
                <Feather 
                  name="user" 
                  size={18} 
                  color={sensorData?.sensor_data.human_infrared.human_detected ? theme.accent : theme.textPrimary} 
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ThemedText variant="h3">
                {sensorData?.sensor_data.human_infrared.human_detected ? '检测到人员' : '无人员'}
              </ThemedText>
              {sensorData?.sensor_data.human_infrared.human_detected && (
                <View style={[styles.alertBadge, { marginLeft: 12 }]}>
                  <ThemedText variant="tiny" color="#FFFFFF">移动</ThemedText>
                </View>
              )}
            </View>
            {(sensorData?.sensor_data.human_infrared.detection_distance ?? 0) > 0 && (
              <ThemedText variant="caption" color={theme.textMuted} style={{ marginTop: 8 }}>
                检测距离: {sensorData?.sensor_data.human_infrared.detection_distance}m
              </ThemedText>
            )}
          </View>

          {/* 火焰传感器 */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>火焰传感器</ThemedText>
              <View style={styles.cardIconContainer}>
                <Feather 
                  name="zap" 
                  size={18} 
                  color={sensorData?.sensor_data.flame_sensor.flame_detected ? theme.accent : theme.textPrimary} 
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ThemedText variant="h3">
                {sensorData?.sensor_data.flame_sensor.flame_detected ? '检测到火焰' : '无火焰'}
              </ThemedText>
              {sensorData?.sensor_data.flame_sensor.flame_detected && (
                <View style={[styles.alertBadge, { marginLeft: 12 }]}>
                  <ThemedText variant="tiny" color="#FFFFFF">危险</ThemedText>
                </View>
              )}
            </View>
          </View>
        </ThemedView>

        {/* MPU6050 陀螺仪 */}
        <ThemedView level="root" style={styles.section}>
          <ThemedText variant="labelSmall" color={theme.textMuted} style={styles.sectionTitle}>
            运动姿态 (MPU6050)
          </ThemedText>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ThemedText variant="labelSmall" color={theme.textMuted}>欧拉角</ThemedText>
              <View style={[
                styles.calibrationBadge,
                sensorData?.sensor_data.mpu6050.calibration_status === 'calibrated' 
                  ? styles.calibrationOk 
                  : styles.calibrationNeeded
              ]}>
                <Feather 
                  name={sensorData?.sensor_data.mpu6050.calibration_status === 'calibrated' ? 'check-circle' : 'alert-circle'} 
                  size={12} 
                  color={sensorData?.sensor_data.mpu6050.calibration_status === 'calibrated' ? '#065F46' : '#92400E'} 
                />
                <ThemedText 
                  variant="tiny" 
                  style={{ 
                    color: sensorData?.sensor_data.mpu6050.calibration_status === 'calibrated' ? '#065F46' : '#92400E',
                    marginLeft: 4 
                  }}
                >
                  {sensorData?.sensor_data.mpu6050.calibration_status === 'calibrated' ? '已校准' : '待校准'}
                </ThemedText>
              </View>
            </View>
            
            <View style={styles.eulerRow}>
              <View style={styles.eulerItem}>
                <ThemedText variant="caption" color={theme.textMuted}>俯仰角 (Pitch)</ThemedText>
                <ThemedText variant="title">{sensorData?.sensor_data.mpu6050.euler_angle.pitch?.toFixed(2) ?? '--'}</ThemedText>
                <ThemedText variant="tiny" color={theme.textMuted}>°</ThemedText>
              </View>
              <View style={styles.eulerItem}>
                <ThemedText variant="caption" color={theme.textMuted}>横滚角 (Roll)</ThemedText>
                <ThemedText variant="title">{sensorData?.sensor_data.mpu6050.euler_angle.roll?.toFixed(2) ?? '--'}</ThemedText>
                <ThemedText variant="tiny" color={theme.textMuted}>°</ThemedText>
              </View>
              <View style={styles.eulerItem}>
                <ThemedText variant="caption" color={theme.textMuted}>偏航角 (Yaw)</ThemedText>
                <ThemedText variant="title">{sensorData?.sensor_data.mpu6050.euler_angle.yaw?.toFixed(2) ?? '--'}</ThemedText>
                <ThemedText variant="tiny" color={theme.textMuted}>°</ThemedText>
              </View>
            </View>
          </View>
        </ThemedView>

        {/* 最后更新时间 */}
        {sensorData?.device_info.timestamp && (
          <View style={styles.lastUpdate}>
            <Feather name="clock" size={14} color={theme.textMuted} />
            <ThemedText variant="caption" color={theme.textMuted}>
              最后更新: {formatTime(sensorData.device_info.timestamp)}
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

// 导入 Spacing
import { Spacing } from '@/constants/theme';
