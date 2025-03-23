/**
 * Polis Simulation App
 *
 * Data Flow Overview:
 * ------------------
 * 1. Data Loading
 *    - User inputs a URL for Polis data exports (or uses default)
 *    - App fetches three CSV files:
 *      a) participant-votes.csv - The vote matrix showing all votes
 *      b) comments.csv - The text of all comments
 *      c) votes.csv - The event log of individual votes
 *    - CSV data is parsed into structured objects with Papa Parse
 *
 * 2. Vote Matrix Construction
 *    - Raw vote data is transformed into a matrix where:
 *      * Rows represent participants
 *      * Columns represent comments
 *      * Values are: 1 (agree), -1 (disagree), 0 (pass), or null (no vote)
 *    - Matrix is built using the votes log to preserve the distinction between
 *      explicit passes and no votes
 *
 * 3. PCA Projection
 *    - Vote matrix is analyzed using Principal Component Analysis (PCA)
 *    - Participants are projected into a 2D space based on voting patterns
 *    - This allows visualization of participant clusters based on opinion similarity
 *
 * 4. Group Identification
 *    - K-means clustering is applied to the PCA projection
 *    - Groups of similar-voting participants are identified
 *    - Silhouette coefficient analysis helps determine optimal number of groups
 *
 * 5. Consensus Analysis
 *    - Overall consensus is calculated for each comment
 *    - Group-specific consensus is calculated for each comment within each group
 *    - Comments with high consensus (60%+) are highlighted
 *
 * 6. UI Rendering
 *    - Vote matrix visualization shows all votes in a heatmap
 *    - PCA projection shows participants in 2D space with group coloring
 *    - Group analysis shows statistics about each identified group
 *    - Consensus visualizations show agreement patterns overall and by group
 *
 * Alternative Mode:
 * ---------------
 * Instead of using real data, the app can generate random vote matrices
 * with configurable parameters for simulation purposes.
 */

import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { SimulationProvider, useSimulation } from './context/SimulationContext.jsx';
import VoteMatrix from './components/VoteMatrix.jsx';
import PCAProjection from './components/PCAProjection.jsx';
import GroupAnalysis from './components/GroupAnalysis.jsx';
import SimulationControls from './components/SimulationControls.jsx';
import useVoteMatrix from './hooks/useVoteMatrix.js';
import usePCA from './hooks/usePCA.js';
import useGroupIdentification from './hooks/useGroupIdentification.js';
import { debug } from './utils/debug.js';
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

  console.log(participantVotes)

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
      return url.startsWith("https://pol.is/") ?
        url.replace("https://pol.is/", "http://localhost:3001/proxy/") :
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
    .then(([votesData, commentsData, votesLogData]) => {
      console.log('Data fetched successfully');

      // Parse CSV to JSON with our custom parsers
      const { metadata, data: originalVoteData } = parseVoteMatrixCSV(votesData);
      const commentData = parseCommentsCSV(commentsData);
      const participantVotes = parseVotesLogCSV(votesLogData);

      // Create lookup maps for participants and comments
      const participantIdMap = metadata.map(p => p.participant);
      const commentIdMap = commentData.map(c => c.id);

      // Create a new vote matrix with null values by default
      const updatedVoteMatrix = Array(participantIdMap.length).fill().map(() =>
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
    } else if (!usingImportedData && !isLoading) {
      generateNewVoteMatrix();
    }
  }, [participants, comments, agreePercentage, disagreePercentage,
      consensusGroups, groupSizes, groupSimilarity,
      generateNewVoteMatrix, usingImportedData, initialized, isLoading, validateAndFetchData]);

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

  const handleReset = () => {
    setUsingImportedData(false);
    resetState();
    generateNewVoteMatrix()
  };

  // Let's extract the ConsensusBarChart component to reuse for both overall and group consensus
  const ConsensusBarChart = ({ comments, commentTexts, voteMatrix }) => {
    if (!comments || comments.length === 0) {
      return <div>No comments with 60% or higher consensus</div>;
    }

    // Total number of participants who could have voted
    const totalParticipants = voteMatrix ? voteMatrix.length : 0;

    return (
      <div className="consensus-chart">
        {comments.map((comment) => {
          // Count the total for each vote type for this comment
          const agrees = comment.agrees;
          const disagrees = comment.disagrees;
          
          // Calculate passes (explicit 0) and no votes (null)
          let passes = 0;
          let noVotes = 0;
          
          if (voteMatrix && voteMatrix.length > 0) {
            voteMatrix.forEach(participantVotes => {
              const vote = participantVotes[comment.commentId];
              if (vote === 0) passes++;
              if (vote === null) noVotes++;
            });
          }
          
          // Calculate percentages of total participants
          const agreePercent = (agrees / totalParticipants) * 100;
          const disagreePercent = (disagrees / totalParticipants) * 100;
          const passPercent = (passes / totalParticipants) * 100;
          const noVotePercent = (noVotes / totalParticipants) * 100;
          
          return (
            <div key={comment.commentId} className="consensus-bar-container">
              <div className="consensus-label">
                <div className="comment-text-preview">
                  <span className="comment-id-text">{commentTexts?.[comment.commentId]?.id || 'Generated Comment'}: </span>
                  {comment.commentText}
                </div>
              </div>
              <div className="consensus-bar-wrapper">
                <div className="consensus-bar-multi">
                  <div
                    className="agree-bar"
                    style={{
                      width: `${agreePercent}%`,
                    }}
                    title={`${Math.round(agreePercent)}% agree (${agrees} votes)`}
                  />
                  <div
                    className="disagree-bar"
                    style={{
                      width: `${disagreePercent}%`,
                    }}
                    title={`${Math.round(disagreePercent)}% disagree (${disagrees} votes)`}
                  />
                  <div
                    className="pass-bar"
                    style={{
                      width: `${passPercent}%`,
                    }}
                    title={`${Math.round(passPercent)}% pass (${passes} votes)`}
                  />
                  <div
                    className="no-vote-bar"
                    style={{
                      width: `${noVotePercent}%`,
                    }}
                    title={`${Math.round(noVotePercent)}% no vote (${noVotes} participants)`}
                  />
                </div>
              </div>
              <div className="consensus-stats">
                <span className="vote-count">{agrees + disagrees + passes} votes on {totalParticipants} participants</span>
                <div className="vote-breakdown">
                  <span className="agree-count">{agrees} agree ({Math.round(agreePercent)}%)</span>
                  <span className="disagree-count">{disagrees} disagree ({Math.round(disagreePercent)}%)</span>
                  <span className="pass-count">{passes} pass ({Math.round(passPercent)}%)</span>
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
                Enter the raw data export to analyze
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
                <th>Author</th>
              </tr>
            </thead>
            <tbody>
              {commentTexts.map((comment, index) => (
                <tr key={index}
                    onClick={() => highlightComment(index)}
                    className={highlightedComment === index ? 'highlighted-comment' : ''}>
                  <td>{comment.id}</td>
                  <td>{comment.text}</td>
                  <td>{comment.agrees}</td>
                  <td>{comment.disagrees}</td>
                  <td>{comment.author_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Top comments overall */}
      <div className="top-overall">
        <h2>Top 10 Comments with 60%+ Consensus by Participant Count</h2>
        <ConsensusBarChart 
          comments={topConsensusComments}
          commentTexts={commentTexts}
          voteMatrix={voteMatrix}
        />
      </div>

      <div className="top-by-groups">
        <h2>Comments with 60%+ Consensus by Group</h2>

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
                    <div>
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
      <div class="footer">
        Based on <a href="https://github.com/collect-intel/osccai-simulation" target="_blank" noreferrer noopener>OSCCAI simulation code</a> by <a href="https://cip.org" target="_blank" noreferrer noopener>CIP</a>.
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