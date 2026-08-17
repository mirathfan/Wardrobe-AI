# AURA Performance Benchmark Report

Generated: 2026-05-25T04:13:51.408Z

## Environment

| key |value |
| --- |--- |
| measuredAt |2026-05-25T04:13:51.408Z |
| node |v24.12.0 |
| platform |darwin |
| arch |arm64 |
| cpuCount |10 |
| cpuModel |Apple M4 |
| repoRoot |/Users/athfan/wardrobe-ai/closet |
| benchmarkMode |Node.js microbenchmarks with deterministic synthetic closet datasets; Firebase, React Native, Expo, and network dependencies mocked unless explicitly noted. |

## Recommendation Latency

Server-side candidate engine: `functions/src/shared/outfitEngine.ts::generateOutfitCandidates`.

| items |p50Ms |p95Ms |meanMs |maxMs |result |eligible |fallback |
| --- |--- |--- |--- |--- |--- |--- |--- |
| 50 |693.813 |804.457 |720.088 |804.457 |5 |47 | |
| 100 |991.391 |1409.632 |1092.292 |1409.632 |5 |94 | |
| 250 |965.515 |1223.244 |1020.719 |1223.244 |5 |236 | |
| 500 |938.447 |996.583 |958.083 |996.583 |5 |473 | |
| 800 |910.376 |951.446 |923.129 |951.446 |5 |757 | |
| 1000 |925.385 |940.543 |932.964 |940.543 |5 |947 | |

Client fallback generator: `src/lib/outfitGenerator.ts::generateOutfits`.

| items |p50Ms |p95Ms |meanMs |maxMs |result |eligible |fallback |
| --- |--- |--- |--- |--- |--- |--- |--- |
| 50 |790.209 |807.938 |763.196 |807.938 |5 | | |
| 100 |811.883 |1065.952 |845.852 |1065.952 |5 | | |
| 250 |815.135 |836.554 |820.866 |836.554 |5 | | |
| 500 |933.356 |980.898 |942.936 |980.898 |5 | | |
| 800 |1072.419 |1136.839 |1090.734 |1136.839 |5 | | |
| 1000 |1158.724 |1161.863 |1160.294 |1161.863 |5 | | |

Wardrobe gap suggestions: `src/lib/wardrobeSuggestions.ts::buildWardrobeSuggestions`.

| items |p50Ms |p95Ms |meanMs |maxMs |result |
| --- |--- |--- |--- |--- |--- |
| 50 |0.074 |0.188 |0.104 |0.422 |0 |
| 100 |0.14 |0.377 |0.175 |1.098 |0 |
| 250 |0.304 |0.7 |0.388 |1.127 |0 |
| 500 |0.576 |1.276 |0.682 |1.418 |0 |
| 800 |0.913 |1.399 |0.984 |1.5 |0 |
| 1000 |1.133 |1.858 |1.229 |2.171 |0 |

## Closet/Search Latency

| items |p50Ms |p95Ms |meanMs |maxMs |result |
| --- |--- |--- |--- |--- |--- |
| 50 |0.073 |0.09 |0.077 |0.282 |9 |
| 100 |0.145 |0.176 |0.15 |0.242 |16 |
| 250 |0.353 |0.476 |0.377 |0.888 |20 |
| 500 |0.717 |0.884 |0.748 |1.808 |30 |
| 800 |1.148 |1.311 |1.173 |1.464 |40 |
| 1000 |1.438 |1.584 |1.456 |1.733 |47 |

Individual closet operations:

| operation |items |p50Ms |p95Ms |meanMs |maxMs |result |
| --- |--- |--- |--- |--- |--- |--- |
| rankSearchItems |50 |0.085 |0.123 |0.091 |0.17 |4 |
| sortItemsRecentlyAdded |50 |0.001 |0.004 |0.003 |0.065 |50 |
| buildSections |50 |0.066 |0.101 |0.074 |0.266 |6 |
| buildRowsFromSections |50 |0.066 |0.084 |0.069 |0.11 |39 |
| rankSearchItems |100 |0.138 |0.175 |0.151 |0.385 |8 |
| sortItemsRecentlyAdded |100 |0.001 |0.002 |0.002 |0.011 |100 |
| buildSections |100 |0.123 |0.241 |0.14 |0.382 |6 |
| buildRowsFromSections |100 |0.121 |0.15 |0.128 |0.383 |64 |
| rankSearchItems |250 |0.331 |0.406 |0.341 |0.545 |18 |
| sortItemsRecentlyAdded |250 |0.002 |0.003 |0.002 |0.017 |250 |
| buildSections |250 |0.292 |0.359 |0.304 |0.486 |6 |
| buildRowsFromSections |250 |0.299 |0.354 |0.307 |0.497 |139 |
| rankSearchItems |500 |0.655 |0.82 |0.678 |1.028 |36 |
| sortItemsRecentlyAdded |500 |0.004 |0.004 |0.004 |0.005 |500 |
| buildSections |500 |0.572 |0.67 |0.585 |0.769 |6 |
| buildRowsFromSections |500 |0.579 |0.699 |0.6 |0.851 |264 |
| rankSearchItems |800 |1.058 |1.226 |1.082 |1.283 |58 |
| sortItemsRecentlyAdded |800 |0.007 |0.007 |0.007 |0.008 |800 |
| buildSections |800 |0.918 |1.6 |0.992 |1.713 |6 |
| buildRowsFromSections |800 |0.929 |1.102 |0.954 |1.173 |412 |
| rankSearchItems |1000 |1.331 |1.573 |1.432 |4.568 |72 |
| sortItemsRecentlyAdded |1000 |0.009 |0.027 |0.013 |0.038 |1000 |
| buildSections |1000 |1.148 |1.325 |1.174 |1.395 |6 |
| buildRowsFromSections |1000 |1.161 |1.371 |1.191 |1.547 |512 |

## Synthetic Streaming Client Timing

Measured `src/lib/aura.ts::askAuraStream` client-side stream parsing against an in-process synthetic `ReadableStream`; this does not include deployed Cloud Function, OpenAI, Firebase Auth, or public internet latency.

| scenario |chunkDelayMs |firstVisibleP50Ms |deltaIntervalP50Ms |finalCallbackP50Ms |resolvedP50Ms |
| --- |--- |--- |--- |--- |--- |
| micro_delta_25ms |25 |163.412 |26.176 |235.81 |235.975 |
| single_large_delta_smoothed |25 |368.682 |35.174 |685.967 |685.996 |

## Static Architecture And Reliability Audit

| metric |value |
| --- |--- |
| totalSourceFiles |321 |
| tsFiles |320 |
| tsxFiles |143 |
| jsFiles |0 |
| swiftFiles |1 |
| typescriptSharePct |100 |
| srcComponentTsxFiles |83 |
| hookFiles |18 |
| appRouteFiles |34 |
| libServiceFiles |59 |
| cloudFunctionSourceFiles |55 |
| exportedFirebaseFunctions |15 |

| metric |value |
| --- |--- |
| accessibilityLabelOccurrences |49 |
| accessibilityRoleOccurrences |46 |
| interactiveComponentOccurrences |224 |
| keyboardAwareOccurrences |32 |
| activityIndicatorOccurrences |36 |
| skeletonOccurrences |0 |
| emptyStateOccurrences |23 |
| errorRetryOccurrences |1415 |
| fallbackOccurrences |195 |
| timeoutAbortOccurrences |85 |
| tryCatchBlocks |335 |
| catchBlocks |334 |
| onSnapshotOccurrences |12 |
| writeBatchOccurrences |15 |
| useMemoOccurrences |220 |
| useCallbackOccurrences |287 |
| reactMemoOccurrences |73 |
| flatListOccurrences |21 |
| reducedMotionOccurrences |72 |
| rateLimitedEndpointTypes |8 |

### Largest Files

| file |loc |asyncCount |awaitCount |tryCount |catchCount |
| --- |--- |--- |--- |--- |--- |
| app/(tabs)/ai.tsx |3560 |16 |79 |13 |11 |
| src/addItem/hooks/usePhotoStep.ts |3380 |21 |57 |16 |16 |
| functions/src/ingestItemFromPhotos.ts |2905 |10 |42 |10 |7 |
| app/(tabs)/closet.tsx |2835 |20 |35 |12 |17 |
| functions/src/shared/productLinkExtractor.ts |2558 |6 |14 |14 |13 |
| functions/src/askAuraStream.ts |1938 |3 |22 |13 |13 |
| app/(tabs)/item/[id].tsx |1872 |8 |7 |9 |9 |
| functions/src/shared/outfitEngine.ts |1809 |2 |2 |1 |1 |
| src/components/aura/AuraLookCard.tsx |1798 |0 |0 |0 |0 |
| src/profile/screens.tsx |1789 |18 |30 |6 |12 |
| src/addItem/hooks/useItemExtraction.ts |1780 |5 |7 |5 |4 |
| src/lib/auraAttachments.ts |1607 |14 |26 |12 |14 |

### Async Complexity Hotspots

| file |asyncSignal |asyncCount |awaitCount |tryCount |catchCount |loc |
| --- |--- |--- |--- |--- |--- |--- |
| app/(tabs)/ai.tsx |119 |16 |79 |13 |11 |3560 |
| src/addItem/hooks/usePhotoStep.ts |110 |21 |57 |16 |16 |3380 |
| app/(tabs)/closet.tsx |84 |20 |35 |12 |17 |2835 |
| functions/src/ingestItemFromPhotos.ts |69 |10 |42 |10 |7 |2905 |
| src/lib/aura.ts |68 |13 |29 |12 |14 |988 |
| src/profile/screens.tsx |66 |18 |30 |6 |12 |1789 |
| src/lib/auraAttachments.ts |66 |14 |26 |12 |14 |1607 |
| app/(tabs)/calendar.tsx |57 |17 |24 |7 |9 |1296 |
| functions/src/askAuraStream.ts |51 |3 |22 |13 |13 |1938 |
| functions/src/extractOutfitItems.ts |48 |10 |24 |7 |7 |1173 |
| functions/src/shared/productLinkExtractor.ts |47 |6 |14 |14 |13 |2558 |
| src/lib/localChatCache.ts |42 |11 |17 |7 |7 |297 |

## Methodology Notes

- Recommendation and closet/search latency are measured with deterministic synthetic wardrobe datasets at 50, 100, 250, 500, 800, and 1,000 items.
- Timings use `performance.now()` in Node and report min, p50, mean, p75, p95, and max after warmup iterations.
- Firebase, React Native, Expo, and network dependencies are mocked for pure function benchmarks so the measured values isolate local ranking/search/client parsing logic.
- Upload/image optimization duration and native rendering FPS were not measured in this Node benchmark because Expo native modules and device rendering require a simulator/device profile.
- Synthetic streaming numbers validate client parser/callback responsiveness, not real model first-token latency.
