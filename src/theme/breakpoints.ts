import { useWindowDimensions } from 'react-native';

/** Width at which the app switches to a desktop layout with a side rail. */
export const DESKTOP_MIN_WIDTH = 1024;
/** Width at which a tablet gets roomier layouts but keeps the bottom bar. */
export const TABLET_MIN_WIDTH = 768;

/** How wide the desktop side navigation is. */
export const SIDEBAR_WIDTH = 236;
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
    isTablet: width >= TABLET_MIN_WIDTH && width < DESKTOP_MIN_WIDTH,
    /** Anything roomier than a phone. */
    isWide: width >= TABLET_MIN_WIDTH,
    /** Room for the left nav and the right inbox panel at once. */
    hasInboxPanel: width >= INBOX_MIN_WIDTH,
  };
}
