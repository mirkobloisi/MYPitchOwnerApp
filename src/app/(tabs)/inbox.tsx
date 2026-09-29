import React from 'react';

import AppHeader from '../../components/AppHeader';
import Screen from '../../components/Screen';
import WebInboxPanel from '../../components/WebInboxPanel';
import { useTranslation } from '../../i18n/LanguageContext';

export default function InboxScreen() {
  const { t } = useTranslation();

  return (
    <Screen scroll={false}>
      <AppHeader title={t('inbox.notifications')} showBack />
      <WebInboxPanel initialTab="notifications" fullScreen />
    </Screen>
  );
}
