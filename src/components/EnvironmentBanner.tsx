import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

// Set EXPO_PUBLIC_APP_ENV=test on the test site's build (Cloudflare variable
// or .env). Anything else, including leaving it out, is the real site.
export const isTestEnvironment = process.env.EXPO_PUBLIC_APP_ENV === 'test';

/**
 * A strip across the top of every screen of the TEST build, so nobody can
 * mistake it for the real site. The real build renders nothing here.
 */
export default function EnvironmentBanner() {
  useEffect(() => {
    if (!isTestEnvironment || Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!document.title.startsWith('[TEST]')) document.title = `[TEST] ${document.title}`;
  });

  if (!isTestEnvironment) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>TEST ENVIRONMENT — not the real MYPitch. Everything here is test data.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#F5A524', paddingVertical: 5, paddingHorizontal: 12, alignItems: 'center', zIndex: 1000 },
  text: { color: '#1A1100', fontSize: 12, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
});
