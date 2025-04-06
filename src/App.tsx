import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { SimulationProvider, useSimulation } from './context/SimulationContext.tsx';
import VoteMatrix from './components/VoteMatrix.tsx';
import PCAProjection from './components/PCAProjection.tsx';
import GroupAnalysis from './components/GroupAnalysis.tsx';
import SimulationControls from './components/SimulationControls.tsx';
import useVoteMatrix from './hooks/useVoteMatrix.ts';
import usePCA from './hooks/usePCA.ts';
import useGroupIdentification from './hooks/useGroupIdentification.ts';
import { debug } from './utils/debug.ts';
import Papa from 'papaparse';
import './App.css';

const DEFAULT_POLIS_REPORT = 'https://pol.is/api/v3/reportExport/r3nhe9auvzhr36dwaytsk/participant-votes.csv'

const parseVoteMatrixCSV = (csvString) => {
  // Use Papa Parse to parse the CSV properly
  const parseResult = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true
  });

  // Extract headers from the parse results
  const headers = parseResult.meta.fields;

  // Initialize return objects
  const metadata = [];
  const data = [];

  // Process each row
  parseResult.data.forEach(row => {
    // Extract metadata (first 6 columns)
    const participantMetadata = {
      'participant': row['participant'] || '',
      'group-id': row['group-id'] || '',
      'n-comments': parseInt(row['n-comments']) || 0,
      'n-votes': parseInt(row['n-votes']) || 0,
      'n-agree': parseInt(row['n-agree']) || 0,
      'n-disagree': parseInt(row['n-disagree']) || 0
    };
    metadata.push(participantMetadata);

    // Extract vote data (columns after the first 6)
    const voteData = headers.slice(6).map(header => {
      const vote = row[header];
      // Convert to appropriate type: 1 for agree, -1 for disagree, 0 for pass/skip
      if (vote === '1') return 1;
      if (vote === '-1') return -1;
      return 0;
    });

    data.push(voteData);
  });

  return { metadata, data };
};

const parseCommentsCSV = (csvString) => {
  // Use Papa Parse to handle CSV parsing with proper escaping
  const parseResult = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true
  });

  // Map the parsed data to our comment structure
  const comments = parseResult.data.map(row => ({
    timestamp: row['timestamp'] || '',
    datetime: row['datetime'] || '',
    id: row['comment-id'] || '',
    author_id: row['author-id'] || '',
    agrees: parseInt(row['agrees']) || 0,
    disagrees: parseInt(row['disagrees']) || 0,
    moderated: row['moderated'] || '',
    text: row['comment-body'] || ''
  }));

  // Sort comments by ID
  comments.sort((a, b) => {
    // If IDs are numeric, convert to numbers for comparison
    const idA = isNaN(Number(a.id)) ? a.id : Number(a.id);
    const idB = isNaN(Number(b.id)) ? b.id : Number(b.id);

    // Sort in ascending order
    return idA > idB ? 1 : idA < idB ? -1 : 0;
  });

  return comments;
};

const parseVotesLogCSV = (csvString) => {
  const parseResult = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true
  });

  // Create a map of participant ID to their votes
  const participantVotes = {};

  parseResult.data.forEach(row => {
    const participantId = row['voter-id'];
    const commentId = row['comment-id'];
    const vote = row['vote'];

    if (!participantVotes[participantId]) {
      participantVotes[participantId] = {};
    }

    participantVotes[participantId][commentId] = parseInt(vote, 10);
  });

  return participantVotes;
};

const ConsensusBarChart = ({ groups, comments, commentTexts, voteMatrix, sortByZScore = false }) => {
  if (!comments || comments.length === 0) {
    return <div>No comments with sufficient consensus</div>;
  }

  // Total number of participants who could have voted
  const totalParticipants = voteMatrix ? voteMatrix.length : 0;

  // Sort comments based on the requested sort method
  const sortedComments = [...comments].sort((a, b) => {
    if (sortByZScore) {
      // Get maximum absolute z-score for each comment
      const aMaxZScore = Math.max(
        a.agreementZScore || 0,
        a.disagreementZScore || 0,
        0
      );
      const bMaxZScore = Math.max(
        b.agreementZScore || 0,
        b.disagreementZScore || 0,
        0
      );

      // Sort by maximum absolute z-score (higher values first)
      return bMaxZScore - aMaxZScore;
    } else {
      // Default sort by participation count
      return (b.numSeen || b.totalVotes || 0) - (a.numSeen || a.totalVotes || 0);
    }
  });

  return (
    <table className="consensus-table">
      <thead>
        <tr>
          <th className="comment-header">Comment</th>
          <th className="stats-header">Overall</th>
          {groups && groups.length > 0 && groups.map((group, groupIndex) => (
            <th key={groupIndex} className="stats-header">
              Group {groupIndex + 1} ({group.points.length})
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedComments.map((comment) => {
          // Use the values directly from the comment object
          const agrees = comment.numAgrees || comment.agrees || 0;
          const disagrees = comment.numDisagrees || comment.disagrees || 0;
          const totalSeen = comment.numSeen || comment.totalVotes || 0;

          // Use the passes value if provided, otherwise calculate it
          let passes = comment.numPasses || 0;
          let noVotes = 0;

          // Only calculate passes and noVotes if they're not provided
          if (voteMatrix && voteMatrix.length > 0 && !comment.numPasses) {
            voteMatrix.forEach(participantVotes => {
              const vote = participantVotes[comment.commentId || comment.commentIndex];
              if (vote === 0) passes++;
              if (vote === null) noVotes++;
            });
          }

          // Calculate percentages based on TOTAL participants
          const agreePercent = (agrees / totalParticipants) * 100;
          const disagreePercent = (disagrees / totalParticipants) * 100;
          const passPercent = (passes / totalParticipants) * 100;
          const noVotePercent = (noVotes / totalParticipants) * 100;

          // Get comment index from either format
          const commentIndex = comment.commentId !== undefined ? comment.commentId : comment.commentIndex;

          // Calculate vote percentages for the text label (out of those who voted)
          const totalVotes = agrees + disagrees + passes;
          const agreeVotePercent = totalVotes > 0 ? (agrees / totalVotes) * 100 : 0;
          const disagreeVotePercent = totalVotes > 0 ? (disagrees / totalVotes) * 100 : 0;
          const passVotePercent = totalVotes > 0 ? (passes / totalVotes) * 100 : 0;

          return (
            <tr key={commentIndex}>
              <td className="comment-cell">
                <div className="comment-text-preview">
                  <span className="comment-id-text">
                    {commentTexts?.[commentIndex]?.id || `Comment ${commentIndex + 1}`}:
                  </span>
                  {comment.text || comment.commentText}
                </div>
              </td>
              <td className="consensus-cell">
                <div className="consensus-bar-wrapper">
                  <div className="consensus-bar-multi">
                    <div
                      className="agree-bar"
                      style={{
                        width: `${agreePercent}%`,
                      }}
                      title={`${Math.round(agreePercent)}% of all participants agree (${agrees} votes)`}
                    />
                    <div
                      className="disagree-bar"
                      style={{
                        width: `${disagreePercent}%`,
                      }}
                      title={`${Math.round(disagreePercent)}% of all participants disagree (${disagrees} votes)`}
                    />
                    <div
                      className="pass-bar"
                      style={{
                        width: `${passPercent}%`,
                      }}
                      title={`${Math.round(passPercent)}% of all participants pass (${passes} votes)`}
                    />
                    <div
                      className="no-vote-bar"
                      style={{
                        width: `${noVotePercent}%`,
                      }}
                      title={`${Math.round(noVotePercent)}% of all participants didn't vote (${noVotes} participants)`}
                    />
                  </div>
                </div>
                <div className="consensus-stats">
                  <div className="vote-breakdown">
                    <span className="agree-count">{agrees} agree ({Math.round(agreeVotePercent)}%)</span>
                    <span className="disagree-count">{disagrees} disagree ({Math.round(disagreeVotePercent)}%)</span>
                    <span className="pass-count">{passes} pass ({Math.round(passVotePercent)}%)</span>
                  </div>
                </div>
              </td>
              
              {groups && groups.length > 0 && groups.map((group, groupIndex) => {
                // Calculate stats for just this group
                let groupAgrees = 0;
                let groupDisagrees = 0;
                let groupPasses = 0;
                let groupNoVotes = 0;
                
                if (voteMatrix) {
                  group.points.forEach(participantIndex => {
                    const vote = voteMatrix[participantIndex][commentIndex];
                    if (vote === 1) groupAgrees++;
                    else if (vote === -1) groupDisagrees++;
                    else if (vote === 0) groupPasses++;
                    else groupNoVotes++;
                  });
                }
                
                const groupTotal = group.points.length;
                const groupTotalVotes = groupAgrees + groupDisagrees + groupPasses;
                
                // Calculate percentages for this group
                const groupAgreePercent = (groupAgrees / groupTotal) * 100;
                const groupDisagreePercent = (groupDisagrees / groupTotal) * 100;
                const groupPassPercent = (groupPasses / groupTotal) * 100;
                const groupNoVotePercent = (groupNoVotes / groupTotal) * 100;
                
                // Calculate vote percentages out of those who voted in this group
                const groupAgreeVotePercent = groupTotalVotes > 0 ? (groupAgrees / groupTotalVotes) * 100 : 0;
                const groupDisagreeVotePercent = groupTotalVotes > 0 ? (groupDisagrees / groupTotalVotes) * 100 : 0;
                const groupPassVotePercent = groupTotalVotes > 0 ? (groupPasses / groupTotalVotes) * 100 : 0;

                return (
                  <td key={groupIndex} className="consensus-cell">
                    <div className="consensus-bar-wrapper">
                      <div className="consensus-bar-multi">
                        <div
                          className="agree-bar"
                          style={{
                            width: `${groupAgreePercent}%`,
                          }}
                          title={`${Math.round(groupAgreePercent)}% of Group ${groupIndex + 1} agree (${groupAgrees} votes)`}
                        />
                        <div
                          className="disagree-bar"
                          style={{
                            width: `${groupDisagreePercent}%`,
                          }}
                          title={`${Math.round(groupDisagreePercent)}% of Group ${groupIndex + 1} disagree (${groupDisagrees} votes)`}
                        />
                        <div
                          className="pass-bar"
                          style={{
                            width: `${groupPassPercent}%`,
                          }}
                          title={`${Math.round(groupPassPercent)}% of Group ${groupIndex + 1} pass (${groupPasses} votes)`}
                        />
                        <div
                          className="no-vote-bar"
                          style={{
                            width: `${groupNoVotePercent}%`,
                          }}
                          title={`${Math.round(groupNoVotePercent)}% of Group ${groupIndex + 1} didn't vote (${groupNoVotes} participants)`}
                        />
                      </div>
                    </div>
                    <div className="consensus-stats">
                      <div className="vote-breakdown">
                        <span className="agree-count">{groupAgrees} ({Math.round(groupAgreeVotePercent)}%)</span>
                        <span className="disagree-count">{groupDisagrees} ({Math.round(groupDisagreeVotePercent)}%)</span>
                        <span className="pass-count">{groupPasses} ({Math.round(groupPassVotePercent)}%)</span>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

// Helper function to check if z-score is significant at 90% confidence
function zSig90(zVal: number): boolean {
  return zVal > 1.2816;
}

// Test if a proportion differs from 0.5
function propTest(succ: number, n: number): number {
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

const SimulationContent = () => {
  const {
    participants,
    comments,
    agreePercentage,
    disagreePercentage,
    consensusGroups,
    groupSizes,
    groupSimilarity,
    voteMatrix,
    setVoteMatrix,
    pcaProjection,
    setPcaProjection,
    groups,
    setGroups,
    selectedGroup,
    setSelectedGroup,
    consensusScores,
    consensusThreshold,
    setConsensusThreshold,
    highlightComment,
    highlightedComment,
    resetState,
    kMeansK,
    updateKMeansK,
    silhouetteCoefficients,
    bestK,
    calculateSilhouetteCoefficients
  } = useSimulation();

  const [dataUrl, setDataUrl] = useState(DEFAULT_POLIS_REPORT);
  const [urlError, setUrlError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [usingImportedData, setUsingImportedData] = useState(false);
  const [commentTexts, setCommentTexts] = useState([]);
  const [topConsensusComments, setTopConsensusComments] = useState([]);
  const [groupConsensusData, setGroupConsensusData] = useState([]);

  // Add a state to track initialization
  const [initialized, setInitialized] = useState(false);

  const [activeTab, setActiveTab] = useState('import'); // <'import' | 'random'>

  const [votesLogData, setVotesLogData] = useState(null);

  const [polisStats, setPolisStats] = useState(null);

  const [commentZScores, setCommentZScores] = useState({});

  const [repComments, setRepComments] = useState(null);

  const [groupZScores, setGroupZScores] = useState(null);

  const [sortBy, setSortBy] = useState('overall'); // 'overall', 'groupZ-N', 'id'
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedZScoreGroup, setSelectedZScoreGroup] = useState('overall');
  const [sortType, setSortType] = useState('z-score'); // 'z-score' or 'vote-count'

  const [formattedRepComments, setFormattedRepComments] = useState(null);

  const validateAndFetchData = useCallback(() => {
    setUrlError('');

    if (!dataUrl) {
      setUrlError('Please enter a URL');
      return;
    }

    if (!dataUrl.endsWith('.csv')) {
      setUrlError('URL must point to a CSV file');
      return;
    }

    try {
      new URL(dataUrl);
    } catch (e) {
      setUrlError('Invalid URL format');
      return;
    }

    setIsLoading(true);

    // Calculate other URLs
    const commentsUrl = dataUrl.replace('participant-votes.csv', 'comments.csv');
    const votesLogUrl = dataUrl.replace('participant-votes.csv', 'votes.csv');

    // Helper function to handle proxy URL transformation
    const getProxiedUrl = (url) => {
      // Use relative path for proxy in production, or localhost in development
      const proxyBase = process.env.NODE_ENV === 'production'
        ? '/proxy/'
        : 'http://localhost:3001/proxy/';

      return url.startsWith("https://pol.is/") ?
        url.replace("https://pol.is/", proxyBase) :
        url;
    };

    // Fetch all three files in parallel
    Promise.all([
      fetch(getProxiedUrl(dataUrl))
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error fetching votes! Status: ${response.status}`);
          }
          return response.text();
        }),
      fetch(getProxiedUrl(commentsUrl))
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error fetching comments! Status: ${response.status}`);
          }
          return response.text();
        }),
      fetch(getProxiedUrl(votesLogUrl))
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error fetching votes log! Status: ${response.status}`);
          }
          return response.text();
        })
    ])
    .then(async ([votesData, commentsData, votesLogData]) => {
      console.log('Data fetched successfully');

      // Parse CSV to JSON with our custom parsers
      const { metadata, data: originalVoteData } = parseVoteMatrixCSV(votesData);
      const allCommentData = parseCommentsCSV(commentsData);
      
      // Filter out comment 227
      const commentData = allCommentData.filter(comment => comment.id !== '227');
      
      const participantVotes = parseVotesLogCSV(votesLogData);

      // Filter participants who have voted on less than 7 comments
      const filteredMetadata = metadata.filter(participant => {
        // n-votes field already contains the count of votes for this participant
        return participant['n-votes'] >= 7;
      });
      
      // Create lookup maps for participants and comments
      const participantIdMap = filteredMetadata.map(p => p.participant);
      const commentIdMap = commentData.map(c => c.id);

      // Create a new vote matrix with null values by default
      const updatedVoteMatrix = Array(participantIdMap.length).fill(null).map(() =>
        Array(commentIdMap.length).fill(null)
      );

      // Fill in the vote matrix based on the votes log, using only filtered participants
      participantIdMap.forEach((participantId, participantIndex) => {
        if (participantVotes[participantId]) {
          commentIdMap.forEach((commentId, commentIndex) => {
            if (participantVotes[participantId][commentId] !== undefined) {
              updatedVoteMatrix[participantIndex][commentIndex] = participantVotes[participantId][commentId];
            }
          });
        }
      });

      console.log(`Filtered out ${metadata.length - filteredMetadata.length} participants with fewer than 7 votes`);

      // Set the updated vote matrix with nulls for unvoted items
      setVoteMatrix(updatedVoteMatrix);
      setCommentTexts(commentData);
      setVotesLogData(votesLogData);

      // Mark that we're using imported data
      setUsingImportedData(true);

      setIsLoading(false);
    })
    .catch(error => {
      setUrlError(`Failed to fetch data: ${error.message}`);
      setIsLoading(false);
    });
  }, [dataUrl, setVoteMatrix]);

  const { generateRandomVoteMatrix, handleVoteChange } = useVoteMatrix(
    participants,
    comments,
    agreePercentage,
    disagreePercentage,
    consensusGroups,
    groupSizes,
    groupSimilarity,
    voteMatrix,
    setVoteMatrix
  );

  const performPCA = usePCA(voteMatrix);
  const identifyGroups = useGroupIdentification(pcaProjection, kMeansK);

  const generateNewVoteMatrix = useCallback(() => {
    const newVoteMatrix = generateRandomVoteMatrix();
    setVoteMatrix(newVoteMatrix);
    debug("New vote matrix generated:", newVoteMatrix);
  }, [generateRandomVoteMatrix, setVoteMatrix]);

  // Modified useEffect to load data on component mount
  useEffect(() => {
    // Check if we've already initialized or if data is loading
    if (!initialized && !isLoading && !usingImportedData) {
      console.log('Loading default data on initialization');
      setInitialized(true);
      validateAndFetchData();
    }
  }, [initialized, isLoading, usingImportedData, validateAndFetchData]);

  // Separate useEffect for random data generation
  useEffect(() => {
    if (initialized && !isLoading && !usingImportedData) {
      generateNewVoteMatrix();
    }
  }, [initialized, isLoading, usingImportedData, generateNewVoteMatrix]);

  useEffect(() => {
    if (voteMatrix && voteMatrix.length > 0) {
      const newPcaProjection = performPCA();
      setPcaProjection(newPcaProjection);
      calculateSilhouetteCoefficients(newPcaProjection);
    }
  }, [voteMatrix, performPCA, setPcaProjection, calculateSilhouetteCoefficients]);

  // Add a new effect to automatically set k to the best value when best k is determined
  useEffect(() => {
    if (bestK !== null && bestK > 0) {
      console.log(`Setting k-means k to best value: ${bestK}`);
      updateKMeansK(bestK);
    }
  }, [bestK, updateKMeansK]);

  useEffect(() => {
    if (pcaProjection && pcaProjection.length > 0) {
      const newGroups = identifyGroups();
      setGroups(newGroups);
    }
  }, [pcaProjection, identifyGroups, setGroups]);

  useEffect(() => {
    // Skip calculations if no groups or no vote matrix
    if (!voteMatrix || voteMatrix.length === 0 || !commentTexts || commentTexts.length === 0) {
      return;
    }

    // Create an updated copy of commentTexts with pass counts
    const updatedCommentTexts = commentTexts.map((comment, index) => {
      // Calculate passes for this comment
      let passes = 0;

      voteMatrix.forEach(participantVotes => {
        const vote = participantVotes[index];
        if (vote === 0) passes++;
      });

      // Return a new object with the pass count added
      return {
        ...comment,
        passes: passes
      };
    });

    // Update comment texts with the calculated pass counts
    setCommentTexts(updatedCommentTexts);

  }, [voteMatrix, commentTexts.length]); // Only recalculate when vote matrix changes or comment length changes

  useEffect(() => {
    // Only calculate if we have vote data AND groups have been identified
    if (!voteMatrix || voteMatrix.length === 0 || !voteMatrix[0] || !groups || groups.length === 0) {
      setTopConsensusComments([]);
      return;
    }

    const commentCount = voteMatrix[0].length;
    const participantCount = voteMatrix.length;
    const consensusThreshold = 0.6; // 60% threshold
    const consensusMinimumComments = 4;

    const consensusData = [];

    // For each comment, calculate percentage of agreeing and disagreeing votes
    for (let j = 0; j < commentCount; j++) {
      let agrees = 0;
      let disagrees = 0;

      for (let i = 0; i < participantCount; i++) {
        if (voteMatrix[i][j] === 1) {
          agrees++;
        } else if (voteMatrix[i][j] === -1) {
          disagrees++;
        }
      }

      // Total number of votes for this comment (excluding passes)
      const totalVotes = agrees + disagrees;

      if (totalVotes < consensusMinimumComments) continue;

      const agreePercent = agrees / totalVotes;
      const disagreePercent = disagrees / totalVotes;

      // Check if either percentage meets our threshold
      if (agreePercent >= consensusThreshold || disagreePercent >= consensusThreshold) {
        consensusData.push({
          commentId: j,
          commentText: commentTexts?.[j]?.text || `Comment ${j + 1}`,
          agreePercent,
          disagreePercent,
          consensusType: agreePercent >= disagreePercent ? 'agree' : 'disagree',
          consensusPercent: Math.max(agreePercent, disagreePercent),
          totalVotes: totalVotes, // Add this to track total votes
          agrees: agrees,         // Store the number of agree votes
          disagrees: disagrees    // Store the number of disagree votes
        });
      }
    }

    // Sort by total vote count (descending) rather than consensus percentage
    const topConsensus = consensusData
      .sort((a, b) => b.totalVotes - a.totalVotes)
      .slice(0, 10);
    topConsensus.reverse()

    setTopConsensusComments(topConsensus);
  }, [voteMatrix, commentTexts, groups]); // Add groups to dependencies

  useEffect(() => {
    // Skip calculations if no groups or no vote matrix
    if (!groups || groups.length === 0 ||
        !voteMatrix || voteMatrix.length === 0 || !voteMatrix[0]) {
      setGroupConsensusData([]);
      return;
    }

    const consensusThreshold = 0.6; // 60% threshold
    const consensusMinimumComments = 3; // Lower minimum for groups
    const commentCount = voteMatrix[0].length;

    // Calculate consensus for each group
    const newGroupConsensusData = groups.map(group => {
      const groupParticipantIndices = group.points || [];
      const consensusData = [];

      // For each comment, calculate percentage of agreeing and disagreeing votes
      for (let j = 0; j < commentCount; j++) {
        let agrees = 0;
        let disagrees = 0;

        // Only consider votes from participants in this group
        for (let i = 0; i < groupParticipantIndices.length; i++) {
          const participantIndex = groupParticipantIndices[i];
          if (voteMatrix[participantIndex][j] === 1) {
            agrees++;
          } else if (voteMatrix[participantIndex][j] === -1) {
            disagrees++;
          }
        }

        // Total number of votes for this comment from this group
        const totalVotes = agrees + disagrees;

        if (totalVotes < consensusMinimumComments) continue;

        const agreePercent = agrees / totalVotes;
        const disagreePercent = disagrees / totalVotes;

        // Check if either percentage meets our threshold
        if (agreePercent >= consensusThreshold || disagreePercent >= consensusThreshold) {
          consensusData.push({
            commentId: j,
            commentText: commentTexts?.[j]?.text || `Comment ${j + 1}`,
            agreePercent,
            disagreePercent,
            consensusType: agreePercent >= disagreePercent ? 'agree' : 'disagree',
            consensusPercent: Math.max(agreePercent, disagreePercent),
            totalVotes: totalVotes,
            agrees: agrees,
            disagrees: disagrees
          });
        }
      }

      // Sort by total vote count (descending)
      return consensusData
        .sort((a, b) => b.totalVotes - a.totalVotes)
        .slice(0, 10);
    });

    setGroupConsensusData(newGroupConsensusData);
  }, [groups, voteMatrix, commentTexts]); // Dependencies for this effect

  // Modify the Polis statistics useEffect
  useEffect(() => {
    // Only run if we have data to analyze AND groups have been identified
    if (!voteMatrix || voteMatrix.length === 0 ||
      !commentTexts || commentTexts.length === 0 ||
      !groups || groups.length === 0) {
      setPolisStats(null);
      return;
    }

    console.log('Calculating Polis statistics');

    // Create arrays to store top comments for agreement and disagreement
    let topAgreeComments = [];
    let topDisagreeComments = [];

    // Create an object to store z-scores for ALL comments
    const allCommentZScores = {};

    // Process each comment - calculate stats for ALL comments
    commentTexts.forEach((comment, commentIndex) => {
      // Initialize counters
      let agrees = 0;
      let disagrees = 0;
      let passes = 0;
      let totalSeen = 0;

      // Count votes for this comment
      voteMatrix.forEach(participantVotes => {
        const vote = participantVotes[commentIndex];

        // Only count non-null votes as "seen"
        if (vote !== null) {
          totalSeen++;

          if (vote === 1) agrees++;
          else if (vote === -1) disagrees++;
          else if (vote === 0) passes++;
        }
      });

      // 1. Bayesian Agreement Probability Calculation
      const agreementProb = (agrees + 1) / (totalSeen + 2);
      const disagreementProb = (disagrees + 1) / (totalSeen + 2);

      // 2. Statistical Significance Calculation
      const agreementZScore = propTest(agrees, totalSeen);
      const disagreementZScore = propTest(disagrees, totalSeen);

      // Check if statistically significant at 90% confidence
      const isAgreeSignificant = zSig90(agreementZScore);
      const isDisagreeSignificant = zSig90(disagreementZScore);

      // Composite metrics (agreement/disagreement probability * z-score)
      const agreementMetric = agreementProb * agreementZScore;
      const disagreementMetric = disagreementProb * disagreementZScore;

      // Create comment stat object
      const commentStat = {
        id: comment.id,
        commentIndex,
        text: comment.text,
        numAgrees: agrees,
        numDisagrees: disagrees,
        numPasses: passes,
        numSeen: totalSeen,
        agreementProb,
        disagreementProb,
        agreementZScore,
        disagreementZScore,
        agreementMetric,
        disagreementMetric,
        isAgreeSignificant,
        isDisagreeSignificant
      };

      // Store z-scores for ALL comments
      allCommentZScores[commentIndex] = {
        agreementZScore,
        disagreementZScore,
        isAgreeSignificant,
        isDisagreeSignificant
      };

      // Check for agreement significance
      if (agreementProb > 0.5 && isAgreeSignificant) {
        // Add to top agree comments if eligible
        if (topAgreeComments.length < 5) {
          topAgreeComments.push(commentStat);
          // Sort by agreement metric (highest first)
          topAgreeComments.sort((a, b) => b.agreementMetric - a.agreementMetric);
        } else if (agreementMetric > topAgreeComments[4].agreementMetric) {
          // Replace lowest entry if this one has higher metric
          topAgreeComments[4] = commentStat;
          // Re-sort the array
          topAgreeComments.sort((a, b) => b.agreementMetric - a.agreementMetric);
        }
      }

      // Check for disagreement significance
      if (disagreementProb > 0.5 && isDisagreeSignificant) {
        // Add to top disagree comments if eligible
        if (topDisagreeComments.length < 5) {
          topDisagreeComments.push(commentStat);
          // Sort by disagreement metric (highest first)
          topDisagreeComments.sort((a, b) => b.disagreementMetric - a.disagreementMetric);
        } else if (disagreementMetric > topDisagreeComments[4].disagreementMetric) {
          // Replace lowest entry if this one has higher metric
          topDisagreeComments[4] = commentStat;
          // Re-sort the array
          topDisagreeComments.sort((a, b) => b.disagreementMetric - a.disagreementMetric);
        }
      }
    });

    // Store the top comments and ALL z-scores in the state
    const statsData = {
      consensusComments: {
        agree: topAgreeComments,
        disagree: topDisagreeComments
      },
      zScores: allCommentZScores
    };

    setPolisStats(statsData);
    console.log('Polis stats calculated:', statsData);

  }, [voteMatrix, commentTexts, groups]); // Add groups as a dependency

  // New useEffect hook to run statistics calculations after polisStats is computed
  useEffect(() => {
    // Only run if polisStats has been calculated
    if (!polisStats || !groups || groups.length === 0) {
      return;
    }

    console.log('Calculating representative comments and group-specific z-scores');

    try {
      // Prepare input data structure for stats calculations
      const commentStatsWithTid = [];
      // Create an object to store group-specific z-scores for all comments
      const groupSpecificZScores = {};

      // For each comment, prepare stats per group
      commentTexts.forEach((comment, commentIndex) => {
        const commentStats = {};
        // Create structure for this comment's group-specific z-scores
        groupSpecificZScores[commentIndex] = {};

        // Calculate stats for each group
        groups.forEach((group, groupIndex) => {
          let agrees = 0;
          let disagrees = 0;
          let passes = 0;
          let totalSeen = 0;

          // Count votes from this group
          group.points.forEach(participantIndex => {
            const vote = voteMatrix[participantIndex][commentIndex];
            if (vote !== null) {
              totalSeen++;
              if (vote === 1) agrees++;
              else if (vote === -1) disagrees++;
              else if (vote === 0) passes++;
            }
          });

          // Calculate base stats
          const agreementProb = (agrees + 1) / (totalSeen + 2);
          const disagreementProb = (disagrees + 1) / (totalSeen + 2);

          // Calculate group-specific z-scores
          const agreementZScore = propTest(agrees, totalSeen);
          const disagreementZScore = propTest(disagrees, totalSeen);
          
          // Check significance
          const isAgreeSignificant = zSig90(agreementZScore);
          const isDisagreeSignificant = zSig90(disagreementZScore);

          // Store group-specific z-scores
          groupSpecificZScores[commentIndex][groupIndex] = {
            agreementZScore,
            disagreementZScore,
            isAgreeSignificant,
            isDisagreeSignificant,
            agrees,
            disagrees,
            passes,
            totalSeen
          };

          // Store basic stats for this comment and group (as before)
          commentStats[groupIndex] = {
            na: agrees,
            nd: disagrees,
            ns: totalSeen,
            pa: agreementProb,
            pd: disagreementProb,
            pat: polisStats.zScores[commentIndex]?.agreementZScore || 0,
            pdt: polisStats.zScores[commentIndex]?.disagreementZScore || 0
          };
        });

        // Add comment with stats to the collection
        commentStatsWithTid.push([commentIndex, commentStats]);
      });

      // Store the group-specific z-scores in state
      setGroupZScores(groupSpecificZScores);

      // Process the stats to get comparative stats for each group
      const commentStatsWithComparatives = commentStatsWithTid.map(([tid, groupStats]) => {
        const processedGroupStats = {};

        // For each group, add comparative stats
        Object.entries(groupStats).forEach(([groupId, stats]) => {
          // Get stats from all other groups
          const otherGroupStats = Object.entries(groupStats)
            .filter(([gid]) => gid !== groupId)
            .map(([_, stats]) => stats);

          // Add comparative stats
          processedGroupStats[groupId] = addComparativeStats(stats, otherGroupStats);
        });

        return [tid, processedGroupStats];
      });

      // Select representative comments for each group
      const representativeComments = selectRepComments(commentStatsWithComparatives);

      // Store results in state
      setRepComments(representativeComments);
      console.log('Representative comments calculated:', representativeComments);
    } catch (error) {
      console.error('Error calculating representative comments:', error);
    }

  }, [voteMatrix, commentTexts, groups, polisStats]); // Run when polisStats or groups change

  useEffect(() => {
    // Only run when we have all the necessary data
    if (!repComments || !groups || !commentTexts || groups.length === 0) {
      setFormattedRepComments(null);
      return;
    }

    console.log('Formatting representative comments for display');
    
    // Process the data for each group
    const processedData = groups.map((group, groupIndex) => {
      const groupRepComments = repComments[groupIndex] || [];
      
      // Format each comment with display-ready information
      const formattedComments = groupRepComments.map(comment => {
        const commentText = commentTexts[comment.tid]?.text || `Comment ${comment.tid + 1}`;
        const commentId = commentTexts[comment.tid]?.id || comment.tid.toString();
        const repType = comment.repful_for === 'agree' ? 'Agreement' : 'Disagreement';
        const repnessScore = (comment.repness).toFixed(2);
        const supportPercent = Math.round((comment.n_success / comment.n_trials) * 100);
        
        return {
          ...comment,
          commentText,
          commentId,
          repType,
          repnessScore,
          supportPercent
        };
      });
      
      return {
        groupIndex,
        groupSize: group.points.length,
        comments: formattedComments
      };
    });
    
    setFormattedRepComments(processedData);
  }, [repComments, groups, commentTexts]); // Dependencies ensure this runs when any of these change

  const handleReset = () => {
    setUsingImportedData(false);
    resetState();
    generateNewVoteMatrix()
  };

  
  // Modify the handle sort function to support the new sort type
  const handleSortChange = (sortField) => {
    // If clicking on a z-score column, use the currently selected group for sorting
    if (sortField === 'overallZ') {
      if (sortBy === selectedZScoreGroup && sortType === 'z-score') {
        // Toggle direction if already sorting by this field and type
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        // Set new sort by the selected group with z-score type
        setSortBy(selectedZScoreGroup);
        setSortType('z-score');
        setSortDirection('desc');
      }
    } else if (sortField === 'votes') {
      if (sortBy === selectedZScoreGroup && sortType === 'vote-count') {
        // Toggle direction if already sorting by votes
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        // Set new sort by votes for the selected group
        setSortBy(selectedZScoreGroup);
        setSortType('vote-count');
        setSortDirection('desc'); // Default to showing most votes first
      }
    } else {
      // For other columns like ID, use original logic
      if (sortBy === sortField) {
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSortBy(sortField);
        setSortType('default');
        setSortDirection('desc');
      }
    }
  };

  // Add this function to handle dropdown changes
  const handleZScoreGroupChange = (e) => {
    const newGroup = e.target.value;
    setSelectedZScoreGroup(newGroup);
    
    // If already sorting by the selected group, maintain the current sort type
    if (sortBy === 'overall' || sortBy.startsWith('groupZ-')) {
      setSortBy(newGroup);
      // Keep the current sort direction and sort type
    }
  };

  // Add this function to handle sort type changes
  const handleSortTypeChange = (e) => {
    const newSortType = e.target.value;
    setSortType(newSortType);
    
    // Apply the new sort type to the current group
    if (sortBy === 'overall' || sortBy.startsWith('groupZ-')) {
      // Keep sorting by the same group but with new sort type
      // Keep the current sort direction
    }
  };

  // Function to get comment vote count for a specific group
  const getGroupVoteCount = (groupZScores, commentIndex, groupIndex) => {
    if (!groupZScores || !groupZScores[commentIndex] || !groupZScores[commentIndex][groupIndex]) return 0;
    const groupData = groupZScores[commentIndex][groupIndex];
    // Total votes is agrees + disagrees (we don't count passes as votes for significance)
    return groupData.agrees + groupData.disagrees;
  };

  // Function to get overall vote count
  const getOverallVoteCount = (comment) => {
    return comment.agrees + comment.disagrees;
  };

  // Function to check if a comment is significant for the selected group
  const isSignificantForGroup = (zScoreData, groupZScores, commentIndex, selectedGroup) => {
    if (selectedGroup === 'overall') {
      return zScoreData && (zScoreData.isAgreeSignificant || zScoreData.isDisagreeSignificant);
    } else if (selectedGroup.startsWith('groupZ-')) {
      const groupIndex = parseInt(selectedGroup.split('-')[1]);
      const groupData = groupZScores?.[commentIndex]?.[groupIndex];
      return groupData && (groupData.isAgreeSignificant || groupData.isDisagreeSignificant);
    }
    return false;
  };

  // Add this function to get the max absolute z-score for sorting
  const getMaxZScore = (zScoreData) => {
    if (!zScoreData) return 0;
    return Math.max(
      zScoreData.agreementZScore || 0,
      zScoreData.disagreementZScore || 0,
      0
    );
  };

  // Add this function to get max absolute z-score for a specific group
  const getGroupMaxZScore = (groupZScores, commentIndex, groupIndex) => {
    if (!groupZScores || !groupZScores[commentIndex] || !groupZScores[commentIndex][groupIndex]) return 0;
    const groupData = groupZScores[commentIndex][groupIndex];
    return Math.max(
      groupData.agreementZScore || 0,
      groupData.disagreementZScore || 0,
      0
    );
  };

  return (
    <div className="App">
      <h1>Polis Simulation</h1>
      <p style={{ maxWidth: "500px", margin: "0 auto 35px" }}>
        This page implements Polis collaborative polling algorithms in the browser,
        including PCA, k-means clustering, and consensus scoring.{" "}
        <strong>This implementation has not been audited, and should be considered an early research prototype.</strong>
      </p>

      {/* Tabs UI */}
      <div className="tabs-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            Import Data
          </button>
          <button
            className={`tab ${activeTab === 'random' ? 'active' : ''}`}
            onClick={() => setActiveTab('random')}
          >
            Simulate Randomized Voters
          </button>
        </div>

        {/* Tab content */}
        <div className="tab-content">
          {activeTab === 'import' && (
            <div className="import-tab">
              <p>
                Enter the report to analyze
                <div style={{ fontSize: "80%", color: "#666", marginTop: 2 }}>
                  e.g. https://pol.is/api/v3/reportExport/.../participant-votes.csv
                </div>
              </p>

              <input
                style={{ width: "400px" }}
                type="text"
                placeholder="Data Export URL (participant-votes.csv)"
                onChange={(e) => setDataUrl(e.target.value)}
                value={dataUrl}
              />
              {urlError && <div className="error-message">{urlError}</div>}
              <br/>
              <button
                onClick={validateAndFetchData}
                disabled={!dataUrl}
              >
                Fetch Data
              </button>
            </div>
          )}

          {activeTab === 'random' && (
            <div className="random-tab">
              <SimulationControls />
              <button onClick={() => {
                handleReset()
              }}>Generate New Random Votes</button>
            </div>
          )}
        </div>
      </div>

      {/* <button onClick={handleReset}>Reset</button> */}
      <div className="data-source-indicator">
        {usingImportedData
          ? `Currently showing imported data from CSV file (${voteMatrix ? voteMatrix.length : 0} participants, ${commentTexts ? commentTexts.length : 0} comments)`
          : 'Currently showing randomly generated data'}
      </div>

      {/* Comments Table - keep outside tabs */}
      {usingImportedData && commentTexts && commentTexts.length > 0 && (
        <div className="comments-table-container">
          <div className="table-controls">
            <div className="group-selector">
              <label htmlFor="zScoreGroup">Show Data For: </label>
              <select 
                id="zScoreGroup" 
                value={selectedZScoreGroup} 
                onChange={handleZScoreGroupChange}
              >
                <option value="overall">Overall</option>
                {groups && groups.map((_, groupIndex) => (
                  <option key={groupIndex} value={`groupZ-${groupIndex}`}>
                    Group {groupIndex + 1}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="sort-type-selector">
              <label htmlFor="sortType">Sort By: </label>
              <select 
                id="sortType" 
                value={sortType} 
                onChange={handleSortTypeChange}
              >
                <option value="z-score">Z-Score</option>
                <option value="vote-count">Vote Count</option>
              </select>
              
              <button 
                className={`sort-direction-toggle ${sortDirection === 'desc' ? 'active' : ''}`}
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                title={sortDirection === 'desc' ? 'Sort descending' : 'Sort ascending'}
              >
                {sortDirection === 'desc' ? '↓ Highest First' : '↑ Lowest First'}
              </button>
            </div>
          </div>

          <table className="comments-table">
            <thead>
              <tr>
                <th onClick={() => handleSortChange('id')} className="sortable-header">
                  ID {sortBy === 'id' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
                <th>Comment Text</th>
                <th>Agrees</th>
                <th>Disagrees</th>
                <th>Passes</th>
                <th onClick={() => handleSortChange('overallZ')} className="sortable-header">
                  Z-Scores (Agree, Disagree) 
                  {sortBy !== 'id' && sortType === 'z-score' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                </th>
                <th onClick={() => handleSortChange('votes')} className="sortable-header">
                  Votes
                  {sortBy !== 'id' && sortType === 'vote-count' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                </th>
                <th>Author</th>
              </tr>
            </thead>
            <tbody>
              {commentTexts
                .map((comment, index) => {
                  // Add sorting metadata to each comment
                  const zScoreData = polisStats?.zScores?.[index];
                  const maxOverallZScore = getMaxZScore(zScoreData);
                  const overallVoteCount = getOverallVoteCount(comment);
                  
                  return {
                    comment,
                    index,
                    maxOverallZScore,
                    overallVoteCount,
                    // Add ability to sort by any group's z-score
                    groupZScores: groups?.map((_, groupIndex) => 
                      getGroupMaxZScore(groupZScores, index, groupIndex)
                    ) || [],
                    // Add ability to sort by vote count for each group
                    groupVoteCounts: groups?.map((_, groupIndex) => 
                      getGroupVoteCount(groupZScores, index, groupIndex)
                    ) || [],
                    // Check if this comment is significant for the selected group
                    isSignificant: isSignificantForGroup(zScoreData, groupZScores, index, selectedZScoreGroup)
                  };
                })
                // Filter to only show significant comments if sorting by vote count
                .filter(item => {
                  if (sortType !== 'vote-count') return true;
                  return item.isSignificant;
                })
                .sort((a, b) => {
                  // Sort based on the selected field, group, and type
                  if (sortBy === 'id') {
                    // Sort by comment ID
                    const idA = parseInt(a.comment.id) || 0;
                    const idB = parseInt(b.comment.id) || 0;
                    return sortDirection === 'asc' ? idA - idB : idB - idA;
                  } else if (sortBy === 'overall') {
                    if (sortType === 'z-score') {
                      // Sort by overall z-score
                      return sortDirection === 'asc' 
                        ? a.maxOverallZScore - b.maxOverallZScore 
                        : b.maxOverallZScore - a.maxOverallZScore;
                    } else { // vote-count
                      // Sort by overall vote count
                      return sortDirection === 'asc' 
                        ? a.overallVoteCount - b.overallVoteCount 
                        : b.overallVoteCount - a.overallVoteCount;
                    }
                  } else if (sortBy.startsWith('groupZ-')) {
                    const groupIndex = parseInt(sortBy.split('-')[1]);
                    
                    if (sortType === 'z-score') {
                      // Sort by specific group z-score
                      const aScore = a.groupZScores[groupIndex] || 0;
                      const bScore = b.groupZScores[groupIndex] || 0;
                      return sortDirection === 'asc' ? aScore - bScore : bScore - aScore;
                    } else { // vote-count
                      // Sort by specific group vote count
                      const aVotes = a.groupVoteCounts[groupIndex] || 0;
                      const bVotes = b.groupVoteCounts[groupIndex] || 0;
                      return sortDirection === 'asc' ? aVotes - bVotes : bVotes - aVotes;
                    }
                  }
                  return 0;
                })
                .map(({ comment, index, isSignificant }) => {
                  // Original render code with modifications
                  const zScoreData = polisStats?.zScores?.[index];

                  return (
                    <React.Fragment key={index}>
                      <tr
                        onClick={() => highlightComment(index)}
                        className={`${highlightedComment === index ? 'highlighted-comment' : ''} ${sortType === 'vote-count' && !isSignificant ? 'non-significant-comment' : ''}`}>
                        <td>{comment.id}</td>
                        <td>
                          {comment.text}
                        </td>
                        <td className="vote-cell">
                          <div className="vote-count">{comment.agrees}</div>
                          {(comment.agrees || comment.disagrees || comment.passes) > 0 && (
                            <div className="vote-percent">
                              {Math.round((comment.agrees / (comment.agrees + comment.disagrees + (comment.passes || 0))) * 100)}%
                            </div>
                          )}
                        </td>
                        <td className="vote-cell">
                          <div className="vote-count">{comment.disagrees}</div>
                          {(comment.agrees || comment.disagrees || comment.passes) > 0 && (
                            <div className="vote-percent">
                              {Math.round((comment.disagrees / (comment.agrees + comment.disagrees + (comment.passes || 0))) * 100)}%
                            </div>
                          )}
                        </td>
                        <td className="vote-cell">
                          <div className="vote-count">{comment.passes || 0}</div>
                          {(comment.agrees || comment.disagrees || comment.passes) > 0 && (
                            <div className="vote-percent">
                              {Math.round(((comment.passes || 0) / (comment.agrees + comment.disagrees + (comment.passes || 0))) * 100)}%
                            </div>
                          )}
                        </td>
                        
                        <td className="group-z-scores-cell">
                          {/* Overall Z-Scores - highlight if it's the selected group and reduce opacity for others */}
                          {zScoreData && (
                            <div 
                              className={`group-z-score-item ${zScoreData.isAgreeSignificant ? 'significant-agree' : ''} ${zScoreData.isDisagreeSignificant ? 'significant-disagree' : ''} ${selectedZScoreGroup === 'overall' ? 'selected-group' : 'non-selected-group'}`}
                            >
                              <strong className={selectedZScoreGroup === 'overall' ? 'current-sort-group' : ''}>
                                Overall:
                              </strong> {zScoreData.agreementZScore.toFixed(2)}, {zScoreData.disagreementZScore.toFixed(2)}
                            </div>
                          )}
                          
                          {/* Group-specific Z-Scores - highlight the selected group and reduce opacity for others */}
                          {groupZScores && groups && groups.length > 0 && groups.map((group, groupIndex) => {
                            const groupData = groupZScores[index]?.[groupIndex];
                            
                            if (!groupData) return null;
                            
                            // Add classes to highlight significant z-scores
                            const agreeClassName = groupData.isAgreeSignificant ? 'significant-agree' : '';
                            const disagreeClassName = groupData.isDisagreeSignificant ? 'significant-disagree' : '';
                            const isSelectedGroup = selectedZScoreGroup === `groupZ-${groupIndex}` ? 'selected-group' : 'non-selected-group';
                            const className = `group-z-score-item ${agreeClassName} ${disagreeClassName} ${isSelectedGroup}`.trim();
                            
                            return (
                              <div 
                                key={groupIndex} 
                                className={className}
                              >
                                <strong className={selectedZScoreGroup === `groupZ-${groupIndex}` ? 'current-sort-group' : ''}>
                                  Group {groupIndex + 1}:
                                </strong> {groupData.agreementZScore.toFixed(2)}, {groupData.disagreementZScore.toFixed(2)}
                              </div>
                            );
                          })}
                        </td>
                        
                        {/* Add vote count column that shows the vote count for the selected group */}
                        <td className="vote-count-cell">
                          {selectedZScoreGroup === 'overall' ? (
                            <div className="selected-group">
                              {comment.agrees + comment.disagrees}
                            </div>
                          ) : (
                            groupZScores && (() => {
                              const groupIndex = parseInt(selectedZScoreGroup.split('-')[1]);
                              const groupData = groupZScores[index]?.[groupIndex];
                              if (!groupData) return <div>0</div>;
                              
                              return (
                                <div className="selected-group">
                                  {groupData.agrees + groupData.disagrees}
                                </div>
                              );
                            })()
                          )}
                        </td>
                        
                        <td>{comment.author_id}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
          <div className="table-footer">
            {polisStats && "Statistically significant at 90% confidence (z-score > 1.2816)"}
            <div>
              <strong>Sorting:</strong> {sortType === 'z-score' ? 'Z-Scores' : 'Vote Counts'} for 
              {selectedZScoreGroup === 'overall' ? ' Overall' : ` Group ${parseInt(selectedZScoreGroup.split('-')[1]) + 1}`} 
              {sortDirection === 'asc' ? ' (ascending)' : ' (descending)'}
              {sortType === 'vote-count' && ' - showing only statistically significant comments'}
            </div>
          </div>
        </div>
      )}

      {/* Group Representative Comments Table - only render when data is available */}
      {formattedRepComments && (
        <div className="rep-comments-table-container">
          <h2>Group Representative Comments</h2>
          <p>Comments that statistically represent each group's viewpoint compared to other groups.</p>
          
          <div className="rep-comments-tables">
            {formattedRepComments.map(({ groupIndex, groupSize, comments }) => (
              <div key={groupIndex} className="rep-comments-group">
                <h3>Group {groupIndex + 1} ({groupSize} participants)</h3>
                
                {comments.length === 0 ? (
                  <p>No representative comments identified for this group</p>
                ) : (
                  <table className="rep-comments-table">
                    <thead>
                      <tr>
                        <th>Comment</th>
                        <th>Type</th>
                        <th>Stats</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comments.map((comment, index) => (
                        <tr 
                          key={index}
                          onClick={() => highlightComment(comment.tid)}
                          className={highlightedComment === comment.tid ? 'highlighted-comment' : ''}
                        >
                          <td className="rep-comment-text">
                            <span className="comment-id">{comment.commentId}:</span> {comment.commentText}
                          </td>
                          <td className={`rep-type ${comment.repful_for}`}>
                            {comment.repType}
                            {comment.best_agree && <span className="best-agree-tag"> (Best agree)</span>}
                          </td>
                          <td className="rep-stats">
                            <div>Repness: <strong>{comment.repnessScore}</strong></div>
                            <div>Z-score: <strong>{comment.p_test.toFixed(2)}</strong></div>
                            <div>
                              {comment.repful_for === 'agree' ? (
                                <span>{comment.supportPercent}% agree ({comment.n_success} of {comment.n_trials})</span>
                              ) : (
                                <span>{comment.supportPercent}% disagree ({comment.n_success} of {comment.n_trials})</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <VoteMatrix
        voteMatrix={voteMatrix}
        handleVoteChange={handleVoteChange}
        selectedGroup={selectedGroup}
        groups={groups}
        highlightedComment={highlightedComment}
        commentTexts={commentTexts}
      />
      <div className="side-by-side-container">
        <PCAProjection pcaProjection={pcaProjection} groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} />
        <GroupAnalysis
          groups={groups}
          setSelectedGroup={setSelectedGroup}
          // voteMatrix={voteMatrix}
          // consensusScores={consensusScores}
          // consensusThreshold={consensusThreshold}
          // setConsensusThreshold={setConsensusThreshold}
          // highlightComment={highlightComment}
          selectedGroup={selectedGroup}
          // kMeansK={kMeansK}
          // updateKMeansK={updateKMeansK} // Changed from handleKMeansKChange
          // silhouetteCoefficients={silhouetteCoefficients}
          // bestK={bestK}
        />
      </div>

      {/* Top comments overall - Combined and sorted by max absolute z-score */}
      <div className="top-overall">
        <h2>Overall Statistical Consensus</h2>

        {polisStats ? (
          <div className="stats-consensus-section">
            {(polisStats.consensusComments.agree.length > 0 || polisStats.consensusComments.disagree.length > 0) ? (
              <div className="consensus-chart-container">
                <ConsensusBarChart
                  groups={groups}
                  comments={[
                    ...polisStats.consensusComments.agree.map(comment => ({...comment, type: 'agree'})),
                    ...polisStats.consensusComments.disagree.map(comment => ({...comment, type: 'disagree'}))
                  ]}
                  commentTexts={commentTexts}
                  voteMatrix={voteMatrix}
                  sortByZScore={true}
                />
              </div>
            ) : (
              <div>No statistically significant comments found</div>
            )}
          </div>
        ) : (
          <div className="consensus-chart-container">
            <ConsensusBarChart
              groups={groups}
              comments={topConsensusComments}
              commentTexts={commentTexts}
              voteMatrix={voteMatrix}
            />
          </div>
        )}
      </div>

      <div className="top-by-groups">
        <h2>Group Top Comments</h2>
        <p>
          Showing representative comments for each group based on statistical analysis.
        </p>

        {groups.length === 0 ? (
          <div>No groups identified yet</div>
        ) : (
          <div>
            {groups.map((group, groupIndex) => {
              // Use the representative comments for this group instead of consensus data
              const groupRepComments = repComments && repComments[groupIndex] ? repComments[groupIndex] : [];

              // Format comments for the ConsensusBarChart component
              const formattedComments = groupRepComments.map(comment => ({
                commentIndex: comment.tid,
                text: commentTexts?.[comment.tid]?.text || `Comment ${comment.tid + 1}`,
                numAgrees: comment.n_success,
                numDisagrees: comment.repful_for === 'agree' ? 0 : comment.n_success,
                numSeen: comment.n_trials,
                agreementZScore: comment.p_test,
                repnessScore: comment.repness * comment.repness_test,
                repful_for: comment.repful_for
              }));

              // Render group consensus table
              return (
                <div key={groupIndex} className="group-consensus-section">
                  <h3 className="group-heading">
                    Group {groupIndex + 1} ({group.points.length} participants)
                  </h3>

                  {formattedComments.length === 0 ? (
                    <div>No representative comments found for this group</div>
                  ) : (
                    <div className="consensus-chart-container">
                      <ConsensusBarChart
                        groups={groups}
                        comments={formattedComments}
                        commentTexts={commentTexts}
                        voteMatrix={voteMatrix}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="footer">
        <p><a href="https://github.com/raykyri/osccai-simulation" target="_blank" rel="noreferrer noopener">Github</a></p>
        <p>MIT &copy; {(new Date()).getFullYear()}. Based on <a href="https://github.com/collect-intel/osccai-simulation" target="_blank" rel="noreferrer noopener">OSCCAI simulation</a> by <a href="https://cip.org" target="_blank" rel="noreferrer noopener">CIP</a>.</p>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <SimulationProvider>
      <SimulationContent />
    </SimulationProvider>
  );
};

export default App;