import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import EnvironmentBanner from '../components/EnvironmentBanner';
import WebAppShell from '../components/WebAppShell';
import { AcademyRealtimeProvider } from '../lib/academyRealtime';
import { AuthProvider, STAFF_ASSIGNABLE_TABS, useAuth } from '../lib/auth';
import { useAppTheme, ThemeProvider } from '../theme/ThemeContext';
import { LanguageProvider } from '../i18n/LanguageContext';
import { weeklineColors } from '../theme/palettes';

function AppGate() {
  const router = useRouter();
  const segments = useSegments();
  const { colors, isDark, isReady: themeReady } = useAppTheme();
  const { isLoading, session, profile, pitchOwner, ownerTermsAccepted, isStaff, canUseTab } = useAuth();

  // Every icon in the app comes from Ionicons, which is a font: it has to be
  // registered before any glyph can draw, or icons render as empty boxes.
  //
  // The font is loaded from our own assets folder rather than from
  // `Ionicons.font`, because that resolves to a path under node_modules —
  // and Netlify does not deploy anything inside a node_modules folder, so on
  // the website the file silently went missing and every icon broke. The
  // family name must stay exactly "ionicons": that is the fontFamily
  // @expo/vector-icons puts on every glyph.
  //
  // If the font fails to load we carry on regardless: icons would be missing,
  // but that is far better than sitting on a loading spinner forever.
  const [fontsLoaded, fontError] = useFonts({
    ionicons: require('../../assets/fonts/Ionicons.ttf'),
  });
  const fontsReady = fontsLoaded || !!fontError;

  // `segments` is [] on the bare index route, ['(auth)', 'login'],
  // ['(tabs)', 'agenda'], ['block-slot'] for a modal, and so on.
  const group = segments[0];
  const inAuthGroup = group === '(auth)';
  const onLoginScreen = inAuthGroup && segments[1] === 'login';
  const onSignupScreen = inAuthGroup && segments[1] === 'signup';
  const onPendingScreen = inAuthGroup && segments[1] === 'pending';
  const onIndexRoute = group === undefined;
  const onAcceptTermsScreen = group === 'accept-terms';
  // A parent opening their invite link has no MYPitch account at all — this
  // page must work signed out, same as login/signup.
  // A new staff member opening their invitation link has no account yet either.
  // The forgot-password, reset-password and "this wasn't me" pages are opened
  // from emails, usually by someone who is signed out (or just got signed out).
  const onRecoveryScreen = ['forgot-password', 'reset-password', 'secure-account'].includes(String(group));
  const onJoinScreen = onRecoveryScreen || ['join', 'join-staff'].includes(String(group));
  const secondSegment = String(segments[1] ?? '');

  useEffect(() => {
    if (isLoading || !themeReady) return;

    const isApprovedOwner =
      !!session && profile?.role === 'pitch_owner' && pitchOwner?.status === 'active';
    // A staff member is approved while their membership is active AND their
    // employer's workspace is. The employer's owner record is loaded as
    // `pitchOwner`, so the status check is the same.
    const isApprovedStaff =
      !!session && profile?.role === 'staff' && isStaff && pitchOwner?.status === 'active';

    // Each branch below states where the user MUST be, then moves them there
    // if they aren't already. Written this way so there is no combination of
    // auth state and current route that matches no rule and strands the user
    // (the bare index route used to fall through every check and sit on its
    // loading spinner forever).
    if (!session) {
      // The signup ("Request Owner Access") screen is reachable while logged
      // out too — without this it matches neither onLoginScreen nor
      // onPendingScreen below and gets bounced straight back to /login the
      // instant it renders, so tapping the link from Login looked like it did
      // nothing.
      if (!onLoginScreen && !onSignupScreen && !onJoinScreen) router.replace('/login');
      return;
    }

    // The join page is reachable at any auth state — a signed-out parent
    // registering, or an owner who tapped their own link to see it — so it
    // never gets bounced onward by the rules below either.
    if (onJoinScreen) return;

    if (!isApprovedOwner && !isApprovedStaff) {
      if (!onPendingScreen) router.replace('/pending');
      return;
    }

    // Approved, but hasn't accepted the current Owner Terms version yet (or a
    // newer version was published since their last acceptance): hold them on
    // accept-terms until they do. This is a real gate, not just a reminder —
    // continuing to use the Owner Dashboard must not itself count as
    // acceptance (see Clause 13 of the Owner Terms).
    if (isApprovedOwner && !ownerTermsAccepted) {
      if (!onAcceptTermsScreen) router.replace('/accept-terms');
      return;
    }

    // Staff only ever see what their owner gave them. The database enforces
    // the same list; this just keeps them off screens that would show nothing
    // (for instance by typing an address) and lands them on their first one.
    if (isApprovedStaff) {
      const agendaRoutes = ['add-external-booking', 'block-slot', 'manage-block', 'booking-details'];
      const academyRoutes = ['academy-details', 'academy-chat', 'academy-group'];
      const area = String(group ?? '');
      let allowed = false;
      if (area === '(tabs)') allowed = canUseTab(secondSegment === 'inbox' ? 'academy' : secondSegment || 'agenda');
      else if (agendaRoutes.includes(area)) allowed = canUseTab('agenda');
      else if (academyRoutes.includes(area)) allowed = canUseTab('academy');

      if (onIndexRoute || inAuthGroup || onAcceptTermsScreen || !allowed) {
        const firstTab = STAFF_ASSIGNABLE_TABS.find((tab) => canUseTab(tab)) ?? 'profile';
        router.replace(`/(tabs)/${firstTab}` as any);
      }
      return;
    }

    // Approved owner who has accepted the current terms: send them into the
    // app from the index route, from any auth screen, or straight off the
    // accept-terms screen once they've just accepted. Modal routes
    // (block-slot, booking-details, …) live at the root level and must be
    // left alone so they can stay open.
    if (onIndexRoute || inAuthGroup || onAcceptTermsScreen) {
      router.replace('/(tabs)/agenda');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLoading,
    themeReady,
    session,
    profile,
    pitchOwner,
    ownerTermsAccepted,
    isStaff,
    canUseTab,
    group,
    secondSegment,
    inAuthGroup,
    onLoginScreen,
    onSignupScreen,
    onPendingScreen,
    onIndexRoute,
    onAcceptTermsScreen,
    onJoinScreen,
  ]);

  // The recovery pages sign the person in and out themselves while they work
  // (the emailed link signs them in, then they are signed out again). Showing
  // the loading spinner during that would unmount the page and lose its state,
  // so they stay on screen whatever the auth state is doing.
  if ((isLoading && !onRecoveryScreen) || !themeReady || !fontsReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Platform.OS === 'web' ? weeklineColors.background : colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={Platform.OS === 'web' ? weeklineColors.blueLight : colors.greenLight} size="large" />
      </View>
    );
  }

  // Nothing to put a nav shell around before the owner is actually in the
  // app: signed-out screens, the terms gate, and a parent's invite link have
  // no owner context (or, for accept-terms, no navigating away yet anyway).
  const showAppShell = !inAuthGroup && !onAcceptTermsScreen && !onJoinScreen;

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
        animationDuration: 180,
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="accept-terms" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" />
      {/* `presentation: 'modal'` gives native its sheet transition, but on
          web it has none of its own — so state the slide explicitly. */}
      <Stack.Screen
        name="add-external-booking"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="block-slot"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="booking-settings"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="booking-details"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="manage-block"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {showAppShell ? <WebAppShell>{stack}</WebAppShell> : stack}
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          {/* Inside AuthProvider: the channel is keyed to the signed-in owner. */}
          <AcademyRealtimeProvider>
            <View style={{ flex: 1 }}>
              <EnvironmentBanner />
              <View style={{ flex: 1 }}>
                <AppGate />
              </View>
            </View>
          </AcademyRealtimeProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
