// src/utils/moderation.js
// Modération basique : détection de mots interdits + log des récidivistes

import { collection, addDoc, serverTimestamp, doc, setDoc, increment, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

// Liste de mots interdits (insultes / contenu inapproprié) — FR + EN
// Volontairement partielle ; à enrichir côté admin si besoin.
const BANNED_WORDS = [
  // ─── Anglais — insultes courantes ───────────────────────────────────────────
  'fuck', 'fucking', 'fucker', 'fuckoff', 'fuk', 'fck',
  'shit', 'shitty', 'bullshit', 'bs',
  'bitch', 'biatch', 'btch',
  'asshole', 'ass', 'arse',
  'cunt', 'cnt',
  'dick', 'dik', 'dck',
  'cock', 'cok',
  'pussy', 'puss',
  'whore', 'wh0re',
  'slut', 'sl*t',
  'bastard', 'bstrd',
  'damn', 'dammit',
  'crap',
  'piss', 'pissoff',
  'twat',
  'wanker', 'wank',
  'moron', 'idiot', 'imbecile', 'dumbass', 'dumb',
  'stupid', 'loser', 'noob', 'nerd',
  'hate', 'hater',
  'kill', 'killurself', 'kys',
  'die', 'godie',

  // ─── Anglais — racisme / discrimination ─────────────────────────────────────
  'nigger', 'nigga', 'nig', 'n1gger', 'n1gga',
  'faggot', 'fag', 'f4ggot',
  'retard', 'ret4rd', 'retarded',
  'spic', 'sp1c',
  'chink', 'ch1nk',
  'gook',
  'kike',
  'wetback',
  'cracker',
  'redneck',
  'white trash',
  'raghead',
  'towelhead',
  'camel jockey',
  'jap',
  'spook',
  'coon',
  'porch monkey',
  'jungle bunny',
  'beaner',
  'halfbreed',

  // ─── Anglais — harcèlement / menaces ────────────────────────────────────────
  'trash', 'garbage', 'worthless',
  'ugly', 'fat', 'fatass', 'fat ass',
  'rape', 'raped', 'raping', 'rapist',
  'molest', 'pedophile', 'pedo',
  'terrorist', 'terror',
  'nazi', 'n4zi', 'hitler', 'h1tler',
  'suicide', 'suicidal',
  'selfharm', 'self-harm',

  // ─── Français — insultes courantes ──────────────────────────────────────────
  'putain', 'pute', 'p*te',
  'connard', 'conn*rd', 'conasse',
  'salope', 's*lope',
  'enculé', 'encule', 'enk',
  'merde', 'm*rde',
  'bâtard', 'batard', 'bat*rd',
  'pédé', 'pede', 'p*dé',
  'tapette',
  'nègre', 'negre', 'n*gre',
  'enfoire', 'enfoiré',
  'con', 'conne',
  'imbécile', 'imbecile',
  'crétin', 'cretin',
  'idiot', 'idiote',
  'abruti', 'abrutie',
  'débile', 'debile',
  'bouffon',
  'fdp', 'fils de pute', 'fils de p*te',
  'va te faire', 'vtff', 'vtf',
  'ferme ta gueule', 'ftg', 'ta gueule',
  'aller te faire foutre', 'atff',
  'ordure',
  'raclure',
  'déchet', 'dechet',
  'poubelle',
  'gros lard',
  'grosse vache',
  'boudin',
  'clochard', 'clodo',
  'bâtard', 'batard',
  'salopard',

  // ─── Français — racisme / discrimination ────────────────────────────────────
  'bamboula',
  'bougnoule',
  'bicot',
  'bounty',
  'bridé', 'bride',
  'chinetoque',
  'feuj',
  'gitan',
  'gouine',
  'gringo',
  'macaque',
  'melon',
  'renoi',
  'rital',
  'youpin',
  'zamel',

  // ─── Contenu sexuel explicite ────────────────────────────────────────────────
  'porn', 'porno', 'p0rn',
  'xxx',
  'nude', 'nudes',
  'naked', 'nak3d',
  'sex', 's3x',
  'sexy' ,
  'onlyfans', 'only fans',
  'nsfw',
  'masturbate', 'masturbation',
  'orgasm',
  'dildo',
  'vibrator',

  // ─── Spam / arnaque / phishing ───────────────────────────────────────────────
  'free robux', 'free vbucks', 'free coins',
  'click here', 'click link',
  'follow me for follow',
  'dm me', 'dm for',
  'buy now', 'limited offer',
  'earn money', 'make money fast',
  'casino', 'gambling',
  'bitcoin', 'crypto scam',
  'onlyfans.com',
  'telegram', 'whatsapp me',
];

// Mots interdits supplémentaires ajoutés via l'admin (chargés depuis Firestore)
let CUSTOM_BANNED = [];
let customLoaded = false;

// Charge la liste custom depuis app_config/banned_words (à appeler au démarrage)
export async function loadCustomBannedWords() {
  try {
    const snap = await getDoc(doc(db, 'app_config', 'banned_words'));
    if (snap.exists() && Array.isArray(snap.data().words)) {
      CUSTOM_BANNED = snap.data().words.map(w => (w || '').toLowerCase().trim()).filter(Boolean);
    }
    customLoaded = true;
  } catch (e) { customLoaded = true; }
}

function allBannedWords() {
  return [...BANNED_WORDS, ...CUSTOM_BANNED];
}

// Normalise (minuscule, retire accents et caractères de contournement basiques)
function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0@]/g, 'o')
    .replace(/[1!]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[\$5]/g, 's')
    .replace(/[4]/g, 'a');
}

// Retourne la liste des mots interdits trouvés dans un texte
export function findBannedWords(text) {
  const norm = normalize(text);
  return allBannedWords().filter(w => {
    const re = new RegExp(`\\b${w}\\b`, 'i');
    return re.test(norm);
  });
}

export function containsBannedWords(text) {
  return findBannedWords(text).length > 0;
}

// Masque les mots interdits avec des étoiles (garde la 1re lettre)
export function censorText(text) {
  if (!text) return text;
  let result = text;
  const norm = normalize(text);
  allBannedWords().forEach(w => {
    if (new RegExp(`\\b${w}\\b`, 'i').test(norm)) {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), (match) => {
        return match[0] + '*'.repeat(match.length - 1);
      });
    }
  });
  return result;
}

// Enregistre une infraction de modération et incrémente le compteur du user
export async function logModeration(userId, username, text, words) {
  if (!userId || words.length === 0) return;
  try {
    // Log de l'événement
    await addDoc(collection(db, 'moderation_logs'), {
      userId,
      username: username || 'Unknown',
      text: text.slice(0, 200),
      words,
      createdAt: serverTimestamp(),
    });
    // Compteur cumulé sur le user (pour repérer les récidivistes)
    const counterRef = doc(db, 'moderation_counters', userId);
    const snap = await getDoc(counterRef);
    if (snap.exists()) {
      await setDoc(counterRef, {
        username: username || 'Unknown',
        count: increment(words.length),
        lastAt: serverTimestamp(),
      }, { merge: true });
    } else {
      await setDoc(counterRef, {
        username: username || 'Unknown',
        count: words.length,
        lastAt: serverTimestamp(),
      });
    }
  } catch (e) {}
}
