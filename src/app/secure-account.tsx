import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';

import { AuthButton, AuthPageCard, authText } from '../components/AuthPageCard';
import { useTranslation } from '../i18n/LanguageContext';
import { callAccountSecurity } from '../lib/accountSecurity';
import { weeklineColors as colors } from '../theme/palettes';

/**
 * "This wasn't me" from a new-device alert email. Nothing happens until the
 * button is pressed (so an email scanner opening the link cannot lock anyone out).
 */
export default function SecureAccountScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<'ask' | 'done' | 'invalid'>(token ? 'ask' : 'invalid');

  async function lock() {
    setError('');
    setBusy(true);
    try {
      const ok = await callAccountSecurity({ action: 'secure', token: String(token) });
      setState(ok ? 'done' : 'invalid');
    } catch {
      setError(t('recovery.genericError'));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'done') {
    return (
      <AuthPageCard>
        <Ionicons name="shield-checkmark" size={40} color={colors.greenLight} style={{ alignSelf: 'center' }} />
        <Text style={[authText.title, authText.center]}>{t('recovery.secureDoneTitle')}</Text>
        <Text style={[authText.intro, authText.center]}>{t('recovery.secureDoneBody')}</Text>
        <AuthButton label={t('recovery.backToLogin')} onPress={() => router.replace('/login')} variant="outline" />
      </AuthPageCard>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthPageCard>
        <Ionicons name="link-outline" size={30} color={colors.greyDark} style={{ alignSelf: 'center' }} />
        <Text style={[authText.intro, authText.center]}>{t('recovery.secureInvalid')}</Text>
        <AuthButton label={t('recovery.backToLogin')} onPress={() => router.replace('/login')} variant="outline" />
      </AuthPageCard>
    );
  }

  return (
    <AuthPageCard>
      <Ionicons name="shield-outline" size={34} color={colors.blueLight} style={{ alignSelf: 'center' }} />
      <Text style={[authText.title, authText.center]}>{t('recovery.secureTitle')}</Text>
      <Text style={[authText.intro, authText.center]}>{t('recovery.secureIntro')}</Text>
      {error ? <Text style={[authText.error, authText.center]}>{error}</Text> : null}
      <AuthButton label={t('recovery.secureButton')} onPress={lock} busy={busy} variant="danger" />
      <AuthButton label={t('recovery.secureCancel')} onPress={() => router.replace('/login')} variant="outline" />
    </AuthPageCard>
  );
}
