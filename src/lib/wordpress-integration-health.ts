/** Validate destination capabilities without rewriting saved site settings. */
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
  if (data.profiles !== undefined) {
    if (!data.profiles || typeof data.profiles !== "object") throw new Error("wordpress_diagnostics_invalid");
    const profiles = Object.entries(data.profiles as Record<string, unknown>).map(([type, value]) => {
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
      return { type, ready: item.ready, restBase: item.restBase, category: category.restBase, tag: tag.restBase };
    });
    const selected = profiles.find((item) => item.restBase === configured.postType);
    if (!selected) issues.push("ชนิดโพสต์ที่ตั้งใน Project ไม่ตรงกับเว็บไซต์ปลายทาง");
    else {
      profile = { postType: selected.restBase, categoryRestBase: selected.category, tagRestBase: selected.tag };
      if (!selected.ready || !data.postTypes.includes(selected.type)) issues.push("โปรไฟล์เว็บไซต์ยังไม่พร้อมรับข้อมูล");
      if (selected.category !== configured.categoryRestBase) issues.push("หมวดหมู่ที่ตั้งใน Project ไม่ตรงกับเว็บไซต์ปลายทาง");
      if (selected.tag !== configured.tagRestBase) issues.push("แท็กที่ตั้งใน Project ไม่ตรงกับเว็บไซต์ปลายทาง");
    }
  } else {
    // Pre-1.3 plugins expose internal post types without REST bases.
    const internal = configured.postType === "posts" ? "post" : configured.postType;
    if (!data.postTypes.includes(internal)) issues.push("เว็บไซต์ไม่รองรับชนิดโพสต์ที่ตั้งไว้");
  }
  return { ready: issues.length === 0, version: data.version, issues, profile };
}
