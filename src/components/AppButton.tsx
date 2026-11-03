import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/layout';
import { scaleFont } from '../theme/typography';

type AppButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

type AppButtonProps = Omit<PressableProps, 'style'> & {
  title: string;
  variant?: AppButtonVariant;
  fullWidth?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  colors?: AppColors;
};

export default function AppButton({
  title,
  variant = 'primary',
  fullWidth = true,
  disabled,
  loading = false,
  style,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  colors: colorsOverride,
  ...props
}: AppButtonProps) {
  const { colors: themeColors } = useAppTheme();
  const colors = colorsOverride ?? themeColors;
  const { styles, variantStyles, textStyles, primaryGradient } = useMemo(
    () => buildStyles(colors),
    [colors]
  );

  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

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
    if (!isDisabled) {
      animateTo(0.94, 0.85);
    }

    onPressIn?.(event);
  }

  function handlePressOut(event: GestureResponderEvent) {
    if (!isDisabled) {
      animateTo(1, 1);
    }

    onPressOut?.(event);
  }

  // Web only (native ignores hover): a small lift on mouse-over, so a
  // button gives feedback before the user even clicks it.
  function handleHoverIn(event: any) {
    if (!isDisabled) {
      animateTo(1.02, 1, 20);
    }

    onHoverIn?.(event);
  }

  function handleHoverOut(event: any) {
    if (!isDisabled) {
      animateTo(1, 1, 20);
    }

    onHoverOut?.(event);
  }

  const content = loading ? (
    <ActivityIndicator color={variant === 'primary' ? colors.blackText : colors.greenLight} />
  ) : (
    <Text style={[styles.text, textStyles[variant], isDisabled && styles.disabledText]}>
      {title}
    </Text>
  );

  return (
    <Pressable
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={[
        styles.touchable,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      <Animated.View
        style={[
          styles.animatedContainer,
          variant === 'primary' && styles.primaryShadow,
          variant === 'danger' && styles.dangerShadow,
          {
            transform: [{ scale }],
            opacity,
          },
        ]}
      >
        {variant === 'primary' ? (
          <LinearGradient
            colors={primaryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.base}
          >
            {content}
          </LinearGradient>
        ) : (
          <View style={[styles.base, variantStyles[variant]]}>{content}</View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function buildStyles(colors: AppColors) {
  const primaryGradient = [colors.greenLight, colors.green, colors.greenDeep] as const;

  const styles = StyleSheet.create({
    touchable: {
      borderRadius: radius.lg,
    },
    fullWidth: {
      width: '100%',
    },
    disabled: {
      opacity: 0.45,
    },
    animatedContainer: {
      borderRadius: radius.lg,
    },
    primaryShadow: {
      shadowColor: colors.greenLight,
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    dangerShadow: {
      shadowColor: colors.red,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 3,
    },
    base: {
      minHeight: 54,
      borderRadius: radius.lg,
      paddingHorizontal: 18,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      fontSize: scaleFont(16),
      fontWeight: '900',
      letterSpacing: -0.2,
    },
    disabledText: {
      opacity: 0.8,
    },
  });

  const variantStyles = StyleSheet.create({
    primary: {
      backgroundColor: colors.green,
    },
    outline: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.greenLight,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    danger: {
      backgroundColor: colors.redSoft,
      borderWidth: 1,
      borderColor: 'rgba(255, 69, 58, 0.35)',
    },
  });

  const textStyles = StyleSheet.create({
    primary: {
      color: colors.blackText,
    },
    outline: {
      color: colors.greenLight,
    },
    ghost: {
      color: colors.greenLight,
    },
    danger: {
      color: colors.red,
    },
  });

  return { styles, variantStyles, textStyles, primaryGradient };
}
