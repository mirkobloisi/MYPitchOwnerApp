import { Platform } from 'react-native';

import { supabase } from './supabase';

const academy = () => supabase.schema('academy');

/** The reminder times an owner can choose, in minutes before kick-off. */
export const REMINDER_OFFSETS = [2880, 1440, 300, 240, 180, 120, 60, 30, 20, 10, 0] as const;
export const MAX_REMINDERS = 2;

export type PendingEnrolment = { enrolment_id: string; academy_id: string };

export type DirectoryPlayer = {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  academy_ids: string[];
  pending: PendingEnrolment[];
  parent_ids: string[];
};

export type DirectoryParent = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  has_account: boolean;
  child_ids: string[];
  academy_ids: string[];
  pending: PendingEnrolment[];
};

export type DirectoryCoach = {
  id: string;
  full_name: string;
  email: string | null;
  status: string;
  academy_ids: string[];
};

/** Everyone connected to a sports centre's academies. */
export type TeamDirectory = {
  players: DirectoryPlayer[];
  parents: DirectoryParent[];
  coaches: DirectoryCoach[];
};

export const EMPTY_DIRECTORY: TeamDirectory = { players: [], parents: [], coaches: [] };

export async function fetchTeamDirectory(pitchOwnerId: string): Promise<TeamDirectory> {
  const { data, error } = await academy().rpc('team_directory', { p_pitch_owner_id: pitchOwnerId });
  if (error) throw new Error(error.message);
  return (data as TeamDirectory | null) ?? EMPTY_DIRECTORY;
}

export type HubMatch = {
  id: string;
  academy_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  location_name: string | null;
  maps_url: string | null;
  opponent: string | null;
  opponent_academy_id: string | null;
  notes: string | null;
  kit_color: string | null;
  is_cancelled: boolean;
  pitch_id: string | null;
  home_score: number | null;
  away_score: number | null;
};

const MATCH_COLUMNS =
  'id, academy_id, title, starts_at, ends_at, location_name, maps_url, opponent, opponent_academy_id, notes, kit_color, is_cancelled, pitch_id, home_score, away_score';

export async function fetchHubMatches(academyIds: string[]): Promise<HubMatch[]> {
  if (!academyIds.length) return [];
  const { data, error } = await academy()
    .from('sessions')
    .select(MATCH_COLUMNS)
    .in('academy_id', academyIds)
    .eq('kind', 'match')
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as HubMatch[];
}

export type MatchPeople = {
  attendees: { member_id: string; response: 'invited' | 'going' | 'not_going' }[];
  reminders: { offset_minutes: number; sent_at: string | null; skipped: boolean }[];
};

export async function fetchMatchPeople(sessionId: string): Promise<MatchPeople> {
  const [attendees, reminders] = await Promise.all([
    academy().from('session_attendees').select('member_id, response').eq('session_id', sessionId),
    academy().from('match_reminders').select('offset_minutes, sent_at, skipped').eq('session_id', sessionId).order('offset_minutes', { ascending: false }),
  ]);
  if (attendees.error) throw new Error(attendees.error.message);
  if (reminders.error) throw new Error(reminders.error.message);
  return {
    attendees: (attendees.data ?? []) as MatchPeople['attendees'],
    reminders: (reminders.data ?? []) as MatchPeople['reminders'],
  };
}

export type MatchInput = {
  sessionId: string | null;
  academyId: string;
  startsAt: string;
  endsAt: string;
  pitchId: string | null;
  locationName: string | null;
  mapsUrl: string | null;
  opponent: string;
  opponentAcademyId: string | null;
  kitColor: string;
  notes: string;
  playerIds: string[];
  coachIds: string[];
  reminders: number[];
};

/** Creates or edits a match; the database books the pitch and tells the people picked. */
export async function saveHubMatch(input: MatchInput): Promise<{ id: string; notified: number }> {
  const { data, error } = await academy().rpc('save_match', {
    p_session_id: input.sessionId,
    p_academy_id: input.academyId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_pitch_id: input.pitchId,
    p_location_name: input.locationName,
    p_maps_url: input.mapsUrl,
    p_opponent: input.opponent.trim(),
    p_opponent_academy_id: input.opponentAcademyId,
    p_kit_color: input.kitColor.trim(),
    p_notes: input.notes.trim(),
    p_player_ids: input.playerIds,
    p_coach_ids: input.coachIds,
    p_reminder_offsets: input.reminders,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; notified: number };
}

export type VenuePitch = { id: string; name: string; city: string | null; area: string | null; maps_url: string | null };

/** The sports centre's pitches, readable by everyone who manages its academies. */
export async function fetchVenuePitches(pitchOwnerId: string): Promise<VenuePitch[]> {
  const { data, error } = await academy().rpc('venue_pitches', { p_pitch_owner_id: pitchOwnerId });
  if (error) throw new Error(error.message);
  return (data ?? []) as VenuePitch[];
}

export async function fetchPitchIsFree(pitchId: string, startsAt: string, endsAt: string, excludeSessionId: string | null): Promise<boolean> {
  const { data, error } = await academy().rpc('pitch_is_free', {
    p_pitch_id: pitchId,
    p_start: startsAt,
    p_end: endsAt,
    p_exclude_session: excludeSessionId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function setMatchCancelled(sessionId: string, cancelled: boolean): Promise<void> {
  const { error } = await academy().rpc('set_match_cancelled', { p_session_id: sessionId, p_cancelled: cancelled });
  if (error) throw new Error(error.message);
}

export async function assignToAcademy(memberId: string, academyId: string): Promise<void> {
  const { error } = await academy().rpc('owner_add_enrolment', { target_member_id: memberId, target_academy_id: academyId });
  if (error) throw new Error(error.message);
}

export async function removeFromAcademy(memberId: string, academyId: string): Promise<void> {
  const { error } = await academy().rpc('owner_remove_enrolment', { target_member_id: memberId, target_academy_id: academyId });
  if (error) throw new Error(error.message);
}

const OWNER_SITE_FALLBACK = 'https://owner.mypitchbookings.com';

/** Links always point at the site the owner is using (test or live). */
export function siteOrigin(): string {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : OWNER_SITE_FALLBACK;
}

export function parentJoinLink(inviteToken: string): string {
  return `${siteOrigin()}/join/${inviteToken}`;
}

/** Returns the full invitation link; the database emails it when an address is given. */
export async function createCoachInvite(academyId: string | null, email: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_coach_invite_link', {
    p_academy_id: academyId,
    p_email: email.trim() || null,
  });
  if (error) throw new Error(error.message);
  return `${siteOrigin()}/join-staff?token=${String(data)}`;
}

export type CoachContact = {
  member_id: string;
  full_name: string;
  role: 'office' | 'coach';
  my_member_id: string;
  conversation_id: string | null;
  last_body: string | null;
  last_at: string | null;
  unread_count: number;
};

export async function fetchCoachContacts(pitchOwnerId: string): Promise<CoachContact[]> {
  const { data, error } = await academy().rpc('team_chat_contacts', { p_pitch_owner_id: pitchOwnerId });
  if (error) throw new Error(error.message);
  return (data ?? []) as CoachContact[];
}

export async function openCoachChat(pitchOwnerId: string, memberId: string): Promise<string> {
  const { data, error } = await academy().rpc('start_team_chat', { p_pitch_owner_id: pitchOwnerId, p_other_member_id: memberId });
  if (error) throw new Error(error.message);
  return String(data);
}

export type SentAnnouncement = {
  id: string;
  subject: string;
  content: string;
  status: string;
  recipient_count: number;
  created_at: string;
  sent_at: string | null;
};

export async function fetchAnnouncements(academyIds: string[]): Promise<SentAnnouncement[]> {
  if (!academyIds.length) return [];
  const { data, error } = await academy()
    .from('communications')
    .select('id, subject, content, status, recipient_count, created_at, sent_at')
    .in('academy_id', academyIds)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as SentAnnouncement[];
}

export async function sendAnnouncement(input: {
  academyId: string;
  academyIds: string[];
  subject: string;
  content: string;
  recipientIds: string[];
}): Promise<void> {
  const { error } = await academy().rpc('create_communication', {
    target_academy_id: input.academyId,
    target_academy_ids: input.academyIds,
    target_kind: 'communication',
    target_subject: input.subject.trim(),
    target_content: input.content.trim(),
    target_recipient_ids: input.recipientIds,
  });
  if (error) throw new Error(error.message);
}
