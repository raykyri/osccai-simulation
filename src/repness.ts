// Helper function to check if z-score is significant at 90% confidence
export function zSig90(zVal: number): boolean {
    return zVal > 1.2816;
}
  
// Test if a proportion differs from 0.5
export function propTest(succ: number, n: number): number {
  const adjustedSucc = succ + 1;
  const adjustedN = n + 1;
  return 2 * Math.sqrt(adjustedN) * (adjustedSucc / adjustedN - 0.5);
}

// Test if two proportions differ significantly
function twoPropTest(succIn: number, succOut: number, popIn: number, popOut: number): number {
  const adjustedSuccIn = succIn + 1;
  const adjustedSuccOut = succOut + 1;
  const adjustedPopIn = popIn + 1;
  const adjustedPopOut = popOut + 1;
  
  const pi1 = adjustedSuccIn / adjustedPopIn;
  const pi2 = adjustedSuccOut / adjustedPopOut;
  const piHat = (adjustedSuccIn + adjustedSuccOut) / (adjustedPopIn + adjustedPopOut);
  
  if (piHat === 1) return 0;
  
  return (pi1 - pi2) / 
    Math.sqrt(piHat * (1 - piHat) * (1/adjustedPopIn + 1/adjustedPopOut));
}

// Check if comment stats pass significance tests
function passesByTest(commentStats: any): boolean {
  return (zSig90(commentStats.rat) && zSig90(commentStats.pat)) ||
         (zSig90(commentStats.rdt) && zSig90(commentStats.pdt));
}

// Check if comment beats the current best by test value
function beatsBestByTest(commentStats: any, currentBestZ: number | null): boolean {
  return currentBestZ === null || 
         Math.max(commentStats.rat, commentStats.rdt) > currentBestZ;
}

// Check if comment is a better representative of agreement
function beatsBestAgr(commentStats: any, currentBest: any): boolean {
  const { na, nd, ra, rat, pa, pat, ns } = commentStats;
  
  // Don't accept comments with no votes
  if (na === 0 && nd === 0) return false;
  
  // If we have a current best with good repness
  if (currentBest && currentBest.ra > 1.0) {
    return (ra * rat * pa * pat) > (currentBest.ra * currentBest.rat * currentBest.pa * currentBest.pat);
  }
  
  // If we have a current best but only by probability
  if (currentBest) {
    return (pa * pat) > (currentBest.pa * currentBest.pat);
  }
  
  // Otherwise accept if either metric looks good
  return zSig90(pat) || (ra > 1.0 && pa > 0.5);
}
// Helper function to calculate comparative statistics for groups
export function addComparativeStats(inStats: any, restStats: any[]): any {
    // Sum up values across other groups
    const sumOtherNa = restStats.reduce((sum, g) => sum + g.na, 0);
    const sumOtherNd = restStats.reduce((sum, g) => sum + g.nd, 0);
    const sumOtherNs = restStats.reduce((sum, g) => sum + g.ns, 0);
    
    // Calculate relative agreement and disagreement
    const ra = inStats.pa / ((1 + sumOtherNa) / (2 + sumOtherNs));
    const rd = inStats.pd / ((1 + sumOtherNd) / (2 + sumOtherNs));
    
    // Calculate z-scores for the differences between proportions
    const rat = twoPropTest(inStats.na, sumOtherNa, inStats.ns, sumOtherNs);
    const rdt = twoPropTest(inStats.nd, sumOtherNd, inStats.ns, sumOtherNs);
    
    return {
      ...inStats,
      ra, rd, rat, rdt
    };
  }

  export interface FinalizedCommentStats {
    tid: number;
    n_success: number;
    n_trials: number;
    p_success: number;
    p_test: number;
    repness: number;
    repness_test: number;
    repful_for: 'agree' | 'disagree';
    best_agree?: boolean; // Optional flag for best agree comment
  }
  
// Finalize comment stats for client consumption
function finalizeCommentStats(tid: number, stats: any): FinalizedCommentStats {
    const { na, nd, ns, pa, pd, pat, pdt, ra, rd, rat, rdt } = stats;
    
    // Choose between agree/disagree based on which is more representative
    const isAgreeMoreRep = rat > rdt;
    const repful_for = isAgreeMoreRep ? 'agree' : 'disagree';
    
    return {
      tid,
      n_success: isAgreeMoreRep ? na : nd,
      n_trials: ns,
      p_success: isAgreeMoreRep ? pa : pd,
      p_test: isAgreeMoreRep ? pat : pdt,
      repness: isAgreeMoreRep ? ra : rd,
      repness_test: isAgreeMoreRep ? rat : rdt,
      repful_for
    };
  }
  
  // Calculate repness metric for sorting
  function repnessMetric(data: FinalizedCommentStats): number {
    return data.repness * data.repness_test * data.p_success * data.p_test;
  }
  
  // Order comments with agrees before disagrees
  function agreesBeforeDisagrees(comments: FinalizedCommentStats[]): FinalizedCommentStats[] {
    const agrees = comments.filter(c => c.repful_for === 'agree');
    const disagrees = comments.filter(c => c.repful_for === 'disagree');
    return [...agrees, ...disagrees];
  }
  
  

  export function selectRepComments(commentStatsWithTid: [number, Record<string, any>][]): Record<string, FinalizedCommentStats[]> {
    // Initialize result structure with empty arrays for each group ID
    const result: Record<string, {
      best: FinalizedCommentStats | null,
      best_agree: any | null,
      sufficient: FinalizedCommentStats[]
    }> = {};
    
    // Get all group IDs from the first comment's data
    if (commentStatsWithTid.length === 0) return {};
    
    const groupIds = Object.keys(commentStatsWithTid[0][1]);
    
    // Initialize result structure
    groupIds.forEach(gid => {
      result[gid] = { best: null, best_agree: null, sufficient: [] };
    });
    
    // Process each comment
    commentStatsWithTid.forEach(([tid, groupsData]) => {
      // For each group
      Object.entries(groupsData).forEach(([gid, commentStats]) => {
        const groupResult = result[gid];
        
        // Check if comment passes significance test
        if (passesByTest(commentStats)) {
          const finalizedStats = finalizeCommentStats(tid, commentStats);
          groupResult.sufficient.push(finalizedStats);
        }
        
        // Always track the best comment
        if (beatsBestByTest(commentStats, groupResult.best?.repness_test || null)) {
          groupResult.best = finalizeCommentStats(tid, commentStats);
        }
        
        // Track the best agreement comment
        if (beatsBestAgr(commentStats, groupResult.best_agree)) {
          groupResult.best_agree = { ...commentStats, tid };
        }
      });
    });
    
    // Transform the result structure
    const finalResult: Record<string, FinalizedCommentStats[]> = {};
    
    Object.entries(result).forEach(([gid, { best, best_agree, sufficient }]) => {
      // If no sufficient comments, use the best
      if (sufficient.length === 0) {
        finalResult[gid] = best ? [best] : [];
      } else {
        // Finalize the best_agree comment if we have one
        let bestAgreeComment: FinalizedCommentStats | null = null;
        if (best_agree) {
          bestAgreeComment = finalizeCommentStats(best_agree.tid, best_agree);
          bestAgreeComment.best_agree = true;
        }
        
        // Start with best agree if we have it
        let selectedComments: FinalizedCommentStats[] = [];
        if (bestAgreeComment) {
          selectedComments.push(bestAgreeComment);
          // Remove it from sufficient if it's there
          sufficient = sufficient.filter(c => c.tid !== bestAgreeComment!.tid);
        }
        
        // Add sorted sufficient comments
        const sortedSufficient = sufficient.sort((a, b) => 
          repnessMetric(b) - repnessMetric(a)
        );
        
        // Add up to 5 comments total, including best_agree
        selectedComments = [...selectedComments, ...sortedSufficient].slice(0, 5);
        
        // Sort with agrees before disagrees
        finalResult[gid] = agreesBeforeDisagrees(selectedComments);
      }
    });
    
    return finalResult;
  }