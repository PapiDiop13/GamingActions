// src/utils/navigationRef.js
// Ref globale pour naviguer depuis n'importe où dans l'app,
// même depuis un Stack imbriqué vers un Tab parent.
// Pattern officiel React Navigation :
// https://reactnavigation.org/docs/navigating-without-navigation-prop/
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function globalNavigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}
