import React, { ReactNode, useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

type AnimatedPressableProps = PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Layout of the animated children, separate from the outer hit area. */
  contentStyle?: StyleProp<ViewStyle>;
  pressedScale?: number;
  /** Web-only lift on mouse-over. Larger for standalone buttons than cards. */
  hoverScale?: number;
};

export default function AnimatedPressable({
  children,
  style,
  contentStyle,
  pressedScale = 0.94,
  hoverScale = 1.015,
  disabled,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  ...props
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  function animateTo(scaleValue: number, opacityValue: number, speed = 32) {
    Animated.spring(scale, {
      toValue: scaleValue,
      speed,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
    Animated.timing(opacity, {
      toValue: opacityValue,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }

  function handlePressIn(event: GestureResponderEvent) {
    if (!disabled) {
      animateTo(pressedScale, 0.85);
    }

    onPressIn?.(event);
  }

  function handlePressOut(event: GestureResponderEvent) {
    if (!disabled) {
      animateTo(1, 1);
    }

    onPressOut?.(event);
  }

  // Web only (native ignores hover): a small lift on mouse-over.
  function handleHoverIn(event: any) {
    if (!disabled) {
      animateTo(hoverScale, 1, 20);
    }

    onHoverIn?.(event);
  }

  function handleHoverOut(event: any) {
    if (!disabled) {
      animateTo(1, 1, 20);
    }

    onHoverOut?.(event);
  }

  return (
    <Pressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={style}
      {...props}
    >
      <Animated.View
        style={[contentStyle, {
          transform: [{ scale }],
          opacity,
        }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
