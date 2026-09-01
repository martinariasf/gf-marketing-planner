# Postiz self-host — Meta + LinkedIn app review pack

**Date:** 2026-08-05
**Goal:** get `postiz.gfinnov.com` able to publish to Facebook Pages, Instagram and LinkedIn on behalf of client accounts, so GF can stop paying per-channel on Postiz cloud and move to one Postiz organisation per client.

**Decisions locked:**
- Instagram via the **Facebook Business flow** (one Meta app covers Facebook Pages + Instagram).
- Round one is **LinkedIn + Meta only**. TikTok audit and X pay-per-use come later.

**Timeline:** both reviews run in parallel. Meta is the long pole at 4–8 weeks including rejection rounds. LinkedIn is 2–4 weeks across its two tiers.

---

## 0. Blockers to clear before you can submit

These are not optional. Each one is an independent rejection cause.

### 0.1 Reviewer cannot sign up — this blocks the whole submission

`DISABLE_REGISTRATION=true` on the Postiz instance, and there is exactly one user. Meta's reviewers do **not** explore your app on their own, and the flow you record must work for a fresh reviewer with a test account — a flow they cannot replicate is treated as unverifiable.

So you must hand them working credentials:

1. Create a dedicated Postiz organisation named `Meta App Review` with its own user.
2. Because registration is disabled, create it via the Postiz admin path rather than the signup form — or temporarily flip `DISABLE_REGISTRATION=false`, register, then flip it back and redeploy.
3. Do the same for `LinkedIn App Review`.
4. Put those credentials in both submission forms.

Keep these accounts alive until approval lands. Reviewers come back.

### 0.2 Meta Business Verification

Advanced Access cannot be granted until GF Innovative Solutions is verified in Meta Business Manager. This is a **separate process from App Review** and a common independent rejection point. Start it first — it gates everything else.

You will need: legal entity name, registered address, and a business document (Handelsregisterauszug works) matching them exactly.

### 0.3 Privacy policy and Impressum

There is a `privacy.html` in the landing page repo, but I could not find an Impressum. Both reviewers check the privacy URL resolves and covers what you actually do with the data. A German company also needs an Impressum by law.

Before submitting, confirm:
- [ ] The privacy policy is publicly reachable at a stable URL (put it in the Meta app's Privacy Policy URL field)
- [ ] It explicitly states that GF stores social account access tokens and publishes content on the client's behalf
- [ ] An Impressum exists and is linked

### 0.4 Postiz configuration

```
FACEBOOK_APP_ID="..."
FACEBOOK_APP_SECRET="..."
```

Redirect URIs to register on the Meta app — **both**, same app:
```
https://postiz.gfinnov.com/integrations/social/facebook
https://postiz.gfinnov.com/integrations/social/instagram
```

LinkedIn, also both:
```
https://postiz.gfinnov.com/integrations/social/linkedin
https://postiz.gfinnov.com/integrations/social/linkedin-page
```

Restart the containers after changing env — Postiz reads these at boot.

### 0.5 Say up front that you run Postiz

Reviewers will land on a UI that is visibly the open-source Postiz product on your domain. Do not let them discover this and wonder. State it plainly in the use case description (copy below already does). Self-hosting AGPL software under your own domain is entirely legitimate; looking like you're hiding it is what causes trouble.

---

## 1. Meta app review

### 1.1 App setup

- Create the app at Meta for Developers under the **GF Innovative Solutions business portfolio**
- App type: **Other** → **Business**
- App name: **GF Marketing Planner** — this is what clients see on the OAuth consent screen, so it should be your brand, not "Postiz"
- Add the **Facebook Login for Business** product
- Add both redirect URIs from 0.4

### 1.2 Permissions to request — the lean set

Meta rejects permissions for features that aren't built yet, even if you plan to add them. Your analytics path is still unbuilt (the `sync-postiz-analytics` skill documents a "best guess" endpoint and has an open checklist item to confirm it), so **do not request insights permissions in round one.**

Request exactly these six:

| Permission | Why you need it |
|---|---|
| `pages_show_list` | List the client's Pages so they can pick which to connect |
| `pages_read_engagement` | Read Page metadata to display the connected account |
| `pages_manage_posts` | Publish the scheduled post to the Page |
| `business_management` | Required when acting on assets owned by a business you don't own |
| `instagram_basic` | Read the linked Instagram Business account's profile |
| `instagram_content_publish` | Publish the scheduled post to Instagram |

**Defer to round two** (request once shipped and demonstrable): `read_insights`, `instagram_manage_insights`, `pages_manage_engagement`, `instagram_manage_comments`.

### 1.3 Use case description — paste-ready

> GF Innovative Solutions is a German marketing technology company. We provide a content planning and scheduling platform to our small and medium business clients, who are primarily German SMEs.
>
> Our clients are businesses that own their own Facebook Pages and Instagram Business accounts. They engage us to plan and publish their social media content. Our platform lets a client's marketing contact review, approve and schedule posts; at the scheduled time our system publishes the approved content to the client's own Facebook Page and Instagram account.
>
> We operate a self-hosted deployment of the open-source Postiz scheduling engine at postiz.gfinnov.com, under our own domain and on infrastructure we control. Each client is provisioned an isolated workspace with its own credentials, so one client's staff can never see or publish to another client's accounts.
>
> Each client connects their own accounts by completing the Facebook Login for Business flow themselves and granting consent. We never ask for or hold client passwords. Access tokens are stored encrypted and are used solely to publish content that the client has approved. A client can disconnect at any time, which revokes our access.
>
> We are requesting Advanced Access because we publish on behalf of Pages and Instagram accounts that our clients own and we do not.

### 1.4 Per-permission justification — paste-ready

**`pages_show_list`**
> After a client authorises our app, we call this permission to display the list of Facebook Pages they administer, so they can choose which Page to connect to their GF workspace. Without it the client cannot select a Page and connection cannot proceed.

**`pages_read_engagement`**
> We read basic Page metadata (name and profile picture) so the connected account is clearly identifiable in the client's dashboard. This prevents a client with several Pages from scheduling content to the wrong one.

**`pages_manage_posts`**
> This is our core use case. At the scheduled time chosen by the client, we publish the post the client has already reviewed and approved to their Facebook Page. Nothing is published that the client has not explicitly approved in advance.

**`business_management`**
> Our clients' Pages and Instagram accounts are owned by their own Meta business portfolios, not by ours. This permission is required for our app to act on assets belonging to a business we do not own, which is the defining characteristic of our service.

**`instagram_basic`**
> We read the profile of the Instagram Business account linked to the client's Page so we can confirm the correct account is connected and display it in their dashboard before any content is scheduled.

**`instagram_content_publish`**
> This is our core use case for Instagram. At the client's scheduled time we publish the image or video post that the client has already reviewed and approved to their own Instagram Business account.

### 1.5 Screencast script

Record one continuous take per permission group. Do not cut. Annotate on screen when each permission fires — generic product walkthroughs that never clearly show the consent screen and the scope in action are the single most common rejection.

1. Open `postiz.gfinnov.com`. Log in with the reviewer test account you created in 0.1. **Show the login on screen.**
2. Click to add a channel → Facebook. **Show the full Meta consent screen, including the list of permissions being requested.** Do not skip or speed through this.
3. Show the Page picker listing the test Page → annotate *"pages_show_list in use"*.
4. Select the Page. Show it appearing as connected with its name and picture → annotate *"pages_read_engagement in use"*.
5. Compose a post, set a schedule time a few minutes out, approve it.
6. Wait for it to publish. **Open the actual Facebook Page in a new tab and show the published post live** → annotate *"pages_manage_posts in use"*.
7. Repeat 2–6 for Instagram, annotating `instagram_basic` and `instagram_content_publish`.
8. Finally, show disconnecting the account, to demonstrate the client can revoke.

Use a Meta test user and a test Page you control. Everything shown must be reproducible by the reviewer with the credentials you supplied.

---

## 2. LinkedIn Community Management API

### 2.1 Eligibility — you clear the hard gate

Access is restricted to registered legal organisations for commercial use only. Solo developers and side projects are rejected outright. GF Innovative Solutions being a registered German entity is what makes this possible.

### 2.2 Setup

- Create the app at `linkedin.com/developers/apps`, associated with the **GF Innovative Solutions LinkedIn Page**
- A **super admin of that Page must verify the app** — if that isn't you, get it done early, it's a common stall
- Add both redirect URIs from 0.4
- Request the **Community Management API** product
- **Also request the Advertising API product.** Postiz's own docs are explicit: without it you cannot refresh tokens, so every client connection silently dies when the token expires. This is the single easiest thing to get wrong.

### 2.3 What the form needs

- Business email address on the gfinnov.com domain — **a personal address will fail vetting**
- Legal name, registered address, website, privacy policy URL
- Email verification must be completed

### 2.4 Use case description — paste-ready

> GF Innovative Solutions is a German marketing technology company serving small and medium businesses. Our clients engage us to plan and publish their organic social media content.
>
> Our platform allows a client's marketing contact to review, approve and schedule content. At the scheduled time, our system publishes the approved post to the client's own LinkedIn Page or member profile.
>
> Each client authorises our application themselves through LinkedIn's OAuth flow and can revoke access at any time. We store access tokens encrypted and use them only to publish content the client has explicitly approved. We do not scrape, we do not automate connection requests or messaging, and we do not resell LinkedIn data. Our only use is organic content publishing on behalf of the account owner.
>
> We operate a self-hosted deployment of the open-source Postiz scheduling engine at postiz.gfinnov.com, on infrastructure we control, with an isolated workspace per client.

### 2.5 The two tiers

**Development Tier** is granted first, with limited call volume. Build and verify against it.

**Standard Tier** requires a screencast **demonstrating each use case you listed on the access request form**. The use cases in the video must match the form exactly — mismatches are a standard rejection.

Screencast: same structure as Meta's. Log in as the reviewer account, show the LinkedIn consent screen with scopes visible, connect a Page, schedule a post, show it live on LinkedIn, show disconnect.

---

## 3. Order of operations

Do these in this order. The first two are calendar-bound and everything else waits on them.

1. **Today:** start Meta Business Verification (0.2). It gates Meta App Review and takes days on its own.
2. **Today:** get the LinkedIn Page super admin to verify the LinkedIn app (2.2). Pure waiting-on-a-human.
3. **This week:** clear the reviewer-account blocker (0.1) and the privacy/Impressum gap (0.3).
4. **This week:** create both apps, wire the env vars, connect *your own* GF accounts first. This proves the plumbing works before a reviewer ever sees it — and gets GF's own channels off Postiz cloud immediately.
5. **Then:** record both screencasts and submit both reviews in parallel.
6. **While waiting:** migrate the easy networks (Mastodon, Bluesky, Telegram, Discord) to self-hosted, and build the org-per-client provisioning so a new client gets a Postiz organisation and API key automatically.
7. **On approval:** flip `POSTIZ_API_BASE` per client and start migrating clients one key at a time.

## 4. Expect rejection

Plan for two Meta rounds. The most common causes, all avoidable:

- Consent screen not clearly shown in the screencast
- Requesting permissions for features not yet built *(this is why insights are deferred)*
- A flow the reviewer cannot reproduce with the supplied credentials
- Business Verification incomplete when App Review is submitted

Keep the reviewer test accounts working and the recordings re-runnable so a resubmission is cheap.
