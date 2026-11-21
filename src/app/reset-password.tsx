import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';

import { AuthButton, AuthField, AuthPageCard, authText } from '../components/AuthPageCard';
import { useTranslation } from '../i18n/LanguageContext';
import { supabase } from '../lib/supabase';
import { weeklineColors as colors } from '../theme/palettes';

/**
 * Where the emailed "set a new password" link lands (forgot password, or after
 * "This wasn't me"). The single-use token is only spent when the person presses
 * the button, so an email scanner opening the link cannot burn it.
 */
export default function ResetPasswordScreen() {
  const { token_hash: tokenHash } = useLocalSearchParams<{ token_hash?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [state, setState] = useState<'form' | 'invalid' | 'done'>(tokenHash ? 'form' : 'invalid');

  async function submit() {
    setError('');
    if (password.length < 6) { setError(t('recovery.tooShort')); return; }
    if (password !== confirm) { setError(t('recovery.mismatch')); return; }
    setBusy(true);
    try {
      if (!verified) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: String(tokenHash), type: 'recovery' });
        if (verifyError) { setState('invalid'); return; }
        setVerified(true);
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError(updateError.message || t('recovery.genericError')); return; }
      // Start clean: sign in again with the new password.
      await supabase.auth.signOut();
      setState('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('recovery.genericError'));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'invalid') {
    return (
      <AuthPageCard>
        <Ionicons name="link-outline" size={30} color={colors.greyDark} style={{ alignSelf: 'center' }} />
        <Text style={[authText.intro, authText.center]}>{t('recovery.resetLinkInvalid')}</Text>
        <AuthButton label={t('recovery.requestNew')} onPress={() => router.replace('/forgot-password')} />
      </AuthPageCard>
    );
  }

  if (state === 'done') {
    return (
      <AuthPageCard>
        <Ionicons name="checkmark-circle" size={40} color={colors.greenLight} style={{ alignSelf: 'center' }} />
        <Text style={[authText.title, authText.center]}>{t('recovery.resetDoneTitle')}</Text>
        <Text style={[authText.intro, authText.center]}>{t('recovery.resetDoneBody')}</Text>
        <AuthButton label={t('recovery.backToLogin')} onPress={() => router.replace('/login')} />
      </AuthPageCard>
    );
  }

  return (
    <AuthPageCard>
      <Text style={authText.title}>{t('recovery.resetTitle')}</Text>
      <Text style={authText.intro}>{t('recovery.resetIntro')}</Text>
      <AuthField label={t('recovery.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <AuthField label={t('recovery.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
      {error ? <Text style={authText.error}>{error}</Text> : null}
      <AuthButton label={t('recovery.save')} onPress={submit} busy={busy} />
    </AuthPageCard>
  );
}
