import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WordpressThemesManager } from "@/components/admin/WordpressThemesManager";
import type { Role } from "@/lib/permissions";

export default async function WpThemePage() {
  const session = await auth();
  const role = (session?.user?.role ?? "STAFF") as Role;

  const themes = (
    await prisma.wordpressTheme.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    })
  ).map((theme) => ({
    ...theme,
    createdAt: theme.createdAt.toISOString(),
    updatedAt: theme.updatedAt.toISOString(),
  }));

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">WordPress Themes</span>
        </h1>
        <p>จัดการแพ็กเกจธีม WordPress, รูปตัวอย่าง, เวอร์ชัน และ update manifest สำหรับเว็บปลายทาง</p>
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

      <WordpressThemesManager initialThemes={themes} role={role} />
    </section>
  );
}
