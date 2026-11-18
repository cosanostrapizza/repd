import Link from "next/link";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(420px,.72fr)",
      }}
    >
      <section
        style={{
          background: "#18251f",
          color: "white",
          padding: "9vw 7vw",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Link href="/" className="brand">
          <span className="brand-mark">R</span>repd
        </Link>
        <div>
          <p className="eyebrow" style={{ color: "#d9ff63" }}>
            You create. We handle the rest.
          </p>
          <h1 style={{ fontSize: "clamp(44px,6vw,82px)", maxWidth: 700 }}>
            Your business manager, always on.
          </h1>
          <p style={{ color: "#bbc7c0", fontSize: 18, maxWidth: 600 }}>
            Bring order to inquiries, holds, client relationships, and the work
            that needs your attention.
          </p>
        </div>
        <p style={{ color: "#819087", fontSize: 12 }}>
          Built for independent creative businesses.
        </p>
      </section>
      <section style={{ display: "grid", placeItems: "center", padding: 30 }}>
        <div
          className="card card-pad"
          style={{ width: "min(100%,460px)", boxShadow: "var(--shadow)" }}
        >
          {children}
        </div>
      </section>
    </main>
  );
}
