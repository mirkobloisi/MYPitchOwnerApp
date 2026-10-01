import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import AvatarCropModal from './AvatarCropModal';
import AvatarPickerTrigger from './AvatarPickerTrigger';
import { PickedAvatarImage, cropAndUploadPitchPhoto } from '../lib/avatarUpload';
import { PitchRecord, useAuth } from '../lib/auth';
import { updatePitchPresentation } from '../lib/pitchData';
import { weeklineColors as colors } from '../theme/palettes';

const FACILITIES = ['Parking', 'Floodlights', 'Changing Rooms', 'Showers', 'Bar', 'Coffee', 'Gloves', 'Bibs', 'First Aid', 'Hot Food', 'Cold Food'];

export default function PitchPresentationModal({ pitch, visible = true, onDismiss }: { pitch: PitchRecord; visible?: boolean; onDismiss: () => void }) {
  const { pitchOwner, refresh } = useAuth();
  const [facilities, setFacilities] = useState<string[]>(pitch.facilities ?? []);
  const [custom, setCustom] = useState('');
  const [picked, setPicked] = useState<PickedAvatarImage | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = useMemo(() => [...FACILITIES, ...(pitch.facilities ?? [])].filter((name, index, all) => all.findIndex((value) => value.toLowerCase() === name.toLowerCase()) === index), [pitch.facilities]);

  async function save(crop?: { originX: number; originY: number; width: number; height: number }) {
    if (!pitchOwner) return;
    setBusy(true);
    setError('');
    try {
      const imageUrl = picked && crop ? await cropAndUploadPitchPhoto(pitchOwner.id, pitch.id, picked, crop) : null;
      await updatePitchPresentation({ pitchId: pitch.id, facilities, imageUrl });
      await refresh();
      setPicked(null);
      onDismiss();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save pitch details.');
    } finally {
      setBusy(false);
    }
  }

  function addCustom() {
    const value = custom.trim();
    if (!value || facilities.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setFacilities((current) => [...current, value]);
    setCustom('');
  }

  return <>
    <Modal visible={visible && !!pitch} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={styles.dialog}>
          <View style={styles.header}><View><Text style={styles.title}>Edit pitch details</Text><Text style={styles.subtitle}>{pitch?.name}</Text></View><Pressable onPress={onDismiss} style={styles.close}><Ionicons name="close" size={22} color={colors.grey} /></Pressable></View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator>
            <Text style={styles.label}>Pitch picture</Text>
            <View style={styles.photoRow}>
              <View style={styles.photoPreview}>{picked ? <Image source={{ uri: picked.uri }} style={styles.photo} resizeMode="cover" /> : pitch?.image_urls?.[0] ? <Image source={{ uri: pitch.image_urls[0] }} style={styles.photo} resizeMode="cover" /> : <Ionicons name="football-outline" size={34} color={colors.grey} />}</View>
              <View style={styles.photoCopy}><Text style={styles.hint}>Choose a venue photo and adjust its crop before saving.</Text><AvatarPickerTrigger onPicked={(image) => { setPicked(image); setCropOpen(true); }} onError={(cause) => setError(String(cause))} style={styles.photoButton}><Ionicons name="camera-outline" size={15} color={colors.blueLight} /><Text style={styles.buttonText}>Change picture</Text></AvatarPickerTrigger></View>
            </View>
            <Text style={styles.label}>Facilities</Text>
            <View style={styles.facilities}>{options.map((item) => {
              const selected = facilities.some((value) => value.toLowerCase() === item.toLowerCase());
              return <Pressable key={item} onPress={() => setFacilities((current) => selected ? current.filter((value) => value.toLowerCase() !== item.toLowerCase()) : [...current, item])} style={[styles.facilityChoice, selected && styles.facilityChoiceOn]}><Ionicons name={selected ? 'checkmark-circle' : 'add-circle-outline'} size={15} color={selected ? colors.blueLight : colors.grey} /><Text style={styles.facilityText}>{item}</Text></Pressable>;
            })}</View>
            <View style={styles.customRow}><TextInput value={custom} onChangeText={setCustom} onSubmitEditing={addCustom} placeholder="Add another facility" placeholderTextColor={colors.greyDark} style={styles.customInput} /><Pressable onPress={addCustom} style={styles.addButton}><Text style={styles.addText}>Add</Text></Pressable></View>
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}><Pressable onPress={onDismiss} style={styles.cancelButton}><Text style={styles.buttonText}>Cancel</Text></Pressable><Pressable disabled={busy} onPress={() => save()} style={[styles.saveButton, busy && styles.disabled]}>{busy ? <ActivityIndicator size="small" color={colors.blackText} /> : null}<Text style={styles.saveText}>Save changes</Text></Pressable></View>
        </View>
      </View>
    </Modal>
    <AvatarCropModal visible={cropOpen && !!picked} imageUri={picked?.uri ?? null} imageWidth={picked?.width ?? 1} imageHeight={picked?.height ?? 1} cropShape="rectangle" cropAspectRatio={1.8} cropWidth={480} onCancel={() => { setCropOpen(false); setPicked(null); }} onConfirm={(crop) => { setCropOpen(false); void save(crop); }} />
  </>;
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, zIndex: 80, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(4,10,15,0.78)' },
  dialog: { width: 'min(620px, 96%)' as any, maxHeight: '90%', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 22, backgroundColor: colors.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  title: { color: colors.white, fontSize: 19, fontWeight: '700' }, subtitle: { color: colors.grey, fontSize: 13, marginTop: 3 }, close: { padding: 5 },
  body: { flexShrink: 1 }, bodyContent: { paddingVertical: 16, gap: 10 }, label: { color: colors.greySoft, fontSize: 13, fontWeight: '600' },
  photoRow: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 10 }, photoPreview: { width: 150, aspectRatio: 1.8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.cardSoft }, photo: { width: '100%', height: '100%' }, photoCopy: { flex: 1, gap: 9 }, hint: { color: colors.grey, fontSize: 12, lineHeight: 18 },
  photoButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.borderBlue, borderRadius: 7, backgroundColor: colors.backgroundSoft }, buttonText: { color: colors.blueLight, fontSize: 13, fontWeight: '600' },
  facilities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 3 }, facilityChoice: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.backgroundSoft }, facilityChoiceOn: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft }, facilityText: { color: colors.greySoft, fontSize: 12 },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 8 }, customInput: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.cardSoft, color: colors.white, fontSize: 13, outlineStyle: 'none' as any }, addButton: { minWidth: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: colors.blueLight }, addText: { color: colors.blackText, fontWeight: '700', fontSize: 12 },
  error: { color: colors.orange, fontSize: 12, paddingTop: 8 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.borderSoft }, cancelButton: { minHeight: 36, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 7 }, saveButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 15, borderRadius: 7, backgroundColor: colors.blueLight }, saveText: { color: colors.blackText, fontWeight: '700', fontSize: 13 }, disabled: { opacity: 0.65 },
});
