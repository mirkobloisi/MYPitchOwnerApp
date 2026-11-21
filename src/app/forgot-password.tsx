import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';

import { AuthButton, AuthField, AuthPageCard, authText } from '../components/AuthPageCard';
import { useTranslation } from '../i18n/LanguageContext';
import { callAccountSecurity } from '../lib/accountSecurity';
import { weeklineColors as colors } from '../theme/palettes';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "Forgot password": emails a single-use link to the account holder. Works signed out. */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit() {
    setError('');
    if (!EMAIL_PATTERN.test(email.trim())) { setError(t('recovery.invalidEmail')); return; }
    setBusy(true);
    try {
      await callAccountSecurity({ action: 'forgot', email: email.trim() });
      // The answer is the same whether or not the email has an account.
      setSent(true);
    } catch {
      setError(t('recovery.genericError'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthPageCard>
        <Ionicons name="mail-outline" size={34} color={colors.greenLight} style={{ alignSelf: 'center' }} />
        <Text style={[authText.title, authText.center]}>{t('recovery.sentTitle')}</Text>
        <Text style={[authText.intro, authText.center]}>{t('recovery.sentBody')}</Text>
        <AuthButton label={t('recovery.backToLogin')} onPress={() => router.replace('/login')} />
      </AuthPageCard>
    );
  }

  return (
    <AuthPageCard>
      <Text style={authText.title}>{t('recovery.forgotTitle')}</Text>
      <Text style={authText.intro}>{t('recovery.forgotIntro')}</Text>
      <AuthField label={t('recovery.emailLabel')} value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" onSubmitEditing={submit} />
      {error ? <Text style={authText.error}>{error}</Text> : null}
      <AuthButton label={t('recovery.sendLink')} onPress={submit} busy={busy} />
      <AuthButton label={t('recovery.backToLogin')} onPress={() => router.replace('/login')} variant="outline" />
    </AuthPageCard>
  );
}
