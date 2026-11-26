import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { HubMatch, MatchPeople, TeamDirectory, VenuePitch, fetchMatchPeople, setMatchCancelled } from '../../lib/academyHub';
import { useAcademyHubLabels } from '../../lib/academyHubLabels';
import { AcademyRow, updateSessionResult } from '../../lib/academyData';
import { weeklineColors as colors } from '../../theme/palettes';
import MatchForm, { PublicTeam, reminderLabel } from './MatchForm';
import { Button, Card, Chip, Dialog, Empty, Initials, SearchBox, ui } from './ui';

/** Something another tab asked this one to open. */
export type MatchIntent =
  | { type: 'create'; academyId: string | null }
  | { type: 'open'; matchId: string }
  | { type: 'result'; matchId: string }
  | { type: 'past' };

type Period = 'upcoming' | 'past' | 'cancelled';

const ALL = 'all';

type Props = {
  academies: AcademyRow[];
  directory: TeamDirectory;
  pitches: VenuePitch[];
  publicTeams: PublicTeam[];
  matches: HubMatch[];
  loading: boolean;
  intent: MatchIntent | null;
  onIntentHandled: () => void;
  onChanged: () => Promise<void>;
};

export default function MatchesTab({ academies, directory, pitches, publicTeams, matches, loading, intent, onIntentHandled, onChanged }: Props) {
  const l = useAcademyHubLabels();
  const phone = useWindowDimensions().width < 768;
  const [period, setPeriod] = useState<Period>('upcoming');
  const [academyFilter, setAcademyFilter] = useState(ALL);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HubMatch | null>(null);
  const [formAcademy, setFormAcademy] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [people, setPeople] = useState<MatchPeople | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const academyById = useMemo(() => new Map(academies.map((academy) => [academy.id, academy])), [academies]);
  const nameById = useMemo(
    () => new Map([...directory.players, ...directory.coaches].map((person) => [person.id, person.full_name])),
    [directory]
  );
  const coachIds = useMemo(() => new Set(directory.coaches.map((coach) => coach.id)), [directory.coaches]);

  const details = matches.find((match) => match.id === detailsId) ?? null;
  const resultMatch = matches.find((match) => match.id === resultId) ?? null;
  const periodOf = (match: HubMatch): Period => match.is_cancelled ? 'cancelled' : new Date(match.ends_at).getTime() < Date.now() ? 'past' : 'upcoming';

  const filtered = matches.filter((match) => academyFilter === ALL || match.academy_id === academyFilter);
  const query = search.trim().toLocaleLowerCase();
  const shown = filtered
    .filter((match) => periodOf(match) === period)
    .filter((match) => !query || [match.opponent, match.location_name, match.title, academyById.get(match.academy_id)?.name]
      .some((part) => part?.toLocaleLowerCase().includes(query)));
  if (period !== 'upcoming') shown.reverse();

  function openCreate(academyId: string | null) {
    setNotice('');
    setEditing(null);
    setFormAcademy(academyId ?? (academyFilter === ALL ? null : academyFilter));
    setFormOpen(true);
  }

  function openResult(match: HubMatch) {
    setDetailsId(null);
    setError('');
    setHomeScore(match.home_score == null ? '' : String(match.home_score));
    setAwayScore(match.away_score == null ? '' : String(match.away_score));
    setResultId(match.id);
  }

  useEffect(() => {
    if (!intent) return;
    if (intent.type === 'create') {
      openCreate(intent.academyId);
    } else if (intent.type === 'past') {
      setPeriod('past');
    } else {
      const match = matches.find((row) => row.id === intent.matchId);
      if (!match) return;
      setPeriod(periodOf(match));
      if (intent.type === 'result') openResult(match);
      else setDetailsId(match.id);
    }
    onIntentHandled();
  }, [intent, matches]);

  useEffect(() => {
    setPeople(null);
    setConfirmCancel(false);
    if (!detailsId) return;
    setError('');
    let current = true;
    fetchMatchPeople(detailsId)
      .then((value) => { if (current) setPeople(value); })
      .catch(() => { if (current) setError(l.loadError); });
    return () => { current = false; };
  }, [detailsId, details?.starts_at, details?.is_cancelled]);

  async function changeCancelled(match: HubMatch, cancelled: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await setMatchCancelled(match.id, cancelled);
      await onChanged();
      setDetailsId(null);
      setPeriod(cancelled ? 'cancelled' : 'upcoming');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : l.loadError);
    } finally {
      setBusy(false);
    }
  }

  async function saveResult() {
    if (!resultMatch || busy) return;
    if (!/^\d{1,2}$/.test(homeScore.trim()) || !/^\d{1,2}$/.test(awayScore.trim())) { setError(l.resultInvalid); return; }
    setBusy(true);
    setError('');
    const { error: saveError } = await updateSessionResult(resultMatch.id, Number(homeScore), Number(awayScore));
    if (saveError) setError(saveError.message);
    else { await onChanged(); setResultId(null); }
    setBusy(false);
  }

  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const teamName = (match: HubMatch) => match.title?.trim() || academyById.get(match.academy_id)?.name || '';

  const attendees = people?.attendees ?? [];
  const playerRows = attendees.filter((row) => !coachIds.has(row.member_id) && nameById.has(row.member_id));
  const coachRows = attendees.filter((row) => coachIds.has(row.member_id));

  function attendeeList(title: string, rows: MatchPeople['attendees']) {
    return (
      <View style={styles.group}>
        <Text style={[ui.label, styles.noMargin]}>{title} ({rows.length})</Text>
        {rows.length === 0 ? <Text style={ui.hint}>{l.noneSelected}</Text> : rows.map((row) => (
          <View key={row.member_id} style={styles.attendee}>
            <Initials size={28} name={nameById.get(row.member_id) ?? '?'} tone={coachIds.has(row.member_id) ? 'orange' : 'blue'} />
            <Text style={[ui.rowTitle, ui.flexText]} numberOfLines={1}>{nameById.get(row.member_id)}</Text>
            <Text style={[styles.response, row.response === 'going' && styles.going, row.response === 'not_going' && styles.notGoing]}>
              {row.response === 'going' ? l.going : row.response === 'not_going' ? l.notGoing : l.invited}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  function fact(icon: keyof typeof Ionicons.glyphMap, text: string) {
    return (
      <View style={styles.fact}>
        <Ionicons name={icon} size={16} color={colors.blueLight} />
        <Text style={[styles.factText, ui.flexText]}>{text}</Text>
      </View>
    );
  }

  const detailsPeriod = details ? periodOf(details) : 'upcoming';
  const detailsStarted = !!details && new Date(details.starts_at).getTime() <= Date.now();

  return (
    <View style={styles.layout}>
      <Card>
        <View style={styles.toolbar}>
          <View style={ui.chipRow}>
            {(['upcoming', 'past', 'cancelled'] as Period[]).map((value) => (
              <Chip key={value} label={l[value]} count={filtered.filter((match) => periodOf(match) === value).length} active={period === value} onPress={() => setPeriod(value)} />
            ))}
          </View>
          <View style={styles.spacer} />
          <Button label={l.createMatch} icon="add" onPress={() => openCreate(null)} style={phone && styles.fullWidth} />
        </View>
        {academies.length > 1 ? (
          <View style={ui.chipRow}>
            <Chip label={l.allAcademies} active={academyFilter === ALL} onPress={() => setAcademyFilter(ALL)} />
            {academies.map((academy) => <Chip key={academy.id} icon="shield-outline" label={academy.name} active={academyFilter === academy.id} onPress={() => setAcademyFilter(academy.id)} />)}
          </View>
        ) : null}
        <SearchBox value={search} onChangeText={setSearch} placeholder={l.searchMatch} />
        {notice ? <Text style={ui.success}>{notice}</Text> : null}

        {loading && matches.length === 0 ? <ActivityIndicator color={colors.blueLight} style={styles.loading} /> : shown.length === 0 ? (
          <Empty icon="trophy-outline" text={query ? l.nothingFound : period === 'upcoming' ? l.noUpcoming : period === 'past' ? l.noPast : l.noCancelled} />
        ) : (
          <View>
            {shown.map((match) => {
              const date = new Date(match.starts_at);
              const hasScore = match.home_score != null && match.away_score != null;
              return (
                <View key={match.id} style={styles.matchRow}>
                  <Pressable onPress={() => setDetailsId(match.id)} accessibilityRole="button" style={({ hovered, pressed }: any) => [styles.matchMain, hovered && ui.buttonHovered, pressed && ui.pressed]}>
                    <View style={styles.dateBlock}>
                      <Text style={styles.dateDay}>{date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</Text>
                      <Text style={styles.dateDate}>{date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }).toUpperCase()}</Text>
                      <Text style={styles.dateTime}>{timeLabel(match.starts_at)}</Text>
                    </View>
                    <View style={ui.flexText}>
                      <Text style={ui.rowTitle} numberOfLines={2}>{teamName(match)} <Text style={styles.versus}>vs</Text> {match.opponent || '—'}</Text>
                      <Text style={ui.rowHint} numberOfLines={1}>{[match.location_name, match.kit_color].filter(Boolean).join(' · ') || '—'}</Text>
                      {match.pitch_id ? <Text style={styles.homeTag}>{l.homePitch}</Text> : null}
                    </View>
                    {hasScore ? <Text style={styles.score}>{match.home_score} : {match.away_score}</Text> : null}
                    {/* The "Enter result" button takes the arrow's place. */}
                    {period === 'past' && !hasScore ? null : <Ionicons name="chevron-forward" size={17} color={colors.grey} />}
                  </Pressable>
                  {period === 'past' && !hasScore ? <Button small tone="outline" label={l.enterResult} onPress={() => openResult(match)} style={styles.resultButton} /> : null}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <MatchForm
        visible={formOpen}
        match={editing}
        initialAcademyId={formAcademy}
        academies={academies}
        directory={directory}
        pitches={pitches}
        publicTeams={publicTeams}
        onClose={() => setFormOpen(false)}
        onSaved={({ created, notified }) => {
          setFormOpen(false);
          setNotice(created ? l.created : notified > 0 ? l.updatedNotified : l.updated);
          setPeriod('upcoming');
          void onChanged();
        }}
      />

      <Dialog
        visible={!!details}
        title={confirmCancel ? l.cancelTitle : details ? `${teamName(details)} vs ${details.opponent || '—'}` : l.details}
        subtitle={confirmCancel ? undefined : l.details}
        onClose={() => setDetailsId(null)}
        closeLabel={l.close}
        width={560}
        footer={details ? confirmCancel ? (
          <>
            <Button tone="outline" label={l.keepMatch} onPress={() => setConfirmCancel(false)} />
            <Button tone="danger" label={l.cancelMatch} busy={busy} onPress={() => { void changeCancelled(details, true); }} />
          </>
        ) : detailsPeriod === 'cancelled' ? (
          detailsStarted ? undefined : <Button label={l.restoreMatch} icon="refresh" busy={busy} onPress={() => { void changeCancelled(details, false); }} />
        ) : detailsStarted ? (
          <Button label={l.enterResult} icon="trophy-outline" onPress={() => openResult(details)} />
        ) : (
          <>
            <Button tone="danger" label={l.cancelMatch} onPress={() => setConfirmCancel(true)} />
            <Button label={l.edit} icon="create-outline" onPress={() => { setNotice(''); setEditing(details); setFormOpen(true); setDetailsId(null); }} />
          </>
        ) : undefined}
      >
        {!details ? null : confirmCancel ? <Text style={ui.hint}>{l.cancelBody}</Text> : (
          <>
            {details.home_score != null && details.away_score != null ? <Text style={styles.bigScore}>{details.home_score} : {details.away_score}</Text> : null}
            <View style={styles.group}>
              {fact('calendar-outline', `${dayLabel(details.starts_at)}, ${timeLabel(details.starts_at)} – ${timeLabel(details.ends_at)}`)}
              {fact('location-outline', details.location_name || '—')}
              {details.maps_url ? <Button small tone="outline" icon="map-outline" label={l.openMaps} onPress={() => { void Linking.openURL(details.maps_url!); }} style={styles.mapsButton} /> : null}
              {details.kit_color ? fact('shirt-outline', details.kit_color) : null}
              {details.notes ? fact('document-text-outline', details.notes) : null}
            </View>
            {error ? <Text style={ui.error}>{error}</Text> : null}
            {!people ? (error ? null : <ActivityIndicator color={colors.blueLight} />) : (
              <>
                {people.reminders.length ? (
                  <View style={styles.group}>
                    <Text style={[ui.label, styles.noMargin]}>{l.reminders}</Text>
                    {people.reminders.map((reminder) => (
                      <View key={reminder.offset_minutes}>
                        {fact(reminder.sent_at && !reminder.skipped ? 'checkmark-done-outline' : 'notifications-outline',
                          `${reminderLabel(l, reminder.offset_minutes)}${reminder.sent_at ? ` · ${reminder.skipped ? l.reminderPassed : l.reminderSent}` : ''}`)}
                      </View>
                    ))}
                  </View>
                ) : null}
                {attendeeList(l.players, playerRows)}
                {attendeeList(l.coaches, coachRows)}
              </>
            )}
          </>
        )}
      </Dialog>

      <Dialog
        visible={!!resultMatch}
        title={l.enterResult}
        subtitle={resultMatch ? `${teamName(resultMatch)} vs ${resultMatch.opponent || '—'}` : undefined}
        onClose={() => setResultId(null)}
        closeLabel={l.close}
        width={420}
        footer={(
          <>
            <Button tone="outline" label={l.cancel} onPress={() => setResultId(null)} />
            <Button label={l.save} busy={busy} onPress={() => { void saveResult(); }} />
          </>
        )}
      >
        <View style={styles.scoreRow}>
          {[{ label: resultMatch ? teamName(resultMatch) : '', value: homeScore, set: setHomeScore }, { label: resultMatch?.opponent ?? '', value: awayScore, set: setAwayScore }].map((side, index) => (
            <View key={index} style={styles.scoreSide}>
              <Text style={[ui.label, styles.centred]} numberOfLines={2}>{side.label}</Text>
              <TextInput value={side.value} onChangeText={side.set} keyboardType="number-pad" maxLength={2} style={[ui.input, styles.scoreInput]} accessibilityLabel={side.label} />
            </View>
          ))}
        </View>
        {error ? <Text style={ui.error}>{error}</Text> : null}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { width: '100%' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  spacer: { flexGrow: 1 },
  fullWidth: { width: '100%' },
  loading: { marginVertical: 28 },
  matchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  matchMain: { flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 4 },
  dateBlock: { width: 66, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: colors.blueSoft },
  dateDay: { color: colors.grey, fontSize: 10.5, fontWeight: '700' },
  dateDate: { color: colors.white, fontSize: 13, fontWeight: '800' },
  dateTime: { color: colors.blueLight, fontSize: 12.5, fontWeight: '700' },
  versus: { color: colors.grey, fontWeight: '500' },
  homeTag: { alignSelf: 'flex-start', marginTop: 5, color: colors.blueLight, backgroundColor: colors.blueSoft, fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
  score: { color: colors.white, fontSize: 19, fontWeight: '800' },
  resultButton: { marginLeft: 'auto' },
  group: { gap: 9 },
  noMargin: { marginBottom: 0 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  factText: { color: colors.greySoft, fontSize: 14, lineHeight: 19 },
  mapsButton: { alignSelf: 'flex-start', marginLeft: 26 },
  attendee: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  response: { color: colors.grey, backgroundColor: colors.backgroundSoft, fontSize: 11.5, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, overflow: 'hidden' },
  going: { color: colors.blueLight, backgroundColor: colors.blueSoft },
  notGoing: { color: colors.orange, backgroundColor: colors.orangeSoft },
  bigScore: { color: colors.white, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  scoreSide: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  scoreInput: { textAlign: 'center', fontSize: 26, fontWeight: '800', height: 60 },
  centred: { textAlign: 'center' },
});
