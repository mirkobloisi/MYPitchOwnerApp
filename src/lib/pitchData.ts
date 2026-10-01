import { supabase } from './supabase';
import { withAbortableTimeout } from './withTimeout';

const REQUEST_TIMEOUT_MS = 15000;

export type MatchStatus =
  | 'open'
  | 'almost_full'
  | 'fully_paid'
  | 'confirmed'
  | 'cancelled'
  | 'completed';

export type MatchRow = {
  id: string;
  pitch_id: string;
  status: MatchStatus;
  visibility: 'public' | 'private';
  gender_category: 'mixed' | 'male' | 'female';
  starts_at: string;
  ends_at: string;
  players_required: number;
  players_paid_count: number;
  pitch_price_total: number;
  confirmation_deadline: string | null;
  cancellation_reason: string | null;
};

/**
 * 'party' is an external booking of a different shape: it takes the pitch for
 * an evening rather than a playing slot, and picks its own start and end
 * instead of a length from the slot grid.
 */
export type BlockType = 'blocked' | 'external_booking' | 'party';

export type PitchBlockRow = {
  id: string;
  pitch_id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  block_type: BlockType;
  reference: string | null;
  notes: string | null;
  recurrence_group_id: string | null;
  recurrence_open_ended: boolean;
};

const BLOCK_COLUMNS =
  'id, pitch_id, start_time, end_time, reason, block_type, reference, notes, recurrence_group_id, recurrence_open_ended';

export type PayoutStatus = 'pending_confirmation' | 'paid' | 'failed';

export type PayoutRow = {
  id: string;
  match_id: string;
  pitch_id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  created_at: string;
};

export type AvailabilityRow = {
  id: string;
  pitch_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_available: boolean;
};

export async function fetchAgendaRange(pitchId: string, rangeStart: Date, rangeEnd: Date) {
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd.toISOString();

  const [matchesResult, blocksResult] = await Promise.all([
    withAbortableTimeout(
      supabase
        .from('matches')
        .select(
          'id, pitch_id, status, visibility, gender_category, starts_at, ends_at, players_required, players_paid_count, pitch_price_total, confirmation_deadline, cancellation_reason'
        )
        .eq('pitch_id', pitchId)
        .lt('starts_at', endIso)
        .gt('ends_at', startIso)
        .order('starts_at', { ascending: true }),
      REQUEST_TIMEOUT_MS,
      'fetchAgendaRange.matches'
    ),
    withAbortableTimeout(
      supabase
        .from('pitch_blocks')
        .select(BLOCK_COLUMNS)
        .eq('pitch_id', pitchId)
        .lt('start_time', endIso)
        .gt('end_time', startIso)
        .order('start_time', { ascending: true }),
      REQUEST_TIMEOUT_MS,
      'fetchAgendaRange.blocks'
    ),
  ]);

  if (matchesResult.error) throw matchesResult.error;
  if (blocksResult.error) throw blocksResult.error;

  // Academy trainings and matches on this pitch, weekly repeats already
  // expanded. Kept out of the Promise.all above and tolerated on failure: an
  // owner who runs no academy should still get their agenda.
  const academyResult = await supabase.schema('academy').rpc('pitch_sessions_in_range', {
    pitch_id_input: pitchId,
    range_start: startIso,
    range_end: endIso,
  });

  return {
    matches: (matchesResult.data ?? []) as MatchRow[],
    blocks: (blocksResult.data ?? []) as PitchBlockRow[],
    academySessions: (academyResult.data ?? []) as AcademySessionOccurrence[],
  };
}

export type AcademySessionOccurrence = {
  id: string;
  academy_id: string;
  academy_name: string;
  kind: 'match';
  title: string;
  starts_at: string;
  ends_at: string;
  opponent: string | null;
  is_cancelled: boolean;
  is_recurring: boolean;
};

export async function fetchAvailability(pitchId: string) {
  const { data, error } = await withAbortableTimeout(
    supabase
      .from('pitch_availability')
      .select('id, pitch_id, day_of_week, open_time, close_time, is_available')
      .eq('pitch_id', pitchId)
      .order('day_of_week', { ascending: true }),
    REQUEST_TIMEOUT_MS,
    'fetchAvailability'
  );

  if (error) throw error;
  return (data ?? []) as AvailabilityRow[];
}

// Bump this whenever the signed MYPitch Pitch Owner Agreement / Owner Terms &
// Conditions change materially (matches the "Owner Terms version" printed on
// those documents). An owner whose latest acceptance is for an older version
// is treated as not having accepted the current one — see acceptOwnerTerms
// and get_my_latest_owner_terms_acceptance() in the database.
export const CURRENT_OWNER_TERMS_VERSION = '1.0';

// The exact wording of the in-app acceptance checkbox, verbatim from Clause
// 14 of the signed MYPitch Owner Terms & Conditions. This is what actually
// gets stored with each acceptance record (regardless of the owner's chosen
// display language), so the audit trail always shows the one canonical
// sentence that was legally agreed to for a given terms_version — never a
// translated variant of it.
export const OWNER_TERMS_CHECKBOX_TEXT_CANONICAL =
  "I confirm that I am authorised to represent this sports facility/operator, and I accept MYPitch's Owner Terms & Conditions (version shown above) and the signed MYPitch Pitch Owner Agreement, including the rules on pricing, reservations, cancellations, refunds, payouts, agenda management, external-reservation responsibility, weather/safety alerts, and data protection.";

export type OwnerTermsAcceptance = {
  termsVersion: string;
  acceptedAt: string;
};

export async function fetchMyLatestOwnerTermsAcceptance(): Promise<OwnerTermsAcceptance | null> {
  const { data, error } = await withAbortableTimeout(
    supabase.rpc('get_my_latest_owner_terms_acceptance'),
    REQUEST_TIMEOUT_MS,
    'fetchMyLatestOwnerTermsAcceptance'
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    termsVersion: row.terms_version as string,
    acceptedAt: row.accepted_at as string,
  };
}

export async function acceptOwnerTerms(input: {
  termsVersion: string;
  checkboxText: string;
  representativeRole?: string | null;
}) {
  const { error } = await withAbortableTimeout(
    supabase.rpc('accept_owner_terms', {
      terms_version_input: input.termsVersion,
      checkbox_text_input: input.checkboxText,
      representative_role_input: input.representativeRole ?? null,
    }),
    REQUEST_TIMEOUT_MS,
    'acceptOwnerTerms'
  );

  if (error) throw error;
}

export async function fetchPayouts(pitchId: string) {
  const { data, error } = await withAbortableTimeout(
    supabase
      .from('pitch_payouts')
      .select('id, match_id, pitch_id, amount, currency, status, created_at')
      .eq('pitch_id', pitchId)
      .order('created_at', { ascending: false })
      .limit(100),
    REQUEST_TIMEOUT_MS,
    'fetchPayouts'
  );

  if (error) throw error;
  return (data ?? []) as PayoutRow[];
}

/**
 * Pitch owners have no general UPDATE policy on `pitches` (only super admins
 * do), so this goes through the narrow `update_pitch_booking_settings` RPC
 * instead of a plain `.update()` — it only ever touches these two columns.
 */
export async function updatePitchBookingSettings(input: {
  pitchId: string;
  allowHalfHourStart: boolean;
  allowedDurationsMinutes: number[];
}) {
  const { error } = await withAbortableTimeout(
    supabase.rpc('update_pitch_booking_settings', {
      pitch_id_input: input.pitchId,
      allow_half_hour_start_input: input.allowHalfHourStart,
      allowed_durations_minutes_input: input.allowedDurationsMinutes,
    }),
    REQUEST_TIMEOUT_MS,
    'updatePitchBookingSettings'
  );

  if (error) throw error;
}

/** Owner-scoped update for a pitch's venue photo and facilities. */
export async function updatePitchPresentation(input: { pitchId: string; facilities: string[]; imageUrl?: string | null }) {
  const { error } = await withAbortableTimeout(
    supabase.rpc('update_pitch_presentation', {
      pitch_id_input: input.pitchId,
      facilities_input: input.facilities,
      image_url_input: input.imageUrl ?? null,
    }),
    REQUEST_TIMEOUT_MS,
    'updatePitchPresentation'
  );
  if (error) throw error;
}

export async function setPitchPlayerBookingPaused(input: {
  pitchId: string;
  paused: boolean;
  reason: string | null;
}) {
  const { error } = await withAbortableTimeout(
    supabase.rpc('set_pitch_player_booking_pause', {
      pitch_id_input: input.pitchId,
      pause_input: input.paused,
      reason_input: input.reason,
    }),
    REQUEST_TIMEOUT_MS,
    'setPitchPlayerBookingPaused'
  );

  if (error) throw error;
}

export async function createPitchBlock(input: {
  pitchId: string;
  startTime: Date;
  endTime: Date;
  blockType: BlockType;
  reason: string;
  reference?: string | null;
  notes?: string | null;
  createdBy: string;
}) {
  const { error } = await withAbortableTimeout(
    supabase.from('pitch_blocks').insert({
      pitch_id: input.pitchId,
      start_time: input.startTime.toISOString(),
      end_time: input.endTime.toISOString(),
      block_type: input.blockType,
      reason: input.reason,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      created_by: input.createdBy,
    }),
    REQUEST_TIMEOUT_MS,
    'createPitchBlock'
  );

  if (error) throw error;
}

export async function fetchPitchBlock(blockId: string) {
  const { data, error } = await withAbortableTimeout(
    supabase.from('pitch_blocks').select(BLOCK_COLUMNS).eq('id', blockId).maybeSingle(),
    REQUEST_TIMEOUT_MS,
    'fetchPitchBlock'
  );

  if (error) throw error;
  return (data as PitchBlockRow | null) ?? null;
}

export async function updatePitchBlock(input: {
  blockId: string;
  startTime: Date;
  endTime: Date;
  reason: string;
  reference?: string | null;
  notes?: string | null;
}) {
  const { error } = await withAbortableTimeout(
    supabase
      .from('pitch_blocks')
      .update({
        start_time: input.startTime.toISOString(),
        end_time: input.endTime.toISOString(),
        reason: input.reason,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      })
      .eq('id', input.blockId),
    REQUEST_TIMEOUT_MS,
    'updatePitchBlock'
  );

  if (error) throw error;
}

export async function deletePitchBlock(blockId: string) {
  const { error } = await withAbortableTimeout(
    supabase.from('pitch_blocks').delete().eq('id', blockId),
    REQUEST_TIMEOUT_MS,
    'deletePitchBlock'
  );
  if (error) throw error;
}

export type CancelPendingMatchResult = {
  cancelled: boolean;
  relocated: boolean;
  newPitchId: string | null;
};

// The RPC either cancels the match outright (refunding paid players) or, when
// a nearby pitch has matching availability at a same-or-lower price, moves the
// match there instead and leaves it pending as before — see
// owner_cancel_pending_match in the database. Callers use the returned flags
// to tell the owner which one actually happened, rather than assuming
// "cancel" always means the match disappeared.
export async function cancelPendingMatch(
  matchId: string,
  reason: string,
  blockSlot: boolean
): Promise<CancelPendingMatchResult> {
  const { data, error } = await withAbortableTimeout(
    supabase.rpc('owner_cancel_pending_match', {
      match_id_input: matchId,
      reason_input: reason,
      block_slot: blockSlot,
    }),
    REQUEST_TIMEOUT_MS,
    'cancelPendingMatch'
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  return {
    cancelled: Boolean(row?.cancelled),
    relocated: Boolean(row?.relocated),
    newPitchId: row?.new_pitch_id ?? null,
  };
}

export type CancelConfirmedMatchUrgencyResult = {
  cancelled: boolean;
  clawbackRequired: boolean;
  clawbackAmount: number | null;
};

// For a match that's already CONFIRMED (fully paid, past its confirmation
// deadline) — distinct from cancelPendingMatch above, which only handles
// matches still awaiting confirmation. Never relocates the match; a weather
// or urgency cancellation this close to kickoff means the match is off, not
// just moved to another pitch. See owner_cancel_confirmed_match_urgency in
// the database for the money-handling rules (payout hold vs. clawback).
export async function cancelConfirmedMatchUrgency(
  matchId: string,
  reason: string
): Promise<CancelConfirmedMatchUrgencyResult> {
  const { data, error } = await withAbortableTimeout(
    supabase.rpc('owner_cancel_confirmed_match_urgency', {
      match_id_input: matchId,
      reason_input: reason,
    }),
    REQUEST_TIMEOUT_MS,
    'cancelConfirmedMatchUrgency'
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  return {
    cancelled: Boolean(row?.cancelled),
    clawbackRequired: Boolean(row?.clawback_required),
    clawbackAmount: row?.clawback_amount != null ? Number(row.clawback_amount) : null,
  };
}

export type CancellationRequestRow = {
  id: string;
  match_id: string;
  requested_by: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  owner_note: string | null;
  created_at: string;
};

export type MatchRosterRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  team: string | null;
  status: string;
};

// Owners can't read match_players/profiles directly — this goes through a
// function that checks pitch ownership server side and hands back only the
// players who actually paid/confirmed their spot.
export async function fetchMatchRosterForOwner(matchId: string): Promise<MatchRosterRow[]> {
  const { data, error } = await withAbortableTimeout(
    supabase.rpc('get_match_roster_for_owner', { match_id_input: matchId }),
    REQUEST_TIMEOUT_MS,
    'fetchMatchRosterForOwner'
  );

  if (error) throw error;
  return (data as MatchRosterRow[]) ?? [];
}

// A confirmed match can have at most one PENDING request at a time (enforced
// server side), so this only ever needs the latest one for the badge/banner.
export async function fetchLatestCancellationRequest(matchId: string): Promise<CancellationRequestRow | null> {
  const { data, error } = await withAbortableTimeout(
    supabase
      .from('match_cancellation_requests')
      .select('id, match_id, requested_by, reason, status, owner_note, created_at')
      .eq('match_id', matchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    REQUEST_TIMEOUT_MS,
    'fetchLatestCancellationRequest'
  );

  if (error) throw error;
  return (data as CancellationRequestRow | null) ?? null;
}

export type RespondToCancellationRequestResult = {
  cancelled: boolean;
  clawbackRequired: boolean;
  clawbackAmount: number | null;
};

// approve: true cancels the match and refunds every player, exactly like
// cancelConfirmedMatchUrgency above — see
// owner_respond_to_cancellation_request_safe in the database. approve:
// false just records the denial and notifies the requesting player with
// ownerNote, leaving the match untouched.
export async function respondToCancellationRequest(
  requestId: string,
  approve: boolean,
  ownerNote: string
): Promise<RespondToCancellationRequestResult> {
  const { data, error } = await withAbortableTimeout(
    supabase.rpc('owner_respond_to_cancellation_request_safe', {
      request_id_input: requestId,
      approve,
      owner_note_input: ownerNote,
    }),
    REQUEST_TIMEOUT_MS,
    'respondToCancellationRequest'
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  return {
    cancelled: Boolean(row?.cancelled),
    clawbackRequired: Boolean(row?.clawback_required),
    clawbackAmount: row?.clawback_amount != null ? Number(row.clawback_amount) : null,
  };
}

// A day can hold several open periods (a morning and an afternoon shift, say).
// Each row below is one such period; the gaps between them are unavailable.
export async function createAvailabilityRange(input: {
  pitchId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isAvailable: boolean;
}) {
  const { error } = await withAbortableTimeout(
    supabase.from('pitch_availability').insert({
      pitch_id: input.pitchId,
      day_of_week: input.dayOfWeek,
      open_time: input.openTime,
      close_time: input.closeTime,
      is_available: input.isAvailable,
    }),
    REQUEST_TIMEOUT_MS,
    'createAvailabilityRange'
  );

  if (error) throw error;
}

export async function updateAvailabilityRange(input: {
  id: string;
  openTime: string;
  closeTime: string;
  isAvailable: boolean;
}) {
  const { error } = await withAbortableTimeout(
    supabase
      .from('pitch_availability')
      .update({
        open_time: input.openTime,
        close_time: input.closeTime,
        is_available: input.isAvailable,
      })
      .eq('id', input.id),
    REQUEST_TIMEOUT_MS,
    'updateAvailabilityRange'
  );

  if (error) throw error;
}

export async function deleteAvailabilityRange(rangeId: string) {
  const { error } = await withAbortableTimeout(
    supabase.from('pitch_availability').delete().eq('id', rangeId),
    REQUEST_TIMEOUT_MS,
    'deleteAvailabilityRange'
  );
  if (error) throw error;
}

/**
 * Opens or closes a whole weekday without losing its configured times — the
 * periods stay on file and simply stop counting as available.
 */
export async function setDayAvailability(input: {
  pitchId: string;
  dayOfWeek: number;
  isAvailable: boolean;
}) {
  const { error } = await withAbortableTimeout(
    supabase
      .from('pitch_availability')
      .update({ is_available: input.isAvailable })
      .eq('pitch_id', input.pitchId)
      .eq('day_of_week', input.dayOfWeek),
    REQUEST_TIMEOUT_MS,
    'setDayAvailability'
  );

  if (error) throw error;
}

export type RecurringResult = {
  group_id: string;
  created: number;
  open_ended: boolean;
  skipped: string[];
};

function toDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Creates a weekly series, either running until `repeatUntil` or open-ended.
 * An open-ended series is generated about six months ahead and topped up by a
 * daily job, so it continues until the owner deletes it. Weeks that clash with
 * a match or an existing booking are skipped and reported rather than failing
 * the whole series.
 */
export async function createRecurringPitchBlocks(input: {
  pitchId: string;
  startTime: Date;
  endTime: Date;
  repeatUntil: Date | null;
  openEnded: boolean;
  blockType: BlockType;
  reason: string;
  reference?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await withAbortableTimeout(
    supabase.rpc('create_recurring_pitch_blocks', {
      pitch_id_input: input.pitchId,
      first_start: input.startTime.toISOString(),
      first_end: input.endTime.toISOString(),
      block_type_input: input.blockType,
      reason_input: input.reason,
      repeat_until_input: input.openEnded || !input.repeatUntil ? null : toDateOnly(input.repeatUntil),
      open_ended_input: input.openEnded,
      reference_input: input.reference ?? null,
      notes_input: input.notes ?? null,
    }),
    REQUEST_TIMEOUT_MS,
    'createRecurringPitchBlocks'
  );

  if (error) throw error;
  return data as RecurringResult;
}

/** Deletes this occurrence and every later one in the same weekly series. */
export async function deleteRecurringSeriesFrom(groupId: string, fromTime: Date) {
  const { error } = await withAbortableTimeout(
    supabase
      .from('pitch_blocks')
      .delete()
      .eq('recurrence_group_id', groupId)
      .gte('start_time', fromTime.toISOString()),
    REQUEST_TIMEOUT_MS,
    'deleteRecurringSeriesFrom'
  );

  if (error) throw error;
}

export async function countRemainingInSeries(groupId: string, fromTime: Date) {
  const { count, error } = await withAbortableTimeout(
    supabase
      .from('pitch_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('recurrence_group_id', groupId)
      .gte('start_time', fromTime.toISOString()),
    REQUEST_TIMEOUT_MS,
    'countRemainingInSeries'
  );

  if (error) throw error;
  return count ?? 0;
}
