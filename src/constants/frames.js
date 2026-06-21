// src/constants/frames.js
// Source unique pour TOUTES les frames (avatar + vidéo).
// userProfile.equippedFrame = id frame avatar équipée
// userProfile.ownedFrames   = [] ids achetés
// video.videoFrame           = id frame choisie à l'upload

import { COLORS } from './colors';

// ─── AVATAR FRAMES ───────────────────────────────────────────────────────────
export const FRAMES = [
  {
    id: 'none',
    name: 'No Frame',
    desc: 'Default look',
    color: COLORS.gray3,
    glow: false,
    pointsPrice: 0,
    free: true,
  },
  {
    id: 'gold_elite',
    name: 'Gold Elite',
    desc: 'Premium gold border',
    color: COLORS.gold,
    glow: true,
    pointsPrice: 500,
  },
  {
    id: 'neon_blue',
    name: 'Neon Blue',
    desc: 'Electric blue glow',
    color: COLORS.blue,
    glow: true,
    pointsPrice: 500,
  },
  {
    id: 'goat_red',
    name: 'GOAT Red',
    desc: 'Only for legends',
    color: COLORS.red,
    glow: true,
    pointsPrice: 1000,
  },
  {
    id: 'purple_haze',
    name: 'Purple Haze',
    desc: 'Mystic violet ring',
    color: COLORS.purple,
    glow: true,
    pointsPrice: 750,
  },
  {
    id: 'emerald',
    name: 'Emerald',
    desc: 'Fresh green energy',
    color: COLORS.green,
    glow: false,
    pointsPrice: 400,
  },
  {
    id: 'bronze',
    name: 'Bronze',
    desc: 'Starter ranked ring',
    color: COLORS.bronze,
    glow: false,
    pointsPrice: 250,
  },
  {
    id: 'champion',
    name: 'Champion ⚡',
    desc: 'Monthly GG champion only',
    color: '#E8C96B',
    glow: true,
    exclusive: true,
    electric: true,   // déclenche ElectricRing dans l'avatar
  },
];

// ─── VIDEO FRAMES ─────────────────────────────────────────────────────────────
// Frames qui s'affichent en bordure de la vidéo dans le feed et le profil.
// Chaque vidéo conserve la frame choisie à l'upload (field `videoFrame`).
export const VIDEO_FRAMES = [
  {
    id: 'none',
    name: 'No Frame',
    desc: 'Clean look',
    color: COLORS.gray3,
    glow: false,
    pointsPrice: 0,
    free: true,
  },
  {
    id: 'vf_gold',
    name: 'Gold Elite',
    desc: 'Classic gold border',
    color: COLORS.gold,
    glow: true,
    pointsPrice: 600,
  },
  {
    id: 'vf_ice',
    name: 'Ice Blue',
    desc: 'Frozen neon border',
    color: '#00E5FF',
    glow: true,
    pointsPrice: 500,
  },
  {
    id: 'vf_fire',
    name: 'Fire Red',
    desc: 'Blazing red frame',
    color: '#FF4500',
    glow: true,
    pointsPrice: 600,
  },
  {
    id: 'vf_matrix',
    name: 'Matrix',
    desc: 'Hacker green pulse',
    color: '#00FF41',
    glow: true,
    pointsPrice: 750,
  },
  {
    id: 'vf_violet',
    name: 'Violet Storm',
    desc: 'Deep purple energy',
    color: '#9B59B6',
    glow: true,
    pointsPrice: 500,
  },
  {
    id: 'vf_white',
    name: 'Arctic',
    desc: 'Clean white ring',
    color: '#E8EAF6',
    glow: false,
    pointsPrice: 350,
  },
  {
    id: 'vf_goat',
    name: 'GOAT',
    desc: 'For the elite only',
    color: COLORS.red,
    glow: true,
    pointsPrice: 1200,
  },
  {
    id: 'vf_champion',
    name: 'Champion ⚡',
    desc: 'Monthly GG champion only',
    color: '#E8C96B',
    glow: true,
    exclusive: true,
    electric: true,
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
export const getFrameById     = (id) => FRAMES.find((f) => f.id === id) || null;
export const getVideoFrameById = (id) => VIDEO_FRAMES.find((f) => f.id === id) || null;

export const ringColorForUser = (user, fallback = COLORS.gray3) => {
  const frame = getFrameById(user?.equippedFrame);
  if (frame && frame.id !== 'none') return frame.color;
  if (user?.plan === 'legendary') return COLORS.gold;
  return fallback;
};

export const glowColorForUser = (user) => {
  const frame = getFrameById(user?.equippedFrame);
  if (frame && frame.id !== 'none' && frame.glow) return frame.color;
  return null;
};

// Helpers pour les frames vidéo
export const videoFrameColor = (videoFrameId) => {
  const f = getVideoFrameById(videoFrameId);
  if (f && f.id !== 'none') return f.color;
  return null;
};

export const hasVideoFrameGlow = (videoFrameId) => {
  const f = getVideoFrameById(videoFrameId);
  return f?.glow === true;
};

// ─── COMMENT FRAMES ───────────────────────────────────────────────────────────
// Contour de la bulle de commentaire, achetable en GA Points
export const COMMENT_FRAMES = [
  { id: 'none',         name: 'Default',       color: 'transparent', glow: false, pointsPrice: 0,    exclusive: false },
  { id: 'cf_gold',      name: 'Gold Border',   color: '#C9A84C',     glow: false, pointsPrice: 200,  exclusive: false },
  { id: 'cf_blue',      name: 'Neon Blue',     color: '#00D4FF',     glow: true,  pointsPrice: 350,  exclusive: false },
  { id: 'cf_red',       name: 'GOAT Red',      color: '#FF2D55',     glow: true,  pointsPrice: 500,  exclusive: false },
  { id: 'cf_purple',    name: 'Purple Haze',   color: '#BF5AF2',     glow: true,  pointsPrice: 400,  exclusive: false },
  { id: 'cf_emerald',   name: 'Emerald',       color: '#30D158',     glow: false, pointsPrice: 300,  exclusive: false },
  { id: 'cf_champion',  name: 'Champion ⚡',   color: '#E8C96B',     glow: true,  pointsPrice: 0,    exclusive: true  },
];

export const getCommentFrameById = (id) => COMMENT_FRAMES.find(f => f.id === id) || COMMENT_FRAMES[0];

export const commentFrameStyle = (user) => {
  // Champion → frame exclusive électrique
  if (user?.isChampion) return { id: 'cf_champion', color: '#E8C96B', glow: true };
  const frameId = user?.equippedCommentFrame;
  if (!frameId || frameId === 'none') return null;
  return getCommentFrameById(frameId);
};
