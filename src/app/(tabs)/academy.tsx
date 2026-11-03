import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedPressable from '../../components/AnimatedPressable';
import AppButton from '../../components/AppButton';
import AppHeader from '../../components/AppHeader';
import Screen from '../../components/Screen';
import AcademyFirstRunTutorial from '../../components/AcademyFirstRunTutorial';
import OptionsModal, { PickerOption } from '../../components/OptionsModal';
import WebAcademyDashboard from '../../components/WebAcademyDashboard';
import WebInboxPanel from '../../components/WebInboxPanel';
import { useTranslation } from '../../i18n/LanguageContext';
import { useAcademyRealtime } from '../../lib/academyRealtime';
import { useAuth } from '../../lib/auth';
import {
  AcademyCounts,
  AcademyRow,
  SessionRow,
  createAcademy,
  fetchAcademyCounts,
  fetchMyAcademies,
  fetchSessions,
} from '../../lib/academyData';
import { AppColors, weeklineColors } from '../../theme/palettes';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/layout';
import { scaleFont } from '../../theme/typography';

type AcademyTutorialProgress = { academyId: string; step: number; completed?: boolean };

export default function AcademyScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { pitchOwner } = useAuth();
  const { unread } = useAcademyRealtime();
  const { width } = useWindowDimensions();
  const tabletApp = Platform.OS !== 'web' && width >= 768;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [academies, setAcademies] = useState<AcademyRow[]>([]);
  const [academiesOwnerId, setAcademiesOwnerId] = useState<string | null>(null);
  const [academyCounts, setAcademyCounts] = useState<Record<string, AcademyCounts>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedAcademyId, setSelectedAcademyId] = useState<string | null>(null);
  const [mobileMatches, setMobileMatches] = useState<SessionRow[]>([]);
  const [isLoadingMobileMatches, setIsLoadingMobileMatches] = useState(false);
  const [showAcademyPicker, setShowAcademyPicker] = useState(false);
  const [mobileAcademyTab, setMobileAcademyTab] = useState<'overview' | 'notifications'>('overview');
  const [tutorialProgress, setTutorialProgress] = useState<AcademyTutorialProgress | null>(null);
  const academyLoadRequest = useRef(0);
  const tutorialStorageKey = pitchOwner?.id ? `mypitch:academy-first-run:${pitchOwner.id}` : null;

  const load = useCallback(async () => {
    const requestId = ++academyLoadRequest.current;
    const ownerId = pitchOwner?.id;
    if (!ownerId) {
      setAcademies([]);
      setAcademiesOwnerId(null);
      setAcademyCounts({});
      setIsLoading(true);
      return;
    }

    setIsLoading(true);
    const rows = await fetchMyAcademies(ownerId);
    if (requestId !== academyLoadRequest.current) return;
    setAcademiesOwnerId(ownerId);
    setAcademies(rows);
    setAcademyCounts({});
    setIsLoading(false);
    fetchAcademyCounts(rows.map((row) => row.id)).then((counts) => {
      if (requestId === academyLoadRequest.current) setAcademyCounts(counts);
    });
  }, [pitchOwner?.id]);

  useEffect(() => {
    let active = true;
    setTutorialProgress(null);
    if (!tutorialStorageKey) return () => { active = false; };

    AsyncStorage.getItem(tutorialStorageKey)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as AcademyTutorialProgress;
        if (parsed?.academyId && !parsed.completed) setTutorialProgress(parsed);
      })
      .catch(() => undefined);

    return () => { active = false; };
  }, [tutorialStorageKey]);

  const saveTutorialProgress = useCallback(async (progress: AcademyTutorialProgress) => {
    setTutorialProgress(progress.completed ? null : progress);
    if (tutorialStorageKey) {
      try { await AsyncStorage.setItem(tutorialStorageKey, JSON.stringify(progress)); } catch { /* tutorial can be restarted manually if storage is unavailable */ }
    }
  }, [tutorialStorageKey]);

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

    const { data, error, isFirstAcademy } = await createAcademy({ pitchOwnerId: pitchOwner.id, name, city: newCity });
    setIsCreating(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setNewName('');
    setNewCity('');
    setShowCreate(false);
    if (isFirstAcademy && data?.id) {
      await saveTutorialProgress({ academyId: data.id, step: 0 });
    }
    await load();
  }

  // Main pinned first, then the rest in the order they were created.
  const sortedAcademies = useMemo(
    () => academiesOwnerId === pitchOwner?.id ? [...academies].sort((a, b) => Number(b.is_main) - Number(a.is_main)) : [],
    [academies, academiesOwnerId, pitchOwner?.id]
  );
  const ownerAcademyLoading = isLoading || !pitchOwner?.id || academiesOwnerId !== pitchOwner.id;
  const selectedAcademy = sortedAcademies.find((item) => item.id === selectedAcademyId) ?? sortedAcademies[0] ?? null;

  useEffect(() => {
    if (!selectedAcademyId && sortedAcademies[0]) setSelectedAcademyId(sortedAcademies[0].id);
    if (selectedAcademyId && !sortedAcademies.some((item) => item.id === selectedAcademyId)) {
      setSelectedAcademyId(sortedAcademies[0]?.id ?? null);
    }
  }, [selectedAcademyId, sortedAcademies]);

  useEffect(() => {
    if (!selectedAcademy) {
      setMobileMatches([]);
      setIsLoadingMobileMatches(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingMobileMatches(true);
    fetchSessions(selectedAcademy.id, 'match')
      .then((rows) => { if (isCurrent) setMobileMatches(rows.filter((row) => !row.is_cancelled)); })
      .finally(() => { if (isCurrent) setIsLoadingMobileMatches(false); });
    return () => { isCurrent = false; };
  }, [selectedAcademy?.id]);

  const tutorialAcademy = tutorialProgress && sortedAcademies.find((academy) => academy.id === tutorialProgress.academyId);

  if (Platform.OS !== 'web' && !tabletApp) {
    return (
      <>
        <MobileAcademyOverview
          academies={sortedAcademies}
          counts={academyCounts}
          selectedAcademy={selectedAcademy}
          matches={mobileMatches}
          unreadCount={unread.players + unread.parents + unread.messages}
          isLoading={ownerAcademyLoading}
          isLoadingMatches={isLoadingMobileMatches}
          pickerVisible={showAcademyPicker}
          onOpenPicker={() => setShowAcademyPicker(true)}
          onClosePicker={() => setShowAcademyPicker(false)}
          onSelectAcademy={setSelectedAcademyId}
          onCreateAcademy={() => { setShowCreate(true); setErrorMessage(''); }}
          createVisible={showCreate}
          createName={newName}
          createCity={newCity}
          createError={errorMessage}
          isCreating={isCreating}
          onNameChange={setNewName}
          onCityChange={setNewCity}
          onCancelCreate={() => { setShowCreate(false); setErrorMessage(''); }}
          onSubmitCreate={handleCreate}
          onOpenAcademy={(academyId) => router.push({ pathname: '/academy-details', params: { academyId } } as any)}
          mobileTab={mobileAcademyTab}
          onSelectMobileTab={setMobileAcademyTab}
          t={t}
        />
        <AcademyFirstRunTutorial
          visible={!!tutorialAcademy && !showCreate}
          step={tutorialProgress?.step ?? 0}
          academyName={tutorialAcademy?.name ?? ''}
          onStepChange={(step) => tutorialProgress && saveTutorialProgress({ ...tutorialProgress, step })}
          onSkip={() => tutorialProgress && saveTutorialProgress({ ...tutorialProgress, completed: true })}
          onOpenAcademy={() => {
            if (!tutorialProgress || !tutorialAcademy) return;
            saveTutorialProgress({ ...tutorialProgress, completed: true });
            router.push({ pathname: '/academy-details', params: { academyId: tutorialAcademy.id } } as any);
          }}
          t={t}
        />
      </>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <>
      <WebAcademyDashboard
        academies={sortedAcademies}
        counts={academyCounts}
        loading={ownerAcademyLoading}
        onRefresh={load}
        createForm={{
          visible: showCreate,
          isFirstAcademy: sortedAcademies.length === 0,
          name: newName,
          city: newCity,
          error: errorMessage,
          busy: isCreating,
          onNameChange: setNewName,
          onCityChange: setNewCity,
          onCreate: handleCreate,
          onStartCreate: () => { setShowCreate(true); setErrorMessage(''); },
          onCancel: () => { setShowCreate(false); setErrorMessage(''); },
        }}
      />
      <AcademyFirstRunTutorial
        visible={!!tutorialAcademy && !showCreate}
        step={tutorialProgress?.step ?? 0}
        academyName={tutorialAcademy?.name ?? ''}
        onStepChange={(step) => tutorialProgress && saveTutorialProgress({ ...tutorialProgress, step })}
        onSkip={() => tutorialProgress && saveTutorialProgress({ ...tutorialProgress, completed: true })}
        onOpenAcademy={() => {
          if (!tutorialProgress || !tutorialAcademy) return;
          saveTutorialProgress({ ...tutorialProgress, completed: true });
          router.push({ pathname: '/academy-details', params: { academyId: tutorialAcademy.id } } as any);
        }}
        t={t}
      />
      </>
    );
  }

  return (
    <Screen maxWidth={900}>
      <AppHeader
        title={t('academy.title')}
        subtitle={t('academy.subtitle')}
        showBack={false}
      />

      {showCreate ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{academies.length === 0 ? t('academy.firstAcademyTitle') : t('academy.createTitle')}</Text>
          {academies.length === 0 ? <Text style={styles.emptyText}>{t('academy.firstAcademyIntro')}</Text> : null}

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
              title={academies.length === 0 ? t('academy.createMainAction') : t('academy.createAction')}
              loading={isCreating}
              disabled={!newName.trim()}
              fullWidth={false}
              style={styles.formButton}
              onPress={handleCreate}
            />
          </View>
        </View>
      ) : sortedAcademies.length > 0 ? (
        <AnimatedPressable style={styles.createButton} hoverScale={1.02} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={18} color={colors.blackText} />
          <Text style={styles.createButtonText}>{t('academy.createAction')}</Text>
        </AnimatedPressable>
      ) : null}

      {ownerAcademyLoading ? (
        <ActivityIndicator color={colors.greenLight} style={styles.loading} />
      ) : sortedAcademies.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="school-outline" size={26} color={colors.greyDark} />
          <Text style={styles.cardTitle}>{t('academy.firstAcademyTitle')}</Text>
          <Text style={styles.emptyText}>{t('academy.firstAcademyIntro')}</Text>
          <AppButton title={t('academy.createMainAction')} onPress={() => setShowCreate(true)} />
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
      <AcademyFirstRunTutorial
        visible={!!tutorialAcademy && !showCreate}
        step={tutorialProgress?.step ?? 0}
        academyName={tutorialAcademy?.name ?? ''}
        onStepChange={(step) => tutorialProgress && saveTutorialProgress({ ...tutorialProgress, step })}
        onSkip={() => tutorialProgress && saveTutorialProgress({ ...tutorialProgress, completed: true })}
        onOpenAcademy={() => {
          if (!tutorialProgress || !tutorialAcademy) return;
          saveTutorialProgress({ ...tutorialProgress, completed: true });
          router.push({ pathname: '/academy-details', params: { academyId: tutorialAcademy.id } } as any);
        }}
        t={t}
      />
      </Screen>
  );
}

function MobileAcademyOverview({
  academies, counts, selectedAcademy, matches, unreadCount, isLoading, isLoadingMatches,
  pickerVisible, onOpenPicker, onClosePicker, onSelectAcademy, onCreateAcademy,
  createVisible, createName, createCity, createError, isCreating, onNameChange, onCityChange, onCancelCreate, onSubmitCreate, onOpenAcademy,
  mobileTab, onSelectMobileTab, t,
}: {
  academies: AcademyRow[];
  counts: Record<string, AcademyCounts>;
  selectedAcademy: AcademyRow | null;
  matches: SessionRow[];
  unreadCount: number;
  isLoading: boolean;
  isLoadingMatches: boolean;
  pickerVisible: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onSelectAcademy: (id: string) => void;
  onCreateAcademy: () => void;
  createVisible: boolean;
  createName: string;
  createCity: string;
  createError: string;
  isCreating: boolean;
  onNameChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onCancelCreate: () => void;
  onSubmitCreate: () => void;
  onOpenAcademy: (id: string) => void;
  mobileTab: 'overview' | 'notifications';
  onSelectMobileTab: (tab: 'overview' | 'notifications') => void;
  t: (key: string) => string;
}) {
  const styles = useMemo(() => makeMobileStyles(weeklineColors), []);
  const academyOptions: PickerOption[] = academies.map((academy) => ({
    value: academy.id,
    label: academy.name,
    hint: [academy.age_group, academy.city].filter(Boolean).join(' · ') || (academy.is_main ? t('academy.mainBadge') : null),
  }));
  const nextMatch = matches
    .map((match) => ({ match, date: nextScheduledDate(match) }))
    .filter((entry): entry is { match: SessionRow; date: Date } => !!entry.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null;
  const academyCounts = selectedAcademy ? counts[selectedAcademy.id] : undefined;
  const countLabel = (key: string) => t(key).replace('{count}', '').trim();
  const openAcademy = () => { if (selectedAcademy) onOpenAcademy(selectedAcademy.id); };

  return (
    <Screen
      scroll={mobileTab === 'overview'}
      maxWidth={900}
      style={styles.screen}
      contentStyle={[styles.content, mobileTab === 'notifications' && styles.notificationContent]}
      ambientGlows={false}
      background={(
        <LinearGradient
          pointerEvents="none"
          colors={[weeklineColors.background, '#0B1C29', weeklineColors.background]}
          locations={[0, 0.56, 1]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t('academy.title')}</Text>
          <Text style={styles.subtitle}>{t('academy.subtitle')}</Text>
        </View>
        <Pressable
          style={styles.headerBell}
          onPress={() => onSelectMobileTab('notifications')}
          accessibilityRole="button"
          accessibilityLabel={t('inbox.notifications')}
        >
          <Ionicons name="notifications-outline" size={20} color={weeklineColors.blueLight} />
          {unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
        </Pressable>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        <Pressable style={[styles.tab, mobileTab === 'overview' && styles.tabActive]} onPress={() => onSelectMobileTab('overview')} accessibilityRole="tab" accessibilityState={{ selected: mobileTab === 'overview' }}>
          <Ionicons name="school-outline" size={16} color={mobileTab === 'overview' ? weeklineColors.blueLight : weeklineColors.grey} />
          <Text style={[styles.tabText, mobileTab === 'overview' && styles.tabTextActive]}>{t('academy.dashboardOverview')}</Text>
        </Pressable>
        <Pressable style={[styles.tab, mobileTab === 'notifications' && styles.tabActive]} onPress={() => onSelectMobileTab('notifications')} accessibilityRole="tab" accessibilityState={{ selected: mobileTab === 'notifications' }}>
          <Ionicons name="notifications-outline" size={16} color={mobileTab === 'notifications' ? weeklineColors.blueLight : weeklineColors.grey} />
          <Text style={[styles.tabText, mobileTab === 'notifications' && styles.tabTextActive]}>{t('inbox.notifications')}</Text>
          {unreadCount > 0 ? <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
        </Pressable>
      </View>

      {mobileTab === 'notifications' ? (
        <View style={styles.notificationsPanel}>
          <WebInboxPanel initialTab="notifications" fullScreen />
        </View>
      ) : (
        <>
          {selectedAcademy ? (
            <View style={styles.createRow}>
              <Pressable style={styles.createButton} onPress={onCreateAcademy} accessibilityRole="button">
                <Ionicons name="add" size={16} color={weeklineColors.blueLight} />
                <Text style={styles.createButtonText}>{t('academy.createAction')}</Text>
              </Pressable>
            </View>
          ) : null}
          {isLoading ? <ActivityIndicator color={weeklineColors.blueLight} style={styles.loading} /> : !selectedAcademy ? (
            <View style={styles.emptyCard}>
              <Ionicons name="school-outline" size={24} color={weeklineColors.blueLight} />
              <Text style={styles.emptyTitle}>{t('academy.firstAcademyTitle')}</Text>
              <Text style={styles.emptyIntro}>{t('academy.firstAcademyIntro')}</Text>
              <Pressable style={styles.primaryButton} onPress={onCreateAcademy} accessibilityRole="button">
                <Ionicons name="add" size={17} color={weeklineColors.blackText} />
                <Text style={styles.primaryButtonText}>{t('academy.createMainAction')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable style={styles.academyPicker} onPress={onOpenPicker} accessibilityRole="button" accessibilityLabel={t('academy.dashboardSelectAcademy')}>
                {selectedAcademy.logo_url ? <Image source={{ uri: selectedAcademy.logo_url }} style={styles.logo} resizeMode="cover" /> : <View style={[styles.logo, styles.logoPlaceholder]}><Ionicons name="football-outline" size={19} color={weeklineColors.blueLight} /></View>}
                <View style={styles.pickerText}>
                  <Text style={styles.pickerName} numberOfLines={1}>{selectedAcademy.name}</Text>
                  <Text style={styles.pickerMeta} numberOfLines={1}>{selectedAcademy.age_group || selectedAcademy.city || t('academy.dashboardSportAcademy')}</Text>
                </View>
                <Ionicons name="chevron-down" size={17} color={weeklineColors.grey} />
              </Pressable>

              {/* The team cover is a visual preview only; navigation stays on the explicit button below. */}
              <View style={styles.cover} accessible accessibilityRole="image" accessibilityLabel={selectedAcademy.name}>
                {selectedAcademy.cover_url ? <Image source={{ uri: selectedAcademy.cover_url }} style={styles.coverImage} resizeMode="cover" /> : (
                  <LinearGradient pointerEvents="none" colors={['#164766', '#12364D', '#0D2433']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                )}
                <View style={styles.coverTint} />
                <View style={styles.coverRingOne} />
                <View style={styles.coverRingTwo} />
                <View style={styles.coverCopy}>
                  <Text style={styles.coverKicker}>{selectedAcademy.is_main ? t('academy.mainBadge') : t('academy.dashboardOverview')}</Text>
                  <Text style={styles.coverName} numberOfLines={1}>{selectedAcademy.name}</Text>
                  <Text style={styles.coverMeta} numberOfLines={1}>{[selectedAcademy.age_group, selectedAcademy.description || selectedAcademy.city].filter(Boolean).join(' · ') || t('academy.dashboardSportAcademy')}</Text>
                </View>
              </View>
              <View style={styles.coverActions}>
                <Pressable onPress={openAcademy} style={styles.viewAcademyButton} accessibilityRole="button">
                  <Text style={styles.viewAcademyText}>{t('academy.dashboardViewAll')}</Text>
                  <Ionicons name="arrow-forward" size={15} color={weeklineColors.blueLight} />
                </Pressable>
              </View>

              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('academy.dashboardOverview')}</Text></View>
              <View style={styles.metrics}>
                <MobileMetric value={academyCounts?.players ?? 0} label={countLabel('academy.playersCount')} styles={styles} />
                <MobileMetric value={academyCounts?.parents ?? 0} label={countLabel('academy.parentsCount')} styles={styles} />
                <MobileMetric value={academyCounts?.pending ?? 0} label={countLabel('academy.pendingCount')} styles={styles} />
              </View>

              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('academy.dashboardNextMatches')}</Text><Pressable onPress={openAcademy}><Text style={styles.link}>{t('academy.dashboardViewAll')}</Text></Pressable></View>
              {isLoadingMatches ? <View style={styles.matchCard}><ActivityIndicator color={weeklineColors.blueLight} /></View> : nextMatch ? (
                <View style={styles.matchCard}>
                  <View style={styles.dateTile}><Text style={styles.dateMonth}>{nextMatch.date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</Text><Text style={styles.dateDay}>{nextMatch.date.getDate()}</Text></View>
                  <View style={styles.matchInfo}>
                    <Text style={styles.matchTitle} numberOfLines={1}>{nextMatch.match.title || `${selectedAcademy.name} ${t('academy.dashboardVs')} ${nextMatch.match.opponent || t('academy.dashboardOpponentToConfirm')}`}</Text>
                    <Text style={styles.matchMeta} numberOfLines={1}>{`${nextMatch.date.toLocaleDateString(undefined, { weekday: 'short' })} · ${nextMatch.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={weeklineColors.grey} />
                </View>
              ) : (
                <View style={styles.matchCard}>
                  <View style={styles.matchIcon}><Ionicons name="trophy-outline" size={20} color={weeklineColors.blueLight} /></View>
                  <View style={styles.matchInfo}><Text style={styles.matchTitle}>{t('academy.noMatches')}</Text><Text style={styles.matchMeta}>{t('academy.dashboardScheduleFirstMatch')}</Text></View>
                </View>
              )}
            </>
          )}
          <OptionsModal visible={pickerVisible} title={t('academy.dashboardSelectAcademy')} options={academyOptions} value={selectedAcademy?.id ?? null} onSelect={onSelectAcademy} onClose={onClosePicker} />
        </>
      )}

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={onCancelCreate}>
        <View style={styles.modalBackdrop}>
          <View style={styles.createModal}>
            <View style={styles.createModalHeader}>
              <View style={styles.createModalCopy}>
                <Text style={styles.createModalTitle}>{academies.length === 0 ? t('academy.firstAcademyTitle') : t('academy.createTitle')}</Text>
                {academies.length === 0 ? <Text style={styles.createModalIntro}>{t('academy.firstAcademyIntro')}</Text> : null}
              </View>
              <Pressable onPress={onCancelCreate} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Ionicons name="close" size={19} color={weeklineColors.greySoft} />
              </Pressable>
            </View>
            <TextInput value={createName} onChangeText={onNameChange} placeholder={t('academy.namePlaceholder')} placeholderTextColor={weeklineColors.grey} style={styles.createInput} returnKeyType="next" />
            <TextInput value={createCity} onChangeText={onCityChange} placeholder={t('academy.cityPlaceholder')} placeholderTextColor={weeklineColors.grey} style={styles.createInput} />
            {createError ? <Text style={styles.createError}>{createError}</Text> : null}
            <View style={styles.createModalActions}>
              <Pressable onPress={onCancelCreate} style={styles.cancelButton} accessibilityRole="button"><Text style={styles.cancelButtonText}>{t('common.cancel')}</Text></Pressable>
              <Pressable onPress={onSubmitCreate} disabled={!createName.trim() || isCreating} style={[styles.primaryButton, styles.createSubmit, (!createName.trim() || isCreating) && styles.disabledButton]} accessibilityRole="button">
                {isCreating ? <ActivityIndicator size="small" color={weeklineColors.blackText} /> : <Ionicons name="add" size={17} color={weeklineColors.blackText} />}
                <Text style={styles.primaryButtonText}>{academies.length === 0 ? t('academy.createMainAction') : t('academy.createAction')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function MobileMetric({ value, label, styles }: { value: number; label: string; styles: ReturnType<typeof makeMobileStyles> }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel} numberOfLines={1}>{label}</Text></View>;
}

function nextScheduledDate(match: SessionRow, now = new Date()) {
  const first = new Date(match.starts_at);
  if (Number.isNaN(first.getTime())) return null;
  if (first >= now) return first;
  if (match.recurrence !== 'weekly') return null;
  const weeksAhead = Math.max(1, Math.ceil((now.getTime() - first.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const next = new Date(first.getTime() + weeksAhead * 7 * 24 * 60 * 60 * 1000);
  if (match.recurrence_until && next > new Date(`${match.recurrence_until}T23:59:59`)) return null;
  return next;
}

const makeMobileStyles = (colors: AppColors) => StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  notificationContent: { flex: 1, minHeight: 0, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.white, fontSize: scaleFont(24), lineHeight: scaleFont(29), fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { color: colors.grey, fontSize: scaleFont(12), fontWeight: '600', marginTop: 2 },
  headerBell: { width: 41, height: 41, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueLight, borderWidth: 1, borderColor: colors.background },
  badgeText: { color: colors.blackText, fontSize: scaleFont(8), fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: 5, padding: 4, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.backgroundSoft },
  tab: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8, borderRadius: 9 },
  tabActive: { backgroundColor: colors.blueSoft },
  tabText: { color: colors.grey, fontSize: scaleFont(12), fontWeight: '700' },
  tabTextActive: { color: colors.blueLight },
  tabBadge: { minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.blueLight },
  tabBadgeText: { color: colors.blackText, fontSize: scaleFont(8), fontWeight: '900' },
  createRow: { alignItems: 'flex-end', marginTop: -spacing.xs, marginBottom: spacing.sm },
  createButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.card },
  createButtonText: { color: colors.blueLight, fontSize: scaleFont(11), fontWeight: '700' },
  notificationsPanel: { flex: 1, minHeight: 0, width: '100%' },
  loading: { marginTop: spacing.xl },
  emptyCard: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card },
  emptyTitle: { color: colors.white, fontSize: scaleFont(15), fontWeight: '800' },
  emptyIntro: { color: colors.greySoft, fontSize: scaleFont(12), lineHeight: scaleFont(18), fontWeight: '600', textAlign: 'center' },
  primaryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 15, borderRadius: 10, backgroundColor: colors.blueLight },
  primaryButtonText: { color: colors.blackText, fontSize: scaleFont(12), fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.md, backgroundColor: 'rgba(2, 10, 17, 0.78)' },
  createModal: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12, padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card },
  createModalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 2 },
  createModalCopy: { flex: 1, gap: 6 },
  createModalTitle: { color: colors.white, fontSize: scaleFont(18), lineHeight: scaleFont(23), fontWeight: '900' },
  createModalIntro: { color: colors.greySoft, fontSize: scaleFont(12), lineHeight: scaleFont(18), fontWeight: '600' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  createInput: { minHeight: 46, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 11, color: colors.white, backgroundColor: colors.backgroundSoft, fontSize: scaleFont(14), fontWeight: '600' },
  createError: { color: colors.red, fontSize: scaleFont(12), fontWeight: '700' },
  createModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 3 },
  cancelButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 11 },
  cancelButtonText: { color: colors.greySoft, fontSize: scaleFont(12), fontWeight: '800' },
  createSubmit: { minHeight: 42 },
  disabledButton: { opacity: 0.5 },
  academyPicker: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  logo: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.cardSoft },
  logoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSoft },
  pickerText: { flex: 1, minWidth: 0 },
  pickerName: { color: colors.white, fontSize: scaleFont(14), fontWeight: '800' },
  pickerMeta: { color: colors.grey, fontSize: scaleFont(11), fontWeight: '600', marginTop: 3 },
  cover: { height: 145, minHeight: 145, justifyContent: 'flex-end', overflow: 'hidden', position: 'relative', borderRadius: 17, borderWidth: 1, borderColor: '#31536A' },
  coverImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  coverTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4, 16, 26, 0.42)' },
  coverRingOne: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: 'rgba(133,198,247,0.24)', right: -65, top: -100 },
  coverRingTwo: { position: 'absolute', width: 132, height: 132, borderRadius: 66, borderWidth: 1, borderColor: 'rgba(133,198,247,0.2)', right: -36, top: -70 },
  coverCopy: { paddingHorizontal: 15, paddingVertical: 13 },
  coverKicker: { color: '#D0E8F6', fontSize: scaleFont(10), fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  coverName: { color: '#FFFFFF', fontSize: scaleFont(21), fontWeight: '900', marginTop: 10 },
  coverMeta: { color: '#D0E3EF', fontSize: scaleFont(12), fontWeight: '600', marginTop: 4 },
  coverActions: { alignItems: 'flex-end', marginTop: 4, marginBottom: 2 },
  viewAcademyButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 5 },
  viewAcademyText: { color: colors.blueLight, fontSize: scaleFont(12), fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 },
  sectionTitle: { color: colors.white, fontSize: scaleFont(14), fontWeight: '800' },
  link: { color: colors.blueLight, fontSize: scaleFont(12), fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minWidth: 0, minHeight: 70, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  metricValue: { color: colors.white, fontSize: scaleFont(19), fontWeight: '900' },
  metricLabel: { color: colors.grey, fontSize: scaleFont(10), fontWeight: '700', marginTop: 3 },
  matchCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 11, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  dateTile: { width: 44, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSoft },
  dateMonth: { color: colors.blueLight, fontSize: scaleFont(9), fontWeight: '900' },
  dateDay: { color: colors.white, fontSize: scaleFont(18), lineHeight: scaleFont(20), fontWeight: '900' },
  matchInfo: { flex: 1, minWidth: 0 },
  matchTitle: { color: colors.white, fontSize: scaleFont(12), fontWeight: '800' },
  matchMeta: { color: colors.grey, fontSize: scaleFont(10), fontWeight: '600', marginTop: 4 },
  matchIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.blueSoft },
});

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
