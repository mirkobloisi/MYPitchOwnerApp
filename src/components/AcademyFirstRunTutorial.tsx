import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { weeklineColors } from '../theme/palettes';

type Props = {
  visible: boolean;
  step: number;
  academyName: string;
  onStepChange: (step: number) => void;
  onSkip: () => void;
  onOpenAcademy: () => void;
  t: (key: string) => string;
};

const STEP_KEYS = [
  ['academy.tutorialStepOneTitle', 'academy.tutorialStepOneBody', 'create-outline'],
  ['academy.tutorialStepTwoTitle', 'academy.tutorialStepTwoBody', 'people-outline'],
  ['academy.tutorialStepThreeTitle', 'academy.tutorialStepThreeBody', 'person-add-outline'],
  ['academy.tutorialStepFourTitle', 'academy.tutorialStepFourBody', 'calendar-outline'],
] as const;

export default function AcademyFirstRunTutorial({
  visible,
  step,
  academyName,
  onStepChange,
  onSkip,
  onOpenAcademy,
  t,
}: Props) {
  const activeStep = Math.max(0, Math.min(STEP_KEYS.length - 1, step));
  const [titleKey, bodyKey, icon] = STEP_KEYS[activeStep];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal accessibilityRole="summary">
          <View style={styles.header}>
            <View style={styles.headerIcon}><Ionicons name="school-outline" size={20} color={weeklineColors.blueLight} /></View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('academy.tutorialTitle')}</Text>
              <Text style={styles.academyName} numberOfLines={1}>{academyName}</Text>
            </View>
            <Pressable onPress={onSkip} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('academy.tutorialSkip')}>
              <Ionicons name="close" size={19} color={weeklineColors.greySoft} />
            </Pressable>
          </View>

          <View style={styles.progressTrack} accessibilityLabel={t('academy.tutorialStepCount').replace('{current}', String(activeStep + 1)).replace('{total}', String(STEP_KEYS.length))}>
            {STEP_KEYS.map((_, index) => <View key={index} style={[styles.progressSegment, index <= activeStep && styles.progressSegmentActive]} />)}
          </View>

          <Text style={styles.stepCount}>{t('academy.tutorialStepCount').replace('{current}', String(activeStep + 1)).replace('{total}', String(STEP_KEYS.length))}</Text>
          <View style={styles.stepIcon}><Ionicons name={icon} size={22} color={weeklineColors.blueLight} /></View>
          <Text style={styles.stepTitle}>{t(titleKey)}</Text>
          <Text style={styles.stepBody}>{t(bodyKey)}</Text>

          <View style={styles.footer}>
            <Pressable onPress={onSkip} style={styles.skipButton} accessibilityRole="button">
              <Text style={styles.skipText}>{t('academy.tutorialSkip')}</Text>
            </Pressable>
            <View style={styles.footerActions}>
              {activeStep > 0 ? (
                <Pressable onPress={() => onStepChange(activeStep - 1)} style={styles.backButton} accessibilityRole="button">
                  <Ionicons name="chevron-back" size={16} color={weeklineColors.greySoft} />
                  <Text style={styles.backText}>{t('academy.tutorialBack')}</Text>
                </Pressable>
              ) : null}
              {activeStep < STEP_KEYS.length - 1 ? (
                <Pressable onPress={() => onStepChange(activeStep + 1)} style={styles.nextButton} accessibilityRole="button">
                  <Text style={styles.nextText}>{t('academy.tutorialNext')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={weeklineColors.blackText} />
                </Pressable>
              ) : (
                <Pressable onPress={onOpenAcademy} style={styles.nextButton} accessibilityRole="button">
                  <Text style={styles.nextText}>{t('academy.tutorialOpenAcademy')}</Text>
                  <Ionicons name="arrow-forward" size={16} color={weeklineColors.blackText} />
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
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: weeklineColors.greySoft, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  academyName: { color: weeklineColors.white, fontSize: 14, fontWeight: '700', marginTop: 3 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: weeklineColors.border },
  progressTrack: { flexDirection: 'row', gap: 6, marginTop: 21 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#263846' },
  progressSegmentActive: { backgroundColor: weeklineColors.blueLight },
  stepCount: { color: weeklineColors.blueLight, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, textTransform: 'uppercase', marginTop: 21 },
  stepIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#18384D', marginTop: 13 },
  stepTitle: { color: weeklineColors.white, fontSize: 23, lineHeight: 29, fontWeight: '900', marginTop: 15 },
  stepBody: { color: weeklineColors.greySoft, fontSize: 15, lineHeight: 23, marginTop: 9 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 26, paddingTop: 17, borderTopWidth: 1, borderTopColor: weeklineColors.border },
  skipButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 4 },
  skipText: { color: weeklineColors.grey, fontSize: 13, fontWeight: '700' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: weeklineColors.border },
  backText: { color: weeklineColors.greySoft, fontSize: 13, fontWeight: '800' },
  nextButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 11, backgroundColor: weeklineColors.blueLight },
  nextText: { color: weeklineColors.blackText, fontSize: 13, fontWeight: '900' },
});
