/**
 * useGuestGuard — bloque les actions en mode visiteur
 *
 * Usage:
 *   const guestGuard = useGuestGuard(navigation);
 *   <TouchableOpacity onPress={() => guestGuard(() => doAction())} />
 *
 * Si l'user est guest → Alert "Créer un compte" avec bouton Sign Up
 * Sinon → exécute l'action normalement
 */
import { Alert } from 'react-native';
import useAuthStore from '../store/useAuthStore';

export default function useGuestGuard(navigation) {
  const isGuest     = useAuthStore((s) => s.isGuest);
  const exitGuest   = useAuthStore((s) => s.exitGuestMode);

  return (action) => {
    if (!isGuest) { action?.(); return; }
    Alert.alert(
      'Rejoins Gaming Actions 🎮',
      'Crée un compte gratuit pour GG, commenter, uploader tes clips et bien plus.',
      [
        { text: 'Pas maintenant', style: 'cancel' },
        {
          text: 'Créer un compte',
          onPress: () => {
            exitGuest();
            navigation?.navigate('Auth');
          },
        },
      ]
    );
  };
}
