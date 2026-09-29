import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from 'react-native';

import AnimatedPressable from '../../components/AnimatedPressable';
import AppButton from '../../components/AppButton';
import AppHeader from '../../components/AppHeader';
import Screen from '../../components/Screen';
import { useTranslation } from '../../i18n/LanguageContext';
import { useAcademyRealtime } from '../../lib/academyRealtime';
import { useAuth } from '../../lib/auth';
import {
  AcademyCounts,
  AcademyRow,
  createAcademy,
  fetchAcademyCounts,
  fetchMyAcademies,
} from '../../lib/academyData';
import { AppColors } from '../../theme/palettes';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/layout';
import { scaleFont } from '../../theme/typography';

export default function AcademyScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { pitchOwner } = useAuth();
  const { unread } = useAcademyRealtime();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [academies, setAcademies] = useState<AcademyRow[]>([]);
  const [academyCounts, setAcademyCounts] = useState<Record<string, AcademyCounts>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    const rows = await fetchMyAcademies();
    setAcademies(rows);
    fetchAcademyCounts(rows.map((row) => row.id)).then(setAcademyCounts);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleCreate() {
    const name = newName.trim();
    if (!name || !pitchOwner?.id || isCreating) return;

    setIsCreating(true);
    setErrorMessage('');

    const { error } = await createAcademy({ pitchOwnerId: pitchOwner.id, name, city: newCity });
    setIsCreating(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setNewName('');
    setNewCity('');
    setShowCreate(false);
    load();
  }

  // Main pinned first, then the rest in the order they were created.
  const sortedAcademies = useMemo(
    () => [...academies].sort((a, b) => Number(b.is_main) - Number(a.is_main)),
    [academies]
  );

  return (
    <Screen maxWidth={900}>
      <AppHeader
        title={t('academy.title')}
        subtitle={t('academy.subtitle')}
        showBack={false}
      />

      {showCreate ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('academy.createTitle')}</Text>

          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder={t('academy.namePlaceholder')}
            placeholderTextColor={colors.greyDark}
          />
          <TextInput
            style={styles.input}
            value={newCity}
            onChangeText={setNewCity}
            placeholder={t('academy.cityPlaceholder')}
            placeholderTextColor={colors.greyDark}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.formActions}>
            <AppButton
              title={t('common.cancel')}
              variant="outline"
              fullWidth={false}
              style={styles.formButton}
              onPress={() => {
                setShowCreate(false);
                setErrorMessage('');
              }}
            />
            <AppButton
              title={t('academy.createAction')}
              loading={isCreating}
              disabled={!newName.trim()}
              fullWidth={false}
              style={styles.formButton}
              onPress={handleCreate}
            />
          </View>
        </View>
      ) : (
        <AnimatedPressable style={styles.createButton} hoverScale={1.02} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={18} color={colors.blackText} />
          <Text style={styles.createButtonText}>{t('academy.createAction')}</Text>
        </AnimatedPressable>
      )}

      {isLoading ? (
        <ActivityIndicator color={colors.greenLight} style={styles.loading} />
      ) : sortedAcademies.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="school-outline" size={26} color={colors.greyDark} />
          <Text style={styles.emptyText}>{t('academy.noAcademies')}</Text>
        </View>
      ) : (
        sortedAcademies.map((item) => {
          const counts = academyCounts[item.id];

          return (
            <AnimatedPressable
              key={item.id}
              pressedScale={0.98}
              hoverScale={1.01}
              onPress={() =>
                router.push({ pathname: '/academy-details', params: { academyId: item.id } } as any)
              }
            >
              <View style={styles.academyCard}>
                {item.logo_url ? (
                  <Image source={{ uri: item.logo_url }} style={styles.academyLogo} resizeMode="cover" />
                ) : (
                  <View style={[styles.academyLogo, styles.academyLogoPlaceholder]}>
                    <Ionicons name="school" size={22} color={colors.greenLight} />
                  </View>
                )}

                <View style={styles.academyCardInfo}>
                  <View style={styles.academyCardNameRow}>
                    <Text style={styles.academyCardName}>{item.name}</Text>
                    {item.is_main ? (
                      <View style={styles.mainBadge}>
                        <Ionicons name="star" size={9} color={colors.blackText} />
                        <Text style={styles.mainBadgeText}>{t('academy.mainBadge')}</Text>
                      </View>
                    ) : null}
                  </View>
                  {item.city ? <Text style={styles.academyCardCity}>{item.city}</Text> : null}

                  <View style={styles.academyCardStats}>
                    <Text style={styles.academyCardStat}>
                      {t('academy.playersCount').replace('{count}', String(counts?.players ?? 0))}
                    </Text>
                    <Text style={styles.academyCardStat}>
                      {t('academy.parentsCount').replace('{count}', String(counts?.parents ?? 0))}
                    </Text>
                    {counts?.pending ? (
                      <Text style={styles.academyCardPending}>
                        {t('academy.pendingCount').replace('{count}', String(counts.pending))}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.greyDark} />
              </View>
            </AnimatedPressable>
          );
        })
      )}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    loading: {
      marginTop: spacing.xl,
    },
    headerBell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.greenLight,
    },
    headerBellText: {
      color: colors.blackText,
      fontSize: 11,
      fontWeight: '900',
    },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    cardTitle: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '800',
      marginBottom: spacing.sm,
    },
    input: {
      backgroundColor: colors.cardSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '600',
      marginBottom: spacing.sm,
    },
    formActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: 4,
    },
    formButton: {
      minWidth: 130,
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginBottom: spacing.sm,
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.greenLight,
      borderRadius: radius.lg,
      paddingVertical: 13,
      marginBottom: spacing.md,
    },
    createButtonText: {
      color: colors.blackText,
      fontSize: scaleFont(14),
      fontWeight: '900',
    },
    academyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: 10,
    },
    academyLogo: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
    },
    academyLogoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.greenSoft,
    },
    academyCardInfo: {
      flex: 1,
      minWidth: 0,
    },
    academyCardNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    academyCardName: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '800',
    },
    mainBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: radius.round,
      backgroundColor: colors.greenLight,
    },
    mainBadgeText: {
      color: colors.blackText,
      fontSize: 9,
      fontWeight: '900',
    },
    academyCardCity: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      marginTop: 2,
    },
    academyCardStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: 6,
    },
    academyCardStat: {
      color: colors.greyDark,
      fontSize: scaleFont(11),
      fontWeight: '800',
    },
    academyCardPending: {
      color: colors.orange,
      fontSize: scaleFont(11),
      fontWeight: '800',
    },
    emptyBox: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
    },
    emptyText: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '600',
      textAlign: 'center',
    },
  });
