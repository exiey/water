import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

export default function TabLayout() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: '#ECECEC',
          height: Platform.OS === 'web' ? 60 : 50 + insets.bottom,
          paddingBottom: Platform.OS === 'web' ? 0 : insets.bottom,
        },
        tabBarActiveTintColor: '#111111',
        tabBarInactiveTintColor: '#CCCCCC',
        tabBarItemStyle: {
          height: Platform.OS === 'web' ? 60 : undefined,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '监测',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="chart-line" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: '分析',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="robot" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="gear" size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
