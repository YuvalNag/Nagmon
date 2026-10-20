export const PACKAGE: string;
export const TARGET_SDK: number;
export const ALLOWED_PERMISSIONS: string[];
export function checkManifest(xml: string): string[];
export function npmPackages(lockText: string): string[];
export function checkDependencies(deps: { npm?: string[]; gradle?: string }): string[];
export function checkNativeLibs(entries: string[]): string[];
