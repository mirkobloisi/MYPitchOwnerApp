import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

// Remembered on the owner's login (Supabase user metadata) rather than in the
// browser, so the guide does not come back on another device or after the
// browser's storage is cleared.
const SEEN_KEY = 'academy_guide_seen';

/**
 * Drives the Academy walkthrough.
 *
 * It opens by itself exactly once: the first time the owner reaches the
 * Academy tab while they have no academy. After that it only opens when
 * `open()` is called, i.e. from the "Academy guide" button.
 *
 * @param ready        true once the owner's academies have finished loading
 * @param hasAcademies true if the owner already has at least one academy
 */
export function useAcademyGuide({ ready, hasAcademies }: { ready: boolean; hasAcademies: boolean }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const alreadySeen = session?.user.user_metadata?.[SEEN_KEY] === true;
  const [visible, setVisible] = useState(false);
  const autoOpenedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setVisible(false);
      return;
    }
    if (!ready || hasAcademies || alreadySeen || autoOpenedFor.current === userId) return;

    autoOpenedFor.current = userId;
    setVisible(true);
    // If this save fails the guide may show once more next visit; harmless.
    void supabase.auth.updateUser({ data: { [SEEN_KEY]: true } });
  }, [userId, ready, hasAcademies, alreadySeen]);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  return { visible, open, close };
}
