interface CommentStats {
  na: number;  // Number of agrees
  nd: number;  // Number of disagrees
  ns: number;  // Total number of votes (seen)
  pa: number;  // Probability of agreement
  pd: number;  // Probability of disagreement
  pat: number; // Statistical significance of agreement
  pdt: number; // Statistical significance of disagreement
}

interface ComparativeStats extends CommentStats {
  ra: number;  // Representativeness of agreement
  rd: number;  // Representativeness of disagreement
  rat: number; // Statistical significance of representativeness for agreement
  rdt: number; // Statistical significance of representativeness for disagreement
}

interface FinalizedCommentStats {
  tid: number;
  n_success: number;
  n_trials: number;
  p_success: number;
  p_test: number;
  repness: number;
  repness_test: number;
  repful_for: 'agree' | 'disagree';
  n_agree?: number;
  best_agree?: boolean;
}

export function addComparativeStats(inStats: CommentStats, restStats: CommentStats[]): ComparativeStats {
  const sumRestAgrees = restStats.reduce((sum, stat) => sum + (stat.na || 0), 0);
  const sumRestDisagrees = restStats.reduce((sum, stat) => sum + (stat.nd || 0), 0);
  const sumRestVotes = restStats.reduce((sum, stat) => sum + (stat.ns || 0), 0);
  
  return {
    ...inStats,
    ra: inStats.pa / ((sumRestAgrees + 1) / (sumRestVotes + 2)),
    rd: inStats.pd / ((sumRestDisagrees + 1) / (sumRestVotes + 2)),
    rat: twoPropTest(inStats.na, sumRestAgrees, inStats.ns, sumRestVotes),
    rdt: twoPropTest(inStats.nd, sumRestDisagrees, inStats.ns, sumRestVotes)
  };
}

export function twoPropTest(successes1: number, successes2: number, trials1: number, trials2: number): number {
  const p1 = successes1 / trials1;
  const p2 = successes2 / trials2;
  const p = (successes1 + successes2) / (trials1 + trials2);
  const standardError = Math.sqrt(p * (1 - p) * (1/trials1 + 1/trials2));
  
  if (standardError === 0) return 0;
  return (p1 - p2) / standardError;
}

// Statistical significance test at 90% confidence level
export function isZSig90(zScore: number): boolean {
  return Math.abs(zScore) > 1.65;
}

// Check if a comment passes statistical significance tests
function passesByTest(commentStats: ComparativeStats): boolean {
  return (isZSig90(commentStats.rat) && isZSig90(commentStats.pat)) ||
         (isZSig90(commentStats.rdt) && isZSig90(commentStats.pdt));
}

// Check if a comment has better representativeness than current best
function beatsBestByTest(commentStats: ComparativeStats, currentBestZ: number | null): boolean {
  if (currentBestZ === null) return true;
  return Math.max(commentStats.rat, commentStats.rdt) > currentBestZ;
}

// Check if a comment has better agreement stats than current best agreement
function beatsBestAgr(
  commentStats: ComparativeStats, 
  currentBest: ComparativeStats | null
): boolean {
  const { na, nd, ra, rat, pa, pat, ns } = commentStats;
  
  // Don't accept comments with no votes
  if (na === 0 && nd === 0) return false;
  
  // If we have a current best with good representativeness
  if (currentBest && currentBest.ra > 1.0) {
    // Compare composite scores
    return (ra * rat * pa * pat) > 
           (currentBest.ra * currentBest.rat * currentBest.pa * currentBest.pat);
  }
  
  // If we have a current best but not by repness
  if (currentBest) {
    return (pa * pat) > (currentBest.pa * currentBest.pat);
  }
  
  // Otherwise accept if either metric looks good
  return isZSig90(pat) || (ra > 1.0 && pa > 0.5);
}

// Finalize comment stats for client consumption
function finalizeCommentStats(
  tid: number, 
  commentStats: ComparativeStats
): FinalizedCommentStats {
  const { na, nd, ns, pa, pd, pat, pdt, ra, rd, rat, rdt } = commentStats;
  
  // Determine if comment is more representative for agreement or disagreement
  const isAgree = rat > rdt;
  
  return {
    tid,
    n_success: isAgree ? na : nd,
    n_trials: ns,
    p_success: isAgree ? pa : pd,
    p_test: isAgree ? pat : pdt,
    repness: isAgree ? ra : rd,
    repness_test: isAgree ? rat : rdt,
    repful_for: isAgree ? 'agree' : 'disagree'
  };
}

// Calculate composite repness metric for sorting
function repnessMetric(stats: FinalizedCommentStats): number {
  return stats.repness * stats.repness_test * stats.p_success * stats.p_test;
}

// Sort comments by representativeness
function repnessSort(repdata: FinalizedCommentStats[]): FinalizedCommentStats[] {
  return [...repdata].sort((a, b) => repnessMetric(b) - repnessMetric(a));
}

// Ensure agrees come before disagrees in the final list
function agreesBeforeDisagrees(repdata: FinalizedCommentStats[]): FinalizedCommentStats[] {
  const agrees = repdata.filter(item => item.repful_for === 'agree');
  const disagrees = repdata.filter(item => item.repful_for === 'disagree');
  return [...agrees, ...disagrees];
}

// Select representative comments for a group
export function selectRepComments(
  commentStats: Array<ComparativeStats & { tid: number }>,
  moderatedOutComments: number[] = []
): Record<number, FinalizedCommentStats[]> {
  // Initialize result structure for each group
  const result: Record<number, { 
    best: FinalizedCommentStats | null, 
    bestAgree: (ComparativeStats & { tid: number }) | null, 
    sufficient: FinalizedCommentStats[] 
  }> = {};
  
  // Process each comment for each group
  for (const [tid, stats] of commentStats) {
    for (const [groupId, commentGroupStats] of Object.entries(stats)) {
      // Skip moderated comments
      if (moderatedOutComments.includes(tid)) continue;
      
      // Initialize group entry if needed
      if (!result[groupId]) {
        result[groupId] = { best: null, bestAgree: null, sufficient: [] };
      }
      
      // Check if comment passes statistical tests
      if (passesByTest(commentGroupStats)) {
        const finalizedStats = finalizeCommentStats(tid, commentGroupStats);
        result[groupId].sufficient.push(finalizedStats);
      }
      
      // Track best comment even if it doesn't pass tests
      if (beatsBestByTest(
          commentGroupStats, 
          result[groupId].best ? result[groupId].best.repness_test : null
      )) {
        result[groupId].best = finalizeCommentStats(tid, commentGroupStats);
      }
      
      // Track best agreement comment
      if (beatsBestAgr(commentGroupStats, result[groupId].bestAgree)) {
        result[groupId].bestAgree = { ...commentGroupStats, tid };
      }
    }
  }
  
  // Process results for each group
  const finalResult: Record<number, FinalizedCommentStats[]> = {};
  
  for (const [groupId, groupData] of Object.entries(result)) {
    const { best, bestAgree, sufficient } = groupData;
    
    // Format best agree if available
    let formattedBestAgree = null;
    if (bestAgree) {
      formattedBestAgree = finalizeCommentStats(bestAgree.tid, bestAgree);
      formattedBestAgree.n_agree = bestAgree.na;
      formattedBestAgree.best_agree = true;
    }
    
    // Use best agree or best if available
    const bestHead = formattedBestAgree ? [formattedBestAgree] : (best ? [best] : []);
    
    // Final comment selection logic
    if (sufficient.length === 0) {
      finalResult[groupId] = bestHead;
    } else {
      // Remove best agree from sufficient if it's in there
      const filteredSufficient = formattedBestAgree 
        ? sufficient.filter(item => item.tid !== formattedBestAgree.tid)
        : sufficient;
      
      // Get top 5 representative comments
      finalResult[groupId] = agreesBeforeDisagrees(
        [...(formattedBestAgree ? [formattedBestAgree] : []), 
         ...repnessSort(filteredSufficient)
        ].slice(0, 5)
      );
    }
  }
  
  return finalResult;
}