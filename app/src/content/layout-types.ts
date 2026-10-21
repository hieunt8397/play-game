// Screen layout types (Story 1.4, AD-10). Every coordinate comes from a Blender render
// (`npm run render -- <screen>` → src/content/generated/<screen>.layout.json); none is hand-typed.

/** A design-space point (1× px, origin top-left, y down). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * `<screen>.layout.json` v1. Ids follow the Blender object names `<kind>.<id>`
 * (`anchor.pizza` → `anchors.pizza`). Hit polygons are the final tap areas (already padded by
 * `Tokens.spacing.hitPad`); runtime adds no further padding.
 */
export interface ScreenLayout {
  readonly v: 1;
  readonly screenId: string;
  readonly design: { readonly width: number; readonly height: number };
  /** Render px per design px (the images are rendered at 2×). */
  readonly renderScale: number;
  readonly anchors: Readonly<Record<string, Point>>;
  readonly hits: Readonly<Record<string, readonly Point[]>>;
  readonly slots: Readonly<Record<string, Point>>;
  readonly paths: Readonly<Record<string, readonly Point[]>>;
}
