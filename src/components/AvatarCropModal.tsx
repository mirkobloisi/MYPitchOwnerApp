import React, { useEffect, useMemo } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useTranslation } from '../i18n/LanguageContext';
import { AppColors, weeklineColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/layout';

const CROP_SIZE = 280;
const MAX_GESTURE_SCALE = 4;

type AvatarCropModalProps = {
  visible: boolean;
  imageUri: string | null;
  imageWidth: number;
  imageHeight: number;
  cropShape?: 'circle' | 'rectangle';
  cropAspectRatio?: number;
  cropWidth?: number;
  onCancel: () => void;
  /** originX/originY/size are in the ORIGINAL image's own pixel coordinates. */
  onConfirm: (crop: { originX: number; originY: number; size: number; width: number; height: number }) => void;
};

// A custom circular crop selector: neither platform's native picker editor
// gives us that. Android's launchImageLibraryAsync supports shape: 'oval',
// but iOS's UIImagePickerController editor is always a plain rectangle -
// there is no OS-level oval/circle crop option on iOS at all. Built with
// gesture-handler + reanimated (both already dependencies of expo-router)
// rather than pulling in a native cropping library, so it works the same
// in Expo Go as everywhere else.
export default function AvatarCropModal({
  visible,
  imageUri,
  imageWidth,
  imageHeight,
  cropShape = 'circle',
  cropAspectRatio = 1,
  cropWidth = CROP_SIZE,
  onCancel,
  onConfirm,
}: AvatarCropModalProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { width: viewportWidth } = useWindowDimensions();
  const palette = Platform.OS === 'web' ? weeklineColors : colors;
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const frameWidth = Math.min(cropWidth, Math.max(180, viewportWidth - 96));
  const frameHeight = frameWidth / Math.max(0.25, cropAspectRatio);
  const baseScale = imageWidth > 0 && imageHeight > 0
    ? Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
    : 1;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (!visible || !imageUri) return;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [visible, imageUri, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  // Keeps the crop circle fully covered by the image at all times - without
  // this a fast drag or pinch-out could leave empty space inside the circle.
  function clampTranslation(x: number, y: number, currentScale: number) {
    'worklet';
    const displayWidth = imageWidth * baseScale * currentScale;
    const displayHeight = imageHeight * baseScale * currentScale;
    const maxX = Math.max(0, (displayWidth - frameWidth) / 2);
    const maxY = Math.max(0, (displayHeight - frameHeight) / 2);

    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  const panGesture = Gesture.Pan().minPointers(1).maxPointers(1).onUpdate((event) => {
    const clamped = clampTranslation(
      savedTranslateX.value + event.translationX,
      savedTranslateY.value + event.translationY,
      scale.value
    );
    translateX.value = clamped.x;
    translateY.value = clamped.y;
  }).onEnd(() => {
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
  });

  const pinchGesture = Gesture.Pinch().onUpdate((event) => {
    const nextScale = Math.min(MAX_GESTURE_SCALE, Math.max(1, savedScale.value * event.scale));
    scale.value = nextScale;

    const clamped = clampTranslation(translateX.value, translateY.value, nextScale);
    translateX.value = clamped.x;
    translateY.value = clamped.y;
  }).onEnd(() => {
    savedScale.value = scale.value;
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
  });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  function zoomBy(factor: number) {
    const nextScale = Math.min(MAX_GESTURE_SCALE, Math.max(1, scale.value * factor));
    scale.value = nextScale;
    savedScale.value = nextScale;
    const clamped = clampTranslation(translateX.value, translateY.value, nextScale);
    translateX.value = clamped.x;
    translateY.value = clamped.y;
    savedTranslateX.value = clamped.x;
    savedTranslateY.value = clamped.y;
  }

  function resetCrop() {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  function handleConfirm() {
    // Called from a plain onPress (JS thread), so shared values can just be
    // read directly - no worklet/runOnJS needed, those are for code that
    // has to run on the UI thread (the gesture callbacks above).
    const effectiveScale = baseScale * scale.value;
    const displayWidth = imageWidth * baseScale * scale.value;
    const displayHeight = imageHeight * baseScale * scale.value;

    // The image's rendered top-left corner, relative to the crop circle's
    // own top-left - centered by default, then shifted by the pan.
    const imageLeft = (frameWidth - displayWidth) / 2 + translateX.value;
    const imageTop = (frameHeight - displayHeight) / 2 + translateY.value;

    // Where the crop circle's bounding box falls inside the ORIGINAL image,
    // in the image's own pixel coordinates.
    const originX = Math.min(
      Math.max(0, -imageLeft / effectiveScale),
      imageWidth - frameWidth / effectiveScale
    );
    const originY = Math.min(
      Math.max(0, -imageTop / effectiveScale),
      imageHeight - frameHeight / effectiveScale
    );
    const width = frameWidth / effectiveScale;
    const height = frameHeight / effectiveScale;

    onConfirm({ originX, originY, size: width, width, height });
  }

  if (!imageUri) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={t('common.cancel')} />
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t('avatarCrop.title')}</Text>
              <Text style={styles.subtitle}>{t('avatarCrop.subtitle')}</Text>
            </View>
            <Pressable onPress={onCancel} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.stage}>
            <View style={styles.cropArea}>
              <GestureDetector gesture={composedGesture}>
                <View style={[styles.cropFrame, {
                  width: frameWidth,
                  height: frameHeight,
                  borderRadius: cropShape === 'circle' ? frameWidth / 2 : 8,
                }]}>
                  <Animated.Image
                    source={{ uri: imageUri }}
                    style={[
                      {
                        width: imageWidth * baseScale,
                        height: imageHeight * baseScale,
                        left: (frameWidth - imageWidth * baseScale) / 2,
                        top: (frameHeight - imageHeight * baseScale) / 2,
                        position: 'absolute',
                      },
                      imageAnimatedStyle,
                    ]}
                  />
                </View>
              </GestureDetector>
              <View pointerEvents="none" style={[styles.cropFrameRing, {
                width: frameWidth + 4,
                height: frameHeight + 4,
                borderRadius: cropShape === 'circle' ? (frameWidth + 4) / 2 : 10,
                top: '50%' as any,
                left: '50%' as any,
                marginTop: -(frameHeight + 4) / 2,
                marginLeft: -(frameWidth + 4) / 2,
              }]} />
            </View>
            <View style={styles.zoomControls}>
              <Pressable onPress={() => zoomBy(1 / 1.2)} style={styles.zoomButton} accessibilityRole="button" accessibilityLabel="Zoom out"><Text style={styles.zoomText}>−</Text></Pressable>
              <Pressable onPress={resetCrop} style={[styles.zoomButton, styles.fitButton]} accessibilityRole="button" accessibilityLabel="Reset crop"><Text style={styles.fitText}>Fit</Text></Pressable>
              <Pressable onPress={() => zoomBy(1.2)} style={styles.zoomButton} accessibilityRole="button" accessibilityLabel="Zoom in"><Text style={styles.zoomText}>+</Text></Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancelButton} accessibilityRole="button">
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable onPress={handleConfirm} style={styles.confirmButton} accessibilityRole="button">
              <Text style={styles.confirmText}>{t('avatarCrop.usePhoto')}</Text>
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(3, 9, 15, 0.78)' },
    dialog: { width: 'min(760px, 96%)' as any, maxWidth: 760, maxHeight: '92%', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 14, shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 24 },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingBottom: 13,
      borderBottomWidth: 1,
      borderColor: colors.borderSoft,
    },
    headerText: { flex: 1, gap: 3 },
    title: {
      color: colors.white,
      fontSize: 17,
      fontWeight: '700',
    },
    subtitle: {
      color: colors.grey,
      fontSize: 11,
      lineHeight: 15,
    },
    stage: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 18,
      gap: 14,
    },
    cropArea: {
      maxWidth: '100%' as any,
      minHeight: 84,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    cropFrame: {
      overflow: 'hidden',
      backgroundColor: colors.cardDark,
      cursor: 'grab' as any,
    },
    cropFrameRing: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: colors.blueLight,
    },
    closeButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: colors.cardSoft, cursor: 'pointer' as any },
    closeText: { color: colors.greySoft, fontSize: 21, lineHeight: 24 },
    zoomControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    zoomButton: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft, cursor: 'pointer' as any },
    fitButton: { width: 46 },
    zoomText: { color: colors.white, fontSize: 19, lineHeight: 22, fontWeight: '600' },
    fitText: { color: colors.greySoft, fontSize: 11, fontWeight: '600' },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      paddingTop: 13,
      borderTopWidth: 1,
      borderColor: colors.borderSoft,
    },
    cancelButton: { minWidth: 84, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft, cursor: 'pointer' as any },
    cancelText: { color: colors.greySoft, fontSize: 12, fontWeight: '600' },
    confirmButton: { minWidth: 104, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 7, borderWidth: 1, borderColor: colors.blueLight, backgroundColor: colors.blueLight, cursor: 'pointer' as any },
    confirmText: { color: colors.blackText, fontSize: 12, fontWeight: '700' },
  });
