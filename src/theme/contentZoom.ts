import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * On a tablet the owner can slide the side navigation away; the page then
 * grows a little so it reads better. The growth is a CSS zoom on the page, so
 * anything sized from the window's height has to be divided by it.
 */
export const CONTENT_ZOOM_WHEN_FULL = 1.12;

export const ContentZoomContext = createContext(1);

export function useContentZoom() {
  return useContext(ContentZoomContext);
}

/** The window height in the page's own (zoomed) units. */
export function useViewportHeight() {
  const { height } = useWindowDimensions();
  return height / useContentZoom();
}
