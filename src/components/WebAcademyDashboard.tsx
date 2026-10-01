import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

import Screen from './Screen';
import { useTranslation } from '../i18n/LanguageContext';
import {
  Conversation,
  collapseToOnePerConversation,
  createGroupChat,
  ensureStaffMember,
  fetchConversations,
  startDirectChat,
} from '../lib/academyChat';
import {
  AcademyCounts,
  AcademyRow,
  EnrolmentRow,
  SessionRow,
  fetchEnrolments,
  fetchSessions,
  updateSessionResult,
} from '../lib/academyData';
import { fetchNotices, markNoticeRead, AcademyNotice } from '../lib/academyNotices';
import { useAcademyRealtime } from '../lib/academyRealtime';
import { WIDE_CONTENT_MAX_WIDTH, useBreakpoint } from '../theme/breakpoints';
import * as Clipboard from 'expo-clipboard';
import { PickedAvatarImage, cropAndUploadAcademyCover, cropAndUploadAcademyLogo } from '../lib/avatarUpload';
import { addSessionAttendees, createSession, fetchPublicAcademiesForMatches, setMainAcademy, updateAcademy } from '../lib/academyData';
import AvatarPickerTrigger from './AvatarPickerTrigger';
import AvatarCropModal from './AvatarCropModal';
import { AppColors, weeklineColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/layout';

type CreateAcademyForm = {
  visible: boolean;
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
};

type AcademyArea = 'overview' | 'academies' | 'players' | 'parents' | 'coaches' | 'matches' | 'messages';

const MatchDateInput = 'input' as any;
const MatchTimeSelect = 'select' as any;
const MatchTimeOption = 'option' as any;

const AREAS: { key: AcademyArea; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'overview', icon: 'aperture-outline', label: 'academy.dashboardOverview' },
  { key: 'academies', icon: 'school-outline', label: 'academy.dashboardAcademies' },
  { key: 'players', icon: 'people-outline', label: 'academy.tabPlayers' },
  { key: 'parents', icon: 'people-circle-outline', label: 'academy.tabParents' },
  { key: 'coaches', icon: 'person-outline', label: 'academy.rosterCoaches' },
  { key: 'matches', icon: 'calendar-outline', label: 'academy.tabMatches' },
  { key: 'messages', icon: 'chatbox-outline', label: 'academy.tabMessages' },
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

function localDateIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isGoogleMapsLink(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const googleHost = host === 'google.com' || /(^|\.)google\.[a-z.]+$/.test(host);
    return url.protocol.startsWith('http') && (
      host === 'maps.app.goo.gl' ||
      (host === 'goo.gl' && url.pathname.startsWith('/maps')) ||
      (googleHost && (url.pathname.startsWith('/maps') || host.startsWith('maps.')))
    );
  } catch { return false; }
}

function mapsLocationLabel(value: string) {
  try {
    const url = new URL(value);
    const place = url.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
    if (place) return decodeURIComponent(place.replaceAll('+', ' '));
    const query = url.searchParams.get('q') || url.searchParams.get('query');
    if (query && !/^[-\d.,\s]+$/.test(query)) return query;
  } catch { /* The submit handler validates the URL before reaching here. */ }
  return 'Google Maps location';
}

export default function WebAcademyDashboard({
  academies,
  counts,
  loading,
  createForm,
  onRefresh,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const { unread, messagesVersion, enrolmentsVersion } = useAcademyRealtime();
  const { width } = useBreakpoint();
  const { height: viewportHeight } = useWindowDimensions();
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

  useEffect(() => {
    const seasonCheck = setInterval(() => {
      setCurrentSeasonYear(startOfCurrentSeason());
    }, 60 * 60 * 1000);
    return () => clearInterval(seasonCheck);
  }, []);

  useEffect(() => {
    setSeasonStartYear((selectedYear) => selectedYear === currentSeasonYear - 1 ? currentSeasonYear : selectedYear);
  }, [currentSeasonYear]);
  const [enrolments, setEnrolments] = useState<EnrolmentRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notices, setNotices] = useState<AcademyNotice[]>([]);
  const [isLoadingAcademy, setIsLoadingAcademy] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeAudience, setComposeAudience] = useState<'parents' | 'coaches'>('parents');
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [isStartingMessage, setIsStartingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [editAcademy, setEditAcademy] = useState<AcademyRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAgeGroup, setEditAgeGroup] = useState('');
  const [editLogo, setEditLogo] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<PickedAvatarImage | null>(null);
  const [cropTarget, setCropTarget] = useState<'logo' | 'cover'>('logo');
  const [editBusy, setEditBusy] = useState(false);
  const [makeMain, setMakeMain] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const [showMatchAcademies, setShowMatchAcademies] = useState(false);
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchDate, setMatchDate] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 1); return localDateIso(date); });
  const [matchStartMinutes, setMatchStartMinutes] = useState<number | null>(17 * 60);
  const [matchEndMinutes, setMatchEndMinutes] = useState<number | null>(18 * 60 + 30);
  const [matchOpponent, setMatchOpponent] = useState('');
  const [matchOpponentId, setMatchOpponentId] = useState<string | null>(null);
  const [opponentOptions, setOpponentOptions] = useState<Awaited<ReturnType<typeof fetchPublicAcademiesForMatches>>>([]);
  const [matchMapsUrl, setMatchMapsUrl] = useState('');
  const [matchSelected, setMatchSelected] = useState<Set<string>>(new Set());
  const [matchRosterTab, setMatchRosterTab] = useState<'player' | 'staff'>('player');
  const [matchError, setMatchError] = useState('');
  const [resultSession, setResultSession] = useState<SessionRow | null>(null);
  const [homeScoreInput, setHomeScoreInput] = useState('');
  const [awayScoreInput, setAwayScoreInput] = useState('');
  const [resultBusy, setResultBusy] = useState(false);
  const [resultError, setResultError] = useState('');
  const matchStartOptions = useMemo(() => {
    const day = new Date(`${matchDate}T00:00:00`);
    return Array.from({ length: 48 }, (_, i) => i * 30).filter((minutes) =>
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60).getTime() >= Date.now()
    );
  }, [matchDate]);
  const matchEndOptions = useMemo(() => matchStartMinutes === null ? [] :
    Array.from({ length: 48 }, (_, i) => (i + 1) * 30 + matchStartMinutes)
      .filter((minutes) => minutes <= 48 * 30), [matchStartMinutes]);

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

  const loadAcademyContent = useCallback(async (academyId: string) => {
    setIsLoadingAcademy(true);
    const [enrolmentRows, sessionRows, conversationRows, noticeRows] = await Promise.all([
      fetchEnrolments(academyId),
      fetchSessions(academyId, 'match'),
      fetchConversations(),
      fetchNotices(),
    ]);
    setEnrolments(enrolmentRows);
    setSessions(sessionRows);
    setConversations(
      collapseToOnePerConversation(conversationRows).filter(
        (row) => row.academy_id === academyId && (row.kind === 'direct' || row.message_count > 0)
      )
    );
    setNotices(noticeRows.filter((row) => row.academy_id === academyId));
    setIsLoadingAcademy(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadAcademyContent(selectedId);
  }, [selectedId, loadAcademyContent, messagesVersion, enrolmentsVersion, unread]);

  const approvedPlayers = useMemo(
    () => enrolments.filter((row) => row.status === 'approved' && row.member?.member_kind === 'player'),
    [enrolments]
  );
  const approvedParents = useMemo(
    () => enrolments.filter((row) => row.status === 'approved' && row.member?.member_kind === 'guardian'),
    [enrolments]
  );
  const visiblePlayerCount = isLoadingAcademy ? academyCounts?.players ?? 0 : approvedPlayers.length;
  const visibleParentCount = isLoadingAcademy ? academyCounts?.parents ?? 0 : approvedParents.length;
  const seasonStart = new Date(seasonStartYear, 7, 1).getTime();
  const seasonEnd = new Date(seasonStartYear + 1, 7, 1).getTime();
  const seasonSessions = useMemo(
    () => sessions.filter((row) => {
      const start = new Date(row.starts_at).getTime();
      return start >= seasonStart && start < seasonEnd;
    }),
    [sessions, seasonStart, seasonEnd]
  );
  const now = Date.now();
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const upcoming = useMemo(
    () => seasonSessions
      .filter((row) => !row.is_cancelled && new Date(row.starts_at).getTime() >= now)
      .filter((row) => !normalizedSearch || [row.title, row.opponent, row.location_name]
        .some((part) => part?.toLocaleLowerCase().includes(normalizedSearch)))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 3),
    [seasonSessions, now, normalizedSearch]
  );
  const played = useMemo(
    () => seasonSessions
      .filter((row) => !row.is_cancelled && new Date(row.starts_at).getTime() < now)
      .filter((row) => !normalizedSearch || [row.title, row.opponent, row.location_name]
        .some((part) => part?.toLocaleLowerCase().includes(normalizedSearch)))
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      .slice(0, 3),
    [seasonSessions, now, normalizedSearch]
  );
  const recentConversations = useMemo(
    () => conversations
      .filter((row) => !normalizedSearch || [row.title, row.other_names.join(' '), row.last_body]
        .some((part) => part?.toLocaleLowerCase().includes(normalizedSearch)))
      .sort((a, b) => (b.last_at ?? '').localeCompare(a.last_at ?? ''))
      .slice(0, 3),
    [conversations, normalizedSearch]
  );
  const latestNotices = useMemo(
    () => notices
      .filter((row) => row.type === 'session' || row.type === 'message')
      .filter((row) => !normalizedSearch || [row.title, row.body]
        .some((part) => part?.toLocaleLowerCase().includes(normalizedSearch)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 3),
    [notices, normalizedSearch]
  );
  const recentActivity = useMemo(() => {
    const rows = [
      ...latestNotices.map((notice) => ({
        id: `notice:${notice.id}`,
        title: notice.title,
        body: notice.body ?? '',
        meta: notice.type === 'session' ? t('academy.dashboardMatchUpdate') : t('academy.dashboardAcademyMessage'),
        time: notice.created_at,
        icon: notice.type === 'session' ? 'calendar-outline' as const : 'megaphone-outline' as const,
        unread: !notice.read_at,
      })),
      ...recentConversations.map((conversation) => ({
        id: `conversation:${conversation.id}`,
        title: conversation.kind === 'group'
          ? conversation.title || t('academyChat.untitledGroup')
          : conversation.other_names.join(', ') || t('academyChat.unknownPerson'),
        body: conversation.last_body || t('academyChat.noMessagesYet'),
        meta: t('academy.dashboardDirectMessage'),
        time: conversation.last_at ?? '',
        icon: 'chatbubble-ellipses-outline' as const,
        unread: conversation.unread_count > 0,
      })),
    ];
    return rows.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 3);
  }, [latestNotices, recentConversations, t]);

  const goToAcademyDetails = useCallback((targetSection?: AcademyArea) => {
    if (!selectedAcademy) return;
    void targetSection;
    setShowAcademies(false);
    router.push({ pathname: '/academy-details', params: { academyId: selectedAcademy.id } } as any);
  }, [router, selectedAcademy]);

  const goToConversation = useCallback((row: Conversation) => {
    router.push({
      pathname: '/academy-chat',
      params: { conversationId: row.id, asMemberId: row.for_member_id },
    } as any);
  }, [router]);

  function toggleRecipient(memberId: string) {
    setSelectedRecipients((current) => {
      const updated = new Set(current);
      if (updated.has(memberId)) updated.delete(memberId);
      else updated.add(memberId);
      return updated;
    });
  }

  function openCompose(audience: 'parents' | 'coaches' = 'parents') {
    setComposeAudience(audience);
    setShowCompose(true);
    setSelectedRecipients(new Set());
    setMessageError('');
  }

  async function startMessage() {
    if (!selectedAcademy || selectedRecipients.size === 0 || isStartingMessage) return;
    setIsStartingMessage(true);
    setMessageError('');
    const staff = await ensureStaffMember(selectedAcademy.id);
    if (!staff) {
      setMessageError(t('academyChat.couldNotStart'));
      setIsStartingMessage(false);
      return;
    }
    const ids = [...selectedRecipients];
    const result = ids.length === 1
      ? await startDirectChat(staff, ids[0])
      : await createGroupChat(staff, `${selectedAcademy.name} · ${t('inbox.customGroup')}`, ids);
    setIsStartingMessage(false);
    if (!result.id) {
      setMessageError(result.error || t('academyChat.couldNotStart'));
      return;
    }
    setShowCompose(false);
    setSelectedRecipients(new Set());
    router.push({ pathname: '/academy-chat', params: { conversationId: result.id, asMemberId: staff } } as any);
  }

  const coachesCount = 0;
  const coachRows: never[] = [];
  const yearOptions = [currentSeasonYear, currentSeasonYear - 1, currentSeasonYear - 2];

  function showNavDestination(area: AcademyArea) {
    if (area === 'overview' || area === 'academies') {
      setSection(area);
      setShowAcademies(false);
      return;
    }
    if (area === 'messages') {
      router.push('/inbox' as any);
      return;
    }
    goToAcademyDetails(area);
  }

  function beginEdit(row: AcademyRow) {
    setEditAcademy(row); setEditName(row.name); setEditDescription(row.description ?? '');
    setEditAgeGroup(row.age_group ?? ''); setEditLogo(row.logo_url); setMakeMain(row.is_main); setMatchError('');
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
    } catch (error) { setMatchError(String(error)); }
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
    if (error) { setMatchError(error.message); return; }
    setEditAcademy(null); await onRefresh(); await loadAcademyContent(editAcademy.id);
  }

  async function copyJoinLink(kind: 'parent' | 'coach') {
    if (kind === 'parent') {
      const main = sortedAcademies.find((row) => row.is_main);
      if (!main) return;
      await Clipboard.setStringAsync(`https://mypitch-owner-app.vercel.app/join/${main.invite_token}`);
    } else {
      await Clipboard.setStringAsync('https://mypitch-owner-app.vercel.app/join/coach-demo');
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(kind === 'parent' ? 'Parent academy link copied.' : 'Demo coach link copied. Coach registration is not enabled yet.');
  }

  async function openMatchDialog() {
    setMatchError(''); setMatchSelected(new Set()); setMatchRosterTab('player'); setShowMatchAcademies(false);
    setMatchOpponent(''); setMatchOpponentId(null); setMatchMapsUrl(''); setShowMatch(true);
    setOpponentOptions(await fetchPublicAcademiesForMatches());
  }

  async function saveMatch() {
    if (!selectedAcademy || matchBusy || matchStartMinutes === null || matchEndMinutes === null) return;
    const mapsLink = matchMapsUrl.trim();
    if (mapsLink && !isGoogleMapsLink(mapsLink)) { setMatchError('Paste a valid Google Maps share link.'); return; }
    const startDay = new Date(`${matchDate}T00:00:00`);
    const starts = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), Math.floor(matchStartMinutes / 60), matchStartMinutes % 60).toISOString();
    const ends = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), Math.floor(matchEndMinutes / 60), matchEndMinutes % 60).toISOString();
    setMatchBusy(true); setMatchError('');
    const result = await createSession({ academyId: selectedAcademy.id, kind: 'match', startsAt: starts,
      endsAt: ends,
      opponent: matchOpponent, opponentAcademyId: matchOpponentId,
      locationName: mapsLink ? mapsLocationLabel(mapsLink) : null,
      mapsUrl: mapsLink || null });
    const sessionId = typeof result.data === 'string' ? result.data : Array.isArray(result.data) ? (result.data[0] as string) : null;
    if (result.error || !sessionId) { setMatchBusy(false); setMatchError(result.error?.message || 'Could not create match.'); return; }
    const invited = await addSessionAttendees(sessionId, [...matchSelected]);
    if (invited.error) setMatchError(invited.error.message);
    setMatchBusy(false); setShowMatch(false); await loadAcademyContent(selectedAcademy.id);
  }

  async function saveMatchResult() {
    if (!resultSession || !selectedAcademy || resultBusy) return;
    const home = Number(homeScoreInput);
    const away = Number(awayScoreInput);
    if (!/^\d{1,2}$/.test(homeScoreInput.trim()) || !/^\d{1,2}$/.test(awayScoreInput.trim())) {
      setResultError(t('academy.dashboardResultValidation'));
      return;
    }
    setResultBusy(true);
    setResultError('');
    const { error } = await updateSessionResult(resultSession.id, home, away);
    setResultBusy(false);
    if (error) { setResultError(error.message || t('academy.dashboardResultSaveError')); return; }
    setResultSession(null);
    await loadAcademyContent(selectedAcademy.id);
  }

  return (
    <Screen maxWidth={WIDE_CONTENT_MAX_WIDTH} contentStyle={styles.screenContent}>
      <View style={[styles.topHeader, width < 1280 && styles.topHeaderCompact]}>
        <Text style={styles.pageTitle}>{t('academy.title')}</Text>
        <View style={styles.headerPickerWrap}>
          <Pressable
            style={({ hovered, pressed }: any) => [styles.headerPicker, width < 1280 && styles.headerPickerCompact, hovered && styles.hovered, pressed && styles.pressed]}
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
                  onPress={() => { setSelectedId(row.id); setShowAcademies(false); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={styles.dropdownTitle} numberOfLines={1}>{row.name}</Text>{row.is_main ? <Ionicons name="trophy" size={13} color={colors.yellow} /> : null}</View>
                  <Text style={styles.dropdownMeta} numberOfLines={1}>{row.city || t('academy.dashboardNoLocation')}</Text>
                </Pressable>
              ))}
              {!sortedAcademies.length ? <Text style={styles.dropdownMeta}>{t('academy.noAcademies')}</Text> : null}
            </View>
          ) : null}
        </View>
        <View style={styles.headerPickerWrap}>
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
        <Pressable
          style={({ hovered, pressed }: any) => [styles.primaryButton, hovered && styles.primaryHovered, pressed && styles.pressed]}
          onPress={createForm.onStartCreate}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={colors.blackText} />
          <Text style={styles.primaryButtonText}>{t('academy.createAction')}</Text>
        </Pressable>
        <View style={styles.headerSpacer} />
        <Pressable style={styles.iconButton} onPress={() => setShowSearch((value) => !value)} accessibilityRole="button" accessibilityLabel={t('academy.dashboardSearch')}>
          <Ionicons name={showSearch ? 'close' : 'search'} size={19} color={colors.greySoft} />
        </Pressable>
      </View>

      {showSearch ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={17} color={colors.greyDark} />
          <TextInput value={search} onChangeText={setSearch} placeholder={t('academy.dashboardSearchPlaceholder')} placeholderTextColor={colors.greyDark} style={styles.searchInput} autoFocus />
          {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={17} color={colors.grey} /></Pressable> : null}
        </View>
      ) : null}

      {createForm.visible ? (
        <View style={styles.createForm}>
          <View style={styles.createFormHeading}>
            <View><Text style={styles.panelTitle}>{t('academy.createTitle')}</Text><Text style={styles.panelHint}>{t('academy.dashboardCreateHint')}</Text></View>
            <Pressable onPress={createForm.onCancel} style={styles.iconButton}><Ionicons name="close" size={18} color={colors.grey} /></Pressable>
          </View>
          <View style={styles.createInputs}>
            <TextInput value={createForm.name} onChangeText={createForm.onNameChange} placeholder={t('academy.namePlaceholder')} placeholderTextColor={colors.greyDark} style={styles.formInput} />
            <TextInput value={createForm.city} onChangeText={createForm.onCityChange} placeholder={t('academy.cityPlaceholder')} placeholderTextColor={colors.greyDark} style={styles.formInput} />
            <Pressable style={[styles.primaryButton, !createForm.name.trim() && styles.disabledButton]} disabled={!createForm.name.trim() || createForm.busy} onPress={createForm.onCreate}>
              {createForm.busy ? <ActivityIndicator size="small" color={colors.blackText} /> : <Ionicons name="add" size={18} color={colors.blackText} />}
              <Text style={styles.primaryButtonText}>{t('academy.createAction')}</Text>
            </Pressable>
            <Pressable onPress={createForm.onCancel} style={styles.outlineButton}><Text style={styles.outlineButtonText}>{t('common.cancel')}</Text></Pressable>
          </View>
          {createForm.error ? <Text style={styles.errorText}>{createForm.error}</Text> : null}
        </View>
      ) : null}

      <View style={styles.sectionNav}>
        {AREAS.map((area) => (
          <Pressable key={area.key} onPress={() => showNavDestination(area.key)} style={({ hovered, pressed }: any) => [styles.sectionTab, section === area.key && styles.sectionTabActive, hovered && styles.sectionTabHovered, pressed && styles.pressed]}>
            <Ionicons name={area.icon} size={17} color={section === area.key ? colors.blueLight : colors.grey} />
            <Text style={[styles.sectionTabLabel, section === area.key && styles.sectionTabLabelActive]}>{t(area.label)}</Text>
          </Pressable>
        ))}
      </View>

      {section === 'academies' ? (
        <AcademiesList
          academies={sortedAcademies}
          counts={counts}
          styles={styles}
          colors={colors}
          t={t}
          onManage={(academyId) => router.push({ pathname: '/academy-details', params: { academyId } } as any)}
        />
      ) : !selectedAcademy && !loading ? (
        <View style={styles.emptyDashboard}>
          <View style={styles.emptyIcon}><Ionicons name="school-outline" size={26} color={colors.blueLight} /></View>
          <Text style={styles.panelTitle}>{t('academy.noAcademies')}</Text>
          <Text style={styles.panelHint}>{t('academy.dashboardCreateHint')}</Text>
          <Pressable style={styles.primaryButton} onPress={createForm.onStartCreate}><Ionicons name="add" size={18} color={colors.blackText} /><Text style={styles.primaryButtonText}>{t('academy.createAction')}</Text></Pressable>
        </View>
      ) : selectedAcademy ? (
          <View style={[styles.dashboardGrid, width < 1180 && styles.dashboardGridNarrow, width >= 1180 && { ...styles.dashboardGridFill, minHeight: Math.max(420, viewportHeight - 180) }]}>
          <View style={[styles.leftColumn, width < 1180 && styles.columnFullWidth, width >= 1180 && styles.leftColumnFill]}>
            <AcademyCard
              academy={selectedAcademy}
              loading={isLoadingAcademy}
              styles={styles}
              colors={colors}
              t={t}
              onEdit={() => beginEdit(selectedAcademy)}
              onUploadCover={chooseCoverImage}
              style={width >= 1180 ? styles.academyPanelGrow : undefined}
            />
            <RosterPanel
              players={visiblePlayerCount}
              parents={visibleParentCount}
              coaches={coachesCount}
              teams={null}
              styles={styles}
              colors={colors}
              t={t}
              onViewAll={() => goToAcademyDetails('players')}
              onOpen={(area) => goToAcademyDetails(area)}
              style={width >= 1180 ? styles.rosterPanelGrow : undefined}
            />
            <LinksPanel
              styles={styles}
              colors={colors}
              t={t}
              onParent={() => copyJoinLink('parent')}
              onCoach={() => copyJoinLink('coach')}
            />
          </View>

          <View style={[styles.middleColumn, width < 1180 && styles.columnFullWidth]}>
            <MatchesPanel
              title={t('academy.dashboardNextMatches')}
              sessions={upcoming}
              academyName={selectedAcademy.name}
              academyLogoUrl={selectedAcademy.logo_url}
              emptyText={normalizedSearch ? t('academy.dashboardNoSearchMatches') : t('academy.noMatches')}
              showStatus
              styles={styles}
              colors={colors}
              t={t}
              loading={isLoadingAcademy}
              onCreate={openMatchDialog}
              onViewAll={() => goToAcademyDetails('matches')}
              onSession={() => goToAcademyDetails('matches')}
            />
            <MatchesPanel
              title={t('academy.dashboardPastResults')}
              sessions={played}
              academyName={selectedAcademy.name}
              academyLogoUrl={selectedAcademy.logo_url}
              emptyText={normalizedSearch ? t('academy.dashboardNoSearchMatches') : t('academy.dashboardNoPastMatches')}
              showStatus={false}
              styles={styles}
              colors={colors}
              t={t}
              loading={isLoadingAcademy}
              onViewAll={() => goToAcademyDetails('matches')}
              onSession={() => goToAcademyDetails('matches')}
              onEnterResult={(session) => { setResultSession(session); setHomeScoreInput(session.home_score == null ? '' : String(session.home_score)); setAwayScoreInput(session.away_score == null ? '' : String(session.away_score)); setResultError(''); }}
            />
          </View>

          <View style={[styles.rightColumn, width < 1180 && styles.columnFullWidth]}>
            <CommunicationsPanel
              parents={visibleParentCount}
              coaches={coachesCount}
              activity={recentActivity}
              notices={latestNotices}
              conversations={conversations}
              styles={styles}
              colors={colors}
              t={t}
              loading={isLoadingAcademy}
              onCompose={() => openCompose()}
              onChooseAudience={openCompose}
              selectedAudience={composeAudience}
              onViewAll={() => router.push('/inbox' as any)}
              onOpenConversation={goToConversation}
              onOpenNotices={(notice) => { markNoticeRead(notice.id); router.push('/inbox' as any); }}
            />
            <CoachesOnDutyPanel coaches={coachRows} styles={styles} colors={colors} t={t} onViewAll={() => goToAcademyDetails('coaches')} />
          </View>
        </View>
      ) : loading ? <ActivityIndicator style={styles.loading} color={colors.blueLight} /> : null}

      {showCompose && selectedAcademy ? (
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCompose(false)} accessibilityLabel={t('common.cancel')} />
          <View style={styles.composeModal}>
            <View style={styles.composeHeader}>
              <View><Text style={styles.panelTitle}>{t('academy.dashboardNewMessage')}</Text><Text style={styles.panelHint}>{selectedAcademy.name}</Text></View>
              <Pressable onPress={() => setShowCompose(false)} style={styles.iconButton}><Ionicons name="close" size={18} color={colors.grey} /></Pressable>
            </View>
            <Text style={styles.formLabel}>{composeAudience === 'parents' ? t('academy.tabParents') : t('academy.rosterCoaches')} · {t('academy.dashboardRecipients')}</Text>
            {composeAudience === 'coaches' ? <View style={styles.coachEmpty}><Text style={styles.emptyMessage}>{t('academy.dashboardNoCoachesToMessage')}</Text></View> : approvedParents.length ? approvedParents.slice(0, 6).map((row) => {
              const person = row.member!;
              const checked = selectedRecipients.has(person.id);
              return (
                <Pressable key={person.id} onPress={() => toggleRecipient(person.id)} style={[styles.recipientRow, checked && styles.recipientRowActive]}>
                  <View style={[styles.checkbox, checked && styles.checkboxActive]}>{checked ? <Ionicons name="checkmark" size={12} color={colors.blackText} /> : null}</View>
                  <Text style={styles.recipientName} numberOfLines={1}>{person.full_name}</Text>
                  <Text style={styles.recipientKind}>{t('academy.tabParents')}</Text>
                </Pressable>
              );
            }) : <View style={styles.coachEmpty}><Text style={styles.emptyMessage}>{t('academy.dashboardNoParentsToMessage')}</Text></View>}
            {messageError ? <Text style={styles.errorText}>{messageError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowCompose(false)} style={styles.outlineButton}><Text style={styles.outlineButtonText}>{t('common.cancel')}</Text></Pressable>
              <Pressable disabled={!selectedRecipients.size || isStartingMessage} onPress={startMessage} style={[styles.primaryButton, (!selectedRecipients.size || isStartingMessage) && styles.disabledButton]}>
                {isStartingMessage ? <ActivityIndicator size="small" color={colors.blackText} /> : <Ionicons name="arrow-forward" size={16} color={colors.blackText} />}
                <Text style={styles.primaryButtonText}>{t('academy.dashboardContinueToMessage')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <Modal transparent visible={!!editAcademy} animationType="fade" onRequestClose={() => setEditAcademy(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditAcademy(null)} />
          <View style={[styles.composeModal, styles.editAcademyModal]}>
            <View style={[styles.composeHeader, styles.editAcademyHeader]}><View><Text style={styles.editModalTitle}>{t('academy.dashboardEdit')}</Text><Text style={styles.editModalSubtitle}>{editAcademy?.name}</Text></View><Pressable onPress={() => setEditAcademy(null)} style={styles.editCloseButton}><Ionicons name="close" size={17} color={colors.grey} /></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.editAcademyScroll} contentContainerStyle={styles.editAcademyContent}>
              <View style={styles.editProfileRow}>
                <View style={styles.editLogoColumn}>
                  <Text style={styles.editLabel}>Academy logo</Text>
                  <AvatarPickerTrigger onPicked={chooseLogoImage} onError={(error) => setMatchError(String(error))} style={styles.editLogoPicker}>
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
              {matchError ? <Text style={styles.errorText}>{matchError}</Text> : null}
              <View style={[styles.modalActions, styles.editModalActions]}><Pressable onPress={() => setEditAcademy(null)} style={[styles.outlineButton, styles.editActionButton]}><Text style={styles.outlineButtonText}>{t('common.cancel')}</Text></Pressable><Pressable disabled={!editName.trim() || editBusy} onPress={saveAcademy} style={[styles.primaryButton, styles.editActionButton, (!editName.trim() || editBusy) && styles.disabledButton]}>{editBusy ? <ActivityIndicator size="small" color={colors.blackText} /> : null}<Text style={[styles.primaryButtonText, styles.editSaveText]}>Save changes</Text></Pressable></View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showMatch} animationType="fade" onRequestClose={() => setShowMatch(false)}>
        <View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMatch(false)} />
          <View style={[styles.composeModal, styles.matchModal, width >= 1200 && styles.matchModalScaleDown]}>
            <View style={[styles.composeHeader, styles.matchDialogHeader]}><View><Text style={styles.matchDialogTitle}>{t('academy.dashboardCreateMatch')}</Text><Text style={styles.matchDialogSubtitle}>Schedule a match and invite your squad</Text></View><Pressable onPress={() => setShowMatch(false)} style={styles.matchDialogClose}><Ionicons name="close" size={26} color={colors.grey} /></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.matchFormScroll} contentContainerStyle={styles.matchFormContent}>
              <View style={[styles.matchLayout, width < 1000 && styles.matchLayoutStacked]}>
                <View style={[styles.matchLeftColumn, width < 1000 && styles.matchColumnStacked]}>
                  <View style={styles.matchDateField}>
                    <Text style={styles.matchFormLabel}>Match date</Text>
                    <View style={styles.matchDateControl}>
                      <Ionicons name="calendar-outline" size={18} color={colors.blueLight} />
                      <Text style={styles.matchNativeValue}>{new Date(matchDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.grey} />
                      <MatchDateInput
                        type="date"
                        value={matchDate}
                        min={localDateIso(new Date())}
                        onChange={(event: any) => {
                          const date = event.target.value;
                          if (!date) return;
                          setMatchDate(date);
                          const day = new Date(date + 'T00:00:00');
                          const available = Array.from({ length: 48 }, (_, index) => index * 30).filter((minutes) =>
                            new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60).getTime() >= Date.now()
                          );
                          const startTime = available.includes(17 * 60) ? 17 * 60 : available[0] ?? null;
                          setMatchStartMinutes(startTime);
                          setMatchEndMinutes(startTime !== null && startTime + 90 <= 1440 ? startTime + 90 : null);
                        }}
                        style={styles.matchNativePickerOverlay}
                      />
                    </View>
                  </View>
                  <View style={styles.matchTimeRow}>
                    <View style={styles.matchTimeField}>
                      <Text style={styles.matchFormLabel}>Kick-off</Text>
                      <View style={styles.matchNativeField}>
                        <Ionicons name="time-outline" size={20} color={colors.blueLight} style={styles.matchNativeIcon} />
                        <MatchTimeSelect
                          value={matchStartMinutes === null ? '' : String(matchStartMinutes)}
                          onChange={(event: any) => {
                            const minutes = Number(event.target.value);
                            setMatchStartMinutes(Number.isFinite(minutes) ? minutes : null);
                            setMatchEndMinutes(null);
                          }}
                          style={styles.matchNativeInputWithIcon}
                        >
                          <MatchTimeOption value="">Select time</MatchTimeOption>
                          {matchStartOptions.map((minutes) => <MatchTimeOption key={minutes} value={String(minutes)}>{String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')}</MatchTimeOption>)}
                        </MatchTimeSelect>
                      </View>
                    </View>
                    <View style={styles.matchTimeField}>
                      <Text style={styles.matchFormLabel}>End time</Text>
                      <View style={styles.matchNativeField}>
                        <Ionicons name="time-outline" size={20} color={colors.blueLight} style={styles.matchNativeIcon} />
                        <MatchTimeSelect
                          value={matchEndMinutes === null ? '' : String(matchEndMinutes)}
                          onChange={(event: any) => setMatchEndMinutes(event.target.value ? Number(event.target.value) : null)}
                          style={styles.matchNativeInputWithIcon}
                        >
                          <MatchTimeOption value="">Select time</MatchTimeOption>
                          {matchEndOptions.map((minutes) => <MatchTimeOption key={minutes} value={String(minutes)}>{String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')}</MatchTimeOption>)}
                        </MatchTimeSelect>
                      </View>
                    </View>
                  </View>
                  <View style={styles.matchFieldColumn}>
                    <Text style={styles.matchFormLabel}>Your academy</Text>
                    <Pressable onPress={() => setShowMatchAcademies((v) => !v)} style={[styles.matchSelectButton, showMatchAcademies && styles.matchSelectButtonOpen]}>
                      {selectedAcademy?.logo_url ? <Image source={{ uri: selectedAcademy.logo_url }} style={styles.matchAcademyLogo} resizeMode="contain" /> : <View style={styles.matchAcademyLogoFallback}><Ionicons name="shield-outline" size={20} color={colors.blueLight} /></View>}
                      <View style={styles.matchSelectText}><Text style={styles.matchSelectTitle}>{selectedAcademy?.name || 'Choose an academy'}</Text><Text style={styles.matchSelectHint}>{selectedAcademy?.city || 'Select the team playing this match'}</Text></View>
                      <Ionicons name={showMatchAcademies ? 'chevron-up' : 'chevron-down'} size={17} color={colors.grey} />
                    </Pressable>
                    {showMatchAcademies ? <View style={styles.matchAcademyDropdown}>{sortedAcademies.map((a) => <Pressable key={a.id} onPress={async () => { setSelectedId(a.id); setMatchSelected(new Set()); setEnrolments(await fetchEnrolments(a.id)); setShowMatchAcademies(false); }} style={[styles.matchAcademyOption, a.id === selectedAcademy?.id && styles.matchAcademyOptionActive]}>{a.logo_url ? <Image source={{ uri: a.logo_url }} style={styles.matchAcademyLogo} resizeMode="contain" /> : <View style={styles.matchAcademyLogoFallback}><Ionicons name="shield-outline" size={20} color={colors.blueLight} /></View>}<View style={styles.matchSelectText}><Text style={styles.matchSelectTitle}>{a.name}</Text><Text style={styles.matchSelectHint}>{a.city || 'Location not added'}</Text></View>{a.id === selectedAcademy?.id ? <Ionicons name="checkmark-circle" size={18} color={colors.blueLight} /> : null}</Pressable>)}</View> : null}
                  </View>
                  <View style={styles.matchFieldColumn}>
                    <Text style={styles.matchFormLabel}>Opponent academy or name</Text>
                    <View style={styles.matchInputIcon}><Ionicons name="search" size={17} color={colors.grey} /><TextInput value={matchOpponent} onChangeText={(value) => { setMatchOpponent(value); setMatchOpponentId(null); }} style={styles.matchInputText} placeholder="Search or enter opponent name" placeholderTextColor={colors.greyDark} /></View>
                    {matchOpponent.trim() && !matchOpponentId ? (() => { const matches = opponentOptions.filter((a) => a.id !== selectedAcademy?.id && `${a.name} ${a.city ?? ''}`.toLowerCase().includes(matchOpponent.toLowerCase())).slice(0, 5); return matches.length ? <View style={styles.matchAcademyDropdown}>{matches.map((a) => <Pressable key={a.id} onPress={() => { setMatchOpponent(a.name); setMatchOpponentId(a.id); }} style={styles.matchAcademyOption}>{a.logo_url ? <Image source={{ uri: a.logo_url }} style={styles.matchAcademyLogo} resizeMode="contain" /> : <View style={styles.matchAcademyLogoFallback}><Ionicons name="shield-outline" size={20} color={colors.blueLight} /></View>}<View style={styles.matchSelectText}><Text style={styles.matchSelectTitle}>{a.name}</Text><Text style={styles.matchSelectHint}>{a.city || 'MYPitch academy'}</Text></View><Ionicons name="add-circle-outline" size={18} color={colors.blueLight} /></Pressable>)}</View> : <Text style={styles.matchFieldHint}>No academy found. The name will be saved as entered.</Text>; })() : !matchOpponent.trim() ? <Text style={styles.matchFieldHint}>Choose a MYPitch academy from the suggestions, or enter any opponent.</Text> : null}
                  </View>
                </View>
                <View style={[styles.matchColumnDivider, width < 1000 && styles.matchColumnDividerStacked]} />
                <View style={[styles.matchRightColumn, width < 1000 && styles.matchColumnStacked]}>
                  <View style={styles.matchupPreview}>
                    <View style={styles.matchupTeam}>{selectedAcademy?.logo_url ? <Image source={{ uri: selectedAcademy.logo_url }} style={styles.matchTeamCrest} resizeMode="contain" /> : <View style={styles.matchTeamCrestFallback}><Ionicons name="shield-outline" size={30} color={colors.blueLight} /></View>}<Text style={styles.matchupTeamName} numberOfLines={2}>{selectedAcademy?.name || 'Your academy'}</Text><Text style={styles.matchupTeamSubtitle} numberOfLines={1}>{selectedAcademy?.age_group ? selectedAcademy.age_group + ' Academy' : 'Academy'}</Text></View>
                    <Text style={styles.matchupVs}>VS</Text>
                    <View style={styles.matchupTeam}>{opponentOptions.find((academy) => academy.id === matchOpponentId)?.logo_url ? <Image source={{ uri: opponentOptions.find((academy) => academy.id === matchOpponentId)?.logo_url! }} style={styles.matchTeamCrest} resizeMode="contain" /> : <View style={styles.matchTeamCrestFallback}><Ionicons name="shield-outline" size={30} color={colors.blueLight} /></View>}<Text style={styles.matchupTeamName} numberOfLines={2}>{matchOpponent.trim() || 'Opponent'}</Text><Text style={styles.matchupTeamSubtitle} numberOfLines={1}>{opponentOptions.find((academy) => academy.id === matchOpponentId)?.age_group ? opponentOptions.find((academy) => academy.id === matchOpponentId)?.age_group + ' Academy' : matchOpponentId ? 'Academy' : ''}</Text></View>
                  </View>
                  {selectedAcademy ? (() => {
                    const players = enrolments.filter((r) => r.status === 'approved' && r.member?.member_kind === 'player');
                    const coaches = enrolments.filter((r) => r.status === 'approved' && r.member?.member_kind === 'staff');
                    const roster = matchRosterTab === 'player' ? players : coaches;
                    const allSelected = roster.length > 0 && roster.every((r) => matchSelected.has(r.member_id));
                    return (
                      <View style={styles.matchRosterSection}>
                        <View style={styles.matchRosterTabs}>
                          <Pressable accessibilityRole="tab" accessibilityState={{ selected: matchRosterTab === 'player' }} onPress={() => setMatchRosterTab('player')} style={styles.matchRosterTabButton}>
                            <Text style={[styles.matchRosterTabText, matchRosterTab === 'player' && styles.matchRosterTabTextActive]}>Players ({players.length})</Text>
                            {matchRosterTab === 'player' ? <View style={styles.matchRosterTabIndicator} /> : null}
                          </Pressable>
                          <Pressable accessibilityRole="tab" accessibilityState={{ selected: matchRosterTab === 'staff' }} onPress={() => setMatchRosterTab('staff')} style={styles.matchRosterTabButton}>
                            <Text style={[styles.matchRosterTabText, matchRosterTab === 'staff' && styles.matchRosterTabTextActive]}>Coaches ({coaches.length})</Text>
                            {matchRosterTab === 'staff' ? <View style={styles.matchRosterTabIndicator} /> : null}
                          </Pressable>
                          <Pressable accessibilityRole="button" onPress={() => setMatchSelected((selected) => {
                            const next = new Set(selected);
                            roster.forEach((row) => allSelected ? next.delete(row.member_id) : next.add(row.member_id));
                            return next;
                          })} style={styles.matchRosterSelectAll}>
                            <Text style={styles.matchRosterSelectAllText}>{allSelected ? 'Clear all' : 'Select all'}</Text>
                          </Pressable>
                        </View>
                        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.matchRosterList}>
                          {roster.map((row) => {
                            const checked = matchSelected.has(row.member_id);
                            return (
                              <Pressable key={row.member_id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setMatchSelected((selected) => {
                                const next = new Set(selected);
                                if (next.has(row.member_id)) next.delete(row.member_id); else next.add(row.member_id);
                                return next;
                              })} style={styles.matchParticipantRow}>
                                <View style={[styles.checkbox, checked && styles.checkboxActive]}>{checked ? <Ionicons name="checkmark" size={12} color={colors.blackText} /> : null}</View>
                                <View style={styles.matchParticipantAvatar}>{row.member?.avatar_url ? <Image source={{ uri: row.member.avatar_url }} style={styles.matchParticipantImage} /> : <Text style={styles.matchParticipantInitial}>{(row.member?.full_name || '?').slice(0, 1).toUpperCase()}</Text>}</View>
                                <Text style={styles.recipientName} numberOfLines={1}>{row.member?.full_name || 'Academy member'}</Text>
                              </Pressable>
                            );
                          })}
                          {!roster.length ? <Text style={styles.matchRosterEmpty}>{matchRosterTab === 'player' ? 'No registered players yet.' : 'No coaches are registered yet.'}</Text> : null}
                        </ScrollView>
                      </View>
                    );
                  })() : <Text style={styles.panelHint}>Choose an academy to select players and coaches.</Text>}
                  <View style={styles.matchFieldColumn}><Text style={styles.matchFormLabel}>Match place</Text><View style={styles.matchInputIcon}><Ionicons name="location-outline" size={17} color={colors.grey} /><TextInput value={matchMapsUrl} onChangeText={setMatchMapsUrl} style={styles.matchInputText} placeholder="Paste a Google Maps share link" placeholderTextColor={colors.greyDark} autoCapitalize="none" autoCorrect={false} keyboardType="url" /></View></View>
                </View>
              </View>
              {matchError ? <Text style={styles.errorText}>{matchError}</Text> : null}
            </ScrollView>
            <View style={styles.modalActions}><Pressable onPress={() => setShowMatch(false)} style={styles.outlineButton}><Text style={styles.outlineButtonText}>{t('common.cancel')}</Text></Pressable><Pressable disabled={!matchOpponent.trim() || !matchDate || matchStartMinutes === null || matchEndMinutes === null || matchBusy} onPress={saveMatch} style={[styles.primaryButton, (!matchOpponent.trim() || !matchDate || matchStartMinutes === null || matchEndMinutes === null || matchBusy) && styles.disabledButton]}>{matchBusy ? <ActivityIndicator size="small" color={colors.blackText} /> : <Ionicons name="calendar" size={16} color={colors.blackText} />}<Text style={styles.primaryButtonText}>Create match</Text></Pressable></View>
          </View>
        </View>
      </Modal>
   </Screen>
  );
}

function AcademyCard({ academy, loading, styles, colors, t, onEdit, onUploadCover, style }: {
  academy: AcademyRow;
  loading: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  t: (key: string, params?: Record<string, string | number>) => string;
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
          <Pressable style={({ hovered, pressed }: any) => [styles.outlineButton, styles.editAcademyButton, hovered && styles.hovered, pressed && styles.pressed]} onPress={onEdit}>
            <Ionicons name="create-outline" size={14} color={colors.greySoft} /><Text style={styles.outlineButtonText}>{t('academy.dashboardEdit')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function AcademiesList({ academies, counts, styles, colors, t, onManage }: {
  academies: AcademyRow[];
  counts: Record<string, AcademyCounts>;
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  t: (key: string, params?: Record<string, string | number>) => string;
  onManage: (academyId: string) => void;
}) {
  return (
    <Panel styles={styles} colors={colors} style={styles.academiesPanel}>
      <View style={styles.academiesIntro}>
        <View>
          <Text style={styles.panelTitle}>{t('academy.dashboardAcademies')}</Text>
          <Text style={styles.panelHint}>{t('academy.dashboardManageAcademiesHint')}</Text>
        </View>
        <Text style={styles.academiesCount}>{academies.length}</Text>
      </View>
      {academies.length ? academies.map((academy) => {
        const academyCounts = counts[academy.id];
        return (
          <Pressable key={academy.id} onPress={() => onManage(academy.id)} style={({ hovered, pressed }: any) => [styles.academyDirectoryRow, hovered && styles.matchRowHovered, pressed && styles.pressed]}>
            {academy.logo_url ? <Image source={{ uri: academy.logo_url }} style={styles.academyDirectoryLogo} resizeMode="contain" /> : (
              <View style={[styles.academyDirectoryLogo, styles.academyDirectoryLogoFallback]}><Ionicons name="school-outline" size={21} color={colors.blueLight} /></View>
            )}
            <View style={styles.academyDirectoryInfo}>
              <View style={styles.academyNameLine}>
                <Text style={styles.academyName} numberOfLines={1}>{academy.name}</Text>
                {academy.is_main ? <Ionicons name="trophy" size={15} color={colors.yellow} /> : null}
                {!academy.is_active ? <Text style={styles.pausedBadge}>{t('academy.dashboardPaused')}</Text> : null}
              </View>
              <Text style={styles.academyDirectoryCity} numberOfLines={1}>{academy.city || t('academy.dashboardNoLocation')}</Text>
              <Text style={styles.academyDirectoryCounts} numberOfLines={1}>
                {t('academy.playersCount', { count: academyCounts?.players ?? 0 })} · {t('academy.parentsCount', { count: academyCounts?.parents ?? 0 })}{academyCounts?.pending ? ` · ${t('academy.pendingCount', { count: academyCounts.pending })}` : ''}
              </Text>
            </View>
            <View style={styles.academyDirectoryAction}>
              <Text style={styles.textAction}>{t('academy.dashboardEdit')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.blueLight} />
            </View>
          </Pressable>
        );
      }) : (
        <View style={styles.academiesEmpty}>
          <Ionicons name="school-outline" size={24} color={colors.blueLight} />
          <Text style={styles.emptyMessage}>{t('academy.noAcademies')}</Text>
        </View>
      )}
    </Panel>
  );
}

function RosterPanel({ players, parents, coaches, teams, styles, colors, t, onViewAll, onOpen, style }: {
  players: number; parents: number; coaches: number; teams: number | null;
  styles: ReturnType<typeof makeStyles>; colors: AppColors;
  t: (key: string) => string; onViewAll: () => void; onOpen: (area: AcademyArea) => void; style?: any;
}) {
  const items = [
    { icon: 'people-outline' as const, label: t('academy.tabPlayers'), value: String(players), area: 'players' as const },
    { icon: 'people-circle-outline' as const, label: t('academy.tabParents'), value: String(parents), area: 'parents' as const },
    { icon: 'person-outline' as const, label: t('academy.rosterCoaches'), value: String(coaches), area: 'coaches' as const },
    { icon: 'shield-outline' as const, label: t('academy.dashboardTeams'), value: teams == null ? '—' : String(teams), area: 'matches' as const },
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

function LinksPanel({ styles, colors, t, onParent, onCoach }: {
  styles: ReturnType<typeof makeStyles>; colors: AppColors;
  t: (key: string) => string; onParent: () => void; onCoach: () => void;
}) {
  const links = [
    { title: t('academy.dashboardRegisterParent'), hint: t('academy.dashboardRegisterParentHint'), icon: 'person-add-outline' as const, onPress: onParent },
    { title: t('academy.dashboardRegisterCoach'), hint: t('academy.dashboardRegisterCoachHint'), icon: 'person-add-outline' as const, onPress: onCoach },
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
    </Panel>
  );
}

function MatchesPanel({ title, sessions, academyName, academyLogoUrl, emptyText, showStatus, styles, colors, t, loading, onCreate, onViewAll, onSession, onEnterResult }: {
  title: string; sessions: SessionRow[]; academyName: string; academyLogoUrl: string | null; emptyText: string; showStatus: boolean;
  styles: ReturnType<typeof makeStyles>; colors: AppColors; t: (key: string) => string; loading: boolean;
  onCreate?: () => void; onViewAll: () => void; onSession: (session: SessionRow) => void; onEnterResult?: (session: SessionRow) => void;
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
      ) : sessions.map((session) => {
        const parts = matchDateParts(session.starts_at);
        return (
          <View key={session.id} style={styles.matchRow}>
            <Pressable onPress={() => onSession(session)} style={({ hovered, pressed }: any) => [styles.matchRowMain, hovered && styles.matchRowHovered, pressed && styles.pressed]}>
            <View style={styles.matchDateBlock}><Text style={styles.matchDay}>{parts.day}</Text><Text style={styles.matchDate}>{parts.date}</Text><Text style={styles.matchTime}>{parts.time}</Text></View>
            <View style={styles.matchDivider} />
            <View style={styles.matchMain}>
              <View style={styles.matchTeams}>
                <View style={[styles.teamNameWrap, styles.homeTeamWrap]}>{academyLogoUrl ? <Image source={{ uri: academyLogoUrl }} style={styles.teamCrestImage} resizeMode="contain" /> : <View style={styles.teamCrest}><Ionicons name="shield-outline" size={15} color={colors.blueLight} /></View>}<Text style={styles.teamName} numberOfLines={1}>{session.title || academyName}</Text></View>
                {showStatus ? <Text style={styles.versus}>{t('academy.dashboardVs')}</Text> : session.home_score != null && session.away_score != null ? <Text style={styles.matchScore}>{session.home_score} : {session.away_score}</Text> : onEnterResult ? <Pressable onPress={(event) => { event.stopPropagation(); onEnterResult(session); }} style={styles.enterResultButton}><Text style={styles.enterResultText}>{t('academy.dashboardEnterResult')}</Text></Pressable> : <Text style={styles.versus}>—</Text>}
                <View style={[styles.teamNameWrap, styles.awayTeamWrap]}><View style={[styles.teamCrest, styles.opponentCrest]}><Ionicons name="shield-outline" size={15} color={colors.orange} /></View><Text style={styles.teamName} numberOfLines={1}>{session.opponent || t('academy.dashboardOpponentToConfirm')}</Text></View>
              </View>
            </View>
            {showStatus ? <View style={styles.matchStatus}><Text style={styles.matchStatusText}>{session.pitch_id ? t('academy.dashboardHome') : t('academy.dashboardScheduled')}</Text></View> : <View style={styles.completedBadge}><Ionicons name="checkmark-circle" size={13} color={colors.green} /><Text style={styles.completedText}>{t('academy.dashboardCompleted')}</Text></View>}
            <Ionicons name="chevron-forward" size={17} color={colors.grey} />
            </Pressable>
          </View>
        );
      })}
    </Panel>
  );
}

type ActivityItem = {
  id: string; title: string; body: string; meta: string; time: string;
  icon: keyof typeof Ionicons.glyphMap; unread: boolean;
};

function CommunicationsPanel({ parents, coaches, activity, notices, conversations, styles, colors, t, loading, onCompose, onChooseAudience, selectedAudience, onViewAll, onOpenConversation, onOpenNotices }: {
  parents: number; coaches: number; activity: ActivityItem[]; notices: AcademyNotice[]; conversations: Conversation[];
  styles: ReturnType<typeof makeStyles>; colors: AppColors; t: (key: string) => string; loading: boolean;
  onCompose: () => void; onChooseAudience: (audience: 'parents' | 'coaches') => void;
  selectedAudience: 'parents' | 'coaches'; onViewAll: () => void; onOpenConversation: (row: Conversation) => void; onOpenNotices: (row: AcademyNotice) => void;
}) {
  function openActivity(item: ActivityItem) {
    if (item.id.startsWith('conversation:')) {
      const thread = conversations.find((row) => row.id === item.id.slice('conversation:'.length));
      if (thread) onOpenConversation(thread);
    } else {
      const notice = notices.find((row) => row.id === item.id.slice('notice:'.length));
      if (notice) onOpenNotices(notice);
    }
  }
  return (
    <Panel styles={styles} colors={colors} style={styles.communicationPanel}>
      <View style={styles.panelHeading}>
        <Text style={styles.panelTitle}>{t('academy.dashboardCommunications')}</Text>
        <Pressable onPress={onCompose} style={styles.smallPrimaryButton}><Ionicons name="add" size={16} color={colors.blackText} /><Text style={styles.smallPrimaryText}>{t('academy.dashboardNewMessage')}</Text></Pressable>
      </View>
      <View style={styles.audienceArea}>
        <Text style={styles.formLabel}>{t('academy.dashboardSendTo')}</Text>
        <View style={styles.audienceRow}>
          <Pressable onPress={() => onChooseAudience('parents')} style={[styles.audienceChip, selectedAudience === 'parents' && styles.audienceChipSelected]} accessibilityRole="button">
            <Ionicons name="people-outline" size={22} color={colors.blueLight} />
            <View><Text style={styles.audienceTitle}>{t('academy.tabParents')}</Text><Text style={styles.audienceCount}>{parents} {t('academy.dashboardRecipients')}</Text></View>
          </Pressable>
          <Pressable onPress={() => onChooseAudience('coaches')} style={[styles.audienceChip, selectedAudience === 'coaches' && styles.audienceChipSelected]} accessibilityRole="button">
            <Ionicons name="person-outline" size={22} color={colors.grey} />
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
        <Pressable key={item.id} onPress={() => openActivity(item)} style={({ hovered, pressed }: any) => [styles.activityRow, hovered && styles.linkActionHovered, pressed && styles.pressed]}>
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
  coaches: never[]; styles: ReturnType<typeof makeStyles>; colors: AppColors; t: (key: string) => string; onViewAll: () => void;
}) {
  return (
    <Panel styles={styles} colors={colors} style={styles.coachesPanel}>
      <PanelHeading styles={styles} title={t('academy.dashboardCoachesOnDuty')} action={t('academy.dashboardViewAll')} onAction={onViewAll} />
      <Text style={styles.dutyRange}>{t('academy.dashboardUpcomingWeek')}</Text>
      {coaches.length ? null : <View style={styles.coachEmpty}><View style={styles.emptyIconSmall}><Ionicons name="person-outline" size={17} color={colors.blueLight} /></View><Text style={styles.emptyMessage}>{t('academy.dashboardNoCoachesOnDuty')}</Text></View>}
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
    screenContent: { paddingHorizontal: 25.2, paddingTop: 0, paddingBottom: 28.8, maxWidth: 2160, alignSelf: 'stretch' },
    topHeader: { minHeight: 84, position: 'relative', zIndex: 40, overflow: 'visible', flexDirection: 'row', alignItems: 'center', gap: 16.8, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 0 },
    topHeaderCompact: { minHeight: 0, flexWrap: 'wrap', justifyContent: 'flex-start', paddingVertical: 12, gap: 9.6 },
    pageTitle: { color: colors.white, fontSize: 32.4, lineHeight: 39.6, fontWeight: '700', marginRight: 9.6 },
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
    formInput: { flex: 1, minWidth: 0, height: 55.2, color: colors.white, fontSize: 16.8, fontWeight: '500', borderRadius: 9.6, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, paddingHorizontal: 15.6, outlineStyle: 'none' as any },
    formLabel: { color: colors.greySoft, fontSize: 14.4, fontWeight: '600', marginBottom: 8.4 },
    matchFormLabel: { color: colors.white, fontSize: 15.6, lineHeight: 20, fontWeight: '600', marginBottom: 8.4 },
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
    sectionTab: { minWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9.6, paddingHorizontal: 14.4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    sectionTabActive: { borderBottomColor: colors.blueLight },
    sectionTabHovered: { backgroundColor: colors.surfaceMuted },
    sectionTabLabel: { color: colors.grey, fontSize: 14.4, fontWeight: '500' },
    sectionTabLabelActive: { color: colors.white, fontWeight: '600' },
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
    academiesPanel: { marginTop: 2.4 },
    academiesIntro: { minHeight: 79.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20.4, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    academiesCount: { minWidth: 36, height: 36, textAlign: 'center', textAlignVertical: 'center', color: colors.blueLight, fontSize: 14.4, fontWeight: '700', borderRadius: 18, overflow: 'hidden', backgroundColor: colors.blueSoft, paddingTop: 8.4 },
    academyDirectoryRow: { minHeight: 103.2, flexDirection: 'row', alignItems: 'center', gap: 16.8, paddingHorizontal: 20.4, paddingVertical: 14.4, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    academyDirectoryLogo: { width: 57.6, height: 57.6, backgroundColor: 'transparent' },
    academyDirectoryLogoFallback: { alignItems: 'center', justifyContent: 'center' },
    academyDirectoryInfo: { flex: 1, minWidth: 0, gap: 3.6 },
    academyDirectoryCity: { color: colors.greySoft, fontSize: 13.2 },
    academyDirectoryCounts: { color: colors.grey, fontSize: 12 },
    academyMainBadge: { color: colors.blueLight, fontSize: 10.8, fontWeight: '700', paddingHorizontal: 7.2, paddingVertical: 2.4, borderRadius: 9.6, overflow: 'hidden', backgroundColor: colors.blueSoft },
    academyDirectoryAction: { flexDirection: 'row', alignItems: 'center', gap: 4.8, paddingLeft: 9.6 },
    academiesEmpty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
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
    academyFooter: { minHeight: 40.8, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10.8, marginTop: 3.6 },
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
    rosterMetric: { width: '48%', minHeight: 51.6, flexDirection: 'row', alignItems: 'center', gap: 9.6, paddingHorizontal: 10.8, borderRadius: 8.4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSoft },
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
    matchDialogHeader: { paddingBottom: 20, marginBottom: 18 },
    matchDialogTitle: { color: colors.white, fontSize: 36, lineHeight: 43, fontWeight: '700' },
    matchDialogSubtitle: { color: colors.grey, fontSize: 18, lineHeight: 24, marginTop: 4 },
    matchDialogClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    recipientRow: { minHeight: 46.8, flexDirection: 'row', alignItems: 'center', gap: 10.8, paddingHorizontal: 9.6, borderRadius: 7.2 },
    recipientRowActive: { backgroundColor: colors.blueSoft },
    selectedChoice: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
    matchRosterBlock: { borderWidth: 1, borderColor: colors.border, borderRadius: 8.4, padding: 10.8, marginBottom: 14.4, maxHeight: 180, overflow: 'scroll' as any },
    matchModal: { width: 'min(1120px, 92%)' as any, maxWidth: 1344, maxHeight: '92%', padding: 26.4 },
    matchModalScaleDown: { transform: [{ scale: 0.8625 }] },
    resultModal: { width: 'min(440px, 92%)' as any, maxWidth: 528 },
    scoreInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14.4 },
    scoreInputColumn: { flex: 1, minWidth: 0, gap: 8.4 },
    scoreInput: { height: 57.6, borderRadius: 9.6, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, color: colors.white, textAlign: 'center', fontSize: 26.4, fontWeight: '700', outlineStyle: 'none' as any },
    scoreSeparator: { color: colors.grey, fontSize: 24, fontWeight: '600', paddingBottom: 13.2 },
    matchFormScroll: { flexShrink: 1 },
    matchFormContent: { paddingBottom: 9.6 },
    matchLayout: { flexDirection: 'row', alignItems: 'stretch', minHeight: 610 },
    matchLayoutStacked: { flexDirection: 'column', minHeight: 0 },
    matchLeftColumn: { width: '44%' as any, paddingRight: 26.4, gap: 28.8 },
    matchRightColumn: { flex: 1, minWidth: 0, paddingLeft: 26.4, gap: 16.8 },
    matchColumnStacked: { width: '100%' as any, paddingHorizontal: 0, paddingVertical: 14.4 },
    matchColumnDivider: { width: 1.2, backgroundColor: colors.borderSoft },
    matchColumnDividerStacked: { width: '100%' as any, height: 1.2 },
    matchNativeValue: { flex: 1, minWidth: 0, color: colors.white, fontSize: 16.8, fontWeight: '500' },
    matchDateField: { width: '100%' },
    matchDateControl: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#385267', borderRadius: 9.6, backgroundColor: colors.cardSoft, position: 'relative' },
    matchNativePickerOverlay: { ...StyleSheet.absoluteFill, width: '100%', height: '100%', opacity: 0, zIndex: 2, cursor: 'pointer', colorScheme: 'dark' } as any,
    matchNativeField: { position: 'relative', minWidth: 0, height: 56 },
    matchNativeIcon: { position: 'absolute', left: 14, top: 18, zIndex: 1, pointerEvents: 'none' } as any,
    matchNativeInputWithIcon: { width: '100%', height: 56, boxSizing: 'border-box', border: '1px solid #385267', borderRadius: 9.6, backgroundColor: colors.cardSoft, color: colors.white, padding: '7px 12px 7px 48px', fontSize: 16.8, fontFamily: 'inherit', colorScheme: 'dark', outlineStyle: 'none', cursor: 'pointer' } as any,
    matchTimeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14.4 },
    matchTimeField: { flex: 1, minWidth: 0 },
    matchFieldColumn: { width: '100%', gap: 8.4 },
    matchTimeOptionsColumn: { flex: 1, minWidth: 0, paddingTop: 0 },
    matchInputIcon: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 9.6, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, paddingHorizontal: 15.6 },
    matchInputText: { flex: 1, minWidth: 0, height: 57.6, color: colors.white, fontSize: 16.8, fontWeight: '500', outlineStyle: 'none' as any },
    matchSelectButton: { minHeight: 76.8, flexDirection: 'row', alignItems: 'center', gap: 13.2, borderRadius: 9.6, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, paddingHorizontal: 14.4 },
    matchSelectButtonOpen: { borderColor: colors.blueLight },
    matchSelectText: { flex: 1, minWidth: 0, gap: 3.6 },
    matchSelectTitle: { color: colors.white, fontSize: 15.6, fontWeight: '600' },
    matchSelectHint: { color: colors.grey, fontSize: 13.2 },
    matchAcademyLogo: { width: 50.4, height: 50.4, borderRadius: 0, backgroundColor: 'transparent' },
    matchAcademyLogoFallback: { width: 40.8, height: 40.8, alignItems: 'center', justifyContent: 'center', borderRadius: 20.4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.blueSoft },
    matchAcademyDropdown: { marginTop: 6, borderRadius: 9.6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
    matchAcademyOption: { minHeight: 64.8, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13.2, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    matchAcademyOptionActive: { backgroundColor: colors.blueSoft },
    matchupPreview: { minHeight: 163.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 19.2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.cardSoft, paddingHorizontal: 28.8, paddingVertical: 16.8 },
    matchupTeam: { flex: 1, minWidth: 0, alignItems: 'center', gap: 10.8 },
    matchTeamCrest: { width: 74.4, height: 76.8, backgroundColor: 'transparent' },
    matchTeamCrestFallback: { width: 74.4, height: 76.8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
    matchupTeamName: { color: colors.white, fontSize: 15.6, fontWeight: '600', textAlign: 'center' },
    matchupVs: { color: colors.grey, fontSize: 14.4, fontWeight: '700', letterSpacing: 1.5 },
    matchSquadTitle: { color: colors.white, fontSize: 18, fontWeight: '700', marginTop: 3.6 },
    matchSquadColumns: { flexDirection: 'row', alignItems: 'stretch', gap: 14.4 },
    matchRosterPanel: { flex: 1, minWidth: 0, minHeight: 249.6, borderWidth: 1, borderColor: colors.border, borderRadius: 10.8, backgroundColor: colors.cardSoft, padding: 13.2 },
    matchRosterTitle: { color: colors.white, fontSize: 15.6, fontWeight: '600' },
    matchRosterCount: { color: colors.grey, fontWeight: '500' },
    matchRosterSection: { minWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    matchRosterTabs: { height: 46.8, flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    matchRosterTabButton: { minWidth: 92.4, position: 'relative', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
    matchRosterTabText: { color: colors.grey, fontSize: 15.6, fontWeight: '600' },
    matchRosterTabTextActive: { color: colors.blueLight },
    matchRosterTabIndicator: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, backgroundColor: colors.blueLight },
    matchRosterSelectAll: { marginLeft: 'auto', justifyContent: 'center', paddingHorizontal: 8 },
    matchRosterSelectAllText: { color: colors.blueLight, fontSize: 13.2, fontWeight: '600' },
    matchRosterList: { maxHeight: 270 },
    matchRosterEmpty: { color: colors.grey, fontSize: 13.2, textAlign: 'center', paddingVertical: 28.8 },
    matchupTeamSubtitle: { color: colors.grey, fontSize: 13.2, textAlign: 'center', marginTop: -6 },
    matchParticipantRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 13.2, paddingHorizontal: 10.8, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    matchParticipantAvatar: { width: 32.4, height: 32.4, alignItems: 'center', justifyContent: 'center', borderRadius: 16.8, backgroundColor: colors.blueSoft, overflow: 'hidden' },
    matchParticipantImage: { width: 32.4, height: 32.4, borderRadius: 16.8 },
    matchParticipantInitial: { color: colors.blueLight, fontSize: 13.2, fontWeight: '700' },
    matchFieldHint: { color: colors.grey, fontSize: 13.2, lineHeight: 19.2, marginTop: 6 },
    rosterSelectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2.4 },
    checkbox: { width: 20.4, height: 20.4, alignItems: 'center', justifyContent: 'center', borderRadius: 4.8, borderWidth: 1, borderColor: colors.border },
    checkboxActive: { borderColor: colors.blueLight, backgroundColor: colors.blueLight },
    recipientName: { flex: 1, color: colors.white, fontSize: 13.2 },
    recipientKind: { color: colors.grey, fontSize: 12 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9.6, marginTop: 19.2, paddingTop: 16.8, borderTopWidth: 1, borderColor: colors.borderSoft },
    loading: { paddingVertical: 96 },
  });
}
