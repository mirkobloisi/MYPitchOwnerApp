import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLanguage } from '../i18n/LanguageContext';
import { CONTENT_MAX_WIDTH, useBreakpoint } from '../theme/breakpoints';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/layout';
import AnimatedBackground from './AnimatedBackground';
import AnimatedSwap from './AnimatedSwap';

type ScreenProps = {
  children: ReactNode;
  background?: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * Reading width on a large screen. Content is centred rather than stretched
   * edge to edge across a monitor; pass a larger value for screens that make
   * good use of the space, such as the Agenda.
   */
  maxWidth?: number;
  ambientGlows?: boolean;
};

export default function Screen({
  children,
  background,
  scroll = true,
  style,
  contentStyle,
  maxWidth = CONTENT_MAX_WIDTH,
  ambientGlows = true,
}: ScreenProps) {
  const { colors } = useAppTheme();
  const { isWide } = useBreakpoint();
  const { language } = useLanguage();
  const styles = makeStyles(colors);

  // Only constrain on a roomy screen; a phone keeps using its full width.
  const widthStyle: ViewStyle = isWide
    ? { width: '100%', maxWidth, alignSelf: 'center' }
    : {};

  return (
    <AnimatedBackground style={[styles.root, style]} ambientGlows={ambientGlows}>
      {background}
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {scroll ? (
            <ScrollView
              style={styles.container}
              contentContainerStyle={[styles.content, widthStyle, contentStyle]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Switching language rewrites every label on screen, so the
                  whole screen cross-fades rather than snapping. */}
              <AnimatedSwap swapKey={language}>{children}</AnimatedSwap>
            </ScrollView>
          ) : (
            <View style={[styles.container, styles.content, widthStyle, contentStyle]}>
              <AnimatedSwap swapKey={language} style={styles.container}>
                {children}
              </AnimatedSwap>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AnimatedBackground>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    safeArea: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: 120,
    },
  });
