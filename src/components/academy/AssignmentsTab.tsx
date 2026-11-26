import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  DirectoryCoach,
  DirectoryParent,
  DirectoryPlayer,
  TeamDirectory,
  assignToAcademy,
  parentJoinLink,
  removeFromAcademy,
} from '../../lib/academyHub';
import { fill, useAcademyHubLabels } from '../../lib/academyHubLabels';
import { AcademyRow, ageFromDateOfBirth, respondToEnrolment } from '../../lib/academyData';
import { weeklineColors as colors } from '../../theme/palettes';
import { Button, Card, CheckBox, CheckRow, Chip, Dialog, Empty, Initials, SearchBox, ui } from './ui';

export type PeopleKind = 'players' | 'coaches' | 'parents';

const ALL = 'all';
const NONE = 'none';

type Person = DirectoryPlayer | DirectoryParent | DirectoryCoach;

type Props = {
  academies: AcademyRow[];
  directory: TeamDirectory;
  loading: boolean;
  /** Which list to open on, when another tab sends the owner here. */
  initialKind: PeopleKind;
  canInvite: boolean;
  onInviteCoach: (academyId: string | null) => void;
  onChanged: () => Promise<void>;
};

export default function AssignmentsTab({ academies, directory, loading, initialKind, canInvite, onInviteCoach, onChanged }: Props) {
  const l = useAcademyHubLabels();
  const wide = useWindowDimensions().width >= 1100;
  const [kind, setKind] = useState<PeopleKind>(initialKind);
  const [academyFilter, setAcademyFilter] = useState<string>(ALL);
  const [academySearch, setAcademySearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Person | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyRequest, setBusyRequest] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { setKind(initialKind); }, [initialKind]);
  useEffect(() => { setTicked(new Set()); setError(''); setNotice(''); }, [kind, academyFilter]);

  const academyById = useMemo(() => new Map(academies.map((academy) => [academy.id, academy])), [academies]);
  const playerById = useMemo(() => new Map(directory.players.map((player) => [player.id, player])), [directory.players]);
  const parentById = useMemo(() => new Map(directory.parents.map((parent) => [parent.id, parent])), [directory.parents]);
  const people: Person[] = directory[kind];

  const countFor = (academyId: string) => people.filter((person) => person.academy_ids.includes(academyId)).length;
  const unassignedCount = people.filter((person) => person.academy_ids.length === 0).length;

  useEffect(() => {
    if (academyFilter === NONE && unassignedCount === 0) setAcademyFilter(ALL);
    if (academyFilter !== ALL && academyFilter !== NONE && !academyById.has(academyFilter)) setAcademyFilter(ALL);
  }, [academyFilter, unassignedCount, academyById]);

  const academyQuery = academySearch.trim().toLocaleLowerCase();
  const shownAcademies = academies.filter((academy) => !academyQuery
    || `${academy.name} ${academy.city ?? ''} ${academy.age_group ?? ''}`.toLocaleLowerCase().includes(academyQuery));
  const nameQuery = nameSearch.trim().toLocaleLowerCase();
  const shown = people.filter((person) => {
    if (academyFilter === NONE && person.academy_ids.length > 0) return false;
    if (academyFilter !== ALL && academyFilter !== NONE && !person.academy_ids.includes(academyFilter)) return false;
    return !nameQuery || person.full_name.toLocaleLowerCase().includes(nameQuery);
  });

  const requests = [...directory.players, ...directory.parents].flatMap((person) =>
    person.pending.map((request) => ({ ...request, name: person.full_name })))
    .filter((request) => academyFilter === ALL || academyFilter === NONE || request.academy_id === academyFilter);

  const assignable = kind !== 'parents';
  const allTicked = shown.length > 0 && shown.every((person) => ticked.has(person.id));

  function toggleTick(id: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openAssign(person: Person) {
    setEditing(person);
    setDraft(new Set(person.academy_ids));
    setConfirmRemove(false);
    setError('');
  }

  async function saveAssignments() {
    if (!editing || busy) return;
    const isPlayer = kind === 'players';
    // A player removed from every academy leaves the sports centre for good, so ask first.
    if (isPlayer && draft.size === 0 && editing.academy_ids.length > 0 && !confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      // Add before removing, so someone being moved never drops out in between.
      for (const academyId of draft) {
        if (!editing.academy_ids.includes(academyId)) await assignToAcademy(editing.id, academyId);
      }
      for (const academyId of editing.academy_ids) {
        if (!draft.has(academyId)) await removeFromAcademy(editing.id, academyId);
      }
      setEditing(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : l.loadError);
    } finally {
      await onChanged();
      setBusy(false);
    }
  }

  async function bulkAdd(academyId: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      for (const person of people) {
        if (ticked.has(person.id) && !person.academy_ids.includes(academyId)) await assignToAcademy(person.id, academyId);
      }
      setBulkOpen(false);
      setTicked(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : l.loadError);
    } finally {
      await onChanged();
      setBusy(false);
    }
  }

  async function answerRequest(enrolmentId: string, approve: boolean) {
    setBusyRequest(enrolmentId);
    setError('');
    const { error: answerError } = await respondToEnrolment(enrolmentId, approve);
    if (answerError) setError(answerError.message);
    await onChanged();
    setBusyRequest('');
  }

  async function copyParentLink() {
    const target = academyById.get(academyFilter) ?? academies.find((academy) => academy.is_main) ?? academies[0];
    if (!target) return;
    await Clipboard.setStringAsync(parentJoinLink(target.invite_token));
    setNotice(fill(l.parentLinkCopied, { academy: target.name }));
  }

  function detailLine(person: Person) {
    if (kind === 'players') {
      const player = person as DirectoryPlayer;
      const age = ageFromDateOfBirth(player.date_of_birth);
      const parents = player.parent_ids.map((id) => parentById.get(id)?.full_name).filter(Boolean).join(', ');
      return [age === null ? null : fill(l.years, { count: age }), parents ? fill(l.parentsOf, { names: parents }) : null].filter(Boolean).join(' · ');
    }
    if (kind === 'coaches') {
      const coach = person as DirectoryCoach;
      return [coach.email, coach.status === 'active' ? null : l.coachInactive].filter(Boolean).join(' · ');
    }
    const parent = person as DirectoryParent;
    const children = parent.child_ids.map((id) => playerById.get(id)?.full_name).filter(Boolean).join(', ');
    return [children ? fill(l.childrenOf, { names: children }) : null, parent.phone, parent.email, parent.has_account ? l.appAccount : l.noAppAccount].filter(Boolean).join(' · ');
  }

  const emptyText = people.length === 0
    ? kind === 'players' ? l.noPlayers : kind === 'coaches' ? l.noCoaches : l.noParents
    : l.nothingFound;

  const filters = [
    { id: ALL, label: l.allAcademies, count: people.length },
    ...shownAcademies.map((academy) => ({ id: academy.id, label: academy.name, count: countFor(academy.id) })),
    ...(unassignedCount > 0 ? [{ id: NONE, label: l.unassigned, count: unassignedCount }] : []),
  ];

  return (
    <View style={[styles.layout, wide && styles.layoutWide]}>
      <Card style={wide ? styles.sidebar : undefined}>
        <Text style={ui.cardTitle}>{l.academies}</Text>
        <SearchBox value={academySearch} onChangeText={setAcademySearch} placeholder={l.searchAcademy} />
        <View style={wide ? styles.filterColumn : ui.chipRow}>
          {filters.map((filter) => wide ? (
            <Pressable
              key={filter.id}
              onPress={() => setAcademyFilter(filter.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: academyFilter === filter.id }}
              style={({ hovered }: any) => [styles.filterRow, academyFilter === filter.id && styles.filterRowActive, hovered && ui.buttonHovered]}
            >
              <Ionicons name={filter.id === ALL ? 'albums-outline' : filter.id === NONE ? 'help-circle-outline' : 'school-outline'} size={16} color={academyFilter === filter.id ? colors.blueLight : colors.grey} />
              <Text style={[styles.filterLabel, academyFilter === filter.id && styles.filterLabelActive]} numberOfLines={2}>{filter.label}</Text>
              <Text style={styles.filterCount}>{filter.count}</Text>
            </Pressable>
          ) : (
            <Chip key={filter.id} label={filter.label} count={filter.count} active={academyFilter === filter.id} onPress={() => setAcademyFilter(filter.id)} />
          ))}
        </View>
      </Card>

      <View style={styles.main}>
        {requests.length > 0 ? (
          <Card style={styles.requests}>
            <Text style={ui.cardTitle}>{l.requests} ({requests.length})</Text>
            {requests.map((request) => (
              <View key={request.enrolment_id} style={styles.requestRow}>
                <Text style={[ui.rowTitle, styles.requestText]}>{fill(l.requestFor, { name: request.name, academy: academyById.get(request.academy_id)?.name ?? '' })}</Text>
                <Button small label={l.approve} icon="checkmark" busy={busyRequest === request.enrolment_id} disabled={!!busyRequest} onPress={() => { void answerRequest(request.enrolment_id, true); }} />
                <Button small tone="outline" label={l.decline} disabled={!!busyRequest} onPress={() => { void answerRequest(request.enrolment_id, false); }} />
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <View style={styles.toolbar}>
            <View style={ui.chipRow}>
              <Chip icon="people-outline" label={l.players} count={directory.players.length} active={kind === 'players'} onPress={() => setKind('players')} />
              <Chip icon="person-outline" label={l.coaches} count={directory.coaches.length} active={kind === 'coaches'} onPress={() => setKind('coaches')} />
              <Chip icon="people-circle-outline" label={l.parents} count={directory.parents.length} active={kind === 'parents'} onPress={() => setKind('parents')} />
            </View>
            <View style={styles.toolbarSpacer} />
            {kind === 'coaches'
              ? canInvite ? <Button small label={l.inviteCoach} icon="person-add-outline" onPress={() => onInviteCoach(academyById.has(academyFilter) ? academyFilter : null)} /> : null
              : <Button small tone="outline" label={l.parentLink} icon="link-outline" onPress={() => { void copyParentLink(); }} />}
          </View>

          <SearchBox value={nameSearch} onChangeText={setNameSearch} placeholder={kind === 'players' ? l.searchPlayer : l.searchPerson} />
          {notice ? <Text style={ui.success}>{notice}</Text> : null}
          {error && !editing && !bulkOpen ? <Text style={ui.error}>{error}</Text> : null}

          {assignable && shown.length > 0 ? (
            <View style={styles.bulkBar}>
              <Button small tone="outline" label={allTicked ? l.deselectAll : l.selectAll} onPress={() => setTicked(allTicked ? new Set() : new Set(shown.map((person) => person.id)))} />
              {ticked.size > 0 ? (
                <>
                  <Text style={ui.hint}>{fill(l.selected, { count: ticked.size })}</Text>
                  <Button small label={l.bulkAdd} icon="add" onPress={() => { setError(''); setBulkOpen(true); }} />
                </>
              ) : null}
            </View>
          ) : null}

          {loading && people.length === 0 ? <ActivityIndicator color={colors.blueLight} style={styles.loading} /> : shown.length === 0 ? (
            <Empty icon="people-outline" text={emptyText} />
          ) : (
            <View>
              {shown.map((person) => (
                <View key={person.id} style={styles.personRow}>
                  {assignable ? (
                    <Pressable onPress={() => toggleTick(person.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: ticked.has(person.id) }} accessibilityLabel={person.full_name}>
                      <CheckBox checked={ticked.has(person.id)} />
                    </Pressable>
                  ) : null}
                  <Initials name={person.full_name} tone={kind === 'coaches' ? 'orange' : 'blue'} />
                  <View style={styles.personText}>
                    <Text style={ui.rowTitle} numberOfLines={1}>{person.full_name}</Text>
                    {detailLine(person) ? <Text style={ui.rowHint} numberOfLines={2}>{detailLine(person)}</Text> : null}
                    <View style={styles.tags}>
                      {person.academy_ids.length === 0 ? <Text style={[styles.tag, styles.tagEmpty]}>{l.noneAssigned}</Text> : person.academy_ids.map((id) => (
                        <Text key={id} style={styles.tag} numberOfLines={1}>{academyById.get(id)?.name ?? '—'}</Text>
                      ))}
                    </View>
                  </View>
                  {assignable ? <Button small tone="outline" label={l.assign} icon="create-outline" onPress={() => openAssign(person)} /> : null}
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>

      <Dialog
        visible={!!editing}
        title={confirmRemove ? l.removeLastTitle : fill(l.assignTitle, { name: editing?.full_name ?? '' })}
        subtitle={confirmRemove ? undefined : l.assignHint}
        onClose={() => setEditing(null)}
        closeLabel={l.close}
        footer={(
          <>
            <Button tone="outline" label={l.cancel} onPress={() => (confirmRemove ? setConfirmRemove(false) : setEditing(null))} />
            <Button tone={confirmRemove ? 'danger' : 'primary'} label={confirmRemove ? l.removeLast : l.save} busy={busy} onPress={() => { void saveAssignments(); }} />
          </>
        )}
      >
        {confirmRemove ? <Text style={ui.hint}>{fill(l.removeLastBody, { name: editing?.full_name ?? '' })}</Text> : academies.map((academy) => (
          <CheckRow
            key={academy.id}
            label={academy.name}
            hint={[academy.age_group, academy.city].filter(Boolean).join(' · ') || undefined}
            checked={draft.has(academy.id)}
            onPress={() => setDraft((current) => {
              const next = new Set(current);
              if (next.has(academy.id)) next.delete(academy.id); else next.add(academy.id);
              return next;
            })}
          />
        ))}
        {error ? <Text style={ui.error}>{error}</Text> : null}
      </Dialog>

      <Dialog
        visible={bulkOpen}
        title={fill(l.bulkAddTitle, { count: ticked.size })}
        onClose={() => setBulkOpen(false)}
        closeLabel={l.close}
        footer={<Button tone="outline" label={l.cancel} onPress={() => setBulkOpen(false)} />}
      >
        {academies.map((academy) => (
          <Button key={academy.id} tone="outline" icon="add" label={academy.name} disabled={busy} onPress={() => { void bulkAdd(academy.id); }} />
        ))}
        {busy ? <ActivityIndicator color={colors.blueLight} /> : null}
        {error ? <Text style={ui.error}>{error}</Text> : null}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { width: '100%', gap: 14 },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  sidebar: { width: 290 },
  filterColumn: { gap: 4 },
  filterRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  filterRowActive: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
  filterLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 0, color: colors.greySoft, fontSize: 13.5, fontWeight: '600' },
  filterLabelActive: { color: colors.white },
  filterCount: { color: colors.grey, fontSize: 12.5, fontWeight: '700' },
  main: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, gap: 14 },
  requests: { borderColor: colors.orange },
  requestRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  requestText: { flexGrow: 1, flexShrink: 1, flexBasis: 220 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  toolbarSpacer: { flexGrow: 1 },
  bulkBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  loading: { marginVertical: 28 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  personText: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  tag: { maxWidth: '100%', color: colors.blueLight, backgroundColor: colors.blueSoft, fontSize: 11.5, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, overflow: 'hidden' },
  tagEmpty: { color: colors.grey, backgroundColor: colors.backgroundSoft },
});
