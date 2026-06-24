/**
 * storage.js — Firebase Storage pour Gaming Actions
 *
 * Remplace Cloudinary pour toutes les IMAGES :
 * - Avatars utilisateurs
 * - Banners de profil
 * - Images statiques (logo, etc.)
 *
 * Les VIDÉOS restent sur Mux (voir mux.js).
 *
 * Plan gratuit Firebase Storage (Spark) :
 * - 5 GB stockage gratuit
 * - 1 GB/jour download gratuit
 * Largement suffisant pour les avatars/banners (~500 MB estimé à 10k users)
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * uploadImage — upload générique d'une image vers Firebase Storage.
 * @param {string} fileUri - URI locale du fichier (depuis ImagePicker)
 * @param {string} path - chemin dans Storage ex: "avatars/uid_123.jpg"
 * @param {string} mimeType - "image/jpeg" par défaut
 * @returns {Promise<string>} URL publique de l'image
 */
export const uploadImage = async (fileUri, path, mimeType = 'image/jpeg') => {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: mimeType });
  return getDownloadURL(storageRef);
};

/**
 * uploadAvatar — upload l'avatar d'un user.
 * Remplace uploadAvatarToCloudinary.
 * @param {string} fileUri - URI locale
 * @param {string} userId - UID Firebase Auth du user
 * @returns {Promise<string>} URL publique de l'avatar
 */
export const uploadAvatar = async (fileUri, userId) => {
  const path = `avatars/${userId}_${Date.now()}.jpg`;
  return uploadImage(fileUri, path);
};

/**
 * uploadBanner — upload le banner de profil d'un user.
 * Remplace uploadBannerToCloudinary.
 * @param {string} fileUri - URI locale
 * @param {string} userId - UID Firebase Auth du user
 * @returns {Promise<string>} URL publique du banner
 */
export const uploadBanner = async (fileUri, userId) => {
  const path = `banners/${userId}_${Date.now()}.jpg`;
  return uploadImage(fileUri, path);
};
