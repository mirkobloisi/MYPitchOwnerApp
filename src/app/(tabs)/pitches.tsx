import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';

import AnimatedPressable from '../../components/AnimatedPressable';
import AppHeader from '../../components/AppHeader';
import Screen from '../../components/Screen';
import StatusBadge from '../../components/StatusBadge';
import { useTranslation } from '../../i18n/LanguageContext';
import { PitchRecord, useAuth } from '../../lib/auth';
import { AppColors } from '../../theme/palettes';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/layout';
import { scaleFont, scaleLine } from '../../theme/typography';

const STATUS_TONE: Record<PitchRecord['status'], 'green' | 'orange' | 'red'> = {
  active: 'green',
  paused: 'orange',
  archived: 'red',
};

// Mirrors MYPitchAdminApp's CANONICAL_FACILITIES list — matched by exact
// label (case-insensitive) so a service set by super admin shows the same
// icon here. Anything else (a custom service) still shows, just without one.
const CANONICAL_FACILITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  parking: 'car-outline',
  shower: 'water-outline',
  bar: 'wine-outline',
  coffee: 'cafe-outline',
  gloves: 'hand-left-outline',
  bibs: 'shirt-outline',
  shoes: 'footsteps-outline',
  'first aid': 'medkit-outline',
  'hot food': 'restaurant-outline',
  'cold food': 'ice-cream-outline',
};

function facilityIcon(label: string): keyof typeof Ionicons.glyphMap | null {
  return CANONICAL_FACILITY_ICONS[label.trim().toLowerCase()] ?? null;
}

export default function PitchesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { pitches, activePitch, setActivePitchId } = useAuth();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const STATUS_LABEL: Record<PitchRecord['status'], string> = {
    active: t('pitches.statusActive'),
    paused: t('pitches.statusPaused'),
    archived: t('pitches.statusArchived'),
  };

  return (
    <Screen>
      <AppHeader
        title={t('pitches.title')}
        subtitle={t('pitches.subtitle')}
        showBack={false}
      />

      {pitches.length === 0 ? (
        <Text style={styles.emptyText}>{t('pitches.noPitches')}</Text>
      ) : (
        pitches.map((pitch) => {
          const isActive = pitch.id === activePitch?.id;

          return (
            <View key={pitch.id} style={[styles.card, isActive && styles.cardActive]}>
              <View style={styles.headerRow}>
                {pitch.image_urls && pitch.image_urls.length > 0 ? (
                  <Image source={{ uri: pitch.image_urls[0] }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbFallback}>
                    <Ionicons name="football-outline" size={18} color={colors.greenLight} />
                  </View>
                )}

                <View style={styles.headerText}>
                  <Text style={styles.pitchName} numberOfLines={1}>
                    {pitch.name}
                  </Text>
                  <Text style={styles.pitchMeta} numberOfLines={1}>
                    {pitch.city}
                    {pitch.area ? ` · ${pitch.area}` : ''}
                  </Text>
                </View>

                <StatusBadge label={STATUS_LABEL[pitch.status]} tone={STATUS_TONE[pitch.status]} compact />
              </View>

              {pitches.length > 1 && (
                <View style={styles.activeRow}>
                  {isActive ? (
                    <View style={styles.activePill}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.greenLight} />
                      <Text style={styles.activePillText}>{t('pitches.showingInAgenda')}</Text>
                    </View>
                  ) : (
                    <AnimatedPressable
                      pressedScale={0.97}
                      style={styles.setActiveButton}
                      onPress={() => setActivePitchId(pitch.id)}
                    >
                      <Text style={styles.setActiveButtonText}>{t('pitches.manageInAgenda')}</Text>
                    </AnimatedPressable>
                  )}
                </View>
              )}

              <View style={styles.detailGrid}>
                <DetailRow styles={styles} icon="people-outline" label={t('pitches.formatLabel')}>
                  {pitch.format}
                </DetailRow>
                <DetailRow styles={styles} icon="cash-outline" label={t('pitches.priceLabel')}>
                  {t('pitches.perHour', { price: Number(pitch.price_per_hour).toFixed(2) })}
                </DetailRow>
                <DetailRow styles={styles} icon="time-outline" label={t('pitches.bookingSettingsSummaryLabel')}>
                  {[...(pitch.allowed_durations_minutes ?? [pitch.duration_minutes])]
                    .sort((a, b) => a - b)
                    .map((minutes) => t('pitches.minutesSuffix', { minutes }))
                    .join(', ')}
                </DetailRow>
                {pitch.pitch_type ? (
                  <DetailRow styles={styles} icon="business-outline" label={t('pitches.typeLabel')}>
                    {pitch.pitch_type}
                  </DetailRow>
                ) : null}
              </View>

              <View style={styles.actionsRow}>
                {pitch.maps_url ? (
                  <AnimatedPressable
                    pressedScale={0.97}
                    style={styles.smallLinkButton}
                    onPress={() => Linking.openURL(pitch.maps_url as string)}
                  >
                    <Ionicons name="map-outline" size={12} color={colors.greenLight} />
                    <Text style={styles.smallLinkText}>{t('pitches.openInMaps')}</Text>
                  </AnimatedPressable>
                ) : null}

                <AnimatedPressable
                  pressedScale={0.97}
                  style={styles.smallLinkButton}
                  onPress={() => router.push({ pathname: '/booking-settings' as any, params: { pitchId: pitch.id } })}
                >
                  <Ionicons name="options-outline" size={12} color={colors.greenLight} />
                  <Text style={styles.smallLinkText}>{t('pitches.manageBookingSettings')}</Text>
                </AnimatedPressable>
              </View>

              {pitch.description ? (
                <Text style={styles.description} numberOfLines={2}>
                  {pitch.description}
                </Text>
              ) : null}

              {pitch.facilities && pitch.facilities.length > 0 ? (
                <View style={styles.facilitiesRow}>
                  {pitch.facilities.map((facility) => {
                    const icon = facilityIcon(facility);
                    return (
                      <View key={facility} style={styles.facilityChip}>
                        {icon ? (
                          <Ionicons
                            name={icon}
                            size={10}
                            color={colors.greenLight}
                            style={styles.facilityChipIcon}
                          />
                        ) : null}
                        <Text style={styles.facilityChipText}>{facility}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      <View style={styles.noteCard}>
        <Ionicons name="information-circle-outline" size={16} color={colors.blueLight} />
        <Text style={styles.noteText}>{t('pitches.noteText')}</Text>
      </View>
    </Screen>
  );
}

function DetailRow({
  styles,
  icon,
  label,
  children,
}: {
  styles: ReturnType<typeof makeStyles>;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  children: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={14} color={colors.grey} style={styles.detailIcon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{children}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    emptyText: {
      color: colors.greyDark,
      fontSize: scaleFont(13),
      fontWeight: '600',
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    card: {
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm,
      marginBottom: spacing.sm,
    },
    cardActive: {
      borderColor: colors.borderGreen,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    thumb: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
    },
    thumbFallback: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
      minWidth: 0,
    },
    pitchName: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '900',
    },
    pitchMeta: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '600',
      marginTop: 1,
    },
    activeRow: {
      marginTop: 6,
    },
    activePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      borderRadius: radius.round,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    activePillText: {
      color: colors.greenLight,
      fontSize: scaleFont(10),
      fontWeight: '800',
    },
    setActiveButton: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.round,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    setActiveButtonText: {
      color: colors.grey,
      fontSize: scaleFont(10),
      fontWeight: '800',
    },
    detailGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 8,
      gap: 6,
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    smallLinkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
      borderRadius: radius.round,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    smallLinkText: {
      color: colors.greenLight,
      fontSize: scaleFont(10.5),
      fontWeight: '800',
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 5,
      flexBasis: '48%',
      flexGrow: 1,
    },
    detailIcon: {
      marginTop: 1,
    },
    detailLabel: {
      color: colors.greyDark,
      fontSize: scaleFont(9.5),
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    detailValue: {
      color: colors.white,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginTop: 1,
    },
    description: {
      marginTop: 6,
      color: colors.grey,
      fontSize: scaleFont(11.5),
      fontWeight: '500',
      lineHeight: scaleLine(16),
    },
    facilitiesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
      marginTop: 6,
    },
    facilityChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    facilityChipIcon: {
      marginTop: -1,
    },
    facilityChipText: {
      color: colors.grey,
      fontSize: scaleFont(10),
      fontWeight: '700',
    },
    noteCard: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      backgroundColor: colors.blueSoft,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderBlue,
      padding: spacing.md,
      marginBottom: spacing.xl,
    },
    noteText: {
      flex: 1,
      color: colors.blueLight,
      fontSize: scaleFont(12),
      fontWeight: '600',
      lineHeight: scaleLine(17),
    },
  });
