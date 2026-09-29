import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';

type AppBackgroundProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  ambientGlows?: boolean;
};

/**
 * The app used to sit on a gradient with three slowly drifting glows. That was
 * removed in favour of a plain solid background, so this is now just a solid
 * colour container.
 *
 * Nothing imports it any more — Screen paints its own background — but it is
 * kept as a safe no-op so any stray import still renders correctly rather than
 * breaking the build.
 */
export default function AppBackground({ children, style }: AppBackgroundProps) {
  const { colors } = useAppTheme();
  const styles = makeStyles(colors);

  return <View style={[styles.background, style]}>{children}</View>;
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    background: {
      flex: 1,
      backgroundColor: colors.background,
    },
  });
