// src/constants/frames.js
// Source unique pour TOUTES les frames (avatar + vidéo + commentaire).
//
// Champs :
//   id, name, desc, color, glow (bool), pointsPrice (number)
//   free (bool) — pas de prix
//   exclusive (bool) — attribuée automatiquement
//   electric (bool) — animation électrique (avatar seulement)
//   animated (bool) — frame animée (coûte $$ en plus de pts)
//   dollarsPrice (number) — si animated/premium, prix IAP en plus
//
// Règle de prix :
//   Non-lumineux non-animé → pointsPrice uniquement
//   Lumineux (glow) non-animé → pointsPrice uniquement
//   Animé/electric → dollarsPrice (0.99 / 1.99 / 2.99) + pointsPrice réduit

import { COLORS } from './colors';

// ─── AVATAR FRAMES ────────────────────────────────────────────────────────────
// 1 free + 10 standard + 10 glow + 20 animated + 3 exclusive = 44 total
export const FRAMES = [

  // ── Gratuit ─────────────────────────────────────────────────────────────────
  {
    id: 'none',
    name: 'No Frame',
    desc: 'Default look',
    color: COLORS.gray3,
    glow: false,
    pointsPrice: 0,
    free: true,
  },

  // ── Standard (10 couleurs distinctes) ────────────────────────────────────
  {
    id: 'bronze',
    name: 'Bronze',
    desc: 'Starter ranked ring',
    color: COLORS.bronze,
    glow: false,
    pointsPrice: 250,
  },
  {
    id: 'silver_ring',
    name: 'Silver',
    desc: 'Clean silver border',
    color: '#C0C0C0',
    glow: false,
    pointsPrice: 300,
  },
  {
    id: 'gold_solid',
    name: 'Gold',
    desc: 'Classic solid gold',
    color: COLORS.gold,
    glow: false,
    pointsPrice: 500,
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
    id: 'midnight',
    name: 'Midnight Blue',
    desc: 'Deep midnight ring',
    color: '#1A237E',
    glow: false,
    pointsPrice: 400,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    desc: 'Deep ocean blue',
    color: '#006994',
    glow: false,
    pointsPrice: 400,
  },
  {
    id: 'crimson',
    name: 'Crimson',
    desc: 'Bold dark red ring',
    color: '#B71C1C',
    glow: false,
    pointsPrice: 400,
  },
  {
    id: 'rose_gold',
    name: 'Rose Gold',
    desc: 'Elegant rose gold',
    color: '#B76E79',
    glow: false,
    pointsPrice: 400,
  },
  {
    id: 'lavender',
    name: 'Lavender',
    desc: 'Soft lavender ring',
    color: '#9575CD',
    glow: false,
    pointsPrice: 450,
  },
  {
    id: 'sapphire',
    name: 'Sapphire',
    desc: 'Royal sapphire blue',
    color: '#0F52BA',
    glow: false,
    pointsPrice: 600,
  },

  // ── Lumineux / Glow (10 couleurs distinctes) ──────────────────────────────
  {
    id: 'gold_elite',
    name: 'Gold Elite',
    desc: 'Premium gold glow ring',
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
    id: 'neon_pink',
    name: 'Neon Pink',
    desc: 'Hot pink neon glow',
    color: '#FF2D9D',
    glow: true,
    pointsPrice: 500,
  },
  {
    id: 'neon_orange',
    name: 'Neon Orange',
    desc: 'Burning orange glow',
    color: '#FF6D00',
    glow: true,
    pointsPrice: 500,
  },
  {
    id: 'purple_haze',
    name: 'Purple Haze',
    desc: 'Mystic violet glow',
    color: COLORS.purple,
    glow: true,
    pointsPrice: 750,
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
    id: 'toxic_glow',
    name: 'Toxic',
    desc: 'Radioactive green glow',
    color: '#39FF14',
    glow: true,
    pointsPrice: 700,
  },
  {
    id: 'lava_glow',
    name: 'Lava',
    desc: 'Molten lava glow',
    color: '#FF3D00',
    glow: true,
    pointsPrice: 800,
  },
  {
    id: 'void_glow',
    name: 'Void',
    desc: 'Dark void energy',
    color: '#BC13FE',
    glow: true,
    pointsPrice: 1000,
  },
  {
    id: 'rainbow_glow',
    name: 'Rainbow',
    desc: 'Full spectrum glow',
    color: '#FF0080',
    glow: true,
    pointsPrice: 1200,
  },

  // ── Animées (15 couleurs distinctes) ─────────────────────────────────────
  {
    id: 'neon_pulse_blue',
    name: 'Neon Pulse Blue',
    desc: 'Pulsing electric blue ring',
    color: '#00D4FF',
    glow: true, animated: true,
    pointsPrice: 1000, dollarsPrice: 1.39, currency: 'CAD',
  },
  {
    id: 'neon_pulse_pink',
    name: 'Neon Pulse Pink',
    desc: 'Pulsing hot pink ring',
    color: '#FF2D9D',
    glow: true, animated: true,
    pointsPrice: 1000, dollarsPrice: 1.39, currency: 'CAD',
  },
  {
    id: 'fire_animated',
    name: 'Fire 🔥',
    desc: 'Animated flame border',
    color: '#FF4500',
    glow: true, animated: true,
    pointsPrice: 1000, dollarsPrice: 1.39, currency: 'CAD',
  },
  {
    id: 'ice_animated',
    name: 'Ice ❄️',
    desc: 'Animated frozen ring',
    color: '#A0E8FF',
    glow: true, animated: true,
    pointsPrice: 1000, dollarsPrice: 1.39, currency: 'CAD',
  },
  {
    id: 'galaxy_animated',
    name: 'Galaxy 🌌',
    desc: 'Spinning galaxy ring',
    color: '#7C4DFF',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'rainbow_animated',
    name: 'Rainbow Spin 🌈',
    desc: 'Spinning rainbow neon',
    color: '#FF0080',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'lightning_animated',
    name: 'Lightning ⚡',
    desc: 'Electric lightning storm',
    color: '#FFD700',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'void_animated',
    name: 'Void King 👁️',
    desc: 'Dark void pulsing energy',
    color: '#BC13FE',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'cosmic_animated',
    name: 'Cosmic Power 💫',
    desc: 'Ultimate cosmic energy ring',
    color: '#E040FB',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'holographic_frame',
    name: 'Holographic ✨',
    desc: 'Prismatic rainbow shimmer',
    color: '#FF0080',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true,
  },
  {
    id: 'sakura_frame',
    name: 'Sakura 🌸',
    desc: 'Cherry blossom petals',
    color: '#FF69B4',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true,
  },
  {
    id: 'toxic_pulse_frame',
    name: 'Toxic Pulse ☢️',
    desc: 'Radioactive energy burst',
    color: '#39FF14',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true,
  },
  {
    id: 'blizzard_animated',
    name: 'Blizzard ❄️⚡',
    desc: 'Arctic blizzard storm ring',
    color: '#FFFFFF',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'dna_frame',
    name: 'DNA Helix 🧬',
    desc: 'Spinning DNA double helix',
    color: '#00FF88',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true,
  },
  {
    id: 'inferno_animated',
    name: 'Inferno 🔥',
    desc: 'Full inferno animated ring',
    color: '#FF2D00',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'blood_moon_frame',
    name: 'Blood Moon 🌕',
    desc: 'Crimson lunar energy ring',
    color: '#8B0000',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true,
  },
  {
    id: 'dragon_frame',
    name: 'Dragon 🐉',
    desc: 'Dragon fire energy ring',
    color: '#FF4500',
    glow: true, animated: true,
    pointsPrice: 2000, dollarsPrice: 2.49, currency: 'CAD', isNew: true,
  },
  {
    id: 'neon_pulse_orange',
    name: 'Neon Orange ⚡',
    desc: 'Pulsing electric orange ring',
    color: '#FF6D00',
    glow: true, animated: true,
    pointsPrice: 1000, dollarsPrice: 1.39, currency: 'CAD', isNew: true,
  },

  // ── Shimmer / Reflet (10 — arc lumineux rotatif) ────────────────────────
  { id: 'shimmer_silver',  name: 'Shimmer Silver 🪞',  desc: 'Rotating silver reflet arc',  color: '#E0E0E0', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'shimmer_gold',    name: 'Shimmer Gold ✨',    desc: 'Luxury gold shimmer arc',      color: '#FFD700', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'shimmer_holo',    name: 'Shimmer Holo 🌈',   desc: 'Holographic reflet ring',      color: '#FF0080', glow: true, animated: true, shimmer: true, pointsPrice: 2000, dollarsPrice: 2.49, currency: 'CAD', isNew: true },
  { id: 'shimmer_aurora',  name: 'Shimmer Aurora 🌌', desc: 'Aurora shimmer ring',          color: '#00FF88', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'shimmer_prism',   name: 'Shimmer Prism 🔮',  desc: 'Prismatic light arc',          color: '#7C4DFF', glow: true, animated: true, shimmer: true, pointsPrice: 2000, dollarsPrice: 2.49, currency: 'CAD', isNew: true },
  { id: 'shimmer_ice',     name: 'Shimmer Ice ❄️',    desc: 'Crystal sweep ring',           color: '#A0E8FF', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'shimmer_void',    name: 'Shimmer Void 🌑',   desc: 'Dark void reflet',             color: '#BC13FE', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'shimmer_fire',    name: 'Shimmer Fire 🔥',   desc: 'Flame reflet arc',             color: '#FF4500', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'shimmer_toxic',   name: 'Shimmer Toxic ☢️',  desc: 'Radioactive sweep',            color: '#39FF14', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'shimmer_cosmic',  name: 'Shimmer Cosmic 💫', desc: 'Cosmic reflet ring',           color: '#E040FB', glow: true, animated: true, shimmer: true, pointsPrice: 2000, dollarsPrice: 2.49, currency: 'CAD', isNew: true },

  // ── Exclusive (attribuées automatiquement) ─────────────────────────────────
  {
    id: 'champion',
    name: 'Champion ⚡',
    desc: 'Monthly GG champion only',
    color: '#E8C96B',
    glow: true, exclusive: true, electric: true,
    pointsPrice: 0,
  },
  {
    id: 'og_frame',
    name: 'OG 🔥',
    desc: 'First 1000 users — founding member',
    color: '#FF4500',
    glow: true, exclusive: true,
    pointsPrice: 0,
  },
  {
    id: 'verified_frame',
    name: 'Verified ✅',
    desc: 'Identity confirmed',
    color: COLORS.blue,
    glow: false, exclusive: true,
    pointsPrice: 0,
  },
];

// ─── VIDEO FRAMES ─────────────────────────────────────────────────────────────
export const VIDEO_FRAMES = [

  // Gratuit
  {
    id: 'none',
    name: 'No Frame',
    desc: 'Clean look',
    color: COLORS.gray3,
    glow: false,
    pointsPrice: 0,
    free: true,
  },

  // Non lumineux
  {
    id: 'vf_white',
    name: 'Arctic',
    desc: 'Clean white ring',
    color: '#E8EAF6',
    glow: false,
    pointsPrice: 350,
  },
  {
    id: 'vf_bronze',
    name: 'Bronze',
    desc: 'Warm bronze border',
    color: COLORS.bronze,
    glow: false,
    pointsPrice: 350,
  },
  {
    id: 'vf_silver',
    name: 'Silver',
    desc: 'Classic silver border',
    color: '#C0C0C0',
    glow: false,
    pointsPrice: 400,
  },
  {
    id: 'vf_rose_gold',
    name: 'Rose Gold',
    desc: 'Elegant rose gold',
    color: '#B76E79',
    glow: false,
    pointsPrice: 400,
  },
  {
    id: 'vf_midnight',
    name: 'Midnight',
    desc: 'Dark midnight border',
    color: '#1A237E',
    glow: false,
    pointsPrice: 400,
  },
  {
    id: 'vf_obsidian',
    name: 'Obsidian',
    desc: 'Dark volcanic glass',
    color: '#1C1C1C',
    glow: false,
    pointsPrice: 450,
  },
  {
    id: 'vf_sapphire',
    name: 'Sapphire',
    desc: 'Royal sapphire border',
    color: '#0F52BA',
    glow: false,
    pointsPrice: 500,
  },
  {
    id: 'vf_gold_solid',
    name: 'Gold',
    desc: 'Classic solid gold border',
    color: COLORS.gold,
    glow: false,
    pointsPrice: 500,
  },

  // Lumineux
  {
    id: 'vf_gold',
    name: 'Gold Elite',
    desc: 'Classic gold glow border',
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
    id: 'vf_neon_pink',
    name: 'Neon Pink',
    desc: 'Hot pink neon border',
    color: '#FF2D9D',
    glow: true,
    pointsPrice: 600,
  },
  {
    id: 'vf_toxic',
    name: 'Toxic',
    desc: 'Radioactive green border',
    color: '#39FF14',
    glow: true,
    pointsPrice: 700,
  },
  {
    id: 'vf_lava',
    name: 'Lava',
    desc: 'Molten lava border',
    color: '#FF3D00',
    glow: true,
    pointsPrice: 800,
  },
  {
    id: 'vf_galaxy',
    name: 'Galaxy',
    desc: 'Cosmic purple border',
    color: '#7C4DFF',
    glow: true,
    pointsPrice: 900,
  },
  {
    id: 'vf_void',
    name: 'Void',
    desc: 'Dark void energy border',
    color: '#BC13FE',
    glow: true,
    pointsPrice: 1000,
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
    id: 'vf_diamond',
    name: 'Diamond',
    desc: 'Crystal clear glow',
    color: '#B2EBF2',
    glow: true,
    pointsPrice: 1000,
  },
  {
    id: 'vf_rainbow',
    name: 'Rainbow',
    desc: 'Full spectrum glow border',
    color: '#FF0080',
    glow: true,
    pointsPrice: 1200,
  },

  // Animées
  {
    id: 'vf_fire_animated',
    name: 'Fire Animated 🔥',
    desc: 'Animated flame border',
    color: '#FF4500',
    glow: true, animated: true,
    pointsPrice: 1000, dollarsPrice: 1.39, currency: 'CAD',
  },
  {
    id: 'vf_lightning_animated',
    name: 'Lightning ⚡',
    desc: 'Electric lightning border',
    color: '#FFD700',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'vf_galaxy_animated',
    name: 'Galaxy Animated 🌌',
    desc: 'Spinning galaxy border',
    color: '#7C4DFF',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'vf_rainbow_animated',
    name: 'Rainbow Spin 🌈',
    desc: 'Spinning rainbow border',
    color: '#FF0080',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'vf_royal_animated',
    name: 'Royal Gold ✨',
    desc: 'Shimmering gold border',
    color: '#FFD700',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'vf_cosmic_animated',
    name: 'Cosmic Power 💫',
    desc: 'Ultimate cosmic border',
    color: '#E040FB',
    glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD',
  },
  {
    id: 'vf_holographic_anim',
    name: 'Holographic ✨',
    desc: 'Prismatic shimmer border',
    color: '#FF0080', glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true,
  },
  {
    id: 'vf_sakura_anim',
    name: 'Sakura 🌸',
    desc: 'Cherry blossom border',
    color: '#FF69B4', glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true,
  },
  {
    id: 'vf_toxic_anim',
    name: 'Toxic Pulse ☢️',
    desc: 'Radioactive border',
    color: '#39FF14', glow: true, animated: true,
    pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true,
  },

  // ── Animées avec effet de reflet / shimmer (10) ──────────────────────────
  { id: 'vf_shimmer_silver',  name: 'Shimmer Silver 🪞',  desc: 'Sweeping silver reflet',      color: '#E0E0E0', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'vf_shimmer_gold',    name: 'Shimmer Gold ✨',     desc: 'Luxury gold sweep',            color: '#FFD700', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'vf_shimmer_holo',    name: 'Shimmer Holo 🌈',    desc: 'Holographic reflet',           color: '#FF0080', glow: true, animated: true, shimmer: true, pointsPrice: 2000, dollarsPrice: 2.49, currency: 'CAD', isNew: true },
  { id: 'vf_shimmer_aurora',  name: 'Shimmer Aurora 🌌',  desc: 'Aurora borealis sweep',        color: '#00FF88', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'vf_shimmer_prism',   name: 'Shimmer Prism 🔮',   desc: 'Prismatic light split',        color: '#7C4DFF', glow: true, animated: true, shimmer: true, pointsPrice: 2000, dollarsPrice: 2.49, currency: 'CAD', isNew: true },
  { id: 'vf_shimmer_ice',     name: 'Shimmer Ice ❄️',     desc: 'Crystal ice sweep',            color: '#A0E8FF', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'vf_shimmer_void',    name: 'Shimmer Void 🌑',    desc: 'Dark void reflet',             color: '#BC13FE', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'vf_shimmer_fire',    name: 'Shimmer Fire 🔥',    desc: 'Flame reflet sweep',           color: '#FF4500', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'vf_shimmer_toxic',   name: 'Shimmer Toxic ☢️',   desc: 'Radioactive sweep',            color: '#39FF14', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'vf_shimmer_rose',    name: 'Shimmer Rose 🌸',    desc: 'Sakura pink sweep',            color: '#FF69B4', glow: true, animated: true, shimmer: true, pointsPrice: 1500, dollarsPrice: 1.99, currency: 'CAD', isNew: true },

  // Exclusive
  {
    id: 'vf_champion',
    name: 'Champion ⚡',
    desc: 'Monthly GG champion only',
    color: '#E8C96B',
    glow: true, exclusive: true, electric: true,
    pointsPrice: 0,
  },
  {
    id: 'vf_leader',
    name: '#1 Leader 🔥',
    desc: 'Current #1 ranked player only',
    color: '#00D4FF',
    glow: true, exclusive: true, electric: true,
    pointsPrice: 0,
  },
];

// ─── COMMENT FRAMES ───────────────────────────────────────────────────────────
export const COMMENT_FRAMES = [
  // Gratuits
  { id: 'none',              name: 'Default',          color: 'transparent', glow: false, pointsPrice: 0,    exclusive: false },
  { id: 'cf_white',          name: 'White Border',     color: '#FFFFFF',     glow: false, pointsPrice: 0,    exclusive: false, free: true },

  // Non lumineux
  { id: 'cf_gold_solid',     name: 'Gold',             color: '#C9A84C',     glow: false, pointsPrice: 150,  exclusive: false },
  { id: 'cf_silver',         name: 'Silver',           color: '#C0C0C0',     glow: false, pointsPrice: 150,  exclusive: false },
  { id: 'cf_rose_gold',      name: 'Rose Gold',        color: '#B76E79',     glow: false, pointsPrice: 200,  exclusive: false },
  { id: 'cf_midnight',       name: 'Midnight',         color: '#1A237E',     glow: false, pointsPrice: 200,  exclusive: false },
  { id: 'cf_obsidian',       name: 'Obsidian',         color: '#1C1C1C',     glow: false, pointsPrice: 200,  exclusive: false },
  { id: 'cf_bronze',         name: 'Bronze',           color: COLORS.bronze, glow: false, pointsPrice: 150,  exclusive: false },
  { id: 'cf_sapphire',       name: 'Sapphire',         color: '#0F52BA',     glow: false, pointsPrice: 250,  exclusive: false },
  { id: 'cf_ruby',           name: 'Ruby',             color: '#9C0027',     glow: false, pointsPrice: 250,  exclusive: false },
  { id: 'cf_forest',         name: 'Forest',           color: '#1B5E20',     glow: false, pointsPrice: 200,  exclusive: false },
  { id: 'cf_lavender',       name: 'Lavender',         color: '#9575CD',     glow: false, pointsPrice: 200,  exclusive: false },

  // Lumineux
  { id: 'cf_gold',           name: 'Gold Glow',        color: '#C9A84C',     glow: true,  pointsPrice: 200,  exclusive: false },
  { id: 'cf_blue',           name: 'Neon Blue',        color: '#00D4FF',     glow: true,  pointsPrice: 350,  exclusive: false },
  { id: 'cf_red',            name: 'GOAT Red',         color: '#FF2D55',     glow: true,  pointsPrice: 500,  exclusive: false },
  { id: 'cf_purple',         name: 'Purple Haze',      color: '#BF5AF2',     glow: true,  pointsPrice: 400,  exclusive: false },
  { id: 'cf_emerald',        name: 'Emerald',          color: '#30D158',     glow: true,  pointsPrice: 300,  exclusive: false },
  { id: 'cf_pink',           name: 'Neon Pink',        color: '#FF2D9D',     glow: true,  pointsPrice: 350,  exclusive: false },
  { id: 'cf_orange',         name: 'Neon Orange',      color: '#FF6D00',     glow: true,  pointsPrice: 350,  exclusive: false },
  { id: 'cf_toxic',          name: 'Toxic',            color: '#39FF14',     glow: true,  pointsPrice: 400,  exclusive: false },
  { id: 'cf_cyan',           name: 'Cyan Flash',       color: '#00E5FF',     glow: true,  pointsPrice: 400,  exclusive: false },
  { id: 'cf_magenta',        name: 'Magenta',          color: '#E040FB',     glow: true,  pointsPrice: 400,  exclusive: false },
  { id: 'cf_lava',           name: 'Lava',             color: '#FF3D00',     glow: true,  pointsPrice: 450,  exclusive: false },
  { id: 'cf_ice',            name: 'Ice',              color: '#A0E8FF',     glow: true,  pointsPrice: 450,  exclusive: false },
  { id: 'cf_galaxy',         name: 'Galaxy',           color: '#7C4DFF',     glow: true,  pointsPrice: 500,  exclusive: false },
  { id: 'cf_fire',           name: 'Fire',             color: '#FF4500',     glow: true,  pointsPrice: 500,  exclusive: false },
  { id: 'cf_void',           name: 'Void',             color: '#BC13FE',     glow: true,  pointsPrice: 600,  exclusive: false },
  { id: 'cf_diamond',        name: 'Diamond',          color: '#B2EBF2',     glow: true,  pointsPrice: 600,  exclusive: false },
  { id: 'cf_rainbow',        name: 'Rainbow',          color: '#FF0080',     glow: true,  pointsPrice: 700,  exclusive: false },
  { id: 'cf_royal_gold',     name: 'Royal Gold',       color: '#FFD700',     glow: true,  pointsPrice: 700,  exclusive: false },
  { id: 'cf_nebula',         name: 'Nebula',           color: '#9C27B0',     glow: true,  pointsPrice: 700,  exclusive: false },
  { id: 'cf_solar',          name: 'Solar Flare',      color: '#FF8C00',     glow: true,  pointsPrice: 500,  exclusive: false },

  // Animées
  { id: 'cf_pulse_blue',     name: 'Pulse Blue',       color: '#00D4FF',     glow: true,  pointsPrice: 750,  exclusive: false, animated: true, dollarsPrice: 0.99 },
  { id: 'cf_fire_animated',  name: 'Fire Animated 🔥', color: '#FF4500',     glow: true,  pointsPrice: 750,  exclusive: false, animated: true, dollarsPrice: 0.99 },
  { id: 'cf_lightning',      name: 'Lightning ⚡',     color: '#FFD700',     glow: true,  pointsPrice: 1500, exclusive: false, animated: true, dollarsPrice: 1.99 },
  { id: 'cf_rainbow_anim',   name: 'Rainbow Spin 🌈',  color: '#FF0080',     glow: true,  pointsPrice: 1500, exclusive: false, animated: true, dollarsPrice: 1.99 },
  { id: 'cf_royal_anim',     name: 'Royal Gold ✨',    color: '#FFD700',     glow: true,  pointsPrice: 1500, exclusive: false, animated: true, dollarsPrice: 1.99 },
  { id: 'cf_cosmic_anim',    name: 'Cosmic 💫',        color: '#E040FB',     glow: true,  pointsPrice: 1500, exclusive: false, animated: true, dollarsPrice: 1.99 },
  { id: 'cf_holographic_anim', name: 'Holographic ✨', color: '#FF0080', glow: true, animated: true, pointsPrice: 1500, dollarsPrice: 1.99, exclusive: false, isNew: true },
  { id: 'cf_glitch_anim',    name: 'Glitch 💻',        color: '#00D4FF', glow: true, animated: true, pointsPrice: 1000, dollarsPrice: 1.49, exclusive: false, isNew: true },
  { id: 'cf_sakura_anim',    name: 'Sakura 🌸',        color: '#FF69B4', glow: true, animated: true, pointsPrice: 1500, dollarsPrice: 1.99, exclusive: false, isNew: true },
  { id: 'cf_void_pulse',     name: 'Void Pulse 🌑',    color: '#7C4DFF', glow: true, animated: true, pointsPrice: 1500, dollarsPrice: 1.99, exclusive: false, isNew: true },
  { id: 'cf_toxic_cf',       name: 'Toxic ☢️',          color: '#39FF14', glow: true, animated: true, pointsPrice: 750,  dollarsPrice: 0.99, exclusive: false, isNew: true },

  // Exclusives
  { id: 'cf_champion',       name: 'Champion ⚡',      color: '#E8C96B',     glow: true,  pointsPrice: 0,    exclusive: true  },
  { id: 'cf_fanbase',        name: 'Fanbase 💜',       color: '#7C4DFF',     glow: true,  pointsPrice: 0,    exclusive: true  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
export const getFrameById      = (id) => FRAMES.find((f) => f.id === id) || null;
export const getVideoFrameById = (id) => VIDEO_FRAMES.find((f) => f.id === id) || null;
export const getCommentFrameById = (id) => COMMENT_FRAMES.find(f => f.id === id) || COMMENT_FRAMES[0];

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

export const videoFrameColor = (videoFrameId) => {
  const f = getVideoFrameById(videoFrameId);
  if (f && f.id !== 'none') return f.color;
  return null;
};

export const hasVideoFrameGlow = (videoFrameId) => {
  const f = getVideoFrameById(videoFrameId);
  return f?.glow === true;
};

export const commentFrameStyle = (user) => {
  if (user?.isChampion) return { id: 'cf_champion', color: '#E8C96B', glow: true };
  const frameId = user?.equippedCommentFrame;
  if (!frameId || frameId === 'none') return null;
  return getCommentFrameById(frameId);
};
