import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n/LanguageContext';
import { useAcademyRealtime } from '../../lib/academyRealtime';
import { useAppTheme } from '../../theme/ThemeContext';
import { BOTTOM_BAR_HEIGHT } from '../../theme/breakpoints';
import { scaleFont } from '../../theme/typography';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  agenda: 'calendar-outline',
  availability: 'time-outline',
  pitches: 'football-outline',
  academy: 'school-outline',
  stats: 'bar-chart-outline',
  transactions: 'card-outline',
  profile: 'person-circle-outline',
};
const PRIMARY_TABS = ['agenda', 'availability', 'academy'];

function OwnerMobileTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { unread } = useAcademyRealtime();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeRoute = state.routes[state.index]?.name ?? 'agenda';
  const moreRoutes = state.routes.filter((route) => route.name !== 'inbox' && !PRIMARY_TABS.includes(route.name));

  function selectRoute(route: (typeof state.routes)[number]) {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented && route.name !== activeRoute) {
      navigation.navigate(route.name);
    }
    setMoreOpen(false);
  }

  return (
    <View style={[nativeStyles.barRoot, { height: BOTTOM_BAR_HEIGHT + insets.bottom }]}>
      {moreOpen ? (
        <View style={[nativeStyles.moreMenu, { bottom: BOTTOM_BAR_HEIGHT + insets.bottom + 7, backgroundColor: colors.card, borderColor: colors.border }]}>
          {moreRoutes.map((route) => {
            const focused = activeRoute === route.name;
            return (
              <Pressable key={route.key} style={[nativeStyles.moreItem, focused && { backgroundColor: colors.greenSoft }]} onPress={() => selectRoute(route)}>
                <Ionicons name={TAB_ICONS[route.name] ?? 'ellipse-outline'} size={18} color={focused ? colors.greenLight : colors.greyDark} />
                <Text style={[nativeStyles.moreLabel, { color: focused ? colors.white : colors.grey }]}>{t(`nav.${route.name}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={[nativeStyles.bar, { height: BOTTOM_BAR_HEIGHT + insets.bottom, backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom }]}>
        {PRIMARY_TABS.map((name) => {
          const route = state.routes.find((item) => item.name === name);
          if (!route) return null;
          const focused = activeRoute === name;
          const academyUnread = name === 'academy' ? unread.players + unread.parents + unread.messages : 0;
          return (
            <Pressable key={route.key} style={nativeStyles.tabItem} onPress={() => selectRoute(route)} accessibilityRole="button" accessibilityState={{ selected: focused }}>
              <View style={nativeStyles.tabIconWrap}>
                <Ionicons name={TAB_ICONS[name]} size={21} color={focused ? colors.greenLight : colors.greyDark} />
                {academyUnread > 0 ? <View style={[nativeStyles.tabBadge, { backgroundColor: colors.greenLight }]}><Text style={[nativeStyles.tabBadgeText, { color: colors.blackText }]}>{academyUnread}</Text></View> : null}
              </View>
              <Text style={[nativeStyles.tabLabel, { color: focused ? colors.greenLight : colors.greyDark }]} numberOfLines={1}>{t(`nav.${name}`)}</Text>
            </Pressable>
          );
        })}
        <Pressable style={nativeStyles.tabItem} onPress={() => setMoreOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: moreOpen, selected: moreRoutes.some((route) => route.name === activeRoute) }}>
          <Ionicons name="ellipsis-horizontal" size={21} color={moreRoutes.some((route) => route.name === activeRoute) ? colors.greenLight : colors.greyDark} />
          <Text style={[nativeStyles.tabLabel, { color: moreRoutes.some((route) => route.name === activeRoute) ? colors.greenLight : colors.greyDark }]}>{t('nav.more')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { unread } = useAcademyRealtime();

  // The browser's nav (sidebar on a monitor, a bottom bar otherwise) is
  // drawn once at the root — see WebAppShell — so it stays put across tabs
  // *and* the detail screens reached from them. This is just a plain stack
  // of the same seven screens for that shell to wrap. Phones and tablets
  // keep the platform tab bar untouched. Platform.OS never changes at
  // runtime, so this branch can't cause a remount.
  if (Platform.OS === 'web') {
    return (
      <Stack
        initialRouteName="agenda"
        screenOptions={{ headerShown: false, animation: 'none' }}
      />
    );
  }

  return (
    <Tabs
      initialRouteName="agenda"
      tabBar={(props) => <OwnerMobileTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="agenda"
        options={{
          title: t('nav.agenda'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="availability"
        options={{
          title: t('nav.availability'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pitches"
        options={{
          title: t('nav.pitches'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="football-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="academy"
        options={{
          title: t('nav.academy'),
          // A badge on the tab the notice came from, so the owner is pointed
          // at the thing that changed.
          tabBarBadge: unread.players + unread.parents + unread.messages > 0 ? unread.players + unread.parents + unread.messages : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('nav.stats'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t('nav.transactions'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="card-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="inbox" options={{ href: null }} />
    </Tabs>
  );
}

const nativeStyles = StyleSheet.create({
  barRoot: {
    position: 'relative',
    zIndex: 30,
    overflow: 'visible',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabIconWrap: {
    position: 'relative',
  },
  tabLabel: {
    maxWidth: '100%',
    fontSize: scaleFont(10.5),
    fontWeight: '700',
  },
  tabBadge: {
    position: 'absolute',
    right: -9,
    top: -5,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  moreMenu: {
    position: 'absolute',
    zIndex: 50,
    elevation: 16,
    right: 10,
    width: 220,
    borderWidth: 1,
    borderRadius: 11,
    padding: 5,
  },
  moreItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 11,
    borderRadius: 7,
  },
  moreLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
