import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useTranslation } from '../i18n/LanguageContext';
import { addDays, startOfDay } from '../lib/slots';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import AnimatedPressable from './AnimatedPressable';
import { scaleFont, scaleLine } from '../theme/typography';

const MAX_YEARS_AHEAD = 2;

export type RecurrenceValue = {
  enabled: boolean;
  openEnded: boolean;
  /** Raw text as typed, e.g. "30/11/2026". */
  untilText: string;
};

export const initialRecurrence: RecurrenceValue = {
  enabled: false,
  openEnded: false,
  untilText: '',
};

/** Keeps the field readable while typing: 30112026 becomes 30/11/2026. */
export function formatUntilInput(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
}

export function parseUntilDate(text: string): Date | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));

  const date = new Date(year, month - 1, day);

  // Rejects impossible dates like 31/02 — JS would roll them into March.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return startOfDay(date);
}

/**
 * Validates the end date against the first occurrence. Returns the parsed date
 * when the series has a fixed end, or null when it is open-ended. `t` is the
 * translation function — pass it in since this runs outside any component's
 * render (screens call it directly from event handlers).
 */
export function validateRecurrence(
  value: RecurrenceValue,
  startDay: Date,
  t: (path: string, params?: Record<string, string | number>) => string
) {
  if (!value.enabled || value.openEnded) {
    return { error: null as string | null, untilDate: null as Date | null };
  }

  const parsed = parseUntilDate(value.untilText);
  if (!parsed) {
    return { error: t('recurrence.errorEndDateFormat'), untilDate: null };
  }

  const start = startOfDay(startDay);

  if (parsed < start) {
    return { error: t('recurrence.errorEndDateBeforeStart'), untilDate: null };
  }

  if (parsed > addDays(start, MAX_YEARS_AHEAD * 365)) {
    return {
      error: t('recurrence.errorEndDateTooFar', { years: MAX_YEARS_AHEAD }),
      untilDate: null,
    };
  }

  return { error: null as string | null, untilDate: parsed };
}

type RecurrencePickerProps = {
  /** The day the first occurrence falls on. */
  startDay: Date;
  value: RecurrenceValue;
  onChange: (value: RecurrenceValue) => void;
};

export default function RecurrencePicker({ startDay, value, onChange }: RecurrencePickerProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const weekdayName = startDay.toLocaleDateString(undefined, { weekday: 'long' });
  const { error, untilDate } = validateRecurrence(value, startDay, t);

  // How many occurrences the typed date actually produces, and when the last
  // one lands — the end date itself may fall mid-week.
  const summary = useMemo(() => {
    if (!untilDate) return null;

    const start = startOfDay(startDay);
    const weeks = Math.floor((untilDate.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const last = addDays(start, weeks * 7);

    return {
      count: weeks + 1,
      last: last.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    };
  }, [untilDate, startDay]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('recurrence.repeatWeekly')}</Text>
          <Text style={styles.subtitle}>{t('recurrence.everyWeekdayAtSameTime', { weekday: weekdayName })}</Text>
        </View>
        <Switch
          value={value.enabled}
          onValueChange={(enabled) => onChange({ ...value, enabled })}
          trackColor={{ false: colors.cardDark, true: colors.greenSoft }}
          thumbColor={value.enabled ? colors.greenLight : colors.greyDark}
          {...({ activeThumbColor: colors.greenLight } as any)}
        />
      </View>

      {value.enabled ? (
        <>
          <View style={styles.modeRow}>
            <AnimatedPressable
              pressedScale={0.96}
              style={[styles.modeChip, !value.openEnded && styles.modeChipSelected]}
              onPress={() => onChange({ ...value, openEnded: false })}
            >
              <Text style={[styles.modeText, !value.openEnded && styles.modeTextSelected]}>
                {t('recurrence.untilADate')}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              pressedScale={0.96}
              style={[styles.modeChip, value.openEnded && styles.modeChipSelected]}
              onPress={() => onChange({ ...value, openEnded: true })}
            >
              <Text style={[styles.modeText, value.openEnded && styles.modeTextSelected]}>
                {t('recurrence.noEndDate')}
              </Text>
            </AnimatedPressable>
          </View>

          {value.openEnded ? (
            <View style={styles.noticeRow}>
              <Ionicons name="infinite" size={15} color={colors.greenLight} />
              <Text style={styles.openEndedText}>
                {t('recurrence.repeatsIndefinitely', { weekday: weekdayName })}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>{t('recurrence.endDateLabel')}</Text>
              <TextInput
                value={value.untilText}
                onChangeText={(text) => onChange({ ...value, untilText: formatUntilInput(text) })}
                placeholder={t('recurrence.endDatePlaceholder')}
                placeholderTextColor={colors.greyDark}
                keyboardType="number-pad"
                maxLength={10}
                style={styles.input}
              />

              {value.untilText.length > 0 && error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : summary ? (
                <Text style={styles.summaryText}>
                  {summary.count === 1
                    ? t('recurrence.bookingCountOne', { count: summary.count, date: summary.last })
                    : t('recurrence.bookingCountOther', { count: summary.count, date: summary.last })}
                </Text>
              ) : null}
            </>
          )}

          <View style={styles.noticeRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.blueLight} />
            <Text style={styles.noticeText}>{t('recurrence.skippedNoticeText')}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrapper: {
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginTop: spacing.lg,
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
    title: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '900',
    },
    subtitle: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      marginTop: 2,
    },
    modeRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    modeChip: {
      flex: 1,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardDark,
      paddingVertical: 10,
      alignItems: 'center',
    },
    modeChipSelected: {
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
    },
    modeText: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    modeTextSelected: {
      color: colors.greenLight,
    },
    fieldLabel: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    input: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardDark,
      color: colors.white,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: scaleFont(15),
      fontWeight: '700',
      letterSpacing: 1,
    },
    summaryText: {
      color: colors.greenLight,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginTop: spacing.xs,
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginTop: spacing.xs,
    },
    noticeRow: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'flex-start',
      marginTop: spacing.sm,
    },
    openEndedText: {
      flex: 1,
      color: colors.greenLight,
      fontSize: scaleFont(12),
      fontWeight: '600',
      lineHeight: scaleLine(17),
    },
    noticeText: {
      flex: 1,
      color: colors.blueLight,
      fontSize: scaleFont(11),
      fontWeight: '600',
      lineHeight: scaleLine(16),
    },
  });
