# Mockup generators

These scripts write the Direction I and Stories artboards on the mockup canvas (https://claude.ai/artifact/7ZWWFemMUESwBoLiFsEk3i). They are the source for those screens, so a later change can be made here and republished instead of hand-editing HTML.

```sh
python3 gen_i.py <out-dir>        # I · Night List: Today (night and day), Games, Game Page
python3 gen_stories.py <out-dir>  # Stories: story row, three Move frames, Your Brief, share card
```

Logo URLs (`/_blob/...`) point at images stored in that canvas. All data in the mockups is example data. The real values come from the shared tokens (`packages/shared/design-tokens/tokens.json`); the mockups predate two small contrast fixes there (tertiary gray and day-mode secondary gray are slightly darker or lighter in the app).
