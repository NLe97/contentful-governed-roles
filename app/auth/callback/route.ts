import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  const html = `<!doctype html><script>
    const h = new URLSearchParams(location.hash.slice(1));
    const t = h.get('access_token');
    if (t) { document.cookie = 'cf_user_token=' + t + '; path=/; samesite=lax'; location.replace('/demo'); }
    else { document.body.textContent = 'Login failed'; }
  </script>`;
  return new NextResponse(html, { headers: { "content-type": "text/html" } });
}
