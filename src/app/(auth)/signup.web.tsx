import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import Screen from '../../components/Screen';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../lib/auth';
import { getRememberMe, setRememberMe } from '../../lib/rememberMe';
import { weeklineColors as colors } from '../../theme/palettes';

const accessCopy = {
  en: {
    kicker: 'Owner access',
    headline: 'Bring your venue to MYPitch.',
    description: 'Set up your owner account and bring your pitches, bookings and academy into one clear workspace.',
    benefitBookings: 'Manage pitches and bookings',
    benefitAcademy: 'Organise academy teams',
    benefitActivity: 'Follow venue activity',
    cardKicker: 'Join MYPitch',
    cardTitle: 'Request owner access',
    cardIntro: 'A few details to get started. MYPitch reviews each owner request.',
    venueDetails: 'Venue details',
    yourAccount: 'Your account',
    show: 'Show',
    hide: 'Hide',
    back: 'Back to sign in',
    submit: 'Request access',
    successIntro: 'Your details have been received.',
  },
  el: {
    kicker: 'Πρόσβαση ιδιοκτήτη',
    headline: 'Φέρτε τον χώρο σας στο MYPitch.',
    description: 'Δημιουργήστε λογαριασμό ιδιοκτήτη και διαχειριστείτε γήπεδα, κρατήσεις και ακαδημία σε έναν χώρο.',
    benefitBookings: 'Διαχείριση γηπέδων και κρατήσεων',
    benefitAcademy: 'Οργάνωση ομάδων ακαδημίας',
    benefitActivity: 'Παρακολούθηση δραστηριότητας',
    cardKicker: 'Ελάτε στο MYPitch',
    cardTitle: 'Αίτηση πρόσβασης ιδιοκτήτη',
    cardIntro: 'Λίγα στοιχεία για να ξεκινήσετε. Το MYPitch εξετάζει κάθε αίτηση.',
    venueDetails: 'Στοιχεία χώρου',
    yourAccount: 'Ο λογαριασμός σας',
    show: 'Εμφάνιση',
    hide: 'Απόκρυψη',
    back: 'Πίσω στη σύνδεση',
    submit: 'Αίτηση πρόσβασης',
    successIntro: 'Λάβαμε τα στοιχεία σας.',
  },
  ru: {
    kicker: 'Доступ владельца',
    headline: 'Добавьте свой спортивный комплекс в MYPitch.',
    description: 'Создайте аккаунт владельца и управляйте полями, бронированиями и академией в одном месте.',
    benefitBookings: 'Управляйте полями и бронированиями',
    benefitAcademy: 'Организуйте команды академии',
    benefitActivity: 'Следите за работой комплекса',
    cardKicker: 'Присоединяйтесь к MYPitch',
    cardTitle: 'Запросить доступ владельца',
    cardIntro: 'Укажите несколько данных. MYPitch рассматривает каждую заявку.',
    venueDetails: 'Данные комплекса',
    yourAccount: 'Ваш аккаунт',
    show: 'Показать',
    hide: 'Скрыть',
    back: 'Назад ко входу',
    submit: 'Отправить заявку',
    successIntro: 'Мы получили ваши данные.',
  },
};

export default function SignupWebScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { t, language } = useLanguage();
  const { width, height } = useWindowDimensions();
  const copy = accessCopy[language] ?? accessCopy.en;
  const compact = width < 900;
  const singleColumnFields = width < 570;

  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(getRememberMe());
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitted, setSubmitted] = useState<'session' | 'confirmEmail' | null>(null);

  const contactRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus {
        -webkit-text-fill-color: #f2f7fa !important;
        box-shadow: 0 0 0 1000px #0b1a26 inset !important;
        caret-color: #f2f7fa;
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  async function handleSignup() {
    if (isSubmitting) return;
    setErrorMessage('');

    if (!businessName.trim() || !contactName.trim() || !phone.trim() || !email.trim()) {
      setErrorMessage(t('signup.errorRequired'));
      return;
    }
    if (password.length < 6) {
      setErrorMessage(t('signup.errorPasswordLength'));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t('signup.errorPasswordMatch'));
      return;
    }

    setRememberMe(remember);
    setIsSubmitting(true);
    try {
      const { error, needsEmailConfirmation } = await signUp({
        email: email.trim(),
        password,
        businessName: businessName.trim(),
        contactName: contactName.trim(),
        phone: phone.trim(),
      });
      if (error) {
        setErrorMessage(error);
      } else {
        setSubmitted(needsEmailConfirmation ? 'confirmEmail' : 'session');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('signup.errorRequired'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const fieldWidth = singleColumnFields ? styles.fullField : styles.halfField;

  return (
    <Screen maxWidth={2400} ambientGlows={false} contentStyle={styles.screenContent}>
      <View style={[styles.page, { minHeight: Math.max(height, compact ? 780 : 720) }]}>
        <LinearGradient colors={['#0B2435', '#091B29', '#08131D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.glow} pointerEvents="none" />
        <View style={styles.pitchLines} pointerEvents="none"><View style={styles.midline} /><View style={styles.centerCircle} /><View style={styles.penaltyBox} /></View>

        <View style={[styles.header, compact && styles.headerCompact]}>
          <Image source={require('../../../assets/images/mypitch-weekline-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="MYPitch" />
          <Pressable onPress={() => router.replace('/login')} style={styles.backButton} accessibilityRole="button">
            <Ionicons name="arrow-back-outline" size={16} color={colors.blueLight} />
            <Text style={styles.backText}>{copy.back}</Text>
          </Pressable>
        </View>

        <View style={[styles.main, compact && styles.mainCompact]}>
          <View style={[styles.intro, compact && styles.introCompact]}>
            <Text style={styles.kicker}>{copy.kicker}</Text>
            <Text accessibilityRole="header" style={[styles.headline, compact && styles.headlineCompact]}>{copy.headline}</Text>
            <Text style={styles.description}>{copy.description}</Text>
            {!compact ? <View style={styles.benefits}>
              <Benefit icon="calendar-outline" label={copy.benefitBookings} />
              <Benefit icon="people-outline" label={copy.benefitAcademy} />
              <Benefit icon="bar-chart-outline" label={copy.benefitActivity} />
            </View> : null}
          </View>

          <View style={[styles.card, compact && styles.cardCompact]}>
            {submitted ? (
              <View style={styles.success}>
                <View style={styles.successIcon}><Ionicons name="checkmark" size={27} color={colors.blueLight} /></View>
                <Text style={styles.cardKicker}>{copy.successIntro}</Text>
                <Text accessibilityRole="header" style={styles.cardTitle}>{t('signup.successTitle')}</Text>
                <Text style={styles.successText}>
                  {submitted === 'confirmEmail' ? t('signup.successConfirmEmailText') : t('signup.successText')}
                </Text>
                <Pressable style={styles.primaryButton} onPress={() => router.replace('/login')} accessibilityRole="button">
                  <Text style={styles.primaryButtonText}>{t('signup.backToLogin')}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.cardKicker}>{copy.cardKicker}</Text>
                <Text accessibilityRole="header" style={styles.cardTitle}>{copy.cardTitle}</Text>
                <Text style={styles.cardIntro}>{copy.cardIntro}</Text>

                <Text style={styles.sectionLabel}>{copy.venueDetails}</Text>
                <View style={styles.fields}>
                  <View style={styles.fullField}>
                    <Text style={styles.label}>{t('signup.businessNameLabel')}</Text>
                    <TextInput value={businessName} onChangeText={setBusinessName} placeholder={t('signup.businessNamePlaceholder')} placeholderTextColor="#7693A5" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => contactRef.current?.focus()} style={styles.input} accessibilityLabel={t('signup.businessNameLabel')} />
                  </View>
                  <View style={fieldWidth}>
                    <Text style={styles.label}>{t('signup.contactNameLabel')}</Text>
                    <TextInput ref={contactRef} value={contactName} onChangeText={setContactName} placeholder={t('signup.contactNamePlaceholder')} placeholderTextColor="#7693A5" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => phoneRef.current?.focus()} style={styles.input} accessibilityLabel={t('signup.contactNameLabel')} />
                  </View>
                  <View style={fieldWidth}>
                    <Text style={styles.label}>{t('signup.phoneLabel')}</Text>
                    <TextInput ref={phoneRef} value={phone} onChangeText={setPhone} placeholder={t('signup.phonePlaceholder')} placeholderTextColor="#7693A5" keyboardType="phone-pad" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => emailRef.current?.focus()} style={styles.input} accessibilityLabel={t('signup.phoneLabel')} />
                  </View>
                </View>

                <Text style={styles.sectionLabel}>{copy.yourAccount}</Text>
                <View style={styles.fields}>
                  <View style={styles.fullField}>
                    <Text style={styles.label}>{t('signup.emailLabel')}</Text>
                    <TextInput ref={emailRef} value={email} onChangeText={setEmail} placeholder={t('signup.emailPlaceholder')} placeholderTextColor="#7693A5" autoCapitalize="none" keyboardType="email-address" autoComplete="email" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} style={styles.input} accessibilityLabel={t('signup.emailLabel')} />
                  </View>
                  <View style={fieldWidth}>
                    <Text style={styles.label}>{t('signup.passwordLabel')}</Text>
                    <View style={styles.passwordWrap}>
                      <TextInput ref={passwordRef} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#7693A5" secureTextEntry={!showPassword} autoComplete="new-password" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmRef.current?.focus()} style={[styles.input, styles.passwordInput]} accessibilityLabel={t('signup.passwordLabel')} />
                      <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.showButton} accessibilityRole="button" accessibilityLabel={showPassword ? copy.hide : copy.show}><Text style={styles.showText}>{showPassword ? copy.hide : copy.show}</Text></Pressable>
                    </View>
                  </View>
                  <View style={fieldWidth}>
                    <Text style={styles.label}>{t('signup.confirmPasswordLabel')}</Text>
                    <View style={styles.passwordWrap}>
                      <TextInput ref={confirmRef} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" placeholderTextColor="#7693A5" secureTextEntry={!showConfirmPassword} autoComplete="new-password" returnKeyType="go" onSubmitEditing={handleSignup} style={[styles.input, styles.passwordInput]} accessibilityLabel={t('signup.confirmPasswordLabel')} />
                      <Pressable onPress={() => setShowConfirmPassword((value) => !value)} style={styles.showButton} accessibilityRole="button" accessibilityLabel={showConfirmPassword ? copy.hide : copy.show}><Text style={styles.showText}>{showConfirmPassword ? copy.hide : copy.show}</Text></Pressable>
                    </View>
                  </View>
                </View>

                <Pressable style={styles.rememberRow} onPress={() => setRemember((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: remember }}>
                  <View style={[styles.checkbox, remember && styles.checkboxChecked]}>{remember ? <Ionicons name="checkmark" size={13} color={colors.blackText} /> : null}</View>
                  <Text style={styles.rememberText}>{t('signup.rememberMe')}</Text>
                </Pressable>

                {errorMessage ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{errorMessage}</Text> : null}
                <Pressable onPress={handleSignup} disabled={isSubmitting} style={[styles.primaryButton, isSubmitting && styles.disabled]} accessibilityRole="button">
                  {isSubmitting ? <ActivityIndicator size="small" color={colors.blackText} /> : null}
                  <Text style={styles.primaryButtonText}>{copy.submit}</Text>
                  {!isSubmitting ? <Ionicons name="arrow-forward-outline" size={16} color={colors.blackText} /> : null}
                </Pressable>
                <Text style={styles.reviewNote}>{t('signup.subtitle')}</Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Screen>
  );
}

function Benefit({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return <View style={styles.benefit}><View style={styles.benefitIcon}><Ionicons name={icon} size={20} color={colors.blueLight} /></View><Text style={styles.benefitText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  page: { width: '100%', backgroundColor: '#08131D', overflow: 'hidden' },
  glow: { position: 'absolute', width: 560, height: 560, top: -280, right: -150, borderRadius: 280, backgroundColor: 'rgba(35,117,165,0.13)' },
  pitchLines: { position: 'absolute', width: 560, height: 440, left: -250, bottom: -145, borderWidth: 1, borderColor: 'rgba(110,191,240,0.13)', borderRadius: 15, transform: [{ rotate: '-20deg' }], opacity: 0.65 },
  midline: { position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeftWidth: 1, borderLeftColor: 'rgba(110,191,240,0.13)' },
  centerCircle: { position: 'absolute', width: 150, height: 150, left: '36%', top: '33%', borderRadius: 75, borderWidth: 1, borderColor: 'rgba(110,191,240,0.13)' },
  penaltyBox: { position: 'absolute', width: 100, height: '54%', right: 0, top: '23%', borderWidth: 1, borderRightWidth: 0, borderColor: 'rgba(110,191,240,0.13)' },
  header: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 34, paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  headerCompact: { paddingHorizontal: 22, paddingTop: 12 },
  logo: { width: 182, height: 62 },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#35566A', borderRadius: 9, backgroundColor: '#102636' },
  backText: { color: '#D5E9F4', fontSize: 13, fontWeight: '700' },
  main: { width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 44, paddingHorizontal: 34, paddingTop: 32, paddingBottom: 50, zIndex: 2 },
  mainCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 23, paddingHorizontal: 22, paddingTop: 15, paddingBottom: 35 },
  intro: { flex: 0.82, minWidth: 0, alignSelf: 'flex-start', paddingTop: 56 },
  introCompact: { flex: 0, paddingTop: 10 },
  kicker: { color: '#70C4FC', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  headline: { color: '#F5FAFD', fontSize: 43, lineHeight: 49, fontWeight: '800', letterSpacing: -1.5, marginTop: 16, maxWidth: 440 },
  headlineCompact: { fontSize: 31, lineHeight: 36, marginTop: 9, maxWidth: 680 },
  description: { color: '#ABC3D1', fontSize: 15, lineHeight: 23, marginTop: 16, maxWidth: 430 },
  benefits: { gap: 23, marginTop: 35 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  benefitIcon: { width: 42, height: 42, borderRadius: 11, borderWidth: 1, borderColor: '#244E67', backgroundColor: '#123249', alignItems: 'center', justifyContent: 'center' },
  benefitText: { color: '#C9DCE7', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  card: { flex: 1.18, minWidth: 0, maxWidth: 560, borderRadius: 15, borderWidth: 1, borderColor: '#33566A', backgroundColor: '#0D1D29', padding: 27 },
  cardCompact: { flex: 0, maxWidth: 720, width: '100%', alignSelf: 'center', padding: 20 },
  cardKicker: { color: '#70C4FC', fontSize: 11, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  cardTitle: { color: '#F5FAFD', fontSize: 27, fontWeight: '800', letterSpacing: -0.6, marginTop: 7 },
  cardIntro: { color: '#9FB8C8', fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 20 },
  sectionLabel: { color: '#75C5F4', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 11 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  fullField: { width: '100%' },
  halfField: { width: '48.5%' },
  label: { color: '#D7E5EE', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { width: '100%', height: 43, paddingHorizontal: 13, borderWidth: 1, borderColor: '#355061', borderRadius: 8, backgroundColor: '#0B1A26', color: '#F2F7FA', fontSize: 14, fontWeight: '500' },
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 65 },
  showButton: { position: 'absolute', right: 4, top: 3, minWidth: 56, height: 37, alignItems: 'center', justifyContent: 'center' },
  showText: { color: '#82C8F5', fontSize: 12, fontWeight: '700' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 21, marginBottom: 18 },
  checkbox: { width: 17, height: 17, borderWidth: 1, borderColor: '#46657A', borderRadius: 4, backgroundColor: '#0B1A26', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { borderColor: colors.blueLight, backgroundColor: colors.blueLight },
  rememberText: { color: '#B5CAD6', fontSize: 12, fontWeight: '500', flexShrink: 1 },
  errorText: { color: colors.red, fontSize: 13, marginBottom: 12 },
  primaryButton: { minHeight: 47, width: '100%', borderRadius: 9, backgroundColor: '#68BFF8', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  primaryButtonText: { color: '#071520', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  reviewNote: { color: '#7897A7', fontSize: 11, lineHeight: 16, marginTop: 13, textAlign: 'center' },
  success: { paddingVertical: 28, alignItems: 'center' },
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#14354A', borderWidth: 1, borderColor: '#3A7292', alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  successText: { color: '#B6CEDC', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 14, marginBottom: 26, maxWidth: 420 },
});
