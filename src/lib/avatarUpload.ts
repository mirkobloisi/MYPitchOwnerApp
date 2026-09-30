import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export class AvatarPickCancelledError extends Error {}

export type PickedAvatarImage = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Opens the device's native photo library picker (iOS/Android) and returns
 * the raw chosen image, with no native crop step — cropping happens
 * afterwards in AvatarCropModal, since neither platform's own picker editor
 * offers a circular selection (Android supports shape: 'oval' but iOS's
 * editor is a plain rectangle only). Throws AvatarPickCancelledError if the
 * owner backs out of the picker.
 *
 * Web has its own picking mechanism entirely — see
 * AvatarPickerTrigger.web.tsx — because expo-image-picker's web shim opens
 * the file dialog via a synthetic click, which browsers silently ignore.
 */
export async function pickAvatarImage(): Promise<PickedAvatarImage> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error('Photo library access is needed to change your profile picture.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    throw new AvatarPickCancelledError();
  }

  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/**
 * Crops the picked image to the given square region (in the image's own
 * pixel coordinates, as produced by AvatarCropModal), resizes it to a sane
 * upload size, and uploads it to this owner's folder in the `avatars`
 * bucket — the same bucket and storage RLS the User App's players use
 * (writes are scoped to the caller's own auth.uid() prefix, not to any
 * particular table). Returns the public URL.
 */
export async function cropAndUploadAvatar(
  userId: string,
  image: PickedAvatarImage,
  crop: { originX: number; originY: number; size: number }
): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    image.uri,
    [
      { crop: { originX: crop.originX, originY: crop.originY, width: crop.size, height: crop.size } },
      { resize: { width: 512, height: 512 } },
    ],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );

  const response = await fetch(manipulated.uri);
  const arrayBuffer = await response.arrayBuffer();

  // A fresh filename each time (rather than overwriting one fixed path) so a
  // CDN/browser cache never serves a stale image under the same URL.
  const path = `${userId}/avatar-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Same crop/resize/compress pipeline into the academy's own bucket, under its
 * id — which is what the storage policy checks, so only that academy's owner
 * can write there.
 *
 * Public, unlike academy member avatars: a crest is branding, not a
 * photograph of a child, so it needs no signed URL.
 */
export async function cropAndUploadAcademyLogo(
  academyId: string,
  image: PickedAvatarImage,
  crop: { originX: number; originY: number; size: number }
): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    image.uri,
    [
      { crop: { originX: crop.originX, originY: crop.originY, width: crop.size, height: crop.size } },
      { resize: { width: 512, height: 512 } },
    ],
    { format: ImageManipulator.SaveFormat.PNG }
  );

  const response = await fetch(manipulated.uri);
  const arrayBuffer = await response.arrayBuffer();

  const path = `${academyId}/logo-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from('academy-images')
    .upload(path, arrayBuffer, { contentType: 'image/png', upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('academy-images').getPublicUrl(path);
  return data.publicUrl;
}

/** Crops the academy's wide cover image using the rectangle selected in the crop preview. */
export async function cropAndUploadAcademyCover(
  academyId: string,
  image: PickedAvatarImage,
  crop: { originX: number; originY: number; width: number; height: number }
): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    image.uri,
    [
      { crop: { originX: crop.originX, originY: crop.originY, width: crop.width, height: crop.height } },
      { resize: { width: 1440 } },
    ],
    { compress: 0.86, format: ImageManipulator.SaveFormat.JPEG }
  );

  const response = await fetch(manipulated.uri);
  const arrayBuffer = await response.arrayBuffer();
  const path = `${academyId}/cover-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('academy-images')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });

  if (error) throw error;
  const { data } = supabase.storage.from('academy-images').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * A viewable URL for an academy member's photo.
 *
 * Unlike the academy crest, member photos live in a private bucket — they are
 * pictures of children. Storage RLS already lets an academy's owner read the
 * photos of everyone enrolled with them, so this only has to sign the path;
 * the signature expires, so it is fetched when the picture is shown rather
 * than stored.
 *
 * Returns null for a member with no photo, or when signing is refused, so a
 * caller can fall back to a placeholder without special-casing errors.
 */
export async function signedMemberAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from('academy-avatars')
    .createSignedUrl(path, 60 * 60);

  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Signs several at once, keyed by member id, for a roster. */
export async function signedMemberAvatars(
  members: { id: string; avatar_url: string | null }[]
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    members.map(async (member) => [member.id, await signedMemberAvatarUrl(member.avatar_url)] as const)
  );

  return Object.fromEntries(entries);
}

/**
 * A group's picture: cropped square, shrunk, and uploaded under the
 * conversation's own id, which is what the storage policy checks — so only
 * the group's leader can write there.
 *
 * Public, unlike a member's photo: a group picture is a label for a
 * conversation, not a photograph of a child.
 */
export async function cropAndUploadGroupImage(
  conversationId: string,
  image: PickedAvatarImage,
  crop: { originX: number; originY: number; size: number }
): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    image.uri,
    [
      { crop: { originX: crop.originX, originY: crop.originY, width: crop.size, height: crop.size } },
      { resize: { width: 512, height: 512 } },
    ],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );

  const response = await fetch(manipulated.uri);
  const arrayBuffer = await response.arrayBuffer();

  const path = `${conversationId}/group-${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('academy-group-images')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('academy-group-images').getPublicUrl(path);
  return data.publicUrl;
}
