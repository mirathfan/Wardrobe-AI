# Validation Report

Generated during the local audit on an Apple M4 Mac using Node v24.12.0.

| Command | Result | Notes |
| --- | --- | --- |
| `node benchmarks/run-benchmarks.cjs` | Passed | Wrote `benchmarks/results/benchmark-results.json` and `benchmarks/results/benchmark-report.md`. |
| `npx expo export --platform web --output-dir benchmarks/results/expo-web-export` | Passed | Exported 44 static routes; Expo reported the main web JS bundle as 4.89 MB raw. |
| `node benchmarks/bundle-size.cjs` | Passed | Wrote `benchmarks/results/bundle-size.json` and `benchmarks/results/bundle-size.md`; measured the main JS bundle as 4.67 MiB raw / 1.21 MiB gzip. |
| `npm run aura:eval` | Passed | `AURA intelligence eval: 66/66 passing`. |
| `npx tsc --noEmit` | Passed | No TypeScript errors reported. |
| `npm run lint` | Passed | No ESLint errors reported. |
| `npm run check:eas-env` | Failed locally | Required Firebase public env vars were not present in this shell, so the env validator correctly failed. |

The repository had pre-existing uncommitted changes before these benchmark artifacts were added. The audit did not modify app source files outside `benchmarks/`.
