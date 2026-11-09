/** Validate destination capabilities and expose the profile selected in WordPress. */
export interface WordPressIntegrationHealth {
  ready: boolean;
  version: string;
  issues: string[];
  profile: { postType: string; categoryRestBase: string; tagRestBase: string } | null;
}

export function assessWordPressIntegration(
  raw: unknown,
  configured: { postType: string; categoryRestBase: string; tagRestBase: string },
): WordPressIntegrationHealth {
  if (!raw || typeof raw !== "object") throw new Error("wordpress_diagnostics_invalid");
  const data = raw as Record<string, unknown>;
  if (typeof data.ready !== "boolean" || typeof data.version !== "string" || !Array.isArray(data.postTypes) ||
      !data.postTypes.every((type) => typeof type === "string")) throw new Error("wordpress_diagnostics_invalid");
  const issues: string[] = [];
  if (!data.ready) issues.push("ปลั๊กอินยังลงทะเบียนข้อมูลวิดีโอไม่ครบ");
  let profile: WordPressIntegrationHealth["profile"] = null;

  const readProfile = (value: unknown, internalType?: string) => {
    if (!value || typeof value !== "object") throw new Error("wordpress_diagnostics_invalid");
    const item = value as Record<string, unknown>;
    if (typeof item.restBase !== "string" || typeof item.ready !== "boolean" || !item.taxonomies ||
        typeof item.taxonomies !== "object") throw new Error("wordpress_diagnostics_invalid");
    const taxonomies = item.taxonomies as Record<string, unknown>;
    const category = taxonomies.category as Record<string, unknown> | undefined;
    const tag = taxonomies.tag as Record<string, unknown> | undefined;
    if (!category || !tag || typeof category.restBase !== "string" || typeof tag.restBase !== "string") {
      throw new Error("wordpress_diagnostics_invalid");
    }
    return {
      internalType: typeof item.postType === "string" ? item.postType : internalType,
      ready: item.ready,
      postType: item.restBase,
      categoryRestBase: category.restBase,
      tagRestBase: tag.restBase,
    };
  };

  if (data.profiles !== undefined) {
    if (!data.profiles || typeof data.profiles !== "object") throw new Error("wordpress_diagnostics_invalid");
    const profiles = Object.entries(data.profiles as Record<string, unknown>).map(([type, value]) => readProfile(value, type));
    const active = data.profile !== undefined
      ? readProfile(data.profile)
      : profiles.find((item) => item.postType === configured.postType);
    if (!active) issues.push("เว็บไซต์ยังไม่ได้เลือกรูปแบบวิดีโอ");
    else {
      profile = { postType: active.postType, categoryRestBase: active.categoryRestBase, tagRestBase: active.tagRestBase };
      if (!active.ready || !active.internalType || !data.postTypes.includes(active.internalType)) {
        issues.push("รูปแบบวิดีโอใน AURUM Core ยังไม่พร้อมใช้งาน");
      }
    }
  } else {
    // Pre-1.3 plugins expose internal post types without REST bases.
    const internal = configured.postType === "posts" ? "post" : configured.postType;
    if (!data.postTypes.includes(internal)) issues.push("เว็บไซต์ไม่รองรับชนิดโพสต์ที่ตั้งไว้");
  }
  return { ready: issues.length === 0, version: data.version, issues, profile };
}
