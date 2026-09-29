import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../lib/auth';
import { createPitchBlock, createRecurringPitchBlocks, fetchAgendaRange, fetchAvailability } from '../lib/pitchData';
import { addDays, buildBusyRanges, buildEndOptions, buildStartOptions, dateAtMinutes, overlapsBusy, startOfDay } from '../lib/slots';
import { weeklineColors as c } from '../theme/palettes';

type Kind = 'blocked' | 'party' | 'external_booking';
type Props = { kind: Kind | null; selectedDate: Date; initialPitchId: string; onClose: () => void; onSaved: () => void };
const REASONS = ['Bad Weather', 'Maintenance', 'Health Issue', 'Insufficient Staff', 'Other'] as const;
const WebInput = 'input' as any;
const WebSelect = 'select' as any;
const WebOption = 'option' as any;
const WebTextArea = 'textarea' as any;
const inputStyle = { width: '100%', height: 38, boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 7, background: c.cardDark, color: c.white, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark' };
const labels = {
  en: { blocked: 'Block slot', party: 'Party', external_booking: 'External booking', title: 'Title (optional)', description: 'Brief description (optional)', startDate: 'Start date', endDate: 'End date', date: 'Date', from: 'From', to: 'To', pitches: 'Pitches', pitch: 'Pitch', reason: 'Reason', choose: 'Select a reason', notes: 'Additional notes (optional)', reference: 'Reference name and number (optional)', repeat: 'Repeat weekly', repeatUntil: 'Repeat until', cancel: 'Cancel', save: 'Save', saving: 'Saving…', required: 'Select a valid future date, time range, and pitch.', reasonRequired: 'Select a reason.', range: 'The end date must be on or after the start date (up to 31 days).', rangeHint: 'Up to 31 consecutive days.', repeatDate: 'Select a repeat end date within two years.', conflict: 'That time is unavailable for {pitch} on {date}.', failed: 'Could not save. Check availability and try again.', partial: '{count} entries saved before an error. Refresh the Agenda before retrying.', skipped: 'Saved. {count} weekly dates were unavailable and skipped.' },
  el: { blocked: 'Αποκλεισμός', party: 'Πάρτι', external_booking: 'Εξωτερική κράτηση', title: 'Τίτλος (προαιρετικό)', description: 'Σύντομη περιγραφή (προαιρετικό)', startDate: 'Ημερομηνία έναρξης', endDate: 'Ημερομηνία λήξης', date: 'Ημερομηνία', from: 'Από', to: 'Έως', pitches: 'Γήπεδα', pitch: 'Γήπεδο', reason: 'Αιτία', choose: 'Επιλέξτε αιτία', notes: 'Επιπλέον σημειώσεις (προαιρετικό)', reference: 'Όνομα και αριθμός αναφοράς (προαιρετικό)', repeat: 'Επανάληψη κάθε εβδομάδα', repeatUntil: 'Επανάληψη έως', cancel: 'Ακύρωση', save: 'Αποθήκευση', saving: 'Αποθήκευση…', required: 'Επιλέξτε έγκυρη ημερομηνία, ώρες και γήπεδο.', reasonRequired: 'Επιλέξτε αιτία.', range: 'Η λήξη πρέπει να είναι μετά την έναρξη (έως 31 ημέρες).', rangeHint: 'Έως 31 συνεχόμενες ημέρες.', repeatDate: 'Επιλέξτε λήξη επανάληψης εντός δύο ετών.', conflict: 'Η ώρα δεν είναι διαθέσιμη για {pitch} στις {date}.', failed: 'Δεν αποθηκεύτηκε. Ελέγξτε τη διαθεσιμότητα.', partial: '{count} εγγραφές αποθηκεύτηκαν πριν το σφάλμα. Ανανεώστε την Ατζέντα.', skipped: 'Αποθηκεύτηκε. {count} εβδομαδιαίες ημερομηνίες παραλείφθηκαν.' },
  ru: { blocked: 'Блокировка', party: 'Мероприятие', external_booking: 'Внешнее бронирование', title: 'Название (необязательно)', description: 'Краткое описание (необязательно)', startDate: 'Дата начала', endDate: 'Дата окончания', date: 'Дата', from: 'С', to: 'До', pitches: 'Поля', pitch: 'Поле', reason: 'Причина', choose: 'Выберите причину', notes: 'Дополнительные заметки (необязательно)', reference: 'Имя и номер для справки (необязательно)', repeat: 'Повторять еженедельно', repeatUntil: 'Повторять до', cancel: 'Отмена', save: 'Сохранить', saving: 'Сохранение…', required: 'Выберите дату, время и поле.', reasonRequired: 'Выберите причину.', range: 'Дата окончания должна быть не раньше начала (до 31 дня).', rangeHint: 'До 31 дня подряд.', repeatDate: 'Укажите окончание повтора в пределах двух лет.', conflict: 'Время недоступно для {pitch} на {date}.', failed: 'Не удалось сохранить. Проверьте доступность.', partial: 'Сохранено записей: {count}. Обновите календарь перед повтором.', skipped: 'Сохранено. Пропущено недель: {count}.' },
};
const reasonLabels = {
  en: REASONS,
  el: ['Κακοκαιρία', 'Συντήρηση', 'Πρόβλημα υγείας', 'Έλλειψη προσωπικού', 'Άλλο'],
  ru: ['Плохая погода', 'Обслуживание', 'Проблемы со здоровьем', 'Нехватка персонала', 'Другое'],
};
function dateValue(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dateValue(date) === value ? date : null;
}
const TIMES = Array.from({ length: 49 }, (_, index) => ({ value: index * 30, label: `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}` }));

export default function WebAgendaBookingModal({ kind, selectedDate, initialPitchId, onClose, onSaved }: Props) {
  const { language } = useLanguage();
  const { session, pitches } = useAuth();
  const l = labels[language] ?? labels.en;
  const [startDate, setStartDate] = useState(dateValue(selectedDate));
  const [endDate, setEndDate] = useState(dateValue(selectedDate));
  const [repeatUntil, setRepeatUntil] = useState('');
  const [startMinutes, setStartMinutes] = useState('');
  const [endMinutes, setEndMinutes] = useState('');
  const [pitchIds, setPitchIds] = useState<string[]>([initialPitchId]);
  const [reason, setReason] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [weekly, setWeekly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [finished, setFinished] = useState(false);
  const styles = useMemo(() => makeStyles(), []);
  useEffect(() => {
    if (!kind) return;
    setStartDate(dateValue(selectedDate)); setEndDate(dateValue(selectedDate)); setRepeatUntil('');
    setStartMinutes(''); setEndMinutes(''); setPitchIds([initialPitchId]); setReason('');
    setTitle(''); setDescription(''); setReference(''); setNotes(''); setWeekly(false); setError(''); setNotice(''); setFinished(false);
  }, [kind, selectedDate, initialPitchId]);
  if (!kind) return null;
  const blockType: Kind = kind;
  const multiPitch = kind !== 'external_booking';
  const field = (label: string, child: React.ReactNode) => <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{child}</View>;
  const input = (type: string, value: string, change: (value: string) => void, min?: string) =>
    <WebInput type={type} value={value} min={min} step={type === 'time' ? 1800 : undefined} style={inputStyle} onChange={(event: any) => change(event.target.value)} />;
  const start = parseDate(startDate);
  const minDate = dateValue(startOfDay(new Date()));
  const dateFields = kind === 'blocked' ? (
    <View><View style={styles.row}>{field(l.startDate, input('date', startDate, setStartDate, minDate))}{field(l.endDate, input('date', endDate, setEndDate, startDate))}</View><Text style={styles.hint}>{l.rangeHint}</Text></View>
  ) : field(l.date, input('date', startDate, setStartDate, minDate));
  const timeSelect = (value: string, change: (value: string) => void, isEnd: boolean) => <WebSelect value={value} style={inputStyle} onChange={(event: any) => change(event.target.value)}><WebOption value="">—</WebOption>{TIMES.filter((time) => isEnd ? time.value > Number(startMinutes || -1) : time.value < 1440).map((time) => <WebOption key={time.value} value={String(time.value)}>{time.label}</WebOption>)}</WebSelect>;
  function togglePitch(id: string) { setPitchIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]); }
  async function save() {
    if (saving || finished || !session) return;
    setError(''); setNotice('');
    const first = parseDate(startDate);
    const last = kind === 'blocked' ? parseDate(endDate) : first;
    const from = Number(startMinutes), to = Number(endMinutes);
    if (!first || !last || first < startOfDay(new Date()) || !startMinutes || !endMinutes || from >= to || pitchIds.length === 0 || (kind === 'external_booking' && pitchIds.length !== 1)) { setError(l.required); return; }
    const days = Math.round((Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 86400000);
    if (days < 0 || days > 30) { setError(l.range); return; }
    if (kind === 'blocked' && !reason) { setError(l.reasonRequired); return; }
    const until = weekly ? parseDate(repeatUntil) : null;
    if (weekly && (!until || until < last || until > addDays(first, 730))) { setError(l.repeatDate); return; }
    setSaving(true);
    let saved = 0;
    try {
      const targets = pitchIds.flatMap((pitchId) => Array.from({ length: days + 1 }, (_, index) => ({ pitchId, day: addDays(first, index) })));
      // Validate every first occurrence before writing any row. The server still checks concurrent changes.
      for (const { pitchId, day } of targets) {
        const [availability, agenda] = await Promise.all([fetchAvailability(pitchId), fetchAgendaRange(pitchId, day, addDays(day, 1))]);
        const busy = buildBusyRanges(agenda.matches, agenda.blocks);
        const startsAt = dateAtMinutes(day, from), endsAt = dateAtMinutes(day, to);
        const available = kind === 'party'
          ? startsAt >= new Date() && !overlapsBusy(startsAt, endsAt, busy)
          : buildStartOptions({ availability, day, busy, notBefore: new Date() }).includes(from)
            && buildEndOptions({ availability, day, busy, startMinutes: from }).includes(to);
        if (!available) {
          const pitch = pitches.find((item) => item.id === pitchId)?.name ?? l.pitch;
          setError(l.conflict.replace('{pitch}', pitch).replace('{date}', dateValue(day))); return;
        }
      }
      const valueReason = kind === 'blocked' ? reason : kind === 'party' ? 'Party' : 'External booking';
      const valueReference = kind === 'external_booking' ? reference.trim() : title.trim();
      const valueNotes = kind === 'party' ? description.trim() : notes.trim();
      let skipped = 0;
      for (const { pitchId, day } of targets) {
        const payload = { pitchId, startTime: dateAtMinutes(day, from), endTime: dateAtMinutes(day, to), blockType, reason: valueReason, reference: valueReference || null, notes: valueNotes || null };
        if (weekly && until) {
          const result = await createRecurringPitchBlocks({ ...payload, repeatUntil: until, openEnded: false });
          saved += result.created; skipped += result.skipped.length;
        } else {
          await createPitchBlock({ ...payload, createdBy: session.user.id }); saved++;
        }
      }
      if (skipped && !saved) { setError(l.conflict.replace('{pitch}', l.pitches).replace('{date}', startDate)); }
      else if (skipped) { setNotice(l.skipped.replace('{count}', String(skipped))); setFinished(true); onSaved(); }
      else { onSaved(); onClose(); }
    } catch (cause) {
      setError(saved ? l.partial.replace('{count}', String(saved)) : cause instanceof Error ? cause.message : l.failed);
      if (saved) { setFinished(true); onSaved(); }
    } finally { setSaving(false); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={l.cancel} />
      <View style={styles.card}>
        <View style={styles.header}><View><Text style={styles.heading}>{l[kind]}</Text><Text style={styles.subheading}>MYPitch · Owner Agenda</Text></View><Pressable onPress={onClose} accessibilityLabel={l.cancel}><Ionicons name="close" size={23} color={c.grey} /></Pressable></View>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
          {kind !== 'external_booking' ? field(l.title, input('text', title, setTitle)) : null}
          {kind === 'party' ? field(l.description, <WebTextArea value={description} style={{ ...inputStyle, height: 60, resize: 'vertical' }} onChange={(event: any) => setDescription(event.target.value)} />) : null}
          {dateFields}
          <View style={styles.row}>{field(l.from, timeSelect(startMinutes, (value) => { setStartMinutes(value); setEndMinutes(''); }, false))}{field(l.to, timeSelect(endMinutes, setEndMinutes, true))}</View>
          {field(multiPitch ? l.pitches : l.pitch, <View style={styles.pitches}>{pitches.map((pitch) => <Pressable key={pitch.id} style={[styles.pitchChip, pitchIds.includes(pitch.id) && styles.pitchSelected]} onPress={() => multiPitch ? togglePitch(pitch.id) : setPitchIds([pitch.id])} accessibilityRole="checkbox" accessibilityState={{ checked: pitchIds.includes(pitch.id) }}><Ionicons name={pitchIds.includes(pitch.id) ? 'checkbox' : 'square-outline'} size={17} color={pitchIds.includes(pitch.id) ? c.blueLight : c.grey} /><Text style={styles.pitchText}>{pitch.name}</Text></Pressable>)}</View>)}
          {kind === 'blocked' ? field(l.reason, <WebSelect value={reason} style={inputStyle} onChange={(event: any) => setReason(event.target.value)}><WebOption value="">{l.choose}</WebOption>{REASONS.map((item, index) => <WebOption key={item} value={item}>{reasonLabels[language]?.[index] ?? item}</WebOption>)}</WebSelect>) : null}
          {kind === 'external_booking' ? field(l.reference, input('text', reference, setReference)) : null}
          {kind !== 'party' ? field(l.notes, <WebTextArea value={notes} style={{ ...inputStyle, height: 60, resize: 'vertical' }} onChange={(event: any) => setNotes(event.target.value)} />) : null}
          <Pressable style={styles.repeatRow} onPress={() => setWeekly(!weekly)} accessibilityRole="checkbox" accessibilityState={{ checked: weekly }}><Ionicons name={weekly ? 'checkbox' : 'square-outline'} size={19} color={weekly ? c.blueLight : c.grey} /><Text style={styles.repeatText}>{l.repeat}</Text></Pressable>
          {weekly ? field(l.repeatUntil, input('date', repeatUntil, setRepeatUntil, kind === 'blocked' ? endDate : startDate)) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}{notice ? <Text style={styles.notice}>{notice}</Text> : null}
        </ScrollView>
        <View style={styles.footer}><Pressable style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>{l.cancel}</Text></Pressable><Pressable style={[styles.submit, saving && styles.disabled]} onPress={finished ? onClose : save} disabled={saving}><Text style={styles.submitText}>{saving ? l.saving : finished ? 'OK' : l.save}</Text>{saving ? <ActivityIndicator size="small" color={c.blackText} /> : null}</Pressable></View>
      </View>
    </View>
  </Modal>;
}
const makeStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(2,8,14,0.78)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 620, maxHeight: '90%', backgroundColor: c.backgroundSoft, borderColor: c.border, borderWidth: 1, borderRadius: 13, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24 },
  header: { paddingHorizontal: 22, paddingVertical: 17, borderBottomColor: c.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { color: c.white, fontSize: 20, fontWeight: '700' }, subheading: { color: c.greyDark, fontSize: 12, marginTop: 3 },
  content: { flexGrow: 0 }, contentInner: { padding: 22, gap: 14 },
  field: { flex: 1, minWidth: 0, gap: 6 }, fieldLabel: { color: c.grey, fontSize: 12, fontWeight: '600' }, row: { flexDirection: 'row', gap: 12 },
  pitches: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, pitchChip: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingHorizontal: 10, borderWidth: 1, borderRadius: 7, borderColor: c.border, backgroundColor: c.card }, pitchSelected: { borderColor: c.blueLight, backgroundColor: c.blueSoft }, pitchText: { color: c.white, fontSize: 12, fontWeight: '600' },
  repeatRow: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 3 }, repeatText: { color: c.white, fontSize: 13, fontWeight: '600' },
  error: { color: c.red, fontSize: 12 }, notice: { color: c.blueLight, fontSize: 12 },
  hint: { color: c.greyDark, fontSize: 11, marginTop: 5 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.border, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  cancel: { paddingHorizontal: 17, height: 36, justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: c.border }, cancelText: { color: c.grey, fontSize: 13, fontWeight: '600' },
  submit: { minWidth: 92, height: 36, paddingHorizontal: 17, borderRadius: 7, backgroundColor: c.blueLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, submitText: { color: c.blackText, fontSize: 13, fontWeight: '700' }, disabled: { opacity: 0.6 },
});
