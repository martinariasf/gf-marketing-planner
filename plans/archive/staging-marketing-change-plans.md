# Staging Marketing Change Plans

Date: 2026-06-04

## Local Repository Finding

The workspace at `C:\Users\Admin\Documents\Marketing Platform` contains only an empty Git repository. There are no checked-out files, no commits, no branches, no remotes, no reflog entries, and no recoverable Git objects other than Git's empty tree object.

Because of that, I could not find or move the old marketing planner plans here, including the station version 3 plan or version 2 plan. If those plans exist, they are likely in another checkout, cloud storage, database records, an external Victor/Viktor platform organization, or a different Git remote that is not configured in this folder.

## Old Marketing Planner Plans

Goal: move old planner plans, such as station version 3 and version 2, into Victor platform organizations so they can be deleted together later.

Plan:

1. Locate the source of the old plans.
2. Identify all plan records/files by version, owner, organization, and current storage location.
3. Confirm whether they should be archived, moved, or duplicated before deletion.
4. Move them into the target Victor platform organization area using the platform's normal data model.
5. Add a deletion checklist so all moved plans can be removed in one controlled cleanup.
6. Verify that no active planner, calendar, approval, or asset references still point to the moved plans.

Questions:

- Where are the old plans currently stored: app database, GitHub/GitLab repo, local files, cloud drive, or Victor platform organization records?
- Is the platform name spelled `Victor` or `Viktor` in the app/database?
- Which organization should receive the old plans before deletion?
- Should moving the plans make them invisible immediately, or should they stay visible until a separate delete action?
- Do version 2 and station version 3 mean plan names, schema versions, or release versions?

## Prio 1

### Approvals Should Reflect In Calendar

Problem: changes made in Approvals are not reflected in the Calendar. There may also be no approval action directly on post cards.

Decisions:

- Calendar and Approvals should show the actual current status.
- If a post is both approved and published, both states should be visible.
- Approval controls should be available directly on post cards.
- Everyone can approve posts.

Likely cause:

- Approvals and Calendar probably use separate local state, separate API queries, or incomplete cache invalidation.
- Status changes may update an approval record but not the underlying post/campaign/calendar item.

Plan:

1. Find the shared entity behind approvals and calendar posts.
2. Make post status a single source of truth, preferably on the post or scheduled content item.
3. Model status so multiple truths can be represented, for example `approvalStatus: approved` and `publicationStatus: published`, instead of forcing one combined label.
4. Update the Approvals mutation so it updates or invalidates/refetches Calendar data.
5. Add approve/reject controls directly on post cards.
6. Ensure actions in Calendar update Approvals in the same way.
7. Show status badges consistently in Approvals and Calendar.
8. Add tests for status synchronization from Approvals to Calendar and Calendar/Post to Approvals.

Questions:

- Which statuses exist today in the code/database: draft, pending, approved, rejected, scheduled, published, failed, archived, or others?
- Should reject/unapprove also be available directly from Calendar post cards?

### Webapp Chatbot Agent Not Working Correctly

Problem: the webapp chatbot agent is unreliable or not behaving as expected.

Decision:

- Leave this topic aside for now because it is being worked on in parallel.

Plan:

1. Reproduce the failing behavior in staging.
2. Inspect browser console errors, network requests, backend logs, and agent tool calls.
3. Identify whether the issue is frontend state, API routing, authentication, prompt/tool configuration, streaming, or model response handling.
4. Add a visible error state when the agent fails instead of silently doing nothing.
5. Add telemetry/logging around agent request id, selected agent, active dashboard/context, and backend error code.
6. Add regression tests around the failing path once identified.

Questions:

- Is the staging agent supposed to call external tools/APIs?
- Is there a recent working version or deployment to compare against?

## Prio 2

### Configurable Content Calendar Months

Problem: Content Calendar months are hardcoded to April, May, and June. It should be possible to select months more flexibly.

Decisions:

- Users can choose a date/month range.
- Three months should be the default.
- Users select a start month and an end month.
- The maximum range is 6 months.
- Past months can be selected.
- The UI should clearly show which month/day is current.
- Calendar posts should clearly distinguish older posts from newer/upcoming posts.
- The selected range should be saved per organization.
- Strategy should use the same selected range as Content Calendar.

Plan:

1. Replace hardcoded month constants with a calendar range configuration.
2. Support a default rolling 3-month range, such as current month plus next 2 months.
3. Add a configuration icon in the Content Calendar header.
4. Open a compact settings panel or modal with start-month and end-month selection controls.
5. Store the selected range as organization configuration.
6. Propagate the same date range into Strategy views.
7. Add API support for reading and updating organization calendar/strategy date range configuration.
8. Validate the selected range so it cannot exceed 6 months.
9. Add visual treatment for past posts, today's posts, and future posts.
10. Add tests for default range, custom range, past-month selection, max-range validation, organization persistence, and Strategy synchronization.

Recommendation:

- Use a rolling 3-month default and explicit start/end month controls. This matches the desired UX and keeps Strategy aligned to the same organization-level planning window.

Questions:

- Should older posts be visually muted only, or should they also be grouped under a clear `Past posts` label?

### Agent Per Dashboard

Problem: each dashboard needs its own agent.

Decision:

- Leave this topic out for now.

Plan:

1. List all dashboards and define the expected agent role for each.
2. Create an agent registry keyed by dashboard id.
3. Pass dashboard context, organization context, assets, approvals, calendar range, and permissions into the selected agent.
4. Make the chatbot select the dashboard-specific agent automatically.
5. Add fallback behavior for dashboards without a configured agent.
6. Add tests that each dashboard loads the expected agent configuration.

Questions:

- Can users switch agents manually, or should agent selection be automatic?

### Remove Duplicate References And Brand Identity Kit Sections

Problem: References and Brand Identity Kit are duplicated as standalone content sections. The underlying information is still needed, but it already exists in better places: References should live in Assets, and Brand Identity Kit should live in Company Context.

Decision:

- Remove the duplicate standalone References and Brand Identity Kit sections from the content/sidebar area.
- Keep the underlying data and APIs because agents still need to call this information.
- References should be stored/accessed through Assets.
- Brand Identity Kit should be stored/accessed through Company Context.
- Old direct References routes should redirect to Assets.
- Old direct Brand Identity Kit routes should redirect to Company Context.
- This is not a data deletion task. It is a UI/information-architecture cleanup.

Plan:

1. Find the navigation entries and routes for References and Brand Identity Kit.
2. Remove the duplicate standalone sections from navigation and content/sidebar placement.
3. Keep the APIs and backend data models available for agents and existing app flows.
4. Ensure References are reachable from Assets.
5. Ensure Brand Identity Kit is reachable from Company Context.
6. Redirect old References routes to Assets.
7. Redirect old Brand Identity Kit routes to Company Context.
8. Remove obsolete UI components only after confirming no other screens import them.
9. Add tests or route checks to ensure duplicate sections no longer appear while the underlying data remains accessible.

Questions:

- None for this section.

### Company Context Box Colors

Problem: boxes in Company Context should use category colors, such as business blue and audience green.

Plan:

1. Identify Company Context categories and their current visual components.
2. Define category color tokens, including background, border, icon, and text colors.
3. Apply light category backgrounds to boxes while preserving readability.
4. Keep colors consistent with any existing design system tokens.
5. Add visual QA for desktop and mobile.

Questions:

- What are all Company Context categories?
- Are there existing brand/design color tokens that should be reused?

## Prio 3

### Sidebar Expand Icon Size Changes

Problem: icons change size when clicking Expand Sidebar.

Plan:

1. Inspect collapsed and expanded sidebar CSS.
2. Give icon containers fixed width, height, and flex behavior.
3. Ensure icon SVG size is independent of label visibility.
4. Test hover, active, collapsed, and expanded states.

Question:

- Should collapsed sidebar icons be centered in the same row height as expanded rows?

### Adding A Channel Triggers Unnecessary Loading

Problem: adding a channel causes a loading state even when only one thing changed.

Plan:

1. Find the channel add mutation and related data fetching.
2. Replace full-page reload/loading with optimistic update or scoped refetch.
3. Disable only the specific channel add control while saving.
4. Preserve existing dashboard/calendar content during the mutation.
5. Add tests for no full-page loading after channel creation.

Question:

- Should newly added channels appear immediately before the backend confirms, or only after save succeeds?

### New Information Sources Section

Problem: add a section for information that agents can use during post generation. This includes news, but should not be limited to news. It can include industry updates, company updates, competitor information, campaign notes, customer insights, source links, web pages, and other context the agent can turn into post ideas or post copy.

Decisions:

- Call this section `Information Sources`.
- Add it inside Assets, likely as a folder or subsection.
- Websites should be provided by the user.
- The agent should be able to edit the prompt.
- The agent should only use website information after it has been saved/imported into the app.
- Generated posts should show references.
- Websites/information sources should be approved before the agent can use them.
- Everyone can approve Information Sources unless role rules are added later.
- Website information should be manually imported/refreshed first. Automatic refresh can be added later as an optional per-source setting.
- Post generation should use all approved Information Sources by default.
- Users should also be able to select or deselect specific Information Sources for a generation run.

Plan:

1. Rename the concept from `News` to something broader, such as `Information Sources`, `Content Inputs`, or `Post Intelligence`.
2. Add `Information Sources` inside Assets, likely as a folder/subsection.
3. Support manual/imported entries with fields such as title, source type, source URL, summary, notes, date, tags, relevance, campaign, channel, organization, and approval status.
4. Support user-provided website/source configuration.
5. Add an import/save flow that stores website information inside the app before it can be used by the agent.
6. Add an approval step for websites/information sources.
7. Add an editable agent prompt field or prompt template for how this information should be used in post generation.
8. Expose only approved information items through the post-generation API.
9. Add visible source references to generated posts.
10. Allow everyone to approve Information Sources for now.
11. Add manual refresh/re-import for website information.
12. Add source selection controls to the post-generation flow, defaulting to all approved sources.
13. Add permissions later only if organization roles require it.

Prompt/API plan:

1. Add or update an API endpoint for source configuration, for example `GET/PUT /api/organizations/:orgId/information-sources/config`.
2. Add CRUD endpoints for saved information items, for example `/api/organizations/:orgId/information-sources`.
3. Add import endpoints for user-provided websites, for example `POST /api/organizations/:orgId/information-sources/import`.
4. Add approval endpoints for websites/information items, for example `POST /api/organizations/:orgId/information-sources/:id/approve`.
5. Extend the post-generation API request with `informationSourceIds`, `sourcePrompt`, or a `useInformationSources` flag.
6. If `informationSourceIds` is omitted, default to all approved Information Sources for the organization.
7. Pass selected approved information sources into the agent context as structured data instead of free-form pasted text.
8. Do not allow unrestricted live browsing during post generation. Use saved/imported information only.
9. Store source IDs and displayable references on generated posts so users can trace which information influenced each post.
10. Store `lastImportedAt`, `lastApprovedAt`, and source freshness metadata so users know how current each source is.

Example agent prompt direction:

> Use the selected information sources as inspiration and factual context for post generation. Prefer recent, source-backed information. Do not invent facts. If a source is unclear, summarize it cautiously or ask for confirmation. Adapt the information to the selected channel, audience, campaign, and brand voice.

Questions:

- Should websites be configured per organization, per campaign, or globally?
- Should automatic refresh be offered later as a source-level setting such as daily, weekly, or monthly?

### New Videos Section

Problem: add a Videos section now, but only as a teaser for a feature that will be built later.

Plan:

1. Add a `Videos` section in the navigation.
2. Show a coming-soon screen that previews the future value of generated videos.
3. Keep the section lightweight and avoid building storage, generation, upload, or approval workflows for now.
4. Include simple placeholder states such as future generated videos, campaign video ideas, or channel-ready clips.
5. Optionally add a disabled action button such as `Generate video` or `Coming soon` so users understand the planned direction.
6. Track clicks or visits if product analytics are available, so interest in the feature can be measured.

Questions:

- Should the teaser say `Coming soon`, `Video generation is coming`, or another phrase?
- Should Videos live as its own sidebar section, or inside Assets as a future tab?
- Should there be a waitlist/contact-interest button, or just a static teaser?

### Content Calendar Picture Arrow Moves Down

Problem: the arrow for changing pictures sometimes moves down and blocks slide changes.

Plan:

1. Reproduce with posts containing different image sizes/text lengths.
2. Fix carousel control positioning with absolute positioning inside a stable media container.
3. Reserve consistent media area height/aspect ratio.
4. Ensure controls have proper z-index and do not depend on image load height.
5. Test with missing, portrait, landscape, and multiple-image posts.

Question:

- Does this happen on desktop, mobile, or both?

### Move Viktor's Boundaries To Approvals

Problem: `Viktor's boundaries` should be changed/moved to the Approvals section.

Plan:

1. Locate the current Viktor's Boundaries section/component.
2. Determine whether it is policy content, approval rules, or agent constraints.
3. Move or duplicate the UI into Approvals.
4. Connect boundaries to approval decisions if they are meant to validate posts.
5. Remove the old navigation entry if it should no longer exist elsewhere.

Questions:

- What does `Viktor's boundaries` contain today?
- Should boundaries only be visible in Approvals, or also used by agents in the background?
- Should violating a boundary block approval or only warn the user?

### Delete Or Download Assets

Problem: users need options to delete or download assets. Delete should ask for confirmation.

Plan:

1. Add asset action menu or icon buttons for download and delete.
2. Implement download through the existing asset URL/storage backend.
3. Implement delete with a confirmation dialog.
4. Use soft delete if assets may be referenced by posts, campaigns, approvals, or videos.
5. Warn the user if an asset is currently used somewhere.
6. Add tests for delete confirmation, cancel, successful delete, failed delete, and download.

Questions:

- Should deleting an asset remove it permanently or move it to trash/archive?
- What should happen when an asset is used by an existing scheduled post?
- Should users be able to bulk delete/download assets?
