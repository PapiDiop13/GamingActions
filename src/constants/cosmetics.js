/**
 * cosmetics.js — Catalogue complet de personnalisation profil pour Gaming Actions
 *
 * Catégories :
 *   PROFILE_BACKGROUNDS  → fond du profil (couleur/gradient/effet)
 *   BANNERS              → bannière de profil (image générée/animée)
 *   USERNAME_EFFECTS     → effet sur le pseudo (glow, gradient, badge)
 *   PROFILE_BADGES       → titre/tag sous le pseudo
 *   CARD_BORDERS         → bordure de la card profil (vue dans comments/feed)
 *   PROFILE_THEMES       → pack complet (background + bannière + badge assortis)
 *
 * Champs communs :
 *   id, name, desc, category
 *   free        → gratuit (débloqué pour tous)
 *   legendaryFree → inclus dans Legendary sans payer en plus
 *   pointsPrice → prix en GA Points (0 si pas achetable en points)
 *   dollarsPrice→ prix IAP en CAD (null si pas payant)
 *   animated    → a une animation (rendu plus lourd)
 *   colors      → tableau de couleurs (pour gradients, themes)
 *   rarity      → 'common' | 'rare' | 'epic' | 'legendary' (UI seulement)
 *   preview     → description visuelle courte
 *
 * Règles de déblocage :
 *   free: true              → tout le monde
 *   legendaryFree: true     → abonnés Legendary sans frais supplémentaires
 *   pointsPrice > 0         → achetable en GA Points (free users inclus)
 *   dollarsPrice > 0        → achetable en IAP (les meilleurs items)
 *   legendaryFree + dollarsPrice → Legendary l'a gratis, autres paient
 *
 * Les items les plus stylés = payants ($) et pas dispo en points
 * Les items medium = points GA ou Legendary free
 * Les items basiques = gratuits ou peu de points
 */

// ─── BACKGROUNDS PROFIL ───────────────────────────────────────────────────────
// Remplace/colore le fond de la page profil derrière le contenu
// 15 items : 1 gratuit + 5 points + 3 legendaryFree + 6 animés ($)
export const PROFILE_BACKGROUNDS = [

  // Gratuit
  { id: 'bg_none',          name: 'Default Dark',      desc: 'The classic GA look',
    category: 'background', free: true, rarity: 'common',
    colors: ['#0A0A0F'],    animated: false,
    preview: 'Fond noir gaming par défaut' },

  // GA Points — common/rare
  { id: 'bg_midnight',      name: 'Midnight Blue',     desc: 'Deep space vibes',
    category: 'background', pointsPrice: 500, rarity: 'common',
    colors: ['#0D0D2B', '#050518'], animated: false,
    preview: 'Gradient bleu nuit profond' },

  { id: 'bg_crimson',       name: 'Crimson Night',     desc: 'For the warriors',
    category: 'background', pointsPrice: 600, rarity: 'common',
    colors: ['#6E1414', '#3D0A0A'], animated: false,
    preview: 'Fond rouge sang intense' },

  { id: 'bg_royal',         name: 'Royal Purple',      desc: 'Reign supreme',
    category: 'background', pointsPrice: 600, rarity: 'common',
    colors: ['#4A1270', '#2E0A45'], animated: false,
    preview: 'Fond violet royal profond' },

  { id: 'bg_gold_fade',     name: 'Gold Rush',         desc: 'Champion energy',
    category: 'background', pointsPrice: 1200, rarity: 'rare',
    colors: ['#4A3800', '#6E5400', '#C9A84C'],
    animated: false, preview: 'Gradient or fondu sur fond noir' },

  { id: 'bg_ocean',         name: 'Deep Ocean',        desc: 'Calm but deadly',
    category: 'background', pointsPrice: 1000, rarity: 'rare',
    colors: ['#001F3F', '#00111F'], animated: false,
    preview: 'Gradient bleu océan profond' },

  // Legendary Free — epic
  { id: 'bg_galaxy',        name: 'Galaxy Field',      desc: 'Lost in the cosmos',
    category: 'background', legendaryFree: true, pointsPrice: 2000, rarity: 'epic',
    colors: ['#05001A', '#0A0020', '#7C4DFF', '#E040FB'],
    animated: false, preview: 'Champ étoilé galactique' },

  { id: 'bg_aurora',        name: 'Aurora Borealis',   desc: 'Magical Northern Lights',
    category: 'background', legendaryFree: true, pointsPrice: 2500, rarity: 'epic',
    colors: ['#001A10', '#00100A', '#00FF88', '#00D4FF'],
    animated: false, preview: 'Aurores boréales vertes et cyan' },

  { id: 'bg_neon_grid',     name: 'Neon Grid',          desc: 'Tron-style neon lines',
    category: 'background', pointsPrice: 1500, rarity: 'rare',
    colors: ['#003A5E', '#0060A0', '#00D4FF'],
    animated: false, preview: 'Grille néon style Tron' },

  // Payants ($) — animated — legendary
  { id: 'bg_holographic',   name: 'Holographic ✨',    desc: 'Next-gen iridescent',
    category: 'background', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#FF0080', '#7C4DFF', '#00D4FF', '#FFD700'],
    animated: true, preview: 'Effet holographique arc-en-ciel animé' },

  { id: 'bg_fire_animated', name: 'Inferno 🔥',        desc: 'Everything burns',
    category: 'background', dollarsPrice: 1.49, pointsPrice: 2000, rarity: 'legendary',
    colors: ['#6E1A00', '#9E2E00', '#FF6A00', '#FFB000'],
    animated: true, preview: 'Flammes animées en fond' },

  { id: 'bg_cosmic',        name: 'Cosmic Pulse 💫',   desc: 'Universe-tier flex',
    category: 'background', dollarsPrice: 1.99, pointsPrice: 4000, rarity: 'legendary',
    colors: ['#02000A', '#7C4DFF', '#E040FB', '#00D4FF', '#FFD700'],
    animated: true, preview: 'Nébuleuse cosmique pulsante animée' },

  { id: 'bg_cherry_bloom',  name: 'Cherry Bloom 🌸',    desc: 'Sakura petals falling',
    category: 'background', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#9E2A63', '#C43D82', '#FF8FB3', '#FF69B4'],
    animated: true, preview: 'Pétales de cerisier en chute douce', isNew: true },

  { id: 'bg_void_pulse',    name: 'Void Pulse 🌑',      desc: 'Dark matter energy waves',
    category: 'background', dollarsPrice: 1.99, pointsPrice: 4000, rarity: 'legendary',
    colors: ['#000000', '#030005', '#BC13FE', '#7C4DFF'],
    animated: true, preview: 'Énergie de matière noire pulsante', isNew: true },

  { id: 'bg_matrix',        name: 'Matrix Rain 🔢',    desc: 'You are The One',
    category: 'background', dollarsPrice: 1.49, pointsPrice: 2000, rarity: 'legendary',
    colors: ['#004010', '#007020', '#00FF41'],
    animated: true, preview: 'Pluie de code verte animée' },

  // ── Nouveaux backgrounds (2026) ───────────────────────────────────────────
  { id: 'bg_glacier',       name: 'Glacier Light 🧊',  desc: 'Crystal-clear ice mountain glow',
    category: 'background', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#1A6B9A', '#3D9BC4', '#5BAEC8', '#7FCDE0', '#A8DCEA'],
    animated: false, isNew: true, preview: 'Bleu glacier clair — crystal ice premium' },

  { id: 'bg_konoha',        name: 'Clair de Konoha 🌙', desc: 'Forêt profonde baignée de lune dorée',
    category: 'background', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#183014', '#2A4D1E', '#3D6B2A', '#5E9E42', '#B89A2E'],
    animated: false, isNew: true, preview: 'Nuit de forêt + lune jaune — vibes ninja' },

  { id: 'bg_sunset_ember',  name: 'Sunset Ember 🌅',   desc: 'Orange brûlant au coucher du soleil',
    category: 'background', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#6E2500', '#9E3D00', '#D45500', '#FF7A2E', '#FF8C42'],
    animated: true, isNew: true, preview: 'Orange/brûlant animé — le sunset qui claque' },

  { id: 'bg_white_clean',   name: 'White Clean ⬜',    desc: 'Fond blanc pur — élégance sobre',
    category: 'background', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'rare',
    colors: ['#F0F0F0', '#FFFFFF', '#E8E8E8'],
    animated: false, isNew: true, preview: 'Fond blanc lumineux — sobre et premium' },
];

// ─── BANNIÈRES PROFIL ─────────────────────────────────────────────────────────
// Remplace/améliore la zone bannière en haut du profil
export const PROFILE_BANNERS = [

  // Gratuit
  { id: 'banner_none',      name: 'No Banner',         desc: 'Default dark banner',
    category: 'banner', free: true, rarity: 'common',
    colors: ['#0D0820'], animated: false,
    preview: 'Bannière par défaut' },

  // GA Points — common
  { id: 'banner_gold',      name: 'Gold Stripe',       desc: 'Clean & prestigious',
    category: 'banner', pointsPrice: 800, rarity: 'common',
    colors: ['#0D0820', '#C9A84C'], animated: false,
    preview: 'Bannière avec trait doré' },

  { id: 'banner_carbon',    name: 'Carbon Fiber',      desc: 'Premium material look',
    category: 'banner', pointsPrice: 700, rarity: 'common',
    colors: ['#1A1A1A', '#0D0D0D'], animated: false,
    preview: 'Texture fibre de carbone' },

  { id: 'banner_blueprint', name: 'Blueprint',         desc: 'Technical precision',
    category: 'banner', pointsPrice: 600, rarity: 'common',
    colors: ['#001533', '#002855'], animated: false,
    preview: 'Grille blueprint technique bleu' },

  { id: 'banner_circuit',   name: 'Circuit Board',     desc: 'Gamer core aesthetic',
    category: 'banner', pointsPrice: 900, rarity: 'rare',
    colors: ['#050F05', '#00FF41'], animated: false,
    preview: 'Circuits imprimés verts sur fond noir' },

  // GA Points — rare
  { id: 'banner_neon_city', name: 'Neon City',         desc: 'Cyberpunk skyline',
    category: 'banner', pointsPrice: 1500, rarity: 'rare',
    colors: ['#050515', '#FF00FF', '#00D4FF'], animated: false,
    preview: 'Skyline cyberpunk néon' },

  { id: 'banner_mountain',  name: 'Dark Summit',       desc: 'Reach the top',
    category: 'banner', pointsPrice: 1000, rarity: 'rare',
    colors: ['#05060A', '#1A1F2E'], animated: false,
    preview: 'Silhouette montagne nuit étoilée' },

  { id: 'banner_abstract',  name: 'Abstract Waves',    desc: 'Artistic chaos',
    category: 'banner', pointsPrice: 1200, rarity: 'rare',
    colors: ['#0A0020', '#7C4DFF', '#E040FB'], animated: false,
    preview: 'Vagues abstraites violettes' },

  // Legendary Free — epic
  { id: 'banner_champion',  name: 'Champion\'s Arena', desc: 'Built for winners',
    category: 'banner', legendaryFree: true, pointsPrice: 3000, rarity: 'epic',
    colors: ['#0D0820', '#C9A84C', '#FFD700'], animated: false,
    preview: 'Arène de champion or et violet' },

  { id: 'banner_galaxy_b',  name: 'Galaxy Banner',     desc: 'Stellar presence',
    category: 'banner', legendaryFree: true, pointsPrice: 2500, rarity: 'epic',
    colors: ['#02000A', '#7C4DFF', '#00D4FF'], animated: false,
    preview: 'Galaxie étoilée deep space' },

  // Payants ($) — animated — legendary
  { id: 'banner_fire_b',    name: 'Blazing Banner 🔥', desc: 'On fire, literally',
    category: 'banner', dollarsPrice: 1.49, pointsPrice: 2000, rarity: 'legendary',
    colors: ['#1A0500', '#FF3D00', '#FFD700'],
    animated: true, preview: 'Bannière en flammes animées' },

  { id: 'banner_lightning_b', name: 'Storm Banner ⚡', desc: 'Electric personality',
    category: 'banner', dollarsPrice: 1.49, pointsPrice: 2000, rarity: 'legendary',
    colors: ['#050510', '#FFD700', '#00D4FF'],
    animated: true, preview: 'Éclairs animés sur la bannière' },

  { id: 'banner_matrix_b',  name: 'Matrix Banner 🔢',  desc: 'The chosen one',
    category: 'banner', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#001A05', '#00FF41'],
    animated: true, preview: 'Chute de code verte animée' },

  { id: 'banner_aurora_b',  name: 'Aurora Banner 🌌',  desc: 'Otherworldly beauty',
    category: 'banner', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#001A10', '#00FF88', '#7C4DFF'],
    animated: true, preview: 'Aurores boréales animées' },

  { id: 'banner_holo_b',    name: 'Holo Banner ✨',    desc: 'Prismatic excellence',
    category: 'banner', dollarsPrice: 1.99, pointsPrice: 4000, rarity: 'legendary',
    colors: ['#FF0080', '#7C4DFF', '#00D4FF', '#FFD700'],
    animated: true, preview: 'Effet holographique arc-en-ciel animé' },

  // ── Bannières 2026 (thèmes exclusifs) ─────────────────────────────────────
  { id: 'banner_glacier_b', name: 'Glacier Banner 🧊', desc: 'Crystal ice mountain range',
    category: 'banner', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#0A1A2E', '#1A6B9A', '#5BAEC8', '#A8DCEA'],
    animated: false, isNew: true, preview: 'Bannière montagne glaciaire cristalline' },

  { id: 'banner_konoha_b',  name: 'Konoha Banner 🌙',  desc: 'Forêt nocturne sous la lune',
    category: 'banner', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#070D05', '#183014', '#2A4D1E', '#B89A2E'],
    animated: false, isNew: true, preview: 'Forêt sombre et lune dorée — clair de Konoha' },

  { id: 'banner_sunset_b',  name: 'Sunset Banner 🌅',  desc: 'Horizon en flammes orangées',
    category: 'banner', dollarsPrice: 1.99, pointsPrice: 3000, rarity: 'legendary',
    colors: ['#2E0C00', '#7A2D00', '#D45500', '#FF8C42'],
    animated: true, isNew: true, preview: 'Coucher de soleil orange animé' },

  { id: 'banner_white_b',   name: 'White Banner ⬜',   desc: 'Bannière blanche épurée',
    category: 'banner', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'rare',
    colors: ['#F5F5F5', '#FFFFFF', '#E0E0E0'],
    animated: false, isNew: true, preview: 'Bannière blanche sobre et élégante' },
];

// ─── EFFETS PSEUDO ────────────────────────────────────────────────────────────
// Modifie l'apparence du username sur le profil
// Triés par rareté : common → rare → epic → legendary
export const USERNAME_EFFECTS = [

  // ── Common ────────────────────────────────────────────────────────────────
  { id: 'ue_none',          name: 'Default',           desc: 'Standard white username',
    category: 'username', free: true, rarity: 'common',
    color: '#FFFFFF', animated: false },

  { id: 'ue_gold',          name: 'Gold Text',         desc: 'Prestigious gold name',
    category: 'username', pointsPrice: 400, rarity: 'common',
    color: '#C9A84C', animated: false },

  // ── Rare ─────────────────────────────────────────────────────────────────
  { id: 'ue_blue_glow',     name: 'Blue Glow',         desc: 'Neon blue aura',
    category: 'username', pointsPrice: 600, rarity: 'rare',
    color: '#00D4FF', animated: false, glow: true },

  { id: 'ue_purple_glow',   name: 'Purple Glow',       desc: 'Royal purple aura',
    category: 'username', pointsPrice: 600, rarity: 'rare',
    color: '#BF5AF2', animated: false, glow: true },

  { id: 'ue_red_glow',      name: 'GOAT Glow',         desc: 'Red hot legend',
    category: 'username', pointsPrice: 700, rarity: 'rare',
    color: '#FF2D55', animated: false, glow: true },

  { id: 'ue_green_glow',    name: 'Toxic Glow',        desc: 'Radioactive presence',
    category: 'username', pointsPrice: 700, rarity: 'rare',
    color: '#39FF14', animated: false, glow: true },

  { id: 'ue_shadow',        name: 'Shadow Lord',       desc: 'Dark shadow aura',
    category: 'username', pointsPrice: 1000, legendaryFree: true, rarity: 'rare',
    color: '#BC13FE', animated: false, glow: true },

  // ── Epic ─────────────────────────────────────────────────────────────────
  { id: 'ue_gold_glow',     name: 'Gold Aura ✨',      desc: 'Champion-tier shine',
    category: 'username', legendaryFree: true, pointsPrice: 1500, rarity: 'epic',
    color: '#FFD700', animated: false, glow: true },

  { id: 'ue_fire_text',     name: 'Fire Name 🔥',      desc: 'Your name in flames',
    category: 'username', dollarsPrice: 0.99, pointsPrice: 750, rarity: 'epic',
    colors: ['#FF3D00', '#FFD700'], animated: true },

  { id: 'ue_lightning_text', name: 'Storm Name ⚡',    desc: 'Electrify everything',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1000, rarity: 'epic',
    colors: ['#FFD700', '#FFFFFF'], animated: true },

  { id: 'ue_ice_text',      name: 'Ice Crystal ❄️',   desc: 'Frozen crystalline glow',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1000, rarity: 'epic',
    color: '#A0E8FF', animated: true, glow: true },

  { id: 'ue_toxic_anim',    name: 'Toxic ☢️',           desc: 'Radioactive pulse glow',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1000, rarity: 'epic',
    color: '#39FF14', animated: true, glow: true },

  { id: 'ue_chrome',        name: 'Chrome ✨',          desc: 'Metallic chrome shine',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#C0C0C0', '#FFFFFF', '#808080'], animated: true },

  { id: 'ue_glitch',        name: 'Glitch 💻',         desc: 'Cyberpunk digital glitch',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#FF0080', '#00D4FF', '#FFFFFF'], animated: true },

  { id: 'ue_mirror',        name: 'Mirror 🪞',          desc: 'Silver reflet sweep',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#C0C0C0', '#FFFFFF', '#E8E8E8'], animated: true, isNew: true },

  { id: 'ue_aurora_text',   name: 'Aurora ✨',          desc: 'Northern lights shimmer',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#00FF88', '#00D4FF', '#7C4DFF'], animated: true, isNew: true },

  // ── Legendary ─────────────────────────────────────────────────────────────
  { id: 'ue_galaxy_text',   name: 'Galaxy Name 💫',    desc: 'Cosmic-tier flex',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'legendary',
    colors: ['#7C4DFF', '#E040FB', '#00D4FF'], animated: true },

  { id: 'ue_prism',         name: 'Prism 🔮',          desc: 'Light-splitting prismatic reflet',
    category: 'username', dollarsPrice: 1.99, pointsPrice: 2000, rarity: 'legendary',
    colors: ['#FF0080', '#FFD700', '#00D4FF', '#39FF14'], animated: true, isNew: true },

  { id: 'ue_stardust',      name: 'Stardust 🌟',       desc: 'Cosmic sparkle shimmer',
    category: 'username', dollarsPrice: 1.99, pointsPrice: 2000, rarity: 'legendary',
    colors: ['#FFD700', '#FFFFFF', '#E040FB', '#00D4FF'], animated: true, isNew: true },

  // ── Shimmer / Reflet (10) — effet de balayage lumineux ────────────────────
  { id: 'ue_sakura_text',   name: 'Sakura 🌸',         desc: 'Cherry blossom shimmer sweep',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#FF69B4', '#FFFFFF', '#FFB3D1'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_holo_text',     name: 'Holographic 🌈',    desc: 'Prismatic rainbow reflet',
    category: 'username', dollarsPrice: 1.99, pointsPrice: 2000, rarity: 'legendary',
    colors: ['#FF0080', '#FFD700', '#00D4FF'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_fire_reflet',   name: 'Fire Reflet 🔥',    desc: 'Blazing shimmer sweep',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#FF4500', '#FFD700', '#FF8C00'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_void_reflet',   name: 'Void Reflet 🌑',    desc: 'Dark void shimmer',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#BC13FE', '#7C4DFF', '#E040FB'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_gold_reflet',   name: 'Gold Reflet ✨',    desc: 'Luxury gold sweep',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#FFD700', '#FFFFFF', '#C9A84C'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_ice_reflet',    name: 'Ice Reflet ❄️',     desc: 'Crystal ice shimmer',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#A0E8FF', '#FFFFFF', '#00E5FF'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_toxic_reflet',  name: 'Toxic Reflet ☢️',   desc: 'Radioactive sweep',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#39FF14', '#FFFFFF', '#00FF41'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_rose_reflet',   name: 'Rose Gold 🌹',      desc: 'Rose gold shimmer',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    colors: ['#FF69B4', '#FFD700', '#B76E79'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_cosmic_reflet', name: 'Cosmic Reflet 💫',  desc: 'Cosmic pink sweep',
    category: 'username', dollarsPrice: 1.99, pointsPrice: 2000, rarity: 'legendary',
    colors: ['#E040FB', '#7C4DFF', '#FFFFFF'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_lightning_reflet', name: 'Thunder Reflet ⚡', desc: 'Electric light split',
    category: 'username', dollarsPrice: 1.99, pointsPrice: 2000, rarity: 'legendary',
    colors: ['#FFD700', '#FFFFFF', '#FF8C00'], animated: true, shimmer: true, isNew: true },

  { id: 'ue_white_glow',    name: 'White Glow ⬜',     desc: 'Aura blanche pure et lumineuse',
    category: 'username', pointsPrice: 600, rarity: 'rare',
    color: '#FFFFFF', animated: false, glow: true, isNew: true },

  // ── Effets 2026 ───────────────────────────────────────────────────────────
  { id: 'ue_glacier',       name: 'Glacier ❄️',        desc: 'Cristal de glace lumineux',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    color: '#A8DCEA', animated: true, glow: true, isNew: true },

  { id: 'ue_forest_moon',   name: 'Forest Moon 🌙',    desc: 'Lueur dorée dans la forêt sombre',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    color: '#C8A83C', animated: false, glow: true, isNew: true },

  { id: 'ue_ember',         name: 'Ember 🌅',           desc: 'Braise orange qui pulse',
    category: 'username', dollarsPrice: 1.49, pointsPrice: 1500, rarity: 'epic',
    color: '#FF8C42', animated: true, glow: true, isNew: true },
];

// ─── TITRES / BADGES PROFIL ───────────────────────────────────────────────────
// Tag affiché sous le pseudo — identité et statut
// Tous achetables en GA Points uniquement. Triés : common → rare → epic → legendary → exclusive
export const PROFILE_BADGES = [

  // ── Common ────────────────────────────────────────────────────────────────
  { id: 'badge_none',       name: 'No Title',          desc: 'Keep it humble',
    category: 'badge', free: true, rarity: 'common', emoji: '' },

  { id: 'badge_rookie',     name: 'Rookie Gamer',      desc: 'Just getting started',
    category: 'badge', pointsPrice: 200, rarity: 'common',
    emoji: '🎮', color: '#C0C0C0' },

  { id: 'badge_tryhard',    name: 'Tryhard',           desc: 'No days off',
    category: 'badge', pointsPrice: 300, rarity: 'common',
    emoji: '💪', color: '#FF6D00' },

  { id: 'badge_sniper',     name: 'Sniper',            desc: 'Precision is everything',
    category: 'badge', pointsPrice: 350, rarity: 'common',
    emoji: '🎯', color: '#00D4FF' },

  { id: 'badge_nochill',    name: 'No Chill',          desc: 'Pure intensity',
    category: 'badge', pointsPrice: 350, rarity: 'common',
    emoji: '🥶', color: '#00E5FF' },

  // ── Rare — Bronze streak requis (500 streak pts) ──────────────────────────
  { id: 'badge_clutch',     name: 'Clutch Player',     desc: 'Pressure? Never heard of it',
    category: 'badge', pointsPrice: 500, rarity: 'rare', streakRequired: 'bronze',
    emoji: '⚡', color: '#FFD700' },

  { id: 'badge_fragger',    name: 'Top Fragger',       desc: 'Always first on the board',
    category: 'badge', pointsPrice: 500, rarity: 'rare', streakRequired: 'bronze',
    emoji: '💥', color: '#FF2D55' },

  { id: 'badge_strat',      name: 'The Strategist',    desc: 'Every move calculated',
    category: 'badge', pointsPrice: 600, rarity: 'rare', streakRequired: 'bronze',
    emoji: '🧠', color: '#BF5AF2' },

  { id: 'badge_wizard',     name: 'Wizard',            desc: 'Master of all skills',
    category: 'badge', pointsPrice: 600, rarity: 'rare', streakRequired: 'bronze',
    emoji: '🧙', color: '#7C4DFF' },

  { id: 'badge_toxic_b',    name: 'Toxic',             desc: 'Radioactive presence',
    category: 'badge', pointsPrice: 700, rarity: 'rare', streakRequired: 'bronze',
    emoji: '☢️', color: '#39FF14' },

  { id: 'badge_blade',      name: 'Blade Master',      desc: 'Precise and lethal',
    category: 'badge', pointsPrice: 700, rarity: 'rare', streakRequired: 'bronze',
    emoji: '⚔️', color: '#C0C0C0' },

  { id: 'badge_legend',     name: 'Living Legend',     desc: 'Everyone knows the name',
    category: 'badge', pointsPrice: 800, rarity: 'rare', streakRequired: 'bronze',
    emoji: '🔥', color: '#FF3D00' },

  { id: 'badge_ninja',      name: 'Shadow Ninja',      desc: 'Silence is deadly',
    category: 'badge', pointsPrice: 800, rarity: 'rare', streakRequired: 'bronze',
    emoji: '🥷', color: '#2A2A2A' },

  { id: 'badge_titan',      name: 'Titan',             desc: 'Unmovable force',
    category: 'badge', pointsPrice: 900, rarity: 'rare', streakRequired: 'bronze',
    emoji: '🗿', color: '#888899' },

  // ── Epic — Silver streak requis (2 000 streak pts) ────────────────────────
  { id: 'badge_elite',      name: 'Elite Member',      desc: 'Legendary subscriber',
    category: 'badge', legendaryFree: true, pointsPrice: 1800, rarity: 'epic', streakRequired: 'silver',
    emoji: '💎', color: '#00D4FF' },

  { id: 'badge_vip',        name: 'VIP',               desc: 'Exclusive access',
    category: 'badge', legendaryFree: true, pointsPrice: 1800, rarity: 'epic', streakRequired: 'silver',
    emoji: '👑', color: '#C9A84C' },

  { id: 'badge_phantom',    name: 'The Phantom',       desc: 'Unseen. Unstoppable.',
    category: 'badge', pointsPrice: 1000, rarity: 'epic', streakRequired: 'silver',
    emoji: '👻', color: '#7C4DFF' },

  { id: 'badge_berserker',  name: 'Berserker',         desc: 'Pure destruction mode',
    category: 'badge', pointsPrice: 1000, rarity: 'epic', streakRequired: 'silver',
    emoji: '🪓', color: '#FF3D00', isNew: true },

  { id: 'badge_savage',     name: 'Savage',            desc: 'No filter, no mercy',
    category: 'badge', pointsPrice: 1000, rarity: 'epic', streakRequired: 'silver',
    emoji: '💀', color: '#FF2D55', isNew: true },

  { id: 'badge_ghost_b',    name: 'Ghost',             desc: 'Here, then gone',
    category: 'badge', pointsPrice: 1000, rarity: 'epic', streakRequired: 'silver',
    emoji: '👻', color: '#A0A0C0', isNew: true },

  // ── Legendary — Gold streak requis (5 000 streak pts) ────────────────────
  { id: 'badge_apex',       name: 'Apex Predator',     desc: 'Top of the food chain',
    category: 'badge', pointsPrice: 1500, rarity: 'legendary', streakRequired: 'gold',
    emoji: '🦅', color: '#FF3D00' },

  { id: 'badge_void_walker', name: 'Void Walker',      desc: 'Dweller of darkness',
    category: 'badge', pointsPrice: 1500, rarity: 'legendary', streakRequired: 'gold',
    emoji: '🌑', color: '#BC13FE', isNew: true },

  { id: 'badge_shadow_lord', name: 'Shadow Lord',      desc: 'Command the darkness',
    category: 'badge', pointsPrice: 1500, rarity: 'legendary', streakRequired: 'gold',
    emoji: '👁️', color: '#7C4DFF', isNew: true },

  { id: 'badge_immortal',   name: 'Immortal',          desc: 'Can\'t be stopped',
    category: 'badge', pointsPrice: 2000, rarity: 'legendary', streakRequired: 'gold',
    emoji: '⚔️', color: '#FFD700' },

  { id: 'badge_dragon',     name: 'Dragon',            desc: 'Power beyond measure',
    category: 'badge', pointsPrice: 2000, rarity: 'legendary', streakRequired: 'gold',
    emoji: '🐉', color: '#FF3D00', animated: true, isNew: true },

  { id: 'badge_storm_king', name: 'Storm King',        desc: 'God of thunder',
    category: 'badge', pointsPrice: 2000, rarity: 'legendary', streakRequired: 'gold',
    emoji: '⚡', color: '#FFD700', animated: true, isNew: true },

  { id: 'badge_godmode',    name: 'GOD MODE',          desc: 'Maximum swagger — GOAT requis',
    category: 'badge', pointsPrice: 3000, rarity: 'legendary', streakRequired: 'goat',
    emoji: '🌟', color: '#FFD700', animated: true },

  // ── Exclusive (gagnés via gameplay — non achetables) ──────────────────────
  { id: 'badge_og',         name: 'OG Player',         desc: 'Early adopter — earned',
    category: 'badge', exclusive: true, rarity: 'epic',
    emoji: '🏅', color: '#C9A84C' },

  { id: 'badge_verified',   name: 'Verified Creator',  desc: 'Official creator status',
    category: 'badge', exclusive: true, rarity: 'epic',
    emoji: '✅', color: '#00C853' },

  { id: 'badge_champion_t', name: 'Monthly Champion',  desc: 'Held the crown',
    category: 'badge', exclusive: true, rarity: 'legendary',
    emoji: '👑', color: '#FFD700' },

  { id: 'badge_goat',       name: 'The GOAT',          desc: '15,000+ streak points',
    category: 'badge', exclusive: true, rarity: 'legendary',
    emoji: '🐐', color: '#FFD700' },
];

// ─── BORDURES CARD PROFIL ─────────────────────────────────────────────────────
// Bordure visible sur la mini-card quand les gens voient ton profil dans comments/feed
// Triées : common → rare → epic → legendary
export const CARD_BORDERS = [

  // ── Common ────────────────────────────────────────────────────────────────
  { id: 'cb_none',          name: 'No Border',         desc: 'Clean default',
    category: 'card', free: true, rarity: 'common', color: 'transparent' },

  { id: 'cb_silver',        name: 'Silver Border',     desc: 'Clean & polished',
    category: 'card', pointsPrice: 200, rarity: 'common', color: '#C0C0C0' },

  { id: 'cb_gold',          name: 'Gold Border',       desc: 'Classic prestige',
    category: 'card', pointsPrice: 300, rarity: 'common', color: '#C9A84C' },

  // ── Rare ─────────────────────────────────────────────────────────────────
  { id: 'cb_blue_neon',     name: 'Neon Blue',         desc: 'Electric presence',
    category: 'card', pointsPrice: 500, rarity: 'rare', color: '#00D4FF', glow: true },

  { id: 'cb_red_neon',      name: 'GOAT Red',          desc: 'Dominant energy',
    category: 'card', pointsPrice: 500, rarity: 'rare', color: '#FF2D55', glow: true },

  { id: 'cb_purple_neon',   name: 'Purple Haze',       desc: 'Royal glow',
    category: 'card', pointsPrice: 500, rarity: 'rare', color: '#BF5AF2', glow: true },

  { id: 'cb_green_neon',    name: 'Toxic Green',       desc: 'Can\'t miss it',
    category: 'card', pointsPrice: 600, rarity: 'rare', color: '#39FF14', glow: true },

  { id: 'cb_matrix_b',      name: 'Matrix 🔢',         desc: 'Digital green border',
    category: 'card', pointsPrice: 1000, rarity: 'rare',
    color: '#00FF41', glow: true, animated: false },

  // ── Epic ─────────────────────────────────────────────────────────────────
  { id: 'cb_galaxy_border', name: 'Galaxy Border 🌌',  desc: 'Cosmic-tier card',
    category: 'card', legendaryFree: true, pointsPrice: 1500, rarity: 'epic',
    colors: ['#7C4DFF', '#E040FB'], glow: true, animated: false },

  { id: 'cb_ice_b',         name: 'Ice Crystal ❄️',   desc: 'Frozen crystalline border',
    category: 'card', pointsPrice: 800, legendaryFree: true, rarity: 'epic',
    color: '#A0E8FF', glow: true, animated: false },

  { id: 'cb_fire_border',   name: 'Fire Border 🔥',    desc: 'Blazing card frame',
    category: 'card', dollarsPrice: 0.99, rarity: 'epic',
    colors: ['#FF3D00', '#FFD700'], glow: true, animated: true },

  { id: 'cb_glitch_b',      name: 'Glitch 💻',         desc: 'Cyberpunk glitch frame',
    category: 'card', dollarsPrice: 1.49, rarity: 'epic',
    colors: ['#FF0080', '#00D4FF'], glow: true, animated: true, isNew: true },

  { id: 'cb_cherry_b',      name: 'Cherry Blossom 🌸', desc: 'Sakura pink glow',
    category: 'card', dollarsPrice: 1.49, rarity: 'epic',
    color: '#FF69B4', glow: true, animated: true, isNew: true },

  // ── Legendary ─────────────────────────────────────────────────────────────
  { id: 'cb_lightning_border', name: 'Storm Border ⚡', desc: 'Electrified',
    category: 'card', dollarsPrice: 0.99, rarity: 'legendary',
    colors: ['#FFD700', '#00D4FF'], glow: true, animated: true },

  { id: 'cb_void_b',        name: 'Void Energy 🌑',   desc: 'Dark matter frame',
    category: 'card', dollarsPrice: 1.49, rarity: 'legendary',
    color: '#BC13FE', glow: true, animated: true, isNew: true },

  { id: 'cb_holo_border',   name: 'Holo Border ✨',    desc: 'Prismatic excellence',
    category: 'card', dollarsPrice: 1.49, rarity: 'legendary',
    colors: ['#FF0080', '#7C4DFF', '#00D4FF', '#FFD700'],
    glow: true, animated: true },

  { id: 'cb_holographic_b', name: 'Holographic 🌈',   desc: 'Prismatic animated frame',
    category: 'card', dollarsPrice: 1.49, rarity: 'legendary',
    colors: ['#FF0080', '#7C4DFF', '#00D4FF', '#FFD700'],
    glow: true, animated: true, isNew: true },

  { id: 'cb_cosmic_b',      name: 'Cosmic 💫',         desc: 'Universe-tier border',
    category: 'card', dollarsPrice: 1.49, rarity: 'legendary',
    colors: ['#7C4DFF', '#E040FB', '#00D4FF'], glow: true, animated: true, isNew: true },

  { id: 'cb_rainbow_spin',  name: 'Rainbow Spin 🌈',  desc: 'Full spectrum animated',
    category: 'card', dollarsPrice: 1.49, rarity: 'legendary',
    colors: ['#FF0080', '#FF6D00', '#FFD700', '#39FF14', '#00D4FF', '#7C4DFF'],
    glow: true, animated: true, isNew: true },

  { id: 'cb_white',        name: 'White Clean ⬜',    desc: 'Bordure blanche propre et élégante',
    category: 'card', pointsPrice: 300, rarity: 'common', color: '#FFFFFF', glow: false },

  // ── Bordures 2026 ─────────────────────────────────────────────────────────
  { id: 'cb_glacier_b',    name: 'Glacier ❄️',        desc: 'Bordure cristal de glace',
    category: 'card', dollarsPrice: 1.49, rarity: 'epic',
    color: '#A8DCEA', glow: true, animated: false, isNew: true },

  { id: 'cb_konoha_b',     name: 'Forest Moon 🌙',    desc: 'Bordure forêt dorée lunaire',
    category: 'card', dollarsPrice: 1.49, rarity: 'epic',
    color: '#C8A83C', glow: true, animated: false, isNew: true },

  { id: 'cb_ember_b',      name: 'Ember 🌅',           desc: 'Bordure braise orange',
    category: 'card', dollarsPrice: 1.49, rarity: 'epic',
    color: '#FF8C42', glow: true, animated: true, isNew: true },
];

// ─── THÈMES PROFIL COMPLETS (packs) ──────────────────────────────────────────
// Bundle background + bannière + badge assortis — meilleure valeur
export const PROFILE_THEMES = [

  { id: 'theme_champion',   name: 'Champion\'s Legacy 👑',
    desc: 'L\'identité visuelle des winners. Fond or, bannière arène, badge Champion.',
    category: 'theme',
    includes: ['bg_gold_fade', 'banner_champion', 'badge_elite', 'cb_gold', 'ue_gold_glow'],
    dollarsPrice: 1.99, rarity: 'legendary', animated: false,
    preview: 'Pack complet gold pour les top players' },

  { id: 'theme_phantom',    name: 'Phantom Protocol 👻',
    desc: 'Élégance sombre. Fond void, bannière matrix, badge Phantom.',
    category: 'theme',
    includes: ['bg_royal', 'banner_matrix_b', 'badge_phantom', 'cb_purple_neon', 'ue_purple_glow'],
    dollarsPrice: 1.99, rarity: 'legendary', animated: true,
    preview: 'Pack sombre et mystérieux' },

  { id: 'theme_inferno',    name: 'Inferno Mode 🔥',
    desc: 'Tout en feu. Fond flammes, bannière blazing, badge GOAT glow.',
    category: 'theme',
    includes: ['bg_fire_animated', 'banner_fire_b', 'badge_legend', 'cb_fire_border', 'ue_fire_text'],
    dollarsPrice: 2.49, rarity: 'legendary', animated: true,
    preview: 'Pack feu animé complet — le plus impactant' },

  { id: 'theme_storm',      name: 'Storm Chaser ⚡',
    desc: 'Énergie électrique. Fond lightning, bannière storm, pseudo électrifié.',
    category: 'theme',
    includes: ['bg_neon_grid', 'banner_lightning_b', 'badge_clutch', 'cb_lightning_border', 'ue_lightning_text'],
    dollarsPrice: 2.49, rarity: 'legendary', animated: true,
    preview: 'Pack électrique animé — power unleashed' },

  { id: 'theme_cosmic',     name: 'Cosmic Entity 💫',
    desc: 'Au-delà du gaming. Fond cosmique, bannière aurora, pseudo galaxy.',
    category: 'theme',
    includes: ['bg_cosmic', 'banner_aurora_b', 'badge_immortal', 'cb_holo_border', 'ue_galaxy_text'],
    dollarsPrice: 2.99, rarity: 'legendary', animated: true,
    preview: 'Le pack le plus épique — réservé aux légendes' },

  { id: 'theme_matrix',     name: 'The One 🔢',
    desc: 'Neo-gaming. Fond Matrix, bannière code, badge God Mode.',
    category: 'theme',
    includes: ['bg_matrix', 'banner_matrix_b', 'badge_godmode', 'cb_green_neon', 'ue_green_glow'],
    dollarsPrice: 2.99, rarity: 'legendary', animated: true,
    preview: 'Pack Matrix animé — être The One' },

  // ── Nouveaux thèmes (2025) ─────────────────────────────────────────────────
  { id: 'theme_sakura',     name: 'Sakura Dreams 🌸',
    desc: 'Cherry blossom paradise. Fond pétales, bannière aurora, badge Ghost.',
    category: 'theme',
    includes: ['bg_cherry_bloom', 'banner_aurora_b', 'badge_ghost_b', 'cb_cherry_b', 'ue_ice_text'],
    dollarsPrice: 2.49, rarity: 'legendary', animated: true, isNew: true,
    preview: 'Pack cerisier complet — douceur et prestige ultime' },

  { id: 'theme_cyber',      name: 'Cyber Punk 💻',
    desc: 'Glitch reality. Fond glitch, bannière neon city, badge Void Walker.',
    category: 'theme',
    includes: ['bg_holographic', 'banner_neon_city', 'badge_void_walker', 'cb_glitch_b', 'ue_glitch'],
    dollarsPrice: 2.99, rarity: 'legendary', animated: true, isNew: true,
    preview: 'Pack cyberpunk complet — glitch city life' },

  { id: 'theme_arctic',     name: 'Arctic Storm ❄️',
    desc: 'Frozen world. Fond blizzard, bannière storm, pseudo ice crystal.',
    category: 'theme',
    includes: ['bg_ocean', 'banner_lightning_b', 'badge_clutch', 'cb_ice_b', 'ue_ice_text'],
    dollarsPrice: 2.49, rarity: 'legendary', animated: true, isNew: true,
    preview: 'Pack arctique animé — froid et puissance glaciale' },

  { id: 'theme_void_walker', name: 'Void Walker 🌑',
    desc: 'Darkness incarnate. Fond void pulse, bannière galaxy, badge Shadow Lord.',
    category: 'theme',
    includes: ['bg_void_pulse', 'banner_galaxy_b', 'badge_shadow_lord', 'cb_void_b', 'ue_shadow'],
    dollarsPrice: 2.99, rarity: 'legendary', animated: true, isNew: true,
    preview: 'Pack ténèbres absolu — le plus mystérieux de la boutique' },

  { id: 'theme_neon_city',  name: 'Neon City 🌆',
    desc: 'Cityscape at night. Fond vaporwave, bannière holo, badge Storm King.',
    category: 'theme',
    includes: ['bg_aurora', 'banner_holo_b', 'badge_storm_king', 'cb_rainbow_spin', 'ue_holo_text'],
    dollarsPrice: 2.99, rarity: 'legendary', animated: true, isNew: true,
    preview: 'Pack néon city — ambiance future vibes maximal' },

  // ── Thèmes 2026 ───────────────────────────────────────────────────────────
  { id: 'theme_white',      name: 'White Clean ⬜',
    desc: 'Minimalisme total. Fond blanc pur, bannière blanche, pseudo white glow. Unique.',
    category: 'theme',
    includes: ['bg_white_clean', 'banner_white_b', 'badge_vip', 'cb_white', 'ue_white_glow'],
    dollarsPrice: 1.99, rarity: 'epic', animated: false, isNew: true,
    preview: 'Le seul pack blanc de la boutique — sobre, rare, impactant' },

  { id: 'theme_glacier',    name: 'Glacier Light 🧊',
    desc: 'Pureté cristalline. Fond glacier, bannière ice, badge Blade. Bleu clair premium.',
    category: 'theme',
    includes: ['bg_glacier', 'banner_glacier_b', 'badge_blade', 'cb_glacier_b', 'ue_glacier'],
    dollarsPrice: 2.49, rarity: 'legendary', animated: false, isNew: true,
    preview: 'Pack glacier — clarté et froideur cristalline ultime' },

  { id: 'theme_konoha',     name: 'Clair de Konoha 🌙',
    desc: 'Forêt ninja sous la lune dorée. Fond nuit sombre, badge Ninja, reflet lunaire.',
    category: 'theme',
    includes: ['bg_konoha', 'banner_konoha_b', 'badge_ninja', 'cb_konoha_b', 'ue_forest_moon'],
    dollarsPrice: 2.49, rarity: 'legendary', animated: false, isNew: true,
    preview: 'Pack Konoha — nuit de forêt dorée, vibes ninja légendaire' },

  { id: 'theme_sunset_ember', name: 'Sunset Ember 🌅',
    desc: 'Orange brûlant au coucher du soleil. Fond ember animé, badge Titan, braise pulsante.',
    category: 'theme',
    includes: ['bg_sunset_ember', 'banner_sunset_b', 'badge_titan', 'cb_ember_b', 'ue_ember'],
    dollarsPrice: 2.49, rarity: 'legendary', animated: true, isNew: true,
    preview: 'Pack sunset orange — couleur jamais vue, energy brûlante' },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export const RARITY_CONFIG = {
  common:    { label: 'Common',    color: '#C0C0C0', order: 1 },
  rare:      { label: 'Rare',      color: '#00D4FF', order: 2 },
  epic:      { label: 'Epic',      color: '#BF5AF2', order: 3 },
  legendary: { label: 'Mythic', color: '#FFD700', order: 4 },
  mythic:    { label: 'Mythic', color: '#FFD700', order: 4 },
};

// Toutes les catégories cosmétiques
export const ALL_COSMETICS = [
  ...PROFILE_BACKGROUNDS,
  ...PROFILE_BANNERS,
  ...USERNAME_EFFECTS,
  ...PROFILE_BADGES,
  ...CARD_BORDERS,
  ...PROFILE_THEMES,
];

export const getCosmeticById = (id) => ALL_COSMETICS.find(c => c.id === id) || null;

// Vérifie si un user a accès à un cosmétique
export function canAccessCosmetic(cosmetic, userPlan, ownedCosmetics = []) {
  if (!cosmetic) return false;
  if (cosmetic.free) return true;
  if (cosmetic.exclusive) return false; // Gagné via gameplay uniquement
  if (ownedCosmetics.includes(cosmetic.id)) return true;
  if (cosmetic.legendaryFree && userPlan === 'legendary') return true;
  // Legendary : inclus si ≤ 1,49 $ (argent) OU payé en points — sauf les thèmes
  if (userPlan === 'legendary' && cosmetic.category !== 'theme' && !cosmetic.exclusive) {
    const dp = Number(cosmetic.dollarsPrice || 0);
    if (dp > 0 ? dp <= 1.49 : Number(cosmetic.pointsPrice || 0) > 0) return true;
  }
  return false;
}

// Prix d'affichage pour le shop
export function getCosmeticPrice(cosmetic, userPlan) {
  if (cosmetic.free) return { type: 'free', label: 'Free' };
  if (cosmetic.exclusive) return { type: 'exclusive', label: 'Earned' };
  if (cosmetic.legendaryFree && userPlan === 'legendary') return { type: 'legendary_free', label: 'Legendary ✓' };
  if (userPlan === 'legendary' && cosmetic.category !== 'theme' && !cosmetic.exclusive && (Number(cosmetic.dollarsPrice || 0) > 0 ? Number(cosmetic.dollarsPrice) <= 1.49 : Number(cosmetic.pointsPrice || 0) > 0)) return { type: 'legendary_free', label: 'Legendary ✓' };
  if (cosmetic.dollarsPrice) return { type: 'dollars', label: `CA$${cosmetic.dollarsPrice.toFixed(2)}`, value: cosmetic.dollarsPrice };
  if (cosmetic.pointsPrice) return { type: 'points', label: `${cosmetic.pointsPrice.toLocaleString()} pts`, value: cosmetic.pointsPrice };
  return { type: 'free', label: 'Free' };
}
