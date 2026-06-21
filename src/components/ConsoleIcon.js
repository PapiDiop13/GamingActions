import React from 'react';
import { Ionicons } from '@expo/vector-icons';

// Icônes vectorielles génériques (aucun logo de marque déposée).
// La couleur fait l'association visuelle (bleu PS, vert Xbox, rouge Switch).
const CONSOLE_ICON_NAMES = {
  ps5: 'game-controller',
  ps4: 'game-controller',
  xbox: 'game-controller',
  switch: 'tablet-landscape-outline', // évoque la console portable
  pc: 'desktop-outline',
  mobile: 'phone-portrait-outline',
  all: 'apps-outline',
};

const CONSOLE_ICON_COLORS = {
  ps5: '#3E9BFF',
  ps4: '#3E9BFF',
  xbox: '#5BC236',
  switch: '#FF4554',
  pc: '#00D4FF',
  mobile: '#AAAABB',
  all: '#888899',
};

export default function ConsoleIcon({ id, size = 16, color, style }) {
  const key = id == null ? 'all' : id;
  return (
    <Ionicons
      name={CONSOLE_ICON_NAMES[key] || 'game-controller'}
      size={size}
      color={color || CONSOLE_ICON_COLORS[key] || '#888899'}
      style={style}
    />
  );
}

export { CONSOLE_ICON_NAMES, CONSOLE_ICON_COLORS };