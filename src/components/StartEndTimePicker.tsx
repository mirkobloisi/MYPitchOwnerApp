import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { minutesToLabel } from '../lib/slots';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont } from '../theme/typography';
import AnimatedPressable from './AnimatedPressable';
import OptionsModal from './OptionsModal';

type StartEndTimePickerProps = {
  startLabel: string;
  endLabel: string;
  startMinutes: number | null;
  endMinutes: number | null;
  /** Minutes-from-midnight values the field will offer, already filtered for availability and conflicts. */
  startOptions: number[];
  endOptions: number[];
  onChangeStart: (minutes: number) => void;
  onChangeEnd: (minutes: number) => void;
  startPlaceholder: string;
  endPlaceholder: string;
  pickStartTitle: string;
  pickEndTitle: string;
  emptyText?: string;
};

/**
 * A pair of tap-to-open dropdowns for picking a start and end time directly,
 * rather than a length plus a slot from a grid. Each list is whatever the
 * caller already filtered down to what's actually available — this
 * component only renders the choice.
 */
export default function StartEndTimePicker({
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
  pickStartTitle,
  pickEndTitle,
  emptyText,
}: StartEndTimePickerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);

  const options = (openPicker === 'end' ? endOptions : startOptions).map((minutes) => ({
    value: String(minutes),
    label: minutesToLabel(minutes),
  }));

  const activeValue =
    openPicker === 'end'
      ? endMinutes !== null
        ? String(endMinutes)
        : null
      : startMinutes !== null
        ? String(startMinutes)
        : null;

  return (
    <>
      <View style={styles.row}>
        <AnimatedPressable style={styles.field} onPress={() => setOpenPicker('start')}>
          <Text style={styles.fieldLabel}>{startLabel}</Text>
          <Text style={styles.fieldValue}>
            {startMinutes !== null ? minutesToLabel(startMinutes) : startPlaceholder}
          </Text>
        </AnimatedPressable>

        <AnimatedPressable style={styles.field} onPress={() => setOpenPicker('end')}>
          <Text style={styles.fieldLabel}>{endLabel}</Text>
          <Text style={styles.fieldValue}>
            {endMinutes !== null ? minutesToLabel(endMinutes) : endPlaceholder}
          </Text>
        </AnimatedPressable>
      </View>

      <OptionsModal
        visible={openPicker !== null}
        title={openPicker === 'end' ? pickEndTitle : pickStartTitle}
        options={options}
        value={activeValue}
        emptyText={emptyText}
        onSelect={(value) => {
          const minutes = Number(value);
          if (openPicker === 'end') onChangeEnd(minutes);
          else onChangeStart(minutes);
        }}
        onClose={() => setOpenPicker(null)}
      />
    </>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    field: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    fieldLabel: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '800',
    },
    fieldValue: {
      color: colors.white,
      fontSize: scaleFont(18),
      fontWeight: '900',
      marginTop: 2,
    },
  });
