import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { useTranslation } from '../../i18n/LanguageContext';
import { useAcademyRealtime } from '../../lib/academyRealtime';
import { useAppTheme } from '../../theme/ThemeContext';
import { scaleFont } from '../../theme/typography';

export default function TabsLayout() {
  const { colors } = useAppTheme();
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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.greenLight,
        tabBarInactiveTintColor: colors.greyDark,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: scaleFont(11),
          fontWeight: '800',
        },
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
    </Tabs>
  );
}
