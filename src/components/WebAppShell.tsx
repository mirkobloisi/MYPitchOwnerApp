import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import React, { ReactNode, useMemo } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import WebInboxPanel from './WebInboxPanel';
import { useTranslation } from '../i18n/LanguageContext';
import { useAcademyRealtime } from '../lib/academyRealtime';
import {
  BOTTOM_BAR_HEIGHT,
  INBOX_WIDTH,
  SIDEBAR_WIDTH,
  useBreakpoint,
} from '../theme/breakpoints';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont } from '../theme/typography';

type IconName = keyof typeof Ionicons.glyphMap;

const NAV_ITEMS: { name: string; href: string; labelKey: string; icon: IconName }[] = [
  { name: 'agenda', href: '/agenda', labelKey: 'nav.agenda', icon: 'calendar-outline' },
  { name: 'availability', href: '/availability', labelKey: 'nav.availability', icon: 'time-outline' },
  { name: 'pitches', href: '/pitches', labelKey: 'nav.pitches', icon: 'football-outline' },
  { name: 'academy', href: '/academy', labelKey: 'nav.academy', icon: 'school-outline' },
  { name: 'stats', href: '/stats', labelKey: 'nav.stats', icon: 'bar-chart-outline' },
  { name: 'transactions', href: '/transactions', labelKey: 'nav.transactions', icon: 'card-outline' },
  { name: 'profile', href: '/profile', labelKey: 'nav.profile', icon: 'person-circle-outline' },
];

/**
 * A detail screen reached from a tab (a booking, an academy's own page)
 * still highlights the tab it came from, rather than showing no active item.
 */
const ROUTE_TAB_OVERRIDE: Record<string, string> = {
  '/academy-details': '/academy',
  '/academy-chat': '/academy',
  '/academy-group': '/academy',
  '/booking-details': '/agenda',
  '/block-slot': '/agenda',
  '/add-external-booking': '/agenda',
  '/booking-settings': '/agenda',
  '/manage-block': '/agenda',
};

/**
 * Browser navigation for the Pitch Owner app, kept mounted at the root so it
 * never disappears — not for the seven tabs, and not for a detail screen
 * (an academy's own page, a booking) reached by drilling into one of them.
 *
 * On a wide enough monitor a second panel on the right surfaces messages and
 * notifications without leaving whatever screen is open. Native keeps the
 * platform tab bar and has no equivalent of either panel — see
 * (tabs)/_layout.tsx.
 */
export default function WebAppShell({ children }: { children: ReactNode }) {
  const { isDesktop, hasInboxPanel } = useBreakpoint();
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { unread } = useAcademyRealtime();
  const { colors } = useAppTheme();
  const themed = useMemo(() => makeStyles(colors), [colors]);

  if (Platform.OS !== 'web') return <>{children}</>;

  const waiting: Record<string, number> = {
    academy: unread.players + unread.parents + unread.messages,
  };

  const effectivePath = ROUTE_TAB_OVERRIDE[pathname] ?? pathname;

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.content,
          isDesktop ? { paddingLeft: SIDEBAR_WIDTH } : { paddingBottom: BOTTOM_BAR_HEIGHT },
          hasInboxPanel ? { paddingRight: INBOX_WIDTH } : null,
        ]}
      >
        {children}
      </View>

      {isDesktop ? (
        <View style={themed.sidebar}>
          <View style={themed.brandRow}>
            <Image
              source={require('../../assets/images/mypitch-logo.png')}
              style={themed.brandLogo}
              resizeMode="contain"
              accessibilityLabel="MYPitch"
            />
            <Text style={themed.brandRole}>{t('login.subtitle')}</Text>
          </View>

          <View style={themed.navGroup}>
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.name}
                label={t(item.labelKey)}
                icon={item.icon}
                isDesktop
                isFocused={effectivePath === item.href}
                waiting={waiting[item.name] ?? 0}
                onPress={() => router.replace(item.href as any)}
              />
            ))}
          </View>
        </View>
      ) : (
        <View style={themed.bottomBar}>
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.name}
              label={t(item.labelKey)}
              icon={item.icon}
              isDesktop={false}
              isFocused={effectivePath === item.href}
              waiting={waiting[item.name] ?? 0}
              onPress={() => router.replace(item.href as any)}
            />
          ))}
        </View>
      )}

      {hasInboxPanel ? <WebInboxPanel /> : null}
    </View>
  );
}

function NavItem({
  label,
  icon,
  isDesktop,
  isFocused,
  waiting,
  onPress,
}: {
  label: string;
  icon: IconName;
  isDesktop: boolean;
  isFocused: boolean;
  waiting: number;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  const tint = isFocused ? colors.greenLight : colors.greyDark;

  return (
    <Pressable
      onPress={onPress}
      style={(state) => [
        isDesktop ? themed.sidebarItem : themed.bottomItem,
        isDesktop && isFocused && themed.sidebarItemActive,
        isDesktop &&
          !isFocused &&
          (state as { hovered?: boolean }).hovered &&
          themed.sidebarItemHovered,
        state.pressed && themed.itemPressed,
      ]}
    >
      <View>
        <Ionicons name={icon} size={isDesktop ? 18 : 20} color={tint} />

        {waiting > 0 ? (
          <View style={themed.bell}>
            <Ionicons name="notifications" size={8} color={colors.blackText} />
          </View>
        ) : null}
      </View>
      <Text
        style={[
          isDesktop ? themed.sidebarLabel : themed.bottomLabel,
          { color: tint },
          isFocused && themed.labelActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    bell: {
      position: 'absolute',
      right: -6,
      top: -4,
      width: 14,
      height: 14,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.greenLight,
    },
    sidebar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: SIDEBAR_WIDTH,
      backgroundColor: colors.card,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xl,
    },
    brandRow: {
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.xl,
    },
    brandLogo: {
      width: '100%',
      maxWidth: 182,
      aspectRatio: 600 / 177,
    },
    brandRole: {
      color: colors.greenLight,
      fontSize: scaleFont(10),
      fontWeight: '800',
      marginTop: 6,
      marginLeft: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    navGroup: {
      gap: 4,
    },
    sidebarItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 11,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    sidebarItemActive: {
      backgroundColor: colors.greenSoft,
      borderColor: colors.borderGreen,
    },
    sidebarItemHovered: {
      backgroundColor: colors.surfaceMuted,
    },
    sidebarLabel: {
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: BOTTOM_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    bottomItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: spacing.xs,
    },
    bottomLabel: {
      fontSize: scaleFont(11),
      fontWeight: '800',
    },
    labelActive: {
      fontWeight: '900',
    },
    itemPressed: {
      opacity: 0.7,
    },
  });
