import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  HubMatch,
  MAX_REMINDERS,
  REMINDER_OFFSETS,
  TeamDirectory,
  VenuePitch,
  fetchMatchPeople,
  fetchPitchIsFree,
  saveHubMatch,
} from '../../lib/academyHub';
import { AcademyHubLabels, fill, useAcademyHubLabels } from '../../lib/academyHubLabels';
import type { AcademyRow } from '../../lib/academyData';
import { weeklineColors as colors } from '../../theme/palettes';
import { Button, CheckRow, Chip, Dialog, ui } from './ui';

export type PublicTeam = Pick<AcademyRow, 'id' | 'name' | 'logo_url' | 'city' | 'age_group'>;

// This screen only runs on the web, where the browser's own date and time pickers work best.
const WebInput = 'input' as any;
const WebSelect = 'select' as any;
const WebOption = 'option' as any;

const webField = {
  width: '100%', height: 44, boxSizing: 'border-box', border: `1px solid ${colors.border}`, borderRadius: 8,
  background: colors.backgroundSoft, color: colors.white, padding: '0 12px', fontSize: 14.5, fontFamily: 'inherit', colorScheme: 'dark',
};

const QUARTERS = Array.from({ length: 96 }, (_, index) => index * 15);
const MAPS_LINK = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[a-z.]+|([a-z0-9-]+\.)?google\.[a-z.]+\/maps)(\/|\?|$)/i;

export function reminderLabel(l: AcademyHubLabels, offset: number) {
  return l[`r${offset}` as keyof AcademyHubLabels] ?? String(offset);
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function clock(minutes: number) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function atMinutes(day: string, minutes: number): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Math.floor(minutes / 60), minutes % 60);
}

function mapsPlaceName(link: string) {
  try {
    const url = new URL(link);
    const place = url.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
    if (place) return decodeURIComponent(place.replace(/\+/g, ' '));
    const query = url.searchParams.get('q') || url.searchParams.get('query');
    if (query && !/^[-\d.,\s]+$/.test(query)) return query;
  } catch { /* The link is validated before saving. */ }
  return 'Google Maps location';
}

type Props = {
  visible: boolean;
  /** The match being edited, or null for a new one. */
  match: HubMatch | null;
  initialAcademyId: string | null;
  academies: AcademyRow[];
  directory: TeamDirectory;
  pitches: VenuePitch[];
  publicTeams: PublicTeam[];
  onClose: () => void;
  onSaved: (result: { created: boolean; notified: number }) => void;
};

export default function MatchForm({ visible, match, initialAcademyId, academies, directory, pitches, publicTeams, onClose, onSaved }: Props) {
  const l = useAcademyHubLabels();
  const [academyId, setAcademyId] = useState('');
  const [opponent, setOpponent] = useState('');
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [placeKind, setPlaceKind] = useState<'pitch' | 'maps'>('pitch');
  const [pitchId, setPitchId] = useState<string | null>(null);
  const [mapsUrl, setMapsUrl] = useState('');
  const [day, setDay] = useState('');
  const [start, setStart] = useState(17 * 60);
  const [end, setEnd] = useState(18 * 60 + 30);
  const [kit, setKit] = useState('');
  const [notes, setNotes] = useState('');
  const [players, setPlayers] = useState<Set<string>>(new Set());
  const [coaches, setCoaches] = useState<Set<string>>(new Set());
  const [reminders, setReminders] = useState<number[]>([]);
  const [savedReminders, setSavedReminders] = useState<number[]>([]);
  const [pitchFree, setPitchFree] = useState<boolean | null>(null);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const playersOf = (id: string) => directory.players.filter((player) => player.academy_ids.includes(id));

  // Fill the form once each time it opens; later refreshes must not undo what was typed.
  useEffect(() => {
    if (!visible) return;
    let current = true;
    setError('');
    setBusy(false);
    setPitchFree(null);
    if (match) {
      const startsAt = new Date(match.starts_at);
      const endsAt = new Date(match.ends_at);
      setAcademyId(match.academy_id);
      setOpponent(match.opponent ?? '');
      setOpponentId(match.opponent_academy_id);
      setPlaceKind(match.pitch_id ? 'pitch' : 'maps');
      setPitchId(match.pitch_id);
      setMapsUrl(match.pitch_id ? '' : match.maps_url ?? '');
      setDay(dateValue(startsAt));
      const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
      setStart(startMinutes);
      setEnd(startMinutes + Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
      setKit(match.kit_color ?? '');
      setNotes(match.notes ?? '');
      setPlayers(new Set());
      setCoaches(new Set());
      setReminders([]);
      setSavedReminders([]);
      setLoadingPeople(true);
      fetchMatchPeople(match.id)
        .then((people) => {
          if (!current) return;
          const invited = new Set(people.attendees.map((row) => row.member_id));
          setPlayers(new Set(playersOf(match.academy_id).filter((player) => invited.has(player.id)).map((player) => player.id)));
          setCoaches(new Set(directory.coaches.filter((coach) => invited.has(coach.id)).map((coach) => coach.id)));
          const offsets = people.reminders.map((row) => row.offset_minutes);
          setReminders(offsets);
          setSavedReminders(offsets);
          setLoadingPeople(false);
        })
        .catch(() => { if (current) setError(l.loadError); });
    } else {
      const first = academies.find((academy) => academy.id === initialAcademyId)
        ?? academies.find((academy) => academy.is_main) ?? academies[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setAcademyId(first?.id ?? '');
      setOpponent('');
      setOpponentId(null);
      setPlaceKind(pitches.length ? 'pitch' : 'maps');
      setPitchId(pitches.length === 1 ? pitches[0].id : null);
      setMapsUrl('');
      setDay(dateValue(tomorrow));
      setStart(17 * 60);
      setEnd(18 * 60 + 30);
      setKit('');
      setNotes('');
      setPlayers(new Set(first ? playersOf(first.id).map((player) => player.id) : []));
      setCoaches(new Set());
      setReminders([]);
      setSavedReminders([]);
      setLoadingPeople(false);
    }
    return () => { current = false; };
  }, [visible, match?.id]);

  const startsAt = atMinutes(day, start);
  const endsAt = atMinutes(day, end);
  const chosenPitch = placeKind === 'pitch' ? pitchId : null;
  const startIso = startsAt?.toISOString() ?? '';
  const endIso = endsAt?.toISOString() ?? '';
  const timeChanged = !match || (!!startsAt && !!endsAt
    && (startsAt.getTime() !== new Date(match.starts_at).getTime() || endsAt.getTime() !== new Date(match.ends_at).getTime()));
  const slotChanged = timeChanged || chosenPitch !== match?.pitch_id;

  useEffect(() => {
    setPitchFree(null);
    if (!visible || !chosenPitch || !startIso || !endIso || endIso <= startIso) return;
    let current = true;
    const timer = setTimeout(() => {
      fetchPitchIsFree(chosenPitch, startIso, endIso, match?.id ?? null)
        .then((free) => { if (current) setPitchFree(free); })
        .catch(() => { /* Saving checks the pitch again. */ });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [visible, chosenPitch, startIso, endIso, match?.id]);

  const academy = academies.find((row) => row.id === academyId) ?? null;
  const roster = playersOf(academyId);
  const coachList = useMemo(
    () => directory.coaches
      .filter((coach) => coach.status === 'active' || coaches.has(coach.id))
      .sort((a, b) => Number(b.academy_ids.includes(academyId)) - Number(a.academy_ids.includes(academyId))),
    [directory.coaches, academyId, coaches]
  );
  const query = opponent.trim().toLocaleLowerCase();
  const suggestions = query && !opponentId
    ? publicTeams.filter((team) => team.id !== academyId && `${team.name} ${team.city ?? ''}`.toLocaleLowerCase().includes(query)).slice(0, 5)
    : [];

  const reminderPassed = (offset: number) => !startsAt || startsAt.getTime() - offset * 60000 <= Date.now();
  const activeReminders = reminders.filter((offset) => savedReminders.includes(offset) || !reminderPassed(offset));

  function chooseAcademy(id: string) {
    setAcademyId(id);
    setPlayers(new Set(playersOf(id).map((player) => player.id)));
    if (opponentId === id) { setOpponentId(null); setOpponent(''); }
  }

  function toggle(set: Set<string>, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }

  async function save() {
    if (busy || loadingPeople) return;
    const link = mapsUrl.trim();
    if (!academy) { setError(l.needAcademy); return; }
    if (!opponent.trim()) { setError(l.needOpponent); return; }
    if (placeKind === 'maps' && link && !MAPS_LINK.test(link)) { setError(l.mapsInvalid); return; }
    if (!startsAt || !endsAt || endsAt <= startsAt) { setError(l.needTime); return; }
    if (timeChanged && startsAt.getTime() <= Date.now()) { setError(l.needFuture); return; }
    if (chosenPitch && slotChanged && pitchFree === false) { setError(l.pitchBusy); return; }
    setBusy(true);
    setError('');
    try {
      const result = await saveHubMatch({
        sessionId: match?.id ?? null,
        academyId: academy.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        pitchId: chosenPitch,
        locationName: chosenPitch ? null : link ? (link === match?.maps_url ? match.location_name : mapsPlaceName(link)) : match && !match.pitch_id && !match.maps_url ? match.location_name : null,
        mapsUrl: chosenPitch ? null : link || null,
        opponent,
        opponentAcademyId: opponentId,
        kitColor: kit,
        notes,
        playerIds: roster.filter((player) => players.has(player.id)).map((player) => player.id),
        coachIds: [...coaches],
        reminders: activeReminders,
      });
      onSaved({ created: !match, notified: result.notified });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : l.loadError);
    } finally {
      setBusy(false);
    }
  }

  const selectedPlayers = roster.filter((player) => players.has(player.id)).length;
  const endOptions = Array.from(new Set([...Array.from({ length: 32 }, (_, index) => start + (index + 1) * 15), end]))
    .filter((minutes) => minutes > start && minutes <= 24 * 60)
    .sort((a, b) => a - b);
  const startOptions = Array.from(new Set([...QUARTERS, start])).sort((a, b) => a - b);

  return (
    <Dialog
      visible={visible}
      title={match ? l.editMatch : l.newMatch}
      subtitle={l.matchIntro}
      onClose={onClose}
      closeLabel={l.close}
      width={920}
      footer={(
        <View style={styles.footer}>
          {error ? <Text style={[ui.error, styles.footerError]} accessibilityRole="alert">{error}</Text> : <View style={styles.footerError} />}
          <Button tone="outline" label={l.cancel} onPress={onClose} />
          <Button label={match ? l.saveChanges : l.saveMatch} icon="calendar" busy={busy} disabled={loadingPeople} onPress={() => { void save(); }} />
        </View>
      )}
    >
      <View style={styles.columns}>
        <View style={styles.column}>
          <View>
            <Text style={ui.label}>{l.yourTeam}</Text>
            <View style={ui.chipRow}>
              {(match ? academies.filter((row) => row.id === match.academy_id) : academies).map((row) => (
                <Chip key={row.id} icon="shield-outline" label={row.name} active={row.id === academyId} onPress={() => { if (!match) chooseAcademy(row.id); }} />
              ))}
            </View>
          </View>

          <View>
            <Text style={ui.label}>{l.opponent}</Text>
            <TextInput
              value={opponent}
              onChangeText={(value) => { setOpponent(value); setOpponentId(null); }}
              style={ui.input}
              placeholder={l.opponentPlaceholder}
              placeholderTextColor={colors.greyDark}
              accessibilityLabel={l.opponent}
              maxLength={120}
            />
            {suggestions.length ? (
              <View style={styles.suggestions}>
                {suggestions.map((team) => (
                  <Pressable key={team.id} onPress={() => { setOpponent(team.name); setOpponentId(team.id); }} accessibilityRole="button" style={({ hovered }: any) => [styles.suggestion, hovered && styles.suggestionHovered]}>
                    {team.logo_url ? <Image source={{ uri: team.logo_url }} style={styles.crest} resizeMode="contain" /> : <View style={styles.crestFallback}><Ionicons name="shield-outline" size={16} color={colors.blueLight} /></View>}
                    <View style={ui.flexText}>
                      <Text style={ui.rowTitle} numberOfLines={1}>{team.name}</Text>
                      <Text style={ui.rowHint} numberOfLines={1}>{[team.age_group, team.city].filter(Boolean).join(' · ') || l.opponentOnMypitch}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={18} color={colors.blueLight} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {query ? <Text style={[opponentId ? ui.success : ui.hint, styles.under]}>{opponentId ? l.opponentOnMypitch : l.opponentTyped}</Text> : null}
          </View>

          <View style={styles.group}>
            <Text style={[ui.label, styles.noMargin]}>{l.place}</Text>
            <View style={ui.chipRow}>
              <Chip icon="football-outline" label={l.ownPitch} active={placeKind === 'pitch'} onPress={() => setPlaceKind('pitch')} />
              <Chip icon="location-outline" label={l.mapsPlace} active={placeKind === 'maps'} onPress={() => setPlaceKind('maps')} />
            </View>
            {placeKind === 'pitch' ? (
              pitches.length === 0 ? <Text style={ui.hint}>{l.noOwnPitch}</Text> : (
                <>
                  <View style={ui.chipRow}>
                    {pitches.map((pitch) => <Chip key={pitch.id} label={pitch.name} active={pitchId === pitch.id} onPress={() => setPitchId(pitchId === pitch.id ? null : pitch.id)} />)}
                  </View>
                  {chosenPitch && pitchFree !== null ? (
                    <Text style={pitchFree || !slotChanged ? ui.success : ui.error}>{pitchFree || !slotChanged ? l.pitchFree : l.pitchBusy}</Text>
                  ) : null}
                  <Text style={ui.hint}>{l.pitchBlocks}</Text>
                </>
              )
            ) : (
              <TextInput value={mapsUrl} onChangeText={setMapsUrl} style={ui.input} placeholder={l.mapsPlaceholder} placeholderTextColor={colors.greyDark} accessibilityLabel={l.mapsPlace} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            )}
          </View>

          <View style={styles.timeRow}>
            <View style={styles.dateField}>
              <Text style={ui.label}>{l.date}</Text>
              <WebInput type="date" aria-label={l.date} value={day} min={match ? undefined : dateValue(new Date())} onChange={(event: any) => setDay(event.target.value)} style={webField} />
            </View>
            <View style={styles.timeField}>
              <Text style={ui.label}>{l.startTime}</Text>
              <WebSelect aria-label={l.startTime} value={start} onChange={(event: any) => { const next = Number(event.target.value); setEnd(Math.min(24 * 60, next + Math.max(15, end - start))); setStart(next); }} style={webField}>
                {startOptions.map((minutes) => <WebOption key={minutes} value={minutes}>{clock(minutes)}</WebOption>)}
              </WebSelect>
            </View>
            <View style={styles.timeField}>
              <Text style={ui.label}>{l.endTime}</Text>
              <WebSelect aria-label={l.endTime} value={end} onChange={(event: any) => setEnd(Number(event.target.value))} style={webField}>
                {endOptions.map((minutes) => <WebOption key={minutes} value={minutes}>{clock(minutes)}</WebOption>)}
              </WebSelect>
            </View>
          </View>

          <View>
            <Text style={ui.label}>{l.kit}</Text>
            <TextInput value={kit} onChangeText={setKit} style={ui.input} placeholder={l.kitPlaceholder} placeholderTextColor={colors.greyDark} accessibilityLabel={l.kit} maxLength={60} />
          </View>
          <View>
            <Text style={ui.label}>{l.notes}</Text>
            <TextInput value={notes} onChangeText={setNotes} style={[ui.input, ui.textArea]} multiline placeholder={l.notesPlaceholder} placeholderTextColor={colors.greyDark} accessibilityLabel={l.notes} maxLength={1000} />
          </View>
        </View>

        <View style={styles.column}>
          <Text style={ui.cardTitle}>{l.who}</Text>
          {loadingPeople ? <ActivityIndicator color={colors.blueLight} /> : null}
          <View style={styles.group}>
            <View style={styles.listHeader}>
              <Text style={[ui.label, styles.listTitle]}>{l.players} · {fill(l.selected, { count: selectedPlayers })}</Text>
              {roster.length ? (
                <>
                  <Button small tone="outline" label={l.selectAll} disabled={selectedPlayers === roster.length} onPress={() => setPlayers(new Set(roster.map((player) => player.id)))} />
                  <Button small tone="outline" label={l.deselectAll} disabled={selectedPlayers === 0} onPress={() => setPlayers(new Set())} />
                </>
              ) : null}
            </View>
            {roster.length ? (
              <ScrollView nestedScrollEnabled style={styles.list} contentContainerStyle={styles.listContent}>
                {roster.map((player) => <CheckRow key={player.id} label={player.full_name} checked={players.has(player.id)} onPress={() => setPlayers((current) => toggle(current, player.id))} />)}
              </ScrollView>
            ) : <Text style={ui.hint}>{l.noAcademyPlayers}</Text>}
          </View>

          <View style={styles.group}>
            <View style={styles.listHeader}>
              <Text style={[ui.label, styles.listTitle]}>{l.coaches} · {fill(l.selected, { count: coaches.size })}</Text>
              {coachList.length ? (
                <>
                  <Button small tone="outline" label={l.selectAll} disabled={coachList.every((coach) => coaches.has(coach.id))} onPress={() => setCoaches(new Set(coachList.map((coach) => coach.id)))} />
                  <Button small tone="outline" label={l.deselectAll} disabled={coaches.size === 0} onPress={() => setCoaches(new Set())} />
                </>
              ) : null}
            </View>
            {coachList.length ? (
              <ScrollView nestedScrollEnabled style={styles.list} contentContainerStyle={styles.listContent}>
                {coachList.map((coach) => <CheckRow key={coach.id} label={coach.full_name} hint={coach.academy_ids.includes(academyId) ? l.assignedCoach : undefined} checked={coaches.has(coach.id)} onPress={() => setCoaches((current) => toggle(current, coach.id))} />)}
              </ScrollView>
            ) : <Text style={ui.hint}>{l.noOwnerCoaches}</Text>}
          </View>

          <View style={styles.group}>
            <Text style={[ui.label, styles.noMargin]}>{l.reminders}</Text>
            <Text style={ui.hint}>{l.remindersHint}</Text>
            <View style={ui.chipRow}>
              {REMINDER_OFFSETS.map((offset) => {
                const active = activeReminders.includes(offset);
                return (
                  <Chip
                    key={offset}
                    icon={active ? 'notifications' : undefined}
                    label={reminderLabel(l, offset)}
                    active={active}
                    disabled={!active && (activeReminders.length >= MAX_REMINDERS || reminderPassed(offset))}
                    onPress={() => setReminders(active ? activeReminders.filter((value) => value !== offset) : [...activeReminders, offset])}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 22 },
  column: { flexGrow: 1, flexShrink: 1, flexBasis: 340, minWidth: 0, gap: 16 },
  group: { gap: 9 },
  noMargin: { marginBottom: 0 },
  under: { marginTop: 6 },
  suggestions: { marginTop: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: colors.backgroundSoft },
  suggestionHovered: { backgroundColor: colors.blueSoft },
  crest: { width: 28, height: 28 },
  crestFallback: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dateField: { flexGrow: 1, flexShrink: 1, flexBasis: 170 },
  timeField: { flexGrow: 1, flexShrink: 1, flexBasis: 100 },
  listHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  listTitle: { flexGrow: 1, marginBottom: 0 },
  list: { maxHeight: 238, flexGrow: 0 },
  listContent: { gap: 6 },
  footer: { flexGrow: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 9 },
  footerError: { flexGrow: 1, flexShrink: 1, flexBasis: 200 },
});
