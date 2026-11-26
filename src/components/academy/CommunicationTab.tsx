import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import {
  CoachContact,
  SentAnnouncement,
  TeamDirectory,
  fetchAnnouncements,
  fetchCoachContacts,
  openCoachChat,
  sendAnnouncement,
} from '../../lib/academyHub';
import { fill, useAcademyHubLabels } from '../../lib/academyHubLabels';
import { ChatMessage, fetchMessages, markConversationRead, sendMessage, subscribeToConversation } from '../../lib/academyChat';
import type { AcademyRow } from '../../lib/academyData';
import { useAcademyRealtime } from '../../lib/academyRealtime';
import { supabase } from '../../lib/supabase';
import { weeklineColors as colors } from '../../theme/palettes';
import { useViewportHeight } from '../../theme/contentZoom';
import { Button, Card, CheckRow, Chip, Empty, Initials, SearchBox, ui } from './ui';

export type CommunicationView = 'chat' | 'parents';

const ALL = 'all';

type Props = {
  ownerId: string;
  academies: AcademyRow[];
  directory: TeamDirectory;
  /** Which half to open on, when another tab sends the owner here. */
  initialView: CommunicationView;
};

export default function CommunicationTab({ ownerId, academies, directory, initialView }: Props) {
  const l = useAcademyHubLabels();
  const [view, setView] = useState<CommunicationView>(initialView);
  useEffect(() => { setView(initialView); }, [initialView]);

  return (
    <View style={styles.page}>
      <View style={ui.chipRow}>
        <Chip icon="chatbubbles-outline" label={l.coachChat} active={view === 'chat'} onPress={() => setView('chat')} />
        <Chip icon="megaphone-outline" label={l.announcements} active={view === 'parents'} onPress={() => setView('parents')} />
      </View>
      {view === 'chat' ? <CoachChat ownerId={ownerId} /> : <ParentMessage academies={academies} directory={directory} />}
    </View>
  );
}

function CoachChat({ ownerId }: { ownerId: string }) {
  const l = useAcademyHubLabels();
  const { messagesVersion } = useAcademyRealtime();
  const wide = useWindowDimensions().width >= 900;
  const viewportHeight = useViewportHeight();
  const [contacts, setContacts] = useState<CoachContact[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const thread = useRef<any>(null);

  const active = contacts?.find((contact) => contact.member_id === activeId) ?? null;
  const contactName = (contact: CoachContact) => (contact.role === 'office' ? l.officeName : contact.full_name);

  const loadContacts = useCallback(async () => {
    try {
      setContacts(await fetchCoachContacts(ownerId));
    } catch (caught) {
      setContacts((current) => current ?? []);
      setError(caught instanceof Error ? caught.message : l.loadError);
    }
  }, [ownerId]);

  useEffect(() => { void loadContacts(); }, [loadContacts, messagesVersion]);

  async function open(contact: CoachContact) {
    if (contact.member_id === activeId) return;
    setActiveId(contact.member_id);
    setConversationId(null);
    setMessages(null);
    setDraft('');
    setError('');
    try {
      setConversationId(contact.conversation_id ?? await openCoachChat(ownerId, contact.member_id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : l.loadError);
      setMessages([]);
    }
  }

  const myMemberId = active?.my_member_id ?? null;

  useEffect(() => {
    if (!conversationId || !myMemberId) return;
    let current = true;
    const add = (rows: ChatMessage[]) => {
      if (!current) return;
      setMessages((existing) => {
        const byId = new Map([...(existing ?? []), ...rows].map((row) => [row.id, row]));
        return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    };
    const read = () => { void markConversationRead(myMemberId, conversationId).then(() => loadContacts()); };
    const channel = subscribeToConversation(conversationId, (message) => { add([message]); if (message.sender_id !== myMemberId) read(); });
    fetchMessages(conversationId).then((rows) => { add(rows); read(); });
    return () => { current = false; void supabase.removeChannel(channel); };
  }, [conversationId, myMemberId]);

  async function send() {
    const body = draft.trim();
    if (!body || !conversationId || !myMemberId || sending) return;
    setSending(true);
    setError('');
    const { error: sendError } = await sendMessage(conversationId, myMemberId, body);
    if (sendError) {
      setError(l.sendFailed);
    } else {
      setDraft('');
      setMessages(await fetchMessages(conversationId));
      void loadContacts();
    }
    setSending(false);
  }

  const height = Math.max(420, viewportHeight - 300);
  const showList = wide || !active;
  const showThread = wide || !!active;

  if (contacts === null) return <Card><ActivityIndicator color={colors.blueLight} style={styles.loading} /></Card>;
  if (contacts.length === 0) return <Card>{error ? <Text style={ui.error}>{error}</Text> : <Empty icon="chatbubbles-outline" text={l.noCoachContacts} />}</Card>;

  return (
    <View style={[styles.chat, wide && styles.chatWide]}>
      {showList ? (
        <Card style={[styles.contacts, wide && { width: 310, height }]}>
          <ScrollView contentContainerStyle={styles.contactList}>
            {contacts.map((contact) => (
              <Pressable
                key={contact.member_id}
                onPress={() => { void open(contact); }}
                accessibilityRole="button"
                accessibilityState={{ selected: contact.member_id === activeId }}
                style={({ hovered }: any) => [styles.contact, contact.member_id === activeId && styles.contactActive, hovered && ui.buttonHovered]}
              >
                <Initials name={contactName(contact)} tone={contact.role === 'office' ? 'blue' : 'orange'} />
                <View style={ui.flexText}>
                  <Text style={ui.rowTitle} numberOfLines={1}>{contactName(contact)}</Text>
                  <Text style={ui.rowHint} numberOfLines={1}>{contact.last_body || (contact.role === 'office' ? l.officeName : l.coachRole)}</Text>
                </View>
                {contact.unread_count > 0 ? <Text style={styles.unread}>{contact.unread_count}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Card>
      ) : null}

      {showThread ? (
        <Card style={[styles.thread, { height }]}>
          {!active ? <Empty icon="chatbubble-ellipses-outline" text={l.chooseContact} /> : (
            <>
              <View style={styles.threadHeader}>
                {wide ? null : <Button small tone="outline" icon="chevron-back" label={l.back} onPress={() => setActiveId(null)} />}
                <Initials size={32} name={contactName(active)} tone={active.role === 'office' ? 'blue' : 'orange'} />
                <Text style={[ui.cardTitle, ui.flexText]} numberOfLines={1}>{contactName(active)}</Text>
              </View>
              <ScrollView ref={thread} style={styles.messages} contentContainerStyle={styles.messagesContent} onContentSizeChange={() => thread.current?.scrollToEnd({ animated: false })}>
                {messages === null ? <ActivityIndicator color={colors.blueLight} style={styles.loading} /> : messages.length === 0 ? <Empty icon="chatbubbles-outline" text={l.noMessages} /> : messages.map((message) => {
                  const mine = message.sender_id === myMemberId;
                  return (
                    <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                      <Text selectable style={[styles.bubbleText, mine && styles.mineText]}>{message.body}</Text>
                      <Text style={[styles.bubbleTime, mine && styles.mineTime]}>{new Date(message.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
                    </View>
                  );
                })}
              </ScrollView>
              {error ? <Text style={ui.error}>{error}</Text> : null}
              <View style={styles.composer}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={() => { void send(); }}
                  blurOnSubmit={false}
                  style={[ui.input, styles.composerInput]}
                  placeholder={l.typeMessage}
                  placeholderTextColor={colors.greyDark}
                  accessibilityLabel={l.typeMessage}
                  maxLength={4000}
                />
                <Button label={l.send} icon="send" busy={sending} disabled={!draft.trim() || !conversationId} onPress={() => { void send(); }} />
              </View>
            </>
          )}
        </Card>
      ) : null}
    </View>
  );
}

function ParentMessage({ academies, directory }: { academies: AcademyRow[]; directory: TeamDirectory }) {
  const l = useAcademyHubLabels();
  const wide = useWindowDimensions().width >= 1100;
  const [filter, setFilter] = useState(ALL);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<SentAnnouncement[] | null>(null);

  const academyIds = academies.map((academy) => academy.id);
  const academyKey = academyIds.join(',');

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchAnnouncements(academyKey ? academyKey.split(',') : []));
    } catch {
      setHistory([]);
    }
  }, [academyKey]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Only parents with an approved place in an academy can be written to.
  const parents = directory.parents.filter((parent) => parent.academy_ids.length > 0);
  const playerById = new Map(directory.players.map((player) => [player.id, player]));
  const query = search.trim().toLocaleLowerCase();
  const childNames = (ids: string[]) => ids.map((id) => playerById.get(id)?.full_name).filter(Boolean).join(', ');
  const shown = parents
    .filter((parent) => filter === ALL || parent.academy_ids.includes(filter))
    .filter((parent) => !query || `${parent.full_name} ${childNames(parent.child_ids)}`.toLocaleLowerCase().includes(query));
  const recipients = parents.filter((parent) => selected.has(parent.id)).map((parent) => parent.id);
  const allShown = shown.length > 0 && shown.every((parent) => selected.has(parent.id));
  const noneShown = shown.every((parent) => !selected.has(parent.id));

  function setShown(on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      shown.forEach((parent) => { if (on) next.add(parent.id); else next.delete(parent.id); });
      return next;
    });
  }

  async function send() {
    if (busy) return;
    setNotice('');
    if (!subject.trim()) { setError(l.needSubject); return; }
    if (!content.trim()) { setError(l.needMessage); return; }
    if (!recipients.length) { setError(l.needRecipients); return; }
    const home = academies.find((academy) => academy.id === filter) ?? academies.find((academy) => academy.is_main) ?? academies[0];
    if (!home) return;
    setBusy(true);
    setError('');
    try {
      await sendAnnouncement({ academyId: home.id, academyIds, subject, content, recipientIds: recipients });
      setNotice(fill(l.sentOk, { count: recipients.length }));
      setSubject('');
      setContent('');
      setSelected(new Set());
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : l.loadError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.parents, wide && styles.parentsWide]}>
      <Card style={wide ? styles.parentColumn : undefined}>
        <Text style={ui.cardTitle}>{l.recipients} · {fill(l.selected, { count: recipients.length })}</Text>
        {academies.length > 1 ? (
          <View>
            <Text style={ui.label}>{l.filterAcademy}</Text>
            <View style={ui.chipRow}>
              <Chip label={l.allAcademies} active={filter === ALL} onPress={() => setFilter(ALL)} />
              {academies.map((academy) => <Chip key={academy.id} label={academy.name} active={filter === academy.id} onPress={() => setFilter(academy.id)} />)}
            </View>
          </View>
        ) : null}
        <SearchBox value={search} onChangeText={setSearch} placeholder={l.searchPerson} />
        {parents.length === 0 ? <Empty icon="people-circle-outline" text={l.noParents} /> : (
          <>
            <View style={ui.chipRow}>
              <Button small tone="outline" label={l.selectAll} disabled={shown.length === 0 || allShown} onPress={() => setShown(true)} />
              <Button small tone="outline" label={l.deselectAll} disabled={noneShown} onPress={() => setShown(false)} />
            </View>
            {shown.length === 0 ? <Text style={ui.hint}>{l.nothingFound}</Text> : (
              <ScrollView nestedScrollEnabled style={styles.parentList} contentContainerStyle={styles.parentListContent}>
                {shown.map((parent) => (
                  <CheckRow
                    key={parent.id}
                    label={parent.full_name}
                    hint={[
                      parent.child_ids.length ? fill(l.childrenOf, { names: childNames(parent.child_ids) }) : null,
                      parent.has_account ? null : l.noAppAccount,
                    ].filter(Boolean).join(' · ') || undefined}
                    checked={selected.has(parent.id)}
                    onPress={() => setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(parent.id)) next.delete(parent.id); else next.add(parent.id);
                      return next;
                    })}
                  />
                ))}
              </ScrollView>
            )}
          </>
        )}
      </Card>

      <View style={[styles.parentColumn, !wide && styles.parentColumnStacked]}>
        <Card>
          <Text style={ui.cardTitle}>{l.announcements}</Text>
          <View>
            <Text style={ui.label}>{l.subject}</Text>
            <TextInput value={subject} onChangeText={setSubject} style={ui.input} placeholder={l.subjectPlaceholder} placeholderTextColor={colors.greyDark} accessibilityLabel={l.subject} maxLength={140} />
          </View>
          <View>
            <Text style={ui.label}>{l.message}</Text>
            <TextInput value={content} onChangeText={setContent} style={[ui.input, ui.textArea, styles.message]} multiline placeholder={l.messagePlaceholder} placeholderTextColor={colors.greyDark} accessibilityLabel={l.message} maxLength={4000} />
          </View>
          {error ? <Text style={ui.error}>{error}</Text> : null}
          {notice ? <Text style={ui.success}>{notice}</Text> : null}
          <Button label={fill(l.sendTo, { count: recipients.length })} icon="send" busy={busy} onPress={() => { void send(); }} />
        </Card>

        <Card>
          <Text style={ui.cardTitle}>{l.history}</Text>
          {history === null ? <ActivityIndicator color={colors.blueLight} /> : history.length === 0 ? <Text style={ui.hint}>{l.noHistory}</Text> : history.map((item) => (
            <View key={item.id} style={styles.sent}>
              <Text style={ui.rowTitle} numberOfLines={1}>{item.subject}</Text>
              <Text style={ui.rowHint} numberOfLines={3}>{item.content}</Text>
              <Text style={styles.sentMeta}>{new Date(item.sent_at ?? item.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {fill(l.recipientsCount, { count: item.recipient_count })}</Text>
            </View>
          ))}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', gap: 14 },
  loading: { marginVertical: 28 },
  chat: { gap: 14 },
  chatWide: { flexDirection: 'row', alignItems: 'flex-start' },
  contacts: { padding: 8 },
  contactList: { gap: 4 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  contactActive: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
  unread: { minWidth: 22, textAlign: 'center', color: colors.blackText, backgroundColor: colors.blueLight, borderRadius: 11, overflow: 'hidden', fontSize: 11.5, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 3 },
  thread: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
  threadHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  messages: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  messagesContent: { gap: 8, paddingVertical: 4 },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.blueLight },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.cardSoft },
  bubbleText: { color: colors.white, fontSize: 14.5, lineHeight: 20 },
  mineText: { color: colors.blackText },
  bubbleTime: { color: colors.grey, fontSize: 10.5, marginTop: 3, alignSelf: 'flex-end' },
  mineTime: { color: colors.blackText, opacity: 0.7 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  composerInput: { flexGrow: 1, flexShrink: 1, flexBasis: 0, width: 'auto', minWidth: 0 },
  parents: { gap: 14 },
  parentsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  parentColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 14 },
  parentColumnStacked: { flexBasis: 'auto' },
  parentList: { maxHeight: 420, flexGrow: 0 },
  parentListContent: { gap: 6 },
  message: { minHeight: 130 },
  sent: { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  sentMeta: { color: colors.greyDark, fontSize: 11.5, marginTop: 5 },
});
