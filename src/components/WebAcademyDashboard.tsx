import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useViewportHeight } from '../theme/contentZoom';

import Screen from './Screen';
import AvatarPickerTrigger from './AvatarPickerTrigger';
import AvatarCropModal from './AvatarCropModal';
import AssignmentsTab, { PeopleKind } from './academy/AssignmentsTab';
import CoachInviteDialog from './academy/CoachInviteDialog';
import CommunicationTab, { CommunicationView } from './academy/CommunicationTab';
import MatchesTab, { MatchIntent } from './academy/MatchesTab';
import type { PublicTeam } from './academy/MatchForm';
import { useTranslation } from '../i18n/LanguageContext';
import { useAuth } from '../lib/auth';
import { Conversation, collapseToOnePerConversation, fetchConversations } from '../lib/academyChat';
import {
  AcademyCounts,
  AcademyRow,
  fetchPublicAcademiesForMatches,
  setMainAcademy,
  updateAcademy,
} from '../lib/academyData';
import {
  DirectoryCoach,
  EMPTY_DIRECTORY,
  HubMatch,
  TeamDirectory,
  VenuePitch,
  fetchHubMatches,
  fetchMatchPeople,
  fetchTeamDirectory,
  fetchVenuePitches,
  parentJoinLink,
} from '../lib/academyHub';
import { AcademyHubLabels, fill, useAcademyHubLabels } from '../lib/academyHubLabels';
import { AcademyNotice, fetchNotices, markNoticeRead } from '../lib/academyNotices';
import { useAcademyRealtime } from '../lib/academyRealtime';
import { PickedAvatarImage, cropAndUploadAcademyCover, cropAndUploadAcademyLogo } from '../lib/avatarUpload';
import { WIDE_CONTENT_MAX_WIDTH, useBreakpoint } from '../theme/breakpoints';
import { AppColors, weeklineColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/layout';

type CreateAcademyForm = {
  visible: boolean;
  isFirstAcademy: boolean;
  name: string;
  city: string;
  error: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onCreate: () => void;
  onStartCreate: () => void;
  onCancel: () => void;
};

type Props = {
  academies: AcademyRow[];
  counts: Record<string, AcademyCounts>;
  loading: boolean;
  createForm: CreateAcademyForm;
  onRefresh: () => Promise<void>;
  /** Opens the Academy walkthrough from the header's help button. */
  onOpenGuide?: () => void;
};

type AcademyArea = 'overview' | 'assignments' | 'matches' | 'communication';

const AREAS: { key: AcademyArea; icon: keyof typeof Ionicons.glyphMap; label: keyof AcademyHubLabels }[] = [
  { key: 'overview', icon: 'aperture-outline', label: 'tabOverview' },
  { key: 'assignments', icon: 'people-outline', label: 'tabAssignments' },
  { key: 'matches', icon: 'calendar-outline', label: 'tabMatches' },
  { key: 'communication', icon: 'chatbubbles-outline', label: 'tabCommunication' },
];

function startOfCurrentSeason(now = new Date()) {
  const seasonStartYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return seasonStartYear;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function matchDateParts(iso: string) {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
    date: date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }).toUpperCase(),
    time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

export default function WebAcademyDashboard({
  academies,
  counts,
  loading,
  createForm,
  onRefresh,
  onOpenGuide,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const l = useAcademyHubLabels();
  const { pitchOwner, isStaff } = useAuth();
  const ownerId = pitchOwner?.id ?? null;
  const { unread, messagesVersion, enrolmentsVersion } = useAcademyRealtime();
  const { width } = useBreakpoint();
  const viewportHeight = useViewportHeight();
  const { colors: appColors } = useAppTheme();
  const colors = Platform.OS === 'web' ? weeklineColors : appColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [currentSeasonYear, setCurrentSeasonYear] = useState(startOfCurrentSeason);
  const sortedAcademies = useMemo(
    () => [...academies].sort((a, b) => Number(b.is_main) - Number(a.is_main)),
    [academies]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAcademies, setShowAcademies] = useState(false);
  const [showSeasons, setShowSeasons] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState('');
  const [seasonStartYear, setSeasonStartYear] = useState(startOfCurrentSeason());
  const [section, setSection] = useState<AcademyArea>('overview');
  const [assignKind, setAssignKind] = useState<PeopleKind>('players');
  const [matchIntent, setMatchIntent] = useState<MatchIntent | null>(null);
  const [communicationView, setCommunicationView] = useState<CommunicationView>('chat');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteAcademy, setInviteAcademy] = useState<string | null>(null);

  useEffect(() => {
    const seasonCheck = setInterval(() => {
      setCurrentSeasonYear(startOfCurrentSeason());
    }, 60 * 60 * 1000);
    return () => clearInterval(seasonCheck);
  }, []);

  useEffect(() => {
    setSeasonStartYear((selectedYear) => selectedYear === currentSeasonYear - 1 ? currentSeasonYear : selectedYear);
  }, [currentSeasonYear]);

  const [directory, setDirectory] = useState<TeamDirectory>(EMPTY_DIRECTORY);
  const [matches, setMatches] = useState<HubMatch[]>([]);
  const [pitches, setPitches] = useState<VenuePitch[]>([]);
  const [publicTeams, setPublicTeams] = useState<PublicTeam[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notices, setNotices] = useState<AcademyNotice[]>([]);
  const [dutyCoachIds, setDutyCoachIds] = useState<string[]>([]);
  const [isLoadingHub, setIsLoadingHub] = useState(true);
  const [hubError, setHubError] = useState('');
  const [linkNotice, setLinkNotice] = useState('');
  const [editAcademy, setEditAcademy] = useState<AcademyRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAgeGroup, setEditAgeGroup] = useState('');
  const [editLogo, setEditLogo] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<PickedAvatarImage | null>(null);
  const [cropTarget, setCropTarget] = useState<'logo' | 'cover'>('logo');
  const [editBusy, setEditBusy] = useState(false);
  const [makeMain, setMakeMain] = useState(false);
  const [editError, setEditError] = useState('');
  const hubRequest = useRef(0);

  useEffect(() => {
    if (!sortedAcademies.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && sortedAcademies.some((row) => row.id === current)
        ? current
        : sortedAcademies[0].id
    );
  }, [sortedAcademies]);

  const selectedAcademy = sortedAcademies.find((academy) => academy.id === selectedId) ?? null;
  const academyCounts = selectedAcademy ? counts[selectedAcademy.id] : undefined;
  const academyKey = sortedAcademies.map((academy) => academy.id).join(',');

  const loadHub = useCallback(async () => {
    const request = ++hubRequest.current;
    if (!ownerId || !academyKey) {
      setDirectory(EMPTY_DIRECTORY);
      setMatches([]);
      setIsLoadingHub(false);
      return;
    }
    try {
      const [people, fixtures, venues, conversationRows, noticeRows] = await Promise.all([
        fetchTeamDirectory(ownerId),
        fetchHubMatches(academyKey.split(',')),
        fetchVenuePitches(ownerId),
        fetchConversations(),
        fetchNotices(),
      ]);
      if (request !== hubRequest.current) return;
      setDirectory(people);
      setMatches(fixtures);
      setPitches(venues);
      setConversations(collapseToOnePerConversation(conversationRows).filter((row) => row.message_count > 0));
      setNotices(noticeRows);
      setHubError('');
    } catch {
      if (request === hubRequest.current) setHubError(l.loadError);
    }
    if (request === hubRequest.current) setIsLoadingHub(false);
  }, [ownerId, academyKey]);

  useEffect(() => { void loadHub(); }, [loadHub, messagesVersion, enrolmentsVersion, unread]);

  useEffect(() => {
    void fetchPublicAcademiesForMatches().then(setPublicTeams);
  }, [academyKey]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadHub(), onRefresh()]);
  }, [loadHub, onRefresh]);

  const players = useMemo(
    () => directory.players.filter((row) => !!selectedId && row.academy_ids.includes(selectedId)),
    [directory.players, selectedId]
  );
  const parents = useMemo(
    () => directory.parents.filter((row) => !!selectedId && row.academy_ids.includes(selectedId)),
    [directory.parents, selectedId]
  );
  const activeCoaches = directory.coaches.filter((row) => row.status === 'active');
  const playerCount = isLoadingHub ? academyCounts?.players ?? 0 : players.length;
  const parentCount = isLoadingHub ? academyCounts?.parents ?? 0 : parents.length;

  const seasonStart = new Date(seasonStartYear, 7, 1).getTime();
  const seasonEnd = new Date(seasonStartYear + 1, 7, 1).getTime();
  const now = Date.now();
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const academyMatches = matches.filter((row) => row.academy_id === selectedId && !row.is_cancelled);
  const seasonMatches = academyMatches
    .filter((row) => {
      const start = new Date(row.starts_at).getTime();
      return start >= seasonStart && start < seasonEnd;
    })
    .filter((row) => !normalizedSearch || [row.title, row.opponent, row.location_name]
      .some((part) => part?.toLocaleLowerCase().includes(normalizedSearch)));
  const upcoming = seasonMatches.filter((row) => new Date(row.ends_at).getTime() >= now).slice(0, 3);
  const played = seasonMatches.filter((row) => new Date(row.ends_at).getTime() < now).reverse().slice(0, 3);
  const upcomingCount = academyMatches.filter((row) => new Date(row.ends_at).getTime() >= now).length;

  // Coaches picked for this academy's matches in the next seven days.
  const weekKey = academyMatches
    .filter((row) => new Date(row.ends_at).getTime() >= now && new Date(row.starts_at).getTime() < now + 7 * 86400000)
    .map((row) => row.id)
    .join(',');

  useEffect(() => {
    let current = true;
    if (!weekKey) {
      setDutyCoachIds([]);
      return;
    }
    Promise.all(weekKey.split(',').map(fetchMatchPeople))
      .then((rows) => { if (current) setDutyCoachIds(rows.flatMap((row) => row.attendees.map((attendee) => attendee.member_id))); })
      .catch(() => { if (current) setDutyCoachIds([]); });
    return () => { current = false; };
  }, [weekKey, matches]);

  const dutyCoaches = directory.coaches.filter((coach) => dutyCoachIds.includes(coach.id));

  const recentConversations = conversations
    .filter((row) => !normalizedSearch || [row.title, row.other_names.join(' '), row.last_body]
      .some((part) => part?.toLocaleLowerCase().includes(normalizedSearch)))
    .sort((a, b) => (b.last_at ?? '').localeCompare(a.last_at ?? ''))
    .slice(0, 3);
  const activity = recentConversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.kind === 'group'
      ? conversation.title || t('academyChat.untitledGroup')
      : conversation.other_names.join(', ') || t('academyChat.unknownPerson'),
    body: conversation.last_body || t('academyChat.noMessagesYet'),
    meta: t('academy.dashboardDirectMessage'),
    time: conversation.last_at ?? '',
    icon: 'chatbubble-ellipses-outline' as const,
    unread: conversation.unread_count > 0,
  }));
  const myNotices = notices
    .filter((row) => row.type === 'session' || row.type === 'match_reminder')
    .filter((row) => !normalizedSearch || [row.title, row.body]
      .some((part) => part?.toLocaleLowerCase().includes(normalizedSearch)))
    .slice(0, 4);

  const goToConversation = useCallback((conversationId: string) => {
    const row = conversations.find((item) => item.id === conversationId);
    if (!row) return;
    router.push({
      pathname: '/academy-chat',
      params: { conversationId: row.id, asMemberId: row.for_member_id },
    } as any);
  }, [router, conversations]);

  function readNotice(notice: AcademyNotice) {
    if (notice.read_at) return;
    setNotices((rows) => rows.map((row) => row.id === notice.id ? { ...row, read_at: new Date().toISOString() } : row));
    void markNoticeRead(notice.id);
  }

  const yearOptions = [currentSeasonYear, currentSeasonYear - 1, currentSeasonYear - 2];

  function showSection(area: AcademyArea) {
    setShowAcademies(false);
    setShowSeasons(false);
    setLinkNotice('');
    setMatchIntent(null);
    setSection(area);
  }

  function showPeople(kind: PeopleKind) {
    setAssignKind(kind);
    showSection('assignments');
  }

  function showMatches(intent: MatchIntent | null) {
    showSection('matches');
    setMatchIntent(intent);
  }

  function showCommunication(view: CommunicationView) {
    setCommunicationView(view);
    showSection('communication');
  }

  function beginEdit(row: AcademyRow) {
    setEditAcademy(row); setEditName(row.name); setEditDescription(row.description ?? '');
    setEditAgeGroup(row.age_group ?? ''); setEditLogo(row.logo_url); setMakeMain(row.is_main); setEditError('');
  }

  function chooseLogoImage(image: PickedAvatarImage) {
    setCropTarget('logo');
    setCropImage(image);
  }

  function chooseCoverImage(image: PickedAvatarImage) {
    setCropTarget('cover');
    setCropImage(image);
  }

  async function uploadCroppedAcademyImage(crop: { originX: number; originY: number; size: number; width: number; height: number }) {
    const image = cropImage;
    if (!image) return;
    try {
      if (cropTarget === 'logo') {
        if (!editAcademy) return;
        const url = await cropAndUploadAcademyLogo(editAcademy.id, image, crop);
        setEditLogo(url);
      } else {
        if (!selectedAcademy) return;
        const url = await cropAndUploadAcademyCover(selectedAcademy.id, image, crop);
        const { error } = await updateAcademy(selectedAcademy.id, { cover_url: url });
        if (error) throw error;
        await onRefresh();
      }
      setCropImage(null);
    } catch (error) { setEditError(String(error)); }
  }

  async function saveAcademy() {
    if (!editAcademy || !editName.trim() || editBusy) return;
    setEditBusy(true);
    const { error } = await updateAcademy(editAcademy.id, {
      name: editName.trim(), description: editDescription.trim() || null,
      age_group: editAgeGroup.trim() || null, logo_url: editLogo,
    });
    if (!error && makeMain && !editAcademy.is_main) await setMainAcademy(editAcademy.id);
    setEditBusy(false);
    if (error) { setEditError(error.message); return; }
    setEditAcademy(null); await refreshAll();
  }

  async function copyParentLink() {
    if (!selectedAcademy) return;
    await Clipboard.setStringAsync(parentJoinLink(selectedAcademy.invite_token));
    setLinkNotice(fill(l.parentLinkCopied, { academy: selectedAcademy.name }));
  }

  // On a phone the header is laid out as tidy full-width rows instead of five
  // items wrapping unpredictably.
  const isPhoneLayout = width < 768;
  const isOverview = section === 'overview';
  // Only the owner account may open new academies.
  const canCreate = !isStaff;
  const createButton = !canCreate ? null : (
    <Pressable
      style={({ hovered, pressed }: any) => [styles.primaryButton, isPhoneLayout && styles.phoneFullWidth, hovered && styles.primaryHovered, pressed && styles.pressed]}
      onPress={createForm.onStartCreate}
      accessibilityRole="button"
    >
      <Ionicons name="add" size={18} color={colors.blackText} />
      <Text style={styles.primaryButtonText}>{academies.length === 0 ? t('academy.createMainAction') : t('academy.createAction')}</Text>
    </Pressable>
  );

  return (
    <Screen maxWidth={WIDE_CONTENT_MAX_WIDTH} contentStyle={[styles.screenContent, isPhoneLayout && styles.screenContentPhone]}>
      <View style={[styles.topHeader, width < 1280 && styles.topHeaderCompact, isPhoneLayout && styles.topHeaderPhone]}>
        <Text style={[styles.pageTitle, isPhoneLayout && styles.pageTitlePhone]}>{t('academy.title')}</Text>
        {isOverview ? (
          <>
            <View style={[styles.headerPickerWrap, isPhoneLayout && styles.phoneFullWidth]}>
              <Pressable
                style={({ hovered, pressed }: any) => [styles.headerPicker, width < 1280 && styles.headerPickerCompact, isPhoneLayout && styles.headerPickerPhone, hovered && styles.hovered, pressed && styles.pressed]}
                onPress={() => { setShowAcademies((value) => !value); setShowSeasons(false); }}
                accessibilityRole="button"
                accessibilityLabel={t('academy.dashboardSelectAcademy')}
              >
                {selectedAcademy?.logo_url ? (
                  <Image source={{ uri: selectedAcademy.logo_url }} style={styles.headerCrest} resizeMode="contain" />
                ) : (
                  <View style={styles.headerCrestPlaceholder}><Ionicons name="shield-outline" size={17} color={colors.blueLight} /></View>
                )}
                <Text style={styles.headerPickerText} numberOfLines={1}>{selectedAcademy?.name ?? t('academy.dashboardSelectAcademy')}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.grey} />
              </Pressable>
              {showAcademies ? (
                <View style={styles.dropdown}>
                  {sortedAcademies.map((row) => (
                    <Pressable
                      key={row.id}
                      style={({ hovered, pressed }: any) => [styles.dropdownRow, row.id === selectedId && styles.dropdownRowActive, hovered && styles.hovered, pressed && styles.pressed]}
                      onPress={() => { setSelectedId(row.id); setShowAcademies(false); setLinkNotice(''); }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={styles.dropdownTitle} numberOfLines={1}>{row.name}</Text>{row.is_main ? <Ionicons name="trophy" size={13} color={colors.yellow} /> : null}</View>
                      <Text style={styles.dropdownMeta} numberOfLines={1}>{row.city || t('academy.dashboardNoLocation')}</Text>
                    </Pressable>
                  ))}
                  {!sortedAcademies.length ? <Text style={styles.dropdownMeta}>{t('academy.noAcademies')}</Text> : null}
                </View>
              ) : null}
            </View>
            <View style={[styles.headerPickerWrap, isPhoneLayout && styles.phoneSeasonWrap]}>
              <Pressable
                style={({ hovered, pressed }: any) => [styles.seasonPicker, hovered && styles.hovered, pressed && styles.pressed]}
                onPress={() => { setShowSeasons((value) => !value); setShowAcademies(false); }}
                accessibilityRole="button"
              >
                <Ionicons name="calendar-outline" size={15} color={colors.grey} />
                <Text style={styles.seasonText}>{seasonStartYear}/{String(seasonStartYear + 1).slice(-2)} {t('academy.dashboardSeason')}</Text>
                <Ionicons name="chevron-down" size={15} color={colors.grey} />
              </Pressable>
              {showSeasons ? (
                <View style={styles.dropdown}>
                  {yearOptions.map((year) => (
                    <Pressable key={year} style={({ hovered, pressed }: any) => [styles.dropdownRow, year === seasonStartYear && styles.dropdownRowActive, hovered && styles.hovered, pressed && styles.pressed]} onPress={() => { setSeasonStartYear(year); setShowSeasons(false); }}>
                      <Text style={styles.dropdownTitle}>{year}/{String(year + 1).slice(-2)} {t('academy.dashboardSeason')}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
        {isPhoneLayout ? null : createButton}
        {isPhoneLayout ? null : <View style={styles.headerSpacer} />}
        {onOpenGuide ? (
          <Pressable style={[styles.iconButton, isPhoneLayout && styles.iconButtonPhone]} onPress={onOpenGuide} accessibilityRole="button" accessibilityLabel={t('academy.tutorialButton')}>
            <Ionicons name="help-circle-outline" size={21} color={colors.greySoft} />
          </Pressable>
        ) : null}
        {isOverview ? (
          <Pressable style={[styles.iconButton, isPhoneLayout && styles.iconButtonPhone]} onPress={() => setShowSearch((value) => !value)} accessibilityRole="button" accessibilityLabel={t('academy.dashboardSearch')}>
            <Ionicons name={showSearch ? 'close' : 'search'} size={19} color={colors.greySoft} />
          </Pressable>
        ) : null}
        {/* With no team yet the empty state below already offers the same button. */}
        {isPhoneLayout && academies.length > 0 && !createForm.visible ? createButton : null}
      </View>

      {showSearch && isOverview ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={17} color={colors.greyDark} />
          <TextInput value={search} onChangeText={setSearch} placeholder={t('academy.dashboardSearchPlaceholder')} placeholderTextColor={colors.greyDark} style={styles.searchInput} autoFocus />
          {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={17} color={colors.grey} /></Pressable> : null}
        </View>
      ) : null}

      {createForm.visible && canCreate ? (
        <View style={styles.createForm}>
          <View style={styles.createFormHeading}>
            <View style={styles.createFormCopy}><Text style={styles.panelTitle}>{createForm.isFirstAcademy ? t('academy.firstAcademyTitle') : t('academy.createTitle')}</Text><Text style={styles.panelHint}>{createForm.isFirstAcademy ? t('academy.firstAcademyIntro') : t('academy.dashboardCreateHint')}</Text></View>
            <Pressable onPress={createForm.onCancel} style={styles.iconButton}><Ionicons name="close" size={18} color={colors.grey} /></Pressable>
          </View>
          <View style={[styles.createInputs, isPhoneLayout && styles.createInputsPhone]}>
            <TextInput value={createForm.name} onChangeText={createForm.onNameChange} placeholder={t('academy.namePlaceholder')} placeholderTextColor={colors.greyDark} style={[styles.formInput, isPhoneLayout && styles.formInputPhone]} />
            <TextInput value={createForm.city} onChangeText={createForm.onCityChange} placeholder={t('academy.cityPlaceholder')} placeholderTextColor={colors.greyDark} style={[styles.formInput, isPhoneLayout && styles.formInputPhone]} />
            <Pressable style={[styles.primaryButton, !createForm.name.trim() && styles.disabledButton]} disabled={!createForm.name.trim() || createForm.busy} onPress={createForm.onCreate}>
              {createForm.busy ? <ActivityIndicator size="small" color={colors.blackText} /> : <Ionicons name="add" size={18} color={colors.blackText} />}
              <Text style={styles.primaryButtonText}>{createForm.isFirstAcademy ? t('academy.createMainAction') : t('academy.createAction')}</Text>
            </Pressable>
            <Pressable onPress={createForm.onCancel} style={styles.outlineButton}><Text style={styles.outlineButtonText}>{t('common.cancel')}</Text></Pressable>
          </View>
          {createForm.error ? <Text style={styles.errorText}>{createForm.error}</Text> : null}
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionNavScroll} contentContainerStyle={[styles.sectionNav, width < 1400 && styles.sectionNavCompact, isPhoneLayout && styles.sectionNavPhone]}>
        {AREAS.map((area) => (
          <Pressable key={area.key} onPress={() => showSection(area.key)} accessibilityRole="tab" accessibilityState={{ selected: section === area.key }} style={({ hovered, pressed }: any) => [styles.sectionTab, width < 1400 && styles.sectionTabCompact, isPhoneLayout && styles.sectionTabPhone, section === area.key && styles.sectionTabActive, hovered && styles.sectionTabHovered, pressed && styles.pressed]}>
            {isPhoneLayout ? null : <Ionicons name={area.icon} size={17} color={section === area.key ? colors.blueLight : colors.grey} />}
            <Text style={[styles.sectionTabLabel, width < 1400 && styles.sectionTabLabelCompact, isPhoneLayout && styles.sectionTabLabelPhone, section === area.key && styles.sectionTabLabelActive]}>{l[area.label]}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {hubError ? <Text style={styles.errorText}>{hubError}</Text> : null}

      {!selectedAcademy && loading ? (
        <View style={styles.emptyDashboard}><ActivityIndicator size="small" color={colors.blueLight} /></View>
      ) : !selectedAcademy ? (
        <View style={styles.emptyDashboard}>
          <View style={styles.emptyIcon}><Ionicons name="school-outline" size={26} color={colors.blueLight} /></View>
          <Text style={styles.panelTitle}>{t('academy.firstAcademyTitle')}</Text>
          <Text style={styles.panelHint}>{t('academy.firstAcademyIntro')}</Text>
          {canCreate ? <Pressable style={styles.primaryButton} onPress={createForm.onStartCreate}><Ionicons name="add" size={18} color={colors.blackText} /><Text style={styles.primaryButtonText}>{t('academy.createMainAction')}</Text></Pressable> : null}
          {onOpenGuide ? (
            <Pressable style={styles.outlineButton} onPress={onOpenGuide} accessibilityRole="button">
              <Ionicons name="help-circle-outline" size={18} color={colors.greySoft} />
              <Text style={styles.outlineButtonText}>{t('academy.tutorialButton')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : section === 'assignments' ? (
        <View style={styles.tabBody}>
          <AssignmentsTab
            academies={sortedAcademies}
            directory={directory}
            loading={isLoadingHub}
            initialKind={assignKind}
            canInvite={!isStaff}
            onInviteCoach={(academyId) => { setInviteAcademy(academyId); setInviteOpen(true); }}
            onChanged={refreshAll}
          />
        </View>
      ) : section === 'matches' ? (
        <View style={styles.tabBody}>
          <MatchesTab
            academies={sortedAcademies}
            directory={directory}
            pitches={pitches}
            publicTeams={publicTeams}
            matches={matches}
            loading={isLoadingHub}
            intent={matchIntent}
            onIntentHandled={() => setMatchIntent(null)}
            onChanged={loadHub}
          />
        </View>
      ) : section === 'communication' && ownerId ? (
        <View style={styles.tabBody}>
          <CommunicationTab ownerId={ownerId} academies={sortedAcademies} directory={directory} initialView={communicationView} />
        </View>
      ) : (
        <View style={[styles.dashboardGrid, width < 1400 && styles.dashboardGridNarrow, width >= 1180 && { ...styles.dashboardGridFill, minHeight: Math.max(420, viewportHeight - 180) }]}>
          <View style={[styles.leftColumn, width < 1400 && styles.columnFullWidth, width >= 1180 && styles.leftColumnFill]}>
            <AcademyCard
              academy={selectedAcademy}
              loading={isLoadingHub}
              styles={styles}
              colors={colors}
              t={t}
              manageLabel={l.manageAcademy}
              onManage={() => router.push({ pathname: '/academy-details', params: { academyId: selectedAcademy.id } } as any)}
              onEdit={() => beginEdit(selectedAcademy)}
              onUploadCover={chooseCoverImage}
              style={width >= 1180 ? styles.academyPanelGrow : undefined}
            />
            <RosterPanel
              players={playerCount}
              parents={parentCount}
              coaches={activeCoaches.length}
              matches={upcomingCount}
              styles={styles}
              colors={colors}
              t={t}
              onViewAll={() => showPeople('players')}
              onOpen={(area) => (area === 'matches' ? showMatches(null) : showPeople(area))}
              style={width >= 1180 ? styles.rosterPanelGrow : undefined}
            />
            <LinksPanel
              styles={styles}
              colors={colors}
              t={t}
              notice={linkNotice}
              onParent={() => { void copyParentLink(); }}
              onCoach={isStaff ? undefined : () => { setInviteAcademy(selectedAcademy.id); setInviteOpen(true); }}
            />
          </View>

          <View style={[styles.middleColumn, width < 1400 && styles.columnFullWidth]}>
            <MatchesPanel
              title={t('academy.dashboardNextMatches')}
              sessions={upcoming}
              academyName={selectedAcademy.name}
              academyLogoUrl={selectedAcademy.logo_url}
              opponentAcademies={publicTeams}
              emptyText={normalizedSearch ? t('academy.dashboardNoSearchMatches') : t('academy.noMatches')}
              showStatus
              styles={styles}
              colors={colors}
              t={t}
              loading={isLoadingHub}
              onCreate={() => showMatches({ type: 'create', academyId: selectedAcademy.id })}
              onViewAll={() => showMatches(null)}
              onSession={(session) => showMatches({ type: 'open', matchId: session.id })}
            />
            <MatchesPanel
              title={t('academy.dashboardPastResults')}
              sessions={played}
              academyName={selectedAcademy.name}
              academyLogoUrl={selectedAcademy.logo_url}
              opponentAcademies={publicTeams}
              emptyText={normalizedSearch ? t('academy.dashboardNoSearchMatches') : t('academy.dashboardNoPastMatches')}
              showStatus={false}
              styles={styles}
              colors={colors}
              t={t}
              loading={isLoadingHub}
              onViewAll={() => showMatches({ type: 'past' })}
              onSession={(session) => showMatches({ type: 'open', matchId: session.id })}
              onEnterResult={(session) => showMatches({ type: 'result', matchId: session.id })}
            />
          </View>

          <View style={[styles.rightColumn, width < 1400 && styles.columnFullWidth]}>
            {isStaff || myNotices.length ? (
              <NoticesPanel notices={myNotices} title={l.notifications} emptyText={l.noNotifications} styles={styles} colors={colors} onRead={readNotice} />
            ) : null}
            <CommunicationsPanel
              parents={parentCount}
              coaches={activeCoaches.length}
              activity={activity}
              styles={styles}
              colors={colors}
              t={t}
              loading={isLoadingHub}
              onCompose={() => showCommunication('parents')}
              onChooseAudience={(audience) => showCommunication(audience === 'coaches' ? 'chat' : 'parents')}
              onViewAll={() => router.push('/inbox' as any)}
              onOpenConversation={goToConversation}
            />
            <CoachesOnDutyPanel coaches={dutyCoaches} styles={styles} colors={colors} t={t} onViewAll={() => showPeople('coaches')} />
          </View>
        </View>
      )}

      <CoachInviteDialog visible={inviteOpen} academies={sortedAcademies} initialAcademyId={inviteAcademy} onClose={() => { setInviteOpen(false); void loadHub(); }} />

      <Modal transparent visible={!!editAcademy} animationType="fade" onRequestClose={() => setEditAcademy(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditAcademy(null)} />
          <View style={[styles.composeModal, styles.editAcademyModal]}>
            <View style={[styles.composeHeader, styles.editAcademyHeader]}><View><Text style={styles.editModalTitle}>{t('academy.dashboardEdit')}</Text><Text style={styles.editModalSubtitle}>{editAcademy?.name}</Text></View><Pressable onPress={() => setEditAcademy(null)} style={styles.editCloseButton}><Ionicons name="close" size={17} color={colors.grey} /></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.editAcademyScroll} contentContainerStyle={styles.editAcademyContent}>
              <View style={styles.editProfileRow}>
                <View style={styles.editLogoColumn}>
                  <Text style={styles.editLabel}>Academy logo</Text>
                  <AvatarPickerTrigger onPicked={chooseLogoImage} onError={(error) => setEditError(String(error))} style={styles.editLogoPicker}>
                    {editLogo ? <Image source={{ uri: editLogo }} style={styles.editLogoImage} resizeMode="contain" /> : <View style={[styles.headerCrestPlaceholder, styles.editLogoImage]}><Ionicons name="shield-outline" size={25} color={colors.blueLight} /></View>}
                    <View style={styles.editLogoChange}><Ionicons name="camera-outline" size={12} color={colors.blueLight} /><Text style={styles.editLogoChangeText}>Change</Text></View>
                  </AvatarPickerTrigger>
                </View>
                <View style={styles.editFieldsColumn}>
                  <Text style={styles.editLabel}>Academy name</Text>
                  <TextInput value={editName} onChangeText={setEditName} style={styles.editTextInput} placeholder="Academy name" placeholderTextColor={colors.grey} />
                  <Text style={styles.editLabel}>Age group <Text style={styles.optionalLabel}>(optional)</Text></Text>
                  <TextInput value={editAgeGroup} onChangeText={setEditAgeGroup} style={styles.editTextInput} placeholder="e.g. U3 - U12" placeholderTextColor={colors.grey} maxLength={40} />
                </View>
              </View>
              <View style={styles.editDescriptionSection}>
                <Text style={styles.editLabel}>Brief description</Text>
                <TextInput value={editDescription} onChangeText={setEditDescription} style={[styles.editTextInput, styles.editDescriptionInput]} multiline placeholder="Describe your academy, its values, coaching philosophy..." placeholderTextColor={colors.grey} />
              </View>
              <Pressable disabled={!!editAcademy?.is_main} onPress={() => setMakeMain((v) => !v)} style={[styles.editMainRow, makeMain && styles.recipientRowActive]}><View style={[styles.checkbox, makeMain && styles.checkboxActive]}>{makeMain ? <Ionicons name="checkmark" size={12} color={colors.blackText} /> : null}</View><Text style={styles.editMainLabel}>Assign as main academy</Text><Ionicons name="trophy" size={14} color={colors.yellow} /></Pressable>
              {editError ? <Text style={styles.errorText}>{editError}</Text> : null}
              <View style={[styles.modalActions, styles.editModalActions]}><Pressable onPress={() => setEditAcademy(null)} style={[styles.outlineButton, styles.editActionButton]}><Text style={styles.outlineButtonText}>{t('common.cancel')}</Text></Pressable><Pressable disabled={!editName.trim() || editBusy} onPress={saveAcademy} style={[styles.primaryButton, styles.editActionButton, (!editName.trim() || editBusy) && styles.disabledButton]}>{editBusy ? <ActivityIndicator size="small" color={colors.blackText} /> : null}<Text style={[styles.primaryButtonText, styles.editSaveText]}>Save changes</Text></Pressable></View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <AvatarCropModal
        visible={!!cropImage}
        imageUri={cropImage?.uri ?? null}
        imageWidth={cropImage?.width ?? 0}
        imageHeight={cropImage?.height ?? 0}
        cropShape={cropTarget === 'cover' ? 'rectangle' : 'circle'}
        cropAspectRatio={cropTarget === 'cover' ? 1.8 : 1}
        cropWidth={cropTarget === 'cover' ? 480 : undefined}
        onCancel={() => setCropImage(null)}
        onConfirm={(crop) => { void uploadCroppedAcademyImage(crop); }}
      />
    </Screen>
  );
}

function AcademyCard({ academy, loading, styles, colors, t, manageLabel, onManage, onEdit, onUploadCover, style }: {
  academy: AcademyRow;
  loading: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  t: (key: string, params?: Record<string, string | number>) => string;
  manageLabel: string;
  onManage: () => void;
  onEdit: () => void;
  onUploadCover: (image: PickedAvatarImage) => void;
  style?: any;
}) {
  return (
    <View style={[styles.academyPanel, style]}>
      <View style={styles.coverWrap}>
        {academy.cover_url ? <ImageBackground source={{ uri: academy.cover_url }} style={styles.coverImage} resizeMode="cover" /> : (
          <View style={[styles.coverImage, styles.coverFallback]}>
            <Ionicons name="football-outline" size={47} color={colors.blueLight} />
            <Text style={styles.coverFallbackText}>{t('academy.title')}</Text>
          </View>
        )}
        <AvatarPickerTrigger onPicked={onUploadCover} onError={(error) => console.warn('Academy cover upload picker failed', error)} style={styles.cameraButton}><Ionicons name="camera-outline" size={17} color={colors.white} /></AvatarPickerTrigger>
      </View>
      <View style={styles.academyCardBody}>
        <View style={styles.academyTitleRow}>
          {academy.logo_url ? <Image source={{ uri: academy.logo_url }} style={styles.academyLogo} resizeMode="contain" /> : (
            <View style={[styles.academyLogo, styles.academyLogoFallback]}><Ionicons name="shield-outline" size={24} color={colors.blueLight} /></View>
          )}
          <View style={styles.academyTitleBlock}>
            <View style={styles.academyNameLine}>
              <Text style={styles.academyName} numberOfLines={1}>{academy.name}</Text>
              {academy.is_main ? <Ionicons name="trophy" size={15} color={colors.yellow} /> : null}
              {!academy.is_active ? <Text style={styles.pausedBadge}>{t('academy.dashboardPaused')}</Text> : null}
            </View>
            <Text style={styles.academyDescription} numberOfLines={2}>{academy.description || t('academy.dashboardTagline')}</Text>
          </View>
        </View>
        <View style={styles.academyMetaRow}>
          <Ionicons name="location-outline" size={16} color={colors.greySoft} />
          <Text style={styles.academyMetaText} numberOfLines={1}>{academy.city || t('academy.dashboardNoLocation')}</Text>
        </View>
        <View style={styles.academyMetaRow}>
          <Ionicons name="people-outline" size={16} color={colors.greySoft} />
          <Text style={styles.academyMetaText} numberOfLines={1}>{loading ? t('common.loading') : academy.age_group?.trim() ? t('academy.dashboardAgeGroupValue', { ageGroup: academy.age_group.trim() }) : t('academy.dashboardNoAgeGroups')}</Text>
        </View>
        <View style={styles.academyFooter}>
          <View style={styles.sportTag}><Ionicons name="football-outline" size={14} color={colors.blueLight} /><Text style={styles.sportTagText}>{t('academy.dashboardSportAcademy')}</Text></View>
          <View style={styles.academyActions}>
          <Pressable style={({ hovered, pressed }: any) => [styles.outlineButton, styles.editAcademyButton, hovered && styles.hovered, pressed && styles.pressed]} onPress={onManage}>
            <Ionicons name="settings-outline" size={14} color={colors.greySoft} /><Text style={styles.outlineButtonText}>{manageLabel}</Text>
          </Pressable>
          <Pressable style={({ hovered, pressed }: any) => [styles.outlineButton, styles.editAcademyButton, hovered && styles.hovered, pressed && styles.pressed]} onPress={onEdit}>
            <Ionicons name="create-outline" size={14} color={colors.greySoft} /><Text style={styles.outlineButtonText}>{t('academy.dashboardEdit')}</Text>
          </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function RosterPanel({ players, parents, coaches, matches, styles, colors, t, onViewAll, onOpen, style }: {
  players: number; parents: number; coaches: number; matches: number;
  styles: ReturnType<typeof makeStyles>; colors: AppColors;
  t: (key: string) => string; onViewAll: () => void; onOpen: (area: PeopleKind | 'matches') => void; style?: any;
}) {
  const items = [
    { icon: 'people-outline' as const, label: t('academy.tabPlayers'), value: String(players), area: 'players' as const },
    { icon: 'people-circle-outline' as const, label: t('academy.tabParents'), value: String(parents), area: 'parents' as const },
    { icon: 'person-outline' as const, label: t('academy.rosterCoaches'), value: String(coaches), area: 'coaches' as const },
    { icon: 'calendar-outline' as const, label: t('academy.tabMatches'), value: String(matches), area: 'matches' as const },
  ];
  return (
    <Panel styles={styles} colors={colors} style={style}>
      <PanelHeading styles={styles} title={t('academy.dashboardRoster')} action={t('academy.dashboardViewAll')} onAction={onViewAll} />
      <View style={styles.rosterGrid}>
        {items.map((item) => (
          <Pressable key={item.label} onPress={() => onOpen(item.area)} style={({ hovered, pressed }: any) => [styles.rosterMetric, hovered && styles.rosterMetricHovered, pressed && styles.pressed]}>
            <Ionicons name={item.icon} size={18} color={colors.blueLight} />
            <View style={styles.rosterMetricText}><Text style={styles.rosterValue}>{item.value}</Text><Text style={styles.rosterLabel}>{item.label}</Text></View>
            <Ionicons name="chevron-forward" size={14} color={colors.grey} />
          </Pressable>
        ))}
      </View>
    </Panel>
  );
}

function LinksPanel({ styles, colors, t, notice, onParent, onCoach }: {
  styles: ReturnType<typeof makeStyles>; colors: AppColors;
  t: (key: string) => string; notice: string; onParent: () => void;
  /** Left out for staff: only the owner invites coaches. */
  onCoach?: () => void;
}) {
  const links = [
    { title: t('academy.dashboardRegisterParent'), hint: t('academy.dashboardRegisterParentHint'), icon: 'person-add-outline' as const, onPress: onParent },
    ...(onCoach ? [{ title: t('academy.dashboardRegisterCoach'), hint: t('academy.dashboardRegisterCoachHint'), icon: 'person-add-outline' as const, onPress: onCoach }] : []),
  ];
  return (
    <Panel styles={styles} colors={colors} style={styles.linkPanel}>
      <Text style={styles.linkPanelTitle}>{t('academy.dashboardParentCoachLinks')}</Text>
      <View style={styles.linkDivider} />
      {links.map((item) => (
        <Pressable key={item.title} onPress={item.onPress} style={({ hovered, pressed }: any) => [styles.linkAction, hovered && styles.linkActionHovered, pressed && styles.pressed]}>
          <View style={styles.linkIcon}><Ionicons name={item.icon} size={17} color={colors.blueLight} /></View>
          <View style={styles.linkTextBlock}><Text style={styles.linkTitle}>{item.title}</Text><Text style={styles.linkHint} numberOfLines={1}>{item.hint}</Text></View>
          <Ionicons name="chevron-forward" size={16} color={colors.grey} />
        </Pressable>
      ))}
      {notice ? <Text style={styles.linkNotice}>{notice}</Text> : null}
    </Panel>
  );
}

function MatchesPanel({ title, sessions, academyName, academyLogoUrl, opponentAcademies, emptyText, showStatus, styles, colors, t, loading, onCreate, onViewAll, onSession, onEnterResult }: {
  title: string; sessions: HubMatch[]; academyName: string; academyLogoUrl: string | null; opponentAcademies: Pick<AcademyRow, 'id' | 'logo_url'>[]; emptyText: string; showStatus: boolean;
  styles: ReturnType<typeof makeStyles>; colors: AppColors; t: (key: string) => string; loading: boolean;
  onCreate?: () => void; onViewAll: () => void; onSession: (session: HubMatch) => void; onEnterResult?: (session: HubMatch) => void;
}) {
  return (
    <Panel styles={styles} colors={colors} style={styles.matchPanel}>
      <View style={styles.panelHeading}>
        <Text style={styles.panelTitle}>{title}</Text>
        <View style={styles.panelHeadingActions}>
          {onCreate ? <Pressable style={styles.smallPrimaryButton} onPress={onCreate}><Ionicons name="add" size={16} color={colors.blackText} /><Text style={styles.smallPrimaryText}>{t('academy.dashboardCreateMatch')}</Text></Pressable> : null}
          <Pressable onPress={onViewAll} accessibilityRole="button"><Text style={styles.textAction}>{t('academy.dashboardViewAll')}</Text></Pressable>
        </View>
      </View>
      {loading ? <ActivityIndicator color={colors.blueLight} style={styles.panelLoading} /> : sessions.length === 0 ? (
        <View style={styles.emptyMatch}><View style={styles.emptyIconSmall}><Ionicons name="trophy-outline" size={18} color={colors.blueLight} /></View><Text style={styles.emptyMessage}>{emptyText}</Text>{onCreate ? <Pressable onPress={onCreate}><Text style={styles.emptyAction}>{t('academy.dashboardScheduleFirstMatch')}</Text></Pressable> : null}</View>
      ) : sessions.map((session) => <MatchSessionRow key={session.id} session={session} academyName={academyName} academyLogoUrl={academyLogoUrl} opponentAcademies={opponentAcademies} showStatus={showStatus} styles={styles} colors={colors} t={t} onSession={() => onSession(session)} onEnterResult={onEnterResult} />)}
    </Panel>
  );
}

function MatchSessionRow({ session, academyName, academyLogoUrl, opponentAcademies, showStatus, styles, colors, t, onSession, onEnterResult }: {
  session: HubMatch; academyName: string; academyLogoUrl: string | null;
  opponentAcademies: Pick<AcademyRow, 'id' | 'logo_url'>[]; showStatus: boolean;
  styles: ReturnType<typeof makeStyles>; colors: AppColors; t: (key: string) => string;
  onSession: () => void; onEnterResult?: (session: HubMatch) => void;
}) {
  const parts = matchDateParts(session.starts_at);
  const opponentLogoUrl = opponentAcademies.find((academy) => academy.id === session.opponent_academy_id)?.logo_url;
  // A phone has no room for both teams, the result and the badge on one line,
  // so they stack: home team, result + badge, opponent.
  const phone = useWindowDimensions().width < 768;
  const middle = showStatus ? <Text style={styles.versus}>{t('academy.dashboardVs')}</Text> : session.home_score != null && session.away_score != null ? <Text style={[styles.matchScore, phone && styles.matchScorePhone]}>{session.home_score} : {session.away_score}</Text> : onEnterResult ? <Pressable onPress={(event) => { event.stopPropagation(); onEnterResult(session); }} style={styles.enterResultButton}><Text style={styles.enterResultText}>{t('academy.dashboardEnterResult')}</Text></Pressable> : <Text style={styles.versus}>—</Text>;
  const badge = showStatus ? <View style={styles.matchStatus}><Text style={styles.matchStatusText}>{session.pitch_id ? t('academy.dashboardHome') : t('academy.dashboardScheduled')}</Text></View> : <View style={styles.completedBadge}><Ionicons name="checkmark-circle" size={13} color={colors.green} /><Text style={styles.completedText}>{t('academy.dashboardCompleted')}</Text></View>;
  return (
    <View style={styles.matchRow}>
      <Pressable onPress={onSession} style={({ hovered, pressed }: any) => [styles.matchRowMain, hovered && styles.matchRowHovered, pressed && styles.pressed]}>
        <View style={[styles.matchDateBlock, phone && styles.matchDateBlockPhone]}><Text style={styles.matchDay}>{parts.day}</Text><Text style={styles.matchDate}>{parts.date}</Text><Text style={styles.matchTime}>{parts.time}</Text></View>
        <View style={[styles.matchDivider, phone && styles.matchDividerPhone]} />
        <View style={styles.matchMain}>
          <View style={[styles.matchTeams, phone && styles.matchTeamsPhone]}>
            <View style={[styles.teamNameWrap, styles.homeTeamWrap]}>{academyLogoUrl ? <Image source={{ uri: academyLogoUrl }} style={styles.teamCrestImage} resizeMode="contain" /> : <View style={styles.teamCrest}><Ionicons name="shield-outline" size={15} color={colors.blueLight} /></View>}<Text style={styles.teamName} numberOfLines={1}>{session.title || academyName}</Text></View>
            {phone ? <View style={styles.matchMiddlePhone}>{middle}{badge}</View> : middle}
            <View style={[styles.teamNameWrap, styles.awayTeamWrap, phone && styles.homeTeamWrap]}>{opponentLogoUrl ? <Image source={{ uri: opponentLogoUrl }} style={styles.teamCrestImage} resizeMode="contain" /> : <View style={[styles.teamCrest, styles.opponentCrest]}><Ionicons name="shield-outline" size={15} color={colors.orange} /></View>}<Text style={styles.teamName} numberOfLines={1}>{session.opponent || t('academy.dashboardOpponentToConfirm')}</Text></View>
          </View>
        </View>
        {phone ? null : badge}
        <Ionicons name="chevron-forward" size={17} color={colors.grey} />
      </Pressable>
    </View>
  );
}

type ActivityItem = {
  id: string; title: string; body: string; meta: string; time: string;
  icon: keyof typeof Ionicons.glyphMap; unread: boolean;
};

/** Match reminders and updates addressed to the person signed in. */
function NoticesPanel({ notices, title, emptyText, styles, colors, onRead }: {
  notices: AcademyNotice[]; title: string; emptyText: string;
  styles: ReturnType<typeof makeStyles>; colors: AppColors; onRead: (notice: AcademyNotice) => void;
}) {
  return (
    <Panel styles={styles} colors={colors}>
      <View style={styles.panelHeading}><Text style={styles.panelTitle}>{title}</Text></View>
      {notices.length === 0 ? (
        <View style={styles.emptyActivity}><Ionicons name="notifications-outline" size={20} color={colors.greyDark} /><Text style={styles.emptyMessage}>{emptyText}</Text></View>
      ) : notices.map((notice) => (
        <Pressable key={notice.id} onPress={() => onRead(notice)} style={({ hovered, pressed }: any) => [styles.activityRow, hovered && styles.linkActionHovered, pressed && styles.pressed]}>
          <View style={styles.activityIcon}><Ionicons name={notice.type === 'match_reminder' ? 'alarm-outline' : 'calendar-outline'} size={17} color={colors.blueLight} /></View>
          <View style={styles.activityText}>
            <View style={styles.activityTitleRow}><Text style={styles.activityTitle} numberOfLines={1}>{notice.title}</Text><Text style={styles.activityTime}>{shortDate(notice.created_at)}</Text></View>
            <Text style={styles.activityBody}>{notice.body}</Text>
          </View>
          {notice.read_at ? null : <View style={styles.unreadDotSmall} />}
        </Pressable>
      ))}
    </Panel>
  );
}

function CommunicationsPanel({ parents, coaches, activity, styles, colors, t, loading, onCompose, onChooseAudience, onViewAll, onOpenConversation }: {
  parents: number; coaches: number; activity: ActivityItem[];
  styles: ReturnType<typeof makeStyles>; colors: AppColors; t: (key: string) => string; loading: boolean;
  onCompose: () => void; onChooseAudience: (audience: 'parents' | 'coaches') => void;
  onViewAll: () => void; onOpenConversation: (conversationId: string) => void;
}) {
  return (
    <Panel styles={styles} colors={colors} style={styles.communicationPanel}>
      <View style={styles.panelHeading}>
        <Text style={styles.panelTitle}>{t('academy.dashboardCommunications')}</Text>
        <Pressable onPress={onCompose} style={styles.smallPrimaryButton}><Ionicons name="add" size={16} color={colors.blackText} /><Text style={styles.smallPrimaryText}>{t('academy.dashboardNewMessage')}</Text></Pressable>
      </View>
      <View style={styles.audienceArea}>
        <Text style={styles.formLabel}>{t('academy.dashboardSendTo')}</Text>
        <View style={styles.audienceRow}>
          <Pressable onPress={() => onChooseAudience('parents')} style={({ hovered }: any) => [styles.audienceChip, hovered && styles.audienceChipSelected]} accessibilityRole="button">
            <Ionicons name="people-outline" size={22} color={colors.blueLight} />
            <View><Text style={styles.audienceTitle}>{t('academy.tabParents')}</Text><Text style={styles.audienceCount}>{parents} {t('academy.dashboardRecipients')}</Text></View>
          </Pressable>
          <Pressable onPress={() => onChooseAudience('coaches')} style={({ hovered }: any) => [styles.audienceChip, hovered && styles.audienceChipSelected]} accessibilityRole="button">
            <Ionicons name="person-outline" size={22} color={colors.blueLight} />
            <View><Text style={styles.audienceTitle}>{t('academy.rosterCoaches')}</Text><Text style={styles.audienceCount}>{coaches} {t('academy.dashboardRecipients')}</Text></View>
          </Pressable>
        </View>
      </View>
      <View style={styles.activityHeader}>
        <Text style={styles.panelTitleSmall}>{t('academy.dashboardRecentMessages')}</Text>
        <Pressable onPress={onViewAll}><Text style={styles.textAction}>{t('academy.dashboardViewAll')}</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator color={colors.blueLight} style={styles.panelLoading} /> : activity.length === 0 ? (
        <View style={styles.emptyActivity}><Ionicons name="chatbubbles-outline" size={20} color={colors.greyDark} /><Text style={styles.emptyMessage}>{t('academy.dashboardNoMessages')}</Text></View>
      ) : activity.map((item) => (
        <Pressable key={item.id} onPress={() => onOpenConversation(item.id)} style={({ hovered, pressed }: any) => [styles.activityRow, hovered && styles.linkActionHovered, pressed && styles.pressed]}>
          <View style={styles.activityIcon}><Ionicons name={item.icon} size={17} color={colors.blueLight} /></View>
          <View style={styles.activityText}>
            <View style={styles.activityTitleRow}><Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.activityTime}>{item.time ? shortDate(item.time) : ''}</Text></View>
            <Text style={styles.activityMeta} numberOfLines={1}>{item.meta}</Text>
            <Text style={styles.activityBody} numberOfLines={2}>{item.body}</Text>
          </View>
          {item.unread ? <View style={styles.unreadDotSmall} /> : null}
          <Ionicons name="chevron-forward" size={15} color={colors.grey} />
        </Pressable>
      ))}
    </Panel>
  );
}

function CoachesOnDutyPanel({ coaches, styles, colors, t, onViewAll }: {
  coaches: DirectoryCoach[]; styles: ReturnType<typeof makeStyles>; colors: AppColors; t: (key: string) => string; onViewAll: () => void;
}) {
  return (
    <Panel styles={styles} colors={colors} style={styles.coachesPanel}>
      <PanelHeading styles={styles} title={t('academy.dashboardCoachesOnDuty')} action={t('academy.dashboardViewAll')} onAction={onViewAll} />
      <Text style={styles.dutyRange}>{t('academy.dashboardUpcomingWeek')}</Text>
      {coaches.length ? coaches.map((coach) => (
        <View key={coach.id} style={styles.dutyRow}>
          <View style={styles.activityIcon}><Ionicons name="person-outline" size={17} color={colors.blueLight} /></View>
          <Text style={styles.activityTitle} numberOfLines={1}>{coach.full_name}</Text>
        </View>
      )) : <View style={styles.coachEmpty}><View style={styles.emptyIconSmall}><Ionicons name="person-outline" size={17} color={colors.blueLight} /></View><Text style={styles.emptyMessage}>{t('academy.dashboardNoCoachesOnDuty')}</Text></View>}
    </Panel>
  );
}

function Panel({ styles, colors, style, children }: { styles: ReturnType<typeof makeStyles>; colors: AppColors; style?: any; children: React.ReactNode }) {
  return <View style={[styles.panel, style, { borderColor: colors.border, backgroundColor: colors.card }]}>{children}</View>;
}

function PanelHeading({ styles, title, action, onAction }: { styles: ReturnType<typeof makeStyles>; title: string; action: string; onAction: () => void }) {
  return <View style={styles.panelHeading}><Text style={styles.panelTitle}>{title}</Text><Pressable onPress={onAction}><Text style={styles.textAction}>{action}</Text></Pressable></View>;
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    tabBody: { width: '100%', paddingTop: 14 },
    academyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
    linkNotice: { color: colors.blueLight, fontSize: 12.5, lineHeight: 17, marginTop: 6 },
    dutyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16.8, paddingVertical: 6 },
    screenContent: { paddingHorizontal: 25.2, paddingTop: 0, paddingBottom: 28.8, maxWidth: 2160, alignSelf: 'stretch' },
    topHeader: { minHeight: 84, position: 'relative', zIndex: 40, overflow: 'visible', flexDirection: 'row', alignItems: 'center', gap: 16.8, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 0 },
    topHeaderCompact: { minHeight: 0, flexWrap: 'wrap', justifyContent: 'flex-start', paddingVertical: 12, gap: 9.6 },
    pageTitle: { color: colors.white, fontSize: 32.4, lineHeight: 39.6, fontWeight: '700', marginRight: 9.6 },
    // Phone: title, academy picker, then season + help + search, then the create button.
    screenContentPhone: { paddingHorizontal: 16, paddingBottom: 24 },
    topHeaderPhone: { gap: 10, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 0 },
    pageTitlePhone: { width: '100%', fontSize: 26, lineHeight: 32, marginRight: 0, paddingRight: 56 },
    phoneFullWidth: { width: '100%' },
    phoneSeasonWrap: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
    headerPickerPhone: { width: '100%' },
    iconButtonPhone: { width: 46, height: 46, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    headerPickerWrap: { position: 'relative', zIndex: 30 },
    headerPicker: { minHeight: 48, width: 343.2, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14.4, borderRadius: 8.4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    headerPickerCompact: { width: 264 },
    headerCrest: { width: 36, height: 36, backgroundColor: 'transparent' },
    headerCrestPlaceholder: { width: 26.4, height: 26.4, borderRadius: 6, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
    headerPickerText: { flex: 1, minWidth: 0, color: colors.white, fontSize: 15.6, fontWeight: '600' },
    seasonPicker: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9.6, paddingHorizontal: 14.4, borderRadius: 8.4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    seasonText: { color: colors.greySoft, fontSize: 14.4, fontWeight: '600' },
    primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8.4, paddingHorizontal: 16.8, borderRadius: 8.4, borderWidth: 1, borderColor: '#61BAFB', backgroundColor: colors.blueLight },
    primaryButtonText: { color: colors.blackText, fontSize: 14.4, fontWeight: '700' },
    primaryHovered: { backgroundColor: '#82C9FB', borderColor: '#82C9FB' },
    headerSpacer: { flex: 1 },
    iconButton: { width: 45.6, height: 45.6, alignItems: 'center', justifyContent: 'center', borderRadius: 8.4 },
    dropdown: { position: 'absolute', top: 45, left: 0, minWidth: 312, maxWidth: 384, zIndex: 100, elevation: 24, borderRadius: 9.6, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0B1722', padding: 6, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
    dropdownRow: { minHeight: 57.6, justifyContent: 'center', gap: 2.4, paddingHorizontal: 12, borderRadius: 7.2 },
    dropdownRowActive: { backgroundColor: colors.blueSoft },
    dropdownTitle: { color: colors.white, fontSize: 14.4, fontWeight: '600' },
    dropdownMeta: { color: colors.grey, fontSize: 13.2 },
    hovered: { backgroundColor: colors.blueSoft },
    pressed: { opacity: 0.75 },
    searchBar: { minHeight: 48, marginTop: 14.4, flexDirection: 'row', alignItems: 'center', gap: 10.8, borderRadius: 8.4, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 13.2, backgroundColor: colors.card },
    searchInput: { flex: 1, height: 45.6, color: colors.white, fontSize: 14.4, outlineStyle: 'none' as any },
    createForm: { marginTop: 16.8, padding: 16.8, borderRadius: 9.6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    createFormHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14.4 },
    createInputs: { flexDirection: 'row', alignItems: 'center', gap: 10.8 },
    formInputPhone: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%' },
    createFormCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
    // Phone: fields and buttons stack, each full width (a row left the inputs squeezed to nothing).
    createInputsPhone: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
    formInput: { flex: 1, minWidth: 0, height: 55.2, color: colors.white, fontSize: 16.8, fontWeight: '500', borderRadius: 9.6, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, paddingHorizontal: 15.6, outlineStyle: 'none' as any },
    formLabel: { color: colors.greySoft, fontSize: 14.4, fontWeight: '600', marginBottom: 8.4 },
    editAcademyModal: { width: 'min(440px, 94%)' as any, maxWidth: 528, maxHeight: '90%', padding: 16.8, borderRadius: 9.6 },
    editAcademyHeader: { paddingBottom: 12, marginBottom: 13.2 },
    editModalTitle: { color: colors.white, fontSize: 15.6, lineHeight: 20.4, fontWeight: '700' },
    editModalSubtitle: { color: colors.grey, fontSize: 12, marginTop: 3.6 },
    editCloseButton: { width: 33.6, height: 33.6, alignItems: 'center', justifyContent: 'center', borderRadius: 7.2 },
    editAcademyScroll: { flexGrow: 0 },
    editAcademyContent: { paddingBottom: 0 },
    editProfileRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14.4 },
    editLogoColumn: { width: 100.8, alignItems: 'flex-start', paddingLeft: 8.4 },
    editLabel: { color: colors.greySoft, fontSize: 12, fontWeight: '600', marginBottom: 6 },
    editLogoPicker: { alignItems: 'center', gap: 6, paddingTop: 1.2 },
    editLogoImage: { width: 88.8, height: 88.8, borderRadius: 0, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    editLogoChange: { flexDirection: 'row', alignItems: 'center', gap: 3.6 },
    editLogoChangeText: { color: colors.blueLight, fontSize: 12, fontWeight: '600' },
    editFieldsColumn: { flex: 1, minWidth: 0, gap: 3.6 },
    editTextInput: { width: '100%' as any, minWidth: 0, height: 40.8, color: colors.white, fontSize: 14.4, fontWeight: '500', borderRadius: 7.2, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, paddingHorizontal: 12, outlineStyle: 'none' as any },
    editDescriptionSection: { marginTop: 13.2 },
    editDescriptionInput: { height: 64.8, textAlignVertical: 'top', paddingTop: 9.6, paddingBottom: 7.2 },
    editMainRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9.6, marginTop: 12, paddingHorizontal: 8.4, borderRadius: 7.2, backgroundColor: colors.blueSoft },
    editMainLabel: { flex: 1, color: colors.white, fontSize: 12, fontWeight: '500' },
    editModalActions: { marginTop: 14.4, paddingTop: 12, gap: 8.4 },
    editActionButton: { minHeight: 40.8, paddingHorizontal: 14.4, borderRadius: 7.2 },
    editSaveText: { fontSize: 12 },
    optionalLabel: { color: colors.grey, fontWeight: '400' },
    errorText: { color: colors.red, fontSize: 14.4, marginTop: 10.8 },
    disabledButton: { opacity: 0.5 },
    outlineButton: { minHeight: 43.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7.2, paddingHorizontal: 13.2, borderRadius: 8.4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft },
    outlineButtonText: { color: colors.greySoft, fontSize: 13.2, fontWeight: '600' },
    sectionNav: { minHeight: 52.8, position: 'relative', zIndex: 0, flexDirection: 'row', alignItems: 'stretch', gap: 16.8, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 14.4 },
    sectionNavScroll: { flexGrow: 0, flexShrink: 0 },
    sectionNavCompact: { gap: 2, minWidth: '100%' },
    sectionTabCompact: { minWidth: 0, paddingHorizontal: 12 },
    sectionTabLabelCompact: { fontSize: 13.5 },
    sectionTab: { minWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9.6, paddingHorizontal: 14.4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    sectionTabActive: { borderBottomColor: colors.blueLight },
    sectionTabHovered: { backgroundColor: colors.surfaceMuted },
    sectionTabLabel: { color: colors.grey, fontSize: 14.4, fontWeight: '500' },
    sectionTabLabelActive: { color: colors.white, fontWeight: '600' },
    // Declared last so the four tabs share a phone's width without scrolling.
    sectionNavPhone: { gap: 0 },
    sectionTabPhone: { flexGrow: 1, paddingHorizontal: 4 },
    sectionTabLabelPhone: { fontSize: 12.5 },
    dashboardGrid: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 14.4 },
    dashboardGridFill: { alignItems: 'stretch' },
    dashboardGridNarrow: { flexDirection: 'column' },
    leftColumnFill: { alignSelf: 'stretch' },
    academyPanelGrow: { flexGrow: 1 },
    rosterPanelGrow: { flexGrow: 1 },
    columnFullWidth: { width: '100%' },
    leftColumn: { width: '26%', gap: 14.4 },
    middleColumn: { width: '40%', gap: 14.4 },
    rightColumn: { width: '32%', gap: 14.4 },
    panel: { borderRadius: 9.6, borderWidth: 1, backgroundColor: colors.card, overflow: 'hidden' },
    academyPanel: { borderRadius: 9.6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
    coverWrap: { height: 117.6, position: 'relative', overflow: 'hidden', backgroundColor: colors.cardSoft },
    coverImage: { width: '100%', height: 117.6 },
    coverFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#152A39' },
    coverFallbackText: { color: colors.grey, fontSize: 13.2, marginTop: 6 },
    cameraButton: { position: 'absolute', top: 10, right: 10, width: 38.4, height: 38.4, alignItems: 'center', justifyContent: 'center', borderRadius: 19.2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(8,17,26,0.78)' },
    academyCardBody: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 16.8, paddingBottom: 13.2, paddingTop: 0 },
    academyTitleRow: { minHeight: 69.6, flexDirection: 'row', alignItems: 'center', gap: 13.2 },
    academyLogo: { width: 69.6, height: 69.6, backgroundColor: 'transparent', marginTop: -18 },
    academyLogoFallback: { alignItems: 'center', justifyContent: 'center' },
    academyTitleBlock: { flex: 1, minWidth: 0, paddingTop: 3.6 },
    academyNameLine: { flexDirection: 'row', alignItems: 'center', gap: 7.2 },
    academyName: { flexShrink: 1, color: colors.white, fontSize: 19.2, lineHeight: 25.2, fontWeight: '700' },
    pausedBadge: { color: colors.orange, fontSize: 10.8, fontWeight: '700' },
    academyDescription: { color: colors.grey, fontSize: 12, lineHeight: 16.8, marginTop: 3.6 },
    academyMetaRow: { minHeight: 26.4, flexDirection: 'row', alignItems: 'center', gap: 9.6 },
    academyMetaText: { flex: 1, color: colors.greySoft, fontSize: 13.2 },
    academyFooter: { minHeight: 40.8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10.8, marginTop: 3.6 },
    sportTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 9.6 },
    sportTagText: { color: colors.greySoft, fontSize: 12, fontWeight: '600' },
    editAcademyButton: { minHeight: 37.2, paddingHorizontal: 10.8 },
    panelHeading: { minHeight: 50.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10.8, paddingHorizontal: 16.8, paddingVertical: 7.2, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    panelHeadingActions: { flexDirection: 'row', alignItems: 'center', gap: 15.6 },
    panelTitle: { color: colors.white, fontSize: 16.8, lineHeight: 22.8, fontWeight: '700' },
    panelTitleSmall: { color: colors.white, fontSize: 14.4, fontWeight: '700' },
    panelHint: { color: colors.grey, fontSize: 13.2, marginTop: 4.8 },
    textAction: { color: colors.blueLight, fontSize: 13.2, fontWeight: '600' },
    rosterGrid: { flexGrow: 1, alignContent: 'space-around', flexDirection: 'row', flexWrap: 'wrap', gap: 9.6, padding: 13.2 },
    rosterMetric: { flexGrow: 1, flexBasis: '45%', minHeight: 51.6, flexDirection: 'row', alignItems: 'center', gap: 9.6, paddingHorizontal: 10.8, borderRadius: 8.4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSoft },
    rosterMetricHovered: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
    rosterMetricText: { flex: 1, minWidth: 0 },
    rosterValue: { color: colors.white, fontSize: 16.8, lineHeight: 20.4, fontWeight: '700' },
    rosterLabel: { color: colors.greySoft, fontSize: 12, marginTop: 1.2 },
    linkDivider: { height: 1.2, backgroundColor: colors.borderSoft, marginHorizontal: 16.8, marginTop: 2.4 },
    linkPanel: { paddingBottom: 10.8 },
    linkPanelTitle: { color: colors.white, fontSize: 16.8, lineHeight: 22.8, fontWeight: '700', paddingHorizontal: 16.8, paddingTop: 10.8, paddingBottom: 4.8 },
    linkAction: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15.6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    linkActionHovered: { backgroundColor: colors.surfaceMuted },
    linkIcon: { width: 38.4, height: 38.4, alignItems: 'center', justifyContent: 'center', borderRadius: 19.2, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.blueSoft },
    linkTextBlock: { flex: 1, minWidth: 0 },
    linkTitle: { color: colors.white, fontSize: 13.2, lineHeight: 18, fontWeight: '600' },
    linkHint: { color: colors.grey, fontSize: 12, marginTop: 2.4 },
    smallPrimaryButton: { minHeight: 40.8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 13.2, borderRadius: 7.2, borderWidth: 1, borderColor: '#61BAFB', backgroundColor: colors.blueLight },
    smallPrimaryText: { color: colors.blackText, fontSize: 12, fontWeight: '700' },
    matchPanel: { minHeight: 0 },
    matchRow: { minHeight: 86.4, flexDirection: 'row', alignItems: 'center', gap: 9.6, paddingHorizontal: 14.4, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    matchRowMain: { flex: 1, minWidth: 0, minHeight: 86.4, flexDirection: 'row', alignItems: 'center', gap: 9.6 },
    matchRowHovered: { backgroundColor: colors.surfaceMuted },
    matchDateBlock: { width: 69.6, alignItems: 'flex-start', gap: 2.4 },
    matchDay: { color: colors.grey, fontSize: 10.8, fontWeight: '600' },
    matchDate: { color: colors.white, fontSize: 14.4, lineHeight: 18, fontWeight: '700' },
    matchTime: { color: colors.grey, fontSize: 12 },
    matchDivider: { width: 1.2, height: 62.4, backgroundColor: colors.border, marginRight: 1.2 },
    matchMain: { flex: 1, minWidth: 0 },
    matchTeams: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    matchTeamsPhone: { flexDirection: 'column', alignItems: 'stretch', gap: 6, paddingVertical: 10 },
    matchMiddlePhone: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    matchScorePhone: { minWidth: 0, textAlign: 'left' },
    matchDateBlockPhone: { width: 52 },
    matchDividerPhone: { height: 80 },
    teamNameWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8.4 },
    homeTeamWrap: { justifyContent: 'flex-start' },
    awayTeamWrap: { justifyContent: 'flex-end' },
    teamCrest: { width: 26.4, height: 26.4, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: colors.blueSoft },
    teamCrestImage: { width: 33.6, height: 33.6, backgroundColor: 'transparent' },
    opponentCrest: { backgroundColor: colors.orangeSoft },
    teamName: { flexShrink: 1, color: colors.white, fontSize: 13.2, fontWeight: '600' },
    versus: { color: colors.grey, fontSize: 10.8, fontWeight: '500' },
    matchScore: { minWidth: 55.2, textAlign: 'center', color: colors.white, fontSize: 15.6, fontWeight: '700', fontVariant: ['tabular-nums'] },
    enterResultButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10.8, borderRadius: 7.2, borderWidth: 1, borderColor: colors.borderBlue, backgroundColor: colors.blueSoft },
    enterResultText: { color: colors.blueLight, fontSize: 12, fontWeight: '700' },
    matchStatus: { minWidth: 58.8, paddingHorizontal: 9.6, paddingVertical: 6, borderRadius: 7.2, borderWidth: 1, borderColor: colors.borderBlue, backgroundColor: colors.blueSoft, alignItems: 'center' },
    matchStatusText: { color: colors.blueLight, fontSize: 10.8, fontWeight: '600' },
    completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4.8, paddingHorizontal: 7.2, paddingVertical: 4.8, borderRadius: 6, backgroundColor: colors.greenSoft },
    completedText: { color: colors.green, fontSize: 10.8, fontWeight: '600' },
    emptyMatch: { minHeight: 150, justifyContent: 'center', alignItems: 'center', gap: 8.4, paddingHorizontal: 21.6 },
    emptyIconSmall: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.blueSoft },
    emptyMessage: { color: colors.grey, textAlign: 'center', fontSize: 13.2, lineHeight: 19.2 },
    emptyAction: { color: colors.blueLight, fontSize: 13.2, fontWeight: '600' },
    panelLoading: { paddingVertical: 36 },
    communicationPanel: { minHeight: 0 },
    audienceArea: { paddingHorizontal: 16.8, paddingTop: 8.4, paddingBottom: 7.2 },
    audienceRow: { flexDirection: 'row', gap: 10.8 },
    audienceChip: { flex: 1, minHeight: 55.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10.8, paddingHorizontal: 9.6, borderRadius: 8.4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSoft },
    audienceChipSelected: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
    audienceTitle: { color: colors.white, fontSize: 12, fontWeight: '600' },
    audienceCount: { color: colors.grey, fontSize: 10.8, marginTop: 3.6 },
    activityHeader: { minHeight: 43.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16.8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderSoft },
    activityRow: { minHeight: 81.6, flexDirection: 'row', alignItems: 'center', gap: 10.8, paddingHorizontal: 14.4, paddingVertical: 7.2, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    activityIcon: { width: 40.8, height: 40.8, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 20.4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.blueSoft },
    activityText: { flex: 1, minWidth: 0, gap: 3.6 },
    activityTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
    activityTitle: { flex: 1, color: colors.white, fontSize: 12, fontWeight: '700' },
    activityTime: { color: colors.grey, fontSize: 10.8 },
    activityMeta: { color: colors.grey, fontSize: 10.8 },
    activityBody: { color: colors.greySoft, fontSize: 10.8, lineHeight: 15.6 },
    unreadDotSmall: { width: 7.2, height: 7.2, borderRadius: 3.6, backgroundColor: colors.blueLight },
    emptyActivity: { minHeight: 96, justifyContent: 'center', alignItems: 'center', gap: 9.6 },
    coachesPanel: { minHeight: 0, paddingBottom: 12 },
    dutyRange: { color: colors.grey, fontSize: 12, marginHorizontal: 16.8, marginTop: 8.4, marginBottom: 4.8 },
    coachEmpty: { minHeight: 57.6, alignItems: 'center', justifyContent: 'center', gap: 8.4, paddingHorizontal: 14.4 },
    emptyDashboard: { minHeight: 396, justifyContent: 'center', alignItems: 'center', gap: 14.4 },
    emptyIcon: { width: 64.8, height: 64.8, alignItems: 'center', justifyContent: 'center', borderRadius: 32.4, backgroundColor: colors.blueSoft },
    modalBackdrop: { ...StyleSheet.absoluteFill, zIndex: 80, elevation: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,10,15,0.78)' },
    composeModal: { width: 'min(480px, 92%)' as any, maxHeight: '85%', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 21.6, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 14.4 } },
    composeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16.8, borderBottomWidth: 1, borderColor: colors.borderSoft, marginBottom: 16.8 },
    recipientRowActive: { backgroundColor: colors.blueSoft },
    matchesFilterSelect: { height: 42, boxSizing: 'border-box', border: `1px solid ${colors.border}`, borderRadius: 7.2, backgroundColor: colors.cardSoft, color: colors.white, paddingHorizontal: 10.8, fontSize: 13.2, fontFamily: 'inherit', colorScheme: 'dark', outlineStyle: 'none', cursor: 'pointer' } as any,
    matchDateControl: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#385267', borderRadius: 9.6, backgroundColor: colors.cardSoft, position: 'relative', cursor: 'pointer' } as any,
    matchCalendarNav: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: colors.cardSoft, cursor: 'pointer' } as any,
    matchCalendarDay: { width: '14.2857%' as any, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 7, cursor: 'pointer' } as any,
    matchCalendarDayDisabled: { cursor: 'default' } as any,
    matchNativeIcon: { position: 'absolute', left: 14, top: 18, zIndex: 1, pointerEvents: 'none' } as any,
    matchNativeInputWithIcon: { width: '100%', height: 56, boxSizing: 'border-box', border: '1px solid #385267', borderRadius: 9.6, backgroundColor: colors.cardSoft, color: colors.white, paddingTop: 7, paddingRight: 12, paddingBottom: 7, paddingLeft: 48, fontSize: 16.8, fontFamily: 'inherit', colorScheme: 'dark', outlineStyle: 'none', cursor: 'pointer' } as any,
    checkbox: { width: 20.4, height: 20.4, alignItems: 'center', justifyContent: 'center', borderRadius: 4.8, borderWidth: 1, borderColor: colors.border },
    checkboxActive: { borderColor: colors.blueLight, backgroundColor: colors.blueLight },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9.6, marginTop: 19.2, paddingTop: 16.8, borderTopWidth: 1, borderColor: colors.borderSoft },
  });
}
