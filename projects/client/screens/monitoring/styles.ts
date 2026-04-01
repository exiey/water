import { StyleSheet } from 'react-native';
import { Spacing, BorderRadius, Theme } from '@/constants/theme';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      paddingBottom: Spacing['5xl'],
    },
    container: {
      flex: 1,
      paddingHorizontal: Spacing.xl,
    },
    header: {
      marginTop: Spacing['3xl'],
      marginBottom: Spacing.xl,
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    title: {
      marginBottom: Spacing.xs,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: '#ECECEC',
      marginTop: Spacing.lg,
    },
    // 连接状态
    connectionStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      backgroundColor: '#F7F7F7',
    },
    connected: {
      backgroundColor: '#DCFCE7',
    },
    polling: {
      backgroundColor: '#FEF9C3',
    },
    disconnected: {
      backgroundColor: '#FEE2E2',
    },
    statusIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#9CA3AF',
    },
    statusGreen: {
      backgroundColor: '#22C55E',
    },
    statusYellow: {
      backgroundColor: '#EAB308',
    },
    statusRed: {
      backgroundColor: '#EF4444',
    },
    // 实时指示器
    liveIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginLeft: 4,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#22C55E',
    },
    // 区域标题
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing['2xl'],
      marginBottom: Spacing.lg,
    },
    // 流量卡片区域
    flowCards: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    flowCard: {
      flex: 1,
    },
    // 统计卡片网格
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
    },
    statCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: '#ECECEC',
      padding: Spacing.lg,
    },
    statStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.sm,
      gap: Spacing.xs,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    // 欧拉角网格
    angleGrid: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    angleCard: {
      flex: 1,
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: '#ECECEC',
      padding: Spacing.lg,
      alignItems: 'center',
    },
    // LoRa状态卡片
    loraCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: '#ECECEC',
      padding: Spacing.lg,
      marginTop: Spacing.lg,
    },
    loraLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    loraStatus: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
    },
    // 图表区域
    chartContainer: {
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: '#ECECEC',
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
      overflow: 'hidden',
    },
    chartTitle: {
      marginBottom: Spacing.lg,
      fontSize: 12,
      color: '#CCCCCC',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    chart: {
      height: 180,
    },
    // 加载状态
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: Spacing['4xl'],
    },
  });
};
