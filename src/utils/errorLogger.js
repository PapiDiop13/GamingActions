import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

// Traduit les codes d'erreur Firebase en messages lisibles
export function friendlyError(e) {
  const code = e?.code || '';
  const msg = e?.message || '';

  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use'))
    return 'This email is already registered. Try signing in instead.';
  if (code === 'auth/invalid-email' || msg.includes('invalid-email'))
    return 'Please enter a valid email address.';
  if (code === 'auth/weak-password' || msg.includes('weak-password'))
    return 'Password must be at least 6 characters.';
  if (code === 'auth/wrong-password' || msg.includes('wrong-password'))
    return 'Incorrect password. Please try again.';
  if (code === 'auth/user-not-found' || msg.includes('user-not-found'))
    return 'No account found with this email.';
  if (code === 'auth/too-many-requests' || msg.includes('too-many-requests'))
    return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'auth/network-request-failed' || msg.includes('network'))
    return 'Connection error. Check your internet and try again.';
  if (code === 'auth/user-disabled')
    return 'This account has been disabled. Contact support.';
  if (code === 'auth/requires-recent-login')
    return 'Please sign out and sign in again to complete this action.';
  if (msg.includes('storage') || msg.includes('upload'))
    return 'Upload failed. Please try again.';
  if (msg.includes('firestore') || msg.includes('permission'))
    return 'Something went wrong. Please try again.';

  return 'Something went wrong. Please try again.';
}

// Log une erreur dans Firestore pour l'admin panel
export async function logError(context, e, userId = null) {
  try {
    await addDoc(collection(db, 'errorLogs'), {
      context,
      code: e?.code || null,
      message: e?.message || String(e),
      userId: userId || null,
      createdAt: serverTimestamp(),
    });
  } catch (_) {
    // Silencieux — pas de boucle infinie si Firestore lui-même fail
  }
}
