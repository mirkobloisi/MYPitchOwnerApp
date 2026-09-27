import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import AnimatedPressable from '../components/AnimatedPressable';
import AppButton from '../components/AppButton';
import AppHeader from '../components/AppHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import RecurrencePicker, {
  initialRecurrence,
  RecurrenceValue,
  validateRecurrence,
} from '../components/RecurrencePicker';
import Screen from '../components/Screen';
import StartEndTimePicker from '../components/StartEndTimePicker';
import { useTranslation } from '../i18n/LanguageContext';
import { useAuth } from '../lib/auth';
import {
  AvailabilityRow,
  createPitchBlock,
  createRecurringPitchBlocks,
  fetchAgendaRange,
  fetchAvailability,
} from '../lib/pitchData';
import {
  addDays,
  bookableSpanForDay,
  buildBusyRanges,
  buildEndOptions,
  buildStartOptions,
  BusyRange,
  busyWithinSpan,
  dateAtMinutes,
  isPastDay,
  minutesToLabel,
  startOfDay,
} from '../lib/slots';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont, scaleLine } from '../theme/typography';

function formatRange(range: BusyRange) {
  const options = { hour: '2-digit', minute: '2-digit', hour12: false } as const;
  return `${range.start.toLocaleTimeString([], options)}–${range.end.toLocaleTimeString(
    [],
    options
  )}`;
}

export default function AddExternalBookingScreen() {
  const { colors } = useAppTheme();
  const { session } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ pitchId: string; date: string; kind?: string }>();

  /**
   * A party takes the pitch for an evening rather than a playing slot, but
   * both it and an ordinary external booking pick a start and end time the
   * same way — directly, rather than a length plus a slot from a grid.
   */
  const isParty = params.kind === 'party';
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const SOURCE_OPTIONS = [
    t('addExternalBooking.sourcePhone'),
    t('addExternalBooking.sourceWalkIn'),
    t('addExternalBooking.sourceWhatsApp'),
    t('addExternalBooking.sourceOther'),
  ];

  const day = useMemo(() => startOfDay(new Date(params.date)), [params.date]);

  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [busy, setBusy] = useState<BusyRange[]>([]);
  const [allDay, setAllDay] = useState(false);
  const [startMinutes, setStartMinutes] = useState<number | null>(null);
  const [endMinutes, setEndMinutes] = useState<number | null>(null);
  const [source, setSource] = useState(SOURCE_OPTIONS[0]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(initialRecurrence);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [skippedNotice, setSkippedNotice] = useState<{ title: string; message: string } | null>(
    null
  );

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const [availabilityRows, agenda] = await Promise.all([
          fetchAvailability(params.pitchId),
          fetchAgendaRange(params.pitchId, day, addDays(day, 1)),
        ]);

        if (isMounted) {
          setAvailability(availabilityRows);
          setBusy(buildBusyRanges(agenda.matches, agenda.blocks));
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : t('addExternalBooking.errorLoadAvailability'));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [day, params.pitchId]);

  // Fixed at mount so it doesn't change identity on every render.
  const now = useMemo(() => new Date(), []);
  const dayIsPast = isPastDay(day);

  // Times already gone are left out — a booking cannot start in the past.
  // A party is free to run past the pitch's own opening hours (an evening
  // event isn't a playing slot), so it isn't constrained to open periods.
  const startOptions = useMemo(
    () =>
      isParty
        ? Array.from({ length: 48 }, (_, i) => i * 30).filter(
            (minutes) => dateAtMinutes(day, minutes).getTime() >= now.getTime()
          )
        : buildStartOptions({ availability, day, busy, notBefore: now }),
    [isParty, availability, day, busy, now]
  );

  const endOptions = useMemo(() => {
    if (startMinutes === null) return [];

    if (isParty) {
      const options: number[] = [];
      for (let end = startMinutes + 30; end <= 48 * 30; end += 30) {
        const slotStart = dateAtMinutes(day, startMinutes);
        const slotEnd = dateAtMinutes(day, end);
        if (busy.some((range) => slotStart < range.end && slotEnd > range.start)) break;
        options.push(end);
      }
      return options;
    }

    return buildEndOptions({ availability, day, busy, startMinutes });
  }, [isParty, availability, day, busy, startMinutes]);

  const bookableSpan = useMemo(
    () => bookableSpanForDay(availability, day, now),
    [availability, day, now]
  );

  const allDayConflicts = useMemo(
    () => (bookableSpan ? busyWithinSpan(day, bookableSpan, busy) : []),
    [day, bookableSpan, busy]
  );

  // A start that's no longer offered (the day's data reloaded) can't stay
  // selected, and an end that's no longer valid for the current start
  // shouldn't either.
  useEffect(() => {
    setStartMinutes((current) => (current !== null && startOptions.includes(current) ? current : null));
  }, [startOptions]);

  useEffect(() => {
    setEndMinutes((current) => (current !== null && endOptions.includes(current) ? current : null));
  }, [endOptions]);

  async function handleConfirm() {
    if (!session) return;

    let startTime: Date;
    let endTime: Date;

    if (isParty) {
      if (startMinutes === null || endMinutes === null) {
        setErrorMessage(t('addExternalBooking.errorSelectSlot'));
        return;
      }

      startTime = dateAtMinutes(day, startMinutes);
      endTime = dateAtMinutes(day, endMinutes);
    } else if (allDay) {
      if (!bookableSpan) {
        setErrorMessage(
          dayIsPast
            ? t('addExternalBooking.errorDayPassed')
            : t('addExternalBooking.errorNoRemainingTime')
        );
        return;
      }

      if (allDayConflicts.length > 0) {
        setErrorMessage(
          t('addExternalBooking.errorDayConflict', {
            list: allDayConflicts.map(formatRange).join(', '),
          })
        );
        return;
      }

      startTime = dateAtMinutes(day, bookableSpan.startMinutes);
      endTime = dateAtMinutes(day, bookableSpan.endMinutes);
    } else {
      if (startMinutes === null || endMinutes === null) {
        setErrorMessage(t('addExternalBooking.errorSelectSlot'));
        return;
      }

      startTime = dateAtMinutes(day, startMinutes);
      endTime = dateAtMinutes(day, endMinutes);
    }

    const { error: recurrenceError, untilDate } = validateRecurrence(recurrence, day, t);

    if (recurrenceError) {
      setErrorMessage(recurrenceError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      if (recurrence.enabled) {
        const result = await createRecurringPitchBlocks({
          pitchId: params.pitchId,
          startTime,
          endTime,
          repeatUntil: untilDate,
          openEnded: recurrence.openEnded,
          blockType: isParty ? 'party' : 'external_booking',
          reason: source,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        });

        if (result.created === 0) {
          setErrorMessage(t('addExternalBooking.errorEveryWeekTaken'));
          return;
        }

        if (result.skipped.length > 0) {
          const skippedList = result.skipped
            .map((iso) =>
              new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
            )
            .join(', ');

          setSkippedNotice({
            title: t('addExternalBooking.skippedTitle', { count: result.created }),
            message: t('addExternalBooking.skippedMessage', { list: skippedList }),
          });
          return;
        }
      } else {
        await createPitchBlock({
          pitchId: params.pitchId,
          startTime,
          endTime,
          blockType: isParty ? 'party' : 'external_booking',
          reason: source,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          createdBy: session.user.id,
        });
      }

      router.back();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('addExternalBooking.errorSave')
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (dayIsPast) {
    return (
      <Screen>
        <AppHeader title={t('addExternalBooking.title')} />
        <View style={styles.pastCard}>
          <Ionicons name="time-outline" size={18} color={colors.orange} />
          <Text style={styles.pastText}>
            {t('addExternalBooking.pastMessage', {
              date: day.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }),
            })}
          </Text>
        </View>
        <AppButton title={t('addExternalBooking.backToAgenda')} variant="outline" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={t('addExternalBooking.title')} />

      <Text style={styles.dateLabel}>
        {day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>

      {isParty ? (
        <Text style={styles.sectionLabel}>{t('addExternalBooking.partyTimeStep')}</Text>
      ) : (
        <>
          <View style={styles.allDayToggleRow}>
            <Text style={styles.sectionLabel}>{t('durationPicker.allDay')}</Text>
            <Switch
              value={allDay}
              onValueChange={setAllDay}
              trackColor={{ false: colors.cardDark, true: colors.blueSoft }}
              thumbColor={allDay ? colors.blueLight : colors.greyDark}
            />
          </View>

          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
            {allDay
              ? t('addExternalBooking.wholeDayStep')
              : t('addExternalBooking.startTimeStep')}
          </Text>
        </>
      )}

      {isLoading ? (
        <Text style={styles.helperText}>{t('addExternalBooking.loadingAvailability')}</Text>
      ) : !isParty && allDay ? (
        <View style={styles.allDayCard}>
          <Ionicons
            name={allDayConflicts.length > 0 ? 'alert-circle-outline' : 'sunny-outline'}
            size={18}
            color={allDayConflicts.length > 0 ? colors.red : colors.blueLight}
          />
          <View style={styles.allDayTextWrap}>
            {bookableSpan ? (
              <>
                <Text style={styles.allDayValue}>
                  {minutesToLabel(bookableSpan.startMinutes)} –{' '}
                  {minutesToLabel(bookableSpan.endMinutes)}
                </Text>
                <Text style={styles.allDayHint}>
                  {allDayConflicts.length > 0
                    ? t('addExternalBooking.allDayConflict', { list: allDayConflicts.map(formatRange).join(', ') })
                    : bookableSpan.clamped
                      ? t('addExternalBooking.allDayClamped')
                      : t('addExternalBooking.allDayFull')}
                </Text>
              </>
            ) : (
              <Text style={styles.allDayValue}>
                {t('addExternalBooking.allDayNoOpenTime')}
              </Text>
            )}
          </View>
        </View>
      ) : startOptions.length === 0 ? (
        <Text style={styles.helperText}>{t('addExternalBooking.noOpenTime')}</Text>
      ) : (
        <StartEndTimePicker
          startLabel={t('addExternalBooking.startTimeLabel')}
          endLabel={t('addExternalBooking.endTimeLabel')}
          startMinutes={startMinutes}
          endMinutes={endMinutes}
          startOptions={startOptions}
          endOptions={endOptions}
          onChangeStart={(minutes) => {
            setStartMinutes(minutes);
            setEndMinutes(null);
          }}
          onChangeEnd={setEndMinutes}
          startPlaceholder={t('addExternalBooking.selectTime')}
          endPlaceholder={t('addExternalBooking.selectTime')}
          pickStartTitle={t('addExternalBooking.startTimeLabel')}
          pickEndTitle={t('addExternalBooking.endTimeLabel')}
          emptyText={t('addExternalBooking.noSlotsLongEnough')}
        />
      )}

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>{t('addExternalBooking.bookingDetailsStep')}</Text>

      <Text style={styles.fieldLabel}>{t('addExternalBooking.sourceReasonLabel')}</Text>
      <View style={styles.sourceRow}>
        {SOURCE_OPTIONS.map((option) => (
          <AnimatedPressable
            key={option}
            style={[styles.sourceChip, source === option && styles.sourceChipActive]}
            onPress={() => setSource(option)}
          >
            <Text style={[styles.sourceChipText, source === option && styles.sourceChipTextActive]}>
              {option}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('addExternalBooking.referenceLabel')}</Text>
      <TextInput
        value={reference}
        onChangeText={setReference}
        placeholder={t('addExternalBooking.referencePlaceholder')}
        placeholderTextColor={colors.greyDark}
        style={styles.input}
      />

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('addExternalBooking.notesLabel')}</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder={t('addExternalBooking.notesPlaceholder')}
        placeholderTextColor={colors.greyDark}
        style={[styles.input, styles.textArea]}
        multiline
      />

      <RecurrencePicker startDay={day} value={recurrence} onChange={setRecurrence} />

      <View style={styles.noticeBox}>
        <Ionicons name="information-circle-outline" size={16} color={colors.blueLight} />
        <Text style={styles.noticeText}>{t('addExternalBooking.noticeText')}</Text>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.buttonRow}>
        <View style={styles.buttonHalf}>
          <AppButton title={t('common.cancel')} variant="outline" onPress={() => router.back()} />
        </View>
        <View style={styles.buttonHalf}>
          <AppButton
            title={recurrence.enabled ? t('addExternalBooking.addWeeklyBooking') : t('addExternalBooking.addBooking')}
            onPress={handleConfirm}
            loading={isSubmitting}
          />
        </View>
      </View>

      <ConfirmDialog
        visible={skippedNotice !== null}
        title={skippedNotice?.title ?? ''}
        message={skippedNotice?.message}
        actions={[{ label: t('common.ok'), onPress: () => router.back() }]}
        onDismiss={() => setSkippedNotice(null)}
      />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    dateLabel: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '700',
      marginBottom: spacing.lg,
    },
    sectionLabel: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '900',
      marginBottom: spacing.sm,
    },
    sectionLabelSpaced: {
      marginTop: spacing.lg,
    },
    allDayToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    helperText: {
      color: colors.greyDark,
      fontSize: scaleFont(13),
      fontWeight: '600',
    },
    pastCard: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      backgroundColor: colors.orangeSoft,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: 'rgba(255, 159, 10, 0.35)',
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    pastText: {
      flex: 1,
      color: colors.orange,
      fontSize: scaleFont(13),
      fontWeight: '600',
      lineHeight: scaleLine(19),
    },
    allDayCard: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    allDayTextWrap: {
      flex: 1,
    },
    allDayValue: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '900',
    },
    allDayHint: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      marginTop: 3,
      lineHeight: scaleLine(17),
    },
    fieldLabel: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '800',
      marginBottom: spacing.xs,
    },
    fieldLabelSpaced: {
      marginTop: spacing.md,
    },
    sourceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    sourceChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    sourceChipActive: {
      backgroundColor: colors.greenSoft,
      borderColor: colors.borderGreen,
    },
    sourceChipText: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    sourceChipTextActive: {
      color: colors.greenLight,
    },
    input: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardDark,
      color: colors.white,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: scaleFont(14),
      fontWeight: '600',
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    noticeBox: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      backgroundColor: colors.blueSoft,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderBlue,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    noticeText: {
      flex: 1,
      color: colors.blueLight,
      fontSize: scaleFont(12),
      fontWeight: '600',
      lineHeight: scaleLine(17),
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(13),
      fontWeight: '700',
      marginTop: spacing.md,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xl,
    },
    buttonHalf: {
      flex: 1,
    },
  });
