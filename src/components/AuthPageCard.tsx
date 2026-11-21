import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { weeklineColors as colors } from '../theme/palettes';
import Screen from './Screen';

/** Centered logo + card used by the small public account pages (forgot / reset / secure). */
export function AuthPageCard({ children }: { children: React.ReactNode }) {
  return (
    <Screen maxWidth={520} ambientGlows={false} contentStyle={styles.content}>
      <View style={styles.stack}>
        <View style={styles.brand}>
          <Image source={require('../../assets/images/mypitch-weekline-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="MYPitch" />
        </View>
        <View style={styles.card}>{children}</View>
      </View>
    </Screen>
  );
}

export function AuthField({
  label, value, onChangeText, secureTextEntry, autoComplete, keyboardType, onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoComplete?: 'email' | 'new-password';
  keyboardType?: 'email-address';
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={onSubmitEditing}
        style={styles.input}
        placeholderTextColor={colors.greyDark}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function AuthButton({
  label, onPress, busy, variant = 'primary',
}: { label: string; onPress: () => void; busy?: boolean; variant?: 'primary' | 'danger' | 'outline' }) {
  return (
    <Pressable
      style={[styles.button, variant === 'danger' && styles.buttonDanger, variant === 'outline' && styles.buttonOutline, busy && styles.disabled]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
    >
      {busy ? <ActivityIndicator size="small" color={variant === 'outline' ? colors.white : colors.blackText} /> : null}
      <Text style={[styles.buttonText, variant === 'danger' && styles.buttonTextDanger, variant === 'outline' && styles.buttonTextOutline]}>{label}</Text>
    </Pressable>
  );
}

export const authText = StyleSheet.create({
  title: { color: colors.white, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  intro: { color: colors.grey, fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 6 },
  center: { textAlign: 'center' },
  error: { color: colors.red, fontSize: 13, marginTop: 12, lineHeight: 19 },
});

const styles = StyleSheet.create({
  content: { width: '100%', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 48 },
  stack: { gap: 20 },
  brand: { alignItems: 'center' },
  logo: { width: 190, height: 64 },
  card: { padding: 22, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 4 },
  field: { marginTop: 8 },
  label: { color: colors.greySoft, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft, color: colors.white, fontSize: 15 },
  button: { minHeight: 46, marginTop: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 9, backgroundColor: colors.blueLight },
  buttonDanger: { backgroundColor: colors.red },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, marginTop: 10 },
  buttonText: { color: colors.blackText, fontSize: 15, fontWeight: '800' },
  buttonTextDanger: { color: colors.white },
  buttonTextOutline: { color: colors.white },
  disabled: { opacity: 0.55 },
});
