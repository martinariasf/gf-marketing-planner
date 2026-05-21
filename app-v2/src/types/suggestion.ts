export type SuggestionKind =
  | 'post_idea'         // a fresh post draft Viktor wants to write
  | 'hook_rewrite'      // a stronger opening line for an existing draft
  | 'cta_alternative'   // an alternative CTA for an existing draft
  | 'pillar_balance'    // a content pillar is over- or under-used
  | 'next_action'       // a strategic action (e.g. "open the corporate angle this week")
  | 'follow_up'         // do another post in the style of a strong performer
  | 'pivot'             // kill or reframe an experiment that isn't working

export type SuggestionStatus = 'open' | 'accepted' | 'dismissed'
export type Confidence = 'low' | 'medium' | 'high'

export interface Suggestion {
  id: string
  kind: SuggestionKind
  title: string                       // one-line headline of the suggestion
  rationale: string                   // why Viktor proposes this - cite a number, a learning, or a gap
  suggestedAction: string             // the literal Telegram command that would accept this (e.g. "draft hook p006 v2 with empathy framing")
  relatedPostId?: string
  relatedCampaign?: string
  relatedPillar?: string
  confidence: Confidence
  status: SuggestionStatus
  createdAt: string                   // ISO UTC
  expiresAt?: string                  // ISO UTC - some suggestions go stale (e.g. weekly focus pivots)
  decidedAt?: string                  // when human accepted or dismissed
  decidedBy?: string
  decisionNote?: string
}

export interface Suggestions {
  items: Suggestion[]
}
