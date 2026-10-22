# Privacy Policy — Guangdong Chu Da Di (Android)

Last updated: 2026-10-22

## Summary

This game runs **entirely on your device**. It does not collect, transmit, or sell any personal data.

## What the app does NOT do

- **No network access for gameplay.** The game is a fully offline single-player card game; every opponent is a local rule-based AI.
- **No AI/LLM services.** All Large-Language-Model features of the upstream project (model downloads, WebGPU inference, LM Studio / OpenAI-compatible API connections, post-game review) have been removed from this build. There is no API key field, no endpoint configuration, and no prompt is ever sent anywhere.
- **No accounts, no login, no cloud sync.**
- **No analytics, no crash reporting, no advertising SDK, no tracking identifiers.**

## Data stored on your device

The app keeps a few preferences in local storage (Android `Preferences` / `localStorage`):

| Key | Purpose |
|---|---|
| `soundMode` / `musicVolume` | sound settings |
| `lang` | language choice |
| `ruleMode` | selected ruleset (mainland / Taiwan / Hong Kong) |
| `handLayoutMode` | hand row layout preference |

These values never leave the device and are deleted when you uninstall the app or clear its data.

## Permissions

The Android build requests only what Capacitor needs to run a web view; it does not request location, camera, microphone, contacts, SMS, storage-wide or phone-state permissions for gameplay.

## Children's privacy

No data is collected from anyone, including children.

## Changes

If a future version adds any online feature, this policy will be updated before release.

## Contact

Open an issue at <https://github.com/seagaruda/taiwan-big-two-ai>.

## License note

This app is a derivative of *Taiwan Big2 AI* by mesmerli, licensed under AGPL-3.0. This privacy policy covers the modified Android build distributed from the fork above.
