import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeContext';

type AppBackgroundProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  ambientGlows?: boolean;
};

// Web-only: a pair of large, slowly-drifting glow blobs behind the screen's
// content, matching the ambient background on the MYPitch marketing site.
// Native keeps the plain solid background from AnimatedBackground.tsx —
// Metro picks this file automatically on web via the .web.tsx extension.
export default function AppBackground({ children, style, ambientGlows = true }: AppBackgroundProps) {
  const { colors, isDark } = useAppTheme();

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {isDark && ambientGlows ? (
        <>
          <GlowBlob color={colors.blueGlow} size={560} top={-160} left={-140} duration={23000} />
          <GlowBlob color={colors.greenGlow} size={620} top={-60} left={undefined} right={-160} duration={27000} />
        </>
      ) : null}
      {children}
    </View>
  );
}

type GlowBlobProps = {
  color: string;
  size: number;
  top: number;
  left?: number;
  right?: number;
  duration: number;
};

function GlowBlob({ color, size, top, left, right, duration }: GlowBlobProps) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, duration]);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 46] });
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });
  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'fixed',
          top,
          left,
          right,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ translateX }, { translateY }, { scale }],
          filter: 'blur(70px)',
        } as unknown as ViewStyle,
      ]}
    />
  );
}
