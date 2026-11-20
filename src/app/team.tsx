import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import ConfirmDialog from '../components/ConfirmDialog';
import Screen from '../components/Screen';
import { useTranslation } from '../i18n/LanguageContext';
import { STAFF_ASSIGNABLE_TABS, useAuth } from '../lib/auth';
import {
  StaffInvite,
  StaffMember,
  createStaffInvite,
  fetchPendingStaffInvites,
  fetchStaffMembers,
  revokeStaffInvite,
  staffAccountAction,
  staffInviteLink,
  updateStaffTabs,
} from '../lib/staffData';
import { weeklineColors as colors } from '../theme/palettes';

type PendingAction = { kind: 'remove' | 'deactivate'; member: StaffMember } | null;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function TeamScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isStaff } = useAuth();

  const [members, setMembers] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [email, setEmail] = useState('');
  const [tabs, setTabs] = useState<string[]>(['agenda']);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [sentLink, setSentLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const load = useCallback(async () => {
    try {
      const [staff, pendingInvites] = await Promise.all([fetchStaffMembers(), fetchPendingStaffInvites()]);
      setMembers(staff);
      setInvites(pendingInvites);
      setLoadError('');
    } catch (error) {
      console.error('[team] load failed:', error);
      setLoadError(t('team.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isStaff) load();
  }, [isStaff, load]);

  // Staff cannot manage the team. AppGate also keeps them off this route.
  if (isStaff) return null;

  function toggleTab(list: string[], tab: string): string[] {
    return list.includes(tab) ? list.filter((item) => item !== tab) : [...list, tab];
  }

  async function sendInvite() {
    setFormError('');
    setNotice('');
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(cleanEmail)) { setFormError(t('team.invalidEmail')); return; }
    if (tabs.length === 0) { setFormError(t('team.chooseOne')); return; }
    setSending(true);
    try {
      const token = await createStaffInvite(tabs, cleanEmail);
      setSentTo(cleanEmail);
      setSentLink(staffInviteLink(token));
      setCopied(false);
      setEmail('');
      setTabs(['agenda']);
      await load();
    } catch (error) {
      setFormError(error instanceof Error && error.message ? error.message : t('team.actionError'));
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(sentLink);
        setCopied(true);
      }
    } catch {
      setCopied(false);
    }
  }

  async function run(id: string, task: () => Promise<void>, success?: string) {
    setActionError('');
    setNotice('');
    setBusyId(id);
    try {
      await task();
      await load();
      if (success) setNotice(success);
    } catch (error) {
      console.error('[team] action failed:', error);
      setActionError(error instanceof Error && error.message ? error.message : t('team.actionError'));
    } finally {
      setBusyId(null);
    }
  }

  function changeMemberTab(member: StaffMember, tab: string) {
    run(member.id, () => updateStaffTabs(member.id, toggleTab(member.allowed_tabs, tab)), t('team.saved'));
  }

  const dialogMember = pending?.member;
  const dialogName = dialogMember?.full_name || dialogMember?.email || t('team.unnamed');

  return (
    <Screen maxWidth={920} ambientGlows={false} contentStyle={styles.content}>
      <View style={styles.stack}>
      <View style={styles.heading}>
        <Pressable style={styles.back} onPress={() => router.replace('/profile' as any)} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={colors.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('team.title')}</Text>
          <Text style={styles.subtitle}>{t('team.subtitle')}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('team.inviteTitle')}</Text>

        <Text style={styles.label}>{t('team.emailLabel')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('team.emailPlaceholder')}
          placeholderTextColor={colors.greyDark}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          style={styles.input}
          accessibilityLabel={t('team.emailLabel')}
        />

        <Text style={styles.label}>{t('team.accessLabel')}</Text>
        <TabChips selected={tabs} onToggle={(tab) => setTabs((list) => toggleTab(list, tab))} />
        <Text style={styles.hint}>{t('team.accessHint')}</Text>

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <Pressable style={[styles.primaryButton, sending && styles.disabled]} onPress={sendInvite} disabled={sending} accessibilityRole="button">
          {sending ? <ActivityIndicator size="small" color={colors.blackText} /> : <Ionicons name="paper-plane-outline" size={16} color={colors.blackText} />}
          <Text style={styles.primaryButtonText}>{sending ? t('team.sending') : t('team.sendInvite')}</Text>
        </Pressable>

        {sentLink ? (
          <View style={styles.sentBox}>
            <Text style={styles.sentTitle}>{t('team.inviteSent').replace('{email}', sentTo)}</Text>
            <Text style={styles.hint}>{t('team.inviteLinkHint')}</Text>
            <View style={styles.linkRow}>
              <Text style={styles.linkText} numberOfLines={1} selectable>{sentLink}</Text>
              <Pressable style={styles.outlineButton} onPress={copyLink} accessibilityRole="button">
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color={colors.white} />
                <Text style={styles.buttonText}>{copied ? t('team.copied') : t('team.copyLink')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      {invites.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('team.pendingTitle')}</Text>
          {invites.map((invite) => (
            <View key={invite.id} style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{invite.invited_email || t('team.anyoneWithLink')}</Text>
                <Text style={styles.rowMeta}>
                  {invite.allowed_tabs.map((tab) => t(`nav.${tab}`)).join(', ')}  ·  {t('team.expires').replace('{date}', new Date(invite.expires_at).toLocaleDateString())}
                </Text>
              </View>
              <Pressable
                style={[styles.outlineButton, busyId === invite.id && styles.disabled]}
                disabled={busyId === invite.id}
                onPress={() => run(invite.id, () => revokeStaffInvite(invite.id))}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>{t('team.revoke')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('team.staffTitle')}</Text>
        {loading ? <ActivityIndicator color={colors.blueLight} style={{ marginVertical: 12 }} /> : null}
        {!loading && members.length === 0 ? <Text style={styles.hint}>{t('team.noStaff')}</Text> : null}
        {members.map((member) => {
          const active = member.status === 'active';
          const busy = busyId === member.id;
          return (
            <View key={member.id} style={[styles.memberBlock, busy && styles.disabled]}>
              <View style={styles.memberHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{member.full_name || t('team.unnamed')}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>{member.email}</Text>
                </View>
                <Text style={[styles.badge, active ? styles.badgeActive : styles.badgeOff]}>
                  {active ? t('team.active') : t('team.inactive')}
                </Text>
              </View>

              <TabChips selected={member.allowed_tabs} onToggle={(tab) => changeMemberTab(member, tab)} disabled={busy} />

              <View style={styles.memberActions}>
                <Pressable
                  style={styles.outlineButton}
                  disabled={busy}
                  onPress={() => active
                    ? setPending({ kind: 'deactivate', member })
                    : run(member.id, () => staffAccountAction(member.id, 'activate'), t('team.saved'))}
                  accessibilityRole="button"
                >
                  <Ionicons name={active ? 'pause-circle-outline' : 'play-circle-outline'} size={16} color={colors.white} />
                  <Text style={styles.buttonText}>{active ? t('team.deactivate') : t('team.activate')}</Text>
                </Pressable>
                <Pressable style={[styles.outlineButton, styles.dangerButton]} disabled={busy} onPress={() => setPending({ kind: 'remove', member })} accessibilityRole="button">
                  <Ionicons name="trash-outline" size={16} color={colors.red} />
                  <Text style={[styles.buttonText, { color: colors.red }]}>{t('team.remove')}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      <ConfirmDialog
        visible={pending !== null}
        title={pending?.kind === 'remove' ? t('team.removeTitle') : t('team.deactivateTitle')}
        message={(pending?.kind === 'remove' ? t('team.removeBody') : t('team.deactivateBody')).replace('{name}', dialogName)}
        onDismiss={() => setPending(null)}
        actions={[
          { label: t('team.cancel'), tone: 'cancel' },
          {
            label: pending?.kind === 'remove' ? t('team.remove') : t('team.deactivate'),
            tone: 'destructive',
            onPress: () => {
              const current = pending;
              setPending(null);
              if (!current) return;
              run(
                current.member.id,
                () => staffAccountAction(current.member.id, current.kind === 'remove' ? 'delete' : 'deactivate'),
                t('team.saved')
              );
            },
          },
        ]}
      />
      </View>
    </Screen>
  );
}

function TabChips({ selected, onToggle, disabled = false }: { selected: string[]; onToggle: (tab: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.chips}>
      {STAFF_ASSIGNABLE_TABS.map((tab) => {
        const on = selected.includes(tab);
        return (
          <Pressable
            key={tab}
            disabled={disabled}
            onPress={() => onToggle(tab)}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={16} color={on ? colors.blueLight : colors.greyDark} />
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(`nav.${tab}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 60 },
  stack: { gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  back: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: colors.grey, fontSize: 14, marginTop: 4, lineHeight: 20 },
  card: { padding: 18, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  cardTitle: { color: colors.white, fontSize: 18, fontWeight: '800', marginBottom: 12 },
  label: { color: colors.greySoft, fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 6 },
  input: { minHeight: 43, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft, color: colors.white, fontSize: 15 },
  hint: { color: colors.grey, fontSize: 12, lineHeight: 18, marginTop: 8 },
  error: { color: colors.red, fontSize: 13, marginTop: 10 },
  notice: { color: colors.greenLight, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft },
  chipOn: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
  chipText: { color: colors.grey, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: colors.white },
  primaryButton: { minHeight: 42, marginTop: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 9, backgroundColor: colors.blueLight, alignSelf: 'flex-start' },
  primaryButtonText: { color: colors.blackText, fontSize: 14, fontWeight: '800' },
  outlineButton: { minHeight: 38, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.backgroundSoft },
  dangerButton: { borderColor: colors.red },
  buttonText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  sentBox: { marginTop: 16, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.blueSoft },
  sentTitle: { color: colors.white, fontSize: 14, fontWeight: '700' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  linkText: { flex: 1, minWidth: 0, color: colors.blueLight, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  rowTitle: { color: colors.white, fontSize: 15, fontWeight: '700' },
  rowMeta: { color: colors.grey, fontSize: 12, marginTop: 3 },
  memberBlock: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.borderSoft, gap: 12 },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { fontSize: 12, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  badgeActive: { color: colors.greenLight, backgroundColor: colors.greenSoft },
  badgeOff: { color: colors.grey, backgroundColor: colors.backgroundSoft },
});
