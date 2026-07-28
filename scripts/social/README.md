# Social image render targets

`assets/social/*` is rendered from these pages rather than drawn by hand, so the
link-preview card and the app icons cannot drift away from the real design: both
pages import the project's own `styles/theme.css` and instantiate the real
`Globe` class, so whatever the game looks like is what these produce.

Regenerate after any visual change:

```bash
python3 -m http.server 8000
# then, at the given viewport, screenshot the page and save as noted:
#   http://localhost:8000/scripts/social/og.html          1200x630 -> og.jpg (q82)
#   http://localhost:8000/scripts/social/icon.html         512x512 -> icon-512/192/180.png
#   http://localhost:8000/scripts/social/icon.html?safe    512x512 -> icon-maskable-512.png
```

Both pages set `window.__ogReady = true` once the land-cover texture has decoded
and the fonts are ready. Wait for it before capturing, or the globe renders with
its flat fallback colour.

`?safe` insets the globe to the central 80% for the maskable icon, which
platforms crop to a circle.

The card is JPEG because the globe is photographic: PNG came out at 1.2MB, and
palette-reducing it banded the ocean gradient. JPEG q82 is 67KB.
