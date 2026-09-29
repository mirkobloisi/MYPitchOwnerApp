import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import AnimatedPressable from './AnimatedPressable';
import { useTranslation } from '../i18n/LanguageContext';
import {
  Conversation,
  collapseToOnePerConversation,
  createGroupChat,
  ensureStaffMember,
  fetchConversations,
  startDirectChat,
} from '../lib/academyChat';
import { AcademyRow, fetchEnrolments, fetchMyAcademies } from '../lib/academyData';
import { AcademyNotice, fetchNotices, markNoticeRead } from '../lib/academyNotices';
import { useAcademyRealtime } from '../lib/academyRealtime';
import { INBOX_WIDTH } from '../theme/breakpoints';
import { AppColors, lightColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont } from '../theme/typography';

type InboxTab = 'messages' | 'notifications';

type RecipientPerson = { id: string; full_name: string };

const ownerInboxColors: AppColors = {
  ...lightColors,
  background: '#EEF7FC',
  backgroundSoft: '#FAFDFF',
  backgroundBlue: '#EAF5FC',
  card: '#FFFFFF',
  cardSoft: '#F5FAFE',
  cardDark: '#E8F3FA',
  blue: '#398FBE',
  blueLight: '#237EAF',
  blueDeep: '#17638D',
  blueSoft: '#E5F3FB',
  blueGlow: '#D4EBF8',
  green: '#398FBE',
  greenLight: '#237EAF',
  greenDeep: '#17638D',
  greenSoft: '#E5F3FB',
  greenGlow: '#D4EBF8',
  white: '#142C3D',
  offWhite: '#142C3D',
  grey: '#5D7485',
  greySoft: '#496476',
  greyDark: '#8298A7',
  border: '#D8E8F2',
  borderSoft: '#E8F1F7',
  borderGreen: '#B9DDEF',
  borderBlue: '#B9DDEF',
  blackText: '#142C3D',
  surfaceMuted: 'rgba(35,126,175,0.04)',
  neutralSoft: 'rgba(35,126,175,0.06)',
  backgroundGradient: ['#EEF7FC', '#F7FBFE', '#FFFFFF'],
};

/** Relative time, short enough for a narrow list row. */
function timeAgo(iso: string, t: (key: string) => string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return t('inbox.justNow');
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function noticeIcon(type: string): keyof typeof Ionicons.glyphMap {
  if (type === 'message') return 'chatbubble-ellipses';
  if (type === 'enrolment_request') return 'person-add-outline';
  if (type === 'enrolment') return 'checkmark-circle-outline';
  if (type === 'session') return 'trophy-outline';
  return 'notifications-outline';
}

/**
 * The right-hand panel: an owner's message threads and recent notices,
 * switchable, so either is a glance away from whatever screen they're on.
 * Website only — see WebAppShell.
 */
export default function WebInboxPanel({ initialTab = 'messages', fullScreen = false }: { initialTab?: InboxTab; fullScreen?: boolean }) {
  const { colors: themeColors } = useAppTheme();
  const isWeb = Platform.OS === 'web';
  const colors = isWeb ? ownerInboxColors : themeColors;
  const { t } = useTranslation();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { unread, messagesVersion } = useAcademyRealtime();

  const [tab, setTab] = useState<InboxTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notices, setNotices] = useState<AcademyNotice[]>([]);

  // Compose ("Personalize"): pick academies, then fine-tune the parents and
  // coaches pulled in from them, before sending.
  const [isComposing, setIsComposing] = useState(false);
  const [academies, setAcademies] = useState<AcademyRow[]>([]);
  const [selectedAcademyIds, setSelectedAcademyIds] = useState<Set<string>>(new Set());
  const [academyPeople, setAcademyPeople] = useState<Record<string, RecipientPerson[]>>({});
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [composeError, setComposeError] = useState('');

  const loadConversations = useCallback(async () => {
    const rows = collapseToOnePerConversation(await fetchConversations());
    setConversations(rows.filter((row) => row.kind === 'direct' || row.message_count > 0));
  }, []);

  const loadNotices = useCallback(async () => {
    // Dedicated to academy matches and bookings — 'session' is the notice
    // type notify_session_change raises for a scheduled, moved or cancelled
    // match. Messages and enrolment activity live elsewhere.
    const rows = await fetchNotices();
    setNotices(rows.filter((row) => row.type === 'session'));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations, messagesVersion]);

  useEffect(() => {
    loadNotices();
    // `unread` gets a new object on every notifications-table change, which
    // is exactly when the notices list itself needs reloading too.
  }, [loadNotices, unread]);

  function openCompose() {
    setIsComposing(true);
    setComposeError('');
    setSelectedAcademyIds(new Set());
    setSelectedPeople(new Set());
    fetchMyAcademies().then(setAcademies);
  }

  function closeCompose() {
    setIsComposing(false);
  }

  async function loadAcademyPeople(academyId: string): Promise<RecipientPerson[]> {
    const cached = academyPeople[academyId];
    if (cached) return cached;

    const rows = await fetchEnrolments(academyId);
    const guardians = rows
      .filter((row) => row.status === 'approved' && row.member?.member_kind === 'guardian')
      .map((row) => ({ id: row.member!.id, full_name: row.member!.full_name }));

    setAcademyPeople((current) => ({ ...current, [academyId]: guardians }));
    return guardians;
  }

  async function toggleAcademy(academyId: string) {
    const nextAcademyIds = new Set(selectedAcademyIds);

    if (nextAcademyIds.has(academyId)) {
      nextAcademyIds.delete(academyId);
      const people = academyPeople[academyId] ?? [];
      setSelectedPeople((current) => {
        const updated = new Set(current);
        people.forEach((person) => updated.delete(person.id));
        return updated;
      });
    } else {
      nextAcademyIds.add(academyId);
      const people = await loadAcademyPeople(academyId);
      setSelectedPeople((current) => {
        const updated = new Set(current);
        people.forEach((person) => updated.add(person.id));
        return updated;
      });
    }

    setSelectedAcademyIds(nextAcademyIds);
  }

  async function toggleAllAcademies() {
    if (selectedAcademyIds.size === academies.length) {
      setSelectedAcademyIds(new Set());
      setSelectedPeople(new Set());
      return;
    }

    for (const academy of academies) {
      if (!selectedAcademyIds.has(academy.id)) {
        // eslint-disable-next-line no-await-in-loop
        await toggleAcademy(academy.id);
      }
    }
  }

  function togglePerson(personId: string) {
    setSelectedPeople((current) => {
      const updated = new Set(current);
      if (updated.has(personId)) updated.delete(personId);
      else updated.add(personId);
      return updated;
    });
  }

  const visiblePeople = useMemo(() => {
    const byId = new Map<string, RecipientPerson>();
    selectedAcademyIds.forEach((academyId) => {
      (academyPeople[academyId] ?? []).forEach((person) => byId.set(person.id, person));
    });
    return [...byId.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [selectedAcademyIds, academyPeople]);

  async function handleSend() {
    if (selectedPeople.size === 0 || isSending) return;

    setIsSending(true);
    setComposeError('');

    // A conversation can only ever belong to one academy on the backend, so a
    // multi-academy pick fans out into one send per academy that actually has
    // someone selected.
    const created: { conversationId: string; asMemberId: string }[] = [];

    for (const academyId of selectedAcademyIds) {
      const people = academyPeople[academyId] ?? [];
      const ids = people.filter((person) => selectedPeople.has(person.id)).map((person) => person.id);
      if (ids.length === 0) continue;

      // eslint-disable-next-line no-await-in-loop
      const staff = await ensureStaffMember(academyId);
      if (!staff) continue;

      if (ids.length === 1) {
        // eslint-disable-next-line no-await-in-loop
        const { id } = await startDirectChat(staff, ids[0]);
        if (id) created.push({ conversationId: id, asMemberId: staff });
      } else {
        const academyName = academies.find((a) => a.id === academyId)?.name ?? '';
        // eslint-disable-next-line no-await-in-loop
        const { id } = await createGroupChat(staff, `${academyName} · ${t('inbox.customGroup')}`, ids, true);
        if (id) created.push({ conversationId: id, asMemberId: staff });
      }
    }

    setIsSending(false);

    if (created.length === 0) {
      setComposeError(t('academyChat.couldNotStart'));
      return;
    }

    closeCompose();
    loadConversations();

    if (created.length === 1) {
      router.push({
        pathname: '/academy-chat',
        params: { conversationId: created[0].conversationId, asMemberId: created[0].asMemberId },
      } as any);
    }
  }

  async function openNotice(notice: AcademyNotice) {
    if (!notice.read_at) {
      setNotices((current) =>
        current.map((n) => (n.id === notice.id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      markNoticeRead(notice.id);
    }

    if (notice.academy_id) {
      router.push({ pathname: '/academy-details', params: { academyId: notice.academy_id } } as any);
    }
  }

  const messagesUnread = conversations.reduce((sum, row) => sum + row.unread_count, 0);
  const notificationsUnread = notices.filter((notice) => !notice.read_at).length;
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleConversations = useMemo(() => {
    if (!normalizedSearch) return conversations;
    return conversations.filter((row) =>
      [row.title, row.other_names.join(', '), row.last_body]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
    );
  }, [conversations, normalizedSearch]);
  const visibleNotices = useMemo(() => {
    if (!normalizedSearch) return notices;
    return notices.filter((notice) =>
      `${notice.title} ${notice.body ?? ''}`.toLocaleLowerCase().includes(normalizedSearch)
    );
  }, [notices, normalizedSearch]);

  if (isComposing) {
    return (
      <View style={[styles.panel, fullScreen && styles.fullScreenPanel]}>
        <LinearGradient
          colors={isWeb ? ['#EAF5FC', '#F6FAFE', '#FFFFFF'] : colors.backgroundGradient}
          style={styles.panelGradient}
          pointerEvents="none"
        />
        <View style={styles.composeHeader}>
          <AnimatedPressable style={styles.iconButton} onPress={closeCompose}>
            <Ionicons name="arrow-back" size={16} color={colors.grey} />
          </AnimatedPressable>
          <Text style={styles.title}>{t('inbox.personalize')}</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          <View style={styles.composeSectionHeader}>
            <Text style={styles.composeSectionLabel}>{t('inbox.academies')}</Text>
            <AnimatedPressable style={styles.allChip} onPress={toggleAllAcademies}>
              <Text style={styles.allChipText}>{t('inbox.all')}</Text>
            </AnimatedPressable>
          </View>

          {academies.length === 0 ? (
            <Text style={styles.emptyText}>{t('academy.noAcademies')}</Text>
          ) : (
            academies.map((item) => {
              const checked = selectedAcademyIds.has(item.id);
              return (
                <AnimatedPressable key={item.id} pressedScale={0.98} onPress={() => toggleAcademy(item.id)}>
                  <View style={[styles.pickRow, checked && styles.pickRowActive]}>
                    <Ionicons name="school-outline" size={14} color={colors.blueLight} />
                    <Text style={styles.pickRowText} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Ionicons
                      name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={17}
                      color={checked ? colors.greenLight : colors.greyDark}
                    />
                  </View>
                </AnimatedPressable>
              );
            })
          )}

          {selectedAcademyIds.size > 0 ? (
            <>
              <Text style={[styles.composeSectionLabel, styles.peopleLabel]}>{t('inbox.people')}</Text>

              {visiblePeople.length === 0 ? (
                <Text style={styles.emptyText}>{t('inbox.noPeople')}</Text>
              ) : (
                visiblePeople.map((person) => {
                  const checked = selectedPeople.has(person.id);
                  return (
                    <AnimatedPressable key={person.id} pressedScale={0.98} onPress={() => togglePerson(person.id)}>
                      <View style={[styles.pickRow, checked && styles.pickRowActive]}>
                        <Ionicons name="person-outline" size={14} color={colors.greyDark} />
                        <Text style={styles.pickRowText} numberOfLines={1}>
                          {person.full_name}
                        </Text>
                        <Ionicons
                          name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                          size={17}
                          color={checked ? colors.greenLight : colors.greyDark}
                        />
                      </View>
                    </AnimatedPressable>
                  );
                })
              )}
            </>
          ) : null}

          {composeError ? <Text style={styles.errorText}>{composeError}</Text> : null}
        </ScrollView>

        <AnimatedPressable
          style={[styles.composeSubmitButton, (selectedPeople.size === 0 || isSending) && styles.composeSubmitButtonDisabled]}
          onPress={handleSend}
          disabled={selectedPeople.size === 0 || isSending}
          accessibilityRole="button"
          accessibilityState={{ disabled: selectedPeople.size === 0 || isSending }}
        >
          {isSending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.composeSubmitText}>{t('inbox.send')}</Text>}
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View style={[styles.panel, fullScreen && styles.fullScreenPanel]}>
      <LinearGradient
        colors={isWeb ? ['#EAF5FC', '#F6FAFE', '#FFFFFF'] : colors.backgroundGradient}
        style={styles.panelGradient}
        pointerEvents="none"
      />
      <Text style={styles.title}>{t('inbox.title')}</Text>
      <Text style={styles.subtitle}>{t('inbox.subtitle')}</Text>

      <View style={styles.tabRow}>
        <TabChip
          styles={styles}
          colors={colors}
          label={t('inbox.messages')}
          active={tab === 'messages'}
          count={messagesUnread}
          onPress={() => setTab('messages')}
        />
        <TabChip
          styles={styles}
          colors={colors}
          label={t('inbox.notifications')}
          active={tab === 'notifications'}
          count={notificationsUnread}
          onPress={() => setTab('notifications')}
        />
      </View>

      {tab === 'messages' ? (
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Ionicons name="search-outline" size={16} color={colors.greyDark} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('inbox.searchMessages')}
              placeholderTextColor={colors.greyDark}
              style={styles.searchInput}
              accessibilityLabel={t('inbox.searchMessages')}
              returnKeyType="search"
            />
          </View>
          <AnimatedPressable
            style={styles.composeButton}
            onPress={openCompose}
            accessibilityRole="button"
            accessibilityLabel={t('inbox.sendMessage')}
          >
            <Ionicons name="create-outline" size={17} color={colors.blueDeep} />
          </AnimatedPressable>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {tab === 'messages' ? (
          visibleConversations.length === 0 ? (
            <EmptyState styles={styles} colors={colors} icon="chatbubbles-outline" text={t('inbox.noMessages')} />
          ) : (
            visibleConversations.map((row) => {
              const title = row.kind === 'group'
                ? row.title || t('academyChat.untitledGroup')
                : row.other_names.join(', ') || t('academyChat.unknownPerson');
              const avatarUri = row.kind === 'group' ? row.image_url : row.other_avatar;
              const initials = title.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
              return (
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
                  <View style={[styles.messageRow, row.unread_count > 0 && styles.messageRowUnread]}>
                    <View style={styles.avatar}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                      ) : (
                        <Text style={styles.avatarInitials}>{initials || 'M'}</Text>
                      )}
                    </View>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
                      <Text style={styles.rowMeta} numberOfLines={2}>
                        {row.last_body || t('academyChat.noMessagesYet')}
                      </Text>
                    </View>
                    <View style={styles.messageTrailing}>
                      {row.last_at ? <Text style={styles.rowTime}>{timeAgo(row.last_at, t)}</Text> : null}
                      {row.unread_count > 0 ? (
                        <View style={styles.unreadDot}>
                          <Text style={styles.unreadText}>{row.unread_count}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </AnimatedPressable>
              );
            })
          )
        ) : visibleNotices.length === 0 ? (
          <EmptyState styles={styles} colors={colors} icon="notifications-outline" text={t('inbox.noNotifications')} />
        ) : (
          visibleNotices.map((notice) => (
            <AnimatedPressable key={notice.id} pressedScale={0.98} onPress={() => openNotice(notice)}>
              <View style={[styles.row, !notice.read_at && styles.rowUnread]}>
                <View style={styles.rowIcon}>
                  <Ionicons name={noticeIcon(notice.type)} size={16} color={colors.blueLight} />
                </View>

                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {notice.title}
                  </Text>
                  {notice.body ? (
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {notice.body}
                    </Text>
                  ) : null}
                </View>

                <Text style={styles.rowTime}>{timeAgo(notice.created_at, t)}</Text>
              </View>
            </AnimatedPressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function TabChip({
  styles,
  colors,
  label,
  active,
  count,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  label: string;
  active: boolean;
  count: number;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable style={[styles.tabChip, active && styles.tabChipActive]} onPress={onPress}>
      <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>{label}</Text>
      {count > 0 ? (
        <View style={styles.tabChipBell}>
          <Text style={styles.tabChipBellText}>{count}</Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

function EmptyState({
  styles,
  colors,
  icon,
  text,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.emptyBox}>
      <Ionicons name={icon} size={22} color={colors.greyDark} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    panel: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: INBOX_WIDTH,
      backgroundColor: colors.background,
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      paddingTop: 20,
      paddingHorizontal: 14,
      overflow: 'hidden',
      shadowColor: '#6A93AC',
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffset: { width: -5, height: 0 },
    },
    panelGradient: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    fullScreenPanel: {
      position: 'relative',
      width: '100%',
      flex: 1,
      minHeight: 0,
      borderLeftWidth: 0,
    },
    title: {
      color: colors.white,
      fontSize: scaleFont(22),
      fontWeight: '800',
      marginBottom: 3,
      marginLeft: 2,
    },
    subtitle: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '500',
      marginLeft: 2,
      marginBottom: 15,
    },
    sendMessageButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.greenLight,
      borderRadius: radius.round,
      paddingVertical: 10,
      marginBottom: spacing.md,
    },
    sendMessageButtonText: {
      color: colors.blackText,
      fontSize: scaleFont(12.5),
      fontWeight: '900',
    },
    composeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    composeSubmitButton: {
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
      backgroundColor: colors.blue,
      marginTop: 10,
    },
    composeSubmitButtonDisabled: {
      opacity: 0.45,
    },
    composeSubmitText: {
      color: '#FFFFFF',
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    composeSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    composeSectionLabel: {
      color: colors.greenLight,
      fontSize: scaleFont(11),
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    peopleLabel: {
      marginTop: spacing.md,
    },
    allChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardSoft,
    },
    allChipText: {
      color: colors.grey,
      fontSize: scaleFont(10.5),
      fontWeight: '800',
    },
    pickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.cardSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: 9,
      marginBottom: 6,
    },
    pickRowActive: {
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
    },
    pickRowText: {
      flex: 1,
      minWidth: 0,
      color: colors.white,
      fontSize: scaleFont(12.5),
      fontWeight: '700',
    },
    errorText: {
      color: colors.red,
      fontSize: scaleFont(11.5),
      fontWeight: '700',
      marginTop: spacing.sm,
    },
    tabRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    tabChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 42,
      paddingHorizontal: 7,
      paddingVertical: 7,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'rgba(255,255,255,0.84)',
    },
    tabChipActive: {
      borderColor: colors.borderBlue,
      backgroundColor: colors.blueSoft,
    },
    tabChipText: {
      color: colors.grey,
      flexShrink: 1,
      fontSize: scaleFont(11.5),
      fontWeight: '700',
    },
    tabChipTextActive: {
      color: colors.blueDeep,
    },
    tabChipBell: {
      minWidth: 16,
      height: 16,
      paddingHorizontal: 4,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.blue,
    },
    tabChipBellText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '900',
    },
    list: {
      paddingBottom: spacing.xl,
      flexGrow: 1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.cardSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.sm,
      marginBottom: 8,
    },
    rowUnread: {
      borderColor: colors.borderBlue,
      backgroundColor: colors.blueSoft,
    },
    rowIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.blueSoft,
    },
    iconButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
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
      fontSize: scaleFont(12.5),
      fontWeight: '700',
    },
    rowMeta: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '500',
      marginTop: 2,
    },
    rowTime: {
      color: colors.grey,
      fontSize: scaleFont(9.5),
      fontWeight: '600',
      textAlign: 'right',
    },
    unreadDot: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.blue,
    },
    unreadText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
    },
    emptyBox: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    emptyText: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '600',
      textAlign: 'center',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 11,
    },
    searchField: {
      flex: 1,
      minWidth: 0,
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 11,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'rgba(255,255,255,0.88)',
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      color: colors.white,
      fontSize: scaleFont(11.5),
      outlineStyle: 'none',
    } as any,
    composeButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.borderBlue,
      backgroundColor: colors.blueSoft,
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 11,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      borderRadius: 13,
      backgroundColor: 'rgba(255,255,255,0.92)',
      shadowColor: '#7C9EB2',
      shadowOpacity: 0.07,
      shadowRadius: 7,
      shadowOffset: { width: 0, height: 2 },
    },
    messageRowUnread: {
      borderColor: colors.borderBlue,
      backgroundColor: '#EFF8FE',
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.blueSoft,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarInitials: {
      color: colors.blueDeep,
      fontSize: scaleFont(11),
      fontWeight: '800',
    },
    messageTrailing: {
      minWidth: 34,
      alignItems: 'flex-end',
      gap: 6,
    },
  });
