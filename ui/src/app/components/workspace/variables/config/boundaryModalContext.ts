import { createContext, useContext } from 'react';

export interface BoundaryModalContextType {
  /** True inside the fullscreen editor: the boundary editors switch to their fill layout. */
  isFullScreen: boolean;
}

/** Tells the boundary editors whether they are rendered inside the fullscreen modal. */
export const BoundaryModalContext = createContext<BoundaryModalContextType>({ isFullScreen: false });

export const useBoundaryModalContext = () => useContext(BoundaryModalContext);
