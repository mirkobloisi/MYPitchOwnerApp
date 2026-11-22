import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import AppButton from '../components/AppButton';
import Screen from '../components/Screen';
import { useLanguage, useTranslation } from '../i18n/LanguageContext';
import { useAuth } from '../lib/auth';
import { useCurrentOwnerTerms, useTermsDateText } from '../lib/ownerTerms';
import {
  acceptOwnerTerms,
  isOwnerTermsV2OrLater,
  ownerTermsCheckboxTextFor,
} from '../lib/pitchData';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont, scaleLine } from '../theme/typography';

// Gated in _layout.tsx: an approved owner whose latest acceptance isn't for
// CURRENT_OWNER_TERMS_VERSION is routed here and held until they accept.
// What actually gets recorded is always the canonical English tick-box wording
// for the version being accepted (ownerTermsCheckboxTextFor), regardless of the
// owner's display language, so the audit trail is unambiguous — the text
// shown on screen is just a translation of that same sentence for reading.
export default function AcceptOwnerTermsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { refresh, signOut } = useAuth();
  const { t, tList } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [checked, setChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const currentTerms = useCurrentOwnerTerms();
  const { language } = useLanguage();
  const isV2 = isOwnerTermsV2OrLater(currentTerms.version);
  const summaryPoints = tList(isV2 ? 'acceptOwnerTerms.summaryPointsV2' : 'acceptOwnerTerms.summaryPoints');
  const effectiveText = useTermsDateText(currentTerms.effectiveAt);

  function openFullTerms() {
    const onWeb = Platform.OS === 'web' && typeof window !== 'undefined';
    const origin = onWeb ? window.location.origin : 'https://owner.mypitchbookings.com';
    const url = `${origin}/terms-${currentTerms.version}?lang=${language}`;
    if (onWeb) window.open(url, '_blank', 'noopener');
    else void Linking.openURL(url);
  }

  async function handleAccept() {
    if (!checked) {
      setErrorMessage(t('acceptOwnerTerms.errorMustCheck'));
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await acceptOwnerTerms({
        termsVersion: currentTerms.version,
        checkboxText: ownerTermsCheckboxTextFor(currentTerms.version),
      });
      await refresh();
      router.replace('/(tabs)/agenda');
    } catch (error) {
      console.error('[accept-terms] Failed to record acceptance:', error);
      setErrorMessage(t('acceptOwnerTerms.errorGeneric'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen contentStyle={styles.screenContent}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.centeredColumn}>
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="document-text-outline" size={28} color={colors.greenLight} />
          </View>
          <Text style={styles.title}>{t('acceptOwnerTerms.title')}</Text>
          <Text style={styles.versionLabel}>
            {t('acceptOwnerTerms.versionLabel', { version: currentTerms.version, date: effectiveText })}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.intro}>{t('acceptOwnerTerms.intro')}</Text>

          {summaryPoints.map((point, index) => (
            <View key={index} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{point}</Text>
            </View>
          ))}

          {isV2 ? (
            <Pressable onPress={openFullTerms} accessibilityRole="link">
              <Text style={styles.readFullLink}>{t('acceptOwnerTerms.readFull', { version: currentTerms.version })}</Text>
            </Pressable>
          ) : (
            <Text style={styles.fullDocsNote}>{t('acceptOwnerTerms.fullDocsNote')}</Text>
          )}
        </View>

        <Pressable style={styles.checkboxRow} onPress={() => setChecked((value) => !value)}>
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked ? <Ionicons name="checkmark" size={14} color={colors.blackText} /> : null}
          </View>
          <Text style={styles.checkboxText}>{t(isV2 ? 'acceptOwnerTerms.checkboxTextV2' : 'acceptOwnerTerms.checkboxText')}</Text>
        </Pressable>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <View style={styles.buttonSpacing}>
          <AppButton
            title={t('acceptOwnerTerms.acceptButton')}
            onPress={handleAccept}
            loading={isSubmitting}
          />
        </View>

        <AppButton
          title={t('acceptOwnerTerms.logOut')}
          variant="ghost"
          style={styles.logOutButton}
          onPress={signOut}
        />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    screenContent: {
      flexGrow: 1,
      paddingVertical: spacing.xl,
    },
    // Keeps the reading column a comfortable width on an iPad or desktop.
    centeredColumn: {
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    header: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    logoBadge: {
      width: 64,
      height: 64,
      borderRadius: radius.round,
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: {
      color: colors.white,
      fontSize: scaleFont(22),
      fontWeight: '900',
      textAlign: 'center',
    },
    versionLabel: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    card: {
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    intro: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '700',
      lineHeight: scaleLine(20),
      marginBottom: spacing.md,
    },
    bulletRow: {
      flexDirection: 'row',
      marginBottom: spacing.sm,
    },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.greenLight,
      marginTop: 7,
      marginRight: spacing.sm,
    },
    bulletText: {
      flex: 1,
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '600',
      lineHeight: scaleLine(19),
    },
    fullDocsNote: {
      color: colors.greyDark,
      fontSize: scaleFont(12),
      fontWeight: '600',
      lineHeight: scaleLine(17),
      marginTop: spacing.sm,
    },
    readFullLink: {
      color: colors.greenLight,
      fontSize: scaleFont(13),
      fontWeight: '800',
      lineHeight: scaleLine(18),
      marginTop: spacing.sm,
      textDecorationLine: 'underline',
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: spacing.lg,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardDark,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
      marginTop: 2,
    },
    checkboxChecked: {
      backgroundColor: colors.greenLight,
      borderColor: colors.greenLight,
    },
    checkboxText: {
      flex: 1,
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '700',
      lineHeight: scaleLine(17),
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(13),
      fontWeight: '700',
      marginTop: spacing.md,
    },
    buttonSpacing: {
      marginTop: spacing.lg,
    },
    logOutButton: {
      marginTop: spacing.md,
    },
  });
