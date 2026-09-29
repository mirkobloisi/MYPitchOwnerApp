import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Screen from './Screen';
import { useTranslation } from '../i18n/LanguageContext';
import { PitchRecord, useAuth } from '../lib/auth';
import { useBreakpoint, WIDE_CONTENT_MAX_WIDTH } from '../theme/breakpoints';
import { weeklineColors as colors } from '../theme/palettes';

type IconName = keyof typeof Ionicons.glyphMap;
const facilityIcons: Record<string, IconName> = {
  parking: 'car-outline', shower: 'water-outline', showers: 'water-outline',
  bar: 'wine-outline', coffee: 'cafe-outline', gloves: 'hand-left-outline',
  bibs: 'shirt-outline', shoes: 'footsteps-outline', 'first aid': 'medkit-outline',
  'hot food': 'restaurant-outline', 'cold food': 'ice-cream-outline',
};

export default function WebPitches() {
  const { pitches, activePitch, pitchOwner } = useAuth();
  const { isDesktop } = useBreakpoint();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visiblePitches = pitches.filter((pitch) =>
    [pitch.name, pitch.city, pitch.area, pitch.format].some((value) =>
      value?.toLocaleLowerCase().includes(normalizedQuery)));
  // Inspecting a pitch does not silently change the Agenda/Availability selection.
  const selectedPitch = visiblePitches.find((pitch) => pitch.id === (previewId ?? activePitch?.id))
    ?? visiblePitches[0];

  return (
    <Screen scroll={!isDesktop} maxWidth={WIDE_CONTENT_MAX_WIDTH} ambientGlows={false} style={styles.canvas} contentStyle={isDesktop ? styles.desktopContent : styles.content}>
      <View style={[styles.heading, isDesktop && styles.desktopHeading]}>
        <View style={styles.headingText}>
          <Text accessibilityRole="header" style={styles.title}>{t('pitches.title')}</Text>
          <Text style={styles.subtitle}>{t('pitches.subtitle')}</Text>
        </View>
        <View style={styles.centerBadge}>
          <Ionicons name="business-outline" size={15} color={colors.blueLight} />
          <Text style={styles.centerName} numberOfLines={1}>{pitchOwner?.business_name?.trim() || t('availability.sportsCenter')}</Text>
        </View>
      </View>

      {pitches.length === 0 ? <Text style={styles.empty}>{t('pitches.noPitches')}</Text> : (
        <View style={[styles.workspace, isDesktop ? styles.desktopWorkspace : styles.workspaceCompact]}>
          <View style={[styles.navigator, isDesktop ? styles.desktopNavigator : styles.navigatorCompact]}>
            <View style={styles.search}>
              <Ionicons name="search-outline" size={16} color={colors.grey} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('pitches.searchPlaceholder')}
                accessibilityLabel={t('pitches.searchPlaceholder')}
                placeholderTextColor={colors.greyDark}
                style={styles.searchInput}
              />
              {query ? <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('pitches.clearSearch')} style={styles.clearSearch}>
                <Ionicons name="close" size={16} color={colors.grey} />
              </Pressable> : null}
            </View>
            <ScrollView style={isDesktop ? styles.pitchList : styles.pitchListCompact} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
              {visiblePitches.map((pitch) => (
                <Pressable
                  key={pitch.id}
                  accessibilityRole="button"
                  accessibilityLabel={pitch.name}
                  accessibilityState={{ selected: pitch.id === selectedPitch?.id }}
                  onPress={() => setPreviewId(pitch.id)}
                  style={[styles.pitchRow, pitch.id === selectedPitch?.id && styles.pitchRowSelected]}
                >
                  <View style={styles.listPhoto}><PitchPhoto key={pitch.image_urls?.[0] ?? 'empty'} uri={pitch.image_urls?.[0]} label={pitch.name} /></View>
                  <View style={styles.listInfo}>
                    <Text style={styles.listName} numberOfLines={2}>{pitch.name}</Text>
                    <Text style={styles.listMeta}>{pitch.format}</Text>
                    <Text style={styles.listMeta} numberOfLines={1}>{[pitch.city, pitch.area].filter(Boolean).join(' · ')}</Text>
                    <PitchStatus status={pitch.status} />
                  </View>
                </Pressable>
              ))}
              {visiblePitches.length === 0 ? <Text style={styles.empty}>{t('pitches.noSearchResults')}</Text> : null}
            </ScrollView>
          </View>

          {selectedPitch ? <PitchDetails key={selectedPitch.id} pitch={selectedPitch} desktop={isDesktop} /> : (
            <View style={styles.detail}><Text style={styles.empty}>{t('pitches.noSearchResults')}</Text></View>
          )}
        </View>
      )}
    </Screen>
  );
}

function PitchPhoto({ uri, label, large = false }: { uri?: string; label: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();
  return uri && !failed ? (
    <Image source={{ uri }} accessibilityLabel={label} resizeMode="cover" style={styles.photo} onError={() => setFailed(true)} />
  ) : (
    <View style={styles.photoFallback}>
      <Ionicons name="football-outline" size={large ? 44 : 24} color={colors.greyDark} />
      {large ? <Text style={styles.subtitle}>{t('pitches.noPhoto')}</Text> : null}
    </View>
  );
}

function PitchStatus({ status }: { status: PitchRecord['status'] }) {
  const { t } = useTranslation();
  const label = { active: 'pitches.statusActive', paused: 'pitches.statusPaused', archived: 'pitches.statusArchived' }[status];
  const color = status === 'active' ? '#78D9AE' : status === 'paused' ? colors.orange : colors.greyDark;
  return <View style={styles.status}><View style={[styles.statusDot, { backgroundColor: color }]} /><Text style={[styles.statusText, { color }]}>{t(label)}</Text></View>;
}

function PitchDetails({ pitch, desktop }: { pitch: PitchRecord; desktop: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = (pitch.image_urls ?? []).filter(Boolean);
  const photo = photos[Math.min(photoIndex, Math.max(photos.length - 1, 0))];
  const durations = [...(pitch.allowed_durations_minutes?.length ? pitch.allowed_durations_minutes : [pitch.duration_minutes])].sort((a, b) => a - b);

  return (
    <View style={[styles.detail, desktop && styles.desktopDetail]}>
      <View style={desktop ? styles.desktopIdentityRow : undefined}>
        <View style={[styles.hero, desktop && styles.desktopHero]}><PitchPhoto key={photo ?? 'empty'} uri={photo} label={pitch.name} large /></View>
        <View style={[styles.detailHeading, desktop && styles.desktopDetailHeading]}>
          <View style={styles.detailHeadingText}>
            <View style={styles.nameRow}><Text accessibilityRole="header" style={styles.pitchTitle}>{pitch.name}</Text><PitchStatus status={pitch.status} /></View>
            <View style={styles.location}><Ionicons name="location-outline" size={15} color={colors.grey} /><Text style={styles.locationText}>{[pitch.city, pitch.area].filter(Boolean).join(' · ')}</Text></View>
            {pitch.address ? <Text style={styles.address}>{pitch.address}</Text> : null}
          </View>
        </View>
      </View>
      {photos.length > 1 ? (
        <ScrollView horizontal style={[styles.gallery, desktop && styles.desktopGallery]} contentContainerStyle={styles.galleryContent} showsHorizontalScrollIndicator>
          {photos.map((uri, index) => <Pressable key={`${uri}-${index}`} onPress={() => setPhotoIndex(index)} accessibilityRole="button" accessibilityLabel={t('pitches.viewPhoto', { index: index + 1 })} accessibilityState={{ selected: uri === photo }} style={[styles.thumbnail, desktop && styles.desktopThumbnail, uri === photo && styles.thumbnailSelected]}>
            <PitchPhoto uri={uri} label={t('pitches.viewPhoto', { index: index + 1 })} />
          </Pressable>)}
        </ScrollView>
      ) : null}

      <View style={[styles.specs, desktop && styles.desktopSpecs]}>
        <Spec icon="people-outline" label={t('pitches.formatLabel')} value={pitch.format} />
        {pitch.pitch_type ? <Spec icon="layers-outline" label={t('pitches.typeLabel')} value={pitch.pitch_type} /> : null}
        <Spec icon="pricetag-outline" label={t('pitches.priceLabel')} value={t('pitches.perHour', { price: Number(pitch.price_per_hour).toFixed(2) })} />
        <Spec icon="time-outline" label={t('pitches.matchDurationLabel')} value={durations.map((minutes) => t('pitches.minutesSuffix', { minutes })).join(' / ')} />
      </View>
      <View style={desktop ? styles.desktopSections : undefined}>
      {pitch.description ? <View style={[styles.section, desktop && styles.desktopSection]}><Text style={styles.sectionTitle}>{t('pitches.descriptionLabel')}</Text><Text style={[styles.description, desktop && styles.desktopDescription]}>{pitch.description}</Text></View> : null}
      {pitch.facilities?.length ? <View style={[styles.section, desktop && styles.desktopSection]}><Text style={styles.sectionTitle}>{t('pitches.facilitiesLabel')}</Text><View style={[styles.facilities, desktop && styles.desktopFacilities]}>
        {pitch.facilities.map((facility, index) => <View key={`${facility}-${index}`} style={styles.facility}><Ionicons name={facilityIcons[facility.trim().toLowerCase()] ?? 'checkmark-circle-outline'} size={19} color={colors.grey} /><Text style={styles.facilityText}>{facility}</Text></View>)}
      </View></View> : null}
      </View>
      <View style={[styles.actions, desktop && styles.desktopActions]}>
        {pitch.maps_url ? <Pressable style={styles.outlineButton} onPress={() => Linking.openURL(pitch.maps_url!)} accessibilityRole="link"><Ionicons name="location-outline" size={15} color={colors.blueLight} /><Text style={styles.actionText}>{t('pitches.openInMaps')}</Text></Pressable> : null}
        <Pressable style={styles.primaryButton} accessibilityRole="button" onPress={() => router.push({ pathname: '/booking-settings', params: { pitchId: pitch.id } })}>
          <Ionicons name="options-outline" size={15} color={colors.blackText} /><Text style={styles.primaryText}>{t('pitches.manageBookingSettings')}</Text>
        </Pressable>
      </View>
      <View style={[styles.supportNote, desktop && styles.desktopSupportNote]}>
        <Ionicons name="information-circle-outline" size={15} color={colors.greyDark} />
        <Text style={styles.supportText}>{t('pitches.noteText')}</Text>
      </View>
    </View>
  );
}

function Spec({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return <View style={styles.spec}><Text style={styles.specLabel}>{label}</Text><View style={styles.specValueRow}><Ionicons name={icon} size={18} color={colors.grey} /><Text style={styles.specValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  canvas: { backgroundColor: '#08111A' },
  content: { paddingTop: 18, paddingBottom: 100 },
  desktopContent: { paddingTop: 14, paddingBottom: 12, minHeight: 0 },
  desktopHeading: { marginBottom: 12, flexShrink: 0 },
  desktopWorkspace: { flex: 1, minHeight: 0 },
  desktopNavigator: { width: 280, minHeight: 0 },
  // The list scrolls independently; it cannot push the detail panel off screen.
  desktopDetail: { padding: 16, minHeight: 0, overflow: 'hidden' },
  desktopIdentityRow: { flexDirection: 'row', alignItems: 'stretch', gap: 28, flexShrink: 0 },
  // Keep the pitch image square and size the identity column to the same visual scale.
  desktopHero: { width: 250, height: 250, aspectRatio: 1, flexGrow: 0, flexShrink: 0, minHeight: 0, maxHeight: 250 },
  desktopGallery: { marginTop: 6, flexShrink: 0, height: 46 },
  desktopThumbnail: { width: 68, height: 40 },
  desktopDetailHeading: { flex: 1, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', marginVertical: 0, gap: 18, flexShrink: 1, minWidth: 0, maxWidth: 360 },
  desktopSpecs: { paddingVertical: 14, gap: 14, flexShrink: 0 },
  desktopSections: { flexDirection: 'row', gap: 28, flexShrink: 0 },
  desktopSection: { flex: 1, minWidth: 0, marginTop: 16, gap: 8 },
  desktopDescription: { fontSize: 13, lineHeight: 20 },
  desktopFacilities: { gap: 12 },
  desktopActions: { marginTop: 16, paddingTop: 12, flexShrink: 0 },
  desktopSupportNote: { marginTop: 12, justifyContent: 'flex-start', flexShrink: 0 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 22 },
  headingText: { flexGrow: 1, flexBasis: 260 },
  title: { color: colors.white, fontSize: 24, fontWeight: '600', letterSpacing: -0.6 },
  subtitle: { color: colors.grey, fontSize: 12, marginTop: 3 },
  centerBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 36, maxWidth: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.card },
  centerName: { color: colors.white, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  workspace: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft, overflow: 'hidden' },
  workspaceCompact: { flexDirection: 'column' },
  navigator: { width: 280, padding: 14, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.card },
  navigatorCompact: { width: '100%', borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  search: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, marginBottom: 12, backgroundColor: colors.backgroundSoft },
  searchInput: { flex: 1, minWidth: 0, color: colors.white, fontSize: 14, paddingVertical: 10 },
  clearSearch: { padding: 4 },
  pitchList: { flex: 1, minHeight: 0 },
  pitchListCompact: { maxHeight: 230 },
  pitchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, marginBottom: 8, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  pitchRowSelected: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft, borderRadius: 4 },
  listPhoto: { width: 62, height: 76, borderRadius: 5, overflow: 'hidden' },
  listInfo: { flex: 1, minWidth: 0, gap: 4 },
  listName: { color: colors.white, fontSize: 13, fontWeight: '600' },
  listMeta: { color: colors.grey, fontSize: 12 },
  detail: { flex: 1, minWidth: 0, padding: 18 },
  photo: { width: '100%', height: '100%' },
  photoFallback: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.cardSoft },
  hero: { width: '100%', aspectRatio: 2.5, minHeight: 150, maxHeight: 330, borderRadius: 7, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  gallery: { marginTop: 10, flexGrow: 0 },
  galleryContent: { gap: 8, paddingBottom: 4 },
  thumbnail: { width: 94, height: 60, borderWidth: 2, borderColor: colors.border, borderRadius: 6, overflow: 'hidden' },
  thumbnailSelected: { borderColor: colors.blueLight },
  detailHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginVertical: 20 },
  detailHeadingText: { flexGrow: 1, flexBasis: 240, minWidth: 0 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  pitchTitle: { color: colors.white, fontSize: 24, fontWeight: '600', letterSpacing: -0.6, flexShrink: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  locationText: { color: colors.grey, fontSize: 12, flexShrink: 1 },
  address: { color: colors.greyDark, fontSize: 12, marginTop: 5 },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.borderBlue, borderRadius: 7, backgroundColor: colors.blueSoft, maxWidth: '100%' },
  selectedText: { color: colors.blueLight, fontSize: 11, fontWeight: '600', flexShrink: 1 },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingVertical: 17, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  spec: { flexGrow: 1, flexBasis: '21%', minWidth: 120, gap: 8 },
  specLabel: { color: colors.grey, fontSize: 12 },
  specValueRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  specValue: { color: colors.white, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  section: { marginTop: 20, gap: 9 },
  sectionTitle: { color: colors.white, fontSize: 13, fontWeight: '600' },
  description: { color: colors.grey, fontSize: 13, lineHeight: 21 },
  facilities: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  facility: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  facilityText: { color: colors.grey, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  outlineButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 31, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft, maxWidth: '100%' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 31, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7, backgroundColor: colors.blueLight, maxWidth: '100%' },
  actionText: { color: colors.blueLight, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  primaryText: { color: colors.blackText, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  empty: { color: colors.grey, fontSize: 13, textAlign: 'center', paddingVertical: 32, paddingHorizontal: 12 },
  supportNote: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 7, marginTop: 14 },
  supportText: { color: colors.greyDark, fontSize: 11, lineHeight: 17, flexShrink: 1 },
});
