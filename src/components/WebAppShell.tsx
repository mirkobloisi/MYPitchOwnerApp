import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import WebInboxPanel from './WebInboxPanel';
import { useTranslation } from '../i18n/LanguageContext';
import { useAcademyRealtime } from '../lib/academyRealtime';
import { useAuth } from '../lib/auth';
import {
  BOTTOM_BAR_HEIGHT,
  SIDEBAR_WIDTH,
  useBreakpoint,
} from '../theme/breakpoints';
import { AppColors, weeklineColors } from '../theme/palettes';
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
 * Native keeps the platform tab bar and has no equivalent of the sidebar — see
 * (tabs)/_layout.tsx.
 */
export default function WebAppShell({ children }: { children: ReactNode }) {
  const { isDesktop } = useBreakpoint();
  const { t } = useTranslation();
  const pathname = usePathname();
  const isWeeklineAgenda = isDesktop && pathname === '/agenda';
  const router = useRouter();
  const { unread } = useAcademyRealtime();
  const { pitchOwner } = useAuth();
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  useEffect(() => setIsInboxOpen(false), [pathname]);
  const { colors } = useAppTheme();
  const themed = useMemo(() => makeStyles(isWeeklineAgenda ? weeklineColors : colors), [colors, isWeeklineAgenda]);

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
          isWeeklineAgenda && styles.weeklineContent,
          isDesktop ? { paddingLeft: SIDEBAR_WIDTH } : { paddingBottom: BOTTOM_BAR_HEIGHT },
        ]}
      >
        {children}
      </View>

      {isDesktop ? (
        <View style={[themed.sidebar, isWeeklineAgenda && styles.weeklineSidebar]}>
          {isWeeklineAgenda && (
            <LinearGradient
              colors={['#0B1722', '#0D1B26', '#0A151E']}
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={[themed.brandRow, isWeeklineAgenda && styles.weeklineBrandRow]}>
            <Image
              source={isWeeklineAgenda
                ? require('../../assets/images/mypitch-weekline-logo.png')
                : require('../../assets/images/mypitch-logo.png')}
              style={[themed.brandLogo, isWeeklineAgenda && styles.weeklineBrandLogo]}
              resizeMode="contain"
              accessibilityLabel="MYPitch"
            />
            {!isWeeklineAgenda && <Text style={themed.brandRole}>{t('login.subtitle')}</Text>}
          </View>

          {isWeeklineAgenda && <Text style={styles.weeklineNavHeading}>{t('nav.workspace')}</Text>}
          <View style={themed.navGroup}>
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.name}
                label={t(item.labelKey)}
                icon={item.icon}
                isDesktop
                isFocused={effectivePath === item.href}
                waiting={waiting[item.name] ?? 0}
                colorsOverride={isWeeklineAgenda ? weeklineColors : undefined}
                weekline={isWeeklineAgenda}
                onPress={() => router.replace(item.href as any)}
              />
            ))}
          </View>
          <Pressable style={[themed.inboxOpenButton, isWeeklineAgenda && styles.weeklineInboxButton]} onPress={() => setIsInboxOpen(true)}>
            <Ionicons name="mail-outline" size={isWeeklineAgenda ? 15 : 17} color={isWeeklineAgenda ? weeklineColors.greenLight : colors.greenLight} />
            <Text style={[themed.inboxOpenLabel, isWeeklineAgenda && styles.weeklineInboxLabel]}>{t('inbox.title')}</Text>
            {unread.messages > 0 ? <Text style={themed.inboxOpenCount}>{unread.messages}</Text> : null}
          </Pressable>
          {isWeeklineAgenda && (
            <View style={styles.weeklineOwnerFooter}>
              <Text style={styles.weeklineOwnerName} numberOfLines={1}>{pitchOwner?.business_name || 'MYPitch'}</Text>
              <Text style={styles.weeklineOwnerCaption}>{t('nav.ownerWorkspace')}</Text>
            </View>
          )}
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

      {isInboxOpen ? (
        <View style={styles.inboxOverlay}>
          <Pressable style={styles.inboxBackdrop} onPress={() => setIsInboxOpen(false)} />
          <WebInboxPanel />
          <Pressable style={styles.closeInbox} onPress={() => setIsInboxOpen(false)} accessibilityLabel="Close inbox">
            <Ionicons name="close" size={19} color={colors.grey} />
          </Pressable>
        </View>
      ) : null}

    </View>
  );
}

function NavItem({
  label,
  icon,
  isDesktop,
  isFocused,
  waiting,
  colorsOverride,
  weekline = false,
  onPress,
}: {
  label: string;
  icon: IconName;
  isDesktop: boolean;
  isFocused: boolean;
  waiting: number;
  colorsOverride?: AppColors;
  weekline?: boolean;
  onPress: () => void;
}) {
  const { colors: appColors } = useAppTheme();
  const colors = colorsOverride ?? appColors;
  const themed = useMemo(() => makeStyles(colors), [colors]);
  const tint = isFocused ? colors.greenLight : colors.greyDark;

  return (
    <Pressable
      onPress={onPress}
      style={(state) => [
        isDesktop ? themed.sidebarItem : themed.bottomItem,
        isDesktop && weekline && styles.weeklineNavItem,
        isDesktop && isFocused && themed.sidebarItemActive,
        isDesktop && weekline && isFocused && styles.weeklineNavItemActive,
        isDesktop &&
          !isFocused &&
          (state as { hovered?: boolean }).hovered &&
          themed.sidebarItemHovered,
        state.pressed && themed.itemPressed,
      ]}
    >
      <View>
        <Ionicons name={icon} size={isDesktop ? (weekline ? 17 : 18) : 20} color={tint} />

        {waiting > 0 ? (
          <View style={themed.bell}>
            <Ionicons name="notifications" size={8} color={colors.blackText} />
          </View>
        ) : null}
      </View>
      <Text
        style={[
          isDesktop ? themed.sidebarLabel : themed.bottomLabel,
          isDesktop && weekline && styles.weeklineNavText,
          { color: tint },
          isFocused && themed.labelActive,
          isDesktop && weekline && isFocused && styles.weeklineNavTextActive,
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
  weeklineContent: {
    backgroundColor: weeklineColors.background,
  },
  weeklineSidebar: {
    backgroundColor: weeklineColors.backgroundSoft,
    paddingHorizontal: 11,
    paddingTop: 20,
  },
  weeklineBrandRow: {
    height: 65,
    justifyContent: 'center',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#30495B',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  weeklineBrandLogo: {
    width: 168,
    aspectRatio: 2048 / 688,
  },
  weeklineNavHeading: {
    color: '#84A5BC',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingBottom: 9,
  },
  weeklineNavItem: {
    borderWidth: 0,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  weeklineNavItemActive: {
    backgroundColor: '#1C4563',
    borderWidth: 0,
  },
  weeklineNavText: {
    fontSize: 14,
    fontWeight: '500',
  },
  weeklineNavTextActive: {
    fontWeight: '700',
    color: weeklineColors.white,
  },
  weeklineInboxButton: {
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 5,
  },
  weeklineInboxLabel: {
    fontSize: 14,
  },
  weeklineOwnerFooter: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: weeklineColors.border,
    paddingTop: 13,
    paddingHorizontal: 8,
    paddingBottom: 14,
  },
  weeklineOwnerName: {
    color: weeklineColors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  weeklineOwnerCaption: {
    color: weeklineColors.greyDark,
    fontSize: 11,
    marginTop: 3,
  },
  inboxOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
  },
  inboxBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  closeInbox: {
    position: 'absolute',
    right: 13,
    top: 19,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
      alignItems: 'center',
    },
    brandLogo: {
      width: 138,
      aspectRatio: 600 / 177,
    },
    brandRole: {
      color: colors.greenLight,
      fontSize: scaleFont(10),
      fontWeight: '800',
      marginTop: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    navGroup: {
      gap: 4,
    },
    inboxOpenButton: {
      marginTop: 16,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    inboxOpenLabel: {
      flex: 1,
      color: colors.white,
      fontSize: 12,
      fontWeight: '600',
    },
    inboxOpenCount: {
      color: colors.greenLight,
      fontSize: 11,
      fontWeight: '700',
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
