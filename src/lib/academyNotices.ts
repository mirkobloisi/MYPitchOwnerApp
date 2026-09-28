import { supabase } from './supabase';

const academy = () => supabase.schema('academy');

export type AcademyNotice = {
  id: string;
  member_id: string;
  academy_id: string | null;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Which part of the app a notice belongs to. The bell is drawn on the tab the
 * notice came from, so the owner is pointed at the thing that changed rather
 * than at a list they then have to read through.
 */
export type NoticeArea = 'players' | 'parents' | 'messages';

export type UnreadByArea = Record<NoticeArea, number>;

export const NO_UNREAD: UnreadByArea = { players: 0, parents: 0, messages: 0 };

/**
 * Unread notices for this owner, already counted per area.
 *
 * A join request says in its body whether it came from a player or a parent,
 * which is what decides between those two tabs.
 */
export async function fetchUnreadByArea(): Promise<UnreadByArea> {
  const { data } = await academy()
    .from('notifications')
    .select('id, type, body')
    .is('read_at', null);

  const counts: UnreadByArea = { ...NO_UNREAD };

  for (const row of (data ?? []) as { type: string; body: string | null }[]) {
    if (row.type === 'message') counts.messages += 1;
    else if (row.type === 'enrolment_request') {
      if (row.body === 'Parent') counts.parents += 1;
      else counts.players += 1;
    }
  }

  return counts;
}

export async function fetchNotices(): Promise<AcademyNotice[]> {
  const { data } = await academy()
    .from('notifications')
    .select('id, member_id, academy_id, type, title, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(80);

  return (data ?? []) as AcademyNotice[];
}

/** Marks one notice read — tapping it in the inbox panel is what counts as reading it. */
export async function markNoticeRead(id: string) {
  return academy()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
}

/**
 * Marks everything in one area read. Called when the owner opens that tab —
 * looking at it is what counts as having read it, so there is no separate
 * "mark as read" for them to remember.
 */
export async function markAreaRead(area: NoticeArea) {
  const now = new Date().toISOString();

  let query = academy().from('notifications').update({ read_at: now }).is('read_at', null);

  if (area === 'messages') {
    query = query.eq('type', 'message');
  } else {
    query = query.eq('type', 'enrolment_request').eq('body', area === 'parents' ? 'Parent' : 'Player');
  }

  return query;
}
