import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { weeklineColors } from '../theme/palettes';

type Props = {
  visible: boolean;
  onClose: () => void;
  /**
   * Offered on the last step while the owner has no academy yet, so the guide
   * ends on the one thing to do next. Leave it out once an academy exists.
   */
  onCreateAcademy?: () => void;
  t: (key: string) => string;
};

const STEPS = [
  ['academy.guideStepOneTitle', 'academy.guideStepOneBody', 'school-outline'],
  ['academy.guideStepTwoTitle', 'academy.guideStepTwoBody', 'shield-outline'],
  ['academy.guideStepThreeTitle', 'academy.guideStepThreeBody', 'people-outline'],
  ['academy.guideStepFourTitle', 'academy.guideStepFourBody', 'calendar-outline'],
] as const;

/**
 * The short Academy walkthrough. It opens by itself the first time an owner
 * lands on the Academy tab with no academy (see useAcademyGuide) and from then
 * on only when the owner taps the "Academy guide" button.
 */
export default function AcademyGuideDialog({ visible, onClose, onCreateAcademy, t }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const [titleKey, bodyKey, icon] = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const counter = t('academy.guideStepCount').replace('{current}', String(step + 1)).replace('{total}', String(STEPS.length));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal accessibilityRole="summary">
          <View style={styles.header}>
            <View style={styles.headerIcon}><Ionicons name="school-outline" size={20} color={weeklineColors.blueLight} /></View>
            <Text style={styles.eyebrow}>{t('academy.guideTitle')}</Text>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={19} color={weeklineColors.greySoft} />
            </Pressable>
          </View>

          <View style={styles.progressTrack} accessibilityLabel={counter}>
            {STEPS.map((_, index) => <View key={index} style={[styles.progressSegment, index <= step && styles.progressSegmentActive]} />)}
          </View>

          <Text style={styles.stepCount}>{counter}</Text>
          <View style={styles.stepIcon}><Ionicons name={icon} size={22} color={weeklineColors.blueLight} /></View>
          <Text style={styles.stepTitle}>{t(titleKey)}</Text>
          <Text style={styles.stepBody}>{t(bodyKey)}</Text>

          <View style={styles.footer}>
            {isLast ? <View style={styles.footerSpacer} /> : (
              <Pressable onPress={onClose} style={styles.skipButton} accessibilityRole="button">
                <Text style={styles.skipText}>{t('academy.guideSkip')}</Text>
              </Pressable>
            )}
            <View style={styles.footerActions}>
              {step > 0 ? (
                <Pressable onPress={() => setStep(step - 1)} style={styles.backButton} accessibilityRole="button">
                  <Ionicons name="chevron-back" size={16} color={weeklineColors.greySoft} />
                  <Text style={styles.backText}>{t('academy.guideBack')}</Text>
                </Pressable>
              ) : null}
              {!isLast ? (
                <Pressable onPress={() => setStep(step + 1)} style={styles.nextButton} accessibilityRole="button">
                  <Text style={styles.nextText}>{t('academy.guideNext')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={weeklineColors.blackText} />
                </Pressable>
              ) : onCreateAcademy ? (
                <Pressable onPress={() => { onClose(); onCreateAcademy(); }} style={styles.nextButton} accessibilityRole="button">
                  <Ionicons name="add" size={17} color={weeklineColors.blackText} />
                  <Text style={styles.nextText}>{t('academy.createMainAction')}</Text>
                </Pressable>
              ) : (
                <Pressable onPress={onClose} style={styles.nextButton} accessibilityRole="button">
                  <Text style={styles.nextText}>{t('academy.guideDone')}</Text>
                  <Ionicons name="checkmark" size={17} color={weeklineColors.blackText} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(2, 10, 17, 0.78)' },
  card: { width: '100%', maxWidth: 500, padding: 22, borderRadius: 20, borderWidth: 1, borderColor: '#31536A', backgroundColor: '#0F1D28', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#18384D' },
  eyebrow: { flex: 1, minWidth: 0, color: weeklineColors.white, fontSize: 16, fontWeight: '800' },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: weeklineColors.border },
  progressTrack: { flexDirection: 'row', gap: 6, marginTop: 21 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#263846' },
  progressSegmentActive: { backgroundColor: weeklineColors.blueLight },
  stepCount: { color: weeklineColors.blueLight, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, textTransform: 'uppercase', marginTop: 21 },
  stepIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#18384D', marginTop: 13 },
  stepTitle: { color: weeklineColors.white, fontSize: 23, lineHeight: 29, fontWeight: '900', marginTop: 15 },
  stepBody: { color: weeklineColors.greySoft, fontSize: 15, lineHeight: 23, marginTop: 9 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 26, paddingTop: 17, borderTopWidth: 1, borderTopColor: weeklineColors.border },
  footerSpacer: { flex: 1 },
  skipButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 4 },
  skipText: { color: weeklineColors.grey, fontSize: 13, fontWeight: '700' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: weeklineColors.border },
  backText: { color: weeklineColors.greySoft, fontSize: 13, fontWeight: '800' },
  nextButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 11, backgroundColor: weeklineColors.blueLight },
  nextText: { color: weeklineColors.blackText, fontSize: 13, fontWeight: '900' },
});
