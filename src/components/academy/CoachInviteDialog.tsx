import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { createCoachInvite } from '../../lib/academyHub';
import { fill, useAcademyHubLabels } from '../../lib/academyHubLabels';
import type { AcademyRow } from '../../lib/academyData';
import { weeklineColors as colors } from '../../theme/palettes';
import { Button, Chip, Dialog, ui } from './ui';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function CoachInviteDialog({ visible, academies, initialAcademyId, onClose }: {
  visible: boolean;
  academies: AcademyRow[];
  initialAcademyId: string | null;
  onClose: () => void;
}) {
  const l = useAcademyHubLabels();
  const [email, setEmail] = useState('');
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEmail(''); setAcademyId(initialAcademyId); setBusy(false); setError(''); setLink(''); setSentTo(''); setCopied(false);
  }, [visible, initialAcademyId]);

  async function create() {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && !EMAIL_PATTERN.test(cleanEmail)) { setError(l.invalidEmail); return; }
    setBusy(true);
    setError('');
    try {
      setLink(await createCoachInvite(academyId, cleanEmail));
      setSentTo(cleanEmail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : l.loadError);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await Clipboard.setStringAsync(link);
    setCopied(true);
  }

  return (
    <Dialog
      visible={visible}
      title={l.inviteTitle}
      subtitle={l.inviteIntro}
      onClose={onClose}
      closeLabel={l.close}
      footer={link ? (
        <>
          <Button label={l.close} tone="outline" onPress={onClose} />
          <Button label={copied ? l.copied : l.copy} icon={copied ? 'checkmark' : 'copy-outline'} onPress={copy} />
        </>
      ) : (
        <>
          <Button label={l.cancel} tone="outline" onPress={onClose} />
          <Button label={l.inviteCreate} icon="link-outline" onPress={create} busy={busy} />
        </>
      )}
    >
      {link ? (
        <>
          <Text style={ui.success}>{sentTo ? fill(l.inviteSent, { email: sentTo }) : l.inviteReady}</Text>
          <Text selectable style={[ui.input, { paddingVertical: 12, color: colors.blueLight, fontSize: 12.5 }]}>{link}</Text>
          {sentTo ? <Text style={ui.hint}>{l.inviteReady}</Text> : null}
        </>
      ) : (
        <>
          <View>
            <Text style={ui.label}>{l.inviteEmail}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={ui.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="coach@example.com"
              placeholderTextColor={colors.greyDark}
              accessibilityLabel={l.inviteEmail}
            />
            <Text style={[ui.hint, { marginTop: 6 }]}>{l.inviteEmailHint}</Text>
          </View>
          <View>
            <Text style={ui.label}>{l.inviteAcademy}</Text>
            <View style={ui.chipRow}>
              <Chip label={l.inviteNoAcademy} active={academyId === null} onPress={() => setAcademyId(null)} />
              {academies.map((academy) => <Chip key={academy.id} label={academy.name} active={academyId === academy.id} onPress={() => setAcademyId(academy.id)} />)}
            </View>
          </View>
          {error ? <Text style={ui.error}>{error}</Text> : null}
        </>
      )}
    </Dialog>
  );
}
