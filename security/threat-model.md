# thr8 repository security context

Status: draft — requires human review
Source snapshot: baseline `b887c47b39e97997e1814610caab2606fe34339e` plus the proposed Claude security-context enhancement
Human reviewer/date: not yet reviewed
Scope: Action orchestration, source collection, threat generation/validation, report generation and GitHub remediation; plugin instructions
Coverage limitations: source inspection and mocked integration tests only; no live Anthropic assessment, enterprise deployment inspection or remediation verification

## Assets and business priorities

- Repository source, feature requirements and security context can contain confidential company information. Sending them to Claude is a data-processing boundary.
- Assessment integrity matters: failed or partial analysis must not be interpreted as a clean security review.
- GitHub credentials grant optional authority to create issues, branches, commits and fix PRs. Application integrity depends on controlling that authority and reviewing fixes.
- Threat decisions must retain human ownership, evidence and rationale across changes.

## Actors and entry points

Observed: the Action receives an Anthropic API key, feature/context paths, Git refs and optional GitHub write credentials (`src/index.js:12–35`, `action.yml`). Repository contributors control source and may supply feature/context documents. The scanner sends collected source to Claude (`src/agents/codebase-scanner.js:167–173`); the generator sends context, source and reference patterns (`src/agents/threat-generator.js`, `generate`).

Inferred: contributors can influence analysis through code/comments or context documents even when they cannot access the Action's secrets. CI permissions and fork behavior depend on the caller workflow, not this package alone.

## Trust boundaries and controls

| Crossing | Observed control and scope | Remaining uncertainty |
| --- | --- | --- |
| Repository files → inference service | Context files must resolve inside the repository and meet size/nonempty constraints (`src/security/review-context.js:8–17`); source excludes symlinks and has explicit budgets (`src/agents/codebase-scanner.js`, `_collectFiles`/`_readFiles`) | Which company repositories/data classes may be sent to Anthropic? |
| Model JSON → assessment/report | Required collections, risk levels, links and derived counts are validated (`src/security/validate-model.js:3–61`). Change reviews check exact source quotes/locations and require abuse-test proposals | Valid source quotes do not prove a threat's interpretation; general repository mode does not require the richer change-review evidence fields |
| Partial scan → GitHub writes | Coverage omissions mark the assessment incomplete and gate remediation (`src/index.js:54–66`, `src/index.js:88–101`) | Scanner scope limits remain; completeness is not exhaustive detection |
| Generated fix → repository | Remediation is opt-in and low-confidence fixes are skipped (`src/agents/remediator.js:47–68`). GitHub API commits full generated file content and opens a PR (`src/github/pull-requests.js:101–139`) | Existing fix generation does not independently verify security outcomes, constrain all generated paths or test resulting code |
| Draft assumptions → reviewed decisions | Plugin commands preserve reviewed decisions and propose transitions (`plugins/thr8/skills/threat-model/SKILL.md`, `plugins/thr8/skills/review/SKILL.md`) | Markdown review status is a team convention, not an enforced approval service |

## Authentication and authorization

Observed: the Action uses the caller-provided GitHub token through Octokit (`src/agents/remediator.js:40–45`). There is no application-user authentication surface in this package; the relevant authorization comes from GitHub workflow permissions and token scope. The analysis-only workflow can use `contents: read`; writes require explicit remediation options and an available token. Caller workflow review remains essential.

## Sensitive data and review priorities

Prioritize accidental source/context disclosure, prompt-induced unsupported security claims, false-clean assessments and generated changes exceeding the intended fix. Preserve distinctions between inspected controls, inference and missing deployment facts. Do not mark a path mitigated merely because a recommendation or fix PR exists.

## Assumptions and open questions

| ID | Assumption/question | Basis | Status | Reviewer/date |
| --- | --- | --- | --- | --- |
| CTX-01 | Is Anthropic processing approved for the repository's source and security decisions? | Source is sent to the service | open | none |
| CTX-02 | Which caller workflows receive write tokens, and can untrusted contributions execute with those credentials? | Credential/permission policy lives in caller workflow | open | none |
| CTX-03 | Who approves accepted risks and closes mitigated paths? | Plugin uses a versioned human-reviewed ledger | open | none |

## Threat decisions (proposals)

| Stable ID | Asset/boundary and attack path | State | Required outcome / proposed negative test | Evidence | Human reviewer/date | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| THR8-ASSESS-01 | Missing source or invalid model response is interpreted as a clean assessment | draft | Preserve failed/incomplete status and block remediation; simulate failed scan, malformed output and truncated source | `src/index.js:54–66`; `tests/index.test.js` | none | New validation/gating addresses this path within stated scanner scope; not yet independently assessed |
| THR8-WRITE-01 | A generated fix changes unintended repository content using the write token | draft | Review generated paths and changes against approved scope and verify the negative test before merge | `src/github/pull-requests.js:101–139`; `src/agents/remediator.js:219–228` | none | Opt-in PR creation does not prove a fix is safe or correct |
| THR8-SOURCE-01 | Confidential repository/context content crosses an unapproved processing boundary | draft | Confirm approved data classes/provider access before enabling the Action or plugin on company code | `src/agents/codebase-scanner.js:167–173`; `src/agents/threat-generator.js`, `generate` | none | Deployment/business policy remains unknown |

These are challengeable draft decisions, not confirmed vulnerability reports or accepted risks. Reuse their IDs when reviewing the same paths; propose mitigated/reopened/accepted transitions with current evidence and a human decision.
