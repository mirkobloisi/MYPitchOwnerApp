import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n/LanguageContext';
import { useAcademyRealtime } from '../../lib/academyRealtime';
import { BOTTOM_BAR_HEIGHT } from '../../theme/breakpoints';
import { weeklineColors } from '../../theme/palettes';
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
const PRIMARY_TABS = ['agenda', 'availability', 'academy', 'profile'];

function OwnerMobileTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { t } = useTranslation();
  const { unread } = useAcademyRealtime();
  const colors = weeklineColors;
  const activeRoute = state.routes[state.index]?.name ?? 'agenda';

  function selectRoute(route: (typeof state.routes)[number]) {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented && route.name !== activeRoute) {
      navigation.navigate(route.name);
    }
  }

  return (
    <View style={[nativeStyles.barRoot, { height: BOTTOM_BAR_HEIGHT + insets.bottom }]}>
      <View style={[nativeStyles.bar, { height: BOTTOM_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
        {PRIMARY_TABS.map((name) => {
          const route = state.routes.find((item) => item.name === name);
          if (!route) return null;
          const focused = activeRoute === name;
          const academyUnread = name === 'academy' ? unread.players + unread.parents + unread.messages : 0;
          return (
            <Pressable key={route.key} style={nativeStyles.tabItem} onPress={() => selectRoute(route)} accessibilityRole="button" accessibilityState={{ selected: focused }}>
              <View style={nativeStyles.tabIconWrap}>
                <Ionicons name={TAB_ICONS[name]} size={21} color={focused ? colors.blueLight : colors.grey} />
                {academyUnread > 0 ? <View style={[nativeStyles.tabBadge, { backgroundColor: colors.blueLight }]}><Text style={[nativeStyles.tabBadgeText, { color: colors.blackText }]}>{academyUnread}</Text></View> : null}
              </View>
              <Text style={[nativeStyles.tabLabel, { color: focused ? colors.blueLight : colors.grey }]} numberOfLines={1}>{t(`nav.${name}`)}</Text>
              {focused ? <View style={nativeStyles.activeUnderline} /> : null}
            </Pressable>
          );
        })}
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
    borderTopColor: '#203542',
    backgroundColor: '#07121B',
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabIconWrap: {
    position: 'relative',
  },
  tabLabel: {
    maxWidth: '100%',
    fontSize: scaleFont(10),
    fontWeight: '600',
  },
  activeUnderline: {
    width: 30,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#61BAFB',
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
});
