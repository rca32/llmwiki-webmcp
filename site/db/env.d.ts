declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    BOOTSTRAP_OWNER_EMAIL?: string;
    PUBLIC_DEMO_AUTO_ONBOARD?: string;
  }
}
