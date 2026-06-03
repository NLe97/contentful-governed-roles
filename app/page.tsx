import { buildAuthorizeUrl } from "@/lib/contentful/oauth";

export default function Home() {
  const url = buildAuthorizeUrl({
    clientId: process.env.CF_OAUTH_CLIENT_ID ?? "",
    redirectUri: process.env.CF_OAUTH_REDIRECT_URI ?? "",
  });
  return (
    <main className="container">
      <div className="app-header"><h1>Contentful Governance Console</h1></div>
      <section className="card">
        <h2>Sign in</h2>
        <p className="sub">Sign in with Contentful to manage governed roles and space members.</p>
        <a href={url}><button className="btn btn-primary">Sign in with Contentful</button></a>
      </section>
    </main>
  );
}
