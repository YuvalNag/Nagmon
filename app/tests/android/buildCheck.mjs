/**
 * The privacy and build rows of docs/app/SDD.md §10, checked on what the
 * apk job built: the merged manifest, the APK's files and every library
 * that goes into it (npm and Gradle).
 *
 * Usage (apk job, after assembleDebug):
 *   node tests/android/buildCheck.mjs MERGED_MANIFEST APK GRADLE_DEPS_TXT PACKAGE_LOCK
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export const PACKAGE = "org.nagmon.app";
export const TARGET_SDK = 36;

/**
 * Permissions the app may ask for. AndroidX declares its own
 * signature-only permission for receivers inside the app (no other app
 * can hold it, and it reaches no data); it is not a request to the user.
 */
export const ALLOWED_PERMISSIONS = ["android.permission.INTERNET", `${PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`];

/** Ads, analytics, tracking and crash-upload SDKs (npm names). */
const NPM_TRACKERS =
  /^(firebase|@firebase\/.*|@capacitor-firebase\/.*|@capacitor-community\/(admob|firebase-.*|facebook-login|apps-flyer)|@sentry\/.*|@datadog\/.*|@amplitude\/.*|amplitude-js|mixpanel(-browser)?|posthog-(js|node)|@segment\/.*|analytics-node|@bugsnag\/.*|@newrelic\/.*|newrelic|react-ga4?|@vercel\/analytics|onesignal.*|@onesignal\/.*|appsflyer.*|@hotjar\/.*|logrocket|@fullstory\/.*|@microsoft\/clarity|@microsoft\/applicationinsights-.*|@growthbook\/.*|@capawesome\/capacitor-(app-update|firebase.*)|@revenuecat\/.*|admob.*|google-analytics.*|@google-analytics\/.*)$/;

/** The same for Android libraries (Gradle group ids). */
const GRADLE_TRACKERS =
  /(com\.google\.firebase|com\.google\.android\.gms:play-services-(ads|analytics|measurement|tagmanager|ads-identifier)|com\.google\.android\.ump|com\.google\.ads|com\.crashlytics|com\.facebook\.|com\.appsflyer|com\.adjust\.|io\.sentry|com\.bugsnag|com\.amplitude|com\.mixpanel|com\.onesignal|com\.applovin|com\.unity3d\.ads|com\.ironsource|com\.datadoghq|com\.newrelic|io\.branch|com\.segment|com\.posthog|com\.microsoft\.appcenter|com\.yandex\.|com\.flurry|com\.chartboost|com\.vungle|com\.inmobi|com\.startapp|com\.kochava|com\.huawei\.hms)/;

const attr = (tag, name) => tag.match(new RegExp(`android:${name}="([^"]*)"`))?.[1];

/** The opening tags named `name` (`<name ...>`), comments left out. */
function tags(xml, name) {
  const clean = xml.replace(/<!--[\s\S]*?-->/g, "");
  return [...clean.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((m) => m[0]);
}

/** Problems with the merged manifest; [] when it is right. */
export function checkManifest(xml) {
  const problems = [];
  for (const tag of [...tags(xml, "uses-permission"), ...tags(xml, "uses-permission-sdk-23")]) {
    const name = attr(tag, "name");
    if (!ALLOWED_PERMISSIONS.includes(name)) problems.push(`asks for a permission: ${name}`);
  }
  const app = tags(xml, "application")[0] ?? "";
  if (attr(app, "allowBackup") !== "false") problems.push('allowBackup is not "false"');
  if (!attr(app, "dataExtractionRules")) problems.push("no dataExtractionRules (Android 12+ copies data to a new phone)");
  if (attr(app, "usesCleartextTraffic") !== "false") problems.push('usesCleartextTraffic is not "false"');
  if (attr(app, "networkSecurityConfig")) problems.push("a networkSecurityConfig (could allow plain http)");
  const sdk = tags(xml, "uses-sdk")[0] ?? "";
  const target = Number(attr(sdk, "targetSdkVersion"));
  if (target !== TARGET_SDK) problems.push(`targetSdkVersion ${target || "missing"}, not ${TARGET_SDK}`);
  // only the launcher opens from outside; anything else exported needs a system permission
  for (const kind of ["activity", "activity-alias", "service", "receiver", "provider"]) {
    for (const tag of tags(xml, kind)) {
      if (attr(tag, "exported") !== "true") continue;
      const name = attr(tag, "name");
      if (kind === "activity" && name === `${PACKAGE}.MainActivity`) continue;
      if (/^android\.permission\./.test(attr(tag, "permission") ?? "")) continue;
      problems.push(`exported ${kind} ${name} without a system permission`);
    }
  }
  return problems;
}

/** The npm packages in a package-lock.json (v2+). */
export function npmPackages(lockText) {
  const lock = JSON.parse(lockText);
  return Object.keys(lock.packages ?? {})
    .filter((p) => p.includes("node_modules/"))
    .map((p) => p.slice(p.lastIndexOf("node_modules/") + "node_modules/".length));
}

/** Problems with the libraries: any ads, analytics or tracking SDK. */
export function checkDependencies({ npm = [], gradle = "" }) {
  const problems = [];
  for (const name of new Set(npm)) if (NPM_TRACKERS.test(name)) problems.push(`npm: ${name}`);
  for (const line of gradle.split("\n")) {
    const m = line.match(GRADLE_TRACKERS);
    if (m) problems.push(`gradle: ${line.replace(/^[\s|+\\-]+/, "").trim()}`);
  }
  return problems;
}

/** 64-bit: native code, if any, is there for arm64 (the family's phone) and x86_64. */
export function checkNativeLibs(entries) {
  const abis = new Set(entries.map((e) => e.match(/^lib\/([^/]+)\/[^/]+\.so$/)?.[1]).filter(Boolean));
  if (!abis.size) return [];
  return ["arm64-v8a", "x86_64"].filter((abi) => !abis.has(abi)).map((abi) => `native code without ${abi} (found ${[...abis].join(", ")})`);
}

/** The files in an APK (a zip). */
function apkEntries(apk) {
  return execFileSync("unzip", ["-Z1", apk], { encoding: "utf8", maxBuffer: 64 << 20 }).split("\n").filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [manifest, apk, gradleDeps, lock] = process.argv.slice(2);
  let failed = false;
  const report = (what, problems) => {
    console.log(`${problems.length ? "FAIL" : "ok  "} ${what}`);
    for (const p of problems) console.log(`       ${p}`);
    failed ||= problems.length > 0;
  };
  report("merged manifest: INTERNET only, no backup, no plain http, targetSdk 36, nothing exported", checkManifest(readFileSync(manifest, "utf8")));
  report("no google-services.json (Firebase)", existsSync("android/app/google-services.json") ? ["android/app/google-services.json"] : []);
  report(
    "no ads, analytics or tracking SDK (npm and Gradle)",
    checkDependencies({ npm: npmPackages(readFileSync(lock, "utf8")), gradle: readFileSync(gradleDeps, "utf8") }),
  );
  const entries = apkEntries(apk);
  report(`64-bit native code (${entries.filter((e) => e.endsWith(".so")).length} .so files)`, checkNativeLibs(entries));
  if (failed) process.exit(1);
  console.log("build checks passed");
}
