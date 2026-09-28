import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import AnimatedPressable from './AnimatedPressable';
import { ageFromDateOfBirth } from '../lib/academyData';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont } from '../theme/typography';

export type RosterMember = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  member_kind: 'guardian' | 'player';
  date_of_birth: string | null;
  guardian_id: string | null;
  guardian_id_2: string | null;
};

type FamilyRosterProps = {
  players: RosterMember[];
  guardians: RosterMember[];
  avatars: Record<string, string | null>;
  emptyText: string;
  comingNextText: string;
  mode: 'family' | 'coaches';
  onModeChange: (mode: 'family' | 'coaches') => void;
  familyLabel: string;
  coachesLabel: string;
  onMemberAction?: (member: RosterMember) => void;
};

type FamilyRow = { player: RosterMember | null; guardians: RosterMember[] };

/**
 * Pairs each player with its guardian(s), then appends any guardian with no
 * children of their own — so somebody enrolled with nothing linked to them
 * yet is never simply missing from the list.
 */
function pairFamilies(players: RosterMember[], guardians: RosterMember[]): FamilyRow[] {
  const byId = new Map(guardians.map((g) => [g.id, g] as const));
  const linkedGuardianIds = new Set<string>();

  const rows: FamilyRow[] = players.map((player) => {
    const linked = [player.guardian_id, player.guardian_id_2]
      .map((id) => (id ? byId.get(id) : undefined))
      .filter((g): g is RosterMember => !!g);

    linked.forEach((g) => linkedGuardianIds.add(g.id));

    return { player, guardians: linked };
  });

  guardians
    .filter((g) => !linkedGuardianIds.has(g.id))
    .forEach((g) => rows.push({ player: null, guardians: [g] }));

  return rows;
}

export default function FamilyRoster({
  players,
  guardians,
  avatars,
  emptyText,
  comingNextText,
  mode,
  onModeChange,
  familyLabel,
  coachesLabel,
  onMemberAction,
}: FamilyRosterProps) {
  const { colors } = useAppTheme();
  const styles = makeStyles(colors);
  const rows = useMemo(() => pairFamilies(players, guardians), [players, guardians]);

  return (
    <View>
      <View style={styles.modeRow}>
        <ModeChip
          styles={styles}
          active={mode === 'family'}
          label={familyLabel}
          onPress={() => onModeChange('family')}
        />
        <ModeChip
          styles={styles}
          active={mode === 'coaches'}
          label={coachesLabel}
          onPress={() => onModeChange('coaches')}
        />
      </View>

      {mode === 'coaches' ? (
        <View style={styles.emptyBox}>
          <Ionicons name="construct-outline" size={22} color={colors.greyDark} />
          <Text style={styles.emptyText}>{comingNextText}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="people-outline" size={22} color={colors.greyDark} />
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        rows.map((row) => {
          const primary = row.player ?? row.guardians[0];
          const age = ageFromDateOfBirth(row.player?.date_of_birth ?? null);

          return (
            <View key={row.player?.id ?? row.guardians[0].id} style={styles.row}>
              <View style={styles.side}>
                {row.player ? (
                  <PersonChip
                    styles={styles}
                    colors={colors}
                    name={row.player.full_name}
                    meta={age != null ? `${age}` : null}
                    photo={avatars[row.player.id] ?? null}
                    icon="football-outline"
                    iconColor={colors.blueLight}
                  />
                ) : (
                  <View style={styles.sidePlaceholder} />
                )}
              </View>

              <Ionicons
                name="ellipse"
                size={4}
                color={colors.greyDark}
                style={styles.connector}
              />

              <View style={styles.side}>
                {row.guardians.length > 0 ? (
                  row.guardians.map((guardian) => (
                    <PersonChip
                      key={guardian.id}
                      styles={styles}
                      colors={colors}
                      name={guardian.full_name}
                      meta={null}
                      photo={avatars[guardian.id] ?? null}
                      icon="person"
                      iconColor={colors.greyDark}
                    />
                  ))
                ) : (
                  <View style={styles.sidePlaceholder} />
                )}
              </View>

              {onMemberAction ? (
                <AnimatedPressable
                  style={styles.actionButton}
                  onPress={() => onMemberAction(primary)}
                >
                  <Ionicons name="ellipsis-horizontal" size={15} color={colors.greyDark} />
                </AnimatedPressable>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

function PersonChip({
  styles,
  colors,
  name,
  meta,
  photo,
  icon,
  iconColor,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  name: string;
  meta: string | null;
  photo: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
}) {
  return (
    <View style={styles.person}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.avatar} resizeMode="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Ionicons name={icon} size={15} color={iconColor} />
        </View>
      )}
      <View style={styles.personText}>
        <Text style={styles.personName} numberOfLines={1}>
          {name}
        </Text>
        {meta ? <Text style={styles.personMeta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

function ModeChip({
  styles,
  active,
  label,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      style={[styles.modeChip, active && styles.modeChipActive]}
      onPress={onPress}
    >
      <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    modeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    modeChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    modeChipActive: {
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
    },
    modeChipText: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    modeChipTextActive: {
      color: colors.greenLight,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.sm,
      marginBottom: 8,
    },
    side: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    sidePlaceholder: {
      height: 1,
    },
    connector: {
      marginHorizontal: 6,
    },
    person: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    personText: {
      flex: 1,
      minWidth: 0,
    },
    personName: {
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    personMeta: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '600',
    },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.cardSoft,
    },
    avatarPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardSoft,
      marginLeft: 6,
    },
    emptyBox: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    emptyText: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '600',
      textAlign: 'center',
    },
  });
