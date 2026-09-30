import { supabase } from './supabase';

// Academy tables live in their own Postgres schema, not `public`, so every
// query here goes through .schema('academy').
const academy = () => supabase.schema('academy');

export type AcademyRow = {
  id: string;
  pitch_owner_id: string;
  name: string;
  description: string | null;
  age_group: string | null;
  city: string | null;
  logo_url: string | null;
  cover_url: string | null;
  is_active: boolean;
  created_at: string;
  /** Exactly one per owner — the academy a self-registration link joins. */
  is_main: boolean;
  invite_token: string;
};

export type AcademyMember = {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  avatar_url: string | null;
  guardian_id: string | null;
  /** A second guardian, for a couple who registered together. */
  guardian_id_2: string | null;
  email: string | null;
  phone: string | null;
  /** guardian = a parent; player = a child or a self-managing 14+ teenager. */
  member_kind: 'guardian' | 'player' | 'staff';
};

const ACADEMY_COLUMNS =
  'id, pitch_owner_id, name, description, age_group, city, logo_url, cover_url, is_active, created_at, is_main, invite_token';

const MEMBER_COLUMNS =
  'id, full_name, date_of_birth, avatar_url, guardian_id, guardian_id_2, email, phone, member_kind';

export type EnrolmentRow = {
  id: string;
  academy_id: string;
  member_id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  member: AcademyMember | null;
};

export async function fetchMyAcademies(): Promise<AcademyRow[]> {
  const { data, error } = await academy()
    .from('academies')
    .select(ACADEMY_COLUMNS)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as AcademyRow[];
}

export async function createAcademy(input: {
  pitchOwnerId: string;
  name: string;
  city?: string | null;
  description?: string | null;
}) {
  return academy()
    .from('academies')
    .insert({
      pitch_owner_id: input.pitchOwnerId,
      name: input.name.trim(),
      city: input.city?.trim() || null,
      description: input.description?.trim() || null,
    });
}

export async function updateAcademy(
  academyId: string,
  fields: Partial<
    Pick<AcademyRow, 'name' | 'city' | 'description' | 'age_group' | 'is_active' | 'logo_url' | 'cover_url'>
  >
) {
  return academy()
    .from('academies')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', academyId);
}

export async function deleteAcademy(academyId: string) {
  return academy().from('academies').delete().eq('id', academyId);
}

/**
 * Enrolment requests for one academy, with the member attached.
 *
 * Members are fetched separately rather than as an embedded join: PostgREST
 * can only embed across a relationship it can see, and RLS narrows the member
 * rows to those enrolled in academies this owner runs.
 */
export async function fetchEnrolments(academyId: string): Promise<EnrolmentRow[]> {
  const { data, error } = await academy()
    .from('enrolments')
    .select('id, academy_id, member_id, status, requested_at')
    .eq('academy_id', academyId)
    .order('requested_at', { ascending: false });

  if (error || !data) return [];

  const rows = data as Omit<EnrolmentRow, 'member'>[];
  const memberIds = rows.map((row) => row.member_id);
  if (memberIds.length === 0) return rows.map((row) => ({ ...row, member: null }));

  const { data: members } = await academy()
    .from('members')
    .select(MEMBER_COLUMNS)
    .in('id', memberIds);

  const byId = new Map<string, AcademyMember>(
    ((members ?? []) as AcademyMember[]).map((m) => [m.id, m])
  );

  return rows.map((row) => ({ ...row, member: byId.get(row.member_id) ?? null }));
}

export type AcademyCounts = {
  players: number;
  parents: number;
  pending: number;
};

/**
 * Member counts for several academies at once, so the list doesn't fire a
 * query per card.
 */
export async function fetchAcademyCounts(
  academyIds: string[]
): Promise<Record<string, AcademyCounts>> {
  const empty: AcademyCounts = { players: 0, parents: 0, pending: 0 };
  if (academyIds.length === 0) return {};

  const { data: enrolments } = await academy()
    .from('enrolments')
    .select('academy_id, member_id, status')
    .in('academy_id', academyIds);

  const rows = (enrolments ?? []) as {
    academy_id: string;
    member_id: string;
    status: string;
  }[];

  const memberIds = [...new Set(rows.map((row) => row.member_id))];
  const { data: members } = memberIds.length
    ? await academy().from('members').select('id, member_kind').in('id', memberIds)
    : { data: [] as { id: string; member_kind: string }[] };

  const kindById = new Map(
    ((members ?? []) as { id: string; member_kind: string }[]).map((m) => [m.id, m.member_kind])
  );

  const counts: Record<string, AcademyCounts> = {};
  for (const id of academyIds) counts[id] = { ...empty };

  for (const row of rows) {
    const bucket = counts[row.academy_id];
    if (!bucket) continue;

    if (row.status === 'pending') {
      bucket.pending += 1;
    } else if (row.status === 'approved') {
      if (kindById.get(row.member_id) === 'guardian') bucket.parents += 1;
      else bucket.players += 1;
    }
  }

  return counts;
}

export async function fetchAcademy(academyId: string): Promise<AcademyRow | null> {
  const { data } = await academy()
    .from('academies')
    .select(ACADEMY_COLUMNS)
    .eq('id', academyId)
    .maybeSingle();

  return (data as AcademyRow) ?? null;
}

export async function setMainAcademy(academyId: string) {
  return academy().rpc('set_main_academy', { target_academy_id: academyId });
}

export async function fetchPublicAcademiesForMatches(): Promise<Pick<AcademyRow, 'id' | 'name' | 'logo_url' | 'city'>[]> {
  const { data } = await academy().from('academies').select('id, name, logo_url, city').eq('is_active', true).order('name').limit(100);
  return (data ?? []) as Pick<AcademyRow, 'id' | 'name' | 'logo_url' | 'city'>[];
}

export async function addSessionAttendees(sessionId: string, memberIds: string[]) {
  if (!memberIds.length) return { error: null };
  return academy().from('session_attendees').insert(memberIds.map((member_id) => ({ session_id: sessionId, member_id, response: 'invited' })));
}

export async function regenerateInviteToken(academyId: string): Promise<string | null> {
  const { data, error } = await academy().rpc('regenerate_invite_token', {
    target_academy_id: academyId,
  });
  return error ? null : (data as string);
}

export type PublicAcademy = {
  id: string;
  name: string;
  city: string | null;
  logo_url: string | null;
  is_active: boolean;
};

/** Public, unauthenticated lookup — what the join page shows before anyone signs anything. */
export async function fetchAcademyByInviteToken(token: string): Promise<PublicAcademy | null> {
  const { data } = await academy().rpc('get_academy_by_invite_token', { token });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as PublicAcademy) ?? null;
}

export type RegisterFamilyInput = {
  inviteToken: string;
  guardians: { fullName: string; email?: string | null; phone?: string | null }[];
  children: { fullName: string; dateOfBirth: string | null }[];
};

/** The whole self-registration flow in one call: 1-2 guardians + their children, auto-approved. */
export async function registerFamily(input: RegisterFamilyInput) {
  return academy().rpc('register_family', {
    invite_token: input.inviteToken,
    guardians: input.guardians.map((g) => ({
      full_name: g.fullName,
      email: g.email ?? null,
      phone: g.phone ?? null,
    })),
    children: input.children.map((c) => ({
      full_name: c.fullName,
      date_of_birth: c.dateOfBirth,
    })),
  });
}

/** Adds a member the owner already runs elsewhere into one more of their own academies. */
export async function ownerAddEnrolment(memberId: string, academyId: string) {
  return academy().rpc('owner_add_enrolment', {
    target_member_id: memberId,
    target_academy_id: academyId,
  });
}

export async function ownerRemoveEnrolment(memberId: string, academyId: string) {
  return academy().rpc('owner_remove_enrolment', {
    target_member_id: memberId,
    target_academy_id: academyId,
  });
}

export async function respondToEnrolment(enrolmentId: string, approve: boolean) {
  return academy()
    .from('enrolments')
    .update({
      status: approve ? 'approved' : 'rejected',
      responded_at: new Date().toISOString(),
    })
    .eq('id', enrolmentId);
}

export type OwnerPitch = {
  id: string;
  name: string;
  city: string | null;
  area: string | null;
  maps_url: string | null;
};

/**
 * The owner's own pitches, used to pick a court instead of typing its name.
 * Lives in `public`, not the academy schema, so no .schema() here.
 */
export async function fetchMyPitches(pitchOwnerId: string): Promise<OwnerPitch[]> {
  const { data } = await supabase
    .from('pitches')
    .select('id, name, city, area, maps_url')
    .eq('pitch_owner_id', pitchOwnerId)
    .order('name');

  return (data ?? []) as OwnerPitch[];
}

// Trainings were removed — every session is a match now. The type stays a
// union of one so call sites that pass 'kind' don't need touching.
export type SessionKind = 'match';

export type SessionRow = {
  id: string;
  academy_id: string;
  kind: SessionKind;
  title: string | null;
  starts_at: string;
  ends_at: string;
  location_name: string | null;
  maps_url: string | null;
  opponent: string | null;
  opponent_academy_id: string | null;
  notes: string | null;
  is_cancelled: boolean;
  recurrence: 'none' | 'weekly';
  /** Null with recurrence 'weekly' means it repeats indefinitely. */
  recurrence_until: string | null;
  /** Set when held on one of the owner's pitches, which makes it block bookings. */
  pitch_id: string | null;
};

const SESSION_COLUMNS =
  'id, academy_id, kind, title, starts_at, ends_at, location_name, maps_url, opponent, opponent_academy_id, notes, is_cancelled, recurrence, recurrence_until, pitch_id';

export async function fetchSessions(
  academyId: string,
  kind: SessionKind
): Promise<SessionRow[]> {
  const { data } = await academy()
    .from('sessions')
    .select(SESSION_COLUMNS)
    .eq('academy_id', academyId)
    .eq('kind', kind)
    .order('starts_at', { ascending: true });

  return (data ?? []) as SessionRow[];
}

/**
 * One row per session, carrying its repeat rule — not one row per week.
 * A weekly session with no end date repeats indefinitely.
 */
export type SessionInput = {
  academyId: string;
  kind: SessionKind;
  /** Optional: a match is often just the fixture. */
  title?: string | null;
  startsAt: string;
  endsAt: string;
  pitchId?: string | null;
  locationName?: string | null;
  mapsUrl?: string | null;
  opponent?: string | null;
  /** Set when the opponent is another academy on MYPitch. */
  opponentAcademyId?: string | null;
  notes?: string | null;
  recurrence?: 'none' | 'weekly';
  recurrenceUntil?: string | null;
};

export async function createSession(input: SessionInput) {
  return academy().rpc('create_session', {
    target_academy_id: input.academyId,
    session_kind: input.kind,
    session_title: input.title?.trim() || null,
    session_starts_at: input.startsAt,
    session_ends_at: input.endsAt,
    session_pitch_id: input.pitchId || null,
    location_name: input.locationName?.trim() || null,
    maps_url: input.mapsUrl?.trim() || null,
    opponent: input.opponent?.trim() || null,
    notes: input.notes?.trim() || null,
    recurrence: input.recurrence ?? 'none',
    recurrence_until: input.recurrenceUntil || null,
    opponent_academy_id: input.opponentAcademyId || null,
  });
}

export async function updateSession(sessionId: string, input: Omit<SessionInput, 'academyId' | 'kind'>) {
  return academy()
    .from('sessions')
    .update({
      title: input.title?.trim() || null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      pitch_id: input.pitchId || null,
      location_name: input.locationName?.trim() || null,
      maps_url: input.mapsUrl?.trim() || null,
      opponent: input.opponent?.trim() || null,
      opponent_academy_id: input.opponentAcademyId || null,
      notes: input.notes?.trim() || null,
      recurrence: input.recurrence ?? 'none',
      recurrence_until: input.recurrenceUntil || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

export async function cancelSession(sessionId: string, cancelled: boolean) {
  return academy()
    .from('sessions')
    .update({ is_cancelled: cancelled, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
}

export async function deleteSession(sessionId: string) {
  return academy().from('sessions').delete().eq('id', sessionId);
}

/** Splits an academy's matches into upcoming vs already played, for the stat row. */
export function scheduledPlayedMatchCounts(sessions: SessionRow[]) {
  const now = Date.now();
  let scheduled = 0;
  let played = 0;

  for (const session of sessions) {
    if (session.is_cancelled) continue;
    if (new Date(session.starts_at).getTime() > now) scheduled += 1;
    else played += 1;
  }

  return { scheduled, played };
}


/** Age in whole years, used to show who is a child at a glance. */
export function ageFromDateOfBirth(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;

  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) {
    age -= 1;
  }

  return age;
}

/** Every other active academy on MYPitch, for choosing a match opponent. */
export async function fetchOtherAcademies(exceptAcademyId: string): Promise<AcademyRow[]> {
  const { data } = await academy().rpc('search_academies', { term: '' });

  return ((data ?? []) as AcademyRow[]).filter((row) => row.id !== exceptAcademyId);
}
