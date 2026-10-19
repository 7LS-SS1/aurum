import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WordpressAssetsManager } from "@/components/admin/WordpressAssetsManager";
import type { Role } from "@/lib/permissions";

export default async function WpThemePage() {
  const session = await auth();
  const role = (session?.user?.role ?? "STAFF") as Role;

  const [themeRows, pluginRows] = await Promise.all([
    prisma.wordpressTheme.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    }),
    prisma.wordpressPlugin.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  const themes = themeRows.map((theme) => ({
    ...theme,
    createdAt: theme.createdAt.toISOString(),
    updatedAt: theme.updatedAt.toISOString(),
  }));
  const plugins = pluginRows.map((plugin) => ({
    ...plugin,
    createdAt: plugin.createdAt.toISOString(),
    updatedAt: plugin.updatedAt.toISOString(),
  }));

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">WordPress Assets</span>
        </h1>
        <p>ดาวน์โหลดและจัดการ Plugin กับ Theme ที่ผ่านการตรวจสอบสำหรับเว็บไซต์ปลายทาง</p>
      </div>

      {/* <div className="panel">
        <div className="panel-head">
          <h3>Default AURUM Theme</h3>
          <span className="sub">built from repository</span>
        </div>
        <div className="content-themes-panel">
          <div className="about-theme">
            <p className="hint">
              ปุ่มนี้ยังคง zip ธีม <code>wordpress-theme/aurum-video</code> จาก source ปัจจุบัน
              เหมาะสำหรับดาวน์โหลดเวอร์ชัน built-in หรือใช้เป็นไฟล์ต้นทางเพื่ออัปโหลดเข้าระบบจัดการธีมด้านล่าง
            </p>
            <a className="btn btn-gold" href="/api/wp-theme/download" style={{ display: "inline-flex", width: "fit-content" }}>
              ดาวน์โหลด aurum-video.zip
            </a>
          </div>
          <div className="theme-preview">
            <div className="theme-preview-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="theme-preview-screen">
              <div className="theme-preview-ui">
                <div className="theme-preview-nav">
                  <strong>AURUM VIDEO</strong>
                  <span>Home</span>
                  <span>Genres</span>
                  <span>Search</span>
                </div>
                <div className="theme-preview-hero">
                  <span />
                </div>
                <div className="theme-preview-grid">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div> */}

      <WordpressAssetsManager initialThemes={themes} initialPlugins={plugins} role={role} />
    </section>
  );
}
