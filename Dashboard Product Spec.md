**Dashboard Product Spec**

**Product name:** Viktor Marketing Operating Dashboard

**Purpose**

Build a dashboard that gives Viktor the structured context and working system needed to operate as an AI Marketing Assistant across different client companies.

This should not be just a content calendar.  
It should work as an operating system for:

• onboarding  
• strategy  
• content production  
• approvals  
• performance review  
• learning  
• future scaling across industries

**Product Goal**

The dashboard should help Viktor answer, at any time:

1\. Who is the client?  
2\. What are they trying to achieve?  
3\. What content are we producing right now?  
4\. What is approved and safe to use?  
5\. What are we learning from results?  
6\. What should happen next?

**Design Principles**

• Simple enough for non-marketers  
• Structured enough for AI use  
• Reusable across industries  
• Safe for approval-based workflows  
• Focused on action, not just storage  
• Built for both humans and Viktor

───

**1\. Core Modules**

A. Client Overview Module

**Purpose:** store the stable identity and business context of the client.

**Fields:**

• Company name  
• Industry  
• Website  
• Country / market  
• Main contact  
• Company summary  
• Main offer(s)  
• Target audience summary  
• Brand positioning  
• Differentiators  
• Voice and tone  
• Words to use  
• Words to avoid  
• Main goals  
• Main CTA style

B. Onboarding Module

**Purpose:** capture the initial brief in a reusable, standardized way.

**Fields:**

• Business model  
• Customer type  
• Main offer  
• Best-selling offer  
• Audience pain points  
• Audience desires  
• Main competitors  
• Reference brands  
• Content pillars  
• Topics to avoid  
• Priority platforms  
• Posting frequency  
• Language  
• Approval rules  
• Sensitive topics  
• Success metrics

C. Strategy Module

**Purpose:** translate brand context into active marketing direction.

**Fields:**

• Quarterly goals  
• Monthly goals  
• Campaign themes  
• Platform roles  
• Content mix  
• Core messaging statements  
• Key proof points  
• Current strategic priority  
• Weekly focus  
• Target KPI focus

D. Content Pipeline Module

**Purpose:** manage each content item from idea to ready state.

**Fields per content item:**

• Title  
• Platform  
• Content pillar  
• Campaign/theme  
• Objective  
• Format  
• Hook  
• Draft text  
• CTA  
• Visual direction  
• Status  
• Scheduled date  
• Reviewer  
• Notes

**Suggested statuses:**

• Idea  
• Drafting  
• Awaiting review  
• Needs revision  
• Approved  
• Scheduled  
• Published  
• Rejected

E. Approval Module

**Purpose:** track what is safe to use and what still needs approval.

**Fields:**

• Approval required? yes/no  
• Approved by  
• Approval date  
• Version number  
• Public action allowed? yes/no  
• Blocker reason  
• Last updated  
• Last editor

F. Asset Module

**Purpose:** connect copy, visuals, and references in one place.

**Fields:**

• Asset link  
• Asset type  
• Design brief  
• Brand template used  
• Preview  
• Final approved asset? yes/no  
• Asset owner

G. Performance Module

**Purpose:** help Viktor learn from results and improve future output.

**Fields:**

• Published date  
• Reach  
• Impressions  
• Saves  
• Shares  
• Comments  
• Likes/reactions  
• Profile visits  
• Clicks  
• DMs/inbound conversations  
• Leads  
• Notes on audience response  
• What worked  
• What failed  
• Recommended next test

H. Community Module

**Purpose:** support replies, triage, and future DM/comment assistance.

**Fields:**

• Message/comment category  
• FAQ tag  
• Suggested reply  
• Escalation needed? yes/no  
• Escalation owner  
• Reply status  
• Sensitive topic flag

I. Learning Module

**Purpose:** store lessons that make Viktor better over time.

**Fields:**

• Insight title  
• Related platform  
• Related post/campaign  
• What happened  
• Lesson learned  
• Recommended behavior change  
• Confidence level

───

2\. Required Views

1\) Brand Overview View

A stable summary of who the client is.

2\) Onboarding View

The completed Main Brief and key setup info. \> Viktor: 

3\) Strategy View

Quarter, month, campaign, and weekly direction.

4\) Weekly Workflow View

The active working board for Viktor:

• Plan \> Viktor:   
• Draft  
• Refine  
• Prepare  
• Learn

5\) Content Calendar View

A timeline/calendar of planned and published posts.

6\) Approval View

A filtered view showing what is waiting, blocked, or approved.

7\) Performance View

A summary of post results and trend learning.

8\) Community View

A place to manage comment and DM response logic.

9\) Assets View

Quick access to visual references and approved assets.

───

3\. Minimum Viable Version

If Martin wants to build this in phases, the MVP dashboard only needs:

• Client Overview  
• Onboarding fields  
• Strategy layer  
• Content Pipeline  
• Approval tracking  
• Basic Performance notes  
• Weekly Workflow view

That is enough to make the system immediately useful to Viktor.

───

4\. Future Expansion

Later versions can add:

• direct publishing integrations  
• scheduler integrations  
• analytics sync  
• asset generation links  
• CRM/contact integration  
• industry templates  
• automated KPI summaries  
• AI suggestions inside the dashboard

───

5\. Workflow Logic for Viktor

The dashboard should support Viktor’s default operating loop:

Plan  
Read strategy, priorities, and goals.

Draft  
Create content ideas and draft assets.

Refine  
Adjust based on human feedback.

Prepare  
Package approved content for use.

Learn  
Review outcomes and store lessons.

This should be visible in the product, not just implied.

───

6\. Non-Negotiable Product Requirements

• The dashboard must be understandable by non-marketers  
• The dashboard must support approval-based workflows  
• The dashboard must help Viktor work across different industries  
• The dashboard must connect strategy, execution, and learning  
• The dashboard must reduce confusion, not add process overhead

───

7\. Bottom Line

Martin should build the dashboard as a lightweight marketing operating system for Viktor.

If it only stores ideas, it will be underpowered.  
If it stores:

• context  
• strategy  
• content  
• approvals  
• results  
• learning

then it becomes the right foundation for a sellable AI Marketing Assistant product.

**Future Expansion Workflow**

**Goal:** evolve Viktor’s dashboard from a planning system into a real operating system with integrations, automation, and reusable client infrastructure.

───

Phase 1 — Build the stable foundation first

Before adding automation, Martin should make sure the dashboard already has:

• client overview  
• onboarding fields  
• strategy layer  
• content pipeline  
• approval tracking  
• weekly workflow view  
• basic performance notes

Why first

If this foundation is weak, every later integration becomes messy.  
Automation on top of unclear structure just creates faster confusion.

Output of this phase

A usable internal MVP where:

• Viktor can read context  
• Pilar can review work  
• content can move through a clear flow  
• approvals are visible  
• lessons can start being stored

───

Phase 2 — Add operational convenience

Once the structure works, Martin should add features that reduce friction but don’t yet require full autonomy.

Build next:

• scheduler integrations  
• asset generation links  
• analytics sync (basic)  
• automated KPI summaries (basic)

What this means in practice

**Scheduler integrations**

• connect approved posts to Buffer, Postiz, Meta scheduler, or similar tools  
• allow “ready for scheduling” handoff  
• publishing should still require approval logic

**Asset generation links**

• connect to Canva, design templates, image generators, or asset folders  
• let copy and design live closer together  
• allow post records to point to visual assets cleanly

**Analytics sync**

• pull in basic platform metrics automatically  
• at first, only the most useful ones:  
• reach  
• impressions  
• saves  
• shares  
• comments  
• clicks  
• profile visits  
• DMs if possible

**Automated KPI summaries**

• weekly summary  
• monthly summary  
• simple “what improved / what dropped / what to test next”

Why this phase matters

This is where the dashboard stops being manual-only and starts saving real time.

Output of this phase

A workflow where:

• content is easier to prepare  
• results are easier to review  
• Viktor can operate with better information  
• Pilar spends less time moving pieces manually

───

Phase 3 — Add intelligence and reusable product logic

Once data and workflow are stable, Martin should build the layers that make Viktor scalable as a product.

Build next:

• AI suggestions inside the dashboard  
• industry templates  
• CRM/contact integration

What this means in practice

**AI suggestions inside the dashboard**

• suggest post ideas based on content pillars  
• suggest stronger hooks  
• suggest CTA options  
• suggest best next action based on weak spots  
• suggest what content pillar is underused  
• suggest follow-up content from strong-performing posts

**Industry templates**

• create onboarding presets for:  
• services  
• retail  
• consulting  
• SaaS  
• personal brands  
• adjust fields depending on the business model  
• include recommended KPIs, platform priorities, and content types by industry

**CRM/contact integration**

• connect leads, DMs, or inbound conversations to a CRM  
• track when content starts generating actual business interest  
• connect marketing activity with sales outcomes later

Why this phase matters

This is what turns Viktor from “GF’s assistant” into a **sellable multi-client product**.

Output of this phase

A dashboard that:

• adapts faster to new clients  
• gives smarter suggestions  
• connects marketing to business outcomes  
• becomes more valuable over time

───

Phase 4 — Add controlled action layers

Only after the system is trustworthy should Martin add deeper automation.

Build later:

• direct publishing integrations  
• advanced analytics sync  
• stronger automated recommendations \> Viktor:   
• more autonomous workflow steps

Important rule \> Viktor: Even if direct publishing exists, Viktor should still respect approval rules:

• no posting without written approval  
• no public action without permission  
• no autonomous external communication unless explicitly allowed

Why later

This is the highest-risk layer.  
If added too early, it creates mistakes in public.

Output of this phase

A more autonomous but still controlled operating system.

───

Recommended Build Order for Martin

Step 1

Finalize dashboard structure and views

Step 2

Connect scheduling and asset links

Step 3

Add analytics sync and KPI summaries

Step 4

Add AI suggestions layer

Step 5

Add industry templates

Step 6

Add CRM/contact integration

Step 7

Add direct publishing only with approval controls

───

What Martin should define before building

To avoid chaos, he should decide:

• which tool stack he wants to integrate first  
• what “approved” means technically  
• what metrics each platform can realistically provide  
• what the source of truth is: dashboard, Telegram, Drive, or somewhere else  
• which features are only for GF  
• which features must work for all future clients  
• what actions Viktor can suggest vs trigger automatically

───

Suggested technical logic by feature

1\. Scheduler integrations

**Purpose:** reduce manual posting friction  
**Needs:**

• approved content state  
• platform mapping  
• scheduled date field  
• export/send to scheduler action

2\. Direct publishing integrations

**Purpose:** optional later-stage automation  
**Needs:**

• explicit approval gate  
• final asset attached  
• final copy locked  
• publishing confirmation log

3\. Analytics sync

**Purpose:** automatic learning loop  
**Needs:**

• platform API connections  
• metric field mapping  
• time-based sync logic  
• post-to-metric matching

4\. Asset generation links

**Purpose:** bridge copy and creative execution  
**Needs:**

• asset storage links  
• template references  
• visual brief fields  
• generated asset attachment logic

5\. CRM/contact integration

**Purpose:** connect content to leads and pipeline  
**Needs:**

• source attribution  
• lead capture mapping  
• contact status fields  
• sync rules

6\. Industry templates

**Purpose:** make onboarding repeatable  
**Needs:**

• industry presets  
• reusable field groups  
• KPI presets  
• content strategy defaults

7\. Automated KPI summaries

**Purpose:** make data understandable fast  
**Needs:**

• synced metrics  
• summary logic  
• trend comparison  
• plain-language output

8\. AI suggestions inside dashboard

**Purpose:** make Viktor more embedded into the tool  
**Needs:**

• access to strategy \+ content \+ results  
• suggestion triggers  
• editable recommendations  
• logging of accepted/rejected suggestions

───

Best practical rule

Tell Martin this:

**“Do not build all features at once. Build in this order: structure first, then workflow support, then intelligence, then action.”**

That’s the difference between a system that grows well and one that collapses under its own ambition.  
