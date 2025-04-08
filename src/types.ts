export type Vector = number[]
export type Matrix = number[][]

export type PCAResult = {
  center: Vector
  comps: Matrix
  commentProjection?: Matrix
  commentExtremity?: Vector
}

export type SortDirection = "asc" | "desc"
export type SortType = "z-score" | "vote-count" | "default"
export type TabType = "import" | "random"
export type ZScoreGroup = "overall" | `groupZ-${number}`

export type Comment = {
  timestamp: string
  datetime: string
  id: string
  author_id: string
  agrees: number
  disagrees: number
  moderated: string
  text: string
  passes?: number
}

export type ParticipantMetadata = {
  participant: string
  "group-id": string
  "n-comments": number
  "n-votes": number
  "n-agree": number
  "n-disagree": number
}

export type GroupData = {
  centroid: Vector
  points: number[]
}

export type ZScoreData = {
  agreementZScore?: number
  disagreementZScore?: number
  isAgreeSignificant?: boolean
  isDisagreeSignificant?: boolean
}

export type GroupZScoreData = {
  agrees: number
  disagrees: number
  agreementZScore: number
  disagreementZScore: number
  isAgreeSignificant: boolean
  isDisagreeSignificant: boolean
  passes: number
  totalSeen: number
}

export type ConsensusComment = {
  id: string
  text: string
  consensusScore: number
  agrees: number
  disagrees: number
  passes: number
}

export type GroupConsensusData = {
  groupId: number
  comments: {
    id: string
    text: string
    consensusScore: number
  }[]
}

export type CommentStats = {
  commentText: string
  commentId: string
  repType: string
  repnessScore: string
  supportPercent: number
  tid: number
  n_success: number
  n_trials: number
  p_success: number
  p_test: number
  repness: number
  repness_test: number
  repful_for: "agree" | "disagree"
  best_agree?: boolean
}

export type FinalizedCommentStats = {
  tid: number
  n_success: number
  n_trials: number
  p_success: number
  p_test: number
  repness: number
  repness_test: number
  repful_for: "agree" | "disagree"
  best_agree?: boolean // Optional flag for best agree comment
}

export type PolisStats = {
  consensusComments: {
    agree: CommentStats[]
    disagree: CommentStats[]
  }
  zScores: {}
}
