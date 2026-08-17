# Benchmarks

This folder contains local, reproducible measurement scripts for AURA.

## Run Performance Benchmarks

```sh
node benchmarks/run-benchmarks.cjs
```

Outputs:

- `benchmarks/results/benchmark-results.json`
- `benchmarks/results/benchmark-report.md`

The benchmark runner loads the real TypeScript modules for closet search,
outfit recommendation, wardrobe suggestions, and AURA stream parsing. It uses
deterministic synthetic wardrobe fixtures at 50, 100, 250, 500, 800, and 1,000
items. Firebase, React Native, Expo, and network dependencies are mocked so the
numbers isolate local algorithm/client parsing cost.

## Run Bundle Size Measurement

```sh
npx expo export --platform web --output-dir benchmarks/results/expo-web-export
node benchmarks/bundle-size.cjs
```

Outputs:

- `benchmarks/results/bundle-size.json`
- `benchmarks/results/bundle-size.md`

## Validation Commands

```sh
npm run aura:eval
npx tsc --noEmit
npm run lint
npm run check:eas-env
```

`check:eas-env` requires launch Firebase public env vars. It is expected to fail
when those variables are not present in the local shell.

## What These Benchmarks Do Not Measure

- Real deployed AURA/OpenAI first-token latency.
- Native image optimization/background removal duration on a physical device.
- Native FPS, JS thread frame drops, or simulator startup time.
- Production Firestore/Storage/network latency.

Those require a Firebase-authenticated test account, deployed functions, real
image fixtures, and a device/simulator profile.
