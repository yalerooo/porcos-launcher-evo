export interface ParsedVersion {
  mcVersion: string;
  loader?: string;
  loaderVersion?: string;
}

/**
 * Parses compound version strings in either format:
 * - "1.20.1 (Fabric 0.14.22)" → { mcVersion: "1.20.1", loader: "Fabric", loaderVersion: "0.14.22" }
 * - "1.20.1-fabric-0.14.22"   → { mcVersion: "1.20.1", loader: "Fabric", loaderVersion: "0.14.22" }
 * - "1.20.1"                  → { mcVersion: "1.20.1" }
 * - "26.1"                    → { mcVersion: "26.1" }
 */
export function parseVersion(version: string): ParsedVersion {
  // Format: "1.20.1 (Fabric 0.14.22)"
  const parenMatch = version.match(/^(.*) \((.*) (.*)\)$/);
  if (parenMatch) {
    return {
      mcVersion: parenMatch[1],
      loader: parenMatch[2],
      loaderVersion: parenMatch[3],
    };
  }

  // Format: "1.20.1-fabric-0.14.22"
  const parts = version.split('-');
  if (parts.length >= 3) {
    return {
      mcVersion: parts[0],
      loader: parts[1].charAt(0).toUpperCase() + parts[1].slice(1),
      loaderVersion: parts.slice(2).join('-'),
    };
  }

  return { mcVersion: version };
}

export function formatVersion(parsed: ParsedVersion): string {
  if (parsed.loader && parsed.loaderVersion) {
    return `${parsed.mcVersion} (${parsed.loader} ${parsed.loaderVersion})`;
  }
  return parsed.mcVersion;
}

export function getLoaderDisplay(version: string): string {
  const parsed = parseVersion(version);
  if (parsed.loader && parsed.loaderVersion) {
    return `${parsed.loader} ${parsed.loaderVersion}`;
  }
  return "Vanilla";
}
