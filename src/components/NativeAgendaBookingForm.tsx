import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../lib/auth';
import { bookingFormLabels, REASONS, reasonLabels } from '../lib/bookingFormLabels';
import { composeBookingNotes } from '../lib/bookingReference';
import { createPitchBlock, createRecurringPitchBlocks, fetchAgendaRange, fetchAvailability } from '../lib/pitchData';
import { addDays, buildBusyRanges, buildEndOptions, buildStartOptions, dateAtMinutes, overlapsBusy, startOfDay } from '../lib/slots';
import Screen from './Screen';
import { weeklineColors as c } from '../theme/palettes';

type Kind = 'blocked' | 'party' | 'external_booking';
type DateField = 'startDate' | 'endDate' | 'repeatUntil';
type Picker = DateField | 'startTime' | 'endTime' | 'reason' | null;
type Props = { kind: Kind; initialPitchId: string; initialDate: string };
const MONTHS = Array.from({ length: 12 }, (_, month) => new Date(2026, month, 1).toLocaleDateString(undefined, { month: 'long' }));
const TIMES = Array.from({ length: 49 }, (_, index) => ({ value: index * 30, label: `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}` }));
function dateValue(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formattedDate(value: Date) { return value.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }

export default function NativeAgendaBookingForm({ kind, initialPitchId, initialDate }: Props) {
  const router = useRouter();
  const { session, pitches } = useAuth();
  const { language } = useLanguage();
  const l = bookingFormLabels[language] ?? bookingFormLabels.en;
  const initialDay = useMemo(() => {
    const parsed = new Date(initialDate);
    return startOfDay(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
  }, [initialDate]);
  const [startDate, setStartDate] = useState(initialDay);
  const [endDate, setEndDate] = useState(initialDay);
  const [repeatUntil, setRepeatUntil] = useState(addDays(initialDay, 7));
  const [startMinutes, setStartMinutes] = useState<number | null>(null);
  const [endMinutes, setEndMinutes] = useState<number | null>(null);
  const [pitchIds, setPitchIds] = useState<string[]>([initialPitchId]);
  const [reason, setReason] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [weekly, setWeekly] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [pickerMonth, setPickerMonth] = useState(startOfDay(new Date(initialDay.getFullYear(), initialDay.getMonth(), 1)));
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const multiPitch = kind !== 'external_booking';
  const close = () => router.back();

  const openDate = (field: DateField) => {
    const value = field === 'endDate' ? endDate : field === 'repeatUntil' ? repeatUntil : startDate;
    setPickerMonth(new Date(value.getFullYear(), value.getMonth(), 1));
    setPicker(field);
  };
  const selectedDate = picker === 'endDate' ? endDate : picker === 'repeatUntil' ? repeatUntil : startDate;
  const minPickerDate = picker === 'endDate' ? startDate : picker === 'repeatUntil' ? (kind === 'blocked' ? endDate : startDate) : startOfDay(new Date());
  const maxPickerDate = addDays(startOfDay(new Date()), 730);
  const firstCalendarDay = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
  firstCalendarDay.setDate(firstCalendarDay.getDate() - ((firstCalendarDay.getDay() + 6) % 7));
  const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(firstCalendarDay, index));

  const field = (label: string, child: React.ReactNode) => <View style={styles.field}><Text style={styles.label}>{label}</Text>{child}</View>;
  const textField = (value: string, onChangeText: (value: string) => void, multiline = false, keyboardType: 'default' | 'phone-pad' = 'default') =>
    <TextInput value={value} onChangeText={onChangeText} multiline={multiline} keyboardType={keyboardType} placeholderTextColor={c.greyDark} style={[styles.input, multiline && styles.area]} selectionColor={c.blueLight} />;
  const selector = (value: string, onPress: () => void, icon: keyof typeof Ionicons.glyphMap = 'chevron-down') =>
    <Pressable style={styles.selector} onPress={onPress} accessibilityRole="button"><Text style={styles.selectorText} numberOfLines={1}>{value}</Text><Ionicons name={icon} size={16} color={c.blueLight} /></Pressable>;
  const timeLabel = (minutes: number | null) => minutes === null ? '—' : TIMES.find((entry) => entry.value === minutes)?.label ?? '—';
  const togglePitch = (id: string) => setPitchIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);

  async function save() {
    if (saving || finished || !session) return;
    setError(''); setNotice('');
    const first = startDate;
    const last = kind === 'blocked' ? endDate : first;
    const from = startMinutes, to = endMinutes;
    const days = Math.round((Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 86400000);
    if (first < startOfDay(new Date()) || from === null || to === null || from >= to || pitchIds.length === 0 || (kind === 'external_booking' && pitchIds.length !== 1)) { setError(l.required); return; }
    if (days < 0 || days > 30) { setError(l.range); return; }
    if (kind === 'blocked' && !reason) { setError(l.reasonRequired); return; }
    if (weekly && (repeatUntil < last || repeatUntil > addDays(first, 730))) { setError(l.repeatDate); return; }
    setSaving(true);
    let saved = 0;
    try {
      const targets = pitchIds.flatMap((pitchId) => Array.from({ length: days + 1 }, (_, index) => ({ pitchId, day: addDays(first, index) })));
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
      const valueReference = kind === 'blocked' ? title.trim() : reference.trim();
      const valueNotes = kind === 'blocked' ? notes.trim() : composeBookingNotes(phone, kind === 'party' ? description : notes, kind === 'party' ? title : '', kind === 'party');
      let skipped = 0;
      for (const { pitchId, day } of targets) {
        const payload = { pitchId, startTime: dateAtMinutes(day, from), endTime: dateAtMinutes(day, to), blockType: kind, reason: valueReason, reference: valueReference || null, notes: valueNotes || null };
        if (weekly) {
          const result = await createRecurringPitchBlocks({ ...payload, repeatUntil, openEnded: false });
          saved += result.created; skipped += result.skipped.length;
        } else { await createPitchBlock({ ...payload, createdBy: session.user.id }); saved++; }
      }
      if (skipped && !saved) setError(l.conflict.replace('{pitch}', l.pitches).replace('{date}', dateValue(first)));
      else if (skipped) { setNotice(l.skipped.replace('{count}', String(skipped))); setFinished(true); }
      else close();
    } catch (cause) {
      setError(saved ? l.partial.replace('{count}', String(saved)) : cause instanceof Error ? cause.message : l.failed);
      if (saved) setFinished(true);
    } finally { setSaving(false); }
  }

  const isDatePicker = picker === 'startDate' || picker === 'endDate' || picker === 'repeatUntil';
  const modalOptions = picker === 'reason'
    ? REASONS.map((value, index) => ({ value, label: reasonLabels[language]?.[index] ?? value }))
    : TIMES.filter((entry) => picker === 'startTime' ? entry.value < 1440 : picker === 'endTime' ? startMinutes !== null && entry.value > startMinutes : false).map((entry) => ({ value: String(entry.value), label: entry.label }));

  return <Screen scroll={false} ambientGlows={false} background={<Image source={require('../../assets/images/weekline-soft-halo.png')} style={styles.background} resizeMode="stretch" />} style={styles.root} contentStyle={styles.content}>
    <View style={styles.header}>
      <Pressable style={styles.headerButton} onPress={close} accessibilityLabel={l.cancel}><Ionicons name="chevron-back" size={23} color={c.white} /></Pressable>
      <Image source={require('../../assets/images/mypitch-weekline-logo.png')} style={styles.logo} resizeMode="contain" />
      <View style={styles.headerButton} />
    </View>
    <View style={styles.titleRow}><Text style={styles.heading}>{l[kind]}</Text><Text style={styles.subtitle}>MYPitch · Owner Agenda</Text></View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {kind !== 'external_booking' ? field(l.title, textField(title, setTitle)) : null}
      {kind === 'party' ? field(l.description, textField(description, setDescription, true)) : null}
      <View style={styles.row}>{field(kind === 'blocked' ? l.startDate : l.date, selector(formattedDate(startDate), () => openDate('startDate'), 'calendar-outline'))}{kind === 'blocked' ? field(l.endDate, selector(formattedDate(endDate), () => openDate('endDate'), 'calendar-outline')) : null}</View>
      {kind === 'blocked' ? <Text style={styles.hint}>{l.rangeHint}</Text> : null}
      <View style={styles.row}>{field(l.from, selector(timeLabel(startMinutes), () => setPicker('startTime'), 'time-outline'))}{field(l.to, selector(timeLabel(endMinutes), () => setPicker('endTime'), 'time-outline'))}</View>
      {field(multiPitch ? l.pitches : l.pitch, <View style={styles.pitchWrap}>{pitches.map((pitch) => <Pressable key={pitch.id} style={[styles.pitchChip, pitchIds.includes(pitch.id) && styles.pitchSelected]} onPress={() => multiPitch ? togglePitch(pitch.id) : setPitchIds([pitch.id])} accessibilityRole="checkbox" accessibilityState={{ checked: pitchIds.includes(pitch.id) }}><Ionicons name={pitchIds.includes(pitch.id) ? 'checkbox' : 'square-outline'} size={18} color={pitchIds.includes(pitch.id) ? c.blueLight : c.grey} /><Text style={styles.pitchText}>{pitch.name}</Text></Pressable>)}</View>)}
      {kind === 'blocked' ? field(l.reason, selector(reason ? reasonLabels[language]?.[REASONS.indexOf(reason as typeof REASONS[number])] ?? reason : l.choose, () => setPicker('reason'))) : null}
      {kind !== 'blocked' ? <View style={styles.row}>{field(l.reference, textField(reference, setReference))}{field(l.phone, textField(phone, setPhone, false, 'phone-pad'))}</View> : null}
      {kind !== 'party' ? field(l.notes, textField(notes, setNotes, true)) : null}
      <Pressable style={styles.repeatRow} onPress={() => setWeekly(!weekly)} accessibilityRole="checkbox" accessibilityState={{ checked: weekly }}><Ionicons name={weekly ? 'checkbox' : 'square-outline'} size={21} color={weekly ? c.blueLight : c.grey} /><Text style={styles.repeatText}>{l.repeat}</Text></Pressable>
      {weekly ? field(l.repeatUntil, selector(formattedDate(repeatUntil), () => openDate('repeatUntil'), 'calendar-outline')) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}{notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </ScrollView>
    <View style={styles.footer}><Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{l.cancel}</Text></Pressable><Pressable style={[styles.save, saving && styles.disabled]} onPress={finished ? close : save} disabled={saving}><Text style={styles.saveText}>{saving ? l.saving : finished ? 'OK' : l.save}</Text>{saving ? <ActivityIndicator size="small" color={c.blackText} /> : null}</Pressable></View>
    <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}><View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} /><View style={styles.sheet}>
      <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{picker === 'startDate' ? l.startDate : picker === 'endDate' ? l.endDate : picker === 'repeatUntil' ? l.repeatUntil : picker === 'startTime' ? l.from : picker === 'endTime' ? l.to : l.reason}</Text><Pressable onPress={() => setPicker(null)} accessibilityLabel={l.cancel}><Ionicons name="close" size={21} color={c.grey} /></Pressable></View>
      {isDatePicker ? <><View style={styles.monthRow}><Pressable onPress={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={21} color={c.blueLight} /></Pressable><Text style={styles.monthLabel}>{MONTHS[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}</Text><Pressable onPress={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={21} color={c.blueLight} /></Pressable></View><View style={styles.calendar}>{calendarDays.map((day) => { const allowed = day >= minPickerDate && day <= maxPickerDate && day.getMonth() === pickerMonth.getMonth(); const active = dateValue(day) === dateValue(selectedDate); return <Pressable key={dateValue(day)} style={[styles.day, active && styles.dayActive]} disabled={!allowed} onPress={() => { if (picker === 'startDate') { setStartDate(day); if (endDate < day) setEndDate(day); if (repeatUntil < day) setRepeatUntil(addDays(day, 7)); } else if (picker === 'endDate') { setEndDate(day); if (repeatUntil < day) setRepeatUntil(addDays(day, 7)); } else setRepeatUntil(day); setPicker(null); }}><Text style={[styles.dayText, !allowed && styles.dayDisabled, active && styles.dayActiveText]}>{day.getDate()}</Text></Pressable>; })}</View></> : <ScrollView style={styles.optionList}>{modalOptions.map((option) => <Pressable key={option.value} style={styles.option} onPress={() => { if (picker === 'reason') setReason(option.value); else if (picker === 'startTime') { setStartMinutes(Number(option.value)); setEndMinutes(null); } else setEndMinutes(Number(option.value)); setPicker(null); }}><Text style={styles.optionText}>{option.label}</Text></Pressable>)}</ScrollView>}
    </View></View></Modal>
  </Screen>;
}
const styles = StyleSheet.create({
  root: { backgroundColor: '#090F16' }, background: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' }, content: { flex: 1, paddingHorizontal: 0, paddingVertical: 0 },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.borderSoft }, headerButton: { width: 35, height: 40, justifyContent: 'center' }, logo: { width: 112, height: 38 },
  titleRow: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 15 }, heading: { color: c.white, fontSize: 25, fontWeight: '700' }, subtitle: { color: c.grey, fontSize: 12, marginTop: 4 },
  scroll: { flex: 1 }, form: { paddingHorizontal: 20, paddingBottom: 24, gap: 17 }, field: { flex: 1, minWidth: 0, gap: 7 }, label: { color: c.grey, fontSize: 12, fontWeight: '600' },
  input: { minHeight: 42, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardDark, borderRadius: 8, paddingHorizontal: 11, color: c.white, fontSize: 14 }, area: { minHeight: 70, paddingTop: 10, textAlignVertical: 'top' },
  selector: { minHeight: 42, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardDark, borderRadius: 8, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 }, selectorText: { color: c.white, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  row: { flexDirection: 'row', gap: 10 }, hint: { color: c.greyDark, fontSize: 11, marginTop: -11 }, pitchWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, pitchChip: { minHeight: 38, paddingHorizontal: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 7 }, pitchSelected: { borderColor: c.blueLight, backgroundColor: c.blueSoft }, pitchText: { color: c.white, fontSize: 13, fontWeight: '600' },
  repeatRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 }, repeatText: { color: c.white, fontSize: 14, fontWeight: '600' }, error: { color: c.red, fontSize: 12 }, notice: { color: c.blueLight, fontSize: 12 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.backgroundSoft }, cancel: { flex: 1, height: 43, borderWidth: 1, borderColor: c.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: c.grey, fontSize: 14, fontWeight: '600' }, save: { flex: 1, height: 43, borderRadius: 8, backgroundColor: c.blueLight, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, saveText: { color: c.blackText, fontSize: 14, fontWeight: '700' }, disabled: { opacity: 0.55 },
  overlay: { flex: 1, backgroundColor: 'rgba(2,8,14,0.8)', justifyContent: 'center', paddingHorizontal: 18 }, sheet: { maxHeight: '78%', backgroundColor: c.backgroundSoft, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 15 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border }, sheetTitle: { color: c.white, fontSize: 17, fontWeight: '700' },
  optionList: { maxHeight: 380 }, option: { minHeight: 46, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: c.borderSoft, paddingHorizontal: 8 }, optionText: { color: c.white, fontSize: 15 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 8 }, monthLabel: { color: c.white, fontSize: 15, fontWeight: '700' }, calendar: { flexDirection: 'row', flexWrap: 'wrap' }, day: { width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }, dayActive: { backgroundColor: c.blueSoft, borderWidth: 1, borderColor: c.blueLight }, dayText: { color: c.white, fontSize: 14 }, dayDisabled: { color: c.greyDark, opacity: 0.35 }, dayActiveText: { color: c.blueLight, fontWeight: '700' },
});
