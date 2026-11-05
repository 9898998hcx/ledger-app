import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

/** 全屏切换按钮：进入/退出全屏，选择权在用户 */
export default function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    handler();
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggle = async () => {
    if (Platform.OS !== 'web') return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // 浏览器可能拒绝（缺少用户手势），保持静默
    }
  };

  return (
    <Pressable style={[styles.button, isFullscreen && styles.active]} onPress={() => void toggle()}>
      <Text style={[styles.text, isFullscreen && styles.textActive]}>
        {isFullscreen ? '退出全屏' : '全屏'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  active: { backgroundColor: '#4f6bff', borderColor: '#4f6bff' },
  text: { fontSize: 13, fontWeight: '600', color: '#3b4fd9' },
  textActive: { color: '#ffffff' },
});
