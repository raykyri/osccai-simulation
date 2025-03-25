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
      const commentData = parseCommentsCSV(commentsData);
      const participantVotes = parseVotesLogCSV(votesLogData);

      // Create lookup maps for participants and comments
      const participantIdMap = metadata.map(p => p.participant);
      const commentIdMap = commentData.map(c => c.id);

      // Create a new vote matrix with null values by default
      const updatedVoteMatrix = Array(participantIdMap.length).fill(null).map(() =>
        Array(commentIdMap.length).fill(null)
      );

      // Fill in the vote matrix based on the votes log
      participantIdMap.forEach((participantId, participantIndex) => {
        if (participantVotes[participantId]) {
          commentIdMap.forEach((commentId, commentIndex) => {
            if (participantVotes[participantId][commentId] !== undefined) {
              updatedVoteMatrix[participantIndex][commentIndex] = participantVotes[participantId][commentId];
            }
          });
        }
      });

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
    // Only calculate if we have vote data
    if (!voteMatrix || voteMatrix.length === 0 || !voteMatrix[0]) {
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
  }, [voteMatrix, commentTexts]); // Dependencies for this effect

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

  // Add this useEffect hook to calculate Polis statistics
  useEffect(() => {
    // Only run if we have data to analyze
    if (!voteMatrix || voteMatrix.length === 0 || 
      !commentTexts || commentTexts.length === 0 ||
      !groups || groups.length === 0) {
      return;
    }

    console.log('Calculating Polis statistics');

    // Create arrays to store top comments for agreement and disagreement
    let topAgreeComments = [];
    let topDisagreeComments = [];

    // Create an object to store z-scores for ALL comments
    const allCommentZScores = {};

    // Helper function for proportion test as described in STATS.md
    function proportionTest(successes, trials) {
      // Add pseudocounts as per the implementation
      const adjustedSuccesses = successes + 1;
      const adjustedTrials = trials + 1;

      // Calculate z-score: 2 * sqrt(n) * (successes/n - 0.5)
      return 2 *
        Math.sqrt(adjustedTrials) *
        (adjustedSuccesses / adjustedTrials - 0.5);
    }

    // Helper function to check if z-score is significant at 90% confidence
    function isSignificantAt90Percent(zScore) {
      return zScore > 1.2816; // Critical z-value for 90% confidence (one-tailed)
    }

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
      const agreementZScore = proportionTest(agrees, totalSeen);
      const disagreementZScore = proportionTest(disagrees, totalSeen);

      // Check if statistically significant at 90% confidence
      const isAgreeSignificant = isSignificantAt90Percent(agreementZScore);
      const isDisagreeSignificant = isSignificantAt90Percent(disagreementZScore);

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
    
  }, [voteMatrix, commentTexts]); // Recalculate when vote matrix or comments change

  const handleReset = () => {
    setUsingImportedData(false);
    resetState();
    generateNewVoteMatrix()
  };

  const ConsensusBarChart = ({ comments, commentTexts, voteMatrix, sortByZScore = false }) => {
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
          Math.abs(a.agreementZScore || 0),
          Math.abs(a.disagreementZScore || 0)
        );
        const bMaxZScore = Math.max(
          Math.abs(b.agreementZScore || 0),
          Math.abs(b.disagreementZScore || 0)
        );

        // Sort by maximum absolute z-score (higher values first)
        return bMaxZScore - aMaxZScore;
      } else {
        // Default sort by participation count
        return (b.numSeen || b.totalVotes || 0) - (a.numSeen || a.totalVotes || 0);
      }
    });

    return (
      <div className="consensus-chart">
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
            <div key={commentIndex} className="consensus-bar-container">
              <div className="consensus-label">
                <div className="comment-text-preview">
                  <span className="comment-id-text">
                    {commentTexts?.[commentIndex]?.id || `Comment ${commentIndex + 1}`}:
                  </span>
                  {comment.text || comment.commentText}
                </div>
              </div>
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
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="App">
      <h1>Polis Simulation</h1>
      <p style={{ maxWidth: "500px", margin: "0 auto 35px" }}>
        This page implements the Polis consensus algorithm in the browser,
        with PCA, k-means clustering, and consensus scoring.
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
          <table className="comments-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Comment Text</th>
                <th>Agrees</th>
                <th>Disagrees</th>
                <th>Passes</th>
                {polisStats && (
                  <>
                    <th>Agree Z-Score</th>
                    <th>Disagree Z-Score</th>
                    <th>Significance</th>
                  </>
                )}
                <th>Author</th>
              </tr>
            </thead>
            <tbody>
              {commentTexts.map((comment, index) => {
                // Get z-scores for this comment from polisStats
                const zScoreData = polisStats?.zScores?.[index];

                // Determine significance
                const isSignificant = zScoreData ?
                  (zScoreData.isAgreeSignificant ? 'Agree*' :
                   zScoreData.isDisagreeSignificant ? 'Disagree*' : '-')
                  : '-';

                return (
                  <tr key={index}
                      onClick={() => highlightComment(index)}
                      className={highlightedComment === index ? 'highlighted-comment' : ''}>
                    <td>{comment.id}</td>
                    <td>{comment.text}</td>
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
                    {polisStats && (
                      <>
                        <td>{zScoreData ? zScoreData.agreementZScore.toFixed(2) : '-'}</td>
                        <td>{zScoreData ? zScoreData.disagreementZScore.toFixed(2) : '-'}</td>
                        <td>{isSignificant}</td>
                      </>
                    )}
                    <td>{comment.author_id}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {polisStats && (
            <div className="table-footer">
              {"Statistically significant at 90% confidence (z-score > 1.2816)"}
            </div>
          )}
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
          voteMatrix={voteMatrix}
          consensusScores={consensusScores}
          consensusThreshold={consensusThreshold}
          setConsensusThreshold={setConsensusThreshold}
          highlightComment={highlightComment}
          selectedGroup={selectedGroup}
          kMeansK={kMeansK}
          updateKMeansK={updateKMeansK} // Changed from handleKMeansKChange
          silhouetteCoefficients={silhouetteCoefficients}
          bestK={bestK}
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
          Group consensus scoring has not been implemented yet. These tables show most voted comments instead.
        </p>

        {groups.length === 0 ? (
          <div>No groups identified yet</div>
        ) : (
          <div>
            {groups.map((group, groupIndex) => {
              // Use the pre-calculated consensus data for this group
              const groupConsensusComments = groupConsensusData[groupIndex] || [];

              // Render group consensus table
              return (
                <div key={groupIndex} className="group-consensus-section">
                  <h3 className="group-heading">
                    Group {groupIndex + 1} ({group.points.length} participants)
                  </h3>

                  {groupConsensusComments.length === 0 ? (
                    <div>No comments with 60%+ consensus in this group</div>
                  ) : (
                    <div className="consensus-chart-container">
                      <ConsensusBarChart
                        comments={groupConsensusComments}
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

      <div className="group-aware-consensus">
        <h2>Group-Aware Consensus</h2>
        <div>
          <label>Minimum Consensus Threshold: </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={consensusThreshold}
            onChange={(e) => setConsensusThreshold(Number(e.target.value))}
          />
          <span>{consensusThreshold.toFixed(2)}</span>
        </div>
        <table className="consensus-table">
          <thead>
            <tr>
              <th>Comment</th>
              <th>Consensus Score</th>
              {groups.map((_, i) => (
                <th key={i}>Group {i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {consensusScores
              .filter(score => score.consensusScore >= consensusThreshold)
              .map(({ commentIndex, consensusScore }) => (
                <tr key={commentIndex}>
                  <td>
                    <button onClick={() => highlightComment(commentIndex)}>
                      Comment {commentIndex + 1}
                    </button>
                  </td>
                  <td>{consensusScore.toFixed(4)}</td>
                  {groups.map((group, i) => {
                    const groupVotes = group.points.map(index => voteMatrix[index][commentIndex]);
                    const agreePercentage = (groupVotes.filter(vote => vote === 1).length / groupVotes.length) * 100;
                    return (
                      <td key={i}>
                        <div className="vote-bar">
                          <div
                            className="agree-bar"
                            style={{ width: `${agreePercentage}%` }}
                          >
                            {agreePercentage.toFixed(1)}%
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
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