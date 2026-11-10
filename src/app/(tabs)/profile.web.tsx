import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import Screen from '../../components/Screen';
import { AppLanguage, LANGUAGE_OPTIONS, useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { weeklineColors as colors } from '../../theme/palettes';

const SUPPORT_EMAIL = 'mypitch_help@proton.me';
const SUPPORT_PHONE = '+357 95100610';
const SUPPORT_WHATSAPP = 'https://wa.me/35795100610';

type Dialog = 'details' | 'password' | null;
type IconName = keyof typeof Ionicons.glyphMap;

const copy = {
  en: {
    subtitle: 'Your account, preferences and MYPitch support.',
    owner: 'Owner', staff: 'Staff', coach: 'Coach',
    editProfile: 'Edit profile', accountSettings: 'Account settings', account: 'Account',
    personalDetails: 'Personal details', personalHint: 'Name and account information',
    passwordSecurity: 'Password & security', passwordHint: 'Keep your account secure',
    languageHint: 'Choose your workspace language', currentLanguage: 'Current language',
    contact: 'Contact MYPitch', emailSupport: 'Email support', whatsapp: 'WhatsApp',
    help: 'Need a hand with your workspace? Contact our support team and we’ll help you get moving.',
    name: 'Name', phone: 'Phone number', email: 'Email address',
    emailReadOnly: 'To change your sign-in email, contact MYPitch support.',
    currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Confirm new password',
    cancel: 'Cancel', save: 'Save changes', changePassword: 'Change password', saving: 'Saving…',
    requiredName: 'Enter your name.', requiredPassword: 'Enter your current password.',
    shortPassword: 'Use at least 6 characters.', passwordMismatch: 'The new passwords do not match.',
    saved: 'Your changes were saved.', passwordSaved: 'Your password was changed.',
    unavailable: 'Your account information is unavailable. Please try again.',
  },
  el: {
    subtitle: 'Ο λογαριασμός, οι προτιμήσεις και η υποστήριξή σας.',
    owner: 'Ιδιοκτήτης', staff: 'Προσωπικό', coach: 'Προπονητής',
    editProfile: 'Επεξεργασία προφίλ', accountSettings: 'Ρυθμίσεις λογαριασμού', account: 'Λογαριασμός',
    personalDetails: 'Προσωπικά στοιχεία', personalHint: 'Όνομα και στοιχεία λογαριασμού',
    passwordSecurity: 'Κωδικός και ασφάλεια', passwordHint: 'Προστατέψτε τον λογαριασμό σας',
    languageHint: 'Επιλέξτε γλώσσα', currentLanguage: 'Τρέχουσα γλώσσα',
    contact: 'Επικοινωνία με MYPitch', emailSupport: 'Υποστήριξη email', whatsapp: 'WhatsApp',
    help: 'Χρειάζεστε βοήθεια; Επικοινωνήστε με την ομάδα υποστήριξης.',
    name: 'Όνομα', phone: 'Τηλέφωνο', email: 'Διεύθυνση email',
    emailReadOnly: 'Για αλλαγή του email σύνδεσης, επικοινωνήστε με την υποστήριξη.',
    currentPassword: 'Τρέχων κωδικός', newPassword: 'Νέος κωδικός', confirmPassword: 'Επιβεβαίωση νέου κωδικού',
    cancel: 'Ακύρωση', save: 'Αποθήκευση', changePassword: 'Αλλαγή κωδικού', saving: 'Αποθήκευση…',
    requiredName: 'Εισαγάγετε το όνομά σας.', requiredPassword: 'Εισαγάγετε τον τρέχοντα κωδικό.',
    shortPassword: 'Χρησιμοποιήστε τουλάχιστον 6 χαρακτήρες.', passwordMismatch: 'Οι νέοι κωδικοί δεν ταιριάζουν.',
    saved: 'Οι αλλαγές αποθηκεύτηκαν.', passwordSaved: 'Ο κωδικός σας άλλαξε.',
    unavailable: 'Τα στοιχεία λογαριασμού δεν είναι διαθέσιμα. Δοκιμάστε ξανά.',
  },
  ru: {
    subtitle: 'Ваш аккаунт, настройки и поддержка MYPitch.',
    owner: 'Владелец', staff: 'Сотрудник', coach: 'Тренер',
    editProfile: 'Изменить профиль', accountSettings: 'Настройки аккаунта', account: 'Аккаунт',
    personalDetails: 'Личные данные', personalHint: 'Имя и данные аккаунта',
    passwordSecurity: 'Пароль и безопасность', passwordHint: 'Защитите свой аккаунт',
    languageHint: 'Выберите язык', currentLanguage: 'Текущий язык',
    contact: 'Связаться с MYPitch', emailSupport: 'Поддержка по email', whatsapp: 'WhatsApp',
    help: 'Нужна помощь? Свяжитесь с нашей службой поддержки.',
    name: 'Имя', phone: 'Телефон', email: 'Адрес email',
    emailReadOnly: 'Для смены email входа обратитесь в поддержку MYPitch.',
    currentPassword: 'Текущий пароль', newPassword: 'Новый пароль', confirmPassword: 'Подтвердите новый пароль',
    cancel: 'Отмена', save: 'Сохранить', changePassword: 'Изменить пароль', saving: 'Сохранение…',
    requiredName: 'Введите своё имя.', requiredPassword: 'Введите текущий пароль.',
    shortPassword: 'Используйте не менее 6 символов.', passwordMismatch: 'Новые пароли не совпадают.',
    saved: 'Изменения сохранены.', passwordSaved: 'Пароль изменён.',
    unavailable: 'Данные аккаунта недоступны. Попробуйте ещё раз.',
  },
};

export default function ProfileWebScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { language, setLanguage, t } = useLanguage();
  const { session, profile, pitchOwner, refresh, signOut } = useAuth();
  const c = copy[language] ?? copy.en;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const displayName = pitchOwner?.contact_name || profile?.full_name || session?.user.email?.split('@')[0] || 'MYPitch';
  const role = profile?.role === 'coach' ? c.coach : profile?.role === 'staff' ? c.staff : c.owner;
  const compact = width < 1280;
  const narrow = width < 650;

  function openDialog(next: Exclude<Dialog, null>) {
    setError('');
    setNotice('');
    setName(pitchOwner?.contact_name || profile?.full_name || '');
    setPhone(pitchOwner?.phone || '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setDialog(next);
  }

  async function saveDetails() {
    if (!session) { setError(c.unavailable); return; }
    const trimmedName = name.trim();
    if (!trimmedName) { setError(c.requiredName); return; }
    setBusy(true);
    setError('');
    try {
      if (pitchOwner) {
        const { error: updateError } = await supabase.from('pitch_owners')
          .update({ contact_name: trimmedName, phone: phone.trim() || null })
          .eq('id', pitchOwner.id).eq('user_id', session.user.id);
        if (updateError) throw updateError;
      } else {
        const { error: updateError } = await supabase.from('profiles')
          .update({ full_name: trimmedName }).eq('id', session.user.id);
        if (updateError) throw updateError;
      }
      await refresh();
      setDialog(null);
      setNotice(c.saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : c.unavailable);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (!currentPassword) { setError(c.requiredPassword); return; }
    if (newPassword.length < 6) { setError(c.shortPassword); return; }
    if (newPassword !== confirmPassword) { setError(c.passwordMismatch); return; }
    setBusy(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        current_password: currentPassword,
        password: newPassword,
      });
      if (updateError) throw updateError;
      setDialog(null);
      setNotice(c.passwordSaved);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : c.unavailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen maxWidth={1540} ambientGlows={false} contentStyle={styles.content}>
      <View style={styles.pageHeading}>
        <View>
          <Text style={styles.pageTitle}>{t('profile.title')}</Text>
          <Text style={styles.pageSubtitle}>{c.subtitle}</Text>
        </View>
        <Pressable style={styles.bell} onPress={() => router.push('/(tabs)/inbox' as any)} accessibilityRole="button" accessibilityLabel={t('inbox.notifications')}>
          <Ionicons name="notifications-outline" size={20} color={colors.blueLight} />
        </Pressable>
      </View>

      <View style={[styles.identity, narrow && styles.identityNarrow]}>
        <View style={styles.avatar}><Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.identityCopy}>
          <Text style={styles.identityName}>{displayName}</Text>
          <Text style={styles.identityMeta}>{pitchOwner?.business_name || 'MYPitch'}  ·  <Text style={styles.role}>{role}</Text></Text>
        </View>
        <Pressable style={styles.outlineButton} onPress={() => openDialog('details')} accessibilityRole="button">
          <Ionicons name="pencil-outline" size={17} color={colors.white} />
          <Text style={styles.buttonText}>{c.editProfile}</Text>
        </Pressable>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={[styles.columns, compact && styles.columnsStacked]}>
        <View style={[styles.panel, styles.accountPanel, compact && styles.panelFullWidth]}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>{c.accountSettings}</Text>
            <Text style={styles.panelBadge}>{c.account}</Text>
          </View>
          <View style={styles.panelBody}>
            <SettingsRow icon="person-outline" title={c.personalDetails} subtitle={c.personalHint} onPress={() => openDialog('details')} />
            <SettingsRow icon="lock-closed-outline" title={c.passwordSecurity} subtitle={c.passwordHint} onPress={() => openDialog('password')} />
            <View style={styles.settingRow}>
              <View style={styles.rowIcon}><Ionicons name="language-outline" size={19} color={colors.blueLight} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{t('profile.language')}</Text>
                <Text style={styles.rowHint}>{c.languageHint}</Text>
              </View>
            </View>
            <View style={styles.languageSection}>
              <Text style={styles.languageLabel}>{c.currentLanguage}</Text>
              <View style={styles.languages}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <Pressable key={option.code} onPress={() => setLanguage(option.code as AppLanguage)} style={[styles.languagePill, language === option.code && styles.languagePillActive]} accessibilityRole="button" accessibilityState={{ selected: language === option.code }}>
                    <Text style={[styles.languageText, language === option.code && styles.languageTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.panel, compact && styles.panelFullWidth]}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>{c.contact}</Text>
            <Ionicons name="headset-outline" size={20} color={colors.blueLight} />
          </View>
          <ContactRow icon="mail-outline" title={c.emailSupport} value={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
          <ContactRow icon="logo-whatsapp" title={c.whatsapp} value={SUPPORT_PHONE} onPress={() => Linking.openURL(SUPPORT_WHATSAPP)} />
          <View style={styles.helpNote}>
            <Ionicons name="help-circle-outline" size={19} color={colors.blueLight} />
            <Text style={styles.helpText}>{c.help}</Text>
          </View>
        </View>
      </View>

      <View style={styles.bottomActions}>
        <Pressable style={styles.outlineButton} onPress={signOut} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={17} color={colors.white} />
          <Text style={styles.buttonText}>{t('profile.logOut')}</Text>
        </Pressable>
      </View>

      <Modal transparent visible={dialog !== null} animationType="fade" onRequestClose={() => !busy && setDialog(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !busy && setDialog(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{dialog === 'details' ? c.personalDetails : c.passwordSecurity}</Text>
              <Pressable onPress={() => !busy && setDialog(null)} accessibilityRole="button" accessibilityLabel={c.cancel}>
                <Ionicons name="close" size={23} color={colors.grey} />
              </Pressable>
            </View>
            {dialog === 'details' ? (
              <>
                <Field label={c.name} value={name} onChangeText={setName} autoComplete="name" />
                {pitchOwner ? <Field label={c.phone} value={phone} onChangeText={setPhone} autoComplete="tel" /> : null}
                <Field label={c.email} value={session?.user.email || profile?.email || ''} editable={false} />
                <Text style={styles.fieldHint}>{c.emailReadOnly}</Text>
              </>
            ) : (
              <>
                <Field label={c.currentPassword} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" />
                <Field label={c.newPassword} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" />
                <Field label={c.confirmPassword} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" />
              </>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.outlineButton} onPress={() => setDialog(null)} disabled={busy}><Text style={styles.buttonText}>{c.cancel}</Text></Pressable>
              <Pressable style={styles.primaryButton} onPress={dialog === 'details' ? saveDetails : savePassword} disabled={busy}>
                {busy ? <ActivityIndicator size="small" color={colors.blackText} /> : null}
                <Text style={styles.primaryButtonText}>{busy ? c.saving : dialog === 'details' ? c.save : c.changePassword}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function SettingsRow({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={styles.settingRow} onPress={onPress} accessibilityRole="button">
      <View style={styles.rowIcon}><Ionicons name={icon} size={19} color={colors.blueLight} /></View>
      <View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowHint}>{subtitle}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.greyDark} />
    </Pressable>
  );
}

function ContactRow({ icon, title, value, onPress }: { icon: IconName; title: string; value: string; onPress: () => void }) {
  return (
    <Pressable style={styles.contactRow} onPress={onPress} accessibilityRole="link">
      <View style={styles.rowIcon}><Ionicons name={icon} size={19} color={colors.blueLight} /></View>
      <View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.contactValue}>{value}</Text></View>
      <Ionicons name="open-outline" size={17} color={colors.greyDark} />
    </Pressable>
  );
}

function Field({ label, value, onChangeText, editable = true, secureTextEntry, autoComplete }: {
  label: string; value: string; onChangeText?: (value: string) => void; editable?: boolean;
  secureTextEntry?: boolean; autoComplete?: 'name' | 'tel' | 'current-password' | 'new-password';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} editable={editable} secureTextEntry={secureTextEntry}
        autoComplete={autoComplete} style={[styles.input, !editable && styles.inputReadOnly]}
        placeholderTextColor={colors.greyDark} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', paddingHorizontal: 32, paddingTop: 24, paddingBottom: 60 },
  pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 22 },
  pageTitle: { color: colors.white, fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  pageSubtitle: { color: colors.grey, fontSize: 15, marginTop: 5 },
  bell: { width: 42, height: 42, borderRadius: 11, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  identity: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  identityNarrow: { flexWrap: 'wrap' },
  avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSoft, borderWidth: 1, borderColor: colors.blueLight },
  avatarLetter: { color: colors.blueLight, fontSize: 26, fontWeight: '800' },
  identityCopy: { flex: 1, minWidth: 150 },
  identityName: { color: colors.white, fontSize: 22, fontWeight: '800' },
  identityMeta: { color: colors.grey, fontSize: 14, marginTop: 5 },
  role: { color: colors.blueLight, fontWeight: '700' },
  outlineButton: { minHeight: 40, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.backgroundSoft },
  buttonText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  notice: { color: colors.greenLight, fontSize: 14, marginTop: 14 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 18, marginTop: 18 },
  columnsStacked: { flexDirection: 'column' },
  panel: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.card, overflow: 'hidden' },
  panelFullWidth: { width: '100%' },
  accountPanel: { flex: 1.25 },
  panelHead: { minHeight: 58, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  panelTitle: { color: colors.white, fontSize: 18, fontWeight: '800' },
  panelBadge: { color: colors.blueLight, fontSize: 13, fontWeight: '700' },
  panelBody: { paddingHorizontal: 18, paddingBottom: 16 },
  settingRow: { minHeight: 76, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  rowIcon: { width: 39, height: 39, borderRadius: 10, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.white, fontSize: 15, fontWeight: '700' },
  rowHint: { color: colors.grey, fontSize: 13, marginTop: 4 },
  languageSection: { paddingTop: 16 },
  languageLabel: { color: colors.grey, fontSize: 13, marginBottom: 10 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  languagePill: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft },
  languagePillActive: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
  languageText: { color: colors.grey, fontSize: 13, fontWeight: '700' },
  languageTextActive: { color: colors.blueLight },
  contactRow: { minHeight: 79, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  contactValue: { color: colors.blueLight, fontSize: 13, marginTop: 4 },
  helpNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, margin: 18, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.blueSoft },
  helpText: { flex: 1, color: colors.grey, fontSize: 13, lineHeight: 19 },
  bottomActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 490, padding: 22, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  modalTitle: { color: colors.white, fontSize: 21, fontWeight: '800' },
  field: { marginBottom: 15 },
  fieldLabel: { color: colors.greySoft, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 43, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.backgroundSoft, color: colors.white, fontSize: 15 },
  inputReadOnly: { color: colors.greyDark },
  fieldHint: { color: colors.grey, fontSize: 12, marginTop: -8, marginBottom: 12 },
  error: { color: colors.red, fontSize: 13, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  primaryButton: { minHeight: 40, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 9, backgroundColor: colors.blueLight },
  primaryButtonText: { color: colors.blackText, fontSize: 14, fontWeight: '800' },
});
