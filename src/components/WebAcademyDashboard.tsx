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
  View,
} from 'react-native';

import Screen from './Screen';
import CalendarModal from './CalendarModal';
import StartEndTimePicker from './StartEndTimePicker';
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
} from '../lib/academyData';
import { fetchNotices, markNoticeRead, AcademyNotice } from '../lib/academyNotices';
import { useAcademyRealtime } from '../lib/academyRealtime';
import { WIDE_CONTENT_MAX_WIDTH, useBreakpoint } from '../theme/breakpoints';
import * as Clipboard from 'expo-clipboard';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { PickedAvatarImage, cropAndUploadAcademyLogo } from '../lib/avatarUpload';
import { addSessionAttendees, createSession, fetchPublicAcademiesForMatches, setMainAcademy, updateAcademy } from '../lib/academyData';
import AvatarPickerTrigger from './AvatarPickerTrigger';
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
  const [editBusy, setEditBusy] = useState(false);
  const [makeMain, setMakeMain] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const [showMatchCalendar, setShowMatchCalendar] = useState(false);
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
  const [matchError, setMatchError] = useState('');
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

  async function uploadLogo(image: PickedAvatarImage) {
    if (!editAcademy) return;
    try {
      const size = Math.min(image.width, image.height);
      const url = await cropAndUploadAcademyLogo(editAcademy.id, image, {
        originX: Math.round((image.width - size) / 2), originY: Math.round((image.height - size) / 2), size,
      });
      setEditLogo(url);
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

  async function uploadCover(image: PickedAvatarImage) {
    if (!selectedAcademy) return;
    try {
      const resized = await ImageManipulator.manipulateAsync(image.uri, [{ resize: { width: 1440 } }], { compress: 0.86, format: ImageManipulator.SaveFormat.JPEG });
      const bytes = await (await fetch(resized.uri)).arrayBuffer();
      const path = `${selectedAcademy.id}/cover-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('academy-images').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('academy-images').getPublicUrl(path);
      await updateAcademy(selectedAcademy.id, { cover_url: data.publicUrl });
      await loadAcademyContent(selectedAcademy.id);
    } catch (error) { setMatchError(String(error)); }
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
    setMatchError(''); setMatchSelected(new Set()); setShowMatchAcademies(false);
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
              <Image source={{ uri: selectedAcademy.logo_url }} style={styles.headerCrest} />
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
          <View style={[styles.dashboardGrid, width < 1180 && styles.dashboardGridNarrow]}>
          <View style={[styles.leftColumn, width < 1180 && styles.columnFullWidth]}>
            <AcademyCard
              academy={selectedAcademy}
              loading={isLoadingAcademy}
              styles={styles}
              colors={colors}
              t={t}
              onEdit={() => beginEdit(selectedAcademy)}
              onUploadCover={uploadCover}
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
                  <AvatarPickerTrigger onPicked={uploadLogo} onError={(error) => setMatchError(String(error))} style={styles.editLogoPicker}>
                    {editLogo ? <Image source={{ uri: editLogo }} style={styles.editLogoImage} /> : <View style={[styles.headerCrestPlaceholder, styles.editLogoImage]}><Ionicons name="shield-outline" size={25} color={colors.blueLight} /></View>}
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
          <View style={[styles.composeModal, styles.matchModal]}>
            <View style={styles.composeHeader}><View><Text style={styles.panelTitle}>{t('academy.dashboardCreateMatch')}</Text><Text style={styles.panelHint}>Schedule a match and invite your squad</Text></View><Pressable onPress={() => setShowMatch(false)} style={styles.iconButton}><Ionicons name="close" size={18} color={colors.grey} /></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.matchFormScroll} contentContainerStyle={styles.matchFormContent}>
              <View style={styles.matchFieldRow}>
                <View style={[styles.matchFieldColumn, styles.matchDateColumn]}>
                  <Text style={styles.formLabel}>Match date</Text>
                  <Pressable onPress={() => setShowMatchCalendar(true)} style={styles.matchSelectButton}>
                    <Ionicons name="calendar-outline" size={17} color={colors.blueLight} />
                    <View style={styles.matchSelectText}><Text style={styles.matchSelectTitle}>{new Date(`${matchDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text><Text style={styles.matchSelectHint}>Tap to choose a date</Text></View>
                    <Ionicons name="chevron-down" size={16} color={colors.grey} />
                  </Pressable>
                </View>
                <View style={styles.matchTimeOptionsColumn}>
                  <StartEndTimePicker startLabel="Kick-off" endLabel="End time" startMinutes={matchStartMinutes} endMinutes={matchEndMinutes} startOptions={matchStartOptions} endOptions={matchEndOptions} onChangeStart={(minutes) => { setMatchStartMinutes(minutes); setMatchEndMinutes(null); }} onChangeEnd={setMatchEndMinutes} startPlaceholder="Select time" endPlaceholder="Select time" pickStartTitle="Choose kick-off time" pickEndTitle="Choose end time" emptyText="Choose a kick-off time first." />
                </View>
              </View>
              <View style={styles.matchFieldColumn}>
                <Text style={styles.formLabel}>Your academy</Text>
                <Pressable onPress={() => setShowMatchAcademies((v) => !v)} style={[styles.matchSelectButton, showMatchAcademies && styles.matchSelectButtonOpen]}>
                  {selectedAcademy?.logo_url ? <Image source={{ uri: selectedAcademy.logo_url }} style={styles.matchAcademyLogo} /> : <View style={styles.matchAcademyLogoFallback}><Ionicons name="shield-outline" size={16} color={colors.blueLight} /></View>}
                  <View style={styles.matchSelectText}><Text style={styles.matchSelectTitle}>{selectedAcademy?.name || 'Choose an academy'}</Text><Text style={styles.matchSelectHint}>{selectedAcademy?.city || 'Select the team playing this match'}</Text></View>
                  <Ionicons name={showMatchAcademies ? 'chevron-up' : 'chevron-down'} size={17} color={colors.grey} />
                </Pressable>
                {showMatchAcademies ? <View style={styles.matchAcademyDropdown}>{sortedAcademies.map((a) => <Pressable key={a.id} onPress={async () => { setSelectedId(a.id); setMatchSelected(new Set()); setEnrolments(await fetchEnrolments(a.id)); setShowMatchAcademies(false); }} style={[styles.matchAcademyOption, a.id === selectedAcademy?.id && styles.matchAcademyOptionActive]}>{a.logo_url ? <Image source={{ uri: a.logo_url }} style={styles.matchAcademyLogo} /> : <View style={styles.matchAcademyLogoFallback}><Ionicons name="shield-outline" size={16} color={colors.blueLight} /></View>}<View style={styles.matchSelectText}><Text style={styles.matchSelectTitle}>{a.name}</Text><Text style={styles.matchSelectHint}>{a.city || 'Location not added'}</Text></View>{a.id === selectedAcademy?.id ? <Ionicons name="checkmark-circle" size={18} color={colors.blueLight} /> : null}</Pressable>)}</View> : null}
              </View>
              {selectedAcademy ? <View style={styles.matchRosterBlock}>
                {(['player', 'staff'] as const).map((kind) => {
                  const label = kind === 'player' ? 'Players' : 'Coaches';
                  const roster = enrolments.filter((r) => r.status === 'approved' && r.member?.member_kind === kind);
                  return <View key={kind}><View style={styles.rosterSelectHeader}><Text style={styles.formLabel}>{label}</Text><Pressable onPress={() => { const ids = roster.map((r) => r.member_id); setMatchSelected((s) => new Set([...s, ...ids])); }}><Text style={styles.textAction}>Select all</Text></Pressable></View>{roster.map((r) => <Pressable key={r.member_id} onPress={() => setMatchSelected((s) => { const n = new Set(s); n.has(r.member_id) ? n.delete(r.member_id) : n.add(r.member_id); return n; })} style={[styles.recipientRow, matchSelected.has(r.member_id) && styles.recipientRowActive]}><View style={[styles.checkbox, matchSelected.has(r.member_id) && styles.checkboxActive]}>{matchSelected.has(r.member_id) ? <Ionicons name="checkmark" size={12} color={colors.blackText} /> : null}</View><Text style={styles.recipientName}>{r.member?.full_name}</Text></Pressable>)}{!roster.length ? <Text style={styles.panelHint}>{kind === 'player' ? 'No registered players yet.' : 'No coaches are registered yet.'}</Text> : null}</View>;
                })}
              </View> : null}
              <View style={styles.matchFieldColumn}>
                <Text style={styles.formLabel}>Opponent academy or name</Text>
                <View style={styles.matchInputIcon}><Ionicons name="search" size={16} color={colors.grey} /><TextInput value={matchOpponent} onChangeText={(value) => { setMatchOpponent(value); setMatchOpponentId(null); }} style={styles.matchInputText} placeholder="Search or enter opponent name" placeholderTextColor={colors.greyDark} /></View>
                {matchOpponent.trim() && !matchOpponentId ? (() => { const matches = opponentOptions.filter((a) => a.id !== selectedAcademy?.id && `${a.name} ${a.city ?? ''}`.toLowerCase().includes(matchOpponent.toLowerCase())).slice(0, 5); return matches.length ? <View style={styles.matchAcademyDropdown}>{matches.map((a) => <Pressable key={a.id} onPress={() => { setMatchOpponent(a.name); setMatchOpponentId(a.id); }} style={styles.matchAcademyOption}>{a.logo_url ? <Image source={{ uri: a.logo_url }} style={styles.matchAcademyLogo} /> : <View style={styles.matchAcademyLogoFallback}><Ionicons name="shield-outline" size={16} color={colors.blueLight} /></View>}<View style={styles.matchSelectText}><Text style={styles.matchSelectTitle}>{a.name}</Text><Text style={styles.matchSelectHint}>{a.city || 'MYPitch academy'}</Text></View><Ionicons name="add-circle-outline" size={18} color={colors.blueLight} /></Pressable>)}</View> : <Text style={styles.matchFieldHint}>No academy found. The name will be saved as entered.</Text>; })() : !matchOpponent.trim() ? <Text style={styles.matchFieldHint}>Choose a MYPitch academy from the suggestions, or enter any opponent.</Text> : null}
              </View>
              <View style={styles.matchFieldColumn}><Text style={styles.formLabel}>Match place</Text><Text style={styles.matchFieldHint}>Paste a Google Maps share link for the venue.</Text><View style={styles.matchInputIcon}><Ionicons name="link-outline" size={16} color={colors.grey} /><TextInput value={matchMapsUrl} onChangeText={setMatchMapsUrl} style={styles.matchInputText} placeholder="https://maps.google.com/..." placeholderTextColor={colors.greyDark} autoCapitalize="none" autoCorrect={false} keyboardType="url" /></View></View>
              {matchError ? <Text style={styles.errorText}>{matchError}</Text> : null}
            </ScrollView>
            <View style={styles.modalActions}><Pressable onPress={() => setShowMatch(false)} style={styles.outlineButton}><Text style={styles.outlineButtonText}>{t('common.cancel')}</Text></Pressable><Pressable disabled={!matchOpponent.trim() || !matchDate || matchStartMinutes === null || matchEndMinutes === null || matchBusy} onPress={saveMatch} style={[styles.primaryButton, (!matchOpponent.trim() || !matchDate || matchStartMinutes === null || matchEndMinutes === null || matchBusy) && styles.disabledButton]}>{matchBusy ? <ActivityIndicator size="small" color={colors.blackText} /> : <Ionicons name="calendar" size={16} color={colors.blackText} />}<Text style={styles.primaryButtonText}>Create match</Text></Pressable></View>
          </View>
        </View>
      </Modal>
      <CalendarModal visible={showMatchCalendar} value={matchDate} title="Choose match date" minDate={new Date()} onClose={() => setShowMatchCalendar(false)} onSelect={(date) => {
        setMatchDate(date); setShowMatchCalendar(false);
        const selectedDay = new Date(`${date}T00:00:00`);
        const options = Array.from({ length: 48 }, (_, i) => i * 30).filter((minutes) => new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), Math.floor(minutes / 60), minutes % 60).getTime() >= Date.now());
        const start = options.includes(17 * 60) ? 17 * 60 : options[0] ?? null;
        setMatchStartMinutes(start); setMatchEndMinutes(start !== null ? start + 90 <= 1440 ? start + 90 : null : null);
      }} />
    </Screen>
  );
}

function AcademyCard({ academy, loading, styles, colors, t, onEdit, onUploadCover }: {
  academy: AcademyRow;
  loading: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  t: (key: string, params?: Record<string, string | number>) => string;
  onEdit: () => void;
  onUploadCover: (image: PickedAvatarImage) => void;
}) {
  return (
    <View style={styles.academyPanel}>
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
          {academy.logo_url ? <Image source={{ uri: academy.logo_url }} style={styles.academyLogo} /> : (
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
            {academy.logo_url ? <Image source={{ uri: academy.logo_url }} style={styles.academyDirectoryLogo} resizeMode="cover" /> : (
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

function RosterPanel({ players, parents, coaches, teams, styles, colors, t, onViewAll, onOpen }: {
  players: number; parents: number; coaches: number; teams: number | null;
  styles: ReturnType<typeof makeStyles>; colors: AppColors;
  t: (key: string) => string; onViewAll: () => void; onOpen: (area: AcademyArea) => void;
}) {
  const items = [
    { icon: 'people-outline' as const, label: t('academy.tabPlayers'), value: String(players), area: 'players' as const },
    { icon: 'people-circle-outline' as const, label: t('academy.tabParents'), value: String(parents), area: 'parents' as const },
    { icon: 'person-outline' as const, label: t('academy.rosterCoaches'), value: String(coaches), area: 'coaches' as const },
    { icon: 'shield-outline' as const, label: t('academy.dashboardTeams'), value: teams == null ? '—' : String(teams), area: 'matches' as const },
  ];
  return (
    <Panel styles={styles} colors={colors}>
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
    <Panel styles={styles} colors={colors}>
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

function MatchesPanel({ title, sessions, academyName, academyLogoUrl, emptyText, showStatus, styles, colors, t, loading, onCreate, onViewAll, onSession }: {
  title: string; sessions: SessionRow[]; academyName: string; academyLogoUrl: string | null; emptyText: string; showStatus: boolean;
  styles: ReturnType<typeof makeStyles>; colors: AppColors; t: (key: string) => string; loading: boolean;
  onCreate?: () => void; onViewAll: () => void; onSession: (session: SessionRow) => void;
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
        const location = session.location_name || (session.pitch_id ? t('academy.dashboardPitch') : t('academy.dashboardLocationToConfirm'));
        return (
          <Pressable key={session.id} onPress={() => onSession(session)} style={({ hovered, pressed }: any) => [styles.matchRow, hovered && styles.matchRowHovered, pressed && styles.pressed]}>
            <View style={styles.matchDateBlock}><Text style={styles.matchDay}>{parts.day}</Text><Text style={styles.matchDate}>{parts.date}</Text><Text style={styles.matchTime}>{parts.time}</Text></View>
            <View style={styles.matchDivider} />
            <View style={styles.matchMain}>
              <View style={styles.matchTeams}>
                <View style={styles.teamNameWrap}>{academyLogoUrl ? <Image source={{ uri: academyLogoUrl }} style={styles.teamCrestImage} resizeMode="cover" /> : <View style={styles.teamCrest}><Ionicons name="shield-outline" size={15} color={colors.blueLight} /></View>}<Text style={styles.teamName} numberOfLines={1}>{session.title || academyName}</Text></View>
                <Text style={styles.versus}>{t('academy.dashboardVs')}</Text>
                <View style={styles.teamNameWrap}><View style={[styles.teamCrest, styles.opponentCrest]}><Ionicons name="shield-outline" size={15} color={colors.orange} /></View><Text style={styles.teamName} numberOfLines={1}>{session.opponent || t('academy.dashboardOpponentToConfirm')}</Text></View>
              </View>
              <View style={styles.matchLocation}><Ionicons name="location-outline" size={14} color={colors.grey} /><Text style={styles.matchLocationText} numberOfLines={1}>{location}</Text></View>
            </View>
            {showStatus ? <View style={styles.matchStatus}><Text style={styles.matchStatusText}>{session.pitch_id ? t('academy.dashboardHome') : t('academy.dashboardScheduled')}</Text></View> : <View style={styles.completedBadge}><Ionicons name="checkmark-circle" size={13} color={colors.green} /><Text style={styles.completedText}>{t('academy.dashboardCompleted')}</Text></View>}
            <Ionicons name="chevron-forward" size={17} color={colors.grey} />
          </Pressable>
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
    screenContent: { paddingHorizontal: 21, paddingTop: 0, paddingBottom: 24, maxWidth: 1800, alignSelf: 'stretch' },
    topHeader: { minHeight: 70, position: 'relative', zIndex: 40, overflow: 'visible', flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 0 },
    topHeaderCompact: { minHeight: 0, flexWrap: 'wrap', justifyContent: 'flex-start', paddingVertical: 10, gap: 8 },
    pageTitle: { color: colors.white, fontSize: 27, lineHeight: 33, fontWeight: '700', marginRight: 8 },
    headerPickerWrap: { position: 'relative', zIndex: 30 },
    headerPicker: { minHeight: 40, width: 286, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    headerPickerCompact: { width: 220 },
    headerCrest: { width: 22, height: 22, borderRadius: 5 },
    headerCrestPlaceholder: { width: 22, height: 22, borderRadius: 5, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
    headerPickerText: { flex: 1, minWidth: 0, color: colors.white, fontSize: 13, fontWeight: '600' },
    seasonPicker: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    seasonText: { color: colors.greySoft, fontSize: 12, fontWeight: '600' },
    primaryButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 7, borderWidth: 1, borderColor: '#61BAFB', backgroundColor: colors.blueLight },
    primaryButtonText: { color: colors.blackText, fontSize: 12, fontWeight: '700' },
    primaryHovered: { backgroundColor: '#82C9FB', borderColor: '#82C9FB' },
    headerSpacer: { flex: 1 },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
    dropdown: { position: 'absolute', top: 45, left: 0, minWidth: 260, maxWidth: 320, zIndex: 100, elevation: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0B1722', padding: 5, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
    dropdownRow: { minHeight: 48, justifyContent: 'center', gap: 2, paddingHorizontal: 10, borderRadius: 6 },
    dropdownRowActive: { backgroundColor: colors.blueSoft },
    dropdownTitle: { color: colors.white, fontSize: 12, fontWeight: '600' },
    dropdownMeta: { color: colors.grey, fontSize: 11 },
    hovered: { backgroundColor: colors.blueSoft },
    pressed: { opacity: 0.75 },
    searchBar: { minHeight: 40, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 7, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, backgroundColor: colors.card },
    searchInput: { flex: 1, height: 38, color: colors.white, fontSize: 12, outlineStyle: 'none' as any },
    createForm: { marginTop: 14, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    createFormHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    createInputs: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    formInput: { flex: 1, minWidth: 0, height: 46, color: colors.white, fontSize: 14, fontWeight: '500', borderRadius: 8, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, paddingHorizontal: 13, outlineStyle: 'none' as any },
    formLabel: { color: colors.greySoft, fontSize: 12, fontWeight: '600', marginBottom: 7 },
    editAcademyModal: { width: 'min(440px, 94%)' as any, maxWidth: 440, maxHeight: '90%', padding: 14, borderRadius: 8 },
    editAcademyHeader: { paddingBottom: 10, marginBottom: 11 },
    editModalTitle: { color: colors.white, fontSize: 13, lineHeight: 17, fontWeight: '700' },
    editModalSubtitle: { color: colors.grey, fontSize: 10, marginTop: 3 },
    editCloseButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
    editAcademyScroll: { flexGrow: 0 },
    editAcademyContent: { paddingBottom: 0 },
    editProfileRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    editLogoColumn: { width: 84, alignItems: 'flex-start', paddingLeft: 7 },
    editLabel: { color: colors.greySoft, fontSize: 10, fontWeight: '600', marginBottom: 5 },
    editLogoPicker: { alignItems: 'center', gap: 5, paddingTop: 1 },
    editLogoImage: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
    editLogoChange: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    editLogoChangeText: { color: colors.blueLight, fontSize: 10, fontWeight: '600' },
    editFieldsColumn: { flex: 1, minWidth: 0, gap: 3 },
    editTextInput: { width: '100%' as any, minWidth: 0, height: 34, color: colors.white, fontSize: 12, fontWeight: '500', borderRadius: 6, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, paddingHorizontal: 10, outlineStyle: 'none' as any },
    editDescriptionSection: { marginTop: 11 },
    editDescriptionInput: { height: 54, textAlignVertical: 'top', paddingTop: 8, paddingBottom: 6 },
    editMainRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 7, borderRadius: 6, backgroundColor: colors.blueSoft },
    editMainLabel: { flex: 1, color: colors.white, fontSize: 10, fontWeight: '500' },
    editModalActions: { marginTop: 12, paddingTop: 10, gap: 7 },
    editActionButton: { minHeight: 34, paddingHorizontal: 12, borderRadius: 6 },
    editSaveText: { fontSize: 10 },
    optionalLabel: { color: colors.grey, fontWeight: '400' },
    errorText: { color: colors.red, fontSize: 12, marginTop: 9 },
    disabledButton: { opacity: 0.5 },
    outlineButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft },
    outlineButtonText: { color: colors.greySoft, fontSize: 11, fontWeight: '600' },
    sectionNav: { minHeight: 44, position: 'relative', zIndex: 0, flexDirection: 'row', alignItems: 'stretch', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 12 },
    sectionTab: { minWidth: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    sectionTabActive: { borderBottomColor: colors.blueLight },
    sectionTabHovered: { backgroundColor: colors.surfaceMuted },
    sectionTabLabel: { color: colors.grey, fontSize: 12, fontWeight: '500' },
    sectionTabLabelActive: { color: colors.white, fontWeight: '600' },
    dashboardGrid: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    dashboardGridNarrow: { flexDirection: 'column' },
    columnFullWidth: { width: '100%' },
    leftColumn: { width: '26%', gap: 12 },
    middleColumn: { width: '40%', gap: 12 },
    rightColumn: { width: '32%', gap: 12 },
    panel: { borderRadius: 8, borderWidth: 1, backgroundColor: colors.card, overflow: 'hidden' },
    academiesPanel: { marginTop: 2 },
    academiesIntro: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    academiesCount: { minWidth: 30, height: 30, textAlign: 'center', textAlignVertical: 'center', color: colors.blueLight, fontSize: 12, fontWeight: '700', borderRadius: 15, overflow: 'hidden', backgroundColor: colors.blueSoft, paddingTop: 7 },
    academyDirectoryRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 17, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    academyDirectoryLogo: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft },
    academyDirectoryLogoFallback: { alignItems: 'center', justifyContent: 'center' },
    academyDirectoryInfo: { flex: 1, minWidth: 0, gap: 3 },
    academyDirectoryCity: { color: colors.greySoft, fontSize: 11 },
    academyDirectoryCounts: { color: colors.grey, fontSize: 10 },
    academyMainBadge: { color: colors.blueLight, fontSize: 9, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.blueSoft },
    academyDirectoryAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8 },
    academiesEmpty: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
    academyPanel: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
    coverWrap: { height: 98, position: 'relative', overflow: 'hidden', backgroundColor: colors.cardSoft },
    coverImage: { width: '100%', height: 98 },
    coverFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#152A39' },
    coverFallbackText: { color: colors.grey, fontSize: 11, marginTop: 5 },
    cameraButton: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(8,17,26,0.78)' },
    academyCardBody: { paddingHorizontal: 14, paddingBottom: 11, paddingTop: 0 },
    academyTitleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11 },
    academyLogo: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginTop: -18 },
    academyLogoFallback: { alignItems: 'center', justifyContent: 'center' },
    academyTitleBlock: { flex: 1, minWidth: 0, paddingTop: 3 },
    academyNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    academyName: { flexShrink: 1, color: colors.white, fontSize: 16, lineHeight: 21, fontWeight: '700' },
    pausedBadge: { color: colors.orange, fontSize: 9, fontWeight: '700' },
    academyDescription: { color: colors.grey, fontSize: 10, lineHeight: 14, marginTop: 3 },
    academyMetaRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 8 },
    academyMetaText: { flex: 1, color: colors.greySoft, fontSize: 11 },
    academyFooter: { minHeight: 34, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 9, marginTop: 3 },
    sportTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
    sportTagText: { color: colors.greySoft, fontSize: 10, fontWeight: '600' },
    editAcademyButton: { minHeight: 31, paddingHorizontal: 9 },
    panelHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    panelHeadingActions: { flexDirection: 'row', alignItems: 'center', gap: 13 },
    panelTitle: { color: colors.white, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    panelTitleSmall: { color: colors.white, fontSize: 12, fontWeight: '700' },
    panelHint: { color: colors.grey, fontSize: 11, marginTop: 4 },
    textAction: { color: colors.blueLight, fontSize: 11, fontWeight: '600' },
    rosterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 11 },
    rosterMetric: { width: '48%', minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSoft },
    rosterMetricHovered: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
    rosterMetricText: { flex: 1, minWidth: 0 },
    rosterValue: { color: colors.white, fontSize: 14, lineHeight: 17, fontWeight: '700' },
    rosterLabel: { color: colors.greySoft, fontSize: 10, marginTop: 1 },
    linkDivider: { height: 1, backgroundColor: colors.borderSoft, marginHorizontal: 14, marginTop: 2 },
    linkPanelTitle: { color: colors.white, fontSize: 14, lineHeight: 19, fontWeight: '700', paddingHorizontal: 14, paddingTop: 9, paddingBottom: 4 },
    linkAction: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    linkActionHovered: { backgroundColor: colors.surfaceMuted },
    linkIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.blueSoft },
    linkTextBlock: { flex: 1, minWidth: 0 },
    linkTitle: { color: colors.white, fontSize: 11, lineHeight: 15, fontWeight: '600' },
    linkHint: { color: colors.grey, fontSize: 10, marginTop: 2 },
    smallPrimaryButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 6, borderWidth: 1, borderColor: '#61BAFB', backgroundColor: colors.blueLight },
    smallPrimaryText: { color: colors.blackText, fontSize: 10, fontWeight: '700' },
    matchPanel: { minHeight: 0 },
    matchRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    matchRowHovered: { backgroundColor: colors.surfaceMuted },
    matchDateBlock: { width: 58, alignItems: 'flex-start', gap: 2 },
    matchDay: { color: colors.grey, fontSize: 9, fontWeight: '600' },
    matchDate: { color: colors.white, fontSize: 12, lineHeight: 15, fontWeight: '700' },
    matchTime: { color: colors.grey, fontSize: 10 },
    matchDivider: { width: 1, height: 52, backgroundColor: colors.border, marginRight: 1 },
    matchMain: { flex: 1, minWidth: 0, gap: 5 },
    matchTeams: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    teamNameWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
    teamCrest: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: colors.blueSoft },
    teamCrestImage: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.blueSoft },
    opponentCrest: { backgroundColor: colors.orangeSoft },
    teamName: { flexShrink: 1, color: colors.white, fontSize: 11, fontWeight: '600' },
    versus: { color: colors.grey, fontSize: 9, fontWeight: '500' },
    matchLocation: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 28 },
    matchLocationText: { flex: 1, color: colors.grey, fontSize: 10 },
    matchStatus: { minWidth: 49, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.borderBlue, backgroundColor: colors.blueSoft, alignItems: 'center' },
    matchStatusText: { color: colors.blueLight, fontSize: 9, fontWeight: '600' },
    completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 5, backgroundColor: colors.greenSoft },
    completedText: { color: colors.green, fontSize: 9, fontWeight: '600' },
    emptyMatch: { minHeight: 125, justifyContent: 'center', alignItems: 'center', gap: 7, paddingHorizontal: 18 },
    emptyIconSmall: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.blueSoft },
    emptyMessage: { color: colors.grey, textAlign: 'center', fontSize: 11, lineHeight: 16 },
    emptyAction: { color: colors.blueLight, fontSize: 11, fontWeight: '600' },
    panelLoading: { paddingVertical: 30 },
    communicationPanel: { minHeight: 0 },
    audienceArea: { paddingHorizontal: 14, paddingTop: 7, paddingBottom: 6 },
    audienceRow: { flexDirection: 'row', gap: 9 },
    audienceChip: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 8, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSoft },
    audienceChipSelected: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
    audienceTitle: { color: colors.white, fontSize: 10, fontWeight: '600' },
    audienceCount: { color: colors.grey, fontSize: 9, marginTop: 3 },
    activityHeader: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderSoft },
    activityRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    activityIcon: { width: 34, height: 34, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.blueSoft },
    activityText: { flex: 1, minWidth: 0, gap: 3 },
    activityTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
    activityTitle: { flex: 1, color: colors.white, fontSize: 10, fontWeight: '700' },
    activityTime: { color: colors.grey, fontSize: 9 },
    activityMeta: { color: colors.grey, fontSize: 9 },
    activityBody: { color: colors.greySoft, fontSize: 9, lineHeight: 13 },
    unreadDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blueLight },
    emptyActivity: { minHeight: 80, justifyContent: 'center', alignItems: 'center', gap: 8 },
    coachesPanel: { minHeight: 0, paddingBottom: 10 },
    dutyRange: { color: colors.grey, fontSize: 10, marginHorizontal: 14, marginTop: 7, marginBottom: 4 },
    coachEmpty: { minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
    emptyDashboard: { minHeight: 330, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 27, backgroundColor: colors.blueSoft },
    modalBackdrop: { ...StyleSheet.absoluteFill, zIndex: 80, elevation: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,10,15,0.78)' },
    composeModal: { width: 'min(480px, 92%)' as any, maxHeight: '85%', borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 18, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
    composeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 1, borderColor: colors.borderSoft, marginBottom: 14 },
    recipientRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 8, borderRadius: 6 },
    recipientRowActive: { backgroundColor: colors.blueSoft },
    selectedChoice: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
    matchRosterBlock: { borderWidth: 1, borderColor: colors.border, borderRadius: 7, padding: 9, marginBottom: 12, maxHeight: 180, overflow: 'scroll' as any },
    matchModal: { width: 'min(650px, 92%)' as any, maxWidth: 650, maxHeight: '92%', padding: 20 },
    matchFormScroll: { flexShrink: 1 },
    matchFormContent: { gap: 16, paddingBottom: 8 },
    matchFieldRow: { flexDirection: 'row', gap: 12 },
    matchFieldColumn: { flex: 1, minWidth: 0 },
    matchDateColumn: { flex: 0, width: '38%' as any },
    matchTimeOptionsColumn: { flex: 1, minWidth: 0, paddingTop: 1 },
    matchInputIcon: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, paddingHorizontal: 13 },
    matchInputText: { flex: 1, minWidth: 0, height: 48, color: colors.white, fontSize: 14, fontWeight: '500', outlineStyle: 'none' as any },
    matchSelectButton: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 8, borderWidth: 1, borderColor: '#2B4050', backgroundColor: colors.cardSoft, paddingHorizontal: 12 },
    matchSelectButtonOpen: { borderColor: colors.blueLight },
    matchSelectText: { flex: 1, minWidth: 0, gap: 3 },
    matchSelectTitle: { color: colors.white, fontSize: 13, fontWeight: '600' },
    matchSelectHint: { color: colors.grey, fontSize: 11 },
    matchAcademyLogo: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
    matchAcademyLogoFallback: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.blueSoft },
    matchAcademyDropdown: { marginTop: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
    matchAcademyOption: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    matchAcademyOptionActive: { backgroundColor: colors.blueSoft },
    matchFieldHint: { color: colors.grey, fontSize: 11, lineHeight: 16, marginTop: 5 },
    rosterSelectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    checkbox: { width: 17, height: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 4, borderWidth: 1, borderColor: colors.border },
    checkboxActive: { borderColor: colors.blueLight, backgroundColor: colors.blueLight },
    recipientName: { flex: 1, color: colors.white, fontSize: 11 },
    recipientKind: { color: colors.grey, fontSize: 10 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderColor: colors.borderSoft },
    loading: { paddingVertical: 80 },
  });
}
