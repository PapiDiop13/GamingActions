// cosmeticAccess.js — Accès cosmétiques pour les abonnés Legendary.
// Règle : tout cosmétique payant à 0,99 $ ou moins est GRATUIT tant que l'utilisateur
// est abonné Legendary. Dès que l'abonnement expire, les freebies équipés (non possédés)
// sont retirés (revokeLegendaryFreebies, appelé au chargement du profil).
// Les items à 1,49 $ et plus restent toujours payants.

import { getCosmeticById } from './cosmetics';
import { getFrameById, COMMENT_FRAMES } from './frames';

// Éligible "gratuit pour les abonnés Legendary" :
//   - tout item payant en argent ≤ 1,49 $
//   - tout item en points (peu importe le nombre de points)
//   - SAUF les thèmes (jamais gratuits) et les items exclusifs/déjà gratuits
export const isFreebieCosmetic = (item) => {
  if (!item) return false;
  if (item.category === 'theme') return false;
  if (item.exclusive || item.free) return false;
  const dp = Number(item.dollarsPrice || 0);
  if (dp > 0) return dp <= 1.49;
  return Number(item.pointsPrice || 0) > 0;
};

// L'utilisateur a-t-il l'accès Legendary (abonné, ou admin/gameconic/board/isAdmin = bypass) ?
export const userHasLegendary = (u) =>
  !!u && (u.plan === 'legendary' || u.accountType === 'admin' || u.accountType === 'gameconic'
    || u.accountType === 'board' || u.isAdmin === true);

const getCommentFrameById = (id) => (COMMENT_FRAMES || []).find((f) => f.id === id) || null;

// Renvoie un patch Firestore { champ: 'none' } pour retirer les freebies équipés
// quand l'utilisateur N'EST PLUS Legendary et ne les possède pas. Sinon null.
export function revokeLegendaryFreebies(profile) {
  if (!profile) return null;
  if (userHasLegendary(profile)) return null; // toujours abonné → on garde tout

  const ownedFrames  = profile.ownedFrames || [];
  const ownedComment = profile.ownedCommentFrames || [];
  const ownedCosm    = profile.ownedCosmetics || [];
  const patch = {};

  const eqF = profile.equippedFrame;
  if (eqF && eqF !== 'none') {
    const f = getFrameById(eqF);
    if (f && isFreebieCosmetic(f) && !ownedFrames.includes(f.id)) patch.equippedFrame = 'none';
  }

  const eqC = profile.equippedCommentFrame;
  if (eqC && eqC !== 'none') {
    const f = getCommentFrameById(eqC);
    if (f && isFreebieCosmetic(f) && !ownedComment.includes(f.id)) patch.equippedCommentFrame = 'none';
  }

  const cosmeticFields = [
    'equippedProfileBg', 'equippedProfileBanner', 'equippedProfileBadge',
    'equippedUsernameEffect', 'equippedCardBorder',
  ];
  for (const field of cosmeticFields) {
    const id = profile[field];
    if (id && id !== 'none') {
      const c = getCosmeticById(id);
      if (c && isFreebieCosmetic(c) && !ownedCosm.includes(c.id)) patch[field] = 'none';
    }
  }

  return Object.keys(patch).length ? patch : null;
}
