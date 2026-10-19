"use client";

import { useState } from "react";
import type { Role } from "@/lib/permissions";
import { WordpressThemesManager } from "@/components/admin/WordpressThemesManager";
import { WordpressPluginsManager, type PluginRow } from "@/components/admin/WordpressPluginsManager";

interface ThemeRow {
  id: string; name: string; slug: string; version: string; description: string | null; packageUrl: string;
  packageSize: number | null; screenshotUrl: string | null; changelog: string | null; isActive: boolean;
  updatedAt: string; createdBy: { name: string | null; email: string } | null;
}

export function WordpressAssetsManager({ initialThemes, initialPlugins, role }: { initialThemes: ThemeRow[]; initialPlugins: PluginRow[]; role: Role }) {
  const [tab, setTab] = useState<"plugins" | "themes">("plugins");
  return <div className="wp-assets-manager">
    <div className="wp-assets-tabs" role="tablist" aria-label="WordPress assets">
      <button type="button" role="tab" aria-selected={tab === "plugins"} className={tab === "plugins" ? "active" : ""} onClick={() => setTab("plugins")}>Plugins <b>{initialPlugins.length}</b></button>
      <button type="button" role="tab" aria-selected={tab === "themes"} className={tab === "themes" ? "active" : ""} onClick={() => setTab("themes")}>Themes <b>{initialThemes.length}</b></button>
    </div>
    <div role="tabpanel" hidden={tab !== "plugins"}><WordpressPluginsManager initialPlugins={initialPlugins} role={role} /></div>
    <div role="tabpanel" hidden={tab !== "themes"}><WordpressThemesManager initialThemes={initialThemes} role={role} /></div>
  </div>;
}
