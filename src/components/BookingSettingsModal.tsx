import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useTranslation } from '../i18n/LanguageContext';
import { PitchRecord, useAuth } from '../lib/auth';
import { updatePitchBookingSettings } from '../lib/pitchData';
import { weeklineColors as colors } from '../theme/palettes';

const DURATION_OPTIONS = [60, 90, 120] as const;

export default function BookingSettingsModal({
  pitch,
  visible,
  onDismiss,
}: {
  pitch: PitchRecord | null;
  visible: boolean;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [allowHalfHour, setAllowHalfHour] = useState(true);
  const [maxDuration, setMaxDuration] = useState<number>(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const styles = useMemo(() => makeStyles(), []);

  useEffect(() => {
    if (!visible || !pitch) return;
    setAllowHalfHour(pitch.allow_half_hour_start ?? true);
    const durations = pitch.allowed_durations_minutes?.length
      ? pitch.allowed_durations_minutes
      : [pitch.duration_minutes];
    setMaxDuration(Math.max(...durations));
    setError('');
  }, [visible, pitch]);

  async function save() {
    if (!pitch || saving) return;
    setSaving(true);
    setError('');
    try {
      await updatePitchBookingSettings({
        pitchId: pitch.id,
        allowHalfHourStart: allowHalfHour,
        // Match lengths remain available in hour/half-hour steps up to the chosen cap.
        allowedDurationsMinutes: DURATION_OPTIONS.filter((minutes) => minutes <= maxDuration),
      });
      await refresh();
      onDismiss();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('bookingSettings.errorSave'));
    } finally {
      setSaving(false);
    }
  }

  if (!pitch) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <View style={styles.heading}>
            <View style={styles.headingIcon}><Ionicons name="options-outline" size={19} color={colors.blueLight} /></View>
            <View style={styles.headingText}>
              <Text style={styles.title}>{t('bookingSettings.title')}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{pitch.name}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onDismiss} style={styles.closeButton}>
              <Ionicons name="close" size={19} color={colors.grey} />
            </Pressable>
          </View>

          <View style={[styles.section, styles.switchSection]}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>{t('bookingSettings.halfHourTitle')}</Text>
              <Text style={styles.sectionSubtitle}>{t('bookingSettings.halfHourSubtitle')}</Text>
            </View>
            <Switch
              value={allowHalfHour}
              onValueChange={setAllowHalfHour}
              trackColor={{ false: colors.cardDark, true: colors.blueSoft }}
              thumbColor={allowHalfHour ? colors.blueLight : colors.greyDark}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('bookingSettings.maxDurationTitle')}</Text>
            <Text style={styles.sectionSubtitle}>{t('bookingSettings.maxDurationSubtitle')}</Text>
            <View style={styles.options}>
              {DURATION_OPTIONS.map((minutes) => {
                const selected = maxDuration === minutes;
                return (
                  <Pressable
                    key={minutes}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setMaxDuration(minutes)}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    {selected ? <Ionicons name="checkmark-circle" size={15} color={colors.blueLight} /> : null}
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {t(minutes === 60 ? 'bookingSettings.duration60' : minutes === 90 ? 'bookingSettings.duration90' : 'bookingSettings.duration120')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.cancelButton}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={save} style={[styles.saveButton, saving && styles.disabled]}>
              {saving ? <ActivityIndicator size="small" color={colors.blackText} /> : <Ionicons name="checkmark" size={16} color={colors.blackText} />}
              <Text style={styles.saveText}>{t('bookingSettings.saveButton')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(2, 8, 14, 0.72)' },
  dialog: { width: '100%', maxWidth: 480, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0C1721', gap: 14, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 2 },
  headingIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSoft, borderWidth: 1, borderColor: colors.borderBlue },
  headingText: { flex: 1, minWidth: 0 },
  title: { color: colors.white, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  subtitle: { color: colors.grey, fontSize: 12, marginTop: 2 },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: '#101E2A' },
  section: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 14, backgroundColor: '#101E2A' },
  switchSection: { flexDirection: 'row', alignItems: 'center' },
  sectionCopy: { flex: 1, paddingRight: 10 },
  sectionTitle: { color: colors.white, fontSize: 13, fontWeight: '600' },
  sectionSubtitle: { color: colors.grey, fontSize: 12, lineHeight: 17, marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  option: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: '#0B151F' },
  optionSelected: { borderColor: colors.blueLight, backgroundColor: 'rgba(34, 175, 255, 0.12)' },
  optionText: { color: colors.greySoft, fontSize: 12, fontWeight: '600' },
  optionTextSelected: { color: colors.blueLight },
  error: { color: colors.red, fontSize: 12 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
  cancelButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: '#101E2A' },
  cancelText: { color: colors.greySoft, fontSize: 12, fontWeight: '600' },
  saveButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 7, backgroundColor: colors.blueLight },
  saveText: { color: colors.blackText, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.65 },
});
