export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0d10",
        color: "#f5f7fa",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p
          style={{
            color: "#ff6a46",
            fontWeight: 800,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          Remote MCP
        </p>
        <h1 style={{ fontSize: 42, marginBottom: 12 }}>
          Bugcrowd MCP Server
        </h1>
        <p style={{ color: "#b7c0cb", fontSize: 18, lineHeight: 1.6 }}>
          ChatGPT-ready Bugcrowd API bridge with OAuth 2.1 authorization-code
          flow, PKCE, opaque access/refresh tokens, public engagement lookup,
          submission/program tools, and a full-fidelity API request tool.
        </p>

        <section
          style={{
            marginTop: 34,
            padding: 22,
            border: "1px solid #2b3139",
            borderRadius: 16,
            background: "#14181d",
          }}
        >
          <h2>MCP endpoint</h2>
          <code>/api/mcp</code>
          <h2>Health</h2>
          <code>/api/health</code>
          <h2>OAuth discovery</h2>
          <code>/.well-known/oauth-protected-resource</code>
          <br />
          <code>/.well-known/oauth-authorization-server</code>
        </section>

        <p style={{ color: "#8f9aa6", marginTop: 28, lineHeight: 1.6 }}>
          Unofficial community project. Bugcrowd API access remains subject to
          the permissions and eligibility of the connected Bugcrowd account.
        </p>
      </div>
    </main>
  );
}
