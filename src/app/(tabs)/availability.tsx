import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';

import AnimatedPressable from '../../components/AnimatedPressable';
import AppHeader from '../../components/AppHeader';
import Screen from '../../components/Screen';
import SectionHeader from '../../components/SectionHeader';
import { useTranslation } from '../../i18n/LanguageContext';
import { useAuth } from '../../lib/auth';
import {
  AvailabilityRow,
  createAvailabilityRange,
  deleteAvailabilityRange,
  fetchAvailability,
  updateAvailabilityRange,
} from '../../lib/pitchData';
import { parseTimeToMinutes } from '../../lib/slots';
import { useBreakpoint, WIDE_CONTENT_MAX_WIDTH } from '../../theme/breakpoints';
import { AppColors, weeklineColors } from '../../theme/palettes';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/layout';
import { scaleFont } from '../../theme/typography';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type RangeDraft = {
  key: string;
  id?: string;
  openTime: string;
  closeTime: string;
};

type DayDraft = {
  dayOfWeek: number;
  isAvailable: boolean;
  ranges: RangeDraft[];
  removedIds: string[];
  error?: string;
};

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `draft-${keyCounter}`;
}

function toHHMM(value: string) {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function clampToLabel(hours: number, minutes: number): string | null {
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Turns shorthand time input into a proper HH:MM, so an owner can type "21"
 * for 21:00 or "930" for 09:30 instead of always spelling out the colon.
 * Returns null when the text can't be understood as a time at all, in which
 * case the raw text is left alone and normal validation reports the error.
 */
export function normalizeTimeInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (TIME_PATTERN.test(trimmed)) return trimmed;

  const separatorMatch = trimmed.match(/^(\d{1,2})[:.hH](\d{1,2})$/);
  if (separatorMatch) {
    return clampToLabel(parseInt(separatorMatch[1], 10), parseInt(separatorMatch[2], 10));
  }

  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  if (!digitsOnly) return null;

  let hours: number;
  let minutes: number;

  if (digitsOnly.length <= 2) {
    // "21" -> 21:00, "9" -> 09:00
    hours = parseInt(digitsOnly, 10);
    minutes = 0;
  } else if (digitsOnly.length === 3) {
    // "930" -> 09:30
    hours = parseInt(digitsOnly.slice(0, 1), 10);
    minutes = parseInt(digitsOnly.slice(1), 10);
  } else {
    // "2130" -> 21:30 (extra digits beyond 4 are ignored)
    hours = parseInt(digitsOnly.slice(0, 2), 10);
    minutes = parseInt(digitsOnly.slice(2, 4), 10);
  }

  return clampToLabel(hours, minutes);
}

function emptyDay(dayOfWeek: number): DayDraft {
  return {
    dayOfWeek,
    isAvailable: false,
    ranges: [{ key: nextKey(), openTime: '08:00', closeTime: '22:00' }],
    removedIds: [],
  };
}

export default function AvailabilityScreen() {
  const { colors: appColors } = useAppTheme();
  const { activePitch, pitchOwner } = useAuth();
  const { isDesktop } = useBreakpoint();
  const { height: viewportHeight } = useWindowDimensions();
  const desktopDayMinHeight = Math.max(178, Math.round((viewportHeight - 232) / 3));
  const { t, tList } = useTranslation();
  const isDesktopWeb = Platform.OS === 'web' && isDesktop;
  const colors = isDesktopWeb ? weeklineColors : appColors;
  const DAY_LABELS = tList('availability.days');
  const styles = useMemo(() => makeStyles(colors, isDesktopWeb), [colors, isDesktopWeb]);

  const [drafts, setDrafts] = useState<DayDraft[]>(() =>
    Array.from({ length: 7 }, (_, index) => emptyDay(index))
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const load = useCallback(async () => {
    if (!activePitch) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const rows = await fetchAvailability(activePitch.id);

      const byDay = new Map<number, AvailabilityRow[]>();
      rows.forEach((row) => {
        const list = byDay.get(row.day_of_week) ?? [];
        list.push(row);
        byDay.set(row.day_of_week, list);
      });

      setDrafts(
        Array.from({ length: 7 }, (_, dayOfWeek) => {
          const dayRows = (byDay.get(dayOfWeek) ?? []).sort(
            (a, b) => parseTimeToMinutes(a.open_time) - parseTimeToMinutes(b.open_time)
          );

          if (dayRows.length === 0) return emptyDay(dayOfWeek);

          return {
            dayOfWeek,
            isAvailable: dayRows.some((row) => row.is_available),
            ranges: dayRows.map((row) => ({
              key: row.id,
              id: row.id,
              openTime: toHHMM(row.open_time),
              closeTime: toHHMM(row.close_time),
            })),
            removedIds: [],
          };
        })
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('availability.errorCouldNotLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [activePitch]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function updateDay(dayOfWeek: number, patch: Partial<DayDraft>) {
    setSuccessMessage('');
    setDrafts((current) =>
      current.map((draft) => (draft.dayOfWeek === dayOfWeek ? { ...draft, ...patch } : draft))
    );
  }

  function updateRange(dayOfWeek: number, key: string, patch: Partial<RangeDraft>) {
    setSuccessMessage('');
    setDrafts((current) =>
      current.map((draft) =>
        draft.dayOfWeek === dayOfWeek
          ? {
              ...draft,
              error: undefined,
              ranges: draft.ranges.map((range) =>
                range.key === key ? { ...range, ...patch } : range
              ),
            }
          : draft
      )
    );
  }

  function normalizeRangeField(dayOfWeek: number, key: string, field: 'openTime' | 'closeTime') {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.dayOfWeek !== dayOfWeek) return draft;

        return {
          ...draft,
          ranges: draft.ranges.map((range) => {
            if (range.key !== key) return range;
            const normalized = normalizeTimeInput(range[field]);
            if (!normalized) return range;
            return { ...range, [field]: normalized };
          }),
        };
      })
    );
  }

  function addRange(dayOfWeek: number) {
    setSuccessMessage('');
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.dayOfWeek !== dayOfWeek) return draft;

        // Start the new period after the last one so the common case (a
        // morning shift, then an afternoon shift) needs less typing.
        const last = draft.ranges[draft.ranges.length - 1];
        const suggestedOpen = last ? last.closeTime : '08:00';

        return {
          ...draft,
          error: undefined,
          ranges: [
            ...draft.ranges,
            { key: nextKey(), openTime: suggestedOpen, closeTime: '22:00' },
          ],
        };
      })
    );
  }

  function removeRange(dayOfWeek: number, key: string) {
    setSuccessMessage('');
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.dayOfWeek !== dayOfWeek) return draft;

        const target = draft.ranges.find((range) => range.key === key);

        return {
          ...draft,
          error: undefined,
          ranges: draft.ranges.filter((range) => range.key !== key),
          removedIds: target?.id ? [...draft.removedIds, target.id] : draft.removedIds,
        };
      })
    );
  }

  function validateDay(draft: DayDraft): string | null {
    if (draft.isAvailable && draft.ranges.length === 0) {
      return t('availability.errorAddPeriod');
    }

    for (const range of draft.ranges) {
      if (!TIME_PATTERN.test(range.openTime) || !TIME_PATTERN.test(range.closeTime)) {
        return t('availability.errorFormat');
      }
      if (parseTimeToMinutes(range.openTime) >= parseTimeToMinutes(range.closeTime)) {
        return t('availability.errorCloseAfterOpen');
      }
    }

    const sorted = [...draft.ranges].sort(
      (a, b) => parseTimeToMinutes(a.openTime) - parseTimeToMinutes(b.openTime)
    );

    for (let i = 1; i < sorted.length; i += 1) {
      if (parseTimeToMinutes(sorted[i].openTime) < parseTimeToMinutes(sorted[i - 1].closeTime)) {
        return t('availability.errorNoOverlap');
      }
    }

    return null;
  }

  async function saveAll() {
    if (!activePitch) return;

    // Normalize any shorthand the owner typed but never blurred out of
    // (e.g. they typed "21" in every field and tapped Save right away).
    const normalizedDrafts = drafts.map((draft) => ({
      ...draft,
      ranges: draft.ranges.map((range) => ({
        ...range,
        openTime: normalizeTimeInput(range.openTime) ?? range.openTime,
        closeTime: normalizeTimeInput(range.closeTime) ?? range.closeTime,
      })),
    }));

    const errorsByDay = new Map<number, string>();
    normalizedDrafts.forEach((draft) => {
      const dayError = validateDay(draft);
      if (dayError) errorsByDay.set(draft.dayOfWeek, dayError);
    });

    setSuccessMessage('');
    setDrafts(
      normalizedDrafts.map((draft) => ({ ...draft, error: errorsByDay.get(draft.dayOfWeek) }))
    );

    if (errorsByDay.size > 0) {
      setErrorMessage(t('availability.errorFixHighlighted'));
      return;
    }

    setIsSavingAll(true);
    setErrorMessage('');

    try {
      for (const draft of normalizedDrafts) {
        for (const removedId of draft.removedIds) {
          await deleteAvailabilityRange(removedId);
        }

        for (const range of draft.ranges) {
          const payload = {
            openTime: `${range.openTime}:00`,
            closeTime: `${range.closeTime}:00`,
            isAvailable: draft.isAvailable,
          };

          if (range.id) {
            await updateAvailabilityRange({ id: range.id, ...payload });
          } else {
            await createAvailabilityRange({
              pitchId: activePitch.id,
              dayOfWeek: draft.dayOfWeek,
              ...payload,
            });
          }
        }
      }

      await load();
      setSuccessMessage(t('availability.allSaved'));
    } catch (error) {
      setIsSavingAll(false);
      setErrorMessage(error instanceof Error ? error.message : t('availability.errorCouldNotSaveAll'));
      return;
    }

    setIsSavingAll(false);
  }

  if (!activePitch) {
    return (
      <Screen style={isDesktopWeb ? styles.desktopScreen : undefined} maxWidth={WIDE_CONTENT_MAX_WIDTH}>
        {isDesktopWeb ? <Text style={styles.emptyText}>{t('availability.noPitchLinked')}</Text> : <>
          <AppHeader title={t('availability.title')} showBack={false} />
          <Text style={styles.emptyText}>{t('availability.noPitchLinked')}</Text>
        </>}
      </Screen>
    );
  }

  return (
    <Screen style={isDesktopWeb ? styles.desktopScreen : undefined} contentStyle={isDesktopWeb ? styles.desktopContent : undefined} maxWidth={WIDE_CONTENT_MAX_WIDTH}>
      {isDesktopWeb ? (
        <View style={styles.desktopHeading}>
          <View>
            <Text style={styles.desktopTitle}>{t('availability.title')}</Text>
            <Text style={styles.desktopSubtitle}>{t('availability.subtitle')}</Text>
          </View>
          <View style={styles.desktopPitchBadge}>
            <Ionicons name="business-outline" size={16} color={colors.blueLight} />
            <Text style={styles.desktopPitchText} numberOfLines={1}>{pitchOwner?.business_name?.trim() || t('availability.sportsCenter')}</Text>
          </View>
        </View>
      ) : <AppHeader title={t('availability.title')} subtitle={t('availability.subtitle')} showBack={false} />}

      {isLoading ? (
        <ActivityIndicator color={colors.blueLight} style={styles.loading} />
      ) : (
        <>
          {isDesktopWeb ? <Text style={styles.desktopSectionHeading}>{t('availability.weeklyHours')}</Text> : <SectionHeader title={t('availability.weeklyHours')} />}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {successMessage && !errorMessage ? (
            <Text style={styles.successText}>{successMessage}</Text>
          ) : null}

          <View style={isDesktopWeb ? styles.desktopDayGrid : undefined}>
          {drafts.map((draft) => (
            <View key={draft.dayOfWeek} style={[styles.dayCard, isDesktopWeb && { minHeight: desktopDayMinHeight }]}>
              <View style={styles.dayTopRow}>
                <Text style={styles.dayLabel}>{DAY_LABELS[draft.dayOfWeek]}</Text>
                <Switch
                  value={draft.isAvailable}
                  onValueChange={(value) =>
                    updateDay(draft.dayOfWeek, { isAvailable: value, error: undefined })
                  }
                  trackColor={{ false: colors.cardDark, true: colors.blueSoft }}
                  thumbColor={draft.isAvailable ? colors.blueLight : colors.greyDark}
                />
              </View>

              {draft.isAvailable ? (
                <>
                  {draft.ranges.map((range, index) => (
                    <View key={range.key} style={styles.rangeBlock}>
                      <View style={styles.rangeHeaderRow}>
                        <Text style={styles.rangeLabel}>
                          {draft.ranges.length > 1
                            ? t('availability.periodLabel', { index: index + 1 })
                            : t('availability.openingHours')}
                        </Text>
                        {draft.ranges.length > 1 ? (
                          <AnimatedPressable
                            pressedScale={0.9}
                            style={styles.removeButton}
                            onPress={() => removeRange(draft.dayOfWeek, range.key)}
                            accessibilityRole="button"
                            accessibilityLabel={t('availability.removePeriod', { index: index + 1 })}
                          >
                            <Ionicons name="close" size={14} color={colors.red} />
                          </AnimatedPressable>
                        ) : null}
                      </View>

                      <View style={styles.timeRow}>
                        <View style={styles.timeField}>
                          <Text style={styles.timeLabel}>{t('availability.open')}</Text>
                          <TextInput
                            value={range.openTime}
                            onChangeText={(value) =>
                              updateRange(draft.dayOfWeek, range.key, { openTime: value })
                            }
                            onBlur={() => normalizeRangeField(draft.dayOfWeek, range.key, 'openTime')}
                            placeholder="08:00"
                            placeholderTextColor={colors.greyDark}
                            keyboardType="numbers-and-punctuation"
                            style={styles.timeInput}
                          />
                        </View>
                        <View style={styles.timeField}>
                          <Text style={styles.timeLabel}>{t('availability.close')}</Text>
                          <TextInput
                            value={range.closeTime}
                            onChangeText={(value) =>
                              updateRange(draft.dayOfWeek, range.key, { closeTime: value })
                            }
                            onBlur={() => normalizeRangeField(draft.dayOfWeek, range.key, 'closeTime')}
                            placeholder="12:00"
                            placeholderTextColor={colors.greyDark}
                            keyboardType="numbers-and-punctuation"
                            style={styles.timeInput}
                          />
                        </View>
                      </View>
                    </View>
                  ))}

                  <AnimatedPressable
                    pressedScale={0.97}
                    style={styles.addRangeButton}
                    contentStyle={styles.actionContent}
                    onPress={() => addRange(draft.dayOfWeek)}
                    accessibilityRole="button"
                    accessibilityLabel={`${DAY_LABELS[draft.dayOfWeek]}: ${t('availability.addAnotherPeriod')}`}
                  >
                    <Ionicons name="add" size={15} color={colors.blueLight} />
                    <Text style={styles.addRangeText}>{t('availability.addAnotherPeriod')}</Text>
                  </AnimatedPressable>
                </>
              ) : (
                <Text style={styles.closedText}>{t('availability.closedAllDay')}</Text>
              )}

              {draft.error ? <Text style={styles.dayErrorText}>{draft.error}</Text> : null}
            </View>
          ))}
          </View>

          <AnimatedPressable
            style={styles.saveAllButton}
            contentStyle={styles.actionContent}
            onPress={saveAll}
            disabled={isSavingAll}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSavingAll, busy: isSavingAll }}
          >
            {isSavingAll ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={isDesktopWeb ? 15 : 18} color={colors.blackText} />
            )}
            <Text style={styles.saveAllButtonText}>
              {isSavingAll ? t('availability.savingAll') : t('availability.saveAll')}
            </Text>
          </AnimatedPressable>
        </>
      )}
    </Screen>
  );
}

const makeStyles = (colors: AppColors, desktop: boolean) =>
  StyleSheet.create({
    emptyText: {
      color: colors.grey,
      fontSize: scaleFont(14),
      fontWeight: '600',
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    loading: {
      marginTop: spacing.xxl,
    },
    desktopScreen: {
      backgroundColor: '#08111A',
    },
    desktopContent: {
      paddingTop: 18,
      paddingBottom: 28,
    },
    desktopHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 20,
      marginBottom: 22,
    },
    desktopTitle: {
      color: colors.white,
      fontSize: 32.4,
      lineHeight: 39.6,
      fontWeight: '700',
      letterSpacing: -0.6,
    },
    desktopSubtitle: {
      color: colors.grey,
      fontSize: 12,
      marginTop: 3,
    },
    desktopPitchBadge: {
      maxWidth: 250,
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    desktopPitchDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: colors.blueLight,
    },
    desktopPitchText: {
      flexShrink: 1,
      color: colors.white,
      fontSize: 13,
      fontWeight: '600',
    },
    desktopSectionHeading: {
      color: colors.grey,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 11,
    },
    desktopDayGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(13),
      fontWeight: '700',
      marginBottom: spacing.md,
    },
    successText: {
      color: colors.greenLight,
      fontSize: scaleFont(13),
      fontWeight: '700',
      marginBottom: spacing.md,
    },
    dayCard: {
      width: desktop ? '32%' : undefined,
      minWidth: desktop ? 280 : undefined,
      flexGrow: desktop ? 1 : undefined,
      borderRadius: desktop ? 8 : radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: desktop ? 13 : spacing.md,
      marginBottom: desktop ? 0 : spacing.sm,
    },
    dayTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dayLabel: {
      color: colors.white,
      fontSize: desktop ? 13 : scaleFont(15),
      fontWeight: '600',
    },
    rangeBlock: {
      marginTop: desktop ? 8 : spacing.sm,
      paddingTop: desktop ? 8 : spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rangeHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rangeLabel: {
      color: colors.grey,
      fontSize: desktop ? 11 : scaleFont(11),
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: desktop ? 0.8 : 0.4,
    },
    removeButton: {
      width: 24,
      height: 24,
      borderRadius: desktop ? 7 : radius.round,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.redSoft,
    },
    timeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    timeField: {
      flex: 1,
    },
    timeLabel: {
      color: colors.grey,
      fontSize: desktop ? 11 : scaleFont(11),
      fontWeight: '700',
      marginBottom: 4,
    },
    timeInput: {
      borderRadius: desktop ? 7 : radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardDark,
      color: colors.white,
      paddingHorizontal: spacing.sm,
      paddingVertical: desktop ? 7 : 9,
      fontSize: desktop ? 12 : scaleFont(13),
      fontWeight: '600',
    },
    addRangeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      flexGrow: desktop ? 0 : undefined,
      flexShrink: desktop ? 0 : undefined,
      flexBasis: desktop ? 'auto' : undefined,
      marginTop: spacing.sm,
      paddingHorizontal: desktop ? 11 : spacing.sm,
      paddingVertical: desktop ? 0 : 7,
      height: desktop ? 31 : undefined,
      borderRadius: desktop ? 7 : radius.md,
      borderWidth: 1,
      borderColor: desktop ? colors.border : colors.borderGreen,
      backgroundColor: desktop ? colors.cardSoft : colors.greenSoft,
    },
    addRangeText: {
      color: colors.blueLight,
      fontSize: desktop ? 13 : scaleFont(12),
      fontWeight: desktop ? '600' : '800',
    },
    actionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    closedText: {
      color: colors.greyDark,
      fontSize: scaleFont(12),
      fontWeight: '600',
      marginTop: spacing.sm,
    },
    dayErrorText: {
      color: colors.red,
      fontSize: scaleFont(11),
      fontWeight: '700',
      marginTop: spacing.sm,
    },
    saveAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      flexGrow: desktop ? 0 : undefined,
      flexShrink: desktop ? 0 : undefined,
      flexBasis: desktop ? 'auto' : undefined,
      marginTop: spacing.sm,
      marginBottom: spacing.xl,
      paddingVertical: desktop ? 0 : 15,
      height: desktop ? 31 : undefined,
      borderRadius: desktop ? 7 : radius.lg,
      backgroundColor: desktop ? colors.blueLight : colors.greenLight,
      alignSelf: desktop ? 'flex-start' : undefined,
      minWidth: desktop ? 146 : undefined,
      paddingHorizontal: desktop ? 11 : undefined,
    },
    saveAllButtonText: {
      color: colors.background,
      fontSize: desktop ? 13 : scaleFont(15),
      fontWeight: desktop ? '700' : '900',
    },
  });
