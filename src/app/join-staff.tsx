import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import Screen from '../components/Screen';
import { useTranslation } from '../i18n/LanguageContext';
import { fill, useAcademyHubLabels } from '../lib/academyHubLabels';
import { supabase } from '../lib/supabase';
import { weeklineColors as colors } from '../theme/palettes';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Where a new staff member lands from their invitation email. Works signed
 * out. The database ties the account to the invitation (and to the email it
 * was sent to) at sign-up, so nothing here can be used to join a team
 * without a valid link.
 */
export default function JoinStaffScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const hub = useAcademyHubLabels();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { needsConfirmation: boolean; email: string }>(null);
  // What the owner set up for this link: the business, and the email they
  // invited (so the new staff member does not have to type it).
  const [invite, setInvite] = useState<'loading' | 'invalid' | { business: string; email: string | null; isCoach: boolean; academy: string | null }>('loading');

  useEffect(() => {
    if (!token) { setInvite('invalid'); return; }
    let cancelled = false;
    supabase.rpc('staff_invite_preview', { p_token: token }).then(({ data, error: previewError }) => {
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (previewError || !row) { setInvite('invalid'); return; }
      setInvite({ business: row.business_name, email: row.invited_email ?? null, isCoach: !!row.is_coach, academy: row.academy_name ?? null });
      if (row.invited_email) setEmail(row.invited_email);
    });
    return () => { cancelled = true; };
  }, [token]);

  const emailLocked = typeof invite === 'object' && !!invite.email;

  async function submit() {
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    if (!token) { setError(t('joinStaff.missingToken')); return; }
    if (!fullName.trim()) { setError(t('joinStaff.nameRequired')); return; }
    if (!EMAIL_PATTERN.test(cleanEmail)) { setError(t('joinStaff.emailRequired')); return; }
    if (password.length < 6) { setError(t('joinStaff.passwordShort')); return; }
    if (password !== confirm) { setError(t('joinStaff.passwordMismatch')); return; }

    setBusy(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { owner_staff_invite_token: token, full_name: fullName.trim() },
        },
      });
      if (signUpError) {
        // The database refuses an invalid, expired or wrongly-addressed invitation
        // with a generic server error; the invitation is the likely cause.
        const message = signUpError.message || '';
        setError(/database error|invit|different email/i.test(message) ? t('joinStaff.invalid') : message);
        return;
      }
      setDone({ needsConfirmation: !data.session, email: cleanEmail });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('joinStaff.invalid'));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View style={styles.brand}>
      <Image source={require('../../assets/images/mypitch-weekline-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="MYPitch" />
    </View>
  );

  if (done) {
    return (
      <Screen maxWidth={520} ambientGlows={false} contentStyle={styles.content}>
        <View style={styles.stack}>
        {header}
        <View style={styles.card}>
          <Ionicons name="checkmark-circle" size={36} color={colors.greenLight} style={{ alignSelf: 'center' }} />
          <Text style={[styles.title, styles.center]}>{done.needsConfirmation ? t('joinStaff.successTitle') : t('joinStaff.readyBody')}</Text>
          {done.needsConfirmation ? (
            <Text style={[styles.intro, styles.center]}>{t('joinStaff.successBody').replace('{email}', done.email)}</Text>
          ) : null}
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/login')} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>{t('joinStaff.continue')}</Text>
          </Pressable>
        </View>
        </View>
      </Screen>
    );
  }

  if (invite === 'loading' || invite === 'invalid') {
    return (
      <Screen maxWidth={520} ambientGlows={false} contentStyle={styles.content}>
        <View style={styles.stack}>
          {header}
          <View style={styles.card}>
            {invite === 'loading' ? (
              <>
                <ActivityIndicator color={colors.blueLight} style={{ marginVertical: 8 }} />
                <Text style={[styles.intro, styles.center]}>{t('joinStaff.checking')}</Text>
              </>
            ) : (
              <>
                <Ionicons name="link-outline" size={30} color={colors.greyDark} style={{ alignSelf: 'center' }} />
                <Text style={[styles.intro, styles.center]}>{token ? t('joinStaff.invalid') : t('joinStaff.missingToken')}</Text>
              </>
            )}
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen maxWidth={520} ambientGlows={false} contentStyle={styles.content}>
      <View style={styles.stack}>
      {header}
      <View style={styles.card}>
        <Text style={styles.title}>{invite.isCoach ? hub.coachJoinHeading : t('joinStaff.heading')}</Text>
        <Text style={styles.subtitle}>{t('joinStaff.invitedBy').replace('{business}', invite.business)}</Text>
        {invite.academy ? <Text style={styles.subtitle}>{fill(hub.coachJoinAcademy, { academy: invite.academy })}</Text> : null}
        <Text style={styles.intro}>{invite.isCoach ? hub.coachJoinIntro : t('joinStaff.intro')}</Text>

        <Field label={t('joinStaff.nameLabel')} value={fullName} onChangeText={setFullName} autoComplete="name" />
        <Field label={t('joinStaff.emailLabel')} value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" editable={!emailLocked} />
        {emailLocked ? <Text style={styles.lockedHint}>{t('joinStaff.emailLocked')}</Text> : null}
        <Field label={t('joinStaff.passwordLabel')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        <Field label={t('joinStaff.confirmLabel')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.primaryButton, (busy || !token) && styles.disabled]} onPress={submit} disabled={busy || !token} accessibilityRole="button">
          {busy ? <ActivityIndicator size="small" color={colors.blackText} /> : null}
          <Text style={styles.primaryButtonText}>{t('joinStaff.submit')}</Text>
        </Pressable>
      </View>
      </View>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  autoComplete,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoComplete?: 'name' | 'email' | 'new-password';
  keyboardType?: 'email-address';
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
        autoCapitalize={keyboardType === 'email-address' ? 'none' : undefined}
        autoCorrect={false}
        editable={editable}
        style={[styles.input, !editable && styles.inputReadOnly]}
        placeholderTextColor={colors.greyDark}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 48 },
  stack: { gap: 20 },
  brand: { alignItems: 'center' },
  logo: { width: 190, height: 64 },
  card: { padding: 22, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 4 },
  title: { color: colors.white, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: colors.blueLight, fontSize: 14, fontWeight: '700', marginTop: 4 },
  intro: { color: colors.grey, fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 12 },
  center: { textAlign: 'center' },
  field: { marginTop: 8 },
  label: { color: colors.greySoft, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft, color: colors.white, fontSize: 15 },
  inputReadOnly: { color: colors.greyDark },
  lockedHint: { color: colors.grey, fontSize: 12, marginTop: 6 },
  error: { color: colors.red, fontSize: 13, marginTop: 12, lineHeight: 19 },
  primaryButton: { minHeight: 46, marginTop: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 9, backgroundColor: colors.blueLight },
  primaryButtonText: { color: colors.blackText, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
