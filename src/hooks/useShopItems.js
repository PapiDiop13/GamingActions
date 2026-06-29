/**
 * useShopItems.js (Mobile — React Native / Expo)
 * Reads shop items from Firestore shop_items collection.
 * Falls back to local JS constants if Firestore empty/unreachable.
 *
 * Usage:
 *   const { shopData, loading } = useShopItems();
 *   shopData.avatar_frames  → array
 *   shopData.backgrounds    → array
 *   etc.
 */

import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { FRAMES, VIDEO_FRAMES, COMMENT_FRAMES } from '../constants/frames';
import {
  PROFILE_BACKGROUNDS, PROFILE_BANNERS, USERNAME_EFFECTS,
  PROFILE_BADGES, CARD_BORDERS, PROFILE_THEMES,
} from '../constants/cosmetics';

function buildLocalShopData() {
  const toDoc = (item, category, itemType) => ({
    ...item,
    category,
    itemType,
    active: true,
    dollarsPrice: item.dollarsPrice || null,
    pointsPrice: item.pointsPrice || 0,
  });

  return {
    avatar_frames: FRAMES.filter(f => !f.exclusive).map(f => toDoc(f, 'avatar_frame', 'avatar_frame')).sort((a, b) => (a.pointsPrice || 0) - (b.pointsPrice || 0)),
    video_frames: VIDEO_FRAMES.filter(f => !f.exclusive).map(f => toDoc(f, 'video_frame', 'video_frame')).sort((a, b) => (a.pointsPrice || 0) - (b.pointsPrice || 0)),
    comment_frames: COMMENT_FRAMES.filter(f => !f.exclusive).map(f => toDoc(f, 'comment_frame', 'comment_frame')).sort((a, b) => (a.pointsPrice || 0) - (b.pointsPrice || 0)),
    backgrounds: PROFILE_BACKGROUNDS.map(i => toDoc(i, 'background', 'cosmetic')),
    banners: PROFILE_BANNERS.map(i => toDoc(i, 'banner', 'cosmetic')),
    badges: PROFILE_BADGES.map(i => toDoc(i, 'badge', 'cosmetic')),
    username_effects: USERNAME_EFFECTS.map(i => toDoc(i, 'username_effect', 'cosmetic')),
    card_borders: CARD_BORDERS.map(i => toDoc(i, 'card_border', 'cosmetic')),
    themes: PROFILE_THEMES.map(i => toDoc(i, 'theme', 'theme')),
  };
}

function groupItems(docs) {
  const g = { avatar_frames: [], video_frames: [], comment_frames: [], backgrounds: [], banners: [], badges: [], username_effects: [], card_borders: [], themes: [] };
  for (const doc of docs) {
    switch (doc.category) {
      case 'avatar_frame':    g.avatar_frames.push(doc); break;
      case 'video_frame':     g.video_frames.push(doc); break;
      case 'comment_frame':   g.comment_frames.push(doc); break;
      case 'background':      g.backgrounds.push(doc); break;
      case 'banner':          g.banners.push(doc); break;
      case 'badge':           g.badges.push(doc); break;
      case 'username_effect': g.username_effects.push(doc); break;
      case 'card_border':     g.card_borders.push(doc); break;
      case 'theme':           g.themes.push(doc); break;
    }
  }
  g.avatar_frames.sort((a, b) => (a.order ?? a.pointsPrice ?? 0) - (b.order ?? b.pointsPrice ?? 0));
  g.video_frames.sort((a, b) => (a.order ?? a.pointsPrice ?? 0) - (b.order ?? b.pointsPrice ?? 0));
  g.comment_frames.sort((a, b) => (a.order ?? a.pointsPrice ?? 0) - (b.order ?? b.pointsPrice ?? 0));
  return g;
}

export function useShopItems() {
  const [shopData, setShopData] = useState(() => buildLocalShopData());
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    try {
      const q = query(collection(db, 'shop_items'), where('active', '==', true));
      const unsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            const fsDocs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            const fsIds  = new Set(fsDocs.map(d => d.id));
            // Merge: Firestore items + any local items not yet in Firestore
            const local  = buildLocalShopData();
            const merged = groupItems([
              ...fsDocs,
              ...local.avatar_frames.filter(i => !fsIds.has(i.id)),
              ...local.video_frames.filter(i => !fsIds.has(i.id)),
              ...local.comment_frames.filter(i => !fsIds.has(i.id)),
              ...local.backgrounds.filter(i => !fsIds.has(i.id)),
              ...local.banners.filter(i => !fsIds.has(i.id)),
              ...local.badges.filter(i => !fsIds.has(i.id)),
              ...local.username_effects.filter(i => !fsIds.has(i.id)),
              ...local.card_borders.filter(i => !fsIds.has(i.id)),
              ...local.themes.filter(i => !fsIds.has(i.id)),
            ]);
            setShopData(merged);
          }
          setLoading(false);
        },
        (err) => {
          console.warn('[useShopItems] Firestore error, using local fallback:', err.message);
          setLoading(false);
        }
      );
      return () => unsub();
    } catch (err) {
      console.warn('[useShopItems] Failed:', err.message);
      setLoading(false);
    }
  }, []);

  return { shopData, loading };
}
