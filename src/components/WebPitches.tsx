import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import BookingSettingsModal from './BookingSettingsModal';
import PitchPresentationModal from './PitchPresentationModal';
import PlayerBookingPauseControl from './PlayerBookingPauseControl';
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
  const [settingsPitch, setSettingsPitch] = useState<PitchRecord | null>(null);
  const [presentationPitch, setPresentationPitch] = useState<PitchRecord | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visiblePitches = pitches.filter((pitch) =>
    [pitch.name, pitch.city, pitch.area, pitch.format].some((value) =>
      value?.toLocaleLowerCase().includes(normalizedQuery)));
  // Inspecting a pitch does not silently change the Agenda/Availability selection.
  const selectedPitch = visiblePitches.find((pitch) => pitch.id === (previewId ?? activePitch?.id))
    ?? visiblePitches[0];

  if (isDesktop) {
    return <>
      <DesktopPitches pitches={visiblePitches} selectedPitch={selectedPitch} query={query} setQuery={setQuery} setPreviewId={setPreviewId} pitchOwner={pitchOwner} onManageSettings={setSettingsPitch} onEditPitch={setPresentationPitch} />
      <BookingSettingsModal pitch={settingsPitch} visible={!!settingsPitch} onDismiss={() => setSettingsPitch(null)} />
      {presentationPitch ? <PitchPresentationModal key={presentationPitch.id} pitch={presentationPitch} onDismiss={() => setPresentationPitch(null)} /> : null}
    </>;
  }

  return (
    <Screen scroll maxWidth={WIDE_CONTENT_MAX_WIDTH} ambientGlows={false} style={styles.canvas} contentStyle={styles.content}>
      <View style={styles.heading}>
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
        <View style={[styles.workspace, styles.workspaceCompact]}>
          <View style={styles.navigatorCompact}>
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
            <ScrollView style={styles.pitchListCompact} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
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

          {selectedPitch ? <PitchDetails key={selectedPitch.id} pitch={selectedPitch} desktop={false} onManageSettings={() => setSettingsPitch(selectedPitch)} onEditPitch={() => setPresentationPitch(selectedPitch)} /> : (
            <View style={styles.detail}><Text style={styles.empty}>{t('pitches.noSearchResults')}</Text></View>
          )}
        </View>
      )}
      <BookingSettingsModal pitch={settingsPitch} visible={!!settingsPitch} onDismiss={() => setSettingsPitch(null)} />
      {presentationPitch ? <PitchPresentationModal key={presentationPitch.id} pitch={presentationPitch} onDismiss={() => setPresentationPitch(null)} /> : null}
    </Screen>
  );
}

function DesktopPitches({
  pitches, selectedPitch, query, setQuery, setPreviewId, pitchOwner, onManageSettings, onEditPitch,
}: {
  pitches: PitchRecord[]; selectedPitch?: PitchRecord; query: string; setQuery: (value: string) => void; setPreviewId: (value: string) => void;
  pitchOwner?: { business_name?: string | null } | null; onManageSettings: (pitch: PitchRecord) => void; onEditPitch: (pitch: PitchRecord) => void;
}) {
  const { t } = useTranslation();
  const { activePitch } = useAuth();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const filtered = pitches.filter((pitch) => statusFilter === 'all' || pitch.status === statusFilter);
  const displayedPitch = filtered.find((pitch) => pitch.id === selectedPitch?.id) ?? filtered[0];
  return <Screen scroll maxWidth={WIDE_CONTENT_MAX_WIDTH} ambientGlows={false} style={styles.canvas} contentStyle={styles.desktopContent}>
    <View style={[styles.heading, styles.desktopHeading]}><View style={styles.headingText}><Text accessibilityRole="header" style={styles.title}>{t('pitches.title')}</Text><Text style={styles.subtitle}>{t('pitches.subtitle')}</Text></View><View style={styles.desktopPitchBadge}><Ionicons name="business-outline" size={15} color={colors.blueLight} /><Text style={styles.centerName} numberOfLines={1}>{pitchOwner?.business_name?.trim() || t('availability.sportsCenter')}</Text></View></View>
    <View style={styles.venueToolbar}><Text style={styles.venueSectionTitle}>Your pitches <Text style={styles.venueCount}>· {pitches.length}</Text></Text><View style={styles.venueToolbarControls}><View style={styles.desktopSearch}><Ionicons name="search-outline" size={17} color={colors.grey} /><TextInput value={query} onChangeText={setQuery} placeholder={t('pitches.searchPlaceholder')} placeholderTextColor={colors.greyDark} style={styles.desktopSearchInput} /></View><View style={styles.focusedFilters}>{(['all', 'active', 'paused'] as const).map((filter) => <Pressable key={filter} onPress={() => setStatusFilter(filter)} style={[styles.desktopFilter, statusFilter === filter && styles.desktopFilterSelected]}><Text style={[styles.desktopFilterText, statusFilter === filter && styles.desktopFilterTextSelected]}>{filter[0].toUpperCase() + filter.slice(1)}</Text></Pressable>)}</View></View></View>
    <ScrollView horizontal style={styles.venueStrip} contentContainerStyle={styles.venueStripContent} showsHorizontalScrollIndicator={false}>{filtered.map((pitch) => <Pressable key={pitch.id} accessibilityRole="button" accessibilityState={{ selected: pitch.id === displayedPitch?.id }} onPress={() => setPreviewId(pitch.id)} style={[styles.venueTile, pitch.id === displayedPitch?.id && styles.venueTileSelected]}><View style={styles.venueTileImage}><PitchPhoto uri={pitch.image_urls?.[0]} label={pitch.name} /></View><View style={styles.venueTileCopy}><Text style={styles.venueTileName} numberOfLines={1}>{pitch.name}</Text><Text style={styles.venueTileMeta} numberOfLines={1}>{[pitch.city, pitch.area].filter(Boolean).join(' · ') || pitch.format}</Text><PitchStatus status={pitch.status} /></View>{pitch.id === activePitch?.id ? <View style={styles.venueTileAgenda}><Ionicons name="calendar-outline" size={12} color={colors.blueLight} /><Text style={styles.focusedAgendaText}>Agenda</Text></View> : null}</Pressable>)}{filtered.length === 0 ? <Text style={styles.empty}>{pitches.length === 0 ? t('pitches.noPitches') : t('pitches.noSearchResults')}</Text> : null}</ScrollView>
    {displayedPitch ? <DesktopPitchDetails pitch={displayedPitch} onManageSettings={() => onManageSettings(displayedPitch)} onEditPitch={() => onEditPitch(displayedPitch)} /> : null}
  </Screen>;
}

function DesktopPitchDetails({ pitch, onManageSettings, onEditPitch }: { pitch: PitchRecord; onManageSettings: () => void; onEditPitch: () => void }) {
  const { t } = useTranslation();
  const durations = [...(pitch.allowed_durations_minutes?.length ? pitch.allowed_durations_minutes : [pitch.duration_minutes])].sort((a, b) => a - b);
  return <View style={styles.venueOverviewCard}><View style={styles.venueHeroColumn}><View style={styles.venueHero}><PitchPhoto key={pitch.image_urls?.[0] ?? 'empty'} uri={pitch.image_urls?.[0]} label={pitch.name} large /><Pressable onPress={onEditPitch} style={styles.venueCameraButton} accessibilityRole="button" accessibilityLabel="Change pitch picture"><Ionicons name="camera-outline" size={17} color={colors.white} /></Pressable></View>{pitch.description ? <Text style={styles.venueDescription}>{pitch.description}</Text> : null}</View>
    <View style={styles.venueInfoColumn}><View style={styles.venueInfoHeader}><View style={styles.venueInfoIdentity}><Text style={styles.venuePitchName}>{pitch.name}</Text><PitchStatus status={pitch.status} /><Text style={styles.venueAddress}>{[pitch.city, pitch.area, pitch.address].filter(Boolean).join(' · ')}</Text></View><View style={styles.venueActions}><PlayerBookingPauseControl pitch={pitch} />{pitch.maps_url ? <Pressable style={styles.desktopOutlineButton} onPress={() => Linking.openURL(pitch.maps_url!)}><Ionicons name="open-outline" size={15} color={colors.blueLight} /><Text style={styles.desktopButtonText}>{t('pitches.openInMaps')}</Text></Pressable> : null}<Pressable style={styles.desktopPrimaryButton} onPress={onManageSettings}><Ionicons name="options-outline" size={15} color={colors.blackText} /><Text style={styles.desktopPrimaryText}>{t('pitches.manageBookingSettings')}</Text></Pressable></View></View>
      <View style={styles.venueMetrics}><SpecLine label={t('pitches.formatLabel')} value={pitch.format} /><SpecLine label={t('pitches.typeLabel')} value={pitch.pitch_type || 'Outdoor'} /><SpecLine label={t('pitches.priceLabel')} value={`€${Number(pitch.price_per_hour).toFixed(0)} / hour`} /><SpecLine label={t('pitches.matchDurationLabel')} value={durations.map((minutes) => `${minutes} min`).join(' / ')} /></View>
      <View style={styles.venueFacilitiesHeader}><Text style={styles.desktopFacilitiesTitle}>{t('pitches.facilitiesLabel')}</Text><Pressable onPress={onEditPitch} style={styles.facilitiesEditButton}><Ionicons name="create-outline" size={14} color={colors.blueLight} /><Text style={styles.desktopButtonText}>Change / add</Text></Pressable></View><View style={styles.venueFacilities}>{pitch.facilities?.length ? pitch.facilities.map((facility, index) => <View key={`${facility}-${index}`} style={styles.venueFacility}><Ionicons name={facilityIcons[facility.trim().toLowerCase()] ?? 'checkmark-circle-outline'} size={18} color={colors.blueLight} /><Text style={styles.venueFacilityText}>{facility}</Text></View>) : <Text style={styles.venueHint}>No facilities added yet.</Text>}</View>
      <View style={styles.venueNote}><Ionicons name="information-circle-outline" size={16} color={colors.grey} /><Text style={styles.supportText}>{t('pitches.noteText')}</Text></View>
    </View></View>;
}
function SpecLine({ label, value }: { label: string; value: string }) { return <View style={styles.desktopSpecLine}><Text style={styles.desktopCellMuted}>{label}</Text><Text style={styles.desktopCellStrong}>{value}</Text></View>; }

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

function PitchDetails({ pitch, desktop, onManageSettings, onEditPitch }: { pitch: PitchRecord; desktop: boolean; onManageSettings?: () => void; onEditPitch?: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = (pitch.image_urls ?? []).filter(Boolean);
  const photo = photos[Math.min(photoIndex, Math.max(photos.length - 1, 0))];
  const durations = [...(pitch.allowed_durations_minutes?.length ? pitch.allowed_durations_minutes : [pitch.duration_minutes])].sort((a, b) => a - b);

  return (
    <View style={[styles.detail, desktop && styles.desktopDetail]}>
      <View style={desktop ? styles.desktopIdentityRow : undefined}>
        <View style={[styles.hero, desktop && styles.desktopHero]}><PitchPhoto key={photo ?? 'empty'} uri={photo} label={pitch.name} large /><Pressable onPress={onEditPitch} style={styles.venueCameraButton} accessibilityRole="button" accessibilityLabel="Change pitch picture"><Ionicons name="camera-outline" size={17} color={colors.white} /></Pressable></View>
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
      {(pitch.facilities?.length || onEditPitch) ? <View style={[styles.section, desktop && styles.desktopSection]}><View style={styles.mobileFacilitiesHeader}><Text style={styles.sectionTitle}>{t('pitches.facilitiesLabel')}</Text>{onEditPitch ? <Pressable onPress={onEditPitch} style={styles.facilitiesEditButton}><Ionicons name="create-outline" size={14} color={colors.blueLight} /><Text style={styles.desktopButtonText}>Change / add</Text></Pressable> : null}</View><View style={[styles.facilities, desktop && styles.desktopFacilities]}>
        {pitch.facilities?.length ? pitch.facilities.map((facility, index) => <View key={`${facility}-${index}`} style={styles.facility}><Ionicons name={facilityIcons[facility.trim().toLowerCase()] ?? 'checkmark-circle-outline'} size={19} color={colors.grey} /><Text style={styles.facilityText}>{facility}</Text></View>) : <Text style={styles.venueHint}>No facilities added yet.</Text>}
      </View></View> : null}
      </View>
      <View style={[styles.actions, desktop && styles.desktopActions]}>
        {pitch.maps_url ? <Pressable style={styles.outlineButton} onPress={() => Linking.openURL(pitch.maps_url!)} accessibilityRole="link"><Ionicons name="location-outline" size={15} color={colors.blueLight} /><Text style={styles.actionText}>{t('pitches.openInMaps')}</Text></Pressable> : null}
        <Pressable style={styles.primaryButton} accessibilityRole="button" onPress={onManageSettings ?? (() => router.push({ pathname: '/booking-settings', params: { pitchId: pitch.id } }))}>
          <Ionicons name="options-outline" size={15} color={colors.blackText} /><Text style={styles.primaryText}>{t('pitches.manageBookingSettings')}</Text>
        </Pressable>
        <PlayerBookingPauseControl pitch={pitch} />
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
  desktopContent: { flex: 1, minHeight: 0, paddingTop: 14, paddingBottom: 12 },
  desktopHeading: { marginBottom: 12, flexShrink: 0, minHeight: 44 },
  venueToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  venueSectionTitle: { color: colors.white, fontSize: 16, fontWeight: '600' },
  venueCount: { color: colors.grey, fontSize: 13, fontWeight: '400' },
  venueToolbarControls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  venueStrip: { flexGrow: 0, marginBottom: 14 },
  venueStripContent: { gap: 9, paddingBottom: 2 },
  venueTile: { position: 'relative', width: 218, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.card },
  venueTileSelected: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
  venueTileImage: { width: 60, height: 58, flexShrink: 0, overflow: 'hidden', borderRadius: 5, backgroundColor: colors.cardSoft },
  venueTileCopy: { flex: 1, minWidth: 0, gap: 3 },
  venueTileName: { color: colors.white, fontSize: 13, fontWeight: '600' },
  venueTileMeta: { color: colors.grey, fontSize: 11 },
  venueTileAgenda: { position: 'absolute', right: 6, top: 5, flexDirection: 'row', alignItems: 'center', gap: 2 },
  venueOverviewCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 20, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft },
  venueHeroColumn: { flex: 0.9, minWidth: 270, gap: 10 },
  venueHero: { position: 'relative', width: '100%' as any, aspectRatio: 1.38, minHeight: 200, maxHeight: 330, overflow: 'hidden', borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft },
  venueCameraButton: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(8,17,26,0.88)' },
  venueDescription: { color: colors.greySoft, fontSize: 13, lineHeight: 19 },
  venueInfoColumn: { flex: 1.1, minWidth: 330, justifyContent: 'space-between', gap: 12 },
  venueInfoHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  venueInfoIdentity: { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  venuePitchName: { color: colors.white, fontSize: 21, lineHeight: 27, fontWeight: '600' },
  venueAddress: { width: '100%' as any, color: colors.grey, fontSize: 12 },
  venueActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7 },
  venueMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingVertical: 13, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  venueFacilitiesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  mobileFacilitiesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  facilitiesEditButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 30, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.borderBlue, borderRadius: 6 },
  venueFacilities: { minHeight: 52, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', gap: 13 },
  venueFacility: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueFacilityText: { color: colors.greySoft, fontSize: 12 },
  venueHint: { color: colors.grey, fontSize: 12 },
  venueNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
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
  desktopDescription: { color: colors.greySoft, fontSize: 13, lineHeight: 20 },
  desktopFacilities: { gap: 12 },
  desktopActions: { marginTop: 16, paddingTop: 12, flexShrink: 0 },
  desktopSupportNote: { marginTop: 12, justifyContent: 'flex-start', flexShrink: 0 },
  focusedWorkspace: { flex: 1, minHeight: 520, flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft, overflow: 'hidden' },
  focusedNavigator: { width: 312, flexShrink: 0, minHeight: 0, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.card },
  focusedNavigatorHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, gap: 11 },
  focusedNavigatorTitle: { color: colors.white, fontSize: 16, fontWeight: '600' },
  focusedNavigatorCount: { color: colors.grey, fontSize: 12, marginTop: 3 },
  focusedFilters: { flexDirection: 'row', gap: 6 },
  focusedFilter: { flex: 1, minWidth: 0, height: 36, paddingHorizontal: 6 },
  focusedFilterText: { fontSize: 13 },
  focusedSearch: { width: '100%' as any, height: 40, marginBottom: 0 },
  focusedPitchList: { flex: 1, minHeight: 0 },
  focusedPitchRow: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 90, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  focusedPitchRowSelected: { backgroundColor: colors.blueSoft, borderLeftColor: colors.blueLight },
  focusedPitchPhoto: { width: 64, height: 64, flexShrink: 0, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.cardSoft },
  focusedPitchInfo: { flex: 1, minWidth: 0, gap: 4 },
  focusedPitchName: { color: colors.white, fontSize: 14, fontWeight: '600' },
  focusedPitchMeta: { color: colors.grey, fontSize: 12 },
  focusedAgendaMark: { position: 'absolute', right: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  focusedAgendaText: { color: colors.blueLight, fontSize: 10, fontWeight: '600' },
  focusedDetail: { flex: 1, minWidth: 0, minHeight: 0, padding: 14 },
  focusedEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  desktopPitchBadge: { maxWidth: 250, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  desktopSearch: { width: 250, height: 36, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.card },
  desktopSearchInput: { flex: 1, color: colors.white, fontSize: 13, paddingVertical: 6 },
  desktopFilter: { height: 32, minWidth: 58, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.card },
  desktopFilterSelected: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
  desktopFilterText: { color: colors.greySoft, fontSize: 13, fontWeight: '600' },
  desktopFilterTextSelected: { color: colors.blueLight, fontWeight: '600' },
  desktopCellStrong: { color: colors.white, fontSize: 14, fontWeight: '600' },
  desktopCellMuted: { color: colors.grey, fontSize: 13, lineHeight: 20, flex: 1 },
  desktopOutlineButton: { minHeight: 31, flexDirection: 'row', flexShrink: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.borderBlue, borderRadius: 7 },
  desktopPrimaryButton: { minHeight: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 7, backgroundColor: colors.blueLight },
  desktopButtonText: { color: colors.blueLight, fontSize: 13, fontWeight: '600' },
  desktopPrimaryText: { color: colors.blackText, fontSize: 13, fontWeight: '600' },
  desktopDetailCard: { flex: 1, minHeight: 0, justifyContent: 'space-between', padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft },
  desktopDetailTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 12 },
  desktopDetailActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  desktopDetailTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  desktopDetailTitle: { color: colors.white, fontSize: 18, fontWeight: '600' },
  desktopDetailDivider: { width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 3 },
  desktopSelectedText: { color: colors.blueLight, fontSize: 13 },
  desktopDetailBody: { flexDirection: 'row', alignItems: 'stretch', gap: 20, minHeight: 250, maxHeight: 280 },
  desktopDetailImage: { width: '32%' as any, height: 260, flexGrow: 0, flexShrink: 0, borderRadius: 6, overflow: 'hidden' },
  desktopDescriptionColumn: { flex: 1.5, paddingVertical: 3, borderRightWidth: 1, borderRightColor: colors.border, paddingRight: 16 },
  desktopFacilitiesTitle: { color: colors.white, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  desktopDetailFacilities: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  desktopDetailFacility: { alignItems: 'center', gap: 3, minWidth: 56 },
  desktopDetailStats: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  desktopSpecLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  desktopDetailNote: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 22 },
  headingText: { flexGrow: 1, flexBasis: 260 },
  title: { color: colors.white, fontSize: 32.4, lineHeight: 39.6, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { color: colors.grey, fontSize: 14.4, lineHeight: 20, marginTop: 3 },
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
  hero: { position: 'relative', width: '100%', aspectRatio: 2.5, minHeight: 150, maxHeight: 330, borderRadius: 7, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
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
