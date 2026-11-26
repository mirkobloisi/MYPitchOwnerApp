import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { weeklineColors as colors } from '../../theme/palettes';
import { useViewportHeight } from '../../theme/contentZoom';

type IconName = keyof typeof Ionicons.glyphMap;

/** Shared building blocks for the Academy tabs, so they look alike. */
export function Button({ label, icon, onPress, tone = 'primary', busy = false, disabled = false, small = false, style }: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  tone?: 'primary' | 'outline' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: any;
}) {
  const inactive = disabled || busy;
  const foreground = tone === 'primary' ? colors.blackText : tone === 'danger' ? colors.red : colors.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ hovered, pressed }: any) => [
        ui.button,
        small && ui.buttonSmall,
        tone === 'primary' ? ui.buttonPrimary : ui.buttonOutline,
        tone === 'danger' && ui.buttonDanger,
        hovered && !inactive && ui.buttonHovered,
        pressed && ui.pressed,
        inactive && ui.disabled,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={foreground} /> : icon ? <Ionicons name={icon} size={small ? 14 : 16} color={foreground} /> : null}
      <Text style={[ui.buttonText, small && ui.buttonTextSmall, { color: foreground }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, count, icon, disabled = false }: {
  label: string; active: boolean; onPress: () => void; count?: number; icon?: IconName; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ hovered, pressed }: any) => [ui.chip, active && ui.chipActive, hovered && !disabled && ui.buttonHovered, pressed && ui.pressed, disabled && ui.disabled]}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.blueLight : colors.grey} /> : null}
      <Text style={[ui.chipText, active && ui.chipTextActive]} numberOfLines={1}>{label}</Text>
      {count === undefined ? null : <Text style={[ui.chipCount, active && ui.chipTextActive]}>{count}</Text>}
    </Pressable>
  );
}

export function CheckBox({ checked }: { checked: boolean }) {
  return <View style={[ui.checkbox, checked && ui.checkboxOn]}>{checked ? <Ionicons name="checkmark" size={13} color={colors.blackText} /> : null}</View>;
}

export function CheckRow({ label, hint, checked, onPress, disabled = false }: {
  label: string; hint?: string; checked: boolean; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={({ hovered, pressed }: any) => [ui.checkRow, checked && ui.checkRowOn, hovered && !disabled && ui.buttonHovered, pressed && ui.pressed, disabled && ui.disabled]}
    >
      <CheckBox checked={checked} />
      <View style={ui.flexText}>
        <Text style={ui.rowTitle} numberOfLines={1}>{label}</Text>
        {hint ? <Text style={ui.rowHint} numberOfLines={2}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function SearchBox({ value, onChangeText, placeholder, style }: { value: string; onChangeText: (value: string) => void; placeholder: string; style?: any }) {
  return (
    <View style={[ui.search, style]}>
      <Ionicons name="search" size={16} color={colors.greyDark} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.greyDark} style={ui.searchInput} accessibilityLabel={placeholder} />
      {value ? <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Clear"><Ionicons name="close-circle" size={16} color={colors.grey} /></Pressable> : null}
    </View>
  );
}

export function Initials({ name, size = 36, tone = 'blue' }: { name: string; size?: number; tone?: 'blue' | 'orange' }) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '?';
  return (
    <View style={[ui.initials, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone === 'blue' ? colors.blueSoft : colors.orangeSoft }]}>
      <Text style={[ui.initialsText, { color: tone === 'blue' ? colors.blueLight : colors.orange, fontSize: size * 0.36 }]}>{letters}</Text>
    </View>
  );
}

export function Empty({ icon, text, children }: { icon: IconName; text: string; children?: React.ReactNode }) {
  return (
    <View style={ui.empty}>
      <View style={ui.emptyIcon}><Ionicons name={icon} size={20} color={colors.blueLight} /></View>
      <Text style={ui.emptyText}>{text}</Text>
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

/** A centred dialog with a fixed header and footer; the middle scrolls. */
export function Dialog({ visible, title, subtitle, onClose, closeLabel, children, footer, width = 520 }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  const windowWidth = useWindowDimensions().width;
  const height = useViewportHeight();
  const phone = windowWidth < 768;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[ui.backdrop, phone && ui.backdropPhone]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={closeLabel} />
        <View style={[ui.dialog, { maxWidth: width, maxHeight: phone ? height - 16 : height - 48 }]}>
          <View style={ui.dialogHeader}>
            <View style={ui.flexText}>
              <Text style={ui.dialogTitle}>{title}</Text>
              {subtitle ? <Text style={ui.rowHint}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={ui.iconButton} accessibilityRole="button" accessibilityLabel={closeLabel}><Ionicons name="close" size={20} color={colors.grey} /></Pressable>
          </View>
          <ScrollView style={ui.dialogScroll} contentContainerStyle={ui.dialogBody} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={ui.dialogFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export const ui = StyleSheet.create({
  button: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 15, borderRadius: 8, borderWidth: 1 },
  buttonSmall: { minHeight: 34, paddingHorizontal: 11 },
  buttonPrimary: { borderColor: '#61BAFB', backgroundColor: colors.blueLight },
  buttonOutline: { borderColor: colors.border, backgroundColor: colors.cardSoft },
  buttonDanger: { borderColor: colors.red, backgroundColor: 'transparent' },
  buttonHovered: { opacity: 0.88 },
  buttonText: { fontSize: 14, fontWeight: '700' },
  buttonTextSmall: { fontSize: 12.5 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  chip: { minHeight: 34, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSoft },
  chipActive: { borderColor: colors.blueLight, backgroundColor: colors.blueSoft },
  chipText: { flexShrink: 1, color: colors.grey, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  chipCount: { color: colors.greyDark, fontSize: 12, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.greyDark, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { borderColor: colors.blueLight, backgroundColor: colors.blueLight },
  checkRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSoft },
  checkRowOn: { borderColor: colors.border, backgroundColor: colors.blueSoft },
  flexText: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  rowTitle: { color: colors.white, fontSize: 14.5, fontWeight: '600' },
  rowHint: { color: colors.grey, fontSize: 12.5, marginTop: 2 },
  search: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSoft },
  searchInput: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 40, color: colors.white, fontSize: 14.5, outlineStyle: 'none' as any },
  input: { minHeight: 44, width: '100%', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSoft, color: colors.white, fontSize: 14.5, outlineStyle: 'none' as any },
  textArea: { minHeight: 90, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' },
  label: { color: colors.greySoft, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  hint: { color: colors.grey, fontSize: 12.5, lineHeight: 18 },
  error: { color: colors.red, fontSize: 13.5, lineHeight: 19 },
  success: { color: colors.blueLight, fontSize: 13.5, lineHeight: 19 },
  initials: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontWeight: '800' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 28 },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.grey, fontSize: 13.5, lineHeight: 19, textAlign: 'center', maxWidth: 380 },
  card: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 12 },
  cardTitle: { color: colors.white, fontSize: 17, fontWeight: '800' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(3,8,13,0.76)' },
  backdropPhone: { padding: 8 },
  dialog: { width: '100%', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  dialogTitle: { color: colors.white, fontSize: 19, fontWeight: '800' },
  dialogScroll: { flexGrow: 0, flexShrink: 1 },
  dialogBody: { padding: 18, gap: 14 },
  dialogFooter: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 9, paddingHorizontal: 18, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  iconButton: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
