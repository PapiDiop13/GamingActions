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
export const PROFILE_BACKGROUNDS = [

  // Gratuits
  { id: 'bg_none',          name: 'Default Dark',      desc: 'The classic GA look',
    category: 'background', free: true, rarity: 'common',
    colors: ['#0A0A0F'],    animated: false,
    preview: 'Fond noir gaming par défaut' },

  // GA Points — common
  { id: 'bg_midnight',      name: 'Midnight Blue',     desc: 'Deep space vibes',
    category: 'background', pointsPrice: 500, rarity: 'common',
    colors: ['#0D0D2B', '#050518'], animated: false,
    preview: 'Gradient bleu nuit profond' },

  { id: 'bg_forest',        name: 'Dark Forest',       desc: 'Tactical & clean',
    category: 'background', pointsPrice: 500, rarity: 'common',
    colors: ['#0B1A0E', '#050D07'], animated: false,
    preview: 'Fond vert forêt sombre' },

  { id: 'bg_crimson',       name: 'Crimson Night',     desc: 'For the warriors',
    category: 'background', pointsPrice: 600, rarity: 'common',
    colors: ['#1A0505', '#0D0202'], animated: false,
    preview: 'Fond rouge sang intense' },

  { id: 'bg_royal',         name: 'Royal Purple',      desc: 'Reign supreme',
    category: 'background', pointsPrice: 600, rarity: 'common',
    colors: ['#12051A', '#08020F'], animated: false,
    preview: 'Fond violet royal profond' },

  { id: 'bg_slate',         name: 'Gunmetal Slate',    desc: 'Tactical precision',
    category: 'background', pointsPrice: 400, rarity: 'common',
    colors: ['#1C1C2E', '#131320'], animated: false,
    preview: 'Ardoise gris foncé métallique' },

  // GA Points — rare (gradients)
  { id: 'bg_gold_fade',     name: 'Gold Rush',         desc: 'Champion energy',
    category: 'background', pointsPrice: 1200, rarity: 'rare',
    colors: ['#1A1200', '#0A0800', '#C9A84C'],
    animated: false, preview: 'Gradient or fondu sur fond noir' },

  { id: 'bg_ocean',         name: 'Deep Ocean',        desc: 'Calm but deadly',
    category: 'background', pointsPrice: 1000, rarity: 'rare',
    colors: ['#001F3F', '#00111F'], animated: false,
    preview: 'Gradient bleu océan profond' },

  { id: 'bg_sunset',        name: 'Neon Sunset',       desc: 'Vaporwave energy',
    category: 'background', pointsPrice: 1200, rarity: 'rare',
    colors: ['#1A0520', '#200A05'], animated: false,
    preview: 'Gradient violet-orange néon' },

  { id: 'bg_toxic_grad',    name: 'Toxic Gradient',    desc: 'Green machine',
    category: 'background', pointsPrice: 1000, rarity: 'rare',
    colors: ['#001A05', '#030D02', '#39FF14'],
    animated: false, preview: 'Gradient vert toxique' },

  // Legendary Free — epic
  { id: 'bg_galaxy',        name: 'Galaxy Field',      desc: 'Lost in the cosmos',
    category: 'background', legendaryFree: true, pointsPrice: 2000, rarity: 'epic',
    colors: ['#05001A', '#0A0020', '#7C4DFF', '#E040FB'],
    animated: false, preview: 'Champ étoilé galactique' },

  { id: 'bg_aurora',        name: 'Aurora Borealis',   desc: 'Magical Northern Lights',
    category: 'background', legendaryFree: true, pointsPrice: 2500, rarity: 'epic',
    colors: ['#001A10', '#00100A', '#00FF88', '#00D4FF'],
    animated: false, preview: 'Aurores boréales vertes et cyan' },

  { id: 'bg_lava_lamp',     name: 'Lava Core',         desc: 'Volcanic intensity',
    category: 'background', legendaryFree: true, pointsPrice: 2000, rarity: 'epic',
    colors: ['#1A0500', '#100300', '#FF3D00', '#FF8C00'],
    animated: false, preview: 'Gradient lave en fusion' },

  // Payants ($) — animated — legendary
  { id: 'bg_matrix',        name: 'Matrix Rain 🔢',    desc: 'You are The One',
    category: 'background', dollarsPrice: 1.99, rarity: 'legendary',
    colors: ['#001A05', '#003008', '#00FF41'],
    animated: true, preview: 'Pluie de code verte animée' },

  { id: 'bg_holographic',   name: 'Holographic ✨',    desc: 'Next-gen iridescent',
    category: 'background', dollarsPrice: 2.99, rarity: 'legendary',
    colors: ['#FF0080', '#7C4DFF', '#00D4FF', '#FFD700'],
    animated: true, preview: 'Effet holographique arc-en-ciel animé' },

  { id: 'bg_fire_animated', name: 'Inferno 🔥',        desc: 'Everything burns',
    category: 'background', dollarsPrice: 1.99, rarity: 'legendary',
    colors: ['#1A0500', '#FF3D00', '#FF8C00', '#FFD700'],
    animated: true, preview: 'Flammes animées en fond' },

  { id: 'bg_lightning_bg',  name: 'Storm Field ⚡',    desc: 'Power unleashed',
    category: 'background', dollarsPrice: 2.99, rarity: 'legendary',
    colors: ['#050510', '#0A0A20', '#FFD700', '#00D4FF'],
    animated: true, preview: 'Éclairs animés fond sombre' },

  { id: 'bg_cosmic',        name: 'Cosmic Pulse 💫',   desc: 'Universe-tier flex',
    category: 'background', dollarsPrice: 3.99, rarity: 'legendary',
    colors: ['#02000A', '#7C4DFF', '#E040FB', '#00D4FF', '#FFD700'],
    animated: true, preview: 'Nébuleuse cosmique pulsante animée' },
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
    category: 'banner', dollarsPrice: 1.99, rarity: 'legendary',
    colors: ['#1A0500', '#FF3D00', '#FFD700'],
    animated: true, preview: 'Bannière en flammes animées' },

  { id: 'banner_lightning_b', name: 'Storm Banner ⚡', desc: 'Electric personality',
    category: 'banner', dollarsPrice: 1.99, rarity: 'legendary',
    colors: ['#050510', '#FFD700', '#00D4FF'],
    animated: true, preview: 'Éclairs animés sur la bannière' },

  { id: 'banner_matrix_b',  name: 'Matrix Banner 🔢',  desc: 'The chosen one',
    category: 'banner', dollarsPrice: 2.99, rarity: 'legendary',
    colors: ['#001A05', '#00FF41'],
    animated: true, preview: 'Chute de code verte animée' },

  { id: 'banner_aurora_b',  name: 'Aurora Banner 🌌',  desc: 'Otherworldly beauty',
    category: 'banner', dollarsPrice: 2.99, rarity: 'legendary',
    colors: ['#001A10', '#00FF88', '#7C4DFF'],
    animated: true, preview: 'Aurores boréales animées' },

  { id: 'banner_holo_b',    name: 'Holo Banner ✨',    desc: 'Prismatic excellence',
    category: 'banner', dollarsPrice: 3.99, rarity: 'legendary',
    colors: ['#FF0080', '#7C4DFF', '#00D4FF', '#FFD700'],
    animated: true, preview: 'Effet holographique arc-en-ciel animé' },
];

// ─── EFFETS PSEUDO ────────────────────────────────────────────────────────────
// Modifie l'apparence du username sur le profil
export const USERNAME_EFFECTS = [

  { id: 'ue_none',          name: 'Default',           desc: 'Standard white username',
    category: 'username', free: true, rarity: 'common',
    color: '#FFFFFF', animated: false },

  // GA Points
  { id: 'ue_gold',          name: 'Gold Text',         desc: 'Prestigious gold name',
    category: 'username', pointsPrice: 400, rarity: 'common',
    color: '#C9A84C', animated: false },

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

  // Legendary Free
  { id: 'ue_gold_glow',     name: 'Gold Aura ✨',      desc: 'Champion-tier shine',
    category: 'username', legendaryFree: true, pointsPrice: 1500, rarity: 'epic',
    color: '#FFD700', animated: false, glow: true },

  // Payants ($) — gradient text / animated
  { id: 'ue_fire_text',     name: 'Fire Name 🔥',      desc: 'Your name in flames',
    category: 'username', dollarsPrice: 0.99, rarity: 'epic',
    colors: ['#FF3D00', '#FFD700'], animated: true },

  { id: 'ue_galaxy_text',   name: 'Galaxy Name 💫',    desc: 'Cosmic-tier flex',
    category: 'username', dollarsPrice: 1.99, rarity: 'legendary',
    colors: ['#7C4DFF', '#E040FB', '#00D4FF'], animated: true },

  { id: 'ue_rainbow_text',  name: 'Rainbow Name 🌈',   desc: 'Maximum chromatic',
    category: 'username', dollarsPrice: 1.99, rarity: 'legendary',
    colors: ['#FF0080', '#FF6D00', '#FFD700', '#39FF14', '#00D4FF', '#7C4DFF'],
    animated: true },

  { id: 'ue_lightning_text', name: 'Storm Name ⚡',    desc: 'Electrify everything',
    category: 'username', dollarsPrice: 1.49, rarity: 'epic',
    colors: ['#FFD700', '#FFFFFF'], animated: true },
];

// ─── TITRES / BADGES PROFIL ───────────────────────────────────────────────────
// Tag affiché sous le pseudo — identité et statut
export const PROFILE_BADGES = [

  // Gagnés via gameplay (exclusifs)
  { id: 'badge_none',       name: 'No Title',          desc: 'Keep it humble',
    category: 'badge', free: true, rarity: 'common', emoji: '' },

  { id: 'badge_og',         name: 'OG Player',         desc: 'Early adopter — earned',
    category: 'badge', exclusive: true, rarity: 'epic',
    emoji: '🏅', color: '#C9A84C' },

  { id: 'badge_champion_t', name: 'Monthly Champion',  desc: 'Held the crown',
    category: 'badge', exclusive: true, rarity: 'legendary',
    emoji: '👑', color: '#FFD700' },

  { id: 'badge_goat',       name: 'The GOAT',          desc: '15,000+ streak points',
    category: 'badge', exclusive: true, rarity: 'legendary',
    emoji: '🐐', color: '#FFD700' },

  { id: 'badge_verified',   name: 'Verified Creator',  desc: 'Official creator status',
    category: 'badge', exclusive: true, rarity: 'epic',
    emoji: '✅', color: '#00C853' },

  // GA Points — common
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

  { id: 'badge_clutch',     name: 'Clutch Player',     desc: 'Pressure? Never heard of it',
    category: 'badge', pointsPrice: 500, rarity: 'rare',
    emoji: '⚡', color: '#FFD700' },

  { id: 'badge_fragger',    name: 'Top Fragger',       desc: 'Always first on the board',
    category: 'badge', pointsPrice: 500, rarity: 'rare',
    emoji: '💥', color: '#FF2D55' },

  { id: 'badge_strat',      name: 'The Strategist',    desc: 'Every move calculated',
    category: 'badge', pointsPrice: 600, rarity: 'rare',
    emoji: '🧠', color: '#BF5AF2' },

  { id: 'badge_legend',     name: 'Living Legend',     desc: 'Everyone knows the name',
    category: 'badge', pointsPrice: 800, rarity: 'rare',
    emoji: '🔥', color: '#FF3D00' },

  // Legendary Free — epic
  { id: 'badge_elite',      name: 'Elite Member',      desc: 'Legendary subscriber',
    category: 'badge', legendaryFree: true, pointsPrice: 2000, rarity: 'epic',
    emoji: '💎', color: '#00D4FF' },

  { id: 'badge_vip',        name: 'VIP',               desc: 'Exclusive access',
    category: 'badge', legendaryFree: true, pointsPrice: 1800, rarity: 'epic',
    emoji: '👑', color: '#C9A84C' },

  // Payants ($) — les plus stylés
  { id: 'badge_phantom',    name: 'The Phantom',       desc: 'Unseen. Unstoppable.',
    category: 'badge', dollarsPrice: 0.99, rarity: 'epic',
    emoji: '👻', color: '#7C4DFF' },

  { id: 'badge_apex',       name: 'Apex Predator',     desc: 'Top of the food chain',
    category: 'badge', dollarsPrice: 1.49, rarity: 'legendary',
    emoji: '🦅', color: '#FF3D00' },

  { id: 'badge_immortal',   name: 'Immortal',          desc: 'Can\'t be stopped',
    category: 'badge', dollarsPrice: 1.99, rarity: 'legendary',
    emoji: '⚔️', color: '#FFD700' },

  { id: 'badge_godmode',    name: 'GOD MODE',          desc: 'Maximum swagger',
    category: 'badge', dollarsPrice: 2.99, rarity: 'legendary',
    emoji: '🌟', color: '#FFD700', animated: true },
];

// ─── BORDURES CARD PROFIL ─────────────────────────────────────────────────────
// Bordure visible sur la mini-card quand les gens voient ton profil dans comments/feed
export const CARD_BORDERS = [

  { id: 'cb_none',          name: 'No Border',         desc: 'Clean default',
    category: 'card', free: true, rarity: 'common', color: 'transparent' },

  { id: 'cb_gold',          name: 'Gold Border',       desc: 'Classic prestige',
    category: 'card', pointsPrice: 300, rarity: 'common', color: '#C9A84C' },

  { id: 'cb_silver',        name: 'Silver Border',     desc: 'Clean & polished',
    category: 'card', pointsPrice: 200, rarity: 'common', color: '#C0C0C0' },

  { id: 'cb_blue_neon',     name: 'Neon Blue',         desc: 'Electric presence',
    category: 'card', pointsPrice: 500, rarity: 'rare', color: '#00D4FF', glow: true },

  { id: 'cb_red_neon',      name: 'GOAT Red',          desc: 'Dominant energy',
    category: 'card', pointsPrice: 500, rarity: 'rare', color: '#FF2D55', glow: true },

  { id: 'cb_purple_neon',   name: 'Purple Haze',       desc: 'Royal glow',
    category: 'card', pointsPrice: 500, rarity: 'rare', color: '#BF5AF2', glow: true },

  { id: 'cb_green_neon',    name: 'Toxic Green',       desc: 'Can\'t miss it',
    category: 'card', pointsPrice: 600, rarity: 'rare', color: '#39FF14', glow: true },

  { id: 'cb_galaxy_border', name: 'Galaxy Border 🌌',  desc: 'Cosmic-tier card',
    category: 'card', legendaryFree: true, pointsPrice: 1500, rarity: 'epic',
    colors: ['#7C4DFF', '#E040FB'], glow: true, animated: false },

  { id: 'cb_fire_border',   name: 'Fire Border 🔥',    desc: 'Blazing card frame',
    category: 'card', dollarsPrice: 0.99, rarity: 'epic',
    colors: ['#FF3D00', '#FFD700'], glow: true, animated: true },

  { id: 'cb_lightning_border', name: 'Storm Border ⚡', desc: 'Electrified',
    category: 'card', dollarsPrice: 0.99, rarity: 'legendary',
    colors: ['#FFD700', '#00D4FF'], glow: true, animated: true },

  { id: 'cb_holo_border',   name: 'Holo Border ✨',    desc: 'Prismatic excellence',
    category: 'card', dollarsPrice: 1.99, rarity: 'legendary',
    colors: ['#FF0080', '#7C4DFF', '#00D4FF', '#FFD700'],
    glow: true, animated: true },
];

// ─── THÈMES PROFIL COMPLETS (packs) ──────────────────────────────────────────
// Bundle background + bannière + badge assortis — meilleure valeur
export const PROFILE_THEMES = [

  { id: 'theme_champion',   name: 'Champion\'s Legacy 👑',
    desc: 'L\'identité visuelle des winners. Fond or, bannière arène, badge Champion.',
    category: 'theme',
    includes: ['bg_gold_fade', 'banner_champion', 'badge_elite', 'cb_gold', 'ue_gold_glow'],
    dollarsPrice: 4.99, rarity: 'legendary', animated: false,
    preview: 'Pack complet gold pour les top players' },

  { id: 'theme_phantom',    name: 'Phantom Protocol 👻',
    desc: 'Élégance sombre. Fond void, bannière matrix, badge Phantom.',
    category: 'theme',
    includes: ['bg_midnight', 'banner_matrix_b', 'badge_phantom', 'cb_purple_neon', 'ue_purple_glow'],
    dollarsPrice: 4.99, rarity: 'legendary', animated: true,
    preview: 'Pack sombre et mystérieux' },

  { id: 'theme_inferno',    name: 'Inferno Mode 🔥',
    desc: 'Tout en feu. Fond flammes, bannière blazing, badge GOAT glow.',
    category: 'theme',
    includes: ['bg_fire_animated', 'banner_fire_b', 'badge_legend', 'cb_fire_border', 'ue_fire_text'],
    dollarsPrice: 5.99, rarity: 'legendary', animated: true,
    preview: 'Pack feu animé complet — le plus impactant' },

  { id: 'theme_storm',      name: 'Storm Chaser ⚡',
    desc: 'Énergie électrique. Fond lightning, bannière storm, pseudo électrifié.',
    category: 'theme',
    includes: ['bg_lightning_bg', 'banner_lightning_b', 'badge_clutch', 'cb_lightning_border', 'ue_lightning_text'],
    dollarsPrice: 5.99, rarity: 'legendary', animated: true,
    preview: 'Pack électrique animé — power unleashed' },

  { id: 'theme_cosmic',     name: 'Cosmic Entity 💫',
    desc: 'Au-delà du gaming. Fond cosmique, bannière aurora, pseudo galaxy.',
    category: 'theme',
    includes: ['bg_cosmic', 'banner_aurora_b', 'badge_immortal', 'cb_holo_border', 'ue_galaxy_text'],
    dollarsPrice: 7.99, rarity: 'legendary', animated: true,
    preview: 'Le pack le plus épique — réservé aux légendes' },

  { id: 'theme_matrix',     name: 'The One 🔢',
    desc: 'Neo-gaming. Fond Matrix, bannière code, badge God Mode.',
    category: 'theme',
    includes: ['bg_matrix', 'banner_matrix_b', 'badge_godmode', 'cb_green_neon', 'ue_rainbow_text'],
    dollarsPrice: 6.99, rarity: 'legendary', animated: true,
    preview: 'Pack Matrix animé — être The One' },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export const RARITY_CONFIG = {
  common:    { label: 'Common',    color: '#C0C0C0', order: 1 },
  rare:      { label: 'Rare',      color: '#00D4FF', order: 2 },
  epic:      { label: 'Epic',      color: '#BF5AF2', order: 3 },
  legendary: { label: 'Legendary', color: '#FFD700', order: 4 },
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
  return false;
}

// Prix d'affichage pour le shop
export function getCosmeticPrice(cosmetic, userPlan) {
  if (cosmetic.free) return { type: 'free', label: 'Free' };
  if (cosmetic.exclusive) return { type: 'exclusive', label: 'Earned' };
  if (cosmetic.legendaryFree && userPlan === 'legendary') return { type: 'legendary_free', label: 'Legendary ✓' };
  if (cosmetic.dollarsPrice) return { type: 'dollars', label: `CA$${cosmetic.dollarsPrice.toFixed(2)}`, value: cosmetic.dollarsPrice };
  if (cosmetic.pointsPrice) return { type: 'points', label: `${cosmetic.pointsPrice.toLocaleString()} pts`, value: cosmetic.pointsPrice };
  return { type: 'free', label: 'Free' };
}
