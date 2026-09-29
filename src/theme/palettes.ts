// Dark palette matches the MYPitch User App exactly, for a consistent brand look.
export const darkColors = {
  background: '#020706',
  backgroundSoft: '#06120F',
  backgroundBlue: '#031018',

  card: '#0C1411',
  cardSoft: '#101C17',
  cardDark: '#07100D',

  blue: '#0087D8',
  blueLight: '#22AFFF',
  blueDeep: '#005F9E',
  blueSoft: 'rgba(0, 135, 216, 0.12)',
  blueGlow: 'rgba(0, 135, 216, 0.18)',

  green: '#26B94D',
  greenLight: '#64E85A',
  greenDeep: '#087A3F',
  greenSoft: 'rgba(38, 185, 77, 0.13)',
  greenGlow: 'rgba(38, 185, 77, 0.20)',

  neon: '#64E85A',
  neonLight: '#7CFF67',
  neonDeep: '#18A935',
  neonSoft: 'rgba(100, 232, 90, 0.13)',
  neonGlow: 'rgba(100, 232, 90, 0.20)',

  white: '#FFFFFF',
  offWhite: '#F5F7F3',
  grey: '#A8B0A8',
  greySoft: '#D7DED5',
  greyDark: '#6D766F',

  border: '#24302A',
  borderSoft: '#17211C',
  borderGreen: '#1E5132',
  borderBlue: '#10435F',

  red: '#FF453A',
  redSoft: 'rgba(255, 69, 58, 0.16)',

  yellow: '#FFD43B',
  yellowSoft: 'rgba(255, 212, 59, 0.16)',

  orange: '#FF9500',
  orangeSoft: 'rgba(255, 149, 0, 0.16)',

  pink: '#FF3B8D',
  pinkSoft: 'rgba(255, 59, 141, 0.16)',

  blackText: '#061006',

  // Shared "subtle inset" tokens used inline across screens.
  surfaceMuted: 'rgba(255,255,255,0.045)',
  neutralSoft: 'rgba(255,255,255,0.06)',

  backgroundGradient: ['#020706', '#031018', '#020706'] as readonly [string, string, string],
};

// Light palette mirrors every role in the dark palette, tuned for contrast on a light background.
export const lightColors: typeof darkColors = {
  background: '#F4F6F3',
  backgroundSoft: '#FFFFFF',
  backgroundBlue: '#EAF4FB',

  card: '#FFFFFF',
  cardSoft: '#F1F4F1',
  cardDark: '#E7ECE7',

  blue: '#0087D8',
  blueLight: '#0576B9',
  blueDeep: '#004E82',
  blueSoft: 'rgba(0, 135, 216, 0.10)',
  blueGlow: 'rgba(0, 135, 216, 0.14)',

  green: '#1E9B3D',
  greenLight: '#178A3B',
  greenDeep: '#0B6B2C',
  greenSoft: 'rgba(23, 138, 59, 0.10)',
  greenGlow: 'rgba(23, 138, 59, 0.14)',

  neon: '#178A3B',
  neonLight: '#0F7A31',
  neonDeep: '#0B6B2C',
  neonSoft: 'rgba(23, 138, 59, 0.10)',
  neonGlow: 'rgba(23, 138, 59, 0.14)',

  white: '#0B1410',
  offWhite: '#0B1410',
  grey: '#57615A',
  greySoft: '#3C443E',
  greyDark: '#9AA39C',

  border: '#DDE3DC',
  borderSoft: '#E7ECE6',
  borderGreen: '#BFE6C7',
  borderBlue: '#C3E2F5',

  red: '#D6362B',
  redSoft: 'rgba(214, 54, 43, 0.10)',

  yellow: '#A8790A',
  yellowSoft: 'rgba(168, 121, 10, 0.12)',

  orange: '#C96A0A',
  orangeSoft: 'rgba(201, 106, 10, 0.12)',

  pink: '#C81760',
  pinkSoft: 'rgba(200, 23, 96, 0.12)',

  blackText: '#061006',

  surfaceMuted: 'rgba(6, 16, 10, 0.035)',
  neutralSoft: 'rgba(6, 16, 10, 0.05)',

  backgroundGradient: ['#F4F6F3', '#EAF4FB', '#F4F6F3'] as readonly [string, string, string],
};

export type AppColors = typeof darkColors;

/** The compact desktop Agenda's Weekline palette. */
export const weeklineColors: AppColors = {
  ...darkColors,
  background: '#090F16',
  backgroundSoft: '#0D1620',
  card: '#101C27',
  cardSoft: '#14222E',
  cardDark: '#101C27',
  border: '#2A3C49',
  borderSoft: '#1B303D',
  white: '#F2F7F9',
  offWhite: '#F2F7F9',
  grey: '#A5B8C4',
  greySoft: '#C4D4DE',
  greyDark: '#7291A1',
  green: '#85C6F7',
  greenLight: '#85C6F7',
  greenSoft: '#1D3F58',
  neon: '#85C6F7',
  neonLight: '#85C6F7',
  neonSoft: '#1D3F58',
  blue: '#61BAFB',
  blueLight: '#61BAFB',
  blueSoft: '#18344A',
  orange: '#E9AE60',
  orangeSoft: '#3B3027',
  pink: '#E884AD',
  pinkSoft: '#382C3C',
  blackText: '#090F16',
  surfaceMuted: 'rgba(133,198,247,0.035)',
  backgroundGradient: ['#090F16', '#090F16', '#090F16'] as const,
};
