---
name: qr-code-and-camera-scanner
description: >-
  Guidance for generating printable QR codes and integrating browser-based
  webcam/camera QR scanners on localhost in Next.js App Router. Use when
  implementing document QR slip generation, print views, or camera-based QR
  scanning for document handoffs and tracking.
---

# QR Code Generation & Browser Camera Scanning

Use this skill when building QR code generation, printable routing slips, or live webcam/camera scanning in the Next.js prototype.

## 1. QR Code Payload & Generation

- **Keep payloads compact and opaque**: Encode a short tracking code or canonical path (e.g., `DOC-C1-2026-00482` or `/track/DOC-C1-2026-00482`) rather than raw PII or sensitive document contents.
- **Library choice**: Prefer lightweight client/SVG generators such as `qrcode` (for data URL / canvas / SVG) or `qrcode.react` (`QRCodeSVG`) for crisp print scaling.
- **Printability**:
  - Use error correction level `M` or `Q` (`level="M"` or `"Q"`) so slightly creased/smudged paper slips still scan reliably.
  - Always preserve a white quiet zone (`includeMargin` / `p-3 bg-white`) around the QR matrix.
  - Render the human-readable tracking code directly beneath the QR code in `font-mono` as a manual fallback.
  - Use `window.print()` with `print:hidden` on navigation/controls so staff can print slips directly from the browser.

## 2. Browser Camera Scanning on `localhost`

- **Secure Context**: Browsers allow `navigator.mediaDevices.getUserMedia()` on `https://` AND `http://localhost` (and `127.0.0.1`). If testing from a phone on the LAN IP, HTTPS is required—note this clearly if LAN testing is needed.
- **Client-Only Loading**: Camera APIs do not exist during SSR. Mark scanner components with `'use client'` and load browser-only scanner libraries (such as `html5-qrcode`) dynamically or inside `useEffect` to avoid Next.js SSR `window is not defined` errors.
- **Camera Selection**:
  - Default to `{ facingMode: "environment" }` on mobile devices, and fall back gracefully to the default laptop webcam on desktop `localhost`.
  - Allow switching cameras when `enumerateDevices()` returns multiple video inputs.
- **Lifecycle Cleanup**:
  - Always stop the scanner and release all `MediaStreamTrack` instances (`track.stop()`) in the `useEffect` cleanup and on unmount so the webcam indicator light turns off immediately.
- **Scan Deduplication & UX**:
  - Debounce/lock scans for 2–3 seconds (or pause the scanner after a valid read) so holding a QR slip in front of the webcam does not fire duplicate handoff mutations or audit log entries.
  - Validate the decoded payload format before triggering API calls.
  - Always provide a **Manual Tracking Code Input** alongside the camera view in case camera permissions are denied or no webcam is attached.

## Verification Checklist

- Confirm scanner component mounts without SSR/hydration warnings in Next.js App Router.
- Test permission-denied, no-camera, and valid-scan states; verify the webcam releases cleanly when navigating away.
- Test printing a QR slip via browser Print Preview and scanning the rendered QR code back in.
