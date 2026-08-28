# GF-122b — Does the English attachments block cause the mid-reply language switch?

**Date:** 2026-08-28
**Branch:** `claude/gf-122b-attachment-block-language`
**Verdict:** **Not reproduced.** 4 controlled trials, 2 agents, 0 language switches.

## The hypothesis

`buildAgentInput()` in `deploy-staging/api/src/routes/chat.ts` appends a
synthetic `--- ATTACHMENTS ---` block to the *same* `input` string as the
user's typed message whenever a turn carries attachments. Its prose was
hardcoded English for every client; `lang` (from `resolveClientLang(slug)`)
was only ever applied to chat.ts's own non-LLM fallback and error copy.

Every agent's system prompt opens with, verbatim:

> LANGUAGE RULE (top priority, overrides everything below): Detect the
> language of the latest user message and write your ENTIRE reply in that
> SAME language.

So the proposed mechanism was: short Spanish message + 4 images ⇒ the "latest
user message" is mostly, and trailing-ly, English ⇒ the reply flips to English
part-way through. That is what the Black Venture Farm dashboard chat did on
2026-08-26 at 16:00:17, on the one turn of that conversation carrying real
attachments (4 images, job `k0bj2ll93r4awb7`).

## What was run

Runs were POSTed straight at each agent's `/v1/runs`, from the box, over the
`marketing-planner_default` docker network, with a throwaway
`X-Hermes-Session-Key` per run and `no guardes nada` in every message so no
client dashboard was written to. Conditions, held within each message:

| | block appended |
|---|---|
| **A** control | none |
| **B** current | the English block, exactly as prod ships it |
| **C** | a fully-Spanish block (header, labels and prose) |
| **D** proposed | English structural markers, Spanish prose |

Round 1 (BVF, 1 image, long Spanish message, A/B/C × 3): all Spanish. It also
established that re-sending an identical `input` returns a **byte-identical**
reply, so repeating an identical condition buys no information — later rounds
vary the message instead.

Round 2 (BVF, 4 images, short Spanish message): all Spanish.

Round 3 (biomas, 4 images, short Spanish message): all Spanish.

Round 4 (biomas, 4 images, **real fetchable** asset URLs, A/B/D × 2 messages,
`/tmp/gf122b-real-results.json` on the box): all Spanish. Scoring each reply
for English function words (`the|and|with|for|this|that|your|from|are|is|of|
to|it`) gives **0 hits in all six replies**, including both B replies.

## Why biomas, and the fact that changes the original reading

Black Venture Farm's `config.yaml` gained a paragraph *explaining* the
attachments block — "the attachment already has a public URL, given to you
right above in the `--- ATTACHMENTS ---` block as `IMAGE: <url>`" — on
**2026-08-26 at 19:45**, as part of GF-120. The incident was at **16:00** the
same day. The prompt that produced the switch therefore had **no mention of
the block at all**, and rounds 1–2 tested a prompt the incident never ran
under.

`biomas/config.yaml` still has zero mentions of the block (so does
`gf-innov/config.yaml`; only `staging-demo` carries the full "CHAT
ATTACHMENTS (GF-68)" section). It is otherwise a match: same model
`moonshotai/kimi-k3`, same verbatim LANGUAGE RULE, Spanish fallback. Rounds 3
and 4 used it as a stand-in for the pre-incident BVF prompt. Still no switch.

## Conclusion

The English block is a real defect on its own terms — it injects English prose
into a Spanish or German client's turn for no reason, and every agent's
language rule keys on that turn — but it is a **latent hazard, not a
demonstrated cause**. The 2026-08-26 switch remains unexplained; whatever
triggered it needs something these four trials did not have (the real
conversation history, the real images, or plain nondeterminism on that run).

The accompanying commit localizes the block's prose anyway, as hazard removal.
It must not be described in review as "the fix for the GF-122 language switch".

## Follow-ups this turned up (not done here)

1. `biomas` and `gf-innov` have **no** attachments section in their system
   prompts, so neither knows what the `--- ATTACHMENTS ---` block is or that
   an image URL in it can be used as-is. BVF only got that on 2026-08-26 and
   `staging-demo` has had it since GF-68. Worth levelling up — an agent-config
   change on the box, not a change in this repo.
2. Hermes evicts run records quickly: `GET /v1/runs/{id}` returned 404 for two
   runs whose polling loop had given up minutes earlier. Anything that needs a
   run's output has to stay attached to it.
