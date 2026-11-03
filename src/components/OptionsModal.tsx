import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import AnimatedPressable from './AnimatedPressable';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont } from '../theme/typography';

export type PickerOption = {
  value: string;
  label: string;
  hint?: string | null;
};

type OptionsModalProps = {
  visible: boolean;
  title: string;
  options: PickerOption[];
  value: string | null;
  emptyText?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  colors?: AppColors;
};

/** One tap-to-choose list, used for times, durations and pitches alike. */
export default function OptionsModal({
  visible,
  title,
  options,
  value,
  emptyText,
  onSelect,
  onClose,
  colors: colorsOverride,
}: OptionsModalProps) {
  const { colors: themeColors } = useAppTheme();
  const colors = colorsOverride ?? themeColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <AnimatedPressable style={styles.iconButton} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.grey} />
            </AnimatedPressable>
          </View>

          {options.length === 0 ? (
            <Text style={styles.empty}>{emptyText ?? '—'}</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const isSelected = option.value === value;

                return (
                  <AnimatedPressable
                    key={option.value}
                    style={[styles.row, isSelected && styles.rowSelected]}
                    onPress={() => {
                      onSelect(option.value);
                      onClose();
                    }}
                  >
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}>
                        {option.label}
                      </Text>
                      {option.hint ? <Text style={styles.rowHint}>{option.hint}</Text> : null}
                    </View>

                    {isSelected ? (
                      <Ionicons name="checkmark" size={17} color={colors.greenLight} />
                    ) : null}
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '75%',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '800',
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardSoft,
    },
    list: {
      flexGrow: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      borderRadius: radius.md,
      marginBottom: 6,
      backgroundColor: colors.cardSoft,
    },
    rowSelected: {
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    rowLabel: {
      color: colors.greySoft,
      fontSize: scaleFont(14),
      fontWeight: '700',
    },
    rowLabelSelected: {
      color: colors.greenLight,
      fontWeight: '800',
    },
    rowHint: {
      color: colors.greyDark,
      fontSize: scaleFont(12),
      fontWeight: '600',
      marginTop: 2,
    },
    empty: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '600',
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });
