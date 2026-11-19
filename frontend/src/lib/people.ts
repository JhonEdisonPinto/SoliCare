/** Up to two initials for an avatar: "Rosa Elena Pérez" gives "RP". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export const AVATAR_TONES = ['purple', 'blue', 'amber', 'green'] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

/** A stable avatar color for a person id, so a person keeps theirs across pages. */
export function avatarTone(id: string): AvatarTone {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
