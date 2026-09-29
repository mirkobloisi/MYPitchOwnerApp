import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../i18n/LanguageContext';
import { useAcademyRealtime } from '../lib/academyRealtime';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/layout';
import AnimatedPressable from './AnimatedPressable';
import { scaleFont } from '../theme/typography';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: ReactNode;
  onBackPress?: () => void;
  colorsOverride?: AppColors;
  refined?: boolean;
  brandLogo?: boolean;
  showMenu?: boolean;
  onMenuPress?: () => void;
};

export default function AppHeader({
  title,
  subtitle,
  showBack = true,
  right,
  onBackPress,
  colorsOverride,
  refined = false,
  brandLogo = false,
  showMenu = false,
  onMenuPress,
}: AppHeaderProps) {
  const router = useRouter();
  const { colors: appColors } = useAppTheme();
  const colors = colorsOverride ?? appColors;
  const { t } = useTranslation();
  const { unread } = useAcademyRealtime();
  const totalUnread = unread.players + unread.parents + unread.messages;
  const showNotificationBell = Platform.OS !== 'web' && !showBack;
  const styles = makeStyles(colors);

  function handleBack() {
    if (onBackPress) {
      onBackPress();
      return;
    }

    router.back();
  }

  return (
    <View>
      <View style={styles.header}>
        {showBack ? (
          <AnimatedPressable
            pressedScale={0.9}
            style={styles.headerSide}
            onPress={handleBack}
          >
            <View style={styles.backButton}>
              <Ionicons name="chevron-back" size={22} color={colors.white} />
            </View>
          </AnimatedPressable>
        ) : showMenu ? (
          <Pressable
            style={styles.headerSide}
            onPress={onMenuPress}
            accessibilityRole="button"
            accessibilityLabel={t('nav.more')}
          >
            <Ionicons name="menu-outline" size={26} color={colors.white} />
          </Pressable>
        ) : (
          <View style={styles.headerSide} />
        )}

        {brandLogo ? (
          <Image
            source={require('../../assets/images/mypitch-weekline-logo.png')}
            style={styles.headerBrandLogo}
            resizeMode="contain"
            accessibilityLabel="MYPitch"
          />
        ) : (
          <Text numberOfLines={1} style={[styles.headerTitle, refined && styles.refinedHeaderTitle]}>
            {title}
          </Text>
        )}

        <View style={styles.headerSide}>
          {showNotificationBell ? (
            <Pressable
              style={[styles.notificationButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push('/(tabs)/inbox' as any)}
              accessibilityRole="button"
              accessibilityLabel={t('inbox.notifications')}
            >
              <Ionicons name="notifications-outline" size={19} color={colors.white} />
              {totalUnread > 0 ? <View style={[styles.notificationBadge, { backgroundColor: colors.greenLight }]}><Text style={[styles.notificationBadgeText, { color: colors.blackText }]}>{totalUnread}</Text></View> : null}
            </Pressable>
          ) : right}
        </View>
      </View>

      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  header: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSide: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  notificationBadge: {
    position: 'absolute',
    right: -3,
    top: -3,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  headerTitle: {
    flex: 1,
    color: colors.white,
    fontSize: scaleFont(20),
    fontWeight: '900',
    textAlign: 'center',
  },
  headerBrandLogo: {
    width: 142,
    height: 44,
  },
  refinedHeaderTitle: {
    fontSize: scaleFont(19),
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.grey,
    fontSize: scaleFont(13),
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
});
