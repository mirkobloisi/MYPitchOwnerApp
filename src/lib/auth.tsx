import type { Session } from '@supabase/supabase-js';
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { CURRENT_OWNER_TERMS_VERSION, fetchMyLatestOwnerTermsAcceptance } from './pitchData';
import { supabase } from './supabase';
import { withAbortableTimeout, withTimeout } from './withTimeout';

const OWNER_DATA_QUERY_TIMEOUT_MS = 10000;

export type PitchOwnerRecord = {
  id: string;
  user_id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  created_at: string;
};

export type PitchRecord = {
  id: string;
  pitch_owner_id: string;
  name: string;
  city: string;
  area: string | null;
  address: string | null;
  maps_url: string | null;
  pitch_type: string | null;
  format: string;
  duration_minutes: number;
  allow_half_hour_start: boolean;
  allowed_durations_minutes: number[];
  price_per_hour: number;
  platform_fee_percent: number;
  description: string | null;
  facilities: string[];
  status: 'active' | 'paused' | 'archived';
  player_booking_paused: boolean;
  player_booking_pause_reason: string | null;
  player_booking_paused_at: string | null;
  image_urls: string[];
};

type ProfileRecord = {
  id: string;
  role: string;
  full_name: string | null;
  email: string | null;
};

type AuthContextValue = {
  isLoading: boolean;
  session: Session | null;
  profile: ProfileRecord | null;
  pitchOwner: PitchOwnerRecord | null;
  pitches: PitchRecord[];
  activePitch: PitchRecord | null;
  setActivePitchId: (id: string) => void;
  /** Whether the signed-in owner has accepted the CURRENT_OWNER_TERMS_VERSION. */
  ownerTermsAccepted: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: {
    email: string;
    password: string;
    businessName: string;
    contactName: string;
    phone: string;
  }) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [pitchOwner, setPitchOwner] = useState<PitchOwnerRecord | null>(null);
  const [pitches, setPitches] = useState<PitchRecord[]>([]);
  const [activePitchId, setActivePitchId] = useState<string | null>(null);
  const [ownerTermsAccepted, setOwnerTermsAccepted] = useState(false);

  async function loadOwnerData(currentSession: Session | null) {
    if (!currentSession) {
      setProfile(null);
      setPitchOwner(null);
      setPitches([]);
      setActivePitchId(null);
      setOwnerTermsAccepted(false);
      return;
    }

    const userId = currentSession.user.id;

    try {
      // Every query here is individually bounded AND actually cancelled via
      // AbortController on timeout (see withTimeout.ts) — a plain
      // "stop waiting" timeout would leave the request occupying one of the
      // browser's handful of connection slots to Supabase forever, and this
      // function runs on every auth event (sign-in, tab-visible token
      // refresh, an explicit refresh() call), not just once at app start, so
      // a few of those piling up after the app sits idle is exactly what was
      // silently exhausting the connection pool and making every later
      // request — including ones with their own timeout — queue forever.
      const { data: profileData, error: profileError } = await withAbortableTimeout(
        supabase.from('profiles').select('id, role, full_name, email').eq('id', userId).maybeSingle(),
        OWNER_DATA_QUERY_TIMEOUT_MS,
        'loadOwnerData.profile'
      );

      if (profileError) throw profileError;

      setProfile((profileData as ProfileRecord | null) ?? null);

      const { data: ownerData, error: ownerError } = await withAbortableTimeout(
        supabase
          .from('pitch_owners')
          .select('id, user_id, business_name, contact_name, email, phone, address, logo_url, status, created_at')
          .eq('user_id', userId)
          .maybeSingle(),
        OWNER_DATA_QUERY_TIMEOUT_MS,
        'loadOwnerData.owner'
      );

      if (ownerError) throw ownerError;

      const owner = (ownerData as PitchOwnerRecord | null) ?? null;
      setPitchOwner(owner);

      if (owner && owner.status === 'active') {
        const { data: pitchesData, error: pitchesError } = await withAbortableTimeout(
          supabase
            .from('pitches')
            .select(
              'id, pitch_owner_id, name, city, area, address, maps_url, pitch_type, format, duration_minutes, allow_half_hour_start, allowed_durations_minutes, price_per_hour, platform_fee_percent, description, facilities, status, player_booking_paused, player_booking_pause_reason, player_booking_paused_at, image_urls'
            )
            .eq('pitch_owner_id', owner.id)
            .order('created_at', { ascending: true }),
          OWNER_DATA_QUERY_TIMEOUT_MS,
          'loadOwnerData.pitches'
        );

        if (pitchesError) throw pitchesError;

        const ownedPitches = (pitchesData as PitchRecord[] | null) ?? [];
        setPitches(ownedPitches);
        setActivePitchId((current) => current ?? ownedPitches[0]?.id ?? null);

        try {
          const acceptance = await fetchMyLatestOwnerTermsAcceptance();
          setOwnerTermsAccepted(acceptance?.termsVersion === CURRENT_OWNER_TERMS_VERSION);
        } catch (acceptanceError) {
          // Treat "couldn't tell" the same as "not accepted" — AppGate then
          // sends the owner to /accept-terms, which is safe to show again
          // even if they had actually already accepted (accepting a second
          // time for the same version is harmless), whereas silently letting
          // them into the app on a failed check is not.
          console.error('[auth] Failed to load owner terms acceptance:', acceptanceError);
          setOwnerTermsAccepted(false);
        }
      } else {
        setPitches([]);
        setActivePitchId(null);
        setOwnerTermsAccepted(false);
      }
    } catch (error) {
      // Never let a network/DB hiccup leave the app stuck on a loading
      // spinner forever — log it so it shows up in the Metro terminal, and
      // fall back to "no owner data" so AppGate can still route somewhere
      // sane (login/pending) instead of hanging indefinitely.
      console.error('[auth] Failed to load pitch owner data:', error);
      setPitchOwner(null);
      setPitches([]);
      setActivePitchId(null);
      setOwnerTermsAccepted(false);
    }
  }

  async function refresh() {
    const { data } = await withTimeout(supabase.auth.getSession(), 12000, 'refresh.getSession()');
    setSession(data.session);
    await loadOwnerData(data.session);
  }

  useEffect(() => {
    let isMounted = true;

    withTimeout(supabase.auth.getSession(), 12000, 'getSession()')
      .then(async ({ data }) => {
        if (!isMounted) return;
        setSession(data.session);
        // loadOwnerData bounds and catches every query itself now, so it
        // never needs an outer timeout wrapper to avoid hanging forever.
        await loadOwnerData(data.session);
      })
      .catch((error) => {
        console.error('[auth] Failed to load initial session:', error);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      // loadOwnerData already catches its own errors/timeouts internally —
      // this fires on every token refresh (including the one Supabase makes
      // when the tab regains focus after being idle), so it must never be
      // left unbounded here.
      await loadOwnerData(nextSession);
    });

    // Browsers throttle or fully pause background-tab timers and can drop a
    // TCP connection silently while the laptop sleeps or the tab sits
    // hidden a long time. Neither failure raises an error on its own, so
    // without this the owner/pitch data on screen can simply go stale until
    // something else happens to refetch it. Proactively reloading it the
    // moment the tab becomes visible again means the app recovers on its
    // own — the person should never need to reload the page to unstick it.
    let removeVisibilityListener: (() => void) | undefined;
    if (typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible' && isMounted) {
          refresh().catch((error) => {
            console.error('[auth] Failed to refresh on tab focus:', error);
          });
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      removeVisibilityListener = () => document.removeEventListener('visibilitychange', onVisible);
    }

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
      removeVisibilityListener?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  }

  // Used by the "Request owner access" signup screen. The actual role change
  // (profiles.role -> 'pitch_owner') and the pending pitch_owners row are
  // both created server-side by handle_new_user() off the pitch_owner_signup
  // metadata flag, not here — that way the request exists immediately even
  // when Supabase requires email confirmation before a session exists.
  async function signUp(params: {
    email: string;
    password: string;
    businessName: string;
    contactName: string;
    phone: string;
  }) {
    const { data, error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: {
          pitch_owner_signup: true,
          business_name: params.businessName,
          contact_name: params.contactName,
          phone: params.phone,
        },
      },
    });

    if (error) {
      return { error: error.message, needsEmailConfirmation: false };
    }

    return { error: null, needsEmailConfirmation: !data.session };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const activePitch = useMemo(
    () => pitches.find((pitch) => pitch.id === activePitchId) ?? pitches[0] ?? null,
    [pitches, activePitchId]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      session,
      profile,
      pitchOwner,
      pitches,
      activePitch,
      setActivePitchId,
      ownerTermsAccepted,
      refresh,
      signIn,
      signUp,
      signOut,
    }),
    [isLoading, session, profile, pitchOwner, pitches, activePitch, ownerTermsAccepted]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
