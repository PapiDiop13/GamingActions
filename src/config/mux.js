/**
 * mux.js — Configuration Mux pour Gaming Actions
 *
 * Mux gère toute la vidéo : upload, transcodage HLS adaptatif, thumbnails automatiques.
 * Les images (avatars, banners, logo) restent sur Cloudinary (Mux = vidéo uniquement).
 *
 * SETUP :
 * 1. Va sur dashboard.mux.com → Settings → API Access Tokens
 * 2. Génère un token avec permission "Mux Video" (Full Access)
 * 3. Colle le TOKEN_ID et TOKEN_SECRET ci-dessous
 * 4. Va sur Settings → Video → Direct Uploads → Active
 *
 * ⚠️  Les clés Mux sont utilisées côté serveur uniquement (Cloud Functions).
 *     L'app mobile utilise des "upload URLs" temporaires générées par la fonction
 *     uploadMuxGetUrl — jamais les clés directement dans l'app.
 */

// ─── URL helper ────────────────────────────────────────────────────────────
// Remplace optimizeVideoUrl de Cloudinary.
// Mux fournit le streaming HLS natif — l'URL .m3u8 est la playlist adaptative.
// Pour le player expo-video, on utilise directement l'URL playback Mux.
export const getMuxPlaybackUrl = (playbackId) => {
  if (!playbackId) return null;
  // HLS stream (adaptatif — qualité auto selon connexion, démarre en < 1 sec)
  return `https://stream.mux.com/${playbackId}.m3u8`;
};

// URL de thumbnail Mux (image fixe à la seconde 3 par défaut)
// width/height optionnels pour optimiser selon contexte (feed vs miniature)
export const getMuxThumbnailUrl = (playbackId, { time = 3, width = 400, height = 225 } = {}) => {
  if (!playbackId) return null;
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}&width=${width}&height=${height}&fit_mode=crop`;
};

// Durée animée GIF (pour les previews en survol — feature future)
export const getMuxGifUrl = (playbackId, { start = 0, end = 3, width = 320 } = {}) => {
  if (!playbackId) return null;
  return `https://image.mux.com/${playbackId}/animated.gif?start=${start}&end=${end}&width=${width}`;
};

// Compatibilité descendante — les anciennes vidéos Cloudinary ont une videoUrl directe.
// Cette fonction détecte le format et retourne la bonne URL pour le player.
export const getVideoUrl = (video) => {
  if (!video) return null;
  // Nouvelle vidéo Mux : a un muxPlaybackId
  if (video.muxPlaybackId) return getMuxPlaybackUrl(video.muxPlaybackId);
  // Ancienne vidéo Cloudinary : a une videoUrl directe
  if (video.videoUrl) return video.videoUrl;
  return null;
};

// Même chose pour les thumbnails
export const getThumbnailUrl = (video) => {
  if (!video) return null;
  // 1) Image de couverture custom (uploadée par l'utilisateur) — prioritaire
  if (video.thumbnail) return video.thumbnail;
  // 2) Frame choisie dans la vidéo (thumbnailTime) via Mux
  if (video.muxPlaybackId) return getMuxThumbnailUrl(video.muxPlaybackId, { time: typeof video.thumbnailTime === 'number' ? video.thumbnailTime : 3 });
  if (video.thumbnailUrl) return video.thumbnailUrl;
  return null;
};
