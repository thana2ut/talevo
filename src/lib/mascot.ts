/**
 * Mascot visual rules: use this single white-and-purple character only; never
 * use it as a user avatar or in place of semantic task, exam, finance, or alert icons.
 * Full body is reserved for hero surfaces; the head crop is for compact support UI.
 */
export const mascotVariants = ["neutral", "happy", "wink", "thinking", "focused", "celebrate", "sleepy"] as const;
export type MascotVariant = (typeof mascotVariants)[number];
export const mascotCrops = ["head", "upper", "full"] as const;
export type MascotCrop = (typeof mascotCrops)[number];

type MascotAsset = { src: string; width: number; height: number };
type MascotAssetSet = Record<MascotCrop, MascotAsset>;

const neutralAssets: MascotAssetSet = {
  head: { src: "/brand/talevo-mascot-head.png", width: 544, height: 544 },
  upper: { src: "/assets/mascot/mascot-upper-neutral.png", width: 470, height: 588 },
  full: { src: "/assets/mascot/mascot-full-turnaround-v2.png", width: 1086, height: 1448 },
};

// The supplied transparent turnaround currently provides a neutral expression.
// Semantic variants intentionally resolve to that approved source instead of inventing a different character.
export const MASCOT_ASSETS: Record<MascotVariant, MascotAssetSet> = {
  neutral: neutralAssets,
  happy: neutralAssets,
  wink: neutralAssets,
  thinking: neutralAssets,
  focused: neutralAssets,
  celebrate: neutralAssets,
  sleepy: neutralAssets,
};
