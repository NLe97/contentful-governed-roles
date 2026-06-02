import { buildAuthorizeUrl } from "@/lib/contentful/oauth";

export default function Home() {
  const url = buildAuthorizeUrl({
    clientId: process.env.CF_OAUTH_CLIENT_ID ?? "",
    redirectUri: process.env.CF_OAUTH_REDIRECT_URI ?? "",
  });
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1>Contentful Governed Roles</h1>
      <p>Sign in with Contentful to manage governed roles and space members.</p>
      <a href={url}><button>Sign in with Contentful</button></a>
    </main>
  );
}
