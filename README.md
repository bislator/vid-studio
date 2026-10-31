# Vid Studio

Chrome MV3 extension: drives an open **meta.ai** tab to generate images + 10-second
9:16 clips in batches, with DeepSeek writing the prompts. Everything runs from the
side panel — no Telegram, no server.

Activation uses a local, offline unlock code (`VS-YYYYMMDD-XXXXXX`, expiry date
+ checksum, verified in-browser). This is a light lock against casual copying,
not real DRM.

## Repository layout

```
extension/    the unpacked Chrome extension (load this folder in chrome://extensions)
tools/        keygen.mjs (generate unlock codes), verify-license.mjs (CI smoke test)
.github/      build & release workflow
```

## Load locally

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `extension/`
3. Open the side panel, enter an unlock code

## Generate an unlock code

```bash
node tools/keygen.mjs                # expires in 1 month
node tools/keygen.mjs 2030-12-31     # explicit expiry date
```

## Build & release

Push a tag to trigger the workflow:

```bash
git tag v3.0.0 && git push origin v3.0.0
```

GitHub Actions zips `extension/` and attaches `vid-studio-<tag>.zip` to a GitHub
Release. The workflow also runs `tools/verify-license.mjs` against the packaged
copy on every push.

## Credits

Forked from an internal build of "Meta Video Studio" (v2.13.1); rebranded with a
new license scheme (prefix `VS-`, rotated secret) as **Vid Studio v3.0.0**.
