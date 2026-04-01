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
    title: {
      marginBottom: Spacing.xs,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: '#ECECEC',
      marginTop: Spacing.lg,
    },
    // 选择器区域
    selectorSection: {
      marginTop: Spacing.xl,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    sectionTitle: {
      flex: 1,
    },
    pickerContainer: {
      backgroundColor: '#F7F7F7',
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: '#ECECEC',
      overflow: 'hidden',
    },
    picker: {
      height: 50,
      color: '#111111',
    },
    // 选中参数的设置区域
    settingsSection: {
      marginTop: Spacing['2xl'],
    },
    // 卡片
    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: '#ECECEC',
      marginBottom: Spacing.lg,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.lg,
      backgroundColor: '#F7F7F7',
      borderBottomWidth: 1,
      borderBottomColor: '#ECECEC',
    },
    cardBody: {
      padding: Spacing.lg,
    },
    // 参数信息
    paramInfo: {
      flex: 1,
    },
    paramName: {
      marginBottom: 2,
    },
    // 输入行
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.md,
      gap: Spacing.md,
    },
    inputLabel: {
      width: 70,
    },
    input: {
      flex: 1,
      backgroundColor: '#F7F7F7',
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: '#ECECEC',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      color: '#111111',
      fontSize: 15,
    },
    inputUnit: {
      width: 30,
    },
    // 按钮
    button: {
      backgroundColor: '#111111',
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.xl,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    // 图标容器
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.md,
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#ECECEC',
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
