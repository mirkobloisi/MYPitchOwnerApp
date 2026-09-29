import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AnimatedPressable from '../../components/AnimatedPressable';
import AnimatedSelectable from '../../components/AnimatedSelectable';
import AnimatedSwap from '../../components/AnimatedSwap';
import AppHeader from '../../components/AppHeader';
import Screen from '../../components/Screen';
import { useTranslation } from '../../i18n/LanguageContext';
import { useAuth } from '../../lib/auth';
import {
  AcademySessionOccurrence,
  fetchAgendaRange,
  MatchRow,
  MatchStatus,
  PitchBlockRow,
} from '../../lib/pitchData';
import { isPastDay } from '../../lib/slots';
import { useBreakpoint, WIDE_CONTENT_MAX_WIDTH } from '../../theme/breakpoints';
import { AppColors, weeklineColors } from '../../theme/palettes';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/layout';
import { scaleFont } from '../../theme/typography';

type AgendaEvent =
  | { kind: 'match'; id: string; startsAt: Date; endsAt: Date; match: MatchRow }
  | { kind: 'block'; id: string; startsAt: Date; endsAt: Date; block: PitchBlockRow }
  | {
      kind: 'academy';
      id: string;
      startsAt: Date;
      endsAt: Date;
      session: AcademySessionOccurrence;
    };

type ViewMode = 'week' | 'month' | 'list';

// The week grid only needs to cover the hours a pitch is realistically open.
// Anything outside this window still exists in the data — it just won't be
// visible on the grid, which is fine for a booking calendar (nobody plays at
// 3am) and keeps the grid a fixed, predictable height.
const HOURS_START = 8;
const HOURS_END = 23;
const HOURS = Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i);
const HOUR_ROW_HEIGHT = 52;
const WEEK_GRID_HEIGHT = HOURS.length * HOUR_ROW_HEIGHT;
const PITCH_COLORS = ['#75C8EE', '#77D7BA', '#E9B46C', '#DDA0C8', '#B5A7EF', '#E59A86'];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = (day + 6) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

function startOfCalendarGrid(monthStart: Date) {
  const day = monthStart.getDay();
  const mondayOffset = (day + 6) % 7;
  const start = new Date(monthStart);
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hourFraction(date: Date) {
  return date.getHours() + date.getMinutes() / 60;
}

function formatHourLabel(hour: number) {
  return `${hour.toString().padStart(2, '0')}:00`;
}

function eventStatusMeta(
  event: AgendaEvent,
  colors: AppColors,
  t: (path: string) => string
) {
  if (event.kind === 'block') {
    // Pink, so a party reads as neither a match nor an ordinary booking.
    if (event.block.block_type === 'party') {
      return {
        label: event.block.reference || t('agenda.partyDefault'),
        color: colors.pink,
        background: colors.pinkSoft,
      };
    }

    if (event.block.block_type === 'external_booking') {
      return { label: t('agenda.externalBookingDefault'), color: colors.blueLight, background: colors.blueSoft };
    }
    return { label: event.block.reason || t('agenda.blockedDefault'), color: colors.greyDark, background: colors.neutralSoft };
  }

  if (event.kind === 'academy') {
    return {
      label: event.session.title,
      color: colors.neonLight,
      background: colors.neonSoft,
    };
  }

  const statusMeta: Record<MatchStatus, { label: string; color: string; background: string }> = {
    open: { label: t('agenda.statusPendingConfirmation'), color: colors.orange, background: colors.orangeSoft },
    almost_full: { label: t('agenda.statusPendingConfirmation'), color: colors.orange, background: colors.orangeSoft },
    fully_paid: { label: t('agenda.statusPendingConfirmation'), color: colors.orange, background: colors.orangeSoft },
    confirmed: { label: t('agenda.statusConfirmedPaid'), color: colors.greenLight, background: colors.greenSoft },
    completed: { label: t('agenda.statusCompleted'), color: colors.blueLight, background: colors.blueSoft },
    cancelled: { label: t('agenda.statusCancelled'), color: colors.greyDark, background: colors.neutralSoft },
  };

  return statusMeta[event.match.status];
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function AgendaScreen() {
  const { colors: appColors } = useAppTheme();
  const { activePitch, pitches, setActivePitchId, pitchOwner } = useAuth();
  const router = useRouter();
  const { isDesktop } = useBreakpoint();
  const { height: windowHeight } = useWindowDimensions();
  const { t, tList } = useTranslation();
  const WEEKDAY_LABELS = tList('agenda.weekdays');
  const MONTH_LABELS = tList('agenda.months');

  const [viewMode, setViewMode] = useState<ViewMode>(() => isDesktop ? 'week' : 'month');
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [pitchMenuOpen, setPitchMenuOpen] = useState(false);
  const isDesktopWeek = Platform.OS === 'web' && isDesktop && viewMode === 'week';
  const colors = Platform.OS === 'web' && isDesktop ? weeklineColors : appColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Fifteen hours remain visible at once, even on a short laptop screen.
  const desktopHourHeight = Math.max(24, Math.min(36, Math.floor((windowHeight - 270) / HOURS.length)));
  const desktopGridHeight = HOURS.length * desktopHourHeight;

  const loadMonth = useCallback(async () => {
    if (!activePitch) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const rangeStart = startOfCalendarGrid(visibleMonth);
      const rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeEnd.getDate() + 42);

      const { matches, blocks, academySessions } = await fetchAgendaRange(
        activePitch.id,
        rangeStart,
        rangeEnd
      );

      // A cancelled match frees up its slot everywhere else (the User App's
      // booking list drops it, and get_pitch_busy_ranges stops counting it as
      // busy) — the calendar should match that instead of still showing a
      // "Cancelled" card and lighting up that day's dot forever.
      const activeMatches = matches.filter((match) => match.status !== 'cancelled');

      const matchEvents: AgendaEvent[] = activeMatches.map((match) => ({
        kind: 'match',
        id: match.id,
        startsAt: new Date(match.starts_at),
        endsAt: new Date(match.ends_at),
        match,
      }));

      const blockEvents: AgendaEvent[] = blocks.map((block) => ({
        kind: 'block',
        id: block.id,
        startsAt: new Date(block.start_time),
        endsAt: new Date(block.end_time),
        block,
      }));

      // A cancelled session frees its slot in get_pitch_busy_ranges, so the
      // calendar drops it too rather than showing a dead entry.
      const academyEvents: AgendaEvent[] = academySessions
        .filter((session) => !session.is_cancelled)
        .map((session) => ({
          kind: 'academy' as const,
          // A weekly session is one row, so its occurrences share an id —
          // the start time makes each one distinct for React's keys.
          id: `${session.id}:${session.starts_at}`,
          startsAt: new Date(session.starts_at),
          endsAt: new Date(session.ends_at),
          session,
        }));

      setEvents([...matchEvents, ...blockEvents, ...academyEvents]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('agenda.couldNotLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [activePitch, visibleMonth]);

  useFocusEffect(
    useCallback(() => {
      loadMonth();
    }, [loadMonth])
  );

  const gridStart = startOfCalendarGrid(visibleMonth);
  const gridDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      const day = new Date(gridStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [gridStart]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [weekStart]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    events.forEach((event) => {
      const key = event.startsAt.toDateString();
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    });
    map.forEach((list) => list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()));
    return map;
  }, [events]);

  const selectedDayEvents = eventsByDay.get(selectedDate.toDateString()) ?? [];

  // Nothing can be booked or blocked in the past, so the actions are disabled
  // rather than letting the owner fill in a form that would be refused.
  const selectedDayIsPast = isPastDay(selectedDate);

  // A quick at-a-glance summary of the visible month, built entirely from the
  // events already loaded for the calendar grid — no extra query needed.
  const monthStats = useMemo(() => {
    let confirmedMatches = 0;
    let externalBookings = 0;
    let unavailable = 0;

    events.forEach((event) => {
      if (
        event.startsAt.getMonth() !== visibleMonth.getMonth() ||
        event.startsAt.getFullYear() !== visibleMonth.getFullYear()
      ) {
        return;
      }

      if (event.kind === 'match') {
        confirmedMatches += 1;
      } else if (event.kind === 'academy') {
        // An academy training or match occupies the pitch just as a block does.
        unavailable += 1;
      } else if (event.block.block_type === 'external_booking') {
        externalBookings += 1;
      } else {
        unavailable += 1;
      }
    });

    return {
      confirmedMatches,
      externalBookings,
      unavailable,
      total: confirmedMatches + externalBookings + unavailable,
    };
  }, [events, visibleMonth]);

  // The month grid always loads a fixed 42-day (6-week) window. A week the
  // owner browses to in Week view can fall outside that window (e.g. flipping
  // several weeks ahead) — this checks for that so navigation can pull in a
  // fresh month of data instead of silently showing an empty week.
  function isWeekWithinLoadedRange(start: Date) {
    const loadedStart = startOfCalendarGrid(visibleMonth);
    const loadedEnd = new Date(loadedStart);
    loadedEnd.setDate(loadedEnd.getDate() + 42);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return start >= loadedStart && end < loadedEnd;
  }

  function ensureMonthLoadedFor(weekStartDate: Date) {
    if (isWeekWithinLoadedRange(weekStartDate)) return;
    // Thursday of the week reliably falls in "the month this week belongs
    // to" even for a week that spans a month boundary.
    const pivot = new Date(weekStartDate);
    pivot.setDate(pivot.getDate() + 3);
    setVisibleMonth(startOfMonth(pivot));
  }

  function goToPreviousMonth() {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  function goToPreviousWeek() {
    const next = new Date(weekStart);
    next.setDate(next.getDate() - 7);
    ensureMonthLoadedFor(next);
    setWeekStart(next);
  }

  function goToNextWeek() {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    ensureMonthLoadedFor(next);
    setWeekStart(next);
  }

  function goToPrevious() {
    if (viewMode === 'week') goToPreviousWeek();
    else goToPreviousMonth();
  }

  function goToNext() {
    if (viewMode === 'week') goToNextWeek();
    else goToNextMonth();
  }

  function selectViewMode(mode: ViewMode) {
    if (mode === 'week') {
      const newWeekStart = startOfWeek(selectedDate);
      ensureMonthLoadedFor(newWeekStart);
      setWeekStart(newWeekStart);
    }
    setViewMode(mode);
  }

  function currentRangeLabel() {
    if (viewMode !== 'week') {
      return `${MONTH_LABELS[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;
    }
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    if (weekStart.getMonth() === end.getMonth()) {
      return `${weekStart.getDate()} – ${end.getDate()} ${MONTH_LABELS[weekStart.getMonth()]} ${end.getFullYear()}`;
    }
    return `${weekStart.getDate()} ${MONTH_LABELS[weekStart.getMonth()]} – ${end.getDate()} ${MONTH_LABELS[end.getMonth()]} ${end.getFullYear()}`;
  }

  function openAddParty() {
    if (!activePitch) return;
    router.push({
      pathname: '/add-external-booking',
      params: {
        pitchId: activePitch.id,
        date: selectedDate.toISOString(),
        kind: 'party',
      },
    });
  }

  function openAddExternalBooking() {
    if (!activePitch) return;
    router.push({
      pathname: '/add-external-booking',
      params: { pitchId: activePitch.id, date: selectedDate.toISOString() },
    });
  }

  function openBlockSlot() {
    if (!activePitch) return;
    router.push({
      pathname: '/block-slot',
      params: { pitchId: activePitch.id, date: selectedDate.toISOString() },
    });
  }

  function openEventDetails(event: AgendaEvent) {
    if (event.kind === 'match') {
      router.push({ pathname: '/booking-details', params: { matchId: event.match.id } });
      return;
    }

    // Academy sessions are edited in the Academy tab, not here — this screen
    // only manages pitch_blocks rows.
    if (event.kind === 'academy') return;

    // External bookings and blocked slots are both pitch_blocks rows, and both
    // are managed (moved, edited, deleted) on the same screen.
    router.push({ pathname: '/manage-block', params: { blockId: event.block.id } });
  }

  // Shared between the day panel and List view so both render bookings
  // identically instead of maintaining two copies of the same card markup.
  function renderEventCard(event: AgendaEvent) {
    const meta = eventStatusMeta(event, colors, t);
    const showPlayers = event.kind === 'match';

    return (
      <AnimatedPressable
        key={event.id}
        style={[styles.eventCard, { borderLeftColor: meta.color }]}
        onPress={() => openEventDetails(event)}
      >
        <View style={styles.eventTimeRow}>
          <Text style={styles.eventTime}>
            {formatTime(event.startsAt)} – {formatTime(event.endsAt)}
          </Text>
          <View style={styles.eventTrailing}>
            <View style={[styles.eventBadge, { backgroundColor: meta.background }]}>
              <Text style={[styles.eventBadgeText, { color: meta.color }]}>
                {meta.label}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.greyDark} />
          </View>
        </View>

        {showPlayers && event.kind === 'match' ? (
          <Text style={styles.eventDetail}>
            {t('agenda.playersLabel', {
              paid: event.match.players_paid_count,
              required: event.match.players_required,
            })}
            {event.match.gender_category !== 'mixed'
              ? ` · ${
                  event.match.gender_category === 'male'
                    ? t('agenda.genderMenOnly')
                    : t('agenda.genderWomenOnly')
                }`
              : ''}
          </Text>
        ) : event.kind === 'block' ? (
          <Text style={styles.eventDetail}>
            {event.block.block_type === 'external_booking'
              ? event.block.reference || t('agenda.externalBookingDefault')
              : event.block.reason || t('agenda.blockedDefault')}
            {event.block.recurrence_group_id ? t('agenda.repeatsWeekly') : ''}
          </Text>
        ) : null}
      </AnimatedPressable>
    );
  }

  const listGroups = useMemo(() => {
    return gridDays
      .filter((day) => day.getMonth() === visibleMonth.getMonth())
      .map((day) => ({ day, dayEvents: eventsByDay.get(day.toDateString()) ?? [] }))
      .filter((entry) => entry.dayEvents.length > 0);
  }, [gridDays, eventsByDay, visibleMonth]);

  if (!activePitch) {
    return (
      <Screen>
        <AppHeader title={t('agenda.title')} showBack={false} />
        <Text style={styles.emptyText}>{t('agenda.noPitchLinked')}</Text>
      </Screen>
    );
  }

  return (
    <Screen
      scroll={!isDesktopWeek}
      style={Platform.OS === 'web' && isDesktop ? { backgroundColor: colors.background } : undefined}
      contentStyle={[styles.screenContent, isDesktopWeek && styles.weeklineScreen]}
      maxWidth={WIDE_CONTENT_MAX_WIDTH}
    >
      <View style={isDesktopWeek ? styles.weeklineTop : undefined}>
        {isDesktopWeek ? (
          <View>
            <Text style={styles.weeklinePageTitle}>{t('agenda.title')}</Text>
            <Text style={styles.weeklinePageSubtitle}>{t('agenda.subtitle')}</Text>
          </View>
        ) : (
          <AppHeader title={t('agenda.title')} subtitle={t('agenda.subtitle')} showBack={false} />
        )}

      <View style={[styles.actionsRow, isDesktopWeek && styles.weeklineActions]}>
        <Pressable
          style={[styles.actionButtonOutline, isDesktopWeek && styles.weeklineActionButton, selectedDayIsPast && styles.actionDisabled]}
          onPress={openBlockSlot}
          disabled={selectedDayIsPast}
        >
          {!isDesktopWeek && <Ionicons name="lock-closed-outline" size={16} color={colors.white} />}
          <Text style={[styles.actionButtonOutlineText, isDesktopWeek && styles.weeklineActionText]} numberOfLines={1}>{t('agenda.blockSlot')}</Text>
        </Pressable>

        {/* A party takes the pitch for an evening rather than a playing
            slot, so it gets its own button and its own time selection. */}
        <Pressable
          style={[styles.actionButtonOutline, isDesktopWeek && styles.weeklineActionButton, selectedDayIsPast && styles.actionDisabled]}
          onPress={openAddParty}
          disabled={selectedDayIsPast}
        >
          {!isDesktopWeek && <Ionicons name="balloon-outline" size={16} color={colors.pink} />}
          <Text style={[styles.actionButtonOutlineText, isDesktopWeek && styles.weeklineActionText]} numberOfLines={1}>{t('agenda.addParty')}</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButtonPrimary, isDesktopWeek && styles.weeklineActionButton, isDesktopWeek && styles.weeklinePrimaryButton, selectedDayIsPast && styles.actionDisabled]}
          onPress={openAddExternalBooking}
          disabled={selectedDayIsPast}
        >
          <Ionicons name="add" size={isDesktopWeek ? 15 : 18} color={colors.blackText} />
          <Text style={[styles.actionButtonPrimaryText, isDesktopWeek && styles.weeklinePrimaryText]} numberOfLines={1}>{t('agenda.addExternalBooking')}</Text>
        </Pressable>
      </View>
      </View>

      {selectedDayIsPast ? (
        <Text style={styles.pastHint}>{t('agenda.pastHint')}</Text>
      ) : null}

      <View style={[styles.toolbarRow, isDesktopWeek && styles.weeklineToolbar]}>
        <View style={[styles.pitchSelectorInline, isDesktopWeek && styles.weeklinePitchSelector]}>
          {isDesktopWeek ? (
            <View style={styles.pitchDropdown}>
              <Pressable
                style={styles.pitchDropdownTrigger}
                onPress={() => setPitchMenuOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityLabel={t('agenda.choosePitch')}
                accessibilityState={{ expanded: pitchMenuOpen }}
              >
                <View style={[styles.pitchColorDot, { backgroundColor: PITCH_COLORS[Math.max(0, pitches.findIndex((pitch) => pitch.id === activePitch.id)) % PITCH_COLORS.length] }]} />
                <Text style={styles.pitchDropdownText} numberOfLines={1}>{activePitch.name}</Text>
                <Ionicons name={pitchMenuOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.grey} />
              </Pressable>
              {pitchMenuOpen && (
                <View style={styles.pitchDropdownMenu}>
                  {pitches.map((pitch, index) => (
                    <Pressable
                      key={pitch.id}
                      style={[styles.pitchDropdownOption, pitch.id === activePitch.id && styles.pitchDropdownOptionActive]}
                      onPress={() => { setActivePitchId(pitch.id); setPitchMenuOpen(false); }}
                      accessibilityRole="menuitem"
                    >
                      <View style={[styles.pitchColorDot, { backgroundColor: PITCH_COLORS[index % PITCH_COLORS.length] }]} />
                      <Text style={styles.pitchDropdownText} numberOfLines={1}>{pitch.name}</Text>
                      {pitch.id === activePitch.id && <Ionicons name="checkmark" size={15} color={colors.greenLight} />}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : pitches.length > 1 ? (
            pitches.map((pitch) => {
              const isActive = pitch.id === activePitch?.id;
              return (
                <AnimatedPressable
                  key={pitch.id}
                  style={[styles.pitchChip, isDesktopWeek && styles.weeklinePitchChip, isActive && styles.pitchChipActive, isDesktopWeek && isActive && styles.weeklinePitchChipActive]}
                  onPress={() => setActivePitchId(pitch.id)}
                >
                  <Ionicons name="location" size={12} color={isActive ? colors.white : colors.grey} />
                  <Text style={[styles.pitchChipText, isDesktopWeek && styles.weeklinePitchText, isActive && styles.pitchChipTextActive]}>
                    {pitch.name}
                  </Text>
                </AnimatedPressable>
              );
            })
          ) : (
            <View style={[styles.pitchChip, isDesktopWeek && styles.weeklinePitchChip, styles.pitchChipActive, isDesktopWeek && styles.weeklinePitchChipActive]}>
              <Ionicons name="location" size={12} color={colors.white} />
              <Text style={[styles.pitchChipText, isDesktopWeek && styles.weeklinePitchText, styles.pitchChipTextActive]}>{activePitch.name}</Text>
            </View>
          )}
        </View>

        <View style={[styles.viewToggleRow, isDesktopWeek && styles.weeklineToggleRow]}>
          {(['week', 'month', 'list'] as ViewMode[]).map((mode) => {
            const isActive = viewMode === mode;
            const label =
              mode === 'week' ? t('agenda.viewWeek') : mode === 'month' ? t('agenda.viewMonth') : t('agenda.viewList');
            return (
              <AnimatedSelectable
                key={mode}
                active={isActive}
                style={[styles.viewToggleButton, isDesktopWeek && styles.weeklineToggleButton]}
                background={['transparent', isDesktopWeek ? colors.greenSoft : colors.blue]}
                onPress={() => selectViewMode(mode)}
              >
                {(progress) => (
                  <Animated.Text
                    style={[
                      styles.viewToggleText,
                      isDesktopWeek && styles.weeklineToggleText,
                      {
                        color: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [colors.grey, isDesktopWeek ? colors.greenLight : colors.white],
                        }),
                      },
                    ]}
                  >
                    {label}
                  </Animated.Text>
                )}
              </AnimatedSelectable>
            );
          })}
        </View>
      </View>

      {isDesktopWeek ? (
        <View style={styles.weeklineLayout}>
          <View style={styles.weeklineBoard}>
            <View style={styles.weeklineBoardTitle}>
              <View>
                <Text style={styles.weeklineEyebrow}>{t('agenda.viewWeek')}</Text>
                <Text style={styles.weeklineRange}>{currentRangeLabel()}</Text>
              </View>
              <View style={styles.weeklineNav}>
                <AnimatedPressable style={styles.weeklineNavButton} onPress={goToPrevious}>
                  <Ionicons name="chevron-back" size={16} color={colors.grey} />
                </AnimatedPressable>
                <AnimatedPressable style={styles.weeklineNavButton} onPress={goToNext}>
                  <Ionicons name="chevron-forward" size={16} color={colors.grey} />
                </AnimatedPressable>
              </View>
            </View>

            <View style={styles.weeklineDayHead}>
              <View style={styles.weeklineTimeGutter} />
              {weekDays.map((day) => {
                const isSelected = isSameDay(day, selectedDate);
                return (
                  <AnimatedPressable
                    key={day.toISOString()}
                    style={[styles.weeklineDayHeading, isSelected && styles.weeklineDayHeadingSelected]}
                    onPress={() => setSelectedDate(day)}
                  >
                    <Text style={styles.weeklineDayName}>{WEEKDAY_LABELS[(day.getDay() + 6) % 7]}</Text>
                    <Text style={[styles.weeklineDayDate, isSelected && styles.weeklineDayDateSelected]}>
                      {day.getDate()}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            <View style={styles.weeklineGrid}>
              <View style={[styles.weeklineTimeGutter, { height: desktopGridHeight }]}>
                {HOURS.map((hour, index) => (
                  <Text key={hour} style={[styles.weeklineHour, { top: index * desktopHourHeight + 3 }]}>
                    {formatHourLabel(hour)}
                  </Text>
                ))}
              </View>
              {weekDays.map((day) => (
                <View
                  key={day.toISOString()}
                  style={[
                    styles.weeklineDayColumn,
                    isSameDay(day, selectedDate) && styles.weeklineDayColumnSelected,
                    { height: desktopGridHeight },
                  ]}
                >
                  {HOURS.map((hour, index) => (
                    <View key={hour} style={[styles.weeklineHourRule, { top: index * desktopHourHeight }]} />
                  ))}
                  {(eventsByDay.get(day.toDateString()) ?? []).map((event) => {
                    const meta = eventStatusMeta(event, colors, t);
                    const top = clamp((hourFraction(event.startsAt) - HOURS_START) * desktopHourHeight, 0, desktopGridHeight);
                    const bottom = clamp((hourFraction(event.endsAt) - HOURS_START) * desktopHourHeight, 0, desktopGridHeight);
                    if (bottom <= top) return null;
                    return (
                      <AnimatedPressable
                        key={event.id}
                        style={[
                          styles.weeklineEvent,
                          { top, height: Math.max(bottom - top, 20), backgroundColor: meta.background, borderLeftColor: meta.color },
                        ]}
                        onPress={() => openEventDetails(event)}
                      >
                        <Text style={[styles.weeklineEventTime, { color: meta.color }]} numberOfLines={1}>
                          {formatTime(event.startsAt)}
                        </Text>
                        <Text style={styles.weeklineEventLabel} numberOfLines={1}>{meta.label}</Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              ))}
            </View>
            {isLoading ? <ActivityIndicator style={styles.weeklineLoading} color={colors.greenLight} /> : null}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>

          <View style={styles.weeklineSide}>
            <View style={styles.weeklineDayCard}>
              <Text style={styles.weeklineEyebrow}>{t('agenda.selectedDay')}</Text>
              <Text style={styles.weeklineSelectedNumber}>{selectedDate.getDate()}</Text>
              <Text style={styles.weeklineSelectedLabel}>
                {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long' })}
              </Text>
              <ScrollView style={styles.weeklineEvents} showsVerticalScrollIndicator={false}>
                {selectedDayEvents.length === 0 ? (
                  <Text style={styles.emptyDayText}>{t('agenda.nothingScheduled')}</Text>
                ) : selectedDayEvents.map((event) => {
                  const meta = eventStatusMeta(event, colors, t);
                  return (
                    <AnimatedPressable
                      key={event.id}
                      style={styles.weeklineEventRow}
                      onPress={() => openEventDetails(event)}
                    >
                      <View style={[styles.weeklineEventMark, { backgroundColor: meta.color }]} />
                      <View style={styles.weeklineEventRowText}>
                        <Text style={styles.weeklineRowTime}>{formatTime(event.startsAt)} – {formatTime(event.endsAt)}</Text>
                        <Text style={styles.weeklineRowLabel} numberOfLines={1}>{meta.label}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={13} color={colors.greyDark} />
                    </AnimatedPressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.weeklineStatsCard}>
              <Text style={styles.weeklineEyebrow}>{t('agenda.statsThisMonth')}</Text>
              <View style={styles.weeklineStatsRow}>
                {[
                  { count: monthStats.confirmedMatches, label: t('agenda.statsConfirmedMatches') },
                  { count: monthStats.externalBookings, label: t('agenda.statsExternalBookings') },
                  { count: monthStats.unavailable, label: t('agenda.statsUnavailable') },
                ].map((stat) => (
                  <View key={stat.label} style={styles.weeklineStat}>
                    <Text style={styles.weeklineStatCount}>{stat.count}</Text>
                    <Text style={styles.weeklineStatLabel} numberOfLines={2}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      ) : (
      <View style={isDesktop ? styles.desktopColumns : undefined}>
        <View style={isDesktop ? styles.calendarColumn : undefined}>
      <View style={styles.monthNav}>
        <AnimatedPressable style={styles.monthNavButton} onPress={goToPrevious}>
          <Ionicons name="chevron-back" size={18} color={colors.white} />
        </AnimatedPressable>

        <Text style={styles.monthLabel}>{currentRangeLabel()}</Text>

        <AnimatedPressable style={styles.monthNavButton} onPress={goToNext}>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </AnimatedPressable>
      </View>

      <AnimatedSwap swapKey={isLoading ? 'loading' : viewMode}>
      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.greenLight} />
        </View>
      ) : viewMode === 'month' ? (
        <>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {gridDays.map((day) => {
              const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
              const inMonth = day.getMonth() === visibleMonth.getMonth();
              const isSelected = isSameDay(day, selectedDate);

              return (
                <AnimatedSelectable
                  key={day.toISOString()}
                  active={isSelected}
                  style={[styles.dayCell, !inMonth && styles.dayCellOutside]}
                  background={['transparent', colors.greenSoft]}
                  borderColor={['transparent', colors.borderGreen]}
                  onPress={() => setSelectedDate(day)}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      !inMonth && styles.dayNumberOutside,
                      isSelected && styles.dayNumberSelected,
                    ]}
                  >
                    {day.getDate()}
                  </Text>

                  <View style={styles.dayDots}>
                    {dayEvents.slice(0, 3).map((event) => {
                      const meta = eventStatusMeta(event, colors, t);
                      return (
                        <View
                          key={event.id}
                          style={[styles.dayDot, { backgroundColor: meta.color }]}
                        />
                      );
                    })}
                  </View>
                </AnimatedSelectable>
              );
            })}
          </View>
        </>
      ) : viewMode === 'week' ? (
        <View style={styles.weekWrap}>
          <View style={styles.weekHeaderRow}>
            <View style={styles.weekGutterHeader} />
            {weekDays.map((day) => {
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selectedDate);
              return (
                <AnimatedPressable
                  key={day.toISOString()}
                  style={styles.weekHeaderCell}
                  onPress={() => setSelectedDate(day)}
                >
                  <Text style={styles.weekHeaderDayLabel}>{WEEKDAY_LABELS[(day.getDay() + 6) % 7]}</Text>
                  <Text
                    style={[
                      styles.weekHeaderDateLabel,
                      isToday && styles.weekHeaderDateToday,
                      isSelected && styles.weekHeaderDateSelected,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>

          <ScrollView style={styles.weekScroll} nestedScrollEnabled>
            <View style={styles.weekBodyRow}>
              <View style={styles.weekGutter}>
                {HOURS.map((hour) => (
                  <View key={hour} style={styles.weekHourLabelWrap}>
                    <Text style={styles.weekHourLabel}>{formatHourLabel(hour)}</Text>
                  </View>
                ))}
              </View>

              {weekDays.map((day) => {
                const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
                return (
                  <View key={day.toISOString()} style={[styles.weekDayColumn, { height: WEEK_GRID_HEIGHT }]}>
                    {HOURS.map((hour, index) => (
                      <View
                        key={hour}
                        style={[styles.weekHourLine, { top: index * HOUR_ROW_HEIGHT }]}
                      />
                    ))}

                    {dayEvents.map((event) => {
                      const meta = eventStatusMeta(event, colors, t);
                      const top = clamp(
                        (hourFraction(event.startsAt) - HOURS_START) * HOUR_ROW_HEIGHT,
                        0,
                        WEEK_GRID_HEIGHT
                      );
                      const bottom = clamp(
                        (hourFraction(event.endsAt) - HOURS_START) * HOUR_ROW_HEIGHT,
                        0,
                        WEEK_GRID_HEIGHT
                      );
                      const height = Math.max(bottom - top, 22);

                      return (
                        <AnimatedPressable
                          key={event.id}
                          style={[
                            styles.weekEventBlock,
                            {
                              top,
                              height,
                              backgroundColor: meta.background,
                              borderLeftColor: meta.color,
                            },
                          ]}
                          onPress={() => openEventDetails(event)}
                        >
                          <Text style={[styles.weekEventTime, { color: meta.color }]} numberOfLines={1}>
                            {formatTime(event.startsAt)}
                          </Text>
                          <Text style={styles.weekEventLabel} numberOfLines={1}>
                            {meta.label}
                          </Text>
                        </AnimatedPressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={styles.listWrap}>
          {listGroups.length === 0 ? (
            <Text style={styles.emptyDayText}>{t('agenda.noEventsThisMonth')}</Text>
          ) : (
            listGroups.map(({ day, dayEvents }) => (
              <View key={day.toISOString()}>
                <Text style={styles.listDayHeader}>
                  {day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                {dayEvents.map((event) => renderEventCard(event))}
              </View>
            ))
          )}
        </View>
      )}
      </AnimatedSwap>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        </View>

        <View style={isDesktop ? styles.panelColumn : undefined}>
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>{t('agenda.statsThisMonth')}</Text>

        <View style={styles.statsRow}>
          <View style={[styles.statsDot, { backgroundColor: colors.greenLight }]} />
          <Text style={styles.statsLabel}>{t('agenda.statsConfirmedMatches')}</Text>
          <Text style={styles.statsCount}>{monthStats.confirmedMatches}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statsDot, { backgroundColor: colors.blueLight }]} />
          <Text style={styles.statsLabel}>{t('agenda.statsExternalBookings')}</Text>
          <Text style={styles.statsCount}>{monthStats.externalBookings}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statsDot, { backgroundColor: colors.greyDark }]} />
          <Text style={styles.statsLabel}>{t('agenda.statsUnavailable')}</Text>
          <Text style={styles.statsCount}>{monthStats.unavailable}</Text>
        </View>

        <View style={styles.statsDivider} />

        <View style={styles.statsTotalRow}>
          <Text style={styles.statsTotalLabel}>{t('agenda.statsTotalReservations')}</Text>
          <Text style={styles.statsTotalCount}>{monthStats.total}</Text>
        </View>
      </View>

      <AnimatedSwap
        swapKey={selectedDate.toDateString()}
        style={[styles.dayPanel, isDesktop && styles.dayPanelDesktop]}
      >
        <Text style={styles.dayPanelTitle}>
          {selectedDate.toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
        <Text style={styles.dayPanelSubtitle}>
          {selectedDayEvents.length === 1
            ? t('agenda.bookingsCountOne', { count: selectedDayEvents.length })
            : t('agenda.bookingsCountOther', { count: selectedDayEvents.length })}
        </Text>

        {selectedDayEvents.length === 0 ? (
          <Text style={styles.emptyDayText}>{t('agenda.nothingScheduled')}</Text>
        ) : (
          selectedDayEvents.map((event) => renderEventCard(event))
        )}
      </AnimatedSwap>

      <View style={styles.ownerCard}>
        {pitchOwner?.logo_url ? (
          <Image source={{ uri: pitchOwner.logo_url }} style={styles.ownerAvatar} resizeMode="cover" />
        ) : (
          <View style={[styles.ownerAvatar, styles.ownerAvatarPlaceholder]}>
            <Ionicons name="business" size={28} color={colors.greenLight} />
          </View>
        )}
        {pitchOwner?.business_name ? (
          <Text style={styles.ownerName} numberOfLines={1}>
            {pitchOwner.business_name}
          </Text>
        ) : null}
      </View>
        </View>
      </View>
      )}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    screenContent: {
      paddingTop: 4,
    },
    weeklineScreen: {
      paddingTop: 18,
      paddingBottom: 14,
      backgroundColor: colors.background,
    },
    weeklineTop: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 12,
    },
    weeklinePageTitle: {
      color: colors.white,
      fontSize: 22,
      fontWeight: '600',
      letterSpacing: -0.6,
    },
    weeklinePageSubtitle: {
      color: colors.grey,
      fontSize: 11,
      marginTop: 3,
    },
    weeklineActions: {
      marginBottom: 0,
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
    },
    weeklineActionButton: {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
      height: 31,
      paddingHorizontal: 11,
      paddingVertical: 0,
      borderRadius: 7,
      gap: 5,
    },
    weeklineActionText: {
      fontSize: 11,
      fontWeight: '600',
    },
    weeklinePrimaryButton: {
      backgroundColor: colors.greenLight,
      minWidth: 146,
    },
    weeklinePrimaryText: {
      fontSize: 11,
      fontWeight: '700',
    },
    weeklineToolbar: {
      marginBottom: 12,
      zIndex: 5,
    },
    weeklinePitchChip: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 7,
    },
    weeklinePitchChipActive: {
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    weeklinePitchText: {
      fontSize: 11,
      fontWeight: '600',
    },
    weeklineToggleButton: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 5,
    },
    weeklineToggleRow: {
      borderRadius: 7,
    },
    weeklineToggleText: {
      fontSize: 11,
      fontWeight: '600',
    },
    weeklineLayout: {
      flex: 1,
      minHeight: 0,
      flexDirection: 'row',
      gap: 12,
    },
    weeklineBoard: {
      flex: 1.85,
      minWidth: 0,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.card,
      overflow: 'hidden',
    },
    weeklineBoardTitle: {
      paddingHorizontal: 14,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 55,
    },
    weeklineEyebrow: {
      color: colors.greyDark,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    weeklineRange: {
      color: colors.white,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
    },
    weeklineNav: {
      flexDirection: 'row',
      gap: 5,
    },
    weeklineNavButton: {
      width: 27,
      height: 27,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weeklineDayHead: {
      flexDirection: 'row',
      height: 45,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    weeklineTimeGutter: {
      width: 48,
      position: 'relative',
    },
    weeklineDayHeading: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderLeftWidth: 1,
      borderLeftColor: colors.borderSoft,
    },
    weeklineDayHeadingSelected: {
      backgroundColor: colors.greenSoft,
    },
    weeklineDayName: {
      color: colors.greyDark,
      fontSize: 9,
      fontWeight: '600',
    },
    weeklineDayDate: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '600',
    },
    weeklineDayDateSelected: {
      color: colors.greenLight,
    },
    weeklineGrid: {
      flexDirection: 'row',
    },
    weeklineHour: {
      color: colors.greyDark,
      fontSize: 9,
      textAlign: 'right',
      paddingRight: 8,
      position: 'absolute',
      right: 0,
    },
    weeklineDayColumn: {
      flex: 1,
      minWidth: 0,
      position: 'relative',
      borderLeftWidth: 1,
      borderLeftColor: colors.borderSoft,
    },
    weeklineDayColumnSelected: {
      backgroundColor: colors.surfaceMuted,
    },
    weeklineHourRule: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: colors.borderSoft,
    },
    weeklineEvent: {
      position: 'absolute',
      left: 2,
      right: 2,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderLeftWidth: 2,
      borderRadius: 3,
      overflow: 'hidden',
    },
    weeklineEventTime: {
      fontSize: 9,
      fontWeight: '700',
    },
    weeklineEventLabel: {
      color: colors.white,
      fontSize: 9,
      fontWeight: '500',
    },
    weeklineLoading: {
      position: 'absolute',
      top: 12,
      right: 85,
    },
    weeklineSide: {
      flex: 1,
      minWidth: 235,
      gap: 12,
    },
    weeklineDayCard: {
      flex: 1,
      minHeight: 0,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.card,
    },
    weeklineSelectedNumber: {
      color: colors.white,
      fontSize: 31,
      fontWeight: '500',
      letterSpacing: -1,
      marginTop: 10,
    },
    weeklineSelectedLabel: {
      color: colors.grey,
      fontSize: 12,
      marginBottom: 14,
    },
    weeklineEvents: {
      flex: 1,
    },
    weeklineEventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    weeklineEventMark: {
      width: 3,
      height: 26,
      borderRadius: 2,
    },
    weeklineEventRowText: {
      flex: 1,
      minWidth: 0,
    },
    weeklineRowTime: {
      color: colors.white,
      fontSize: 11,
      fontWeight: '600',
    },
    weeklineRowLabel: {
      color: colors.grey,
      fontSize: 10,
      marginTop: 3,
    },
    weeklineStatsCard: {
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.card,
    },
    weeklineStatsRow: {
      flexDirection: 'row',
      marginTop: 12,
    },
    weeklineStat: {
      flex: 1,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingHorizontal: 7,
    },
    weeklineStatCount: {
      color: colors.white,
      fontSize: 17,
      fontWeight: '600',
    },
    weeklineStatLabel: {
      color: colors.grey,
      fontSize: 9,
      marginTop: 3,
    },
    desktopColumns: {
      flexDirection: 'row',
      gap: spacing.xl,
      alignItems: 'flex-start',
    },
    calendarColumn: {
      flex: 1.45,
    },
    panelColumn: {
      flex: 1,
    },
    dayPanelDesktop: {
      marginTop: 0,
    },
    emptyText: {
      color: colors.grey,
      fontSize: scaleFont(14),
      fontWeight: '600',
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    actionButtonOutline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    actionButtonOutlineText: {
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    actionButtonPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      borderRadius: radius.lg,
      backgroundColor: colors.green,
    },
    actionButtonPrimaryText: {
      color: colors.blackText,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    actionDisabled: {
      opacity: 0.4,
    },
    pastHint: {
      color: colors.orange,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginTop: -spacing.sm,
      marginBottom: spacing.md,
    },
    toolbarRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    pitchSelectorInline: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      flexShrink: 1,
    },
    weeklinePitchSelector: {
      flexWrap: 'nowrap',
      overflow: 'visible',
    },
    pitchDropdown: {
      width: 216,
      position: 'relative',
      zIndex: 6,
    },
    pitchDropdownTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 12,
      minHeight: 34,
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 8,
    },
    pitchDropdownMenu: {
      position: 'absolute',
      top: 38,
      left: 0,
      right: 0,
      padding: 4,
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 9,
      zIndex: 10,
      elevation: 10,
    },
    pitchDropdownOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      minHeight: 35,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    pitchDropdownOptionActive: {
      backgroundColor: colors.surfaceMuted,
    },
    pitchDropdownText: {
      flex: 1,
      minWidth: 0,
      color: colors.white,
      fontSize: 11,
      fontWeight: '600',
    },
    pitchColorDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    pitchChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    pitchChipActive: {
      backgroundColor: colors.blue,
      borderColor: colors.blue,
    },
    pitchChipText: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    pitchChipTextActive: {
      color: colors.white,
    },
    viewToggleRow: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 2,
    },
    viewToggleButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderRadius: radius.round,
    },
    viewToggleText: {
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    monthNavButton: {
      width: 36,
      height: 36,
      borderRadius: radius.round,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthLabel: {
      color: colors.white,
      fontSize: scaleFont(16),
      fontWeight: '900',
    },
    weekdayRow: {
      flexDirection: 'row',
      marginBottom: spacing.xs,
    },
    weekdayLabel: {
      flex: 1,
      textAlign: 'center',
      color: colors.greyDark,
      fontSize: scaleFont(10),
      fontWeight: '800',
    },
    loadingBox: {
      paddingVertical: spacing.xxl,
      alignItems: 'center',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: '14.28%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      marginBottom: 2,
      // Always present but transparent until selected, so fading the colour
      // in can't shift the grid by a pixel.
      borderWidth: 1,
      borderColor: 'transparent',
    },
    dayCellOutside: {
      opacity: 0.35,
    },
    dayNumber: {
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '700',
    },
    dayNumberOutside: {
      color: colors.greyDark,
    },
    dayNumberSelected: {
      color: colors.greenLight,
      fontWeight: '900',
    },
    dayDots: {
      flexDirection: 'row',
      gap: 2,
      marginTop: 3,
      height: 6,
    },
    dayDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    weekWrap: {
      marginBottom: spacing.sm,
    },
    weekHeaderRow: {
      flexDirection: 'row',
      marginBottom: spacing.xs,
    },
    weekGutterHeader: {
      width: 40,
    },
    weekHeaderCell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: radius.sm,
    },
    weekHeaderDayLabel: {
      color: colors.greyDark,
      fontSize: scaleFont(9),
      fontWeight: '800',
    },
    weekHeaderDateLabel: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '900',
      marginTop: 2,
    },
    weekHeaderDateToday: {
      color: colors.greenLight,
    },
    weekHeaderDateSelected: {
      color: colors.blueLight,
    },
    weekScroll: {
      maxHeight: 460,
    },
    weekBodyRow: {
      flexDirection: 'row',
    },
    weekGutter: {
      width: 40,
    },
    weekHourLabelWrap: {
      height: HOUR_ROW_HEIGHT,
      alignItems: 'flex-end',
      paddingRight: 6,
    },
    weekHourLabel: {
      color: colors.greyDark,
      fontSize: scaleFont(9),
      fontWeight: '700',
      marginTop: -6,
    },
    weekDayColumn: {
      flex: 1,
      position: 'relative',
      borderLeftWidth: 1,
      borderLeftColor: colors.borderSoft,
    },
    weekHourLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: colors.borderSoft,
    },
    weekEventBlock: {
      position: 'absolute',
      left: 2,
      right: 2,
      borderRadius: radius.sm,
      borderLeftWidth: 3,
      paddingHorizontal: 5,
      paddingVertical: 3,
      overflow: 'hidden',
    },
    weekEventTime: {
      fontSize: scaleFont(9),
      fontWeight: '900',
    },
    weekEventLabel: {
      color: colors.grey,
      fontSize: scaleFont(9),
      fontWeight: '700',
      marginTop: 1,
    },
    listWrap: {
      marginBottom: spacing.sm,
    },
    listDayHeader: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(13),
      fontWeight: '700',
      marginTop: spacing.sm,
    },
    dayPanel: {
      marginTop: spacing.lg,
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    dayPanelTitle: {
      color: colors.white,
      fontSize: scaleFont(17),
      fontWeight: '900',
    },
    dayPanelSubtitle: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginTop: 2,
      marginBottom: spacing.md,
    },
    emptyDayText: {
      color: colors.greyDark,
      fontSize: scaleFont(13),
      fontWeight: '600',
      paddingVertical: spacing.md,
    },
    eventCard: {
      borderRadius: radius.md,
      backgroundColor: colors.cardDark,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 3,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    eventTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    eventTrailing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    eventTime: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '800',
    },
    eventBadge: {
      borderRadius: radius.round,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    eventBadgeText: {
      fontSize: scaleFont(10),
      fontWeight: '900',
    },
    eventDetail: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      marginTop: 4,
    },
    statsCard: {
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    statsTitle: {
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '900',
      marginBottom: spacing.md,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    statsDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    statsLabel: {
      flex: 1,
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '600',
    },
    statsCount: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '900',
    },
    statsDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.sm,
    },
    statsTotalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statsTotalLabel: {
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '900',
    },
    statsTotalCount: {
      color: colors.greenLight,
      fontSize: scaleFont(18),
      fontWeight: '900',
    },
    ownerCard: {
      alignItems: 'center',
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.md,
    },
    ownerAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.cardDark,
    },
    ownerAvatarPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    ownerName: {
      marginTop: spacing.sm,
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '900',
      maxWidth: '100%',
    },
  });
