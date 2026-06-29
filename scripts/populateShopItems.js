#!/usr/bin/env node
/**
 * populateShopItems.js
 * Migrates ALL cosmetics/frames to Firestore shop_items collection.
 * Run: node scripts/populateShopItems.js [--dry-run] [--clear]
 *
 * Service account: /Users/papaassanediop/Documents/Mes Projets/keys/service-account.json
 */

const admin = require('firebase-admin');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const CLEAR_FIRST = process.argv.includes('--clear');

// ── Init Firebase ──────────────────────────────────────────────────────────
const serviceAccount = require(path.join(__dirname, '../../keys/service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Helper: build doc ──────────────────────────────────────────────────────
function makeDoc(item, category, itemType, order) {
  return {
    id: item.id,
    name: item.name || '',
    desc: item.desc || item.preview || '',
    category,
    itemType,            // for webhook routing
    rarity: item.rarity || 'common',
    free: item.free || false,
    legendaryFree: item.legendaryFree || false,
    exclusive: item.exclusive || false,
    pointsPrice: item.pointsPrice || 0,
    dollarsPrice: item.dollarsPrice || null,
    animated: item.animated || false,
    glow: item.glow || false,
    electric: item.electric || false,
    colors: item.colors || (item.color ? [item.color] : []),
    color: item.color || (item.colors ? item.colors[0] : null),
    preview: item.preview || item.desc || '',
    emoji: item.emoji || null,
    includes: item.includes || null,
    isNew: item.isNew || false,
    seasonal: item.seasonal || false,
    active: true,
    order,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// ── All items ──────────────────────────────────────────────────────────────

// AVATAR FRAMES
const FRAMES = [
  { id: 'none', name: 'No Frame', desc: 'Default look', color: '#2A2A3A', glow: false, pointsPrice: 0, free: true },
  { id: 'bronze', name: 'Bronze', desc: 'Starter ranked ring', color: '#CD7F32', glow: false, pointsPrice: 250 },
  { id: 'silver_ring', name: 'Silver Ring', desc: 'Clean silver border', color: '#C0C0C0', glow: false, pointsPrice: 300 },
  { id: 'white_clean', name: 'Arctic White', desc: 'Pure clean white ring', color: '#E8EAF6', glow: false, pointsPrice: 300 },
  { id: 'emerald', name: 'Emerald', desc: 'Fresh green energy', color: '#00C853', glow: false, pointsPrice: 400 },
  { id: 'rose_gold', name: 'Rose Gold', desc: 'Elegant rose gold', color: '#B76E79', glow: false, pointsPrice: 400 },
  { id: 'midnight', name: 'Midnight Blue', desc: 'Deep midnight ring', color: '#1A237E', glow: false, pointsPrice: 400 },
  { id: 'crimson', name: 'Crimson', desc: 'Bold dark red ring', color: '#B71C1C', glow: false, pointsPrice: 400 },
  { id: 'forest', name: 'Forest', desc: 'Deep forest green', color: '#1B5E20', glow: false, pointsPrice: 400 },
  { id: 'ocean', name: 'Ocean', desc: 'Deep ocean blue', color: '#006994', glow: false, pointsPrice: 400 },
  { id: 'sakura', name: 'Sakura', desc: 'Cherry blossom pink', color: '#F48FB1', glow: false, pointsPrice: 400 },
  { id: 'copper', name: 'Copper', desc: 'Warm copper tone', color: '#B87333', glow: false, pointsPrice: 450 },
  { id: 'graphite', name: 'Graphite', desc: 'Dark carbon fiber ring', color: '#424242', glow: false, pointsPrice: 450 },
  { id: 'sand', name: 'Desert Sand', desc: 'Warm desert tone', color: '#C2B280', glow: false, pointsPrice: 450 },
  { id: 'lavender', name: 'Lavender', desc: 'Soft lavender ring', color: '#9575CD', glow: false, pointsPrice: 450 },
  { id: 'ice_solid', name: 'Ice Solid', desc: 'Frozen crystal blue', color: '#B3E5FC', glow: false, pointsPrice: 500 },
  { id: 'gold_solid', name: 'Gold', desc: 'Classic solid gold', color: '#C9A84C', glow: false, pointsPrice: 500 },
  { id: 'platinum', name: 'Platinum', desc: 'Rare platinum ring', color: '#E5E4E2', glow: false, pointsPrice: 600 },
  { id: 'obsidian', name: 'Obsidian', desc: 'Dark volcanic glass', color: '#1C1C1C', glow: false, pointsPrice: 600 },
  { id: 'ruby', name: 'Ruby', desc: 'Deep ruby red gem', color: '#9C0027', glow: false, pointsPrice: 600 },
  { id: 'sapphire', name: 'Sapphire', desc: 'Royal sapphire blue', color: '#0F52BA', glow: false, pointsPrice: 600 },
  { id: 'gold_elite', name: 'Gold Elite', desc: 'Premium gold glow ring', color: '#C9A84C', glow: true, pointsPrice: 500 },
  { id: 'neon_blue', name: 'Neon Blue', desc: 'Electric blue glow', color: '#00D4FF', glow: true, pointsPrice: 500 },
  { id: 'neon_pink', name: 'Neon Pink', desc: 'Hot pink neon glow', color: '#FF2D9D', glow: true, pointsPrice: 500 },
  { id: 'neon_green', name: 'Neon Green', desc: 'Matrix green glow', color: '#00FF88', glow: true, pointsPrice: 500 },
  { id: 'neon_orange', name: 'Neon Orange', desc: 'Burning orange glow', color: '#FF6D00', glow: true, pointsPrice: 500 },
  { id: 'purple_haze', name: 'Purple Haze', desc: 'Mystic violet glow', color: '#7C4DFF', glow: true, pointsPrice: 750 },
  { id: 'goat_red', name: 'GOAT Red', desc: 'Only for legends', color: '#FF2D55', glow: true, pointsPrice: 1000 },
  { id: 'cyan_glow', name: 'Cyan Flash', desc: 'Bright cyan glow ring', color: '#00E5FF', glow: true, pointsPrice: 600 },
  { id: 'solar_glow', name: 'Solar Flare', desc: 'Blazing solar glow', color: '#FF8C00', glow: true, pointsPrice: 700 },
  { id: 'toxic_glow', name: 'Toxic', desc: 'Radioactive green glow', color: '#39FF14', glow: true, pointsPrice: 700 },
  { id: 'magenta_glow', name: 'Magenta', desc: 'Bold magenta glow', color: '#E040FB', glow: true, pointsPrice: 700 },
  { id: 'teal_glow', name: 'Teal', desc: 'Deep teal neon', color: '#00BCD4', glow: true, pointsPrice: 700 },
  { id: 'lava_glow', name: 'Lava', desc: 'Molten lava glow', color: '#FF3D00', glow: true, pointsPrice: 800 },
  { id: 'ice_glow', name: 'Ice Crystal', desc: 'Frozen neon blue glow', color: '#A0E8FF', glow: true, pointsPrice: 800 },
  { id: 'galaxy_glow', name: 'Galaxy', desc: 'Cosmic purple glow', color: '#7C4DFF', glow: true, pointsPrice: 900 },
  { id: 'fire_glow', name: 'On Fire', desc: 'Flame orange glow ring', color: '#FF4500', glow: true, pointsPrice: 900 },
  { id: 'diamond_glow', name: 'Diamond', desc: 'Crystal clear glow', color: '#B2EBF2', glow: true, pointsPrice: 1000 },
  { id: 'void_glow', name: 'Void', desc: 'Dark void energy', color: '#BC13FE', glow: true, pointsPrice: 1000 },
  { id: 'nebula_glow', name: 'Nebula', desc: 'Deep space nebula', color: '#9C27B0', glow: true, pointsPrice: 1000 },
  { id: 'rainbow_glow', name: 'Rainbow', desc: 'Full spectrum glow', color: '#FF0080', glow: true, pointsPrice: 1200 },
  { id: 'royal_gold_glow', name: 'Royal Gold', desc: 'Ultra luxury gold glow', color: '#FFD700', glow: true, pointsPrice: 1200 },
  // Animated
  { id: 'neon_pulse_blue', name: 'Neon Pulse Blue', desc: 'Pulsing electric blue ring', color: '#00D4FF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.39, currency: 'CAD' },
  { id: 'neon_pulse_pink', name: 'Neon Pulse Pink', desc: 'Pulsing hot pink ring', color: '#FF2D9D', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.39, currency: 'CAD' },
  { id: 'fire_animated', name: 'Fire Animated 🔥', desc: 'Animated flame border', color: '#FF4500', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.39, currency: 'CAD' },
  { id: 'ice_animated', name: 'Ice Animated ❄️', desc: 'Animated frozen ring', color: '#A0E8FF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.39, currency: 'CAD' },
  { id: 'galaxy_animated', name: 'Galaxy Animated 🌌', desc: 'Spinning galaxy ring', color: '#7C4DFF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD' },
  { id: 'rainbow_animated', name: 'Rainbow Spin 🌈', desc: 'Spinning rainbow neon', color: '#FF0080', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD' },
  { id: 'lightning_animated', name: 'Lightning ⚡', desc: 'Electric lightning storm', color: '#FFD700', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD' },
  { id: 'inferno_animated', name: 'Inferno 🔥', desc: 'Full inferno animated ring', color: '#FF2D00', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD' },
  { id: 'void_animated', name: 'Void King 👁️', desc: 'Dark void pulsing energy', color: '#BC13FE', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD' },
  { id: 'nebula_animated', name: 'Nebula 🌌', desc: 'Deep space nebula spin', color: '#9C27B0', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD' },
  { id: 'royal_animated', name: 'Royal Gold ✨', desc: 'Shimmering royal gold ring', color: '#FFD700', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 3.99, currency: 'CAD' },
  { id: 'neon_city_animated', name: 'Neon City 🏙️', desc: 'Cyberpunk neon city ring', color: '#FF2D9D', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 3.99, currency: 'CAD' },
  { id: 'cosmic_animated', name: 'Cosmic Power 💫', desc: 'Ultimate cosmic energy ring', color: '#E040FB', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 3.99, currency: 'CAD' },
  { id: 'blizzard_animated', name: 'Blizzard ❄️⚡', desc: 'Arctic blizzard storm ring', color: '#FFFFFF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 3.99, currency: 'CAD' },
  // New 2025
  { id: 'holographic_frame', name: 'Holographic ✨', desc: 'Prismatic rainbow shimmer', color: '#FF0080', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.99, currency: 'CAD', isNew: true },
  { id: 'portal_frame', name: 'Portal 🌀', desc: 'Swirling dimensional portal', color: '#7C4DFF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 3.99, currency: 'CAD', isNew: true },
  { id: 'smoke_frame', name: 'Dark Smoke 🌫️', desc: 'Mysterious dark wisps', color: '#BC13FE', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'glitch_frame', name: 'Glitch 💻', desc: 'Cyberpunk digital glitch', color: '#FF0080', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.99, currency: 'CAD', isNew: true },
  { id: 'sakura_frame', name: 'Sakura 🌸', desc: 'Cherry blossom petals', color: '#FF69B4', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.99, currency: 'CAD', isNew: true },
  { id: 'dna_frame', name: 'DNA Helix 🧬', desc: 'Spinning DNA double helix', color: '#00FF88', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 3.99, currency: 'CAD', isNew: true },
  { id: 'toxic_pulse_frame', name: 'Toxic Pulse ☢️', desc: 'Radioactive energy burst', color: '#39FF14', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'matrix_frame_anim', name: 'Matrix Flow 🔢', desc: 'Digital code raining down', color: '#00FF41', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD', isNew: true },
  { id: 'ice_storm_frame', name: 'Blizzard Frame ❄️⚡', desc: 'Arctic storm fury ring', color: '#A0E8FF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.99, currency: 'CAD', isNew: true },
  { id: 'shadow_void_frame', name: 'Shadow Void 🌑', desc: 'Pure darkness energy', color: '#BC13FE', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.99, currency: 'CAD', isNew: true },
];

// VIDEO FRAMES
const VIDEO_FRAMES = [
  { id: 'none', name: 'No Frame', desc: 'Clean look', color: '#2A2A3A', glow: false, pointsPrice: 0, free: true },
  { id: 'vf_white', name: 'Arctic', desc: 'Clean white ring', color: '#E8EAF6', glow: false, pointsPrice: 350 },
  { id: 'vf_bronze', name: 'Bronze', desc: 'Warm bronze border', color: '#CD7F32', glow: false, pointsPrice: 350 },
  { id: 'vf_silver', name: 'Silver', desc: 'Classic silver border', color: '#C0C0C0', glow: false, pointsPrice: 400 },
  { id: 'vf_rose_gold', name: 'Rose Gold', desc: 'Elegant rose gold', color: '#B76E79', glow: false, pointsPrice: 400 },
  { id: 'vf_gold', name: 'Gold Elite', desc: 'Classic gold glow border', color: '#C9A84C', glow: true, pointsPrice: 600 },
  { id: 'vf_ice', name: 'Ice Blue', desc: 'Frozen neon border', color: '#00E5FF', glow: true, pointsPrice: 500 },
  { id: 'vf_fire', name: 'Fire Red', desc: 'Blazing red frame', color: '#FF4500', glow: true, pointsPrice: 600 },
  { id: 'vf_matrix', name: 'Matrix', desc: 'Hacker green pulse', color: '#00FF41', glow: true, pointsPrice: 750 },
  { id: 'vf_violet', name: 'Violet Storm', desc: 'Deep purple energy', color: '#9B59B6', glow: true, pointsPrice: 500 },
  { id: 'vf_neon_pink', name: 'Neon Pink', desc: 'Hot pink neon border', color: '#FF2D9D', glow: true, pointsPrice: 600 },
  { id: 'vf_galaxy', name: 'Galaxy', desc: 'Cosmic purple border', color: '#7C4DFF', glow: true, pointsPrice: 900 },
  { id: 'vf_void', name: 'Void', desc: 'Dark void energy border', color: '#BC13FE', glow: true, pointsPrice: 1000 },
  { id: 'vf_rainbow', name: 'Rainbow', desc: 'Full spectrum glow border', color: '#FF0080', glow: true, pointsPrice: 1200 },
  { id: 'vf_fire_animated', name: 'Fire Animated 🔥', desc: 'Animated flame border', color: '#FF4500', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.39, currency: 'CAD' },
  { id: 'vf_lightning_animated', name: 'Lightning ⚡', desc: 'Electric lightning border', color: '#FFD700', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD' },
  { id: 'vf_galaxy_animated', name: 'Galaxy Animated 🌌', desc: 'Spinning galaxy border', color: '#7C4DFF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD' },
  { id: 'vf_rainbow_animated', name: 'Rainbow Spin 🌈', desc: 'Spinning rainbow border', color: '#FF0080', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.79, currency: 'CAD' },
  { id: 'vf_royal_animated', name: 'Royal Gold ✨', desc: 'Shimmering gold border', color: '#FFD700', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 3.99, currency: 'CAD' },
  { id: 'vf_cosmic_animated', name: 'Cosmic Power 💫', desc: 'Ultimate cosmic border', color: '#E040FB', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 3.99, currency: 'CAD' },
  // New 2025
  { id: 'vf_holographic_anim', name: 'Holographic ✨', desc: 'Prismatic shimmer border', color: '#FF0080', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.99, currency: 'CAD', isNew: true },
  { id: 'vf_glitch_anim', name: 'Glitch 💻', desc: 'Cyberpunk glitch border', color: '#00D4FF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.99, currency: 'CAD', isNew: true },
  { id: 'vf_smoke_anim', name: 'Dark Smoke 🌫️', desc: 'Mysterious smoke border', color: '#BC13FE', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
  { id: 'vf_sakura_anim', name: 'Sakura 🌸', desc: 'Cherry blossom border', color: '#FF69B4', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.99, currency: 'CAD', isNew: true },
  { id: 'vf_ice_storm_anim', name: 'Blizzard ❄️', desc: 'Arctic storm border', color: '#A0E8FF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 2.99, currency: 'CAD', isNew: true },
  { id: 'vf_toxic_anim', name: 'Toxic Pulse ☢️', desc: 'Radioactive border', color: '#39FF14', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.99, currency: 'CAD', isNew: true },
];

// COMMENT FRAMES
const COMMENT_FRAMES = [
  { id: 'none', name: 'Default', color: 'transparent', glow: false, pointsPrice: 0, exclusive: false },
  { id: 'cf_white', name: 'White Border', color: '#FFFFFF', glow: false, pointsPrice: 0, exclusive: false, free: true },
  { id: 'cf_gold_solid', name: 'Gold', color: '#C9A84C', glow: false, pointsPrice: 150, exclusive: false },
  { id: 'cf_silver', name: 'Silver', color: '#C0C0C0', glow: false, pointsPrice: 150, exclusive: false },
  { id: 'cf_gold', name: 'Gold Glow', color: '#C9A84C', glow: true, pointsPrice: 200, exclusive: false },
  { id: 'cf_blue', name: 'Neon Blue', color: '#00D4FF', glow: true, pointsPrice: 350, exclusive: false },
  { id: 'cf_red', name: 'GOAT Red', color: '#FF2D55', glow: true, pointsPrice: 500, exclusive: false },
  { id: 'cf_purple', name: 'Purple Haze', color: '#BF5AF2', glow: true, pointsPrice: 400, exclusive: false },
  { id: 'cf_emerald', name: 'Emerald', color: '#30D158', glow: true, pointsPrice: 300, exclusive: false },
  { id: 'cf_pink', name: 'Neon Pink', color: '#FF2D9D', glow: true, pointsPrice: 350, exclusive: false },
  { id: 'cf_toxic', name: 'Toxic', color: '#39FF14', glow: true, pointsPrice: 400, exclusive: false },
  { id: 'cf_galaxy', name: 'Galaxy', color: '#7C4DFF', glow: true, pointsPrice: 500, exclusive: false },
  { id: 'cf_fire', name: 'Fire', color: '#FF4500', glow: true, pointsPrice: 500, exclusive: false },
  { id: 'cf_void', name: 'Void', color: '#BC13FE', glow: true, pointsPrice: 600, exclusive: false },
  { id: 'cf_rainbow', name: 'Rainbow', color: '#FF0080', glow: true, pointsPrice: 700, exclusive: false },
  { id: 'cf_royal_gold', name: 'Royal Gold', color: '#FFD700', glow: true, pointsPrice: 700, exclusive: false },
  { id: 'cf_pulse_blue', name: 'Pulse Blue', color: '#00D4FF', glow: true, pointsPrice: 0, exclusive: false, animated: true, dollarsPrice: 0.99 },
  { id: 'cf_fire_animated', name: 'Fire Animated 🔥', color: '#FF4500', glow: true, pointsPrice: 0, exclusive: false, animated: true, dollarsPrice: 0.99 },
  { id: 'cf_lightning', name: 'Lightning ⚡', color: '#FFD700', glow: true, pointsPrice: 0, exclusive: false, animated: true, dollarsPrice: 1.99 },
  { id: 'cf_rainbow_anim', name: 'Rainbow Spin 🌈', color: '#FF0080', glow: true, pointsPrice: 0, exclusive: false, animated: true, dollarsPrice: 1.99 },
  { id: 'cf_royal_anim', name: 'Royal Gold ✨', color: '#FFD700', glow: true, pointsPrice: 0, exclusive: false, animated: true, dollarsPrice: 2.99 },
  { id: 'cf_cosmic_anim', name: 'Cosmic 💫', color: '#E040FB', glow: true, pointsPrice: 0, exclusive: false, animated: true, dollarsPrice: 2.99 },
  // New 2025
  { id: 'cf_holographic_anim', name: 'Holographic ✨', color: '#FF0080', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.99, exclusive: false, isNew: true },
  { id: 'cf_glitch_anim', name: 'Glitch 💻', color: '#00D4FF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.49, exclusive: false, isNew: true },
  { id: 'cf_matrix_pulse', name: 'Matrix 🔢', color: '#00FF41', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.49, exclusive: false, isNew: true },
  { id: 'cf_sakura_anim', name: 'Sakura 🌸', color: '#FF69B4', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.99, exclusive: false, isNew: true },
  { id: 'cf_ice_anim2', name: 'Blizzard ❄️', color: '#A0E8FF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.49, exclusive: false, isNew: true },
  { id: 'cf_smoke_anim', name: 'Dark Smoke 🌫️', color: '#BC13FE', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.49, exclusive: false, isNew: true },
  { id: 'cf_void_pulse', name: 'Void Pulse 🌑', color: '#7C4DFF', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 1.99, exclusive: false, isNew: true },
  { id: 'cf_toxic_cf', name: 'Toxic ☢️', color: '#39FF14', glow: true, animated: true, pointsPrice: 0, dollarsPrice: 0.99, exclusive: false, isNew: true },
];

// BACKGROUNDS
const BACKGROUNDS = [
  { id: 'bg_none', name: 'Default Dark', desc: 'The classic GA look', category: 'background', free: true, rarity: 'common', colors: ['#0A0A0F'], animated: false, preview: 'Fond noir gaming par défaut' },
  { id: 'bg_midnight', name: 'Midnight Blue', desc: 'Deep space vibes', category: 'background', pointsPrice: 500, rarity: 'common', colors: ['#0D0D2B', '#050518'], animated: false, preview: 'Gradient bleu nuit profond' },
  { id: 'bg_forest', name: 'Dark Forest', desc: 'Tactical & clean', category: 'background', pointsPrice: 500, rarity: 'common', colors: ['#0B1A0E', '#050D07'], animated: false, preview: 'Fond vert forêt sombre' },
  { id: 'bg_crimson', name: 'Crimson Night', desc: 'For the warriors', category: 'background', pointsPrice: 600, rarity: 'common', colors: ['#1A0505', '#0D0202'], animated: false, preview: 'Fond rouge sang intense' },
  { id: 'bg_royal', name: 'Royal Purple', desc: 'Reign supreme', category: 'background', pointsPrice: 600, rarity: 'common', colors: ['#12051A', '#08020F'], animated: false, preview: 'Fond violet royal profond' },
  { id: 'bg_gold_fade', name: 'Gold Rush', desc: 'Champion energy', category: 'background', pointsPrice: 1200, rarity: 'rare', colors: ['#1A1200', '#0A0800', '#C9A84C'], animated: false, preview: 'Gradient or fondu' },
  { id: 'bg_galaxy', name: 'Galaxy Field', desc: 'Lost in the cosmos', category: 'background', legendaryFree: true, pointsPrice: 2000, rarity: 'epic', colors: ['#05001A', '#0A0020', '#7C4DFF', '#E040FB'], animated: false, preview: 'Champ étoilé galactique' },
  { id: 'bg_aurora', name: 'Aurora Borealis', desc: 'Magical Northern Lights', category: 'background', legendaryFree: true, pointsPrice: 2500, rarity: 'epic', colors: ['#001A10', '#00100A', '#00FF88', '#00D4FF'], animated: false },
  { id: 'bg_matrix', name: 'Matrix Rain 🔢', desc: 'You are The One', category: 'background', dollarsPrice: 1.99, rarity: 'legendary', colors: ['#001A05', '#003008', '#00FF41'], animated: true, preview: 'Pluie de code verte animée' },
  { id: 'bg_holographic', name: 'Holographic ✨', desc: 'Next-gen iridescent', category: 'background', dollarsPrice: 2.99, rarity: 'legendary', colors: ['#FF0080', '#7C4DFF', '#00D4FF', '#FFD700'], animated: true, preview: 'Effet holographique arc-en-ciel animé' },
  { id: 'bg_fire_animated', name: 'Inferno 🔥', desc: 'Everything burns', category: 'background', dollarsPrice: 1.99, rarity: 'legendary', colors: ['#1A0500', '#FF3D00', '#FF8C00', '#FFD700'], animated: true, preview: 'Flammes animées en fond' },
  { id: 'bg_lightning_bg', name: 'Storm Field ⚡', desc: 'Power unleashed', category: 'background', dollarsPrice: 2.99, rarity: 'legendary', colors: ['#050510', '#0A0A20', '#FFD700', '#00D4FF'], animated: true, preview: 'Éclairs animés fond sombre' },
  { id: 'bg_cosmic', name: 'Cosmic Pulse 💫', desc: 'Universe-tier flex', category: 'background', dollarsPrice: 3.99, rarity: 'legendary', colors: ['#02000A', '#7C4DFF', '#E040FB', '#00D4FF', '#FFD700'], animated: true, preview: 'Nébuleuse cosmique pulsante animée' },
  // New 2025
  { id: 'bg_particles', name: 'Particle Storm ✨', desc: 'Floating cosmic particles', category: 'background', dollarsPrice: 2.99, rarity: 'legendary', colors: ['#02000A', '#0A0020', '#7C4DFF', '#E040FB'], animated: true, preview: 'Particules cosmiques flottantes animées', isNew: true },
  { id: 'bg_glitch', name: 'System Glitch 💻', desc: 'Cyberpunk glitch reality', category: 'background', dollarsPrice: 2.99, rarity: 'legendary', colors: ['#050515', '#100010', '#FF0080', '#00D4FF'], animated: true, preview: 'Effet glitch cyberpunk animé', isNew: true },
  { id: 'bg_snowfall', name: 'Blizzard ❄️', desc: 'Infinite snowfall', category: 'background', dollarsPrice: 1.99, rarity: 'epic', colors: ['#03060F', '#061020', '#A0E8FF', '#FFFFFF'], animated: true, preview: 'Chute de neige infinie', isNew: true },
  { id: 'bg_starfield', name: 'Warp Speed 🌟', desc: 'Flying through the stars', category: 'background', dollarsPrice: 2.99, rarity: 'legendary', colors: ['#000000', '#0A0520', '#FFD700', '#FFFFFF'], animated: true, preview: 'Voyage dans les étoiles', isNew: true },
  { id: 'bg_smoke', name: 'Dark Smoke 🌫️', desc: 'Mysterious dark wisps', category: 'background', dollarsPrice: 2.49, rarity: 'epic', colors: ['#080808', '#1A0020', '#BC13FE'], animated: true, preview: 'Volutes de fumée sombre', isNew: true },
  { id: 'bg_neon_grid', name: 'Neon Grid', desc: 'Tron-style neon lines', category: 'background', pointsPrice: 1500, rarity: 'rare', colors: ['#000510', '#002030', '#00D4FF'], animated: false, preview: 'Grille néon style Tron' },
  { id: 'bg_vaporwave', name: 'Vaporwave 🌆', desc: 'Aesthetic 80s vibes', category: 'background', dollarsPrice: 1.99, rarity: 'epic', colors: ['#150020', '#200020', '#FF00FF', '#00FFFF'], animated: true, preview: 'Esthétique vaporwave animée', isNew: true },
  { id: 'bg_cherry_bloom', name: 'Cherry Bloom 🌸', desc: 'Sakura petals falling', category: 'background', dollarsPrice: 2.99, rarity: 'legendary', colors: ['#0A0510', '#15000A', '#FFB7C5', '#FF69B4'], animated: true, preview: 'Pétales de cerisier en chute', isNew: true },
  { id: 'bg_toxic_waves', name: 'Toxic Waves ☢️', desc: 'Radioactive wave animation', category: 'background', dollarsPrice: 2.49, rarity: 'epic', colors: ['#001A05', '#003008', '#39FF14', '#00FF88'], animated: true, preview: 'Vagues toxiques radioactives animées', isNew: true },
  { id: 'bg_blood_moon', name: 'Blood Moon 🌕', desc: 'Crimson lunar energy', category: 'background', dollarsPrice: 2.99, rarity: 'legendary', colors: ['#100000', '#200000', '#FF0000', '#8B0000'], animated: true, preview: 'Lune de sang et énergie cramoisie', isNew: true },
  { id: 'bg_void_pulse', name: 'Void Pulse 🌑', desc: 'Dark matter energy waves', category: 'background', dollarsPrice: 3.99, rarity: 'legendary', colors: ['#000000', '#030005', '#BC13FE', '#7C4DFF'], animated: true, preview: 'Énergie de matière noire pulsante', isNew: true },
  { id: 'bg_ice_storm', name: 'Blizzard Storm ❄️⚡', desc: 'Arctic ice storm fury', category: 'background', dollarsPrice: 2.99, rarity: 'legendary', colors: ['#000810', '#001030', '#A0E8FF', '#00D4FF'], animated: true, preview: 'Tempête de glace arctique', isNew: true },
  { id: 'bg_cherry_bloom2', name: 'Rose Garden 🌹', desc: 'Red rose petals falling', category: 'background', dollarsPrice: 2.99, rarity: 'epic', colors: ['#0A0005', '#15000A', '#FF2D55', '#FF69B4'], animated: true, preview: 'Pétales de roses rouges tombants', isNew: true },
];

// THEMES
const THEMES = [
  { id: 'theme_champion', name: "Champion's Legacy 👑", desc: "L'identité visuelle des winners.", category: 'theme', includes: ['bg_gold_fade', 'banner_champion', 'badge_elite', 'cb_gold', 'ue_gold_glow'], dollarsPrice: 4.99, rarity: 'legendary', animated: false, preview: 'Pack complet gold pour les top players' },
  { id: 'theme_phantom', name: 'Phantom Protocol 👻', desc: 'Élégance sombre.', category: 'theme', includes: ['bg_midnight', 'banner_matrix_b', 'badge_phantom', 'cb_purple_neon', 'ue_purple_glow'], dollarsPrice: 4.99, rarity: 'legendary', animated: true, preview: 'Pack sombre et mystérieux' },
  { id: 'theme_inferno', name: 'Inferno Mode 🔥', desc: 'Tout en feu.', category: 'theme', includes: ['bg_fire_animated', 'banner_fire_b', 'badge_legend', 'cb_fire_border', 'ue_fire_text'], dollarsPrice: 5.99, rarity: 'legendary', animated: true, preview: 'Pack feu animé complet' },
  { id: 'theme_storm', name: 'Storm Chaser ⚡', desc: 'Énergie électrique.', category: 'theme', includes: ['bg_lightning_bg', 'banner_lightning_b', 'badge_clutch', 'cb_lightning_border', 'ue_lightning_text'], dollarsPrice: 5.99, rarity: 'legendary', animated: true, preview: 'Pack électrique animé' },
  { id: 'theme_cosmic', name: 'Cosmic Entity 💫', desc: 'Au-delà du gaming.', category: 'theme', includes: ['bg_cosmic', 'banner_aurora_b', 'badge_immortal', 'cb_holo_border', 'ue_galaxy_text'], dollarsPrice: 7.99, rarity: 'legendary', animated: true, preview: 'Le pack le plus épique' },
  { id: 'theme_matrix', name: 'The One 🔢', desc: 'Neo-gaming.', category: 'theme', includes: ['bg_matrix', 'banner_matrix_b', 'badge_godmode', 'cb_green_neon', 'ue_rainbow_text'], dollarsPrice: 6.99, rarity: 'legendary', animated: true, preview: 'Pack Matrix animé' },
  // New 2025
  { id: 'theme_sakura', name: 'Sakura Dreams 🌸', desc: 'Cherry blossom paradise.', category: 'theme', includes: ['bg_cherry_bloom', 'banner_aurora_b', 'badge_ghost_b', 'cb_cherry_b', 'ue_ice_text'], dollarsPrice: 5.99, rarity: 'legendary', animated: true, preview: 'Pack cerisier complet', isNew: true },
  { id: 'theme_cyber', name: 'Cyber Punk 💻', desc: 'Glitch reality.', category: 'theme', includes: ['bg_glitch', 'banner_neon_city', 'badge_void_walker', 'cb_glitch_b', 'ue_glitch'], dollarsPrice: 6.99, rarity: 'legendary', animated: true, preview: 'Pack cyberpunk complet', isNew: true },
  { id: 'theme_arctic', name: 'Arctic Storm ❄️', desc: 'Frozen world.', category: 'theme', includes: ['bg_ice_storm', 'banner_lightning_b', 'badge_clutch', 'cb_ice_b', 'ue_ice_text'], dollarsPrice: 5.99, rarity: 'legendary', animated: true, preview: 'Pack arctique animé', isNew: true },
  { id: 'theme_void_walker', name: 'Void Walker 🌑', desc: 'Darkness incarnate.', category: 'theme', includes: ['bg_void_pulse', 'banner_galaxy_b', 'badge_shadow_lord', 'cb_void_b', 'ue_shadow'], dollarsPrice: 6.99, rarity: 'legendary', animated: true, preview: 'Pack ténèbres absolu', isNew: true },
  { id: 'theme_neon_city', name: 'Neon City 🌆', desc: 'Cityscape at night.', category: 'theme', includes: ['bg_vaporwave', 'banner_holo_b', 'badge_storm_king', 'cb_rainbow_spin', 'ue_holographic'], dollarsPrice: 6.99, rarity: 'legendary', animated: true, preview: 'Pack néon city', isNew: true },
];

// ── Run ────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`🚀 GamingActions — Shop Items Firestore Sync`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  const ref = db.collection('shop_items');
  let count = 0;

  if (CLEAR_FIRST && !DRY_RUN) {
    console.log('🗑️  Clearing existing shop_items...');
    const existing = await ref.get();
    const batch = db.batch();
    existing.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`   Deleted ${existing.size} docs`);
  }

  const allItems = [
    ...FRAMES.filter(f => !f.exclusive).map((f, i) => makeDoc(f, 'avatar_frame', 'avatar_frame', i)),
    ...VIDEO_FRAMES.filter(f => !f.exclusive).map((f, i) => makeDoc(f, 'video_frame', 'video_frame', i)),
    ...COMMENT_FRAMES.filter(f => !f.exclusive).map((f, i) => makeDoc(f, 'comment_frame', 'comment_frame', i)),
    ...BACKGROUNDS.map((f, i) => makeDoc(f, 'background', 'cosmetic', i)),
    ...THEMES.map((f, i) => makeDoc(f, 'theme', 'theme', i)),
  ];

  console.log(`📦 Total items to sync: ${allItems.length}`);

  // Batch writes (Firestore max 500/batch)
  const BATCH_SIZE = 400;
  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const chunk = allItems.slice(i, i + BATCH_SIZE);
    if (!DRY_RUN) {
      const batch = db.batch();
      chunk.forEach(doc => batch.set(ref.doc(doc.id), doc, { merge: true }));
      await batch.commit();
    }
    count += chunk.length;
    console.log(`   ✅ Synced ${count}/${allItems.length}`);
  }

  console.log(`\n✅ Done! ${count} items written to shop_items collection.`);
  if (DRY_RUN) console.log('   (DRY RUN — no data was written)');

  process.exit(0);
}

run().catch(e => { console.error('❌ Error:', e); process.exit(1); });
