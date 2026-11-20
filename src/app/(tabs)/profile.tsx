import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Switch, Text, View } from 'react-native';

import AnimatedPressable from '../../components/AnimatedPressable';
import AppButton from '../../components/AppButton';
import AppHeader from '../../components/AppHeader';
import AvatarCropModal from '../../components/AvatarCropModal';
import AvatarPickerTrigger from '../../components/AvatarPickerTrigger';
import Screen from '../../components/Screen';
import SectionHeader from '../../components/SectionHeader';
import { useAuth } from '../../lib/auth';
import { cropAndUploadAvatar, PickedAvatarImage } from '../../lib/avatarUpload';
import { supabase } from '../../lib/supabase';
import { AppLanguage, LANGUAGE_OPTIONS, useLanguage } from '../../i18n/LanguageContext';
import { AppColors } from '../../theme/palettes';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/layout';
import { scaleFont } from '../../theme/typography';

const SUPPORT_EMAIL = 'mypitch_help@proton.me';
const SUPPORT_WHATSAPP = 'https://wa.me/35700000000';

export default function ProfileScreen() {
  const { colors, isDark, toggleScheme } = useAppTheme();
  const { pitchOwner, isStaff, refresh, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [pickedAvatarImage, setPickedAvatarImage] = useState<PickedAvatarImage | null>(null);
  const [avatarErrorMessage, setAvatarErrorMessage] = useState('');

  function handleAvatarPicked(image: PickedAvatarImage) {
    setAvatarErrorMessage('');
    setPickedAvatarImage(image);
  }

  function handleAvatarPickError(error: unknown) {
    setAvatarErrorMessage(error instanceof Error ? error.message : t('profile.avatarErrorText'));
  }

  async function handleCropConfirm(crop: { originX: number; originY: number; size: number }) {
    if (!pitchOwner || !pickedAvatarImage) return;

    const image = pickedAvatarImage;
    setPickedAvatarImage(null);
    setIsUploadingAvatar(true);
    setAvatarErrorMessage('');

    try {
      const publicUrl = await cropAndUploadAvatar(pitchOwner.user_id, image, crop);

      const { error } = await supabase
        .from('pitch_owners')
        .update({ logo_url: publicUrl })
        .eq('id', pitchOwner.id);

      if (error) throw error;

      await refresh();
    } catch (error) {
      setAvatarErrorMessage(error instanceof Error ? error.message : t('profile.avatarErrorText'));
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleLogout() {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
  }

  function requestAccountDeletion() {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('profile.deleteEmailSubject'))}&body=${encodeURIComponent(
        `${t('profile.deleteEmailBody')}\n\nBusiness: ${pitchOwner?.business_name ?? ''}`
      )}`
    );
  }

  return (
    <Screen>
      <AppHeader title={t('profile.title')} showBack={false} />

      <View style={styles.heroCard}>
        <AvatarPickerTrigger
          disabled={!pitchOwner || isStaff || isUploadingAvatar}
          onPicked={handleAvatarPicked}
          onError={handleAvatarPickError}
        >
          <View style={styles.avatar}>
            {pitchOwner?.logo_url ? (
              <Image source={{ uri: pitchOwner.logo_url }} style={styles.heroLogo} resizeMode="cover" />
            ) : (
              <View style={styles.heroIcon}>
                <Ionicons name="business-outline" size={26} color={colors.greenLight} />
              </View>
            )}

            <View style={styles.avatarEditBadge}>
              {isUploadingAvatar ? (
                <ActivityIndicator color={colors.blackText} size="small" />
              ) : (
                <Ionicons name="camera" size={13} color={colors.blackText} />
              )}
            </View>
          </View>
        </AvatarPickerTrigger>

        {pitchOwner?.business_name ? (
          <Text style={styles.avatarName}>{pitchOwner.business_name}</Text>
        ) : null}

        {avatarErrorMessage ? <Text style={styles.avatarErrorText}>{avatarErrorMessage}</Text> : null}
      </View>

      <SectionHeader title={t('profile.appearance')} />

      <View style={styles.settingRow}>
        <View>
          <Text style={styles.settingTitle}>{t('profile.darkMode')}</Text>
          <Text style={styles.settingSubtitle}>{t('profile.darkModeSubtitle')}</Text>
        </View>
        <Switch
          value={isDark}
          onValueChange={toggleScheme}
          trackColor={{ false: colors.cardDark, true: colors.greenSoft }}
          thumbColor={isDark ? colors.greenLight : colors.greyDark}
        />
      </View>

      <SectionHeader title={t('profile.language')} />

      <View style={styles.languageRow}>
        {LANGUAGE_OPTIONS.map((option) => (
          <LanguageChip
            key={option.code}
            styles={styles}
            colors={colors}
            label={option.label}
            active={language === option.code}
            onPress={() => setLanguage(option.code as AppLanguage)}
          />
        ))}
      </View>

      <SectionHeader title={t('profile.support')} />

      <AnimatedPressable
        style={styles.supportRow}
        onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
      >
        <Ionicons name="mail-outline" size={18} color={colors.blueLight} />
        <Text style={styles.supportText}>{t('profile.emailSupport')}</Text>
      </AnimatedPressable>

      <AnimatedPressable style={styles.supportRow} onPress={() => Linking.openURL(SUPPORT_WHATSAPP)}>
        <Ionicons name="logo-whatsapp" size={18} color={colors.greenLight} />
        <Text style={styles.supportText}>{t('profile.whatsapp')}</Text>
      </AnimatedPressable>

      <View style={styles.logoutSection}>
        <AppButton title={t('profile.logOut')} variant="ghost" onPress={handleLogout} loading={isSigningOut} />
      </View>

      <AnimatedPressable style={styles.deleteRow} onPress={requestAccountDeletion}>
        <Ionicons name="trash-outline" size={16} color={colors.red} />
        <Text style={styles.deleteText}>{t('profile.deleteAccountRequest')}</Text>
      </AnimatedPressable>

      <AvatarCropModal
        visible={!!pickedAvatarImage}
        imageUri={pickedAvatarImage?.uri ?? null}
        imageWidth={pickedAvatarImage?.width ?? 0}
        imageHeight={pickedAvatarImage?.height ?? 0}
        onCancel={() => setPickedAvatarImage(null)}
        onConfirm={handleCropConfirm}
      />
    </Screen>
  );
}

function LanguageChip({
  styles,
  colors,
  label,
  active,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      pressedScale={0.96}
      style={[styles.languageChip, active && styles.languageChipActive]}
      onPress={onPress}
    >
      <Text style={[styles.languageChipText, active && { color: colors.greenLight }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    avatar: {
      width: 72,
      height: 72,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'visible',
    },
    avatarEditBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 26,
      height: 26,
      borderRadius: radius.round,
      backgroundColor: colors.greenLight,
      borderWidth: 2,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarName: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '800',
      marginTop: spacing.sm,
    },
    avatarErrorText: {
      color: colors.red,
      fontSize: scaleFont(12.5),
      fontWeight: '700',
      marginTop: spacing.sm,
      textAlign: 'center',
    },
    heroCard: {
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      padding: spacing.lg,
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    heroIcon: {
      width: 72,
      height: 72,
      borderRadius: radius.round,
      backgroundColor: colors.greenSoft,
      borderWidth: 1,
      borderColor: colors.borderGreen,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroLogo: {
      width: 72,
      height: 72,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.borderGreen,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.xl,
    },
    settingTitle: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '800',
    },
    settingSubtitle: {
      color: colors.grey,
      fontSize: scaleFont(11),
      fontWeight: '600',
      marginTop: 2,
      maxWidth: 220,
    },
    languageRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    languageChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    languageChipActive: {
      borderColor: colors.borderGreen,
      backgroundColor: colors.greenSoft,
    },
    languageChipText: {
      color: colors.white,
      fontSize: scaleFont(12.5),
      fontWeight: '800',
    },
    supportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    supportText: {
      color: colors.white,
      fontSize: scaleFont(14),
      fontWeight: '700',
    },
    logoutSection: {
      marginTop: spacing.xl,
    },
    deleteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: spacing.lg,
      marginBottom: spacing.xl,
      padding: spacing.sm,
    },
    deleteText: {
      color: colors.red,
      fontSize: scaleFont(12.5),
      fontWeight: '700',
    },
  });
