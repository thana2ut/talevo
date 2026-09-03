"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, background: "#f7f5ff", color: "#25164f", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }} role="alert">
          <section style={{ width: "min(100%, 520px)", boxSizing: "border-box", padding: 28, border: "1px solid #e2dcf7", borderRadius: 24, background: "#fff", boxShadow: "0 18px 50px rgba(69, 48, 130, .12)", textAlign: "center" }}>
            <strong style={{ color: "#6b47ed", letterSpacing: ".12em", fontSize: 12 }}>TALEVO</strong>
            <h1 style={{ margin: "12px 0 8px", fontSize: 28 }}>แอปเริ่มทำงานไม่สำเร็จ</h1>
            <p style={{ margin: "0 0 22px", color: "#6f6882", lineHeight: 1.65 }}>ข้อมูลของคุณยังไม่ได้ถูกลบ กรุณาลองเปิดแอปอีกครั้ง</p>
            <button type="button" onClick={retry} style={{ minWidth: 160, minHeight: 48, border: 0, borderRadius: 14, background: "#6b47ed", color: "#fff", font: "inherit", fontWeight: 800, cursor: "pointer" }}>ลองอีกครั้ง</button>
          </section>
        </main>
      </body>
    </html>
  );
}
