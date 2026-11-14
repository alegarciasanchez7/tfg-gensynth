import { lazy, Suspense, type ComponentProps } from 'react';
import { Skeleton } from '../../../ui/skeleton';

// The point editors bring Leaflet, the maps and the 2D/3D canvases with them: they are loaded
// in their own chunk the first time a point variable is opened, not at start-up
const PointConfigPanelChunk = lazy(() =>
  import('./PointConfigPanel').then((module) => ({ default: module.PointConfigPanel })),
);
const SpatialBoundariesTabChunk = lazy(() =>
  import('./SpatialBoundariesTab').then((module) => ({ default: module.SpatialBoundariesTab })),
);

/** Placeholder shown while the chunk of a point editor loads (it is bundled, so only briefly). */
function PointEditorFallback() {
  return <Skeleton className="h-40 w-full" aria-busy="true" aria-label="Loading editor" />;
}

/** {@link PointConfigPanel}, loaded on first use. */
export function LazyPointConfigPanel(props: Readonly<ComponentProps<typeof PointConfigPanelChunk>>) {
  return (
    <Suspense fallback={<PointEditorFallback />}>
      <PointConfigPanelChunk {...props} />
    </Suspense>
  );
}

/** {@link SpatialBoundariesTab}, loaded on first use. */
export function LazySpatialBoundariesTab(props: Readonly<ComponentProps<typeof SpatialBoundariesTabChunk>>) {
  return (
    <Suspense fallback={<PointEditorFallback />}>
      <SpatialBoundariesTabChunk {...props} />
    </Suspense>
  );
}
