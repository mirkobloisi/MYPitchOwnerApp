import { ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useLanguage } from '../i18n/LanguageContext';
import { CONTENT_MAX_WIDTH, useBreakpoint } from '../theme/breakpoints';
import { AppColors, weeklineColors } from '../theme/palettes';
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
  safeAreaEdges?: readonly Edge[];
};

export default function Screen({
  children,
  background,
  scroll = true,
  style,
  contentStyle,
  maxWidth = CONTENT_MAX_WIDTH,
  ambientGlows = true,
  safeAreaEdges,
}: ScreenProps) {
  const { colors: appColors } = useAppTheme();
  const { isWide, isDesktop } = useBreakpoint();
  const { language } = useLanguage();
  const isDesktopWeb = Platform.OS === 'web' && isDesktop;
  const colors = isDesktopWeb ? weeklineColors : appColors;
  const styles = makeStyles(colors);
  const screenBackground = background ?? (
    isDesktopWeb ? (
      <Image
        source={require('../../assets/images/weekline-soft-halo.png')}
        style={styles.weeklineBackground}
        resizeMode="stretch"
      />
    ) : undefined
  );

  // Only constrain on a roomy screen; a phone keeps using its full width.
  const widthStyle: ViewStyle = isWide
    ? { width: '100%', maxWidth, alignSelf: 'center' }
    : {};

  return (
    <AnimatedBackground
      style={[styles.root, isDesktopWeb && styles.desktopWebCanvas, style]}
      ambientGlows={ambientGlows}
    >
      {screenBackground}
      <SafeAreaView style={styles.safeArea} edges={safeAreaEdges}>
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
    desktopWebCanvas: {
      backgroundColor: '#08111A',
    },
    weeklineBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
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
