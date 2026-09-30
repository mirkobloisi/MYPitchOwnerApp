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
import FamilyRoster, { RosterMember } from '../components/FamilyRoster';
import OptionsModal, { PickerOption } from '../components/OptionsModal';
import Screen from '../components/Screen';
import { useTranslation } from '../i18n/LanguageContext';
import { Conversation, collapseToOnePerConversation, fetchConversations } from '../lib/academyChat';
import {
  AcademyRow,
  EnrolmentRow,
  SessionRow,
  ageFromDateOfBirth,
  cancelSession,
  deleteAcademy,
  deleteSession,
  fetchAcademy,
  fetchEnrolments,
  fetchMyAcademies,
  fetchSessions,
  ownerAddEnrolment,
  ownerRemoveEnrolment,
  respondToEnrolment,
  scheduledPlayedMatchCounts,
  setMainAcademy,
  updateAcademy,
} from '../lib/academyData';
import { useAcademyRealtime } from '../lib/academyRealtime';
import {
  PickedAvatarImage,
  cropAndUploadAcademyLogo,
  signedMemberAvatars,
} from '../lib/avatarUpload';
import { AppColors } from '../theme/palettes';
import { WIDE_CONTENT_MAX_WIDTH, useBreakpoint } from '../theme/breakpoints';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont } from '../theme/typography';

const JOIN_LINK_BASE = 'https://mypitch-owner-app.vercel.app/join';
const REMOVE_VALUE = '__remove__';

export default function AcademyDetailsScreen() {
  const { academyId } = useLocalSearchParams<{ academyId: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { isWide } = useBreakpoint();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { markRead } = useAcademyRealtime();

  const [item, setItem] = useState<AcademyRow | null>(null);
  const [enrolments, setEnrolments] = useState<EnrolmentRow[]>([]);
  const [matches, setMatches] = useState<SessionRow[]>([]);
  const [myOtherAcademies, setMyOtherAcademies] = useState<AcademyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string | null>>({});

  const [isEditingDetails, setIsEditingDetails] = useState(false);
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
  const [movingMember, setMovingMember] = useState<RosterMember | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);

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
      markRead('messages');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const loadConversations = useCallback(async () => {
    if (!academyId) return;
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

  const approved = enrolments.filter((row) => row.status === 'approved');
  const pending = enrolments.filter((row) => row.status === 'pending');
  const playerEnrolments = approved.filter((row) => row.member?.member_kind === 'player');
  const guardianEnrolments = approved.filter((row) => row.member?.member_kind === 'guardian');

  function toRosterMember(row: EnrolmentRow): RosterMember | null {
    if (!row.member || row.member.member_kind === 'staff') return null;
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

  if (isLoading) {
    return (
      <Screen maxWidth={WIDE_CONTENT_MAX_WIDTH}>
        <AppHeader title={t('academy.title')} />
        <ActivityIndicator color={colors.greenLight} style={styles.loading} />
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen maxWidth={WIDE_CONTENT_MAX_WIDTH}>
        <AppHeader title={t('academy.title')} />
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('academy.notFound')}</Text>
        </View>
      </Screen>
    );
  }

  const roster = (
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
  );

  const mainColumn = (
    <>
      <View style={styles.statRow}>
        <Stat styles={styles} label={t('academy.tabPlayers')} value={playerEnrolments.length} />
        <Stat styles={styles} label={t('academy.tabParents')} value={guardianEnrolments.length} />
        <Stat styles={styles} label={t('academy.scheduledMatches')} value={matchCounts.scheduled} />
        <Stat styles={styles} label={t('academy.playedMatches')} value={matchCounts.played} />
      </View>

      {item!.is_main ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('academy.inviteTitle')}</Text>
          <Text style={styles.hint}>{t('academy.inviteHint')}</Text>

          <View style={styles.linkRow}>
            <Text style={styles.linkText} numberOfLines={1}>
              {`${JOIN_LINK_BASE}/${item!.invite_token}`}
            </Text>
          </View>

          <AppButton
            title={t('academy.inviteCopy')}
            fullWidth={false}
            style={styles.formButton}
            onPress={copyInviteLink}
          />

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

      {!isWide ? (
        <>
          <Text style={styles.heading}>{t('academy.rosterHeading')}</Text>
          {roster}
        </>
      ) : null}

      <Text style={styles.heading}>{t('academy.tabMatches')}</Text>

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

      {conversations.length > 0 ? (
        <>
          <Text style={styles.heading}>{t('academy.tabMessages')}</Text>
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

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </>
  );

  return (
    <Screen maxWidth={WIDE_CONTENT_MAX_WIDTH}>
      <AppHeader
        title={item.name}
        subtitle={item.city ?? undefined}
        right={
          <AnimatedPressable
            style={styles.editButton}
            onPress={() => setIsEditingDetails((v) => !v)}
          >
            <Ionicons
              name={isEditingDetails ? 'close' : 'create-outline'}
              size={15}
              color={colors.greenLight}
            />
            <Text style={styles.editButtonText}>
              {isEditingDetails ? t('common.cancel') : t('common.edit')}
            </Text>
          </AnimatedPressable>
        }
      />

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

      {isEditingDetails ? (
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
      ) : null}

      {isWide ? (
        <View style={styles.wideLayout}>
          <View style={styles.mainColumn}>{mainColumn}</View>
          <View style={styles.sideColumn}>
            <Text style={styles.heading}>{t('academy.rosterHeading')}</Text>
            {roster}
          </View>
        </View>
      ) : (
        mainColumn
      )}

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
    </Screen>
  );
}

function SessionRowView({
  styles,
  colors,
  session,
  t,
  onToggleCancel,
  onDelete,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  session: SessionRow;
  t: (key: string) => string;
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

      <View style={styles.rowInfo}>
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
      </View>

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
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
    },
    editButtonText: {
      color: colors.greenLight,
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    wideLayout: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.lg,
    },
    mainColumn: {
      flex: 2,
      minWidth: 0,
    },
    sideColumn: {
      flex: 1,
      minWidth: 260,
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
    textArea: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    formButton: {
      minWidth: 130,
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
