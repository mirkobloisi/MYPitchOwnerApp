import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AppHeader from '../../components/AppHeader';
import Screen from '../../components/Screen';
import { useTranslation } from '../../i18n/LanguageContext';
import { useAuth, type PitchRecord } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { withAbortableTimeout } from '../../lib/withTimeout';
import { weeklineColors as colors } from '../../theme/palettes';

type Period = 'week' | 'month' | 'year';
type ReservationType = 'total' | 'external' | 'mypitch';

type MatchRow = {
  id: string;
  pitch_id: string;
  status: string;
  starts_at: string;
};

type PayoutRow = {
  id: string;
  pitch_id: string;
  amount: number | string;
  created_at: string;
};

type ExternalBookingRow = {
  id: string;
  pitch_id: string;
  start_time: string;
  block_type: 'external_booking';
};

type DateBucket = { label: string; start: Date; end: Date };
type BucketValue = DateBucket & { amount: number };

const REQUEST_TIMEOUT_MS = 15000;
const PAGE_SIZE = 1000;
const WebSelect: any = 'select';
const WebOption: any = 'option';
const Svg: any = 'svg';
const SvgDefs: any = 'defs';
const SvgLinearGradient: any = 'linearGradient';
const SvgStop: any = 'stop';
const SvgLine: any = 'line';
const SvgPath: any = 'path';
const SvgCircle: any = 'circle';
const SvgText: any = 'text';

function localRange(period: Period) {
  const today = new Date();
  let start: Date;
  let end: Date;

  if (period === 'week') {
    const daysSinceMonday = (today.getDay() + 6) % 7;
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday);
    end = new Date(start);
    end.setDate(start.getDate() + 7);
  } else if (period === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  } else {
    start = new Date(today.getFullYear(), 0, 1);
    end = new Date(today.getFullYear() + 1, 0, 1);
  }

  return { start, end };
}

function makeBuckets(period: Period, start: Date, end: Date, locale: string): DateBucket[] {
  if (period === 'week') {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);
      return {
        label: day.toLocaleDateString(locale, { weekday: 'short' }),
        start: day,
        end: nextDay,
      };
    });
  }

  if (period === 'month') {
    const buckets: DateBucket[] = [];
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (let dayNumber = 1; ; dayNumber += 7) {
      const bucketStart = new Date(start.getFullYear(), start.getMonth(), dayNumber);
      if (bucketStart >= end) break;
      const bucketEnd = new Date(start.getFullYear(), start.getMonth(), Math.min(dayNumber + 7, daysInMonth + 1));
      buckets.push({
        label: `${dayNumber}–${Math.min(dayNumber + 6, daysInMonth)}`,
        start: bucketStart,
        end: bucketEnd,
      });
    }
    return buckets;
  }

  return Array.from({ length: 12 }, (_, index) => ({
    label: new Date(start.getFullYear(), index, 1).toLocaleDateString(locale, { month: 'short' }),
    start: new Date(start.getFullYear(), index, 1),
    end: new Date(start.getFullYear(), index + 1, 1),
  }));
}

function periodCaption(period: Period, range: { start: Date; end: Date }, locale: string) {
  if (period === 'year') return String(range.start.getFullYear());
  if (period === 'month') return range.start.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const lastDay = new Date(range.end);
  lastDay.setDate(lastDay.getDate() - 1);
  const dateFormat: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${range.start.toLocaleDateString(locale, dateFormat)} – ${lastDay.toLocaleDateString(locale, { ...dateFormat, year: 'numeric' })}`;
}

function localeFor(language: string) {
  if (language === 'el') return 'el-GR';
  if (language === 'ru') return 'ru-RU';
  return 'en-GB';
}

function formatEuro(amount: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

async function fetchPagedRows<T>(
  makeQuery: (from: number, to: number) => any,
  requestName: string
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await withAbortableTimeout(
      makeQuery(offset, offset + PAGE_SIZE - 1),
      REQUEST_TIMEOUT_MS,
      requestName
    );

    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    offset += PAGE_SIZE;
  }
}

function externalMatchPrice(pitch: PitchRecord | undefined) {
  if (!pitch) return 0;
  const hourlyPrice = Number(pitch.price_per_hour) || 0;
  const matchDurationMinutes = Number(pitch.duration_minutes) || 0;
  return hourlyPrice * (matchDurationMinutes / 60);
}

export default function StatsWebScreen() {
  const { pitches, isLoading: isAuthLoading } = useAuth();
  const { language, t } = useTranslation();
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<Period>('month');
  const [reservationType, setReservationType] = useState<ReservationType>('total');
  const [selectedPitch, setSelectedPitch] = useState('all');
  const [todayKey, setTodayKey] = useState(() => new Date().toDateString());
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [externalBookings, setExternalBookings] = useState<ExternalBookingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const requestVersion = useRef(0);

  const locale = localeFor(language);
  const range = useMemo(() => localRange(period), [period, todayKey]);
  const pitchIds = useMemo(() => pitches.map((pitch) => pitch.id), [pitches]);
  const selectedPitchValue = selectedPitch !== 'all' && pitchIds.includes(selectedPitch) ? selectedPitch : 'all';
  const scopedPitchIds = useMemo(() => {
    if (selectedPitchValue !== 'all') return [selectedPitchValue];
    return pitchIds;
  }, [pitchIds, selectedPitchValue]);
  const periodStart = range.start.toISOString();
  const periodEnd = range.end.toISOString();

  const load = useCallback(async () => {
    if (isAuthLoading) return;
    const version = ++requestVersion.current;

    if (scopedPitchIds.length === 0) {
      if (version === requestVersion.current) {
        setMatches([]);
        setPayouts([]);
        setExternalBookings([]);
        setErrorMessage('');
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const [matchRows, payoutRows, externalRows] = await Promise.all([
        fetchPagedRows<MatchRow>(
          (from, to) => supabase
            .from('matches')
            .select('id, pitch_id, status, starts_at')
            .in('pitch_id', scopedPitchIds)
            .gte('starts_at', periodStart)
            .lt('starts_at', periodEnd)
            .order('starts_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
          'stats.web.matches'
        ),
        fetchPagedRows<PayoutRow>(
          (from, to) => supabase
            .from('pitch_payouts')
            .select('id, pitch_id, amount, created_at')
            .in('pitch_id', scopedPitchIds)
            .gte('created_at', periodStart)
            .lt('created_at', periodEnd)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
          'stats.web.payouts'
        ),
        fetchPagedRows<ExternalBookingRow>(
          (from, to) => supabase
            .from('pitch_blocks')
            .select('id, pitch_id, start_time, block_type')
            .in('pitch_id', scopedPitchIds)
            .eq('block_type', 'external_booking')
            .gte('start_time', periodStart)
            .lt('start_time', periodEnd)
            .order('start_time', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
          'stats.web.externalBookings'
        ),
      ]);

      if (version === requestVersion.current) {
        setMatches(matchRows);
        setPayouts(payoutRows);
        setExternalBookings(externalRows);
      }
    } catch (error) {
      if (version === requestVersion.current) {
        setMatches([]);
        setPayouts([]);
        setExternalBookings([]);
        setErrorMessage(error instanceof Error ? error.message : t('stats.couldNotLoad'));
      }
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, [isAuthLoading, scopedPitchIds, periodStart, periodEnd, t]);

  useFocusEffect(
    useCallback(() => {
      const currentDayKey = new Date().toDateString();
      if (currentDayKey !== todayKey) setTodayKey(currentDayKey);
      void load();
      return () => { requestVersion.current += 1; };
    }, [load, todayKey])
  );

  const styles = useMemo(() => makeStyles(width), [width]);
  const pitchById = useMemo(() => new Map(pitches.map((pitch) => [pitch.id, pitch] as const)), [pitches]);
  const currentBuckets = useMemo(
    () => makeBuckets(period, range.start, range.end, locale),
    [period, range.start.getTime(), range.end.getTime(), locale]
  );
  const isExternalOnly = reservationType === 'external';
  const showMypitchOutcomes = reservationType !== 'external';

  const mypitchRevenue = useMemo(
    () => payouts.reduce((sum, payout) => sum + Number(payout.amount || 0), 0),
    [payouts]
  );
  const externalRevenue = useMemo(
    () => externalBookings.reduce((sum, booking) => sum + externalMatchPrice(pitchById.get(booking.pitch_id)), 0),
    [externalBookings, pitchById]
  );
  const totalRevenue = mypitchRevenue + externalRevenue;
  const visibleRevenue = reservationType === 'mypitch'
    ? mypitchRevenue
    : reservationType === 'external'
      ? externalRevenue
      : totalRevenue;
  const visibleReservations = reservationType === 'mypitch'
    ? matches.length
    : reservationType === 'external'
      ? externalBookings.length
      : matches.length + externalBookings.length;

  const confirmedCount = matches.filter((match) => match.status === 'confirmed' || match.status === 'completed').length;
  const cancelledCount = matches.filter((match) => match.status === 'cancelled').length;
  const pendingCount = Math.max(0, matches.length - confirmedCount - cancelledCount);
  const activeMatches = matches.length - cancelledCount;
  const confirmationRate = activeMatches > 0 ? (confirmedCount / activeMatches) * 100 : null;

  const revenueByPitch = useMemo(() => {
    const pitchTotals = new Map<string, { revenue: number; mypitch: number; external: number }>();
    scopedPitchIds.forEach((pitchId) => pitchTotals.set(pitchId, { revenue: 0, mypitch: 0, external: 0 }));

    payouts.forEach((payout) => {
      const row = pitchTotals.get(payout.pitch_id);
      if (row) row.mypitch += Number(payout.amount || 0);
    });
    externalBookings.forEach((booking) => {
      const row = pitchTotals.get(booking.pitch_id);
      if (row) row.external += externalMatchPrice(pitchById.get(booking.pitch_id));
    });

    return [...pitchTotals.entries()]
      .map(([pitchId, values]) => ({
        pitch: pitchById.get(pitchId),
        revenue: reservationType === 'mypitch'
          ? values.mypitch
          : reservationType === 'external'
            ? values.external
            : values.mypitch + values.external,
      }))
      .filter((row): row is { pitch: PitchRecord; revenue: number } => Boolean(row.pitch))
      .sort((a, b) => b.revenue - a.revenue);
  }, [scopedPitchIds, payouts, externalBookings, pitchById, reservationType]);

  const chartBuckets: BucketValue[] = useMemo(() => currentBuckets.map((bucket) => {
    const payoutTotal = payouts
      .filter((payout) => {
        const createdAt = new Date(payout.created_at).getTime();
        return createdAt >= bucket.start.getTime() && createdAt < bucket.end.getTime();
      })
      .reduce((sum, payout) => sum + Number(payout.amount || 0), 0);
    const externalTotal = externalBookings
      .filter((booking) => {
        const startsAt = new Date(booking.start_time).getTime();
        return startsAt >= bucket.start.getTime() && startsAt < bucket.end.getTime();
      })
      .reduce((sum, booking) => sum + externalMatchPrice(pitchById.get(booking.pitch_id)), 0);
    return {
      ...bucket,
      amount: reservationType === 'mypitch'
        ? payoutTotal
        : reservationType === 'external'
          ? externalTotal
          : payoutTotal + externalTotal,
    };
  }), [currentBuckets, payouts, externalBookings, pitchById, reservationType]);

  const periodTitle = period === 'week'
    ? t('stats.currentWeek')
    : period === 'month'
      ? t('stats.currentMonth')
      : t('stats.currentYear');
  const periodLabel = periodCaption(period, range, locale);

  function formatMoney(amount: number) {
    return formatEuro(amount, locale);
  }

  if (isAuthLoading || (isLoading && pitchIds.length > 0)) {
    return (
      <Screen maxWidth={1600} style={styles.screen} contentStyle={styles.content} ambientGlows={false}>
        <AppHeader title={t('stats.title')} subtitle={t('stats.webSubtitle')} showBack={false} colors={colors} />
        <ActivityIndicator color={colors.blue} style={styles.loading} />
      </Screen>
    );
  }

  if (pitches.length === 0) {
    return (
      <Screen maxWidth={1600} style={styles.screen} contentStyle={styles.content} ambientGlows={false}>
        <AppHeader title={t('stats.title')} subtitle={t('stats.webSubtitle')} showBack={false} colors={colors} />
        <View style={styles.emptyPanel}><Text style={styles.emptyText}>{t('stats.noPitchLinked')}</Text></View>
      </Screen>
    );
  }

  return (
    <Screen maxWidth={1600} style={styles.screen} contentStyle={styles.content} ambientGlows={false}>
      <AppHeader title={t('stats.title')} subtitle={t('stats.webSubtitle')} showBack={false} colors={colors} />

      <View style={[styles.filterPanel, styles.filterLayout]}>
        <View style={styles.periodGroup} accessibilityLabel={t('stats.periodFilterLabel')}>
          {(['week', 'month', 'year'] as Period[]).map((value) => {
            const label = t(`stats.period${value[0].toUpperCase()}${value.slice(1)}`);
            const active = period === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setPeriod(value)}
                style={[styles.periodButton, active && styles.periodButtonActive]}
              >
                <Text style={[styles.periodText, active && styles.periodTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.filterRight}>
          <View style={styles.pitchSelectWrap}>
            <Ionicons name="football-outline" size={15} color={colors.grey} />
            <WebSelect
              aria-label={t('stats.pitchFilterLabel')}
              value={selectedPitchValue}
              onChange={(event: any) => setSelectedPitch(event.currentTarget.value)}
              style={[styles.pitchSelect, { appearance: 'none', border: 'none', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }] as any}
            >
              <WebOption value="all">{t('stats.allPitches')}</WebOption>
              {pitches.map((pitch) => <WebOption key={pitch.id} value={pitch.id}>{pitch.name}</WebOption>)}
            </WebSelect>
            <Ionicons name="chevron-down" size={14} color={colors.grey} pointerEvents="none" />
          </View>
          <View style={styles.typeGroup} accessibilityLabel={t('stats.bookingTypeLabel')}>
            {([
              ['total', t('stats.filterTotal')],
              ['external', t('stats.filterExternal')],
              ['mypitch', t('stats.filterMypitch')],
            ] as const).map(([value, label]) => {
              const active = reservationType === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setReservationType(value)}
                  style={[styles.typeButton, active && styles.typeButtonActive]}
                >
                  <Text style={[styles.typeText, active && styles.typeTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorPanel}><Text style={styles.errorText}>{errorMessage}</Text></View>
      ) : null}

      <View style={[styles.revenueHero, styles.heroLayout]}>
        <View style={styles.heroSummary}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.heroEyebrow}>{t('stats.totalRevenue')}</Text>
            <View style={styles.periodBadge}><Text style={styles.periodBadgeText}>{periodTitle}</Text></View>
          </View>
          <Text style={styles.heroValue}>{formatMoney(visibleRevenue)}</Text>
          <Text style={styles.periodCaption}>{periodLabel}</Text>
          <Text style={styles.revenueBreakdown}>
            {isExternalOnly
              ? t('stats.externalEstimate')
              : reservationType === 'mypitch'
                ? t('stats.mypitchRevenue')
                : `${t('stats.mypitchRevenue')}: ${formatMoney(mypitchRevenue)}  ·  ${t('stats.externalRevenue')}: ${formatMoney(externalRevenue)}`}
          </Text>
        </View>
        <RevenueChart styles={styles} data={chartBuckets} formatMoney={formatMoney} />
      </View>

      <View style={styles.supportGrid}>
        <MetricCard
          styles={styles}
          label={isExternalOnly ? t('stats.filterExternal') : t('stats.reservations')}
          value={String(visibleReservations)}
          caption={periodLabel}
        />
        {isExternalOnly ? (
          <MetricCard
            styles={styles}
            label={t('stats.averageReservationValue')}
            value={formatMoney(externalBookings.length ? externalRevenue / externalBookings.length : 0)}
            caption={t('stats.externalEstimate')}
          />
        ) : (
          <MetricCard
            styles={styles}
            label={t('stats.confirmationRate')}
            value={confirmationRate === null ? '—' : `${confirmationRate.toFixed(0)}%`}
            caption={t('stats.mypitchOutcomesOnly')}
          />
        )}
        <MetricCard
          styles={styles}
          label={reservationType === 'mypitch' ? t('stats.averageReservationValue') : t('stats.externalRevenue')}
          value={formatMoney(reservationType === 'mypitch'
            ? (matches.length ? mypitchRevenue / matches.length : 0)
            : externalRevenue)}
          caption={reservationType === 'mypitch' ? t('stats.mypitchRevenue') : periodLabel}
        />
      </View>

      <View style={[styles.detailGrid, width < 1120 && styles.detailGridStack]}>
        <View style={[styles.panel, styles.revenueByPitchPanel]}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>{t('stats.revenueByPitch')}</Text>
              <Text style={styles.panelSubtitle}>{periodLabel}</Text>
            </View>
            <Ionicons name="bar-chart-outline" size={18} color={colors.blue} />
          </View>
          {visibleReservations === 0 ? (
            <Text style={styles.noRevenue}>{t('stats.noReservationsInPeriod')}</Text>
          ) : revenueByPitch.length === 0 || revenueByPitch.every((item) => item.revenue <= 0) ? (
            <Text style={styles.noRevenue}>{t('stats.noRevenueYet')}</Text>
          ) : null}
          <View style={styles.pitchRows}>
            {revenueByPitch.map((item) => {
              const share = visibleRevenue > 0 ? Math.max(0, Math.min(100, (item.revenue / visibleRevenue) * 100)) : 0;
              return (
                <View key={item.pitch.id} style={styles.pitchRow}>
                  <Text style={styles.pitchName} numberOfLines={1}>{item.pitch.name}</Text>
                  <View style={styles.track}><View style={[styles.trackFill, { width: `${share}%` }]} /></View>
                  <Text style={styles.pitchRevenue}>{formatMoney(item.revenue)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {showMypitchOutcomes ? (
          <View style={[styles.panel, styles.outcomesPanel]}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>{t('stats.bookingOutcomes')}</Text>
                <Text style={styles.panelSubtitle}>{t('stats.mypitchOutcomesOnly')}</Text>
              </View>
              <Ionicons name="checkmark-done-outline" size={19} color={colors.blue} />
            </View>
            <View style={styles.outcomeRateRow}>
              <View>
                <Text style={styles.outcomeRate}>{confirmationRate === null ? '—' : `${confirmationRate.toFixed(0)}%`}</Text>
                <Text style={styles.panelSubtitle}>{t('stats.confirmationRate')}</Text>
              </View>
              <View style={styles.outcomeCount}><Text style={styles.outcomeCountValue}>{matches.length}</Text><Text style={styles.outcomeCountLabel}>{t('stats.reservations')}</Text></View>
            </View>
            <View style={styles.rateTrack}>
              <View style={[styles.rateFill, { width: `${Math.max(0, Math.min(100, confirmationRate ?? 0))}%` }]} />
            </View>
            <View style={styles.statusList}>
              <StatusRow styles={styles} label={t('stats.confirmedOrCompleted')} count={confirmedCount} tint={colors.blue} />
              <StatusRow styles={styles} label={t('stats.pending')} count={pendingCount} tint="#E9AE60" />
              <StatusRow styles={styles} label={t('stats.cancelled')} count={cancelledCount} tint="#E884AD" />
            </View>
          </View>
        ) : null}
      </View>

      <Text style={styles.calculationNote}>{t('stats.externalEstimateNote')}</Text>
    </Screen>
  );
}

function RevenueChart({
  styles,
  data,
  formatMoney,
}: {
  styles: ReturnType<typeof makeStyles>;
  data: BucketValue[];
  formatMoney: (value: number) => string;
}) {
  const { t } = useTranslation();
  const values = data.map((bucket) => bucket.amount);
  const maximum = Math.max(1, ...values);
  const left = 42;
  const right = 622;
  const baseline = 176;
  const plotHeight = 132;
  const points = values.map((value, index) => ({
    x: data.length < 2 ? (left + right) / 2 : left + (index * (right - left)) / (data.length - 1),
    y: baseline - (Math.max(0, value) / maximum) * plotHeight,
  }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
    : '';
  const gridValues = [1, 0.66, 0.33, 0];

  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartHeading}>
        <Text style={styles.chartTitle}>{t('stats.revenueTrend')}</Text>
        <Ionicons name="trending-up-outline" size={17} color={colors.blue} />
      </View>
      <Svg viewBox="0 0 640 202" role="img" aria-label={t('stats.revenueTrend')} style={styles.svgChart}>
        <SvgDefs>
          <SvgLinearGradient id="statsRevenueArea" x1="0" x2="0" y1="0" y2="1">
            <SvgStop offset="0%" stopColor="#61BAFB" stopOpacity="0.25" />
            <SvgStop offset="100%" stopColor="#61BAFB" stopOpacity="0" />
          </SvgLinearGradient>
        </SvgDefs>
        {gridValues.map((position) => {
          const y = baseline - position * plotHeight;
          return <SvgLine key={position} x1="40" y1={y} x2="630" y2={y} stroke="#263b49" strokeWidth="1" />;
        })}
        {gridValues.map((position) => {
          const y = baseline - position * plotHeight + 4;
          return <SvgText key={`label-${position}`} x="0" y={y} fill="#7291A1" fontSize="10">{formatMoney(maximum * position)}</SvgText>;
        })}
        {areaPath ? <SvgPath d={areaPath} fill="url(#statsRevenueArea)" /> : null}
        {linePath ? <SvgPath d={linePath} fill="none" stroke="#61BAFB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((point, index) => (
          <SvgCircle key={`${data[index]?.label ?? 'point'}-${index}`} cx={point.x} cy={point.y} r="4" fill="#61BAFB" stroke="#101C27" strokeWidth="2" />
        ))}
      </Svg>
      <View style={styles.chartLabels}>
        {data.map((bucket) => (
          <Text key={`${bucket.label}-${bucket.start.toISOString()}`} style={styles.chartLabel} numberOfLines={1}>{bucket.label}</Text>
        ))}
      </View>
    </View>
  );
}

function MetricCard({ styles, label, value, caption }: { styles: ReturnType<typeof makeStyles>; label: string; value: string; caption: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricCaption} numberOfLines={2}>{caption}</Text>
    </View>
  );
}

function StatusRow({ styles, label, count, tint }: { styles: ReturnType<typeof makeStyles>; label: string; count: number; tint: string }) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: tint }]} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusCount}>{count}</Text>
    </View>
  );
}

function makeStyles(width: number) {
  const heroDirection = width >= 940 ? 'row' : 'column';
  return StyleSheet.create({
    screen: { backgroundColor: colors.background },
    content: { paddingTop: 14, paddingBottom: 110 },
    loading: { marginTop: 44 },
    emptyPanel: { marginTop: 22, padding: 20, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    emptyText: { color: colors.grey, fontSize: 14, lineHeight: 21 },
    filterPanel: { marginBottom: 16, padding: 10, borderRadius: 9, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    filterLayout: { flexDirection: width >= 1050 ? 'row' : 'column', alignItems: width >= 1050 ? 'center' : 'stretch', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
    periodGroup: { flexDirection: 'row', alignItems: 'center', alignSelf: width >= 1050 ? 'auto' : 'flex-start', padding: 3, backgroundColor: '#0A141D', borderRadius: 7, borderWidth: 1, borderColor: colors.border },
    periodButton: { minWidth: 62, height: 34, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
    periodButtonActive: { backgroundColor: '#1D3F58' },
    periodText: { color: colors.grey, fontSize: 12, fontWeight: '600' },
    periodTextActive: { color: colors.white, fontWeight: '700' },
    filterRight: { flexDirection: width >= 700 ? 'row' : 'column', alignItems: width >= 700 ? 'center' : 'stretch', flexWrap: 'wrap', gap: 9 },
    pitchSelectWrap: { minWidth: width >= 700 ? 190 : 0, height: 38, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 7, backgroundColor: '#0A141D', borderWidth: 1, borderColor: colors.border },
    pitchSelect: { flex: 1, height: 34, padding: 0, backgroundColor: 'transparent', color: colors.white, fontSize: 12, fontFamily: 'inherit' },
    typeGroup: { flexDirection: 'row', alignItems: 'center', alignSelf: width >= 700 ? 'auto' : 'flex-start', padding: 3, borderRadius: 7, backgroundColor: '#0A141D', borderWidth: 1, borderColor: colors.border },
    typeButton: { minHeight: 32, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
    typeButtonActive: { backgroundColor: '#1D3F58' },
    typeText: { color: colors.grey, fontSize: 12, fontWeight: '600' },
    typeTextActive: { color: colors.white, fontWeight: '700' },
    errorPanel: { marginBottom: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#693d48', backgroundColor: '#291b23' },
    errorText: { color: '#F0A2B1', fontSize: 13, fontWeight: '600' },
    revenueHero: { padding: 20, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    heroLayout: { flexDirection: heroDirection, alignItems: 'center', gap: 22 },
    heroSummary: { flex: 0.82, width: heroDirection === 'column' ? '100%' : undefined, minWidth: 230 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    heroEyebrow: { color: colors.grey, fontSize: 13, fontWeight: '600' },
    periodBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: '#18344A' },
    periodBadgeText: { color: colors.blue, fontSize: 10, fontWeight: '700' },
    heroValue: { marginTop: 8, color: colors.white, fontSize: width < 560 ? 32 : 38, lineHeight: 45, fontWeight: '800', letterSpacing: -0.9, fontVariant: ['tabular-nums'] },
    periodCaption: { marginTop: 2, color: colors.greyDark, fontSize: 12, fontWeight: '600' },
    revenueBreakdown: { marginTop: 12, color: colors.grey, fontSize: 11, lineHeight: 17 },
    chartWrap: { flex: 1.55, width: heroDirection === 'column' ? '100%' : undefined, minWidth: heroDirection === 'row' ? 280 : 0 },
    chartHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    chartTitle: { color: colors.grey, fontSize: 12, fontWeight: '600' },
    svgChart: { width: '100%', height: width < 560 ? 154 : 174, overflow: 'visible' },
    chartLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 2, marginLeft: 30, marginTop: -4 },
    chartLabel: { flex: 1, color: colors.greyDark, textAlign: 'center', fontSize: 10, fontWeight: '600' },
    supportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 13 },
    metricCard: { flex: 1, minWidth: width < 560 ? '100%' : 190, padding: 14, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    metricLabel: { color: colors.grey, fontSize: 12, fontWeight: '600' },
    metricValue: { marginTop: 7, color: colors.white, fontSize: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
    metricCaption: { marginTop: 4, minHeight: 16, color: colors.greyDark, fontSize: 10, lineHeight: 15 },
    detailGrid: { flexDirection: width >= 1120 ? 'row' : 'column', alignItems: 'stretch', gap: 13, marginTop: 13 },
    detailGridStack: { flexDirection: 'column' },
    panel: { padding: 16, borderRadius: 9, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    revenueByPitchPanel: { flex: 1.12, minWidth: 0 },
    outcomesPanel: { flex: 0.88, minWidth: 0 },
    panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
    panelTitle: { color: colors.white, fontSize: 14, fontWeight: '700' },
    panelSubtitle: { marginTop: 4, color: colors.greyDark, fontSize: 11 },
    noRevenue: { marginVertical: 10, color: colors.greyDark, fontSize: 12 },
    pitchRows: { gap: 14, marginTop: 4 },
    pitchRow: { flexDirection: width >= 720 ? 'row' : 'column', alignItems: width >= 720 ? 'center' : 'stretch', gap: 11 },
    pitchName: { width: width >= 720 ? 180 : '100%', color: colors.grey, fontSize: 12, fontWeight: '600' },
    track: { flex: 1, width: '100%', height: 8, overflow: 'hidden', borderRadius: 9, backgroundColor: '#1B303D' },
    trackFill: { height: '100%', borderRadius: 9, backgroundColor: colors.blue },
    pitchRevenue: { minWidth: 78, color: colors.white, textAlign: width >= 720 ? 'right' : 'left', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    outcomeRateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
    outcomeRate: { color: colors.white, fontSize: 29, lineHeight: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
    outcomeCount: { alignItems: 'flex-end' },
    outcomeCountValue: { color: colors.white, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
    outcomeCountLabel: { marginTop: 2, color: colors.greyDark, fontSize: 10 },
    rateTrack: { height: 7, overflow: 'hidden', borderRadius: 7, backgroundColor: '#1B303D' },
    rateFill: { height: '100%', borderRadius: 7, backgroundColor: colors.blue },
    statusList: { gap: 12, marginTop: 16 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusLabel: { flex: 1, color: colors.grey, fontSize: 12 },
    statusCount: { minWidth: 30, color: colors.white, textAlign: 'right', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    calculationNote: { marginTop: 12, color: colors.greyDark, fontSize: 11, lineHeight: 17 },
  });
}
