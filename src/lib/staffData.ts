import { Platform } from 'react-native';

import { supabase } from './supabase';

export type StaffMember = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  allowed_tabs: string[];
  status: 'active' | 'inactive' | string;
  created_at: string;
};

export type StaffInvite = {
  id: string;
  invited_email: string | null;
  allowed_tabs: string[];
  expires_at: string;
  created_at: string;
};

const OWNER_SITE_FALLBACK = 'https://owner.mypitchbookings.com';

/** The address a staff member opens to accept: always on the site the owner is using. */
export function staffInviteLink(token: string): string {
  const origin =
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : OWNER_SITE_FALLBACK;
  return `${origin}/join-staff?token=${token}`;
}

export async function fetchStaffMembers(): Promise<StaffMember[]> {
  // Row level security narrows this to the signed-in owner's own staff.
  const { data, error } = await supabase
    .from('owner_staff_memberships')
    .select('id, user_id, full_name, email, allowed_tabs, status, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as StaffMember[] | null) ?? [];
}

export async function fetchPendingStaffInvites(): Promise<StaffInvite[]> {
  const { data, error } = await supabase
    .from('owner_staff_invites')
    .select('id, invited_email, allowed_tabs, expires_at, created_at')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as StaffInvite[] | null) ?? [];
}

/** Returns the invitation's secret token (the email, if any, is sent by the database). */
export async function createStaffInvite(tabs: string[], email: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_owner_staff_invite', {
    p_allowed_tabs: tabs,
    p_email: email,
  });
  if (error) throw error;
  return String(data);
}

export async function revokeStaffInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from('owner_staff_invites').delete().eq('id', inviteId);
  if (error) throw error;
}

export async function updateStaffTabs(membershipId: string, tabs: string[]): Promise<void> {
  const { error } = await supabase
    .from('owner_staff_memberships')
    .update({ allowed_tabs: tabs, updated_at: new Date().toISOString() })
    .eq('id', membershipId);
  if (error) throw error;
}

/** Turning access off/on and removing an account needs the server (it manages the sign-in). */
export async function staffAccountAction(
  membershipId: string,
  action: 'deactivate' | 'activate' | 'delete'
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('owner-staff-admin', {
    body: { membershipId, action },
  });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
}
