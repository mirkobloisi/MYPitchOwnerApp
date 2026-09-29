/** Human-readable metadata kept in pitch_blocks.notes for website bookings. */
export function composeBookingNotes(phone: string, notes: string, partyTitle = '', isParty = false) {
  const lines = [
    isParty ? `Party title: ${partyTitle.trim().replace(/[\r\n]+/g, ' ')}` : '',
    phone.trim() ? `Reference phone: ${phone.trim().replace(/[\r\n]+/g, ' ')}` : '',
  ].filter(Boolean);
  const body = notes.trim();
  return [...lines, body].filter(Boolean).join('\n\n') || null;
}

export function readBookingReference(notes: string | null) {
  const text = notes ?? '';
  return {
    title: /^Party title: ?(.*)$/m.exec(text)?.[1] ?? '',
    isWebParty: /^Party title: ?/m.test(text),
    phone: /^Reference phone: (.+)$/m.exec(text)?.[1] ?? '',
  };
}
