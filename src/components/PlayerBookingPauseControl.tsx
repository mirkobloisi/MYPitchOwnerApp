import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTranslation } from '../i18n/LanguageContext';
import { PitchRecord, useAuth } from '../lib/auth';
import { setPitchPlayerBookingPaused } from '../lib/pitchData';
import { weeklineColors as colors } from '../theme/palettes';

export default function PlayerBookingPauseControl({ pitch }: { pitch: PitchRecord }) {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const styles = useMemo(() => makeStyles(), []);
  const isPaused = pitch.player_booking_paused;

  async function confirm() {
    if (saving) return;
    const cleanedReason = reason.trim();
    if (!isPaused && !cleanedReason) {
      setError(t('pitches.pauseReasonRequired'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      await setPitchPlayerBookingPaused({
        pitchId: pitch.id,
        paused: !isPaused,
        reason: isPaused ? null : cleanedReason,
      });
      await refresh();
      setVisible(false);
      setReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('pitches.pauseError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <View style={styles.control}>
        <Pressable
          accessibilityRole="button"
          onPress={() => { setError(''); setReason(''); setVisible(true); }}
          style={[styles.trigger, isPaused ? styles.resumeTrigger : styles.pauseTrigger]}
        >
          <Ionicons name={isPaused ? 'play-outline' : 'pause-outline'} size={15} color={isPaused ? colors.blueLight : colors.orange} />
          <Text style={[styles.triggerText, isPaused ? styles.resumeText : styles.pauseText]}>
            {t(isPaused ? 'pitches.resumeBookings' : 'pitches.pauseBookings')}
          </Text>
        </Pressable>

        {isPaused ? (
          <View style={styles.statusNote}>
            <Ionicons name="pause-circle-outline" size={14} color={colors.orange} />
            <Text style={styles.statusText}>
              {pitch.player_booking_pause_reason
                ? `${t('pitches.bookingsPaused')} · ${pitch.player_booking_pause_reason}`
                : t('pitches.bookingsPaused')}
            </Text>
          </View>
        ) : null}
      </View>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <View style={styles.heading}>
              <View style={[styles.headingIcon, isPaused ? styles.resumeIcon : styles.pauseIcon]}>
                <Ionicons name={isPaused ? 'play-outline' : 'pause-outline'} size={19} color={isPaused ? colors.blueLight : colors.orange} />
              </View>
              <View style={styles.headingCopy}>
                <Text style={styles.title}>{t(isPaused ? 'pitches.resumeDialogTitle' : 'pitches.pauseDialogTitle')}</Text>
                <Text style={styles.pitchName} numberOfLines={1}>{pitch.name}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={() => setVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={19} color={colors.grey} />
              </Pressable>
            </View>

            <Text style={styles.message}>{t(isPaused ? 'pitches.resumeDialogMessage' : 'pitches.pauseDialogMessage')}</Text>

            {!isPaused ? (
              <View style={styles.reasonGroup}>
                <Text style={styles.reasonLabel}>{t('pitches.pauseReasonLabel')}</Text>
                <TextInput
                  value={reason}
                  onChangeText={(value) => { setReason(value.slice(0, 500)); setError(''); }}
                  placeholder={t('pitches.pauseReasonPlaceholder')}
                  placeholderTextColor={colors.greyDark}
                  maxLength={500}
                  multiline
                  textAlignVertical="top"
                  style={styles.reasonInput}
                />
                <Text style={styles.characterCount}>{reason.length}/500</Text>
              </View>
            ) : pitch.player_booking_pause_reason ? (
              <View style={styles.previousReason}>
                <Text style={styles.reasonLabel}>{t('pitches.pauseReasonLabel')}</Text>
                <Text style={styles.previousReasonText}>{pitch.player_booking_pause_reason}</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.footer}>
              <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={confirm} style={[styles.confirmButton, isPaused ? styles.resumeConfirm : styles.pauseConfirm, saving && styles.disabled]}>
                {saving ? <ActivityIndicator size="small" color={isPaused ? colors.blackText : colors.white} /> : <Ionicons name={isPaused ? 'play-outline' : 'pause-outline'} size={16} color={isPaused ? colors.blackText : colors.white} />}
                <Text style={[styles.confirmText, isPaused && styles.resumeConfirmText]}>{t(isPaused ? 'pitches.resumeConfirm' : 'pitches.pauseConfirm')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = () => StyleSheet.create({
  control: { flexDirection: 'column', alignItems: 'flex-start', gap: 5 },
  trigger: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, maxWidth: '100%' },
  pauseTrigger: { borderColor: 'rgba(255, 149, 0, 0.38)', backgroundColor: 'rgba(255, 149, 0, 0.10)' },
  resumeTrigger: { borderColor: colors.borderBlue, backgroundColor: colors.blueSoft },
  triggerText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  pauseText: { color: colors.orange },
  resumeText: { color: colors.blueLight },
  statusNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  statusText: { flex: 1, color: colors.orange, fontSize: 11, lineHeight: 16 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(2, 8, 14, 0.72)' },
  dialog: { width: '100%', maxWidth: 500, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0C1721', gap: 14, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  headingIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pauseIcon: { backgroundColor: 'rgba(255, 149, 0, 0.10)', borderColor: 'rgba(255, 149, 0, 0.35)' },
  resumeIcon: { backgroundColor: colors.blueSoft, borderColor: colors.borderBlue },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.white, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  pitchName: { color: colors.grey, fontSize: 12, marginTop: 2 },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: '#101E2A' },
  message: { color: colors.greySoft, fontSize: 13, lineHeight: 19 },
  reasonGroup: { gap: 6 },
  reasonLabel: { color: colors.white, fontSize: 12, fontWeight: '600' },
  reasonInput: { minHeight: 90, maxHeight: 160, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 11, color: colors.white, backgroundColor: '#08131D', fontSize: 13, lineHeight: 18 },
  characterCount: { alignSelf: 'flex-end', color: colors.greyDark, fontSize: 10 },
  previousReason: { padding: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: '#101E2A', gap: 5 },
  previousReasonText: { color: colors.greySoft, fontSize: 12, lineHeight: 17 },
  error: { color: colors.red, fontSize: 12 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
  cancelButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: '#101E2A' },
  cancelText: { color: colors.greySoft, fontSize: 12, fontWeight: '600' },
  confirmButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 7 },
  pauseConfirm: { backgroundColor: colors.orange },
  resumeConfirm: { backgroundColor: colors.blueLight },
  confirmText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  resumeConfirmText: { color: colors.blackText },
  disabled: { opacity: 0.65 },
});
