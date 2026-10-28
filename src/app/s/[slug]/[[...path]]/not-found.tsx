export default function PublicSiteNotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui, sans-serif",
        padding: "2rem 1.5rem",
        textAlign: "center",
        color: "#111827",
        background: "#fafafa",
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 650, letterSpacing: "-0.02em" }}>Page not found</h1>
        <p style={{ margin: "0.6rem 0 0", color: "#6b7280", lineHeight: 1.5 }}>This website or page is not available.</p>
      </div>
    </main>
  );
}
