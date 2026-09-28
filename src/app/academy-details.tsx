import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TextInput, View } from 'react-native';

import AnimatedPressable from '../components/AnimatedPressable';
import AppButton from '../components/AppButton';
import AppHeader from '../components/AppHeader';
import AvatarCropModal from '../components/AvatarCropModal';
import AvatarPickerTrigger from '../components/AvatarPickerTrigger';
import CalendarModal from '../components/CalendarModal';
import FamilyRoster, { RosterMember } from '../components/FamilyRoster';
import MapPickerModal from '../components/MapPickerModal';
import OptionsModal, { PickerOption } from '../components/OptionsModal';
import Screen from '../components/Screen';
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
  AcademyRow,
  EnrolmentRow,
  OwnerPitch,
  SessionRow,
  ageFromDateOfBirth,
  cancelSession,
  createSession,
  deleteAcademy,
  deleteSession,
  fetchAcademy,
  fetchEnrolments,
  fetchMyAcademies,
  fetchMyPitches,
  fetchOtherAcademies,
  fetchSessions,
  ownerAddEnrolment,
  ownerRemoveEnrolment,
  regenerateInviteToken,
  respondToEnrolment,
  scheduledPlayedMatchCounts,
  setMainAcademy,
  updateAcademy,
  updateSession,
} from '../lib/academyData';
import { useAcademyRealtime } from '../lib/academyRealtime';
import { useAuth } from '../lib/auth';
import {
  PickedAvatarImage,
  cropAndUploadAcademyLogo,
  signedMemberAvatars,
} from '../lib/avatarUpload';
import { Place, mapsUrlFor } from '../lib/placeSearch';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont } from '../theme/typography';

const JOIN_LINK_BASE = 'https://mypitch-owner-app.vercel.app/join';
const REMOVE_VALUE = '__remove__';

type Audience = 'all' | 'parents' | 'coaches';

export default function AcademyDetailsScreen() {
  const { academyId } = useLocalSearchParams<{ academyId: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { pitchOwner } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { markRead } = useAcademyRealtime();

  const [item, setItem] = useState<AcademyRow | null>(null);
  const [enrolments, setEnrolments] = useState<EnrolmentRow[]>([]);
  const [matches, setMatches] = useState<SessionRow[]>([]);
  const [pitches, setPitches] = useState<OwnerPitch[]>([]);
  const [myOtherAcademies, setMyOtherAcademies] = useState<AcademyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string | null>>({});

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pickedLogo, setPickedLogo] = useState<PickedAvatarImage | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSettingMain, setIsSettingMain] = useState(false);

  const [rosterMode, setRosterMode] = useState<'family' | 'coaches'>('family');
  const [copiedMessage, setCopiedMessage] = useState('');
  const [isRegeneratingToken, setIsRegeneratingToken] = useState(false);
  const [movingMember, setMovingMember] = useState<RosterMember | null>(null);

  // Match scheduling — the same shape the old combined trainings/matches form
  // used, minus the kind toggle: everything created here is a match.
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [sessionTime, setSessionTime] = useState('');
  const [sessionDuration, setSessionDuration] = useState(90);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionPitchId, setSessionPitchId] = useState<string | null>(null);
  const [sessionOpponent, setSessionOpponent] = useState('');
  const [sessionEndTime, setSessionEndTime] = useState('');
  const [opponentAcademyId, setOpponentAcademyId] = useState<string | null>(null);
  const [opponentChoices, setOpponentChoices] = useState<AcademyRow[]>([]);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatForever, setRepeatForever] = useState(true);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [awayPlace, setAwayPlace] = useState<{ name: string; mapsUrl: string } | null>(null);
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [picker, setPicker] = useState<
    'date' | 'time' | 'duration' | 'pitch' | 'until' | 'endTime' | 'opponent' | null
  >(null);

  // Send message
  const [audiencePicking, setAudiencePicking] = useState(false);
  const [pickedRecipients, setPickedRecipients] = useState<string[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Messages
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!academyId) return;

    const [row, enrolmentRows, matchRows, others] = await Promise.all([
      fetchAcademy(academyId),
      fetchEnrolments(academyId),
      fetchSessions(academyId, 'match'),
      fetchMyAcademies(),
    ]);

    setItem(row);
    setEnrolments(enrolmentRows);
    setMatches(matchRows);
    setMyOtherAcademies(others.filter((a) => a.id !== academyId));

    if (row) {
      setName(row.name);
      setCity(row.city ?? '');
      setDescription(row.description ?? '');
    }

    setIsLoading(false);
  }, [academyId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      markRead('players');
      markRead('parents');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    if (pitchOwner?.id) fetchMyPitches(pitchOwner.id).then(setPitches);
  }, [pitchOwner?.id]);

  useEffect(() => {
    if (academyId) fetchOtherAcademies(academyId).then(setOpponentChoices);
  }, [academyId]);

  const loadConversations = useCallback(async () => {
    if (!academyId) return;
    setStaffId(await ensureStaffMember(academyId));
    const rows = collapseToOnePerConversation(await fetchConversations());
    setConversations(
      rows.filter(
        (row) => row.academy_id === academyId && (row.kind === 'direct' || row.message_count > 0)
      )
    );
  }, [academyId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useFocusEffect(
    useCallback(() => {
      markRead('messages');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  async function handleSave() {
    if (!academyId || isSaving) return;

    setIsSaving(true);
    setSavedMessage('');
    setErrorMessage('');

    const { error } = await updateAcademy(academyId, {
      name: name.trim(),
      city: city.trim() || null,
      description: description.trim() || null,
    });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSavedMessage(t('academy.saved'));
    load();
  }

  function handleDelete() {
    if (!academyId) return;

    Alert.alert(t('academy.deleteTitle'), t('academy.deleteWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteAcademy(academyId);
          if (error) setErrorMessage(error.message);
          else router.back();
        },
      },
    ]);
  }

  async function handleSetMain() {
    if (!academyId || isSettingMain) return;
    setIsSettingMain(true);
    await setMainAcademy(academyId);
    setIsSettingMain(false);
    load();
  }

  async function respond(enrolmentId: string, approve: boolean) {
    await respondToEnrolment(enrolmentId, approve);
    load();
  }

  async function handleLogoCropped(crop: { originX: number; originY: number; size: number }) {
    if (!pickedLogo || !academyId) return;

    setIsUploadingLogo(true);
    setErrorMessage('');

    try {
      const url = await cropAndUploadAcademyLogo(academyId, pickedLogo, crop);
      await updateAcademy(academyId, { logo_url: url });
      setPickedLogo(null);
      load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('academy.logoFailed'));
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function copyInviteLink() {
    if (!item) return;
    await Clipboard.setStringAsync(`${JOIN_LINK_BASE}/${item.invite_token}`);
    setCopiedMessage(t('academy.inviteCopied'));
    setTimeout(() => setCopiedMessage(''), 2500);
  }

  function confirmRegenerateToken() {
    Alert.alert(t('academy.inviteRegenerateConfirmTitle'), t('academy.inviteRegenerateConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('academy.inviteRegenerate'),
        style: 'destructive',
        onPress: async () => {
          if (!academyId) return;
          setIsRegeneratingToken(true);
          const token = await regenerateInviteToken(academyId);
          setIsRegeneratingToken(false);
          if (token) load();
        },
      },
    ]);
  }

  const approved = enrolments.filter((row) => row.status === 'approved');
  const pending = enrolments.filter((row) => row.status === 'pending');
  const playerEnrolments = approved.filter((row) => row.member?.member_kind === 'player');
  const guardianEnrolments = approved.filter((row) => row.member?.member_kind === 'guardian');

  function toRosterMember(row: EnrolmentRow): RosterMember | null {
    if (!row.member) return null;
    return {
      id: row.member.id,
      full_name: row.member.full_name,
      avatar_url: row.member.avatar_url,
      member_kind: row.member.member_kind,
      date_of_birth: row.member.date_of_birth,
      guardian_id: row.member.guardian_id,
      guardian_id_2: row.member.guardian_id_2,
    };
  }

  const rosterPlayers = playerEnrolments
    .map(toRosterMember)
    .filter((m): m is RosterMember => m != null);
  const rosterGuardians = guardianEnrolments
    .map(toRosterMember)
    .filter((m): m is RosterMember => m != null);

  const matchCounts = scheduledPlayedMatchCounts(matches);

  /**
   * Member photos sit in a private bucket — they are pictures of children —
   * so each needs a short-lived signed URL. Storage RLS already lets this
   * academy's owner read the photos of everyone enrolled with them.
   */
  useEffect(() => {
    let cancelled = false;

    const people = enrolments
      .map((row) => row.member)
      .filter((member): member is NonNullable<typeof member> => member != null);

    signedMemberAvatars(people).then((signed) => {
      if (!cancelled) setMemberAvatars(signed);
    });

    return () => {
      cancelled = true;
    };
  }, [enrolments]);

  const moveOptions: PickerOption[] = [
    ...myOtherAcademies.map((a) => ({ value: a.id, label: a.name, hint: a.city ?? null })),
    { value: REMOVE_VALUE, label: t('academy.removeFromAcademy'), hint: null },
  ];

  async function handleMoveSelect(value: string) {
    if (!movingMember || !academyId) return;

    if (value === REMOVE_VALUE) {
      await ownerRemoveEnrolment(movingMember.id, academyId);
    } else {
      await ownerAddEnrolment(movingMember.id, value);
    }

    setMovingMember(null);
    load();
  }

  async function sendToAudience(audience: Audience) {
    if (!academyId || isSendingMessage) return;

    const ids =
      audience === 'parents'
        ? guardianEnrolments.map((row) => row.member!.id)
        : audience === 'coaches'
          ? []
          : approved.map((row) => row.member!.id);

    await sendToIds(ids, t(`academy.group_${audience === 'coaches' ? 'coaches' : audience}`));
  }

  async function sendToPicked() {
    await sendToIds(pickedRecipients, t('academy.groupCustom'));
  }

  async function sendToIds(ids: string[], groupLabel: string) {
    if (!academyId || isSendingMessage) return;

    setIsSendingMessage(true);
    setErrorMessage('');

    const staff = await ensureStaffMember(academyId);

    if (!staff || ids.length === 0) {
      setIsSendingMessage(false);
      setErrorMessage(t('academyChat.nobody'));
      return;
    }

    if (ids.length === 1) {
      const { id, error } = await startDirectChat(staff, ids[0]);
      setIsSendingMessage(false);

      if (error || !id) {
        setErrorMessage(error ?? t('academyChat.couldNotStart'));
        return;
      }

      router.push({ pathname: '/academy-chat', params: { conversationId: id, asMemberId: staff } } as any);
      return;
    }

    const title = `${item?.name ?? ''} · ${groupLabel}`.trim();
    const { id, error } = await createGroupChat(staff, title, ids, true);
    setIsSendingMessage(false);

    if (error || !id) {
      setErrorMessage(error ?? t('academyChat.couldNotStart'));
      return;
    }

    router.push({ pathname: '/academy-chat', params: { conversationId: id, asMemberId: staff } } as any);
  }

  function toggleRecipient(memberId: string) {
    setPickedRecipients((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]
    );
  }

  // --- Match scheduling ---

  const selectedPitch = pitches.find((pitch) => pitch.id === sessionPitchId) ?? null;
  const venueName = selectedPitch?.name ?? awayPlace?.name ?? null;
  const venueMapsUrl = selectedPitch?.maps_url ?? awayPlace?.mapsUrl ?? null;

  function resetSessionForm() {
    setEditingSessionId(null);
    setSessionTitle('');
    setSessionDate('');
    setSessionTime('');
    setSessionDuration(90);
    setSessionPitchId(null);
    setAwayPlace(null);
    setSessionOpponent('');
    setSessionEndTime('');
    setOpponentAcademyId(null);
    setRepeatWeekly(false);
    setRepeatForever(true);
    setRepeatUntil('');
    setErrorMessage('');
  }

  function openSessionForEdit(session: SessionRow) {
    const start = new Date(session.starts_at);
    const end = new Date(session.ends_at);

    setEditingSessionId(session.id);
    setSessionTitle(session.title ?? '');
    setSessionDate(
      `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, '0')}-${`${start.getDate()}`.padStart(2, '0')}`
    );
    setSessionTime(
      `${`${start.getHours()}`.padStart(2, '0')}:${`${start.getMinutes()}`.padStart(2, '0')}`
    );
    setSessionDuration(Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)));
    setSessionPitchId(session.pitch_id);
    setAwayPlace(
      !session.pitch_id && session.location_name
        ? { name: session.location_name, mapsUrl: session.maps_url ?? '' }
        : null
    );
    setSessionOpponent(session.opponent ?? '');
    setOpponentAcademyId(session.opponent_academy_id);
    setSessionEndTime(
      `${`${end.getHours()}`.padStart(2, '0')}:${`${end.getMinutes()}`.padStart(2, '0')}`
    );
    setRepeatWeekly(session.recurrence === 'weekly');
    setRepeatForever(session.recurrence === 'weekly' && !session.recurrence_until);
    setRepeatUntil(session.recurrence_until ?? '');
    setErrorMessage('');
    setShowSessionForm(true);
  }

  async function handleCreateSession() {
    if (!academyId || isSavingSession) return;

    const startsAt = new Date(`${sessionDate}T${sessionTime}`);
    if (Number.isNaN(startsAt.getTime())) {
      setErrorMessage(t('academy.invalidDateTime'));
      return;
    }

    if (repeatWeekly && !repeatForever && !repeatUntil) {
      setErrorMessage(t('academy.repeatNeedsEnd'));
      return;
    }

    let endsAt = new Date(startsAt.getTime() + sessionDuration * 60000);

    if (sessionEndTime) {
      const [endHour, endMinute] = sessionEndTime.split(':').map(Number);
      const explicit = new Date(startsAt);
      explicit.setHours(endHour, endMinute, 0, 0);
      if (explicit <= startsAt) explicit.setDate(explicit.getDate() + 1);
      endsAt = explicit;
    }

    setIsSavingSession(true);
    setErrorMessage('');

    const payload = {
      title: sessionTitle,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      pitchId: sessionPitchId,
      locationName: venueName,
      mapsUrl: venueMapsUrl,
      opponent: !opponentAcademyId ? sessionOpponent : null,
      opponentAcademyId,
      recurrence: (repeatWeekly ? 'weekly' : 'none') as 'weekly' | 'none',
      recurrenceUntil: repeatWeekly && !repeatForever ? repeatUntil : null,
    };

    const { error } = editingSessionId
      ? await updateSession(editingSessionId, payload)
      : await createSession({ academyId, kind: 'match', ...payload });

    setIsSavingSession(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    resetSessionForm();
    setShowSessionForm(false);
    fetchSessions(academyId, 'match').then(setMatches);
  }

  const timeOptions: PickerOption[] = useMemo(() => {
    const options: PickerOption[] = [];
    for (let minutes = 6 * 60; minutes <= 22 * 60; minutes += 15) {
      const label = `${`${Math.floor(minutes / 60)}`.padStart(2, '0')}:${`${minutes % 60}`.padStart(2, '0')}`;
      options.push({ value: label, label });
    }
    return options;
  }, []);

  const durationOptions: PickerOption[] = useMemo(
    () =>
      [45, 60, 75, 90, 105, 120, 150].map((minutes) => ({
        value: String(minutes),
        label: t('academy.durationValue').replace('{minutes}', String(minutes)),
      })),
    [t]
  );

  const opponentOptions: PickerOption[] = useMemo(
    () => [
      { value: '', label: t('academy.opponentByName'), hint: null },
      ...opponentChoices.map((row) => ({ value: row.id, label: row.name, hint: row.city ?? null })),
    ],
    [opponentChoices, t]
  );

  const pitchOptions: PickerOption[] = useMemo(
    () =>
      pitches.map((pitch) => ({
        value: pitch.id,
        label: pitch.name,
        hint: [pitch.area, pitch.city].filter(Boolean).join(', ') || null,
      })),
    [pitches]
  );

  function formatIsoDate(iso: string) {
    if (!iso) return '';
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  if (isLoading) {
    return (
      <Screen maxWidth={900}>
        <AppHeader title={t('academy.title')} />
        <ActivityIndicator color={colors.greenLight} style={styles.loading} />
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen maxWidth={900}>
        <AppHeader title={t('academy.title')} />
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('academy.notFound')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen maxWidth={900}>
      <AppHeader title={item.name} subtitle={item.city ?? undefined} />

      <View style={styles.logoRow}>
        <AvatarPickerTrigger
          disabled={isUploadingLogo}
          onPicked={setPickedLogo}
          onError={(error) =>
            setErrorMessage(error instanceof Error ? error.message : t('academy.logoFailed'))
          }
        >
          <View style={styles.logoWrap}>
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={styles.logo} resizeMode="cover" />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}>
                <Ionicons name="school" size={28} color={colors.greenLight} />
              </View>
            )}

            <View style={styles.logoBadge}>
              {isUploadingLogo ? (
                <ActivityIndicator color={colors.blackText} size="small" />
              ) : (
                <Ionicons name="camera" size={13} color={colors.blackText} />
              )}
            </View>
          </View>
        </AvatarPickerTrigger>

        {item.is_main ? (
          <View style={styles.mainBadge}>
            <Ionicons name="star" size={11} color={colors.blackText} />
            <Text style={styles.mainBadgeText}>{t('academy.mainBadge')}</Text>
          </View>
        ) : (
          <Text style={styles.logoHint}>{t('academy.logoHint')}</Text>
        )}
      </View>

      <View style={styles.statRow}>
        <Stat styles={styles} label={t('academy.tabPlayers')} value={playerEnrolments.length} />
        <Stat styles={styles} label={t('academy.tabParents')} value={guardianEnrolments.length} />
        <Stat styles={styles} label={t('academy.scheduledMatches')} value={matchCounts.scheduled} />
        <Stat styles={styles} label={t('academy.playedMatches')} value={matchCounts.played} />
      </View>

      {item.is_main ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('academy.inviteTitle')}</Text>
          <Text style={styles.hint}>{t('academy.inviteHint')}</Text>

          <View style={styles.linkRow}>
            <Text style={styles.linkText} numberOfLines={1}>
              {`${JOIN_LINK_BASE}/${item.invite_token}`}
            </Text>
          </View>

          <View style={styles.formActions}>
            <AppButton
              title={t('academy.inviteRegenerate')}
              variant="outline"
              fullWidth={false}
              loading={isRegeneratingToken}
              style={styles.formButton}
              onPress={confirmRegenerateToken}
            />
            <AppButton
              title={t('academy.inviteCopy')}
              fullWidth={false}
              style={styles.formButton}
              onPress={copyInviteLink}
            />
          </View>

          {copiedMessage ? <Text style={styles.savedText}>{copiedMessage}</Text> : null}
        </View>
      ) : null}

      {pending.length > 0 ? (
        <>
          <Text style={styles.heading}>{t('academy.pendingTitle')}</Text>
          {pending.map((row) => (
            <PendingRow
              key={row.id}
              styles={styles}
              colors={colors}
              t={t}
              enrolment={row}
              onApprove={() => respond(row.id, true)}
              onReject={() => respond(row.id, false)}
            />
          ))}
        </>
      ) : null}

      <Text style={styles.heading}>{t('academy.rosterHeading')}</Text>

      <FamilyRoster
        players={rosterPlayers}
        guardians={rosterGuardians}
        avatars={memberAvatars}
        emptyText={t('academy.noRoster')}
        comingNextText={t('academy.comingNext')}
        mode={rosterMode}
        onModeChange={setRosterMode}
        familyLabel={t('academy.rosterFamily')}
        coachesLabel={t('academy.rosterCoaches')}
        onMemberAction={(member) => setMovingMember(member)}
      />

      <Text style={styles.heading}>{t('academy.tabMatches')}</Text>

      {showSessionForm ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {editingSessionId ? t('academy.editSessionTitle') : t('academy.newMatchTitle')}
          </Text>

          <TextInput
            style={styles.input}
            value={sessionTitle}
            onChangeText={setSessionTitle}
            placeholder={t('academy.sessionTitlePlaceholder')}
            placeholderTextColor={colors.greyDark}
          />

          <View style={styles.inputRow}>
            <PickerField
              styles={styles}
              colors={colors}
              icon="calendar-outline"
              label={t('academy.dateLabel')}
              value={formatIsoDate(sessionDate)}
              style={styles.inputHalf}
              onPress={() => setPicker('date')}
            />
            <PickerField
              styles={styles}
              colors={colors}
              icon="time-outline"
              label={t('academy.timeLabel')}
              value={sessionTime}
              style={styles.inputHalf}
              onPress={() => setPicker('time')}
            />
          </View>

          <View style={styles.inputRow}>
            <PickerField
              styles={styles}
              colors={colors}
              icon="hourglass-outline"
              label={t('academy.durationLabel')}
              value={t('academy.durationValue').replace('{minutes}', String(sessionDuration))}
              style={styles.inputHalf}
              onPress={() => setPicker('duration')}
            />
            <PickerField
              styles={styles}
              colors={colors}
              icon="time-outline"
              label={t('academy.endTimeLabel')}
              value={sessionEndTime}
              style={styles.inputHalf}
              onPress={() => setPicker('endTime')}
            />
          </View>

          <PickerField
            styles={styles}
            colors={colors}
            icon="shield-outline"
            label={t('academy.opponentAcademyLabel')}
            value={opponentChoices.find((row) => row.id === opponentAcademyId)?.name ?? ''}
            onPress={() => setPicker('opponent')}
          />

          {!opponentAcademyId ? (
            <TextInput
              style={styles.input}
              value={sessionOpponent}
              onChangeText={setSessionOpponent}
              placeholder={t('academy.opponentPlaceholder')}
              placeholderTextColor={colors.greyDark}
            />
          ) : null}

          <PickerField
            styles={styles}
            colors={colors}
            icon="location-outline"
            label={t('academy.pitchLabel')}
            value={venueName ?? ''}
            onPress={() => setPicker('pitch')}
          />

          <AnimatedPressable style={styles.findPlaceRow} onPress={() => setShowPlaceSearch(true)}>
            <Ionicons name="search" size={15} color={colors.greenLight} />
            <Text style={styles.findPlaceText}>{t('placeSearch.findElsewhere')}</Text>
          </AnimatedPressable>

          {venueMapsUrl ? (
            <View style={styles.mapsNote}>
              <Ionicons name="map-outline" size={14} color={colors.blueLight} />
              <Text style={styles.mapsNoteText}>
                {awayPlace
                  ? t('placeSearch.savedPlace').replace('{name}', awayPlace.name)
                  : t('academy.mapsLinked')}
              </Text>
            </View>
          ) : null}

          <AnimatedPressable style={styles.toggleRow} onPress={() => setRepeatWeekly((v) => !v)}>
            <Ionicons
              name={repeatWeekly ? 'checkbox' : 'square-outline'}
              size={19}
              color={repeatWeekly ? colors.greenLight : colors.greyDark}
            />
            <Text style={styles.toggleText}>{t('academy.repeatWeekly')}</Text>
          </AnimatedPressable>

          {repeatWeekly ? (
            <>
              <AnimatedPressable style={styles.toggleRow} onPress={() => setRepeatForever((v) => !v)}>
                <Ionicons
                  name={repeatForever ? 'radio-button-on' : 'radio-button-off'}
                  size={19}
                  color={repeatForever ? colors.greenLight : colors.greyDark}
                />
                <Text style={styles.toggleText}>{t('academy.repeatForever')}</Text>
              </AnimatedPressable>

              {!repeatForever ? (
                <PickerField
                  styles={styles}
                  colors={colors}
                  icon="calendar-outline"
                  label={t('academy.repeatUntilLabel')}
                  value={formatIsoDate(repeatUntil)}
                  onPress={() => setPicker('until')}
                />
              ) : null}
            </>
          ) : null}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.formActions}>
            <AppButton
              title={t('common.cancel')}
              variant="outline"
              fullWidth={false}
              style={styles.formButton}
              onPress={() => {
                resetSessionForm();
                setShowSessionForm(false);
              }}
            />
            <AppButton
              title={editingSessionId ? t('common.save') : t('academy.scheduleAction')}
              loading={isSavingSession}
              disabled={!sessionDate || !sessionTime}
              fullWidth={false}
              style={styles.formButton}
              onPress={handleCreateSession}
            />
          </View>
        </View>
      ) : (
        <AnimatedPressable
          style={styles.createButton}
          hoverScale={1.02}
          onPress={() => {
            resetSessionForm();
            setShowSessionForm(true);
          }}
        >
          <Ionicons name="add" size={18} color={colors.blackText} />
          <Text style={styles.createButtonText}>{t('academy.newMatchTitle')}</Text>
        </AnimatedPressable>
      )}

      {matches.length === 0 ? (
        <EmptyBox styles={styles} colors={colors} icon="trophy-outline">
          {t('academy.noMatches')}
        </EmptyBox>
      ) : (
        matches.map((session) => (
          <SessionRowView
            key={session.id}
            styles={styles}
            colors={colors}
            session={session}
            t={t}
            onOpen={() => openSessionForEdit(session)}
            onToggleCancel={async () => {
              await cancelSession(session.id, !session.is_cancelled);
              if (academyId) fetchSessions(academyId, 'match').then(setMatches);
            }}
            onDelete={async () => {
              await deleteSession(session.id);
              if (academyId) fetchSessions(academyId, 'match').then(setMatches);
            }}
          />
        ))
      )}

      <Text style={styles.heading}>{t('academy.sendMessage')}</Text>

      <View style={styles.audienceRow}>
        <AudienceButton
          styles={styles}
          colors={colors}
          label={t('academy.groupEveryone')}
          onPress={() => sendToAudience('all')}
        />
        <AudienceButton
          styles={styles}
          colors={colors}
          label={t('academy.groupAllParents')}
          onPress={() => sendToAudience('parents')}
        />
        <AudienceButton
          styles={styles}
          colors={colors}
          label={t('academy.group_coaches')}
          onPress={() => sendToAudience('coaches')}
        />
      </View>

      <AnimatedPressable
        style={styles.groupButtonPlain}
        hoverScale={1.02}
        onPress={() => setAudiencePicking((v) => !v)}
      >
        <Ionicons name="checkmark-done-outline" size={15} color={colors.greenLight} />
        <Text style={styles.groupButtonPlainText}>{t('academy.pickPeople')}</Text>
      </AnimatedPressable>

      {audiencePicking ? (
        <View style={styles.card}>
          {approved.map((row) => {
            if (!row.member) return null;
            const isPicked = pickedRecipients.includes(row.member.id);
            const isPlayer = row.member.member_kind === 'player';

            return (
              <AnimatedPressable
                key={row.member.id}
                pressedScale={0.98}
                onPress={() => toggleRecipient(row.member!.id)}
              >
                <View style={[styles.pickRow, isPicked && styles.pickRowActive]}>
                  <Ionicons
                    name={isPlayer ? 'football-outline' : 'person'}
                    size={16}
                    color={isPlayer ? colors.blueLight : colors.greyDark}
                  />
                  <Text style={styles.pickRowText} numberOfLines={1}>
                    {row.member.full_name}
                  </Text>
                  <Ionicons
                    name={isPicked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={isPicked ? colors.greenLight : colors.greyDark}
                  />
                </View>
              </AnimatedPressable>
            );
          })}

          <AppButton
            title={t('academyChat.newTitle')}
            loading={isSendingMessage}
            disabled={pickedRecipients.length === 0}
            style={styles.formButton}
            onPress={sendToPicked}
          />
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {conversations.length > 0 ? (
        <>
          <Text style={styles.heading}>{t('academyChat.newTitle')}</Text>
          {conversations.map((row) => (
            <AnimatedPressable
              key={row.id}
              pressedScale={0.98}
              onPress={() =>
                router.push({
                  pathname: '/academy-chat',
                  params: { conversationId: row.id, asMemberId: row.for_member_id },
                } as any)
              }
            >
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={row.kind === 'group' ? 'people' : 'chatbubble-ellipses'}
                    size={17}
                    color={colors.greenLight}
                  />
                </View>

                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {row.kind === 'group'
                      ? row.title || t('academyChat.untitledGroup')
                      : row.other_names.join(', ') || t('academyChat.unknownPerson')}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {row.last_body || t('academyChat.noMessagesYet')}
                  </Text>
                </View>

                {row.unread_count > 0 ? (
                  <View style={styles.unreadDot}>
                    <Text style={styles.unreadText}>{row.unread_count}</Text>
                  </View>
                ) : null}
              </View>
            </AnimatedPressable>
          ))}
        </>
      ) : null}

      <Text style={styles.heading}>{t('academy.tabDetails')}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t('academy.namePlaceholder')}</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        <Text style={styles.label}>{t('academy.cityPlaceholder')}</Text>
        <TextInput style={styles.input} value={city} onChangeText={setCity} />

        <Text style={styles.label}>{t('academy.descriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        {savedMessage ? <Text style={styles.savedText}>{savedMessage}</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <AppButton title={t('common.save')} loading={isSaving} disabled={!name.trim()} onPress={handleSave} />

        {!item.is_main ? (
          <AnimatedPressable style={styles.setMainButton} onPress={handleSetMain}>
            {isSettingMain ? (
              <ActivityIndicator color={colors.greenLight} size="small" />
            ) : (
              <>
                <Ionicons name="star-outline" size={16} color={colors.greenLight} />
                <Text style={styles.setMainText}>{t('academy.setMain')}</Text>
              </>
            )}
          </AnimatedPressable>
        ) : null}

        <AnimatedPressable style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={16} color={colors.red} />
          <Text style={styles.deleteText}>{t('academy.deleteTitle')}</Text>
        </AnimatedPressable>
      </View>

      <AvatarCropModal
        visible={!!pickedLogo}
        imageUri={pickedLogo?.uri ?? null}
        imageWidth={pickedLogo?.width ?? 0}
        imageHeight={pickedLogo?.height ?? 0}
        onCancel={() => setPickedLogo(null)}
        onConfirm={handleLogoCropped}
      />

      <OptionsModal
        visible={!!movingMember}
        title={t('academy.moveToAcademy')}
        options={moveOptions}
        value={null}
        emptyText={t('academy.noOtherOwnAcademies')}
        onSelect={handleMoveSelect}
        onClose={() => setMovingMember(null)}
      />

      <CalendarModal
        visible={picker === 'date'}
        value={sessionDate}
        title={t('academy.dateLabel')}
        minDate={new Date()}
        onSelect={setSessionDate}
        onClose={() => setPicker(null)}
      />

      <CalendarModal
        visible={picker === 'until'}
        value={repeatUntil}
        title={t('academy.repeatUntilLabel')}
        minDate={sessionDate ? new Date(`${sessionDate}T00:00:00`) : new Date()}
        onSelect={setRepeatUntil}
        onClose={() => setPicker(null)}
      />

      <OptionsModal
        visible={picker === 'time'}
        title={t('academy.timeLabel')}
        options={timeOptions}
        value={sessionTime || null}
        onSelect={setSessionTime}
        onClose={() => setPicker(null)}
      />

      <OptionsModal
        visible={picker === 'duration'}
        title={t('academy.durationLabel')}
        options={durationOptions}
        value={String(sessionDuration)}
        onSelect={(next) => setSessionDuration(Number(next))}
        onClose={() => setPicker(null)}
      />

      <OptionsModal
        visible={picker === 'pitch'}
        title={t('academy.pitchLabel')}
        options={pitchOptions}
        value={sessionPitchId}
        emptyText={t('academy.noPitches')}
        onSelect={(value) => {
          setSessionPitchId(value);
          setAwayPlace(null);
        }}
        onClose={() => setPicker(null)}
      />

      <OptionsModal
        visible={picker === 'endTime'}
        title={t('academy.endTimeLabel')}
        options={timeOptions}
        value={sessionEndTime}
        onSelect={setSessionEndTime}
        onClose={() => setPicker(null)}
      />

      <OptionsModal
        visible={picker === 'opponent'}
        title={t('academy.opponentAcademyLabel')}
        options={opponentOptions}
        value={opponentAcademyId}
        emptyText={t('academy.noOtherAcademies')}
        onSelect={(value) => {
          setOpponentAcademyId(value || null);
          if (value) setSessionOpponent('');
        }}
        onClose={() => setPicker(null)}
      />

      <MapPickerModal
        visible={showPlaceSearch}
        onSelect={(place: Place) => {
          setAwayPlace({ name: place.name, mapsUrl: mapsUrlFor(place) });
          setSessionPitchId(null);
        }}
        onClose={() => setShowPlaceSearch(false)}
      />
    </Screen>
  );
}

function PickerField({
  styles,
  colors,
  icon,
  label,
  value,
  style,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  style?: object;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable style={[styles.pickerField, style]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={colors.greyDark} />
      <View style={styles.pickerTextWrap}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={[styles.pickerValue, !value && styles.pickerValueEmpty]} numberOfLines={1}>
          {value || '—'}
        </Text>
      </View>
      <Ionicons name="chevron-down" size={15} color={colors.greyDark} />
    </AnimatedPressable>
  );
}

function AudienceButton({
  styles,
  colors,
  label,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  label: string;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable style={styles.audienceButton} hoverScale={1.02} onPress={onPress}>
      <Ionicons name="paper-plane-outline" size={14} color={colors.blackText} />
      <Text style={styles.audienceButtonText} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function SessionRowView({
  styles,
  colors,
  session,
  t,
  onOpen,
  onToggleCancel,
  onDelete,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  session: SessionRow;
  t: (key: string) => string;
  onOpen: () => void;
  onToggleCancel: () => void;
  onDelete: () => void;
}) {
  const start = new Date(session.starts_at);
  const end = new Date(session.ends_at);

  const when = `${start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} · ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString(
    [],
    { hour: '2-digit', minute: '2-digit' }
  )}`;

  return (
    <View style={[styles.row, session.is_cancelled && styles.sessionCancelled]}>
      <View style={styles.rowIcon}>
        <Ionicons
          name="trophy-outline"
          size={18}
          color={session.is_cancelled ? colors.greyDark : colors.greenLight}
        />
      </View>

      <AnimatedPressable style={styles.rowInfo} onPress={onOpen}>
        <Text style={styles.rowTitle}>
          {session.title}
          {session.opponent ? ` · ${session.opponent}` : ''}
        </Text>
        <Text style={styles.rowMeta}>
          {[
            when,
            session.location_name,
            session.recurrence === 'weekly'
              ? session.recurrence_until
                ? t('academy.repeatsUntil').replace(
                    '{date}',
                    new Date(`${session.recurrence_until}T00:00:00`).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })
                  )
                : t('academy.repeatsForever')
              : null,
            session.is_cancelled ? t('academy.cancelled') : null,
          ]
            .filter(Boolean)
            .join(' • ')}
        </Text>
      </AnimatedPressable>

      <AnimatedPressable style={styles.iconButton} onPress={onToggleCancel}>
        <Ionicons name={session.is_cancelled ? 'refresh' : 'close'} size={16} color={colors.grey} />
      </AnimatedPressable>

      <AnimatedPressable style={styles.iconButton} onPress={onDelete}>
        <Ionicons name="trash-outline" size={15} color={colors.grey} />
      </AnimatedPressable>
    </View>
  );
}

function PendingRow({
  styles,
  colors,
  t,
  enrolment,
  onApprove,
  onReject,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  t: (key: string) => string;
  enrolment: EnrolmentRow;
  onApprove: () => void;
  onReject: () => void;
}) {
  const age = ageFromDateOfBirth(enrolment.member?.date_of_birth ?? null);
  const isPlayer = enrolment.member?.member_kind === 'player';

  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons
          name={isPlayer ? 'football-outline' : 'person'}
          size={17}
          color={isPlayer ? colors.blueLight : colors.greyDark}
        />
      </View>

      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{enrolment.member?.full_name ?? '—'}</Text>
        <Text style={styles.rowMeta}>
          {[
            isPlayer ? t('academy.playerLabel') : t('academy.guardianLabel'),
            age != null ? t('academy.ageValue').replace('{age}', String(age)) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <AnimatedPressable style={styles.approveButton} onPress={onApprove}>
        <Text style={styles.approveText}>{t('academy.approve')}</Text>
      </AnimatedPressable>
      <AnimatedPressable style={styles.iconButton} onPress={onReject}>
        <Ionicons name="close" size={16} color={colors.grey} />
      </AnimatedPressable>
    </View>
  );
}

function Stat({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyBox({
  styles,
  colors,
  icon,
  children,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.emptyBox}>
      <Ionicons name={icon} size={24} color={colors.greyDark} />
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    loading: {
      marginTop: spacing.xl,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    logoWrap: {
      width: 72,
      height: 72,
    },
    logo: {
      width: 72,
      height: 72,
      borderRadius: radius.lg,
    },
    logoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
    },
    logoBadge: {
      position: 'absolute',
      right: -4,
      bottom: -4,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.greenLight,
      borderWidth: 2,
      borderColor: colors.background,
    },
    logoHint: {
      flex: 1,
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      lineHeight: 17,
    },
    mainBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.round,
      backgroundColor: colors.greenLight,
    },
    mainBadgeText: {
      color: colors.blackText,
      fontSize: scaleFont(11),
      fontWeight: '900',
    },
    statRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    statValue: {
      color: colors.white,
      fontSize: scaleFont(18),
      fontWeight: '900',
    },
    statLabel: {
      color: colors.greyDark,
      fontSize: scaleFont(10),
      fontWeight: '800',
      marginTop: 2,
      textAlign: 'center',
    },
    heading: {
      color: colors.greenLight,
      fontSize: scaleFont(12),
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
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
    hint: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      lineHeight: 17,
      marginBottom: spacing.sm,
    },
    linkRow: {
      backgroundColor: colors.cardSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      marginBottom: spacing.sm,
    },
    linkText: {
      color: colors.blueLight,
      fontSize: scaleFont(13),
      fontWeight: '700',
    },
    label: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '800',
      marginBottom: 5,
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
    inputRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    inputHalf: {
      flex: 1,
    },
    textArea: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      marginBottom: spacing.sm,
    },
    toggleText: {
      color: colors.greySoft,
      fontSize: scaleFont(13),
      fontWeight: '700',
    },
    pickerField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.cardSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
      marginBottom: spacing.sm,
    },
    pickerTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    pickerLabel: {
      color: colors.greyDark,
      fontSize: scaleFont(10),
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    pickerValue: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '700',
      marginTop: 1,
    },
    pickerValueEmpty: {
      color: colors.greyDark,
    },
    findPlaceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 11,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
      marginBottom: spacing.sm,
    },
    findPlaceText: {
      color: colors.greenLight,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    mapsNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.sm,
    },
    mapsNoteText: {
      color: colors.blueLight,
      fontSize: scaleFont(12),
      fontWeight: '700',
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
    audienceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    audienceButton: {
      flexGrow: 1,
      flexBasis: 150,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.greenLight,
      borderRadius: radius.lg,
      paddingVertical: 11,
      paddingHorizontal: spacing.sm,
    },
    audienceButtonText: {
      color: colors.blackText,
      fontSize: scaleFont(12),
      fontWeight: '900',
    },
    groupButtonPlain: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
      paddingVertical: 11,
      marginBottom: spacing.md,
    },
    groupButtonPlainText: {
      color: colors.greenLight,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    pickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: radius.md,
    },
    pickRowActive: {
      backgroundColor: colors.greenSoft,
    },
    pickRowText: {
      flex: 1,
      minWidth: 0,
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '700',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.sm,
      marginBottom: 10,
    },
    sessionCancelled: {
      opacity: 0.55,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardSoft,
    },
    rowInfo: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '800',
    },
    rowMeta: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      marginTop: 2,
    },
    unreadDot: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.greenLight,
    },
    unreadText: {
      color: colors.blackText,
      fontSize: 11,
      fontWeight: '900',
    },
    approveButton: {
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      borderRadius: radius.round,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    approveText: {
      color: colors.greenLight,
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    iconButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardSoft,
    },
    setMainButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      marginTop: spacing.md,
      paddingVertical: 12,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
    },
    setMainText: {
      color: colors.greenLight,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      marginTop: spacing.md,
      paddingVertical: 12,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    deleteText: {
      color: colors.red,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    savedText: {
      color: colors.greenLight,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginBottom: spacing.sm,
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(12),
      fontWeight: '700',
      marginBottom: spacing.sm,
    },
    emptyBox: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    emptyText: {
      color: colors.grey,
      fontSize: scaleFont(13),
      fontWeight: '600',
      textAlign: 'center',
    },
  });
