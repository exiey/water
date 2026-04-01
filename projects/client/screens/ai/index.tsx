import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import RNSSE from 'react-native-sse';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'https://d34b1e3c-093a-43e0-a7ea-d0685d47e5f0.dev.coze.site';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export default function AIScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const messageIdRef = useRef(0);

  // 生成唯一ID
  const generateId = () => {
    messageIdRef.current += 1;
    return messageIdRef.current;
  };

  // 加载对话历史
  const loadHistory = async () => {
    try {
      /**
       * 服务端文件：server/src/routes/ai.ts
       * 接口：GET /api/v1/ai/history
       * Query 参数：limit?: number
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/ai/history?limit=50`);
      const result = await response.json();
      if (result.success) {
        setMessages(result.data);
      }
    } catch (error) {
      console.error('加载对话历史失败:', error);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadHistory();
    }, [])
  );

  // 自动滚动到底部
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // 发送消息
  const sendMessage = async (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText || isTyping) return;

    setInputText('');
    setIsTyping(true);

    // 立即添加用户消息
    const tempUserMessage: Message = {
      id: generateId(),
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMessage]);

    // 添加临时的AI消息占位
    const tempAiMessageId = generateId();
    setMessages(prev => [
      ...prev,
      {
        id: tempAiMessageId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      /**
       * 服务端文件：server/src/routes/ai.ts
       * 接口：POST /api/v1/ai/chat
       * Body 参数：message: string, include_context?: boolean
       */
      const url = `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/ai/chat`;
      const sse = new RNSSE(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: messageText, include_context: true }),
      });

      sse.addEventListener('message', (event) => {
        const data = event.data || '';
        if (data === '[DONE]') {
          sse.close();
          setIsTyping(false);
          return;
        }

        if (data.startsWith('[ERROR]')) {
          console.error('AI响应错误:', data);
          sse.close();
          setIsTyping(false);
          return;
        }

        // 更新AI消息内容
        setMessages(prev =>
          prev.map(msg =>
            msg.id === tempAiMessageId
              ? { ...msg, content: msg.content + data }
              : msg
          )
        );
      });

      sse.addEventListener('error', (error) => {
        console.error('SSE错误:', error);
        sse.close();
        setIsTyping(false);
      });
    } catch (error) {
      console.error('发送消息失败:', error);
      setIsTyping(false);
    }
  };

  // 清空对话历史
  const clearHistory = () => {
    Alert.alert('清空对话', '确定要清空所有对话记录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定',
        style: 'destructive',
        onPress: async () => {
          try {
            /**
             * 服务端文件：server/src/routes/ai.ts
             * 接口：DELETE /api/v1/ai/history
             */
            await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/ai/history`, {
              method: 'DELETE',
            });
            setMessages([]);
          } catch (error) {
            console.error('清空对话失败:', error);
          }
        },
      },
    ]);
  };

  // 快捷问题
  const quickQuestions = [
    '分析最新的监测数据',
    '当前流量和水位情况如何？',
    'TDS水质指标是否正常？',
    '大坝姿态角有无异常？',
    'LoRa通信状态如何？',
  ];

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle="dark">
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText variant="caption" color={theme.textSecondary}>
            AI ANALYSIS
          </ThemedText>
          <ThemedText variant="h1" color={theme.textPrimary} style={styles.headerTitle}>
            AI 智能分析
          </ThemedText>
          <View style={styles.divider} />

          {/* 清空按钮 */}
          {messages.length > 0 && (
            <TouchableOpacity style={styles.clearButton} onPress={clearHistory}>
              <FontAwesome6 name="trash" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* 对话区域 */}
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          style={styles.chatContainer}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome6 name="robot" size={48} color="#CCCCCC" style={styles.emptyIcon} />
              <ThemedText variant="h4" color={theme.textPrimary} style={styles.emptyText}>
                智能分析助手
              </ThemedText>
              <ThemedText variant="body" color={theme.textSecondary} style={styles.emptySubtext}>
                我可以帮你分析监测数据、识别异常并提供预警建议
              </ThemedText>

              {/* 快捷问题 */}
              <View style={styles.quickActions}>
                {quickQuestions.map((question, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.quickButton}
                    onPress={() => sendMessage(question)}
                  >
                    <ThemedText variant="small" color={theme.textPrimary} style={styles.quickButtonText}>
                      {question}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <>
              {messages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.messageContainer,
                    message.role === 'user' ? styles.userMessage : styles.assistantMessage,
                  ]}
                >
                  <ThemedText
                    variant="body"
                    color={message.role === 'user' ? '#FFFFFF' : theme.textPrimary}
                    style={styles.messageText}
                  >
                    {message.content || '正在思考...'}
                  </ThemedText>
                  {message.content && (
                    <ThemedText
                      variant="tiny"
                      color={message.role === 'user' ? 'rgba(255,255,255,0.6)' : theme.textMuted}
                      style={styles.messageTime}
                    >
                      {new Date(message.created_at).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </ThemedText>
                  )}
                </View>
              ))}

              {/* 加载指示器 */}
              {isTyping && messages[messages.length - 1]?.content === '' && (
                <View style={styles.typingContainer}>
                  <ActivityIndicator size="small" color="#111111" />
                  <ThemedText variant="small" color={theme.textSecondary} style={styles.typingText}>
                    正在分析...
                  </ThemedText>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* 输入区域 */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="输入你的问题..."
            placeholderTextColor={theme.textMuted}
            multiline
            editable={!isTyping}
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isTyping) && styles.sendButtonDisabled]}
            onPress={() => sendMessage()}
            disabled={!inputText.trim() || isTyping}
          >
            <FontAwesome6
              name="paper-plane"
              size={18}
              color={!inputText.trim() || isTyping ? '#CCCCCC' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
