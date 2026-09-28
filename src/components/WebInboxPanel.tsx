import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AnimatedPressable from './AnimatedPressable';
import { useTranslation } from '../i18n/LanguageContext';
import { Conversation, collapseToOnePerConversation, fetchConversations } from '../lib/academyChat';
import { AcademyNotice, fetchNotices, markNoticeRead } from '../lib/academyNotices';
import { useAcademyRealtime } from '../lib/academyRealtime';
import { INBOX_WIDTH } from '../theme/breakpoints';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/layout';
import { scaleFont } from '../theme/typography';

type InboxTab = 'messages' | 'notifications';

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
export default function WebInboxPanel() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { unread, messagesVersion } = useAcademyRealtime();

  const [tab, setTab] = useState<InboxTab>('messages');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notices, setNotices] = useState<AcademyNotice[]>([]);

  const loadConversations = useCallback(async () => {
    const rows = collapseToOnePerConversation(await fetchConversations());
    setConversations(rows.filter((row) => row.kind === 'direct' || row.message_count > 0));
  }, []);

  const loadNotices = useCallback(async () => {
    setNotices(await fetchNotices());
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations, messagesVersion]);

  useEffect(() => {
    loadNotices();
    // `unread` gets a new object on every notifications-table change, which
    // is exactly when the notices list itself needs reloading too.
  }, [loadNotices, unread]);

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

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{t('inbox.title')}</Text>

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {tab === 'messages' ? (
          conversations.length === 0 ? (
            <EmptyState styles={styles} colors={colors} icon="chatbubbles-outline" text={t('inbox.noMessages')} />
          ) : (
            conversations.map((row) => (
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
                      size={16}
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
            ))
          )
        ) : notices.length === 0 ? (
          <EmptyState styles={styles} colors={colors} icon="notifications-outline" text={t('inbox.noNotifications')} />
        ) : (
          notices.map((notice) => (
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
      backgroundColor: colors.card,
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      paddingTop: spacing.xl,
      paddingHorizontal: spacing.md,
    },
    title: {
      color: colors.white,
      fontSize: scaleFont(15),
      fontWeight: '900',
      marginBottom: spacing.md,
      marginLeft: spacing.xs,
    },
    tabRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    tabChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 8,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardSoft,
    },
    tabChipActive: {
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
    },
    tabChipText: {
      color: colors.grey,
      fontSize: scaleFont(12),
      fontWeight: '800',
    },
    tabChipTextActive: {
      color: colors.greenLight,
    },
    tabChipBell: {
      minWidth: 16,
      height: 16,
      paddingHorizontal: 4,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.greenLight,
    },
    tabChipBellText: {
      color: colors.blackText,
      fontSize: 9,
      fontWeight: '900',
    },
    list: {
      paddingBottom: spacing.xl,
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
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
    },
    rowIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
    rowInfo: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      color: colors.white,
      fontSize: scaleFont(13),
      fontWeight: '800',
    },
    rowMeta: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '600',
      marginTop: 2,
    },
    rowTime: {
      color: colors.greyDark,
      fontSize: scaleFont(10),
      fontWeight: '700',
    },
    unreadDot: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.greenLight,
    },
    unreadText: {
      color: colors.blackText,
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
  });
