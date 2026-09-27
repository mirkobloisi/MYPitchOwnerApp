import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { minutesToLabel } from '../lib/slots';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont } from '../theme/typography';
import AnimatedPressable from './AnimatedPressable';

const DIAL_SIZE = 288;
const DIAL_RADIUS = DIAL_SIZE / 2;
const TICK_RADIUS = DIAL_RADIUS - 26;
const STEP_MINUTES = 30;
const TICKS_PER_DAY = (24 * 60) / STEP_MINUTES; // 48 half-hour marks around the dial

type ClockTone = 'neutral' | 'blue' | 'pink';

type ClockTimePickerProps = {
  startLabel: string;
  endLabel: string;
  startMinutes: number | null;
  endMinutes: number | null;
  /** Minute-from-midnight marks the dial will let you land on for each end. */
  startOptions: number[];
  endOptions: number[];
  onChangeStart: (minutes: number) => void;
  onChangeEnd: (minutes: number) => void;
  startPlaceholder: string;
  endPlaceholder: string;
  /** Matches the calendar's own color coding: grey for a block, blue for an external booking, pink for a party. */
  tone?: ClockTone;
};

/**
 * A real clock face for picking a start and end time: tap the pill for the
 * one you want to set, then tap its spot on the dial. Only the marks that
 * are actually available light up — everything else (closed hours, times
 * already taken) stays dim and can't be tapped.
 */
export default function ClockTimePicker({
  startLabel,
  endLabel,
  startMinutes,
  endMinutes,
  startOptions,
  endOptions,
  onChangeStart,
  onChangeEnd,
  startPlaceholder,
  endPlaceholder,
  tone = 'neutral',
}: ClockTimePickerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, tone), [colors, tone]);
  const [activeField, setActiveField] = useState<'start' | 'end'>(
    startMinutes === null ? 'start' : 'end'
  );

  const activeOptions = activeField === 'start' ? startOptions : endOptions;
  const activeOptionSet = useMemo(() => new Set(activeOptions), [activeOptions]);
  const inRangeSet = useMemo(() => {
    if (startMinutes === null || endMinutes === null) return new Set<number>();
    const set = new Set<number>();
    for (let m = startMinutes; m <= endMinutes; m += STEP_MINUTES) set.add(m);
    return set;
  }, [startMinutes, endMinutes]);

  function handleSelect(minutes: number) {
    if (activeField === 'start') {
      onChangeStart(minutes);
      // Move straight on to picking the end — a natural two-tap flow.
      setActiveField('end');
    } else {
      onChangeEnd(minutes);
    }
  }

  const ticks = Array.from({ length: TICKS_PER_DAY }, (_, index) => index * STEP_MINUTES);

  return (
    <View>
      <View style={styles.pillRow}>
        <Pill
          styles={styles}
          label={startLabel}
          value={startMinutes !== null ? minutesToLabel(startMinutes) : startPlaceholder}
          active={activeField === 'start'}
          onPress={() => setActiveField('start')}
        />
        <Pill
          styles={styles}
          label={endLabel}
          value={endMinutes !== null ? minutesToLabel(endMinutes) : endPlaceholder}
          active={activeField === 'end'}
          onPress={() => setActiveField('end')}
        />
      </View>

      <View style={styles.dialWrapper}>
        <View style={styles.dial}>
          {[0, 6, 12, 18].map((hour) => (
            <HourLabel key={hour} styles={styles} hour={hour} />
          ))}

          {ticks.map((minutes) => {
            const isStart = minutes === startMinutes;
            const isEnd = minutes === endMinutes;
            const isBoundary = isStart || isEnd;
            const isAvailable = activeOptionSet.has(minutes);
            const isInRange = inRangeSet.has(minutes);

            return (
              <Tick
                key={minutes}
                styles={styles}
                minutes={minutes}
                isBoundary={isBoundary}
                isAvailable={isAvailable}
                isInRange={isInRange}
                onPress={isAvailable ? () => handleSelect(minutes) : undefined}
              />
            );
          })}

          <View style={styles.centerCap} />
        </View>
      </View>
    </View>
  );
}

function Pill({
  styles,
  label,
  value,
  active,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{label}</Text>
      <Text style={[styles.pillValue, active && styles.pillValueActive]}>{value}</Text>
    </AnimatedPressable>
  );
}

function tickPosition(minutes: number, radius: number) {
  // Midnight sits at the top, moving clockwise — the way a clock is read.
  const angle = (minutes / (24 * 60)) * 2 * Math.PI - Math.PI / 2;
  return {
    x: DIAL_RADIUS + radius * Math.cos(angle),
    y: DIAL_RADIUS + radius * Math.sin(angle),
  };
}

function HourLabel({ styles, hour }: { styles: ReturnType<typeof makeStyles>; hour: number }) {
  const { x, y } = tickPosition(hour * 60, TICK_RADIUS - 22);

  return (
    <Text
      style={[
        styles.hourLabel,
        { left: x - 14, top: y - 9 },
      ]}
    >
      {String(hour).padStart(2, '0')}
    </Text>
  );
}

function Tick({
  styles,
  minutes,
  isBoundary,
  isAvailable,
  isInRange,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  minutes: number;
  isBoundary: boolean;
  isAvailable: boolean;
  isInRange: boolean;
  onPress?: () => void;
}) {
  const { x, y } = tickPosition(minutes, TICK_RADIUS);
  const size = isBoundary ? 16 : isInRange ? 11 : 9;

  return (
    <AnimatedPressable
      disabled={!onPress}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.tick,
        {
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        isAvailable ? styles.tickAvailable : styles.tickDisabled,
        isInRange && styles.tickInRange,
        isBoundary && styles.tickBoundary,
      ]}
    >
      {null}
    </AnimatedPressable>
  );
}

const TONE_COLORS: Record<ClockTone, (colors: AppColors) => { accent: string; accentSoft: string; accentBorder: string }> = {
  neutral: (colors) => ({ accent: colors.greySoft, accentSoft: colors.neutralSoft, accentBorder: colors.greyDark }),
  blue: (colors) => ({ accent: colors.blueLight, accentSoft: colors.blueSoft, accentBorder: colors.borderBlue }),
  pink: (colors) => ({ accent: colors.pink, accentSoft: colors.pinkSoft, accentBorder: colors.pink }),
};

const makeStyles = (colors: AppColors, tone: ClockTone) => {
  const { accent, accentSoft, accentBorder } = TONE_COLORS[tone](colors);

  return StyleSheet.create({
    pillRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    pill: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    pillActive: {
      borderColor: accent,
      backgroundColor: accentSoft,
    },
    pillLabel: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '800',
    },
    pillLabelActive: {
      color: accent,
    },
    pillValue: {
      color: colors.white,
      fontSize: scaleFont(18),
      fontWeight: '900',
      marginTop: 2,
    },
    pillValueActive: {
      color: colors.white,
    },
    dialWrapper: {
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    dial: {
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      borderRadius: DIAL_SIZE / 2,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    centerCap: {
      position: 'absolute',
      left: DIAL_RADIUS - 3,
      top: DIAL_RADIUS - 3,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.greyDark,
    },
    hourLabel: {
      position: 'absolute',
      width: 28,
      textAlign: 'center',
      color: colors.greyDark,
      fontSize: scaleFont(11),
      fontWeight: '700',
    },
    tick: {
      position: 'absolute',
      borderWidth: 1,
    },
    tickAvailable: {
      backgroundColor: accentSoft,
      borderColor: accentBorder,
    },
    tickDisabled: {
      backgroundColor: colors.neutralSoft,
      borderColor: colors.border,
    },
    tickInRange: {
      backgroundColor: accent,
      borderColor: accent,
    },
    tickBoundary: {
      backgroundColor: accent,
      borderColor: colors.white,
      borderWidth: 2,
    },
  });
};
