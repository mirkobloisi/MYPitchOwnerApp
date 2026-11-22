import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import AnimatedPressable from '../components/AnimatedPressable';
import AppButton from '../components/AppButton';
import AppHeader from '../components/AppHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import Screen from '../components/Screen';
import { useTranslation } from '../i18n/LanguageContext';
import { useAuth } from '../lib/auth';
import { updatePitchBookingSettings } from '../lib/pitchData';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont, scaleLine } from '../theme/typography';

// The only lengths a pitch may offer — see the pitches_allowed_durations_valid
// check constraint and update_pitch_booking_settings() in the database.
const DURATION_OPTIONS: { minutes: number; labelKey: string }[] = [
  { minutes: 60, labelKey: 'bookingSettings.duration60' },
  { minutes: 90, labelKey: 'bookingSettings.duration90' },
  { minutes: 120, labelKey: 'bookingSettings.duration120' },
];

export default function BookingSettingsScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { pitches, refresh } = useAuth();
  const params = useLocalSearchParams<{ pitchId: string }>();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const pitch = pitches.find((p) => p.id === params.pitchId) ?? null;

  const [allowHalfHour, setAllowHalfHour] = useState(pitch?.allow_half_hour_start ?? true);
  const [durations, setDurations] = useState<Set<number>>(
    new Set(pitch?.allowed_durations_minutes ?? [60])
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  function toggleDuration(minutes: number) {
    setErrorMessage('');
    setDurations((current) => {
      const next = new Set(current);
      if (next.has(minutes)) {
        // Always leave at least one length selected — an empty set would
        // mean the pitch accepts no bookings at all.
        if (next.size === 1) return next;
        next.delete(minutes);
      } else {
        next.add(minutes);
      }
      return next;
    });
  }

  async function handleSave() {
    if (durations.size === 0) {
      setErrorMessage(t('bookingSettings.errorNoDuration'));
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      await updatePitchBookingSettings({
        pitchId: pitch!.id,
        allowHalfHourStart: allowHalfHour,
        allowedDurationsMinutes: Array.from(durations).sort((a, b) => a - b),
      });
      await refresh();
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('bookingSettings.errorSave'));
    } finally {
      setIsSaving(false);
    }
  }

  if (!pitch) {
    return (
      <Screen>
        <AppHeader title={t('bookingSettings.title')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={t('bookingSettings.title')} />
      <Text style={styles.subtitle}>{t('bookingSettings.subtitle')}</Text>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.cardTitle}>{t('bookingSettings.halfHourTitle')}</Text>
            <Text style={styles.cardSubtitle}>{t('bookingSettings.halfHourSubtitle')}</Text>
          </View>
          <Switch
            value={allowHalfHour}
            onValueChange={setAllowHalfHour}
            trackColor={{ false: colors.cardDark, true: colors.greenSoft }}
            thumbColor={allowHalfHour ? colors.greenLight : colors.greyDark}
            {...({ activeThumbColor: colors.greenLight } as any)}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('bookingSettings.matchLengthsTitle')}</Text>
        <Text style={styles.cardSubtitle}>{t('bookingSettings.matchLengthsSubtitle')}</Text>

        <View style={styles.chipsRow}>
          {DURATION_OPTIONS.map((option) => {
            const isSelected = durations.has(option.minutes);
            return (
              <AnimatedPressable
                key={option.minutes}
                pressedScale={0.94}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => toggleDuration(option.minutes)}
              >
                {isSelected ? (
                  <Ionicons name="checkmark" size={14} color={colors.greenLight} style={styles.chipIcon} />
                ) : null}
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{t(option.labelKey)}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <AppButton
        title={t('bookingSettings.saveButton')}
        onPress={() => setIsConfirmVisible(true)}
        loading={isSaving}
      />

      <ConfirmDialog
        visible={isConfirmVisible}
        title={t('bookingSettings.confirmTitle')}
        message={t('bookingSettings.confirmMessage')}
        onDismiss={() => setIsConfirmVisible(false)}
        actions={[
          { label: t('common.cancel'), tone: 'cancel' },
          { label: t('bookingSettings.confirmAction'), onPress: handleSave },
        ]}
      />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    subtitle: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '600',
      marginBottom: spacing.lg,
    },
    card: {
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    headerText: {
      flex: 1,
    },
    cardTitle: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '900',
    },
    cardSubtitle: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      lineHeight: scaleLine(17),
      marginTop: 3,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardDark,
    },
    chipSelected: {
      backgroundColor: colors.greenSoft,
      borderColor: colors.borderGreen,
    },
    chipIcon: {
      marginRight: 4,
    },
    chipText: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    chipTextSelected: {
      color: colors.greenLight,
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(13),
      fontWeight: '700',
      marginBottom: spacing.md,
    },
  });
