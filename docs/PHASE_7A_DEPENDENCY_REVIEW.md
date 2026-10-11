# Phase 7A dependency advisory review

Read-only npm audit on 2026-10-11. No audit fix, package installation, overrides or dependency upgrades were performed during final review.

## Counts and interpretation

The fresh full report has **74 affected package entries: 1 critical, 57 high, 16 moderate, 0 low**. The earlier installer reported 76 (1 critical, 59 high, 16 moderate). Existing dependency versions are unchanged; the previous raw report is unavailable, so the two-entry difference cannot be attributed to fixes. Registry advisory results change over time. Propagated package entries are not independent vulnerabilities.

Nine entries are direct: seven production declarations (expo, expo-router, expo-sharing, expo-splash-screen, react-native, react-native-reanimated, react-native-worklets), two development declarations (jest, jest-expo). The other 65 are transitive. Lockfile node flags classify 70 entries as production-install-only, one mixed (brace-expansion), and three development-only (jest-environment-jsdom, jest-expo, jest-watch-typeahead). These flags do not prove runtime reachability: Expo/React Native production dependencies also install CLI, Metro and Jest tooling. A separate omit-dev audit reports 73 entries (1 critical, 56 high, 16 moderate); audit propagation and graph pruning differ from node-flag classification.

Fourteen entries have npm fixAvailable=true; 60 suggest a major-version route. Neither proves SDK 57 compatibility. Suggestions include Expo 44 downgrades, Jest 30, Router 58 and incompatible Worklets/Reanimated changes; none were applied. Compatible patch candidates must be checked against parent ranges, Expo compatibility and the complete regression/build suite under separate authorization.

## Critical finding and remediation priority

[shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv): installed 1.10.0 is affected; 1.11.0 is patched. npm explain identifies react-devtools-core as the parent with range ^1.6.1, which permits that patch. The flaw requires attacker-controlled quote tokens with a comment/line terminator to reach shell execution. Source inspection found React Native devtools initialized within __DEV__; no application auth/data path imports the quoting API or launches shell commands. No confirmed critical vulnerability on active production authentication/data access was found. This is not a declaration that developer tooling is safe: keep Metro/devtools private and prioritize a separately authorized patch/retest.

The [decode-uri-component advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) is a potentially runtime-reachable moderate denial of service through malformed router query input. It is not an authorization bypass, but needs compatible remediation review before production release. No vulnerability listed directly names the Supabase SDK or the new phone/UUID dependencies. That does not prove absence of all vulnerabilities.

## Root advisory applicability

| Package | Severity | Installed versions | Relevance | Remediation assessment |
|---|---|---|---|---|
| @xmldom/xmldom | high | 0.8.13, 0.9.10 | Android/config XML tooling; no customer XML ingestion. | npm non-major candidate; compatibility not yet verified. |
| baseline-browser-mapping | moderate | 2.10.43 | Build-time browser target data. | npm non-major candidate; compatibility not yet verified. |
| brace-expansion | high | 1.1.16, 5.0.7 | Build/test glob patterns; do not process untrusted patterns. | npm non-major candidate; compatibility not yet verified. |
| braces | high | 3.0.3 | Build/test glob patterns; high-severity DoS, not CRM contact parsing. | npm major route; not approved or proven compatible. |
| browserslist | high | 4.28.6 | Build target/config processing; untrusted custom statistics risk. | npm non-major candidate; compatibility not yet verified. |
| compression | high | 1.8.1 | Expo development server middleware; not the exported static client. | npm non-major candidate; compatibility not yet verified. |
| decode-uri-component | moderate | 0.2.2 | Router query parsing may receive hostile deep links; moderate runtime DoS is a release remediation gate. | npm major route; not approved or proven compatible. |
| image-size | high | 1.2.1 | Metro asset parsing; no persisted customer upload slice enabled. | npm non-major candidate; compatibility not yet verified. |
| js-yaml | high | 3.15.0, 4.3.0 | Configuration/test parsing; no customer YAML ingestion. | npm non-major candidate; compatibility not yet verified. |
| nanoid | high | 3.3.16 | Tool-generated identifiers; CRM command IDs use Expo Crypto instead. | npm non-major candidate; compatibility not yet verified. |
| node-forge | high | 1.4.0 | Expo developer certificates/signing tooling; not Supabase JWT verification. | npm major route; not approved or proven compatible. |
| postcss | moderate | 8.5.19 | CSS build processing; attacker-controlled sourcemaps require care. | npm non-major candidate; compatibility not yet verified. |
| shell-quote | critical | 1.10.0 | react-devtools-core shell command quoting; RN devtools initialization is __DEV__ guarded, not active production Auth/RPC. | 1.11.0 fits parent range; separate patch authorization required. |
| source-map-js | high | 1.2.1 | Build sourcemap parsing; malformed indexed maps may block the event loop. | npm non-major candidate; compatibility not yet verified. |
| sprintf-js | moderate | 1.0.3 | Tool/config formatting; not client-controlled CRM formatting. | npm non-major candidate; compatibility not yet verified. |
| uuid | moderate | 7.0.3 | Xcode tooling uses old UUID library; command IDs use Expo Crypto, not vulnerable buffered v3/v5/v6. | npm major route; not approved or proven compatible. |

## Complete affected-package inventory

Install class refers to lock metadata, not execution context. Direct manifest-dev declarations are marked separately. Advisory links belong to root findings; inherited findings name their dependency chain.

| Package | Version(s) | Severity | Direct/transitive | Install class | Root advisory / inherited via | npm remediation |
|---|---|---|---|---|---|---|
| @expo/cli | 57.0.8 | high | transitive | production-install | @expo/code-signing-certificates, @expo/config, @expo/config-plugins, @expo/inline-modules, @expo/metro, @expo/metro-config, @expo/prebuild-config, node-forge | expo 44.0.6 (major route) |
| @expo/code-signing-certificates | 0.0.6 | high | transitive | production-install | node-forge | expo 44.0.6 (major route) |
| @expo/config | 57.0.5 | moderate | transitive | production-install | @expo/config-plugins | expo 44.0.6 (major route) |
| @expo/config-plugins | 57.0.5 | moderate | transitive | production-install | xcode | expo 44.0.6 (major route) |
| @expo/inline-modules | 0.1.3 | moderate | transitive | production-install | @expo/config-plugins | expo 44.0.6 (major route) |
| @expo/local-build-cache-provider | 57.0.4 | moderate | transitive | production-install | @expo/config | expo 44.0.6 (major route) |
| @expo/metro | 56.0.0 | high | transitive | production-install | metro, metro-config, metro-file-map, metro-transform-worker | expo 44.0.6 (major route) |
| @expo/metro-config | 57.0.5 | high | transitive | production-install | @expo/config, @expo/metro | expo 44.0.6 (major route) |
| @expo/metro-file-map | 57.0.1 | high | transitive | production-install | micromatch | non-major candidate |
| @expo/prebuild-config | 57.0.7 | moderate | transitive | production-install | @expo/config, @expo/config-plugins | expo 44.0.6 (major route) |
| @jest/console | 29.7.0 | high | transitive | production-install | jest-message-util | jest 30.5.2 (major route) |
| @jest/core | 29.7.0 | high | transitive | production-install | @jest/console, @jest/reporters, @jest/test-result, @jest/transform, jest-config, jest-haste-map, jest-message-util, jest-resolve, jest-resolve-dependencies, jest-runner, jest-runtime, jest-snapshot, jest-watcher, micromatch | jest 30.5.2 (major route) |
| @jest/environment | 29.7.0 | high | transitive | production-install | @jest/fake-timers | jest 30.5.2 (major route) |
| @jest/expect | 29.7.0 | high | transitive | production-install | expect, jest-snapshot | jest 30.5.2 (major route) |
| @jest/fake-timers | 29.7.0 | high | transitive | production-install | jest-message-util | jest 30.5.2 (major route) |
| @jest/globals | 29.7.0 | high | transitive | production-install | @jest/environment, @jest/expect | jest 30.5.2 (major route) |
| @jest/reporters | 29.7.0 | high | transitive | production-install | @jest/console, @jest/test-result, @jest/transform, jest-message-util | jest 30.5.2 (major route) |
| @jest/test-result | 29.7.0 | high | transitive | production-install | @jest/console | jest 30.5.2 (major route) |
| @jest/test-sequencer | 29.7.0 | high | transitive | production-install | @jest/test-result, jest-haste-map | jest 30.5.2 (major route) |
| @jest/transform | 29.7.0 | high | transitive | production-install | jest-haste-map, micromatch | jest 30.5.2 (major route) |
| @react-native/community-cli-plugin | 0.86.0 | high | transitive | production-install | @react-native/metro-config, metro, metro-config | react-native 0.87.1 (major route) |
| @react-native/jest-preset | 0.86.0 | high | transitive | production-install | babel-jest, jest-environment-node | jest-expo 58.0.9 (major route) |
| @react-native/metro-config | 0.86.0 | high | transitive | production-install | metro-config | react-native 0.87.1 (major route) |
| @react-native/virtualized-lists | 0.86.0 | high | transitive | production-install | react-native | react-native 0.87.1 (major route) |
| @xmldom/xmldom | 0.8.13, 0.9.10 | high | transitive | production-install | [advisory](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6), [advisory](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6), [advisory](https://github.com/advisories/GHSA-6mj3-qw4j-hgrw), [advisory](https://github.com/advisories/GHSA-g53g-w8rj-fmg7), [advisory](https://github.com/advisories/GHSA-w2rr-34g9-rvrj), [advisory](https://github.com/advisories/GHSA-w2rr-34g9-rvrj), [advisory](https://github.com/advisories/GHSA-4w3w-2rp5-g8jm), [advisory](https://github.com/advisories/GHSA-4w3w-2rp5-g8jm), [advisory](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv), [advisory](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv), [advisory](https://github.com/advisories/GHSA-27p8-2357-5qqv), [advisory](https://github.com/advisories/GHSA-27p8-2357-5qqv), [advisory](https://github.com/advisories/GHSA-3px3-54cx-rmw9), [advisory](https://github.com/advisories/GHSA-vr34-hp96-76pp), [advisory](https://github.com/advisories/GHSA-6h8r-xr42-gp59), [advisory](https://github.com/advisories/GHSA-6h8r-xr42-gp59), [advisory](https://github.com/advisories/GHSA-8344-3jmq-59r6), [advisory](https://github.com/advisories/GHSA-8344-3jmq-59r6), [advisory](https://github.com/advisories/GHSA-x4fp-j954-r2f4), [advisory](https://github.com/advisories/GHSA-965w-775f-mr7g), [advisory](https://github.com/advisories/GHSA-965w-775f-mr7g), [advisory](https://github.com/advisories/GHSA-93r5-fhx6-vmg9), [advisory](https://github.com/advisories/GHSA-93r5-fhx6-vmg9) | non-major candidate |
| argparse | 1.0.10 | moderate | transitive | production-install | sprintf-js | non-major candidate |
| babel-jest | 29.7.0 | high | transitive | production-install | @jest/transform | jest 30.5.2 (major route) |
| baseline-browser-mapping | 2.10.43 | moderate | transitive | production-install | [advisory](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | non-major candidate |
| brace-expansion | 1.1.16, 5.0.7 | high | transitive | mixed | [advisory](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [advisory](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [advisory](https://github.com/advisories/GHSA-rgw5-rvv9-x895), [advisory](https://github.com/advisories/GHSA-rgw5-rvv9-x895), [advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [advisory](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), [advisory](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | non-major candidate |
| braces | 3.0.3 | high | transitive | production-install | [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | jest 30.5.2 (major route) |
| browserslist | 4.28.6 | high | transitive | production-install | [advisory](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [advisory](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | non-major candidate |
| compression | 1.8.1 | high | transitive | production-install | [advisory](https://github.com/advisories/GHSA-vc2v-76pw-4v95) | non-major candidate |
| create-jest | 29.7.0 | high | transitive | production-install | jest-config | jest 30.5.2 (major route) |
| decode-uri-component | 0.2.2 | moderate | transitive | production-install | [advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | expo-router 58.0.17 (major route) |
| expect | 29.7.0 | high | transitive | production-install | jest-message-util | jest 30.5.2 (major route) |
| expo | 57.0.6 | high | direct production | production-install | @expo/cli, @expo/config, @expo/config-plugins, @expo/local-build-cache-provider, @expo/metro, @expo/metro-config | expo 44.0.6 (major route) |
| expo-router | 57.0.6 | moderate | direct production | production-install | query-string | expo-router 58.0.17 (major route) |
| expo-sharing | 57.0.5 | moderate | direct production | production-install | @expo/config-plugins | expo-sharing 14.0.8 (major route) |
| expo-splash-screen | 57.0.4 | moderate | direct production | production-install | @expo/config-plugins | expo-splash-screen 55.0.25 (major route) |
| image-size | 1.2.1 | high | transitive | production-install | [advisory](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) | non-major candidate |
| jest | 29.7.0 | high | direct dev | production-install | @jest/core, jest-cli | jest 30.5.2 (major route) |
| jest-circus | 29.7.0 | high | transitive | production-install | @jest/environment, @jest/expect, @jest/test-result, jest-message-util, jest-runtime, jest-snapshot | jest 30.5.2 (major route) |
| jest-cli | 29.7.0 | high | transitive | production-install | @jest/core, @jest/test-result, create-jest, jest-config | jest 30.5.2 (major route) |
| jest-config | 29.7.0 | high | transitive | production-install | @jest/test-sequencer, babel-jest, jest-circus, jest-environment-node, jest-resolve, jest-runner, micromatch | jest 30.5.2 (major route) |
| jest-environment-jsdom | 29.7.0 | high | transitive | dev-only | @jest/environment, @jest/fake-timers | jest-expo 58.0.9 (major route) |
| jest-environment-node | 29.7.0 | high | transitive | production-install | @jest/environment, @jest/fake-timers | jest 30.5.2 (major route) |
| jest-expo | 57.0.2 | high | direct dev | dev-only | @jest/globals, @react-native/jest-preset, babel-jest, jest-environment-jsdom, jest-snapshot, jest-watch-typeahead | jest-expo 58.0.9 (major route) |
| jest-haste-map | 29.7.0 | high | transitive | production-install | micromatch | jest 30.5.2 (major route) |
| jest-message-util | 29.7.0 | high | transitive | production-install | micromatch | jest 30.5.2 (major route) |
| jest-resolve | 29.7.0 | high | transitive | production-install | jest-haste-map | jest 30.5.2 (major route) |
| jest-resolve-dependencies | 29.7.0 | high | transitive | production-install | jest-snapshot | jest 30.5.2 (major route) |
| jest-runner | 29.7.0 | high | transitive | production-install | @jest/console, @jest/environment, @jest/test-result, @jest/transform, jest-environment-node, jest-haste-map, jest-message-util, jest-resolve, jest-runtime, jest-watcher | jest 30.5.2 (major route) |
| jest-runtime | 29.7.0 | high | transitive | production-install | @jest/environment, @jest/fake-timers, @jest/globals, @jest/test-result, @jest/transform, jest-haste-map, jest-message-util, jest-resolve, jest-snapshot | jest 30.5.2 (major route) |
| jest-snapshot | 29.7.0 | high | transitive | production-install | @jest/transform, expect, jest-message-util | jest 30.5.2 (major route) |
| jest-watch-typeahead | 2.2.1 | high | transitive | dev-only | jest, jest-watcher | jest-expo 58.0.9 (major route) |
| jest-watcher | 29.7.0 | high | transitive | production-install | @jest/test-result | jest 30.5.2 (major route) |
| js-yaml | 3.15.0, 4.3.0 | high | transitive | production-install | [advisory](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj), [advisory](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj), [advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh), [advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh), argparse | non-major candidate |
| metro | 0.84.4 | high | transitive | production-install | metro-config, metro-file-map, metro-transform-worker | expo 44.0.6 (major route) |
| metro-config | 0.84.4 | high | transitive | production-install | metro | expo 44.0.6 (major route) |
| metro-file-map | 0.84.4 | high | transitive | production-install | micromatch | expo 44.0.6 (major route) |
| metro-transform-worker | 0.84.4 | high | transitive | production-install | metro | expo 44.0.6 (major route) |
| micromatch | 4.0.8 | high | transitive | production-install | braces | jest 30.5.2 (major route) |
| nanoid | 3.3.16 | high | transitive | production-install | [advisory](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | non-major candidate |
| node-forge | 1.4.0 | high | transitive | production-install | [advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | expo 44.0.6 (major route) |
| postcss | 8.5.19 | moderate | transitive | production-install | [advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | non-major candidate |
| query-string | 7.1.3 | moderate | transitive | production-install | decode-uri-component | expo-router 58.0.17 (major route) |
| react-native | 0.86.0 | high | direct production | production-install | @react-native/community-cli-plugin, @react-native/jest-preset, @react-native/virtualized-lists | react-native 0.87.1 (major route) |
| react-native-reanimated | 4.5.0 | high | direct production | production-install | react-native-worklets | react-native-reanimated 4.3.4 (major route) |
| react-native-worklets | 0.10.0 | high | direct production | production-install | @react-native/metro-config | react-native-worklets 0.7.4 (major route) |
| shell-quote | 1.10.0 | critical | transitive | production-install | [advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | non-major candidate |
| source-map-js | 1.2.1 | high | transitive | production-install | [advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | non-major candidate |
| sprintf-js | 1.0.3 | moderate | transitive | production-install | [advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | non-major candidate |
| uuid | 7.0.3 | moderate | transitive | production-install | [advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | expo 44.0.6 (major route) |
| xcode | 3.0.1 | moderate | transitive | production-install | uuid | expo 44.0.6 (major route) |

## Deferred remediation work

1. Review a minimal compatible shell-quote patch, then tooling and production bundle regressions.
2. Review safe router-decoder remediation/deep-link negative tests without an unapproved SDK major upgrade.
3. Triage remaining high DoS/build-parser findings with trusted-input boundaries and compatible patches; never expose development servers publicly.
4. Plan coordinated Expo/React Native/Jest updates only with owner approval and native acceptance testing. Re-run audit after remediation; do not claim the current release is vulnerability-free.
