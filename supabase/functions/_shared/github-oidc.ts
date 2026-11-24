// GitHub Actions OIDC check for functions the repo's own workflows call (D-074, D-078).
// No shared secret: the workflow sends the token GitHub signs for that run, and we verify
// it against GitHub's public keys, the repository, the branch and the workflow file.
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const REPO = "jerryvix/mgpanalytics";
const ALLOWED_REFS = new Set(["refs/heads/main", "refs/heads/claude/exciting-euler-w6d8uw"]);

/** null when the caller is the named workflow of this repo; otherwise why not. */
export async function verifyGithubWorkflow(req: Request, audience: string, workflowFile: string): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return "missing token";
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: "https://token.actions.githubusercontent.com", audience });
    if (payload.repository !== REPO) return "wrong repository";
    if (!ALLOWED_REFS.has(String(payload.ref))) return "branch not allowed";
    if (!String(payload.job_workflow_ref ?? "").startsWith(`${REPO}/.github/workflows/${workflowFile}@`)) return "wrong workflow";
    return null;
  } catch (e) {
    return `invalid token: ${(e as Error).message}`;
  }
}
