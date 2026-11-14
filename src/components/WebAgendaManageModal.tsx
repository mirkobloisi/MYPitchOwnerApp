import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { composeBookingNotes, readBookingReference } from '../lib/bookingReference';
import { bookingFormLabels } from '../lib/bookingFormLabels';
import { countRemainingInSeries, deletePitchBlock, deleteRecurringSeriesFrom, fetchAgendaRange, fetchAvailability, fetchPitchBlock, PitchBlockRow, updatePitchBlock } from '../lib/pitchData';
import { addDays, buildBusyRanges, buildEndOptions, buildStartOptions, dateAtMinutes, overlapsBusy, startOfDay } from '../lib/slots';
import { weeklineColors as c } from '../theme/palettes';

type Props = { blockId: string | null; pitchName: string; onClose: () => void; onSaved: () => void };
const WebInput = 'input' as any;
const WebSelect = 'select' as any;
const WebOption = 'option' as any;
const WebTextArea = 'textarea' as any;
const inputStyle = { width: '100%', height: 39, boxSizing: 'border-box', border: '1px solid ' + c.border, borderRadius: 7, background: c.cardDark, color: c.white, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark' } as const;
const TIMES = Array.from({ length: 49 }, (_, index) => ({ value: index * 30, label: String(Math.floor(index / 2)).padStart(2, '0') + ':' + (index % 2 ? '30' : '00') }));
const words = {
  en: { manageExternal:'Manage external booking', manageParty:'Manage party', manageBlock:'Manage blocked slot', subtitle:'Update details or remove this event.', current:'Currently scheduled', schedule:'Schedule', bookingDetails:'Booking details', partyDetails:'Party details', blockDetails:'Block details', bookedBy:'Booked by', partyName:'Party name', contact:'Contact name', title:'Title', source:'Source', reason:'Reason', phone:'Phone', notes:'Notes', description:'Description', repeats:'Repeats every', unlimited:'Unlimited', finite:'Weekly series', remaining:'{count} occurrences remaining', occurrenceNote:'Changes here apply only to this occurrence.', remove:'Remove', save:'Save changes', removeQuestion:'Remove this event?', removeHint:'This slot will become available again.', seriesHint:'Choose whether to remove only this occurrence or this and every later one.', keep:'Keep event', one:'This occurrence', future:'This and future', loading:'Loading event…', missing:'This event is no longer available.', invalid:'Choose a valid date and time.', pastError:'A past event cannot be moved. You can still edit its details.', conflict:'That time is unavailable on this pitch.', reasonError:'Enter a reason for the blocked slot.', saveError:'Could not save changes.', removeError:'Could not remove the event.', past:'This event has already taken place. You can edit its details or remove it.' },
  el: { manageExternal:'Διαχείριση εξωτερικής κράτησης', manageParty:'Διαχείριση πάρτι', manageBlock:'Διαχείριση αποκλεισμένης ώρας', subtitle:'Επεξεργαστείτε τα στοιχεία ή αφαιρέστε το συμβάν.', current:'Τρέχον πρόγραμμα', schedule:'Πρόγραμμα', bookingDetails:'Στοιχεία κράτησης', partyDetails:'Στοιχεία πάρτι', blockDetails:'Στοιχεία αποκλεισμού', bookedBy:'Κράτηση από', partyName:'Όνομα πάρτι', contact:'Όνομα επικοινωνίας', title:'Τίτλος', source:'Πηγή', reason:'Αιτία', phone:'Τηλέφωνο', notes:'Σημειώσεις', description:'Περιγραφή', repeats:'Επαναλαμβάνεται κάθε', unlimited:'Χωρίς λήξη', finite:'Εβδομαδιαία σειρά', remaining:'Απομένουν {count} εμφανίσεις', occurrenceNote:'Οι αλλαγές αφορούν μόνο αυτή την εμφάνιση.', remove:'Αφαίρεση', save:'Αποθήκευση αλλαγών', removeQuestion:'Να αφαιρεθεί αυτό το συμβάν;', removeHint:'Η ώρα θα γίνει ξανά διαθέσιμη.', seriesHint:'Επιλέξτε μόνο αυτή την εμφάνιση ή και όλες τις επόμενες.', keep:'Διατήρηση', one:'Μόνο αυτή', future:'Αυτή και οι επόμενες', loading:'Φόρτωση συμβάντος…', missing:'Το συμβάν δεν είναι πλέον διαθέσιμο.', invalid:'Επιλέξτε έγκυρη ημερομηνία και ώρα.', pastError:'Δεν μπορείτε να μετακινήσετε παλιό συμβάν.', conflict:'Αυτή η ώρα δεν είναι διαθέσιμη σε αυτό το γήπεδο.', reasonError:'Συμπληρώστε αιτία για τον αποκλεισμό.', saveError:'Δεν αποθηκεύτηκαν οι αλλαγές.', removeError:'Δεν αφαιρέθηκε το συμβάν.', past:'Αυτό το συμβάν έχει ολοκληρωθεί. Μπορείτε να αλλάξετε τα στοιχεία του ή να το αφαιρέσετε.' },
  ru: { manageExternal:'Управление внешним бронированием', manageParty:'Управление мероприятием', manageBlock:'Управление блокировкой', subtitle:'Измените данные или удалите событие.', current:'Текущее время', schedule:'Расписание', bookingDetails:'Данные бронирования', partyDetails:'Данные мероприятия', blockDetails:'Данные блокировки', bookedBy:'Забронировал', partyName:'Название мероприятия', contact:'Контактное лицо', title:'Название', source:'Источник', reason:'Причина', phone:'Телефон', notes:'Заметки', description:'Описание', repeats:'Повторяется каждый', unlimited:'Без даты окончания', finite:'Еженедельная серия', remaining:'Осталось событий: {count}', occurrenceNote:'Изменения затронут только это событие.', remove:'Удалить', save:'Сохранить изменения', removeQuestion:'Удалить это событие?', removeHint:'Это время снова станет доступным.', seriesHint:'Удалите только это событие или все последующие.', keep:'Оставить', one:'Только это', future:'Это и следующие', loading:'Загрузка события…', missing:'Это событие больше недоступно.', invalid:'Выберите правильную дату и время.', pastError:'Прошедшее событие нельзя перенести.', conflict:'Это время недоступно на данном поле.', reasonError:'Укажите причину блокировки.', saveError:'Не удалось сохранить изменения.', removeError:'Не удалось удалить событие.', past:'Это событие уже прошло. Можно изменить его данные или удалить.' },
};
function dateValue(date: Date) { return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
function parseDate(value: string) { const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!parts) return null; const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])); return dateValue(date) === value ? date : null; }
function minutes(date: Date) { return date.getHours() * 60 + date.getMinutes(); }
function endMinutes(start: Date, end: Date) { return dateValue(start) !== dateValue(end) && minutes(end) === 0 ? 1440 : minutes(end); }
function plainNotes(value: string | null) { return (value ?? '').split(/\r?\n\s*\r?\n/).filter((part) => !/^Party title: /i.test(part) && !/^Reference phone: /i.test(part)).join('\n\n').trim(); }
function timeOptions(current: number) { return TIMES.some((item) => item.value === current) ? TIMES : [...TIMES, { value: current, label: String(Math.floor(current / 60)).padStart(2, '0') + ':' + String(current % 60).padStart(2, '0') }].sort((a, b) => a.value - b.value); }

export default function WebAgendaManageModal({ blockId, pitchName, onClose, onSaved }: Props) {
  const { language } = useLanguage();
  const w = words[language] ?? words.en;
  const l = bookingFormLabels[language] ?? bookingFormLabels.en;
  const [block, setBlock] = useState<PitchBlockRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [seriesRemaining, setSeriesRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!blockId) { setBlock(null); setConfirmDelete(false); setError(''); return; }
    let active = true;
    setLoading(true); setBlock(null); setConfirmDelete(false); setError(''); setSeriesRemaining(null);
    fetchPitchBlock(blockId).then((row) => {
      if (!active) return;
      setBlock(row);
      if (!row) return;
      const start = new Date(row.start_time), end = new Date(row.end_time);
      const details = readBookingReference(row.notes);
      setDate(dateValue(start)); setFrom(minutes(start)); setTo(endMinutes(start, end));
      setReference(row.reference ?? ''); setPhone(details.phone);
      setTitle(details.isWebParty ? details.title : row.block_type === 'blocked' ? row.reference ?? '' : '');
      setReason(row.reason ?? ''); setNotes(row.block_type === 'blocked' ? row.notes ?? '' : plainNotes(row.notes));
      if (row.recurrence_group_id) {
        void countRemainingInSeries(row.recurrence_group_id, start).then((count) => { if (active) setSeriesRemaining(count); }).catch(() => {});
      }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : w.missing); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [blockId]);

  if (!blockId) return null;
  const kind = block?.block_type;
  const start = block ? new Date(block.start_time) : null;
  const end = block ? new Date(block.end_time) : null;
  const isPast = !!start && start.getTime() < Date.now();
  const isRecurring = !!block?.recurrence_group_id;
  const heading = kind === 'party' ? w.manageParty : kind === 'blocked' ? w.manageBlock : w.manageExternal;
  const detailsHeading = kind === 'party' ? w.partyDetails : kind === 'blocked' ? w.blockDetails : w.bookingDetails;
  const day = start?.toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'long' }) ?? '';
  const time = start && end ? start.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: false }) + '–' + end.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const label = (name: string, child: React.ReactNode) => <View style={styles.field}><Text style={styles.fieldLabel}>{name}</Text>{child}</View>;
  const input = (value: string, update: (next: string) => void, type = 'text') => <WebInput type={type} value={value} style={inputStyle} onChange={(event: any) => { update(event.target.value); setError(''); }} />;
  const timeSelect = (value: number, update: (next: number) => void, isEnd: boolean) =>
    <WebSelect value={String(value)} style={inputStyle} onChange={(event: any) => { update(Number(event.target.value)); setError(''); }}>
      {timeOptions(value).filter((item) => isEnd ? item.value > from : item.value < 1440).map((item) => <WebOption key={item.value} value={String(item.value)}>{item.label}</WebOption>)}
    </WebSelect>;

  async function save() {
    if (!block || saving || deleting) return;
    setError('');
    const selectedDate = parseDate(date);
    if (!selectedDate || from < 0 || to > 1440 || to <= from) { setError(w.invalid); return; }
    if (kind === 'blocked' && !reason.trim()) { setError(w.reasonError); return; }
    const originalStart = new Date(block.start_time), originalEnd = new Date(block.end_time);
    const changedSchedule = date !== dateValue(originalStart) || from !== minutes(originalStart) || to !== endMinutes(originalStart, originalEnd);
    if (isPast && changedSchedule) { setError(w.pastError); return; }
    const startTime = changedSchedule ? dateAtMinutes(selectedDate, from) : originalStart;
    const endTime = changedSchedule ? dateAtMinutes(selectedDate, to) : originalEnd;
    if (changedSchedule && startTime.getTime() <= Date.now()) { setError(w.pastError); return; }
    setSaving(true);
    try {
      if (changedSchedule) {
        const [availability, agenda] = await Promise.all([fetchAvailability(block.pitch_id), fetchAgendaRange(block.pitch_id, startOfDay(selectedDate), addDays(startOfDay(selectedDate), 1))]);
        const busy = buildBusyRanges(agenda.matches, agenda.blocks, block.id);
        const available = kind === 'party'
          ? !overlapsBusy(startTime, endTime, busy)
          : buildStartOptions({ availability, day: selectedDate, busy, notBefore: new Date() }).includes(from)
            && buildEndOptions({ availability, day: selectedDate, busy, startMinutes: from }).includes(to);
        if (!available) { setError(w.conflict); return; }
      }
      await updatePitchBlock({
        blockId: block.id, startTime, endTime,
        reason: kind === 'party' ? 'Party' : kind === 'external_booking' ? reason.trim() || 'External booking' : reason.trim(),
        reference: (kind === 'blocked' ? title : reference).trim() || null,
        notes: kind === 'blocked' ? notes.trim() || null : composeBookingNotes(phone, notes, kind === 'party' ? title : '', kind === 'party'),
      });
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : w.saveError); }
    finally { setSaving(false); }
  }
  async function remove(future: boolean) {
    if (!block || deleting || saving) return;
    setDeleting(true); setError('');
    try {
      if (future && block.recurrence_group_id) await deleteRecurringSeriesFrom(block.recurrence_group_id, new Date(block.start_time));
      else await deletePitchBlock(block.id);
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : w.removeError); setConfirmDelete(false); }
    finally { setDeleting(false); }
  }

  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={l.cancel} />
      <View style={styles.card}>
        <View style={styles.header}><View style={styles.headerText}><Text style={styles.eyebrow}>{kind ? l[kind] : ''}</Text><Text style={styles.heading}>{heading}</Text><Text style={styles.subtitle}>{w.subtitle}</Text></View><Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={l.cancel}><Ionicons name="close" size={21} color={c.grey} /></Pressable></View>
        {loading ? <View style={styles.loading}><ActivityIndicator color={c.blueLight} /><Text style={styles.hint}>{w.loading}</Text></View>
          : !block ? <View style={styles.loading}><Text style={styles.error}>{error || w.missing}</Text></View>
          : <>
            <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
              <View style={styles.current}><View style={styles.currentIcon}><Ionicons name={kind === 'blocked' ? 'lock-closed-outline' : kind === 'party' ? 'gift-outline' : 'calendar-outline'} size={17} color={c.blueLight} /></View><View style={styles.currentText}><Text style={styles.currentLabel}>{w.current}</Text><Text style={styles.currentValue}>{day} · {time}</Text><Text style={styles.currentPitch}>{pitchName}</Text></View></View>
              {isPast ? <Text style={styles.hint}>{w.past}</Text> : <>
                <Text style={styles.sectionLabel}>{w.schedule}</Text>
                <View style={styles.fieldsThree}>
                  {label(l.date, <WebInput type="date" value={date} style={inputStyle} onChange={(event: any) => { setDate(event.target.value); setError(''); }} />)}
                  {label(l.from, timeSelect(from, (next) => { setFrom(next); if (to <= next) setTo(Math.min(1440, next + 60)); }, false))}
                  {label(l.to, timeSelect(to, setTo, true))}
                </View>
              </>}
              <View style={styles.divider} /><Text style={styles.sectionLabel}>{detailsHeading}</Text>
              {kind === 'external_booking' ? <>
                <View style={styles.fieldsTwo}>{label(w.bookedBy, input(reference, setReference))}{label(w.phone, input(phone, setPhone, 'tel'))}</View>
                {label(w.source, input(reason, setReason))}
                {label(w.notes, <WebTextArea value={notes} style={{ ...inputStyle, height: 62, resize: 'vertical' }} onChange={(event: any) => { setNotes(event.target.value); setError(''); }} />)}
              </> : kind === 'party' ? <>
                <View style={styles.fieldsTwo}>{label(w.partyName, input(title, setTitle))}{label(w.contact, input(reference, setReference))}</View>
                {label(w.phone, input(phone, setPhone, 'tel'))}
                {label(w.description, <WebTextArea value={notes} style={{ ...inputStyle, height: 62, resize: 'vertical' }} onChange={(event: any) => { setNotes(event.target.value); setError(''); }} />)}
              </> : <>
                <View style={styles.fieldsTwo}>{label(w.title, input(title, setTitle))}{label(w.reason, input(reason, setReason))}</View>
                {label(w.notes, <WebTextArea value={notes} style={{ ...inputStyle, height: 62, resize: 'vertical' }} onChange={(event: any) => { setNotes(event.target.value); setError(''); }} />)}
              </>}
              {isRecurring ? <View style={styles.recurrence}><Ionicons name="repeat" size={17} color={c.blueLight} /><View style={styles.recurrenceText}><Text style={styles.recurrenceTitle}>{w.repeats} {start?.toLocaleDateString(language, { weekday: 'long' })} · {block.recurrence_open_ended ? w.unlimited : seriesRemaining === null ? w.finite : w.remaining.replace('{count}', String(seriesRemaining))}</Text><Text style={styles.recurrenceHint}>{w.occurrenceNote}</Text></View></View> : null}
              {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            </ScrollView>
            <View style={styles.footer}>
              <Pressable style={styles.removeButton} onPress={() => setConfirmDelete(true)} accessibilityRole="button" disabled={saving || deleting}><Ionicons name="trash-outline" size={15} color={c.red} /><Text style={styles.removeText}>{w.remove}</Text></Pressable>
              <View style={styles.footerSpacer} /><Pressable style={styles.cancelButton} onPress={onClose} accessibilityRole="button" disabled={saving || deleting}><Text style={styles.cancelText}>{l.cancel}</Text></Pressable>
              <Pressable style={[styles.saveButton, (saving || deleting) && styles.disabled]} onPress={save} accessibilityRole="button" disabled={saving || deleting}><Text style={styles.saveText}>{w.save}</Text>{saving ? <ActivityIndicator size="small" color={c.blackText} /> : null}</Pressable>
            </View>
          </>}
        {confirmDelete && block ? <View style={styles.confirmOverlay}><View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>{w.removeQuestion}</Text><Text style={styles.confirmHint}>{isRecurring ? w.seriesHint : w.removeHint}</Text>
          <View style={styles.confirmActions}>
            <Pressable style={styles.cancelButton} onPress={() => setConfirmDelete(false)} disabled={deleting}><Text style={styles.cancelText}>{w.keep}</Text></Pressable>
            <Pressable style={styles.removeButton} onPress={() => remove(false)} disabled={deleting}><Text style={styles.removeText}>{isRecurring ? w.one : w.remove}</Text></Pressable>
            {isRecurring ? <Pressable style={styles.removeButton} onPress={() => remove(true)} disabled={deleting}><Text style={styles.removeText}>{w.future}</Text></Pressable> : null}
          </View>
        </View></View> : null}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(2,8,14,0.78)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 640, maxHeight: '92%', backgroundColor: c.card, borderWidth: 1, borderColor: '#355165', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingHorizontal: 22, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: c.border },
  headerText: { flex: 1 }, eyebrow: { color: c.blueLight, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  heading: { color: c.white, fontSize: 21, fontWeight: '800', marginTop: 5 }, subtitle: { color: c.grey, fontSize: 12, marginTop: 3 },
  close: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }, loading: { padding: 36, alignItems: 'center', gap: 10 },
  content: { flexGrow: 0 }, contentInner: { padding: 22, gap: 15 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, backgroundColor: '#112D40', borderWidth: 1, borderColor: '#315A75', borderRadius: 9 },
  currentIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#1C4865', justifyContent: 'center', alignItems: 'center' },
  currentText: { flex: 1 }, currentLabel: { color: '#A8C5D7', fontSize: 11 },
  currentValue: { color: c.white, fontSize: 14, fontWeight: '700', marginTop: 2 }, currentPitch: { color: '#A8C5D7', fontSize: 11, marginTop: 2 },
  sectionLabel: { color: '#80C8F7', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  fieldsThree: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, fieldsTwo: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, flexBasis: 150, minWidth: 0, gap: 6 }, fieldLabel: { color: '#CBDDE7', fontSize: 12, fontWeight: '700' }, divider: { height: 1, backgroundColor: c.border },
  recurrence: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 11 },
  recurrenceText: { flex: 1 }, recurrenceTitle: { color: '#D2E1E9', fontSize: 12, fontWeight: '700' }, recurrenceHint: { color: c.grey, fontSize: 11, marginTop: 3 },
  hint: { color: c.grey, fontSize: 12 }, error: { color: c.red, fontSize: 12 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: 15, borderTopWidth: 1, borderTopColor: c.border },
  footerSpacer: { flex: 1 }, removeButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#6D3D48', backgroundColor: '#2C1C27', borderRadius: 7, paddingHorizontal: 12 },
  removeText: { color: '#FFADB3', fontSize: 12, fontWeight: '700' }, cancelButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border, borderRadius: 7, paddingHorizontal: 13 },
  cancelText: { color: '#D7E7EF', fontSize: 12, fontWeight: '700' }, saveButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: c.blueLight, borderRadius: 7, paddingHorizontal: 14 },
  saveText: { color: c.blackText, fontSize: 12, fontWeight: '800' }, disabled: { opacity: 0.55 },
  confirmOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3,11,18,0.86)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  confirmCard: { width: '100%', maxWidth: 380, backgroundColor: c.cardSoft, borderWidth: 1, borderColor: '#577083', borderRadius: 11, padding: 20, gap: 9 },
  confirmTitle: { color: c.white, fontSize: 17, fontWeight: '800' }, confirmHint: { color: c.grey, fontSize: 12, lineHeight: 18 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 7, marginTop: 7 },
});
