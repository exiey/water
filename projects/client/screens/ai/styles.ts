import { StyleSheet } from 'react-native';
import { Spacing, BorderRadius, Theme } from '@/constants/theme';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: Spacing['6xl'],
    },
    // Header
    header: {
      position: 'relative',
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing['3xl'],
      paddingBottom: Spacing.lg,
      backgroundColor: '#FFFFFF',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#ECECEC',
    },
    headerTitle: {
      marginBottom: Spacing.xs,
    },
    headerSubtitle: {
      marginTop: Spacing.xs,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: '#ECECEC',
      marginTop: Spacing.lg,
    },
    // 对话区域
    chatContainer: {
      flex: 1,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
    },
    // 消息气泡
    messageContainer: {
      marginBottom: Spacing.md,
      maxWidth: '85%',
    },
    userMessage: {
      alignSelf: 'flex-end',
      backgroundColor: '#111111',
      borderRadius: BorderRadius.lg,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
    },
    assistantMessage: {
      alignSelf: 'flex-start',
      backgroundColor: '#F7F7F7',
      borderRadius: BorderRadius.lg,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
    },
    messageText: {
      lineHeight: 22,
    },
    messageTime: {
      fontSize: 10,
      marginTop: Spacing.xs,
    },
    // 输入区域
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      backgroundColor: '#FFFFFF',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: '#ECECEC',
      gap: Spacing.sm,
    },
    input: {
      flex: 1,
      backgroundColor: '#F7F7F7',
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: '#ECECEC',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      color: '#111111',
      fontSize: 15,
      maxHeight: 120,
      minHeight: 48,
    },
    sendButton: {
      backgroundColor: '#111111',
      borderRadius: BorderRadius.md,
      width: 48,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: '#ECECEC',
    },
    // 快捷问题
    quickActions: {
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      gap: Spacing.sm,
    },
    quickButton: {
      backgroundColor: '#F7F7F7',
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: '#ECECEC',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
    },
    quickButtonText: {
      textAlign: 'center',
    },
    // 加载状态
    typingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: '#F7F7F7',
      borderRadius: BorderRadius.lg,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
      gap: Spacing.sm,
    },
    typingText: {
      color: '#888888',
    },
    // 空状态
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing['2xl'],
      paddingVertical: Spacing['4xl'],
    },
    emptyIcon: {
      marginBottom: Spacing.lg,
    },
    emptyText: {
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    emptySubtext: {
      textAlign: 'center',
    },
    // 清空按钮
    clearButton: {
      position: 'absolute',
      top: Spacing['2xl'],
      right: Spacing.xl,
      padding: Spacing.md,
      backgroundColor: '#F7F7F7',
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: '#ECECEC',
    },
  });
};
