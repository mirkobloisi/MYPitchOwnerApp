import { useWindowDimensions } from 'react-native';

/**
 * Width at which the app switches to the desktop layout with a side rail.
 * An iPad (768 and up) gets exactly the desktop layout, just scaled down; only
 * phones get their own bottom-bar layout.
 */
export const DESKTOP_MIN_WIDTH = 768;
/** Kept for older imports: the smallest "roomier than a phone" width. */
export const TABLET_MIN_WIDTH = 768;
/** Width from which the desktop layout is shown at full size. */
export const FULL_DESKTOP_WIDTH = 1180;

/** How wide the desktop side navigation is at full size. */
export const SIDEBAR_WIDTH = 245;
/** The side navigation, scaled down on an iPad so the page keeps its room. */
export function sidebarWidthFor(width: number) {
  if (width >= FULL_DESKTOP_WIDTH) return SIDEBAR_WIDTH;
  if (width >= 1000) return 215;
  return 184;
}
/** Height reserved for the bottom bar on narrow screens. */
export const BOTTOM_BAR_HEIGHT = 64;

/** How wide the right-hand messages/notifications panel is. */
export const INBOX_WIDTH = 320;
/** Width at which there's room for the left nav and the right inbox panel without squeezing the page. */
export const INBOX_MIN_WIDTH = 1400;

/** Default reading width for content on a large screen. */
export const CONTENT_MAX_WIDTH = 900;
/** Wider ceiling for desktop screens that make good use of the workspace. */
export const WIDE_CONTENT_MAX_WIDTH = 1600;

export function useBreakpoint() {
  const { width } = useWindowDimensions();

  return {
    width,
    isDesktop: width >= DESKTOP_MIN_WIDTH,
    /** An iPad-sized window showing the scaled-down desktop layout. */
    isTablet: width >= DESKTOP_MIN_WIDTH && width < FULL_DESKTOP_WIDTH,
    /** A phone. */
    isPhone: width < DESKTOP_MIN_WIDTH,
    /** Anything roomier than a phone. */
    isWide: width >= TABLET_MIN_WIDTH,
    sidebarWidth: sidebarWidthFor(width),
    /** Room for the left nav and the right inbox panel at once. */
    hasInboxPanel: width >= INBOX_MIN_WIDTH,
  };
}
