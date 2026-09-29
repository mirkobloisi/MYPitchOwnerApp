import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import AnimatedPressable from '../components/AnimatedPressable';
import AppButton from '../components/AppButton';
import AppHeader from '../components/AppHeader';
import ConfirmDialog, { ConfirmAction } from '../components/ConfirmDialog';
import DurationPicker from '../components/DurationPicker';
import Screen from '../components/Screen';
import { useTranslation } from '../i18n/LanguageContext';
import {
  AvailabilityRow,
  countRemainingInSeries,
  deletePitchBlock,
  deleteRecurringSeriesFrom,
  fetchAgendaRange,
  fetchAvailability,
  fetchPitchBlock,
  PitchBlockRow,
  updatePitchBlock,
} from '../lib/pitchData';
import {
  addDays,
  bookableSpanForDay,
  buildBusyRanges,
  buildSlots,
  BusyRange,
  busyWithinSpan,
  dateAtMinutes,
  isSameDay,
  minutesToLabel,
  startOfDay,
} from '../lib/slots';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont, scaleLine } from '../theme/typography';

const DAY_OPTION_COUNT = 30;

function formatRange(range: BusyRange) {
  const options = { hour: '2-digit', minute: '2-digit', hour12: false } as const;
  return `${range.start.toLocaleTimeString([], options)}–${range.end.toLocaleTimeString(
    [],
    options
  )}`;
}

export default function ManageBlockScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ blockId: string }>();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const BASE_SOURCE_OPTIONS = [
    t('addExternalBooking.sourcePhone'),
    t('addExternalBooking.sourceWalkIn'),
    t('addExternalBooking.sourceWhatsApp'),
    t('addExternalBooking.sourceOther'),
  ];

  const [block, setBlock] = useState<PitchBlockRow | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedStart, setSelectedStart] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [originalDuration, setOriginalDuration] = useState(60);
  const [allDay, setAllDay] = useState(false);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [seriesRemaining, setSeriesRemaining] = useState(0);

  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [busy, setBusy] = useState<BusyRange[]>([]);
  const [isLoadingBlock, setIsLoadingBlock] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [dialog, setDialog] = useState<{
    title: string;
    message?: string;
    actions: ConfirmAction[];
  } | null>(null);

  const isExternalBooking = block?.block_type === 'external_booking';
  const isRecurring = !!block?.recurrence_group_id;

  // Load the booking being edited.
  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoadingBlock(true);
      setErrorMessage('');

      try {
        const row = await fetchPitchBlock(params.blockId);

        if (!isMounted) return;

        if (!row) {
          setErrorMessage(t('manageBlock.notFoundExpired'));
          return;
        }

        const start = new Date(row.start_time);
        const end = new Date(row.end_time);
        const span = Math.round((end.getTime() - start.getTime()) / 60000);
        const minutes = span > 0 ? span : 60;

        setBlock(row);
        setSelectedDay(startOfDay(start));
        setSelectedStart(start.getHours() * 60 + start.getMinutes());
        setDurationMinutes(minutes);
        setOriginalDuration(minutes);
        setReason(row.reason ?? '');
        setReference(row.reference ?? '');
        setNotes(row.notes ?? '');

        if (row.recurrence_group_id) {
          const remaining = await countRemainingInSeries(row.recurrence_group_id, start);
          if (isMounted) setSeriesRemaining(remaining);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : t('manageBlock.errorLoadBooking'));
        }
      } finally {
        if (isMounted) setIsLoadingBlock(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [params.blockId]);

  // Reload availability and existing bookings whenever the chosen day changes.
  useEffect(() => {
    if (!block || !selectedDay) return;

    let isMounted = true;

    async function load() {
      if (!block || !selectedDay) return;

      setIsLoadingSlots(true);

      try {
        const dayStart = startOfDay(selectedDay);

        const [availabilityRows, agenda] = await Promise.all([
          fetchAvailability(block.pitch_id),
          fetchAgendaRange(block.pitch_id, dayStart, addDays(dayStart, 1)),
        ]);

        if (isMounted) {
          setAvailability(availabilityRows);
          // Exclude this booking so it doesn't collide with itself.
          setBusy(buildBusyRanges(agenda.matches, agenda.blocks, block.id));
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : t('manageBlock.errorLoadAvailability'));
        }
      } finally {
        if (isMounted) setIsLoadingSlots(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [block, selectedDay]);

  // Fixed at mount so it doesn't change identity on every render.
  const now = useMemo(() => new Date(), []);

  // A booking that has already happened stays editable and deletable, but it
  // cannot be moved — the database refuses it, and there is nothing sensible
  // to move it to. Its date and time controls are hidden instead.
  const bookingIsPast = block ? new Date(block.start_time).getTime() < now.getTime() : false;

  const slots = useMemo(() => {
    if (!selectedDay) return [];
    return buildSlots({ availability, day: selectedDay, durationMinutes, busy, notBefore: now });
  }, [availability, selectedDay, durationMinutes, busy, now]);

  const bookableSpan = useMemo(
    () => (selectedDay ? bookableSpanForDay(availability, selectedDay, now) : null),
    [availability, selectedDay, now]
  );

  const allDayConflicts = useMemo(
    () => (selectedDay && bookableSpan ? busyWithinSpan(selectedDay, bookableSpan, busy) : []),
    [selectedDay, bookableSpan, busy]
  );

  useEffect(() => {
    setSelectedStart((current) =>
      current !== null && slots.some((slot) => slot.startMinutes === current && slot.isFree)
        ? current
        : null
    );
  }, [slots]);

  // Always starts at today: a booking can be moved forward, never backwards.
  const dayOptions = useMemo(() => {
    const today = startOfDay(now);
    return Array.from({ length: DAY_OPTION_COUNT }, (_, index) => addDays(today, index));
  }, [now]);

  const sourceOptions = useMemo(() => {
    const current = block?.reason?.trim();
    if (current && !BASE_SOURCE_OPTIONS.includes(current)) {
      return [current, ...BASE_SOURCE_OPTIONS];
    }
    return BASE_SOURCE_OPTIONS;
  }, [block]);

  async function handleSave() {
    if (!block || !selectedDay) return;

    if (!isExternalBooking && !reason.trim()) {
      setErrorMessage(t('manageBlock.errorReasonRequired'));
      return;
    }

    const dayStart = startOfDay(selectedDay);
    let startTime: Date;
    let endTime: Date;

    if (bookingIsPast) {
      // Keep the original time untouched so only the details are updated.
      startTime = new Date(block.start_time);
      endTime = new Date(block.end_time);
    } else if (allDay) {
      if (!bookableSpan) {
        setErrorMessage(t('manageBlock.errorNoRemainingTime'));
        return;
      }

      if (allDayConflicts.length > 0) {
        setErrorMessage(
          t('manageBlock.errorDayConflict', { list: allDayConflicts.map(formatRange).join(', ') })
        );
        return;
      }

      startTime = dateAtMinutes(dayStart, bookableSpan.startMinutes);
      endTime = dateAtMinutes(dayStart, bookableSpan.endMinutes);
    } else {
      if (selectedStart === null) {
        setErrorMessage(t('manageBlock.errorSelectSlot'));
        return;
      }

      startTime = dateAtMinutes(dayStart, selectedStart);
      endTime = dateAtMinutes(dayStart, selectedStart + durationMinutes);
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      await updatePitchBlock({
        blockId: block.id,
        startTime,
        endTime,
        reason: reason.trim(),
        reference: isExternalBooking || block.block_type === 'party' ? reference.trim() || null : null,
        notes: isExternalBooking || block.block_type === 'party' ? notes.trim() || null : null,
      });

      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('manageBlock.errorSave'));
    } finally {
      setIsSaving(false);
    }
  }

  async function runDelete(scope: 'one' | 'future') {
    if (!block) return;

    setIsDeleting(true);
    setErrorMessage('');

    try {
      if (scope === 'future' && block.recurrence_group_id) {
        await deleteRecurringSeriesFrom(block.recurrence_group_id, new Date(block.start_time));
      } else {
        await deletePitchBlock(block.id);
      }

      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('manageBlock.errorDelete'));
    } finally {
      setIsDeleting(false);
    }
  }

  function confirmDelete() {
    if (!block) return;

    const title = isExternalBooking
      ? t('manageBlock.deleteDialogTitleExternal')
      : t('manageBlock.deleteDialogTitleBlocked');

    if (isRecurring && seriesRemaining > 1) {
      setDialog({
        title,
        message: block.recurrence_open_ended
          ? t('manageBlock.seriesOpenEnded')
          : t('manageBlock.seriesFixedWithRemaining', { count: seriesRemaining }),
        actions: [
          { label: t('manageBlock.justThisWeek'), onPress: () => runDelete('one') },
          {
            label: block.recurrence_open_ended
              ? t('manageBlock.endWholeSeries')
              : t('manageBlock.thisAndAllLater', { count: seriesRemaining - 1 }),
            tone: 'destructive',
            onPress: () => runDelete('future'),
          },
          { label: t('manageBlock.cancelAction'), tone: 'cancel' },
        ],
      });
      return;
    }

    setDialog({
      title,
      message: t('manageBlock.deleteDialogAvailableAgain'),
      actions: [
        { label: t('manageBlock.deleteAction'), tone: 'destructive', onPress: () => runDelete('one') },
        { label: t('manageBlock.keepIt'), tone: 'cancel' },
      ],
    });
  }

  if (isLoadingBlock) {
    return (
      <Screen>
        <AppHeader title={t('manageBlock.manageBookingTitle')} />
        <Text style={styles.helperText}>{t('manageBlock.loadingBlock')}</Text>
      </Screen>
    );
  }

  if (!block) {
    return (
      <Screen>
        <AppHeader title={t('manageBlock.manageBookingTitle')} />
        <Text style={styles.errorText}>{errorMessage || t('manageBlock.notFoundGeneric')}</Text>
        <View style={styles.buttonSpacing}>
          <AppButton title={t('manageBlock.backToAgenda')} variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader
        title={isExternalBooking ? t('manageBlock.titleExternal') : t('manageBlock.titleBlocked')}
        subtitle={
          bookingIsPast
            ? t('manageBlock.subtitlePast')
            : isExternalBooking
              ? t('manageBlock.subtitleExternal')
              : t('manageBlock.subtitleBlocked')
        }
      />

      <View style={[styles.currentCard, isExternalBooking && styles.currentCardExternal]}>
        <Ionicons
          name={isExternalBooking ? 'people-outline' : 'lock-closed-outline'}
          size={18}
          color={isExternalBooking ? colors.blueLight : colors.greyDark}
        />
        <View style={styles.currentTextWrap}>
          <Text style={styles.currentLabel}>{t('manageBlock.currentlyScheduled')}</Text>
          <Text style={styles.currentValue}>
            {new Date(block.start_time).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
            {'  ·  '}
            {new Date(block.start_time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
            {' – '}
            {new Date(block.end_time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </Text>
        </View>
      </View>

      {isRecurring ? (
        <View style={styles.seriesCard}>
          <Ionicons
            name={block.recurrence_open_ended ? 'infinite' : 'repeat'}
            size={16}
            color={colors.greenLight}
          />
          <Text style={styles.seriesText}>
            {block.recurrence_open_ended
              ? t('manageBlock.seriesOpenEnded')
              : seriesRemaining > 0
                ? t('manageBlock.seriesFixedWithRemaining', { count: seriesRemaining })
                : t('manageBlock.seriesFixedNoRemaining')}
          </Text>
        </View>
      ) : null}

      {bookingIsPast ? (
        <View style={styles.pastCard}>
          <Ionicons name="time-outline" size={18} color={colors.orange} />
          <Text style={styles.pastText}>{t('manageBlock.pastNotice')}</Text>
        </View>
      ) : null}

      {!bookingIsPast ? (
      <>
      <Text style={styles.sectionLabel}>{t('manageBlock.dayStep')}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayStrip}
      >
        {dayOptions.map((day) => {
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;

          return (
            <AnimatedPressable
              key={day.toISOString()}
              pressedScale={0.96}
              style={[styles.dayChip, isSelected && styles.dayChipSelected]}
              onPress={() => setSelectedDay(startOfDay(day))}
            >
              <Text style={[styles.dayChipWeekday, isSelected && styles.dayChipTextSelected]}>
                {day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
              </Text>
              <Text style={[styles.dayChipNumber, isSelected && styles.dayChipTextSelected]}>
                {day.getDate()}
              </Text>
              <Text style={[styles.dayChipMonth, isSelected && styles.dayChipTextSelected]}>
                {day.toLocaleDateString(undefined, { month: 'short' })}
              </Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>{t('manageBlock.lengthStep')}</Text>
      <DurationPicker
        value={durationMinutes}
        onChange={setDurationMinutes}
        allDay={allDay}
        onAllDayChange={setAllDay}
        extraOptions={[originalDuration]}
      />

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
        {allDay ? t('manageBlock.wholeDayStep') : t('manageBlock.startTimeStep')}
      </Text>

      {isLoadingSlots ? (
        <Text style={styles.helperText}>{t('manageBlock.loadingAvailability')}</Text>
      ) : allDay ? (
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
                    ? t('manageBlock.allDayConflictOther', { list: allDayConflicts.map(formatRange).join(', ') })
                    : bookableSpan.clamped
                      ? t('manageBlock.allDayClamped')
                      : t('manageBlock.allDayFull')}
                </Text>
              </>
            ) : (
              <Text style={styles.allDayValue}>{t('manageBlock.allDayNoOpen')}</Text>
            )}
          </View>
        </View>
      ) : slots.length === 0 ? (
        <Text style={styles.helperText}>
          {bookableSpan
            ? t('manageBlock.noSlotsLongEnough')
            : t('manageBlock.noOpenTime')}
        </Text>
      ) : (
        <View style={styles.slotGrid}>
          {slots.map((slot) => (
            <AnimatedPressable
              key={slot.startMinutes}
              disabled={!slot.isFree}
              style={[
                styles.slot,
                !slot.isFree && styles.slotDisabled,
                selectedStart === slot.startMinutes && styles.slotSelected,
              ]}
              onPress={() => setSelectedStart(slot.startMinutes)}
            >
              <Text
                style={[
                  styles.slotText,
                  !slot.isFree && styles.slotTextDisabled,
                  selectedStart === slot.startMinutes && styles.slotTextSelected,
                ]}
              >
                {slot.label}
              </Text>
              <Text style={[styles.slotStatus, !slot.isFree && styles.slotTextDisabled]}>
                {slot.isFree ? t('common.free') : t('common.taken')}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      )}
      </>
      ) : null}

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
        {bookingIsPast ? t('manageBlock.detailsStepPast') : t('manageBlock.detailsStep')}
      </Text>

      {isExternalBooking ? (
        <>
          <Text style={styles.fieldLabel}>{t('manageBlock.sourceReasonLabel')}</Text>
          <View style={styles.sourceRow}>
            {sourceOptions.map((option) => (
              <AnimatedPressable
                key={option}
                style={[styles.sourceChip, reason === option && styles.sourceChipActive]}
                onPress={() => setReason(option)}
              >
                <Text
                  style={[styles.sourceChipText, reason === option && styles.sourceChipTextActive]}
                >
                  {option}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('manageBlock.referenceLabel')}</Text>
          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder={t('manageBlock.referencePlaceholder')}
            placeholderTextColor={colors.greyDark}
            style={styles.input}
          />

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('manageBlock.notesLabel')}</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t('manageBlock.notesPlaceholder')}
            placeholderTextColor={colors.greyDark}
            style={[styles.input, styles.textArea]}
            multiline
          />
        </>
      ) : (
        <>
          <Text style={styles.fieldLabel}>{t('manageBlock.reasonLabel')}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={t('manageBlock.reasonPlaceholder')}
            placeholderTextColor={colors.greyDark}
            style={styles.input}
          />
        </>
      )}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.buttonRow}>
        <View style={styles.buttonHalf}>
          <AppButton title={t('common.cancel')} variant="outline" onPress={() => router.back()} />
        </View>
        <View style={styles.buttonHalf}>
          <AppButton title={t('manageBlock.saveChanges')} onPress={handleSave} loading={isSaving} />
        </View>
      </View>

      <View style={styles.deleteSection}>
        <AppButton
          title={isExternalBooking ? t('manageBlock.deleteExternalBooking') : t('manageBlock.removeBlockedSlot')}
          variant="danger"
          onPress={confirmDelete}
          loading={isDeleting}
        />
      </View>

      <ConfirmDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={dialog?.actions ?? []}
        onDismiss={() => setDialog(null)}
      />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
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
    currentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    currentCardExternal: {
      borderColor: colors.borderBlue,
      backgroundColor: colors.blueSoft,
    },
    currentTextWrap: {
      flex: 1,
    },
    currentLabel: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    currentValue: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '800',
      marginTop: 2,
    },
    seriesCard: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      borderRadius: radius.md,
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    seriesText: {
      flex: 1,
      color: colors.greenLight,
      fontSize: scaleFont(12),
      fontWeight: '600',
      lineHeight: scaleLine(17),
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
    dayStrip: {
      gap: spacing.xs,
      paddingRight: spacing.md,
    },
    dayChip: {
      width: 58,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingVertical: 10,
      alignItems: 'center',
    },
    dayChipSelected: {
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
    },
    dayChipWeekday: {
      color: colors.greyDark,
      fontSize: scaleFont(10),
      fontWeight: '800',
    },
    dayChipNumber: {
      color: colors.white,
      fontSize: scaleFont(17),
      fontWeight: '900',
      marginVertical: 1,
    },
    dayChipMonth: {
      color: colors.greyDark,
      fontSize: scaleFont(10),
      fontWeight: '700',
    },
    dayChipTextSelected: {
      color: colors.greenLight,
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
    slotGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    slot: {
      width: '31%',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingVertical: 10,
      alignItems: 'center',
    },
    slotDisabled: {
      opacity: 0.4,
    },
    slotSelected: {
      borderColor: colors.greenLight,
      backgroundColor: colors.greenSoft,
    },
    slotText: {
      color: colors.white,
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    slotTextDisabled: {
      color: colors.greyDark,
    },
    slotTextSelected: {
      color: colors.greenLight,
    },
    slotStatus: {
      color: colors.greenLight,
      fontSize: scaleFont(10),
      fontWeight: '700',
      marginTop: 3,
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
    buttonSpacing: {
      marginTop: spacing.lg,
    },
    deleteSection: {
      marginTop: spacing.md,
    },
  });
