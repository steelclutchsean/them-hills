# Art direction

Stylized painterly low-poly. A warm Firewatch palette: sunbaked ochre, manzanita, pine, creek teal, and a cream highlight. Surfaces are flat-shaded and textured. A face is a painted plane with a readable normal, not a smooth plastic shade and not a photograph.

The palette lives in `src/render/palette.ts`. New meshes use it. A visible mesh carries a painted map. The default white material, an untextured gray, and an untextured box are placeholders. The smoke audit fails the frame when one is on screen.

## Buildings

False fronts are separate buildings. Each one has its own silhouette (stepped, square, or arched parapet), its own width from 5 to 9 meters, and its own stain. The sign is a painted board with large cream letters on a dark field, facing the street. Windows have frames. Awnings and posts break the wall. The boardwalk is one deck on posts, with steps at the ends.

KayKit has no western or frontier building kit. Quaternius has no false-front set. Kenney's CC0 building kit is a generic modular shell, not a gold-rush street. The CC0 western packs that do exist are a Blender-only itch bundle and realistic facade bays whose signs are blank. None of them hold this palette, so the street is authored here from the inn board texture.

## Mountains

A ridgeline is solid geometry, one mesh, drawn from both sides so the crest does not open onto the sky. Rock texture on the faces. Snow and a tree band are functions of height and slope. Peaks keep that color; only the lower slopes fade into fog. The material is opaque and writes depth. No alpha, no cutout dither, no stacked cards.

## Characters

The hat is a child of the Head bone. Its box meets the head box. It is not parked a fixed distance above the bone origin.

## Props

Rocks use the painted rock map. A cube with a flat gray material does not stand in for a cliff, a crate, or a collider.
