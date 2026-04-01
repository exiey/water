/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ScrollView,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Threshold {
  id: number;
  parameter_type: string;
  min_value: number;
  max_value: number;
  unit: string;
  is_enabled: boolean;
}

interface Calibration {
  id: number;
  parameter_type: string;
  offset_value: number;
  scale_factor: number;
}

// 参数类型配置 - 适配OneNET数据结构
const PARAMETER_CONFIG = {
  instant_flow: { name: '瞬时流量', unit: 'm³/s', icon: 'water' },
  total_flow: { name: '累计流量', unit: 'm³', icon: 'droplet' },
  water_level: { name: '水位', unit: 'cm', icon: 'arrows-up-down' },
  tds_value: { name: 'TDS值', unit: 'ppm', icon: 'flask' },
  roll_angle: { name: '横滚角', unit: '°', icon: 'rotate' },
  pitch_angle: { name: '俯仰角', unit: '°', icon: 'rotate' },
  yaw_angle: { name: '偏航角', unit: '°', icon: 'rotate' },
};

export default function SettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 当前选中的参数
  const [selectedParam, setSelectedParam] = useState<keyof typeof PARAMETER_CONFIG>('instant_flow');

  // 编辑状态
  const [thresholdMin, setThresholdMin] = useState('');
  const [thresholdMax, setThresholdMax] = useState('');
  const [calibrationOffset, setCalibrationOffset] = useState('');
  const [calibrationScale, setCalibrationScale] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      /**
       * 服务端文件：server/src/routes/thresholds.ts
       * 接口：GET /api/v1/thresholds
       */
      const thresholdsRes = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/thresholds`);
      const thresholdsResult = await thresholdsRes.json();
      if (thresholdsResult.success) {
        setThresholds(thresholdsResult.data);
      }

      /**
       * 服务端文件：server/src/routes/calibrations.ts
       * 接口：GET /api/v1/calibrations
       */
      const calibrationsRes = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/calibrations`);
      const calibrationsResult = await calibrationsRes.json();
      if (calibrationsResult.success) {
        setCalibrations(calibrationsResult.data);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // 当选中参数或数据变化时，更新编辑状态
  useEffect(
    () => {
      const threshold = thresholds.find((t) => t.parameter_type === selectedParam);
      const calibration = calibrations.find((c) => c.parameter_type === selectedParam);

      if (threshold) {
        setThresholdMin(threshold.min_value.toString());
        setThresholdMax(threshold.max_value.toString());
      } else {
        setThresholdMin('');
        setThresholdMax('');
      }

      if (calibration) {
        setCalibrationOffset(calibration.offset_value.toString());
        setCalibrationScale(calibration.scale_factor.toString());
      } else {
        setCalibrationOffset('0');
        setCalibrationScale('1');
      }
    },
    [selectedParam, thresholds, calibrations]
  );

  // 保存阈值设置
  const saveThreshold = async () => {
    if (!thresholdMin || !thresholdMax) {
      Alert.alert('提示', '请填写完整的阈值设置');
      return;
    }

    setSaving(true);
    try {
      const config = PARAMETER_CONFIG[selectedParam];
      /**
       * 服务端文件：server/src/routes/thresholds.ts
       * 接口：POST /api/v1/thresholds
       * Body 参数：parameter_type: string, min_value: number, max_value: number, unit: string, is_enabled?: boolean
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/thresholds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parameter_type: selectedParam,
          min_value: parseFloat(thresholdMin),
          max_value: parseFloat(thresholdMax),
          unit: config?.unit || '',
          is_enabled: true,
        }),
      });

      const result = await response.json();
      if (result.success) {
        Alert.alert('成功', '阈值设置已保存');
        loadData();
      } else {
        Alert.alert('错误', result.error || '保存失败');
      }
    } catch (error) {
      console.error('保存阈值失败:', error);
      Alert.alert('错误', '保存失败，请重试');
    }
    setSaving(false);
  };

  // 保存校准设置
  const saveCalibration = async () => {
    setSaving(true);
    try {
      /**
       * 服务端文件：server/src/routes/calibrations.ts
       * 接口：POST /api/v1/calibrations
       * Body 参数：parameter_type: string, offset_value: number, scale_factor: number
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/calibrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parameter_type: selectedParam,
          offset_value: parseFloat(calibrationOffset) || 0,
          scale_factor: parseFloat(calibrationScale) || 1,
        }),
      });

      const result = await response.json();
      if (result.success) {
        Alert.alert('成功', '校准设置已保存');
        loadData();
      } else {
        Alert.alert('错误', result.error || '保存失败');
      }
    } catch (error) {
      console.error('保存校准失败:', error);
      Alert.alert('错误', '保存失败，请重试');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Screen backgroundColor={theme.backgroundRoot} statusBarStyle="dark">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111111" />
          <ThemedText variant="body" color={theme.textSecondary} style={{ marginTop: 16 }}>
            加载设置...
          </ThemedText>
        </View>
      </Screen>
    );
  }

  const currentConfig = PARAMETER_CONFIG[selectedParam];

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle="dark">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText variant="caption" color={theme.textSecondary}>
              SETTINGS
            </ThemedText>
            <ThemedText variant="h1" color={theme.textPrimary} style={styles.title}>
              系统设置
            </ThemedText>
            <View style={styles.divider} />
          </View>

          {/* 参数选择器 */}
          <View style={styles.selectorSection}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="sliders" size={18} color="#111111" />
              <ThemedText variant="h4" color={theme.textPrimary} style={styles.sectionTitle}>
                参数设置
              </ThemedText>
            </View>

            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedParam}
                onValueChange={(value) => setSelectedParam(value)}
                style={styles.picker}
                itemStyle={{ fontSize: 15 }}
              >
                {Object.entries(PARAMETER_CONFIG).map(([key, config]) => (
                  <Picker.Item key={key} label={`${config.name}`} value={key} />
                ))}
              </Picker>
            </View>
          </View>

          {/* 选中参数的设置 */}
          <View style={styles.settingsSection}>
            {/* 阈值设置卡片 */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconContainer}>
                  <FontAwesome6 name="sliders" size={16} color="#111111" />
                </View>
                <View style={styles.paramInfo}>
                  <ThemedText variant="bodyMedium" color={theme.textPrimary} style={styles.paramName}>
                    阈值设置
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.textSecondary}>
                    THRESHOLD
                  </ThemedText>
                </View>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.inputRow}>
                  <ThemedText variant="small" color={theme.textSecondary} style={styles.inputLabel}>
                    最小值
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    value={thresholdMin}
                    onChangeText={setThresholdMin}
                    keyboardType="decimal-pad"
                    placeholder="请输入"
                    placeholderTextColor={theme.textMuted}
                  />
                  <ThemedText variant="small" color={theme.textMuted} style={styles.inputUnit}>
                    {currentConfig?.unit}
                  </ThemedText>
                </View>

                <View style={styles.inputRow}>
                  <ThemedText variant="small" color={theme.textSecondary} style={styles.inputLabel}>
                    最大值
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    value={thresholdMax}
                    onChangeText={setThresholdMax}
                    keyboardType="decimal-pad"
                    placeholder="请输入"
                    placeholderTextColor={theme.textMuted}
                  />
                  <ThemedText variant="small" color={theme.textMuted} style={styles.inputUnit}>
                    {currentConfig?.unit}
                  </ThemedText>
                </View>

                <TouchableOpacity style={styles.button} onPress={saveThreshold} disabled={saving}>
                  <ThemedText variant="smallMedium" color="#FFFFFF">
                    保存阈值
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            {/* 校准设置卡片 */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconContainer}>
                  <FontAwesome6 name="gauge" size={16} color="#111111" />
                </View>
                <View style={styles.paramInfo}>
                  <ThemedText variant="bodyMedium" color={theme.textPrimary} style={styles.paramName}>
                    校准设置
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.textSecondary}>
                    CALIBRATION
                  </ThemedText>
                </View>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.inputRow}>
                  <ThemedText variant="small" color={theme.textSecondary} style={styles.inputLabel}>
                    偏移值
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    value={calibrationOffset}
                    onChangeText={setCalibrationOffset}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.textMuted}
                  />
                  <ThemedText variant="small" color={theme.textMuted} style={styles.inputUnit}>
                    {currentConfig?.unit}
                  </ThemedText>
                </View>

                <View style={styles.inputRow}>
                  <ThemedText variant="small" color={theme.textSecondary} style={styles.inputLabel}>
                    比例因子
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    value={calibrationScale}
                    onChangeText={setCalibrationScale}
                    keyboardType="decimal-pad"
                    placeholder="1"
                    placeholderTextColor={theme.textMuted}
                  />
                  <ThemedText variant="small" color={theme.textMuted} style={styles.inputUnit}>
                    ×
                  </ThemedText>
                </View>

                <TouchableOpacity style={styles.button} onPress={saveCalibration} disabled={saving}>
                  <ThemedText variant="smallMedium" color="#FFFFFF">
                    保存校准
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
