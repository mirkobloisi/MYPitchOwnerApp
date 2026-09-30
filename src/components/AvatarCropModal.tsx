import React, { useEffect, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useTranslation } from '../i18n/LanguageContext';
import { AppColors } from '../theme/palettes';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/layout';
import AppButton from './AppButton';

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
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const frameWidth = cropWidth;
  const frameHeight = cropWidth / Math.max(0.25, cropAspectRatio);
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
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('avatarCrop.title')}</Text>
          <Text style={styles.subtitle}>{t('avatarCrop.subtitle')}</Text>
        </View>

        <View style={styles.stage}>
          <GestureDetector gesture={composedGesture}>
            <View style={[styles.cropFrame, {
              width: frameWidth,
              height: frameHeight,
              borderRadius: cropShape === 'circle' ? frameWidth / 2 : 10,
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
            borderRadius: cropShape === 'circle' ? (frameWidth + 4) / 2 : 12,
            top: '50%' as any,
            left: '50%' as any,
            marginTop: -(frameHeight + 4) / 2,
            marginLeft: -(frameWidth + 4) / 2,
          }]} />
          <View style={styles.zoomControls}>
            <Pressable onPress={() => zoomBy(1 / 1.2)} style={styles.zoomButton} accessibilityLabel="Zoom out"><Text style={styles.zoomText}>−</Text></Pressable>
            <Pressable onPress={() => zoomBy(1.2)} style={styles.zoomButton} accessibilityLabel="Zoom in"><Text style={styles.zoomText}>+</Text></Pressable>
          </View>
        </View>

        <View style={styles.actions}>
          <View style={styles.actionHalf}>
            <AppButton title={t('common.cancel')} variant="outline" onPress={onCancel} />
          </View>
          <View style={styles.actionHalf}>
            <AppButton title={t('avatarCrop.usePhoto')} onPress={handleConfirm} />
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
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
      paddingTop: 64,
      paddingBottom: spacing.xl,
    },
    header: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    title: {
      color: colors.white,
      fontSize: 22,
      fontWeight: '900',
    },
    subtitle: {
      color: colors.grey,
      fontSize: 13,
      fontWeight: '600',
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    stage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    cropFrame: {
      overflow: 'hidden',
      backgroundColor: colors.cardDark,
    },
    cropFrameRing: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: colors.greenLight,
    },
    zoomControls: { flexDirection: 'row', gap: spacing.sm },
    zoomButton: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, cursor: 'pointer' as any },
    zoomText: { color: colors.white, fontSize: 20, lineHeight: 24, fontWeight: '600' },
    actions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xl,
    },
    actionHalf: {
      flex: 1,
    },
  });
