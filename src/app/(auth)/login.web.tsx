import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
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

const welcomeCopy = {
  en: {
    eyebrow: 'MYPitch owner workspace',
    headline: 'Everything at your venue,',
    headlineAccent: 'in one clear view.',
    description: 'Keep bookings, academy activity and availability together in a workspace built for the people running the game.',
    foot: 'Built for the way your venue works',
    signInKicker: 'Owner sign in',
    welcome: 'Welcome back.',
    intro: 'Sign in to continue to your MYPitch workspace.',
    email: 'Email address',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    show: 'Show',
    hide: 'Hide',
    signIn: 'Sign in',
    newHere: 'New to MYPitch?',
    requestAccess: 'Request owner access',
  },
  el: {
    eyebrow: 'Χώρος ιδιοκτήτη MYPitch',
    headline: 'Όλα για τον χώρο σας,',
    headlineAccent: 'σε μια καθαρή εικόνα.',
    description: 'Κρατήστε κρατήσεις, ακαδημία και διαθεσιμότητα μαζί σε έναν χώρο για όσους οργανώνουν το παιχνίδι.',
    foot: 'Φτιαγμένο για τον τρόπο που λειτουργεί ο χώρος σας',
    signInKicker: 'Σύνδεση ιδιοκτήτη',
    welcome: 'Καλώς ήρθατε ξανά.',
    intro: 'Συνδεθείτε για να συνεχίσετε στον χώρο σας στο MYPitch.',
    email: 'Διεύθυνση email',
    password: 'Κωδικός πρόσβασης',
    passwordPlaceholder: 'Εισαγάγετε τον κωδικό σας',
    show: 'Εμφάνιση',
    hide: 'Απόκρυψη',
    signIn: 'Σύνδεση',
    newHere: 'Νέος στο MYPitch;',
    requestAccess: 'Αίτηση πρόσβασης ιδιοκτήτη',
  },
  ru: {
    eyebrow: 'Кабинет владельца MYPitch',
    headline: 'Всё для вашего комплекса',
    headlineAccent: 'в одном месте.',
    description: 'Управляйте бронированиями, академией и доступностью в едином пространстве для тех, кто организует игру.',
    foot: 'Создано для работы вашего комплекса',
    signInKicker: 'Вход владельца',
    welcome: 'С возвращением.',
    intro: 'Войдите, чтобы продолжить работу в MYPitch.',
    email: 'Адрес email',
    password: 'Пароль',
    passwordPlaceholder: 'Введите пароль',
    show: 'Показать',
    hide: 'Скрыть',
    signIn: 'Войти',
    newHere: 'Впервые в MYPitch?',
    requestAccess: 'Запросить доступ владельца',
  },
};

export default function LoginWebScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { t, language } = useLanguage();
  const { width, height } = useWindowDimensions();
  const compact = width < 820;
  const copy = welcomeCopy[language] ?? welcomeCopy.en;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(getRememberMe());
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const passwordRef = useRef<TextInput>(null);

  async function handleLogin() {
    if (isSubmitting) return;
    if (!email.trim() || !password) {
      setErrorMessage(t('login.errorEnterCredentials'));
      return;
    }

    // The existing session adapter selects local or tab storage before sign-in.
    setRememberMe(remember);
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const { error } = await signIn(email.trim(), password);
      if (error) setErrorMessage(error);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('login.errorEnterCredentials'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen maxWidth={2400} ambientGlows={false} contentStyle={styles.screenContent}>
      <View style={[styles.split, { minHeight: Math.max(height, compact ? 760 : 650) }, compact && styles.splitCompact]}>
        <View style={[styles.story, compact && styles.storyCompact]}>
          <LinearGradient colors={['#0B2333', '#0A1C29', '#08151F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.storyGlow} pointerEvents="none" />
          <View style={styles.storyRing} pointerEvents="none" />
          <Image source={require('../../../assets/images/mypitch-weekline-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="MYPitch" />
          <View style={[styles.storyBody, compact && styles.storyBodyCompact]}>
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text style={[styles.headline, compact && styles.headlineCompact]}>
              {copy.headline}{'\n'}<Text style={styles.headlineAccent}>{copy.headlineAccent}</Text>
            </Text>
            <Text style={[styles.description, compact && styles.descriptionCompact]}>{copy.description}</Text>
          </View>
          <View style={[styles.pitchLines, compact && styles.pitchLinesCompact]} pointerEvents="none">
            <View style={styles.pitchMidline} /><View style={styles.pitchCenterCircle} />
            <View style={styles.pitchBoxLeft} /><View style={styles.pitchBoxRight} />
          </View>
          {!compact ? (
            <View style={styles.storyFoot}>
              <Ionicons name="shield-checkmark-outline" size={17} color={colors.blueLight} />
              <Text style={styles.storyFootText}>{copy.foot}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.authSide, compact && styles.authSideCompact]}>
          <View style={styles.authContent}>
            <Text style={styles.authKicker}>{copy.signInKicker}</Text>
            <Text style={styles.authTitle}>{copy.welcome}</Text>
            <Text style={styles.authIntro}>{copy.intro}</Text>

            <Text style={styles.label}>{copy.email}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('login.emailPlaceholder')}
              placeholderTextColor={colors.greyDark}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              style={styles.input}
              accessibilityLabel={copy.email}
            />

            <Text style={[styles.label, styles.passwordLabel]}>{copy.password}</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder={copy.passwordPlaceholder}
                placeholderTextColor={colors.greyDark}
                secureTextEntry={!showPassword}
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                style={[styles.input, styles.passwordInput]}
                accessibilityLabel={copy.password}
              />
              <Pressable style={styles.showPassword} onPress={() => setShowPassword((value) => !value)} accessibilityRole="button" accessibilityLabel={showPassword ? copy.hide : copy.show}>
                <Text style={styles.showPasswordText}>{showPassword ? copy.hide : copy.show}</Text>
              </Pressable>
            </View>

            <Pressable style={styles.rememberRow} onPress={() => setRemember((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: remember }}>
              <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
                {remember ? <Ionicons name="checkmark" size={14} color={colors.blackText} /> : null}
              </View>
              <Text style={styles.rememberText}>{t('login.rememberMe')}</Text>
            </Pressable>

            {errorMessage ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{errorMessage}</Text> : null}

            <Pressable style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]} onPress={handleLogin} disabled={isSubmitting} accessibilityRole="button">
              {isSubmitting ? <ActivityIndicator size="small" color={colors.blackText} /> : null}
              <Text style={styles.primaryButtonText}>{copy.signIn}</Text>
            </Pressable>

            <View style={styles.authBottom}>
              <Text style={styles.newHere}>{copy.newHere}</Text>
              <Pressable style={styles.secondaryButton} onPress={() => router.push('/signup')} accessibilityRole="button">
                <Text style={styles.secondaryButtonText}>{copy.requestAccess}</Text>
              </Pressable>
              <Text style={styles.reviewNote}>{t('login.footerNote')}</Text>
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  split: { width: '100%', flexDirection: 'row', backgroundColor: '#08131D' },
  splitCompact: { flexDirection: 'column' },
  story: { flex: 1.12, minWidth: 0, paddingTop: 30, paddingBottom: 38, paddingHorizontal: 46, position: 'relative', overflow: 'hidden', justifyContent: 'space-between' },
  storyCompact: { flex: 0, minHeight: 255, paddingTop: 20, paddingBottom: 20, paddingHorizontal: 25 },
  storyGlow: { position: 'absolute', width: 450, height: 450, right: -160, bottom: -260, borderRadius: 225, backgroundColor: 'rgba(38,119,169,0.14)' },
  storyRing: { position: 'absolute', width: 260, height: 260, right: -110, top: -124, borderRadius: 130, borderWidth: 1, borderColor: 'rgba(112,192,243,0.16)' },
  logo: { width: 190, height: 60, zIndex: 2 },
  storyBody: { zIndex: 2, maxWidth: 500, paddingVertical: 25 },
  storyBodyCompact: { paddingTop: 4, paddingBottom: 0 },
  eyebrow: { color: '#70C4FC', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  headline: { color: '#F5FAFD', fontSize: 49, lineHeight: 53, fontWeight: '800', letterSpacing: -1.8, marginTop: 15 },
  headlineCompact: { fontSize: 30, lineHeight: 34, marginTop: 8 },
  headlineAccent: { color: '#71C8FF' },
  description: { color: '#ADC6D5', fontSize: 15, lineHeight: 24, marginTop: 16, maxWidth: 390 },
  descriptionCompact: { fontSize: 12, lineHeight: 18, marginTop: 7, maxWidth: 500 },
  storyFoot: { zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 },
  storyFootText: { color: '#86A8BA', fontSize: 11, fontWeight: '600' },
  pitchLines: { position: 'absolute', width: 510, height: 305, left: -52, bottom: -93, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(125,200,245,0.18)', transform: [{ rotate: '-14deg' }], opacity: 0.58 },
  pitchLinesCompact: { width: 340, height: 200, left: undefined, right: -110, bottom: -105 },
  pitchMidline: { position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeftWidth: 1, borderLeftColor: 'rgba(125,200,245,0.18)' },
  pitchCenterCircle: { position: 'absolute', width: 118, height: 118, left: '38%', top: '31%', borderRadius: 59, borderWidth: 1, borderColor: 'rgba(125,200,245,0.18)' },
  pitchBoxLeft: { position: 'absolute', left: 0, top: '28%', width: 68, height: '44%', borderWidth: 1, borderLeftWidth: 0, borderColor: 'rgba(125,200,245,0.18)' },
  pitchBoxRight: { position: 'absolute', right: 0, top: '28%', width: 68, height: '44%', borderWidth: 1, borderRightWidth: 0, borderColor: 'rgba(125,200,245,0.18)' },
  authSide: { flex: 0.88, minWidth: 390, borderLeftWidth: 1, borderLeftColor: '#294150', backgroundColor: '#0C1A25', justifyContent: 'center', paddingHorizontal: 55, paddingVertical: 45 },
  authSideCompact: { flex: 1, minWidth: 0, borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: '#294150', paddingHorizontal: 25, paddingVertical: 34 },
  authContent: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  authKicker: { color: '#6DBDF0', fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  authTitle: { color: '#F5FAFD', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 10 },
  authIntro: { color: '#A8BFCD', fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: 30 },
  label: { color: '#D7E5EE', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: { width: '100%', height: 47, paddingHorizontal: 14, borderWidth: 1, borderColor: '#355061', borderRadius: 9, backgroundColor: '#0B1A26', color: '#F2F7FA', fontSize: 14, fontWeight: '500' },
  passwordLabel: { marginTop: 18 },
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 79 },
  showPassword: { position: 'absolute', right: 6, top: 5, minWidth: 62, height: 37, alignItems: 'center', justifyContent: 'center' },
  showPasswordText: { color: '#82C8F5', fontSize: 12, fontWeight: '700' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginTop: 21, marginBottom: 23, gap: 9 },
  checkbox: { width: 17, height: 17, borderWidth: 1, borderColor: '#46657A', borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1A26' },
  checkboxChecked: { backgroundColor: colors.blueLight, borderColor: colors.blueLight },
  rememberText: { color: '#B5CAD6', fontSize: 12, fontWeight: '500', flexShrink: 1 },
  errorText: { color: colors.red, fontSize: 13, marginBottom: 14 },
  primaryButton: { width: '100%', minHeight: 47, borderRadius: 9, backgroundColor: '#68BFF8', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#071520', fontSize: 14, fontWeight: '800' },
  authBottom: { marginTop: 34 },
  newHere: { color: '#8CA8B8', fontSize: 12, textAlign: 'center', marginBottom: 10 },
  secondaryButton: { width: '100%', minHeight: 44, borderWidth: 1, borderColor: '#365364', borderRadius: 9, backgroundColor: '#0E2331', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonText: { color: '#E7F4FB', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  reviewNote: { color: '#7897A7', fontSize: 11, lineHeight: 16, marginTop: 15, textAlign: 'center' },
});
