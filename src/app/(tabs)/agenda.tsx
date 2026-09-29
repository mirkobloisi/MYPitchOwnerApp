import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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

type ViewMode = 'week' | 'month';

// Include early and late bookings; the desktop grid scrolls within its panel.
const HOURS_START = 6;
const HOURS_END = 24;
const HOURS = Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i);
const HOUR_ROW_HEIGHT = 52;
const WEEK_GRID_HEIGHT = HOURS.length * HOUR_ROW_HEIGHT;
const NATIVE_HOUR_ROW_HEIGHT = 76;
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
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [monthStripWidth, setMonthStripWidth] = useState(0);
  const [nativeMenuOpen, setNativeMenuOpen] = useState(false);
  const monthStripRef = useRef<ScrollView>(null);
  const nativeTimelineRef = useRef<ScrollView>(null);
  const isDesktopWeek = Platform.OS === 'web' && isDesktop && viewMode === 'week';
  const isDesktopMonth = Platform.OS === 'web' && isDesktop && viewMode === 'month';
  const isDesktopAgenda = isDesktopWeek || isDesktopMonth;
  const isNativeMobile = Platform.OS !== 'web';
  const isWeeklineStyle = isDesktopAgenda || isNativeMobile;
  const colors = isWeeklineStyle ? weeklineColors : appColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const desktopHourHeight = 56;
  const desktopGridHeight = HOURS.length * desktopHourHeight;
  const monthDayCount = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const mobileMonthDays = useMemo(
    () => Array.from({ length: monthDayCount }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1)),
    [monthDayCount, visibleMonth]
  );

  useEffect(() => {
    if (!monthStripWidth) return;
    const selectedIndex = selectedDate.getDate() - 1;
    const itemWidth = 48;
    monthStripRef.current?.scrollTo({
      x: Math.max(0, selectedIndex * itemWidth - (monthStripWidth - itemWidth) / 2),
      animated: false,
    });
  }, [monthStripWidth, selectedDate, visibleMonth]);

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
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    setVisibleMonth(next);
    setSelectedDate(next);
  }

  function goToNextMonth() {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    setVisibleMonth(next);
    setSelectedDate(next);
  }

  function selectMobileMonth(monthIndex: number, year = visibleMonth.getFullYear()) {
    const day = Math.min(selectedDate.getDate(), new Date(year, monthIndex + 1, 0).getDate());
    const next = new Date(year, monthIndex, day);
    setVisibleMonth(startOfMonth(next));
    setSelectedDate(next);
    setMonthMenuOpen(false);
  }

  function changeMonthMenuYear(amount: number) {
    const nextYear = visibleMonth.getFullYear() + amount;
    selectMobileMonth(visibleMonth.getMonth(), nextYear);
    setMonthMenuOpen(true);
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
    } else {
      setVisibleMonth(startOfMonth(selectedDate));
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
    if (!activePitch || selectedDayIsPast) return;
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
    if (!activePitch || selectedDayIsPast) return;
    router.push({
      pathname: '/add-external-booking',
      params: { pitchId: activePitch.id, date: selectedDate.toISOString() },
    });
  }

  function openBlockSlot() {
    if (!activePitch || selectedDayIsPast) return;
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
        style={[styles.eventCard, isNativeMobile && styles.nativeWeeklineEventCard, { borderLeftColor: meta.color }]}
        onPress={() => openEventDetails(event)}
      >
        <View style={styles.eventTimeRow}>
          <Text style={[styles.eventTime, isNativeMobile && styles.nativeWeeklineEventTime]}>
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
          <Text style={[styles.eventDetail, isNativeMobile && styles.nativeWeeklineEventDetail]}>
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

  function renderWeeklineSide() {
    return (
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
    );
  }

  if (isNativeMobile) {
    const nativeTimelineHeight = HOURS.length * NATIVE_HOUR_ROW_HEIGHT;
    const nativeGaps: { start: Date; end: Date }[] = [];
    for (let index = 0; index < selectedDayEvents.length - 1; index += 1) {
      const current = selectedDayEvents[index];
      const next = selectedDayEvents[index + 1];
      if (next.startsAt.getTime() - current.endsAt.getTime() >= 45 * 60 * 1000) {
        nativeGaps.push({ start: current.endsAt, end: next.startsAt });
      }
    }

    return (
      <Screen
        scroll={false}
        ambientGlows={false}
        background={<Image source={require('../../../assets/images/weekline-soft-halo.png')} style={styles.weeklineBackground} resizeMode="stretch" />}
        style={{ backgroundColor: weeklineColors.background }}
        contentStyle={styles.nativeAgendaScreen}
      >
        <View style={styles.nativeAgendaRoot}>
          <AppHeader
            title={t('agenda.title')}
            showBack={false}
            colorsOverride={weeklineColors}
            refined
            brandLogo
            showMenu
            onMenuPress={() => setNativeMenuOpen((open) => !open)}
          />

          {nativeMenuOpen ? (
            <>
              <Pressable style={styles.nativeMenuBackdrop} onPress={() => setNativeMenuOpen(false)} />
              <View style={[styles.nativeQuickMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { href: '/pitches', label: t('nav.pitches'), icon: 'football-outline' as const },
                  { href: '/stats', label: t('nav.stats'), icon: 'bar-chart-outline' as const },
                  { href: '/transactions', label: t('nav.transactions'), icon: 'card-outline' as const },
                  { href: '/profile', label: t('nav.profile'), icon: 'person-circle-outline' as const },
                ].map((item) => (
                  <Pressable
                    key={item.href}
                    style={styles.nativeQuickMenuItem}
                    onPress={() => { setNativeMenuOpen(false); router.navigate(item.href as any); }}
                  >
                    <Ionicons name={item.icon} size={18} color={colors.greyDark} />
                    <Text style={styles.nativeQuickMenuText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {!activePitch ? (
            <View style={styles.nativeEmptyState}>
              <Text style={styles.emptyText}>{t('agenda.noPitchLinked')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.nativeAgendaTitleRow}>
                <Text style={styles.nativeAgendaTitle}>{t('agenda.title')}</Text>
                <View style={styles.mobileMonthPickerWrap}>
                  <Pressable
                    style={styles.nativeMonthTrigger}
                    onPress={() => setMonthMenuOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel={`${MONTH_LABELS[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`}
                    accessibilityState={{ expanded: monthMenuOpen }}
                  >
                    <Text style={styles.nativeMonthTriggerText}>
                      {MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
                    </Text>
                    <Ionicons name={monthMenuOpen ? 'chevron-up' : 'chevron-down'} size={15} color={colors.greenLight} />
                  </Pressable>
                  {monthMenuOpen ? (
                    <View style={[styles.mobileMonthMenu, styles.nativeMonthMenu]}>
                      <View style={styles.mobileMonthMenuYearRow}>
                        <Pressable style={styles.mobileMonthYearButton} onPress={() => changeMonthMenuYear(-1)} accessibilityLabel={String(visibleMonth.getFullYear() - 1)}>
                          <Ionicons name="chevron-back" size={16} color={colors.grey} />
                        </Pressable>
                        <Text style={styles.mobileMonthMenuYear}>{visibleMonth.getFullYear()}</Text>
                        <Pressable style={styles.mobileMonthYearButton} onPress={() => changeMonthMenuYear(1)} accessibilityLabel={String(visibleMonth.getFullYear() + 1)}>
                          <Ionicons name="chevron-forward" size={16} color={colors.grey} />
                        </Pressable>
                      </View>
                      <ScrollView style={styles.mobileMonthMenuList} nestedScrollEnabled showsVerticalScrollIndicator>
                        {MONTH_LABELS.map((month, index) => (
                          <Pressable
                            key={`${visibleMonth.getFullYear()}-${index}`}
                            style={[styles.mobileMonthOption, index === visibleMonth.getMonth() && styles.mobileMonthOptionSelected]}
                            onPress={() => selectMobileMonth(index)}
                          >
                            <Text style={[styles.mobileMonthOptionText, index === visibleMonth.getMonth() && styles.mobileMonthOptionTextSelected]}>{month}</Text>
                            {index === visibleMonth.getMonth() ? <Ionicons name="checkmark" size={16} color={colors.greenLight} /> : null}
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={[styles.nativePitchPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {pitches.length > 1 ? (
                  <View style={styles.nativePitchDropdown}>
                    <Pressable
                      style={styles.nativePitchTrigger}
                      onPress={() => setPitchMenuOpen((open) => !open)}
                      accessibilityRole="button"
                      accessibilityLabel={t('agenda.choosePitch')}
                      accessibilityState={{ expanded: pitchMenuOpen }}
                    >
                      <View style={[styles.pitchColorDot, { backgroundColor: PITCH_COLORS[Math.max(0, pitches.findIndex((pitch) => pitch.id === activePitch.id)) % PITCH_COLORS.length] }]} />
                      <Text style={styles.nativePitchName} numberOfLines={1}>{activePitch.name}</Text>
                      <Ionicons name={pitchMenuOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.grey} />
                    </Pressable>
                    {pitchMenuOpen ? (
                      <View style={[styles.pitchDropdownMenu, styles.nativePitchMenu]}>
                        {pitches.map((pitch, index) => (
                          <Pressable
                            key={pitch.id}
                            style={[styles.pitchDropdownOption, pitch.id === activePitch.id && styles.pitchDropdownOptionActive]}
                            onPress={() => { setActivePitchId(pitch.id); setPitchMenuOpen(false); }}
                            accessibilityRole="menuitem"
                          >
                            <View style={[styles.pitchColorDot, { backgroundColor: PITCH_COLORS[index % PITCH_COLORS.length] }]} />
                            <Text style={styles.nativePitchName} numberOfLines={1}>{pitch.name}</Text>
                            {pitch.id === activePitch.id ? <Ionicons name="checkmark" size={16} color={colors.greenLight} /> : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.nativePitchDropdown}>
                    <View style={styles.nativePitchTrigger}>
                      <View style={[styles.pitchColorDot, { backgroundColor: PITCH_COLORS[Math.max(0, pitches.findIndex((pitch) => pitch.id === activePitch.id)) % PITCH_COLORS.length] }]} />
                      <Text style={styles.nativePitchName} numberOfLines={1}>{activePitch.name}</Text>
                      <Ionicons name="chevron-down" size={17} color={colors.grey} />
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.nativeViewModeRow}>
                {(['week', 'month'] as ViewMode[]).map((mode) => (
                  <Pressable
                    key={mode}
                    style={[styles.nativeViewModeButton, viewMode === mode && styles.nativeViewModeButtonActive]}
                    onPress={() => selectViewMode(mode)}
                  >
                    <Text style={[styles.nativeViewModeText, viewMode === mode && styles.nativeViewModeTextActive]}>
                      {mode === 'week' ? t('agenda.viewWeek') : t('agenda.viewMonth')}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.nativeDayStrip}
                contentContainerStyle={styles.nativeDayStripContent}
                ref={viewMode === 'month' ? monthStripRef : undefined}
                onLayout={viewMode === 'month' ? (event) => setMonthStripWidth(event.nativeEvent.layout.width) : undefined}
              >
                {(viewMode === 'month' ? mobileMonthDays : weekDays).map((day) => {
                  const isSelected = isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, new Date());
                  return (
                    <Pressable
                      key={day.toISOString()}
                      style={[styles.nativeDayCell, isSelected && styles.nativeDayCellSelected]}
                      onPress={() => setSelectedDate(day)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    >
                      <Text style={[styles.nativeDayWeekday, isSelected && styles.nativeDayTextSelected]}>
                        {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
                      </Text>
                      <Text style={[styles.nativeDayNumber, isSelected && styles.nativeDayTextSelected]}>
                        {day.getDate()}
                      </Text>
                      {isToday && !isSelected ? <View style={styles.nativeTodayDot} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.nativeSelectedDay}>
                {selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>

              {isLoading ? (
                <View style={styles.nativeTimelineLoading}><ActivityIndicator color={colors.greenLight} /></View>
              ) : (
                <ScrollView
                  ref={nativeTimelineRef}
                  style={styles.nativeTimelineScroll}
                  contentContainerStyle={{ height: nativeTimelineHeight }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  onContentSizeChange={() => {
                    const now = new Date();
                    const startHour = isSameDay(selectedDate, now) ? clamp(hourFraction(now) - 1, HOURS_START, HOURS_END - 6) : HOURS_START;
                    nativeTimelineRef.current?.scrollTo({ y: (startHour - HOURS_START) * NATIVE_HOUR_ROW_HEIGHT, animated: false });
                  }}
                >
                  <View style={[styles.nativeTimelineGrid, { height: nativeTimelineHeight }]}>
                    {HOURS.map((hour, index) => (
                      <React.Fragment key={hour}>
                        <Text style={[styles.nativeTimelineHour, { top: index * NATIVE_HOUR_ROW_HEIGHT - 8 }]}>{formatHourLabel(hour)}</Text>
                        <View style={[styles.nativeTimelineRule, { top: index * NATIVE_HOUR_ROW_HEIGHT }]} />
                      </React.Fragment>
                    ))}

                    {nativeGaps.map((gap, index) => {
                      const top = clamp((hourFraction(gap.start) - HOURS_START) * NATIVE_HOUR_ROW_HEIGHT, 0, nativeTimelineHeight);
                      const bottom = clamp((hourFraction(gap.end) - HOURS_START) * NATIVE_HOUR_ROW_HEIGHT, 0, nativeTimelineHeight);
                      if (bottom - top < 45) return null;
                      return (
                        <Pressable
                          key={`available-${index}`}
                          style={[styles.nativeAvailableSlot, { top: top + 3, height: bottom - top - 6 }]}
                          onPress={openAddExternalBooking}
                        >
                          <Ionicons name="add" size={16} color={colors.blueLight} />
                          <Text style={styles.nativeAvailableText}>{t('agenda.available')}</Text>
                        </Pressable>
                      );
                    })}

                    {selectedDayEvents.map((event) => {
                      const meta = eventStatusMeta(event, colors, t);
                      const top = clamp((hourFraction(event.startsAt) - HOURS_START) * NATIVE_HOUR_ROW_HEIGHT, 0, nativeTimelineHeight);
                      const bottom = clamp((hourFraction(event.endsAt) - HOURS_START) * NATIVE_HOUR_ROW_HEIGHT, 0, nativeTimelineHeight);
                      if (bottom <= top) return null;
                      const title = event.kind === 'block'
                        ? (event.block.block_type === 'external_booking' ? t('agenda.externalBookingDefault') : event.block.block_type === 'party' ? (event.block.reference || t('agenda.partyDefault')) : t('agenda.blockedDefault'))
                        : event.kind === 'academy' ? event.session.title : t('agenda.statusConfirmedPaid');
                      const detail = event.kind === 'block'
                        ? (event.block.block_type === 'external_booking' ? event.block.reference || '' : event.block.block_type === 'party' ? event.block.reason || '' : event.block.reason || '')
                        : event.kind === 'academy'
                          ? event.session.title
                          : t('agenda.playersLabel', { paid: event.match.players_paid_count, required: event.match.players_required });
                      return (
                        <Pressable
                          key={event.id}
                          style={[
                            styles.nativeTimelineEvent,
                            { top: top + 4, height: Math.max(bottom - top - 8, 56), backgroundColor: meta.background, borderColor: meta.color, borderLeftColor: meta.color },
                          ]}
                          onPress={() => openEventDetails(event)}
                        >
                          <View style={styles.nativeTimelineEventHeader}>
                            <Text style={styles.nativeTimelineEventTitle} numberOfLines={1}>{title}</Text>
                            <Text style={[styles.nativeTimelineEventTime, { color: meta.color }]} numberOfLines={1}>{formatTime(event.startsAt)} – {formatTime(event.endsAt)}</Text>
                          </View>
                          {detail ? <Text style={styles.nativeTimelineEventDetail} numberOfLines={1}>{detail}</Text> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              <View style={styles.nativeActionFooter}>
                <Pressable style={[styles.nativeActionButton, styles.nativeActionExternal, selectedDayIsPast && styles.actionDisabled]} onPress={openAddExternalBooking} disabled={selectedDayIsPast}>
                  <Ionicons name="calendar-outline" size={22} color={colors.blueLight} />
                  <Text style={[styles.nativeActionText, { color: colors.blueLight }]} numberOfLines={1}>{t('agenda.externalBookingDefault')}</Text>
                </Pressable>
                <Pressable style={[styles.nativeActionButton, styles.nativeActionBlock, selectedDayIsPast && styles.actionDisabled]} onPress={openBlockSlot} disabled={selectedDayIsPast}>
                  <Ionicons name="ban-outline" size={22} color={colors.greySoft} />
                  <Text style={[styles.nativeActionText, { color: colors.greySoft }]} numberOfLines={1}>{t('agenda.blockSlot')}</Text>
                </Pressable>
                <Pressable style={[styles.nativeActionButton, styles.nativeActionParty, selectedDayIsPast && styles.actionDisabled]} onPress={openAddParty} disabled={selectedDayIsPast}>
                  <Ionicons name="people-outline" size={22} color={colors.pink} />
                  <Text style={[styles.nativeActionText, { color: colors.pink }]} numberOfLines={1}>{t('agenda.addParty')}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Screen>
    );
  }

  if (!activePitch) {
    return (
      <Screen>
        <AppHeader title={t('agenda.title')} showBack={false} colorsOverride={isNativeMobile ? weeklineColors : undefined} refined={isNativeMobile} />
        <Text style={styles.emptyText}>{t('agenda.noPitchLinked')}</Text>
      </Screen>
    );
  }

  return (
    <Screen
      scroll={!isDesktopAgenda}
      ambientGlows={!isDesktopAgenda && !isNativeMobile}
      background={isDesktopAgenda || isNativeMobile ? <Image source={require('../../../assets/images/weekline-soft-halo.png')} style={styles.weeklineBackground} resizeMode="stretch" /> : undefined}
      style={isDesktopAgenda || isNativeMobile ? { backgroundColor: weeklineColors.background } : undefined}
      contentStyle={[styles.screenContent, isWeeklineStyle && styles.weeklineScreen, isNativeMobile && styles.nativeWeeklineScreen]}
      maxWidth={WIDE_CONTENT_MAX_WIDTH}
    >
      <View style={isDesktopAgenda ? styles.weeklineTop : undefined}>
        {isDesktopAgenda ? (
          <View>
            <Text style={styles.weeklinePageTitle}>{t('agenda.title')}</Text>
            <Text style={styles.weeklinePageSubtitle}>{t('agenda.subtitle')}</Text>
          </View>
        ) : (
          <AppHeader title={t('agenda.title')} subtitle={t('agenda.subtitle')} showBack={false} colorsOverride={isNativeMobile ? weeklineColors : undefined} refined={isNativeMobile} />
        )}

      <View style={[styles.actionsRow, isDesktopAgenda && styles.weeklineActions, isNativeMobile && styles.nativeWeeklineActions]}>
        <Pressable
          style={[styles.actionButtonOutline, isDesktopAgenda && styles.weeklineActionButton, isNativeMobile && styles.nativeWeeklineActionButton, selectedDayIsPast && styles.actionDisabled]}
          onPress={openBlockSlot}
          disabled={selectedDayIsPast}
        >
          {!isDesktopAgenda && <Ionicons name="lock-closed-outline" size={16} color={colors.white} />}
          <Text style={[styles.actionButtonOutlineText, isWeeklineStyle && styles.weeklineActionText]} numberOfLines={1}>{t('agenda.blockSlot')}</Text>
        </Pressable>

        {/* A party takes the pitch for an evening rather than a playing
            slot, so it gets its own button and its own time selection. */}
        <Pressable
          style={[styles.actionButtonOutline, isDesktopAgenda && styles.weeklineActionButton, isNativeMobile && styles.nativeWeeklineActionButton, selectedDayIsPast && styles.actionDisabled]}
          onPress={openAddParty}
          disabled={selectedDayIsPast}
        >
          {!isDesktopAgenda && <Ionicons name="balloon-outline" size={16} color={colors.pink} />}
          <Text style={[styles.actionButtonOutlineText, isWeeklineStyle && styles.weeklineActionText]} numberOfLines={1}>{t('agenda.addParty')}</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButtonPrimary, isDesktopAgenda && styles.weeklineActionButton, isDesktopAgenda && styles.weeklinePrimaryButton, isNativeMobile && styles.nativeWeeklinePrimaryButton, selectedDayIsPast && styles.actionDisabled]}
          onPress={openAddExternalBooking}
          disabled={selectedDayIsPast}
        >
          <Ionicons name="add" size={isDesktopAgenda ? 15 : 18} color={colors.blackText} />
          <Text style={[styles.actionButtonPrimaryText, isWeeklineStyle && styles.weeklinePrimaryText]} numberOfLines={1}>{t('agenda.addExternalBooking')}</Text>
        </Pressable>
      </View>
      </View>

      <View style={[styles.toolbarRow, isDesktopAgenda && styles.weeklineToolbar, isNativeMobile && styles.nativeWeeklineToolbar]}>
        <View style={[styles.pitchSelectorInline, isDesktopAgenda && styles.weeklinePitchSelector]}>
          {isDesktopAgenda ? (
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
                  style={[styles.pitchChip, isWeeklineStyle && styles.weeklinePitchChip, isActive && styles.pitchChipActive, isWeeklineStyle && isActive && styles.weeklinePitchChipActive]}
                  onPress={() => setActivePitchId(pitch.id)}
                >
                  <Ionicons name="location" size={12} color={isActive ? colors.white : colors.grey} />
                  <Text style={[styles.pitchChipText, isWeeklineStyle && styles.weeklinePitchText, isActive && styles.pitchChipTextActive]}>
                    {pitch.name}
                  </Text>
                </AnimatedPressable>
              );
            })
          ) : (
            <View style={[styles.pitchChip, isWeeklineStyle && styles.weeklinePitchChip, styles.pitchChipActive, isWeeklineStyle && styles.weeklinePitchChipActive]}>
              <Ionicons name="location" size={12} color={colors.white} />
              <Text style={[styles.pitchChipText, isWeeklineStyle && styles.weeklinePitchText, styles.pitchChipTextActive]}>{activePitch.name}</Text>
            </View>
          )}
        </View>

        <View style={[styles.viewToggleRow, isWeeklineStyle && styles.weeklineToggleRow]}>
          {(['week', 'month'] as ViewMode[]).map((mode) => {
            const isActive = viewMode === mode;
            const label =
              mode === 'week' ? t('agenda.viewWeek') : t('agenda.viewMonth');
            return (
              <AnimatedSelectable
                key={mode}
                active={isActive}
                style={[styles.viewToggleButton, isWeeklineStyle && styles.weeklineToggleButton]}
                background={['transparent', isWeeklineStyle ? colors.greenSoft : colors.blue]}
                onPress={() => selectViewMode(mode)}
              >
                {(progress) => (
                  <Animated.Text
                    style={[
                      styles.viewToggleText,
                      isWeeklineStyle && styles.weeklineToggleText,
                      {
                        color: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [colors.grey, isWeeklineStyle ? colors.greenLight : colors.white],
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

            <ScrollView style={styles.weeklineGridScroll} nestedScrollEnabled showsVerticalScrollIndicator>
            <View style={[styles.weeklineGrid, { height: desktopGridHeight }]}>
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
            </ScrollView>
            {isLoading ? <ActivityIndicator style={styles.weeklineLoading} color={colors.greenLight} /> : null}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>

          {renderWeeklineSide()}
        </View>
      ) : isDesktopMonth ? (
        <View style={styles.weeklineLayout}>
          <View style={styles.weeklineBoard}>
            <View style={styles.weeklineBoardTitle}>
              <View>
                <Text style={styles.weeklineEyebrow}>{t('agenda.viewMonth')}</Text>
                <Text style={styles.weeklineRange}>{currentRangeLabel()}</Text>
              </View>
              <View style={styles.weeklineNav}>
                <Pressable style={styles.weeklineNavButton} onPress={goToPrevious} accessibilityLabel="Previous month">
                  <Ionicons name="chevron-back" size={16} color={colors.grey} />
                </Pressable>
                <Pressable style={styles.weeklineNavButton} onPress={goToNext} accessibilityLabel="Next month">
                  <Ionicons name="chevron-forward" size={16} color={colors.grey} />
                </Pressable>
              </View>
            </View>
            <View style={styles.weeklineMonthWeekdays}>
              {WEEKDAY_LABELS.map((label, index) => (
                <Text key={index} style={styles.weeklineMonthWeekday}>{label}</Text>
              ))}
            </View>
            <View style={styles.weeklineMonthGrid}>
              {gridDays.map((day) => {
                const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
                const inMonth = day.getMonth() === visibleMonth.getMonth();
                const isSelected = isSameDay(day, selectedDate);
                const firstEvent = dayEvents[0];
                const meta = firstEvent ? eventStatusMeta(firstEvent, colors, t) : null;
                return (
                  <Pressable
                    key={day.toISOString()}
                    style={[styles.weeklineMonthCell, isSelected && styles.weeklineMonthCellSelected]}
                    onPress={() => setSelectedDate(day)}
                  >
                    <Text style={[styles.weeklineMonthDate, !inMonth && styles.weeklineMonthOutside, isSelected && styles.weeklineMonthDateSelected]}>
                      {day.getDate()}
                    </Text>
                    {firstEvent && meta ? (
                      <View style={[styles.weeklineMonthPreview, { backgroundColor: meta.background, borderLeftColor: meta.color }]}>
                        <Text style={[styles.weeklineMonthPreviewTime, { color: meta.color }]} numberOfLines={1}>{formatTime(firstEvent.startsAt)}</Text>
                        <Text style={styles.weeklineMonthPreviewLabel} numberOfLines={1}>{meta.label}</Text>
                      </View>
                    ) : null}
                    {dayEvents.length > 1 && (
                      <View style={styles.weeklineMonthDots}>
                        {dayEvents.slice(1, 4).map((event) => (
                          <View key={event.id} style={[styles.weeklineMonthDot, { backgroundColor: eventStatusMeta(event, colors, t).color }]} />
                        ))}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {isLoading ? <ActivityIndicator style={styles.weeklineLoading} color={colors.greenLight} /> : null}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>
          {renderWeeklineSide()}
        </View>
      ) : (
      <View style={isDesktop ? styles.desktopColumns : undefined}>
        <View style={isDesktop ? styles.calendarColumn : undefined}>
      {viewMode === 'month' ? (
        <View style={styles.mobileMonthPickerWrap}>
          <Pressable
            style={[styles.mobileMonthPickerTrigger, isNativeMobile && styles.nativeWeeklineControl]}
            onPress={() => setMonthMenuOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={`${MONTH_LABELS[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`}
            accessibilityState={{ expanded: monthMenuOpen }}
          >
            <Text style={[styles.mobileMonthPickerText, isNativeMobile && styles.nativeWeeklineControlText]}>{MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}</Text>
            <Ionicons name={monthMenuOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.greenLight} />
          </Pressable>
          {monthMenuOpen ? (
            <View style={styles.mobileMonthMenu}>
              <View style={styles.mobileMonthMenuYearRow}>
                <Pressable style={styles.mobileMonthYearButton} onPress={() => changeMonthMenuYear(-1)} accessibilityLabel={String(visibleMonth.getFullYear() - 1)}>
                  <Ionicons name="chevron-back" size={16} color={colors.grey} />
                </Pressable>
                <Text style={styles.mobileMonthMenuYear}>{visibleMonth.getFullYear()}</Text>
                <Pressable style={styles.mobileMonthYearButton} onPress={() => changeMonthMenuYear(1)} accessibilityLabel={String(visibleMonth.getFullYear() + 1)}>
                  <Ionicons name="chevron-forward" size={16} color={colors.grey} />
                </Pressable>
              </View>
              <ScrollView style={styles.mobileMonthMenuList} nestedScrollEnabled showsVerticalScrollIndicator>
                {MONTH_LABELS.map((month, index) => (
                  <Pressable
                    key={`${visibleMonth.getFullYear()}-${index}`}
                    style={[styles.mobileMonthOption, index === visibleMonth.getMonth() && styles.mobileMonthOptionSelected]}
                    onPress={() => selectMobileMonth(index)}
                  >
                    <Text style={[styles.mobileMonthOptionText, index === visibleMonth.getMonth() && styles.mobileMonthOptionTextSelected]}>{month}</Text>
                    {index === visibleMonth.getMonth() ? <Ionicons name="checkmark" size={16} color={colors.greenLight} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.monthNav}>
          <AnimatedPressable style={styles.monthNavButton} onPress={goToPrevious}>
            <Ionicons name="chevron-back" size={18} color={colors.white} />
          </AnimatedPressable>
          <Text style={styles.monthLabel}>{currentRangeLabel()}</Text>
          <AnimatedPressable style={styles.monthNavButton} onPress={goToNext}>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </AnimatedPressable>
        </View>
      )}

      <AnimatedSwap swapKey={isLoading ? 'loading' : viewMode}>
      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.greenLight} />
        </View>
      ) : viewMode === 'month' ? (
        <ScrollView
          ref={monthStripRef}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={[styles.mobileMonthStrip, isNativeMobile && styles.nativeWeeklineMonthStrip]}
          contentContainerStyle={styles.mobileMonthStripContent}
          onLayout={(event) => setMonthStripWidth(event.nativeEvent.layout.width)}
        >
          {mobileMonthDays.map((day) => {
            const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
            const isSelected = isSameDay(day, selectedDate);
            return (
              <Pressable
                key={day.toISOString()}
                style={[styles.mobileMonthDay, isSelected && styles.mobileMonthDaySelected, isNativeMobile && isSelected && styles.nativeWeeklineMonthDaySelected]}
                onPress={() => setSelectedDate(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              >
                <Text style={[styles.mobileMonthWeekday, isSelected && styles.mobileMonthDayTextSelected]}>
                  {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
                </Text>
                <Text style={[styles.mobileMonthDayNumber, isSelected && styles.mobileMonthDayTextSelected]}>{day.getDate()}</Text>
                <View style={styles.mobileMonthDayDots}>
                  {dayEvents.slice(0, 3).map((event) => (
                    <View key={event.id} style={[styles.mobileMonthDayDot, { backgroundColor: eventStatusMeta(event, colors, t).color }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : viewMode === 'week' ? (
        <View style={[styles.weekWrap, isNativeMobile && styles.nativeWeeklineWeekWrap]}>
          <View style={styles.weekHeaderRow}>
            <View style={styles.weekGutterHeader} />
            {weekDays.map((day) => {
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selectedDate);
              return (
                <AnimatedPressable
                  key={day.toISOString()}
                  style={[styles.weekHeaderCell, isNativeMobile && styles.nativeWeeklineWeekHeaderCell, isNativeMobile && isSelected && styles.nativeWeeklineWeekHeaderCellSelected]}
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

          <ScrollView style={[styles.weekScroll, isNativeMobile && styles.nativeWeeklineWeekScroll]} nestedScrollEnabled>
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
                          <Text style={[styles.weekEventTime, isNativeMobile && styles.nativeWeeklineWeekEventTime, { color: meta.color }]} numberOfLines={1}>
                            {formatTime(event.startsAt)}
                          </Text>
                          <Text style={[styles.weekEventLabel, isNativeMobile && styles.nativeWeeklineWeekEventLabel]} numberOfLines={1}>
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
      ) : null}
      </AnimatedSwap>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        </View>

        <View style={isDesktop ? styles.panelColumn : undefined}>
      <View style={[styles.statsCard, isNativeMobile && styles.nativeWeeklineCard]}>
        <Text style={[styles.statsTitle, isNativeMobile && styles.nativeWeeklineSectionTitle]}>{t('agenda.statsThisMonth')}</Text>

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
        style={[styles.dayPanel, isDesktop && styles.dayPanelDesktop, isNativeMobile && styles.nativeWeeklineDayPanel]}
      >
        <Text style={[styles.dayPanelTitle, isNativeMobile && styles.nativeWeeklineDayTitle]}>
          {selectedDate.toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
        <Text style={[styles.dayPanelSubtitle, isNativeMobile && styles.nativeWeeklineDaySubtitle]}>
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
      backgroundColor: 'transparent',
    },
    nativeWeeklineScreen: {
      paddingTop: 10,
      paddingBottom: 28,
    },
    nativeWeeklineActions: {
      gap: 7,
      marginBottom: 12,
      flexWrap: 'wrap',
    },
    nativeWeeklineActionButton: {
      minHeight: 38,
      paddingHorizontal: 9,
      paddingVertical: 8,
      borderRadius: 8,
      flexGrow: 1,
      flexShrink: 1,
    },
    nativeWeeklinePrimaryButton: {
      minWidth: 136,
      backgroundColor: colors.greenLight,
    },
    nativeWeeklineToolbar: {
      marginBottom: 12,
      gap: 8,
    },
    nativeWeeklineControl: {
      minHeight: 40,
      borderRadius: 8,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    nativeWeeklineControlText: {
      fontSize: scaleFont(14),
      fontWeight: '600',
    },
    nativeWeeklineMonthStrip: {
      height: 70,
      marginBottom: 12,
    },
    nativeWeeklineMonthDaySelected: {
      backgroundColor: colors.greenSoft,
      borderColor: colors.greenLight,
    },
    nativeWeeklineWeekWrap: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 9,
      backgroundColor: colors.card,
      padding: 7,
      overflow: 'hidden',
    },
    nativeWeeklineWeekHeaderCell: {
      borderRadius: 7,
    },
    nativeWeeklineWeekHeaderCellSelected: {
      backgroundColor: colors.greenSoft,
    },
    nativeWeeklineWeekScroll: {
      maxHeight: 430,
    },
    nativeWeeklineWeekEvent: {
      borderRadius: 5,
      paddingHorizontal: 4,
      borderLeftWidth: 2,
    },
    nativeWeeklineWeekEventTime: {
      fontWeight: '700',
    },
    nativeWeeklineWeekEventLabel: {
      fontWeight: '500',
    },
    nativeWeeklineCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 9,
      padding: 14,
    },
    nativeWeeklineSectionTitle: {
      fontSize: scaleFont(14),
      fontWeight: '600',
    },
    nativeWeeklineDayPanel: {
      marginTop: 12,
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 9,
      padding: 14,
    },
    nativeWeeklineDayTitle: {
      fontSize: scaleFont(16),
      fontWeight: '600',
    },
    nativeWeeklineDaySubtitle: {
      fontSize: scaleFont(12),
      fontWeight: '500',
      marginBottom: 10,
    },
    nativeWeeklineEventCard: {
      borderRadius: 7,
      backgroundColor: colors.cardDark,
      borderColor: colors.borderSoft,
      padding: 11,
    },
    nativeWeeklineEventTime: {
      fontSize: scaleFont(13),
      fontWeight: '600',
    },
    nativeWeeklineEventBadgeText: {
      fontWeight: '700',
    },
    nativeWeeklineEventDetail: {
      fontSize: scaleFont(12),
      fontWeight: '500',
    },
    weeklineBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
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
      fontSize: 24,
      fontWeight: '600',
      letterSpacing: -0.6,
    },
    weeklinePageSubtitle: {
      color: colors.grey,
      fontSize: 12,
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
      fontSize: 13,
      fontWeight: '600',
    },
    weeklinePrimaryButton: {
      backgroundColor: colors.greenLight,
      minWidth: 146,
    },
    weeklinePrimaryText: {
      fontSize: 13,
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
      fontSize: 13,
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
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    weeklineRange: {
      color: colors.white,
      fontSize: 15,
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
      height: 48,
      // The grid's vertical scrollbar narrows its viewport. Match that
      // reserved gutter so weekday headers line up with the time columns.
      paddingRight: 14,
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
      fontSize: 12,
      fontWeight: '600',
    },
    weeklineDayDate: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '600',
    },
    weeklineDayDateSelected: {
      color: colors.greenLight,
    },
    weeklineMonthWeekdays: {
      flexDirection: 'row',
      height: 42,
      alignItems: 'center',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    weeklineMonthWeekday: {
      width: '14.2857%',
      textAlign: 'center',
      color: colors.greyDark,
      fontSize: 12,
      fontWeight: '600',
    },
    weeklineMonthGrid: {
      flex: 1,
      minHeight: 0,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    weeklineMonthCell: {
      width: '14.2857%',
      height: '16.6667%',
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.borderSoft,
      paddingHorizontal: 7,
      paddingTop: 6,
      overflow: 'hidden',
    },
    weeklineMonthCellSelected: {
      backgroundColor: colors.greenSoft,
    },
    weeklineMonthDate: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '600',
    },
    weeklineMonthOutside: {
      color: colors.greyDark,
      opacity: 0.55,
    },
    weeklineMonthDateSelected: {
      color: colors.greenLight,
    },
    weeklineMonthPreview: {
      borderLeftWidth: 2,
      borderRadius: 3,
      paddingHorizontal: 5,
      paddingVertical: 3,
      marginTop: 4,
    },
    weeklineMonthPreviewTime: {
      fontSize: 11,
      fontWeight: '700',
    },
    weeklineMonthPreviewLabel: {
      color: colors.white,
      fontSize: 11,
      fontWeight: '500',
    },
    weeklineMonthDots: {
      flexDirection: 'row',
      gap: 4,
      marginTop: 4,
    },
    weeklineMonthDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    weeklineGridScroll: {
      flex: 1,
      minHeight: 0,
    },
    weeklineGrid: {
      flexDirection: 'row',
    },
    weeklineHour: {
      color: colors.greyDark,
      fontSize: 12,
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
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderLeftWidth: 2,
      borderRadius: 3,
      overflow: 'hidden',
    },
    weeklineEventTime: {
      fontSize: 12,
      fontWeight: '700',
    },
    weeklineEventLabel: {
      color: colors.white,
      fontSize: 12,
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
      fontSize: 13,
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
      fontSize: 13,
      fontWeight: '600',
    },
    weeklineRowLabel: {
      color: colors.grey,
      fontSize: 12,
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
      fontSize: 11,
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
      fontSize: 13,
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
    mobileMonthPickerWrap: {
      position: 'relative',
      zIndex: 20,
      marginBottom: spacing.sm,
    },
    mobileMonthPickerTrigger: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    mobileMonthPickerText: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '700',
    },
    mobileMonthMenu: {
      position: 'absolute',
      top: 46,
      left: 0,
      right: 0,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 6,
      zIndex: 30,
      elevation: 12,
    },
    mobileMonthMenuYearRow: {
      height: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
      marginBottom: 4,
    },
    mobileMonthYearButton: {
      width: 36,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mobileMonthMenuYear: {
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '700',
    },
    mobileMonthMenuList: {
      maxHeight: 240,
    },
    mobileMonthOption: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      borderRadius: 7,
    },
    mobileMonthOptionSelected: {
      backgroundColor: colors.greenSoft,
    },
    mobileMonthOptionText: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '500',
    },
    mobileMonthOptionTextSelected: {
      color: colors.greenLight,
      fontWeight: '700',
    },
    mobileMonthStrip: {
      flexGrow: 0,
      height: 74,
      marginBottom: spacing.md,
    },
    mobileMonthStripContent: {
      alignItems: 'center',
      paddingHorizontal: 2,
      gap: 4,
    },
    mobileMonthDay: {
      width: 44,
      height: 68,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      gap: 2,
    },
    mobileMonthDaySelected: {
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.greenLight,
    },
    mobileMonthWeekday: {
      color: colors.greyDark,
      fontSize: scaleFont(9),
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    mobileMonthDayNumber: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '600',
    },
    mobileMonthDayTextSelected: {
      color: colors.greenLight,
    },
    mobileMonthDayDots: {
      height: 5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    mobileMonthDayDot: {
      width: 3,
      height: 3,
      borderRadius: 2,
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
    nativeAgendaScreen: {
      flex: 1,
      paddingTop: 8,
      paddingBottom: 10,
      paddingHorizontal: 14,
    },
    nativeAgendaRoot: {
      flex: 1,
      minHeight: 0,
    },
    nativeAgendaTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 4,
      marginBottom: 12,
      zIndex: 21,
    },
    nativeAgendaTitle: {
      color: colors.white,
      fontSize: scaleFont(30),
      fontWeight: '700',
      letterSpacing: -0.8,
    },
    nativeMonthTrigger: {
      minHeight: 38,
      maxWidth: 155,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.blueDeep,
      borderRadius: 22,
      backgroundColor: colors.blueSoft,
    },
    nativeMonthTriggerText: {
      color: colors.blueLight,
      fontSize: scaleFont(13),
      fontWeight: '600',
    },
    nativeMonthMenu: {
      top: 43,
      borderRadius: 9,
    },
    nativePitchPicker: {
      minHeight: 54,
      borderWidth: 1,
      borderRadius: 10,
      marginBottom: 10,
      zIndex: 15,
      elevation: 4,
    },
    nativePitchDropdown: {
      position: 'relative',
      zIndex: 16,
    },
    nativePitchTrigger: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
    },
    nativePitchName: {
      flex: 1,
      minWidth: 0,
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '600',
    },
    nativePitchMenu: {
      top: 54,
      borderRadius: 9,
    },
    nativeViewModeRow: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      gap: 6,
      marginBottom: 8,
    },
    nativeViewModeButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: 'transparent',
    },
    nativeViewModeButtonActive: {
      backgroundColor: colors.blueSoft,
    },
    nativeViewModeText: {
      color: colors.greyDark,
      fontSize: scaleFont(12),
      fontWeight: '500',
    },
    nativeViewModeTextActive: {
      color: colors.blueLight,
      fontWeight: '700',
    },
    nativeDayStrip: {
      flexGrow: 0,
      height: 68,
      marginBottom: 8,
    },
    nativeDayStripContent: {
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 1,
    },
    nativeDayCell: {
      width: 45,
      height: 62,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    nativeDayCellSelected: {
      backgroundColor: colors.blue,
      borderColor: colors.blueLight,
    },
    nativeDayWeekday: {
      color: colors.grey,
      fontSize: scaleFont(10),
      fontWeight: '500',
    },
    nativeDayNumber: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '500',
    },
    nativeDayTextSelected: {
      color: colors.blackText,
      fontWeight: '700',
    },
    nativeTodayDot: {
      position: 'absolute',
      bottom: 1,
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.blueLight,
    },
    nativeSelectedDay: {
      color: colors.white,
      fontSize: scaleFont(19),
      fontWeight: '600',
      marginTop: 2,
      marginBottom: 8,
      letterSpacing: -0.2,
    },
    nativeTimelineLoading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nativeTimelineScroll: {
      flex: 1,
      minHeight: 120,
      marginBottom: 10,
    },
    nativeTimelineGrid: {
      position: 'relative',
      width: '100%',
    },
    nativeTimelineHour: {
      position: 'absolute',
      left: 0,
      width: 42,
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '500',
      textAlign: 'left',
    },
    nativeTimelineRule: {
      position: 'absolute',
      left: 48,
      right: 0,
      height: 1,
      backgroundColor: colors.border,
      opacity: 0.7,
    },
    nativeTimelineEvent: {
      position: 'absolute',
      left: 52,
      right: 0,
      borderWidth: 1,
      borderLeftWidth: 4,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 8,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    nativeTimelineEventHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    nativeTimelineEventTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '600',
    },
    nativeTimelineEventTime: {
      color: colors.blueLight,
      fontSize: scaleFont(11),
      fontWeight: '500',
    },
    nativeTimelineEventDetail: {
      color: colors.grey,
      fontSize: scaleFont(12),
      marginTop: 4,
    },
    nativeAvailableSlot: {
      position: 'absolute',
      left: 54,
      right: 2,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.greyDark,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    nativeAvailableText: {
      color: colors.blueLight,
      fontSize: scaleFont(13),
      fontWeight: '500',
    },
    nativeActionFooter: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    nativeActionButton: {
      flex: 1,
      minWidth: 0,
      minHeight: 74,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1,
      borderRadius: 9,
      backgroundColor: 'rgba(8,17,26,0.55)',
      paddingHorizontal: 4,
    },
    nativeActionExternal: {
      borderColor: colors.blueLight,
    },
    nativeActionBlock: {
      borderColor: colors.greyDark,
    },
    nativeActionParty: {
      borderColor: colors.pink,
    },
    nativeActionText: {
      fontSize: scaleFont(11),
      fontWeight: '600',
    },
    nativeEmptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nativeMenuBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 28,
    },
    nativeQuickMenu: {
      position: 'absolute',
      top: 48,
      left: 2,
      width: 215,
      zIndex: 30,
      elevation: 15,
      borderWidth: 1,
      borderRadius: 10,
      padding: 5,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
    },
    nativeQuickMenuItem: {
      minHeight: 43,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 10,
      borderRadius: 7,
    },
    nativeQuickMenuText: {
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '500',
    },
  });
