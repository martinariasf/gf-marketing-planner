# viktor-skills — retired

This folder used to hold 5 markdown "skill specs" (`approvals`, `publishing`,
`ai-suggestions`, `sync-postiz-analytics`, `weekly-summary`). They were
**Phase-0 design specs that were never deployed** and did not reflect how the
running agent works. They were deleted 2026-07-02.

## Why they were dead weight

A running Hermes/Viktor agent loads **only** its `config.yaml` `agent.system_prompt`
at runtime. It does **not** mount or read `.md` skill files. So these specs:

- were never executed by any agent,
- duplicated behaviour that now lives canonically in the agent's `system_prompt`
  (write-contract, images/assets, carousel, approvals/publishing), and
- carried stale facts (old box IP `100.92.24.75`, `fitvibe-demo` slug,
  "Postiz shape — best guess") that misled anyone reading them.

## Where the real "standard Viktor" lives now

The canonical, deployable agent template is:

| Purpose | Path |
|---|---|
| **Production reference agent** | [`deploy-prod/gf-innov-agent/`](../../deploy-prod/gf-innov-agent/) — `config.yaml` (the brain), `Dockerfile`, `plugins/postiz/`, `patches/` |
| **Staging reference agent** | [`deploy-staging/staging-demo-agent/`](../../deploy-staging/staging-demo-agent/) |
| **Deployment playbook** | the `deploy-hermes-company-agent` skill (spin up / update / clone an agent under `/opt/agents/<slug>/`) |

To stand up a Viktor for a new company, follow the `deploy-hermes-company-agent`
skill and copy `deploy-prod/gf-innov-agent/` as the template — not this folder.
