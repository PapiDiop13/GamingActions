import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const SCREEN = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
};

export const FONTS = {
  sizes: {
    xs: 10, sm: 12, md: 14, lg: 16, xl: 18, xxl: 22, xxxl: 28, title: 34,
  },
  weights: {
    regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800', black: '900',
  },
};

export const SPACING = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const RADIUS = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, full: 999,
};