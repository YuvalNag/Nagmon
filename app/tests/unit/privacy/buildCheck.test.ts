/**
 * The privacy and build checks (docs/app/SDD.md §10) on made-up
 * manifests, and the npm part on the app's real package-lock.json. The
 * apk job runs the same checks on the merged manifest, the APK and the
 * Gradle libraries (tests/android/buildCheck.mjs).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../../capacitor.config";
import { checkBackupRules, checkDependencies, checkManifest, checkNativeLibs, npmPackages } from "../../android/buildCheck.mjs";

const APP = join(__dirname, "..", "..", "..");

function manifest({ permissions = ["android.permission.INTERNET"], app = "", sdk = 36, extra = "" } = {}) {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="org.nagmon.app">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="${sdk}" />
    <!-- <uses-permission android:name="android.permission.CAMERA" /> a comment is not a request -->
    ${permissions.map((p) => `<uses-permission android:name="${p}" />`).join("\n    ")}
    <application
        android:allowBackup="false"
        android:fullBackupContent="false"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:usesCleartextTraffic="false" ${app}>
        <activity android:name="org.nagmon.app.MainActivity" android:exported="true" />
        <provider android:name="androidx.core.content.FileProvider" android:exported="false" />
        <receiver android:name="androidx.profileinstaller.ProfileInstallReceiver" android:exported="true"
            android:permission="android.permission.DUMP" />
        ${extra}
    </application>
</manifest>`;
}

describe("the merged manifest", () => {
  it("passes as the app builds it", () => {
    expect(checkManifest(manifest())).toEqual([]);
    expect(
      checkManifest(manifest({ permissions: ["android.permission.INTERNET", "org.nagmon.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"] })),
    ).toEqual([]);
  });

  it("fails on any other permission", () => {
    const xml = manifest({ permissions: ["android.permission.INTERNET", "android.permission.RECORD_AUDIO", "com.google.android.gms.permission.AD_ID"] });
    expect(checkManifest(xml)).toEqual([
      "asks for a permission: android.permission.RECORD_AUDIO",
      "asks for a permission: com.google.android.gms.permission.AD_ID",
    ]);
  });

  it("fails on backup, plain http and an old target", () => {
    const xml = manifest({ sdk: 35 })
      .replace('android:allowBackup="false"', 'android:allowBackup="true"')
      .replace('android:fullBackupContent="false"', "")
      .replace('android:usesCleartextTraffic="false"', "")
      .replace('android:dataExtractionRules="@xml/data_extraction_rules"', "");
    expect(checkManifest(xml)).toEqual([
      'allowBackup is not "false"',
      'fullBackupContent is not "false" (the backup of Android 6 to 11)',
      "no dataExtractionRules (Android 12+ copies data to a new phone)",
      'usesCleartextTraffic is not "false"',
      "targetSdkVersion 35, not 36",
    ]);
    expect(checkManifest(manifest({ app: 'android:networkSecurityConfig="@xml/net"' }))).toEqual([
      "a networkSecurityConfig (could allow plain http)",
    ]);
  });

  it("fails on AndroidX's emoji start-up (Play services' font provider)", () => {
    const xml = manifest({
      extra: '<provider android:name="androidx.startup.InitializationProvider" android:exported="false"><meta-data android:name="androidx.emoji2.text.EmojiCompatInitializer" android:value="androidx.startup" /></provider>',
    });
    expect(checkManifest(xml)).toEqual(["EmojiCompatInitializer: the app would depend on Play services' font provider"]);
  });

  it("fails on a component other apps can open", () => {
    const xml = manifest({ extra: '<service android:name="x.Tracker" android:exported="true" />' });
    expect(checkManifest(xml)).toEqual(["exported service x.Tracker without a system permission"]);
  });
});

describe("the backup rules", () => {
  const DOMAINS = ["root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"];
  const rules = (cloud = DOMAINS, transfer = DOMAINS, extra = "") => `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>${cloud.map((d) => `<exclude domain="${d}" path="." />`).join("")}${extra}</cloud-backup>
    <device-transfer>${transfer.map((d) => `<exclude domain="${d}" path="." />`).join("")}</device-transfer>
</data-extraction-rules>`;

  it("pass when every domain is left out of the backup and of a new phone", () => {
    expect(checkBackupRules(rules())).toEqual([]);
  });

  it("fail on a domain that is not left out, or on anything taken in", () => {
    expect(checkBackupRules(rules(DOMAINS.filter((d) => d !== "device_file")))).toEqual(["cloud-backup: device_file is not excluded"]);
    expect(checkBackupRules(rules(DOMAINS, DOMAINS.slice(1)))).toEqual(["device-transfer: root is not excluded"]);
    expect(checkBackupRules(rules(DOMAINS, DOMAINS, '<include domain="file" path="nagmon" />'))).toEqual([
      "cloud-backup: an include (file nagmon)",
    ]);
  });

  it("the app's own file passes", () => {
    expect(checkBackupRules(readFileSync(join(APP, "android/app/src/main/res/xml/data_extraction_rules.xml"), "utf8"))).toEqual([]);
  });
});

describe("the libraries", () => {
  it("finds ads, analytics and tracking SDKs", () => {
    const gradle = [
      "+--- androidx.appcompat:appcompat:1.7.1",
      "|    \\--- com.google.firebase:firebase-analytics:22.1.0",
      "\\--- com.google.android.gms:play-services-ads:23.0.0",
    ].join("\n");
    expect(checkDependencies({ npm: ["react", "@sentry/react", "posthog-js", "@capacitor/app"], gradle })).toEqual([
      "npm: @sentry/react",
      "npm: posthog-js",
      "gradle: com.google.firebase:firebase-analytics:22.1.0",
      "gradle: com.google.android.gms:play-services-ads:23.0.0",
    ]);
  });

  it("the app's npm packages have none", () => {
    const names = npmPackages(readFileSync(join(APP, "package-lock.json"), "utf8"));
    expect(names).toContain("react");
    expect(checkDependencies({ npm: names })).toEqual([]);
  });

  it("the Android project adds none, and has no Firebase config", () => {
    const gradle = ["android/build.gradle", "android/app/build.gradle", "android/variables.gradle"]
      .map((f) => readFileSync(join(APP, f), "utf8"))
      .join("\n")
      // the template's optional google-services plugin is applied only with a config file
      .replace(/^.*com\.google\.gms:google-services.*$/m, "");
    expect(checkDependencies({ gradle })).toEqual([]);
  });
});

describe("64-bit", () => {
  it("no native code is fine; native code must include arm64 and x86_64", () => {
    expect(checkNativeLibs(["classes.dex", "assets/public/index.html"])).toEqual([]);
    expect(checkNativeLibs(["lib/arm64-v8a/a.so", "lib/x86_64/a.so", "lib/armeabi-v7a/a.so"])).toEqual([]);
    expect(checkNativeLibs(["lib/armeabi-v7a/a.so"])).toEqual([
      "native code without arm64-v8a (found armeabi-v7a)",
      "native code without x86_64 (found armeabi-v7a)",
    ]);
  });
});

describe("the system log", () => {
  it("gets nothing from Capacitor: its debug logging prints every plugin call's data", () => {
    expect(config.loggingBehavior).toBe("none");
    expect(config.android?.loggingBehavior).toBeUndefined();
  });
});
