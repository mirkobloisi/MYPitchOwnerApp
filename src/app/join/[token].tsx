import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from 'react-native';

import AnimatedPressable from '../../components/AnimatedPressable';
import AppButton from '../../components/AppButton';
import AppHeader from '../../components/AppHeader';
import CalendarModal from '../../components/CalendarModal';
import Screen from '../../components/Screen';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  PublicAcademy,
  fetchAcademyByInviteToken,
  registerFamily,
} from '../../lib/academyData';
import { AppColors } from '../../theme/palettes';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/layout';
import { scaleFont } from '../../theme/typography';

type GuardianForm = { fullName: string; email: string; phone: string };
type ChildForm = { fullName: string; dateOfBirth: string };

const EMPTY_GUARDIAN: GuardianForm = { fullName: '', email: '', phone: '' };
const EMPTY_CHILD: ChildForm = { fullName: '', dateOfBirth: '' };

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [academyInfo, setAcademyInfo] = useState<PublicAcademy | null | 'invalid'>(null);
  const [mode, setMode] = useState<'single' | 'couple'>('single');
  const [guardians, setGuardians] = useState<GuardianForm[]>([{ ...EMPTY_GUARDIAN }]);
  const [children, setChildren] = useState<ChildForm[]>([{ ...EMPTY_CHILD }]);
  const [dobPickerIndex, setDobPickerIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    fetchAcademyByInviteToken(token).then((row) => setAcademyInfo(row ?? 'invalid'));
  }, [token]);

  function toggleMode(next: 'single' | 'couple') {
    setMode(next);
    setGuardians((current) => {
      if (next === 'couple') {
        return current.length === 2 ? current : [...current, { ...EMPTY_GUARDIAN }];
      }
      return current.slice(0, 1);
    });
  }

  function updateGuardian(index: number, field: keyof GuardianForm, value: string) {
    setGuardians((current) =>
      current.map((g, i) => (i === index ? { ...g, [field]: value } : g))
    );
  }

  function updateChild(index: number, field: keyof ChildForm, value: string) {
    setChildren((current) => current.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addChild() {
    setChildren((current) => [...current, { ...EMPTY_CHILD }]);
  }

  function removeChild(index: number) {
    setChildren((current) => current.filter((_, i) => i !== index));
  }

  const canSubmit =
    guardians.every((g) => g.fullName.trim().length > 0) &&
    children.length > 0 &&
    children.every((c) => c.fullName.trim().length > 0) &&
    status !== 'submitting';

  async function handleSubmit() {
    if (!canSubmit || !token) return;

    setStatus('submitting');
    setErrorMessage('');

    const { error } = await registerFamily({
      inviteToken: token,
      guardians: guardians.map((g) => ({
        fullName: g.fullName.trim(),
        email: g.email.trim() || null,
        phone: g.phone.trim() || null,
      })),
      children: children.map((c) => ({
        fullName: c.fullName.trim(),
        dateOfBirth: c.dateOfBirth || null,
      })),
    });

    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
      return;
    }

    setStatus('success');
  }

  if (academyInfo === 'invalid') {
    return (
      <Screen maxWidth={560}>
        <AppHeader title={t('join.heading')} showBack={false} />
        <View style={styles.stateCard}>
          <Ionicons name="link-outline" size={26} color={colors.greyDark} />
          <Text style={styles.stateText}>{t('join.invalidLink')}</Text>
        </View>
      </Screen>
    );
  }

  if (!academyInfo) {
    return (
      <Screen maxWidth={560}>
        <AppHeader title={t('join.heading')} showBack={false} />
        <ActivityIndicator color={colors.greenLight} style={styles.loading} />
      </Screen>
    );
  }

  if (!academyInfo.is_active) {
    return (
      <Screen maxWidth={560}>
        <AppHeader title={academyInfo.name} showBack={false} />
        <View style={styles.stateCard}>
          <Ionicons name="pause-circle-outline" size={26} color={colors.greyDark} />
          <Text style={styles.stateText}>{t('join.notAccepting')}</Text>
        </View>
      </Screen>
    );
  }

  if (status === 'success') {
    return (
      <Screen maxWidth={560}>
        <AppHeader title={academyInfo.name} showBack={false} />
        <View style={styles.stateCard}>
          <Ionicons name="checkmark-circle" size={30} color={colors.greenLight} />
          <Text style={styles.successTitle}>{t('join.successTitle')}</Text>
          <Text style={styles.stateText}>{t('join.successBody')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen maxWidth={560}>
      <AppHeader title={academyInfo.name} subtitle={t('join.subtitle')} showBack={false} />

      <View style={styles.academyRow}>
        {academyInfo.logo_url ? (
          <Image source={{ uri: academyInfo.logo_url }} style={styles.academyLogo} resizeMode="cover" />
        ) : (
          <View style={[styles.academyLogo, styles.academyLogoPlaceholder]}>
            <Ionicons name="school" size={22} color={colors.greenLight} />
          </View>
        )}
        <View style={styles.academyInfo}>
          <Text style={styles.academyName}>{academyInfo.name}</Text>
          {academyInfo.city ? <Text style={styles.academyCity}>{academyInfo.city}</Text> : null}
        </View>
      </View>

      <View style={styles.modeRow}>
        <ModeChip
          styles={styles}
          colors={colors}
          active={mode === 'single'}
          label={t('join.modeSingle')}
          onPress={() => toggleMode('single')}
        />
        <ModeChip
          styles={styles}
          colors={colors}
          active={mode === 'couple'}
          label={t('join.modeCouple')}
          onPress={() => toggleMode('couple')}
        />
      </View>

      {guardians.map((guardian, index) => (
        <View key={index} style={styles.card}>
          <Text style={styles.cardTitle}>
            {guardians.length > 1
              ? t('join.guardianNumbered').replace('{number}', String(index + 1))
              : t('join.guardianSectionTitle')}
          </Text>

          <Text style={styles.label}>{t('join.guardianNameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={guardian.fullName}
            onChangeText={(value) => updateGuardian(index, 'fullName', value)}
            placeholder={t('join.guardianNameLabel')}
            placeholderTextColor={colors.greyDark}
          />

          <Text style={styles.label}>{t('join.guardianEmailLabel')}</Text>
          <TextInput
            style={styles.input}
            value={guardian.email}
            onChangeText={(value) => updateGuardian(index, 'email', value)}
            placeholder={t('join.guardianEmailLabel')}
            placeholderTextColor={colors.greyDark}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>{t('join.guardianPhoneLabel')}</Text>
          <TextInput
            style={styles.input}
            value={guardian.phone}
            onChangeText={(value) => updateGuardian(index, 'phone', value)}
            placeholder={t('join.guardianPhoneLabel')}
            placeholderTextColor={colors.greyDark}
            keyboardType="phone-pad"
          />
        </View>
      ))}

      <Text style={styles.sectionTitle}>{t('join.childSectionTitle')}</Text>

      {children.map((child, index) => (
        <View key={index} style={styles.card}>
          <View style={styles.childHeader}>
            <Text style={styles.cardTitle}>
              {t('join.childNumbered').replace('{number}', String(index + 1))}
            </Text>
            {children.length > 1 ? (
              <AnimatedPressable style={styles.removeButton} onPress={() => removeChild(index)}>
                <Ionicons name="close" size={16} color={colors.grey} />
              </AnimatedPressable>
            ) : null}
          </View>

          <Text style={styles.label}>{t('join.childNameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={child.fullName}
            onChangeText={(value) => updateChild(index, 'fullName', value)}
            placeholder={t('join.childNameLabel')}
            placeholderTextColor={colors.greyDark}
          />

          <Text style={styles.label}>{t('join.childDobLabel')}</Text>
          <AnimatedPressable style={styles.dobField} onPress={() => setDobPickerIndex(index)}>
            <Ionicons name="calendar-outline" size={16} color={colors.greyDark} />
            <Text style={[styles.dobValue, !child.dateOfBirth && styles.dobValueEmpty]}>
              {child.dateOfBirth || t('join.childDobLabel')}
            </Text>
          </AnimatedPressable>
        </View>
      ))}

      <AnimatedPressable style={styles.addChildRow} onPress={addChild}>
        <Ionicons name="add-circle-outline" size={18} color={colors.greenLight} />
        <Text style={styles.addChildText}>{t('join.addChild')}</Text>
      </AnimatedPressable>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <AppButton
        title={t('join.submit')}
        loading={status === 'submitting'}
        disabled={!canSubmit}
        onPress={handleSubmit}
      />

      <CalendarModal
        visible={dobPickerIndex !== null}
        value={dobPickerIndex !== null ? children[dobPickerIndex].dateOfBirth : ''}
        title={t('join.childDobLabel')}
        maxDate={new Date()}
        onSelect={(isoDate) => {
          if (dobPickerIndex !== null) updateChild(dobPickerIndex, 'dateOfBirth', isoDate);
        }}
        onClose={() => setDobPickerIndex(null)}
      />
    </Screen>
  );
}

function ModeChip({
  styles,
  colors,
  active,
  label,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      style={[styles.modeChip, active && { backgroundColor: colors.greenSoft, borderColor: colors.borderGreen }]}
      onPress={onPress}
    >
      <Text style={[styles.modeChipText, active && { color: colors.greenLight }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    loading: {
      marginTop: spacing.xl,
    },
    academyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    academyLogo: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
    },
    academyLogoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
    },
    academyInfo: {
      flex: 1,
      minWidth: 0,
    },
    academyName: {
      color: colors.white,
      fontSize: scaleFont(17),
      fontWeight: '900',
    },
    academyCity: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      marginTop: 2,
    },
    modeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    modeChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 11,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    modeChipText: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    stateCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
    },
    cardTitle: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '800',
      marginBottom: spacing.sm,
    },
    childHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    removeButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardSoft,
    },
    sectionTitle: {
      color: colors.greenLight,
      fontSize: scaleFont(12),
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    label: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '800',
      marginBottom: 5,
    },
    input: {
      backgroundColor: colors.cardSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '600',
      marginBottom: spacing.sm,
    },
    dobField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.cardSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
    },
    dobValue: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '700',
    },
    dobValueEmpty: {
      color: colors.greyDark,
    },
    addChildRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
      marginBottom: spacing.lg,
    },
    addChildText: {
      color: colors.greenLight,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginBottom: spacing.sm,
    },
    stateText: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '600',
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    successTitle: {
      color: colors.white,
      fontSize: scaleFont(16),
      fontWeight: '900',
      marginTop: spacing.sm,
    },
  });
