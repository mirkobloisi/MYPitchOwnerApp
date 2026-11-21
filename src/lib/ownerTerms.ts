import { useEffect, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { CURRENT_OWNER_TERMS_VERSION } from './pitchData';
import { supabase } from './supabase';
import { withTimeout } from './withTimeout';

export type CurrentOwnerTerms = {
  version: string;
  /** ISO date the version took effect; null when only the built-in fallback is known. */
  effectiveAt: string | null;
};

// Used only until the database answers (or if it cannot be reached).
const FALLBACK: CurrentOwnerTerms = { version: CURRENT_OWNER_TERMS_VERSION, effectiveAt: '2026-09-17T00:00:00Z' };

/**
 * The Owner Terms version in force right now, from the database (so publishing a
 * new version needs no app update). Rejects when it cannot be read.
 */
export async function fetchCurrentOwnerTerms(): Promise<CurrentOwnerTerms> {
  const { data, error } = await withTimeout(Promise.resolve(supabase.rpc('get_current_owner_terms')), 8000, 'fetchCurrentOwnerTerms');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.version) throw new Error('No current Owner Terms version');
  return { version: String(row.version), effectiveAt: row.effective_at ? String(row.effective_at) : null };
}

/** The current version for screens that show it (accept-terms, sign-up). */
export function useCurrentOwnerTerms(): CurrentOwnerTerms {
  const [current, setCurrent] = useState<CurrentOwnerTerms>(FALLBACK);
  useEffect(() => {
    let cancelled = false;
    fetchCurrentOwnerTerms()
      .then((terms) => { if (!cancelled) setCurrent(terms); })
      .catch(() => { /* keep the fallback */ });
    return () => { cancelled = true; };
  }, []);
  return current;
}

const DATE_LOCALES = { en: 'en-GB', el: 'el-GR', ru: 'ru-RU' } as const;

/** "17 September 2026" in the owner's chosen language. */
export function useTermsDateText(effectiveAt: string | null): string {
  const { language } = useLanguage();
  if (!effectiveAt) return '';
  const date = new Date(effectiveAt);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(DATE_LOCALES[language as keyof typeof DATE_LOCALES] ?? 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}
